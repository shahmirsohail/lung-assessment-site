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
6. If you see `attempt_id is required`, return to `index.html`, save learner details, and relaunch assessment so a fresh attempt ID is created.
7. If console shows old errors like `captureDebug` / `setCaptureError` undefined, force-refresh and confirm console prints `Loaded course.html version 2026-04-06-course-hotfix-1`.
