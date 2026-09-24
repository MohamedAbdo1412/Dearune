import { memorialDefaults } from './MemorialLetter'

// THE SAMPLE. This is the only place a made-up sheet may be drawn, and only for
// two purposes: the paper's card in the gallery, and the opening of a brand-new
// page. It is never a fallback for reading a submitted project — if a closed
// book's payload cannot be read, the sheet says so outright rather than pass a
// sample off as someone's words.
export const MEMORIAL_SAMPLE = {
  ...memorialDefaults('en'),
  photos: [null, null, null],
  audio: null,
  passwordSet: false,
}

// A brand-new page opens blank-handed: the sample, copied so the caller can edit
// it freely. Draft *initialization* only — reading a submitted project never
// reaches for it.
export function blankPageDraft() {
  return { ...MEMORIAL_SAMPLE, photos: [...MEMORIAL_SAMPLE.photos] }
}