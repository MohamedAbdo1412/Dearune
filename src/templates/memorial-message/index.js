import MemorialLanguageStage from './MemorialLanguageStage'
import MemorialEditorStage from './MemorialEditorStage'
import MemorialPasswordStage from './MemorialPasswordStage'
import MemorialCardMini from './MemorialCardMini'
import MemorialLetter from './MemorialLetter'

// The Memorial Message template — a single preserved letter in English or
// Arabic with three pinned prints and (optionally) one sound. The DB row for
// this template lives in migration 007 behind the code `memorial-message`;
// the visual design is hard-coded here and never travels from the database.

export const MEMORIAL_TEMPLATE = {
  slug: 'memorial-message',
  subject: 'Memorial Message',
  phrase: 'one kept letter · three prints · a sound, if you like',
  // The paper's fixed proportion as delivered (portrait 3:4). Previews wrap
  // the composition in a sheet of exactly this ratio, so the tool-time proof
  // always matches the real delivery regardless of the page height.
  renderAspectRatio: 3 / 4,
  stages: ['memorial.language', 'memorial.editor', 'memorial.password', 'review', 'policies'],
  components: {
    'memorial.language': MemorialLanguageStage,
    'memorial.editor': MemorialEditorStage,
    'memorial.password': MemorialPasswordStage,
  },
  CardMini: MemorialCardMini,
  Letter: MemorialLetter,
}

export default MEMORIAL_TEMPLATE