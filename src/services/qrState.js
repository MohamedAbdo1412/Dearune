// One QR answer, in the browser.
//
// The database owns the truth: `public.order_qr_state(...)` returns the same
// four facts for `ops_orders`, `operations_units` and the worker reads. This
// module is the JavaScript mirror used when a screen must answer the question
// BEFORE a row exists (the print pre-flight, the Create Dearune receipt) and
// when a row already carries the database's answer.
//
// The four questions, in the order the workshop asks them:
//
//   destination  Is there a link to put in the QR at all? (public id + token)
//   activated    Is the letter switched on?
//   openable     Will scanning it open the letter right now?
//   blockedReason  If not openable, which of the three is missing.
//
// "Printed" is deliberately absent: printing happens in the browser and a
// stored `printed` flag is exactly how the old system lied about paper that had
// never been produced.

export const QR_BLOCKED_LABELS = {
  missing_destination: 'No public link yet — the QR would point nowhere.',
  not_activated: 'The letter is switched off — the QR will not open it.',
  password_protected: 'The letter is password-protected — the public reader will not open it.',
}

export const QR_BLOCKED_FIXES = {
  missing_destination: 'Open the letter and publish it to create its public link.',
  not_activated: 'Switch the letter on before printing.',
  password_protected: 'Remove the letter password if the printed QR must open it.',
}

const filled = (value) => String(value ?? '').trim() !== ''

/** The one calculation. Mirrors `public.order_qr_state`. */
export function qrState({ publicId, publicToken, messageActive, passwordSet } = {}) {
  const destination = filled(publicId) && filled(publicToken)
  const activated = Boolean(messageActive)
  const protectedLetter = Boolean(passwordSet)
  const openable = destination && activated && !protectedLetter

  let blockedReason = null
  if (!destination) blockedReason = 'missing_destination'
  else if (!activated) blockedReason = 'not_activated'
  else if (protectedLetter) blockedReason = 'password_protected'

  return { destination, activated, openable, blockedReason }
}

/**
 * The QR state of a row that may already carry the database's answer.
 * When the four columns are present they are used verbatim — the browser never
 * re-decides what the database already decided.
 */
export function qrStateOf(row) {
  if (row && typeof row.qr_openable === 'boolean' && row.qr_destination !== undefined) {
    return {
      destination: Boolean(row.qr_destination),
      activated: Boolean(row.qr_activated),
      openable: Boolean(row.qr_openable),
      blockedReason: row.qr_blocked_reason ?? null,
    }
  }
  return qrState({
    publicId: row?.public_id ?? row?.publicId,
    publicToken: row?.public_token ?? row?.publicToken,
    messageActive: row?.message_active ?? row?.messageActive,
    passwordSet: row?.message_protected ?? row?.messageProtected,
  })
}

/** Why the QR is blocked, in a sentence, or null when it is fine. */
export function qrBlockedMessage(state) {
  return state?.blockedReason ? QR_BLOCKED_LABELS[state.blockedReason] ?? null : null
}
