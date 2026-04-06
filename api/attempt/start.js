const { json, readJsonBody } = require('../_lib/config');
const { buildAttemptPayload } = require('../_lib/attempt');
const { upsertAttempt } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(req);
    const attempt = buildAttemptPayload({ ...body, completed: false });
    await upsertAttempt(attempt);
    return json(res, 200, { ok: true, attempt_id: attempt.attempt_id });
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message });
  }
};
