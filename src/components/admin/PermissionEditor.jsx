import { useId } from 'react'
import { Check, Minus, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  PERMISSION_MODULES,
  hasPermission,
  permissionSummaryText,
  togglePermission,
} from '@/lib/permissions'

/**
 * Grouped permission checkboxes shared by worker creation and worker detail.
 *
 * The editor never invents access: unchecking a read gate removes the
 * capabilities that depend on it, and checking a capability adds only the
 * non-sensitive read gate. Financial categories are never auto-selected.
 */
export function PermissionEditor({ value = [], onChange, disabled = false, idPrefix, className }) {
  const generated = useId()
  const prefix = idPrefix ?? generated
  const selected = Array.isArray(value) ? value : []

  const toggle = (permissionId) => {
    if (disabled) return
    const checked = !hasPermission(selected, permissionId)
    onChange?.(togglePermission(selected, permissionId, checked))
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid gap-3 lg:grid-cols-2">
        {PERMISSION_MODULES.map((module) => {
          const open = hasPermission(selected, module.viewPermission)
          const grantedCount = module.permissions.filter((permission) => hasPermission(selected, permission.id)).length
          return (
            <section
              key={module.id}
              className={cn(
                'rounded-xl border p-3.5',
                open ? 'border-primary/30 bg-primary/[0.035]' : 'border-border bg-muted/20',
              )}
              aria-labelledby={`${prefix}-${module.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 id={`${prefix}-${module.id}`} className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {module.label}
                    {module.sensitive ? (
                      <Badge variant="outline" className="text-[0.6rem]">
                        <ShieldAlert className="size-3" aria-hidden />
                        Sensitive
                      </Badge>
                    ) : null}
                  </h4>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{module.description}</p>
                </div>
                <Badge variant="outline" className={cn('shrink-0 text-[0.62rem]', open && 'border-primary/30 text-primary')}>
                  {grantedCount > 0 ? `${grantedCount} selected` : 'None'}
                </Badge>
              </div>

              <ul className="mt-3 space-y-1">
                {module.permissions.map((permission) => {
                  const checked = hasPermission(selected, permission.id)
                  const id = `${prefix}-${permission.id.replaceAll('.', '-')}`
                  return (
                    <li key={permission.id}>
                      <label
                        htmlFor={id}
                        className={cn(
                          'group flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60',
                          disabled && 'cursor-not-allowed opacity-70',
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={() => toggle(permission.id)}
                          aria-describedby={`${id}-description`}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm leading-5">
                            {permission.label}
                            {permission.id === module.viewPermission ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[0.58rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                                <ShieldCheck className="size-2.5" aria-hidden />
                                Gate
                              </span>
                            ) : null}
                          </span>
                          <span id={`${id}-description`} className="mt-0.5 block text-[0.7rem] leading-4 text-muted-foreground">
                            {permission.description}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="rounded-xl border border-border bg-muted/35 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-xs font-medium">Selected access</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{permissionSummaryText(selected)}</p>
            <p className="mt-1.5 text-[0.7rem] leading-4 text-muted-foreground">
              Selecting a capability also selects its read gate. Unselecting a gate removes everything
              that depends on it. No sensitive financial category is ever auto-selected.
            </p>
          </div>
        </div>
      </div>

      {selected.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <Minus className="size-3.5" aria-hidden />
          This worker will be able to sign in and see the account page only.
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          <Check className="size-3.5" aria-hidden />
          These permissions are saved explicitly; the database enforces them on every request.
        </p>
      )}
    </div>
  )
}
