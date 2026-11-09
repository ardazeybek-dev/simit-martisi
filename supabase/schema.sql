-- Simit Martısı: oyuncu profili + kalıcı sıralama (herkesin en iyi skoru) (Supabase / Postgres)
-- Supabase SQL Editor'de bir kez çalıştırılır. Tablolar istemciye kapalıdır (RLS açık, politika yok);
-- istemci yalnızca aşağıdaki security definer fonksiyonları anon anahtarla çağırır. secret sütunu hiçbir zaman dışarı okunmaz.

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  secret uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 16),
  cc text not null default 'TR' check (cc ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);

create table if not exists scores (
  player_id uuid not null references players on delete cascade,
  week date not null,
  city text,
  score int not null check (score between 0 and 2000000),
  dist int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, week)
);
create index if not exists scores_week_score on scores (week, score desc);

-- uçuş bileti: uçuş başında alınır; skor, biletin alındığı andan beri geçen süreyle mümkün olandan büyükse reddedilir
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  started_at timestamptz not null default now()
);
create index if not exists runs_player on runs (player_id, started_at desc);

alter table players enable row level security;
alter table scores enable row level security;
alter table runs enable row level security;
revoke all on players, scores, runs from anon, authenticated;

-- hafta: İstanbul saatiyle pazartesi 00:00
create or replace function sm_week(t timestamptz default now()) returns date
language sql stable as $$ select date_trunc('week', t at time zone 'Europe/Istanbul')::date $$;

-- ad: kırp, boşlukları teke indir, kontrol karakterlerini at
create or replace function sm_name(p text) returns text
language sql immutable as $$ select left(regexp_replace(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'), 16) $$;

-- uygunsuz ad: harfler sadeleşir (ı→i, 0→o, @→a ...), harf dışı atılır, tekrar eden harf teke iner, sonra listede arama.
-- Aynı liste ve aynı sadeleştirme docs/js/net.js içinde de var (oyuncu anında uyarı görsün); ikisi birlikte güncellenir.
create or replace function sm_norm(p text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(translate(lower(coalesce(p, '')), 'ışğüöçâîûİŞĞÜÖÇ0134578@$!', 'isguocaiuisguocoieastbasi'), '[^a-z]', '', 'g'), '(.)\1+', '\1', 'g')
$$;
create or replace function sm_bad(p text) returns boolean
language sql immutable as $$
  select exists (select 1 from unnest(array[
    'sokuk','skm','sktr','amk','amq','amcik','aminakoy','aminako',
    'orospu','orosbu','orspu','pezevenk','gavat','kahpe','yarrak','yarak','ibne','ipne','kaltak','surtuk','fahise','kerhane','yavsak',
    'serefsiz','gotveren','gotlek','pust','dallama',
    'fuck','shit','bitch','cunt','dick','pussy','whore','slut','nigga','faggot','retard','asshole','bastard','porn','penis','vagina',
    'cocksucker','dildo','rapist','hitler','sex',
    'hurensohn','fotze','wichser','arschloch','hijodeputa','putamadre','mierda','gilipollas','cabron','pendejo','maricon'
  ]) w where sm_norm(p) like '%' || sm_norm(w) || '%')
  -- sik… kökleri önünde i varsa sayılmaz: "Işıkım", "Işıktır" (isikim, isiktir) temiz kalsın
  or sm_norm(p) ~ '(^|[^i])sik(tir|erim|eyim|iyim|ik|is|im|ici)'
$$;

create or replace function register(p_name text, p_cc text default 'TR') returns json
language plpgsql security definer set search_path = public as $$
declare n text := btrim(sm_name(p_name)); r players;
begin
  if char_length(n) < 2 or sm_bad(n) then raise exception 'bad name'; end if;
  insert into players(name, cc) values (n, case when upper(p_cc) ~ '^[A-Z]{2}$' then upper(p_cc) else 'TR' end) returning * into r;
  return json_build_object('id', r.id, 'secret', r.secret, 'name', r.name);
end $$;

create or replace function rename(p_id uuid, p_secret uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := btrim(sm_name(p_name));
begin
  if char_length(n) < 2 or sm_bad(n) then raise exception 'bad name'; end if;
  update players set name = n where id = p_id and secret = p_secret;
  if not found then raise exception 'unknown player'; end if;
  return n;
end $$;

-- uçuş başı: bilet. Aynı oyuncu 2 sn'de bir bilet alabilir; bir günden eski biletler temizlenir.
create or replace function start_run(p_id uuid, p_secret uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  if exists (select 1 from runs where player_id = p_id and started_at > now() - interval '2 seconds') then raise exception 'too fast'; end if;
  delete from runs where player_id = p_id and started_at < now() - interval '1 day';
  insert into runs(player_id) values (p_id) returning id into r;
  return r;
end $$;

-- skor haftanın satırına yazılır (yalnızca büyükse); dönen değer oyuncunun kalıcı sıralamadaki yeri.
-- Akla yatkınlık (biletten beri geçen t saniyeye göre): mesafe ≤ 40·t + 100 (en yüksek hız ~29 m/sn, sapan dahil),
-- skor = puan + mesafe/10 ve puan ≤ 600·t + 1500 (otomatik pilot ~90 puan/sn; 2x güçlendirici ve x5 komboyla gerçek uçuşlar 200'ü aşıyordu).
drop function if exists submit_score(uuid, uuid, int, int, text);
create or replace function submit_score(p_id uuid, p_secret uuid, p_run uuid, p_score int, p_dist int default 0, p_city text default null) returns int
language plpgsql security definer set search_path = public as $$
declare w date := sm_week(); best int; t float8; d int := greatest(0, coalesce(p_dist, 0));
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  select extract(epoch from now() - started_at) into t from runs where id = p_run and player_id = p_id and started_at > now() - interval '1 day';
  if t is null then raise exception 'unknown run'; end if;
  if p_score is null or p_score < d / 10 or d > 40 * t + 100 or p_score - d / 10 > 600 * t + 1500 then raise exception 'implausible score'; end if;
  insert into scores(player_id, week, city, score, dist) values (p_id, w, left(p_city, 16), p_score, d)
  on conflict (player_id, week) do update set score = excluded.score, dist = excluded.dist, city = excluded.city, updated_at = now()
    where scores.score < excluded.score;
  select max(score) into best from scores where player_id = p_id;
  return (select count(*) + 1 from (select max(score) m from scores group by player_id) x where x.m > best);
end $$;

-- sıralama gelmeden / çevrimdışı yapılmış cihaz rekoru: oyuncu başına bir kez, en fazla 30.000 (doğrulanamaz, üst sınırla kabul)
create or replace function claim_best(p_id uuid, p_secret uuid, p_score int) returns int
language plpgsql security definer set search_path = public as $$
declare s int := least(greatest(coalesce(p_score, 0), 0), 30000);
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  if s > 0 then insert into scores(player_id, week, score, dist) values (p_id, date '2000-01-03', s, 0) on conflict (player_id, week) do nothing; end if;
  return s;
end $$;

-- tablo: herkesin en iyi skoruyla ilk 50 ve oyuncunun sırası (week/ends/prev eski istemciler için null)
create or replace function get_board(p_id uuid default null) returns json
language sql stable security definer set search_path = public as $$
  with b as (
    select distinct on (s.player_id) s.player_id, s.score, s.updated_at
    from scores s order by s.player_id, s.score desc, s.updated_at
  ),
  ranked as (
    select b.player_id, b.score, p.name, p.cc, row_number() over (order by b.score desc, b.updated_at) as rank
    from b join players p on p.id = b.player_id
  )
  select json_build_object(
    'week', null, 'ends', null, 'prev', null,
    'total', (select count(*) from ranked),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'name', name, 'cc', cc, 'score', score, 'me', player_id = p_id) order by rank)
                     from ranked where rank <= 50), '[]'::json),
    'me', (select json_build_object('rank', rank, 'score', score) from ranked where player_id = p_id)
  )
$$;

revoke all on function register(text, text), rename(uuid, uuid, text), start_run(uuid, uuid), submit_score(uuid, uuid, uuid, int, int, text), get_board(uuid), claim_best(uuid, uuid, int) from public;
grant execute on function register(text, text), rename(uuid, uuid, text), start_run(uuid, uuid), submit_score(uuid, uuid, uuid, int, int, text), get_board(uuid), claim_best(uuid, uuid, int) to anon, authenticated;
-- yardımcılar dışarıdan çağrılmasın (Supabase yeni fonksiyonlara anon yetkisi verebiliyor)
revoke all on function sm_week(timestamptz), sm_name(text), sm_norm(text), sm_bad(text) from public, anon, authenticated;
