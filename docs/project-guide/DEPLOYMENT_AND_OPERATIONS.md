# Deployment and Operations

This document describes the deployment pipeline, operational procedures, and monitoring for Dearune.

## Deployment Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   PUSH TO   │───▶│  GITHUB     │───▶│  SUPABASE   │───▶│  CLOUDFLARE │
│   MAIN      │    │  ACTIONS    │    │  DB PUSH +  │    │  WORKERS    │
│             │    │  (deploy.yml)│   │  FN DEPLOY  │    │  (ASSETS)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## Deployment Pipeline

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

```yaml
name: CI & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  lint-and-test:
    name: Lint, Typecheck & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test

  deploy:
    name: Deploy Supabase
    needs: lint-and-test
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: 'latest' }
      - name: Link project
        run: supabase link --project-ref "$SUPABASE_PROJECT_ID"
      - name: Apply database migrations
        run: supabase db push
      - name: Set edge function secrets
        run: |
          set_secret() { ... }
          set_secret DESIGNER_JWT_SECRET "${{ secrets.DESIGNER_JWT_SECRET }}"
          set_secret GOOGLE_CLIENT_ID "${{ secrets.GOOGLE_CLIENT_ID }}"
          set_secret GOOGLE_CLIENT_SECRET "${{ secrets.GOOGLE_CLIENT_SECRET }}"
          set_secret GOOGLE_REFRESH_TOKEN "${{ secrets.GOOGLE_REFRESH_TOKEN }}"
          set_secret GOOGLE_DRIVE_MEDIA_FOLDER_ID "${{ secrets.GOOGLE_DRIVE_MEDIA_FOLDER_ID }}"
      - name: Deploy edge functions
        run: supabase functions deploy --project-ref "$SUPABASE_PROJECT_ID"
      - name: Verify deployments
        run: |
          supabase functions list
          echo "Deployed to $SUPABASE_PROJECT_ID"
```

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token (supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_ID` | Project reference (from dashboard URL) |
| `SUPABASE_DB_PASSWORD` | Database password for `supabase db push` |
| `DESIGNER_JWT_SECRET` | HS256 signing secret (≥32 random chars) |
| `GOOGLE_CLIENT_ID` | Drive OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Drive OAuth 2.0 client secret |
| `GOOGLE_REFRESH_TOKEN` | Drive OAuth 2.0 refresh token |
| `GOOGLE_DRIVE_MEDIA_FOLDER_ID` | Drive folder ID for media |

## Local Development Setup

### Prerequisites

```bash
# Install Supabase CLI
npm install -g supabase

# Or via Homebrew
brew install supabase/tap/supabase

# Login
supabase login
```

### Local Development Stack

```bash
# Start all services
supabase start

# Apply migrations
supabase db reset

# Serve Edge Functions locally
supabase functions serve

# Start Vite dev server
npm run dev
```

### Local Supabase URLs

| Service | URL |
|---|---|
| API Gateway | `http://127.0.0.1:54321` |
| Studio | `http://127.0.0.1:54323` |
| Inbucket (Email) | `http://127.0.0.1:54324` |
| Database | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Production Deployment

### Cloudflare Workers Deployment

```bash
# Build production assets
npm run build

# Deploy to Cloudflare Workers
npx wrangler deploy

# Or via GitHub Actions (automatic on push to main)
```

### Supabase Production Deployment

```bash
# Link to production project
supabase link --project-ref xwgegarncnxswiswsufx

# Push migrations
supabase db push

# Deploy edge functions
supabase functions deploy --project-ref xwgegarncnxswiswsufx

# Set secrets (one-time, then managed via GitHub Actions)
supabase secrets set DESIGNER_JWT_SECRET=xxx --project-ref xwgegarncnxswiswsufx
supabase secrets set GOOGLE_CLIENT_ID=xxx --project-ref xxx
# ... etc
```

## Database Operations

### Migration Management

```bash
# Create new migration
supabase migration new descriptive_name

# Edit generated SQL file in supabase/migrations/
# Test locally
supabase db reset

# Push to production
supabase db push
```

### Migration Best Practices

1. **Forward-only**: Never edit applied migrations
2. **Idempotent**: Use `IF NOT EXISTS`, `DROP IF EXISTS`
3. **Backfill in same migration**: Data + schema together
4. **Test locally**: `supabase db reset` before push
5. **Order matters**: Dependencies must exist first

### Rollback Procedure

```bash
# Supabase doesn't support direct rollback
# Options:
# 1. Create new migration that reverses changes
# 2. Point-in-time recovery (PITR) via Supabase Dashboard
# 3. Restore from backup (if configured)
```

## Edge Function Management

### Deploying Functions

```bash
# Deploy all functions
supabase functions deploy --project-ref xwgegarncnxswiswsufx

# Deploy specific function
supabase functions deploy admin-operations --project-ref xwgegarncnxswiswsufx
```

### Function Secrets

```bash
# Set secrets (one-time, then managed via GitHub Actions)
supabase secrets set DESIGNER_JWT_SECRET=xxx --project-ref xwgegarncnxswiswsufx
supabase secrets set GOOGLE_CLIENT_ID=xxx --project-ref xwgegarncnxswiswsufx
supabase secrets set GOOGLE_CLIENT_SECRET=xxx --project-ref xwgegarncnxswiswsufx
supabase secrets set GOOGLE_REFRESH_TOKEN=xxx --project-ref xwgegarncnxswiswsufx
supabase secrets set GOOGLE_DRIVE_MEDIA_FOLDER_ID=xxx --project-ref xwgegarncnxswiswsufx

# List secrets
supabase secrets list --project-ref xwgegarncnxswiswsufx
```

### Function Logs

```bash
# View logs
supabase functions logs project-media --project-ref xwgegarncnxswiswsufx

# Follow logs
supabase functions logs project-media --project-ref xwgegarncnxswiswsufx --follow
```

## Monitoring & Observability

### Supabase Dashboard

```
https://supabase.com/dashboard/project/xwgegarncnxswiswsufx
→ Logs → API Gateway (Edge Functions)
→ Logs → Database (PostgreSQL)
→ Logs → Auth
→ Logs → Storage
→ Logs → Realtime
→ Database → Advisors (indexes, unused indexes)
→ Database → Query Performance
```

### Key Metrics to Monitor

| Metric | Threshold | Action |
|---|---|---|
| Edge Function latency | > 2s p95 | Investigate |
| Edge Function error rate | > 1% | Alert |
| Database CPU | > 80% | Scale/optimize |
| Database connections | > 80% of max | Pool/optimize |
| Storage usage | > 80% | Cleanup/upgrade |
| Auth error rate | > 5% | Investigate |

### Custom Metrics (Edge Functions)

```typescript
// In Edge Functions
logInfo(requestId, 'project-media request', { method: req.method, publicId })

logError(requestId, 'Rate limit exceeded', error, { publicId, retryAfter: 60 })
```

## Backup & Recovery

### Database Backups

| Backup Type | Frequency | Retention |
|---|---|---|
| Automated (Supabase) | Daily | 7 days (free tier) / 30 days (pro) |
| Point-in-time Recovery (PITR) | Continuous | 7 days (free) / 30 days (pro) |
| Manual | On-demand | Manual |

### Manual Backup

```bash
# Dump schema + data
supabase db dump --data-only -f backup.sql

# Restore
psql "postgresql://postgres:password@host:5432/postgres" < backup.sql
```

### Point-in-Time Recovery

```bash
# Via Supabase Dashboard → Database → Backups → Point-in-time recovery
# Select timestamp, create new branch/project
```

### Media Backup (Designer Drafts)

```bash
# Supabase Storage backup
# 1. List objects
supabase storage ls designer-drafts --recursive

# 2. Download (via script)
# 3. Store in external backup (S3, GCS, etc.)
```

## Incident Response

### Common Incidents

| Incident | Detection | Response |
|---|---|---|
| Edge Function 5xx | Dashboard alerts / logs | Check logs, rollback if needed |
| Database CPU spike | Dashboard alerts | Check slow queries, add indexes |
| Storage full | Dashboard alerts | Cleanup / upgrade |
| Auth failures | Auth logs | Check secrets, rate limits |
| PWA install fails | User reports | Check manifest, SW, HTTPS |

### Incident Response Playbook

1. **Acknowledge** - Confirm issue, assign owner
2. **Assess** - Check dashboards, logs, user reports
3. **Mitigate** - Apply quick fix (feature flag, rollback, scale)
4. **Resolve** - Root cause fix, deploy
5. **Postmortem** - Document, action items

### Rollback Procedures

```bash
# Frontend (Cloudflare Workers)
wrangler rollback --project-ref xxx

# Database (create reversal migration)
supabase migration new revert_xxx
# Edit SQL to reverse changes
supabase db push

# Edge Functions
supabase functions deploy --project-ref xxx --legacy-version=N
```

## Security Operations

### Secret Rotation

```bash
# Rotate DESIGNER_JWT_SECRET (quarterly)
supabase secrets set DESIGNER_JWT_SECRET=new_secret --project-ref xxx

# Rotate Google credentials (via Google Cloud Console)
# Update in GitHub Secrets + Supabase secrets
```

### Certificate Management

- Cloudflare manages TLS automatically
- Custom domains: Cloudflare Dashboard → SSL/TLS
- HSTS enabled via Cloudflare

### Security Scanning

```bash
# Dependency audit
npm audit
npm audit fix

# Container scan (if using Docker)
# trivy image dearune:latest

# SAST
npm run lint  # Oxlint includes security rules
```

## Capacity Planning

### Current Limits (Free Tier)

| Resource | Limit | Current Usage |
|---|---|---|
| Database size | 500 MB | ~50 MB |
| Database connections | 100 | ~20 |
| Edge Function invocations | 500k/month | ~50k |
| Storage | 1 GB | ~200 MB |
| Bandwidth | 2 GB | ~500 MB |

### Scaling Triggers

| Metric | Threshold | Action |
|---|---|---|
| DB CPU > 80% | 15 min | Upgrade compute |
| Connections > 80 | 5 min | Enable pooling |
| Function latency p95 > 2s | 10 min | Optimize/upgrade |
| Storage > 80% | Daily | Cleanup/upgrade |

## Maintenance Windows

### Scheduled Maintenance

- **Day**: Sunday
- **Time**: 02:00-04:00 UTC
- **Frequency**: Monthly (first Sunday)
- **Activities**: Dependency updates, index rebuild, vacuum analyze

### Emergency Maintenance

- Communicate via status page / email
- Minimize downtime (< 15 min)
- Rollback plan ready

## Disaster Recovery

### RTO/RPO Targets

| Scenario | RTO | RPO |
|---|---|---|
| Database corruption | 1 hour | 1 hour (PITR) |
| Edge Function outage | 15 min | 0 |
| Storage loss | 4 hours | 24 hours |
| Region outage | 4 hours | 24 hours |

### DR Test Schedule

- Quarterly: PITR restore test
- Semi-annual: Full failover drill
- Annual: Full disaster recovery exercise

## Operational Runbooks

### Runbook: Database Migration Failure

1. Check `supabase db push` output
2. Identify failing migration
3. Fix SQL (idempotent, correct dependencies)
4. `supabase db reset` locally to verify
5. `supabase db push` again

### Runbook: Edge Function Timeout

1. Check function logs for slow queries
2. Add indexes if missing
3. Increase timeout in `supabase/config.toml` (max 60s)
4. Consider async processing for heavy operations

### Runbook: Rate Limit Exhausted

1. Check `rate_limit_buckets` table
2. Identify abusive client (IP, user)
3. Adjust limits or block client
4. Monitor for abuse patterns

### Runbook: Storage Full

1. Identify largest buckets (`supabase storage ls -l`)
2. Clean up orphaned drafts (old `designer-drafts` objects)
3. Compress old assets
4. Request storage upgrade if needed

## Contact & Escalation

| Role | Contact | Escalation |
|---|---|---|
| On-call Engineer | Slack #oncall | Page after 15 min |
| Supabase Support | Dashboard → Support | Pro plan: 1hr SLA |
| Cloudflare Support | Dashboard → Support | Enterprise: 1hr SLA |
| Google Cloud Support | Console → Support | Premium: 1hr SLA |

## Operational Checklists

### Daily

- [ ] Check Supabase Dashboard for alerts
- [ ] Review Edge Function error rates
- [ ] Verify backup completion
- [ ] Check disk space

### Weekly

- [ ] Review slow query report
- [ ] Check index usage (`pg_stat_user_indexes`)
- [ ] Review Edge Function performance
- [ ] Update dependencies (`npm audit`)

### Monthly

- [ ] Rotate secrets (quarterly)
- [ ] Review Supabase Advisor recommendations
- [ ] Capacity planning review
- [ ] Security scan (`npm audit`)

### Quarterly

- [ ] Disaster recovery test
- [ ] Capacity planning
- [ ] Dependency updates
- [ ] Security audit