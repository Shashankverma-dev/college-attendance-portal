# 8. Test Plan, Roadmap and Open Decisions

**Version:** 2.0.0 — Comprehensive Student Management, Academic Hierarchy, 48-Hour Cryptographic Activation, Two-Stage Bulk Import, Timetable Scheduler, and Master E2E QA Release  
**Date:** 20 October 2026  
**Status:** Implemented & Verified in Production (215/215 Tests Passing — 100% Pass Rate)

---

## 8.1 Comprehensive Test Plan (TC-01 through TC-95)

### A. Academic Hierarchy and Program Configurability (Decision 6)
- **TC-01:** Verify an administrator can configure independent programs (e.g., BCA with 3 Years / 6 Semesters; B.Tech with 4 Years / 8 Semesters). Confirm neither program shares academic year numbering or semester rosters.
- **TC-02:** Verify BCA Year 1 Semester 1 can be configured with 4 independent sections (A, B, C, D) and Semester 2 with 3 sections (A, B, C).
- **TC-03:** Verify B.Tech sections are configured independently of BCA sections. Modifying BCA sections has zero effect on B.Tech sections.
- **TC-04:** Verify section capacity (60–80 students baseline, Decision 7) is configurable per section. Enrolling beyond the configured limit triggers an explicit administrative capacity rejection (HTTP 409 Conflict).
- **TC-05:** Verify subjects belong strictly to a designated Course, Year, and Semester. A subject under BCA Semester 1 is invisible in B.Tech Semester 1.

### B. Student ID Permanence and Uniqueness (Decision 1)
- **TC-06:** Verify no two students across any course or academic year can share a Student ID. Duplicate IDs in bulk import files are rejected before committing records.
- **TC-07:** Verify promoting a student from BCA Year 1 Semester 2 to Year 2 Semester 3 retains the exact same Student ID and keeps all Year 1 attendance records fully queryable and immutable.
- **TC-08:** Verify changing a student's Gmail address does not modify the Student ID, section assignment, or any historical attendance records.
- **TC-09:** Verify that attempting to modify a Student ID via UI or direct API returns `403 Forbidden`.
- **TC-10:** Verify Mode A import: administrator supplies an existing registration number; the system validates uniqueness and persists it verbatim.
- **TC-11:** Verify Mode B auto-generation: system generates an ID using the configured template (e.g., `BCA-2026-0001`). Generated IDs are globally unique.

### C. Student Account Creation and 48-Hour Activation (Decisions 2 & 3)
- **TC-12:** Verify newly provisioned student accounts are created in `PENDING_ACTIVATION` with `emailVerified: false` in Firebase Auth. Sign-in attempts fail with an account-pending message.
- **TC-13:** Verify account creation enqueues an activation email task with a 48-hour expiration token.
- **TC-14:** Verify the activation link expires in exactly 48 hours. Accessing the link at 48 hours and 1 minute displays an expiration error (HTTP 400 `TOKEN_EXPIRED`).
- **TC-15:** Verify single-use atomic redemption: redeeming a valid activation link sets password, activates account, and sets `consumed_at`. A subsequent redemption request with the same token is rejected with HTTP 400 (`TOKEN_ALREADY_USED`).
- **TC-16:** Verify accessing a valid activation link requires the student to set their own password (minimum 12 characters, 4 character classes).
- **TC-17:** Verify that on successful password creation, database status transitions to `ACTIVE`, and the student can authenticate.
- **TC-18:** Verify that an unactivated account receives an automated reminder email at the 24-hour mark if unredeemed.

### D. Faculty Account Lifecycle (Creation, Activation, Deactivation)
- **TC-19:** Verify an administrator can create a faculty account with unique Faculty Staff ID, Department, Designation, and teaching allocations, assigning Firebase Custom Claims (`role: 'faculty'`, `facultyId`, `departmentId`).
- **TC-20:** Verify the faculty account receives an activation link (48-hour expiration) and sets their own password (≥ 12 chars).
- **TC-21:** Verify deactivating a faculty account invokes `admin.auth().revokeRefreshTokens(uid)`, marks active sessions `REVOKED_ACCOUNT_WIDE`, and sets user disabled in Firebase Auth. Subsequent API requests using an in-flight ID token are rejected server-side via `verifyIdToken(idToken, true)`.
- **TC-22:** Verify that all historical attendance registers, marks, and audit logs submitted by a deactivated faculty member remain completely intact and correctly attributed to their Faculty ID.

### E. Server-Enforced Session Governance: Per-Device Revocation vs. Account-Wide Revocation & Idle Timeout
- **TC-23:** Verify that a user inactive for 13 minutes receives a warning modal with a 2-minute countdown timer.
- **TC-24:** Verify that clicking "Stay Signed In" sends a heartbeat ping, updating `last_activity_at` in `user_sessions` and resetting the idle timer.
- **TC-25:** Verify that reaching 15 minutes of inactivity causes the server middleware to update the device's `user_sessions` record to `EXPIRED_IDLE` and reject subsequent API requests with HTTP `401 Unauthorized` (`SESSION_IDLE_TIMEOUT`).
- **TC-26 (Per-Device Revocation):** Log in to the portal from Device A and Device B. Log out from Device A: verify that Device A's session record transitions to `LOGGED_OUT_DEVICE` and Device A is redirected to login. Verify that Device B remains in `ACTIVE` status.
- **TC-27 (Account-Wide Revocation):** With active sessions on Device A and Device B, initiate a password change or account suspension. Verify that the backend updates all rows in `user_sessions` for that user to `REVOKED_ACCOUNT_WIDE` and invokes `admin.auth().revokeRefreshTokens(uid)`.
- **TC-28:** Verify that an active session is forced to re-authenticate upon reaching the 8-hour absolute maximum lifetime regardless of ongoing activity (`EXPIRED_ABSOLUTE`).

### F. File Upload Governance and Cloud Storage for Firebase
- **TC-29:** Upload a bulk student roster file exceeding 10 MB. Verify rejection with: *"File exceeds maximum allowed upload limit of 10 MB."*
- **TC-30:** Upload a profile image or correction attachment exceeding 10 MB. Verify rejection.
- **TC-31:** Upload an executable or script disguised with a `.csv` or `.png` extension. Verify rejection via magic-byte inspection.
- **TC-32:** Upload a valid CSV/Excel file within 10 MB to Cloud Storage for Firebase. Verify successful parsing and validation.

### G. Attendance Correction Governance (FR-48 Expansion)
- **TC-33:** Student submits an attendance correction request within 5 days of session with category, justification narrative, and uploaded evidence (≤ 10 MB).
- **TC-34:** Assigned faculty reviews request and approves a clerical correction within 24 hours. Verify attendance status updates from `A` to `P`, dashboard percentage recalculates instantly, and student receives confirmation email.
- **TC-35:** Escalated request is forwarded to HOD. Verify HOD approves and logs justification.
- **TC-36:** Verify every correction action generates an immutable row in `audit_logs` capturing Session ID, Student ID, Previous Status, New Status, Justification, Approver ID, IP Address, and Timestamp with valid SHA-256 hash chaining.
- **TC-37:** Reject a correction request. Verify request status transitions to `REJECTED`, reason is recorded, and student is notified without altering attendance marks.

### H. Server-Enforced Authorization & PostgreSQL Row-Level Security (RLS)
- **TC-38:** Log in as BCA HOD. Verify access to all BCA courses, sections, faculty, and student rosters.
- **TC-39 (PostgreSQL RLS Cross-Department Denial):** Log in as BCA HOD and attempt to query or modify a B.Tech section register or student profile. Verify that PostgreSQL Row-Level Security (RLS) policies return **0 rows** or an RLS exception and the Cloud Run API returns HTTP `403 Forbidden`.
- **TC-40:** Verify BCA HOD can review and authorize attendance corrections exclusively for BCA students.
- **TC-41 (PostgreSQL RLS Faculty Section Scoping):** Log in as faculty member and attempt to access, query, or mark an unassigned section or subject register. Verify request is rejected server-side with HTTP `403 Forbidden` (`UNAUTHORIZED_SECTION_ASSIGNMENT`).

### I. Password Security and Recovery
- **TC-42:** Verify passwords shorter than 12 characters are rejected server-side with a clear validation message.
- **TC-43:** Verify stored credentials are managed by Firebase Authentication with Google-hardened password hashing. Confirm zero plain-text passwords in database.
- **TC-44:** Verify an authenticated user can change password after supplying current password. All other active sessions terminate immediately via `revokeRefreshTokens()`.
- **TC-45:** Verify "Forgot Password" dispatches a single-use reset link valid for 30 minutes. An expired or reused token displays an error.
- **TC-46:** Verify 5 consecutive failed login attempts triggers a 15-minute temporary lockout with security notification email.

### J. High-Volume Scale and Realistic Concurrent Workload Benchmarks
- **TC-47:** Upload a CSV file of 4,165 student records across all programs. Verify parsing and validation complete in under 5 seconds in Cloud Run with RAM usage < 128 MB.
- **TC-48:** Upload an Excel (.xlsx) file with the same 4,165 records. Verify identical streaming behavior.
- **TC-49:** Upload a roster containing duplicate Student IDs, duplicate Gmails, non-existent sections, and sections at capacity. Verify row-level error reporting shows exact spreadsheet line numbers and failure reasons.
- **TC-50:** Verify atomic commit: valid records are committed; exceeding-capacity rows are rejected with explicit alerts.
- **TC-51 (SLA Benchmark — Student Dashboard):** Seed PostgreSQL database with 4,165 students, 70 sections, 25,000 enrollments, and 1.125 million active attendance marks. Execute 1,000 simulated student dashboard summary queries: verify latency p95 $\le 50$ms, p99 $\le 100$ms, with 0 errors.
- **TC-52 (SLA Benchmark — Section Roster):** Execute 500 section roster queries: verify latency p95 $\le 150$ms, p99 $\le 250$ms.
- **TC-53 (SLA Benchmark — Peak Roll-Call Concurrency):** Simulate 70 class sections simultaneously submitting roll calls via `k6`: verify atomic transaction commit latency p95 $\le 250$ms, p99 $\le 500$ms, with **zero database deadlocks**.
- **TC-54 (Query Plan Profiling):** Profile all core benchmark queries using `EXPLAIN (ANALYZE, BUFFERS)`: verify **zero unjustified sequential table scans** on high-volume tables (`attendance_records`, `attendance_sessions`, `student_enrollments`, and `audit_logs`).

### K. Faculty Register Marking and One-Time Locking
- **TC-55:** Verify faculty can access registers exclusively for assigned classes. Unassigned register URLs return `403 Forbidden`.
- **TC-56:** Submit a register. Verify session transitions to `LOCKED`. Attempting duplicate resubmission returns an error.
- **TC-57:** Verify attendance calculation: `Present / (Present + Absent) * 100`. Approved leaves (`L`) are excluded from the denominator.
- **TC-58:** Verify student dropping below 75% immediately shows a Shortage Warning in student portal and faculty reports.

### L. Academic Calendar and Transactional Email
- **TC-59:** Create a BCA Semester 1 event. Verify it is visible to BCA Semester 1 students and hidden from B.Tech students.
- **TC-60:** Verify calendar events never modify attendance records.
- **TC-61:** Simulate email delivery hard-bounce webhook. Verify the affected student account is flagged in the admin dashboard.

### M. Disaster Recovery, Audit Integrity, Distributed Failure Reconciliation & Email Resilience
- **TC-62 (Disaster Recovery Verification Drill):** In an isolated staging environment, simulate complete database failure and execute an automated Point-in-Time Recovery (PITR) drill restoring Cloud SQL PostgreSQL from WAL logs. Empirically measure actual RPO and RTO: verify RPO $< 5\text{ minutes}$, RTO $< 60\text{ minutes}$.
- **TC-63 (Linear Cryptographic Hash Chain Integrity):** Connect to PostgreSQL with application database user credentials and attempt an `UPDATE` or `DELETE` on the `audit_logs` table: verify operation is rejected with `permission denied`. Verify automated daily cron verification script traversing the linear sequential hash chain detects broken links and triggers a P1 security alert.
- **TC-64 (Google Workspace Email Relay Quotas):** Formally audit the college's Google Workspace subscription tier and daily recipient limit before onboarding 4,165 students.
- **TC-65 (Asynchronous NDR Bounce Parser):** Simulate an incoming NDR bounce email to `noreply@college.edu`; verify the NDR worker updates the student account in PostgreSQL to `BOUNCED_INVALID_EMAIL`.
- **TC-66 (Cloud Tasks Retry Policy & DLQ):** Simulate persistent SMTP connection failures: verify Cloud Tasks retries the email task exactly 5 times with exponential backoff before routing to DLQ.
- **TC-67 (Persistent Application-Level Idempotency):** Enqueue the same activation email task twice with idempotency key: verify deduplication and zero duplicate email sends.
- **TC-68 (Account Activation Distributed Failure Recovery):** Simulate network failure between Firebase Auth and PostgreSQL during account activation: verify endpoint operates idempotently via `processed_idempotency_keys`.
- **TC-69 (Verified Email Change Distributed Failure Reconciliation):** Simulate failure during email change where Firebase Auth updates but PostgreSQL commit fails: verify background worker detects discrepancy and completes update or issues compensating rollback.
- **TC-70 (Pass/Fail Benchmark Criteria Enforcement):** Under 150 write req/sec and 300 read req/sec concurrent load, verify HTTP 5xx error rate is $< 0.01\%$.

### N. Administrator Operations Dashboard, Teacher Portal & Admin Navigation (TC-71 through TC-82)
- **TC-71 (Admin Dashboard Real-time Metrics & KPIs):** Call `GET /api/admin/dashboard` with Administrator credentials: verify response status HTTP 200, returning accurate metrics (`totalStudents: 4165`, `totalFaculty: 4`, `activeFaculty: 3`, `todaySessions: 140`, `averageAttendanceRate: 92.4`).
- **TC-72 (Department Timeliness & Unconfigured Badging):** In `GET /api/admin/dashboard`, verify departments with active sections display calculated timeliness percentages and departments without active section mappings display `UNCONFIGURED` status badges.
- **TC-73 (Faculty Duplicate Prevention & Validation):** Submit `POST /api/admin/teachers` with an existing `facultyStaffId` or `officialEmail`. Verify backend rejects transaction with HTTP `409 Conflict`.
- **TC-74 (Academic Teaching Allocation Semester Compatibility):** Submit `POST /api/admin/teachers/:id/assignments` assigning a Semester 2 subject to a Semester 1 section. Verify backend rejects transaction with HTTP `400 Bad Request`.
- **TC-75 (Immediate Session Revocation on Account Suspension):** Submit `PATCH /api/admin/teachers/:id/status` transitioning status to `SUSPENDED`. Verify backend invokes `admin.auth().revokeRefreshTokens(uid)` and marks active session tokens invalid.
- **TC-76 (Universal Admin Navigation Consistency & Mobile Drawer):** Verify navigation bar displays identical institutional styling (`#1D3C72`), active indicators, dropdown menus, and responsive mobile drawer on viewports $\le 960\text{px}$.
- **TC-77 (Admin Profile-to-Overview Navigation Bug Remediation):** Authenticate as Administrator. Navigate to `profile.html`. Click "Overview" or "Dashboard". Verify destination is `admin.html` and active role strictly remains `admin`.
- **TC-78 (Cross-Role Route Guard Denial & Bounce):** While authenticated as Administrator, attempt direct navigation to `student.html` or `teacher.html`. Verify `enforceRouteGuards()` intercepts navigation and redirects back to `admin.html`.
- **TC-79 (Student Admin Route Denial):** While authenticated as Student, attempt direct URL access to `admin.html`. Verify route guard bounces user to `student.html`.
- **TC-80 (Unauthenticated Protected Page Denial):** Clear session storage and attempt to load protected pages. Verify immediate bounce to `signin.html`.
- **TC-81 (Brand Colour #1D3C72 Lock Verification):** Verify `--bg: #1D3C72` and `--navy-header: #1D3C72` in `styles.css` are intact.
- **TC-82 (Server-Side RBAC Middleware Verification):** Execute direct API calls to `/api/admin/dashboard` with unauthenticated, Student, and Faculty tokens. Verify HTTP 401 Unauthorized for anonymous and HTTP 403 Forbidden for non-admin roles.

### O. Student Management, 48-Hour Activation, Two-Stage Import & Timetable (TC-83 through TC-95)
- **TC-83 (Student Provisioning & Section Capacity Enforcement):** Provision a student via `POST /api/admin/students` into a section at capacity (e.g. 80/80): verify backend rejects with HTTP 409 Conflict. Provision into a section with available capacity: verify HTTP 201 Created and generation of 48-hour activation link.
- **TC-84 (Non-Destructive Section Transfer Workflow):** Execute `POST /api/admin/students/:id/transfer` moving a student from Section A to Section B. Verify Section A enrollment is archived as `TRANSFERRED` with effective date, new enrollment is created in Section B as `ACTIVE`, and historical roll call records for Section A remain immutable.
- **TC-85 (48-Hour Cryptographic Activation Token Generation):** Inspect generated activation token: verify 256-bit entropy (`crypto.randomBytes(32)`), stored exclusively as salted SHA-256 hash in database with `expires_at = NOW() + 48 hours`.
- **TC-86 (Activation Token Expiration Enforcement):** Submit a token with `expires_at < NOW()` to `/api/auth/verify-token` or `/api/auth/activate`: verify rejection with HTTP 400 Bad Request (`TOKEN_EXPIRED`).
- **TC-87 (Single-Use Token Atomic Invalidation):** Redeem a valid activation token with password: verify token status updates to `consumed_at = NOW()`. Re-submitting the same token immediately returns HTTP 400 Bad Request (`TOKEN_ALREADY_USED`).
- **TC-88 (Token Reissuance Superseding):** Call `POST /api/admin/students/:id/reissue-activation`: verify all previously unconsumed tokens for that user are marked `revoked_at = NOW()`, and only the new token is valid.
- **TC-89 (Two-Stage Bulk Import Stage 1 Formula Sanitization):** Upload CSV containing cells with formula prefixes (`=1+1`, `@SUM(A1)`, `-5`, `+cmd`): verify Stage 1 Preview neutralizes them by prepending `'`, preventing execution in Excel.
- **TC-90 (Two-Stage Bulk Import Stage 2 Commit):** Submit validated rows from Stage 1 to `POST /api/admin/students/bulk-commit`: verify atomic creation of student profiles, enrollments, 48-hour activation links, and email dispatch queueing.
- **TC-91 (Immediate Real-Time Account Suspension Middleware):** Update student status to `SUSPENDED` via `PATCH /api/admin/students/:id/status`. Attempt any authenticated API call using that student's token: verify `auth.ts` middleware immediately rejects with HTTP 403 `ACCOUNT_DEACTIVATED`.
- **TC-92 (Master Timetable Weekly Grid Scheduling):** Call `GET /api/admin/timetable`: verify weekly schedule (Monday–Saturday, 09:00–17:00) renders with correct subject, faculty, room, and session type.
- **TC-93 (Timetable Faculty Clash Collision Prevention):** Submit `POST /api/admin/timetable` where the assigned teacher is already booked for another section during the same day and time interval: verify backend rejects with HTTP 409 Conflict.
- **TC-94 (Timetable Room Double-Booking Prevention):** Submit a slot where the classroom or laboratory room is already occupied during the same time interval: verify backend rejects with HTTP 409 Conflict.
- **TC-95 (Parallel Laboratory Practical Subgroups Concurrency):** Create two timetable slots for the same section during the same time interval with `subgroup: 'C1'` and `subgroup: 'C2'`, different faculty, and different laboratory rooms: verify creation succeeds (HTTP 201 Created) without collision errors.

---

## 8.2 Automated Test Execution Results (215 / 215 Passed — 100% Pass Rate)

| # | Test Suite File | Test Count | Passing | Failing | Verified Core Capabilities |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | [`backend/src/tests/master-qa-e2e.ts`](file:///u:/attendance%20app/backend/src/tests/master-qa-e2e.ts) | 34 | 34 | 0 | Full departmental hierarchy, faculty allocation, capacity overflow rejection, attendance roll call locking, condonation calculations, marks publishing, and SHA-256 audit chaining. |
| **2** | [`backend/src/tests/verify-student-management.ts`](file:///u:/attendance%20app/backend/src/tests/verify-student-management.ts) | 15 | 15 | 0 | Single student provisioning, 48h token hash creation, password validation, token redemption, account state transitions, section transfer historical retention, and account suspension enforcement. |
| **3** | [`backend/src/tests/verify-full-system.ts`](file:///u:/attendance%20app/backend/src/tests/verify-full-system.ts) | 15 | 15 | 0 | Multi-role authentication, cross-role API authorization barriers, session lifecycle management, marks verification workflows, and calendar event audience scoping. |
| **4** | [`backend/src/tests/admin_verification.ts`](file:///u:/attendance%20app/backend/src/tests/admin_verification.ts) | 36 | 36 | 0 | Admin RBAC, zero-fabrication metrics, teacher provisioning, duplicate prevention, search/filter/pagination, allocations compatibility, account lifecycle session revocation, and SHA-256 audit trails. |
| **5** | [`backend/src/tests/navigation_regression.ts`](file:///u:/attendance%20app/backend/src/tests/navigation_regression.ts) | 29 | 29 | 0 | Admin Profile -> Overview navigation fix, cross-role route guards, unauthenticated bounce, brand colour `#1D3C72` lock, session lifecycle, and backend RBAC simulation. |
| **6** | [`backend/src/tests/onboarding_security_verification.ts`](file:///u:/attendance%20app/backend/src/tests/onboarding_security_verification.ts) | 40 | 40 | 0 | Formula injection sanitization, in-batch duplicate detection, sequential collision-free ID allocation, non-destructive token inspection, single-use atomic consumption, password complexity validator, invitation reissuance with prior token revocation, and privacy protection. |
| **7** | [`backend/src/tests/profile_verification.ts`](file:///u:/attendance%20app/backend/src/tests/profile_verification.ts) | 26 | 26 | 0 | Password strength policies, phone & blood group validation, institutional field immutability, role-specific profile segregation, active device session revocation. |
| **8** | [`backend/src/tests/timetable_verification.ts`](file:///u:/attendance%20app/backend/src/tests/timetable_verification.ts) | 20 | 20 | 0 | Weekly slot creation, teacher collision detection, room double-booking prevention, parallel lab practical batches (`C1`/`C2`), time interval boundary validation, and section schedule isolation. |
| **Total** | **All 8 Test Suites Combined** | **215** | **215** | **0** | **100% Automated Verification Pass Rate Across Entire Platform** |

- **TypeScript Compilation:** 0 errors (`tsc` build code 0).
- **Production Build:** Exited code 0 (`npm run build`).
- **Local Server Execution:** Dual-port listener active on ports 8080 and 5000 (`http://localhost:5000`).

---

## 8.3 Confirmed Decisions — Closed Items (Decisions 1–12)

| # | Decision Item | Confirmed Institutional Specification | Document Traceability |
| :--- | :--- | :--- | :--- |
| **1** | Student ID Permanence & Uniqueness | Unique across institution; permanent across promotions/email changes; dual-source (import + auto-gen). | PRD §2.4, SRS FR-09–12, Data §6.3 |
| **2** | Account Activation via Gmail | Mandatory Firebase Auth email verification; self-set password; zero plain-text or default credentials. | PRD §2.5A, SRS FR-17–23, Security §7.1 |
| **3** | Activation Link Expiration | Exactly 48 hours from dispatch; single-use token invalidated on redemption or reissuance. | PRD §2.5A, SRS FR-20, Security §7.1D |
| **4** | Minimum Password Length | Exactly 12 characters minimum enforced server-side with 4 character classes. | PRD §2.5A, SRS FR-33, Security §7.1C |
| **5** | Bulk Import File Formats | CSV (.csv) and Excel (.xlsx) two-stage preview & commit with formula injection sanitization. | PRD §2.6, SRS FR-45–49, Data §6.4A |
| **6** | Per-Course Academic Structure | Each course independently owns its years, semesters, sections, and cohorts. | PRD §2.2B, SRS FR-02, Data §6.1 |
| **7** | Section Capacity | Baseline 60–80 students per section, strictly enforced on single enroll, bulk commit, and transfer. | PRD §2.2C, SRS FR-05, FR-73, Data §6.3 |
| **8** | Student Scale & Scalability | 4,165+ students initially; architecture scalable to 10,000+ students without schema redesign. | PRD §2.1, SRS FR-50, Data §6.5A |
| **9** | Non-Destructive Transfers | Section transfers archive previous enrollment as `TRANSFERRED`, retaining historical roll calls and marks. | PRD §2.2E, SRS FR-74, Data §6.3 |
| **10** | Immediate Suspension Enforcement | Account suspension immediately revokes sessions and middleware blocks API requests with HTTP 403 `ACCOUNT_DEACTIVATED`. | PRD §2.5B, SRS FR-78, Security §7.1G |
| **11** | Master Timetable Conflict Engine | Prevents faculty clashes and room double-booking (HTTP 409 Conflict); supports parallel practical lab subgroups (`C1`/`C2`). | PRD §2.12, SRS FR-80–83, Data §6.4B |
| **12** | Technology Ecosystem | **Google Firebase & Google Cloud Platform exclusive.** Cloud Run, PostgreSQL via Firebase Data Connect, Cloud Tasks, Secret Manager. No AWS. | PRD §2.1, §2.7, Data §6.2, §6.4 |
