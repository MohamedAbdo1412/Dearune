import { orderStage, STAGE_LABELS, projectStage, PROJECT_STAGE_LABELS } from '@/services/constants'
import { cn } from '@/lib/utils'

const STAGE_STYLES = {
  pending: 'bg-muted text-muted-foreground ring-muted-foreground/20',
  'in-production': 'bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-400',
  manufactured: 'bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-400',
  shipped: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-400',
  delivered: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-400',
  cancelled: 'bg-destructive/10 text-destructive ring-destructive/20',
  deleted: 'bg-muted text-muted-foreground ring-muted-foreground/20',
}

export function StageBadge({ order, publishedAt = null, className }) {
  const stage = orderStage(order, publishedAt)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        STAGE_STYLES[stage],
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', stage === 'delivered' ? 'bg-emerald-500' : stage === 'cancelled' ? 'bg-destructive' : 'bg-current opacity-70')} />
      {STAGE_LABELS[stage]}
    </span>
  )
}

// The Dearune pipeline is ONE set of stages — the same `projects.milestone`
// values the Operations dashboard and the Worker dashboard read. There is no
// separate "project stage" vocabulary any more.
const PROJECT_STYLES = {
  configured: 'bg-muted text-muted-foreground ring-muted-foreground/20',
  sold: 'bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-400',
  making: 'bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-400',
  shipping: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-400',
  delivery: 'bg-indigo-500/10 text-indigo-700 ring-indigo-600/20 dark:text-indigo-400',
  delivered: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-400',
  after_sale: 'bg-teal-500/10 text-teal-700 ring-teal-600/20 dark:text-teal-400',
  archived: 'bg-muted text-muted-foreground ring-muted-foreground/40',
}

export function ProjectBadge({ project, className }) {
  const stage = projectStage(project)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        PROJECT_STYLES[stage] ?? PROJECT_STYLES.configured,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', stage === 'delivered' ? 'bg-emerald-500' : stage === 'archived' ? 'bg-muted-foreground/50' : 'bg-current opacity-70')} />
      {PROJECT_STAGE_LABELS[stage] ?? stage}
    </span>
  )
}