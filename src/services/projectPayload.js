// The read-only renderer's only source of truth. A project's payload is a JSONB
// object; earlier builds persisted it through JSON.stringify, so a read can also
// come back as a JSON string. Accept either form and normalize it, and refuse to
// pretend anything else is a design: a row with an empty/stub/malformed payload
// returns `null`, and the sheet surfaces an honest error instead of dressing the
// paper's sample up as someone's real words.
export function parseProjectPayload(raw) {
  let payload
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    payload = null
  }
  if (!payload) return null

  // A real closed letter must carry the spoken body. An empty `{}` or a stub
  // never survives submission, so anything without it is not a design.
  if (typeof payload.body !== 'string') return null

  const photos = Array.isArray(payload.photos) ? payload.photos.slice(0, 3) : []
  while (photos.length < 3) photos.push(null)

  return {
    language: payload.language === 'ar' ? 'ar' : 'en',
    greeting: typeof payload.greeting === 'string' ? payload.greeting : '',
    closing: typeof payload.closing === 'string' ? payload.closing : '',
    senderName: typeof payload.senderName === 'string' ? payload.senderName : '',
    body: payload.body,
    photos,
    audio: payload.audio && typeof payload.audio === 'object' ? payload.audio : null,
    passwordSet: Boolean(payload.passwordSet),
  }
}