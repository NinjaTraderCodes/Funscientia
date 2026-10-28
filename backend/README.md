# Funscientia online saves (backend)

Code-based online saves for Funscientia: the game creates a save and shows the player a code (e.g. `K7QM-4FXA`); the player can continue on any device by typing it. No accounts or emails.

## Files

| File | Purpose |
| --- | --- |
| `README.md` | This documentation. |
| `schema.sql` | Creates the `public.saves` table with `code`, `data`, `created_at`, `updated_at`, and `save_count`, including the save-code format check. |
| `functions.sql` | Creates the three API functions: `create_save(p_data jsonb)`, `save_progress(p_code text, p_data jsonb)`, and `load_progress(p_code text)`. |
| `security.sql` | Enables RLS on `public.saves`, removes direct table and function access from the API roles, and grants execute on only the three functions to `anon`. |
| `stats.sql` | Optional read-only statistics queries 1–8 for the SQL Editor, including round 2 results and progress. Queries 5–8 exclude jury templates. Not exposed through the API. |
| `sample_saves.sql` | Test saves for your own Supabase project only, copied unchanged from `round2/sample_saves.sql`. Never run on the team project. |
| `cleanup.sql` | Deletes saves nobody has used for 12 months, never the jury's starting points (templates): a preview, the delete, and an optional monthly `pg_cron` schedule (commented out). Run by hand in the SQL Editor; not scheduled on the team project. |
| `PRIVACY.md` | The plain-language privacy note for pupils, parents and teachers: what is saved, what is never saved, where, who can see it, and for how long. |
| `test.html` | Local browser test page with manual RPC buttons and a "Run all checks" suite of 14 checks. It loads the Supabase JS client from a CDN and keeps the URL and key in browser `localStorage`. |
| `screenshots/checks.png` | Evidence that the 14 checks passed (14/14). |
| `screenshots/table-editor.png` | Supabase Table Editor showing `public.saves` and test rows. |
| `screenshots/security-advisor-errors.png` | Security Advisor Errors tab: no errors detected. |
| `screenshots/security-advisor-info.png` | Security Advisor Info finding: `RLS Enabled No Policy` on `public.saves`. |
| `screenshots/security-advisor-warnings.png` | Security Advisor Warnings: three `Public Can Execute SECURITY DEFINER` findings. |
| `screenshots/keepalive-job.png`, `keepalive-advanced.png` | The cron-job.org keep-alive job: address and daily schedule; method, headers (key hidden) and body. |
| `screenshots/keepalive-200ok.png`, `keepalive-history.png` | Its test run (200 OK) and its schedule. |
| `screenshots/stats-5.png` … `stats-8.png` | Round 2 statistics queries 5–8 on the sample saves. |

There is no single `screenshots/security-advisor.png`; the advisor evidence is split across the three files listed above.

## Install (in a Supabase project)

Prerequisites: a Supabase project with the Data API enabled and access to its SQL Editor. The test page also needs the project URL and publishable key; never use the secret or `service_role` key.

Run these SQL files in the SQL Editor, one at a time and in this order:

1. `schema.sql` — creates `public.saves`.
2. `functions.sql` — creates `create_save`, `save_progress`, and `load_progress`.
3. `security.sql` — enables RLS and applies the table and function grants. It depends on the exact function signatures created by step 2.

Run each file as a complete query and wait for `Success. No rows returned.` The Security Advisor may warn about RLS after `schema.sql`; `security.sql` enables it. `stats.sql` is optional and can be run later for statistics; it is not part of the API.

If `schema.sql` reports `relation "saves" already exists`, the table has already been created. Continue with `functions.sql` and `security.sql`; do not drop the table unless you are intentionally resetting a test project.

The test page is a static HTML file. No package installation is required.

## Test

1. Open `backend/test.html` in a browser. If the browser blocks local scripts, open the folder in VS Code and use Live Server.
2. In the **Connection** section, enter the **Project URL** and the **Publishable key**, then click **Connect**.
   - The page stores these values only in the browser's `localStorage`.
   - Do not put them in project files, screenshots, or chat.
   - The page rejects keys starting with `sb_secret_` or containing `service_role`.
3. In the **Run all checks** section, click **Run all checks**.

The suite runs 14 checks covering code creation and loading, code normalization, saving updates, invalid and unknown codes, input validation, and direct table access. It creates and updates a test save, which is why rows appear in `saves`.

Evidence: `screenshots/checks.png` shows `14 / 14 checks passed - ready to deliver!` and PASS on all 14 rows. This is the existing screenshot result, not a fresh test run. `screenshots/table-editor.png` shows the resulting test rows. The three `security-advisor-*.png` files record the advisor findings.

Some checks deliberately attempt forbidden operations, so red 400/401 console messages during checks 9-14 are expected; only the PASS/FAIL column is authoritative.

The "Try it by hand" section is optional. It can call `create_save`, `save_progress`, and `load_progress` individually.

## Statistics (round 2)

5. Stars per mission: how many players finished each mission, their average stars, and how many earned 1, 2 or 3 stars.
6. Furthest place reached: how many players reached each place, using the current place for older saves without a furthest place.
7. Predictions: how many players answered each question, how many answered correctly, and the percentage correct.
8. Average mistakes among players who finished the Small Intestine mission and average memory moves among players who finished the Memory Challenge.

## Keep-alive

Service: cron-job.org (free), job "Funscientia keep-alive".
It calls the team project's `load_progress` function via POST once a day at 06:00, using jury code `257F-T76R`.
It only reads a jury save as a template; it never creates or changes a save. Failure emails go to the owner of the cron-job.org account (Djihane).
It runs until at least 30 November 2026, then the team decides whether to keep it.

## Clean-up

`cleanup.sql` deletes the saves whose `updated_at` is more than 12 months old, and never a jury starting point (`data.template = true`). Step 1 previews the rows, step 2 deletes them, and step 3 (commented out) would run step 2 at 03:00 on the 1st of every month with `pg_cron`.

Tested on a local PostgreSQL (PGlite) with `schema.sql` and `sample_saves.sql`: the preview lists only `TEST-8888` (untouched for 14 months); after the delete, 7 rows remain, including both jury rows (`JURY-2345`, and `JURY-3456`, which is also 14 months old).

It is **not** run or scheduled on the team project: the first saves there date from October 2026, so nothing can be due before October 2027. The team decides then.

## Security in short

RLS is enabled on `public.saves`. No direct table policies are configured, so the table is not directly readable or writable through the API. Direct table privileges are revoked from `anon` and `authenticated`.

Execute on all three functions is also revoked from `public`, `anon`, and `authenticated`. The only function grants are execute permission to `anon` for `create_save(jsonb)`, `save_progress(text, jsonb)`, and `load_progress(text)`. The game therefore reaches saves only through those three approved functions.

The functions are `security definer` with `set search_path = ''`, and they reference `public.saves` by its full name. Save codes are normalized and validated against the allowed format, and the code is passed as a parameter rather than concatenated into SQL. Inputs must be JSON objects containing `version`, and must be no larger than 16,000 bytes.

Security Advisor evidence:

- Errors: 0. `screenshots/security-advisor-errors.png` reports no errors detected.
- Warnings: 3. `screenshots/security-advisor-warnings.png` shows three `Public Can Execute SECURITY DEFINER` findings.
- Info: 1. `screenshots/security-advisor-info.png` shows `RLS Enabled No Policy` on `public.saves`.

The guide's §6.4 identifies these warnings and info items as expected for this design, but they remain visible findings and should be reviewed before delivery. Do not treat the advisor as clean.

Limits: a save code acts like a bearer token. Anyone who knows a code can load or overwrite that save, and there is no rate limiting or ownership check. The publishable key is public; the secret or `service_role` key must never be exposed.

## Changes from the guide

- The SQL files (`schema.sql`, `functions.sql`, and `security.sql`) and `test.html` are unchanged from the supplied kit. Their SHA-256 hashes match the copies in `docs/backend-guide/Funscientia_Online_Saves_Kit.zip`.
- Round 2: `stats.sql` keeps queries 1–4 unchanged and appends the full contents of `round2/stats_round2.sql` as queries 5–8. `sample_saves.sql` is an unchanged copy of `round2/sample_saves.sql`.
- The README has been completed from the template in my own words; its section headings follow the original template.
- The guide asks for `screenshots/security-advisor.png`; the evidence is split into `security-advisor-errors.png`, `security-advisor-info.png`, and `security-advisor-warnings.png`. The team confirmed the split is fine.
- The screenshots show a Supabase project named `Funscientia Development`, while the guide's example uses `funscientia-saves-test`. The team confirmed it is the intended test project.
- Round 2: `cleanup.sql` (unchanged from `round2/cleanup.sql`) and `PRIVACY.md` (from `round2/PRIVACY_template.md`) were completed by the team (Hicham), with the clean-up test described above.
- In the statistics screenshots, queries 6 and 7 count one more player than the guide's expected results: the test project still holds one save left by `test.html` (place `stomach`, saliva = sugar, pepsin = protein). Rerun on the sample saves alone, the results match the guide exactly.
- No other implementation changes were identified. If any SQL or test change is made later, record it here and rerun all 14 checks.

## Questions / ideas

- (Answered: `Funscientia Development` is the intended test project.)
- Confirm whether the three separate Security Advisor screenshots satisfy the guide's single `security-advisor.png` requirement, or whether they should be combined.
- (Answered: `stats.sql` stays; round 2 added queries 5–8.)
- Consider rate limiting or another abuse control for `create_save` and save-code guessing. The current design has no rate limiting.
- Consider optimistic concurrency for `save_progress` so two devices saving the same code do not silently overwrite each other.
- A clean-up rule now exists (`cleanup.sql`); a small dashboard for the statistics queries could come later.
- SQL is currently applied manually in the Supabase SQL Editor; there is no automated migration or deployment tracking.
