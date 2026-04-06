const { json, readJsonBody } = require('../_lib/config');
const { buildAttemptPayload } = require('../_lib/attempt');
const { upsertAttempt, getAttemptById, getLatestAttemptByEmail } = require('../_lib/supabase');

function fallbackAttemptId() {
  return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(req);
    if (!body.attempt_id && !body.attemptId && body.email) {
      const latest = await getLatestAttemptByEmail(body.email);
      body.attempt_id = latest?.attempt_id || fallbackAttemptId();
    }
    const incoming = buildAttemptPayload(body);
    const existing = await getAttemptById(incoming.attempt_id);

    const merged = {
      ...existing,
      ...incoming,
      responses: { ...(existing?.responses || {}), ...(incoming.responses || {}) },
      completed: Boolean(existing?.completed || incoming.completed),
    };

    await upsertAttempt(merged);
    return json(res, 200, { ok: true, attempt_id: merged.attempt_id });
  } catch (err) {
    console.error('POST /api/attempt/progress failed', err);
    return json(res, 400, { ok: false, error: err.message });
  }
};
