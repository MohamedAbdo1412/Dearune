import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { InstallAppAction } from '@/components/install-app'
import '@/styles/landing.css'

const NAV = [
  { href: '#house', label: 'The name' },
  { href: '#craft', label: 'How a letter is made' },
  { href: '#keepsakes', label: 'What stays' },
  { href: '#occasions', label: 'Occasions' },
]

const CHAPTERS = [
  {
    numeral: 'i',
    head: 'Written by hand',
    body:
      'A designer opens the studio with a private code and sets the words for one person — a greeting, the message, a close, and the name it is signed with. It is written once, for one reader.',
    aside: 'Photographs, a kept voice, and the language it was thought in are chosen while the letter is still being made.',
  },
  {
    numeral: 'ii',
    head: 'Set and sealed',
    body:
      'The words are set on aged paper and printed as an insert that carries a unique code. The letter is wrapped as a gift — and it stays closed until the person it is meant for decides to open it.',
    aside: 'The paper can travel as a keepsake, or remain a digital letter opened from a private page.',
  },
  {
    numeral: 'iii',
    head: 'Opened by them alone',
    body:
      'The recipient scans the printed code or follows their private link. Where a password was set, the letter meets them with a lock first — and opens only for the one who holds it.',
    aside: 'Opening begins the reading window; the link is not meant to be passed around.',
  },
]

const KEEPSAKES = [
  {
    title: 'A letter, printed',
    body: 'The words are set on the page as they were written, on paper chosen to be kept rather than thrown away.',
  },
  {
    title: 'Prints and a kept voice',
    body: 'Up to three photographs and a sound may live beside the letter, laid by hand rather than gridded.',
  },
  {
    title: 'A private way in',
    body: 'A unique code on the insert — and, when chosen, a password — keeps the letter for its reader.',
  },
]

const OCCASIONS = [
  'an anniversary',
  'a birthday',
  'a love letter',
  'a friendship',
  'a thank you',
  'a farewell',
  'a milestone worth marking',
]

export function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className={`landing${menuOpen ? ' menu-open' : ''}`}>
      <header className="landing-masthead">
        <div className="landing-wrap landing-masthead-inner">
          <Link to="/" className="landing-wordmark" aria-label="Dearune, home">
            <span className="seal-dot" aria-hidden="true" />
            Dearune
          </Link>

          <nav id="landing-nav" className="landing-nav" aria-label="Primary">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
            <Link to="/create" className="nav-studio" onClick={() => setMenuOpen(false)}>
              Designer studio
            </Link>
            <Link to="/admin/login" onClick={() => setMenuOpen(false)}>
              Admin
            </Link>
          </nav>

          <button
            type="button"
            className="landing-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="landing-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-wrap landing-hero-grid">
            <div>
              <p className="hero-kicker">A house of written keepsakes</p>
              <h1 className="hero-title">
                Some words are meant to <span className="hero-em">last</span>.
              </h1>
              <p className="hero-lede">
                Dearune sets a few chosen words on aged paper — a letter written for one person,
                sealed, and opened by them alone.
              </p>
              <div className="hero-actions">
                <Link to="/create" className="landing-btn landing-btn--ink">
                  Begin a letter
                  <ArrowRight className="size-4 btn-arrow" aria-hidden="true" />
                </Link>
                <a href="#craft" className="landing-btn landing-btn--ghost">
                  See how a letter is made
                </a>
              </div>
              <p className="hero-note">Every Dearune is written by hand, one at a time.</p>
              <InstallAppAction />
            </div>

            <figure className="hero-mount">
              <span className="hero-postmark" aria-hidden="true">
                Dearune
                <br />
                Paris
              </span>
              <div className="hero-mount-inner">
                <img
                  src="/brand/correspondence.jpg"
                  alt="A Dearune keepsake letter, photographed on aged paper"
                  width="1400"
                  height="1400"
                  fetchPriority="high"
                />
              </div>
              <span className="hero-seal" aria-hidden="true">
                D
              </span>
            </figure>
          </div>

          <div className="landing-wrap">
            <div className="hero-rule" aria-hidden="true">
              <span className="rule-fleuron">· · ·</span>
            </div>
          </div>
        </section>

        <section id="house" className="landing-spread">
          <div className="landing-wrap name-grid">
            <div className="name-monogram" aria-hidden="true">
              D
            </div>
            <div>
              <p className="spread-label">The name</p>
              <h2 className="spread-title">Two old words, held together.</h2>
              <div style={{ marginTop: '26px' }}>
                <div className="entry">
                  <span className="entry-term">Dear</span>
                  <p className="entry-def">someone or something loved, precious, close to the heart.</p>
                </div>
                <div className="entry">
                  <span className="entry-term">Rune</span>
                  <p className="entry-def">
                    an ancient symbol, carved to endure — a message that outlives the moment it was spoken.
                  </p>
                </div>
              </div>
              <p className="name-meet">Dearune is where the two meet: words you love, set to stay.</p>
            </div>
          </div>
        </section>

        <section id="craft" className="landing-spread landing-spread--tinted">
          <div className="landing-wrap">
            <p className="spread-label">The making</p>
            <h2 className="spread-title">How a letter is made.</h2>
            <p className="spread-lede">
              Three hands are involved — the one who writes, the one who wraps, and the one who opens.
              Nothing about a Dearune is mass produced.
            </p>

            <div className="craft">
              {CHAPTERS.map((step) => (
                <article className="craft-step" key={step.numeral}>
                  <div className="craft-numeral" aria-hidden="true">
                    {step.numeral}
                  </div>
                  <div>
                    <h3 className="craft-head">{step.head}</h3>
                    <p className="craft-body">{step.body}</p>
                  </div>
                  <p className="craft-aside">{step.aside}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="keepsakes" className="landing-spread">
          <div className="landing-wrap">
            <p className="spread-label">What stays</p>
            <h2 className="spread-title">A letter you can hold.</h2>
            <p className="spread-lede">
              The keepsake is the letter itself — its paper, its prints, the voice kept beside it.
              What was said only once finds a place that lasts a little longer.
            </p>

            <div className="keepsake-grid">
              <figure className="keepsake-figure keepsake-figure--a">
                <img className="keepsake-photo" src="/brand/keepsake-a.jpg" alt="A Dearune keepsake, warmly lit on a dark surface" width="1000" height="1250" loading="lazy" />
                <figcaption>A keepsake meant to be kept, not thrown away.</figcaption>
              </figure>
              <figure className="keepsake-figure keepsake-figure--b">
                <img className="keepsake-photo" src="/brand/keepsake-b.jpg" alt="A Dearune keepsake, photographed close up" width="1000" height="1250" loading="lazy" />
                <figcaption>Prints laid by hand beside the words, each one chosen.</figcaption>
              </figure>
              <div className="keepsake-col" aria-hidden="true">
                Dearune · no. 001
              </div>
            </div>

            <ul className="keepsake-list">
              {KEEPSAKES.map((item) => (
                <li key={item.title}>
                  <b>{item.title}</b>
                  {item.body}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="occasions" className="landing-spread landing-spread--tinted">
          <div className="landing-wrap">
            <p className="spread-label">Occasions</p>
            <h2 className="spread-title">Some things deserve more than a text.</h2>
            <p className="occasions-run">
              {OCCASIONS.map((occasion, index) => (
                <span key={occasion}>
                  {index > 0 ? <span className="occ-fleuron">❧</span> : null}
                  <span className="occ-item">{occasion}</span>
                </span>
              ))}
              <span className="occ-fleuron">❧</span>
              <span className="occasions-word">and the quiet ones.</span>
            </p>
          </div>
        </section>
      </main>

      <section className="landing-closing">
        <div className="landing-wrap">
          <div className="closing-seal" aria-hidden="true">
            D
          </div>
          <h2 className="closing-title">Set your words to stay.</h2>
          <p className="closing-slogan">Some words are meant to last.</p>
          <div className="closing-actions">
            <Link to="/create" className="landing-btn landing-btn--ink">
              Begin a letter
              <ArrowRight className="size-4 btn-arrow" aria-hidden="true" />
            </Link>
            <a href="#craft" className="landing-btn landing-btn--ghost">
              See how a letter is made
            </a>
          </div>
          <p className="closing-alt">
            Already making a Dearune? <Link to="/create">Open the designer studio</Link>.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-wrap landing-footer-inner">
          <span className="footer-brand">Dearune</span>
          <span className="footer-slogan">Some words are meant to last.</span>
          <nav className="footer-links" aria-label="Footer">
            <Link to="/create">Designer studio</Link>
            <Link to="/admin/login">Admin</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
