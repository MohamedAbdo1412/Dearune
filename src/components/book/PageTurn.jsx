import { useEffect, useRef } from 'react'

// The leaf in motion. It covers the under-page, sweeps around to the edge of
// the spread on its spine edge, and reports when the turn has finished so the
// owner can swap the resting page. Reduced-motion users get a quick fade.
export default function PageTurn({ direction = 'fwd', front, onDone }) {
  const sheetRef = useRef(null)
  const firedRef = useRef(false)

  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const handleEnd = (event) => {
      if (event.target !== sheet) return
      if (!/^page-turn-/.test(event.animationName)) return
      if (firedRef.current) return
      firedRef.current = true
      onDone?.()
    }
    sheet.addEventListener('animationend', handleEnd)
    return () => sheet.removeEventListener('animationend', handleEnd)
  }, [onDone])

  const directionClass = direction === 'back' ? 'is-turning-back' : 'is-turning-forward'

  return (
    <div className={`turn-scene${direction === 'back' ? ' is-back' : ''}`} aria-hidden="true">
      <div className="turn-hold before">
        <div ref={sheetRef} className={`turn-sheet ${directionClass}`}>
          {front}
        </div>
      </div>
    </div>
  )
}