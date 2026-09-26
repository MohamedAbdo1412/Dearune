import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Folio, Fleuron } from './ornaments'
import PageTurn from './PageTurn'

// The ink settle: after a landing the arriving words dim once into the grain.
// Both sides of the spread perform the same quiet pass.
const inkVariants = {
  idle: { opacity: 1 },
  ink: {
    opacity: [1, 0.82, 1],
    transition: { duration: 0.5, ease: 'easeOut', times: [0, 0.45, 1] },
  },
}

// The physical book: an open spread of paper lying at a gentle angle on a
// dark desk. Left leaf is quiet composition; right leaf is the working folio.
// The cover and the sweeping leaf are animated by Motion and are unmounted
// the moment they are done — a finished layer never stays in the DOM to sit
// over the paper and swallow touches, and nothing depends on CSS keyframes
// or animation-event timing.
export default function BookShell({
  leftNode = <VersoPage />,
  rightNode,
  coverOpen = false,
  onOpenCover,
  onCoverSettled,
  flipping = false,
  turnDirection = 'fwd',
  turnFront = null,
  turnBack = null,
  onTurnEnd = () => {},
  inking = false,
}) {
  const reduced = useReducedMotion()
  return (
    <div className="book-stage">
      <div className="book-scene">
        <div className="book">
          <div className="book-ambient" aria-hidden="true" />
          {/* While a leaf sweeps, the resting spread underneath is fully out
              of the way: inert to pointers and hidden from assistive tech, so
              a mid-turn tap can never land on the page that is leaving. */}
          <motion.div
            className="spread"
            variants={inkVariants}
            initial={false}
            animate={reduced || !inking ? 'idle' : 'ink'}
            inert={flipping}
            aria-hidden={flipping || undefined}
          >
            <div className="book-sheet is-left">{leftNode}</div>
            <div className="book-spine" aria-hidden="true">
              <span className="spine-crease" />
            </div>
            <div className="book-sheet is-right">{rightNode}</div>
          </motion.div>
          {flipping ? (
            <PageTurn direction={turnDirection} front={turnFront} back={turnBack} onLanded={onTurnEnd} />
          ) : null}
          <AnimatePresence
            onExitComplete={() => {
              onCoverSettled?.()
            }}
          >
            {!coverOpen ? (
              <motion.button
                key="cover"
                type="button"
                className="book-cover"
                onClick={onOpenCover}
                aria-label="Open the book"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={
                  reduced
                    ? {
                        opacity: 0,
                        transition: { duration: 0.3, ease: 'easeOut' },
                      }
                    : {
                        rotateX: -74,
                        opacity: 0,
                        transition: {
                          duration: 0.85,
                          ease: [0.45, 0.15, 0.2, 1],
                          opacity: { duration: 0.6, delay: 0.5 },
                        },
                      }
                }
              >
                <span className="cover-kicker">dearune · a finite book</span>
                <span className="cover-device" aria-hidden="true">D</span>
                <span className="cover-title">Dearune</span>
                <span className="cover-subtitle">One private book, for a single message.</span>
                <span className="cover-open">
                  Open the book
                  <span className="cover-arrow" aria-hidden="true">→</span>
                </span>
              </motion.button>
            ) : null}
          </AnimatePresence>
          <div className="book-block" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} className={n === 6 ? 'bottom' : ''} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function VersoPage() {
  return (
    <Folio folio={2} className="verso">
      <div style={{ textAlign: 'center', paddingTop: '1.4em' }}>
        <div className="page-script">how a letter is made</div>
        <div className="page-kicker" style={{ marginTop: 6, marginBottom: 14 }}>
          the first folio
        </div>
        <Fleuron />
      </div>
    </Folio>
  )
}