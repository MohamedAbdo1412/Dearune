import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, CameraOff, Loader2Icon, ScanLine, TriangleAlert } from 'lucide-react'

// The camera half of the QA desk.
//
// A camera is only ever asked for when the admin presses "Start scan" —
// never on page load, and never in the background. The stream is stopped the
// moment the admin presses "Stop camera", navigates away, or the component
// unmounts, so the phone's camera light goes out with the screen.
//
// Two decoders, one contract:
//   * `BarcodeDetector` when the browser has it — fast, off the main thread;
//   * `jsQR` on a canvas otherwise — always available, a little slower.
//
// Both return the same thing: the raw text of the QR, which is handed to the
// page and resolved through the one shared lookup path.

export const CAMERA_ERRORS = {
  INSECURE: 'insecure',
  UNSUPPORTED: 'unsupported',
  PERMISSION: 'permission',
  NO_CAMERA: 'no-camera',
  BUSY: 'busy',
  INIT_FAILED: 'init-failed',
  DECODE_FAILED: 'decode-failed',
}

const SCAN_INTERVAL_MS = 140
const FRAME_MAX_EDGE = 520
const DUPLICATE_WINDOW_MS = 2500

// Map a getUserMedia failure onto something the admin can act on.
function cameraErrorKind(error) {
  const name = error?.name ?? ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return CAMERA_ERRORS.PERMISSION
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return CAMERA_ERRORS.NO_CAMERA
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return CAMERA_ERRORS.BUSY
  }
  return CAMERA_ERRORS.INIT_FAILED
}

function drawToCanvas(source, width, height, maxEdge = FRAME_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height) || 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

async function loadImageSource(file) {
  // `createImageBitmap` is the fast path; an <img> is the fallback for the
  // browsers that do not have it.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('That file could not be read as an image.'))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Read the QR out of an image file. Used by the "upload a photo" fallback,
 * and it goes through exactly the same resolution path as a live scan.
 *
 * @returns {Promise<string|null>} the decoded text, or null when there is no
 *   QR in the picture.
 */
export async function decodeImageFile(file) {
  if (!file) return null
  const source = await loadImageSource(file)
  const width = source.width ?? source.naturalWidth ?? 0
  const height = source.height ?? source.naturalHeight ?? 0
  if (!width || !height) return null
  const image = drawToCanvas(source, width, height, 1200)
  if (!image) return null
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
  return result?.data ?? null
}

/**
 * The live preview and the scan loop.
 *
 * @param {object} props
 * @param {boolean} props.running      true while the camera should be live
 * @param {(value: string) => void} props.onDetected called once per QR found
 * @param {(error: {kind: string, message: string}) => void} props.onError
 */
export function QrScanner({ running = false, onDetected, onError }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(null)
  const busyRef = useRef(false)
  // When the last frame was ANALYSED, and when the last QR was FOUND. They
  // are two different clocks: the first throttles the work, the second keeps
  // the same paper from firing twice.
  const lastFrameAtRef = useRef(0)
  const lastFoundRef = useRef({ value: '', at: 0 })
  const detectedRef = useRef(onDetected)
  const errorRef = useRef(onError)
  const loopRef = useRef(null)
  const stopRef = useRef(() => {})
  const teardownRef = useRef(() => {})

  const [status, setStatus] = useState('idle') // idle | starting | running
  const [error, setError] = useState(null)
  const [detector, setDetector] = useState(null)

  // The latest callbacks, without writing to a ref during render.
  useEffect(() => {
    detectedRef.current = onDetected
    errorRef.current = onError
  }, [onDetected, onError])

  // The native detector, when the browser has one. Created once, and only
  // when the browser supports it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('BarcodeDetector' in window)) return
    let cancelled = false
    const supported = window.BarcodeDetector.getSupportedFormats?.()
    if (Array.isArray(supported) && supported.length && !supported.includes('qr_code')) return
    Promise.resolve()
      .then(() => new window.BarcodeDetector({ formats: ['qr_code'] }))
      .then((instance) => {
        if (!cancelled) setDetector(instance)
      })
      .catch(() => {
        // The native detector is an optimisation, never a requirement.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stop = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
    }
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    setStatus('idle')
  }, [])

  // The teardown on its own — no state change. Used where the camera is
  // closed without the component needing to redraw (leaving the page).
  const teardown = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
    }
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
  }, [])

  useEffect(() => {
    stopRef.current = stop
    teardownRef.current = teardown
  }, [stop, teardown])

  // Leaving the page must turn the camera off.
  useEffect(() => () => teardownRef.current(), [])

  // Read one frame and look for a QR in it.
  const detectFrame = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) return null

    if (detector) {
      try {
        const codes = await detector.detect(video)
        if (codes && codes.length) return codes[0]?.rawValue ?? null
      } catch {
        // A frame that cannot be analysed is not an error worth shouting about.
      }
      return null
    }

    const image = drawToCanvas(video, video.videoWidth, video.videoHeight)
    if (!image) return null
    const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
    return result?.data ?? null
  }, [detector])

  // The scan loop. It lives in a ref so that it can call itself without the
  // component having to re-create the camera every time the loop changes.
  useEffect(() => {
    loopRef.current = async () => {
      frameRef.current = requestAnimationFrame(() => {
        void loopRef.current?.()
      })
      const now = performance.now()
      if (busyRef.current || now - lastFrameAtRef.current < SCAN_INTERVAL_MS) return
      busyRef.current = true
      lastFrameAtRef.current = now
      try {
        const value = await detectFrame()
        if (!value) return
        // The same paper sitting in front of the lens must not fire twice.
        if (value === lastFoundRef.current.value && now - lastFoundRef.current.at < DUPLICATE_WINDOW_MS) return
        lastFoundRef.current = { value, at: now }
        detectedRef.current?.(value)
      } catch {
        // ignore a bad frame
      } finally {
        busyRef.current = false
      }
    }
  }, [detectFrame])

  const start = useCallback(async () => {
    setError(null)
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      const failure = {
        kind: CAMERA_ERRORS.INSECURE,
        message:
          'The camera needs a secure connection. Open this dashboard over HTTPS (or on localhost) and try again — a plain http:// address on a phone is blocked by the browser.',
      }
      setStatus('idle')
      setError(failure)
      errorRef.current?.(failure)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const failure = {
        kind: CAMERA_ERRORS.UNSUPPORTED,
        message: 'This browser cannot open a camera. Upload a photo of the QR instead.',
      }
      setStatus('idle')
      setError(failure)
      errorRef.current?.(failure)
      return
    }

    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        try {
          await video.play()
        } catch {
          // Some browsers refuse to play until the element is visible; the
          // loop below still reads frames once the user taps the screen.
        }
      }
      lastFrameAtRef.current = 0
      lastFoundRef.current = { value: '', at: 0 }
      setStatus('running')
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        void loopRef.current?.()
      })
    } catch (err) {
      const kind = cameraErrorKind(err)
      const messages = {
        [CAMERA_ERRORS.PERMISSION]:
          'Camera access was refused. Allow the camera for this site in the browser, then press Start scan again.',
        [CAMERA_ERRORS.NO_CAMERA]:
          'No camera was found on this device. Upload a photo of the QR or type the code by hand instead.',
        [CAMERA_ERRORS.BUSY]:
          'The camera is already in use by another app. Close it and try again.',
        [CAMERA_ERRORS.INIT_FAILED]:
          'The camera could not be started. Upload a photo of the QR or type the code by hand instead.',
      }
      const failure = { kind, message: messages[kind] ?? messages[CAMERA_ERRORS.INIT_FAILED] }
      setStatus('idle')
      setError(failure)
      errorRef.current?.(failure)
    }
  }, [])

  // The camera follows the `running` prop: it opens when it turns on and
  // closes the moment it turns off.
  useEffect(() => {
    if (running) {
      void start()
      return
    }
    // Nothing to close means nothing to redraw — so the idle page never
    // flips state on the way in.
    if (streamRef.current || frameRef.current) stop()
  }, [running, start, stop])

  const live = status === 'running'

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-neutral-950 sm:aspect-[16/10]">
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-contain"
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
        />

        {live && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-neutral-950/25" />
            <div className="absolute left-1/2 top-1/2 aspect-square w-[62%] max-w-[260px] -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-0 top-0 size-6 rounded-tl-lg border-l-2 border-t-2 border-white/90" />
              <span className="absolute right-0 top-0 size-6 rounded-tr-lg border-r-2 border-t-2 border-white/90" />
              <span className="absolute bottom-0 left-0 size-6 rounded-bl-lg border-b-2 border-l-2 border-white/90" />
              <span className="absolute bottom-0 right-0 size-6 rounded-br-lg border-b-2 border-r-2 border-white/90" />
              <span className="absolute inset-x-2 top-2 h-px animate-pulse bg-white/70" />
            </div>
          </div>
        )}

        {!live && (
          <div className="absolute inset-0 grid place-items-center bg-background/95 px-6 text-center">
            <div className="space-y-2">
              {status === 'starting' ? (
                <>
                  <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
                  <p className="text-sm font-medium">Opening the camera…</p>
                </>
              ) : (
                <>
                  <CameraOff className="mx-auto size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">The camera is off</p>
                  <p className="text-xs text-muted-foreground">
                    Nothing is recorded and nothing is sent anywhere — the picture never leaves this page.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {live ? (
          <>
            <ScanLine className="size-4 shrink-0" />
            <span>Hold the paper flat and fill the frame — the scan happens on this device.</span>
          </>
        ) : (
          <>
            <Camera className="size-4 shrink-0" />
            <span>Press “Start scan” to open the camera.</span>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  )
}

export default QrScanner
