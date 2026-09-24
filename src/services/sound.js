// Dearune interface sound — synthesized at runtime with the Web Audio API.
// There are no downloaded files, so there is nothing to license: every rustle,
// click, pin and key-turn is generated from short filtered noise bursts and
// oscillator blips. Sound is subtle, gated behind the first user gesture
// (autoplay policy), and can be muted from the book masthead.

const MUTE_KEY = 'dearune.soundMuted'

let ctx = null
let master = null
let muted = null
let ready = false

function ensureContext() {
  if (typeof window === 'undefined') return
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    ctx = new AudioCtx()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
}

// Browsers block audio until a user gesture; the book calls this once on the
// first pointer/key interaction so the very first turn can make a sound.
export function unlockSound() {
  ready = true
  ensureContext()
}

// Same intent under a friendlier name for gesture handlers that already have
// a reason (cover opened, mute toggled on). The argument keeps call sites
// self-documenting and is otherwise unused.
export function unmuteVia() {
  ready = true
  ensureContext()
}

export function isSoundMuted() {
  if (muted === null && typeof localStorage !== 'undefined') muted = localStorage.getItem(MUTE_KEY) === '1'
  return Boolean(muted)
}

export function setSoundMuted(value) {
  muted = Boolean(value)
  if (typeof localStorage !== 'undefined') {
    if (muted) localStorage.setItem(MUTE_KEY, '1')
    else localStorage.removeItem(MUTE_KEY)
  }
}

function burst({ seconds = 0.14, from = 220, to = 420, level = 0.32, type = 'bandpass', delay = 0 }) {
  if (!ready || muted || !ctx || !master) return
  const t = ctx.currentTime + delay
  const noise = ctx.createBufferSource()
  const buffer = ctx.createBuffer(1, Math.max(1, Math.round(ctx.sampleRate * seconds)), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  }
  noise.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + seconds)
  filter.Q.value = 0.8
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(level, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
  noise.connect(filter).connect(gain).connect(master)
  noise.start(t)
  noise.stop(t + seconds + 0.02)
}

function blip({ freq = 880, duration = 0.06, level = 0.12, type = 'triangle', delay = 0, slide = 0 }) {
  if (!ready || muted || !ctx || !master) return
  const t = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(level, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

// --- the gentle palette ----------------------------------------------------

// Paper lifting: a quiet, broad rustle (rising filtered noise).
export function playPageLift() {
  burst({ seconds: 0.22, from: 180, to: 700, gain: 0.10, type: 'bandpass' })
}

// Paper sweeping: a slightly longer mid turn.
export function playPageFlip() {
  burst({ seconds: 0.38, from: 260, to: 900, gain: 0.12, type: 'bandpass' })
  burst({ seconds: 0.30, from: 620, to: 240, gain: 0.08, type: 'lowpass', delay: 0.16 })
}

// Paper settles: a low, short thump.
export function playPageSettle() {
  burst({ seconds: 0.16, from: 180, to: 70, gain: 0.22, type: 'lowpass' })
  blip({ freq: 120, duration: 0.09, gain: 0.05, type: 'sine' })
}

// A paper crackle while content appears.
export function playInkTouch() {
  burst({ seconds: 0.1, from: 1400, to: 500, gain: 0.04, type: 'bandpass', delay: 0.03 })
}

// An inked control pressed / a selection made: brief dry wood click.
export function playClick() {
  burst({ seconds: 0.045, from: 1800, to: 900, gain: 0.12, type: 'highpass' })
  blip({ freq: 320, duration: 0.03, gain: 0.05, type: 'square' })
}

// A push pin beds into paper.
export function playPin() {
  burst({ seconds: 0.07, from: 2400, to: 900, gain: 0.14, type: 'highpass' })
  burst({ seconds: 0.1, from: 400, to: 130, gain: 0.16, type: 'lowpass', delay: 0.05 })
}

// Old key slides into the lock.
export function playKeyInsert() {
  burst({ seconds: 0.16, from: 1100, to: 500, gain: 0.12, type: 'bandpass' })
  blip({ freq: 620, duration: 0.05, gain: 0.09, type: 'triangle', delay: 0.06 })
}

// Tumbler click, then the key turns with two small clicks.
export function playKeyTurn() {
  blip({ freq: 900, duration: 0.035, gain: 0.08, type: 'square', delay: 0 })
  blip({ freq: 520, duration: 0.05, gain: 0.1, type: 'square', delay: 0.09 })
  burst({ seconds: 0.1, from: 700, to: 180, gain: 0.14, type: 'lowpass', delay: 0.16 })
}

// The lock closes: a low, definitive metal clunk.
export function playLockClose() {
  burst({ seconds: 0.16, from: 500, to: 90, gain: 0.24, type: 'lowpass' })
  burst({ seconds: 0.05, from: 2600, to: 1200, gain: 0.08, type: 'highpass', delay: 0.02 })
}

// A short whisper of success (kept very quiet).
export function playSeal() {
  blip({ freq: 660, duration: 0.22, gain: 0.05, type: 'triangle', slide: 180 })
}