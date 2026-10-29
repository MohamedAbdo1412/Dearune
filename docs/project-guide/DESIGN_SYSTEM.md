# Design System

This document describes the visual design system, component library, and styling conventions in Dearune.

## Design Tokens

### Colors

```css
/* src/index.css --theme inline */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  
  /* Charts */
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  
  /* Radius */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

**Dark Mode (`.dark`):**
```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.145 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.396 0.141 25.723);
  --destructive-foreground: oklch(0.637 0.237 25.331);
  --border: oklch(0.269 0 0);
  --input: oklch(0.269 0 0);
  --ring: oklch(0.439 0 0);
}
```

### Brand Colors (Hardcoded in Services)

```javascript
// src/services/qrPaper.js
const COLORS = {
  ink: rgb(0.2039, 0.1529, 0.0902),      // #342717 - Warm antique brown
  brand: rgb(0.2039, 0.1529, 0.0902),    // #342717
  strip: rgb(0, 0, 0),                    // #000000 - Pure black
  fields: rgb(0, 0, 0),                   // #000000
  note: rgb(1, 0, 0),                     // #ff0000 - Red
  orderId: rgb(0, 0, 0),                  // #000000
  accentId: rgb(0, 0.0118, 1),            // #0003ff - Blue
  qrBackground: rgb(1, 1, 1),             // #ffffff
};
```

### Arabic Font Stack

```css
/* src/index.css */
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');

:root {
  --font-body: "Manrope", "Noto Sans Arabic", sans-serif;
  --font-display: "Cormorant Garamond", serif;
}

:lang(ar) {
  font-family: "Noto Sans Arabic", sans-serif;
}
```

## Typography

### Font Stack

| Purpose | Font | Source |
|---|---|---|
| **Body (Latin)** | Manrope | `@fontsource-variable/manrope` |
| **Body (Arabic)** | Noto Sans Arabic | Google Fonts |
| **Display/Headings** | Cormorant Garamond | Google Fonts |
| **Brand Wordmark** | Arniya | `@fontsource/arniya` |
| **Editor Monospace** | Atkinson Hyperlegible | `@fontsource/atkinson-hyperlegible` |
| **Book Serif** | Libre Baskerville | `src/assets/fonts/` |
| **Template** | Arniya (Arabic), Libre Baskerville (Latin) | Local assets |

### Font Imports

```css
/* src/index.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
```

### Font Usage

```css
/* Theme variables */
--font-heading: 'Arniya', var(--font-sans);
--font-sans: 'Geist Variable', sans-serif;

/* Applied */
body, button, input, textarea, select {
  font-family: var(--font-body);  /* Manrope + Noto Sans Arabic */
}

.brand-wordmark, .memory-title {
  font-family: var(--font-display);  /* Arniya / Cormorant Garamond */
}
```

### Arabic Support

```css
:lang(ar) {
  font-family: "Noto Sans Arabic", sans-serif;
  direction: rtl;
}

.is-arabic { direction: rtl; }
.is-english { direction: ltr; }
```

## Component Library (Shadcn/Radix)

### Configuration (`components.json`)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components/ui",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### Available Components (35)

| Component | File | Description |
|---|---|---|
| `AlertDialog` | `alert-dialog.jsx` | Confirmation dialogs |
| `Avatar` | `avatar.jsx` | User avatars |
| `Badge` | `badge.jsx` | Status labels |
| `Button` | `button.jsx` | Primary/secondary/ghost buttons |
| `Calendar` | `calendar.jsx` | Date picker |
| `Card` | `card.jsx` | Content containers |
| `Checkbox` | `checkbox.jsx` | Form checkboxes |
| `Collapsible` | `collapsible.jsx` | Expandable sections |
| `Command` | `command.jsx` | Command palette |
| `ContextMenu` | `context-menu.jsx` | Right-click menus |
| `Dialog` | `dialog.jsx` | Modal dialogs |
| `DropdownMenu` | `dropdown-menu.jsx` | Dropdown actions |
| `Form` | `form.jsx` | React Hook Form + Zod |
| `HoverCard` | `hover-card.jsx` | Hover previews |
| `Input` | `input.jsx` | Text inputs |
| `Label` | `label.jsx` | Form labels |
| `Menubar` | `menubar.jsx` | Top menus |
| `NavigationMenu` | `navigation-menu.jsx` | Top navigation |
| `Popover` | `popover.jsx` | Floating content |
| `Progress` | `progress.jsx` | Progress bars |
| `RadioGroup` | `radio-group.jsx` | Radio buttons |
| `ScrollArea` | `scroll-area.jsx` | Scrollable containers |
| `Select` | `select.jsx` | Dropdown selects |
| `Separator` | `separator.jsx` | Visual dividers |
| `Sheet` | `sheet.jsx` | Mobile drawers |
| `Sidebar` | `sidebar.jsx` | Side navigation |
| `Skeleton` | `skeleton.jsx` | Loading placeholders |
| `Slider` | `slider.jsx` | Range sliders |
| `Switch` | `switch.jsx` | Toggle switches |
| `Table` | `table.jsx` | Data tables |
| `Tabs` | `tabs.jsx` | Tab navigation |
| `Textarea` | `textarea.jsx` | Multi-line inputs |
| `Toast` | `toast.jsx` | Notifications (Sonner) |
| `Toggle` | `toggle.jsx` | Toggle buttons |
| `ToggleGroup` | `toggle-group.jsx` | Toggle groups |
| `Tooltip` | `tooltip.jsx` | Hover tooltips |

## Component Styling Patterns

### Button Variants

```jsx
<Button variant="default" className="...">Primary</Button>
<Button variant="outline" className="...">Outline</Button>
<Button variant="ghost" className="...">Ghost</Button>
<Button variant="destructive" className="...">Delete</Button>
<Button variant="link" className="...">Link</Button>
```

### Card Pattern

```jsx
<Card className="shadow-sm">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Content</p>
  </CardContent>
</Card>
```

### Create Page Paper Card (`src/styles/book.css`)

The template chooser draws each paper as `.paper-card` (selection ring
`.is-chosen`, veil `.is-unavailable`, `.is-coming` for unbound papers). Its
artwork frame is `.paper-art` — a fixed `210 / 297` plate — and the uploaded
preview inside it is `.paper-photo`:

```jsx
<span className="paper-art">
  {src ? <img className="paper-photo" src={src} alt="" loading="lazy" /> : <span className="paper-blank" />}
</span>
```

`.paper-photo` uses `object-fit: contain` on a paper-toned sheet so the whole
uploaded composition stays visible at any aspect ratio; `.paper-blank` is the
neutral fallback (a blank sheet, no drawn mini). Never place the admin's
preview image as a CSS `background` behind the old decorative mini — the image
must be the card's visible artwork.

### Form Pattern (React Hook Form + Zod)

```jsx
const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { ... }
});

<Form {...form}>
  <FormField
    control={form.control}
    name="field"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Label</FormLabel>
        <FormControl>
          <Input {...field} />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
</Form>
```

## Layout Patterns

### Page Layout

```jsx
<div className="space-y-5">
  <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Section</p>
      <h1 className="mt-1 font-heading text-3xl tracking-tight">Page Title</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Description
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      {/* Actions */}
    </div>
  </header>
  
  <main className="space-y-4">
    {/* Content */}
  </main>
</div>
```

### Grid Layouts

```jsx
<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  {items.map(item => <StatCard key={item.id} {...item} />)}
</div>

<div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
  <FieldGrid>
    <Field label="Label" value={value} />
  </FieldGrid>
</div>
```

### Responsive Tables

```jsx
<div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
  <Table>...</Table>
</div>

<div className="grid gap-3 md:hidden">
  {/* Mobile card layout */}
</div>
```

## Component Variants

### Badge Variants

```jsx
<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="destructive">Destructive</Badge>
```

### OperationsBadge (Custom)

```jsx
<OperationsBadge status={status} label={label} />
```

**Phase Mapping:**
```javascript
PHASE_OF = {
  pending: 'queued',
  sold: 'workshop',
  manufactured: 'workshop',
  shipped: 'shipped',
  delivered: 'delivered'
}
```

**Styles per Phase:**
- `queued`: `bg-muted text-muted-foreground`
- `workshop`: `bg-violet-500/10 text-violet-700`
- `shipped`: `bg-sky-500/10 text-sky-700`
- `delivered`: `bg-emerald-500/10 text-emerald-700`

## Dark Mode Support

```css
/* All components use CSS variables */
.bg-card { background-color: var(--card); }
.text-foreground { color: var(--foreground); }
.border-border { border-color: var(--border); }

/* Component-level dark mode */
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    /* Dark mode defaults */
  }
}
```

**Theme Toggle:**
```jsx
// src/hooks/use-theme.tsx (via next-themes)
const { theme, setTheme } = useTheme();
<button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
  {theme === 'dark' ? <Sun /> : <Moon />}
</button>
```

## Spacing & Sizing

### Spacing Scale (Tailwind)

```css
/* Default Tailwind spacing */
0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96
```

### Custom Spacing (CSS Variables)

```css
/* Custom spacing for specific layouts */
--space-header: 1.5rem;
--space-section: 2rem;
--space-card-padding: 1.5rem;
```

## Animation & Transitions

### Page Transitions

```css
/* Book page turn */
.turn-leaf {
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.turn-leaf.is-flipping {
  transform: rotateY(-180deg);
}
```

### Fade/Fade-in

```css
.fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Spinner

```css
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

### Page Turn Animation (Book)

```javascript
// src/components/book/PageTurn.jsx
const sample = () => page.evaluate(() => getComputedStyle(document.querySelector('.book-cover')).transform);
let prev = await sample();
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(250);
  const cur = await sample();
  if (cur === prev) break;
  prev = cur;
}
```

## Icon System

### Lucide React

```javascript
import { 
  Home, Menu, X, ChevronRight, ChevronLeft,
  Search, Filter, Download, Upload, Print,
  Archive, ArchiveRestore, Check, X,
  Camera, ImageUp, Keyboard, Loader2,
  Package, Factory, Truck, MapPin,
  Phone, Plus, Printer, RefreshCw,
  RotateCcw, ScanLine, ShieldCheck,
  ShieldQuestion, TriangleAlert, UserRound
} from 'lucide-react';
```

### Custom Icons

```jsx
// Brand logo
import { Brand } from '@/components/brand';

// Stage badge
<StageBadge stage="submitted" variant="outline" />

// Push pin (template)
<PushPin color="brass" size={26} />
```

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|---|---|---|
| `sm` | 640px | Tablet |
| `md` | 768px | Small desktop |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Wide |

```jsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

## Accessibility

### ARIA Patterns

```jsx
// Dialog
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogTitle>Title</DialogTitle>
    <DialogDescription>Description</DialogDescription>
  </DialogContent>
</Dialog>

// Form
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl><Input {...field} type="email" /></FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

### Focus Management

```css
/* Focus visible */
.focus-visible:focus {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* Skip link */
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  padding: 1rem;
  background: var(--primary);
  color: var(--primary-foreground);
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
}
```

## Print Styles

```css
@media print {
  .no-print { display: none !important; }
  .print-break { page-break-before: always; }
  .print-avoid-break { page-break-inside: avoid; }
  
  body { font-size: 12pt; line-height: 1.5; }
  a { text-decoration: none; color: inherit; }
}
```

## Design Tokens Reference

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `#ffffff` | `#1a1a1a` | Page background |
| `--foreground` | `#0d0d0d` | `#fafafa` | Primary text |
| `--primary` | `#262626` | `#fafafa` | Primary actions |
| `--primary-foreground` | `#fafafa` | `#262626` | On primary |
| `--secondary` | `#f5f5f5` | `#262626` | Secondary bg |
| `--muted` | `#f5f5f5` | `#262626` | Subtle bg |
| `--muted-foreground` | `#737373` | `#a3a3a3` | Subtle text |
| `--border` | `#e5e5e5` | `#333333` | Borders |
| `--ring` | `#a3a3a3` | `#b3b3b3` | Focus rings |
| `--destructive` | `#dc2626` | `#ef4444` | Errors |
| `--accent` | `#f5f5f5` | `#262626` | Accents |
| `--card` | `#ffffff` | `#1a1a1a` | Card bg |
| `--card-foreground` | `#0d0d0d` | `#fafafa` | Card text |

## Component Development Checklist

- [ ] Follows existing patterns in codebase
- [ ] Uses `cn()` for class composition
- [ ] Supports dark mode
- [ ] Responsive (mobile-first)
- [ ] Accessible (ARIA, keyboard)
- [ ] TypeScript interfaces for props
- [ ] Unit test coverage
- [ ] Storybook story (if applicable)
- [ ] Updates DESIGN_SYSTEM.md