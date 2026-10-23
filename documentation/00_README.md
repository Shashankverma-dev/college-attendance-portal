# Attendance Portal — System Architecture & Technical Documentation

**Version:** 2.0.0 — Comprehensive Student Management, Academic Hierarchy, 48-Hour Cryptographic Activation, Two-Stage Bulk Import, Timetable Scheduler, and Master E2E QA Release  
**Date:** 20 October 2026  
**Institution:** Swami Rama Himalayan University (SRHU)  
**Basis:** Institutional Academic Requirements, Academic Hierarchy, and Google Cloud / Firebase Standards  
**System Status:** Active Implementation — Express/TypeScript Backend on Ports 8080 & 5000, Dual-Mode PostgreSQL / Stateful In-Memory Repository, Complete Production-Ready Portals, and 215/215 Automated Tests Passing

---

## Executive Summary & System Purpose

This comprehensive technical documentation package defines the architectural, operational, security, and functional implementation for the College Attendance Management System. The portal transitions the college from paper-based or disjointed registers into a modern, auditable, high-performance web platform accommodating **4,165+ matriculated students** and scalable to **10,000+ students**, built entirely within the **Google Firebase and Google Cloud Platform (GCP)** ecosystem.

**Mandatory Technology Standard:** The system exclusively utilizes Google Firebase and Google Cloud infrastructure. All references to AWS and Amazon SES remain strictly excluded. Primary brand color `#1D3C72` is universally preserved across all interfaces and documentation.

---

### Core Implemented Architectural Pillars (v2.0.0)

1. **6-Tier Institutional Academic Hierarchy:**
   `College -> Department -> Course/Program -> Academic Year -> Semester -> Section -> Students`.
   Every tier is independently managed with strict relational integrity, composite foreign key constraints, and zero cross-course data leakage.
2. **Per-Course Independent Academic Hierarchy:**
   Every academic program (e.g., BCA 3-year/6-semester, B.Tech 4-year/8-semester) independently defines and owns its academic years, semesters, section counts, and student cohorts without data collision.
3. **Enforced Section Capacity Constraints (60–80 Baseline):**
   Sections enforce strict capacity limits configured upon creation (`max_capacity`, baseline 60–80). Capacity checks are executed and strictly enforced on single student creation, bulk spreadsheet ingestion, and section transfers. Overflows trigger an explicit `409 Conflict` error.
4. **Permanent Student Identification:**
   Globally unique, permanent Student IDs (`student_id`, e.g., `STU-2026-0001` or institutional admission roll numbers) decoupled from email addresses, section assignments, and semester cohorts. Database constraints enforce uniqueness at the college level.
5. **Non-Destructive Section Transfers:**
   When an administrator transfers a student between sections (e.g., Section A to Section B), the system archives the prior enrollment as `TRANSFERRED` with an effective timestamp and creates a new `ACTIVE` enrollment. All historical attendance roll calls, session registers, and examination marks remain permanently linked to the original section.
6. **48-Hour Cryptographic Account Activation:**
   Accounts are created in `PENDING_ACTIVATION` state. The backend generates 256-bit cryptographically secure pseudo-random tokens (`crypto.randomBytes(32)`), stores them exclusively as salted SHA-256 hashes (`token_hash`) with a 48-hour expiration window, and dispatches activation links. Token consumption is single-use and atomic. Reissuing an invitation automatically supersedes and revokes all previously issued active tokens. Activation requires a 12+ character password adhering to 4 character classes.
7. **Two-Stage Bulk Student Ingestion & Formula Sanitization:**
   - **Stage 1 (Preview):** Ingests CSV/Excel rosters, normalizes headers (`Full Name`, `Student ID`, `Email`, `Course`, `Semester`, `Section`, `Roll Number`), sanitizes against Formula Injection (CSV Injection) by prepending a quote to cells starting with `=`, `+`, `-`, `@`, `\t`, `\r`, detects within-batch and database duplicates, and validates section capacity.
   - **Stage 2 (Transactional Commit):** Commits validated rows in a database transaction, provisions student profiles and enrollments, generates activation tokens, and dispatches activation emails.
8. **Independent Account, Invitation, and Enrollment Lifecycles:**
   - **Account Status:** `PENDING_ACTIVATION` -> `ACTIVE` <-> `SUSPENDED` (or `INACTIVE`).
   - **Invitation Status:** `NOT_SENT` -> `SENT` -> `ACCEPTED` (or `EXPIRED`, `REVOKED`).
   - **Enrollment Status:** `PENDING` -> `ACTIVE` -> `TRANSFERRED` / `COMPLETED` / `WITHDRAWN`.
9. **Real-Time Account Suspension Middleware:**
   When an administrator suspends an account (`PATCH /api/admin/students/:id/status` or `PATCH /api/admin/teachers/:id/status`), the system immediately invalidates active sessions in `user_sessions`, and the backend authentication middleware (`auth.ts`) instantly intercepts subsequent requests, rejecting them with HTTP 403 `ACCOUNT_DEACTIVATED`.
10. **Dual-Mode Email Service Abstraction:**
    Pluggable email service supporting enterprise SMTP relay (Google Workspace SMTP relay) and a stateful development simulator (`LOCAL_SIMULATOR`) that records dispatched emails, activation tokens, and audit events without external network dependencies.
11. **Master Timetable & Conflict Engine (`admin-timetable.html`):**
    Visual master schedule management with weekly grid rendering (Monday–Saturday, 09:00–17:00), supporting lecture classes and split laboratory practical subgroups (`C1` and `C2`). The backend validation engine prevents faculty double-booking and room collisions, returning HTTP 409 Conflict with precise collision diagnostics.
12. **Linear Cryptographic Hash Chain Audit Governance:**
    Enforces audit log integrity via a **linear sequential cryptographic hash chain** ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{payload}_i)$) with automated daily integrity verification scripts and interactive admin modal inspection.
13. **Role-Safe Navigation Subsystem & Route Guard Architecture (`site.js` & `profile.html`):**
    Client-side route guard engine intercepting unauthenticated access and cross-role degradation/escalation. Global click interception ensures administrators navigating from Profile or auxiliary pages always land on `admin.html`.
14. **Dual-Mode Backend Execution:**
    Seamless transition between Cloud SQL PostgreSQL (production) and a stateful in-memory repository initialized from [`backend/db/seed.sql`](file:///u:/attendance%20app/backend/db/seed.sql) (local development), enabling instantaneous offline execution and 100% test reproducibility.

---

## Active Screen Inventory

| Screen File | Portal Scope | Implemented Functionality |
| :--- | :--- | :--- |
| [`admin.html`](file:///u:/attendance%20app/admin.html) | Global Admin | Operations Dashboard: Live KPIs (4,165 students, active faculty, today's registers, marks cycles), Operations Hub, Department Timeliness Table, SHA-256 Audit Chain Modal, and explicit Dashboard Overview dropdown navigation. |
| [`admin-students.html`](file:///u:/attendance%20app/admin-students.html) | Global Admin | Student Management: Academic hierarchy filtering (Course, Year, Semester, Section), search, pagination, Add Student modal (capacity-guarded), Two-Stage Bulk Import modal (Preview with CSV injection neutralization & Commit), Section Transfer modal, Reissue Activation modal, and Account Suspension modal. |
| [`admin-timetable.html`](file:///u:/attendance%20app/admin-timetable.html) | Global Admin | Master Timetable Management: Weekly scheduling grid (Mon–Sat, 09:00–17:00), slot creation/editing, conflict detection alerts (faculty clash & room collision), and parallel lab practical subgroups (`C1` & `C2`). |
| [`admin-teachers.html`](file:///u:/attendance%20app/admin-teachers.html) | Global Admin | Teacher Portal Management: Faculty roster search, filters, pagination, Provision Faculty modal, Allocation modal, Edit modal, Access Control modal, Profile view, CSV export, and Dashboard Overview dropdown link. |
| [`admin-marks.html`](file:///u:/attendance%20app/admin-marks.html) | Global Admin | Final Examination Marks: Verification console, spreadsheet ingest, grade reviews, cycle status tracking, student result publishing, and Dashboard Overview dropdown link. |
| [`teacher.html`](file:///u:/attendance%20app/teacher.html) | Faculty | Live Register: Roll-call marking (`P`, `A`, `L`), bulk status toggles, student photos, register locking, and audit commitment. |
| [`past-registers.html`](file:///u:/attendance%20app/past-registers.html) | Faculty / HOD | Past Registers & Corrections: Multi-criteria filter, locked session inspection, correction workflow with mandatory justification and linear hash logging. |
| [`teacher-marks.html`](file:///u:/attendance%20app/teacher-marks.html) | Faculty | Marks Entry Console: Subject marks entry, internal assessments, semester exams, validation guards, and submission to admin. |
| [`student.html`](file:///u:/attendance%20app/student.html) | Student | Attendance Portal: Subject-wise percentages, condonation status indicators, calendar attendance heatmap, and correction request submission. |
| [`student-marks.html`](file:///u:/attendance%20app/student-marks.html) | Student | Marks Portal: Semester marks sheets, SGPA/CGPA calculations, verified publication dates, and download options. |
| [`calendar.html`](file:///u:/attendance%20app/calendar.html) | Universal | Institutional Calendar: 12-month grid view, teaching days count (214 days), term milestones, statutory holidays, and mobile drawer. |
| [`profile.html`](file:///u:/attendance%20app/profile.html) | Universal (Role-Segregated) | User Profile & Security: Unified multi-role portal dynamically rendering context for Global Admin (`Prof. Arthur Vance`, `ADM-001`), Faculty (`Dr. Sarah Jenkins`, `FAC-201`), and Student (`Alex Chen`, `STU-101`), password policy enforcement, active device session inspection, per-device revocation, and role-safe Dashboard navigation. |
| [`signin.html`](file:///u:/attendance%20app/signin.html) | Universal | Authentication Portal: Role-based redirect routing (`GLOBAL_ADMIN -> admin.html`, `FACULTY -> teacher.html`, `STUDENT -> student.html`) with session clearance on landing. |
| [`privacy.html`](file:///u:/attendance%20app/privacy.html) & [`terms.html`](file:///u:/attendance%20app/terms.html) | Public / Universal | Statutory compliance, institutional data policy, and authenticated return-to-portal navigation. |

---

## Documentation Index

| File | Title | Description & Scope |
| :--- | :--- | :--- |
| [`01_Current_State_and_Project_Charter.md`](file:///u:/attendance%20app/documentation/01_Current_State_and_Project_Charter.md) | Current State and Project Charter | Implemented baseline assessment, institutional scope, core objectives, constraints, and success criteria in the Google Firebase/GCP ecosystem. |
| [`02_PRD_Product_Requirements.md`](file:///u:/attendance%20app/documentation/02_PRD_Product_Requirements.md) | Product Requirements Document (PRD) | Complete functional requirements, academic structure, user profiles, Firebase Auth Gmail lifecycle, bulk import, persistent idempotency, and screen requirements. |
| [`03_SRS_and_Acceptance_Criteria.md`](file:///u:/attendance%20app/documentation/03_SRS_and_Acceptance_Criteria.md) | Software Requirements & Acceptance Criteria | Granular functional requirements (FR-01 through FR-85), server-enforced authorization, expanded correction governance, role-permission matrix, and testable acceptance criteria (AC-01 through AC-55). |
| [`04_UI_UX_Reference_and_Screen_Specification.md`](file:///u:/attendance%20app/documentation/04_UI_UX_Reference_and_Screen_Specification.md) | UI/UX Reference & Screen Specification | Restrained academic design language, complete screen inventory, responsive layouts, unified role-segregated profile specification, navigation specifications, and component states. |
| [`05_Academic_Calendar_Specification.md`](file:///u:/attendance%20app/documentation/05_Academic_Calendar_Specification.md) | Academic Calendar Specification | Centralized institutional calendar, 5-tier audience targeting (College, Course, Year, Semester, Section), category management, and strict separation from attendance records. |
| [`06_Data_and_Architecture_Requirements.md`](file:///u:/attendance%20app/documentation/06_Data_and_Architecture_Requirements.md) | Data & Architecture Requirements | Relational schemas, query plan profiling, transaction-local RLS, persistent idempotency schema, Cloud Tasks queueing, and admin REST API contracts. |
| [`07_Security_Privacy_and_Legal_Readiness.md`](file:///u:/attendance%20app/documentation/07_Security_Privacy_and_Legal_Readiness.md) | Security, Privacy & Legal Readiness | Firebase Authentication security, server-enforced session idle timeouts, ID token revocation checks, transaction-local RLS pool isolation, and linear hash-chain audit logging. |
| [`08_Test_Plan_Roadmap_and_Open_Decisions.md`](file:///u:/attendance%20app/documentation/08_Test_Plan_Roadmap_and_Open_Decisions.md) | Test Plan, Roadmap & Verification Results | 215 passed automated test cases across 8 test suites, TC-01 through TC-95 mappings, implementation milestones, and resolved architectural decisions. |

---

## Automated Verification Status (215 / 215 Passed — 100% Pass Rate)

| Test Suite | File Path | Test Cases Passed | Key Verified Capabilities |
| :--- | :--- | :---: | :--- |
| **Master QA & Real-World E2E Suite** | [`backend/src/tests/master-qa-e2e.ts`](file:///u:/attendance%20app/backend/src/tests/master-qa-e2e.ts) | **34 / 34** | End-to-end departmental hierarchy, faculty assignment, section capacity overflow rejection, attendance roll call locking, condonation calculations, examination marks publishing, and SHA-256 audit chain. |
| **Student Management & Activation Suite** | [`backend/src/tests/verify-student-management.ts`](file:///u:/attendance%20app/backend/src/tests/verify-student-management.ts) | **15 / 15** | Single student provisioning, 48-hour activation token hash creation, password validation, token redemption, account state transitions, section transfer historical retention, and account suspension enforcement. |
| **Full System Integration Suite** | [`backend/src/tests/verify-full-system.ts`](file:///u:/attendance%20app/backend/src/tests/verify-full-system.ts) | **15 / 15** | Multi-role authentication, cross-role API authorization barriers, session lifecycle management, marks verification workflows, and calendar event audience scoping. |
| **Admin Operations Verification Suite** | [`backend/src/tests/admin_verification.ts`](file:///u:/attendance%20app/backend/src/tests/admin_verification.ts) | **36 / 36** | Admin RBAC, zero-fabrication metrics, teacher provisioning, duplicate prevention, search/filter/pagination, allocations compatibility, account lifecycle session revocation, and SHA-256 audit trails. |
| **Navigation, Role Persistence & Route Guard Suite** | [`backend/src/tests/navigation_regression.ts`](file:///u:/attendance%20app/backend/src/tests/navigation_regression.ts) | **29 / 29** | Admin Profile -> Overview navigation fix, cross-role route guards, unauthenticated bounce, brand colour `#1D3C72` lock, session lifecycle, and backend RBAC simulation. |
| **Bulk Onboarding & Security Suite** | [`backend/src/tests/onboarding_security_verification.ts`](file:///u:/attendance%20app/backend/src/tests/onboarding_security_verification.ts) | **40 / 40** | Formula injection sanitization, in-batch duplicate detection, sequential collision-free ID allocation, non-destructive token inspection, single-use atomic consumption, password complexity validator, invitation reissuance with prior token revocation, and privacy protection. |
| **Profile & Security Test Suite** | [`backend/src/tests/profile_verification.ts`](file:///u:/attendance%20app/backend/src/tests/profile_verification.ts) | **26 / 26** | Password strength policies, phone & blood group validation, institutional field immutability, role-specific profile segregation, active device session revocation. |
| **Timetable Conflict & Scheduling Suite** | [`backend/src/tests/timetable_verification.ts`](file:///u:/attendance%20app/backend/src/tests/timetable_verification.ts) | **20 / 20** | Weekly slot creation, teacher collision detection, room double-booking prevention, parallel lab practical batches (`C1`/`C2`), time interval boundary validation, and section schedule isolation. |
| **Total Test Verification** | **All 8 Suites** | **215 / 215** | **100% Success Rate across all functional, security, and integration tests** |

- **TypeScript Compilation:** 0 errors (`tsc` build code 0).
- **Production Build:** Exited code 0 (`npm run build`).
- **Local Server Execution:** Dual-port listener active on ports 8080 and 5000 (`http://localhost:5000`).
