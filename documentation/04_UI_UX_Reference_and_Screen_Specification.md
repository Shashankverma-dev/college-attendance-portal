# 4. UI/UX Reference and Screen Specification

**Version:** 2.0.0 — Comprehensive Student Management, Academic Hierarchy, 48-Hour Cryptographic Activation, Two-Stage Bulk Import, Timetable Scheduler, and Master E2E QA Release  
**Date:** 20 October 2026  
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

### A. Public Screens
1. **Landing Page (`index.html`):** Public portal introducing the system, featuring example register illustration, role cards (Student and Teacher), institutional notice, and footer navigation.
2. **Sign In (`signin.html`):** Role-based authentication interface for Students, Faculty, and Administrators, with credential inputs and link to Password Recovery. Displays session-expiration alerts when redirected with `?reason=session_expired`.
3. **Account Activation / Password Setup (`activate.html`):** Accessed exclusively via secure 48-hour email activation link. Validates token, displays student identity confirmation, and presents password definition fields (minimum 12 characters, 4 character classes).
4. **Password Reset / Forgot Password (`forgot-password.html`):** Self-service credential recovery prompting for Student ID or registered Gmail address, dispatching time-limited reset links (30-minute expiration).
5. **Set New Password (`reset-password.html`):** Accessed via reset email token, validating single-use token and prompting for new password definition (minimum 12 characters).
6. **Privacy Policy (`privacy.html`) & Terms (`terms.html`):** Formal institutional data protection, attendance compliance, and acceptable use policies.

### B. Student Portal Screens
1. **Attendance Dashboard (`student.html`):** Real-time aggregate percentage, statutory 75% threshold badge, subject-wise attendance cards, chronological session logs, and "Request Attendance Correction" action button.
2. **Attendance Correction Request Modal (`#studentCorrectionModal`):** Form to dispute an absence or submit medical/duty leave within 5 days of session, including session selector, reason category, narrative explanation, and evidence file attachment (stored on Cloud Storage for Firebase, up to 10 MB limit).
3. **Examination Marks Portal (`student-marks.html`):** Semester-wise marks sheets, SGPA/CGPA calculations, verified publication dates, and download options.
4. **Unified User Profile Portal (`profile.html`):**
   - Single, secure, role-segregated profile interface dynamically rendering context based on authenticated session claims:
     - **Student Context (`Alex Chen`, `STU-101`):** Read-only academic enrollment parameters (Program, Semester, Section, Registration ID); permitted contact edits (Personal Phone, Guardian Phone, Blood Group); immutable student ID protection.
     - **Faculty Context (`Dr. Sarah Jenkins`, `FAC-201`):** Department, Designation, Cabin Location, Contact Extension, and Teaching Allocation summary.
     - **Global Administrator Context (`Prof. Arthur Vance`, `ADM-001`):** Administrative scope (GLOBAL_ADMIN), Swami Rama Himalayan University affiliation, audit oversight authority badge, and administrative suite contact info.
   - **Account Security & Session Governance:** In-modal Password Change enforcing 12+ character complexity, live requirements checklist, active device session inspection table, and per-device session revocation buttons.
   - **Role-Safe Navigation:** The "Dashboard" link in the header and mobile drawer dynamically maps to `admin.html` for administrators, `teacher.html` for faculty, and `student.html` for students, preventing cross-portal degradation.
5. **Academic Calendar (`calendar.html`):** Comprehensive academic scheduling interface featuring a 3-way view toggle: Full Year (12 Months) interactive calendar grid, dynamic Single-Month view with month zoom and Prev/Next controls, and filterable Agenda view (Examinations, Holidays, Deadlines, College Events).

### C. Faculty Portal Screens
1. **Today's Classes & Register (`teacher.html`):** Class selector for assigned Course, Semester, Section, and Subject; interactive student roster; bulk "Mark all Present" control; pre-submission verification and live summary; one-time session locking; and quick past registers overview with direct links to the dedicated hub.
2. **Past Submitted Registers & Attendance Corrections Hub (`past-registers.html`):** Dedicated page in Faculty Dashboard providing a complete historical registers log, multi-criteria filter bar (Course, Section, Date Range, Search), and an interactive **Edit Past Attendance Modal** allowing faculty to modify student attendance statuses (P/A/L), record mandatory institutional correction reasons and audit notes, view session audit trails, and update registers with `MODIFIED (AUDITED)` status.
3. **Marks Entry Console (`teacher-marks.html`):** Continuous internal assessment (CIA) and semester marks entry console with range validation, draft saving, and submission locking.

### D. Head of Department (HOD) Portal Screens (Department Scope)
1. **Department Overview Dashboard (`hod-dashboard.html`):** Department-scoped metrics (aggregate attendance, sections at risk, faculty marking timeliness), filterable strictly by courses and sections belonging to their department.
2. **Department Correction Authorization Queue:** Review and authorization screen for escalated student attendance corrections, medical leave applications, and duty leave approvals within the department.
3. **Department Faculty & Section Management:** View faculty teaching allocations, reassign substitute teachers for department classes, and inspect department-wide registers.

### E. Administrator Portal Screens
1. **Institutional Operations Dashboard (`admin.html`):** Real-time command center displaying 4 primary KPI cards (Total Students 4,165, Active/Pending Faculty, Today's Sessions & Lock Status, Campus Attendance Rate 92.4%), Quick Operations Hub routing to active administrative consoles, Department Timeliness & Compliance Table with explicit "Unconfigured" badges for unmapped departments, and interactive SHA-256 Linear Cryptographic Audit Chain verification modal.
2. **Student Management Console (`admin-students.html`):** Comprehensive student administration interface featuring:
   - 4 Live KPI metric cards (Total Matriculated, Active Enrolled, Pending Activation, Suspended Accounts).
   - Cascading filter bar (Academic Year, Course, Semester, Section, Status, Search).
   - Roster data table with status pill badges (`ACTIVE`, `PENDING_ACTIVATION`, `SUSPENDED`).
   - Add Single Student Modal with section capacity validation.
   - Two-Stage Bulk Import Modal (Stage 1 Preview with formula injection sanitization, Stage 2 Commit).
   - Transfer Section Modal with historical archiving.
   - Reissue Activation Link Modal with automatic prior token revocation.
   - Account Suspension Modal with mandatory justification and real-time session termination.
3. **Master Timetable Management Console (`admin-timetable.html`):** Visual scheduling interface featuring:
   - Weekly scheduling grid (Monday–Saturday, 09:00–17:00).
   - Filter bar (Academic Year, Course, Semester, Section).
   - Color-coded Lecture and Laboratory Practical cards with parallel subgroup indicators (`C1`/`C2`).
   - Add/Edit Timetable Slot Modal with dynamic teacher collision and room conflict detection.
   - Delete Slot Confirmation Modal with audit tracking.
4. **Teacher Portal Management Console (`admin-teachers.html`):** Faculty administration console with search, filtering, pagination, faculty provisioning, teaching allocations, account lifecycle transitions (`ACTIVE`, `SUSPENDED`, `INACTIVE`), and profile export.
5. **Marks Management Console (`admin-marks.html`):** Examination marks governance interface for reviewing and publishing subject assessment marks.
6. **Academic Calendar Management (`calendar.html`):** 12-month calendar governance, event scheduling with 5-tier audience targeting (College, Course, Year, Semester, Section).
7. **System Security & Linear Audit Log Modal:** Cryptographic linear SHA-256 hash chain verification modal inspecting sequential ledger integrity and tamper resistance.

---

## 4.3 Detailed Screen Layout Specifications

### A. Student Management Console (`admin-students.html`)
- **Header & Metric Strip:**
  - Page title: "Student Roster & Academic Enrollments" with college insignia.
  - 4 KPI cards: Total Students (`4,165`), Active Enrolled (`4,120`), Pending Activation (`35`), Suspended Accounts (`10`).
- **Academic Hierarchy Filter Bar:**
  - Cascading dropdowns: Academic Year (`2026-2027`), Course/Program (`BCA`, `B.Tech CSE`), Semester (`Semester 1` through `8`), Section (`Section A`, `Section B`).
  - Status filter (`All Statuses`, `Active`, `Pending Activation`, `Suspended`).
  - Search input with debounced listener matching Student ID, Name, Gmail, or Roll Number.
  - Action buttons: "Add Student" and "Bulk Import".
- **Student Data Table:**
  - Columns: Student ID, Full Name, Gmail Address, Program & Term, Section, Roll No, Status Badge, Actions (`⋮`).
  - Status Badges:
    - `ACTIVE`: `#15803D` text on `#DCFCE7` background.
    - `PENDING_ACTIVATION`: `#D97706` text on `#FEF3C7` background.
    - `SUSPENDED`: `#DC2626` text on `#FEE2E2` background.
  - Action Dropdown Items: Transfer Section, Reissue Activation Link, Suspend/Activate Account, View Details.
- **Two-Stage Bulk Import Modal (`#bulkImportModal`):**
  - **Stage 1 (Upload & Preview):**
    - Drag-and-drop file upload zone accepting `.csv` and `.xlsx` (max 10 MB).
    - Course and Section selector.
    - "Analyze & Preview" button.
    - Summary metrics banner: Total Rows, Valid Rows, Errors Found, Warnings.
    - Interactive preview table showing row status chips (`VALID` green, `DUPLICATE` red, `CAPACITY_EXCEEDED` red, `INVALID_EMAIL` amber).
    - Explanatory note: "Formula injection characters (=, +, -, @) are automatically neutralized."
  - **Stage 2 (Commit):**
    - "Commit Valid Rows" button (disabled if 0 valid rows).
    - Progress indicator and post-commit confirmation showing generated activation links count.
- **Transfer Section Modal (`#transferModal`):**
  - Displays current enrollment: Course, Semester, Current Section, Roll No.
  - Target Section dropdown showing real-time available capacity (`Section B (68/80 enrolled)`).
  - Transfer effective date picker.
  - Informational alert: "All past attendance marks and session registers will remain permanently attributed to Section A."
  - Action button: "Confirm Transfer".

### B. Master Timetable Management Console (`admin-timetable.html`)
- **Header & Scope Bar:**
  - Title: "Master Timetable & Weekly Schedule" with institutional `#1D3C72` branding.
  - Filter Bar: Academic Year, Course/Program, Semester, and Section selectors.
  - Legend: Lecture slot (Slate border, `#17345C` text), Practical Lab slot (Amber border, `#B45309` text), Conflict warning badge (Red border, `#DC2626`).
  - Action button: "Add Schedule Slot".
- **Weekly Schedule Grid:**
  - Day rows: Monday through Saturday.
  - Time columns: 09:00–10:00, 10:00–11:00, 11:15–12:15, 12:15–13:15, 14:00–15:00, 15:00–16:00, 16:00–17:00.
  - Slot Card Anatomy:
    - Subject Code & Name (e.g., `BCA-101: Programming in C`).
    - Faculty Name (e.g., `Dr. Sarah Jenkins`).
    - Classroom / Lab Room (e.g., `Lab 3` or `Room 204`).
    - Subgroup pill if applicable (`Batch C1` or `Batch C2`).
    - Action controls on hover: Edit (pencil icon), Delete (trash icon).
- **Add / Edit Slot Modal (`#slotModal`):**
  - Day of Week, Start Time, End Time.
  - Subject dropdown (filtered to active course/semester).
  - Faculty dropdown (shows assigned teacher).
  - Room / Laboratory input.
  - Session Type toggle: `LECTURE` or `PRACTICAL_LAB`.
  - Subgroup dropdown: `FULL SECTION`, `BATCH C1`, `BATCH C2`.
  - **Live Conflict Detection Banner:**
    - Appears dynamically if the selected faculty or room is occupied elsewhere during the selected time interval.
    - Displays exact collision detail: *"Teacher Collision: Dr. Sarah Jenkins is already scheduled for BCA Sem 3 Sec A in Room 102."*
  - Save button (disabled when active conflict is unresolved).

### C. Account Activation and First-Login Password Setup Screen (`activate.html`)
- **Header:** Clean institutional banner with college insignia and "Account Activation" title.
- **Identity Confirmation Card:** Displays read-only student details retrieved from the secure 48-hour token:
  - Name (e.g., *Alex Chen*)
  - Student ID (e.g., *STU-2026-0001*)
  - Registered Gmail Address (e.g., *alex.chen@gmail.com*)
  - Academic Affiliation (e.g., *BCA - 1st Year - Semester 1 - Section A*)
- **Password Setup Form:**
  - "Create Password" field with live strength validator.
  - "Confirm Password" field.
  - **Password Checklist:** 12+ characters, uppercase letter, lowercase letter, number, special character.
- **Action Button:** "Activate Account and Sign In" (navy rectangular button).
- **Error States:** Informative banners for *Expired Activation Link (48 hours exceeded)*, *Token Already Redeemed*, or *Token Revoked (Superseded by Administrator)*.

### D. Session Idle Timeout Pre-Expiration Modal
- **Trigger:** Displays at **minute 13 of user inactivity** (2 minutes prior to session expiration).
- **Modal Content:** High-contrast dialog with prominent countdown timer:
  *"Your session will expire in 01:59 due to inactivity. For your security on campus computers, unauthenticated sessions are automatically closed."*
- **Action Controls:**
  - Primary Button: "Stay Signed In" (dispatches heartbeat ping, resets idle timer, closes modal).
  - Secondary Link: "Sign Out Now" (immediately destroys session and redirects to signin).
- **Expiration Behavior:** Upon reaching 00:00, modal transitions to *"Session Expired"*, clears client storage, and redirects to `/signin.html?reason=session_expired`.
