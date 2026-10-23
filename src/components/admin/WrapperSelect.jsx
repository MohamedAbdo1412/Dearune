import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { wrapperLabel } from '@/services/wrappers'
import { WRAPPER_LABELS } from '@/services/constants'

// The studio's wrapper choices as one select, fed by the CATALOG (never a
// hardcoded list): admins pick from `catalog.wrappers`, and a Dearune that
// already carries an older or since-deactivated wrapper still shows it
// selected instead of going blank.
//
//   value    current wrapper key (or '')
//   onChange called with the chosen key
export function WrapperSelect({ wrappers = [], currentKey = '', value, onChange, disabled = false, placeholder = 'Choose a wrapper' }) {
  const list = [...(wrappers ?? [])]
  if (currentKey && !list.some((wrapper) => wrapper?.key === currentKey)) {
    // Deactivated (or legacy) wrapper: keep it visible for this record.
    list.unshift({ key: currentKey, name: WRAPPER_LABELS[currentKey] ?? currentKey, active: false })
  }
  const selected = value || undefined

  return (
    <Select value={selected} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {list.map((wrapper) => (
          <SelectItem key={wrapper.key} value={wrapper.key}>
            {wrapperLabel(wrapper)}
            {wrapper.active === false ? ' (inactive)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// The wrappers this select should offer: the catalog only. No hardcoded fallback.
export function wrappersForSelect(catalog) {
  const wrappers = catalog?.wrappers ?? []
  return wrappers
    .filter((w) => w.active !== false)
    .map((w) => ({ key: w.key, name: w.name, kind: w.kind, ...w }))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
}
