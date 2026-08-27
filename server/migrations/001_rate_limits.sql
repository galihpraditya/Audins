-- Migration 001: Dedicated rate-limits table with atomic increment.
--
-- Run this in the Supabase SQL editor. Until applied, the backend
-- automatically falls back to the legacy documents-table rate limiting.
--
-- Why: storing rate-limit rows inside `documents` polluted document listings,
-- and read-modify-write increments were subject to races under concurrent
-- requests (allowing quota bypass). This table + SECURITY DEFINER function
-- makes the check-and-increment atomic at the database level.

create table if not exists public.rate_limits (
  id text primary key,
  count integer not null default 0,
  reset_time timestamptz not null default now() + interval '24 hours',
  updated_at timestamptz not null default now()
);

-- Atomic check-and-increment.
-- Returns json: { "count": <post-increment count>, "resetTime": <iso8601> }.
-- The p_max_limit parameter is intentionally unused inside the function so a
-- single round-trip returns the authoritative new count; enforcement happens
-- in application code (keeps limit changes deployable without DB changes).
create or replace function public.increment_rate_limit(p_key text, p_max_limit integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reset timestamptz;
begin
  select rl.count, rl.reset_time
    into v_count, v_reset
    from rate_limits rl
   where rl.id = p_key;

  if not found or now() > v_reset then
    v_reset := now() + interval '24 hours';
    insert into rate_limits (id, count, reset_time, updated_at)
    values (p_key, 1, v_reset, now())
    on conflict (id) do update
      set count = 1, reset_time = excluded.reset_time, updated_at = now();
    return json_build_object('count', 1, 'resetTime', v_reset);
  end if;

  update rate_limits rl
     set count = rl.count + 1, updated_at = now()
   where rl.id = p_key
   returning rl.count into v_count;

  return json_build_object('count', v_count, 'resetTime', v_reset);
end;
$$;

-- Housekeeping: drop records older than their reset window.
create or replace function public.prune_rate_limits()
returns void
language sql
as $$
  delete from rate_limits where reset_time < now();
$$;

-- Optional index for the prune job / admin queries.
create index if not exists rate_limits_reset_time_idx on public.rate_limits (reset_time);

-- One-time cleanup of legacy rows that abused the documents table:
delete from public.documents where id like 'rate_limit_%';
