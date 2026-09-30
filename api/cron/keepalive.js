const { json } = require('../_lib/config');
const { pingDatabase } = require('../_lib/supabase');

// Daily Vercel cron (see vercel.json). Supabase pauses free-tier projects
// after ~7 days without database activity; a tiny read keeps it awake.
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    await pingDatabase();
    return json(res, 200, { ok: true, pinged_at: new Date().toISOString() });
  } catch (err) {
    console.error('[keepalive] Supabase ping failed:', err.message);
    return json(res, 500, { ok: false, error: err.message });
  }
};
