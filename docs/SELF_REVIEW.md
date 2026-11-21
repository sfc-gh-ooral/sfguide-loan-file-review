# Self-review

Checked against the Snow Packs build checklist and every **Must** in the catalog's
[CONTRIBUTING.md](https://github.com/sfc-gh-ooral/snow-packs/blob/main/CONTRIBUTING.md).
Last checked: November 20, 2026 (review round 1).

## Before you call it done

| Check | Result | Evidence |
| --- | --- | --- |
| Run from a fresh clone in Sample (mock) mode | Pass | `npm ci`, `npm run lint` (now with `eslint.config.mjs`), `tsc --noEmit`, `npm run build` and `npm run build:example` clean |
| Setup → Live mode → cleanup in a clean role | Pass | November 20, 2026: `sql/setup.sql` ran in 12.4 minutes; Pipeline, Loan file, QC and Ask loaded live as `LOAN_REVIEW_DEMO_ROLE`; **Re-extract** ran AI_PARSE_DOCUMENT, AI_CLASSIFY and AI_EXTRACT live (62–75 s, three runs); a document from another loan was rejected; `sql/cleanup.sql` ran and `SHOW DATABASES/WAREHOUSES/ROLES/INTEGRATIONS` returned nothing for the pack |
| Grep files and git history for secrets, account identifiers, real user names | Pass | `git log -p --all` scanned for account locators, hostnames, user names and key headers: no hits; `.env.local` is git-ignored |
| Pages URL and `/try/` signed out, phone width and dark mode | Pass | Landing and `/try/` return 200, every JS/CSS asset 200; rendered at 390 px and 1440 px in light and dark with no console errors or overflow |
| Every planted story visible in a screenshot | Pass | Income mismatch (02), unexplained deposit (03), appraisal age (05), clean file (07) |

## CONTRIBUTING Musts

| Must | Result | Where |
| --- | --- | --- |
| Business problem a specific industry recognizes | Pass | README headline and scenario |
| One industry and one business function | Pass | Banking · Operations |
| Public repo named `sfguide-<topic>` | Pass | `sfguide-loan-file-review` |
| `LICENSE` (Apache 2.0) | Pass | `LICENSE` |
| GitHub Pages enabled, `.nojekyll` | Pass | `/docs`, `docs/.nojekyll` |
| Business problem and outcome on the first screen | Pass | Landing hero, README intro |
| Screenshots of the running app | Pass | `docs/images/01–08` |
| Caption naming the capability, plus alt text | Pass | `docs/index.html` figures |
| Name the capability behind each step; only claim what was used and tested | Pass | AI_PARSE_DOCUMENT, AI_CLASSIFY and AI_EXTRACT now run from the app via **Re-extract** (`REEXTRACT_DOCUMENT`) as well as in the stream + task pipeline; all other capabilities run from the app in Live mode |
| Visible disclaimer | Pass | App shell, landing page, README |
| Links to repository and Snowflake docs | Pass | Landing page and README |
| No Snowflake logo files or trademarked imagery | Pass | Fictional Lintora mark |
| No internal sales motions | Pass | |
| End-user app with a real workflow | Pass | Queue, loan file, clear / request / escalate, re-extract |
| No-account mode on bundled synthetic data | Pass | Sample mode and hosted `/try/` |
| Simulated output labeled "Sample AI response" | Pass | Every AI panel, including Re-extract, in Sample mode |
| Live mode on Snowflake, no silent fallback | Pass | Live errors are shown, never replaced with sample data |
| Synthetic, deterministic data | Pass | `scripts/generate_data.py` |
| Self-contained setup | Pass | `LOAN_REVIEW_DEMO`, `LOAN_REVIEW_WH` (XSMALL, AUTO_SUSPEND 60), `LOAN_REVIEW_DEMO_ROLE`, `LOAN_REVIEW_GIT_API` |
| Cleanup removes everything | Pass | `sql/cleanup.sql`, confirmed with SHOW commands |
| No credentials or identifiers in code, screenshots or history | Pass | Scan above |
| User names redacted | Pass | No user names in screenshots or captures |
| No customer names, logos, data or identifiable logic | Pass | Fictional lender and brand |
| No deals, internal programs or roadmap | Pass | |
| GA or labeled preview features | Pass | All functions used are GA |
| Prerequisites | Pass | README |
| Run instructions and objects created | Pass | README "Live mode" and objects table (now lists `REEXTRACT_DOCUMENT`) |
| Expected cost and time | Pass | README, including Re-extract latency |
| Known limitations | Pass | README |
| Customize with Cortex Code prompts | Pass | README |
| Owner and last-reviewed date | Pass | `Owner: Oz Oral · Last reviewed: November 2026` |
| License and as-is disclaimer | Pass | README "License" |
| Outcomes as possibilities | Pass | |
| Planted results qualified "on this synthetic data set" | Pass | README stories |

## Should items skipped

- Sample mode Re-extract waits about 7.4 s (6.8–8 s with jitter); the live call takes 62–75 s, as the README states.

## Polish pass, November 20, 2026

- Fresh clone, `npm ci`, `npm run dev`: pass (home page returns 200).
- Dark mode: renders with the dark theme, no console errors.
- Round-1 Should items 4 and 5, done: every pipeline KPI tile now has a labeled weekly sparkline built from the loans in the payload (applications, open conditions by application week, scheduled closings for the next 8 weeks, documents by application week). `npm test` runs 6 checks with Node's built-in runner (sample KPIs and stage counts, loan ID format, per-loan files, Sample delays within 4–8 s including jitter, no hosts or query IDs in the sample). The hosted build pins its build ID; chunk names still change when their code changes.
- The test found Sample delays outside 4–8 s once jitter is added (narrative and Re-extract up to 8.6 s, draft down to 3.7 s); they are now 7.4 s and 4.6 s.
- `npm run lint` and `tsc --noEmit`: pass.
