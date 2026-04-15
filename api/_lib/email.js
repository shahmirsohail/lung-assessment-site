const { getEnv } = require('./config');

async function sendEmail({ to, subject, html }) {
  const key = getEnv('SENDGRID_API_KEY');
  const from = getEnv('SENDGRID_FROM_EMAIL');

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: to.map(email => ({ email })) }],
      from: { email: from },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`SendGrid error (${res.status}): ${JSON.stringify(body)}`);
  }

  const messageId = res.headers.get('x-message-id') || '';
  return { id: messageId };
}

const MODULE_LABELS = {
  'lung-ultrasound': 'Lung Ultrasound Assessment',
  'chest-xray': 'Chest X-ray Assessment',
};

function getModuleLabel(moduleType) {
  return MODULE_LABELS[moduleType] || 'Assessment';
}

function buildSummaryHtml(attempt) {
  const title = getModuleLabel(attempt.module_type) + ' Results';
  const rows = Object.entries(attempt.responses || {})
    .map(([k, v]) => `<tr><td style="padding:6px;border:1px solid #ddd">${k}</td><td style="padding:6px;border:1px solid #ddd">${String(v)}</td></tr>`)
    .join('');

  return `
    <h2>${title}</h2>
    <p><strong>Name:</strong> ${attempt.learner_name || ''}</p>
    <p><strong>Email:</strong> ${attempt.learner_email || ''}</p>
    <p><strong>Completed:</strong> ${attempt.completed ? 'Yes' : 'No'}</p>
    <p><strong>Minutes spent:</strong> ${attempt.minutes_spent || 0}</p>
    <p><strong>Last updated:</strong> ${attempt.last_opened_at || ''}</p>
    <h3>Captured responses</h3>
    <table style="border-collapse:collapse;border:1px solid #ddd">
      <tr><th style="padding:6px;border:1px solid #ddd">Question Variable</th><th style="padding:6px;border:1px solid #ddd">Value</th></tr>
      ${rows || '<tr><td colspan="2" style="padding:6px;border:1px solid #ddd">No responses captured</td></tr>'}
    </table>
  `;
}

module.exports = {
  sendEmail,
  buildSummaryHtml,
  getModuleLabel,
};
