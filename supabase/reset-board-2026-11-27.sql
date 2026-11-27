-- =============================================================================
-- Run-A-Ton · fresh start for the leaderboard (2026-11-27), ONE TIME ONLY
--
-- Run AFTER supabase/leaderboard-v2.sql: Supabase dashboard → SQL Editor →
-- New query → paste → Run. Then deploy the game (harder runs, run tickets).
--
--   1. keeps a copy of the old board, run log and names in the private
--      "archive" schema (the game and the website can't read it)
--   2. clears the board: every score, the run log and open run tickets
--   3. deletes every name-only account (they can't play for the board any
--      more), which also frees their names for people signing in properly
--   Google / email accounts stay, with their names; only their scores go.
--
-- It's one statement, so it all happens or none of it does. Running it a
-- second time stops at the start (the copies exist), so it can't wipe twice.
-- =============================================================================

do $$
begin
  if to_regclass('public.run_tickets') is null then
    raise exception 'Run supabase/leaderboard-v2.sql first, then this file';
  end if;
  if to_regclass('archive.best_scores_2026_11_27') is not null then
    raise exception 'Already done: the board was cleared with this file before (the copies are in the archive schema)';
  end if;

  -- 1. A copy of what's there now
  create schema if not exists archive;
  revoke all on schema archive from public, anon, authenticated;
  create table archive.best_scores_2026_11_27 as table public.best_scores;
  create table archive.runs_2026_11_27 as table public.runs;
  create table archive.profiles_2026_11_27 as
    select p.*, coalesce(u.is_anonymous, false) as was_name_only
    from public.profiles p
    left join auth.users u on u.id = p.id;

  -- 2. Clear the board
  truncate public.best_scores, public.runs, public.run_tickets restart identity;

  -- 3. Name-only accounts (their profiles go with them)
  delete from auth.users where is_anonymous;
end;
$$;

-- What's left (the editor shows this):
select (select count(*) from public.best_scores) as scores_on_board,
       (select count(*) from auth.users where is_anonymous) as name_only_accounts,
       (select count(*) from public.profiles) as accounts_kept,
       (select count(*) from archive.best_scores_2026_11_27) as old_scores_archived;
