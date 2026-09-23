import { Link } from 'react-router-dom'
import { ArrowRight, Feather, Lock, Mail } from 'lucide-react'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'

const TITLE = 'DEARUNE'
const SLOGAN = 'Some words are meant to last.'
const WHY = 'Dear — loved, precious, close to the heart. Rune — an ancient inscribed symbol, carved to endure. Dearune is where the two meet: words you love, carved into something that will outlive the moment.'

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-[oklch(0.986_0.002_80)] text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Brand />
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#why" className="transition-colors hover:text-foreground">Why Dearune</a>
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <Link to="/designer/login" className="transition-colors hover:text-foreground">Designers</Link>
          <Link to="/admin/login" className="transition-colors hover:text-foreground">Admin</Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-20 text-center md:py-28">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            {TITLE}
          </p>
          <h1 className="max-w-3xl font-heading text-4xl leading-tight tracking-tight md:text-6xl">
            {SLOGAN}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            A letter, a card, a promise — written once, delivered as a keepsake the
            recipient will hold long after the words are spoken.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href="#how">
              <Button size="lg">
                Start a message
                <ArrowRight className="size-4" />
              </Button>
            </a>
            <a href="#why">
              <Button size="lg" variant="outline">
                Our story
              </Button>
            </a>
          </div>
        </section>

        <section id="why" className="border-y bg-[oklch(0.97_0.004_90)]">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
            <div>
              <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
                The name
              </p>
              <h2 className="font-heading text-3xl tracking-tight md:text-4xl">
                Dear<span className="text-amber-800/80">une</span>
              </h2>
            </div>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {WHY}
            </p>
          </div>
        </section>

        <section id="how" className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
          <h2 className="mb-12 text-center font-heading text-3xl tracking-tight md:text-4xl">
            How it works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border bg-card p-8">
              <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Mail className="size-5" />
              </div>
              <h3 className="font-heading text-xl">1 · Handwritten words</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                A message is composed with care, shaped by a Dearune artisan to fit
                the person it is meant for.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-8">
              <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Feather className="size-5" />
              </div>
              <h3 className="font-heading text-xl">2 · Crafted, printed, sealed</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                A letter already yours, printed with quiet beauty and finished to
                last — wax, paper, and all.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-8">
              <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Lock className="size-5" />
              </div>
              <h3 className="font-heading text-xl">3 · Yours to keep</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                A private page unlocks the message as it arrives — and the words
                stay yours, forever.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row">
          <Brand />
          <p className="text-center">
            {TITLE} · {SLOGAN}
          </p>
          <p>
            <Link to="/designer/login" className="hover:text-foreground">Designer studio</Link>
            {' · '}
            <Link to="/admin/login" className="hover:text-foreground">Admin</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}