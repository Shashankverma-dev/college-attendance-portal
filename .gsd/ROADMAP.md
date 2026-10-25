---
milestone: Milestone 1 - Production Stabilization & Feature Parity
version: 1.0.0
updated: 2026-10-25T12:30:00Z
---

# Roadmap

> **Current Phase:** Phase 4 - Examination & Continuous Internal Assessment (CIA)
> **Status:** planning

## Must-Haves (from SPEC)

- [x] Zero-denominator attendance calculation returns explicit `N/A` without division errors
- [x] Approved Leave (`L`) strictly excluded from attendance rates
- [x] Rotating HMAC-SHA256 QR-code session tokens with 20-second validity
- [x] Strict timetable interval boundaries ($\text{start} < \text{end}$) and teacher overlap conflict detection
- [ ] Examination and CIA component marks lifecycle (`DRAFT` $\to$ `SUBMITTED` $\to$ `PUBLISHED`)
- [ ] Linear SHA-256 hash-chained cryptographic audit trail verification

---

## Phases

### Phase 1: Authentication & Teacher Activation Hardening
**Status:** ✅ Complete
**Objective:** Hardened multi-role RBAC, Firebase Admin authentication verification, and teacher invitation token activation.
**Requirements:** REQ-01, REQ-02

**Plans:**
- [x] Plan 1.1: Teacher account activation & invite token validation
- [x] Plan 1.2: Dual institutional identifier enrollment checks

---

### Phase 2: Attendance Verification & Rotating QR Engine
**Status:** ✅ Complete
**Objective:** Verify zero-denominator attendance calculation, leave exclusion, and dynamic HMAC-SHA256 rotating QR codes.
**Requirements:** REQ-03, REQ-04

**Plans:**
- [x] Plan 2.1: Attendance rate calculation and leave exclusion verification
- [x] Plan 2.2: Rotating HMAC-SHA256 QR-code session generation & geo-proximity check

---

### Phase 3: Timetable Engine & Overlap Conflict Detection
**Status:** ✅ Complete
**Objective:** Validate interval boundaries, room allocations, teacher schedules, and practical lab subgroups.
**Requirements:** REQ-05

**Plans:**
- [x] Plan 3.1: Interval overlap boundary testing and classroom collision detection
- [x] Plan 3.2: Parallel practical subgroup (C1/C2) scheduling validation

---

### Phase 4: Examination & Continuous Internal Assessment (CIA)
**Status:** ⬜ Not Started
**Objective:** Component marks management, draft-to-published lifecycles, and student privacy isolation.
**Requirements:** REQ-06

**Plans:**
- [ ] Plan 4.1: Component-based marks lifecycle (Draft -> Submitted -> Published)
- [ ] Plan 4.2: Student score isolation and administrative grade lock

---

### Phase 5: Production Deployment & Verification Baseline
**Status:** ⬜ Not Started
**Objective:** Cloud SQL PostgreSQL integration, Firebase Hosting rewrites, and full test suite execution.
**Requirements:** REQ-07

**Plans:**
- [ ] Plan 5.1: Database migration and linear SHA-256 hash-chain audit test
- [ ] Plan 5.2: End-to-end integration verification baseline

---

## Progress Summary

| Phase | Status | Plans | Complete |
|-------|--------|-------|----------|
| 1. Authentication & RBAC | ✅ Complete | 2/2 | 100% |
| 2. Attendance & QR Engine | ✅ Complete | 2/2 | 100% |
| 3. Timetable Engine | ✅ Complete | 2/2 | 100% |
| 4. Examination & Marks | ⬜ Not Started | 0/2 | 0% |
| 5. Production Baseline | ⬜ Not Started | 0/2 | 0% |

---

*Last updated: 2026-10-25*
