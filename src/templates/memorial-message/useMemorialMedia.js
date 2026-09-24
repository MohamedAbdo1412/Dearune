import { useEffect, useState } from 'react'
import { resolveMediaUrl } from '@/services/media'

// Resolve this memorial's stored media references to signed, viewable URLs
// for this session. References (not secrets) come from the local draft; the
// signed URLs are fetched through the designer-media edge and cached.
export function useMemorialMedia(draft, token) {
  const [photoUrls, setPhotoUrls] = useState([null, null, null])
  const [audioUrl, setAudioUrl] = useState(null)

  const photos = draft.photos?.length === 3 ? draft.photos : [null, null, null]
  const key = photos.map((p) => p?.path ?? '').join('||') + '|' + (draft.audio?.path ?? '')

  useEffect(() => {
    let alive = true
    setPhotoUrls([null, null, null])
    setAudioUrl(null)
    photos.forEach((ref, i) => {
      if (!ref?.path) return
      resolveMediaUrl(ref, token).then((url) => {
        if (!alive) return
        setPhotoUrls((prev) => (prev[i] === url ? prev : prev.map((u, j) => (j === i ? url : u))))
      })
    })
    const audioRef = draft.audio
    if (audioRef?.path) {
      resolveMediaUrl(audioRef, token).then((url) => alive && setAudioUrl(url))
    }
    return () => {
      alive = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return { photoUrls, audioUrl }
}