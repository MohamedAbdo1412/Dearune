import { cn } from '@/lib/utils'

export function BrandMark({ className }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg border border-foreground/15 bg-foreground/[0.03] font-heading text-lg leading-none tracking-tight text-foreground',
        className,
      )}
      aria-hidden
    >
      D
    </span>
  )
}

export function DearuneWordmark({ className }) {
  return (
    <span className={cn('font-heading text-xl leading-none tracking-tight', className)}>
      Dearune
    </span>
  )
}

export function Brand({ className, markClassName }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className={markClassName} />
      <DearuneWordmark />
    </span>
  )
}