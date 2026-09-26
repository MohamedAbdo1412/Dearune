import { useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// The leaf in motion, driven by Motion instead of CSS keyframes. One full page
// sweeps about the spine on a preserved-3D plane: its front shows the page
// leaving, its back the page being revealed on the far side, and the resting
// sheets underneath update the spread while the leaf hides the seam. The
// landing is reported through onAnimationComplete — a typed, reliable callback
// instead of sniffing animation events — and the whole layer unmounts once the
// turn ends, so nothing lingers to grab taps.
//
// The sweep is PHASED, not a single straight rotation: the leaf lifts off
// slowly (-6°), gathers speed through the middle of the arc (-24°, -90°),
// then settles onto the far side in two small steps (-156°, -174°, -180°).
// The `times` below sample a sine-shaped velocity profile across those stops,
// so the leaf reads as one continuous physical motion — slow start, fast
// middle, gentle landing — without the mid-air stalls that per-segment
// easing would cause.

const FORWARD_STOPS = [0, -6, -24, -90, -156, -174, -180]
const BACK_STOPS = [0, 6, 24, 90, 156, 174, 180]
const SWEEP_TIMES = [0, 0.104, 0.215, 0.5, 0.785, 0.896, 1]

export default function PageTurn({ direction = 'fwd', front, back, onLanded }) {
  const reduced = useReducedMotion()
  const firedRef = useRef(false)
  const isBack = direction === 'back'
  const stops = isBack ? BACK_STOPS : FORWARD_STOPS

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
        animate={reduced ? { opacity: 0 } : { rotateY: stops }}
        transition={
          reduced
            ? { duration: 0.3, ease: 'easeOut' }
            : { duration: 0.95, times: SWEEP_TIMES, ease: 'linear' }
        }
        onAnimationComplete={finish}
      >
        <div className="turn-face turn-front">{front}</div>
        <div className="turn-face turn-back">{back}</div>
      </motion.div>
    </div>
  )
}
