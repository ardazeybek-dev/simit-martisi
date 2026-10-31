-- Simit Martısı: oyuncu profili + haftalık sıralama (Supabase / Postgres)
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

alter table players enable row level security;
alter table scores enable row level security;
revoke all on players, scores from anon, authenticated;

-- hafta: İstanbul saatiyle pazartesi 00:00
create or replace function sm_week(t timestamptz default now()) returns date
language sql stable as $$ select date_trunc('week', t at time zone 'Europe/Istanbul')::date $$;

-- ad: kırp, boşlukları teke indir, kontrol karakterlerini at
create or replace function sm_name(p text) returns text
language sql immutable as $$ select left(regexp_replace(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'), 16) $$;

create or replace function register(p_name text, p_cc text default 'TR') returns json
language plpgsql security definer set search_path = public as $$
declare n text := btrim(sm_name(p_name)); r players;
begin
  if char_length(n) < 2 then raise exception 'bad name'; end if;
  insert into players(name, cc) values (n, case when upper(p_cc) ~ '^[A-Z]{2}$' then upper(p_cc) else 'TR' end) returning * into r;
  return json_build_object('id', r.id, 'secret', r.secret, 'name', r.name);
end $$;

create or replace function rename(p_id uuid, p_secret uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := btrim(sm_name(p_name));
begin
  if char_length(n) < 2 then raise exception 'bad name'; end if;
  update players set name = n where id = p_id and secret = p_secret;
  if not found then raise exception 'unknown player'; end if;
  return n;
end $$;

-- haftalık en iyi skor: yalnızca büyükse güncellenir; dönen değer oyuncunun bu haftaki sırası
create or replace function submit_score(p_id uuid, p_secret uuid, p_score int, p_dist int default 0, p_city text default null) returns int
language plpgsql security definer set search_path = public as $$
declare w date := sm_week(); best int;
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then raise exception 'unknown player'; end if;
  if p_score is null or p_score < 0 or p_score > 2000000 then raise exception 'bad score'; end if;
  insert into scores(player_id, week, city, score, dist) values (p_id, w, left(p_city, 16), p_score, greatest(0, coalesce(p_dist, 0)))
  on conflict (player_id, week) do update set score = excluded.score, dist = excluded.dist, city = excluded.city, updated_at = now()
    where scores.score < excluded.score;
  select score into best from scores where player_id = p_id and week = w;
  return (select count(*) + 1 from scores where week = w and (score > best or (score = best and updated_at < (select updated_at from scores where player_id = p_id and week = w))));
end $$;

-- tablo: bu haftanın ilk 50'si, oyuncunun sırası ve geçen haftaki son sırası (ödül için)
create or replace function get_board(p_id uuid default null) returns json
language sql stable security definer set search_path = public as $$
  with w as (select sm_week() as cur, sm_week() - 7 as prev),
  ranked as (
    select s.week, s.player_id, s.score, p.name, p.cc,
           row_number() over (partition by s.week order by s.score desc, s.updated_at) as rank
    from scores s join players p on p.id = s.player_id, w
    where s.week in (w.cur, w.prev)
  )
  select json_build_object(
    'week', (select cur from w),
    'ends', extract(epoch from (((select cur from w) + 7)::timestamp at time zone 'Europe/Istanbul')) * 1000,
    'total', (select count(*) from ranked, w where week = w.cur),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'name', name, 'cc', cc, 'score', score, 'me', player_id = p_id) order by rank)
                     from ranked, w where week = w.cur and rank <= 50), '[]'::json),
    'me', (select json_build_object('rank', rank, 'score', score) from ranked, w where week = w.cur and player_id = p_id),
    'prev', (select json_build_object('week', week, 'rank', rank, 'total', (select count(*) from ranked r2, w where r2.week = w.prev))
             from ranked, w where week = w.prev and player_id = p_id)
  )
$$;

revoke all on function register(text, text), rename(uuid, uuid, text), submit_score(uuid, uuid, int, int, text), get_board(uuid) from public;
grant execute on function register(text, text), rename(uuid, uuid, text), submit_score(uuid, uuid, int, int, text), get_board(uuid) to anon, authenticated;
