# 2. Product Requirements Document (PRD)

**Version:** 2.0.0 — Comprehensive Student Management, Academic Hierarchy, 48-Hour Cryptographic Activation, Two-Stage Bulk Import, Timetable Scheduler, and Master E2E QA Release  
**Date:** 20 October 2026  
**Status:** Active Implementation & Baseline Specification

---

## 2.1 Product Concept and Institutional Purpose
A browser-based College Attendance Management and Academic Information Portal designed to provide auditable, real-time attendance recording, student academic visibility, 5-tier targeted academic calendar scheduling, master timetable management, institutional compliance monitoring, and a robust user identity and account lifecycle subsystem. The portal accommodates multi-course institutions with configurable academic structures, individual and two-stage bulk student account provisioning, 48-hour cryptographic account activation, server-enforced authorization, and strict role-based access control.

The system is engineered to handle an initial population of **4,165+ matriculated students** and **~55 to 70 active class sections**, with an underlying architecture sized to scale smoothly to **10,000+ students** without restructuring data models, indexing strategies, or background queue systems.

**Technology Mandate:** The entire application, database, authentication, storage, and background processing pipeline is hosted strictly on **Google Firebase and Google Cloud Platform (GCP)**. All references to AWS and Amazon SES remain strictly excluded from the architecture. Primary brand color `#1D3C72` is universally preserved across all interfaces and documentation.

---

## 2.2 Academic Structure and Hierarchy

### A. Required 6-Tier Institutional Hierarchy
The system strictly enforces the following organizational structure:

```
College -> Department -> Course/Program -> Academic Year -> Semester -> Section -> Students
```

Every tier is managed independently by administrators while maintaining strict relational integrity across the entire academic pipeline.

### B. Program Configurability — Confirmed Independent Hierarchy
Each academic course/program independently owns its academic years, semesters, sections, and student rosters. No two courses share academic year numbering, semester numbering, or section assignments.

1. **BCA (Bachelor of Computer Applications):**
   - Duration: 3 Academic Years (6 Semesters total).
   - BCA Year 1: Semester 1 (independent sections e.g. A, B, C, D) and Semester 2 (independent sections e.g. A, B, C).
   - BCA Year 2: Semester 3 (independent sections e.g. A, B, C, D) and Semester 4 (independent sections e.g. A, B, C).
   - BCA Year 3: Semester 5 (independent sections e.g. A, B, C) and Semester 6 (independent sections e.g. A, B, C).
2. **B.Tech (Bachelor of Technology):**
   - Duration: 4 Academic Years (8 Semesters total).
   - Each academic year contains 2 semesters, each with independent section allocations.
3. **Other Academic Programs (BBA, B.Sc, M.Tech, MCA, etc.):**
   - Fully customizable program duration, academic years, semesters per year, and per-semester section allocations.
   - Administrators can add, archive, or modify courses as institutional offerings evolve without impacting existing historical records.

### C. Section Capacity and Allocation — Confirmed (60–80 Baseline)
- Section counts are configured independently for every semester within every course.
- Section capacity is configurable per section, with an institutional baseline operating range of **60 to 80 students per section**.
- Administrators configure a maximum capacity limit (`max_capacity`) for each section upon creation.
- A student belongs to exactly one active section per semester.
- **Enforced Capacity Check:** Enrolling a student into a section that has reached maximum capacity triggers an explicit administrative capacity rejection (HTTP 409 Conflict) and blocks enrollment on single creation, two-stage bulk import, and section transfers.

### D. Relational Linking Rules
- **Subjects:** Linked to a specific Course, Academic Year, and Semester.
- **Sections:** Created under a specific Course, Academic Year, and Semester.
- **Faculty Teaching Assignments:** Explicitly binds an approved Faculty Member to a specific Course, Academic Year, Semester, Section, and Subject for an active academic calendar term.
- **Attendance Sessions:** Instantiated exclusively for an assigned Faculty Member, Section, and Subject for a designated date, time slot, and instructional hour count.
- **Student Enrollment:** Students are enrolled into a specific Course, Year, Semester, and Section with a unique section-level roll number.

### E. Cohort Promotion and Non-Destructive Section Transfers
- The system supports advancing students between semesters and academic years (e.g., advancing BCA Year 1 Semester 2 students to BCA Year 2 Semester 3).
- **Non-Destructive Section Transfers:** When an administrator transfers a student between sections within a semester (e.g., BCA Sem 1 Sec A -> Sec B), the system archives the prior enrollment record with status `TRANSFERRED` and an `effective_date`. A new `ACTIVE` enrollment record is created for the destination section.
- **Historical Data Preservation:** All previous attendance roll-call records (`P`, `A`, `L`), conducted sessions, and examination marks remain permanently attributed to the original section. Cumulative attendance calculations correctly aggregate records across both sections if required by institutional policy.

---

## 2.3 User Profiles and Identity Management

### A. Principle of Data Minimization
The system collects and stores only data elements strictly required for academic identity, attendance verification, credential management, and official communications. Financial, sensitive biometric, medical history, and extraneous personal attributes are deliberately excluded.

### B. Distinct 3-Tier Lifecycle Separation
The system maintains strict architectural separation between user account status, email invitation status, and academic enrollment status:

```
[User Account Status]
PENDING_ACTIVATION ──(Redeem Token)──> ACTIVE <───(Admin Toggle)───> SUSPENDED / INACTIVE

[Invitation Status]
NOT_SENT ──(Dispatch)──> SENT ──(Redeem)──> ACCEPTED
                           │
                           ├──(48h Expire)──> EXPIRED
                           │
                           └──(Re-invite)───> REVOKED

[Academic Enrollment Status]
PENDING ──(Commit)──> ACTIVE ──(Transfer)──> TRANSFERRED (Archived)
                        │
                        ├──(Graduate)──> COMPLETED
                        │
                        └──(Drop)──────> WITHDRAWN
```

### C. Role-Specific Profile Specifications

#### 1. Student Profile
- **Student ID / College Registration ID:** Unique, permanent institutional identifier (e.g., `STU-2026-0001` or university admission number). Once assigned, the Student ID never changes regardless of Gmail address changes, section transfers, semester promotions, or course transfers.
- **Full Name:** Official student name as registered in college admission records.
- **Student Gmail Address:** Registered and verified Gmail address used for Firebase Authentication, system communication, account activation, and password recovery.
- **Course / Program:** Associated program of study (e.g., BCA, B.Tech).
- **Academic Year:** Current enrolled structural year (e.g., 1st Year, 2nd Year).
- **Semester:** Active semester (e.g., Semester 1 through Semester 8).
- **Section:** Active class section (e.g., Section A, Section B).
- **Roll Number / Class Position:** Section-level roll sequence (e.g., 01 to 80), unique within the active section.
- **Profile Photo (Optional):** Passport-style identification photo stored in Cloud Storage for Firebase (subject to 10 MB upload limit).
- **Account Status:** `ACTIVE`, `PENDING_ACTIVATION`, `INACTIVE`, or `SUSPENDED`.
- **Firebase Auth UID:** Bound to the student's Firebase Authentication identity record.

#### 2. Faculty Profile
- **Faculty ID:** Unique institutional staff identifier (e.g., `FAC-201`, `FAC-CS-108`). Permanent across tenure.
- **Full Name:** Official faculty name.
- **Official Email Address:** Institutional email or verified faculty Gmail address bound to Firebase Auth.
- **Department:** Primary academic department affiliation (e.g., Department of Computer Applications).
- **Teaching Allocations:** Active mapping to assigned Courses, Subjects, Semesters, and Sections.
- **Account Status:** `ACTIVE`, `PENDING_ACTIVATION`, `INACTIVE`, or `SUSPENDED`.

#### 3. Administrator Profile
- **Staff ID:** Unique administrative identifier (e.g., `ADM-001`).
- **Full Name:** Official name.
- **Official Email Address:** Institutional administrative email bound to Firebase Auth with `{ role: 'admin' }` custom claim.
- **Designation:** Institutional office or title.
- **Role and Permissions:** Global institutional administrative capabilities (System configuration, user provisioning, global reports, audit logs).
- **Account Status:** `ACTIVE`, `INACTIVE`, or `SUSPENDED`.

#### 4. Head of Department (HOD) Profile — Server-Enforced Department Scope Isolation
- **Staff ID:** Unique department head identifier (e.g., `HOD-CA-01`).
- **Full Name:** Official name.
- **Official Email Address:** Institutional email address bound to Firebase Auth with `{ role: 'hod', departmentId: '...' }` custom claims.
- **Department Affiliation:** Explicitly bound to a single academic department (e.g., Computer Applications).
- **Server-Enforced Scope:** Confined strictly to their designated department. Backend checks `course.department_id == user.department_id` on every protected endpoint. Any cross-department query or modification returns HTTP 403 Forbidden.

---

## 2.4 Student ID — Confirmed Institutional Rules

1. **Uniqueness and Permanence:** Once assigned, a Student ID is permanent and immutable. It never changes under any circumstance, including Gmail address changes, section transfers, semester promotions, course transfers, or account status updates.
2. **Dual-Source Support:**
   - **Mode A — Institutional Import:** Administrator supplies pre-existing university registration numbers during bulk import or single-entry creation. The system validates uniqueness globally and persists the value verbatim.
   - **Mode B — Configurable Auto-Generation:** Where no pre-existing ID is provided, the system generates IDs using a configurable institutional format template: `[COURSE_CODE]-[ADMISSION_YEAR]-[ZERO_PADDED_SEQUENCE]` (e.g., `BCA-2026-0001`, `BTCS-2026-0042`).
3. **Institutional Identifier, Not a Secret:** Student IDs appear on printed class rolls, attendance registers, and official documents; they are not authentication secrets and must never be used as default passwords.
4. **Duplicate Prevention:** The database enforces a global uniqueness constraint on Student IDs across all courses, departments, and academic years.

---

## 2.5 Account Lifecycle and 48-Hour Cryptographic Activation Workflow

### A. Administrator-Created Student Accounts & Secure Activation
Student accounts are created exclusively by administrators through single entry or two-stage bulk spreadsheet import. Public unverified self-registration is strictly prohibited.

1. **Identity Provisioning via Firebase Admin SDK / Database:**
   - Administrator enters student data or executes bulk spreadsheet import.
   - Profile record is created in the database with status `PENDING_ACTIVATION`.
   - Enrollment is created under the chosen course, semester, and section with roll number assignment.
2. **Secure 48-Hour Cryptographic Token Generation:**
   - System generates a cryptographically secure token using a CSPRNG with **256 bits of entropy** (`crypto.randomBytes(32).toString('hex')`).
   - Database stores exclusively the salted SHA-256 hash of the token (`token_hash`), along with `expires_at = NOW() + INTERVAL '48 hours'`, `consumed_at = NULL`, and `revoked_at = NULL`. The raw plaintext token is never stored in any database or log file; it exists solely in the transmitted activation email URL (`/activate.html?token=...`).
3. **Activation Email Dispatch:**
   - The email service dispatches an activation email containing the 48-hour activation link.
   - Dual-mode email architecture: dispatches via Google Workspace SMTP Relay in production, or logs to the stateful `LOCAL_SIMULATOR` dev queue in local/offline environments.
4. **Token Supersession on Reissuance:**
   - When an administrator reissues an activation link (`POST /api/admin/students/:id/reissue-activation`), the backend atomically revokes all previous unredeemed tokens for that student (`UPDATE activation_tokens SET revoked_at = NOW() WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`), then generates and dispatches a fresh 48-hour token.
5. **Single-Use Atomic Validation & Password Setting:**
   - When the student clicks the activation link and submits a new password, the backend verifies the token and consumes it atomically:
     ```sql
     UPDATE activation_tokens 
     SET consumed_at = NOW() 
     WHERE token_hash = $1 
       AND consumed_at IS NULL 
       AND revoked_at IS NULL 
       AND expires_at > NOW() 
     RETURNING user_id;
     ```
   - If zero rows are returned, the request is rejected immediately with an explicit error (invalid, expired, superseded, or already redeemed).
   - If valid, the user password is set in Firebase Auth, and the account status transitions to `ACTIVE`.
6. **Password Policy Enforcement:**
   - **Minimum 12 characters** enforced both client-side and server-side.
   - **Complexity:** Requires at least one uppercase letter (A-Z), one lowercase letter (a-z), one numeric digit (0-9), and one special character (`!@#$%^&*()_+-=[]{}|;:,.<>?`).

### B. Immediate Account Suspension Enforcement Middleware
When an administrator suspends a student or faculty account (`PATCH /api/admin/students/:id/status` or `PATCH /api/admin/teachers/:id/status` with `status: 'SUSPENDED'`):
1. The account status is set to `SUSPENDED` in the database, with mandatory audit justification recorded.
2. Active sessions in `user_sessions` are immediately invalidated (`status = 'REVOKED'`).
3. The backend authentication middleware (`auth.ts`) executes a real-time account status check on every incoming request:
   ```typescript
   if (user.account_status === 'SUSPENDED') {
     return res.status(403).json({
       success: false,
       code: 'ACCOUNT_DEACTIVATED',
       message: 'Your account has been suspended by administration. Please contact academic support.'
     });
   }
   ```
4. Even if the client holds an unexpired JWT or session token, every subsequent API call is immediately blocked with HTTP 403 `ACCOUNT_DEACTIVATED`.

---

## 2.6 Two-Stage Bulk Student Registration Workflow

### A. Approved File Formats
The bulk import subsystem accepts **CSV (.csv)** and **Excel (.xlsx)** spreadsheet formats.

### B. Stage 1: File Ingestion, Normalization & Security Preview
1. **Spreadsheet Ingestion:** Administrator selects Course, Academic Year, Semester, and Section, then uploads the spreadsheet file (max 10 MB).
2. **Formula Injection (CSV Injection) Sanitization:**
   - Spreadsheet cells beginning with hazardous formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) are sanitized by prepending a single quote (`'`), neutralizing potential command execution in Excel/Calc when exporting.
3. **Flexible Header Normalization:**
   - The parser normalizes arbitrary header variations:
     - `fullName`, `full_name`, `Full Name`, `Student Name` -> `full_name`
     - `studentId`, `student_id`, `Student ID`, `Admission No` -> `student_id`
     - `email`, `emailAddress`, `Email`, `Gmail` -> `email`
     - `rollNumber`, `roll_number`, `Roll No` -> `roll_number`
4. **Comprehensive Validation Engine:**
   - Checks within-batch duplicate emails and student IDs.
   - Checks database duplicate emails and student IDs.
   - Checks section capacity constraints (`active_enrolled + valid_batch_count <= max_capacity`).
   - Validates email syntax (RFC 5322 compliant).
5. **Interactive Preview Table:**
   - Returns a structured preview JSON containing total rows, valid row count, error count, warnings, and row-by-row status badges (`VALID`, `DUPLICATE_IN_FILE`, `DUPLICATE_IN_DB`, `CAPACITY_EXCEEDED`, `INVALID_EMAIL`).

### C. Stage 2: Transactional Commit & Activation Dispatch
1. **Transactional Execution:**
   - Administrator confirms the import. Validated rows are committed within an atomic database transaction.
   - Provisions student profiles and active enrollments with assigned roll numbers.
   - Automatically generates 48-hour cryptographic activation tokens for each imported student.
2. **Asynchronous Activation Email Queueing:**
   - Enqueues activation email dispatch tasks to deliver welcome invitations containing secure activation links.
   - Logs full batch audit details with SHA-256 hash chain recording.

---

## 2.7 Relational Database Architecture: PostgreSQL & SLAs

### A. Core Relational Integrity
Cloud SQL for PostgreSQL via Firebase Data Connect (or direct Cloud SQL accessed by Cloud Run microservices) is the authoritative relational store for academic structure, student profiles, enrollments, attendance, and audit logs.
- Strict foreign key constraints prevent orphaned enrollments or records.
- Composite unique constraint `(session_id, student_id)` prevents duplicate roll marking.
- Unique constraint `(section_id, roll_number)` prevents duplicate roll sequences in active sections.

### B. Measurable Latency SLAs under Concurrent Workloads

| Operation / Query | Target p95 Latency SLA | Target p99 Latency SLA | Workload Conditions |
| :--- | :--- | :--- | :--- |
| **Student Dashboard Aggregate Rollup** | $< 50\text{ ms}$ | $< 100\text{ ms}$ | 500 concurrent Virtual Users (VUs) |
| **Section Roster Loading (80 students)** | $< 150\text{ ms}$ | $< 250\text{ ms}$ | 100 concurrent VUs |
| **Attendance Register Submission (Atomic Commit)** | $< 250\text{ ms}$ | $< 500\text{ ms}$ | 70 concurrent faculty submissions |
| **Bulk Import Validation (4,165 records)** | $< 5\text{ seconds}$ | $< 10\text{ seconds}$ | Single batch stream, RAM < 128 MB |
| **Audit Log Inspection Query (Admin / HOD)** | $< 200\text{ ms}$ | $< 400\text{ ms}$ | 50 concurrent administrative queries |

---

## 2.8 Transactional Email Subsystem: Reliable Queue & Simulator

1. **Email Provider Adapter Interface:**
   - The application defines a unified `EmailProvider` interface supporting `sendActivationEmail()`, `sendPasswordResetEmail()`, and `sendNotification()`.
2. **Production Mode:**
   - Connects to **Google Workspace SMTP Relay** (authenticated via Secret Manager credentials). Rate-governed via Google Cloud Tasks with exponential backoff retries.
3. **Local / Testing Mode (`LOCAL_SIMULATOR`):**
   - Automatically activates when SMTP credentials are not configured or in offline environments.
   - Captures dispatched emails into an in-memory queue with message IDs, token tracking, and console logging, allowing automated verification tests to validate activation links without sending actual emails.

---

## 2.9 Attendance Register, Student Portal, and FR-48 Correction Governance

### A. Faculty Attendance Register & Server-Enforced Allocations
- Server verifies active `faculty_assignment` linking `user.faculty_id` to `(course_id, semester_id, section_id, subject_id)`. Unassigned access returns HTTP 403 Forbidden.
- Marking vocabulary: Present (`P`), Absent (`A`), and Approved Leave (`L`).
- **One-Time Submission Locking:** Register is permanently locked upon submission. Duplicate submissions or unauthorized in-place overwrites are blocked.

### B. Student Attendance Portal
- Real-time aggregate percentage and subject-wise breakdown.
- Visual warning indicators when percentage drops below the **75% statutory threshold**.
- Chronological session history with date and subject filtering.

### C. Attendance Correction Governance (FR-48)
- Student submits correction request within **5 calendar days** of session with reason category and uploaded evidence.
- Faculty reviews and approves clerical errors within **24 hours**.
- Departmental escalation to HOD for medical leave, college duty, or requests beyond 24 hours.
- Status mutation updates `attendance_records` and logs immutable entry in `attendance_audit_log` with SHA-256 hash chaining.

---

## 2.10 Centralized Academic Calendar with 5-Tier Audience Targeting

Centralized scheduling of college events, statutory holidays, semester exam schedules, and academic deadlines with strict audience filtering:
1. **5-Tier Audience Hierarchy:** College -> Course -> Academic Year -> Semester -> Section.
2. **Strict Audience Filtering:** Events are visible strictly to their designated audience. Draft events are visible only to authorized administrators.
3. **Independence from Attendance:** Calendar events represent informational schedules and never automatically mark or mutate attendance records.

---

## 2.11 Student Management Console Specification (`admin-students.html`)

The Student Management Console provides comprehensive administrative control over student records, academic enrollments, section capacities, and account security.

1. **Live KPI Metric Cards:**
   - **Total Matriculated Students:** Live count of all registered students (baseline 4,165).
   - **Active Enrolled Students:** Students with current active section enrollments.
   - **Pending Account Activations:** Students issued activation links who have not yet set passwords.
   - **Suspended Accounts:** Accounts temporarily or permanently disabled.
2. **Multi-Tier Hierarchy Filter Bar:**
   - Independent dropdowns for Academic Year, Course/Program, Semester, Section, and Account Status.
   - Full-text search matching student name, Student ID, email, or roll number with client/server debounce.
3. **Student Roster Data Table:**
   - Displays Student ID, Full Name, Email, Course, Semester, Section, Roll No, Account Status badge, and Action Menu.
   - Status Badges: `ACTIVE` (green), `PENDING_ACTIVATION` (amber), `SUSPENDED` (red).
4. **Modal Workflows:**
   - **Add Single Student Modal (`#addStudentModal`):** Capacity-guarded single enrollment.
   - **Bulk Import Modal (`#bulkImportModal`):** Two-stage CSV/XLSX import with live preview table and formula injection sanitization.
   - **Transfer Section Modal (`#transferModal`):** Non-destructive transfer archiving prior enrollment as `TRANSFERRED`.
   - **Reissue Activation Link Modal (`#reissueModal`):** Supersedes previous tokens, generates fresh 48-hour token, and re-dispatches email.
   - **Account Suspension Modal (`#suspendModal`):** Suspends account with mandatory justification, immediately revoking active sessions.

---

## 2.12 Master Timetable Management Specification (`admin-timetable.html`)

The Master Timetable Management Console provides visual scheduling governance across all academic departments, courses, and sections.

1. **Weekly Timetable Grid:**
   - Displays instructional schedule from Monday through Saturday, 09:00 to 17:00.
   - Distinct color-coded slot cards for Lectures and Laboratory Practicals.
2. **Laboratory Practical Subgroup Splitting:**
   - Supports parallel laboratory sessions for split subgroups (`C1` and `C2`) occupying the same time slot in different laboratory rooms with different instructors.
3. **Backend Conflict Detection Engine:**
   - **Teacher Collision Prevention:** Rejects slot creation with HTTP 409 Conflict if the assigned teacher is already scheduled for another section during the requested day and time interval.
   - **Room Collision Prevention:** Rejects slot creation with HTTP 409 Conflict if the assigned classroom/laboratory is already booked by another class during the same time interval.
   - Exemption: Parallel practical subgroups `C1` and `C2` belonging to the *same section* can share the same time slot provided they have different instructors and different rooms.
4. **Slot Management Workflows:**
   - **Add/Edit Slot Modal (`#slotModal`):** Configures Day, Start/End Time, Subject, Teacher, Room, Session Type (`LECTURE` / `PRACTICAL_LAB`), and Subgroup (`FULL` / `C1` / `C2`).
   - Dynamic conflict alert banner displays detailed collision diagnostics prior to submission.
   - **Delete Slot Modal (`#deleteSlotModal`):** Removes scheduled slot with audit logging.

---

## 2.13 Summary of Confirmed Decisions

| # | Decision Item | Confirmed Institutional Rule | Reference |
| :--- | :--- | :--- | :--- |
| **1** | Student ID Uniqueness & Permanence | Globally unique, permanent, immutable across promotions and email changes; dual-mode support (import & auto-gen). | §2.4 |
| **2** | Account Activation via Gmail | Mandatory Firebase Auth email verification; student sets own password; zero default credentials. | §2.5A |
| **3** | Activation Link Expiration | Exactly 48 hours from dispatch; single-use token invalidated on redemption or reissuance. | §2.5A |
| **4** | Minimum Password Length | Exactly 12 characters minimum enforced server-side with 4 character classes. | §2.5A |
| **5** | Bulk Import File Formats | CSV (.csv) and Excel (.xlsx) two-stage preview & commit with formula injection sanitization. | §2.6 |
| **6** | Per-Course Academic Structure | Each course independently owns its years, semesters, section counts, and student cohorts. | §2.2B |
| **7** | Section Capacity | Baseline 60–80 students per section, strictly enforced on single enroll, bulk commit, and transfer. | §2.2C |
| **8** | Student Scale & Scalability | 4,165+ students initially; architecture scalable to 10,000+ students without schema redesign. | §2.1 |
| **9** | Non-Destructive Transfers | Section transfers archive previous enrollment as `TRANSFERRED`, retaining historical roll calls and marks. | §2.2E |
| **10** | Immediate Suspension Enforcement | Account suspension immediately revokes sessions and middleware blocks API requests with HTTP 403 `ACCOUNT_DEACTIVATED`. | §2.5B |
| **11** | Master Timetable Conflict Engine | Prevents faculty clashes and room double-booking (HTTP 409 Conflict); supports parallel practical lab subgroups (`C1`/`C2`). | §2.12 |
| **12** | Technology Ecosystem | **Google Firebase & Google Cloud Platform exclusive.** Cloud Run, PostgreSQL via Firebase Data Connect, Cloud Tasks, Secret Manager. No AWS. | §2.1, §2.7 |
