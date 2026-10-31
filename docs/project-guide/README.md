# Dearune Project Guide

> **Complete documentation for the Dearune codebase** — a bespoke physical-and-digital correspondence studio platform operating in Egypt (EGP primary currency, Bosta courier integration, bilingual English/Arabic support).

## Quick Navigation

| Document | Purpose |
|---|---|
| [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) | High-level system overview, user personas, tech stack |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, data flow, component boundaries |
| [DIRECTORY_STRUCTURE.md](./DIRECTORY_STRUCTURE.md) | Repository layout with purpose of each directory |
| [FILE_CATALOG.md](./FILE_CATALOG.md) | Comprehensive catalog of every source file |
| [ORDER_LIFECYCLE.md](./ORDER_LIFECYCLE.md) | Canonical Dearune ID, authoritative milestone, Making → Shipping → Delivery → After-Sale, carriers and refunds |
| [CODE_REFERENCE.md](./CODE_REFERENCE.md) | Code-level reference for functions, components, hooks |
| [ROUTES_AND_PAGES.md](./ROUTES_AND_PAGES.md) | Complete route inventory with authentication requirements |
| [COMPONENTS.md](./COMPONENTS.md) | React component inventory with props and usage |
| [DATABASE_AND_SCHEMA.md](./DATABASE_AND_SCHEMA.md) | Database schema, migrations, RLS policies |
| [AUTHENTICATION_AND_PERMISSIONS.md](./AUTHENTICATION_AND_PERMISSIONS.md) | Auth flows, roles, permissions, RLS policies |
| [API_AND_BACKEND.md](./API_AND_BACKEND.md) | Edge functions, RPCs, API endpoints |
| [STORAGE_SYSTEM.md](./STORAGE_SYSTEM.md) | File upload, compression, provider abstraction |
| [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) | React state, data fetching, caching patterns |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Design tokens, UI components, theming |
| [FEATURE_DEVELOPMENT_GUIDE.md](./FEATURE_DEVELOPMENT_GUIDE.md) | Step-by-step process for adding features |
| [TEMPLATE_DEVELOPMENT_GUIDE.md](./TEMPLATE_DEVELOPMENT_GUIDE.md) | Creating and registering templates |
| [ADMIN_AND_WORKER_WORKFLOWS.md](./ADMIN_AND_WORKER_WORKFLOWS.md) | Dashboard workflows and permission boundaries |
| [TESTING_AND_DEBUGGING.md](./TESTING_AND_DEBUGGING.md) | Unit tests, e2e tests, debugging strategies |
| [CONFIGURATION_AND_ENVIRONMENT.md](./CONFIGURATION_AND_ENVIRONMENT.md) | Environment variables, build config, deployment |
| [DEPLOYMENT_AND_OPERATIONS.md](./DEPLOYMENT_AND_OPERATIONS.md) | CI/CD, Supabase deployment, monitoring |
| [SECURITY_CONSIDERATIONS.md](./SECURITY_CONSIDERATIONS.md) | Security patterns, RLS, secrets management |
| [GLOSSARY.md](./GLOSSARY.md) | Domain terminology and abbreviations |

## Development Guides

| Guide | Purpose |
|---|---|
| [development/ADDING_A_FEATURE.md](./development/ADDING_A_FEATURE.md) | End-to-end process for adding a new feature |
| [development/ADDING_A_PAGE_OR_ROUTE.md](./development/ADDING_A_PAGE_OR_ROUTE.md) | Adding new routes and pages |
| [development/ADDING_A_COMPONENT.md](./development/ADDING_A_COMPONENT.md) | Creating reusable components |
| [development/ADDING_A_DATABASE_CHANGE.md](./development/ADDING_A_DATABASE_CHANGE.md) | Safe migration practices |
| [development/ADDING_A_STORAGE_PROVIDER.md](./development/ADDING_A_STORAGE_PROVIDER.md) | Adding new storage backends |
| [development/ADDING_A_TEMPLATE.md](./development/ADDING_A_TEMPLATE.md) | Creating and registering templates |
| [development/TROUBLESHOOTING.md](./development/TROUBLESHOOTING.md) | Common issues and solutions |
| [development/DOCUMENTATION_MAINTENANCE.md](./development/DOCUMENTATION_MAINTENANCE.md) | Keeping docs in sync with code |

## Skills Inventory

| Document | Purpose |
|---|---|
| [skills/README.md](./skills/README.md) | How to use the skills system |
| [skills/SKILL_INVENTORY.md](./skills/SKILL_INVENTORY.md) | Available skills and their purposes |

## Quick Start for Developers

```bash
# Install dependencies
npm ci

# Start development server
npm run dev

# Run linting
npm run lint

# Run tests
npm run test

# Build for production
npm run build
```

## Key Entry Points

| File | Purpose |
|---|---|
| `src/main.jsx` | Application bootstrap, providers, routing |
| `src/App.jsx` | Route definitions, role-based access guards |
| `src/lib/supabase.ts` | Supabase client configuration |
| `src/services/` | Business logic, data fetching, RPC calls |
| `supabase/migrations/` | Database schema evolution |
| `supabase/functions/` | Edge functions (admin, designer, worker APIs) |

## User Personas & Access

| Persona | Route Prefix | Auth Method |
|---|---|---|
| Public / Recipient | `/`, `/message/:publicId` | None / Public token |
| Designer | `/create` | 6-digit code + passcode (JWT) |
| Admin | `/admin/*` | Supabase Auth (admin_users table) |
| Worker | `/worker/*` | Supabase Auth (workers table + permissions) |

## Critical Implementation Notes

- **Templates are versioned** — `memorial-message` v1 is the only template; version pinned in `TEMPLATE_VERSIONS` constant
- **Physical products use milestone timestamps** — `sold_at`, `manufacturing_completed_at`, `shipped_at`, `delivered_at` (no legacy `status` column)
- **Storage provider abstraction** — Supabase Storage (default) or Google Drive; configured in `app_settings`
- **Designer JWT** — Custom HS256 JWT with 6-digit code + passcode; stored in `designers` table
- **Worker permissions** — 24 granular permissions in `worker_permissions` table; enforced by RPCs
- **PWA apps** — Three scoped PWAs: `/admin/qa`, `/admin/operations`, `/create` (each with own manifest & SW)
- **Rate limiting** — `consume_rate_limit` RPC with token bucket; applied to project-media, designer-projects, worker-designers

## Recent Major Changes (October 2026)

1. **Milestone migration** — Replaced 16-step Operations status with explicit timestamps (`20261025000001_remove_operations_status_milestones.sql`)
2. **Worker milestone RPCs** — Added maintenance mode checks and shipping address validation (`20261028000009_fix_worker_milestone_rpcs.sql`)
3. **Rate limiting infrastructure** — Token bucket implementation (`20261028000002_rate_limit.sql`)
4. **Template version persistence** — `current_version` column on `templates` table (`20261028000005_template_current_version.sql`)
5. **Legacy decommission** — Dropped `orders`/`messages` tables (`20261028000004_decommission_legacy.sql`)
6. **One order, one identity, one milestone** — `projects.milestone` is the
   authoritative stage; `order_references` resolves every historical ID to one
   order; Operations is four views of one record; Egypt Post manifests and
   manual refunds are audited (`20261103000001_order_lifecycle.sql`,
   see [ORDER_LIFECYCLE.md](./ORDER_LIFECYCLE.md))

---

> **For AI Agents**: Before making significant changes, read this guide and the relevant architecture/development guides. Inspect the current implementation to confirm documentation matches code. After completing changes, update affected documentation and the file catalog.