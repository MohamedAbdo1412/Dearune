import { cn } from '@/lib/utils'

// Operations status replaced by milestones. Badge maps milestone values to
// display phases.
const PHASE_OF = {
  pending: 'queued',
  sold: 'workshop',
  manufactured: 'workshop',
  shipped: 'shipped',
  delivered: 'delivered',
}

const PHASE_STYLES = {
  queued: 'bg-muted text-muted-foreground ring-muted-foreground/20',
  workshop: 'bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-400',
  shipped: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-400',
  delivered: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-400',
}

const PHASE_DOTS = {
  queued: 'bg-muted-foreground/50',
  workshop: 'bg-violet-500',
  shipped: 'bg-sky-500',
  delivered: 'bg-emerald-500',
}

export function OperationsBadge({ status, label, className }) {
  const phase = PHASE_OF[status] ?? 'queued'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        PHASE_STYLES[phase],
        className,
      )}
      title={label}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', PHASE_DOTS[phase])} />
      {label ?? status}
    </span>
  )
}

export { PHASE_OF as OPERATIONS_STATUS_PHASES }
