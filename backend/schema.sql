-- schema.sql: the table that holds every online save.
-- One row = one player's progress, found by its save code.

create table public.saves (
  -- the save code the player sees, e.g. 'K7QM-4FXA'
  -- (8 characters, no 0/O, 1/I or L so it is easy to read and type)
  code        text primary key
              check (code ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  -- the progress itself, as the game sends it (a JSON object)
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- how many times the game saved (handy when reviewing)
  save_count  integer not null default 1
);

comment on table public.saves is
  'Funscientia online saves. Only reachable through create_save, save_progress and load_progress.';
