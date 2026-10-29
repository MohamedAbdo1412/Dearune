import { invokeFunction } from '@/lib/supabase'

// The `external-link` paper's one field: the destination the printed QR opens.
//
// The QR itself never carries this URL. It keeps pointing at Dearune's own
// resolver (`/message/:publicId?token=…`), which looks the saved destination up
// on the project — so the printed code can never become a scanner for an
// arbitrary link, and every other paper is untouched.
//
// This module holds the CLIENT-side format rules (instant inline errors) and
// the thin call to the `link-check` edge function, which is the authority on
// both format and reachability. The server repeats the same rules in
// `supabase/functions/_shared/link-check.ts` and never trusts this file.

export const EXTERNAL_URL_MAX_LENGTH = 2048

// A rejected destination, in the vocabulary both the form and the server use.
export const EXTERNAL_URL_REASONS = {
  empty: 'empty',
  malformed: 'malformed',
  scheme: 'scheme',
  credentials: 'credentials',
  'blocked-host': 'blocked-host',
  'too-long': 'too-long',
}

const MESSAGES = {
  empty: {
    en: 'Enter the link your QR code should open.',
    ar: 'أدخل الرابط الذي تريد أن يفتحه رمز الاستجابة.',
  },
  malformed: {
    en: 'That does not look like a full web address. Try https://example.com/my-page',
    ar: 'لا يبدو هذا عنواناً كاملاً. جرّب https://example.com/my-page',
  },
  scheme: {
    en: 'Only http:// and https:// links can be printed. Other kinds of links are not accepted.',
    ar: 'تُقبل روابط http:// و https:// فقط. أنواع الروابط الأخرى غير مقبولة.',
  },
  credentials: {
    en: 'Links with a username or password inside them cannot be printed.',
    ar: 'لا يمكن طباعة رابط يحمل اسم مستخدم أو كلمة مرور داخله.',
  },
  'blocked-host': {
    en: 'This address is private or internal, so a printed code could never reach it.',
    ar: 'هذا العنوان خاص أو داخلي، ولن يستطيع رمز مطبوع الوصول إليه.',
  },
  'too-long': {
    en: 'That link is too long to be printed.',
    ar: 'هذا الرابط طويل جداً لِيُطبع.',
  },
}

export function externalUrlMessage(reason, lang = 'en') {
  const entry = MESSAGES[reason] ?? MESSAGES.malformed
  return lang === 'ar' ? entry.ar : entry.en
}

// Absolute http(s) only, whitespace trimmed. Deliberately strict: the value is
// printed on a physical object, so a typo or an unsupported scheme has to be
// caught here rather than by a recipient's phone.
export function normalizeExternalUrl(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: EXTERNAL_URL_REASONS.empty }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, reason: EXTERNAL_URL_REASONS.empty }
  if (trimmed.length > EXTERNAL_URL_MAX_LENGTH) return { ok: false, reason: EXTERNAL_URL_REASONS['too-long'] }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, reason: EXTERNAL_URL_REASONS.malformed }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: EXTERNAL_URL_REASONS.scheme }
  }
  if (!parsed.hostname) return { ok: false, reason: EXTERNAL_URL_REASONS.malformed }
  if (parsed.username || parsed.password) return { ok: false, reason: EXTERNAL_URL_REASONS.credentials }

  return { ok: true, url: parsed.toString(), host: parsed.host }
}

// Server-side reachability + embeddability verdict. The destination itself is
// re-validated on the server; this call only ever receives the URL the designer
// typed, and the answer never travels back into the QR.
export async function checkExternalLink(url, token) {
  return invokeFunction('link-check', { method: 'POST', token, body: { url } })
}
