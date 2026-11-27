-- =============================================================================
-- Run-A-Ton · the Sparkle Shop (2026-11-27)
--
-- Run AFTER supabase/leaderboard-v2.sql and supabase/reset-board-2026-11-27.sql:
-- Supabase dashboard → SQL Editor → New query → paste → Run. Safe to run again
-- (to change a price, edit the list in part 2 and run the whole file again).
--
-- What it does
--   1. Every signed-in player gets a sparkle wallet. Sparkles go in when a run
--      counts on the leaderboard (status ok, or approved by an organiser), so
--      runs played signed out, turned away or still held add nothing.
--   2. A run can't add more sparkles than the game can really give in that
--      time: 6 a second (simulated on 2026-11-27, a star that can't die with
--      the magnet on the whole time collects about 5 a second; good players
--      about 2).
--   3. Prices live here, not in the game, and buying happens here: the wallet
--      is checked and charged in one step, and an item is only bought once.
--   4. What a player wears (one hat, one back item, one trail) is saved here,
--      so it follows them to any phone they sign in on.
--
-- The game's side of this is js/play/online.js (wallet, buy, wear),
-- js/play/shop.js (the shop) and js/play/cosmetics.js (the items, same ids).
-- =============================================================================

do $$
begin
  if to_regclass('public.run_tickets') is null then
    raise exception 'Run supabase/leaderboard-v2.sql first, then this file';
  end if;
end;
$$;


-- 1. Tables (players can't touch them directly; only through part 4) -----------
create table if not exists public.shop_items (
  id text primary key,
  slot text not null check (slot in ('head', 'back', 'trail')),
  price integer not null check (price > 0),
  on_sale boolean not null default true
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  earned bigint not null default 0 check (earned >= 0),
  spent bigint not null default 0 check (spent >= 0),
  head text references public.shop_items (id),
  back text references public.shop_items (id),
  trail text references public.shop_items (id),
  updated_at timestamptz not null default now(),
  constraint wallets_not_overspent check (spent <= earned)
);

create table if not exists public.purchases (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.shop_items (id),
  price integer not null,
  bought_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.shop_items enable row level security;
alter table public.wallets enable row level security;
alter table public.purchases enable row level security;
revoke all on public.shop_items, public.wallets, public.purchases from public, anon, authenticated;


-- 2. What's for sale, and the price in sparkles -----------------------------------
-- (a player brings in about 2 sparkles a second of good running: 2,000 is a
-- solid evening, 50,000 is many hours)
insert into public.shop_items (id, slot, price) values
  ('party-hat',   'head',   2000),
  ('propeller',   'head',   3500),
  ('headphones',  'head',   6000),
  ('top-hat',     'head',   9000),
  ('grad-cap',    'head',  14000),
  ('crown',       'head',  25000),
  ('halo',        'head',  50000),
  ('backpack',    'back',   5000),
  ('cape',        'back',  18000),
  ('wings',       'back',  40000),
  ('stardust',    'trail',  2500),
  ('confetti',    'trail',  5000),
  ('hearts',      'trail',  8000),
  ('blaze',       'trail', 12000),
  ('glitch',      'trail', 20000),
  ('rainbow',     'trail', 35000)
on conflict (id) do update set slot = excluded.slot, price = excluded.price, on_sale = true;


-- 3. Sparkles in: when a run counts ------------------------------------------------
-- The most sparkles a run can bring in (see 2. at the top). seconds: what the
-- game says; elapsed: what the server timed (the smaller one counts).
create or replace function public.run_sparkle_limit(p_seconds double precision, p_elapsed double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(0, floor(6 * least(coalesce(p_seconds, 0), coalesce(p_elapsed, p_seconds, 0) + 10) + 60))::integer;
$$;

create or replace function public.credit_run_sparkles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  amount integer;
begin
  -- a run starts counting: when it comes in as ok, or an organiser approves it
  -- (or a re-check lets it through); never twice for the same run
  if new.status in ('ok', 'approved')
     and (tg_op = 'INSERT' or old.status not in ('ok', 'approved')) then
    amount := least(greatest(coalesce(new.sparkles, 0), 0), public.run_sparkle_limit(new.seconds, new.elapsed));
    if amount > 0 then
      insert into public.wallets as w (user_id, earned) values (new.user_id, amount)
      on conflict (user_id) do update set earned = w.earned + excluded.earned, updated_at = now();
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists runs_credit_sparkles on public.runs;
create trigger runs_credit_sparkles
  after insert or update of status on public.runs
  for each row execute function public.credit_run_sparkles();

-- Runs that already count (played since the board was cleared, before this
-- file): their sparkles, once. Only ticketed runs (leaderboard v2) qualify.
insert into public.wallets (user_id, earned)
select r.user_id, sum(least(greatest(coalesce(r.sparkles, 0), 0), public.run_sparkle_limit(r.seconds, r.elapsed)))
from public.runs r
join public.profiles p on p.id = r.user_id
where r.status in ('ok', 'approved') and r.ticket is not null
group by r.user_id
on conflict (user_id) do nothing;


-- 4. What the game calls ---------------------------------------------------------------
-- The shop as you see it: prices (for everyone), and for a signed-in player
-- their sparkles, what they own and what they wear.
create or replace function public.shop_state()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  prices json := (select coalesce(json_object_agg(i.id, i.price), '{}'::json) from public.shop_items i where i.on_sale);
  w public.wallets%rowtype;
begin
  if me is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not exists (select 1 from public.profiles p where p.id = me) then
    return json_build_object('prices', prices);
  end if;
  select * into w from public.wallets x where x.user_id = me;
  return json_build_object(
    'prices', prices,
    'earned', coalesce(w.earned, 0),
    'spent', coalesce(w.spent, 0),
    'balance', coalesce(w.earned - w.spent, 0),
    'owned', coalesce((select json_agg(p.item_id order by p.bought_at) from public.purchases p where p.user_id = me), '[]'::json),
    'wearing', json_build_object('head', w.head, 'back', w.back, 'trail', w.trail));
end;
$$;

-- Buy something (it goes straight on). Buying what you already own changes nothing.
create or replace function public.shop_buy(p_item text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_player();
  it public.shop_items%rowtype;
  w public.wallets%rowtype;
begin
  select * into it from public.shop_items i where i.id = p_item and i.on_sale;
  if it.id is null then
    raise exception 'That isn''t in the shop' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.purchases p where p.user_id = me and p.item_id = it.id) then
    return public.shop_state();
  end if;
  insert into public.wallets (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from public.wallets x where x.user_id = me for update; -- one purchase at a time
  if w.earned - w.spent < it.price then
    raise exception 'Not enough sparkles yet: you have %, it costs %', w.earned - w.spent, it.price using errcode = 'P0001';
  end if;
  insert into public.purchases (user_id, item_id, price) values (me, it.id, it.price);
  update public.wallets x
     set spent = x.spent + it.price,
         head = case when it.slot = 'head' then it.id else x.head end,
         back = case when it.slot = 'back' then it.id else x.back end,
         trail = case when it.slot = 'trail' then it.id else x.trail end,
         updated_at = now()
   where x.user_id = me;
  return public.shop_state();
end;
$$;

-- Put on something you own (p_item null: take that slot off)
create or replace function public.shop_wear(p_slot text, p_item text default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_player();
begin
  if p_slot not in ('head', 'back', 'trail') then
    raise exception 'No such slot' using errcode = 'P0001';
  end if;
  if p_item is not null and not exists (
    select 1 from public.purchases p join public.shop_items i on i.id = p.item_id
     where p.user_id = me and p.item_id = p_item and i.slot = p_slot) then
    raise exception 'Buy it first' using errcode = 'P0001';
  end if;
  insert into public.wallets (user_id) values (me) on conflict (user_id) do nothing;
  update public.wallets x
     set head = case when p_slot = 'head' then p_item else x.head end,
         back = case when p_slot = 'back' then p_item else x.back end,
         trail = case when p_slot = 'trail' then p_item else x.trail end,
         updated_at = now()
   where x.user_id = me;
  return public.shop_state();
end;
$$;


-- 5. For organisers (in the SQL editor; players can't) --------------------------------
-- Give a player sparkles (a prize, or to try the shop):
--   select public.give_sparkles('Some Name', 5000);
create or replace function public.give_sparkles(name text, amount integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := (select p.id from public.profiles p where lower(p.username) = lower(trim(name)));
  now_has bigint;
begin
  if who is null then
    raise exception 'No player called %', name;
  end if;
  insert into public.wallets as w (user_id, earned) values (who, greatest(amount, 0))
  on conflict (user_id) do update set earned = w.earned + greatest(amount, 0), updated_at = now()
  returning w.earned - w.spent into now_has;
  return now_has;
end;
$$;

-- Everyone's sparkles, most first:   select * from public.wallets_overview;
create or replace view public.wallets_overview as
  select p.username, w.earned, w.spent, w.earned - w.spent as balance,
         (select count(*) from public.purchases x where x.user_id = w.user_id) as items,
         w.head, w.back, w.trail, w.updated_at
  from public.wallets w
  join public.profiles p on p.id = w.user_id
  order by w.earned desc;


-- 6. Who may call what ---------------------------------------------------------------------
revoke all on function public.run_sparkle_limit(double precision, double precision) from public, anon, authenticated;
revoke all on function public.credit_run_sparkles() from public, anon, authenticated;
revoke all on function public.give_sparkles(text, integer) from public, anon, authenticated;
revoke all on public.wallets_overview from public, anon, authenticated;

revoke all on function public.shop_state() from public;
grant execute on function public.shop_state() to anon, authenticated;
revoke all on function public.shop_buy(text) from public, anon;
grant execute on function public.shop_buy(text) to authenticated;
revoke all on function public.shop_wear(text, text) from public, anon;
grant execute on function public.shop_wear(text, text) to authenticated;

notify pgrst, 'reload schema';
