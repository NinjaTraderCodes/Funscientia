-- sample_saves.sql: test saves for YOUR OWN Supabase project only (never the team project).
-- They look like real saves of today's game, including the new fields "results" and "furthest".
-- Run it in the SQL Editor; running it again resets them (it deletes the TEST and JURY rows first).

delete from public.saves where code like 'TEST-%' or code like 'JURY-%';

insert into public.saves (code, data, updated_at) values
  -- finished the whole game
  ('TEST-2222', '{"version":1,"lang":"ar","place":"complete","furthest":"complete",
     "results":{"mouth":{"stars":3,"score":2100},"stomach":{"stars":2,"score":1100},"small-intestine":{"stars":3,"score":1400},"revision":{"stars":3,"score":18}},
     "predictions":{"saliva":"sugar","pepsin":"protein","bile":"bile"},
     "chapter3":{"lesson":4,"quiz":5,"score":1400,"mistakes":3}}', now()),
  -- in Chapter 3, before the Small Intestine mission
  ('TEST-3333', '{"version":1,"lang":"en","place":"small-intestine","furthest":"small-intestine",
     "results":{"mouth":{"stars":2,"score":1200},"stomach":{"stars":2,"score":900}},
     "predictions":{"saliva":"wet","pepsin":"all","bile":"lipase"},
     "chapter3":{"lesson":0,"quiz":0,"score":0,"mistakes":0}}', now()),
  -- in the Stomach mission
  ('TEST-4444', '{"version":1,"lang":"ar","place":"stomach","furthest":"stomach",
     "results":{"mouth":{"stars":1,"score":500}},
     "predictions":{"saliva":"sugar","pepsin":"starch"}}', now()),
  -- at the Memory Challenge
  ('TEST-5555', '{"version":1,"lang":"ar","place":"revision","furthest":"revision",
     "results":{"mouth":{"stars":3,"score":1800},"stomach":{"stars":3,"score":1300},"small-intestine":{"stars":2,"score":1100}},
     "predictions":{"saliva":"nothing","pepsin":"protein","bile":"bile"},
     "chapter3":{"lesson":4,"quiz":0,"score":1100,"mistakes":9}}', now()),
  -- an older save, from before "results" and "furthest" existed
  ('TEST-6666', '{"version":1,"lang":"en","place":"esophagus","predictions":{"saliva":"sugar"}}', now()),
  -- a jury starting point (a template): left out of every statistic
  ('JURY-2345', '{"version":1,"template":true,"place":"mouth","furthest":"mouth"}', now()),
  -- a save nobody has touched for 14 months: the clean-up must delete it
  ('TEST-8888', '{"version":1,"lang":"en","place":"road"}', now() - interval '14 months'),
  -- an old jury starting point: the clean-up must KEEP it (templates are never deleted)
  ('JURY-3456', '{"version":1,"template":true,"place":"stomach"}', now() - interval '14 months');
