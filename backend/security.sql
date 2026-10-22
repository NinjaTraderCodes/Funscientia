-- security.sql: lock the table; open only the three functions.

-- 1) Row Level Security ON, with no policies = nobody can read or write the table
--    through the API. (The functions still can: they run as the owner.)
alter table public.saves enable row level security;

-- 2) Belt and braces: take away every direct right on the table from the API roles.
revoke all on table public.saves from anon, authenticated;

-- 3) Postgres lets every role (PUBLIC) run a new function by default: close them first...
revoke execute on function public.create_save(jsonb)         from public, anon, authenticated;
revoke execute on function public.save_progress(text, jsonb) from public, anon, authenticated;
revoke execute on function public.load_progress(text)        from public, anon, authenticated;

-- ...then open exactly these three to the game: "anon" is the role of the publishable key.
-- (The game has no logins, so "authenticated" does not need them.)
grant execute on function public.create_save(jsonb)         to anon;
grant execute on function public.save_progress(text, jsonb) to anon;
grant execute on function public.load_progress(text)        to anon;
