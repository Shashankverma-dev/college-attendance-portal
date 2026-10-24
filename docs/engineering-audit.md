# SRHU Attendance Portal: Comprehensive Engineering & Security Audit

**Audit Date:** 2026-10-24  
**Audit Scope:** Full Full-Stack Source Code, API Security, Persistence Layer, Business Logic, Frontend Integrity  
**Target Identity:** Swami Rama Himalayan University (SRHU) Attendance & Examination Portal  
**Primary Brand Identity:** `#1D3C72` (Official Institutional Blue)  

---

## Executive Summary of Confirmed Defects

| Defect ID | Category | Severity | Affected Files & Functions | Description |
|---|---|---|---|---|
| **SEC-01** | Authentication | **P0 (Critical)** | `backend/src/middleware/auth.ts`<br>`backend/src/routes/auth.routes.ts` | **Hardcoded Email Elevation & Role Fabrication**: Email comparison (`email === 'shashankvermahsst@gmail.com' \|\| email === 'admin@college.edu'`) automatically elevated requests to `GLOBAL_ADMIN`. Hardcoded credentials (`Admin@Portal2026!`) accepted in backend login for any admin/HOD role without database credential verification. |
| **SEC-02** | Session Integrity | **P0 (Critical)** | `backend/src/services/token.ts`<br>`createSessionToken()`, `verifySessionToken()` | **Hardcoded Secret Key Fallback**: Session tokens signed and verified using fallback secret `'portal-session-secret-key-institution-2026'` when `SESSION_SECRET` is unset. Allows forgery of session tokens if environment variable is omitted. |
| **SEC-03** | Frontend Security | **P0 (Critical)** | `signin.html`<br>Lines 694-756 | **Client-Side Fake Token Generation**: Client script generated local mock tokens (`admin-auth-token-...`, `hod-auth-token-...`) and stored `attendance_user_role: 'admin'` in `sessionStorage` and `localStorage` upon password match, bypassing server-side authentication entirely. |
| **SEC-04** | Access Control | **P0 (Critical)** | `backend/src/middleware/auth.ts` | **Fail-Open on Database Error**: When checking user deactivation/suspension in `users` table, database errors were caught and silently swallowed, allowing suspended users to continue if the database timed out or errored. |
| **DB-01** | Database Architecture | **P0 (Critical)** | `backend/src/server.ts`<br>`backend/src/config/db.ts` | **Missing Production Database Startup Gate**: `assertProductionDbAvailable` was defined in `db.ts` but never invoked on server startup. Production deployments could serve traffic using local memory arrays without PostgreSQL connectivity. |
| **DATA-01** | Student Management | **P1 (High)** | `backend/src/routes/profile.routes.ts`<br>`getSyntheticProfile()` | **Synthetic Profile Substitution**: When an authenticated user's profile was not found, the service defaulted to `localStudents[0]` (Alex Chen / Aarav Sharma) or fabricated faculty/admin identities instead of returning a controlled 404/403 error. |
| **DATA-02** | Student Management | **P1 (High)** | `backend/src/routes/student.routes.ts`<br>`router.post('/', ...)`<br>`router.post('/:id/transfer', ...)` | **Incomplete PostgreSQL Persistence**: Student creation (`POST /`) and section transfers (`POST /:id/transfer`) only updated `localStudents` in memory and did not execute SQL mutations in PostgreSQL even when `isDbConnected()` was true. |
| **DATA-03** | Data Integrity | **P1 (High)** | `backend/src/routes/student.routes.ts`<br>`router.delete('/:studentProfileId')` | **Raw Cascade Deletion**: Deleting a student performed raw destructive SQL queries deleting historical `attendance_records` and `student_marks`, violating audit and institutional record preservation requirements. |
| **BUS-01** | Attendance Analytics | **P1 (High)** | `backend/src/routes/attendance.routes.ts`<br>`router.get('/student/summary', ...)` | **Hardcoded Attendance Metrics**: In-memory mode returned fixed synthetic attendance percentages (`95.8%`, `86.4%`, `95.0%`) rather than calculating `Present / (Present + Absent) * 100` from actual records. |
| **BUS-02** | Dashboard Analytics | **P1 (High)** | `backend/src/routes/admin.routes.ts`<br>`router.get('/dashboard', ...)` | **Fabricated Metric & Audit Fallbacks**: Fixed attendance rate fallback `'91.8'` and hardcoded `auditChainIntegrity: { status: 'VALIDATED' }` returned without executing actual hash chain verification. |
| **BUS-03** | Academic Calendar | **P2 (Medium)** | `backend/src/routes/academic.routes.ts`<br>`CalendarEventSchema` | **Missing Scope Hierarchy Validation**: `CalendarEventSchema` did not validate that `course_id` is supplied when scope is `COURSE`, `academic_year_id` when `YEAR`, `semester_id` when `SEMESTER`, and `section_id` when `SECTION`. |
| **BUS-04** | Onboarding Quota | **P2 (Medium)** | `backend/src/routes/onboarding.routes.ts`<br>`router.get('/quota-check', ...)` | **Hardcoded Student Count Fallback**: Defaulted student count to `'4165'` if `count` query param was omitted, creating inaccurate quota reports. |
| **BUS-05** | Formula Injection | **P2 (Medium)** | `backend/src/services/bulk-onboard.ts`<br>`sanitizeFormulaValue()`, `sanitizeForExport()` | **Incomplete Formula Injection Guard**: Trimming input before checking formula prefixes allowed dangerous whitespace/tab prefixes to bypass sanitization in spreadsheet exports. |
| **SEC-05** | Live QR Attendance | **P1 (High)** | `backend/src/services/qr-attendance.ts` | **Memory-Only QR Sessions**: QR session generation and scan verification stored data exclusively in `localLiveQRSessions` and `localLiveQRScans`, failing to persist to `live_qr_sessions` and `live_qr_scans` PostgreSQL tables. |
| **TEST-01** | Quality Assurance | **P1 (High)** | `backend/package.json` | **Missing Declared Test Infrastructure**: `npm test` fails immediately because `jest` is not installed, despite test scripts existing in `src/scripts` and `src/tests`. |

---

## Detailed Defect Breakdown & Remediation Plan

### 1. Authentication & Session Security (SEC-01, SEC-02, SEC-03, SEC-04)
- **Defects:**
  - `backend/src/middleware/auth.ts`: `email === 'shashankvermahsst@gmail.com' || email === 'admin@college.edu'` overrides decoded role to `GLOBAL_ADMIN`.
  - `backend/src/routes/auth.routes.ts`: `userPasswords` map seeds fixed credentials, and `password === 'Admin@Portal2026!'` grants instant access.
  - `backend/src/services/token.ts`: fallback key `'portal-session-secret-key-institution-2026'` allows offline token forgery.
  - `signin.html`: Client-side JavaScript stores fake tokens in storage when `Admin@Portal2026!` is entered.
  - Swallowed errors during deactivation checks allowed suspended users to bypass access checks.
- **Remediation:**
  - Remove all email-based role elevation logic; roles must come strictly from server-verified database records or authenticated claims.
  - Remove hardcoded password fallbacks (`Admin@Portal2026!`). Ensure password verification validates against stored cryptographic hashes (or explicit secure seed in development only).
  - Require `SESSION_SECRET` in production. Fail startup immediately if `SESSION_SECRET` is missing in production. In development, generate a cryptographically strong random ephemeral secret if unset and log a prominent warning.
  - Strip client-side token generation from `signin.html`; all sign-in attempts must route through backend `/api/auth/login` or verified Firebase SDK authentication.
  - Enforce fail-closed behavior on database error during authorization/account status verification.

### 2. Database Persistence & Startup Architecture (DB-01, DATA-02, DATA-03, SEC-05)
- **Defects:**
  - `backend/src/server.ts` starts listening before verifying DB connection.
  - Multiple routes lack PostgreSQL implementations or silently fall back to in-memory arrays.
  - `qr-attendance.ts` doesn't write to PostgreSQL tables (`live_qr_sessions`, `live_qr_scans`).
  - Destructive cascading deletions in student delete route destroy historical attendance and marks.
- **Remediation:**
  - Wire database readiness into server startup. If `NODE_ENV === 'production'` and PostgreSQL is unreachable, fail startup immediately.
  - Implement full PostgreSQL persistence for student creation, section transfers, status changes, and deletion (using soft-delete/archival to preserve historical records).
  - Connect `qr-attendance.ts` to `live_qr_sessions` and `live_qr_scans` when database is available, with database uniqueness constraints protecting against duplicate scans.

### 3. Business Logic, Analytics & Integrity (DATA-01, BUS-01, BUS-02, BUS-03, BUS-04, BUS-05)
- **Defects:**
  - Profile resolution substitutes `localStudents[0]` when profile is missing.
  - Attendance percentages hardcoded to `'95.8'`, `'86.4'`, `'95.0'`.
  - Admin dashboard uses fallback attendance rate `'91.8'` and hardcoded `status: 'VALIDATED'`.
  - Calendar schema lacks conditional validation for audience tiers.
  - Quota check defaults to `'4165'`.
  - Spreadsheet sanitization trims before prefix checks.
- **Remediation:**
  - Return HTTP 404/403 with `PROFILE_NOT_FOUND` when user record does not exist. Never substitute another student's profile.
  - Compute attendance percentage dynamically: `(Present / (Present + Absent)) * 100`. Handle zero denominator gracefully (return `null` or `'0.0'` / `'N/A'`).
  - In `admin.routes.ts /dashboard`, run actual `AuditService.verifyIntegrity()` and calculate true attendance average.
  - Refine `CalendarEventSchema` to require appropriate target IDs for each audience tier.
  - Sanitize spreadsheet cells against formula injection before and after trimming, neutralizing `=`, `+`, `-`, `@`, `\t`, `\r`, `%`, `\|`.

### 4. Testing & QA Infrastructure (TEST-01)
- **Defects:**
  - `npm test` fails with missing `jest`.
- **Remediation:**
  - Add `jest`, `ts-jest`, `@types/jest` to `devDependencies`.
  - Configure `jest.config.js` to execute automated test suites.
  - Create comprehensive Jest tests covering authentication, session signing, attendance calculation, timetable conflicts, student transfers, and formula sanitization.
