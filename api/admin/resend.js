const { json, readJsonBody, getEnv } = require('../_lib/config');
const { getAttemptById, insertEmailLog } = require('../_lib/supabase');
const { sendResendEmail, buildSummaryHtml } = require('../_lib/email');

function authorized(req, body) {
  const token = req.headers['x-admin-token'] || body?.token;
  const expected = getEnv('ADMIN_DASHBOARD_TOKEN');
  return token && token === expected;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(req);
    if (!authorized(req, body)) return json(res, 401, { ok: false, error: 'Unauthorized' });

    const attemptId = String(body.attempt_id || '').trim();
    if (!attemptId) return json(res, 400, { ok: false, error: 'attempt_id is required' });

    const attempt = await getAttemptById(attemptId);
    if (!attempt) return json(res, 404, { ok: false, error: 'Attempt not found' });

    const target = body.target === 'admin' ? getEnv('ADMIN_RESULTS_EMAIL') : attempt.learner_email;
    const template = body.target === 'admin' ? 'internal_summary_resend' : 'learner_summary_resend';

    const sent = await sendResendEmail({
      to: [target],
      subject: `Assessment results resend: ${attempt.learner_name || attempt.learner_email}`,
      html: buildSummaryHtml(attempt),
    });

    await insertEmailLog({
      attempt_id: attempt.attempt_id,
      recipient: target,
      template,
      provider_id: sent?.id || '',
      status: 'sent',
      error: '',
    });

    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message });
  }
};
