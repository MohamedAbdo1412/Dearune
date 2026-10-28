import PushPin, { PIN_NAMES } from './pushpin'
import MessageAudio from './MessageAudio'
import { memorialDefaults } from './letterDefaults'

// The Memorial Message composition — the one that "will be sent", used live
// in the editor, read-only as a proof on the facing page, and in Review. One
// renderer, no drifting duplicates. A warm preserved letter whose prints are
// laid out editorially — one hero high on the right, two smaller prints
// answering it below — in English (LTR) or Arabic (RTL).
//
// While editing, the whole letter is one continuous ruled sheet: a single
// textarea carries the words and the greeting, close and name ink their own
// baselines on the same page, never boxed into a form.

// Three prints, composed across twelve columns: the hero sits high on the
// right, the two smaller prints answer it below. Each keeps its own tilt so
// the page reads laid-by-hand, never gridded.
const PHOTO_PLACEMENT = [
  { rotate: -4, y: 3, cls: 'pos-a' },
  { rotate: 3, y: -8, cls: 'pos-b' },
  { rotate: -2, y: 5, cls: 'pos-c' },
]

// Enter-advance between the single-line entries of the letter.
const NEXT_FIELD = { 'mm-greeting': 'mm-body', 'mm-closing': 'mm-sender' }

function PhotoPrint({ media, src, rotate, drop, cls, editable, onTap, pin }) {
  const live = editable && onTap
  return (
    <button
      type="button"
      className={`m-print ${cls}${live ? ' is-editable' : ''}${media ? ' is-set' : ''}`}
      style={{ '--pt-rot': `${rotate}deg`, '--pt-y': `${drop}px` }}
      onClick={live ? () => onTap() : undefined}
      aria-label={editable ? (media ? 'Replace this print' : 'Add a print') : media ? 'An old photograph' : 'An empty print position'}
      tabIndex={editable ? 0 : -1}
      disabled={!editable}
    >
      <span className="print-paper">
        <img src={src || undefined} alt="" draggable={false} loading="lazy" style={src ? undefined : { display: 'none' }} />
      </span>
      {media && src ? <span className="print-fade" aria-hidden="true" /> : null}
      {editable && !media ? (
        <span className="print-empty" aria-hidden="true">
          <span className="print-plus">+</span>
        </span>
      ) : null}
      <span className="print-baseline" data-label={editable ? (media ? 'replace' : 'add a print') : ''} aria-hidden="true" />
      <PushPin color={pin} size={26} />
    </button>
  )
}

function advanceLine(event) {
  if (event.key !== 'Enter') return
  if (event.shiftKey) return
  const next = NEXT_FIELD[event.currentTarget.id]
  event.preventDefault()
  if (next) {
    document.getElementById(next)?.focus()
    return
  }
  document.getElementById('mm-seal')?.focus()
}

export default function MemorialLetter({
  draft = {},
  editable = false,
  onField = () => {},
  photoUrls = [],
  onPhotoTap,
  audio = null,
  audioUrl = null,
  compact = false,
}) {
  const language = draft.language === 'ar' ? 'ar' : 'en'
  const isAr = language === 'ar'
  const style = { '--letter-lang': isAr ? 'var(--font-arabic)' : 'var(--font-text)' }
  const greeting = typeof draft.greeting === 'string' && draft.greeting ? draft.greeting : memorialDefaults(language).greeting
  const closing = typeof draft.closing === 'string' && draft.closing ? draft.closing : memorialDefaults(language).closing

  const fieldProps = (key) => ({
    dir: isAr ? 'rtl' : 'ltr',
    value:
      key === 'greeting'
        ? greeting
        : key === 'closing'
          ? closing
          : key === 'senderName'
            ? draft.senderName ?? ''
            : draft.body ?? '',
    'aria-label':
      key === 'greeting'
        ? isAr ? 'التحية' : 'The greeting'
        : key === 'closing'
          ? isAr ? 'الخاتمة' : 'The closing'
          : key === 'senderName'
            ? isAr ? 'الاسم' : 'A name'
            : isAr ? 'الكلمات التي ستُكتب' : 'The message',
  })

  const caption = (key) =>
    key === 'greeting'
      ? isAr ? 'التحية' : 'the greeting'
      : key === 'closing'
        ? isAr ? 'الخاتمة' : 'the close'
        : key === 'senderName'
          ? isAr ? 'الاسم' : 'a name'
          : isAr ? 'الكلمات' : 'the words'

  return (
    <div className={`memorial${isAr ? ' is-arabic' : ' is-english'}${editable ? ' is-editing' : ''}${compact ? ' is-compact' : ''}`} style={style}>
      {editable ? (
        <label className="m-zone">
          <span className="m-caption">{caption('greeting')}</span>
          <input
            id="mm-greeting"
            className="m-line m-greeting m-editable"
            maxLength={120}
            onChange={(e) => onField('greeting', e.target.value)}
            onKeyDown={advanceLine}
            enterKeyHint="next"
            {...fieldProps('greeting')}
          />
        </label>
      ) : (
        <p className="m-line m-greeting">{greeting}</p>
      )}

      {editable ? (
        <label className="m-zone m-zone--body">
          <span className="m-caption">{caption('body')}</span>
          <textarea
            id="mm-body"
            className="m-line m-body m-editable"
            rows={4}
            maxLength={4000}
            placeholder={isAr ? 'اكتب الكلمات…' : 'write the words…'}
            onChange={(e) => onField('body', e.target.value)}
            enterKeyHint="enter"
            {...fieldProps('body')}
          />
        </label>
      ) : (
        <div className="m-line m-body m-scripted">
          {draft.body ? <p>{draft.body}</p> : <p className="m-blank">{isAr ? 'كلماتها لم تُكتب بعد' : 'its words have not been written yet'}</p>}
        </div>
      )}

      <div className="m-close">
        {editable ? (
          <label className="m-zone m-zone--tall">
            <span className="m-caption">{caption('closing')}</span>
            <input
              id="mm-closing"
              className="m-line m-closing m-editable"
              maxLength={120}
              onChange={(e) => onField('closing', e.target.value)}
              onKeyDown={advanceLine}
              enterKeyHint="next"
              {...fieldProps('closing')}
            />
          </label>
        ) : (
          <p className="m-line m-closing">{closing}</p>
        )}
        {editable ? (
          <label className="m-zone m-zone--tall">
            <span className="m-caption">{caption('senderName')}</span>
            <input
              id="mm-sender"
              className="m-line m-signature m-editable"
              maxLength={80}
              placeholder={isAr ? 'الاسم' : 'a name'}
              onChange={(e) => onField('senderName', e.target.value)}
              onKeyDown={advanceLine}
              enterKeyHint="done"
              {...fieldProps('senderName')}
            />
          </label>
        ) : (
          draft.senderName ? <p className="m-line m-signature">{draft.senderName}</p> : null
        )}
      </div>

      {audio || audioUrl ? (
        <div className="m-soundchip">
          <span className="sound-wave" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          <span className="sound-label">{isAr ? 'صوت مرافق' : 'a sound is kept here'}</span>
          {audioUrl ? <MessageAudio src={audioUrl} label={isAr ? 'استمع' : 'listen'} /> : null}
        </div>
      ) : null}

      <div className="m-photos" role="group" aria-label={isAr ? 'ثلاث صور مشبوكة' : 'three pinned prints'}>
        {PHOTO_PLACEMENT.map((p, i) => (
          <PhotoPrint
            key={p.cls}
            media={draft.photos?.[i] ?? null}
            src={photoUrls[i] ?? null}
            rotate={p.rotate}
            drop={p.y}
            cls={p.cls}
            editable={editable}
            onTap={onPhotoTap ? () => onPhotoTap(i) : undefined}
            pin={PIN_NAMES[i] ?? 'brass'}
          />
        ))}
      </div>
    </div>
  )
}