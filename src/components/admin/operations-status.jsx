import { cn } from '@/lib/utils'

// A unit's place on the workshop line, in the same visual language as the
// Dearune's own pipeline badge so the two screens read as one system.
//
// The 16 statuses group into phases: queue → press → workshop → packing →
// courier, with `on_hold` and `cancelled` sitting outside the line entirely.
const PHASE_OF = {
  pending_verification: 'queued',
  information_verified: 'queued',
  ready_to_print: 'printing',
  printing: 'printing',
  printed: 'printing',
  qr_verified: 'workshop',
  manufacturing: 'workshop',
  quality_control: 'workshop',
  qc_passed: 'workshop',
  ready_for_packaging: 'packing',
  packed: 'packing',
  ready_for_shipment: 'packing',
  shipped: 'shipped',
  delivered: 'delivered',
  on_hold: 'held',
  cancelled: 'cancelled',
}

const PHASE_STYLES = {
  queued: 'bg-muted text-muted-foreground ring-muted-foreground/20',
  printing: 'bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-400',
  workshop: 'bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-400',
  packing: 'bg-orange-500/10 text-orange-700 ring-orange-600/20 dark:text-orange-400',
  shipped: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-400',
  delivered: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-400',
  held: 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-400',
  cancelled: 'bg-destructive/10 text-destructive ring-destructive/20',
}

const PHASE_DOTS = {
  queued: 'bg-muted-foreground/50',
  printing: 'bg-amber-500',
  workshop: 'bg-violet-500',
  packing: 'bg-orange-500',
  shipped: 'bg-sky-500',
  delivered: 'bg-emerald-500',
  held: 'bg-rose-500',
  cancelled: 'bg-destructive',
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
