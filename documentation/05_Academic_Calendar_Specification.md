# 5. Academic Calendar Specification

**Version:** 2.2.0 — Administrator Calendar Governance, Exam Scheduling, Dynamic Month Grid, Timetable Interplay & REST API  
**Date:** 24 October 2026  
**Status:** Implemented & Verified in Production (217+ Automated Test Scenarios Passing)

---

## 5.1 Purpose & Governance

The Academic Calendar is an institutional scheduling and governance module that centralizes official academic milestones, examination schedules, deadlines, statutory holidays, recess periods, and university events. It complements class timetables while remaining structurally distinct and isolated from daily attendance registers.

Administrators possess full authority to create, update, reschedule, and delete calendar events—including midterm continuous assessments, semester examinations, gazetted holidays, term deadlines, and recess intervals.

---

## 5.2 Event Categories & Visual Badging

- **Examinations (`EXAM`):** Continuous Internal Assessments (CIA-1, CIA-2), end-semester theory examinations, practical/viva evaluations, and supplementary exams. Visual badge: Red (`badge-exam`, `chip-exam`).
- **Holidays (`HOLIDAY`):** Gazetted statutory holidays, state observances, and cultural holidays. Visual badge: Amber/Gold (`badge-holiday`, `chip-holiday`).
- **Deadlines (`DEADLINE`):** Course registration cut-offs, examination form submissions, fee payment windows, attendance condonation appeals, and grade finalization. Visual badge: Indigo/Navy (`badge-deadline`, `chip-deadline`).
- **Vacation & Recess (`VACATION`):** Winter recess, summer break, preparatory leave, and inter-semester vacation. Visual badge: Purple (`badge-vacation`, `chip-vacation`).
- **College Events (`EVENT`):** Convocation, Foundation Day, orientation ceremonies, national symposiums, and departmental conferences. Visual badge: Teal/Blue (`badge-event`, `chip-event`).

---

## 5.3 Hierarchical Audience Targeting (5 Tiers)

Every calendar event is scoped to an audience level mapped to the university hierarchy:

1. **Institution-Wide (`ALL`):** Visible to all students, faculty members, and administrative staff across all schools, departments, and programs (e.g., University Foundation Day, Semester Final Examination window).
2. **Course-Specific (`COURSE`):** Scoped to a specific degree program (e.g., All BCA or B.Tech cohorts).
3. **Academic Year-Specific (`YEAR`):** Scoped to a class cohort (e.g., 1st Year Orientation).
4. **Semester-Specific (`SEMESTER`):** Scoped to an active semester (e.g., Semester 5 Capstone Defense).
5. **Section-Specific (`SECTION`):** Scoped to an individual classroom section (e.g., BCA Sem 1 Sec A practical exam).

---

## 5.4 Synchronized 3-Way Interface Architecture (`calendar.html`)

1. **Full Year 12-Month Interactive Grid:**
   - Displays all 12 calendar months in a compact, responsive grid.
   - Highlights instructional days, gazetted holidays, and examination cycles.
   - Summarizes institutional metrics: **214 instructional teaching days**, **38 holidays & recesses**, and **4 examination cycles**.
2. **Dynamic Single-Month View:**
   - Detailed calendar view with date cells, event pills, day-of-week headers, and month navigation controls (Prev/Next/Today).
   - Clicking any mini-month card in the 12-Month grid zooms directly into that month.
3. **Filterable Agenda Milestone List:**
   - Chronological list of upcoming institutional milestones.
   - Category filtering toggles (All, Exams, Holidays, Deadlines, Events).
4. **Responsive Mobile Navigation Drawer:**
   - On screens $\le 960\text{px}$, desktop headers collapse into an accessible 3-line hamburger menu button that morphs into an "X", paired with a slide-out drawer.

---

## 5.5 Separation from Daily Attendance Registers

- **Informational Scheduling:** Calendar events represent official institutional scheduling notices.
- **Zero Automatic Mutation:** A holiday or non-instructional event published in the calendar **never** automatically marks or alters attendance registers in `attendance_records`.
- **Instructional Timetable Alignment:** Faculty schedule classroom sessions on instructional days, referencing the calendar to avoid booking classes during gazetted holidays or suspended instructional windows.

---

## 5.6 Role Capabilities in Academic Calendar

| Role | Permitted Calendar Capabilities | Access Boundaries |
| :--- | :--- | :--- |
| **GLOBAL_ADMIN** | Full CRUD: Create, update, reschedule, and delete events across all 5 audience tiers (Institution, Course, Year, Semester, Section). | Changes are logged in the linear cryptographic audit chain. |
| **HOD** | View all departmental calendar events; review exam windows and departmental milestone schedules. | Cannot delete institution-wide statutory events. |
| **FACULTY** | View institution, course, and section-scoped events; align teaching plan with instructional day count. | Read-only access (`403 Forbidden` on creation/edit endpoints). |
| **STUDENT** | View audience-scoped events, holiday notices, examination dates, and submission deadlines. | Read-only access (`403 Forbidden` on administrative endpoints). |

---

## 5.7 REST API & Administrative Endpoints

The academic calendar is backed by authenticated REST endpoints in `backend/src/routes/academic.routes.ts`:

### 1. `GET /api/academic/calendar`
- **Access:** Public / Authenticated (Students, Faculty, Administrators)
- **Description:** Returns the active academic calendar schedule, ordered chronologically by `start_date`.
- **Query Parameters:** `year`, `month`, `category`, `audience_scope` (optional filters).

### 2. `POST /api/academic/calendar`
- **Access:** Administrator only (`requireRole(['GLOBAL_ADMIN'])`)
- **Description:** Creates and publishes a new academic calendar event.
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

### 3. `PUT /api/academic/calendar/:id`
- **Access:** Administrator only (`requireRole(['GLOBAL_ADMIN'])`)
- **Description:** Updates or reschedules an existing event.

### 4. `DELETE /api/academic/calendar/:id`
- **Access:** Administrator only (`requireRole(['GLOBAL_ADMIN'])`)
- **Description:** Removes an event with audit log recording.
