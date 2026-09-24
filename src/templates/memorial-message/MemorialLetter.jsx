import PushPin, { PIN_NAMES } from './pushpin'
import MessageAudio from './MessageAudio'

// The Memorial Message composition — the one that "will be sent", used live
// in the editor, read-only as a proof on the facing page, and in Review. One
// renderer, no drifting duplicates. A warm preserved letter with three small
// prints pinned to a rail near the foot of the paper, in English (LTR) or
// Arabic (RTL).
//
// While editing, the words sit on ruled manuscript lines with captions in the
// margin — unmistakably a place being written, not read. The three prints live
// on their own rail below the letter so they can never overlap or intercept
// the text.

const DEFAULT_AR = {
  greeting: 'عزيزي …،',
  closing: 'بكل الحب،',
}
const DEFAULT_EN = {
  greeting: 'Dear friend,',
  closing: 'Sincerely,',
}

// Three pinned prints on the rail, each hung at its own height so the line
// reads like a wall of keepsakes rather than a row of ID cards: the middle
// pin hangs a little higher, the flanking two a touch lower, with their
// rotations off the grid.
const PHOTO_PLACEMENT = [
  { rotate: -4, y: 3, cls: 'pos-a' },
  { rotate: 3, y: -8, cls: 'pos-b' },
  { rotate: -2, y: 5, cls: 'pos-c' },
]

// Enter-advance between the single-line entries of the letter.
const NEXT_FIELD = { 'mm-greeting': 'mm-body', 'mm-closing': 'mm-sender' }

export function memorialDefaults(language) {
  return language === 'ar' ? { ...DEFAULT_AR, body: '', senderName: '' } : { ...DEFAULT_EN, body: '', senderName: '' }
}

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