# Lung Ultrasound Assessment Site — CLAUDE.md

## Project overview

A web-based assessment platform where clinicians complete a Lung Ultrasound (LUS) quiz built in Articulate Storyline 360. Results are stored in Supabase and emailed to the learner and an admin via SendGrid. Deployed on Vercel.

## Architecture

```
index.html          — Learner landing page (enter name/email, launch, view records, download CSV)
course.html         — Assessment shell (hosts Storyline iframe, captures SCORM data, syncs to API)
admin.html          — Admin dashboard (view all attempts)
module/             — Articulate Storyline 360 HTML5 + SCORM 1.2 export
api/                — Vercel serverless functions (Node.js)
```

### API endpoints

| Route | Purpose |
|---|---|
| `POST /api/attempt/start` | Creates attempt in Supabase, returns `attempt_id` |
| `POST /api/attempt/progress` | Upserts in-progress data (called every 30 s) |
| `POST /api/attempt/complete` | Marks completed, sends emails, merges responses |
| `GET /api/admin/attempts` | Lists all attempts (admin) |
| `POST /api/admin/resend` | Re-sends result emails for an attempt |

### Data flow

1. `index.html` calls `/api/attempt/start` → gets `attempt_id`, saves to `localStorage` (`lungAssessmentLocalUser`)
2. `course.html` opens in new tab, loads Storyline in iframe
3. Storyline SCORM driver calls `window.parent.API.LMSSetValue(...)` as questions are answered
4. `course.html` captures all calls in `scormData` object
5. Every 30 s (and on submit) `course.html` calls `/api/attempt/progress` or `/api/attempt/complete`
6. `complete` endpoint merges responses, emails learner + admin, marks `completed: true`

## Critical: How Storyline SCORM capture works

This was the hardest part. Key facts:

### The module has TWO entry points

| File | Mode | `lmsPresent` | SCORM called? |
|---|---|---|---|
| `module/story.html` | Standalone/web | `false` | ❌ Never |
| `module/index_lms.html` | LMS/SCORM | `true` | ✅ Yes |

**The iframe in `course.html` MUST use `module/index_lms.html`**, not `story.html`. Using `story.html` means Storyline never calls any SCORM functions, so no quiz data is captured.

### How the SCORM channel works

1. `course.html` defines `window.API` (SCORM 1.2 stub) before the iframe loads:
   ```javascript
   const scormData = {};
   window.API = {
     LMSInitialize: () => 'true',
     LMSSetValue: (el, val) => { scormData[el] = val; return 'true'; },
     LMSGetValue: (el) => scormData[el] || '',
     // ...
   };
   ```
2. `index_lms.html` loads `lms/scormdriver.js` and sets `lmsPresent: true`
3. On load, `scormdriver.js` calls `SCORM_ScanParentsForApi(window.parent)` which finds `window.parent.API` (i.e., `course.html`'s `window.API`)
4. As the student answers each question, Storyline calls:
   - `LMSSetValue("cmi.interactions._count", N)`
   - `LMSSetValue("cmi.interactions.N.id", quizId)`
   - `LMSSetValue("cmi.interactions.N.student_response", "Selected Answer Text")`

### Quiz variable IDs

The SCORM interaction IDs (`cmi.interactions.N.id`) are **bare quiz-variable IDs** like `6SU5leVeQsi`, NOT the slide IDs. They match the `CurrentQuiz_<ID>` player variable names visible in the individual slide JS files (e.g. `module/html5/data/js/5dJy4aYxSDa.js` contains `CurrentQuiz_65gar2uXnMJ`).

The `CASE_SLIDE_MAP` in `course.html` maps these IDs to human-readable labels:
```javascript
"6SU5leVeQsi": { c: "Case 1", q: "Primary Pathology" }
```

`transformResponseKeys()` handles both bare IDs and `CurrentQuiz_<ID>` prefixed forms.

### What does NOT work (and why)

- `player.GetVar('CurrentQuiz_*')` — these are internal Storyline quiz-engine variables; they are **not accessible** via the external `GetVar()` API
- `player.GetVar('CapturedResponsesJson')` — this variable is never written to by any slide trigger in this module
- `window.API` on `story.html` — `story.html` has `lmsPresent: false` hardcoded; it never calls the SCORM API regardless of whether `window.API` is present

## Storyline module structure

```
module/
  index_lms.html          ← USE THIS as iframe src (lmsPresent: true, loads scormdriver.js)
  story.html              ← Standalone mode only (lmsPresent: false)
  lms/
    scormdriver.js        ← SCORM 1.2 + 2004 driver; scans window.parent for window.API
    bootstrapper.min.js   ← LMS-aware bootstrapper
    frame.desktop.min.js
    slides.min.js
  html5/
    data/js/              ← Per-slide JS files (e.g. 5dJy4aYxSDa.js = Case 1 Sec. Pathology)
      data.js             ← All player variable definitions (CurrentQuiz_*, Slider*, etc.)
    lib/scripts/
      bootstrapper.min.js ← Web/standalone bootstrapper (no SCORM calls)
      frame.desktop.min.js
      slides.min.js
```

To find which quiz-variable ID belongs to a question slide, search the slide's JS file for `CurrentQuiz_`:
```bash
grep -o 'CurrentQuiz_[A-Za-z0-9]*' module/html5/data/js/<slideId>.js
```

## Supabase schema (table: `attempts`)

Key columns:
- `attempt_id` (text, PK via upsert)
- `learner_email`, `learner_name`
- `started` (bool), `completed` (bool)
- `started_at`, `last_opened_at`, `completed_at`, `updated_at` (timestamps)
- `minutes_spent` (int)
- `responses` (jsonb) — keys like `"Case 1 - Primary Pathology"`, values are the selected answer text
- `completion_email_sent_at`, `admin_email_sent_at` — prevents duplicate emails on retry

Also: `email_dispatch_log` table for email audit trail.

## Environment variables (set in Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | Yes | PostgREST base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `SENDGRID_API_KEY` | Yes | Email sending |
| `SENDGRID_FROM_EMAIL` | Yes | Verified sender address |
| `ADMIN_RESULTS_EMAIL` | No | If set, sends copy of results to this address |

## localStorage keys (client-side)

| Key | Contents |
|---|---|
| `lungAssessmentLocalUser` | `{ name, email, learner_id, attempt_id }` |
| `lungAssessmentLocalRecords` | Array of attempt records (local cache) |
| `lungAssessmentRetryQueue` | Failed sync payloads, retried on focus/interval |

## CSV export

`index.html` exports records to CSV. Response columns are dynamically derived from all records' `responses` keys, filtered to exclude `Slider\d+` noise variables, and sorted alphabetically. Expected columns: `"Case N - Primary Pathology"`, `"Case N - Secondary Pathology"`, `"Case N - Normal or Abnormal"`, `"Case N - Confidence Level"`.

## Slider variables

Storyline defines ~131 `Slider1`–`Slider131` variables, all defaulting to `50`. These appear in `module/html5/data/js/data.js`. They are noise — filter them out everywhere with `/^Slider\d+$/`.

## Retry / offline resilience

`course.html` syncs on:
- Every 30 seconds (`setInterval`)
- Page unload (`beforeunload`)
- Window focus (`focus`)

Failed syncs go into `lungAssessmentRetryQueue` (localStorage) and are flushed every 45 s and on focus. The blocking error dialog on submit (`#blockingError`) prevents redirect until the server confirms completion.

## Deployment

- Hosted on Vercel (auto-deploys from `main`)
- `api/` directory = serverless functions
- No build step required — static HTML + JS served directly
