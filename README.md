# Lung Ultrasound Assessment website

This project wraps a Storyline package and now includes:

- learner launch page (`index.html`)
- assessment player (`course.html`)
- internal results dashboard (`admin.html`)
- API endpoints (`/api/*`) for saving attempts to an internal database and sending completion emails.

## Features

- Saves attempt progress and completion to an internal database (Supabase Postgres via REST).
- Captures quiz variable responses (`CurrentQuiz_*`) from Storyline.
- Sends completion result emails to:
  - the learner who completed the assessment,
  - an internal results mailbox.
- Provides internal admin dashboard to view attempts and resend emails.

## Storyline response capture (stable user vars)

To make response export deterministic, create explicit Storyline variables and populate them on submit actions:

- `CapturedResponsesJson` (Text variable)
- Optional status variables such as `LastAnsweredCaseId`, `LastAnsweredAt`, `AssessmentScore`, etc.

Recommended JavaScript trigger pattern in Storyline (on question/case submit, or a centralized submit-all trigger):

```js
const player = GetPlayer();

const payload = {
  caseId: player.GetVar('CurrentCaseId') || null,
  questionId: player.GetVar('CurrentQuestionId') || null,
  selectedAnswer: player.GetVar('CurrentSelection') || null,
  isCorrect: player.GetVar('CurrentIsCorrect') || null,
  answeredAt: new Date().toISOString()
};

player.SetVar('CapturedResponsesJson', JSON.stringify(payload));
player.SetVar('LastAnsweredCaseId', payload.caseId || '');
player.SetVar('LastAnsweredAt', payload.answeredAt);
```

`course.html` now reads `CapturedResponsesJson` first, safely parses it, merges optional status variables, and only then applies legacy `CurrentQuiz_*` capture as a non-blocking fallback.

## Environment variables

Copy `.env.example` and populate in your Vercel project settings:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ADMIN_RESULTS_EMAIL`
- `ADMIN_DASHBOARD_TOKEN`

## Database setup (Supabase)

1. Create a free Supabase project.
2. Open SQL editor and run `docs/supabase-schema.sql`.
3. Confirm `attempts` and `email_dispatch_log` tables exist.

## Deployment

1. Push this repo to GitHub.
2. Import project into Vercel (free plan works for low traffic).
3. Configure environment variables in Vercel.
4. Redeploy.

## How learners use it

1. Open `index.html`.
2. Enter learner name/email.
3. Click **Launch assessment**.
4. Complete assessment and click **Submit & send results** in the header.

## How admins view results

1. Open `admin.html`.
2. Enter `ADMIN_DASHBOARD_TOKEN`.
3. Load attempts, filter by learner email, or resend learner/internal email.

## Notes

- Local browser storage is still kept as a backup cache.
- Server-side DB is now the source of truth.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code.

## Troubleshooting

If clicking **Submit & send results** does not update Supabase or send email:

1. Open browser dev tools and confirm `POST /api/attempt/complete` returns HTTP 200.
2. Check Vercel Function logs for the failing endpoint.
3. Verify all env vars are set exactly as listed in `.env.example`.
4. If your Supabase service key is a newer non-JWT key format, set `SUPABASE_AUTH_BEARER` in Vercel to a JWT bearer token compatible with PostgREST.
5. Confirm Resend sender (`RESEND_FROM_EMAIL`) is valid for your account/domain.
