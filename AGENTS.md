# AGENTS.md — Instructions for AI Agents Working on Dearune

> **MANDATORY**: Before making ANY code changes, answering questions, or following any prompt, you MUST read and follow the documentation in `docs/project-guide/` **AND** follow the skills in `.agents/skills/`. This is not optional.

---

## 🔴 CRITICAL RULE: READ DOCS FIRST & FOLLOW SKILLS

**Every time you start a task, you must:**

1. **Read the relevant documentation** in `docs/project-guide/` before writing any code
2. **Follow the skills** in `.agents/skills/` — load and apply relevant skills before any edit
3. **Check the file catalog** (`FILE_CATALOG.md`) to understand what files exist
4. **Follow the development guides** in `docs/project-guide/development/` for the specific task
5. **Update documentation** after completing changes (see `DOCUMENTATION_MAINTENANCE.md`)

> **Failure to read docs first = failed task.** Do not assume you know the codebase.
> **Failure to follow skills = failed task.** Skills in `.agents/skills/` are mandatory.

---

## 🤖 Skills System — Mandatory Usage

### Available Skills (in `.agents/skills/`)
| Skill | Purpose | When to Load |
|-------|---------|--------------|
| `supabase` | Supabase operations (DB, Auth, Storage, Edge Functions, Realtime) | Any Supabase-related task |
| `supabase-postgres-best-practices` | PostgreSQL best practices (schema, migrations, RLS, queries) | DB schema, migrations, queries |
| `vercel-react-best-practices` | React/Next.js performance optimization | React components, performance |
| `shadcn` | shadcn/ui component management | Building UI components |
| `frontend-design` | Visual design guidance (typography, colors, layout) | UI design, new components |
| `github-actions-templates` | CI/CD workflow creation | GitHub Actions setup |
| `opencode` | OpenCode usage/configuration | OpenCode questions |
| `report` | Issue reporting | Reporting OpenCode bugs |
| `verification-before-completion` | Evidence-based completion | Before claiming work complete |
| `find-skills` | Discover/install skills | When needing new capabilities |

### Skill Loading Protocol
**Before ANY edit, you MUST:**

1. **Identify the task type** (DB, UI, API, Auth, Deploy, etc.)
2. **Load relevant skills** using the skill tool:
   ```bash
   # Example: Load supabase + postgres best practices for DB work
   skill({"id": "supabase"})
   skill({"id": "supabase-postgres-best-practices"})
   ```
3. **Read the skill instructions** — they contain mandatory patterns
4. **Apply skill patterns** in your implementation
5. **Verify skill compliance** before submitting changes

> **Skills are not optional.** They encode project-specific best practices. Skipping them = task failure.

### Skill Discovery
```bash
# List installed skills
npx skills list

# Search for skills
npx skills find "database migration"

# Update skills
npx skills update
```

> **If a skill exists for your task, you MUST use it.** Check `.agents/skills/` directory first.

---

## 📚 Documentation Map — Know Where to Look

| Task | Read These Files First |
|------|------------------------|
| **Any new feature** | `FEATURE_DEVELOPMENT_GUIDE.md`, `ARCHITECTURE.md`, `FILE_CATALOG.md` |
| **Add page/route** | `ADDING_A_PAGE_OR_ROUTE.md`, `ROUTES_AND_PAGES.md`, `src/App.jsx` |
| **Add component** | `ADDING_A_COMPONENT.md`, `COMPONENTS.md`, `DESIGN_SYSTEM.md` |
| **Database change** | `ADDING_A_DATABASE_CHANGE.md`, `DATABASE_AND_SCHEMA.md`, `supabase/migrations/` |
| **API/Edge Function** | `API_AND_BACKEND.md`, `supabase/functions/` |
| **Storage changes** | `ADDING_A_STORAGE_PROVIDER.md`, `STORAGE_SYSTEM.md` |
| **New template** | `ADDING_A_TEMPLATE.md`, `TEMPLATE_DEVELOPMENT_GUIDE.md` |
| **Authentication** | `AUTHENTICATION_AND_PERMISSIONS.md`, `supabase/functions/_shared/auth.ts` |
| **State management** | `STATE_MANAGEMENT.md`, `src/hooks/` |
| **Styling/UI** | `DESIGN_SYSTEM.md`, `src/components/ui/`, `src/index.css` |
| **Testing** | `TESTING_AND_DEBUGGING.md`, `tests/`, `e2e/` |
| **Deployment** | `DEPLOYMENT_AND_OPERATIONS.md`, `.github/workflows/deploy.yml` |
| **Configuration** | `CONFIGURATION_AND_ENVIRONMENT.md`, `vite.config.js`, `supabase/config.toml` |
| **Troubleshooting** | `TROUBLESHOOTING.md`, `development/TROUBLESHOOTING.md` |
| **Security review** | `SECURITY_CONSIDERATIONS.md` |
| **Any bug fix** | Check `TROUBLESHOOTING.md` first for known issues |

---

## 🛑 Mandatory Pre-Flight Checklist

Before **any** code change, verify:

- [ ] Read relevant docs from the table above
- [ ] Check `FILE_CATALOG.md` for existing files/patterns
- [ ] Run `npm run lint` — must pass
- [ ] Run `npm run test` — must pass
- [ ] Run `npm run build` — must pass
- [ ] Run `npx tsc --noEmit` — must pass (TypeScript)
- [ ] Check `TROUBLESHOOTING.md` for known issues

---

## 📝 Post-Change Requirements

After completing ANY change:

1. **Update documentation** (see `DOCUMENTATION_MAINTENANCE.md`):
   - `FILE_CATALOG.md` — new/removed files
   - `CODE_REFERENCE.md` — new exports/functions
   - `ROUTES_AND_PAGES.md` — new routes
   - `COMPONENTS.md` — new components
   - `DATABASE_AND_SCHEMA.md` — schema changes
   - `API_AND_BACKEND.md` — new RPCs/Edge Functions
   - `STORAGE_SYSTEM.md` — storage changes
   - `DESIGN_SYSTEM.md` — new design tokens/components
   - `FEATURE_DEVELOPMENT_GUIDE.md` — new patterns
   - `TEMPLATE_DEVELOPMENT_GUIDE.md` — template changes
   - `ADMIN_AND_WORKER_WORKFLOWS.md` — workflow changes
   - `SECURITY_CONSIDERATIONS.md` — security changes
   - `CONFIGURATION_AND_ENVIRONMENT.md` — config changes
   - `DEPLOYMENT_AND_OPERATIONS.md` — deployment changes
   - `TROUBLESHOOTING.md` — new issues/solutions
   - `TESTING_AND_DEBUGGING.md` — test updates

2. **Run verification**:
   ```bash
   npm run lint && npm run test && npm run build
   ```

3. **Update `codebase_improvement_todo.md`** if completing planned tasks

---

## 🏗️ Architecture Rules — Never Violate

| Rule | Reference |
|------|-----------|
| **Never edit applied migrations** — create new ones | `DATABASE_AND_SCHEMA.md`, `ADDING_A_DATABASE_CHANGE.md` |
| **Never hardcode secrets** — use env vars/secrets | `CONFIGURATION_AND_ENVIRONMENT.md`, `SECURITY_CONSIDERATIONS.md` |
| **Never bypass RLS** — use service role only in Edge Functions | `DATABASE_AND_SCHEMA.md`, `API_AND_BACKEND.md` |
| **Never skip permission checks** — every worker RPC validates | `AUTHENTICATION_AND_PERMISSIONS.md`, `API_AND_BACKEND.md` |
| **Never store drafts unencrypted** — AES-GCM per designer | `STORAGE_SYSTEM.md`, `SECURITY_CONSIDERATIONS.md` |
| **Never commit console.log/debugger** | `TESTING_AND_DEBUGGING.md` |
| **Never break dark mode** — use CSS variables | `DESIGN_SYSTEM.md` |
| **Never break responsive** — mobile-first, test 375px | `DESIGN_SYSTEM.md`, `ADDING_A_COMPONENT.md` |
| **Never break accessibility** — semantic HTML, ARIA, focus | `DESIGN_SYSTEM.md`, `ADDING_A_COMPONENT.md` |
| **Never skip TypeScript types** — strict mode enabled | `tsconfig.json`, `CODE_REFERENCE.md` |
| **Never skip tests** for new logic | `TESTING_AND_DEBUGGING.md` |

---

## 🔐 Security Non-Negotiables

1. **All secrets in env/secrets** — never in code
2. **CSP headers configured** — `index.html`, `public/_headers`
3. **Rate limiting on all public endpoints** — `SECURITY_CONSIDERATIONS.md`
4. **RLS on every table** — `DATABASE_AND_SCHEMA.md`
5. **Worker permissions checked per-RPC** — `AUTHENTICATION_AND_PERMISSIONS.md`
6. **Designer JWT: 48h expiry, memory-only** — `AUTHENTICATION_AND_PERMISSIONS.md`
7. **Audit logging on all mutations** — `ADMIN_AND_WORKER_WORKFLOWS.md`
8. **CSP report-only monitored** — `SECURITY_CONSIDERATIONS.md`

---

## 🧪 Testing Requirements

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Unit | Vitest | >80% |
| Integration | Vitest + PGLite | >60% |
| E2E Critical Paths | Playwright | 100% |

**Before PR:** `npm run test -- --coverage` must show targets met.

---

## 📦 Dependency Rules

- **No GPL/copyleft licenses** — only MIT, Apache 2.0, BSD
- **Pin major versions** in `package.json`
- **Monthly `npm audit`** — `SECURITY_CONSIDERATIONS.md`
- **Supabase JS + Postgres version alignment** — `DEPENDENCIES_AND_INTEGRATIONS.md`

---

## 🔄 Git & PR Conventions

| Convention | Format |
|---|---|
| **Branch** | `feature/description`, `fix/description`, `refactor/description` |
| **Commit** | `feat(scope): description` / `fix(scope): description` / `docs(scope): description` |
| **PR Title** | Same as commit convention |
| **PR Description** | What, Why, How, Testing, Docs Updated |

---

## 🚨 If You're Unsure

**STOP. Read the docs. Ask for clarification.**

Do not:
- Guess at implementation patterns
- Invent new patterns without documenting them
- Skip security reviews
- Assume "it worked before" means it's correct

**The docs in `docs/project-guide/` are the source of truth.** If code and docs disagree, **docs win** (and code should be fixed).

---

## 📋 Quick Reference: Key Files

```
docs/project-guide/
├── README.md                    # Start here
├── ARCHITECTURE.md              # System overview
├── FILE_CATALOG.md              # All 347 files cataloged
├── CODE_REFERENCE.md            # Functions, components, hooks
├── ROUTES_AND_PAGES.md          # All routes with auth
├── COMPONENTS.md                # Component inventory
├── DATABASE_AND_SCHEMA.md       # Full schema + migrations
├── AUTHENTICATION_AND_PERMISSIONS.md
├── API_AND_BACKEND.md           # Edge Functions + RPCs
├── STORAGE_SYSTEM.md
├── STATE_MANAGEMENT.md
├── DESIGN_SYSTEM.md
├── FEATURE_DEVELOPMENT_GUIDE.md
├── TEMPLATE_DEVELOPMENT_GUIDE.md
├── ADMIN_AND_WORKER_WORKFLOWS.md
├── TESTING_AND_DEBUGGING.md
├── CONFIGURATION_AND_ENVIRONMENT.md
├── DEPLOYMENT_AND_OPERATIONS.md
├── DEPENDENCIES_AND_INTEGRATIONS.md
├── SECURITY_CONSIDERATIONS.md
├── GLOSSARY.md
├── PROJECT_OVERVIEW.md
├── development/
│   ├── ADDING_A_FEATURE.md
│   ├── ADDING_A_PAGE_OR_ROUTE.md
│   ├── ADDING_A_COMPONENT.md
│   ├── ADDING_A_DATABASE_CHANGE.md
│   ├── ADDING_A_STORAGE_PROVIDER.md
│   ├── ADDING_A_TEMPLATE.md
│   ├── TROUBLESHOOTING.md
│   └── DOCUMENTATION_MAINTENANCE.md
└── skills/
    ├── README.md
    └── SKILL_INVENTORY.md
```

---

## ✅ Acknowledgment

By working on this codebase, you acknowledge:

> **I have read AGENTS.md and will follow all instructions in `docs/project-guide/` before making any changes. I understand that skipping documentation review is a task failure.**

---

*Last updated: 2026-10-29 | Docs version: 1.0*