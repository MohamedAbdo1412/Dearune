import { useEffect, useMemo, useState } from 'react'
import { resolveMediaUrl } from '@/services/media'
import { decryptBytes } from '@/services/draftCrypto'
import { getEncryptedMedia, mediaStorageKey } from '@/services/draftMediaStore'
import { decodeJwtPayload } from '@/services/draft'

// Resolve this memorial's stored media references to viewable URLs for this
// session. TWO sources, one hook:
//
//   store 'local'   → the bytes are still encrypted in IndexedDB (the draft
//                     hasn't been submitted yet). They are decrypted with the
//                     in-memory draft key and surfaced as an object URL that is
//                     revoked when this hook tears down or the media changes.
//   store 'supabase'→ a handed-over book's reference; resolved through the
//                     designer-media edge function (existing signed-URL path).
//
// References (never secrets) come from the local draft or a server payload.

export function useMemorialMedia(draft, token) {
  const [photoUrls, setPhotoUrls] = useState([null, null, null])
  const [audioUrl, setAudioUrl] = useState(null)

  const photos = draft.photos?.length === 3 ? draft.photos : [null, null, null]
  const designerId = useMemo(() => decodeJwtPayload(token)?.sub ?? '', [token])
  const refKey = (ref) => (ref?.store === 'local' ? `l:${ref.role}:${ref.slot}:${ref.addedAt}` : `s:${ref?.path ?? ''}`)
  const key = useMemo(
    () => photos.map((p) => refKey(p)).join('||') + '|' + (draft.audio ? refKey(draft.audio) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos.map((p) => refKey(p)).join('||'), draft.audio ? refKey(draft.audio) : '']
  )

  useEffect(() => {
    let alive = true
    const created = []
    setPhotoUrls([null, null, null])
    setAudioUrl(null)
    const makeUrl = async (ref, slot) => {
      if (!ref) return
      let url = null
      try {
        if (ref.store === 'local') {
          if (!designerId) return
          const record = await getEncryptedMedia(mediaStorageKey(designerId, ref.projectId, ref.role, ref.slot))
          if (!record?.data) return
          const plain = await decryptBytes({ iv: record.iv, ct: record.data })
          if (!plain) return
          url = URL.createObjectURL(new Blob([plain], { type: record.mimeType || 'application/octet-stream' }))
          created.push(url)
        } else {
          url = await resolveMediaUrl(ref, token)
        }
      } catch {
        return
      }
      if (!alive) return
      if (slot == null) {
        setAudioUrl((prev) => (prev === url ? prev : url))
      } else {
        setPhotoUrls((prev) => (prev[slot] === url ? prev : prev.map((u, j) => (j === slot ? url : u))))
      }
    }
    photos.forEach((ref, i) => makeUrl(ref, i))
    if (draft.audio) makeUrl(draft.audio, null)
    return () => {
      alive = false
      for (const url of created) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, designerId, token])

  return { photoUrls, audioUrl }
}