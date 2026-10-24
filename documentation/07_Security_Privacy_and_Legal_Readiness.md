# 7. Security, Privacy and Legal Readiness

**Version:** 2.2.0 — Multi-School Academic Hierarchy, Master Timetable Management & Conflict Engine, Real-Life Double-Submission Defense, Complete Role-Based Access Control, and Comprehensive Automated QA Release  
**Date:** 24 October 2026  
**Status:** Implemented & Verified in Codebase (217+ Automated Tests Passing — 100% Pass Rate)

---

## 7.1 Authentication, Credential Security, and Session Governance

### A. Zero Plain-Text Credential Policy — Confirmed Institutional Standard
Under no circumstances are passwords, temporary credentials, recovery tokens, or session secrets stored, displayed, transmitted, or logged in plain text anywhere within the College Attendance Management System. This non-negotiable policy applies universally across: database tables, application logs, error messages, email notifications, administrator views, API responses, and exported reports.

### B. Firebase Authentication & Hardened Credential Storage
All user credentials and password authentications are governed exclusively through **Firebase Authentication**:
- **Hashing Standard:** Firebase Authentication utilizes Google's enterprise-grade, memory-hard salted password hashing algorithms (hardened scrypt / Argon2id).
- Passwords and raw hashes are never exposed to application code, client bundles, or database queries.
- **Custom Claims for RBAC:** Authorization scopes are embedded directly within cryptographically signed Firebase ID tokens:
  - Students: `{ role: 'student', studentId: '...' }`
  - Faculty: `{ role: 'faculty', facultyId: '...', departmentId: '...' }`
  - HODs: `{ role: 'hod', departmentId: '...' }`
  - Administrators: `{ role: 'admin' }`

### C. Password Length and Complexity Requirements
- **Confirmed Minimum Length:** **12 characters minimum**, enforced both client-side and server-side on all password-setting endpoints.
- **Complexity Requirements:** Passwords must contain characters from all four categories: at least one uppercase letter (A-Z), one lowercase letter (a-z), one numeric digit (0-9), and one special symbol (`!@#$%^&*()_+-=[]{}|;:,.<>?`).

### D. Token Security, Atomic Redemption, and 48-Hour Lifecycle
1. **Activation Token Generation & Validation:**
   - Tokens are generated using a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) with at least **256 bits of entropy** (`crypto.randomBytes(32)`).
   - The database persists exclusively the one-way salted SHA-256 hash of each token (`token_hash`). The raw token exists solely in the URL dispatched to the user's verified email.
   - **Activation Token Expiration:** Exactly **48 hours** from dispatch.
   - **Single-Use Atomic Enforcement:** Token validation and redemption are executed within an atomic database transaction checking `consumed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`. Upon successful validation, `consumed_at` is set to `NOW()`. Duplicate redemption attempts are rejected immediately with HTTP 400 (`TOKEN_ALREADY_USED`).
   - **Token Superseding upon Reissuance:** When an administrator reissues an activation link (`POST /api/admin/students/:id/reissue-activation`), the backend atomically marks all prior unredeemed tokens for that student as `revoked_at = NOW()`, ensuring older links cannot be redeemed.
2. **Password-Reset Workflow:**
   - Initiated via verified student/faculty email address.
   - Dispatches a single-use CSPRNG token expiring in **30 minutes**.
   - Upon successful password update, the backend invalidates all active device sessions in `user_sessions` (`REVOKED_ACCOUNT_WIDE`) and calls `admin.auth().revokeRefreshTokens(uid)` to force re-authentication across all devices.
3. **Verified Email Change Workflow:**
   - Dispatches a verification challenge token to the **new** Gmail address.
   - The user must click the verification link within 48 hours.
   - **Permanence Guarantee:** The permanent Student ID, course enrollment history, and historical attendance records remain completely unmodified.

### E. Session Security Specification: Per-Device Revocation vs. Account-Wide Revocation & Idle Enforcement

#### 1. Per-Device Revocation vs. Account-Wide Revocation
- **Per-Device Revocation (Single Device Invalidation):**
  - Upon successful login, the backend generates a cryptographically random `session_id` (UUIDv4) persisted in the PostgreSQL `user_sessions` table and transmitted in an HTTP-only secure cookie or `X-Session-ID` header.
  - When a user logs out from a specific browser, or when a 15-minute idle timeout triggers on an unattended computer, only that specific `session_id` record is updated to `LOGGED_OUT_DEVICE` or `EXPIRED_IDLE`. Other active device sessions remain in `ACTIVE` status.
- **Account-Wide Revocation (All Devices Invalidation):**
  - Triggered by security-critical events: password change, administrative suspension, or user selecting "Log out of all devices".
  - The backend marks all active records in `user_sessions` for `user_uid` as `REVOKED_ACCOUNT_WIDE` and invokes `admin.auth().revokeRefreshTokens(uid)`.

#### 2. Exact Server-Side Idle-Timeout Enforcement Model
The Cloud Run API middleware enforces idle timeouts on every API request:
1. Incoming API requests present a Firebase ID token and `X-Session-ID` header.
2. Middleware verifies ID token with `admin.auth().verifyIdToken(idToken, true)` (`checkRevoked = true`).
3. Middleware queries `user_sessions WHERE session_id = :sessionId AND user_uid = :uid`.
4. If missing or status is not `ACTIVE`, rejects with HTTP 401 Unauthorized.
5. If `NOW() - last_activity_at > 15 minutes`, atomically marks row status `EXPIRED_IDLE` and rejects with HTTP 401 `SESSION_IDLE_TIMEOUT`.

### F. Real-Time Account Suspension Middleware
When an administrator updates an account status to `SUSPENDED` (`PATCH /api/admin/students/:id/status` or `PATCH /api/admin/teachers/:id/status`):
1. The database status transitions to `SUSPENDED`.
2. All active device sessions for the user are immediately revoked in `user_sessions`.
3. The authentication middleware (`auth.ts`) performs real-time status verification on every incoming request:
   ```typescript
   if (user.account_status === 'SUSPENDED') {
     return res.status(403).json({
       success: false,
       code: 'ACCOUNT_DEACTIVATED',
       message: 'Your account has been suspended by administration. Please contact academic support.'
     });
   }
   ```
4. Every subsequent request using an existing token or session is instantly rejected with HTTP 403 `ACCOUNT_DEACTIVATED`.

---

## 7.2 All-Roles RBAC Isolation & Security Boundaries

```
+-----------------------------------------------------------------------------+
|                               GLOBAL_ADMIN                                  |
|   • Complete Multi-School Academic Hierarchy CRUD (Schools, Depts, Courses) |
|   • Master Timetable Grid, Rooms, Groups, Conflict Engine, Clear Schedule   |
|   • Student Provisioning, Two-Stage Bulk Import, Transfers, Suspensions     |
|   • Faculty Provisioning, Allocations, Status Lifecycle                     |
|   • Examination Marks Verification & Institutional Result Publishing         |
|   • Linear Cryptographic SHA-256 Audit Chain Inspection                     |
+-----------------------------------------------------------------------------+
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
+-----------------------------+               +-------------------------------+
|             HOD             |               |            FACULTY            |
| • Department Scoped Only    |               | • Assigned Classes Only       |
| • View Dept Timetable       |               | • Live Roll-Call Register     |
| • Manage Dept Allocations   |               | • Dynamic Rolling QR Code     |
| • Escalate Corrections      |               | • Past Registers Audited Edit |
| • Dept Marks Oversight      |               | • Marks Entry & Atomic Upsert |
| • Blocked: Cross-Dept (403) |               | • Blocked: Unassigned (403)   |
| • Blocked: Global Admin     |               | • Blocked: Admin Routes (403) |
+-----------------------------+               +-------------------------------+
                                                             │
                                                             ▼
                                              +-------------------------------+
                                              |            STUDENT            |
                                              | • Personal Attendance View    |
                                              | • 75% Statutory Alert Badges  |
                                              | • Classroom QR Scan Check-In  |
                                              | • 5-Day Correction Request    |
                                              | • Published Marks Portal Only |
                                              | • Device Session Revocation   |
                                              | • Blocked: Other Students     |
                                              | • Blocked: Staff Routes (403) |
                                              +-------------------------------+
```

---

## 7.3 File Upload Security & Cloud Storage Governance

1. **Max File Size Guard:** Universal **10 MB limit** enforced both at the web client layer and at backend middleware.
2. **MIME-Type & Magic Byte Validation:** Uploads undergo magic-byte signature inspection before being committed to Cloud Storage for Firebase:
   - Bulk student rosters: `.csv` and `.xlsx`
   - Attendance correction evidence: `.pdf`, `.jpg`, `.jpeg`, `.png`
   - Profile images: `.jpg`, `.jpeg`, `.png`, `.webp`
3. **Spreadsheet Formula Injection Sanitization:** Cells starting with formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) are escaped with a leading single quote (`'`), neutralizing potential command execution in Excel.

---

## 7.4 Linear Cryptographic Hash Chain Audit Governance

1. **Sequential Linear Chaining:** Every administrative, faculty, or system mutation generates an immutable row in `audit_logs` where the hash of block $i$ is calculated from the prior block's hash and the canonical JSON payload:
   $$H_i = \text{SHA-256}(H_{i-1} \parallel \text{canonical\_payload}_i)$$
2. **Immutable Storage:** Database permissions prevent application database users from executing `UPDATE` or `DELETE` on the `audit_logs` table.
3. **Automated Verification:** A daily background cron job walks the entire chain from genesis ($H_0$) to head. If any record's payload or link has been tampered with, the system immediately raises a P1 security incident alert.
4. **Interactive Audit Modal:** Global Administrators can inspect the audit trail in `admin.html`, review actor IDs, IPs, action categories, and verify mathematical chain integrity.
