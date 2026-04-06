const { json, getEnv, normalizeEmail } = require('../_lib/config');
const { listAttempts } = require('../_lib/supabase');

function authorized(req) {
  const token = req.headers['x-admin-token'] || req.query?.token;
  const expected = getEnv('ADMIN_DASHBOARD_TOKEN');
  return token && token === expected;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    if (!authorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });

    const limit = Math.min(Number(req.query?.limit || 100), 500);
    const offset = Math.max(Number(req.query?.offset || 0), 0);
    const email = normalizeEmail(req.query?.email || '');

    const rows = await listAttempts({ limit, offset, email });
    return json(res, 200, { ok: true, rows });
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message });
  }
};
