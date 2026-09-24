// Original push-pin artwork (drawn for Dearune; no external asset used). A
// domed head with a soft highlight, a seated shadow, and a hint of needle —
// just enough to read as a real pin through the paper without being cartoonish.

const PIN_COLORS = {
  burgundy: {
    headTop: '#a4554e',
    headBase: '#6f2f2b',
    rim: '#4a1f1c',
    glow: 'rgba(255, 214, 190, 0.55)',
  },
  brass: {
    headTop: '#d9b779',
    headBase: '#8a6731',
    rim: '#5d4219',
    glow: 'rgba(255, 246, 220, 0.6)',
  },
  forest: {
    headTop: '#57704f',
    headBase: '#35432f',
    rim: '#1e281b',
    glow: 'rgba(220, 240, 205, 0.5)',
  },
}

export const PIN_NAMES = ['burgundy', 'brass', 'forest']

// A seated pin. `at` positions the wrapper (top-left corner of a slot); the
// pin draws itself pointing toward the lower-right with its highlight and a
// soft drop shadow on the paper.
export default function PushPin({ color = 'brass', size = 26, style }) {
  const c = PIN_COLORS[color] ?? PIN_COLORS.brass
  return (
    <span className="pin" style={style} aria-hidden="true">
      <svg width={size} height={size * 1.9} viewBox="0 0 40 76">
        <defs>
          <radialGradient id="head" cx="32%" cy="26%" r="90%">
            <stop offset="0%" stopColor={c.headTop} />
            <stop offset="55%" stopColor={c.headBase} />
            <stop offset="100%" stopColor={c.rim} />
          </radialGradient>
          <filter id="pinShadow" x="-40%" y="-40%" width="180%" height="220%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <ellipse cx="20" cy="66" rx="15" ry="4.5" fill="rgba(30,18,8,0.4)" filter="url(#pinShadow)" />
        <path d="M20 5 L17.5 34 Q17 38 20 40 Q23 38 22.5 34 Z" fill="url(#head)" stroke="rgba(30,16,8,0.5)" strokeWidth="1" />
        <ellipse cx="14.5" cy="14" rx="3.2" ry="5.5" fill={c.glow} transform="rotate(-18 14.5 14)" />
        <path d="M20 40 L20 62" stroke="rgba(38,24,14,0.85)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20 60 l-4.4 10 q0.6 1.6 4.4 4 M20 60 l4.4 10 q-0.6 1.6 -4.4 4" fill="#b98d52" stroke="rgba(30,16,8,0.7)" strokeWidth="1" opacity="0.92" />
      </svg>
    </span>
  )
}