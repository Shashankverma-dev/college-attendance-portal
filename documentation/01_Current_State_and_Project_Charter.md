# 1. Current State and Project Charter

**Version:** 2.2.0 — Multi-School Academic Hierarchy, Master Timetable Management & Conflict Engine, Real-Life Double-Submission Defense, Complete Role-Based Access Control, and Comprehensive Automated QA Release  
**Date:** 24 October 2026  
**Institution:** Swami Rama Himalayan University (SRHU)  
**Status:** Active Implementation & Baseline Specification

---

## 1.1 Project Purpose

Extend the existing Attendance Portal into an enterprise-grade college attendance management and academic administration system built entirely within the **Google Firebase and Google Cloud Platform (GCP)** ecosystem. The system enforces a strict 7-tier academic structure, provides role-segregated portals for students, faculty, administrators, and department heads, centralizes institutional scheduling via an audience-targeted Academic Calendar and weekly master timetable, and introduces a robust, secure user profile and account lifecycle system featuring administrator-governed student onboarding, 48-hour cryptographic account activation, server-enforced authorization, failure recovery between identity and relational databases, high-performance two-stage bulk registration for 4,165+ students, and real-life double-submission defense.

**Mandatory Technology Policy:** All infrastructure, data persistence, authentication, and background processing are hosted exclusively on Google Firebase and Google Cloud Platform. AWS and Amazon SES are strictly excluded from the architecture. Primary brand color `#1D3C72` is universally preserved across all interfaces and documentation.

---

## 1.2 Existing Reference Website & Implemented Portals

### Implemented Administrative & Operational Portals
- **Administrator Operations Dashboard (`admin.html`):** Central management console with real-time operational data (4,165 enrolled students, active faculty, today's conducted sessions, moving average attendance rate), administrative quick-actions, Department Compliance Table with unconfigured badging, and interactive SHA-256 Linear Cryptographic Audit Chain modal.
- **Student Management Console (`admin-students.html`):** Complete student roster management interface with multi-level academic hierarchy cascading filters (School, Academic Year, Course/Programme, Semester, Section, Status), search, pagination, Add Student modal with capacity enforcement, Two-Stage Bulk Import modal (Preview with CSV formula injection neutralization & Commit), Non-Destructive Section Transfer modal (archiving past records as `TRANSFERRED`), Reissue Activation Link modal (superseding prior tokens), Account Suspension modal (instantly revoking sessions and terminating access), and Student Deletion modal (permanent purge tracking to prevent ghost resurrection).
- **Master Timetable Management (`admin-timetable.html`):** Visual master schedule and academic structure management across 5 specialized tabs:
  1. *Weekly Schedule Grid:* Weekly grid rendering (Monday–Saturday, 09:00–17:00), conflict detection engine (detecting faculty double-booking, room collisions, and section clashes with HTTP 409 Conflict alerts), and support for parallel laboratory practical subgroups (`C1` and `C2`).
  2. *Academic Entities:* Full CRUD management of Schools / Constituent Colleges, Academic Departments, Degree Programmes / Courses, and Academic Semesters with deletion persistence.
  3. *Classrooms & Laboratories:* Classroom and lab room inventory management with code uniqueness validation.
  4. *Sections & Batches:* Section capacity management and practical laboratory subgroup creation (`C1`/`C2`).
  5. *Timetable Settings & Clear Schedule:* Configurable period duration slots, with selective section schedule clearing or complete timetable reset without resurrecting mock schedules.
- **Teacher Portal Management (`admin-teachers.html`):** Faculty management interface with full-text search, department and status filters, pagination, Provision Faculty modal (enforcing `@college.edu` emails and unique staff IDs), Teaching Allocations modal with semester compatibility enforcement, Edit Faculty details modal, Account Access Control modal (transitions `ACTIVE`, `SUSPENDED`, `INACTIVE` with instant session revocation and mandatory justification), Profile Inspection drawer, and CSV roster export.
- **Final Semester Examination Marks (`admin-marks.html`):** Administrative verification console for subject assessment components, grade review sheets, verification cycles, spreadsheet marks ingestion, result finalization, and institutional publication (strictly unlocking student visibility upon publication).

### Implemented Faculty Portals
- **Faculty Live Roll-Call Register (`teacher.html`):** Real-time classroom attendance roll-call interface with one-time locking, student photo cards, bulk toggles (`P`, `A`, `L`), dynamic rolling QR code attendance check-in generator (refreshes every 15-30s), and audit trail commitment.
- **Past Registers Hub & Attendance Corrections (`past-registers.html`):** Historical register search, multi-criteria filtering (Course, Section, Subject, Date Range), interactive status correction toggles, mandatory institutional correction classification (Clerical Error, Medical Leave, Approved Duty, Administrative), faculty justification audit logging, and linear hash chain updates.
- **Examination Marks Entry Console (`teacher-marks.html`):** Subject component marks entry, continuous internal evaluation (CIA-1, CIA-2), semester exams, range validation (0 <= score <= maxMarks), assessment creation with double-click defense, atomic bulk marks upsert, and submission to admin for publishing.

### Implemented Student Portals
- **Student Attendance Portal (`student.html`):** Student attendance records, subject-wise percentages, statutory 75% threshold badge and condonation status indicators, calendar attendance heatmap, mobile touchless QR code attendance check-in scanner (proximity, session window, and section enrollment validation), and correction request submission (within 5 days with 10 MB evidence upload).
- **Student Examination Marks (`student-marks.html`):** Semester-wise marks sheets, SGPA/CGPA calculations, verified publication dates, and download options. Scoped strictly to published assessments and strictly to authenticated student records.

### Shared & Foundation Portals
- **12-Month Academic Calendar (`calendar.html`):** Comprehensive academic calendar with 3-way synchronized view toggle (12-month full year grid, dynamic single-month zoom, filterable agenda list), teaching days count (214 days), term milestones, gazetted statutory holidays, 5-tier audience targeting (Institution, Course, Year, Semester, Section), responsive mobile navigation drawer, and administrative event scheduling modal.
- **User Profile & Account Security (`profile.html`):** Role-specific profile attributes (Student, Faculty, Global Admin), password policy enforcement (12+ characters, 4 character classes), active device session tracking, per-device revocation without terminating current device, and role-safe Dashboard navigation.
- **Sign-in & Authentication Portal (`signin.html`):** Role-based authentication entrypoint routing `GLOBAL_ADMIN` to `admin.html`, `HOD` to `admin.html` (department-scoped), `FACULTY` to `teacher.html`, and `STUDENT` to `student.html`.
- **Role-Safe Navigation Subsystem & Route Guards (`site.js`):** Client-side route guard engine intercepting unauthenticated access and cross-role degradation/escalation, dynamic header/drawer navigation rendering, and global click interception ensuring administrators navigating from Profile or auxiliary pages always land on `admin.html`.

---

## 1.3 Project Objectives

- Retain the reference website's visual simplicity, white background, black typography, Barlow font, rectangular controls, and clean layout with brand color `#1D3C72`.
- Enforce the 7-tier academic hierarchy: `School/College -> Department -> Course/Program -> Academic Year -> Semester -> Section -> Practical Subgroups -> Students`.
- Support multiple customizable courses (e.g., BCA 3-year, B.Tech 4-year) with independent per-semester section configurations and enforced capacity limits (baseline 60–80 students per section).
- Implement role-specific profiles for Students, Faculty, Administrators, and HODs adhering strictly to data minimization.
- Establish an administrator-governed student account creation workflow where accounts are provisioned with unique, permanent Student IDs and verified via registered Gmail addresses using **Firebase Authentication**.
- Provide a secure self-service password activation mechanism utilizing 48-hour cryptographically secure 256-bit tokens, rate limiting, single-use atomic consumption, automatic superseding upon reissuance, and zero plain-text credential storage.
- Support a robust Two-Stage Bulk Student Import workflow (Preview with Formula Injection sanitization, header normalization, and duplicate detection -> Transactional Commit).
- Provide non-destructive section transfers that preserve historical attendance roll calls and examination marks under prior sections with status `TRANSFERRED`.
- Enforce immediate session termination and backend API rejection (HTTP 403 `ACCOUNT_DEACTIVATED`) whenever an account is transitioned to `SUSPENDED` status.
- Guarantee persistent application-level idempotency for activation emails, background task retries, account activations, double-click submissions, and email changes, backed by durable database tracking.
- Document failure recovery and compensating reconciliation to handle partial transaction success between Firebase Authentication and Cloud SQL PostgreSQL during account activation or email updates.
- Implement an enterprise relational database on Google Cloud (**Firebase Data Connect backed by Cloud SQL for PostgreSQL**) ensuring strict relational integrity, composite constraints, and measurable performance SLAs.
- Mandate deep query execution plan reviews via `EXPLAIN (ANALYZE, BUFFERS)` to eliminate unjustified sequential scans on critical high-volume queries (`attendance_records`, `student_enrollments`, `audit_logs`).
- Enforce strict server-side authorization and PostgreSQL Row-Level Security (RLS) with trusted transaction-local context (`SET LOCAL`) and connection-pool isolation, validated against adversarial cross-department and cross-section test suites.
- Deliver reliable, one-time attendance register recording, preventing duplicate submissions and ensuring mathematical adherence to the institutional 75% attendance policy.
- Establish end-to-end attendance correction governance with student evidence uploads (stored on **Cloud Storage for Firebase** within a 10 MB limit), faculty review, HOD departmental authorization, and immutable audit logs with a linear cryptographic hash chain.
- Provide a visual Master Timetable management system with weekly grid rendering, conflict detection (faculty clash, room double-booking, section overlap), parallel lab practical subgroups (`C1` and `C2`), academic entity management, and clear schedule governance.
- Centralize scheduling through an Academic Calendar with 5-tier audience targeting (Institution, Course, Year, Semester, Section).

---

## 1.4 Implemented User Roles

- **Student:** Views personal subject-wise and term aggregate attendance, receives shortage warnings, reviews audience-scoped calendar events, sets and manages account password via 48-hour activation link, updates permitted personal contact details (phone, blood group), scans teacher's dynamic classroom QR code for attendance check-in, views published exam results and SGPA/CGPA, and submits attendance correction requests within 5 days with supporting evidence.
- **Faculty / Teacher:** Views assigned classes for the active term, marks and submits session registers with one-time locking, generates dynamic rolling QR codes for touchless check-in, accesses dedicated Past Registers Hub (`past-registers.html`) to review historical sessions and execute audited corrections, enters marks in the marks entry console (`teacher-marks.html`) with atomic upsert, submits grades to admin, and reviews relevant calendar notices. Faculty access is strictly confined to actively assigned sections and subjects.
- **Administrator (GLOBAL_ADMIN):** Oversees institution-wide operational metrics, manages multi-school and multi-department hierarchies, configures academic courses and sections with capacity limits, provisions and manages student accounts (single and two-stage bulk import), executes non-destructive section transfers, reissues activation tokens, manages account lifecycle states (`ACTIVE`, `SUSPENDED`, `INACTIVE`), configures master timetable schedules with conflict avoidance, manages classrooms and lab rooms, provisions faculty, verifies and publishes examination marks, inspects cryptographic audit chains, and configures calendar events.
- **Head of Department (HOD) — Departmental Scope:** Reviews departmental attendance health, incomplete registers, shortage summaries, authorizes escalated attendance correction requests (medical, college duty, >24h), manages faculty teaching allocations strictly within their academic department, and reviews department marks. Cross-department access is strictly prohibited and blocked server-side (`403 Forbidden`) and via PostgreSQL RLS.

---

## 1.5 Scope Status for Current Release (v2.2.0)

**Implemented and Verified:**
- Multi-school academic structure setup (Schools, Departments, Programmes, Semesters, Sections, Rooms, Groups) with deletion persistence and capacity controls (60–80 students baseline).
- Admin Operations Dashboard (`admin.html`) with real-time operational data, department compliance monitor, and SHA-256 hash chain verification modal.
- Student Management Console (`admin-students.html`) with search/filter/pagination, single student provisioning, two-stage CSV import, section transfers, token reissuance, account suspension, and student deletion tracking.
- Master Timetable Management (`admin-timetable.html`) with weekly grid, academic entities CRUD, classroom/lab room CRUD, sections/batches CRUD, clear schedule governance, and conflict detection.
- Teacher Portal Management (`admin-teachers.html`) with search/filter/pagination, provisioning, allocation, editing, access control, and CSV export.
- Universal responsive navigation bar, user avatar dropdown, and mobile navigation drawer.
- Dual-port local server listener active on ports 8080 and 5000 (`node dist/server.js`) with static asset serving and REST endpoints.
- Backend compute on Express/TypeScript enforcing server-side authorization and RBAC on every endpoint (`/api/admin`, `/api/auth`, `/api/attendance`, `/api/marks`, `/api/profile`, `/api/academic`).
- 48-Hour Cryptographic Account Activation system with 256-bit CSPRNG tokens, SHA-256 hashed storage, single-use atomic consumption, and automatic superseding.
- Two-Stage Bulk Import with Formula Injection sanitization, header normalization, duplicate detection, and transactional commit.
- Immediate account suspension enforcement via middleware (HTTP 403 `ACCOUNT_DEACTIVATED`).
- Live classroom roll call with one-time locking and dynamic rolling QR code generation.
- Dedicated Past Registers Hub (`past-registers.html`) with audited past attendance editing and reason classification.
- Marks Entry Console (`teacher-marks.html`) with assessment creator, double-submission defense (atomic upsert), and admin publishing workflow (`admin-marks.html`).
- Relational academic records and attendance marks supported by PostgreSQL (`schema.sql`, `seed.sql`) and stateful in-memory dual-mode repository for local offline operation.
- Automated test suites passing **217+ verified scenarios across all test suites** (100% pass rate).
- First-login self-service password creation workflow and password policy enforcement.
- Per-device session idle timeout (15 minutes) alongside account-wide token revocation on deactivation.
- Standard attendance percentage calculation (`Present / (Present + Absent) * 100`) and 75% cut-off alerts.
- Targeted Academic Calendar across 5 audience scopes (`calendar.html`).

**Deferred / Open for Future Cloud Provisioning Approval:**
- Production domain connection, SSL certificate provisioning, external SMTP relay batching for 4,165 live emails, and automated biometric/RFID hardware integrations.
