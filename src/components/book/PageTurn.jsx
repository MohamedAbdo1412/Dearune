import { useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// The leaf in motion, driven by Motion instead of CSS keyframes. One full page
// sweeps about the spine on a preserved-3D plane: its front shows the page
// leaving, its back the page being revealed on the far side, and the resting
// sheets underneath update the spread while the leaf hides the seam. The
// landing is reported through onAnimationComplete — a typed, reliable callback
// instead of sniffing animation events — and the whole layer unmounts once the
// turn ends, so nothing lingers to grab taps.
export default function PageTurn({ direction = 'fwd', front, back, onLanded }) {
  const reduced = useReducedMotion()
  const firedRef = useRef(false)
  const isBack = direction === 'back'
  const angle = isBack ? 180 : -180

  const finish = () => {
    if (firedRef.current) return
    firedRef.current = true
    onLanded?.()
  }

  return (
    <div className={`turn-scene${isBack ? ' is-turning-back' : ' is-turning-forward'}`} aria-hidden="true">
      <motion.div
        className={`turn-leaf${isBack ? ' is-back-facing' : ' is-forward-facing'}`}
        initial={reduced ? { opacity: 1 } : { rotateY: 0 }}
        animate={reduced ? { opacity: 0 } : { rotateY: angle }}
        transition={
          reduced
            ? { duration: 0.3, ease: 'easeOut' }
            : { duration: 0.95, ease: [0.6, 0.05, 0.2, 1] }
        }
        onAnimationComplete={finish}
      >
        <div className="turn-face turn-front">{front}</div>
        <div className="turn-face turn-back">{back}</div>
      </motion.div>
    </div>
  )
}