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
-- uçuş kontrol noktası (run_mark): md = son onaylı metre, mt = zamanı
alter table runs add column if not exists md int not null default 0;
alter table runs add column if not exists mt timestamptz;
-- hileci gizleme: hidden = true olan oyuncu sıralamada görünmez, sırası sayılmaz (hesap silinmez, cihazı bozulmaz)
alter table players add column if not exists hidden boolean not null default false;

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
    'amcik','amck','amcuk','aminako','aminakoy','aminaq','amk','amq','arschloch','ashole','bastard','bitch','cabron','cocksucker','cunt','dangalak','dick','dildo','fagot','fahise','fotze','fuck','gavat','gerizekali','gilipolas','gotlek','gotos','gotveren','hijodeputa','hitler','hurensohn','ibine','ibne','ipne','kahpe','kaltak','kancik','kanirt','kerhane','kevase','kodumun','maricon','mierda','oglanci','orosbu','orospu','orospucocugu','orspu','pendejo','penis','pezevenk','pickurusu','picoglu','pijkurusu','pijoglu','porn','porno','pusi','pust','pusy','putamadre','rapist','retard','serefsiz','sex','shit','skm','sktr','slut','sokuk','surtuk','vagina','whore','wichser','yalayan','yarak','yavsak'
  ]) w where sm_norm(p) like '%' || w || '%')
  or string_to_array(sm_words(p), ' ') && array[
    'ahmak','am','amin','amina','amini','amq','aptal','aq','bok','boktan','cock','cum','dalama','got','gote','gotler','gotu','gotum','gotun','kasar','lavuk','mal','niga','nigas','niger','oc','pic','pice','pij','pijo','pipi','pitik','salak','salaklar','sapik','seks','seksi','sexy','sg','sik','sike','sikik','sikim','tasak','tasaklar','tits','yarami'
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
-- (İstanbul 1, İzmir 1.1, Antalya 1.2). Çarpansız puan ≤ 1500·t + 3000 ve ≤ 40·mesafe + 3000 (2026-11-12: gerçek bir 12,8 km'lik
-- uçuş metre başı 13,9 puan yaptı, eski 12 sınırı onu reddetti). Akla yatkın olmayan skor hata vermez, score_rejects'e yazılır:
-- sonradan bakılıp elle eklenebilsin (oyuncu sessizce emeğini kaybetmesin).
create table if not exists score_rejects (
  id bigserial primary key, player_id uuid references players on delete cascade, run uuid, score int, dist int, city text, t float8, reason text, at timestamptz not null default now()
);
alter table score_rejects enable row level security;
revoke all on score_rejects from anon, authenticated;
drop function if exists submit_score(uuid, uuid, int, int, text);
create or replace function submit_score(p_id uuid, p_secret uuid, p_run uuid, p_score int, p_dist int default 0, p_city text default null) returns int
language plpgsql security definer set search_path = public as $$
declare w date := sm_week(); best int; t float8; r runs; d int := greatest(0, coalesce(p_dist, 0));
  cm float8 := case p_city when 'izmir' then 1.1 when 'antalya' then 1.2 else 1 end; pts float8; bad text;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  select * into r from runs where id = p_run and player_id = p_id and started_at > now() - interval '1 day';
  if not found then raise exception 'unknown run'; end if;
  t := extract(epoch from now() - r.started_at);
  pts := p_score / cm - d / 10;
  if p_score is null or p_score < d / 10 then bad := 'score<dist'; elsif d > 40 * t + 100 then bad := 'dist>time'; elsif pts > 1500 * t + 3000 then bad := 'pts>time';
  elsif pts > 40 * d + 3000 then bad := 'pts>dist';
  -- kontrol noktası: son onaylı noktadan (run_mark) bu yana en çok 3000 m ve 40 m/sn
  elsif d - r.md > 3000 or d - r.md > 40 * extract(epoch from now() - coalesce(r.mt, r.started_at)) + 100 then bad := 'checkpoint'; end if;
  if bad is not null then
    insert into score_rejects(player_id, run, score, dist, city, t, reason) values (p_id, p_run, p_score, d, left(p_city, 16), t, bad);
  else
    insert into scores(player_id, week, city, score, dist) values (p_id, w, left(p_city, 16), p_score, d)
    on conflict (player_id, week) do update set score = excluded.score, dist = excluded.dist, city = excluded.city, updated_at = now()
      where scores.score < excluded.score;
  end if;
  select coalesce(max(score), 0) into best from scores where player_id = p_id;
  return (select count(*) + 1 from (select max(s.score) m from scores s join players p on p.id = s.player_id where not p.hidden group by s.player_id) x where x.m > best);
end $$;

-- uçuş kontrol noktası: istemci her 400 m'de çağırır. Bir öncekinden bu yana en çok 40·Δt + 40 m ilerlenebilir, 10 sn'den sık
-- gelen nokta yok sayılır. submit_score son noktadan bu yana 3000 m'den fazlasını ya da 40 m/sn üstünü reddeder.
create or replace function run_mark(p_id uuid, p_secret uuid, p_run uuid, p_dist int) returns void
language plpgsql security definer set search_path = public as $$
declare r runs; d int := greatest(0, coalesce(p_dist, 0));
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  select * into r from runs where id = p_run and player_id = p_id and started_at > now() - interval '1 day';
  if not found then raise exception 'unknown run'; end if;
  if r.mt is not null and now() - r.mt < interval '10 seconds' then return; end if;
  if d < r.md or d - r.md > 40 * extract(epoch from now() - coalesce(r.mt, r.started_at)) + 40 then raise exception 'implausible mark'; end if;
  update runs set md = d, mt = now() where id = p_run;
end $$;
revoke all on function run_mark(uuid, uuid, uuid, int) from public;
grant execute on function run_mark(uuid, uuid, uuid, int) to anon, authenticated;

-- sıralama gelmeden / çevrimdışı yapılmış cihaz rekoru: oyuncu başına bir kez, en fazla 12.000, yalnız 2 Kasım öncesi hesaplar (doğrulanamaz, üst sınırla kabul)
create or replace function claim_best(p_id uuid, p_secret uuid, p_score int) returns int
language plpgsql security definer set search_path = public as $$
declare s int := least(greatest(coalesce(p_score, 0), 0), 12000);
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  -- yalnız kalıcı sıralamadan önce açılmış hesaplar: yeni hesap açıp bedava puan yüklenemesin (gerçek en yüksek 11.007)
  if (select created_at from players where id = p_id) >= timestamptz '2026-11-02 00:00+03' then return 0; end if;
  if s > 0 then insert into scores(player_id, week, score, dist) values (p_id, date '2000-01-03', s, 0) on conflict (player_id, week) do nothing; end if;
  return s;
end $$;

-- martı seviyesi (sıralamada bayrağın solunda): istemci değişince gönderir, yalnız artış kabul edilir (doğrulanamaz, 99 tavan)
alter table players add column if not exists lv int not null default 0;
create or replace function set_level(p_id uuid, p_secret uuid, p_lv int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update players set lv = greatest(lv, least(greatest(coalesce(p_lv, 0), 0), 99)) where id = p_id and secret = p_secret returning lv into v;
  if v is null then raise exception 'unknown player'; end if;
  return v;
end $$;
revoke all on function set_level(uuid, uuid, int) from public;
grant execute on function set_level(uuid, uuid, int) to anon, authenticated;

-- tablo: herkesin en iyi skoruyla ilk 50 ve oyuncunun sırası (week/ends/prev eski istemciler için null)
create or replace function get_board(p_id uuid default null) returns json
language sql stable security definer set search_path = public as $$
  with b as (
    select distinct on (s.player_id) s.player_id, s.score, s.updated_at
    from scores s order by s.player_id, s.score desc, s.updated_at
  ),
  ranked as (
    select b.player_id, b.score, p.name, p.cc, p.lv, row_number() over (order by b.score desc, b.updated_at) as rank
    from b join players p on p.id = b.player_id where not p.hidden
  )
  select json_build_object(
    'week', null, 'ends', null, 'prev', null,
    'total', (select count(*) from ranked),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'name', name, 'cc', cc, 'lv', lv, 'score', score, 'me', player_id = p_id) order by rank)
                     from ranked where rank <= 50), '[]'::json),
    'me', (select json_build_object('rank', rank, 'score', score, 'name', name, 'lv', lv) from ranked where player_id = p_id)
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

-- kimliğe geçiş anı: kimlik satırı yoksa eski IP satırıyla cihazdaki kayıt (p_last, p_streak) kıyaslanır, daha yenisi taşınır.
-- IP alımla geçiş arasında değiştiyse eski satır bulunamıyordu; cihaz kaydı seriyi kurtarır. Cihaz kaydı yalnız son 3 gün ve
-- 1-7 seri ise sayılır, yalnızca satır ilk açılırken bir kez (sahte kayıt için site verisi, yani cüzdan da silinmeli).
create or replace function daily(p_act text, p_id uuid, p_secret uuid, p_last date, p_streak int) returns json
language plpgsql security definer set search_path = public as $$
declare
  vk text := 'p:' || p_id::text;
  lk text := daily_legacy_key();
  today date := (now() at time zone 'Europe/Istanbul')::date;
  l daily_claims;
begin
  if p_id is null or not exists (select 1 from players where id = p_id and secret = p_secret) then return daily_k(lk, p_act); end if;
  if not exists (select 1 from daily_claims where k = vk) then
    select * into l from daily_claims d where d.k = lk;
    if p_last between today - 3 and today and p_streak between 1 and 7
       and (l.k is null or p_last > l.last or (p_last = l.last and p_streak > l.streak)) then
      insert into daily_claims (k, last, streak) values (vk, p_last, p_streak) on conflict do nothing;
    elsif l.k is not null then
      insert into daily_claims (k, last, streak) values (vk, l.last, l.streak) on conflict do nothing;
    end if;
  end if;
  return daily_k(vk, p_act);
end $$;
revoke all on function daily(text, uuid, uuid, date, int) from public;
grant execute on function daily(text, uuid, uuid, date, int) to anon, authenticated;

-- önbellekteki 2.58.5-2.60.0 istemcileri cihaz kaydı göndermez
create or replace function daily(p_act text, p_id uuid, p_secret uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  return daily(p_act, p_id, p_secret, null::date, null::int);
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
      where f.day <> today or f.n < 2;
  end if;
  select * into r from fish_days f where f.player_id = p_id;
  return case when found and r.day = today then r.n else 0 end;
end $$;
revoke all on function fish_day(uuid, uuid, boolean) from public;
grant execute on function fish_day(uuid, uuid, boolean) to anon, authenticated;

-- hediye simit: yönetici panelden satır ekler (insert into gifts(player_id, amount) values (...)); oyun açılınca claim_gifts
-- teslim edilmemişlerin toplamını bir kez verir, istemci cüzdana ekler.
create table if not exists gifts (
  id bigserial primary key,
  player_id uuid not null references players on delete cascade,
  amount int not null check (amount between 1 and 100000),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
alter table gifts enable row level security;
revoke all on gifts from anon, authenticated;
create or replace function claim_gifts(p_id uuid, p_secret uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  with c as (update gifts set claimed_at = now() where player_id = p_id and claimed_at is null returning amount)
  select coalesce(sum(amount), 0) into n from c;
  return n;
end $$;
revoke all on function claim_gifts(uuid, uuid) from public;
grant execute on function claim_gifts(uuid, uuid) to anon, authenticated;

-- hediyede balık ve açıklama (note: 'week:N' = haftalık ödül, N. sıra); büyük hediye için sınır genişletildi
alter table gifts add column if not exists fish int not null default 0;
alter table gifts add column if not exists note text;
alter table gifts drop constraint if exists gifts_amount_check;
alter table gifts drop constraint if exists gifts_amount_ok;
alter table gifts add constraint gifts_amount_ok check (amount between 0 and 10000000 and fish between 0 and 100000 and amount + fish > 0);
-- eski istemci yalnız simit alabilir: balıklı satıra dokunmaz (yeni istemci claim_gifts2 ile alır)
create or replace function claim_gifts(p_id uuid, p_secret uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  with c as (update gifts set claimed_at = now() where player_id = p_id and claimed_at is null and fish = 0 and note is null returning amount)
  select coalesce(sum(amount), 0) into n from c;
  return n;
end $$;
create or replace function claim_gifts2(p_id uuid, p_secret uuid) returns json
language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  with c as (update gifts set claimed_at = now() where player_id = p_id and claimed_at is null returning amount, fish, note)
  select json_build_object('simit', coalesce(sum(amount), 0), 'fish', coalesce(sum(fish), 0),
                           'notes', coalesce(json_agg(note) filter (where note is not null), '[]'::json)) into r from c;
  return r;
end $$;
revoke all on function claim_gifts2(uuid, uuid) from public;
grant execute on function claim_gifts2(uuid, uuid) to anon, authenticated;

-- haftalık ödül: her pazar 00:00 UTC (TR 03:00) kalıcı sıralamaya göre; yalnız son 7 günde uçmuş oyuncular alır
-- 1.: 3000 simit + 3 balık, 2.: 2000 + 2, 3.: 1500 + 1, 4-10.: 750, diğerleri: 100
create table if not exists weekly_prizes (day date primary key, n int, given_at timestamptz not null default now());
alter table weekly_prizes enable row level security;
revoke all on weekly_prizes from anon, authenticated;
create or replace function give_weekly_prizes() returns int
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'UTC')::date; n int;
begin
  if exists (select 1 from weekly_prizes where day = d) then return 0; end if; -- aynı gün iki kez verilmez
  with b as (
    select distinct on (s.player_id) s.player_id, s.score, s.updated_at from scores s order by s.player_id, s.score desc, s.updated_at
  ), ranked as (
    select b.player_id, row_number() over (order by b.score desc, b.updated_at) as rank
    from b join players p on p.id = b.player_id where not p.hidden
  ), ins as (
    insert into gifts(player_id, amount, fish, note)
    select r.player_id,
           case when r.rank = 1 then 3000 when r.rank = 2 then 2000 when r.rank = 3 then 1500 when r.rank <= 10 then 750 else 100 end,
           case when r.rank = 1 then 3 when r.rank = 2 then 2 when r.rank = 3 then 1 else 0 end,
           'week:' || r.rank
    from ranked r where exists (select 1 from runs u where u.player_id = r.player_id and u.started_at > now() - interval '7 days')
    returning 1
  ) select count(*) into n from ins;
  insert into weekly_prizes(day, n) values (d, n);
  return n;
end $$;
revoke all on function give_weekly_prizes() from public, anon, authenticated;
create extension if not exists pg_cron;
select cron.schedule('weekly-prizes', '0 0 * * 0', 'select public.give_weekly_prizes()');

-- cihaz taşıma (yeni telefon, iOS uygulaması, başka tarayıcı): eski cihaz kod alır, ilerlemesinin anlık kopyası kodla saklanır;
-- yeni cihaz kodu girince kimlik (id + secret) ve kopya gelir. Kod 8 karakter (31 harf/rakam, karışan 0 O 1 I L yok),
-- 15 dk geçerli, tek kullanımlık. Kopya en çok 200 KB. Skoru olan cihaz kod giremez (sıralamada ikinci satır açılmasın);
-- yeni cihazın kendi (puansız) kaydı silinir.
create table if not exists transfers (
  code text primary key,
  player_id uuid not null references players(id) on delete cascade,
  data jsonb not null,
  expires timestamptz not null,
  created_at timestamptz not null default now()
);
alter table transfers enable row level security;
revoke all on transfers from anon, authenticated;

create or replace function transfer_make(p_id uuid, p_secret uuid, p_data jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := uuid_send(gen_random_uuid()); c text := ''; i int;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 200000 then raise exception 'bad data'; end if;
  if exists (select 1 from transfers where player_id = p_id and created_at > now() - interval '3 seconds') then raise exception 'too fast'; end if;
  delete from transfers where player_id = p_id or expires < now();
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop c := c || substr(a, get_byte(b, i) % 31 + 1, 1); end loop; -- 6-9. bayt sürüm/varyant bitleri
  insert into transfers(code, player_id, data, expires) values (c, p_id, p_data, now() + interval '15 minutes');
  return c;
end $$;

create or replace function transfer_claim(p_code text, p_old_id uuid default null, p_old_secret uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); t transfers; p players;
begin
  if char_length(c) <> 8 then raise exception 'bad code'; end if;
  if p_old_id is not null and exists (select 1 from scores where player_id = p_old_id) then raise exception 'device has score'; end if;
  delete from transfers where code = c and expires > now() returning * into t;
  if t.code is null then raise exception 'bad code'; end if;
  select * into p from players where id = t.player_id;
  if p.id is null then raise exception 'bad code'; end if;
  if p_old_id is not null and p_old_id <> p.id then
    begin delete from players where id = p_old_id and secret = p_old_secret; exception when others then null; end; -- temizlik taşımayı bozmasın
  end if;
  return json_build_object('id', p.id, 'secret', p.secret, 'name', p.name, 'cc', p.cc, 'data', t.data);
end $$;
revoke all on function transfer_make(uuid, uuid, jsonb), transfer_claim(text, uuid, uuid) from public;
grant execute on function transfer_make(uuid, uuid, jsonb), transfer_claim(text, uuid, uuid) to anon, authenticated;
