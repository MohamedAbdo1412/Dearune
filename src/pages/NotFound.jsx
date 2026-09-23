import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[oklch(0.97_0.004_90)] px-6 text-center">
      <Sparkles className="size-10 text-primary/60" />
      <h1 className="font-heading text-3xl">This page wandered off</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may be broken — or the words were never written. Either way, nothing lives here.
      </p>
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">
        <ArrowLeft className="size-4" />
        Back to Dearune
      </Link>
    </div>
  )
}