# 5. Academic Calendar Specification

**Version:** 2.0.0 — Administrator Calendar Governance, Exam Scheduling, Dynamic Month Grid, Timetable Interplay & REST API  
**Date:** 20 October 2026  
**Status:** Implemented & Verified in Production (215/215 Tests Passing)

---

## 5.1 Purpose
The Academic Calendar is an institutional scheduling and governance module that centralizes official academic milestones, examination schedules, deadlines, statutory holidays, recess periods, and university events. It complements class timetables while remaining structurally distinct from daily attendance registers.

Administrators possess full authority to create, update, reschedule, and delete calendar events—including midterm continuous assessments, semester examinations, gazetted holidays, term deadlines, and recess intervals.

---

## 5.2 Event Categories & Visual Badging
- **Examinations (`EXAM`):** Continuous Internal Assessments (CIA-1, CIA-2), end-semester theory examinations, practical/viva evaluations, and supplementary exams. Visual badge: Red (`badge-exam`, `chip-exam`).
- **Holidays (`HOLIDAY`):** Gazetted statutory holidays, state observances, and cultural holidays. Visual badge: Amber/Gold (`badge-holiday`, `chip-holiday`).
- **Deadlines (`DEADLINE`):** Course registration cut-offs, examination form submissions, fee payment windows, attendance condonation appeals, and grade finalization. Visual badge: Indigo/Navy (`badge-deadline`, `chip-deadline`).
- **Vacation & Recess (`VACATION`):** Winter recess, summer break, preparatory leave, and inter-semester vacation. Visual badge: Purple (`badge-vacation`, `chip-vacation`).
- **College Events (`EVENT`):** Convocation, Foundation Day, orientation ceremonies, national symposiums, and departmental conferences. Visual badge: Teal/Blue (`badge-event`, `chip-event`).

---

## 5.3 Hierarchical Audience Targeting
Every calendar event is scoped to an audience level mapped to the university hierarchy:

1. **Institution-Wide (`ALL`):** Visible to all students, faculty members, and administrative staff across all colleges, departments, and programs (e.g., University Foundation Day, Semester Final Examination window).
2. **Course-Specific (`COURSE`):** Scoped to a specific degree program (e.g., All BCA or B.Tech cohorts).
3. **Academic Year-Specific (`YEAR`):** Scoped to a class cohort (e.g., 1st Year Orientation).
4. **Semester-Specific (`SEMESTER`):** Scoped to an active semester (e.g., Semester 5 Capstone Defense).
5. **Section-Specific (`SECTION`):** Scoped to an individual classroom section (e.g., BCA Sem 1 Sec A practical exam).

---

## 5.4 REST API & Administrative Endpoints
The academic calendar is backed by authenticated REST endpoints in `backend/src/routes/academic.routes.ts`:

### 1. `GET /api/academic/calendar`
- **Access:** Public / Authenticated (Students, Faculty, Administrators)
- **Description:** Returns the active academic calendar schedule, ordered chronologically by `start_date`.
- **Query Parameters:** `year`, `month`, `category`, `audience_scope` (optional filters).

### 2. `POST /api/academic/calendar`
- **Access:** Administrator only (`requireRole(['GLOBAL_ADMIN'])`)
- **Description:** Creates and publishes a new academic calendar event (e.g., scheduling a new examination window).
- **Request Body (Zod Validated):**
  ```json
  {
    "title": "Semester Final Theory Examinations - Autumn 2026",
    "event_type": "EXAM",
    "start_date": "2026-12-08",
    "end_date": "2026-12-22",
    "description": "Comprehensive semester-end written examinations for all undergraduate and postgraduate programs.",
    "is_instructional_day": false,
    "audience_scope": "ALL",
    "course_id": null,
    "semester_id": null
  }
  ```
- **Audit Logging:** Automatically calls `AuditService.record()` under the `CALENDAR_PUBLISH` category with cryptographic chaining.

### 3. `PUT /api/academic/calendar/:id`
- **Access:** Administrator only (`requireRole(['GLOBAL_ADMIN'])`)
- **Description:** Updates event title, dates, event type, audience scope, instructional suspension flag, or description.
- **Validation:** Verifies `end_date >= start_date`. Records audit entry.

### 4. `DELETE /api/academic/calendar/:id`
- **Access:** Administrator only (`requireRole(['GLOBAL_ADMIN'])`)
- **Description:** Removes an event from the calendar and writes a deletion trail to the immutable audit log.

---

## 5.5 Relationship to Master Timetable Scheduling
The system distinguishes between macro institutional milestones (Academic Calendar) and micro instructional execution (Master Timetable):
- **Academic Calendar (`calendar.html`):** Governs term boundaries, gazetted non-instructional holidays, examination cycles, and institutional milestones.
- **Master Timetable (`admin-timetable.html`):** Governs recurring weekly class schedules (Monday–Saturday, 09:00–17:00), faculty allocations, classroom/lab rooms, and laboratory practical subgroup splits (`C1`/`C2`).
- **Suspension of Instruction:** When a calendar event is flagged `is_instructional_day: false` (e.g., gazetted holiday or examination day), attendance registers for that date are suspended, preventing teachers from conducting routine class roll calls.

---

## 5.6 Administrative UI Controls on `calendar.html`
When an authenticated user has the administrator role (`sessionStorage.getItem('attendance_user_role') === 'admin'`):
1. **Admin Scheduling Authority Bar:** An alert banner at the top of the calendar interface displays:
   - Institutional authority badge: `ADMINISTRATOR SCHEDULING ACCESS ACTIVE`.
   - Explicit rights declaration: "You have administrative rights to schedule examinations, configure gazetted holidays, adjust academic deadlines, and publish university term events."
   - Quick action button: **+ Schedule New Event**.
2. **Interactive Month Grid Day Scheduling:** Clicking on any calendar day cell automatically opens the event creation modal pre-populated with that date.
3. **Agenda Edit & Delete Buttons:** In the chronological Agenda List view, each event card renders **Edit** and **Delete** action buttons for administrators.
4. **Modal Dialogs (Slate & White Hybrid):**
   - Event creation & editing modal with validation, event type selector, date pickers, audience scope, and instructional suspension toggle.
   - Deletion confirmation modal preventing accidental removals.
5. **Real-Time Client-Server Sync:**
   - Submissions post directly to `/api/academic/calendar` with JWT bearer authorization.
   - Updates local cache (`localStorage['srhu_academic_events']`) for instantaneous offline responsiveness.
   - Renders success/error toast alerts (`.admin-toast`).

---

## 5.7 Permissions & Visibility Matrix
| Role | View Public Calendar | Filter by Category | Schedule Exam Dates | Edit Event | Delete Event | Audit Trail Logged |
|---|---|---|---|---|---|---|
| **Public / Guest** | Yes (Published) | Yes | No | No | No | N/A |
| **Student** | Yes (Enrolled Scopes) | Yes | No | No | No | N/A |
| **Faculty** | Yes (Relevant Scopes) | Yes | No (View Only) | No | No | N/A |
| **Administrator** | Yes (All Scopes) | Yes | **Yes** | **Yes** | **Yes** | **Yes (`CALENDAR_PUBLISH`)** |

---

## 5.8 Acceptance & Verification Criteria
- [x] Admin can schedule new examination dates via modal and verify they immediately render with `.chip-exam` on the month grid.
- [x] Admin can edit existing event dates, descriptions, and categories.
- [x] Admin can delete outdated or cancelled events with confirmation.
- [x] Validation prevents events with `end_date` before `start_date`.
- [x] Unauthenticated or non-admin users cannot access administrative action buttons or execute calendar modification API calls.
- [x] Brand colour `#1D3C72` is strictly preserved on all primary action buttons and header bars.
- [x] Calendar audience filters correctly restrict events to enrolled courses/semesters for student and faculty views.
