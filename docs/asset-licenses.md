# Asset Licenses

Dearune ships no third-party image or audio assets. Typography and
dependencies are the only bundled third-party material; everything drawn for
the book UI (page ornaments, the push-pin, the antique key, the seal marks)
is original artwork produced for this project.

## Fonts

All are loaded from the `@fontsource` packages (self-hosted, OFL-1.1).

| Font | Version | License | Use |
| --- | --- | --- | --- |
| Amiri | 5.3.0 | SIL OFL 1.1 | Arabic/persuasive memorial letter (`amiri-arabic-400/700`) |
| EB Garamond | 5.3.0 | SIL OFL 1.1 | Latin serif faces across the site |
| Pinyon Script | 5.3.0 | SIL OFL 1.1 | Handwriting accents |
| Fraunces (variable) | 5.3.0 | SIL OFL 1.1 | Display/heading face |
| Geist (variable) | 5.3.0 | SIL OFL 1.1 | UI sans |

OFL-1.1 permits bundling and redistribution; the included font files keep
their original copyright notices, which is sufficient under the license terms.

## Audio

None. Every sound in the book is synthesized at runtime with the Web Audio
API (`src/services/sound.js`) — page lifts, settles, ink touches, pins, and
the key insert/turn. There are no audio asset files to license.

## JavaScript / runtime libraries

| Package | Version | License |
| --- | --- | --- |
| react, react-dom | 19 | MIT |
| @supabase/supabase-js | 2 | MIT |
| react-router-dom | 7 | MIT |
| react-easy-crop | 6.2.3 | MIT |
| pdf-lib | 1.17.1 | MIT |
| qrcode | 1.5.4 | MIT |
| sonner | 2.0.8 | MIT |
| zod | 4 | MIT |
| lucide-react | 1 | ISC |
| radix-ui / shadcn components | 1 | MIT |
| vite, vitest, oxlint (build tooling) | — | MIT (respectively) |

## Imagery

No stock photography, icon packs, or third-party image assets are used. The
image files under `public/` are project mockups/artwork owned by Dearune.