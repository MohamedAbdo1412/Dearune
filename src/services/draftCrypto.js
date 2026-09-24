// Draft encryption core (Web Crypto, AES-GCM). One per-designer key, held in
// memory only, derived from the account's draft-unlock secret the server hands
// to the authenticated designer. The secret itself is never written to this
// device; the derived key never is either — so a designer who logs out (or a
// DIFFERENT designer who logs in on the same machine) cannot decrypt these
// drafts. Nothing in this module touches storage; callers decide where the
// ciphertext lives.

let cachedDesignerId = null
let cachedKey = null

function utf8(value) {
  return new TextEncoder().encode(value)
}

// Deterministic per-account key: SHA-256(salt | designerId | secret) → 32
// bytes → AES-GCM import. The salt pins the derivation to this application so
// the digest cannot be replayed elsewhere.
async function deriveKey(designerId, draftSecret) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    utf8(`dearune-draft-v1\n${designerId}\n${draftSecret}`)
  )
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

// Unlock this session for one designer. Returns false when the material is
// missing; callers decide whether that means "use a fresh draft" or "prompt
// for login". Only one identity is unlocked per session: unlocking for another
// designer inherently replaces the key, so cross-account decryption is
// impossible.
export async function unlockDraftKey(designerId, draftSecret) {
  if (!designerId || !draftSecret) return false
  const key = await deriveKey(designerId, draftSecret)
  cachedKey = key
  cachedDesignerId = designerId
  return true
}

// Forget the key on logout / leave. Subsequent reads return null; nothing is
// written to plaintext at any point.
export function lockDraftKey() {
  cachedKey = null
  cachedDesignerId = null
}

export function draftUnlockedFor() {
  return cachedDesignerId
}

export function isDraftUnlocked() {
  return Boolean(cachedKey)
}

function randomIv() {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  return iv
}

function toBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- Blob/byte level --------------------------------------------------------

export async function encryptBytes(plainBytes) {
  if (!cachedKey) throw new Error('Draft key is not unlocked')
  const iv = randomIv()
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cachedKey, plainBytes)
  return { iv, ct }
}

export async function decryptBytes({ iv, ct }) {
  if (!cachedKey) throw new Error('Draft key is not unlocked')
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cachedKey, ct)
  } catch {
    return null
  }
}

// --- Envelope level (for JSON drafts) ----------------------------------------

// Envelope: { v, iv, ct } with base64 payload so it serialises cleanly into
// localStorage. A nonce is added per write (never reused), so identical
// letters produce different ciphertext every run.
export async function sealJson(obj) {
  if (!cachedKey) return null
  const bytes = utf8(JSON.stringify(obj))
  const { iv, ct } = await encryptBytes(bytes)
  return { v: 1, iv: toBase64(iv), ct: toBase64(ct) }
}

export async function unsealJson(env) {
  if (!cachedKey || !env || typeof env !== 'object') return null
  if (env.v !== 1) return null
  try {
    const plain = await decryptBytes({ iv: fromBase64(env.iv), ct: fromBase64(env.ct) })
    if (!plain) return null
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    return null
  }
}