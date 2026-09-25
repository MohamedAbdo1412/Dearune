import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ProjectBadge } from '@/components/stage-badge'
import { DearuneActions } from '@/components/admin/DearuneActions'
import { WRAPPER_LABELS } from '@/services/constants'
import { formatDateTime, formatMoney } from '@/services/format'

// One Dearune, one line: who it is for, what paper it is, where it stands in
// the pipeline, and the next thing the studio has to do about it. Shared by
// the Designers shelf and a single designer's page so both read the same.
export function DearuneList({ projects, catalog, maintenance, onChanged, basePath, empty }) {
  if (!projects?.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty ?? 'No Dearunes yet.'}</p>
  }

  const paperFor = (slug) => catalog?.templates?.find((t) => t.slug === slug)?.name ?? slug ?? ''

  return (
    <div className="space-y-1.5">
      {projects.map((project) => (
        <div
          key={project.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/40"
        >
          <Link to={`${basePath}/${project.id}`} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="font-mono text-xs text-muted-foreground">{project.reference ?? project.id.slice(0, 8)}</span>
                {' · '}
                {project.title || 'Untitled'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {paperFor(project.template_slug)}
                {project.template_version ? ` v${project.template_version}` : ''}
                {project.wrapper_type ? ` · ${WRAPPER_LABELS[project.wrapper_type] ?? project.wrapper_type}` : ' · no wrapper chosen'}
                {' · '}
                {formatDateTime(project.configured_at ?? project.submitted_at)}
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
              {project.paid_at ? formatMoney(project.sale_price, project.currency ?? 'EGP') : 'not sold'}
            </span>
            <ProjectBadge project={project} />
            <DearuneActions project={project} maintenance={maintenance} onChanged={onChanged} />
          </div>
        </div>
      ))}
    </div>
  )
}
