# Security Considerations

This document describes the security architecture, threat model, and security practices for Dearune.

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SECURITY LAYERS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         NETWORK LAYER                                │   │
│  │  • HTTPS everywhere (Cloudflare TLS 1.3)                            │   │
│  │  • HSTS, CSP, Referrer-Policy, Permissions-Policy                   │   │
│  │  • Cloudflare WAF (optional)                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       APPLICATION LAYER                              │   │
│  │  • CSRF protection (SameSite cookies, Origin checks)                │   │
│  │  • XSS prevention (React auto-escaping, CSP)                        │   │
│  │  • Input validation (Zod schemas)                                   │   │
│  │  • Rate limiting (token bucket RPC)                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AUTHENTICATION LAYER                         │   │
│  │  • Supabase Auth (Admin/Worker) - HttpOnly cookies, PKCE            │   │
│  │  • Designer JWT (HS256, 48h, memory-only)                           │   │
│  │  • Worker permissions (24 granular permissions)                     │   │
│  │  • Public token capability (QR code)                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         DATA LAYER                                   │   │
│  │  • Row Level Security (RLS) on all tables                           │   │
│  │  • Service-role only for Edge Functions                             │   │
│  │  • Encrypted drafts (AES-GCM, per-designer keys)                    │   │
│  │  • Public token capability (short-lived, scoped)                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       INFRASTRUCTURE LAYER                           │   │
│  │  • Supabase managed PostgreSQL (encrypted at rest)                  │   │
│  │  • Cloudflare TLS 1.3 + HSTS                                        │   │
│  │  • Cloudflare Workers (edge runtime)                                │   │
│  │  • Secret rotation (quarterly)                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Threat Model

### Assets to Protect

| Asset | Sensitivity | Protection |
|---|---|---|
| **Letter content** (text, photos, audio) | HIGH | Encrypted drafts, signed URLs, 2-year expiry |
| **Designer credentials** | HIGH | bcrypt (120k iterations), HS256 JWT |
| **Admin/Worker credentials** | HIGH | Supabase Auth (bcrypt, HttpOnly cookies) |
| **Sales/financial data** | HIGH | Immutable ledger, RLS, audit logs |
| **Recipient PII** | MEDIUM | Signed URLs, 2-year expiry, no indexing |
| **Public tokens** | LOW | 32-char random, capability-based |

### Attack Vectors & Mitigations

| Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **SQL Injection** | Low | High | Parameterized queries, RLS, no dynamic SQL |
| **XSS** | Medium | High | React auto-escaping, CSP, no dangerouslySetInnerHTML |
| **CSRF** | Low | Medium | SameSite=Lax cookies, Origin checks, custom JWT |
| **Auth Bypass** | Low | Critical | RLS, JWT verification, permission checks per-RPC |
| **Data Leakage** | Medium | High | RLS, signed URLs, capability tokens, namespace isolation |
| **Privilege Escalation** | Low | Critical | Permission checks per-RPC, no client-side auth |
| **Data Exfiltration** | Low | High | Signed URLs (15min TTL), no direct storage access |
| **Replay Attacks** | Low | Medium | Nonce in JWT, short expiry, token bucket rate limiting |
| **Supply Chain** | Low | High | npm audit, locked deps, minimal deps |
| **Insider Threat** | Low | High | Audit logs, least privilege, separation of duties |

## Authentication Security

### Designer JWT

```typescript
// Signing
const token = await new SignJWT({ role: 'designer', code })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(designer.id)
  .setIssuedAt()
  .setExpirationTime('48h')
  .sign(jwtSecret())  // 256-bit secret from env

// Verification
const { payload } = await jwtVerify(token, jwtSecret())
if (payload.role !== 'designer' || typeof payload.sub !== 'string') return null
```

**Security Properties:**
- **Algorithm**: HS256 (symmetric, 256-bit key)
- **Expiry**: 48 hours
- **Storage**: Memory only (never localStorage/cookies)
- **Key**: `DESIGNER_JWT_SECRET` (256-bit, base64-encoded)
- **Rotation**: Quarterly via secret rotation

### Supabase Auth (Admin/Worker)

```typescript
// Session management
const { data: { session } } = await supabase.auth.getSession()
// HttpOnly cookie, auto-refresh via onAuthStateChange
```

**Security Properties:**
- HttpOnly, Secure, SameSite=Lax cookies
- PKCE for OAuth flows
- Automatic token refresh
- Session revocation on password change

### Worker Permissions

```sql
-- 24 granular permissions, checked per-RPC
CREATE TABLE worker_permissions (
  worker_id uuid REFERENCES workers(id) ON DELETE CASCADE,
  permission_id text REFERENCES permissions(id),
  PRIMARY KEY (worker_id, permission_id)
);

-- Checked in every worker RPC:
IF NOT public.worker_has_permission('operations.mark_shipped') 
THEN RAISE EXCEPTION 'worker.forbidden';
```

## Data Protection

### Row Level Security (RLS)

```sql
-- Projects: designers see own, admins see all
CREATE POLICY projects_designer_access ON projects
  FOR ALL TO authenticated
  USING (designer_id = auth.uid() OR is_dearune_admin());

-- Physical products: workers via security_invoker view
CREATE VIEW operations_units WITH (security_invoker = true) AS
SELECT ... FROM physical_products pp JOIN projects p ON p.id = pp.project_id ...;
```

### Data Encryption

#### Draft Encryption (Client-Side)

```typescript
// AES-GCM with per-designer key
const key = await deriveKey(designerDraftSecret, salt)
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  plaintext
)
// Stored in localStorage + IndexedDB
```

#### Database Encryption

- **At rest**: Supabase managed (AES-256)
- **In transit**: TLS 1.3 (Cloudflare + Supabase)
- **Secrets**: Never in code, only env vars/secrets

## Network Security

### TLS Configuration

```
Cloudflare → Supabase: TLS 1.3 (managed)
Client → Cloudflare: TLS 1.3 (Cloudflare managed)
Cloudflare → Origin: TLS 1.3 (Supabase managed)
```

### Security Headers

```html
<!-- index.html CSP -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  img-src 'self' data: https://*.supabase.co blob:;
  media-src 'self' https://*.supabase.co blob:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
```

### Additional Headers (Cloudflare `_headers`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: DENY
```

The production CSP is the one in `public/_headers` (it is the enforced header;
the `index.html` meta above is the older reference). Its `frame-src` is
`'self' blob: https:` — the `https:` entry exists for one reason only: the
`external-link` proof page may embed the designer's destination so they can see
what the printed code will open. `frame-ancestors` on our own pages is
unchanged, and an `http:` destination is never framed on an https page (browser
mixed-content blocking, plus the stage explains it) — only `https:` is allowed
to arrive in a frame.

### Outbound URL checks (`link-check`)

The `external-link` preview is the only place Dearune makes an outbound request
on a designer's behalf. It is treated as an SSRF surface:

- designer JWT required, rate limited per designer;
- target must parse as absolute `http(s)`, with no embedded credentials;
- literal private/internal hosts are refused (`localhost`, loopback, RFC1918,
  link-local/cloud metadata, CGNAT, IPv6 loopback/ULA/link-local, decimal/hex
  IPv4, `.internal`/`.local`/`.home.arpa`), and a public name that resolves to a
  private address is refused when the runtime exposes `Deno.resolveDns`;
- redirects are followed **manually** (`redirect: 'manual'`), each hop is
  re-validated before it is contacted, and the chain is capped;
- the response exposes enum reasons + an HTTP status only — never an internal
  address, port or server error text — and the URL/query string is not logged.

The preview never defeats a destination's `X-Frame-Options`/`frame-ancestors`:
a refusal is reported as a refusal, with an `rel="noopener noreferrer"` link
instead of an embedded frame.

### CORS (Edge Functions)

```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, range, x-request-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Type, Location',
}
```

## Data Privacy

### Data Minimization

| Data Collected | Purpose | Retention |
|---|---|---|
| Designer code/passcode | Authentication | Until revoked |
| Letter content | Product delivery | 2 years + archive |
| Recipient PII (name, address) | Shipping | 2 years + archive |
| Analytics | Product improvement | 13 months |
| Audit logs | Security/compliance | 7 years |

### Data Subject Rights

| Right | Implementation |
|---|---|
| Access | Admin dashboard export |
| Rectification | Admin dashboard edit |
| Erasure | Soft delete (archived_at), hard delete on request |
| Portability | JSON export via admin |
| Restriction | Archive flag |
| Objection | Opt-out flag |

### Data Processing Agreements

- **Supabase**: DPA signed (EU/US)
- **Google Drive**: DPA signed
- **Cloudflare**: DPA signed
- **Bosta**: DPA signed (Egypt)

## Compliance

### GDPR (EU Customers)

- Lawful basis: Contract performance + Legitimate interest
- DPA with all subprocessors
- 72-hour breach notification
- DPO contact: privacy@dearune.app

### Egypt Data Protection Law

- Local data residency (Supabase Frankfurt + Cloudflare CDN)
- Arabic language support
- Local law compliance for financial data

## Audit Logging

### Audit Tables

| Table | Purpose | Retention |
|---|---|---|
| `admin_audit_log` | Admin actions | 7 years |
| `worker_audit_logs` | Worker actions | 7 years |
| `physical_product_events` | Unit timeline | Permanent |
| `project_events` | Project lifecycle | Permanent |
| `order_events` | Legacy orders | Permanent |

### Audit Entry Format

```json
{
  "actor_id": "uuid",
  "actor_type": "admin|worker|system|customer",
  "action": "operations.milestone.shipped",
  "target_type": "project|physical_product",
  "target_id": "uuid",
  "metadata": {
    "tracking_code": "TRACK123",
    "worker_id": "uuid"
  },
  "created_at": "2026-10-28T10:30:00Z"
}
```

## Incident Response

### Breach Notification

| Trigger | Timeline | Recipients |
|---|---|---|
| Personal data breach | 72 hours | DPA, affected users |
| Security incident | 24 hours | Security team, DPO |
| Data loss | 1 hour | DPO, Legal |

### Breach Response Playbook

1. **Contain** - Revoke tokens, disable accounts, block IPs
2. **Assess** - Determine scope, data affected
3. **Notify** - Legal, DPO, affected users (72h GDPR)
4. **Remediate** - Patch, rotate secrets, restore
5. **Document** - Incident report, timeline
6. **Improve** - Update controls, monitoring

## Security Checklist

### Pre-Deployment

- [ ] All secrets in env/secrets (not code)
- [ ] CSP headers configured
- [ ] CSP report-only tested
- [ ] HSTS enabled
- [ ] CSP report-only tested
- [ ] Rate limits configured
- [ ] RLS policies tested
- [ ] Audit logs verified
- [ ] Secrets rotated (quarterly)
- [ ] Dependencies scanned (`npm audit`)

### Runtime

- [ ] CSP report-only monitored
- [ ] Rate limits monitored
- [ ] Error rates < 1%
- [ ] Auth failures < 5%
- [ ] Backup verified (weekly)
- [ ] Secrets rotated (quarterly)
- [ ] Dependencies updated (monthly)
- [ ] Security scan (monthly)

## Security Contacts

| Role | Contact | Responsibility |
|---|---|---|
| **Security Team** | security@dearune.app | Incident response |
| **DPO** | dpo@dearune.app | GDPR compliance |
| **Supabase Support** | Dashboard → Support | Infrastructure issues |
| **Cloudflare Support** | Dashboard → Support | Edge/CDN issues |
| **Google Cloud** | Console → Support | Drive/Identity issues |

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
- [Cloudflare Security](https://developers.cloudflare.com/fundamentals/security/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [NIST CSF](https://www.nist.gov/cyberframework)