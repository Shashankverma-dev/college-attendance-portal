# 2. Product Requirements Document (PRD)

**Version:** 2.2.0 — Multi-School Academic Hierarchy, Master Timetable Management & Conflict Engine, Real-Life Double-Submission Defense, Complete Role-Based Access Control, and Comprehensive Automated QA Release  
**Date:** 24 October 2026  
**Status:** Active Implementation & Baseline Specification

---

## 2.1 Product Concept and Institutional Purpose

A browser-based College Attendance Management and Academic Information Portal designed to provide auditable, real-time attendance recording, student academic visibility, 5-tier targeted academic calendar scheduling, master timetable management, institutional compliance monitoring, examination marks governance, and a robust user identity and account lifecycle subsystem. The portal accommodates multi-school institutions with configurable academic structures, individual and two-stage bulk student account provisioning, 48-hour cryptographic account activation, server-enforced authorization, and strict role-based access control.

The system is engineered to handle an initial population of **4,165+ matriculated students** and **~55 to 70 active class sections**, with an underlying architecture sized to scale smoothly to **10,000+ students** without restructuring data models, indexing strategies, or background queue systems.

**Technology Mandate:** The entire application, database, authentication, storage, and background processing pipeline is hosted strictly on **Google Firebase and Google Cloud Platform (GCP)**. All references to AWS and Amazon SES remain strictly excluded from the architecture. Primary brand color `#1D3C72` is universally preserved across all interfaces and documentation.

---

## 2.2 Academic Structure and Hierarchy

### A. Required 7-Tier Institutional Hierarchy
The system strictly enforces the following organizational structure:

```
School / Constituent College -> Department -> Course / Programme -> Academic Year -> Semester -> Section -> Practical Subgroups (C1/C2) -> Students
```

Every tier is managed independently by administrators while maintaining strict relational integrity, composite foreign key constraints, deletion persistence, and zero cross-course data leakage across the entire academic pipeline.

### B. Multi-School and Program Configurability
Each academic school (e.g., Himalayan School of Science & Technology, Himalayan College of Nursing) contains designated departments, each offering independent degree programmes/courses that independently own their academic years, semesters, sections, practical subgroups, and student cohorts.

1. **BCA (Bachelor of Computer Applications):**
   - Duration: 3 Academic Years (6 Semesters total).
   - BCA Year 1: Semester 1 (sections A, B, C, D) and Semester 2 (sections A, B, C).
   - BCA Year 2: Semester 3 (sections A, B, C, D) and Semester 4 (sections A, B, C).
   - BCA Year 3: Semester 5 (sections A, B, C) and Semester 6 (sections A, B, C).
2. **B.Tech (Bachelor of Technology):**
   - Duration: 4 Academic Years (8 Semesters total).
   - Each academic year contains 2 semesters, each with independent section allocations.
3. **Other Academic Programs (BBA, B.Sc, M.Tech, MCA, etc.):**
   - Fully customizable program duration, academic years, semesters per year, and per-semester section allocations.
   - Administrators can add, archive, or delete entities as institutional offerings evolve without impacting existing historical records.

### C. Section Capacity and Allocation — Confirmed (60–80 Baseline)
- Section counts are configured independently for every semester within every course.
- Section capacity is configurable per section, with an institutional baseline operating range of **60 to 80 students per section**.
- Administrators configure a maximum capacity limit (`max_capacity`) for each section upon creation.
- A student belongs to exactly one active section per semester.
- **Enforced Capacity Check:** Enrolling a student into a section that has reached maximum capacity triggers an explicit administrative capacity rejection (HTTP 409 Conflict) and blocks enrollment on single creation, two-stage bulk import, and section transfers.

### D. Practical Subgroup Splitting (`C1` / `C2`)
- For laboratory practicals, sections are partitioned into laboratory subgroups (`C1` and `C2`).
- The timetable scheduler allows parallel practical sessions for disjoint subgroups belonging to the *same section* in different laboratory rooms with different instructors at the same time slot with zero conflict violations.

### E. Relational Linking Rules
- **Departments:** Established under a specific School/College.
- **Courses / Programmes:** Offered under a specific Department and School.
- **Subjects:** Linked to a specific Course, Academic Year, and Semester.
- **Sections:** Created under a specific Course, Academic Year, and Semester.
- **Faculty Teaching Assignments:** Explicitly binds an approved Faculty Member to a specific Course, Academic Year, Semester, Section, and Subject for an active academic calendar term.
- **Attendance Sessions:** Instantiated exclusively for an assigned Faculty Member, Section, and Subject for a designated date, time slot, and instructional hour count.
- **Student Enrollment:** Students are enrolled into a specific Course, Year, Semester, and Section with a unique section-level roll number.

### F. Cohort Promotion and Non-Destructive Section Transfers
- The system supports advancing students between semesters and academic years (e.g., advancing BCA Year 1 Semester 2 students to BCA Year 2 Semester 3).
- **Non-Destructive Section Transfers:** When an administrator transfers a student between sections within a semester (e.g., BCA Sem 1 Sec A -> Sec B), the system archives the prior enrollment record with status `TRANSFERRED` and an `effective_date`. A new `ACTIVE` enrollment record is created for the destination section.
- **Historical Data Preservation:** All previous attendance roll-call records (`P`, `A`, `L`), conducted sessions, and examination marks remain permanently attributed to the original section. Cumulative attendance calculations correctly aggregate records across both sections if required by institutional policy.

---

## 2.3 User Roles and Identity Specifications

### A. Role Matrix Overview

| Feature / Module | GLOBAL_ADMIN | HOD (Dept Scope) | FACULTY | STUDENT |
| :--- | :---: | :---: | :---: | :---: |
| **Institutional Dashboard & KPIs** | Full (Global) | Department Scope | No (403) | No (403) |
| **Manage Schools, Depts, Programmes** | Full CRUD | View (Dept) | No (403) | No (403) |
| **Master Timetable & Conflict Engine** | Full CRUD | View (Dept) | View Assigned | View Enrolled |
| **Classrooms & Laboratories (Rooms)** | Full CRUD | View Only | View Only | No (403) |
| **Clear Timetable Schedules** | Yes | No (403) | No (403) | No (403) |
| **Student Roster & Single Add** | Full CRUD | View (Dept) | View Assigned | No (403) |
| **Two-Stage Bulk Import Students** | Yes | No (403) | No (403) | No (403) |
| **Non-Destructive Section Transfer** | Yes | No (403) | No (403) | No (403) |
| **Reissue 48h Activation Link** | Yes | Yes (Dept Scope) | No (403) | No (403) |
| **Suspend / Inactivate Accounts** | Yes (Global) | Recommend | No (403) | No (403) |
| **Delete Student (Permanent Purge)** | Yes | No (403) | No (403) | No (403) |
| **Faculty Provisioning & Allocations** | Full CRUD | Allocations (Dept) | No (403) | No (403) |
| **Live Classroom Roll Call** | No (Audit Only) | No (Audit Only) | Yes (Assigned) | No (403) |
| **Dynamic Rolling QR Attendance** | No | No | Yes (Generate) | Yes (Scan Check-in) |
| **Past Registers Hub & Audited Edit** | View All | View (Dept) | Yes (Assigned) | No (403) |
| **Marks Entry Console (CIA / Exams)** | No | Oversight (Dept) | Yes (Assigned) | No (403) |
| **Verify & Publish Exam Marks** | Yes (Global) | Review (Dept) | Submit Only | View Published Only |
| **Personal Attendance & Heatmap** | No | No | No | Yes (Own Only) |
| **Attendance Correction Request** | Authorize | Authorize (Escalated) | Review (Clerical ≤24h) | Submit (≤5 days) |
| **Academic Calendar Governance** | Full CRUD (All Tiers) | View / Suggest | View | View |
| **Cryptographic Hash Chain Audit** | Full Inspection | Department Logs | No (403) | No (403) |

### B. Role-Specific Profile Specifications

#### 1. Student Profile
- **Student ID / Registration ID:** Unique, permanent institutional identifier (e.g., `STU-2026-0001` or university admission number). Once assigned, the Student ID never changes regardless of Gmail address changes, section transfers, semester promotions, or course transfers.
- **Full Name:** Official student name as registered in college admission records.
- **Student Gmail Address:** Registered and verified Gmail address used for Firebase Authentication, system communication, account activation, and password recovery.
- **School, Course / Program, Semester, Section, Roll Number:** Academic positioning attributes.
- **Permitted Self-Edits:** Personal phone number, parent/guardian phone, blood group.
- **Immutable Attributes:** Student ID, Registration Number, Course, Semester, Section, and Enrollment Status cannot be altered by student.
- **Account Status:** `ACTIVE`, `PENDING_ACTIVATION`, `INACTIVE`, or `SUSPENDED`.

#### 2. Faculty Profile
- **Faculty ID / Staff ID:** Unique institutional staff identifier (e.g., `FAC-201`, `FAC-CS-108`). Permanent across tenure.
- **Full Name:** Official faculty name.
- **Official Email Address:** Institutional email (`@college.edu`) bound to Firebase Auth.
- **Department & Designation:** Primary academic department affiliation and academic rank.
- **Teaching Allocations:** Active mapping to assigned Courses, Subjects, Semesters, and Sections.
- **Permitted Self-Edits:** Cabin/office location, contact extension phone.

#### 3. Head of Department (HOD) Profile — Server-Enforced Department Scope
- **Staff ID:** Unique department head identifier (e.g., `HOD-CA-01`).
- **Official Email Address:** Institutional email address bound to Firebase Auth with `{ role: 'hod', departmentId: '...' }` custom claims.
- **Department Affiliation:** Explicitly bound to a single academic department (e.g., Department of Computer Applications).
- **Server-Enforced Scope:** Confined strictly to their designated department. Backend checks `course.department_id == user.department_id` on every protected endpoint. Any cross-department query or modification returns HTTP 403 Forbidden.

#### 4. Global Administrator Profile
- **Staff ID:** Unique administrative identifier (e.g., `ADM-001`).
- **Official Email Address:** Institutional administrative email bound to Firebase Auth with `{ role: 'admin' }` custom claim.
- **Designation:** Institutional office or title.
- **Role and Permissions:** Complete global institutional administrative capabilities.

---

## 2.4 Student ID — Confirmed Institutional Rules

1. **Uniqueness and Permanence:** Once assigned, a Student ID is permanent and immutable. It never changes under any circumstance, including Gmail address changes, section transfers, semester promotions, course transfers, or account status updates.
2. **Dual-Source Support:**
   - **Mode A — Institutional Import:** Administrator supplies pre-existing university registration numbers during bulk import or single-entry creation. The system validates uniqueness globally and persists the value verbatim.
   - **Mode B — Configurable Auto-Generation:** Where no pre-existing ID is provided, the system generates IDs using a configurable institutional format template: `[COURSE_CODE]-[ADMISSION_YEAR]-[ZERO_PADDED_SEQUENCE]` (e.g., `BCA-2026-0001`, `BTCS-2026-0042`).
3. **Institutional Identifier, Not a Secret:** Student IDs appear on printed class rolls, attendance registers, and official documents; they are not authentication secrets and must never be used as default passwords.
4. **Duplicate Prevention:** The database enforces a global uniqueness constraint on Student IDs across all courses, departments, and academic years.

---

## 2.5 Account Lifecycle and 48-Hour Cryptographic Activation

### A. Administrator-Created Student Accounts & Secure Activation
Student accounts are created exclusively by administrators through single entry or two-stage bulk spreadsheet import. Public unverified self-registration is strictly prohibited.

1. **Identity Provisioning via Firebase Admin SDK / Database:**
   - Profile record is created in the database with status `PENDING_ACTIVATION`.
   - Enrollment is created under the chosen course, semester, and section with roll number assignment.
2. **Secure 48-Hour Cryptographic Token Generation:**
   - System generates a cryptographically secure token using a CSPRNG with **256 bits of entropy** (`crypto.randomBytes(32).toString('hex')`).
   - Database stores exclusively the salted SHA-256 hash of the token (`token_hash`), along with `expires_at = NOW() + INTERVAL '48 hours'`, `consumed_at = NULL`, and `revoked_at = NULL`.
3. **Activation Email Dispatch:**
   - The email service dispatches an activation email containing the 48-hour activation link.
   - Dual-mode email architecture: dispatches via Google Workspace SMTP Relay in production, or logs to the stateful `LOCAL_SIMULATOR` dev queue in local/offline environments.
4. **Token Supersession on Reissuance:**
   - When an administrator reissues an activation link (`POST /api/admin/students/:id/reissue-activation`), the backend atomically revokes all previous unredeemed tokens for that student (`UPDATE activation_tokens SET revoked_at = NOW() WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`), then generates and dispatches a fresh 48-hour token.
5. **Single-Use Atomic Validation & Password Setting:**
   - When the student clicks the activation link and submits a new password, the backend verifies the token and consumes it atomically. If already redeemed, expired, or superseded, it immediately returns an explicit error.
   - On valid redemption, password is saved in Firebase Auth, `emailVerified` is set to `true`, and status transitions to `ACTIVE`.
6. **Password Policy Enforcement:**
   - Minimum 12 characters, requiring uppercase, lowercase, number, and special symbol.

### B. Immediate Account Suspension Enforcement Middleware
When an administrator suspends a student or faculty account (`PATCH /api/admin/students/:id/status` or `PATCH /api/admin/teachers/:id/status` with `status: 'SUSPENDED'`):
1. Account status is set to `SUSPENDED` in database, with mandatory audit justification.
2. Active sessions in `user_sessions` are immediately invalidated (`REVOKED`).
3. Authentication middleware (`auth.ts`) intercepts subsequent requests, rejecting them with HTTP 403 `ACCOUNT_DEACTIVATED`.

---

## 2.6 Two-Stage Bulk Student Registration Engine

1. **File Ingestion:** Accepts `.csv` and `.xlsx` files up to 10 MB.
2. **Formula Injection (CSV Injection) Sanitization:** Cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` are sanitized by prepending a single quote (`'`), neutralizing executable commands in spreadsheet software.
3. **Header Normalization:** Maps diverse header labels (`Full Name`, `studentId`, `Admission No`, `Email`, `Roll No`) to standard schema attributes.
4. **Stage 1 (Preview):** Returns structured preview with valid row count, duplicate in-file rows, duplicate in-database rows, syntax errors, and capacity overflow warnings.
5. **Stage 2 (Transactional Commit):** Administrator confirms import. Validated rows are committed in an atomic database transaction. Generates profiles, enrollments, roll numbers, 48-hour activation tokens, and dispatches activation emails.

---

## 2.7 Master Timetable Management & Conflict Engine (`admin-timetable.html`)

The Master Timetable console provides complete scheduling and academic structure governance across 5 primary tabs:

1. **Tab 1: Weekly Schedule Grid:**
   - Renders instructional schedule from Monday through Saturday, 09:00 to 17:00 (periods P1 through P8).
   - Distinct color-coded cards for Lectures and Laboratory Practical Subgroups (`C1`, `C2`).
   - Add/Edit Period Slot Modal with real-time conflict diagnostics.
2. **Tab 2: Academic Entities Management:**
   - Schools / Colleges: CRUD operations with dean assignment and entity description.
   - Academic Departments: CRUD operations linked to parent school with HOD assignment.
   - Programmes / Courses: CRUD operations with duration and total semester count.
   - Semesters: Add/manage active semesters with academic year and term binding.
   - Deletion persistence: Deleting an entity completely purges it and prevents resurrecting ghost records.
3. **Tab 3: Classrooms & Laboratories:**
   - Classroom and laboratory inventory management.
   - Room Code, Name, Capacity, Room Type (Lecture Hall, Computer Lab, Hardware Lab, Workshop, Seminar Room).
   - Code uniqueness validation and deletion persistence.
4. **Tab 4: Sections & Batches:**
   - Manage sections under semesters with capacity limits (60–80 baseline).
   - Practical Subgroups (`C1`, `C2`) created under sections for laboratory split scheduling.
5. **Tab 5: Timetable Settings & Clear Schedule:**
   - Period slot configuration (times, durations, break intervals).
   - Clear Schedule operations: Selective clearing of a section's schedule or clearing all schedules with confirmation, with zero resurrection of mock schedules.
6. **Conflict Detection Engine Rules:**
   - **Faculty Double-Booking (`TEACHER_OVERLAP`):** Rejects slot creation with HTTP 409 Conflict if assigned teacher is booked for another section during the same day and overlapping time.
   - **Room Double-Booking (`ROOM_OVERLAP`):** Rejects slot creation with HTTP 409 Conflict if assigned room is booked by another class during the same time interval.
   - **Section Overlap (`SECTION_OVERLAP`):** Rejects slot creation if the same section has simultaneous whole-class lectures.
   - **Parallel Practical Subgroups Exemption:** Parallel practical lab slots for `C1` and `C2` within the *same section* succeed with 0 conflicts if they have separate instructors and separate rooms.
7. **Excel / CSV Timetable Import:**
   - Upload master timetable file (e.g., `BCA (V-C).xlsx`).
   - Surfaces unmapped faculty abbreviations (`UNRESOLVED`) to prevent silent misallocation.
   - Provides downloadable sample timetable template.

---

## 2.8 Live Attendance, Dynamic QR Code & Audited Corrections

### A. Live Classroom Roll-Call Register (`teacher.html`)
- Faculty selects active Course, Semester, Section, and Subject (verified against active allocations).
- Roster renders active students with photos, roll numbers, names, and status toggles (`P`, `A`, `L`).
- Bulk actions: "Mark All Present", "Clear All".
- **One-Time Submission Locking:** Permanent locking upon submission. Direct in-place edits are disabled.
- **Double-Click Defense:** Rapid concurrent or repetitive submissions return the existing session idempotently without creating duplicate records.

### B. Dynamic Touchless QR Attendance Check-in
- Faculty generates rolling time-based QR code displayed on classroom projector/screen (refreshes every 15-30 seconds with signed cryptographic token).
- Students scan QR code using the mobile scanner in `student.html`.
- System verifies token validity, session active window, and student section enrollment (rejects Section B student scanning Section A).

### C. Dedicated Past Registers Hub & Audited Attendance Corrections (`past-registers.html`)
- Filter historical registers by Course, Section, Subject, and Date Range.
- Inspect conducted sessions, attendance counts, and locked roster.
- **Edit Past Attendance Modal:**
  - Modify student statuses (`P`, `A`, `L`).
  - Mandatory Correction Reason: Clerical Error, Medical Leave, Approved College Duty, Administrative Adjustment.
  - Mandatory Faculty Justification notes.
  - Transitions session status to `MODIFIED (AUDITED)`.
  - Records immutable row in `audit_logs` with SHA-256 linear hash chaining.

---

## 2.9 Examination Marks Governance

### A. Marks Entry Console (`teacher-marks.html`)
- Faculty creates assessments for assigned classes (CIA-1, CIA-2, Mid-Term Theory, Practical Exam, Semester Exam).
- Double-click idempotency defense prevents duplicate assessment creation.
- Score entry grid with range validation (0 <= score <= maxMarks; rejects negative or excessive marks).
- Bulk score save executes atomic upserts (updating existing scores without creating redundant score rows).
- "Submit to Admin" action freezes faculty draft and transmits to administration.

### B. Admin Examination Verification & Publishing (`admin-marks.html`)
- Administration reviews submitted marks, grade distributions, and verification cycles.
- Bulk marks spreadsheet ingestion.
- Final Result Publication: Unlocks student visibility. Students strictly cannot see draft or unverified marks.

### C. Student Marks Portal (`student-marks.html`)
- Scoped strictly to the authenticated student (STU-1 cannot query STU-2).
- Scoped strictly to published assessments (hides draft and submitted marks).
- Displays assessment breakdown, total marks, letter grades, SGPA/CGPA calculations, and printable grade card.

---

## 2.10 Centralized Academic Calendar with 5-Tier Audience Targeting (`calendar.html`)

- Centralizes official academic milestones, examination schedules, deadlines, statutory holidays, and recesses.
- **3-Way View Toggle:** 12-Month full year interactive calendar grid, dynamic single-month view with month zoom, and filterable agenda milestone list.
- **5-Tier Audience Hierarchy:** Institution-wide, Course, Academic Year, Semester, Section.
- **Independence from Attendance:** Calendar events represent informational schedules and never automatically mark or mutate attendance records.
- **Admin Event Management:** Authenticated modal for creating, updating, rescheduling, and deleting calendar events.

---

## 2.11 User Profile & Account Security (`profile.html`)

- **Dynamic Role-Specific Presentation:**
  - Student: Academic position (read-only), Student ID (immutable), editable phone and blood group.
  - Faculty: Department, designation, cabin location, office extension, teaching allocations.
  - Administrator: Scope (`GLOBAL_ADMIN`), institutional office, audit oversight authority badge.
- **Account Security:**
  - In-modal Password Change enforcing 12+ character complexity and 4 character classes.
  - Account-wide session revocation upon password change (`revokeRefreshTokens`).
- **Active Device Session Management:**
  - Active device inspection table with browser, IP, and last activity timestamp.
  - Per-device revocation: User can terminate a remote device session without logging out current device.
- **Role-Safe Navigation:**
  - Header and drawer "Dashboard" link dynamically resolves to `admin.html` for Admin/HOD, `teacher.html` for Faculty, and `student.html` for Student.

---

## 2.12 Summary of Confirmed Decisions

| # | Decision Item | Confirmed Institutional Rule | Reference |
| :--- | :--- | :--- | :--- |
| **1** | Multi-School Academic Hierarchy | 7-tier hierarchy with Schools, Departments, Programmes, Semesters, Sections, Practical Subgroups, Students. | §2.2A |
| **2** | Student ID Permanence & Uniqueness | Unique across institution; permanent across promotions and email changes; dual-mode support (import & auto-gen). | §2.4 |
| **3** | Account Activation via Gmail | Mandatory Firebase Auth email verification; student sets own password; zero default credentials. | §2.5A |
| **4** | Activation Link Expiration | Exactly 48 hours from dispatch; single-use token invalidated on redemption or reissuance. | §2.5A |
| **5** | Password Policy | 12 characters minimum enforced server-side with 4 character classes (upper, lower, digit, symbol). | §2.5A |
| **6** | Bulk Import File Formats | CSV (.csv) and Excel (.xlsx) two-stage preview & commit with formula injection sanitization. | §2.6 |
| **7** | Section Capacity | Baseline 60–80 students per section, strictly enforced on single enroll, bulk commit, and transfer. | §2.2C |
| **8** | Student Scale & Scalability | 4,165+ students initially; architecture scalable to 10,000+ students without schema redesign. | §2.1 |
| **9** | Non-Destructive Transfers | Section transfers archive previous enrollment as `TRANSFERRED`, retaining historical roll calls and marks. | §2.2F |
| **10** | Immediate Suspension Enforcement | Account suspension immediately revokes sessions and middleware blocks API requests with HTTP 403 `ACCOUNT_DEACTIVATED`. | §2.5B |
| **11** | Master Timetable Conflict Engine | 5-tab console; prevents faculty double-booking, room clash, section overlap; allows parallel practical lab subgroups (`C1`/`C2`). | §2.7 |
| **12** | Attendance Submission Locking | Register is locked on submission; edits require audited classification in Past Registers Hub (`past-registers.html`). | §2.8 |
| **13** | Double-Submission Defense | Rapid clicks on session creation, assessments, and marks execute idempotent returns and atomic upserts. | §2.8, §2.9 |
| **14** | Marks Visibility Policy | Students can strictly view PUBLISHED assessments; draft and submitted marks remain confidential to faculty and admin. | §2.9 |
| **15** | Technology Ecosystem | **Google Firebase & Google Cloud Platform exclusive.** Cloud Run, PostgreSQL via Firebase Data Connect, Cloud Tasks, Secret Manager. No AWS. | §2.1 |
