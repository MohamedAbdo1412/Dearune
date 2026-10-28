// Original push-pin artwork (drawn for Dearune; no external asset used). A
// press-stud head like the ones on a bulletin board: a gently domed crown, a
// crisp circumferential seat, a luminescent specular sweep across the dome,
// and a tapered steel needle entering the paper on a diagonal. The pin reads
// as a small object casting a real shadow, not a cartoon icon.

const PIN_COLORS = {
  burgundy: {
    crown: '#b96a60',
    body: '#7d3b33',
    rim: '#54261f',
    seat: '#3f1d18',
    glow: 'rgba(255, 226, 208, 0.85)',
    sheen: 'rgba(255, 250, 245, 0.5)',
  },
  brass: {
    crown: '#e4c069',
    body: '#a87f3c',
    rim: '#71521f',
    seat: '#55380f',
    glow: 'rgba(255, 248, 224, 0.9)',
    sheen: 'rgba(255, 254, 246, 0.45)',
  },
  forest: {
    crown: '#6d8763',
    body: '#45593c',
    rim: '#2b3a25',
    seat: '#1c2717',
    glow: 'rgba(226, 242, 214, 0.8)',
    sheen: 'rgba(244, 250, 240, 0.4)',
  },
}

export const PIN_NAMES = ['burgundy', 'brass', 'forest']

// A seated pin. `at` positions the wrapper; the pin draws itself pointing
// toward the lower-right with its highlight, a soft cast shadow on the paper,
// and the needle's own thin shadow along its axis.
export default function PushPin({ color = 'brass', size = 26, style }) {
  const c = PIN_COLORS[color] ?? PIN_COLORS.brass
  return (
    <span className="pin" style={{ width: size, height: size * 1.6, ...style }} aria-hidden="true">
      <svg viewBox="0 0 40 64" width="100%" height="100%" role="img">
        <defs>
          <radialGradient id={`pin-crown-${color}`} cx="33%" cy="24%" r="95%">
            <stop offset="0%" stopColor={c.crown} />
            <stop offset="46%" stopColor={c.body} />
            <stop offset="88%" stopColor={c.rim} />
            <stop offset="100%" stopColor={c.seat} />
          </radialGradient>
          <linearGradient id={`pin-base-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.body} />
            <stop offset="100%" stopColor={c.seat} />
          </linearGradient>
        </defs>

        {/* cast shadow on the paper */}
        <ellipse cx="22" cy="56.5" rx="13.5" ry="3.4" fill="rgba(24,14,6,0.32)" />
        <ellipse cx="22" cy="56.5" rx="8.5" ry="1.9" fill="rgba(24,14,6,0.28)" />

        {/* the needle entering the paper, slightly off its own shadow */}
        <path d="M20 34 L20 55" stroke="#6b625a" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20.6 34 L20.6 54.5" stroke="#c9c2b8" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />

        {/* crown: domed head with a circumferential seat */}
        <path
          d="M12.5 15.5 Q13 8.5 20 8 Q27 8.5 27.5 15.5 Q27.2 21.5 23.4 24 Q21.8 25 20 25 Q18.2 25 16.6 24 Q12.8 21.5 12.5 15.5 Z"
          fill={c.crown}
        />
        <path
          d="M12.5 15.5 Q13 8.5 20 8 Q27 8.5 27.5 15.5 Q27.2 21.5 23.4 24 Q21.8 25 20 25 Q18.2 25 16.6 24 Q12.8 21.5 12.5 15.5 Z"
          fill={`url(#pin-crown-${color})`}
        />
        {/* seat rim */}
        <ellipse cx="20" cy="24.6" rx="7.9" ry="1.8" fill={c.seat} />
        <path d="M12.8 16.5 Q20 13.8 27.2 16.5" stroke={c.seat} strokeWidth="1.4" fill="none" opacity="0.55" />
        {/* specular sweep */}
        <path d="M15.6 11.5 Q17.6 9.3 21.4 9.4 Q17.8 10.6 16.2 13.2 Z" fill={c.glow} opacity="0.85" />
        <ellipse cx="15.2" cy="14.4" rx="2.6" ry="4.2" fill={c.sheen} transform="rotate(-16 15.2 14.4)" opacity="0.9" />
        {/* tiny factory knock */}
        <circle cx="23.6" cy="12.6" r="0.8" fill={c.glow} opacity="0.6" />
      </svg>
    </span>
  )
}