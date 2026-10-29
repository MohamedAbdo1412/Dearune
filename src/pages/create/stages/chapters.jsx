import { Folio, Fleuron } from '@/components/book/ornaments'

// The quiet left leaves of the pipeline — engraved chapter titles. Short,
// plain, without a single extra word of instruction.

export function ChapterPage({ folio, script, kicker, title, body, children }) {
  return (
    <Folio folio={folio} className="chapter-page">
      <div className="settle">
        {script ? <div className="page-script">{script}</div> : null}
        {kicker ? <div className="page-kicker" style={{ marginTop: 6 }}>{kicker}</div> : null}
        <h2 className="page-title">{title}</h2>
        {body ? <p className="page-lead">{body}</p> : null}
        <Fleuron />
        {children}
      </div>
    </Folio>
  )
}

export function TitleSheet({ receiverName }) {
  return (
    <ChapterPage folio={1} title="Dearune">
      <div className="title-flourish" aria-hidden="true">❦</div>
      <p className="page-lead" style={{ marginTop: 10 }}>
        a single message, bound as a book — written here, handed over once,
        opened in no other place.
      </p>
      {receiverName ? (
        <p className="title-dedication">for {receiverName}</p>
      ) : null}
      <div className="title-seal-mark" aria-hidden="true">
        D
      </div>
    </ChapterPage>
  )
}

export function ReceiverSheet() {
  return (
    <ChapterPage
      folio={3}
      script="chapter the second"
      title="For whom"
      body="A name marks the book and the letter inside. It can be a full name, a
            title, or simply the word that stands for them."
    />
  )
}

export function PapersSheet() {
  return (
    <ChapterPage
      folio={5}
      script="chapter the third"
      title="The papers"
      body="Every hand sets its paper differently. Choose the one that feels like
            the words that are coming."
    />
  )
}

export function LanguageSheet() {
  return (
    <ChapterPage
      folio={7}
      script="chapter the fourth"
      title="The tongue"
      body="A book reads best in the language the words were thought in. The
            paper bends to either hand of reading."
    />
  )
}

export function UnwrittenSheet() {
  return (
    <ChapterPage folio={7} script="chapter ∞" title="Under the press">
      <p className="page-lead">
        The plates for this paper are half-inked in the studio. Its page will be
        fitted into the book the moment they are dry.
      </p>
    </ChapterPage>
  )
}

export function WrapperSheet() {
  return (
    <ChapterPage
      folio={11}
      script="chapter the sixth"
      title="The wrapper"
      body="A letter is also how it arrives. Choose the wrapper this book will
            travel in — it becomes part of what is being given."
    />
  )
}

export function LinkSheet() {
  return (
    <ChapterPage
      folio={7}
      script="chapter the fourth"
      title="The destination"
      body="A printed code is only as good as where it leads. Give it one address —
            a page that already exists, held still for whoever scans."
    />
  )
}

export function LinkProofSheet() {
  return (
    <ChapterPage
      folio={9}
      script="chapter the fifth"
      title="The proof"
      body="Before the seal, the page is looked at from here: does it answer, and will
            it allow itself to be framed? A site that refuses a preview is still a
            site you may send someone to."
    />
  )
}

export function LockSheet() {
  return (
    <ChapterPage
      folio={13}
      script="chapter the seventh"
      title="The lock"
    >
      <div className="lock-engraving" aria-hidden="true">
        <span className="engrave-hole" />
      </div>
      <p className="page-lead" style={{ marginTop: 12 }}>
        What is written here travels sealed. The password is never kept with
        the book — only the presence of a lock.
      </p>
    </ChapterPage>
  )
}

export function CloseSheet({ receiverName }) {
  return (
    <ChapterPage
      folio={15}
      script="chapter the eighth"
      title="The close"
    >
      <div className="close-ornament" aria-hidden="true">
        <span className="close-diamond" />
        <span className="close-diamond" />
        <span className="close-diamond" />
      </div>
      <p className="page-lead" style={{ marginTop: 12 }}>
        The pages are set. Before the book leaves your hands{receiverName ? `, ${receiverName}` : ''}, look it
        over once — as one reads any letter it is about to send.
      </p>
    </ChapterPage>
  )
}

export function PoliciesSheet() {
  return (
    <ChapterPage
      folio={17}
      script="chapter the ninth"
      title="The seal"
    >
      <div className="seal-mark" aria-hidden="true">
        <span className="seal-wax" />
      </div>
      <p className="page-lead" style={{ marginTop: 12 }}>
        The book stays in your hands until its terms are accepted as they stand
        today. Tick the words, and the seal is free to fall on the final page.
      </p>
    </ChapterPage>
  )
}

export function SubmittedSheet() {
  return (
    <ChapterPage
      folio={19}
      script="chapter the last"
      title="Handed over"
    >
      <div className="submitted-seal" aria-hidden="true">
        <span className="seal-wax seal-wax--set" />
      </div>
      <p className="page-lead" style={{ marginTop: 12 }}>
        The book has left the desk. It will wait, closed, on the shelf — its
        words no longer spoken anywhere but its pages.
      </p>
    </ChapterPage>
  )
}

export function ClosedBookSheet() {
  return (
    <ChapterPage
      folio={18}
      script="the end"
      title="A closed book"
      body="The message is in its wrappers now. Its pages are no longer turned
            here — it can only be opened by its new owner, with the key it carries."
    />
  )
}

export function SealMark() {
  return (
    <div className="seal-mark" aria-hidden="true">
      <span className="seal-wax" />
    </div>
  )
}