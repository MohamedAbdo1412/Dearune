import { Link } from 'react-router-dom'
import { Factory, LifeBuoy, MessageCircle, PackageCheck, Truck } from 'lucide-react'
import { ORDER_SECTIONS } from '@/services/ops-orders'
import { cn } from '@/lib/utils'

// The four subsections of Operations.
//
// They are LINKS to four filtered views of one record set, never four copies
// of an order. The count beside each one is the number of orders the database
// currently places there, so the badge and the list can never disagree.

const ICONS = {
  making: Factory,
  shipping: Truck,
  delivery: PackageCheck,
  'after-sale': LifeBuoy,
  unopened: MessageCircle,
}

function sectionTotal(counts, section) {
  if (!counts) return null
  if (section.key === 'delivery') return (counts.delivery ?? 0) + (counts.delivered ?? 0)
  return counts[section.milestone] ?? 0
}

export function OperationsSectionNav({ activeKey, counts, unopenedCount = 0 }) {
  return (
    <nav aria-label="Operations subsections" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {ORDER_SECTIONS.map((section) => {
        const Icon = ICONS[section.key] ?? Factory
        const active = section.key === activeKey
        let total = sectionTotal(counts, section)
        if (section.key === 'unopened') total = unopenedCount
        return (
          <Link
            key={section.key}
            to={section.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-start gap-3 rounded-xl border bg-background px-3.5 py-3 transition-colors',
              active ? 'border-foreground/25 bg-secondary/60' : 'hover:bg-muted/60',
            )}
          >
            <span
              className={cn(
                'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
                active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{section.label}</span>
                <span className="shrink-0 font-heading text-sm tabular-nums text-muted-foreground">
                  {total === null ? '—' : total}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{section.description}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
