const crypto = require('crypto');

/**
 * Generate a cryptographically secure, hard-to-guess case code.
 * Format: WG-XXXXXXXX-XXXXXXXX (16 hex chars split into two 8-char segments)
 * Entropy: 64 bits → 1.8×10^19 possible codes → practically unguessable
 */
function generateCaseCode() {
  const bytes = crypto.randomBytes(8);
  const hex = bytes.toString('hex').toUpperCase();
  return `WG-${hex.slice(0, 8)}-${hex.slice(8)}`;
}

/**
 * Valid status transitions (state machine)
 * SUBMITTED → UNDER_REVIEW
 * UNDER_REVIEW → RESOLVED | DISMISSED
 * RESOLVED → CLOSED
 * DISMISSED → CLOSED
 */
const VALID_TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['RESOLVED', 'DISMISSED'],
  RESOLVED: ['CLOSED'],
  DISMISSED: ['CLOSED'],
  CLOSED: [],
};

function isValidTransition(currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed && allowed.includes(newStatus);
}

const CATEGORIES = ['security', 'harassment', 'corruption', 'technical', 'other'];
const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'CLOSED'];

module.exports = {
  generateCaseCode,
  isValidTransition,
  VALID_TRANSITIONS,
  CATEGORIES,
  STATUSES,
};
