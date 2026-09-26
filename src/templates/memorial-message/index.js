import MemorialLanguageStage from './MemorialLanguageStage'
import MemorialEditorStage from './MemorialEditorStage'
import MemorialPasswordStage from './MemorialPasswordStage'
import MemorialCardMini from './MemorialCardMini'
import MemorialLetter from './MemorialLetter'
import { TEMPLATE_SEQUENCES } from '../stages'

// The Memorial Message template — a single preserved letter in English or
// Arabic with three pinned prints and (optionally) one sound. The DB row for
// this template lives in migration 007 behind the code `memorial-message`;
// the visual design is hard-coded here and never travels from the database.
//
// The stage list is not repeated: it derives from the template contract, and
// CreateBook renders the pages below through `components` keyed by stage, so
// this object is the template's whole page-by-page identity.

export const MEMORIAL_TEMPLATE = {
  slug: 'memorial-message',
  subject: 'Memorial Message',
  phrase: 'one kept letter · three prints · a sound, if you like',
  // The paper's fixed proportion as delivered (portrait 3:4). Previews wrap
  // the composition in a sheet of exactly this ratio, so the tool-time proof
  // always matches the real delivery regardless of the page height.
  renderAspectRatio: 3 / 4,
  stages: [...TEMPLATE_SEQUENCES['memorial-message']],
  components: {
    'memorial.language': MemorialLanguageStage,
    'memorial.editor': MemorialEditorStage,
    'memorial.password': MemorialPasswordStage,
  },
  CardMini: MemorialCardMini,
  Letter: MemorialLetter,
}

export default MEMORIAL_TEMPLATE