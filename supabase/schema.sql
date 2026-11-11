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

-- uygunsuz ad: Unicode katlanır, benzer harfler latine çevrilir (Kiril о, Yunan ο, ı→i, 0→o, @→a ...), harf dışı boşluk olur,
-- tekrar eden harf teke iner. Alt dize listesi adın içinde aranır, kelime listesi yalnızca tek başına kelimeyse sayılır.
-- Aynı listeler ve aynı sadeleştirme docs/js/net.js içinde de var (oyuncu anında uyarı görsün); ikisi birlikte güncellenir.
create or replace function sm_fold(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(translate(lower(regexp_replace(normalize(coalesce(p, ''), NFKD), '[\u0300-\u036f]', '', 'g')),
    'ışğüöçâîûİŞĞÜÖÇ0134578@$!69авеёкмнорстухѕіїјԁүһԛԝАВЕЁКМНОРСТУХЅІЇЈαβεικνορτυχΑΒΕΖΗΙΚΜΝΟΡΤΥΧɑɡ',
    'isguocaiuisguocoieastbasiggabeekmhopctyxsiijdyhqwabeekmhopctyxsiijabeikvoptuxabezhikmnoptyxag'), '[^a-z]+', ' ', 'g'), '(.)\1+', '\1', 'g'))
$$;
-- harf harf yazılan ("s.i.k", "g ö t") tek harflik parçalar birleşir; kelime listesi ve sik… kuralı buna bakar
create or replace function sm_words(p text) returns text
language sql immutable as $$ select regexp_replace(regexp_replace(sm_fold(p), '(?<=\m[a-z]) (?=[a-z]\M)', '', 'g'), '(.)\1+', '\1', 'g') $$;
create or replace function sm_norm(p text) returns text
language sql immutable as $$ select regexp_replace(replace(sm_fold(p), ' ', ''), '(.)\1+', '\1', 'g') $$;
create or replace function sm_bad(p text) returns boolean
language sql immutable as $$
  select exists (select 1 from unnest(array[
    'amcik','amck','amcuk','aminako','aminakoy','aminaq','amk','amq','arschloch','ashole','bastard','bitch','cabron','cocksucker','cunt','dangalak','dick','dildo','fagot','fahise','fotze','fuck','gavat','gerizekali','gilipolas','gotlek','gotos','gotveren','hijodeputa','hitler','hurensohn','ibine','ibne','ipne','kahpe','kaltak','kancik','kerhane','kevase','kodumun','maricon','mierda','oglanci','orosbu','orospu','orospucocugu','orspu','pendejo','penis','pezevenk','pickurusu','picoglu','pijkurusu','pijoglu','porn','porno','pust','pusy','putamadre','rapist','retard','serefsiz','sex','shit','skm','sktr','slut','sokuk','surtuk','vagina','whore','wichser','yarak','yavsak'
  ]) w where sm_norm(p) like '%' || w || '%')
  or string_to_array(sm_words(p), ' ') && array[
    'ahmak','am','amin','amina','amini','amq','aptal','aq','bok','boktan','cock','cum','dalama','got','gote','gotler','gotu','gotum','gotun','kasar','lavuk','mal','niga','nigas','niger','oc','pic','pice','pij','pijo','pipi','salak','salaklar','sapik','seks','seksi','sexy','sg','sik','sike','sikik','sikim','tasak','tasaklar','tits','yarami'
  ]
  -- yalnızca Latin/Türkçe harf, rakam, boşluk, . _ - ve emoji (Kiril, Yunan, süslü harfler yasak); net.js oddName ile aynı
  or normalize(coalesce(p, ''), NFC) ~ '[^A-Za-z0-9 ._çğıöşüÇĞİÖŞÜâîûÂÎÛäëïÿÄËÏßñÑáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙêôÊÔãõÃÕ\u2600-\u27bf\u2b00-\u2bff\U0001f000-\U0001f0ff\U0001f200-\U0001faff\ufe0f\u200d-]'
  -- sik… kökleri önünde i varsa sayılmaz: "Işıkım", "Işıktır" (isikim, isiktir) temiz kalsın
  or sm_words(p) ~ '(^|[^i])sik(tir|erim|eyim|iyim|ik|is|im|ici)'
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

-- oyuncu ülkesini profilden seçer (sıralamadaki bayrak)
create or replace function set_cc(p_id uuid, p_secret uuid, p_cc text) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(btrim(p_cc));
begin
  if c !~ '^[A-Z]{2}$' then raise exception 'bad country'; end if;
  update players set cc = c where id = p_id and secret = p_secret;
  if not found then raise exception 'unknown player'; end if;
  return c;
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
-- Akla yatkınlık (biletten beri geçen t saniyeye göre): mesafe ≤ 40·t + 100, skor = (puan + mesafe/10) × şehir çarpanı
-- (İstanbul 1, İzmir 1.1, Antalya 1.2). Çarpansız puan ≤ 600·t + 1500 ve ≤ 12·mesafe + 1500: gerçek uçuşlar metre başı
-- en çok ~6.7 puan yapıyor (2026-11-11 ölçümü, 21 km'lik 1. dahil), tavan bunun ~1.8 katı.
drop function if exists submit_score(uuid, uuid, int, int, text);
create or replace function submit_score(p_id uuid, p_secret uuid, p_run uuid, p_score int, p_dist int default 0, p_city text default null) returns int
language plpgsql security definer set search_path = public as $$
declare w date := sm_week(); best int; t float8; d int := greatest(0, coalesce(p_dist, 0));
  cm float8 := case p_city when 'izmir' then 1.1 when 'antalya' then 1.2 else 1 end; pts float8;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  select extract(epoch from now() - started_at) into t from runs where id = p_run and player_id = p_id and started_at > now() - interval '1 day';
  if t is null then raise exception 'unknown run'; end if;
  pts := p_score / cm - d / 10;
  if p_score is null or p_score < d / 10 or d > 40 * t + 100 or pts > 600 * t + 1500 or pts > 12 * d + 1500 then raise exception 'implausible score'; end if;
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
    'me', (select json_build_object('rank', rank, 'score', score, 'name', name) from ranked where player_id = p_id)
  )
$$;

revoke all on function register(text, text), rename(uuid, uuid, text), set_cc(uuid, uuid, text), start_run(uuid, uuid), submit_score(uuid, uuid, uuid, int, int, text), get_board(uuid), claim_best(uuid, uuid, int) from public;
grant execute on function register(text, text), rename(uuid, uuid, text), set_cc(uuid, uuid, text), start_run(uuid, uuid), submit_score(uuid, uuid, uuid, int, int, text), get_board(uuid), claim_best(uuid, uuid, int) to anon, authenticated;
-- yardımcılar dışarıdan çağrılmasın (Supabase yeni fonksiyonlara anon yetkisi verebiliyor)
revoke all on function sm_week(timestamptz), sm_name(text), sm_fold(text), sm_words(text), sm_norm(text), sm_bad(text) from public, anon, authenticated;

-- günlük ödül: kayıt cihazda değil sunucuda. Anahtar = ağ adresi + tarayıcı kimliğinin özeti (ham IP saklanmaz).
-- Yerel kayıt silinip yeniden girilince ödül ikinci kez alınamaz, seri de sıfırlanmaz. Gün İstanbul saatiyle döner.
-- p_act: 'peek' (durum), 'claim' (bugünün ödülünü al), 'save' (1-2 gün kaçmış seriyi geri al; simit istemcide düşülür)
create table if not exists daily_claims (
  k text primary key,
  last date not null,
  streak int not null
);
alter table daily_claims enable row level security;

-- günlük ödül: oyuncu kimliğine (players.id + secret) bağlı. Eskiden IP+tarayıcı anahtarıydı: telefonda IP değişince
-- seri 1. güne düşüyordu, aynı ağdaki aynı model telefonlar da tek kişi sayılıyordu. Kimliği olmayan (kaydı henüz
-- gitmemiş) istemci için eski anahtar sürer; kimlikle ilk gelişte eski kayıt kimliğe kopyalanır (seri kaybolmaz).
create or replace function daily_k(vk text, p_act text) returns json
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  r daily_claims;
  nxt int; lost int := 0; ago int;
begin
  select * into r from daily_claims d where d.k = vk;
  if found then
    ago := today - r.last;
    nxt := case when ago = 1 then r.streak % 7 + 1 else 1 end;
    if ago between 2 and 3 and r.streak between 2 and 6 then lost := r.streak; end if;
  else nxt := 1; end if;

  if p_act = 'claim' then
    insert into daily_claims as d values (vk, today, nxt)
      on conflict (k) do update set last = today, streak = nxt where d.last < today
      returning d.streak into nxt;
    if found then return json_build_object('claimed', true, 'ready', false, 'streak', nxt); end if;
    return json_build_object('claimed', false, 'ready', false, 'streak', r.streak);
  elsif p_act = 'save' then
    if lost > 0 then
      update daily_claims d set last = today - 1, streak = lost where d.k = vk;
      return json_build_object('saved', true, 'ready', true, 'streak', lost % 7 + 1, 'lost', 0);
    end if;
    return json_build_object('saved', false, 'ready', not found or r.last < today, 'streak', case when r.last = today then r.streak else nxt end, 'lost', 0);
  end if;
  if found and r.last = today then return json_build_object('ready', false, 'streak', r.streak); end if;
  return json_build_object('ready', true, 'streak', nxt, 'lost', lost);
end $$;
revoke all on function daily_k(text, text) from public, anon, authenticated;

create or replace function daily_legacy_key() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(h->>'x-forwarded-for', ',', 1), '');
begin
  return md5(trim(ip) || '|' || coalesce(h->>'user-agent', ''));
end $$;
revoke all on function daily_legacy_key() from public, anon, authenticated;

-- eski istemci (önbellekteki sürüm) için: IP+tarayıcı anahtarı
create or replace function daily(p_act text default 'peek') returns json
language plpgsql security definer set search_path = public as $$
begin
  return daily_k(daily_legacy_key(), p_act);
end $$;
revoke all on function daily(text) from public;
grant execute on function daily(text) to anon, authenticated;

create or replace function daily(p_act text, p_id uuid, p_secret uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  vk text := 'p:' || p_id::text;
  lk text := daily_legacy_key();
begin
  if p_id is null or not exists (select 1 from players where id = p_id and secret = p_secret) then return daily_k(lk, p_act); end if;
  if not exists (select 1 from daily_claims where k = vk) then
    insert into daily_claims (k, last, streak) select vk, d.last, d.streak from daily_claims d where d.k = lk on conflict do nothing;
  end if;
  return daily_k(vk, p_act);
end $$;
revoke all on function daily(text, uuid, uuid) from public;
grant execute on function daily(text, uuid, uuid) to anon, authenticated;

-- günlük balık sınırı: oyuncu kimliğine bağlı, gün Europe/Istanbul (cihaz saatini ileri almak işe yaramaz).
-- p_take: yakalanan balığı sayar (sınır doluysa saymaz); dönen değer bugünkü sayı.
create table if not exists fish_days (
  player_id uuid primary key references players(id) on delete cascade,
  day date not null,
  n int not null
);
alter table fish_days enable row level security;
create or replace function fish_day(p_id uuid, p_secret uuid, p_take boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/Istanbul')::date; r fish_days;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  if p_take then
    insert into fish_days as f values (p_id, today, 1)
      on conflict (player_id) do update set n = case when f.day = today then f.n + 1 else 1 end, day = today
      where f.day <> today or f.n < 3;
  end if;
  select * into r from fish_days f where f.player_id = p_id;
  return case when found and r.day = today then r.n else 0 end;
end $$;
revoke all on function fish_day(uuid, uuid, boolean) from public;
grant execute on function fish_day(uuid, uuid, boolean) to anon, authenticated;
