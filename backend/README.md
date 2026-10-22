# Funscientia online saves (backend)

Code-based online saves for Funscientia: the game creates a save and shows the player a code (e.g. `K7QM-4FXA`); the player can continue on any device by typing it. No accounts or emails.

## Files

| File | Purpose |
| --- | --- |
| `README.md` | This documentation. |
| `schema.sql` | Creates the `public.saves` table with `code`, `data`, `created_at`, `updated_at`, and `save_count`, including the save-code format check. |
| `functions.sql` | Creates the three API functions: `create_save(p_data jsonb)`, `save_progress(p_code text, p_data jsonb)`, and `load_progress(p_code text)`. |
| `security.sql` | Enables RLS on `public.saves`, removes direct table and function access from the API roles, and grants execute on only the three functions to `anon`. |
| `stats.sql` | Optional read-only statistics queries for the SQL Editor. Not exposed through the API. |
| `test.html` | Local browser test page with manual RPC buttons and a "Run all checks" suite of 14 checks. It loads the Supabase JS client from a CDN and keeps the URL and key in browser `localStorage`. |
| `screenshots/checks.png` | Evidence that the 14 checks passed (14/14). |
| `screenshots/table-editor.png` | Supabase Table Editor showing `public.saves` and test rows. |
| `screenshots/security-advisor-errors.png` | Security Advisor Errors tab: no errors detected. |
| `screenshots/security-advisor-info.png` | Security Advisor Info finding: `RLS Enabled No Policy` on `public.saves`. |
| `screenshots/security-advisor-warnings.png` | Security Advisor Warnings: three `Public Can Execute SECURITY DEFINER` findings. |

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

- The SQL files (`schema.sql`, `functions.sql`, `security.sql`, and `stats.sql`) and `test.html` are unchanged from the supplied kit. Their SHA-256 hashes match the copies in `docs/backend-guide/Funscientia_Online_Saves_Kit.zip`.
- The README has been completed from the template in my own words; its section headings follow the original template.
- The guide asks for `screenshots/security-advisor.png`; the available evidence is split into `security-advisor-errors.png`, `security-advisor-info.png`, and `security-advisor-warnings.png`. Confirmation is still needed on whether this split is acceptable or whether a combined screenshot is required.
- The screenshots show a Supabase project named `Funscientia Development`, while the guide's example uses `funscientia-saves-test`. Confirmation is still needed that this is the intended test project.
- No other implementation changes were identified. If any SQL or test change is made later, record it here and rerun all 14 checks.

## Questions / ideas

- Confirm whether the current Supabase project shown in the screenshots, `Funscientia Development`, is the intended test project or whether it should be renamed or recreated as `funscientia-saves-test`; this affects traceability but not the SQL itself.
- Confirm whether the three separate Security Advisor screenshots satisfy the guide's single `security-advisor.png` requirement, or whether they should be combined.
- Decide whether to keep `stats.sql` in the final delivery; it is optional and not required for the API.
- Consider rate limiting or another abuse control for `create_save` and save-code guessing. The current design has no rate limiting.
- Consider optimistic concurrency for `save_progress` so two devices saving the same code do not silently overwrite each other.
- Consider a cleanup policy for old saves and a small dashboard for the statistics queries.
- SQL is currently applied manually in the Supabase SQL Editor; there is no automated migration or deployment tracking.
