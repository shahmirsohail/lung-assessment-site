const { getEnv } = require('./config');

function supabaseBase() {
  const url = getEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const explicitBearer = process.env.SUPABASE_AUTH_BEARER || '';
  return { url, key, explicitBearer };
}

async function supabaseFetch(path, opts = {}) {
  const { url, key, explicitBearer } = supabaseBase();
  const isJwtLike = key.split('.').length === 3;
  const authBearer = explicitBearer || (isJwtLike ? key : '');
  const authHeader = authBearer ? { Authorization: `Bearer ${authBearer}` } : {};
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      ...authHeader,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function upsertAttempt(attempt) {
  await supabaseFetch('attempts?on_conflict=attempt_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(attempt),
  });
}

async function getAttemptById(attemptId) {
  const rows = await supabaseFetch(`attempts?attempt_id=eq.${encodeURIComponent(attemptId)}&select=*`);
  return rows?.[0] || null;
}

async function listAttempts({ limit = 100, offset = 0, email = '' }) {
  const filters = [`select=*`, `order=updated_at.desc`, `limit=${limit}`, `offset=${offset}`];
  if (email) filters.push(`learner_email=eq.${encodeURIComponent(email.toLowerCase())}`);
  return supabaseFetch(`attempts?${filters.join('&')}`);
}

async function getLatestAttemptByEmail(email) {
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!safeEmail) return null;
  const rows = await supabaseFetch(
    `attempts?learner_email=eq.${encodeURIComponent(safeEmail)}&order=updated_at.desc&limit=1&select=*`
  );
  return rows?.[0] || null;
}

async function insertEmailLog(log) {
  try {
    await supabaseFetch('email_dispatch_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(log),
    });
    return true;
  } catch (err) {
    // Logging should never break the core learner flow.
    console.error('Failed to insert email_dispatch_log row', err);
    return false;
  }
}

module.exports = {
  upsertAttempt,
  getAttemptById,
  getLatestAttemptByEmail,
  listAttempts,
  insertEmailLog,
};
