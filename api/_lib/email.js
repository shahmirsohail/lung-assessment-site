const { getEnv } = require('./config');

async function sendResendEmail({ to, subject, html }) {
  const key = getEnv('RESEND_API_KEY');
  const from = getEnv('RESEND_FROM_EMAIL');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend error (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function buildSummaryHtml(attempt) {
  const rows = Object.entries(attempt.responses || {})
    .map(([k, v]) => `<tr><td style=\"padding:6px;border:1px solid #ddd\">${k}</td><td style=\"padding:6px;border:1px solid #ddd\">${String(v)}</td></tr>`)
    .join('');

  return `
    <h2>Lung Ultrasound Assessment Results</h2>
    <p><strong>Name:</strong> ${attempt.learner_name || ''}</p>
    <p><strong>Email:</strong> ${attempt.learner_email || ''}</p>
    <p><strong>Completed:</strong> ${attempt.completed ? 'Yes' : 'No'}</p>
    <p><strong>Minutes spent:</strong> ${attempt.minutes_spent || 0}</p>
    <p><strong>Last updated:</strong> ${attempt.last_opened_at || ''}</p>
    <h3>Captured responses</h3>
    <table style=\"border-collapse:collapse;border:1px solid #ddd\">
      <tr><th style=\"padding:6px;border:1px solid #ddd\">Question Variable</th><th style=\"padding:6px;border:1px solid #ddd\">Value</th></tr>
      ${rows || '<tr><td colspan=\"2\" style=\"padding:6px;border:1px solid #ddd\">No responses captured</td></tr>'}
    </table>
  `;
}

module.exports = {
  sendResendEmail,
  buildSummaryHtml,
};
