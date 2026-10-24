# 3. Software Requirements Specification and Acceptance Criteria

**Version:** 2.2.0 — Multi-School Academic Hierarchy, Master Timetable Management & Conflict Engine, Real-Life Double-Submission Defense, Complete Role-Based Access Control, and Comprehensive Automated QA Release  
**Date:** 24 October 2026  
**Status:** Implemented & Verified in Production (217+ Automated Test Scenarios Passing — 100% Pass Rate)

---

## 3.1 Functional Requirements

### A. Academic Structure and Hierarchy Management
- **FR-01:** The system must strictly enforce the 7-tier institutional hierarchy:  
  `School / College -> Department -> Course / Programme -> Academic Year -> Semester -> Section -> Practical Subgroups (C1/C2) -> Students`
- **FR-02:** Multi-School and Program Independence: Each school independently groups its academic departments and programmes. Programs (e.g., BCA 3-year/6-semester, B.Tech 4-year/8-semester) must maintain completely independent structural numbering, section configurations, and enrollment pipelines without data leakage or shared counters.
- **FR-03:** Administrators must be able to configure and manage degree programs with variable durations, academic years, and semester counts.
- **FR-04:** Every semester must support an administrator-configured number of sections (e.g., BCA Semester 1 with Sections A, B, C, D; BCA Semester 2 with Sections A, B, C).
- **FR-05:** Each section must have a configurable student capacity with a confirmed institutional baseline of **60 to 80 students per section**. Enrolling beyond configured capacity must trigger an explicit administrative capacity rejection (HTTP 409 Conflict).
- **FR-06:** Curricular subjects must be defined under a specific Course, Academic Year, and Semester.
- **FR-07:** Faculty teaching allocations must bind an approved faculty member to a specific Course, Academic Year, Semester, Section, and Subject for an active academic calendar term.
- **FR-08:** Cohort promotion must advance students to the next semester/year while permanently sealing all prior term attendance records as immutable read-only archives.
- **FR-08A (Academic Entity Deletion Persistence):** Deletion of a school, department, programme, semester, section, or room must persist across database resets and in-memory lifecycles, ensuring deleted entities are never resurrected as mock ghosts.

### B. Student ID Management — Confirmed Institutional Rules
- **FR-09:** Student IDs must be globally unique across the entire institution. The relational database must enforce a global unique constraint preventing two students across any course or year from sharing an ID.
- **FR-10:** Student IDs are permanent and immutable. No system operation — including Gmail address changes, section reallocations, semester promotions, course transfers, or account suspensions — may alter a student's assigned Student ID.
- **FR-11:** The system must support dual-mode Student ID provisioning:
  - **Mode A (Institutional Import):** Administrator supplies an existing university registration number; the system validates global uniqueness and persists the value verbatim.
  - **Mode B (Configurable Auto-Generation):** Where no ID is supplied, the system auto-generates IDs using a configurable format template: `[COURSE_CODE]-[ACADEMIC_YEAR]-[4_DIGIT_SEQ]` (e.g., `BCA-2026-0001`).
- **FR-12:** Student IDs are institutional identifiers and must not be treated as confidential authentication secrets. Student IDs appear on printed class rolls, attendance registers, and official documents.

### C. User Profiles and Data Minimization
- **FR-13:** The system must maintain role-specific profile schemas for Students, Faculty, Administrators, and Heads of Departments (HODs), collecting only data strictly necessary for academic operations.
- **FR-14:** Student Profile stores: Student ID, Full Name, Student Gmail Address (verified), School, Course, Academic Year, Semester, Section, Roll Number, Profile Photo reference (optional), Account Status (`ACTIVE`, `PENDING_ACTIVATION`, `INACTIVE`, `SUSPENDED`), Firebase Auth UID, and security timestamps. Permitted self-edits are limited to personal phone, guardian contact, and blood group.
- **FR-15:** Faculty Profile stores: Faculty Staff ID (permanent), Full Name, Official Email Address, Academic Department, Designation, Teaching Allocations, Profile Photo reference (optional), Firebase Auth UID, and Account Status. Permitted self-edits are limited to office cabin and extension contact.
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
- **FR-28:** Historical attendance registers, session logs, marks, and audit entries submitted by a deactivated faculty member must be permanently preserved and remain attributed to their Faculty ID. Hard deletion of faculty records is strictly prohibited.

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

### J. Attendance Register Recording, One-Time Locking & Dynamic QR Code
- **FR-51:** Server-Enforced Faculty Assignment Check: When a faculty member requests or submits a register, the backend verifies in the relational database that an active `faculty_assignment` exists linking `user.faculty_id` to that specific `(course_id, semester_id, section_id, subject_id)`. Unassigned requests strictly return `403 Forbidden`.
- **FR-52:** Register roster loads only actively enrolled students of that specific section (60–80 students).
- **FR-53:** Marking vocabulary: Present (`P`), Absent (`A`), and Approved Leave (`L`).
- **FR-54:** Session registers must be permanently locked upon one-time submission. Duplicate submissions or unauthorized direct in-place edits are strictly prevented.
- **FR-54A (Dynamic QR Code Attendance):** The system must allow faculty to generate a rolling time-based QR code (refreshes every 15-30 seconds with signed cryptographic token). Students scan via mobile scanner in `student.html`; the server validates session time window and student section enrollment.
- **FR-55:** Standard institutional attendance formula: `Present / (Present + Absent) * 100`. Approved leaves are excluded from the denominator.
- **FR-56:** Shortage alerts must trigger automatically when a student's subject or aggregate percentage falls below the statutory **75% threshold**.

### K. Expanded Attendance Correction Governance & Past Registers Hub
- **FR-48A (Correction Request Submission):** Students must be able to submit formal attendance correction requests via their portal within **5 calendar days** from the conducted class date with claimed status (`P` or `L`), reason category, narrative, and uploaded evidence (≤ 10 MB).
- **FR-48B (Faculty Review & Authorization):** The assigned subject faculty member can review evidence and choose to: (1) Recommend Approval, (2) Direct Approve (permitted only within 24 hours for clerical errors), or (3) Reject with mandatory recorded rationale.
- **FR-48C (Departmental Authorization — HOD Scope):** Requests involving medical leave, official college duty, or submitted outside the 24-hour clerical window must be escalated to the **Head of Department (HOD)** for formal authorization.
- **FR-48D (Record Mutation):** Upon formal approval, the system updates `attendance_record.status`, sets `modified_by_user_id`, `approved_by_user_id`, and `approval_timestamp`.
- **FR-48E (Immutable Audit Trail & Linear Cryptographic Hash Chain):** Every correction action must generate an immutable entry in `audit_logs` with SHA-256 linear hash chaining ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{payload}_i)$).
- **FR-48F (Recalculation and Notification):** Approval or rejection must instantly update student and faculty dashboard metrics and notify student.
- **FR-48G (Dedicated Past Registers Hub & Faculty Attendance Editing):** Faculty members have a dedicated Past Submitted Registers Hub (`past-registers.html`) with multi-parameter search/filters. Assigned faculty can inspect historical sessions and directly launch the **Edit Past Attendance Modal** to adjust student attendance statuses (`P`, `A`, `L`). Editing requires a validated correction reason and recorded faculty audit notes, transitioning the session status to `MODIFIED (AUDITED)`.

### L. Head of Department (HOD) Server-Enforced Department Scope Governance
- **FR-57:** HOD administrative and supervisory authority must be strictly confined to courses, subjects, sections, faculty, and students affiliated with their designated academic department.
- **FR-58:** HODs can view aggregate and granular attendance registers, monitor faculty attendance submission timeliness, approve department-level attendance corrections, manage faculty teaching reassignments within the department, and review department marks.
- **FR-59:** Server-Side Isolation Enforcement: On every HOD request, the backend extracts `departmentId` from the verified token AND cross-verifies against the target resource in the database. Any query or modification targeting another department strictly returns `403 Forbidden`.

### M. Academic Calendar with 5-Tier Audience Targeting
- **FR-60:** Supports 5-tier audience targeting: Institution-wide, Course-specific, Academic Year-specific, Semester-specific, and Section-specific.
- **FR-60A (Full Year 12-Month Calendar & Bidirectional Zoom):** The academic calendar (`calendar.html`) provides a synchronized 3-way view toggle: Full Year 12-Month interactive grid, Dynamic Single-Month view, and Filterable Agenda milestone list. Clicking any mini-month card zooms directly into that month.
- **FR-60B (Responsive Mobile Navigation Drawer):** Across all application portals, screens $\le 960\text{px}$ replace horizontal headers with an accessible 3-line hamburger menu button (`.nav-toggle-btn`) that animates into an "X", paired with a slide-out side drawer (`.mobile-drawer`).
- **FR-61:** Calendar events are visible strictly to their designated audience. Draft events are hidden from students and faculty.
- **FR-62:** Calendar events are informational and must never automatically modify student attendance records.

### N. Master Timetable Management & Conflict Engine (`admin-timetable.html`)
- **FR-80 (Weekly Grid Scheduling):** Visual master schedule management rendering a weekly grid (Monday–Saturday, 09:00–17:00).
- **FR-81 (Faculty Clash Collision Prevention):** Creating or updating a timetable slot (`POST /api/admin/timetable`) must check whether the assigned faculty member is already scheduled for another section during the requested day and overlapping time interval, returning HTTP 409 Conflict upon collision.
- **FR-82 (Room Double-Booking Prevention):** The timetable scheduler must verify that the assigned classroom or laboratory is not already booked by another class during the same time interval, returning HTTP 409 Conflict on collision.
- **FR-83 (Laboratory Practical Subgroup Splitting):** The timetable scheduler must support parallel laboratory sessions for split student cohorts (`C1` and `C2`) occupying the same time slot in different laboratory rooms with different instructors.
- **FR-86 (Academic Entities Management Tab):** Full CRUD for Schools, Departments, Programmes, and Semesters with complete deletion persistence.
- **FR-87 (Classrooms & Laboratories Management Tab):** Management of classrooms and labs with room type, capacity, and code uniqueness checks.
- **FR-88 (Timetable Settings & Clear Schedule Tab):** Configurable period slot timings, and selective section schedule clearing or full timetable reset without resurrecting mock schedules.

### O. Examination Marks Governance (`teacher-marks.html` & `admin-marks.html`)
- **FR-89 (Assessment Provisioning & Double-Click Defense):** Faculty creates assessments (CIA-1, CIA-2, Theory, Practical) for assigned sections. Rapid double-clicks are handled idempotently, returning the existing assessment without duplicate records.
- **FR-90 (Marks Range Validation):** Scores must strictly satisfy $0 \le \text{obtainedMarks} \le \text{maxMarks}$. Out-of-bounds scores are rejected server-side.
- **FR-91 (Bulk Score Save & Atomic Upsert):** Saving student scores executes an atomic upsert, updating existing marks without creating redundant score rows.
- **FR-92 (Admin Verification & Result Publishing):** Faculty submits assessment to Admin. Administrator verifies and publishes results. Students can strictly view PUBLISHED assessments only; draft and submitted assessments remain confidential.

### P. Real-Life Double-Submission Defense & Idempotency
- **FR-93:** All state-modifying endpoints (attendance session creation, mark score saving, assessment creation, entity registration) must enforce idempotency and duplicate collision defense, ensuring concurrent requests return existing entities without creating ghost rows or phantom entries.

---

## 3.2 Role-Permission Matrix (Server-Enforced)

| Capability / Action | Administrator | HOD / Dept Head | Faculty / Teacher | Student |
| :--- | :---: | :---: | :---: | :---: |
| **Configure Schools, Depts, Programmes** | Yes (Global) | View (Dept) | No (403) | No (403) |
| **Manage Classrooms & Labs (Rooms)** | Yes (Global) | View Only | View Only | No (403) |
| **Configure Timetable & Conflict Engine** | Yes (Global) | View (Dept) | View (Assigned) | View (Enrolled) |
| **Clear Timetable Schedules** | Yes (Global) | No (403) | No (403) | No (403) |
| **Set Section Capacity Limits (60–80)** | Yes (Global) | View (Dept) | No (403) | No (403) |
| **Create Student Accounts in Firebase Auth** | Yes (Global) | No (403) | No (403) | No (403) |
| **Bulk Import Students (Two-Stage Preview/Commit)** | Yes (Global) | No (403) | No (403) | No (403) |
| **Transfer Student Between Sections** | Yes (Global) | No (403) | No (403) | No (403) |
| **Reissue 48h Activation Link** | Yes (Global) | Yes (Dept Scope) | No (403) | No (403) |
| **Permanently Delete Student** | Yes (Global) | No (403) | No (403) | No (403) |
| **Create / Deactivate Faculty Accounts** | Yes (Global) | Request Only | No (403) | No (403) |
| **Assign Faculty Teaching Workload** | Yes (Global) | Yes (Dept Scope) | No (403) | No (403) |
| **Suspend / Inactivate Accounts** | Yes (Global) | Recommend (Dept) | No (403) | No (403) |
| **View or Modify Plain-Text Passwords** | **Never** | **Never** | **Never** | **Never** |
| **Set or Change Own Password** | Yes | Yes | Yes | Yes |
| **Take Attendance for Assigned Classes** | No (Audit) | No (Audit) | Yes (Assigned) | No (403) |
| **Generate Classroom Rolling QR Attendance** | No | No | Yes (Assigned) | No (403) |
| **Scan Classroom QR Attendance Check-In** | No | No | No | Yes (Enrolled) |
| **Access Unassigned Section Registers** | View All (Audit) | View Only (Dept) | **Denied (403)** | No (403) |
| **Edit Past Registers with Audit Classification** | View All | View (Dept) | Yes (Assigned) | No (403) |
| **Create Assessments & Enter Scores** | No | Oversight (Dept) | Yes (Assigned) | No (403) |
| **Verify & Publish Exam Results** | Yes (Global) | Review (Dept) | Submit Only | View Published Only |
| **Submit Attendance Correction Request** | No | No | Yes (Self ≤24h) | Yes (Own ≤5 days) |
| **Approve Attendance Corrections (FR-48)** | Yes (Global) | Yes (Dept Scope) | Yes (Clerical ≤24h) | No (403) |
| **View Personal Attendance History & Heatmap** | No | No | No | Yes (Own Only) |
| **Publish Academic Calendar Events** | Yes (All Tiers) | Yes (Dept Tiers) | No (Request Only) | No (403) |
| **Inspect Cryptographic Hash Chain Audit Logs** | Yes (Global) | Yes (Dept Scope) | No (403) | No (403) |

---

## 3.3 Acceptance Criteria (AC-01 through AC-65)

### A. Academic Hierarchy and Deletion Persistence
- **AC-01:** Administrator can create independent schools and programmes (BCA with 3 Years / 6 Semesters; B.Tech with 4 Years / 8 Semesters). No shared counters or cross-course leaks exist.
- **AC-02:** Administrator can configure distinct section counts per semester.
- **AC-03:** Section capacity is configurable between 60 and 80 students baseline. Attempting to enroll beyond capacity raises an explicit administrative capacity rejection (HTTP 409 Conflict).
- **AC-03A:** Deleting a school, department, programme, semester, section, or room permanently removes the entity and does not allow mock records to resurrect.

### B. Student ID Permanence and Uniqueness
- **AC-04:** Two students across different courses cannot share a Student ID. Duplicate IDs in import files or creation forms are rejected with HTTP 409 Conflict.
- **AC-05:** Changing a student's Gmail address does not alter the Student ID, section allocation, or historical attendance records.
- **AC-06:** Promoting a student updates enrollment references while preserving prior year attendance records as permanently immutable and queryable.
- **AC-07:** Attempting to alter a Student ID via UI or direct API call returns `403 Forbidden`.

### C. Account Creation and 48-Hour Cryptographic Activation
- **AC-08:** Provisioned accounts are created in `PENDING_ACTIVATION` with `emailVerified: false`. Sign-in attempts return an account-pending error.
- **AC-09:** Activation link dispatched to student's Gmail expires in exactly 48 hours. Accessing the link at 48 hours and 1 minute displays an expiration error (HTTP 400 `TOKEN_EXPIRED`).
- **AC-10:** Reissuing an activation link immediately invalidates all previously issued activation tokens for that account (`revoked_at = NOW()`).
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

### G. Attendance Correction Governance & Past Registers Hub
- **AC-20:** Student submits correction request within 5 days of session with justification and uploaded evidence (≤ 10 MB). Server validates student identity.
- **AC-21:** Assigned faculty can review evidence and approve clerical corrections within 24 hours. Server verifies faculty assignment.
- **AC-22:** Requests involving medical leave or submitted beyond 24 hours require HOD departmental approval. Server verifies HOD department scope.
- **AC-23:** Approved corrections update attendance records, recalculate percentages in real time, and log full audit details in `audit_logs` with SHA-256 hash chaining.
- **AC-23A:** Assigned faculty accessing `past-registers.html` can launch the Edit Past Attendance modal, select student status toggles (`P`, `A`, `L`), choose a mandatory correction reason, record justification notes, and save. The session state updates from `LOCKED` to `MODIFIED (AUDITED)`.

### H. Server-Enforced HOD and Faculty Access Controls & PostgreSQL RLS
- **AC-24:** HOD can view and manage only courses, sections, faculty, and students within their assigned department.
- **AC-25:** HOD attempting to query or access data belonging to another department receives `403 Forbidden` enforced server-side and by PostgreSQL Row-Level Security policies.
- **AC-26:** Faculty attempting to access or submit registers for an unassigned section or subject receives `403 Forbidden` enforced against `faculty_assignments` and PostgreSQL RLS.

### I. Bulk Import, Formula Sanitization & Benchmarks
- **AC-27:** CSV and Excel files with 4,165 records parse and validate under 5 seconds with streaming memory below 128 MB in Cloud Run.
- **AC-28:** Bulk activation emails are queued into Google Cloud Tasks with unique task idempotency keys.
- **AC-28A:** Cells starting with formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) are prepended with a single quote (`'`), neutralizing potential command execution in Excel.

### J. Administrator Operations Dashboard & Navigation
- **AC-29:** Loading `admin.html` displays real-time metrics (4,165 students, active faculty, today's registers, moving average attendance rate).
- **AC-30:** Departments without active sections display explicit `UNCONFIGURED` status badges.
- **AC-31:** All admin pages render the unified `#1D3C72` navigation header with synchronized active link states.
- **AC-32:** Authenticated Administrator clicking "Overview" or "Dashboard" in `profile.html` navigates strictly to `admin.html`.

### K. Master Timetable Management & Conflict Engine (`admin-timetable.html`)
- **AC-33 (Teacher Overlap Detection):** Submitting a slot where the assigned teacher is already scheduled for another class during the same day and time interval is rejected with HTTP 409 Conflict (`TEACHER_OVERLAP`).
- **AC-34 (Room Double-Booking Detection):** Submitting a slot where the assigned room is booked by another class during the same time interval is rejected with HTTP 409 Conflict (`ROOM_OVERLAP`).
- **AC-35 (Section Collision Detection):** Submitting a whole-class lecture that overlaps with an existing lecture for the same section is rejected with HTTP 409 Conflict (`SECTION_OVERLAP`).
- **AC-36 (Parallel Practical Subgroups):** Parallel practical lab slots for `C1` and `C2` within the same section succeed with 0 conflicts if they have separate instructors and separate rooms.
- **AC-37 (Clear Schedule Functionality):** Admin can clear a section's schedule or clear all schedules cleanly without resurrecting mock schedules.

### L. Examination Marks Double-Submission Defense & Visibility
- **AC-38 (Assessment Double-Click Defense):** Rapid duplicate clicks on assessment creation return the existing assessment without creating duplicate records.
- **AC-39 (Marks Range Validation):** Scores exceeding `maxMarks` or below 0 are rejected server-side with validation errors.
- **AC-40 (Atomic Score Upsert):** Re-submitting student scores updates existing rows without creating duplicate mark rows.
- **AC-41 (Student Marks Scoping & Visibility):** Students can strictly query their own marks (STU-1 cannot view STU-2) and strictly view PUBLISHED assessments.

### M. Comprehensive Automated Test Verification Gate (217+ Scenarios)
- **AC-42:** 100% of all automated test scenarios across all 8 suites (`real_life_admin_workflow.ts`, `all_roles_verification.ts`, `admin_verification.ts`, `navigation_regression.ts`, `onboarding_security_verification.ts`, `profile_verification.ts`, `timetable_verification.ts`, `real_user_workflow.ts`) must pass with zero compilation errors (`tsc` exit 0).
