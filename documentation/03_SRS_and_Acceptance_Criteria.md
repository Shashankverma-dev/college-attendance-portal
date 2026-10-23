# 3. Software Requirements Specification and Acceptance Criteria

**Version:** 2.0.0 — Comprehensive Student Management, Academic Hierarchy, 48-Hour Cryptographic Activation, Two-Stage Bulk Import, Timetable Scheduler, and Master E2E QA Release  
**Date:** 20 October 2026  
**Status:** Implemented & Verified (215/215 Tests Passing — 100% Pass Rate)

---

## 3.1 Functional Requirements

### A. Academic Structure and Hierarchy Management
- **FR-01:** The system must strictly enforce the 6-tier institutional hierarchy:  
  `College -> Department -> Course/Program -> Academic Year -> Semester -> Section -> Students`
- **FR-02:** Each course owns its academic years, semesters, and sections independently. Programs (e.g., BCA 3-year/6-semester, B.Tech 4-year/8-semester) must maintain completely independent structural numbering, section configurations, and enrollment pipelines without data leakage or shared counters.
- **FR-03:** Administrators must be able to configure and manage degree programs with variable durations, academic years, and semester counts.
- **FR-04:** Every semester must support an administrator-configured number of sections (e.g., BCA Semester 1 with Sections A, B, C, D; BCA Semester 2 with Sections A, B, C).
- **FR-05:** Each section must have a configurable student capacity with a confirmed institutional baseline of **60 to 80 students per section**. Enrolling beyond configured capacity must trigger an explicit administrative capacity rejection (HTTP 409 Conflict).
- **FR-06:** Curricular subjects must be defined under a specific Course, Academic Year, and Semester.
- **FR-07:** Faculty teaching allocations must bind an approved faculty member to a specific Course, Academic Year, Semester, Section, and Subject for an active academic calendar term.
- **FR-08:** Cohort promotion must advance students to the next semester/year while permanently sealing all prior term attendance records as immutable read-only archives.

### B. Student ID Management — Confirmed Institutional Rules
- **FR-09:** Student IDs must be globally unique across the entire institution. The relational database must enforce a global unique constraint preventing two students across any course or year from sharing an ID.
- **FR-10:** Student IDs are permanent and immutable. No system operation — including Gmail address changes, section reallocations, semester promotions, course transfers, or account suspensions — may alter a student's assigned Student ID.
- **FR-11:** The system must support dual-mode Student ID provisioning:
  - **Mode A (Institutional Import):** Administrator supplies an existing university registration number; the system validates global uniqueness and persists the value verbatim.
  - **Mode B (Configurable Auto-Generation):** Where no ID is supplied, the system auto-generates IDs using a configurable format template: `[COURSE_CODE]-[ACADEMIC_YEAR]-[4_DIGIT_SEQ]` (e.g., `BCA-2026-0001`).
- **FR-12:** Student IDs are institutional identifiers and must not be treated as confidential authentication secrets. Student IDs appear on printed class rolls, attendance registers, and official documents.

### C. User Profiles and Data Minimization
- **FR-13:** The system must maintain role-specific profile schemas for Students, Faculty, Administrators, and Heads of Departments (HODs), collecting only data strictly necessary for academic operations.
- **FR-14:** Student Profile stores: Student ID, Full Name, Student Gmail Address (verified), Course, Academic Year, Semester, Section, Roll Number, Profile Photo reference (optional), Account Status (`ACTIVE`, `PENDING_ACTIVATION`, `INACTIVE`, `SUSPENDED`), Firebase Auth UID, and security timestamps.
- **FR-15:** Faculty Profile stores: Faculty Staff ID (permanent), Full Name, Official Email Address, Academic Department, Designation, Teaching Allocations, Profile Photo reference (optional), Firebase Auth UID, and Account Status.
- **FR-16:** Staff & HOD Profiles store: Staff ID, Full Name, Official Email Address, Designation, Department Assignment (for HODs), Assigned Permission Scopes (`role`, `departmentId`), Firebase Auth UID, and Account Status.

### D. Account Creation and 48-Hour Cryptographic Activation
- **FR-17:** Student accounts must be provisioned exclusively by administrators via single-entry creation or two-stage bulk spreadsheet import. Public unverified self-registration is strictly prohibited.
- **FR-18:** Backend service provisions the student profile and academic enrollment in `PENDING_ACTIVATION` status with `emailVerified: false`.
- **FR-19:** The system must generate a cryptographically secure, single-use activation token using a CSPRNG with at least **256 bits of entropy** (`crypto.randomBytes(32)`), stored exclusively as a salted SHA-256 hash in the database.
- **FR-20:** Activation emails must be dispatched to the student's registered Gmail address via the configured email provider (SMTP relay or local simulator), expiring in exactly **48 hours** from dispatch.
- **FR-21:** The system must support an automated activation reminder email dispatched at the **24-hour mark** if the account remains unactivated.
- **FR-22:** Activation link redemption must be validated atomically: the database checks `consumed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()` and sets `consumed_at = NOW()` in a single transaction. The student must set their own password (minimum 12 characters, 4 character classes).
- **FR-23:** On successful password creation, backend updates the credentials in Firebase Auth, sets `emailVerified: true`, transitions database status to `ACTIVE`, and invalidates the activation token.

### E. Faculty Account Lifecycle (Creation, Verification, Activation, Deactivation)
- **FR-24:** Faculty accounts must be created exclusively by an Administrator or authorized Academic HR, specifying Faculty Staff ID, Full Name, Official Email, Department, Designation, and initial teaching allocations.
- **FR-25:** Backend provisions the user in Firebase Auth with custom claims (`role: 'faculty'`, `facultyId: '...'`, `departmentId: '...'`) and dispatches a single-use activation link (48-hour expiration) to the official email address. Zero plain-text credentials may be generated or sent.
- **FR-26:** Faculty members must self-activate by setting their own confidential password (minimum 12 characters meeting institutional complexity rules), reviewing their assigned teaching workload, and accepting data privacy terms.
- **FR-27:** Deactivation of a faculty account must immediately invoke `admin.auth().revokeRefreshTokens(uid)`, set `disabled: true` in Firebase Auth, invalidate server-side session records, mark database status as `INACTIVE` or `SUSPENDED`, and permit reassigning active courses to substitute faculty.
- **FR-28:** Historical attendance registers, session logs, and audit entries submitted by a deactivated faculty member must be permanently preserved and remain attributed to their Faculty ID. Hard deletion of faculty records is strictly prohibited.

### F. Gmail Address Changes — Confirmed Rules
- **FR-29:** A student's registered Gmail address may be changed through a secure two-step verification workflow: a confirmation link is dispatched to the new Gmail address, and the update is committed only after ownership verification and administrative sign-off.
- **FR-30:** Updating a Gmail address must never alter the Student ID, course enrollment, section assignment, roll number, or any historical attendance records.
- **FR-31:** Upon successful verification and approval, the backend synchronizes the updated address with Firebase Auth (`admin.auth().updateUser(uid, { email: newGmail, emailVerified: true })`).
- **FR-32:** Every Gmail change event must be recorded in the append-only audit log with old email, new email, actor ID, IP address, and timestamp.

### G. Password Security and Server-Enforced Session Governance
- **FR-33:** Passwords must be at least **12 characters in length**, enforced both client-side and server-side.
- **FR-34:** Passwords must meet institutional complexity requirements (requiring uppercase, lowercase, numeric, and special character).
- **FR-35:** Passwords are managed securely by Firebase Authentication infrastructure, utilizing hardened memory-intensive hashing algorithms with individual cryptographic salts.
- **FR-36:** Authenticated users can change their password after confirming their current password. A successful password change immediately triggers **account-wide session revocation**, calling `admin.auth().revokeRefreshTokens(uid)` and marking all user session records in `user_sessions` as revoked.
- **FR-37:** "Forgot Password" workflow must dispatch a single-use reset link with a **30-minute expiration** to the user's verified email.
- **FR-38:** Authentication endpoints must enforce rate limiting (5 failed attempts per IP/account triggers a 15-minute temporary lockout).
- **FR-39:** The system must distinguish between per-device session termination (single-device logout or idle expiration via `session_id` in PostgreSQL `user_sessions`) and account-wide revocation (password reset, account suspension, or explicit "sign out of all devices" invoking `revokeRefreshTokens(uid)`).
- **FR-40:** The system must enforce a configurable **session idle timeout with an institutional default of 15 minutes of inactivity**, enforced server-side. If exceeded, the server marks that specific device session `EXPIRED_IDLE` and rejects with HTTP `401 Unauthorized` (`SESSION_IDLE_TIMEOUT`).
- **FR-41:** Every protected backend request must verify the Firebase ID token with revocation checks (`admin.auth().verifyIdToken(idToken, true)`). Absolute maximum session lifetime is capped at **8 hours** server-side.

### H. File Upload Governance and Cloud Storage
- **FR-42:** The system must enforce a configurable maximum file upload size limit, with **10 MB as the institutional default**, across all upload endpoints.
- **FR-43:** Uploaded files are stored in **Cloud Storage for Firebase** with non-executable storage permissions and randomized UUID filenames. Uploads must undergo MIME-type validation, magic-byte inspection, and extension whitelisting:
  - Bulk student imports: `.csv`, `.xlsx`
  - Profile images: `.jpg`, `.jpeg`, `.png`, `.webp`
  - Attendance correction evidence: `.pdf`, `.jpg`, `.jpeg`, `.png`
- **FR-44:** Files exceeding the configured upload limit or failing integrity checks must be rejected with explicit, user-friendly error messages.

### I. Two-Stage Bulk Student Registration Engine
- **FR-45:** The bulk import subsystem must accept CSV (.csv) and Excel (.xlsx) file formats up to 10 MB.
- **FR-46:** **Formula Injection (CSV Injection) Sanitization:** The streaming parser must inspect all spreadsheet cells and neutralize leading formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote (`'`), preventing malicious code execution upon export.
- **FR-47:** **Header Normalization:** The parser must flexibly map header variations (`Full Name`, `studentId`, `Admission No`, `Email`, `Roll No`) to standard schema attributes.
- **FR-48:** **Stage 1 Preview:** Returns validation metrics including within-file duplicates, database duplicates, email format validation, and section capacity checks.
- **FR-49:** **Stage 2 Transactional Commit:** Atomically provisions valid rows, assigns section roll numbers, creates 48-hour activation tokens, and enqueues activation emails.
- **FR-50:** The system must scale smoothly to import and manage **4,165+ students** initially and support expansion to **10,000+ students** without structural schema changes.

### J. Attendance Register Recording and Server-Enforced Submission Locking
- **FR-51:** Server-Enforced Faculty Assignment Check: When a faculty member requests or submits a register, the backend verifies in the relational database that an active `faculty_assignment` exists linking `user.faculty_id` to that specific `(course_id, semester_id, section_id, subject_id)`. Unassigned requests strictly return `403 Forbidden`.
- **FR-52:** Register roster loads only actively enrolled students of that specific section (60–80 students).
- **FR-53:** Marking vocabulary: Present (`P`), Absent (`A`), and Approved Leave (`L`).
- **FR-54:** Session registers must be permanently locked upon one-time submission. Duplicate submissions or unauthorized direct in-place edits are strictly prevented.
- **FR-55:** Standard institutional attendance formula: `Present / (Present + Absent) * 100`. Approved leaves are excluded from the denominator.
- **FR-56:** Shortage alerts must trigger automatically when a student's subject or aggregate percentage falls below the statutory **75% threshold**.

### K. Expanded Attendance Correction Governance (FR-48 Expansion)
- **FR-48A (Correction Request Submission):** Students must be able to submit formal attendance correction requests via their portal within **5 calendar days** from the conducted class date. Server validates student identity, session, claimed status (`P` or `L`), reason category, narrative, and uploaded evidence (Cloud Storage for Firebase, ≤ 10 MB). Faculty can also submit a self-correction request within **24 hours** of submission for clerical mistakes.
- **FR-48B (Faculty Review & Authorization):** The assigned subject faculty member can review evidence and choose to: (1) Recommend Approval, (2) Direct Approve (permitted only within 24 hours for clerical errors), or (3) Reject with mandatory recorded rationale.
- **FR-48C (Departmental Authorization — HOD Scope):** Requests involving medical leave, official college duty, or submitted outside the 24-hour clerical window must be escalated to the **Head of Department (HOD)** for formal authorization.
- **FR-48D (Record Mutation):** Upon formal approval, the system updates `attendance_record.status`, sets `modified_by_user_id`, `approved_by_user_id`, and `approval_timestamp`.
- **FR-48E (Immutable Audit Trail & Linear Cryptographic Hash Chain):** Every correction action must generate an immutable entry in `audit_logs` with SHA-256 linear hash chaining ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{payload}_i)$). An automated daily cron worker executes audit-integrity verification across all chain segments.
- **FR-48F (Recalculation and Notification):** Approval or rejection must instantly update student and faculty dashboard metrics and dispatch an automated status notification to the student's registered Gmail.
- **FR-48G (Dedicated Past Registers Hub & Faculty Attendance Editing):** Faculty members must have a dedicated Past Submitted Registers Hub (`past-registers.html`) with multi-parameter search/filters. Assigned faculty can inspect historical sessions and directly launch the **Edit Past Attendance Modal** to adjust student attendance statuses (`P`, `A`, `L`). Editing requires a validated correction reason and recorded faculty audit notes.

### L. Head of Department (HOD) Server-Enforced Department Scope Governance
- **FR-57:** HOD administrative and supervisory authority must be strictly confined to courses, subjects, sections, faculty, and students affiliated with their designated academic department.
- **FR-58:** HODs can view aggregate and granular attendance registers, monitor faculty attendance submission timeliness, approve department-level attendance corrections, manage faculty teaching reassignments within the department, and export department reports.
- **FR-59:** Server-Side Isolation Enforcement: On every HOD request, the backend extracts `departmentId` from the verified token AND cross-verifies against the target resource in the database. Any query or modification targeting another department strictly returns `403 Forbidden`.

### M. Academic Calendar with 5-Tier Audience Targeting
- **FR-60:** Supports 5-tier audience targeting: Institution-wide, Course-specific, Academic Year-specific, Semester-specific, and Section-specific.
- **FR-60A (Full Year 12-Month Calendar & Bidirectional Zoom):** The academic calendar (`calendar.html`) provides a synchronized 3-way view toggle: Full Year 12-Month interactive grid, Dynamic Single-Month view, and Filterable Agenda milestone list. Clicking any mini-month card zooms directly into that month.
- **FR-60B (Responsive Mobile Navigation Drawer):** Across all application portals, screens $\le 960\text{px}$ replace horizontal headers with an accessible 3-line hamburger menu button (`.nav-toggle-btn`) that animates into an "X", paired with a slide-out side drawer (`.mobile-drawer`).
- **FR-61:** Calendar events are visible strictly to their designated audience. Draft events are hidden from students and faculty.
- **FR-62:** Calendar events are informational and must never automatically modify student attendance records.

### N. Transactional Email Subsystem
- **FR-63:** The email subsystem supports enterprise Google Workspace SMTP relay and an automated local development simulator (`LOCAL_SIMULATOR`).
- **FR-64:** Outgoing emails must comply with SPF, 2048-bit DKIM, and DMARC alignment for verified institutional domains.
- **FR-65:** Credentials must be stored strictly in **Google Cloud Secret Manager**, with zero plain-text secrets in source code or configuration files.

### O. Failure Recovery, Distributed State Reconciliation & Database Security
- **FR-67 (Persistent Application-Level Idempotency):** The system handles distributed operations through persistent database-level idempotency (`processed_idempotency_keys`). Client retries across network boundaries return stored idempotent responses without duplicate side effects.
- **FR-68 (PostgreSQL Row-Level Security):** PostgreSQL tables enforce Row-Level Security (RLS) policies utilizing trusted transaction-local context (`SET LOCAL app.current_department_id = ...`) within explicit database transactions.

### P. Administrator Operations Dashboard and Teacher Portal Management
- **FR-70 (Administrator Operations Dashboard):** Central command center (`admin.html`) reporting live metrics: total enrolled students (4,165 baseline), active faculty count, today's sessions, and moving average attendance rate (92.4% baseline). Features Department Timeliness & Compliance table and SHA-256 linear hash chain verification modal.
- **FR-71 (Teacher Portal Management):** Comprehensive faculty administration console (`admin-teachers.html`) providing search, filtering, pagination, faculty provisioning, teaching allocations, account lifecycle transitions (`ACTIVE`, `SUSPENDED`, `INACTIVE`), and profile export.
- **FR-72 (Universal Administrator Navigation Architecture):** All administrative pages render a unified, high-contrast institutional navigation header (`#1D3C72` primary palette) with active indicators, accessible dropdowns, mobile drawer, and single-click Sign Out.

### Q. Student Management, Hierarchy Filtering & Section Capacity (New in v2.0.0)
- **FR-73 (Section Capacity Limits & Allocation Controls):** Sections must enforce a strict `max_capacity` (institutional baseline 60–80). The backend must evaluate capacity during single student creation (`POST /api/admin/students`), bulk import commit (`POST /api/admin/students/bulk-commit`), and section transfers (`POST /api/admin/students/:id/transfer`), rejecting overflows with HTTP 409 Conflict.
- **FR-74 (Non-Destructive Section Transfer Workflow):** When transferring a student between sections, the system must set the prior enrollment's status to `TRANSFERRED` with an `effective_date`, create a new `ACTIVE` enrollment under the target section, and retain all historical attendance records, percentages, and marks under the original section.
- **FR-75 (48-Hour Cryptographic Activation Token Issuance & Superseding):** Creation or reissuance of an activation link must generate a 256-bit CSPRNG token stored exclusively as a salted SHA-256 hash with a 48-hour expiration. Reissuing an activation link (`POST /api/admin/students/:id/reissue-activation`) must atomically invalidate all prior active tokens for that student.
- **FR-76 (Atomic Activation Token Redemption & Credential Creation):** Submitting a password at `/api/auth/activate` must atomically consume the token (`consumed_at = NOW()`), update the password in Firebase Auth, and transition profile status to `ACTIVE`. Passwords must meet the 12+ character, 4-class complexity standard.
- **FR-77 (Two-Stage Bulk Student Ingestion & Spreadsheet Sanitization):** Bulk ingestion must be partitioned into Preview (`POST /api/admin/students/bulk-preview`) and Commit (`POST /api/admin/students/bulk-commit`). The parser must sanitize CSV formula injection characters (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote, normalize headers, and report granular row-level validation errors.
- **FR-78 (Real-Time Account Suspension Enforcement Middleware):** When an account status is updated to `SUSPENDED` (`PATCH /api/admin/students/:id/status`), the backend must invalidate all active sessions in `user_sessions`, and the authentication middleware (`auth.ts`) must immediately intercept subsequent API calls, returning HTTP 403 `ACCOUNT_DEACTIVATED`.
- **FR-79 (Email Service Abstraction & Dispatch Simulator):** The email subsystem must seamlessly toggle between Google Workspace SMTP relay and `LOCAL_SIMULATOR`. The simulator must record dispatched tokens, email recipients, and message IDs in memory, accessible for automated testing.
- **FR-80 (Timetable Slot Provisioning & Grid Visualization):** The system must provide a master timetable management portal (`admin-timetable.html`) rendering a weekly scheduling grid (Monday–Saturday, 09:00–17:00).
- **FR-81 (Timetable Faculty Collision Detection):** Creating or updating a timetable slot (`POST /api/admin/timetable`) must check whether the assigned faculty member is already scheduled for another section during the requested day and overlapping time interval, returning HTTP 409 Conflict upon collision.
- **FR-82 (Timetable Room Double-Booking Prevention):** The timetable scheduler must verify that the assigned classroom or laboratory is not already booked by another class during the same time interval, returning HTTP 409 Conflict on collision.
- **FR-83 (Laboratory Practical Subgroup Splitting):** The timetable scheduler must support parallel laboratory sessions for split student cohorts (`C1` and `C2`) occupying the same time slot in different laboratory rooms with different instructors.
- **FR-84 (Student Management Search, Hierarchy Filtering & Pagination):** The Student Management console (`admin-students.html`) must provide cascading dropdown filters for Academic Year, Course, Semester, Section, and Status, paired with a debounced full-text search matching name, Student ID, email, or roll number.
- **FR-85 (Student Roll Number Sequencing & Uniqueness):** The system must enforce that roll numbers are sequential integers unique within the student's active section.

---

## 3.2 Role-Permission Matrix (Server-Enforced)

| Capability / Action | Administrator | HOD / Dept Head | Faculty / Teacher | Student |
| :--- | :---: | :---: | :---: | :---: |
| **Configure System, Email & Upload Limits** | Yes (Global) | No (403) | No (403) | No (403) |
| **Configure Courses, Semesters, Sections** | Yes (Global) | View Only (Dept) | No (403) | No (403) |
| **Set Section Capacity Limits (60–80)** | Yes (Global) | View Only (Dept) | No (403) | No (403) |
| **Create Student Accounts in Firebase Auth** | Yes (Global) | No (403) | No (403) | No (403) |
| **Bulk Import Students (Two-Stage Preview/Commit)** | Yes (Global) | No (403) | No (403) | No (403) |
| **Transfer Student Between Sections** | Yes (Global) | No (403) | No (403) | No (403) |
| **Reissue 48h Activation Link** | Yes (Global) | Yes (Dept Scope) | No (403) | No (403) |
| **Configure Master Timetable & Conflict Engine** | Yes (Global) | View (Dept) | View (Assigned) | View (Enrolled) |
| **Create / Deactivate Faculty Accounts** | Yes (Global) | Request Only | No (403) | No (403) |
| **Assign Faculty Teaching Workload** | Yes (Global) | Yes (Dept Scope) | No (403) | No (403) |
| **Suspend / Inactivate Accounts** | Yes (Global) | Recommend (Dept) | No (403) | No (403) |
| **View or Modify Plain-Text Passwords** | **Never** | **Never** | **Never** | **Never** |
| **Set or Change Own Password** | Yes | Yes | Yes | Yes |
| **Take Attendance for Assigned Classes** | No | No | Yes (Assigned) | No (403) |
| **Access Unassigned Section Registers** | View All (Audit) | View Only (Dept) | **Denied (403)** | No (403) |
| **Submit Attendance Correction Request** | No | No | Yes (Self ≤24h) | Yes (Own ≤5 days) |
| **Approve Attendance Corrections (FR-48)** | Yes (Global) | Yes (Dept Scope) | Yes (Clerical ≤24h) | No (403) |
| **View Personal Attendance History** | No | No | No | Yes (Own Only) |
| **Publish Academic Calendar Events** | Yes (All Tiers) | Yes (Dept Tiers) | No (Request Only) | No (403) |
| **Inspect Audit Logs & Cryptographic Hash Chain** | Yes (Global) | Yes (Dept Scope) | No (403) | No (403) |

---

## 3.3 Acceptance Criteria (AC-01 through AC-56)

### A. Academic Hierarchy and Section Capacity
- **AC-01:** Administrator can create independent programs (BCA with 3 Years / 6 Semesters; B.Tech with 4 Years / 8 Semesters). No shared counters or cross-course leaks exist.
- **AC-02:** Administrator can configure distinct section counts per semester.
- **AC-03:** Section capacity is configurable between 60 and 80 students baseline. Attempting to enroll beyond capacity raises an explicit administrative capacity rejection (HTTP 409 Conflict).

### B. Student ID Permanence and Uniqueness
- **AC-04:** Two students across different courses cannot share a Student ID. Duplicate IDs in import files or creation forms are rejected with HTTP 409 Conflict.
- **AC-05:** Changing a student's Gmail address does not alter the Student ID, section allocation, or historical attendance records.
- **AC-06:** Promoting a student updates enrollment references while preserving prior year attendance records as permanently immutable and queryable.
- **AC-07:** Attempting to alter a Student ID via UI or direct API call returns `403 Forbidden`.

### C. Account Creation and 48-Hour Cryptographic Activation
- **AC-08:** Provisioned accounts are created in `PENDING_ACTIVATION` with `emailVerified: false`. Sign-in attempts return an account-pending error.
- **AC-09:** Activation link dispatched to student's Gmail expires in exactly 48 hours. Accessing the link at 48 hours and 1 minute displays an expiration message.
- **AC-10:** Reissuing an activation link immediately invalidates all previously issued activation tokens for that account.
- **AC-11:** Accessing a valid activation link executes an atomic validation query (`consumed_at IS NULL AND expires_at > NOW()`) and requires the student to set their own password (minimum 12 characters, 4 character classes).
- **AC-12:** On password creation, account status transitions to `ACTIVE`, Firebase Auth `emailVerified` is set to `true`, and the student can authenticate.

### D. Faculty Account Lifecycle
- **AC-13:** Administrator creates faculty account. Account receives 48-hour activation token; faculty sets own password (≥ 12 chars). Firebase Auth sets `{ role: 'faculty', departmentId: '...' }`.
- **AC-14:** Deactivating a faculty account immediately revokes refresh tokens via `admin.auth().revokeRefreshTokens()`, sets user disabled in Firebase Auth, invalidates server session records, and blocks authentication across all devices.
- **AC-15:** All attendance registers submitted by a deactivated faculty member remain intact, immutable, and correctly attributed in audit reports.

### E. Server-Enforced Session Idle Timeout and Revocation
- **AC-16:** A user inactive for 13 minutes receives a client-side warning modal with a 2-minute countdown. Reaching 15 minutes terminates that specific device session in `user_sessions`, returning `401 Unauthorized` (`SESSION_IDLE_TIMEOUT`), while any other actively used device for that user remains signed in.
- **AC-17:** Calling logout on all devices or changing password immediately invokes `revokeRefreshTokens(uid)` and marks all session records for that user in `user_sessions` as revoked. Subsequent requests from any device fail server verification with `401 Unauthorized` (`TOKEN_REVOKED`).

### F. File Upload Limit and Validation
- **AC-18:** Uploading a roster, profile photo, or correction document exceeding 10 MB is rejected with: *"File exceeds maximum allowed upload limit of 10 MB."*
- **AC-19:** Uploading an executable file renamed with a `.csv` or `.png` extension is rejected via magic-byte inspection before writing to Cloud Storage for Firebase.

### G. Attendance Correction Governance (FR-48)
- **AC-20:** Student submits correction request within 5 days of session with justification and uploaded evidence. Server validates student identity.
- **AC-21:** Assigned faculty can review evidence and approve clerical corrections within 24 hours. Server verifies faculty assignment.
- **AC-22:** Requests involving medical leave or submitted beyond 24 hours require HOD departmental approval. Server verifies HOD department scope.
- **AC-23:** Approved corrections update attendance records, recalculate percentages in real time, and log full audit details in `audit_logs` with SHA-256 hash chaining.
- **AC-23A:** Assigned faculty accessing `past-registers.html` can launch the Edit Past Attendance modal, select student status toggles (`P`, `A`, `L`), choose a mandatory correction reason, record justification notes, and save. The session state updates from `LOCKED` to `MODIFIED (AUDITED)`.

### H. Server-Enforced HOD and Faculty Access Controls & PostgreSQL RLS
- **AC-24:** HOD can view and manage only courses, sections, faculty, and students within their assigned department.
- **AC-25:** HOD attempting to query or access data belonging to another department receives `403 Forbidden` enforced server-side and by PostgreSQL Row-Level Security policies.
- **AC-26:** Faculty attempting to access or submit registers for an unassigned section or subject receives `403 Forbidden` enforced against `faculty_assignments` and PostgreSQL RLS.

### I. Bulk Import, Benchmarks, and Disaster Recovery
- **AC-27:** CSV and Excel files with 4,165 records parse and validate under 5 seconds with streaming memory below 128 MB in Cloud Run.
- **AC-28:** Bulk activation emails are queued into Google Cloud Tasks with unique task idempotency keys. Persistent database tracking in `processed_idempotency_keys` prevents duplicate email dispatches.
- **AC-29:** Synthetic load test with `k6` under realistic peak load (70 simultaneous section roll calls, 500 concurrent student dashboard reads) verifies p95 dashboard query latency $< 50\text{ ms}$ and p95 roll-call commit latency $< 250\text{ ms}$ with 0 deadlocks under PgBouncer connection pooling.
- **AC-30:** Automated disaster recovery restore drill verifies proposed RPO < 5 min and RTO < 60 min against an isolated Cloud SQL staging instance with zero data divergence from source.
- **AC-31:** Failure recovery and persistent idempotency verification: simulated network drop between Firebase Auth update and PostgreSQL commit during activation demonstrates idempotent retry success via `processed_idempotency_keys`.
- **AC-32:** Google Workspace SMTP Relay Quota Verification: Before onboarding 4,165 students, administrators audit the college's Google Workspace daily relay limits.
- **AC-33:** Audit Trail Cryptographic Verification: Automated daily integrity script validates linear SHA-256 hash chaining across all `audit_logs` records. Injecting simulated payload tampering immediately triggers a P1 incident alert and halts verification.
- **AC-34:** Full Year Academic Calendar Synchronization: The 12-month calendar grid accurately renders 214 instructional days, 38 statutory holidays/recesses, 4 exam cycles, 75% attendance threshold, and active day highlights.
- **AC-35:** Responsive Mobile Navigation Drawer: On viewports $\le 960\text{px}$, horizontal desktop navigation collapses into a 3-line hamburger button with morph animation into an "X".

### J. Administrator Operations Dashboard and Teacher Portal Management
- **AC-36:** Institutional Operations Dashboard Metrics & Live Status: Loading `admin.html` triggers `GET /api/admin/dashboard` returning institutional telemetry (4,165 total students baseline, active faculty count, today's sessions, and moving average attendance rate).
- **AC-37:** Faculty Provisioning & Duplicate Rejection: Submitting `POST /api/admin/teachers` creates a new faculty member with generated UUID. Submitting duplicate `facultyStaffId` or `officialEmail` is rejected with `409 Conflict`.
- **AC-38:** Teaching Allocation & Semester Compatibility Validation: Submitting `POST /api/admin/teachers/:id/assignments` creates a verified course/semester/section/subject teaching allocation. Mismatched cross-semester allocations are rejected with `400 Bad Request`.
- **AC-39:** Account Status Transition & Immediate Session Revocation: Updating a faculty member's status via `PATCH /api/admin/teachers/:id/status` requires an audit justification of at least 5 characters. When transitioning to `SUSPENDED` or `INACTIVE`, the backend invokes `admin.auth().revokeRefreshTokens(uid)` and marks all active server sessions invalid.
- **AC-40:** Admin Navigation Bar Synchronization & Mobile Drawer: All admin pages (`admin.html`, `admin-teachers.html`, `admin-marks.html`, `admin-students.html`, `admin-timetable.html`) render the unified `#1D3C72` navigation header with synchronized active link states.
- **AC-41:** Admin Profile-to-Overview Navigation Integrity: When an authenticated Administrator visits `profile.html` and clicks the "Dashboard" nav link or "Overview" menu trigger, the application navigates to `admin.html` (Administrator Operations Dashboard).
- **AC-42:** Client-Side Route Guard Enforcement & Cross-Role Isolation: Unauthenticated requests to protected pages (`admin*.html`, `teacher*.html`, `student*.html`, `profile.html`) are intercepted by `enforceRouteGuards()` and redirected to `signin.html`.

### K. Student Management, Timetable Scheduling & E2E Acceptance Criteria (New in v2.0.0)
- **AC-43 (Section Capacity Overflow Rejection):** Submitting a single student enrollment (`POST /api/admin/students`), bulk import commit (`POST /api/admin/students/bulk-commit`), or section transfer (`POST /api/admin/students/:id/transfer`) targeting a section whose active enrollment has reached `max_capacity` (e.g. 60–80) is rejected with HTTP 409 Conflict and an explicit capacity alert.
- **AC-44 (Historical Register Preservation on Section Transfer):** Transferring a student from Section A to Section B archives the Section A enrollment with status `TRANSFERRED` and creates an `ACTIVE` enrollment in Section B. All prior attendance roll calls and examination marks for Section A remain intact and immutable.
- **AC-45 (Activation Token 48-Hour Expiration Enforcement):** Accessing an activation token older than 48 hours returns HTTP 400 Bad Request with error code `TOKEN_EXPIRED`.
- **AC-46 (Single-Use Token Atomic Invalidation):** Redeeming a valid activation token marks it `consumed_at = NOW()`. Submitting the same token a second time returns HTTP 400 Bad Request with error code `TOKEN_ALREADY_USED`.
- **AC-47 (Token Reissuance Superseding):** Reissuing an activation link (`POST /api/admin/students/:id/reissue-activation`) marks all prior unredeemed tokens for that student as `revoked_at = NOW()`. The previously issued token immediately returns `TOKEN_REVOKED` if attempted.
- **AC-48 (Spreadsheet Formula Injection Neutralization):** During bulk preview (`POST /api/admin/students/bulk-preview`), any cell starting with `=`, `+`, `-`, `@`, `\t`, or `\r` is prepended with a single quote (`'`), ensuring formulas cannot execute when opened in spreadsheet software.
- **AC-49 (Immediate Active Session Termination on Account Suspension):** Transitioning a student or faculty account to `SUSPENDED` terminates all active database sessions in `user_sessions`.
- **AC-50 (Suspended User API Blocking):** A suspended user attempting to invoke any authenticated API endpoint is immediately blocked by `auth.ts` middleware with HTTP 403 `ACCOUNT_DEACTIVATED`.
- **AC-51 (Email Dispatch Fallback in Simulator Mode):** In development or testing mode (`LOCAL_SIMULATOR`), dispatched activation emails are logged into an in-memory queue with unique message IDs, and tokens can be verified by automated test suites without sending real emails.
- **AC-52 (Timetable Teacher Collision Prevention):** Submitting `POST /api/admin/timetable` or `PUT /api/admin/timetable/:id` where the assigned teacher is already scheduled for another section during the same day and time interval is rejected with HTTP 409 Conflict.
- **AC-53 (Timetable Room Double-Booking Prevention):** Submitting a timetable slot where the assigned classroom or laboratory is already booked by another class during the same time interval is rejected with HTTP 409 Conflict.
- **AC-54 (Concurrent Practical Lab Sessions for Disjoint Subgroups):** The timetable scheduler allows two practical laboratory slots for the same section to occur during the same time interval provided they target disjoint subgroups (`C1` and `C2`), different instructors, and different rooms.
- **AC-55 (Two-Stage Bulk Import Preview vs Commit Consistency):** Only rows validated and approved during the preview stage can be committed during the transactional commit stage. Rows flagged with errors (duplicate email, duplicate ID, invalid syntax) are omitted from creation.
- **AC-56 (215 Automated Test Verification Suite Gate):** The application codebase must pass 100% of all 215 automated tests across all 8 suites (`master-qa-e2e.ts`, `verify-student-management.ts`, `verify-full-system.ts`, `admin_verification.ts`, `navigation_regression.ts`, `onboarding_security_verification.ts`, `profile_verification.ts`, `timetable_verification.ts`) with zero compilation errors (`tsc` exit 0).
