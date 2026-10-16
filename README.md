# AI Job Hunter

> A personal, end-to-end job-hunting automation system — from career portal crawling and intelligent scoring to cold outreach dispatch, interview preparation, and persistent MongoDB audit logging.

---

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [How to Run](#how-to-run)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Build & Deployment](#build--deployment)
- [License](#license)

---

## Project Description

**AI Job Hunter** is a Node.js automation platform built to streamline the entire job search workflow for a Generative AI & Backend Engineer. It crawls startup and company career portals (via `cheerio` + `playwright`), extracts and scores job listings against a curated candidate profile using a multi-factor scoring engine, and surfaces high-match opportunities via an email digest.

Beyond discovery, the system supports a full **cold outreach pipeline**: editable email templates, per-recipient customization, batched SMTP dispatch with mandatory human-in-the-loop preview approval, and persistent audit logging in MongoDB — where logs are written **only after confirmed delivery to real email addresses**. An **interview preparation module** generates per-company dossiers from `upcoming.md`, and a **Mission Control UI** (served via Express) exposes all workflows through a unified browser-based dashboard.

---

## Tech Stack

### Backend / Runtime

| Technology | Purpose |
|---|---|
| Node.js (ESM) | Runtime (ES Modules, `"type": "module"`) |
| Express v5 | HTTP server & REST API |
| Nodemailer v7 | SMTP email dispatch (Gmail) |
| MongoDB v7 (Node driver) | Persistent outreach audit logs & company contacts |
| Playwright v1.55 | Headless browser crawling for JS-rendered career portals |
| Cheerio v1.1 | HTML parsing for static career pages |
| xlsx v0.18 | Reading/writing Excel outreach tracking sheets |

### Frontend (Mission Control UI)

| Technology | Purpose |
|---|---|
| Vanilla HTML / CSS / JavaScript | Single-page dashboard (`public/`) |
| Server-Sent Events (SSE) | Real-time workflow log streaming to browser |

### Database

| Technology | Purpose |
|---|---|
| MongoDB (local) | `outreach_logs` — immutable production send audit; `companies_contacts` — enriched HR/founder contacts |

### Data Sources & Integrations

| Technology | Purpose |
|---|---|
| Google Sheets (public URL) | Startup company list (`fetchAgenticStartups`) |
| DuckDuckGo HTML search | Contact enrichment — HR/recruiter/founder discovery |
| Gmail SMTP (SSL port 465) | Outbound email delivery |

---

## Prerequisites

- **Node.js** `>= 18` (ES Modules required)
- **npm** `>= 9`
- **MongoDB** running locally on `127.0.0.1:27017` (no authentication required by default)
- A **Gmail account** with an App Password (2FA enabled; standard passwords will not work with SMTP)
- **Playwright browsers** — installed via `npx playwright install chromium`

---

## Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd ai-job-hunter

# 2. Install Node.js dependencies
npm install

# 3. Install Playwright Chromium browser binary
npx playwright install chromium

# 4. Copy and configure environment variables
cp .env.example .env
# Edit .env with your own credentials (see Environment Variables section)

# 5. Ensure MongoDB is running locally
# macOS (Homebrew): brew services start mongodb-community
# Verify: mongosh --eval "db.runCommand({ ping: 1 })"
```

---

## Environment Variables

Create a `.env` file at the project root. **Never commit this file** (it is listed in `.gitignore`).

| Variable | Required | Description |
|---|---|---|
| `SMTP_HOST` | ✅ | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | ✅ | SMTP port (use `465` for Gmail SSL) |
| `SMTP_SECURE` | ✅ | `true` for SSL, `false` for STARTTLS |
| `SMTP_USER` | ✅ | Your Gmail address used as the SMTP sender |
| `SMTP_PASS` | ✅ | Gmail App Password (16-character app-specific password) |
| `EMAIL_TO` | ✅ | Recipient email for job digest notifications (typically your own) |
| `RESUME_PATH` | ✅ | Relative path to the PDF resume attached to outreach emails |
| `HEADLESS` | ✅ | `true` to run Playwright headlessly; `false` to show browser UI |
| `MIN_MATCH_SCORE` | ✅ | Minimum job match score (0–100) to include in output. Default: `55` |
| `LOOKBACK_HOURS` | ✅ | How many hours back to include "recent" jobs. Default: `48` |
| `AUTO_APPLY` | ✅ | `false` disables automated form submissions. Recommended: `false` |
| `DRY_RUN` | ✅ | `true` skips actual SMTP sends during batch pipeline runs |
| `MONGODB_URI` | ✅ | MongoDB connection URI (e.g. `mongodb://127.0.0.1:27017`) |
| `MONGODB_DB_NAME` | ✅ | MongoDB database name (e.g. `ai_job_hunter`) |
| `PORT` | ❌ | HTTP port for the Mission Control UI server. Defaults to `3000` |

> ⚠️ **Security note:** The `.env` file with real credentials must never be committed to version control.

---

## How to Run

### Local Development — Mission Control UI (Recommended)

Starts the Express server and serves the browser dashboard at `http://localhost:3000`.

```bash
npm run ui
# or equivalently:
npm run dev
```

The UI exposes all pipeline workflows (job scan, outreach, interview prep, reports) as interactive tabs. All operations, including email dispatch, are driven from the browser with mandatory preview before send.

---

### CLI — Job Discovery & Intelligence Pipeline

Scan career portals listed in `jobs/companies.md`, score, filter, and generate output reports:

```bash
# Default: scan companies from jobs/companies.md
npm run jobs:scan

# Limit to first 20 companies
npm run jobs:scan:batch

# Dry run (no emails sent)
npm run jobs:scan:dry-run

# Source from Google Sheet (no email)
npm run jobs:startups

# Source from Google Sheet with Playwright (JS-rendered portals)
npm run jobs:startups:playwright

# Source from Google Sheet AND send email digest
npm run jobs:startups:email

# Merge companies.md + Google Sheet
npm run jobs:all
```

---

### CLI — Cold Outreach

```bash
# Send outreach emails (reads queue from data/outreach-queue.json)
npm run outreach

# Dry run — preview without sending
npm run outreach:dry-run
```

---

### CLI — Interview Preparation

Generates per-company dossiers for companies listed in `interviews/upcoming.md`:

```bash
npm run interview-prep

# Force-regenerate all workspaces even if they already exist
npm run interview-prep:force
```

---

### CLI — Basic Discover & Apply

```bash
# Discover jobs from portals defined in config.js
npm start

# Trigger application for manually approved jobs (AUTO_APPLY must be true)
npm run apply
```

---

## Project Structure

```
ai-job-hunter/
├── config.js                   # Central config: skill groups, target titles, SMTP, MongoDB
├── package.json
├── .env                        # ← Not committed; contains secrets
├── .gitignore
│
├── public/                     # Mission Control UI (served as static files)
│   ├── index.html              # Single-page dashboard
│   ├── app.js                  # Frontend logic (tab switching, API calls, modals)
│   └── style.css               # UI styling
│
├── src/
│   ├── server.js               # Express HTTP server + REST API (25+ endpoints)
│   ├── index.js                # CLI entry: discover jobs via portals in config.js
│   ├── sources.js              # Portal crawling wrappers
│   ├── matcher.js              # Basic job score matching
│   ├── notify.js               # Email digest (Nodemailer)
│   ├── contacts.js             # HR contact enrichment stub
│   ├── storage.js              # Flat-file job storage (data/jobs.json)
│   │
│   ├── jobs/                   # Full 17-step job intelligence pipeline
│   │   ├── index.js            # Pipeline orchestrator
│   │   ├── crawler.js          # Career portal crawler (cheerio + playwright)
│   │   ├── scorer.js           # Multi-factor job match scoring engine
│   │   ├── experienceFilter.js # Filter by years-of-experience requirements
│   │   ├── locationFreshness.js# Location + posting freshness evaluation
│   │   ├── resumeMatcher.js    # Match resume variant to job role category
│   │   ├── companyParser.js    # Parse jobs/companies.md
│   │   ├── googleSheetFetcher.js # Fetch agentic AI startups from Google Sheet
│   │   ├── enricher.js         # Contact enrichment for discovered jobs
│   │   ├── outputGenerator.js  # Write JSON + Markdown reports to jobs/output/
│   │   └── emailReporter.js    # HTML email digest with attachments
│   │
│   ├── outreach/               # Cold outreach pipeline
│   │   ├── index.js            # CLI outreach entry
│   │   ├── mailer.js           # SMTP transport & send helpers
│   │   ├── template.js         # Personalized HTML + plain-text email builder
│   │   ├── contactEnricher.js  # LinkedIn/DuckDuckGo HR discovery → MongoDB
│   │   ├── sheetReader.js      # Read recipient lists from Excel
│   │   └── tracker.js          # Sent-email file tracker
│   │
│   ├── interviews/             # Interview preparation module
│   │   ├── index.js            # Generate per-company workspaces
│   │   ├── candidateProfile.js # Candidate skills, experience, links
│   │   ├── generator.js        # Dossier + question content generator
│   │   ├── matcher.js          # Match upcoming interviews to job data
│   │   ├── parser.js           # Parse interviews/upcoming.md
│   │   ├── researcher.js       # Company research scraper
│   │   ├── refresh.js          # Refresh stale workspaces
│   │   └── notifier.js         # Interview notification helper
│   │
│   └── db/
│       └── mongo.js            # MongoDB: connect, indexes, saveOutreachLog, contacts CRUD
│
├── jobs/
│   ├── companies.md            # Authoritative company list (name, salary, remote, career URL)
│   └── output/                 # ← Not committed; generated JSON + Markdown reports
│
├── interviews/
│   ├── upcoming.md             # List of scheduled interviews
│   └── <Company>/              # ← Not committed; per-company dossier workspaces
│
└── data/
    ├── outreach-queue.json     # Editable outreach recipient queue
    └── jobs.json               # Discovered jobs flat-file cache
```

---

## API Endpoints

All endpoints are served by `src/server.js` on `http://localhost:3000`.

### System & Jobs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stats` | Dashboard stats: discovered, matched, recent, queue, interview counts |
| `GET` | `/api/jobs` | List discovered job records (supports `?filter=` and `?limit=`) |
| `GET` | `/api/report` | Read the latest Markdown intelligence report |
| `GET` | `/api/action/stream` | SSE stream: real-time pipeline log events |
| `POST` | `/api/action/run-workflow` | Trigger a named workflow (e.g. `jobs-scan`, `outreach`, `interview-prep`) |
| `POST` | `/api/action/cancel-workflow` | Cancel the currently running workflow process |

### Interviews

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/interviews` | List all upcoming interview workspaces parsed from `interviews/upcoming.md` |
| `GET` | `/api/interviews/artifact` | Retrieve a specific dossier artifact file by company + filename |

### Cold Outreach

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/outreach` | List all recipients in the outreach queue |
| `POST` | `/api/outreach/recipient` | Add a new recipient to the queue |
| `PUT` | `/api/outreach/recipient/:id` | Update an existing recipient by ID |
| `DELETE` | `/api/outreach/recipient/:id` | Remove a recipient from the queue |
| `POST` | `/api/outreach/populate-startups` | Auto-populate queue from Google Sheet of agentic AI startups |
| `POST` | `/api/outreach/preview` | Generate and preview personalized email HTML for a recipient |
| `POST` | `/api/outreach/verify-attachment` | Verify the resume PDF attachment path exists on disk |
| `POST` | `/api/outreach/send-test` | Send a preview to sender's own address (not logged to MongoDB) |
| `POST` | `/api/outreach/send-single` | Dispatch a single production email; MongoDB log written only on confirmed SMTP delivery |
| `POST` | `/api/outreach/send-batch` | Dispatch the full approved batch with per-email jitter delays |

### MongoDB & Contact Enrichment

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/db/stats` | MongoDB connection status and collection document counts |
| `GET` | `/api/outreach/mongo-logs` | Retrieve sent-email audit logs from `outreach_logs` collection |
| `POST` | `/api/outreach/enrich-contact` | Discover HR/founder contacts for a single company via web search |
| `POST` | `/api/outreach/enrich-batch` | Batch-enrich contacts for all companies in the outreach queue |
| `GET` | `/api/contacts` | List all enriched company contacts stored in MongoDB |

### Applications

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/application/update` | Update the application status of a discovered job record |

---
