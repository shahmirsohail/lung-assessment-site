const { json, readJsonBody } = require('../_lib/config');
const { buildAttemptPayload } = require('../_lib/attempt');
const { upsertAttempt, getAttemptById } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(req);
    const incoming = buildAttemptPayload(body);
    const existing = await getAttemptById(incoming.attempt_id);

    const merged = {
      ...existing,
      ...incoming,
      responses: { ...(existing?.responses || {}), ...(incoming.responses || {}) },
      completed: Boolean(existing?.completed || incoming.completed),
    };

    await upsertAttempt(merged);
    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message });
  }
};
