const { getEnv } = require('./config');

function supabaseBase() {
  const url = getEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const bearer = process.env.SUPABASE_AUTH_BEARER || key;
  return { url, key, bearer };
}

async function supabaseFetch(path, opts = {}) {
  const { url, key, bearer } = supabaseBase();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }

  if (res.status === 204 || res.status === 201) return null;
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

async function insertEmailLog(log) {
  await supabaseFetch('email_dispatch_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(log),
  });
}

module.exports = {
  upsertAttempt,
  getAttemptById,
  listAttempts,
  insertEmailLog,
};
