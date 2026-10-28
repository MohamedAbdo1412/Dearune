import { useEffect, useState } from 'react'

// One sound engine for the whole book. A single shared Audio element means two
// chips can never play at once, the editor toolbar and the letter chip agree
// on the same sound, and an imperative call (start-on-opening, sound preview)
// can drive the chip's button state through the subscriber list.

let sharedEl = null
let currentUrl = null
const subscribers = new Set()

function getEl() {
  if (!sharedEl) {
    sharedEl = new Audio()
    sharedEl.preload = 'none'
  }
  return sharedEl
}

function notify() {
  subscribers.forEach((fn) => fn())
}

export function subscribeSoundState(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function isSoundPlaying(url) {
  const el = sharedEl
  if (!el || !currentUrl) return false
  return currentUrl === url && !el.paused
}

export function playSound(url) {
  if (!url) return Promise.resolve(false)
  const el = getEl()
  if (currentUrl !== url) {
    el.src = url
    currentUrl = url
  }
  return el
    .play()
    .then(() => true)
    .catch(() => false)
    .finally(notify)
}

export function toggleSound(url) {
  if (!url) return Promise.resolve(false)
  const el = getEl()
  if (currentUrl === url && !el.paused) {
    el.pause()
    notify()
    return Promise.resolve(false)
  }
  return playSound(url)
}

export default function MessageAudio({ src, label }) {
  const [playing, setPlaying] = useState(() => isSoundPlaying(src))

  useEffect(() => subscribeSoundState(() => setPlaying(isSoundPlaying(src))), [src])

  return (
    <button
      type="button"
      className={`sound-play${playing ? ' is-on' : ''}`}
      aria-pressed={playing}
      aria-label={playing ? 'Pause the sound' : 'Play the sound'}
      onClick={() => toggleSound(src)}
    >
      {playing ? (label === 'استمع' ? 'استماع' : 'pause') : label}
    </button>
  )
}