# Documentation Maintenance

This document defines the procedure for keeping the documentation synchronized with the codebase.

## When to Update Documentation

### After Adding/Removing Files

| Change | Documents to Update |
|---|---|
| New file added | `FILE_CATALOG.md` |
| New export/function | `CODE_REFERENCE.md` |
| New route | `ROUTES_AND_PAGES.md` |
| New component | `COMPONENTS.md` |
| Schema change | `DATABASE_AND_SCHEMA.md` |
| New RPC/Edge Function | `API_AND_BACKEND.md` |
| Storage change | `STORAGE_SYSTEM.md` |
| New route | `ROUTES_AND_PAGES.md` |
| New component | `COMPONENTS.md` |
| Design token/component | `DESIGN_SYSTEM.md` |
| New pattern | `FEATURE_DEVELOPMENT_GUIDE.md` |
| Template change | `TEMPLATE_DEVELOPMENT_GUIDE.md` |
| Workflow change | `ADMIN_AND_WORKER_WORKFLOWS.md` |

### After Code Changes

| Change | Documents to Review |
|---|---|
| New feature | `FEATURE_DEVELOPMENT_GUIDE.md`, `FILE_CATALOG.md` |
| Bug fix | `TROUBLESHOOTING.md` (if new issue class) |
| Refactor | `CODE_REFERENCE.md`, `ARCHITECTURE.md` |
| Database change | `DATABASE_AND_SCHEMA.md` |
| API change | `API_AND_BACKEND.md` |
| Security change | `SECURITY_CONSIDERATIONS.md` |
| Config change | `CONFIGURATION_AND_ENVIRONMENT.md` |
| Deployment change | `DEPLOYMENT_AND_OPERATIONS.md` |

### After Adding Tests

| Test Type | Documents |
|---|---|
| Unit test | `TESTING_AND_DEBUGGING.md` (if new pattern) |
| E2E test | `TESTING_AND_DEBUGGING.md` (if new coverage) |
| New test file | `FILE_CATALOG.md` |

---

## Documentation Update Checklist

When merging a PR, verify:

- [ ] All new files listed in `FILE_CATALOG.md`
- [ ] New exports in `CODE_REFERENCE.md`
- [ ] New routes in `ROUTES_AND_PAGES.md`
- [ ] New components in `COMPONENTS.md`
- [ ] Schema changes in `DATABASE_AND_SCHEMA.md`
- [ ] New RPCs/Edge Functions in `API_AND_BACKEND.md`
- [ ] Storage changes in `STORAGE_SYSTEM.md`
- [ ] New design tokens/components in `DESIGN_SYSTEM.md`
- [ ] New patterns in `FEATURE_DEVELOPMENT_GUIDE.md`
- [ ] Template changes in `TEMPLATE_DEVELOPMENT_GUIDE.md`
- [ ] Workflow changes in `ADMIN_AND_WORKER_WORKFLOWS.md`
- [ ] Security changes in `SECURITY_CONSIDERATIONS.md`
- [ ] Config changes in `CONFIGURATION_AND_ENVIRONMENT.md`
- [ ] Deployment changes in `DEPLOYMENT_AND_OPERATIONS.md`
- [ ] Security changes in `SECURITY_CONSIDERATIONS.md`
- [ ] Troubleshooting updates in `TROUBLESHOOTING.md`
- [ ] Test updates in `TESTING_AND_DEBUGGING.md`

---

## Documentation Update Procedure

### 1. Identify Affected Documents

```bash
# Find files changed in PR
git diff --name-only HEAD~1

# Check which docs reference changed files
grep -r "changed_file_path" docs/project-guide/
```

### 2. Update Each Document

Follow the style guide in `docs/project-guide/README.md`:
- Use exact paths, symbol names, route definitions
- Cite source file paths and line ranges
- Use exact commands from the codebase
- Cite source file paths for security-sensitive behavior

### 3. Verify Links

```bash
# Check internal links
npm run docs:check-links  # If available
# Or manually verify
```

### 4. Update Changelog (if applicable)

```markdown
## [Version] - YYYY-MM-DD

### Added
- New feature X

### Changed
- Updated Y behavior

### Fixed
- Bug Z in component X

### Security
- Rotated secrets
```

---

## Documentation Style Guide

### Formatting Rules

- **Headers**: Use ATX style (`#`, `##`, `###`)
- **Code blocks**: Specify language (` ```typescript `)
- **File paths**: Use backticks (`src/components/MyComponent.jsx`)
- **Commands**: Use code blocks with `bash` or `bash`
- **Variables**: Use backticks (`VITE_SUPABASE_URL`)
- **UI elements**: Bold (`**Button**`, `*Input*`)

### Code Blocks

```markdown
```typescript
// Good: Language specified
export function myFunction() {
  return 'hello'
}
```

```bash
# Good: Language specified
npm run build
```

```sql
-- Good: Language specified
SELECT * FROM projects WHERE id = $1;
```

### Cross-References

```markdown
See [API_AND_BACKEND.md](./API_AND_BACKEND.md#edge-functions) for details.

See [Components](#components) for component list.
```

### Tables

```markdown
| Column | Type | Description |
|---|---|---|
| `id` | `uuid` | Primary key |
| `name` | `text` | Display name |
```

### Admonitions

```markdown
> **Note**: This is a note.

> **Warning**: This is a warning.

> **Tip**: This is a tip.

> **Danger**: This is dangerous.
```

---

## Documentation Review Process

### PR Review Checklist

- [ ] All new files documented in `FILE_CATALOG.md`
- [ ] New exports in `CODE_REFERENCE.md`
- [ ] New routes in `ROUTES_AND_PAGES.md`
- [ ] New components in `COMPONENTS.md`
- [ ] Schema changes in `DATABASE_AND_SCHEMA.md`
- [ ] New RPCs/Edge Functions in `API_AND_BACKEND.md`
- [ ] Storage changes in `STORAGE_SYSTEM.md`
- [ ] New design tokens in `DESIGN_SYSTEM.md`
- [ ] New patterns in `FEATURE_DEVELOPMENT_GUIDE.md`
- [ ] Template changes in `TEMPLATE_DEVELOPMENT_GUIDE.md`
- [ ] Workflow changes in `ADMIN_AND_WORKER_WORKFLOWS.md`
- [ ] Security changes in `SECURITY_CONSIDERATIONS.md`
- [ ] Config changes in `CONFIGURATION_AND_ENVIRONMENT.md`
- [ ] Deployment changes in `DEPLOYMENT_AND_OPERATIONS.md`
- [ ] Troubleshooting in `TROUBLESHOOTING.md`
- [ ] Testing updates in `TESTING_AND_DEBUGGING.md`

### Reviewer Checklist

- [ ] All internal links work
- [ ] Code examples are accurate
- [ ] File paths are correct
- [ ] No outdated information
- [ ] Consistent formatting
- [ ] No broken links
- [ ] No placeholder text remaining

---

## Automation

### Link Checking

```bash
# Check for broken links
npm run docs:check-links  # If configured
# Or manually verify
```

### Spell Check

```bash
# Check spelling
npx cspell docs/project-guide/**/*.md
```

### Link Validation

```bash
# Check internal links
node scripts/check-links.js  # If available
```

---

## Versioning

Documentation version follows code version:

```
v0.1.0 - Initial docs
v0.2.0 - Added feature X docs
v0.3.0 - Major architecture update
```

---

## Archiving

Old versions of documentation are kept in git history. No separate archive needed.

---

## Responsibility

- **Feature authors**: Update docs with feature
- **Reviewers**: Verify docs updated in PR
- **Maintainers**: Periodic audit (quarterly)
- **Tech writers**: Style/consistency review (if available)

---

## Quick Reference: Doc Locations

| Topic | Document |
|---|---|
| Architecture | `ARCHITECTURE.md` |
| Database | `DATABASE_AND_SCHEMA.md` |
| API/Backend | `API_AND_BACKEND.md` |
| Frontend Components | `COMPONENTS.md` |
| Routes | `ROUTES_AND_PAGES.md` |
| State Management | `STATE_MANAGEMENT.md` |
| Storage | `STORAGE_SYSTEM.md` |
| Auth/Permissions | `AUTHENTICATION_AND_PERMISSIONS.md` |
| Design System | `DESIGN_SYSTEM.md` |
| Testing | `TESTING_AND_DEBUGGING.md` |
| Deployment | `DEPLOYMENT_AND_OPERATIONS.md` |
| Security | `SECURITY_CONSIDERATIONS.md` |
| Config | `CONFIGURATION_AND_ENVIRONMENT.md` |
| File Catalog | `FILE_CATALOG.md` |
| Code Reference | `CODE_REFERENCE.md` |
| Troubleshooting | `TROUBLESHOOTING.md` |
| Feature Dev | `FEATURE_DEVELOPMENT_GUIDE.md` |
| Template Dev | `TEMPLATE_DEVELOPMENT_GUIDE.md` |
| Admin/Worker Flows | `ADMIN_AND_WORKER_WORKFLOWS.md` |
| Adding Feature | `development/ADDING_A_FEATURE.md` |
| Adding Page | `development/ADDING_A_PAGE_OR_ROUTE.md` |
| Adding Component | `development/ADDING_A_COMPONENT.md` |
| Adding DB Change | `development/ADDING_A_DATABASE_CHANGE.md` |
| Adding Storage | `development/ADDING_A_STORAGE_PROVIDER.md` |
| Adding Template | `development/ADDING_A_TEMPLATE.md` |
| Troubleshooting | `development/TROUBLESHOOTING.md` |
| Doc Maintenance | `development/DOCUMENTATION_MAINTENANCE.md` |

---

## Remember

> **Documentation is part of the codebase. If it's not documented, it doesn't exist. Update docs with every change.**