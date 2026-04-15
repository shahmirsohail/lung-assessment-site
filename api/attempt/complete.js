const { json, readJsonBody, getEnv, nowIso } = require('../_lib/config');
const { buildAttemptPayload } = require('../_lib/attempt');
const { upsertAttempt, getAttemptById, insertEmailLog } = require('../_lib/supabase');
const { sendEmail, buildSummaryHtml, getModuleLabel } = require('../_lib/email');

async function safeInsertEmailLog(log) {
  try { await insertEmailLog(log); } catch { /* never let logging failures block submission */ }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(req);
    const incoming = buildAttemptPayload(body, { forceCompleted: true });
    const existing = await getAttemptById(incoming.attempt_id).catch(() => null);

    const merged = {
      ...existing,
      ...incoming,
      responses: { ...(existing?.responses || {}), ...(incoming.responses || {}) },
      completed: true,
      completed_at: nowIso(),
    };

    const summaryHtml = buildSummaryHtml(merged);
    const moduleLabel = getModuleLabel(merged.module_type);
    const adminEmail = getEnv('ADMIN_RESULTS_EMAIL', false);

    if (!existing?.completion_email_sent_at) {
      try {
        const learnerResult = await sendEmail({
          to: [merged.learner_email],
          subject: `Your ${moduleLabel} results`,
          html: summaryHtml,
        });
        await safeInsertEmailLog({
          attempt_id: merged.attempt_id,
          recipient: merged.learner_email,
          template: 'learner_summary',
          provider_id: learnerResult?.id || '',
          status: 'sent',
          error: '',
        });
        merged.completion_email_sent_at = nowIso();
      } catch (emailErr) {
        await safeInsertEmailLog({
          attempt_id: merged.attempt_id,
          recipient: merged.learner_email,
          template: 'learner_summary',
          provider_id: '',
          status: 'failed',
          error: String(emailErr.message || emailErr),
        });
      }
    }

    if (adminEmail && !existing?.admin_email_sent_at) {
      try {
        const adminResult = await sendEmail({
          to: [adminEmail],
          subject: `${moduleLabel} completed: ${merged.learner_name || merged.learner_email}`,
          html: summaryHtml,
        });
        await safeInsertEmailLog({
          attempt_id: merged.attempt_id,
          recipient: adminEmail,
          template: 'internal_summary',
          provider_id: adminResult?.id || '',
          status: 'sent',
          error: '',
        });
        merged.admin_email_sent_at = nowIso();
      } catch (emailErr) {
        await safeInsertEmailLog({
          attempt_id: merged.attempt_id,
          recipient: adminEmail,
          template: 'internal_summary',
          provider_id: '',
          status: 'failed',
          error: String(emailErr.message || emailErr),
        });
      }
    }

    await upsertAttempt(merged);
    return json(res, 200, { ok: true, attempt_id: merged.attempt_id, attempt: merged });
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message });
  }
};
