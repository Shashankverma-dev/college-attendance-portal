# 4. UI/UX Reference and Screen Specification

**Version:** 2.2.0 — Multi-School Academic Hierarchy, Master Timetable Management & Conflict Engine, Real-Life Double-Submission Defense, Complete Role-Based Access Control, and Comprehensive Automated QA Release  
**Date:** 24 October 2026  
**Status:** Implemented & Verified in Codebase

---

## 4.1 Reference Style — Slate & White Hybrid (Option D) & Brand Colour Lock

The College Attendance Management System implements the **Slate & White Hybrid Theme (Option D)** with permanent **Brand Colour Protection**:
- **Critical Brand Colour Lock:** The official primary brand colour `#1D3C72` is permanently locked and immutable. Main page background, navbar headers, brand marks, and primary buttons use this exact hexadecimal value.
- **Surface Architecture:** Clean white content surfaces (`#FFFFFF`) against the institutional `#1D3C72` background with subtle slate-blue borders (`#D7E3F0`).
- **Complementary System:** Secondary statistic panels (`#F1F5F9`), table header backgrounds (`#E8EEF5`), and grounding deep footer (`#13284C`).
- **Typography & Hierarchy:** Dark navy primary text on light cards (`#17345C`), muted slate labels (`#64748B`), and crisp white text on outer dark surfaces (`#FFFFFF`). Barlow font family across all headings, body text, data tables, and input elements.
- **Semantic Indicators:** Institutional green for compliant/present (`#15803D`, background `#DCFCE7`), red for absence/error (`#DC2626`, background `#FEE2E2`), amber for approved leave/warnings (`#D97706`, background `#FEF3C7`), and informational percentage accent (`#1685E8`).
- **Form Controls & Buttons:** Crisp rectangular controls (`border-radius: 4px`), strictly avoiding pill shapes or exaggerated radii.
- **Strict Visual Discipline:** High-contrast, clean academic layouts without purple gradients, cursor animations, fake metrics, or over-the-top motion.
- **Complete Responsive Support:** Desktop, tablet, and mobile layouts with accessible touch targets, horizontal scroll containment, and keyboard navigation.

---

## 4.2 Comprehensive Screen Inventory

### A. Public & Authentication Screens
1. **Landing Page (`index.html`):** Public portal introducing the college attendance system, featuring example register illustration, role cards (Student, Faculty, Administrator), institutional notice, and footer navigation.
2. **Sign In (`signin.html`):** Role-based authentication interface routing users automatically based on authenticated claims:
   - `GLOBAL_ADMIN` -> `admin.html`
   - `HOD` -> `admin.html` (scoped to department)
   - `FACULTY` -> `teacher.html`
   - `STUDENT` -> `student.html`
   Displays alert banners when redirected with session expiration or account suspension reasons.
3. **Account Activation / Password Definition (`activate.html` / In-Modal):** Accessed via secure 48-hour email activation link. Validates token, displays student identity confirmation, and presents password definition fields (minimum 12 characters, 4 character classes).
4. **Privacy Policy (`privacy.html`) & Terms of Service (`terms.html`):** Formal institutional data protection, statutory attendance rules, and acceptable use policies with authenticated return navigation.

---

### B. Administrator Portal Screens (`admin*.html`)

1. **Institutional Operations Dashboard (`admin.html`):**
   - **Header & College Insignia:** Swami Rama Himalayan University identity with quick profile dropdown.
   - **4 Live KPI Cards:** Total Matriculated Students (`4,165`), Active Faculty Count, Today's Conducted Sessions & Lock Status, and Campus Average Attendance Rate (`92.4%`).
   - **Operations Hub:** Direct navigation cards to Student Management, Teacher Directory, Master Timetable, Final Marks Console, and Academic Calendar.
   - **Department Compliance & Timeliness Table:** Monitors departmental performance across conducted sessions, pending locks, submission timeliness %, and overall compliance %, displaying explicit `UNCONFIGURED` badges for unmapped departments.
   - **SHA-256 Linear Audit Chain Modal:** Inspects cryptographic hash chain ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{payload}_i)$), displaying block height, actor, target entity, timestamp, IP, and verification status.

2. **Student Management Console (`admin-students.html`):**
   - **Live Metric Strip:** Total Matriculated, Active Enrolled, Pending Activation, and Suspended Accounts.
   - **Cascading Hierarchy Filter Bar:** School / College, Academic Year, Course / Programme, Semester, Section, and Account Status.
   - **Debounced Search Bar:** Full-text search matching Student ID, Full Name, Gmail, or Roll Number.
   - **Student Roster Table:** Checkbox selection, Student ID, Full Name, Email, Course, Semester, Section, Roll No, Status Pill Badge (`ACTIVE`, `PENDING_ACTIVATION`, `SUSPENDED`), and Actions Menu.
   - **Add Single Student Modal (`#addStudentModal`):** Capacity-guarded enrollment, generating 48-hour cryptographic token and dispatching activation email.
   - **Two-Stage Bulk Import Modal (`#bulkImportModal`):**
     - Download Sample Template (.csv and .xlsx).
     - Drag-and-drop file upload zone (max 10 MB).
     - Stage 1 Preview: Sanitizes formula injection (`'`, `=`, `+`, `-`, `@`), normalizes headers, checks within-file & database duplicates, and checks section capacity.
     - Stage 2 Commit: Atomic transactional database commit and email queueing.
   - **Transfer Section Modal (`#transferModal`):** Non-destructive section transfer archiving prior enrollment as `TRANSFERRED` while retaining historical attendance and marks.
   - **Reissue Activation Link Modal (`#reissueModal`):** Invalidates prior tokens, creates new 48-hour token, and re-dispatches email.
   - **Account Suspension Modal (`#suspendModal`):** Toggles account state with mandatory justification; terminates active device sessions and blocks API access.
   - **Student Deletion Modal (`#deleteStudentModal`):** Permanent purge tracking to prevent ghost resurrection.

3. **Master Timetable Management Console (`admin-timetable.html`):**
   - **5 Core Operational Tabs:**
     - **Tab 1: Weekly Schedule Grid:**
       - Filter by School, Programme, Semester, Section, Academic Year, and Term.
       - Weekly scheduling grid (Monday–Saturday, 09:00–17:00).
       - Color-coded Lecture and Laboratory Practical cards with parallel subgroup indicators (`C1`/`C2`).
       - Add/Edit Period Slot Modal with dynamic real-time conflict detection:
         - Teacher Collision Prevention (`TEACHER_OVERLAP`).
         - Room Double-Booking Prevention (`ROOM_OVERLAP`).
         - Section Overlap Prevention (`SECTION_OVERLAP`).
         - Parallel Practical Subgroups Exemption (`C1` and `C2` in separate labs with separate teachers succeed with 0 conflicts).
       - Delete Slot Modal with audit tracking.
     - **Tab 2: Academic Entities:**
       - Full CRUD management of Schools / Constituent Colleges, Academic Departments, Degree Programmes / Courses, and Academic Semesters with deletion persistence.
     - **Tab 3: Classrooms & Laboratories (Rooms):**
       - Classroom and laboratory inventory management (Room Code, Name, Capacity, Room Type). Code uniqueness validation and deletion persistence.
     - **Tab 4: Sections & Batches:**
       - Manage sections under semesters with capacity limits (60–80 baseline).
       - Practical Subgroups (`C1`, `C2`) created under sections for laboratory split scheduling.
     - **Tab 5: Timetable Settings & Clear Schedule:**
       - Period slot duration configurations (times, breaks).
       - Clear Schedule feature: Clear section schedule or clear all schedules with confirmation, without resurrecting mock schedules.
   - **Spreadsheet Timetable Ingest:** Upload timetable Excel/CSV (e.g. `BCA (V-C).xlsx`) with faculty abbreviation mapping and `UNRESOLVED` warning banners.

4. **Teacher Portal Management Console (`admin-teachers.html`):**
   - **Live Metric Strip:** Total Faculty, Active Teachers, Pending Activation, and Academic Departments.
   - **Search & Filter Bar:** Search by Name, Staff ID, Email; filter by Department and Status; pagination.
   - **Provision Faculty Modal (`#addTeacherModal`):** Full Name, unique Staff ID, official `@college.edu` email, Department, and Designation. Dispatches 48-hour activation link.
   - **Teaching Allocations Modal (`#allocationModal`):** Assign Course, Semester, Section, and Subject with semester compatibility validation.
   - **Edit Faculty Modal (`#editTeacherModal`):** Modify personal profile and contact information.
   - **Account Access Control Modal (`#accessControlModal`):** Transition status (`ACTIVE`, `SUSPENDED`, `INACTIVE`) with mandatory justification, immediately revoking refresh tokens and sessions.
   - **Faculty Profile Drawer (`#profileDrawer`):** Slide-out drawer displaying teaching workload, history, and status.
   - **CSV Export:** One-click roster export.

5. **Examination Marks Management Console (`admin-marks.html`):**
   - Assessment verification console, assessment component tracking (CIA-1, CIA-2, Theory, Practical).
   - Grade review sheets, verification cycles, and spreadsheet marks ingestion.
   - Result Finalization & Publishing: Officially publishes results, unlocking visibility in student portals.

---

### C. Faculty Portal Screens (`teacher*.html` & `past-registers.html`)

1. **Faculty Live Roll-Call Register (`teacher.html`):**
   - Class selector for assigned Course, Semester, Section, and Subject (enforced server-side).
   - Today's Class Session banner: Topic, instructional hours, room, date.
   - Interactive student roster: Roll number, student photo card, full name, Student ID, and status toggles (`P` - Present, `A` - Absent, `L` - Approved Leave).
   - Bulk toggles: "Mark All Present", "Clear All".
   - One-Time Submission Locking: Once submitted, register status transitions to `LOCKED`. Direct in-place edits are disabled.
   - **Dynamic Rolling QR Code Attendance Mode:**
     - Toggle dynamic QR check-in display on classroom projector/screen.
     - Automatically refreshes signed cryptographic token every 15-30 seconds.
     - Live student scan counter and roster synchronization.

2. **Past Submitted Registers & Corrections Hub (`past-registers.html`):**
   - Multi-parameter filter bar (Course, Section, Subject, Date Range, Search).
   - Historical registers log displaying Conducted Date, Subject, Section, Total Students, Present/Absent counts, and Status (`LOCKED` or `MODIFIED (AUDITED)`).
   - **Edit Past Attendance Modal:**
     - Select student status toggles (`P`, `A`, `L`).
     - Mandatory correction classification (Clerical Error, Medical Leave, Approved Duty, Administrative Adjustment).
     - Mandatory faculty audit notes.
     - Transitions session status to `MODIFIED (AUDITED)` and generates SHA-256 linear hash chain audit entry.

3. **Marks Entry Console (`teacher-marks.html`):**
   - Class selector based on active teaching allocations.
   - Assessment creator: Assessment Name, Type (CIA-1, CIA-2, Mid-Term, Practical), Max Marks, Weightage %. Protected by double-click idempotency defense.
   - Student marks entry grid with range validation (0 <= score <= maxMarks; blocks negative or excessive marks).
   - Bulk score save executing atomic upserts (updating existing scores without creating redundant score rows).
   - "Submit to Admin" action to freeze marks and submit for administrative review.

---

### D. Student Portal Screens (`student*.html`)

1. **Student Attendance Portal (`student.html`):**
   - Header with student profile summary (Name, Student ID, Roll No, Section, Program).
   - Overall Attendance KPI Card with statutory 75% threshold badge (`Compliant`, `At Risk`, `Severe Shortage`).
   - Subject-wise Attendance Breakdown Cards: Progress bars color-coded by institutional thresholds (Green >= 75%, Amber 65-74%, Red < 65%).
   - Monthly Attendance Calendar Heatmap: Visual monthly calendar showing daily attendance state.
   - Chronological Session History with subject and date filtering.
   - **Request Attendance Correction Modal:**
     - Submit dispute within 5 days of conducted session.
     - Select session, claimed status (`P` or `L`), reason category, narrative description.
     - Upload supporting document (Medical certificate, duty sanction, up to 10 MB in Cloud Storage for Firebase).
   - **Mobile Touchless QR Check-in Scanner:**
     - Built-in camera scanner to check in via faculty's classroom QR code.
     - Validates cryptographic token, proximity/session active window, and section enrollment match (prevents Section A student from scanning Section B).

2. **Student Examination Marks Portal (`student-marks.html`):**
   - Term / Semester selector.
   - Grade Sheet Table: Subject Code, Subject Name, Credits, CIA-1, CIA-2, End-Sem Theory, Practical, Total Marks, Letter Grade.
   - Aggregate SGPA / CGPA calculations.
   - Result Publication Status: Strictly displays only **PUBLISHED** assessments. Draft or pending assessments are hidden.
   - Printable Grade Card / Export PDF button.

---

### E. Universal / Shared Screens (`calendar.html` & `profile.html`)

1. **Academic Calendar (`calendar.html`):**
   - **3-Way View Toggle:** Full Year 12-Month interactive grid, Dynamic Single-Month view with month zoom and Prev/Next controls, and Filterable Agenda milestone list.
   - **5-Tier Audience Targeting:** Scoped to Institution-wide, Course, Academic Year, Semester, and Section.
   - Category badges: Examinations (`EXAM` - red), Holidays (`HOLIDAY` - amber), Deadlines (`DEADLINE` - navy), Vacations (`VACATION` - purple), College Events (`EVENT` - teal).
   - Total instructional days counter (214 teaching days).
   - Administrator Event Management Modal: Create, edit, reschedule, and delete events.

2. **Unified User Profile Portal (`profile.html`):**
   - **Role-Segregated Presentation:**
     - Student: Academic program, semester, section, permanent Student ID (read-only/immutable); editable phone, guardian contact, blood group.
     - Faculty: Department, designation, cabin location, office extension, active teaching allocations.
     - Global Administrator: Administrative scope (`GLOBAL_ADMIN`), institution affiliation, audit oversight authority badge.
   - **Account Security:**
     - In-modal Password Change: Requires current password confirmation, enforces 12+ characters, 4 character classes, live strength validation checklist.
     - Account-wide session revocation on password update.
   - **Active Device Session Management:**
     - Table of logged-in devices: Browser / OS, IP address, Last active timestamp, Current Device indicator.
     - Per-device revocation: User can terminate a specific remote device session (`LOGGED_OUT_DEVICE`) without logging out the current device.
   - **Role-Safe Navigation:** Header "Dashboard" link dynamically resolves to `admin.html` for Admin/HOD, `teacher.html` for Faculty, and `student.html` for Student.
