-- =============================================================================
-- Run-A-Ton · leaderboard v2 (2026-11-27)
--
-- Run once: Supabase dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again. Builds on the first setup (matgame/supabase/schema.sql).
--
-- What it does
--   1. Lets signed-in players read and fix their own profile (a missing table
--      permission signed people out right after Google sign-in).
--   2. Only Google / email accounts go on the board (name-only ones never do).
--   3. Every run gets a ticket from the server when it starts. A score is only
--      taken with an unused ticket, and the server times the run itself, so a
--      score can't be made up without playing for that long.
--   4. Scores are checked against what the game can really produce:
--        - faster than the star can run, or more points than the distance
--          allows (even with every power-up on all the time): turned away
--        - far above what real players reach: held for an organiser to check
--   5. Organisers can approve or reject held runs and hide a player.
--   6. Every turned-away run keeps its reason, and running this file again
--      re-checks them with the current rules: genuine runs that older, tighter
--      limits turned away go onto the board (the last query lists them).
--
-- Run it again whenever the game's speed or scoring changes.
--
-- The game's side of this is js/play/online.js (startRun, submitRun).
-- =============================================================================


-- 1. Profiles: signed-in players read their own name and mascot ---------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, username, mascot) on public.profiles to authenticated;
grant update (username, mascot, updated_at) on public.profiles to authenticated;

alter table public.profiles enable row level security;
drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles
  for select to anon, authenticated using (true);
drop policy if exists "Players create their own profile" on public.profiles;
create policy "Players create their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "Players update their own profile" on public.profiles;
create policy "Players update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);


-- 2. New columns -----------------------------------------------------------------
-- hidden: an organiser took this player off the board
alter table public.best_scores add column if not exists hidden boolean not null default false;
-- status: ok (counted), review (held for an organiser), approved, rejected
alter table public.runs add column if not exists status text not null default 'ok';
-- elapsed: seconds the server timed between the run's ticket and its score
alter table public.runs add column if not exists elapsed real;
alter table public.runs add column if not exists ticket uuid;
-- reason: why a run was turned away (null for counted ones)
alter table public.runs add column if not exists reason text;
create index if not exists runs_status on public.runs (status, created_at desc);


-- 3. Run tickets -------------------------------------------------------------------
create table if not exists public.run_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists run_tickets_user on public.run_tickets (user_id, started_at desc);
alter table public.run_tickets enable row level security;
revoke all on public.run_tickets from anon, authenticated;


-- 4. Limits from the game itself -------------------------------------------------
-- Points for distance alone over d metres: 1 per metre times the level's
-- multiplier (level n starts at 250(n-1) + 50(n-1)(n-2) m; the multiplier
-- stops growing at 10). Every other point in the game is times the same
-- multiplier, so a run's score is a multiple of this.
create or replace function public.run_base_points(d double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(least(l, 10) * (least(d, s1) - s0)), 0)
  from (
    select l,
           250.0 * (l - 1) + 50.0 * (l - 1) * (l - 2) as s0,
           250.0 * l + 50.0 * l * (l - 1) as s1
    from generate_series(1, 300) as l
  ) lv
  where s0 < d;
$$;

-- The most points a run of d metres can have. Simulated in the game (as tuned
-- on 2026-11-27: speed 15 -> 40 m/s, rows every 0.46-1 s, rocket 6.5 s) with
-- no way to die and pizza (double points), the magnet and debug mode on the
-- whole time, runs reach at most about 13.5 times the distance points. Real
-- players can't.
create or replace function public.score_limit(d double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$ select 15 * public.run_base_points(d) + 5000 $$;

-- Above this a run is held until an organiser approves it. Simulated runs that
-- can't die but get power-ups as they come reach about 3.3 times; good real
-- players steer for the sparkles and get about a third more (4.4 or so).
-- Change the game's speed, scoring or power-ups? Simulate again and re-tune.
create or replace function public.score_review_line(d double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$ select 5.5 * public.run_base_points(d) + 2000 $$;


-- What's wrong with a run, if anything (null: it could be real). Used when a
-- score comes in and by recheck_rejected(), so both always agree. If the game
-- gets faster, raise the speed here and run this file again.
create or replace function public.run_problem(p_score double precision, p_distance double precision, p_seconds double precision, p_elapsed double precision)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_score is null or p_distance is null or p_seconds is null or p_score < 0 or p_distance < 0 or p_seconds <= 0
      then 'impossible numbers'
    when p_seconds > coalesce(p_elapsed, 0) + 10
      then 'longer than the server timed'
    when p_distance > p_seconds * 46 + 150     -- top speed 40 m/s, a bit more on coffee
      then 'faster than the star can run'
    when p_score > public.score_limit(p_distance)
      then 'more points than the distance allows'
  end;
$$;


-- 5. Who is playing: a Google / email player with a profile ------------------------
create or replace function public.current_player()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google or email to go on the leaderboard' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = me) then
    raise exception 'No profile for this player yet' using errcode = 'P0001';
  end if;
  return me;
end;
$$;


-- 6. A run starts: its ticket ---------------------------------------------------------
create or replace function public.start_run()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_player();
  t uuid;
begin
  -- tidy up: used or day-old tickets, and keep at most 20 open ones
  delete from public.run_tickets r
   where r.user_id = me
     and (r.used_at is not null
          or r.started_at < now() - interval '1 day'
          or r.id not in (select x.id from public.run_tickets x where x.user_id = me order by x.started_at desc limit 19));
  insert into public.run_tickets (user_id) values (me) returning id into t;
  return t;
end;
$$;


-- 7. A run ends: its score ------------------------------------------------------------
drop function if exists public.submit_score(integer, integer, integer, integer, real);

create or replace function public.submit_score(
  p_ticket uuid,
  p_score integer,
  p_distance integer,
  p_sparkles integer default 0,
  p_level integer default 1,
  p_seconds real default 0
)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_player();
  started timestamptz;
  elapsed double precision;
  verdict text := 'ok';
  problem text;
  lvl smallint := least(greatest(coalesce(p_level, 1), 1), 999);
  best_now integer;
  place bigint;
begin
  -- the ticket this run got when it started: its owner's, and only once
  update public.run_tickets r set used_at = now()
   where r.id = p_ticket and r.user_id = me and r.used_at is null
   returning r.started_at into started;
  if started is null then
    raise exception 'This run wasn''t started online, so it can''t go on the leaderboard' using errcode = 'P0001';
  end if;
  elapsed := extract(epoch from (now() - started));

  problem := case when coalesce(p_sparkles, 0) < 0 then 'impossible numbers'
                  else public.run_problem(p_score, p_distance, p_seconds, elapsed) end;
  if problem is not null then
    verdict := 'rejected';
  elsif p_score > public.score_review_line(p_distance) then
    verdict := 'review';
  end if;

  insert into public.runs (user_id, score, distance, sparkles, level, seconds, elapsed, ticket, status, reason)
  values (me, coalesce(p_score, 0), coalesce(p_distance, 0), coalesce(p_sparkles, 0), lvl, coalesce(p_seconds, 0), elapsed, p_ticket, verdict, problem);

  if verdict = 'ok' then
    insert into public.best_scores as b (user_id, score, distance, level)
    values (me, p_score, p_distance, lvl)
    on conflict (user_id) do update
      set score = excluded.score, distance = excluded.distance, level = excluded.level, updated_at = now()
      where excluded.score > b.score;
  end if;

  select b.score into best_now from public.best_scores b where b.user_id = me;
  if best_now is not null then
    select count(*) + 1 into place
      from public.best_scores b
      join auth.users u on u.id = b.user_id
     where b.score > best_now and not b.hidden and not coalesce(u.is_anonymous, false);
  end if;
  return json_build_object('status', verdict, 'best', best_now, 'rank', place);
end;
$$;


-- 8. The board: Google / email players, minus hidden ones --------------------------------
create or replace function public.leaderboard(lim integer default 50)
returns table (rank bigint, username text, mascot text, score integer, distance integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select rank() over (order by b.score desc),
         p.username, p.mascot, b.score, b.distance,
         coalesce(b.user_id = auth.uid(), false)
  from public.best_scores b
  join public.profiles p on p.id = b.user_id
  join auth.users u on u.id = b.user_id
  where not b.hidden and not coalesce(u.is_anonymous, false)
  order by b.score desc, b.updated_at
  limit greatest(1, least(coalesce(lim, 50), 100));
$$;

create or replace function public.my_rank()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'rank', (select count(*) + 1
               from public.best_scores x
               join auth.users u on u.id = x.user_id
              where x.score > b.score and not x.hidden and not coalesce(u.is_anonymous, false)),
    'score', b.score,
    'distance', b.distance)
  from public.best_scores b
  join auth.users me on me.id = b.user_id
  where b.user_id = auth.uid() and not b.hidden and not coalesce(me.is_anonymous, false);
$$;


-- 9. For organisers (run these in the SQL editor; players can't) ------------------------
-- Runs held for a check, newest first:
--   select * from public.runs_to_review;
create or replace view public.runs_to_review as
  select r.id, p.username, r.score, r.distance, r.seconds, round(r.elapsed::numeric, 1) as elapsed,
         r.sparkles, r.level, r.created_at,
         round((r.score / nullif(public.run_base_points(r.distance), 0))::numeric, 2) as points_ratio
  from public.runs r
  join public.profiles p on p.id = r.user_id
  where r.status = 'review'
  order by r.created_at desc;

-- Put a held run on the board:   select public.approve_run(123);
create or replace function public.approve_run(run_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.runs%rowtype;
begin
  update public.runs x set status = 'approved' where x.id = run_id and x.status = 'review' returning * into r;
  if r.id is null then
    raise exception 'No run % is waiting for a check', run_id;
  end if;
  insert into public.best_scores as b (user_id, score, distance, level)
  values (r.user_id, r.score, r.distance, r.level)
  on conflict (user_id) do update
    set score = excluded.score, distance = excluded.distance, level = excluded.level, updated_at = now()
    where excluded.score > b.score;
end;
$$;

-- Runs that were turned away, and why, newest first:
--   select * from public.runs_rejected;
create or replace view public.runs_rejected as
  select r.id, p.username, r.score, r.distance, r.seconds, round(r.elapsed::numeric, 1) as elapsed,
         round((r.distance / nullif(r.seconds, 0))::numeric, 1) as metres_per_second,
         r.reason, r.created_at
  from public.runs r
  join public.profiles p on p.id = r.user_id
  where r.status = 'rejected'
  order by r.created_at desc;

-- Checks turned-away runs again with today's rules (after the game or the
-- limits change) and puts the ones that pass on the board (or holds them for
-- a check, like any new run). Lists what it let through.
--   select * from public.recheck_rejected();
create or replace function public.recheck_rejected()
returns table (run_id bigint, player text, score integer, distance integer, now_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.runs%rowtype;
  v text;
begin
  for r in select x.* from public.runs x where x.status = 'rejected' order by x.created_at loop
    continue when public.run_problem(r.score, r.distance, r.seconds, r.elapsed) is not null;
    v := case when r.score > public.score_review_line(r.distance) then 'review' else 'ok' end;
    update public.runs x set status = v, reason = null where x.id = r.id;
    if v = 'ok' then
      insert into public.best_scores as b (user_id, score, distance, level)
      values (r.user_id, r.score, r.distance, r.level)
      on conflict (user_id) do update
        set score = excluded.score, distance = excluded.distance, level = excluded.level, updated_at = now()
        where excluded.score > b.score;
    end if;
    run_id := r.id;
    player := (select p.username from public.profiles p where p.id = r.user_id);
    score := r.score;
    distance := r.distance;
    now_status := case v when 'ok' then 'on the board' else 'held for a check' end;
    return next;
  end loop;
end;
$$;

-- Turn a held run down:   select public.reject_run(123);
create or replace function public.reject_run(run_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.runs x set status = 'rejected' where x.id = run_id and x.status = 'review';
$$;

-- Take a player off the board (or back on with false):
--   select public.hide_player('Some Name');
--   select public.hide_player('Some Name', false);
create or replace function public.hide_player(name text, hide boolean default true)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.best_scores b set hidden = hide
   where b.user_id = (select p.id from public.profiles p where lower(p.username) = lower(trim(name)));
$$;


-- 10. Who may call what ----------------------------------------------------------------------
-- (Supabase lets everyone run new functions unless told otherwise.)
revoke all on function public.run_base_points(double precision) from public, anon, authenticated;
revoke all on function public.score_limit(double precision) from public, anon, authenticated;
revoke all on function public.score_review_line(double precision) from public, anon, authenticated;
revoke all on function public.current_player() from public, anon, authenticated;
revoke all on function public.run_problem(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.recheck_rejected() from public, anon, authenticated;
revoke all on public.runs_rejected from public, anon, authenticated;
revoke all on function public.approve_run(bigint) from public, anon, authenticated;
revoke all on function public.reject_run(bigint) from public, anon, authenticated;
revoke all on function public.hide_player(text, boolean) from public, anon, authenticated;
revoke all on public.runs_to_review from public, anon, authenticated;

revoke all on function public.start_run() from public, anon;
grant execute on function public.start_run() to authenticated;
revoke all on function public.submit_score(uuid, integer, integer, integer, integer, real) from public, anon;
grant execute on function public.submit_score(uuid, integer, integer, integer, integer, real) to authenticated;
revoke all on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;
grant execute on function public.leaderboard(integer) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

-- Make the API notice the new and changed functions straight away
notify pgrst, 'reload schema';

-- Runs turned away by older limits that pass today's: onto the board now.
-- (The editor shows what this let through; nothing listed means none.)
select * from public.recheck_rejected();


-- 11. Optional clean-ups (remove the -- in front to run one) -----------------------------
-- Delete every name-only account and its scores for good:
--   delete from auth.users where is_anonymous;
-- Wipe the whole board and start fresh (every player, Google/email too):
--   truncate public.best_scores, public.runs, public.run_tickets;
