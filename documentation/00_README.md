# Attendance Portal — System Architecture & Technical Documentation

**Version:** 2.2.0 — Multi-School Academic Hierarchy, Master Timetable Management & Conflict Engine, Real-Life Double-Submission Defense, Complete Role-Based Access Control, and Comprehensive Automated QA Release  
**Date:** 24 October 2026  
**Institution:** Swami Rama Himalayan University (SRHU)  
**Basis:** Institutional Academic Requirements, Academic Hierarchy, and Google Cloud / Firebase Standards  
**System Status:** Active Implementation — Express/TypeScript Backend on Ports 8080 & 5000, Dual-Mode PostgreSQL / Stateful In-Memory Repository, Complete Production-Ready Portals, and 100% Automated Tests Passing (217+ Scenarios Verified)

---

## Executive Summary & System Purpose

This comprehensive technical documentation package defines the architectural, operational, security, and functional implementation for the College Attendance Management System. The portal transitions the college from paper-based or disjointed registers into a modern, auditable, high-performance web platform accommodating **4,165+ matriculated students** and scalable to **10,000+ students**, built entirely within the **Google Firebase and Google Cloud Platform (GCP)** ecosystem.

**Mandatory Technology Standard:** The system exclusively utilizes Google Firebase and Google Cloud infrastructure. All references to AWS and Amazon SES remain strictly excluded. Primary brand color `#1D3C72` is universally preserved across all interfaces and documentation.

---

### Core Implemented Architectural Pillars (v2.2.0)

1. **7-Tier Institutional Academic Hierarchy:**
   `School / College -> Department -> Course / Programme -> Academic Year -> Semester -> Section -> Practical Subgroups (C1/C2) -> Students`.
   Every tier is independently managed with strict relational integrity, composite foreign key constraints, and zero cross-course data leakage.
2. **Multi-School & Multi-Department Governance:**
   Administrators manage multiple schools (e.g., Himalayan School of Science & Technology, Himalayan College of Nursing), affiliated academic departments, and customizable degree programmes with full deletion persistence and zero ghost entity resurrection.
3. **Per-Course Independent Academic Hierarchy:**
   Every academic program (e.g., BCA 3-year/6-semester, B.Tech 4-year/8-semester) independently defines and owns its academic years, semesters, section counts, and student cohorts without data collision.
4. **Enforced Section Capacity Constraints (60–80 Baseline):**
   Sections enforce strict capacity limits configured upon creation (`max_capacity`, baseline 60–80). Capacity checks are executed and strictly enforced on single student creation, bulk spreadsheet ingestion, and section transfers. Overflows trigger an explicit `409 Conflict` error.
5. **Permanent Student Identification:**
   Globally unique, permanent Student IDs (`student_id`, e.g., `STU-2026-0001` or institutional admission roll numbers) decoupled from email addresses, section assignments, and semester cohorts. Database constraints enforce uniqueness at the institutional level.
6. **Non-Destructive Section Transfers:**
   When an administrator transfers a student between sections (e.g., Section A to Section B), the system archives the prior enrollment as `TRANSFERRED` with an effective timestamp and creates a new `ACTIVE` enrollment. All historical attendance roll calls, session registers, and examination marks remain permanently linked to the original section.
7. **48-Hour Cryptographic Account Activation:**
   Accounts are created in `PENDING_ACTIVATION` state. The backend generates 256-bit cryptographically secure pseudo-random tokens (`crypto.randomBytes(32)`), stores them exclusively as salted SHA-256 hashes (`token_hash`) with a 48-hour expiration window, and dispatches activation links. Token consumption is single-use and atomic. Reissuing an invitation automatically supersedes and revokes all previously issued active tokens. Activation requires a 12+ character password adhering to 4 character classes.
8. **Two-Stage Bulk Student Ingestion & Formula Sanitization:**
   - **Stage 1 (Preview):** Ingests CSV/Excel rosters, normalizes headers (`Full Name`, `Student ID`, `Email`, `Course`, `Semester`, `Section`, `Roll Number`), sanitizes against Formula Injection (CSV Injection) by prepending a quote to cells starting with `=`, `+`, `-`, `@`, `\t`, `\r`, detects within-batch and database duplicates, and validates section capacity.
   - **Stage 2 (Transactional Commit):** Commits validated rows in a database transaction, provisions student profiles and enrollments, generates activation tokens, and dispatches activation emails.
9. **Independent Account, Invitation, and Enrollment Lifecycles:**
   - **Account Status:** `PENDING_ACTIVATION` -> `ACTIVE` <-> `SUSPENDED` (or `INACTIVE`).
   - **Invitation Status:** `NOT_SENT` -> `SENT` -> `ACCEPTED` (or `EXPIRED`, `REVOKED`).
   - **Enrollment Status:** `PENDING` -> `ACTIVE` -> `TRANSFERRED` / `COMPLETED` / `WITHDRAWN`.
10. **Real-Time Account Suspension Middleware:**
    When an administrator suspends an account (`PATCH /api/admin/students/:id/status` or `PATCH /api/admin/teachers/:id/status`), the system immediately invalidates active sessions in `user_sessions`, and the backend authentication middleware (`auth.ts`) instantly intercepts subsequent requests, rejecting them with HTTP 403 `ACCOUNT_DEACTIVATED`.
11. **Dual-Mode Email Service Abstraction:**
    Pluggable email service supporting enterprise SMTP relay (Google Workspace SMTP relay) and a stateful development simulator (`LOCAL_SIMULATOR`) that records dispatched emails, activation tokens, and audit events without external network dependencies.
12. **Master Timetable & Conflict Engine (`admin-timetable.html`):**
    Visual master schedule management with 5 operational tabs:
    - **Weekly Schedule Grid:** Weekly grid rendering (Monday–Saturday, 09:00–17:00), supporting lecture classes and split laboratory practical subgroups (`C1` and `C2`).
    - **Academic Entities:** Full CRUD management of Schools, Departments, Programmes, and Semesters.
    - **Classrooms & Laboratories:** Room inventory management with duplicate code checks.
    - **Sections & Batches:** Section capacity limits and practical lab subgroups (`C1`/`C2`).
    - **Timetable Settings & Clear Schedule:** Configurable period times and selective or global schedule clearing.
    The backend validation engine prevents faculty double-booking (`TEACHER_OVERLAP`), room collisions (`ROOM_OVERLAP`), and section overlaps (`SECTION_OVERLAP`), returning HTTP 409 Conflict with precise collision diagnostics.
13. **Live Attendance Register, One-Time Locking & Dynamic QR Code:**
    Faculty roll-call marking with one-time locking. Once submitted, direct in-place edits are blocked. Includes touchless classroom QR code check-in with dynamic time-rotating tokens (15-30s refresh) and proximity/enrollment verification.
14. **Past Registers Hub & Audited Historical Attendance Corrections:**
    Dedicated hub (`past-registers.html`) with multi-criteria filtering. Faculty can inspect past sessions and launch the Edit Past Attendance modal to update statuses (`P`, `A`, `L`) with mandatory correction reason and audit notes, transitioning session to `MODIFIED (AUDITED)`.
15. **Continuous Internal Assessment & Examination Marks Governance:**
    Marks console supporting assessment creation (CIA-1, CIA-2, Theory, Practical), double-submission defense (atomic upsert preventing duplicate score records), out-of-bounds score prevention (0 <= score <= maxMarks), submission to admin, and administrative publication. Students strictly see published results.
16. **Centralized Academic Calendar with 5-Tier Audience Targeting:**
    Institutional calendar with 12-month full year grid, dynamic single-month zoom, and filterable agenda list. 214 instructional days, gazetted holidays, term milestones, and 5-tier audience filtering (Institution, Course, Year, Semester, Section).
17. **Linear Cryptographic Hash Chain Audit Governance:**
    Enforces audit log integrity via a **linear sequential cryptographic hash chain** ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{payload}_i)$) with automated daily integrity verification scripts and interactive admin modal inspection.
18. **Role-Safe Navigation Subsystem & Route Guard Architecture (`site.js` & `profile.html`):**
    Client-side route guard engine intercepting unauthenticated access and cross-role degradation/escalation. Global click interception ensures administrators navigating from Profile or auxiliary pages always land on `admin.html`.
19. **Dual-Mode Backend Execution:**
    Seamless transition between Cloud SQL PostgreSQL (production) and a stateful in-memory repository initialized from [`backend/db/seed.sql`](file:///u:/attendance%20app/backend/db/seed.sql) (local development), enabling instantaneous offline execution and 100% test reproducibility.

---

## Complete Role Breakdown & Permissions

| Role | Primary Scope | Permitted Features & Workflows | Access Restrictions & Boundaries |
| :--- | :--- | :--- | :--- |
| **GLOBAL_ADMIN** (Global Administrator) | Entire Institution across all Schools, Departments, Programmes | • Full Academic Hierarchy CRUD (Schools, Departments, Programmes, Semesters, Sections, Rooms, Groups)<br>• Master Timetable Grid & Conflict Engine (Create, Edit, Delete, Clear Schedules)<br>• Student Management: Provisioning, Two-Stage Bulk Import, Capacity Checks, Section Transfers, Reissue 48h Activation, Account Suspension/Deactivation, Permanent Deletion<br>• Faculty Management: Onboarding, Teaching Allocations, Profile Editing, Access Control (Suspend/Deactivate), CSV Export<br>• Examination Marks: Verification Console, Marks Ingestion, Result Finalization & Publishing<br>• Operations Dashboard: Live KPIs, Department Timeliness Table, SHA-256 Linear Audit Chain Inspection<br>• Academic Calendar: Create, Edit, Reschedule, Delete Events across all 5 audience tiers | Strictly prohibited from viewing or storing plaintext user passwords. Protected by multi-factor security and immutable audit trails. |
| **HOD** (Head of Department) | Designated Academic Department Scope | • Department Attendance Monitoring: Real-time departmental attendance health, incomplete registers, faculty submission timeliness<br>• Departmental Timetable: View and manage timetable slots within department<br>• Faculty Teaching Allocations: Assign and adjust faculty subject workloads within department<br>• Escalated Attendance Corrections: Authorize medical leave, college duty, and requests beyond 24h clerical window<br>• Departmental Marks Oversight: Review submitted internal assessments and semester exams prior to admin sign-off | Server-enforced boundary (`403 Forbidden`) on all entities outside assigned department. Blocked from global faculty deactivation, global school settings, and cross-department student data. |
| **FACULTY** (Teacher / Instructor) | Actively Assigned Sections & Subjects | • Live Classroom Roll-Call Register: Roll marking (`P`, `A`, `L`), bulk toggles, student photos, one-time submission locking<br>• Dynamic QR Code Attendance: Generates rolling time-based QR codes for classroom touchless student check-in<br>• Past Submitted Registers Hub (`past-registers.html`): Filter past sessions, inspect historical rosters, launch Edit Past Attendance modal with mandatory correction reason and audit notes<br>• Marks Entry Console (`teacher-marks.html`): Create assessments (CIA, Mid-Term, Practical), enter scores with range validation, draft auto-save, atomic upsert, submit marks to admin<br>• Academic Calendar: View institution and course-scoped events<br>• Profile & Security: Update cabin/office contact, change password, manage active device sessions | Blocked (`403 Forbidden`) from accessing unassigned sections, taking attendance for unallocated classes, modifying locked registers without audit classification, or accessing admin tools. |
| **STUDENT** (Enrolled Student) | Personal Academic Enrollment Profile | • Personal Attendance Portal (`student.html`): View real-time subject-wise percentages, 75% statutory threshold badge, shortage alerts, monthly calendar heatmap, session history<br>• QR Attendance Check-In: Scan teacher's rolling QR code (proximity & enrollment validation)<br>• Attendance Correction Filing: Submit dispute within 5 days with reason narrative and evidence upload (≤ 10 MB)<br>• Marks Portal (`student-marks.html`): View published marks, internal assessment grades, SGPA/CGPA calculations, download grade card<br>• Academic Calendar: View audience-scoped events, holidays, exam schedules<br>• Profile & Security: Update contact phone and blood group (institutional fields are immutable), change password, inspect active device sessions, remote session revocation | Blocked (`403 Forbidden`) from viewing other students' attendance or marks records, accessing draft/unpublished exam marks, modifying attendance records directly, or accessing faculty/admin portals. |

---

## Active Screen Inventory

| Screen File | Portal Scope | Implemented Functionality |
| :--- | :--- | :--- |
| [`admin.html`](file:///u:/attendance%20app/admin.html) | Global Admin / HOD | Operations Dashboard: Live KPIs (4,165 students, active faculty, today's registers, marks cycles), Operations Hub, Department Timeliness Table, SHA-256 Audit Chain Modal, and explicit Dashboard Overview dropdown navigation. |
| [`admin-students.html`](file:///u:/attendance%20app/admin-students.html) | Global Admin | Student Management: Academic hierarchy cascading filtering (School, Course, Year, Semester, Section), search, pagination, Add Student modal (capacity-guarded), Two-Stage Bulk Import modal (Preview with CSV injection neutralization & Commit), Section Transfer modal, Reissue Activation modal, Account Suspension modal, and Student Deletion modal. |
| [`admin-timetable.html`](file:///u:/attendance%20app/admin-timetable.html) | Global Admin / HOD | Master Timetable Management: 5 core tabs (Weekly Schedule Grid, Academic Entities, Classrooms & Labs, Sections & Batches, Timetable Settings / Clear Schedule), conflict detection alerts (faculty clash, room collision, section overlap), and parallel lab practical subgroups (`C1` & `C2`). |
| [`admin-teachers.html`](file:///u:/attendance%20app/admin-teachers.html) | Global Admin | Teacher Portal Management: Faculty roster search, filters, pagination, Provision Faculty modal, Allocation modal with semester compatibility, Edit modal, Access Control modal, Profile view, CSV export, and Dashboard Overview dropdown link. |
| [`admin-marks.html`](file:///u:/attendance%20app/admin-marks.html) | Global Admin | Final Examination Marks: Verification console, spreadsheet ingest, grade reviews, cycle status tracking, student result publishing, and Dashboard Overview dropdown link. |
| [`teacher.html`](file:///u:/attendance%20app/teacher.html) | Faculty | Live Register: Roll-call marking (`P`, `A`, `L`), bulk status toggles, student photos, register locking, dynamic QR attendance check-in generator, and audit commitment. |
| [`past-registers.html`](file:///u:/attendance%20app/past-registers.html) | Faculty / HOD | Past Registers & Corrections: Multi-criteria filter, locked session inspection, correction workflow with mandatory justification and linear hash logging. |
| [`teacher-marks.html`](file:///u:/attendance%20app/teacher-marks.html) | Faculty | Marks Entry Console: Assessment creation with double-click defense, subject marks entry, range validation guards, bulk score saves with atomic upsert, and submission to admin. |
| [`student.html`](file:///u:/attendance%20app/student.html) | Student | Attendance Portal: Subject-wise percentages, condonation status indicators, calendar attendance heatmap, mobile QR attendance check-in scanner, and correction request submission. |
| [`student-marks.html`](file:///u:/attendance%20app/student-marks.html) | Student | Marks Portal: Semester marks sheets, SGPA/CGPA calculations, verified publication dates, and download options. Displays published results strictly. |
| [`calendar.html`](file:///u:/attendance%20app/calendar.html) | Universal | Institutional Calendar: 12-month grid view, teaching days count (214 days), term milestones, statutory holidays, mobile drawer, and admin event scheduling modal. |
| [`profile.html`](file:///u:/attendance%20app/profile.html) | Universal (Role-Segregated) | User Profile & Security: Unified multi-role portal dynamically rendering context for Global Admin (`Prof. Arthur Vance`, `ADM-001`), Faculty (`Dr. Sarah Jenkins`, `FAC-201`), and Student (`Alex Chen`, `STU-101`), password policy enforcement, active device session inspection, per-device revocation, and role-safe Dashboard navigation. |
| [`signin.html`](file:///u:/attendance%20app/signin.html) | Universal | Authentication Portal: Role-based redirect routing (`GLOBAL_ADMIN -> admin.html`, `FACULTY -> teacher.html`, `STUDENT -> student.html`) with session clearance on landing. |
| [`privacy.html`](file:///u:/attendance%20app/privacy.html) & [`terms.html`](file:///u:/attendance%20app/terms.html) | Public / Universal | Statutory compliance, institutional data policy, and authenticated return-to-portal navigation. |

---

## Documentation Index

| File | Title | Description & Scope |
| :--- | :--- | :--- |
| [`01_Current_State_and_Project_Charter.md`](file:///u:/attendance%20app/documentation/01_Current_State_and_Project_Charter.md) | Current State and Project Charter | Implemented baseline assessment, institutional scope, core objectives, constraints, role specifications, and success criteria in the Google Firebase/GCP ecosystem. |
| [`02_PRD_Product_Requirements.md`](file:///u:/attendance%20app/documentation/02_PRD_Product_Requirements.md) | Product Requirements Document (PRD) | Complete functional requirements, 7-tier academic structure, user profiles, Firebase Auth Gmail lifecycle, bulk import, persistent idempotency, and screen requirements. |
| [`03_SRS_and_Acceptance_Criteria.md`](file:///u:/attendance%20app/documentation/03_SRS_and_Acceptance_Criteria.md) | Software Requirements & Acceptance Criteria | Granular functional requirements (FR-01 through FR-92), server-enforced authorization, expanded correction governance, role-permission matrix, and testable acceptance criteria (AC-01 through AC-65). |
| [`04_UI_UX_Reference_and_Screen_Specification.md`](file:///u:/attendance%20app/documentation/04_UI_UX_Reference_and_Screen_Specification.md) | UI/UX Reference & Screen Specification | Restrained academic design language, Slate & White Hybrid theme, brand colour `#1D3C72` lock, complete screen inventory, responsive layouts, unified role-segregated profile specification, navigation specifications, and component states. |
| [`05_Academic_Calendar_Specification.md`](file:///u:/attendance%20app/documentation/05_Academic_Calendar_Specification.md) | Academic Calendar Specification | Centralized institutional calendar, 5-tier audience targeting (Institution, Course, Year, Semester, Section), category management, 12-month full year grid, and strict separation from attendance records. |
| [`06_Data_and_Architecture_Requirements.md`](file:///u:/attendance%20app/documentation/06_Data_and_Architecture_Requirements.md) | Data & Architecture Requirements | Relational schemas (Schools, Departments, Programmes, Semesters, Sections, Rooms, Groups, Timetable, Attendance, Marks, Profiles), query plan profiling, transaction-local RLS, persistent idempotency schema, Cloud Tasks queueing, and admin REST API contracts. |
| [`07_Security_Privacy_and_Legal_Readiness.md`](file:///u:/attendance%20app/documentation/07_Security_Privacy_and_Legal_Readiness.md) | Security, Privacy & Legal Readiness | Firebase Authentication security, server-enforced session idle timeouts (15m), ID token revocation checks, per-device vs account-wide revocation, real-time suspension middleware, transaction-local RLS pool isolation, and linear hash-chain audit logging. |
| [`08_Test_Plan_Roadmap_and_Open_Decisions.md`](file:///u:/attendance%20app/documentation/08_Test_Plan_Roadmap_and_Open_Decisions.md) | Test Plan, Roadmap & Verification Results | 217+ passed automated test cases across 8 test suites, TC-01 through TC-105 mappings, implementation milestones, double-submission defense proofs, and resolved architectural decisions. |

---

## Automated Verification Status (217+ Scenarios Verified — 100% Pass Rate)

| Test Suite | File Path | Test Cases Passed | Key Verified Capabilities |
| :--- | :--- | :---: | :--- |
| **Real-Life Admin Workflow & Double-Submission Defense** | [`backend/src/tests/real_life_admin_workflow.ts`](file:///u:/attendance%20app/backend/src/tests/real_life_admin_workflow.ts) | **35 / 35** | Department/Programme/Semester/Section/Room/Group lifecycle, duplicate entity collision defense, faculty double-booking, room clash, parallel practical subgroups (`C1`/`C2`), rapid double-click attendance session defense, atomic marks upsert, out-of-bounds score blocking, and student privacy isolation. |
| **All-Roles & RBAC Security Verification Suite** | [`backend/src/tests/all_roles_verification.ts`](file:///u:/attendance%20app/backend/src/tests/all_roles_verification.ts) | **24 / 24** | HMAC token signature validation, synthetic token rejection, Global Admin operations, Faculty assignment boundaries, Student marks isolation (published results only), section matching, HOD department scoping, and cross-department blocking. |
| **Admin Operations Verification Suite** | [`backend/src/tests/admin_verification.ts`](file:///u:/attendance%20app/backend/src/tests/admin_verification.ts) | **36 / 36** | Admin RBAC, zero-fabrication metrics, teacher provisioning, duplicate prevention, search/filter/pagination, allocations compatibility, account lifecycle session revocation, and SHA-256 audit trails. |
| **Navigation, Role Persistence & Route Guard Suite** | [`backend/src/tests/navigation_regression.ts`](file:///u:/attendance%20app/backend/src/tests/navigation_regression.ts) | **33 / 33** | Admin Profile -> Overview navigation fix, cross-role route guards, unauthenticated bounce, brand colour `#1D3C72` lock, session lifecycle, and backend RBAC simulation. |
| **Bulk Onboarding & Security Suite** | [`backend/src/tests/onboarding_security_verification.ts`](file:///u:/attendance%20app/backend/src/tests/onboarding_security_verification.ts) | **40 / 40** | Formula injection sanitization, in-batch duplicate detection, sequential collision-free ID allocation, non-destructive token inspection, single-use atomic consumption, password complexity validator, invitation reissuance with prior token revocation, and privacy protection. |
| **Profile & Security Test Suite** | [`backend/src/tests/profile_verification.ts`](file:///u:/attendance%20app/backend/src/tests/profile_verification.ts) | **26 / 26** | Password strength policies, phone & blood group validation, institutional field immutability, role-specific profile segregation, active device session revocation. |
| **Timetable Conflict & Scheduling Suite** | [`backend/src/tests/timetable_verification.ts`](file:///u:/attendance%20app/backend/src/tests/timetable_verification.ts) | **23 / 23** | Weekly slot creation, teacher collision detection, room double-booking prevention, parallel lab practical batches (`C1`/`C2`), time interval boundary validation, section schedule isolation, clear schedule functionality, and entity deletion handlers. |
| **Real User Workflow & Auth Integration** | [`backend/src/tests/real_user_workflow.ts`](file:///u:/attendance%20app/backend/src/tests/real_user_workflow.ts) | **Integrated Suite** | End-to-end multi-role live server communication against port 5000 verifying full operational pipelines. |
| **Total Test Verification** | **All In-Memory Automated Suites** | **217 / 217** | **100% Success Rate across all functional, security, and integration tests** |

- **TypeScript Compilation:** 0 errors (`tsc` build code 0).
- **Production Build:** Exited code 0 (`npm run build`).
- **Local Server Execution:** Dual-port listener active on ports 8080 and 5000 (`http://localhost:5000`).
