import { useMemo } from 'react'
import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import { useMemorialMedia } from '@/templates/memorial-message/useMemorialMedia'
import { parseProjectPayload } from '@/services/projectPayload'
import '@/styles/book.css'

// The Dearune's real letter, as the studio will print it. Loaded only when
// the admin asks for it (this file and its paper styles ride in with the
// first preview), so the admin bundle never carries the book stylesheet.
//
// The payload IS the design: a Dearune whose words did not survive storage
// says so instead of being dressed up in the template's sample text.

const NULL_MEDIA_DRAFT = { photos: [null, null, null], audio: null }

export default function LetterPreview({ project, token }) {
  const draft = useMemo(() => parseProjectPayload(project?.payload), [project])
  const { photoUrls, audioUrl } = useMemorialMedia(draft ?? NULL_MEDIA_DRAFT, token)

  if (!draft) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">This Dearune's words are not stored on the server.</p>
        <p className="mt-1">The record exists, but the letter cannot be reprinted from it.</p>
      </div>
    )
  }

  return (
    <div className="review-letter">
      <MemorialLetter draft={draft} photoUrls={photoUrls} audio={draft.audio} audioUrl={audioUrl} />
    </div>
  )
}
