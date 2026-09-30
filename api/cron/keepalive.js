const { json, getEnv } = require('../_lib/config');
const { pingDatabase } = require('../_lib/supabase');
const { sendEmail } = require('../_lib/email');

// Daily Vercel cron (see vercel.json). Supabase pauses free-tier projects
// after ~7 days without database activity; a tiny read keeps it awake.
// On failure, emails ALERT_EMAIL (or ADMIN_RESULTS_EMAIL) so it isn't silent.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendFailureAlert(message, isTest = false) {
  const to = getEnv('ALERT_EMAIL', false) || getEnv('ADMIN_RESULTS_EMAIL', false);
  if (!to) {
    console.error('[keepalive] No ALERT_EMAIL or ADMIN_RESULTS_EMAIL set; alert not sent');
    return null;
  }
  await sendEmail({
    to: [to],
    subject: (isTest ? '[TEST] ' : '') + 'Assessment site: database keep-alive FAILED',
    html: `
      <p>The daily Supabase keep-alive check failed at ${new Date().toISOString()}.</p>
      <p><strong>Error:</strong> ${escapeHtml(message)}</p>
      <p>Learners may be unable to start assessments. Check the Supabase dashboard
      (restore the project if it is paused) and the SUPABASE_URL setting in Vercel.</p>
    `,
  });
  return to;
}

module.exports = async (req, res) => {
  // Manual test: /api/cron/keepalive?test_alert=1&token=<ADMIN_DASHBOARD_TOKEN>
  if (req.query?.test_alert) {
    const token = req.headers['x-admin-token'] || req.query?.token;
    const expected = getEnv('ADMIN_DASHBOARD_TOKEN', false);
    if (!expected || token !== expected) return json(res, 401, { ok: false, error: 'Unauthorized' });
    const provider = process.env.BREVO_API_KEY ? 'brevo' : 'sendgrid (BREVO_API_KEY not set in this deployment)';
    try {
      const to = await sendFailureAlert('TEST ALERT ONLY. Nothing is wrong; this confirms alert emails are delivered.', true);
      if (!to) return json(res, 500, { ok: false, provider, error: 'No ALERT_EMAIL or ADMIN_RESULTS_EMAIL set' });
      return json(res, 200, { ok: true, provider, test_alert_sent_to: to });
    } catch (err) {
      return json(res, 500, { ok: false, provider, error: err.message });
    }
  }

  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    await pingDatabase();
    return json(res, 200, { ok: true, pinged_at: new Date().toISOString() });
  } catch (err) {
    console.error('[keepalive] Supabase ping failed:', err.message);
    try {
      await sendFailureAlert(err.message);
    } catch (alertErr) {
      console.error('[keepalive] Failure alert email failed:', alertErr.message);
    }
    return json(res, 500, { ok: false, error: err.message });
  }
};
