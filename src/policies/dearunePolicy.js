// The Dearune terms, presented on the policies spread and committed with each
// submission. The version is a first-class value: the server stores the exact
// version + acceptance time on every project, so a later revision of these
// words never rewrites what an older submission actually agreed to. Changing
// the words here MUST bump the version (and the server's copy) together.

export const DEARUNE_POLICY_VERSION = '2026-09-24-v1'

// Availability window, measured from the day the message is first activated
// (see the server's designer-projects reader; the client only displays it).
export const DEARUNE_AVAILABILITY_YEARS = 2

export const DEARUNE_POLICY = {
  version: DEARUNE_POLICY_VERSION,
  title: 'The Dearune Terms',
  lead: 'A Dearune is a single message, made into a single book. These are the words it is bound by.',
  points: [
    {
      id: 'one-book',
      title: 'one book, one owner',
      body: 'The Dearune you craft is made for the person you name. You confirm that person may receive it, and that the message you place inside is yours to share.',
    },
    {
      id: 'kept-words',
      title: 'kept words',
      body: 'When you seal the book, its words are frozen exactly as written — they are not edited, reprinted, or rewritten afterwards, on any side.',
    },
    {
      id: 'availably',
      title: 'an availability of time',
      body: 'From the day your Dearune is first activated, it may be read for two years. Activation rests with the book; once rested it cannot be brought back past its time.',
    },
    {
      id: 'quiet-papers',
      title: 'quiet pages',
      body: 'Your words are yours while they are being written: the draft stays encrypted on your own device until you submit it, and drafts never leave without your hand on the seal.',
    },
    {
      id: 'honest-maker',
      title: 'an honest maker',
      body: 'We ask the same of everyone who uses Dearune: no false names, no borrowed words, no harming of the one who reads. We may set aside an account that breaks this trust.',
    },
  ],
}

export function policyAsOf(slug = DEARUNE_POLICY_VERSION) {
  return slug === DEARUNE_POLICY_VERSION ? DEARUNE_POLICY : null
}

// Pure helper used by the policies stage to enforce the checkbox before
// submitting; the server re-checks the version on its side regardless.
export function canAcceptPolicy(accepted) {
  return Boolean(accepted)
}