---
updated: 2026-10-25T11:55:00Z
---

# Project State

## Current Position

**Milestone:** Milestone 1 - Production Stabilization & Feature Parity
**Phase:** Phase 2 - Attendance Verification & Rotating QR Engine
**Status:** in progress
**Plan:** Plan 2.2 - Rotating HMAC-SHA256 QR-code session generation & geo-proximity check

## Last Action
Completed Phase 1 teacher account activation hardening, invitation token verification, and dual institutional identifier onboarding flows.

## Next Steps
1. Verify rotating HMAC-SHA256 QR code generation and 20-second token rotation
2. Run automated test suite for timetable conflict resolution and overlapping intervals
3. Validate linear SHA-256 hash chain audit triggers in PostgreSQL
4. Prepare Cloud SQL migration verification baseline

## Active Decisions

| Decision | Choice | Made | Affects |
|----------|--------|------|---------|
| Authoritative Persistence | PostgreSQL 15+ (Cloud SQL) with RLS | 2026-10-24 | All persistent data & audit logs |
| Realtime QR Scans | Cloud Firestore + HMAC-SHA256 validation | 2026-10-24 | Attendance tracking & live sessions |
| Client Hosting | Firebase Hosting with clean URL rewrites | 2026-10-24 | Frontend static portal pages |
| Audit Trail Integrity | Linear SHA-256 hash chaining triggers | 2026-10-24 | Security & compliance verification |

## Blockers
None

## Concerns
- Ensure Cloud SQL credentials and connection pooling limits are verified in Render staging environment before production cutoff.

---

*Last updated: 2026-10-25*
