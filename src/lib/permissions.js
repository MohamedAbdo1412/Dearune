// The permission catalogue, mirrored from
// `supabase/migrations/20261023000001_workers_permissions.sql`.
//
// This file is presentation and convenience only. The database is the
// authority: every RPC and every RLS policy resolves the live
// `worker_permissions` rows. A tampered browser can change what this file
// returns, but it cannot make `worker_has_permission()` return true.
//
// Keep the ids and module names in sync with the SQL catalogue. `tests/
// worker-permissions.test.js` checks that the two lists agree.

export const PERMISSION_MODULES = [
  {
    id: 'operations',
    label: 'Operations',
    description: 'The production line: units, workshop status, notes, phone and archives.',
    viewPermission: 'operations.view',
    permissions: [
      {
        id: 'operations.view',
        label: 'View Operations',
        summary: 'View',
        description: 'Open the production list and see units, statuses and delivery details. Never exposes prices or costs.',
      },
      {
        id: 'operations.view_details',
        label: 'View full details',
        summary: 'Details',
        description: 'View the full detail panel, timeline events and related delivery/designer information for a unit.',
      },
      {
        id: 'operations.create',
        label: 'Open production units',
        summary: 'Add units',
        description: 'Add production units to a Dearune that was sold as more than one item.',
      },
      {
        id: 'operations.edit',
        label: 'Edit operational details',
        summary: 'Edit',
        description: 'Correct unit notes, the customer phone, or the designer attached to a unit. Never changes a price.',
      },
      {
        id: 'operations.update_status',
        label: 'Advance production status',
        summary: 'Status',
        description: 'Move a unit along the workshop status graph, or place it on hold / cancel it with a reason.',
      },
      {
        id: 'operations.assign',
        label: 'Assign designer',
        summary: 'Assign',
        description: 'Change the designer attached to a unit/Dearune.',
      },
      {
        id: 'operations.manage',
        label: 'Archive and restore units',
        summary: 'Archive',
        description: 'Hide or restore production units from the default Operations list. Archiving never deletes anything.',
      },
      {
        id: 'operations.print',
        label: 'Print production labels',
        summary: 'Print',
        description: 'Access printing and production label generation for units.',
      },
      {
        id: 'operations.export',
        label: 'Export operations data',
        summary: 'Export',
        description: 'Export operations lists and related data where available.',
      },
    ],
  },
  {
    id: 'designers',
    label: 'Designers',
    description: 'The designer directory and the Dearunes each designer handed over.',
    viewPermission: 'designers.view',
    permissions: [
      {
        id: 'designers.view',
        label: 'View designers',
        summary: 'View',
        description: "Open the designer directory and see each designer's projects. No money fields are included.",
      },
      {
        id: 'designers.view_details',
        label: 'View designer details',
        summary: 'Details',
        description: 'View full designer details, history and related Dearunes.',
      },
      {
        id: 'designers.create',
        label: 'Create designers',
        summary: 'Create',
        description: 'Create a new designer account and receive its one-time passcode.',
      },
      {
        id: 'designers.edit',
        label: 'Edit designers',
        summary: 'Edit',
        description: "Change a designer's name or sign-in ID.",
      },
      {
        id: 'designers.assign',
        label: 'Assign designers',
        summary: 'Assign',
        description: 'Assign or reassign designers to Dearunes/units.',
      },
      {
        id: 'designers.manage',
        label: 'Manage designer access',
        summary: 'Access',
        description: 'Reset a passcode, revoke access, or reactivate a designer.',
      },
      {
        id: 'designers.export',
        label: 'Export designers data',
        summary: 'Export',
        description: 'Export designer lists and related data where available.',
      },
    ],
  },
  {
    id: 'qa',
    label: 'QA',
    description: 'Resolve a printed Dearune QR to its unit, project and delivery record.',
    viewPermission: 'qa.view',
    permissions: [
      {
        id: 'qa.view',
        label: 'Use the QA desk',
        summary: 'QA desk',
        description: 'Resolve a printed Dearune QR to its project, physical units and delivery record. Read-only; no prices or costs.',
      },
    ],
  },
  {
    id: 'financial',
    label: 'Financial',
    description: 'Money is deliberately split into independent categories. Each one is granted on its own.',
    viewPermission: 'financial.view',
    sensitive: true,
    permissions: [
      {
        id: 'financial.view',
        label: 'Open the Financial section',
        summary: 'Open section',
        description: 'Open the Financial section. On its own this reveals no figures; each category below is granted separately.',
        sensitive: true,
      },
      {
        id: 'financial.view_revenue',
        label: 'View revenue',
        summary: 'Revenue',
        description: 'See money taken: totals, sales count and revenue breakdowns.',
        sensitive: true,
      },
      {
        id: 'financial.view_costs',
        label: 'View costs',
        summary: 'Costs',
        description: 'See estimated production costs and cost breakdowns.',
        sensitive: true,
      },
      {
        id: 'financial.view_customer_payables',
        label: 'View customer payables',
        summary: 'Customer payables',
        description: 'See what each customer owes (the selling price per Dearune). Does not grant revenue, cost or profit access by itself.',
        sensitive: true,
      },
      {
        id: 'financial.view_profit',
        label: 'View profit',
        summary: 'Profit',
        description: 'See estimated profit totals and margin.',
        sensitive: true,
      },
      {
        id: 'financial.view_payments',
        label: 'View payments',
        summary: 'Payments',
        description: 'See the sale/payment ledger: reference, amount, currency, status and date.',
        sensitive: true,
      },
      {
        id: 'financial.manage',
        label: 'Correct financial records',
        summary: 'Corrections',
        description: 'Void a completed sale with a reason while maintenance mode is on. Every correction is audited. Never changes a recorded price.',
        sensitive: true,
      },
      {
        id: 'financial.export',
        label: 'Export financial data',
        summary: 'Export',
        description: 'Download the figures the worker is already allowed to see. Does not grant any extra category.',
        sensitive: true,
      },
    ],
  },
  {
    id: 'messages',
    label: 'Messages & notifications',
    description: 'A private two-way thread between the worker and the studio admin.',
    viewPermission: 'messages.view',
    permissions: [
      {
        id: 'messages.view',
        label: 'Read messages',
        summary: 'Read',
        description: 'Read the private conversation between this worker and the studio admin.',
      },
      {
        id: 'messages.send',
        label: 'Send messages',
        summary: 'Send',
        description: 'Send a message to the studio admin. Reading is granted separately.',
      },
      {
        id: 'notifications.view',
        label: 'See unread notifications',
        summary: 'Unread badges',
        description: 'Show unread-message badges and in-app notification counts. Does not grant access to message content.',
      },
    ],
  },
]

export const PERMISSIONS = PERMISSION_MODULES.flatMap((module) =>
  module.permissions.map((permission) => ({
    ...permission,
    module: module.id,
    moduleLabel: module.label,
    sensitive: Boolean(permission.sensitive ?? module.sensitive),
  })),
)

export const PERMISSION_BY_ID = new Map(PERMISSIONS.map((permission) => [permission.id, permission]))
export const PERMISSION_MODULE_BY_ID = new Map(PERMISSION_MODULES.map((module) => [module.id, module]))
export const ALL_PERMISSION_IDS = PERMISSIONS.map((permission) => permission.id)
export const FINANCIAL_PERMISSION_IDS = PERMISSIONS.filter((permission) => permission.module === 'financial').map(
  (permission) => permission.id,
)

const PERMISSION_ORDER = new Map(ALL_PERMISSION_IDS.map((id, index) => [id, index]))

export function sortPermissionIds(ids) {
  return [...new Set((ids ?? []).filter((id) => PERMISSION_BY_ID.has(id)))].sort(
    (a, b) => (PERMISSION_ORDER.get(a) ?? 0) - (PERMISSION_ORDER.get(b) ?? 0),
  )
}

export function hasPermission(granted, id) {
  return Array.isArray(granted) && granted.includes(id)
}

export function hasAnyPermission(granted, ids) {
  if (!Array.isArray(granted)) return false
  return (ids ?? []).some((id) => granted.includes(id))
}

export function hasAllPermissions(granted, ids) {
  if (!Array.isArray(granted)) return false
  return (ids ?? []).every((id) => granted.includes(id))
}

export function permissionLabel(id) {
  return PERMISSION_BY_ID.get(id)?.label ?? id
}

export function permissionSummary(id) {
  return PERMISSION_BY_ID.get(id)?.summary ?? id
}

/** The modules whose *view* permission is present, in catalogue order. */
export function grantedModules(granted) {
  return PERMISSION_MODULES.filter((module) => hasPermission(granted, module.viewPermission))
}

/** Grouped, human-readable permission summary for the admin directory. */
export function summarizePermissions(granted) {
  return PERMISSION_MODULES.map((module) => {
    const items = module.permissions
      .filter((permission) => hasPermission(granted, permission.id))
      .map((permission) => permission.summary)
    return items.length > 0
      ? { id: module.id, label: module.label, items, sensitive: Boolean(module.sensitive) }
      : null
  }).filter(Boolean)
}

export function permissionSummaryText(granted) {
  const groups = summarizePermissions(granted)
  if (groups.length === 0) return 'No access granted'
  return groups.map((group) => `${group.label}: ${group.items.join(', ')}`).join(' · ')
}

/**
 * Resolve the access a Worker Dashboard shell should draw.
 *
 * `notifications` is intentionally separate from `messages`: a worker may be
 * allowed to see that a message exists without being allowed to read it.
 */
export function workerModuleAccess(granted) {
  return {
    operations: hasPermission(granted, 'operations.view'),
    designers: hasPermission(granted, 'designers.view'),
    qa: hasPermission(granted, 'qa.view'),
    financial: hasPermission(granted, 'financial.view'),
    messages: hasPermission(granted, 'messages.view'),
    notifications: hasPermission(granted, 'notifications.view'),
  }
}

/**
 * Toggle one permission while keeping the module's read gate coherent.
 *
 * Rules:
 *  - checking any content/write permission also checks the module's view
 *    permission (the SQL write RPCs require it too);
 *  - checking `notifications.view` never grants message content;
 *  - unchecking a view permission removes every dependent permission of that
 *    module, but keeps a notification-only capability;
 *  - no sensitive permission is ever auto-enabled. Financial view is the only
 *    thing auto-added, and it reveals no figures by itself.
 */
export function togglePermission(granted, permissionId, checked) {
  const permission = PERMISSION_BY_ID.get(permissionId)
  if (!permission) return sortPermissionIds(granted)
  const module = PERMISSION_MODULE_BY_ID.get(permission.module)
  const next = new Set(sortPermissionIds(granted))

  if (checked) {
    next.add(permissionId)
    if (permissionId !== module.viewPermission && permissionId !== 'notifications.view') {
      next.add(module.viewPermission)
    }
    if (permissionId === 'operations.assign') {
      next.add('operations.edit')
    }
    if (permissionId === 'designers.assign') {
      next.add('designers.edit')
    }
  } else {
    next.delete(permissionId)
    if (permissionId === module.viewPermission) {
      for (const candidate of module.permissions) {
        if (candidate.id !== 'notifications.view') next.delete(candidate.id)
      }
    }
  }

  return sortPermissionIds([...next])
}

/**
 * Make a selection safe after it arrives from a form or a saved value.
 * Unknown ids are dropped. A write permission without its view gate is
 * repaired; no sensitive category is invented.
 */
export function normalizePermissionSelection(granted) {
  let next = sortPermissionIds(granted)
  for (const module of PERMISSION_MODULES) {
    const hasDependent = module.permissions.some(
      (permission) => permission.id !== module.viewPermission && permission.id !== 'notifications.view' && next.includes(permission.id),
    )
    if (hasDependent && !next.includes(module.viewPermission)) {
      next = sortPermissionIds([...next, module.viewPermission])
    }
  }
  if (next.includes('operations.assign') && !next.includes('operations.edit')) {
    next = sortPermissionIds([...next, 'operations.edit'])
  }
  if (next.includes('designers.assign') && !next.includes('designers.edit')) {
    next = sortPermissionIds([...next, 'designers.edit'])
  }
  return next
}
