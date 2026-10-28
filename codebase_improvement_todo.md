# Dearune Codebase Improvement Plan - TODO

## Phase 0: Emergency Production Unblock & Deployment Gate (P0)
- [x] IMP-024: Unpause Supabase project xwgegarncnxswiswsufx and add scheduled keep-alive workflow
- [x] IMP-029: Add missing verify_jwt = false entries in supabase/config.toml and remove dead status code in admin-operations
- [x] IMP-005: Fix ReferenceError: before is not defined in admin-operations (ensure action)
- [x] IMP-020: Fix designer-media sanitizeName 'print' overwrite bug, path traversal, and magic bytes
- [x] IMP-006: Repair out-of-order SQL migrations (20261023*) and crashed Worker RPCs

## Phase 1: Core Customer & Courier Data Correctness (P0)
- [x] IMP-001: Fix PublicMessage.jsx media resolution (project-media JSON vs binary/redirect) and render MemorialLetter
- [x] IMP-002: Implement end-to-end recipient password protection
- [x] IMP-003: Harden get_public_message plaintext leak and enforce 2-year reading expiry window
- [x] IMP-004: Fix toOperation() overwriting customer recipientName with designerName
- [x] IMP-036: Enrich Bosta manifest export with Governorate/District fields

## Phase 2: Print Pipeline, Arabic PDF Support & UI Defect Fixes (P1)
- [x] IMP-010: Restore wiped STATIC_RUNS brand text, draw QR_CARD_BOX, fix bottomOperation qrContent in qrPaper.js
- [x] IMP-014: Remove duplicate 27 MB loadAssets call in buildQrPaperPdf and cache font/texture bytes
- [x] IMP-034: Embed Amiri-Regular.ttf in pdf.js and add Arabic glyph shaping
- [x] IMP-011: Fix fetchQaRecord wrapperRows destructuring and OperationsBadge milestone labels
- [x] IMP-026: Enable disabled milestone filter in WorkerOperations.jsx and fix blank readyToPrint card
- [x] IMP-027: Persist kind when creating a new wrapper
- [x] IMP-012: Fix gain vs level volume bug and cache noise AudioBuffer in sound.js
- [x] IMP-009: Persist current_version on public.templates instead of ephemeral Map

## Phase 3: Testing Suite Restoration & CI/CD Hardening (P1)
- [x] IMP-021: Restore tests/ and e2e/ suites and add CI verification gate
- [x] IMP-031: Synchronize CSP connect-src (wss://*.supabase.co) across index.html, public/_headers, and worker.js

## Phase 4: Security Hardening, Performance & Storage Hygiene (P2)
- [x] IMP-015: Wire up thumbnail_url in designer-templates, WrapperSelectionStage, and Admin/Wrappers
- [x] IMP-016: Add 50-minute TTL to SIGNED_URL_CACHE and OAuth token cache
- [x] IMP-017: Exclude heavy payload JSONB from list queries and filter OperationsPrint by ids
- [x] IMP-018: Require dedicated DESIGNER_JWT_SECRET and use constant-time digest comparison
- [x] IMP-019: Extend consume_rate_limit to project-media, designer-projects, and worker-designers
- [x] IMP-025: Invalidate SIGNED_URL_CACHE on wrapper photo replacement and make create-sale unit creation atomic
- [x] IMP-028: Add React ErrorBoundary around Suspense routes
- [x] IMP-030: Clean up orphaned media objects in designer-drafts when replaced/deleted
- [x] IMP-032: Add X-Request-Id correlation IDs and structured error logging

## Phase 5: Architectural Consolidation & Tech Debt Cleanup (P1-P3)
- [x] IMP-007: Decommission legacy Gen-1 (orders/messages) Edge Functions and fallbacks
- [x] IMP-008: Consolidate duplicate Admin Edge Function and Worker RPC mutations
- [x] IMP-022: Unify worker_audit_logs into admin_audit_log
- [x] IMP-033: Enforce maintenance mode and shipping address completeness in Worker milestone RPCs
- [x] IMP-013: Remove root scratch files and unused dependencies
- [x] IMP-023: Add composite indexes on physical_products, sold_orders, and projects
- [x] IMP-035: Replace no-op Service Worker fetch handlers with offline navigation fallback
