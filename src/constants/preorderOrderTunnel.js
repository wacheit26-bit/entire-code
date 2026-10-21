/** Mongoose Order schema caps userNotes (see server Order.js). */
export const SERVER_ORDER_USER_NOTES_MAX = 500;

/**
 * Legacy rows: preorders were once tunneled as `offer` with this prefix in userNotes.
 * Admin UI may still classify these as preorders.
 */
export const PREORDER_TUNNEL_USER_NOTES_PREFIX = '[PREORDER]';

export function isTunneledPreorderOrder(order) {
  const notes = String(order?.userNotes ?? order?.user_notes ?? '').trimStart();
  return notes.startsWith(PREORDER_TUNNEL_USER_NOTES_PREFIX);
}

/** Trim to server max length so Mongoose validation does not reject the whole order. */
export function sanitizePreorderUserNotes(raw, maxLen = SERVER_ORDER_USER_NOTES_MAX) {
  return String(raw || '')
    .trim()
    .slice(0, maxLen);
}
