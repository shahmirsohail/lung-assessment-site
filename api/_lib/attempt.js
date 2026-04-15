const { normalizeEmail, sanitizeString, nowIso } = require('./config');

const VALID_MODULE_TYPES = ['lung-ultrasound', 'chest-xray'];

function buildAttemptPayload(input, { forceCompleted = null } = {}) {
  const attemptId = sanitizeString(input.attempt_id || input.attemptId || '', 120);
  const learnerEmail = normalizeEmail(input.learner_email || input.email);
  const learnerName = sanitizeString(input.learner_name || input.name || '', 120);

  if (!attemptId) throw new Error('attempt_id is required');
  if (!learnerEmail) throw new Error('learner_email/email is required');

  const rawModuleType = sanitizeString(input.module_type || '', 60) || 'lung-ultrasound';
  if (!VALID_MODULE_TYPES.includes(rawModuleType)) {
    throw new Error(`Invalid module_type: ${rawModuleType}`);
  }

  const minutesSpent = Number.isFinite(Number(input.minutes_spent)) ? Number(input.minutes_spent) : 0;
  const safeResponses = input.responses && typeof input.responses === 'object' ? input.responses : {};

  return {
    attempt_id: attemptId,
    learner_email: learnerEmail,
    learner_name: learnerName,
    module_type: rawModuleType,
    started: Boolean(input.started ?? true),
    completed: forceCompleted === null ? Boolean(input.completed) : Boolean(forceCompleted),
    started_at: input.started_at || nowIso(),
    last_opened_at: input.last_opened_at || nowIso(),
    minutes_spent: Math.max(0, Math.floor(minutesSpent)),
    responses: safeResponses,
    updated_at: nowIso(),
  };
}

module.exports = { buildAttemptPayload };
