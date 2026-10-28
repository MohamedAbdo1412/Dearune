# Skill Inventory

This document catalogs the available OpenCode skills and their relevance to the Dearune project.

## Available Skills

| Skill | Source | Purpose | When to Use |
|---|---|---|---|
| `find-skills` | Built-in | Discover/install agent skills | When user asks "how do I do X" or "find a skill for X" |
| `frontend-design` | Built-in | Visual design guidance | Building new UI or reshaping existing UI |
| `github-actions-templates` | Built-in | CI/CD workflow creation | Setting up GitHub Actions |
| `opencode` | Built-in | OpenCode usage/configuration | Questions about OpenCode itself |
| `report` | Built-in | Issue reporting | Reporting OpenCode bugs |
| `shadcn` | Built-in | shadcn/ui component management | Working with shadcn/ui components |
| `supabase` | Built-in | Supabase operations | Any Supabase-related task |
| `supabase-postgres-best-practices` | Built-in | PostgreSQL best practices | Database schema, migrations, queries |
| `vercel-react-best-practices` | Built-in | React/Next.js optimization | React/Next.js performance |
| `verification-before-completion` | Built-in | Evidence-based completion | Before claiming work complete |

---

## Skill Details

### `find-skills`
**Purpose**: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities.

**When to Use**: 
- User asks "how do I do X"
- User asks "find a skill for X"
- User asks "is there a skill that can..."
- User expresses interest in extending capabilities

**Usage**:
```bash
npx skills find "react testing"
npx skills add vercel-labs/agent-skills@react-best-practices
```

### `frontend-design`
**Purpose**: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.

**When to Use**:
- Building new UI components
- Redesigning existing interfaces
- Choosing design tokens, colors, typography
- Creating design systems

### `github-actions-templates`
**Purpose**: Create production-ready GitHub Actions workflows for automated testing, building, and deploying applications.

**When to Use**:
- Setting up CI/CD with GitHub Actions
- Automating development workflows
- Creating reusable workflow templates

### `opencode`
**Purpose**: Use this skill for any question about OpenCode itself, including how OpenCode works, using or configuring it, migrating from V1 to V2, troubleshooting it, developing plugins or integrations, using the OpenCode SDK, clients, server, or API, and contributing to the OpenCode codebase.

**When to Use**:
- Questions about OpenCode itself
- Using or configuring OpenCode
- Migrating from V1 to V2
- Troubleshooting OpenCode
- Developing plugins/integrations
- Using OpenCode SDK, clients, server, API
- Contributing to OpenCode codebase

### `report`
**Purpose**: Use when the user wants to report an OpenCode issue or bug. Collect standard diagnostics, add user-specific reproduction context, and publish the issue with GitHub CLI.

**When to Use**:
- User wants to report an OpenCode issue
- User encounters a bug in OpenCode
- User wants to file a GitHub issue for OpenCode

### `shadcn`
**Purpose**: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI, including chat interfaces. Provides project context, component docs, and usage examples.

**When to Use**:
- Working with shadcn/ui components
- Component registries, presets, --preset codes
- "shadcn init" or "create an app with --preset"
- Switching to --preset

### `supabase`
**Purpose**: Use when doing ANY task involving Supabase.

**Triggers**:
- Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues)
- Client libraries (`supabase-js`, `@supabase/ssr`) in Next.js, React, SvelteKit, Astro, Remix
- Auth issues (login, logout, sessions, JWT, cookies, getSession, getUser, getClaims, RLS)
- Supabase CLI or MCP server
- Schema changes, migrations, declarative schemas, security audits
- Postgres extensions (pg_graphql, pg_cron, pg_vector)
- Debugging/troubleshooting Supabase projects (HTTP errors, Postgres errors, RLS surprises, permission denied, schema cache issues, timeouts, Edge Function crashes, Realtime drops, Storage failures) and reading or querying logs (Logs Explorer, ClickHouse)

### `supabase-postgres-best-practices`
**Purpose**: Postgres best practices maintained by Supabase, for Postgres running anywhere.

**When to Use**:
- Creating/altering tables and columns (including choosing column types)
- Schema design, migrations, declarative schema files
- RLS policies and tests that verify them
- Indexes, triggers, database functions
- Queues and scheduled jobs (pg_cron, pgmq)
- Vector/semantic search (pgvector)
- Restoring dumps (pg_restore) or importing data
- Diagnosing slow queries, high CPU, timeouts, EXPLAIN plans, connection exhaustion, locking, bloat, or rows visible to the wrong user/tenant

### `vercel-react-best-practices`
**Purpose**: React and Next.js performance optimization guidelines from Vercel Engineering.

**When to Use**:
- Writing, reviewing, or refactoring React/Next.js code
- React components, Next.js pages
- Data fetching, bundle optimization, performance improvements

### `verification-before-completion`
**Purpose**: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always.

**When to Use**:
- Before claiming work is complete
- Before claiming a fix works
- Before creating PRs
- Evidence before assertions always

---

## Skill Installation

```bash
# Discover skills
npx skills find "react testing"

# Install skill
npx skills add vercel-labs/agent-skills@react-best-practices

# Update skills
npx skills update

# List installed skills
npx skills list
```

---

## Skill Usage in Dearune Context

| Task | Relevant Skills |
|---|---|
| Database migration | `supabase`, `supabase-postgres-best-practices` |
| React component optimization | `vercel-react-best-practices`, `shadcn` |
| UI design | `frontend-design`, `shadcn` |
| CI/CD setup | `github-actions-templates` |
| Supabase schema/migration | `supabase`, `supabase-postgres-best-practices` |
| React performance | `vercel-react-best-practices` |
| UI component development | `shadcn`, `frontend-design` |
| CI/CD pipeline | `github-actions-templates` |
| Bug reporting | `report` |
| OpenCode usage | `opencode` |

---

## Skill Loading

Skills are loaded from `.opencode/skill/` directory. The `skills-lock.json` tracks installed versions.

```json
{
  "version": 1,
  "skills": {
    "vercel-labs/agent-skills": {
      "version": "1.0.0",
      "skills": ["react-best-practices", "frontend-design"]
    }
  }
}
```

---

## Skill Development

To create a custom skill:

```bash
npx skills init my-skill
# Creates skill structure in .opencode/skill/my-skill/
```

Skill structure:
```
.opencode/skill/my-skill/
├── skill.json          # Skill manifest
├── reference/          # Reference materials
├── scripts/            # Helper scripts
└── instructions.md     # Main instructions
```

---

## Skill References

- [OpenCode Skills Documentation](https://opencode.ai/docs/skills)
- [Skills Registry](https://skills.sh/)
- [GitHub Skills Repository](https://github.com/opencode-ai/skills)

---

## Skill Maintenance

- Run `npx skills update` periodically
- Check for skill updates before major tasks
- Remove unused skills to reduce context
- Report broken skills via `npx skills report`