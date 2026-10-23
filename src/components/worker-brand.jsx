import { DearuneWordmark } from '@/components/brand'
import { cn } from '@/lib/utils'

/**
 * The worker lockup reuses the Dearune "D" and wordmark, then adds a small
 * royal-blue "Worker" tag. It is deliberately complementary to the black
 * admin lockup rather than a second, unrelated brand.
 */
export function WorkerMark({ className }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary font-heading text-xl leading-none tracking-tight text-primary-foreground shadow-sm shadow-primary/25',
        className,
      )}
      aria-hidden
    >
      D
    </span>
  )
}

export function WorkerBrand({ className, compact = false, tagClassName }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <WorkerMark />
      <span className="inline-flex min-w-0 flex-col leading-none">
        <DearuneWordmark className={cn('text-xl', compact && 'text-lg')} />
        <span
          className={cn(
            'mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-primary',
            tagClassName,
          )}
        >
          Worker
        </span>
      </span>
    </span>
  )
}
