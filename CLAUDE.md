# Veritone RPA — Project Reference

## 1. PROJECT OVERVIEW

This is a Robotic Process Automation (RPA) bot that pre-screens job applicants on behalf of
**Strategy One HR**, a recruitment agency that uses **Veritone Hire** (adcourier.com) as its
applicant tracking system.

Each night the bot logs in to Veritone Hire, reads every advert posted within a configurable
lookback window, and for each advert:
1. Enters keyword and location filters on the Responses page
2. Collects the IDs of candidates who passed the filter
3. Flags (purple) candidates who did not pass the filter and have no existing flag
4. Reviews CVs of passing candidates via LLM and records pass/fail decisions
5. Writes a row to a Processing Report spreadsheet

**Intended schedule:** nightly between 7 pm and 7 am Sydney time (AEST/AEDT).
In `RUN_MODE=testing` the time-window check is not enforced.

**Language and core libraries:**

| Library | Purpose |
|---|---|
| TypeScript 5.7 / Node.js | Language and runtime |
| Playwright 1.50 | Browser automation (Chromium, headful) |
| `@anthropic-ai/sdk` 0.39 | LLM calls for keyword selection and resume review |
| ExcelJS 4.4 | Read/write `.xlsx` files |
| Luxon 3.5 | Date parsing and comparison |
| Winston 3.17 | Structured logging to console + rolling log file |
| node-cron 3.0 | Nightly scheduler — fires at 7:00 PM Sydney time (`0 19 * * *`) |
| nodemailer 6.9 | Fault email notifications (fatal + repeated errors) |
| dotenv 16 | Loads `.env` at startup |
| tsx 4.19 | Dev runner (`npm run dev`) |

---

## 2. FOLDER STRUCTURE

```
veritone-rpa/
├── src/
│   ├── main.ts                   Entry point — orchestrates the full run
│   ├── browser-session.ts        Launches Chromium; waits for manual login
│   ├── activity-logger.ts        Winston logger instance (console + rolling file) — not yet wired in
│   ├── adverts/
│   │   ├── advert-reader.ts      Playwright steps: reads advert rows, drives per-advert loop
│   │   ├── advert-page-object.ts All advert logic and types: AdvertSummary, AdvertDetail,
│   │   │                         RawAdvertRow, DEFAULT_LOOKBACK_DAYS, isFatalError,
│   │   │                         classifyError, parseAdvertRow, filterAndSort
│   │   └── page-navigation.ts    Navigates to Manage Adverts (and archived tab)
│   ├── candidates/
│   │   ├── candidate-filter.ts   Playwright steps: enters keywords/location/distance, clicks search
│   │   ├── candidate-collector.ts Playwright steps: paginates filtered responses, collects cards
│   │   ├── candidate-flagger.ts  Playwright steps: reads flag state, clicks purple flag
│   │   └── candidate-page-object.ts All candidate logic and types: PassingCandidate, FilterResult,
│   │                              CollectResult, FlagResult, CardData, NonPassingNoFlag,
│   │                              NonPassingAlreadyFlagged, FLAG_COLOUR_MAP, classifyCards,
│   │                              buildCollectSummary, selectKeywordsViaLLM
│   ├── resume/
│   │   ├── resume-reviewer.ts    Playwright steps: paginates, opens CV modal, extracts text,
│   │   │                         calls LLM, flags failed candidates
│   │   └── resume-page-object.ts All resume logic and types: ReviewResult, ReviewSummary,
│   │                              validRejectionCategories, RejectionCategory,
│   │                              validateLlmResponse, tallyRejectionCounts
│   ├── shared/
│   │   ├── utils.ts              randomDelay, cleanupSession, parseAdvertDate
│   │   ├── excel-service.ts      appendToExcel, markAdvertSkipped, finaliseAdvertRow,
│   │   │                         writeAdvertError; COL column-index map
│   │   ├── llm-service.ts        callLLM; loadLLMSelections; loadCommonKeywords; loadAllVariables
│   │   └── email-service.ts      sendRunSummaryEmail; sendErrorReportEmail; AdvertRunResult
│   └── prompts/
│       ├── identify-keywords.ts  buildKeywordPrompt() — keyword selection prompt
│       └── review-resume.ts      buildReviewPrompt() — resume review prompt
│
├── data/
│   ├── Processing-Report.xlsx    Output report — one row written per advert processed
│   ├── Variables-used-by-LLMs.xlsx  LLM model selection + common keywords (see §6)
│   └── rejection-filters.md      Reference doc — rejection criteria (not used by code yet)
│
├── config/
│   └── rejection-filters.md      Rejection criteria — loaded at runtime by resume-reviewer.ts
│
├── logs/
│   └── rpa.log                   Rolling log — 5 MB max, 7 files retained
│
├── temp/                         Scratch space — excluded from tsc compilation
│   ├── passing-{advertId}.json   Passing candidates collected after keyword filter
│   └── resume-review-{advertId}.json  LLM resume review results + selectedKeywords
│                                       (used for persistent run state — see §10)
│
├── .env                          Live secrets — never commit
├── .env.template                 Template showing all required variables
├── tsconfig.json                 Target ES2022, strict, outDir ./dist
└── package.json                  Scripts: dev (tsx), build (tsc), start (node dist/)
```

---

## 3. CODING CONVENTIONS

- **Separation of concerns** — page-object files (`*-page-object.ts`) own all logic, data
  transformation, interfaces, and type definitions. Automation files own only Playwright
  steps (clicking, navigating, waiting, reading the DOM) plus calls to page-object and
  service functions. No business logic inline in automation files.
- **No inline comments** in source code. Code should be self-explanatory.
  Use `CLAUDE.md` or separate docs for context.
- **Testing-only additions** are the sole exception: mark them with
  `// TESTING ONLY - remove when done` on both the opening and closing lines.
- **Console log prefixes** must match the module name exactly, enclosed in square brackets:
  `[Main]`, `[Browser]`, `[Navigation]`, `[AdvertReader]`, `[CandidateFilter]`,
  `[CandidateCollector]`, `[CandidateFlagger]`, `[ResumeReviewer]`,
  `[LLMService]`, `[ExcelService]`, `[Utils]`, `[Cleanup]`.
- **Logging policy** — only log high-level step transitions and errors/warnings. Do not log
  per-candidate actions, per-page progress, URL confirmations, or sub-step details.
  Keep logs to a level where a human can follow the run at a glance without noise.
- **All LLM prompts** live in `src/prompts/` as named exports. Never build prompt strings
  inline inside service or logic files.
- **Never use Ember-generated IDs** as Playwright selectors (e.g. `ember123`).
  Always use stable CSS selectors — IDs baked into the site markup, class names,
  attribute patterns, or structural combinators.
- **Random delays** (`randomDelay`) must be used between every page interaction to avoid
  rate-limiting and bot detection. The default is **4000–5000 ms**. Call `randomDelay()`
  with no arguments; only pass explicit values if a specific window is genuinely needed.
- **Ember pagination pattern** — after clicking a next-page `li`, always wait for the
  selected page indicator to update before reading cards:
  ```
  await page.waitForSelector(
    `#result-footer li.page-num.selected[title="${pageNumber + 1}"]`,
    { timeout: 10000 },
  );
  await page.waitForTimeout(1000);
  ```
  Do NOT use `waitForLoadState('networkidle')` after pagination — Ember renders client-side.
- **Gritter toast blocker** — after closing a candidate profile modal, a "Getting your
  results..." toast can block pagination clicks. Wait for it to clear first:
  ```
  await page.waitForFunction(
    () => (document.querySelector('#gritter-notice-wrapper')?.childElementCount ?? 0) === 0,
    { timeout: 10000 },
  ).catch(() => {});
  ```
- TypeScript `strict` mode is enabled. All code must pass `npx tsc --noEmit` with zero errors.

---

## 4. SAFETY RULES

These rules protect candidates and the integrity of the Veritone Hire data.
They must not be violated.

1. **Never overwrite an existing flag.** If a candidate already has a flag (any colour),
   do not change it. Only act on candidates that have no flag.
2. **Never flag candidates who passed the filter.** Flagging (rejection) applies only to
   candidates who did not survive the keyword + location search.
3. **Always check for grey colour before flagging.** The expected state of an un-actioned
   candidate is grey (no flag). Confirm this visually/via selector before writing any flag.
4. **The 3-week lookback rule is enforced by `LOOKBACK_DAYS`.** Do not process adverts
   older than the configured window. Default is 10 days.
5. **Archived adverts are used for testing only.** The live run always operates on the
   default (non-archived) Manage Adverts view. Archived navigation is a testing override
   and must be removed before going live.

---

## 5. KEY SELECTORS REFERENCE

These selectors have been confirmed against the live site. Do not replace them with
Ember-generated or fragile alternatives.

### Manage Adverts page (`manage-vacancies.cgi`)

| Element | Selector |
|---|---|
| "Manage Adverts" nav link | `a#prim_manage` |
| Active nav item wrapper | `li.active a#prim_manage` |
| Advert rows | `tr.va-top.advert.last` |
| Job title link (contains `advert_id=`) | `a.jobtitle.no_dragdrop` |
| Total responses span | `span[title*="Total"]` |
| Ref number cell | second `td` in the following sibling row |
| Location cell | third `td` in the following sibling row |
| "Archived adverts" tab link | `a[href*="archive=1"]` |
| Back to Manage Adverts link | `a[href*="manage-vacancies"]` |

### Advert detail page

| Element | Selector |
|---|---|
| Job title | `div#original_title` |
| Location | `th:has-text('Location:') + td` |
| Job description (iframe) | `iframe#description_org` → `body` |
| Applicant count cells | `table.board_status td[style*="text-align: center"]` |
| "Responses" tab link | `a[href*="adcresponses"]` |

### Responses page (filtered and unfiltered)

| Element | Selector |
|---|---|
| Keywords textarea | `textarea.keywords` |
| Distance field | `input[placeholder="30"]` |
| Location Select2 trigger | `.select2-container.unediable-input a.select2-choice` |
| Select2 search input | `#s2id_autogen2_search` |
| Select2 dropdown results | `#select2-drop .select2-result-selectable` |
| Select2 drop mask | `#select2-drop-mask` |
| Search button | `section#main-criteria button.btn.btn-success` |
| Filtered result count | `h4#search-activity` |
| Candidate cards | `div.result.searchable` |
| Candidate ID attribute | `external-candidate-id` |
| Candidate name | `h4.mt-4 span.font-md` |
| Flag icons | `div.ranking-flags i.icon-flag-circled` |
| Purple flag icon | `i.candidate-flag-rank-21` |
| Eye / profile button | `button.button-candidate-action-profile` |
| Current page indicator | `#result-footer li.page-num.selected` |
| Next page button | `#result-footer li.page-num.selected + li.page-num` |
| Gritter toast wrapper | `#gritter-notice-wrapper` |

### Candidate profile modal

| Element | Selector |
|---|---|
| Modal container | `div.profile-box` |
| Close button | `a.profile-close` |
| CV header (HTML format) | `h4.adcresponses-header:has-text("CV")` |
| CV content (HTML format) | `h4.adcresponses-header:has-text("CV") + div` |
| PDF iframe | `div.profile-box iframe.pdfjs_viewer` |
| PDF text layer | `div.textLayer` (use `.first()` — one per PDF page) |
| PDF text divs | `div.textLayer div` |

### Global

| Element | Selector |
|---|---|
| Logout link | `li#logout a` |

---

## 6. EXCEL FILES

### `data/Processing-Report.xlsx`

One row is appended per advert processed. Column indices are defined in
`src/shared/excel-service.ts` as the `COL` constant.

The initial row write (`appendToExcel`) writes START_TIME through AFTER_KW_FILTER.
Subsequent writes update the same row via `finaliseAdvertRow` (on success),
`markAdvertSkipped` (zero filtered candidates), or `writeAdvertError` (on error).

| Column | Index | Written? |
|---|---|---|
| START_TIME | 1 | Yes — `dd/MM/yyyy HH:mm:ss` |
| END_TIME | 2 | Yes — ISO timestamp (Sydney time); `"SKIPPED (NO FILTERED CANDIDATES)"` if zero results |
| ELAPSED | 3 | Yes — `"X.X mins"`; `"SKIPPED (NO FILTERED CANDIDATES)"` if zero results |
| JOB_TITLE | 4 | Yes |
| LOCATION | 5 | Yes |
| JOB_DESCRIPTION | 6 | Yes |
| TOTAL_APPLICATIONS | 7 | Yes |
| KEYWORD_1 | 8 | Yes |
| KEYWORD_2 | 9 | Yes |
| KEYWORD_3 | 10 | Yes |
| KEYWORD_4 | 11 | Yes |
| AFTER_KW_FILTER | 12 | Yes — filtered candidate count |
| AFTER_RESUME | 13 | Yes — LLM pass count after resume review |
| ERROR | 14 | Yes — `"no errors"` on success; error message on failure |
| GENERAL_FILTER_REJECTS | 15 | Yes — LLM fails with `rejection_category = "general"` |
| LABOURING_FILTER_REJECTS | 16 | Yes — LLM fails with `rejection_category = "labouring"` |
| HEAVY_LABOURING_REJECTS | 17 | Yes — LLM fails with `rejection_category = "heavy_labouring"` |
| EMPLOYMENT_DATE_REJECTS | 18 | Yes — LLM fails with `rejection_category = "employment_date"` |

Row 1 is assumed to be a header row. The service scans down from row 2 to find the first
empty `JOB_TITLE` cell and writes there.

### `data/Variables-used-by-LLMs.xlsx`

Two sheets:

| Sheet | Contents |
|---|---|
| `LLM-selection` | Col 1: task name (lowercase), Col 2: model name (`haiku` / `sonnet` / `opus`) |
| `Common-keywords` | Col 1: one keyword per row (lowercased on load) |

The `LLM-selection` sheet maps task names to Claude model IDs via `MODEL_MAP` in
`llm-service.ts`. Unrecognised model names fall back to `claude-haiku-4-5-20251001`.

Current task names in the sheet: `identify keywords`, `resume review`.

---

## 7. ENVIRONMENT VARIABLES

Copy `.env.template` to `.env` and fill in real values. Never commit `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key (required) |
| `RUN_MODE` | `production` | `production` enforces 7 pm–7 am window; `testing` skips it |
| `LOOKBACK_DAYS` | `10` | How many days back to look for adverts |
| `EMAIL_USER` | — | Gmail address used to send notifications |
| `EMAIL_PASS` | — | Gmail App Password for the sending account |

**Email recipients** are hardcoded in `email-service.ts`: `sustdev3@gmail.com`, `bruce@8020green.com`,
and a testing address (see TESTING ONLY markers). They are not read from `.env`.

**Currently:** `RUN_MODE=production` and `LOOKBACK_DAYS=1000` (wide window for archived advert testing).

---

## 8. TESTING VS PRODUCTION

### How testing works

Archived adverts on Veritone Hire are used as safe test data because they are real adverts
with real candidates but have no operational consequences — flagging a candidate on an
archived advert does not affect live hiring.

The current testing setup runs the **full production pipeline** (filter → collect → flag →
resume review → Excel write) against adverts found on **page 10** of the Archived Adverts tab.

How the test mode works:
1. `main.ts` calls `navigateToArchivedAdverts()` after `navigateToManageAdverts()` to switch
   to the archived tab.
2. `readAndProcessAdverts()` calls `navigateToArchivedAdvertsPage10()` to land on page 10.
3. `filterAndSort()` in `advert-page-object.ts` filters to an explicit list of test advert IDs
   rather than processing all adverts in the lookback window. Current test IDs:
   `519021`, `519020`, `519019`, `519018`, `519016`.
4. Between adverts, `navigateToArchivedAdvertsPage10()` is called again to return to the
   correct listing page before clicking into the next advert.
5. A temporary ID-listing log in `readAdvertList` prints every advert ID and title found.

### Removing testing overrides before going live

Search for `// TESTING ONLY - remove when done` across the codebase. There are currently
**five locations**:

| File | What to remove |
|---|---|
| `src/main.ts` | The `navigateToArchivedAdverts()` call |
| `src/adverts/page-navigation.ts` | The `navigateToArchivedAdvertsPage10` and `navigateToArchivedAdverts` functions and their exports |
| `src/adverts/advert-page-object.ts` (`filterAndSort`) | The explicit test ID filter block — replace with `return filtered` |
| `src/adverts/advert-reader.ts` (loop body) | The `navigateToArchivedAdvertsPage10()` call between adverts |
| `src/adverts/advert-reader.ts` (`readAdvertList`) | The ID-listing `for` loop that prints every advert ID and title |

After removing all testing overrides, run `npx tsc --noEmit` to confirm zero errors.

---

## 9. ERROR HANDLING

### Fatal errors — immediate stop

`isFatalError()` in `advert-page-object.ts` matches these strings (case-insensitive) in the
error message and triggers an immediate halt:

- `"credit balance is too low"`
- `"insufficient_quota"`
- `"billing"`
- `"overloaded_error"` — Anthropic API 529 after all retries exhausted

On a fatal error the bot: writes the error to `COL.ERROR` in the report via `writeAdvertError()`,
sends a `"RPA STOPPED — fatal error"` email, and exits the advert loop immediately.

### Repeated errors — graceful stop

Non-fatal errors are classified by type (`timeout`, `selector`, `navigation`, `other`) via
`classifyError()` in `advert-page-object.ts` and counted. If the same error type occurs
**2 or more times**, the bot stops and sends a `"RPA STOPPED — repeated {type} error"` email
listing all errors encountered.

### LLM retry logic (`llm-service.ts`)

| Error type | HTTP status | Retries | Backoff |
|---|---|---|---|
| Rate limit | 429 | Up to 3 | 1 s, 2 s, 4 s |
| Overloaded | 529 | Up to 3 | 15 s, 30 s, 60 s |

After retries are exhausted the original error is re-thrown. An `overloaded_error` that
survives all retries is caught by `isFatalError` and stops the run.

---

## 10. PERSISTENT RUN STATE

The bot persists state in `temp/resume-review-{advertId}.json` to make re-runs efficient
after an interrupted or partial run.

### What is saved

Each file stores:
- `selectedKeywords` — the keywords chosen by the LLM for this advert's filter
- `results` — every candidate review record (`id`, `name`, `ai_decision`, `ai_reason`,
  `rejection_category`)
- `advertId`, `reviewedAt`, `totalReviewed`, `ruleset`

### Keyword reuse (`candidate-filter.ts`)

At the start of `filterCandidates()`, the bot checks for an existing
`temp/resume-review-{advertId}.json`. If found and `selectedKeywords` is non-empty, the
LLM call is skipped entirely and those keywords are reused. Logs:
`[CandidateFilter] Reusing keywords from previous run: ...`

### Resume review skip (`resume-reviewer.ts`)

At the start of `reviewResumes()`, previously passed candidates (where `ai_decision === "pass"`
in the existing file) are loaded into `previouslyPassedIds`. Any candidate in this set is
skipped without opening their modal or calling the LLM. The count is reported in
`ReviewSummary.skippedPreviouslyPassed` and logged in the advert-reader summary line.

When writing the output file, new results are merged with the previous results — previous
records are kept as-is and only new candidate records are appended.

### Stale file cleanup (`advert-reader.ts`)

After `filterAndSort()` produces the run's advert list, both `resume-review-{advertId}.json`
and `passing-{advertId}.json` files in `temp/` whose advert ID is not in the current run are
deleted. Logs: `[AdvertReader] Deleted stale state file for advert {advertId} — not in current run`

---

## 11. CURRENT DEVELOPMENT STATUS

### Complete

- Browser launch with human-in-the-loop login (10-minute window)
- Navigation to Manage Adverts with URL + selector verification
- Navigation to Archived Adverts tab (testing helper)
- Advert list extraction from `tr.va-top.advert.last` rows
- Date parsing with Luxon (`d MMM yy HH:mm` and `d MMM yyyy HH:mm`)
- Lookback window filtering via `LOOKBACK_DAYS`
- Per-advert: click into detail page, extract title / location / description / applicant count
- LLM keyword selection via Anthropic SDK with JSON parse and up-to-4 keyword cap
- Rate-limit (429) and overloaded (529) retry with exponential backoff
- Responses page: keyword entry, distance set to 20 km, Select2 location entry, search
- Filtered candidate count read from `h4#search-activity`
- Full pipeline: filter → collect → flag → resume review wired end-to-end
- Write row to `Processing-Report.xlsx` — all columns including END_TIME, ELAPSED,
  AFTER_RESUME, ERROR
- Skipped adverts (zero filtered candidates) marked in END_TIME and ELAPSED columns
- Fatal error handling: immediate stop + Excel write + email notification
- Repeated error handling: stop after 2 of same type + email notification
- Post-run summary email (`sendRunSummaryEmail`) — one email after all adverts, listing ✓/✗/⚠ per advert
- Immediate error email (`sendErrorReportEmail`) — sent on fatal or repeated errors
- Winston logger configured (rolling 5 MB file, 7-day retention)
- `Variables-used-by-LLMs.xlsx` loader for LLM model selection and common keywords
- `config/rejection-filters.md` reference document
- Passing candidate collection with pagination (`candidate-collector.ts`)
- Non-passing candidate flagging with inline purple flag (`candidate-flagger.ts`)
- LLM resume review (`resume-reviewer.ts`) — HTML and PDF CV extraction, pass/fail flagging with purple flag (`rank-21`)
- Resume review prompt (`src/prompts/review-resume.ts`) — strict mode triggers when `totalFiltered > 60`
- `rejection_category` field in LLM resume response — `general` / `labouring` / `heavy_labouring` / `employment_date`; missing/invalid value defaults to `"general"` with a warning
- Rejection category tallies written to Excel cols 15–18 per advert
- Filter wait uses `waitFor visible` + `waitForFunction` polling instead of a static 10 s wait
- Full location string (e.g. "Virginia, Brisbane, Australia") passed to Select2 — no truncation at comma
- Clean separation of concerns — page-object files own all logic/types; automation files own only Playwright steps
- Excel write operations fully encapsulated in `excel-service.ts` (`markAdvertSkipped`, `finaliseAdvertRow`, `writeAdvertError`)
- Persistent run state via `temp/resume-review-{advertId}.json` — keyword reuse, previously-passed skip, result merging, stale file cleanup (see §10)
- Nightly scheduler via `node-cron` — fires at `0 19 * * *` Sydney time; mid-run window check (`isWithinRunWindow`) stops the bot if 7:00 AM is reached; hard reset `setTimeout` in `main.ts` force-exits the process as a last resort
- `activeSession` hoisted to module scope in `main.ts` so the hard reset timeout can call `cleanupSession` before forcing exit
- Email notifications sent to `sustdev3@gmail.com`, `bruce@8020green.com`, and a testing address on every run summary and error report

### Next to build

- Nothing currently scheduled

### Known TODOs

- `activity-logger.ts` (Winston instance) is created but never imported — all logging
  currently uses `console.log` / `console.warn` directly
- The hard reset `setTimeout` in `main.ts` is set to **5 minutes** — must be updated to
  `12 * 60 * 60 * 1000` (12 hours) before going live to match the full 7 PM–7 AM window
- Remove all `// TESTING ONLY` overrides before switching to live adverts (see §8)
