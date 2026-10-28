-- cleanup.sql: delete the saves nobody has used for 12 months (never the jury's starting points).
-- Run in the SQL Editor. Step 1 only LOOKS; step 2 deletes; step 3 (optional) does step 2 every month.
-- On the team project: only after the team has reviewed this file.

-- 1) Preview: which saves would be deleted?
select code, updated_at, data ->> 'place' as place
from public.saves
where updated_at < now() - interval '12 months'
  and coalesce(data ->> 'template', 'false') <> 'true'
order by updated_at;

-- 2) Delete them (the same condition as the preview).
delete from public.saves
where updated_at < now() - interval '12 months'
  and coalesce(data ->> 'template', 'false') <> 'true';

-- 3) Optional: do step 2 automatically, at 03:00 on the 1st of every month.
--    First enable the "pg_cron" extension (Database > Extensions; search "pg_cron").
-- select cron.schedule(
--   'funscientia-cleanup',
--   '0 3 1 * *',
--   $$delete from public.saves
--     where updated_at < now() - interval '12 months'
--       and coalesce(data ->> 'template', 'false') <> 'true'$$
-- );
--    To check it:  select jobid, schedule, command from cron.job;
--    To stop it:   select cron.unschedule('funscientia-cleanup');
