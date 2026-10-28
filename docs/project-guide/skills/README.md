# Skills README

This document explains how to use the OpenCode skills system in the Dearune project.

## What Are Skills?

Skills are modular packages that extend OpenCode's capabilities with specialized knowledge, workflows, and tools. They're like plugins that teach OpenCode how to perform specific tasks or work with specific technologies.

## Available Skills

The following skills are installed and available for use:

| Skill | Purpose | When to Use |
|---|---|---|
| `frontend-design` | Visual design guidance | Building new UI or reshaping existing UI |
| `github-actions-templates` | CI/CD workflow creation | Setting up GitHub Actions |
| `opencode` | OpenCode usage/configuration | Questions about OpenCode itself |
| `report` | Issue reporting | Reporting OpenCode bugs |
| `shadcn` | shadcn/ui component management | Working with shadcn/ui components |
| `supabase` | Supabase operations | Any Supabase-related task |
| `supabase-postgres-best-practices` | PostgreSQL best practices | Database schema, migrations, queries |
| `vercel-react-best-practices` | React/Next.js optimization | React/Next.js performance |
| `verification-before-completion` | Evidence-based completion | Before claiming work complete |

## How to Use Skills

### Discovering Skills

```bash
# Search for skills by keyword
npx skills find "react testing"

# Search by category
npx skills find --category "testing"

# Browse all available
npx skills find
```

### Installing Skills

```bash
# Install a specific skill
npx skills add vercel-labs/agent-skills@react-best-practices

# Install from GitHub
npx skills add github:owner/repo@skill-name

# Install with specific version
npx skills add owner/repo@skill@v1.0.0
```

### Managing Skills

```bash
# List installed skills
npx skills list

# Update all skills
npx skills update

# Update specific skill
npx skills update vercel-labs/agent-skills@react-best-practices

# Remove a skill
npx skills remove vercel-labs/agent-skills@react-best-practices
```

### Skill Configuration

Skills are configured in `.opencode/skill/` directory and locked in `skills-lock.json`:

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

## Using Skills in Dearune Development

### When to Load Which Skill

| Task | Skills to Load |
|---|---|
| Database migration | `supabase`, `supabase-postgres-best-practices` |
| React component | `vercel-react-best-practices`, `shadcn` |
| UI design | `frontend-design`, `shadcn` |
| CI/CD setup | `github-actions-templates` |
| Supabase schema/migration | `supabase`, `supabase-postgres-best-practices` |
| React performance | `vercel-react-best-practices` |
| UI component development | `shadcn`, `frontend-design` |
| CI/CD pipeline | `github-actions-templates` |
| Bug reporting | `report` |
| OpenCode questions | `opencode` |

### Auto-Loading

Skills are automatically loaded based on the task context. You can also explicitly request a skill:

```
"Use the supabase skill to help with this migration"
"Apply the vercel-react-best-practices skill to optimize this component"
```

## Skill Discovery

### Finding Skills

```bash
# Search by keyword
npx skills find "react testing"

# Search by category
npx skills find --category "testing"

# Browse all available
npx skills find
```

### Installing Skills

```bash
# Install from registry
npx skills add vercel-labs/agent-skills@react-best-practices

# Install from GitHub
npx skills add github:owner/repo@skill-name

# Install specific version
npx skills add owner/repo@skill@v1.0.0
```

### Skill Updates

```bash
# Update all skills
npx skills update

# Update specific skill
npx skills update vercel-labs/agent-skills@react-best-practices

# Check for updates
npx skills outdated
```

## Skill Development

### Creating Custom Skills

```bash
# Initialize new skill
npx skills init my-custom-skill
```

Skill structure:
```
.opencode/skill/my-skill/
├── skill.json          # Skill manifest
├── reference/          # Reference materials
├── scripts/            # Helper scripts
└── instructions.md     # Main instructions
```

### Skill Manifest (skill.json)

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "Description of what this skill does",
  "author": "Your Name",
  "category": "database|frontend|backend|testing|devops",
  "tags": ["supabase", "postgres", "migration"],
  "instructions": "instructions.md",
  "scripts": {
    "setup": "scripts/setup.sh",
    "validate": "scripts/validate.sh"
  }
}
```

## Skill Best Practices

### When to Use Skills

- **Always** load relevant skills before starting a task
- **Combine** complementary skills (e.g., `supabase` + `supabase-postgres-best-practices`)
- **Update** skills regularly with `npx skills update`
- **Remove** unused skills to reduce context

### Skill Combinations

| Task | Skill Combination |
|---|---|
| Database migration | `supabase` + `supabase-postgres-best-practices` |
| React component | `vercel-react-best-practices` + `shadcn` |
| UI design | `frontend-design` + `shadcn` |
| CI/CD pipeline | `github-actions-templates` |
| API development | `supabase` + `vercel-react-best-practices` |

## Troubleshooting Skills

### Common Issues

| Issue | Solution |
|---|---|
| Skill not found | Run `npx skills update` |
| Version conflict | Remove and reinstall skill |
| Outdated skill | Run `npx skills update` |
| Missing dependency | Check skill's `package.json` |

### Debugging Skills

```bash
# Verbose output
npx skills add --verbose vercel-labs/agent-skills@react-best-practices

# Debug skill loading
DEBUG=skills npx skills list
```

## Resources

- [OpenCode Skills Documentation](https://opencode.ai/docs/skills)
- [Skills Registry](https://skills.sh/)
- [GitHub Skills Repository](https://github.com/opencode-ai/skills)
- [Skill Development Guide](https://opencode.ai/docs/skills/development)