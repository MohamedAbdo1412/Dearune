# Adding a Component

This guide explains how to add a new React component to the Dearune codebase.

## Overview

Components live in `src/components/` with subdirectories for organization:
- `src/components/ui/` - Shadcn/Radix primitives (35 components)
- `src/components/admin/` - Admin-specific components
- `src/components/book/` - CreateBook components
- `src/components/` - Shared components

---

## Step-by-Step

### 1. Create Component File

Create the component in the appropriate directory:

```jsx
// src/components/MyNewComponent.jsx
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface MyNewComponentProps {
  title: string
  description?: string
  variant?: 'default' | 'outline' | 'ghost'
  onClick?: () => void
  className?: string
}

export function MyNewComponent({
  title,
  description,
  variant = 'default',
  onClick,
  className,
}: MyNewComponentProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="font-heading text-lg tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      <Button variant={variant} onClick={onClick}>
        Action
      </Button>
    </div>
  )
}
```

---

## Component Conventions

### Naming
- **File**: PascalCase + `.jsx` (e.g., `MyNewComponent.jsx`)
- **Component**: PascalCase (e.g., `MyNewComponent`)
- **Props Interface**: `{ComponentName}Props` (e.g., `MyNewComponentProps`)

### Props Interface

```typescript
interface MyComponentProps {
  // Required props first
  title: string
  
  // Optional props with defaults
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  
  // Callbacks
  onClick?: () => void
  onChange?: (value: string) => void
  
  // Escape hatch for styling
  className?: string
}
```

### Class Composition with `cn()`

```typescript
import { cn } from '@/lib/utils'

// In component:
<div className={cn(
  'base-classes',
  variant === 'default' && 'bg-primary',
  variant === 'outline' && 'border border-input',
  disabled && 'opacity-50 pointer-events-none',
  className
)}>
```

---

## Component Patterns

### 1. Simple Presentational Component

```jsx
// src/components/MyBadge.jsx
import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      variant === 'default' && 'bg-primary/10 text-primary',
      variant === 'success' && 'bg-green-100 text-green-800',
      variant === 'warning' && 'bg-yellow-100 text-yellow-800',
      className
    )}>
      {children}
    </span>
  )
}
```

### 2. Interactive Component with State

```jsx
// src/components/ToggleSwitch.jsx
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ToggleSwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

export function ToggleSwitch({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  disabled = false,
  label,
}: ToggleSwitchProps) {
  const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked)
  const isControlled = controlledChecked !== undefined
  const checked = isControlled ? controlledChecked : uncontrolledChecked

  const handleClick = () => {
    if (disabled) return
    const next = !checked
    if (!isControlled) setUncontrolledChecked(next)
    onChange?.(next)
  }

  return (
    <label className={cn('flex items-center gap-2 cursor-pointer', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0'
        )} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}
```

### 3. Form Field Component

```jsx
// src/components/FormField.jsx
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface FormFieldProps {
  label: string
  name: string
  type?: 'text' | 'email' | 'password' | 'number'
  placeholder?: string
  required?: boolean
  error?: string
  disabled?: boolean
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
}

export function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  required = false,
  error,
  disabled = false,
  value = '',
  onChange,
  onBlur,
}: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onBlur={onBlur}
        className={cn(
          'transition-colors',
          error && 'border-red-500 focus-visible:ring-red-500',
          disabled && 'bg-muted'
        )}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${name}-error` : undefined}
      />
      {error && (
        <p id={`${name}-error`} className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
```

---

## Component Registration

### Export from Index

```javascript
// src/components/ui/index.js (if exists) or import directly
export { MyNewComponent } from './MyNewComponent'
export { Badge } from './MyBadge'
export { ToggleSwitch } from './ToggleSwitch'
export { FormField } from './FormField'
```

---

## Styling Conventions

### Class Composition with `cn()`

```javascript
import { cn } from '@/lib/utils'

// Good: Composable, readable
<div className={cn(
  'base-classes',
  condition && 'conditional-class',
  { 'variant-class': isVariant },
  className
)}

// Avoid: String concatenation
<div className="base " + (condition ? "cond" : "") + " " + className>
```

### Dark Mode Support

```css
/* Uses CSS variables - automatically works in dark mode */
<div className="bg-card text-card-foreground border-border">
  <h3 className="text-foreground">Title</h3>
  <p className="text-muted-foreground">Description</p>
</div>
```

### Responsive Design

```jsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

### Dark Mode

```jsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <span className="text-muted-foreground dark:text-muted-foreground">
    Works in both themes
  </span>
</div>
```

---

## Accessibility Checklist

- [ ] Semantic HTML elements (`<button>`, `<label>`, `<nav>`, etc.)
- [ ] ARIA attributes where needed (`aria-label`, `aria-describedby`, `role`)
- [ ] Focus management (`focus-visible` styles)
- [ ] Color contrast (WCAG AA)
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Screen reader labels
- [ ] Focus trapping in modals/dialogs

```jsx
// Accessible button example
<button
  className={cn(
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    disabled && 'opacity-50 pointer-events-none'
  )}
  disabled={disabled}
  aria-disabled={disabled}
  aria-label={ariaLabel}
  onClick={onClick}
>
  {children}
</button>
```

---

## Testing Components

### Unit Test (Vitest + React Testing Library)

```javascript
// tests/MyComponent.test.jsx
import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MyComponent } from '@/components/MyComponent'

describe('MyComponent', () => {
  test('renders title and description', () => {
    render(<MyComponent title="Hello" description="World" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('World')).toBeInTheDocument()
  })

  test('calls onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<MyComponent title="Test" onClick={handleClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  test('applies variant classes', () => {
    const { rerender } = render(<MyComponent title="Test" variant="outline" />)
    expect(screen.getByRole('button')).toHaveClass('border-border')
    
    rerender(<MyComponent title="Test" variant="destructive" />)
    expect(screen.getByRole('button')).toHaveClass('bg-destructive')
  })
})
```

### E2E Test (Playwright)

```javascript
// e2e/component.mjs
import { test, expect } from '@playwright/test'

test('MyComponent renders and interacts', async ({ page }) => {
  await page.goto('/page-with-component')
  await expect(page.locator('text=Hello')).toBeVisible()
  await page.click('button:has-text("Action")')
  await expect(page.locator('.success')).toBeVisible()
})
```

---

## Component Documentation

Update `docs/project-guide/COMPONENTS.md` with:

```markdown
### `MyNewComponent` (`src/components/MyNewComponent.jsx`)

```jsx
<MyNewComponent
  title="Title"
  description="Optional description"
  variant="default"
  onClick={() => {}}
/>
```

**Props:**
| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | - | Required title |
| `description` | `string` | - | Optional description |
| `variant` | `'default' \| 'outline' \| 'ghost'` | `'default'` | Visual variant |
| `onClick` | `() => void` | - | Click handler |

**Features:**
- Responsive
- Dark mode support
- Accessible (ARIA, keyboard)
```

---

## Component Checklist

Before submitting:

- [ ] Follows naming conventions (PascalCase + `.jsx`)
- [ ] TypeScript interfaces for props
- [ ] Uses `cn()` for class composition
- [ ] Supports dark mode
- [ ] Responsive (mobile-first)
- [ ] Accessible (ARIA, keyboard)
- [ ] Unit test coverage
- [ ] Updates `COMPONENTS.md`
- [ ] Exports from appropriate index
- [ ] No console.log/debugger
- [ ] Run `npm run lint` and `npm run test`