# Veritone RPA

A Robotic Process Automation bot that pre-screens job applicants on behalf of **Strategy One HR** using the **Veritone Hire** (adcourier.com) applicant tracking system. Each night it logs in to Veritone Hire, applies keyword and location filters to every active advert within a configurable lookback window, flags non-passing candidates, reviews CVs via LLM, and writes a summary row to a Processing Report spreadsheet.

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | ^0.39.0 | Claude API calls for keyword selection and resume review |
| `dotenv` | ^16.4.5 | Loads environment variables from `.env` at startup |
| `exceljs` | ^4.4.0 | Read and write `.xlsx` processing report |
| `luxon` | ^3.5.0 | Date parsing and timezone-aware comparisons |
| `node-cron` | ^3.0.3 | Schedules the nightly run at 7:00 PM Sydney time |
| `nodemailer` | ^6.9.15 | Sends run summary and error notification emails |
| `playwright` | ^1.50.0 | Chromium browser automation |
| `winston` | ^3.17.0 | Structured logging to console and rolling log file |

### Development

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^5.7.3 | Language |
| `tsx` | ^4.19.2 | Run TypeScript directly without a build step (`npm run dev`) |
| `@types/luxon` | ^3.4.2 | Type definitions for luxon |
| `@types/node` | ^22.0.0 | Type definitions for Node.js |
| `@types/node-cron` | ^3.0.11 | Type definitions for node-cron |
| `@types/nodemailer` | ^6.4.17 | Type definitions for nodemailer |

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A **Google account** with an [App Password](https://support.google.com/accounts/answer/185833) enabled for SMTP (used for email notifications)
- An **Anthropic API key** with access to Claude
- **Windows** recommended — the bot runs Chromium in headful mode and requires a display for the manual login step

---

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd veritone-rpa
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install Playwright browsers

```bash
npx playwright install chromium
```

### 4. Configure environment variables

Copy the template and fill in your values:

```bash
cp .env.template .env
```

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `RUN_MODE` | `production` enforces the 7 PM–7 AM run window; `testing` skips it |
| `LOOKBACK_DAYS` | How many days back to look for adverts (default: `10`) |
| `EMAIL_USER` | Gmail address used to send notifications |
| `EMAIL_PASS` | Gmail App Password for the sending account |

### 5. Build

```bash
npm run build
```

### 6. Run

**Development** (no build required):
```bash
npm run dev
```

**Production** (after building):
```bash
npm start
```

When the bot starts it will open a Chromium browser window and wait up to 10 minutes for you to manually log in to Veritone Hire. Once logged in, the bot takes over automatically.
