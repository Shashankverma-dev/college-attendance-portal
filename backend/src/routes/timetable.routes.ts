import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import {
  TimetableEngine,
  TimetableImportService,
  localTimetables,
  localClassrooms,
  defaultPeriodSlots,
  localSectionGroups,
  setRegisteredTeachersProvider,
  TimetableMaster,
  TimetableEntry,
  DayOfWeek,
  ClassType,
} from '../services/timetable';
import { AuditService } from '../services/audit';

import {
  localSchools,
  localDepartments,
  localCourses,
  localSemesters,
  localSections,
  localSubjects,
  localTeachers,
  deduplicateDepartmentsList,
} from './admin.routes';

// Connect timetable service dynamically to live registered faculty
setRegisteredTeachersProvider(() =>
  localTeachers.map((t) => ({
    id: t.faculty_profile_id,
    name: t.full_name,
    staffId: t.faculty_staff_id,
    status: t.status,
  }))
);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Flexible admin authentication for local and production environments
const adminAuth = (req: Request, res: Response, next: any) => {
  if (req.headers.authorization) {
    return authenticate(req, res, () => {
      requireRole(['GLOBAL_ADMIN', 'HOD'])(req, res, next);
    });
  }
  // Local environment default to global admin
  req.user = {
    uid: 'firebase-uid-admin-001',
    email: 'admin@college.edu',
    role: 'GLOBAL_ADMIN',
    sessionId: 'sess-local-admin',
  };
  next();
};

// =============================================================================
// 1. RESOURCE & ACADEMIC DIRECTORIES (Rooms, Periods, Groups, Faculty, Departments, Courses, Sections)
// =============================================================================

router.get('/resources/rooms', adminAuth, async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, rooms: localClassrooms });
});

router.get('/resources/periods', adminAuth, async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, periods: defaultPeriodSlots });
});

router.get('/resources/groups', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const sectionId = req.query.sectionId as string;
  const groups = sectionId
    ? localSectionGroups.filter((g) => g.section_id === sectionId)
    : localSectionGroups;
  res.json({ success: true, groups });
});

router.get('/resources/faculty', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const unique: Array<{ id: string; name: string; staffId: string }> = [];
  localTeachers.forEach((t) => {
    if (!unique.some((f) => f.id === t.faculty_profile_id || f.staffId === t.faculty_staff_id)) {
      unique.push({ id: t.faculty_profile_id, name: t.full_name, staffId: t.faculty_staff_id });
    }
  });
  res.json({ success: true, faculty: unique });
});

// Complete Academic Directory (Departments, Programmes, Semesters, Sections, Rooms, Groups)
router.get('/academic/all', adminAuth, async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    departments: deduplicateDepartmentsList(localDepartments),
    programmes: localCourses,
    courses: localCourses,
    semesters: localSemesters,
    sections: localSections,
    subjects: localSubjects,
    rooms: localClassrooms,
    groups: localSectionGroups,
    periods: defaultPeriodSlots,
  });
});

// Admin Creation: School / Department (Unified)
router.post('/academic/department', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const department_id = req.body.department_id || req.body.id;
  const department_code = req.body.department_code || req.body.code;
  const department_name = req.body.department_name || req.body.name;
  const programs = req.body.programs || req.body.description || '';
  const hod_name = req.body.hod_name || req.body.dean_name;
  const hod_email = req.body.hod_email || req.body.contact_email;
  const hod_password = req.body.hod_password;

  if (!department_code || !department_name) {
    res.status(400).json({ success: false, message: 'Department / School code and name are required.' });
    return;
  }
  const cleanCode = String(department_code).trim().toUpperCase();
  const cleanName = String(department_name).trim();
  const cleanId = department_id ? String(department_id).trim() : `b0000000-0000-0000-0000-${String(localDepartments.length + 1).padStart(12, '0')}`;

  let existing = localDepartments.find((d) => 
    d.department_code === cleanCode || 
    d.department_id === cleanId || 
    d.department_name.toLowerCase().trim() === cleanName.toLowerCase()
  );
  if (existing) {
    existing.department_name = cleanName;
    if (programs) existing.programs = programs;
    if (hod_name) existing.hod_name = hod_name;
    if (hod_email) existing.hod_email = hod_email;
    if (hod_password) existing.hod_password = hod_password;
    res.json({ success: true, message: `School / Department "${cleanName}" (${cleanCode}) already exists.`, department: existing });
    return;
  }

  const newDept = {
    department_id: cleanId,
    school_id: cleanId, // Unified: school and department are the same entity
    department_code: cleanCode,
    department_name: cleanName,
    programs: programs || `${cleanCode} Programs`,
    hod_name: hod_name || undefined,
    hod_email: hod_email || undefined,
    hod_password: hod_password || undefined,
  };
  localDepartments.push(newDept);

  // Sync to localSchools
  let existingSchool = localSchools.find((s) => s.school_code === cleanCode || s.school_id === cleanId);
  if (existingSchool) {
    existingSchool.school_name = cleanName;
    if (programs) existingSchool.description = programs;
    if (hod_name) existingSchool.hod_name = hod_name;
    if (hod_email) existingSchool.hod_email = hod_email;
  } else {
    localSchools.push({
      school_id: cleanId,
      school_code: cleanCode,
      school_name: cleanName,
      description: programs || `School / Department of ${cleanName}`,
      programs: programs || `${cleanCode} Programs`,
      is_active: true,
      dean_name: hod_name,
      hod_name: hod_name,
      contact_email: hod_email,
      hod_email: hod_email,
      hod_password: hod_password,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  res.json({ success: true, message: `School / Department ${cleanCode} created successfully.`, department: newDept });
});

// Admin Deletion: Department
router.delete('/academic/department/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const idx = localDepartments.findIndex(
    (d) => d.department_id === targetId || d.department_code.toUpperCase() === targetId.toUpperCase()
  );
  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Department not found.' });
    return;
  }
  const removed = localDepartments.splice(idx, 1)[0];
  res.json({ success: true, message: `Department "${removed.department_name}" (${removed.department_code}) deleted successfully.` });
});

// Admin Creation: Programme / Course
router.post('/academic/programme', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const department_id = req.body.department_id;
  const course_code = req.body.course_code || req.body.code;
  const course_name = req.body.course_name || req.body.name;
  const total_semesters = req.body.total_semesters;
  if (!department_id || !course_code || !course_name) {
    res.status(400).json({ success: false, message: 'Department, Programme code, and Programme name are required.' });
    return;
  }
  const cleanCode = String(course_code).trim().toUpperCase();
  const cleanName = String(course_name).trim();
  const numSemesters = Number(total_semesters) || 6;

  const exists = localCourses.find((c) => c.course_code === cleanCode);
  if (exists) {
    res.status(400).json({ success: false, message: `Programme "${cleanCode}" already exists.` });
    return;
  }

  const newCourseId = `c0000000-0000-0000-0000-${String(localCourses.length + 1).padStart(12, '0')}`;
  const newCourse = {
    course_id: newCourseId,
    department_id,
    course_code: cleanCode,
    course_name: cleanName,
  };
  localCourses.push(newCourse);

  const createdSemesters = [];
  for (let s = 1; s <= numSemesters; s++) {
    const sem = {
      semester_id: `e0000000-0000-0000-${String(localCourses.length).padStart(4, '0')}-${String(s).padStart(12, '0')}`,
      course_id: newCourseId,
      semester_number: s,
      display_label: `Semester ${s}`,
    };
    localSemesters.push(sem);
    createdSemesters.push(sem);
  }

  res.json({
    success: true,
    message: `Programme ${cleanCode} registered with ${numSemesters} semesters.`,
    programme: newCourse,
    semesters: createdSemesters,
  });
});

// Admin Deletion: Programme / Course
router.delete('/academic/programme/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const idx = localCourses.findIndex(
    (c) => c.course_id === targetId || c.course_code.toUpperCase() === targetId.toUpperCase()
  );
  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Programme not found.' });
    return;
  }
  const removed = localCourses.splice(idx, 1)[0];
  const removedSemIds = new Set<string>();
  for (let i = localSemesters.length - 1; i >= 0; i--) {
    if (localSemesters[i].course_id === removed.course_id) {
      removedSemIds.add(localSemesters[i].semester_id);
      localSemesters.splice(i, 1);
    }
  }
  for (let i = localSections.length - 1; i >= 0; i--) {
    if (removedSemIds.has(localSections[i].semester_id)) {
      localSections.splice(i, 1);
    }
  }
  res.json({ success: true, message: `Programme "${removed.course_name}" (${removed.course_code}) deleted successfully.` });
});

// Admin Creation: Semester
router.post('/academic/semester', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { course_id, semester_number, display_label } = req.body;
  if (!course_id || !semester_number) {
    res.status(400).json({ success: false, message: 'Programme ID and semester number are required.' });
    return;
  }
  const targetCourse = localCourses.find((c) => c.course_id === course_id || c.course_code.toUpperCase() === String(course_id).toUpperCase());
  const resolvedCourseId = targetCourse ? targetCourse.course_id : course_id;
  const semNum = Number(semester_number);
  const exists = localSemesters.find((s) => (s.course_id === resolvedCourseId || (targetCourse && s.course_id === targetCourse.course_id)) && s.semester_number === semNum);
  if (exists) {
    res.status(200).json({ success: true, message: `Semester ${semNum} already exists for this programme.`, semester: exists });
    return;
  }

  const newSem = {
    semester_id: `e0000000-0000-0000-9999-${String(localSemesters.length + 1).padStart(12, '0')}`,
    course_id: resolvedCourseId,
    semester_number: semNum,
    display_label: display_label || `Semester ${semNum}`,
  };
  localSemesters.push(newSem);
  res.json({ success: true, message: `Semester ${semNum} added successfully.`, semester: newSem });
});

// Admin Deletion: Semester
router.delete('/academic/semester/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const idx = localSemesters.findIndex((s) => s.semester_id === targetId);
  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Semester not found.' });
    return;
  }
  const removed = localSemesters.splice(idx, 1)[0];
  // Cascade remove sections and groups
  for (let i = localSections.length - 1; i >= 0; i--) {
    if (localSections[i].semester_id === removed.semester_id) {
      const removedSec = localSections.splice(i, 1)[0];
      for (let g = localSectionGroups.length - 1; g >= 0; g--) {
        if (localSectionGroups[g].section_id === removedSec.section_id) {
          localSectionGroups.splice(g, 1);
        }
      }
    }
  }
  res.json({ success: true, message: `Semester "${removed.display_label || removed.semester_number}" deleted successfully.` });
});

// Admin Creation: Section
router.post('/academic/section', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const semester_id = req.body.semester_id;
  const section_name = req.body.section_name || req.body.name;
  const max_capacity = req.body.max_capacity || req.body.capacity;
  const academic_calendar_term = req.body.academic_calendar_term;
  if (!semester_id || !section_name) {
    res.status(400).json({ success: false, message: 'Semester and section name are required.' });
    return;
  }
  const cleanSection = String(section_name).trim().toUpperCase();
  const term = academic_calendar_term || 'Autumn 2026';

  const exists = localSections.find(
    (s) => s.semester_id === semester_id && s.section_name === cleanSection && s.academic_calendar_term === term
  );
  if (exists) {
    res.status(400).json({ success: false, message: `Section ${cleanSection} already exists for this semester and term.` });
    return;
  }

  const newSection = {
    section_id: `f0000000-0000-0000-0000-${String(localSections.length + 1).padStart(12, '0')}`,
    semester_id,
    section_name: cleanSection,
    max_capacity: Number(max_capacity) || 80,
    academic_calendar_term: term,
  };
  localSections.push(newSection);

  res.json({ success: true, message: `Section ${cleanSection} created successfully.`, section: newSection });
});

// Admin Deletion: Section
router.delete('/academic/section/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const idx = localSections.findIndex(
    (s) => s.section_id === targetId || s.section_name.toUpperCase() === targetId.toUpperCase()
  );
  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Section not found.' });
    return;
  }
  const removed = localSections.splice(idx, 1)[0];
  for (let i = localSectionGroups.length - 1; i >= 0; i--) {
    if (localSectionGroups[i].section_id === removed.section_id) {
      localSectionGroups.splice(i, 1);
    }
  }
  res.json({ success: true, message: `Section "${removed.section_name}" deleted successfully.` });
});

// Admin Creation: Classroom / Lab
router.post('/academic/room', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const room_code = req.body.room_code || req.body.code;
  const facility_name = req.body.facility_name || req.body.name || req.body.room_name;
  const room_type = req.body.room_type || req.body.type;
  const capacity = req.body.capacity || req.body.max_capacity;
  const department_id = req.body.department_id;
  if (!room_code || !facility_name) {
    res.status(400).json({ success: false, message: 'Room code and facility name are required.' });
    return;
  }
  const cleanCode = String(room_code).trim().toUpperCase();
  const cleanName = String(facility_name).trim();

  const exists = localClassrooms.find((r) => r.room_code.toUpperCase() === cleanCode);
  if (exists) {
    res.status(400).json({ success: false, message: `Room "${cleanCode}" already exists.` });
    return;
  }

  const newRoom = {
    room_id: `r0000000-0000-0000-0000-${String(localClassrooms.length + 1).padStart(12, '0')}`,
    room_code: cleanCode,
    room_name: cleanName,
    room_type: (room_type || 'CLASSROOM').toUpperCase() as any,
    capacity: Number(capacity) || 60,
    department_id: department_id || (localDepartments[0]?.department_id || ''),
    is_active: true,
  };
  localClassrooms.push(newRoom);

  res.json({ success: true, message: `Classroom / Laboratory ${cleanCode} registered successfully.`, room: newRoom });
});

// Admin Deletion: Classroom / Lab
router.delete('/academic/room/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const idx = localClassrooms.findIndex(
    (r) => r.room_id === targetId || r.room_code.toUpperCase() === targetId.toUpperCase()
  );
  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Room/facility not found.' });
    return;
  }
  const removed = localClassrooms.splice(idx, 1)[0];
  res.json({ success: true, message: `Room "${removed.room_code}" deleted successfully.` });
});

// Admin Creation: Practical Subgroup (C1, C2)
router.post('/academic/group', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const section_id = req.body.section_id;
  const group_name = req.body.group_name || req.body.name;
  const description = req.body.description;
  const enrolled_student_ids = req.body.enrolled_student_ids;
  if (!section_id || !group_name) {
    res.status(400).json({ success: false, message: 'Section and group name (e.g., C1, C2) are required.' });
    return;
  }
  const cleanName = String(group_name).trim().toUpperCase();

  const exists = localSectionGroups.find(
    (g) => g.section_id === section_id && g.group_name === cleanName
  );
  if (exists) {
    res.status(400).json({ success: false, message: `Group "${cleanName}" already exists for this section.` });
    return;
  }

  const newGroup = {
    group_id: `g0000000-0000-0000-0000-${String(localSectionGroups.length + 1).padStart(12, '0')}`,
    section_id,
    group_name: cleanName,
    description: description || `Practical Lab Cohort ${cleanName}`,
    enrolled_student_ids: Array.isArray(enrolled_student_ids) ? enrolled_student_ids : [],
  };
  localSectionGroups.push(newGroup);

  res.json({ success: true, message: `Subgroup ${cleanName} registered successfully.`, group: newGroup });
});

// Admin Deletion: Practical Subgroup
router.delete('/academic/group/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const idx = localSectionGroups.findIndex(
    (g) => g.group_id === targetId || g.group_name.toUpperCase() === targetId.toUpperCase()
  );
  if (idx === -1) {
    res.status(404).json({ success: false, message: 'Subgroup not found.' });
    return;
  }
  const removed = localSectionGroups.splice(idx, 1)[0];
  res.json({ success: true, message: `Subgroup "${removed.group_name}" deleted successfully.` });
});

// Admin Creation: Add Class Period to Timetable
router.post('/entries', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const rawEntry = req.body.entry || req.body;
    const {
      academic_calendar_term,
      course_id,
      course_code,
      semester_id,
      semester_number,
      section_id,
      section_name,
    } = req.body;

    const day_of_week = rawEntry.day_of_week;
    const period_index = Number(rawEntry.period_index);
    const subject_code = rawEntry.subject_code;
    const primary_faculty_id = rawEntry.primary_faculty_id || rawEntry.faculty_id;
    const room_id = rawEntry.room_id;
    const class_type = rawEntry.session_type || rawEntry.class_type || 'LECTURE';
    const group_name = rawEntry.group_name || null;

    if (!day_of_week || !period_index || !subject_code || !primary_faculty_id) {
      res.status(400).json({
        success: false,
        message: 'Day, period slot, subject code, and faculty are required.',
      });
      return;
    }

    const term = academic_calendar_term || 'Autumn 2026';
    const cCode = course_code || 'BCA';
    const semNum = Number(semester_number) || 5;
    const secName = section_name || 'C';

    // Locate or create timetable master record
    let tt = localTimetables.find(
      (t) =>
        t.course_code === cCode &&
        t.semester_number === semNum &&
        t.section_name === secName &&
        t.academic_calendar_term === term
    );

    if (!tt) {
      tt = {
        timetable_id: `tt000000-0000-0000-0000-${String(localTimetables.length + 1).padStart(12, '0')}`,
        academic_calendar_term: term,
        department_id: localDepartments[0]?.department_id || 'b0000000-0000-0000-0000-000000000001',
        department_code: 'CA',
        department_name: 'Department of Computer Applications',
        course_id: course_id || 'c0000000-0000-0000-0000-000000000001',
        course_code: cCode,
        course_name: 'Bachelor of Computer Applications',
        semester_id: semester_id || 'e0000000-0000-0000-0000-000000000006',
        semester_number: semNum,
        section_id: section_id || 'f0000000-0000-0000-0000-000000000003',
        section_name: secName,
        effective_date: new Date().toISOString().split('T')[0],
        version_number: 1,
        status: 'PUBLISHED',
        created_by: 'admin-portal-user',
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        entries: [],
      };
      localTimetables.push(tt);
    }

    // Determine period timing
    const periodSlot = defaultPeriodSlots.find((p) => p.period_index === Number(period_index)) || {
      period_index: Number(period_index),
      start_time: '09:00',
      end_time: '09:55',
    };

    // Resolve room details
    const matchedRoom = localClassrooms.find((r) => r.room_id === room_id || r.room_code === rawEntry.room_code);
    const room_code = matchedRoom ? matchedRoom.room_code : (rawEntry.room_code || 'R-204');

    // Resolve faculty details
    const facultyDir = TimetableImportService.getFacultyDirectory();
    const facultyList = Object.values(facultyDir.abbreviations);
    const matchedFac = facultyList.find((f: any) => f.id === primary_faculty_id || f.staffId === rawEntry.faculty_staff_id);
    const faculty_name = matchedFac ? matchedFac.name : (rawEntry.faculty_name || 'Prof. Faculty');
    const faculty_staff_id = matchedFac ? matchedFac.staffId : (rawEntry.faculty_staff_id || 'FAC');

    const newEntry: TimetableEntry = {
      entry_id: `entry-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timetable_id: tt.timetable_id,
      day_of_week: day_of_week as DayOfWeek,
      period_index: Number(period_index),
      start_time: rawEntry.start_time || periodSlot.start_time,
      end_time: rawEntry.end_time || periodSlot.end_time,
      subject_id: rawEntry.subject_id,
      subject_code: subject_code,
      subject_name: rawEntry.subject_name || subject_code,
      class_type: class_type,
      group_id: rawEntry.group_id || null,
      group_name: group_name,
      room_id: matchedRoom ? matchedRoom.room_id : (room_id || null),
      room_code: room_code,
      primary_faculty_id: primary_faculty_id,
      faculty_name: faculty_name,
      faculty_staff_id: faculty_staff_id,
      co_faculty_ids: rawEntry.co_faculty_ids || [],
      co_faculty_names: rawEntry.co_faculty_names || [],
      is_cancelled: false,
    };

    // Candidate entries include existing non-conflicting entries + this new entry
    const candidateEntries = [...tt.entries, newEntry];

    // Conflict check
    const conflicts = TimetableEngine.checkConflicts(candidateEntries, {
      timetable_id: tt.timetable_id,
      academic_calendar_term: tt.academic_calendar_term,
      course_id: tt.course_id,
      semester_id: tt.semester_id,
      section_id: tt.section_id,
    });

    if (conflicts.length > 0) {
      res.status(400).json({
        success: false,
        message: `Scheduling conflict detected: ${conflicts[0].message}`,
        conflicts,
      });
      return;
    }

    // Add entry and save
    tt.entries.push(newEntry);
    res.json({
      success: true,
      message: `Class period scheduled: ${newEntry.subject_code} on ${newEntry.day_of_week} (Period ${newEntry.period_index}).`,
      entry: newEntry,
      timetable: tt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 2. TIMETABLE MASTER LIST & RETRIEVAL
// =============================================================================

router.get(['/', '/list'], authenticate, async (req: Request, res: Response): Promise<void> => {
  const { course, semester, section, status } = req.query;

  let filtered = [...localTimetables];
  if (course) filtered = filtered.filter((t) => t.course_code === course);
  if (semester) filtered = filtered.filter((t) => t.semester_number === Number(semester));
  if (section) filtered = filtered.filter((t) => t.section_name === section);
  if (status) filtered = filtered.filter((t) => t.status === status);

  res.json({
    success: true,
    count: filtered.length,
    timetables: filtered.map((t) => ({
      timetable_id: t.timetable_id,
      academic_calendar_term: t.academic_calendar_term,
      department_name: t.department_name,
      course_code: t.course_code,
      course_name: t.course_name,
      semester_number: t.semester_number,
      section_name: t.section_name,
      effective_date: t.effective_date,
      version_number: t.version_number,
      status: t.status,
      entries_count: t.entries.length,
      created_at: t.created_at,
      published_at: t.published_at,
    })),
  });
});

// Specific /published route must precede parameterized /:id route
router.get('/published', async (req: Request, res: Response): Promise<void> => {
  const { course, semester, section } = req.query;
  const tt = localTimetables.find(
    (t) =>
      (!course || t.course_code === course) &&
      (!semester || t.semester_number === Number(semester)) &&
      (!section || t.section_name === section) &&
      t.status === 'PUBLISHED'
  );
  if (!tt) {
    res.status(404).json({ success: false, message: 'No published timetable found.' });
    return;
  }
  res.json({ success: true, timetable: tt });
});

// Delete published timetable by course, semester, section, or clear all
router.delete('/published', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { course, semester, section, term } = req.query;
  const initialCount = localTimetables.length;

  for (let i = localTimetables.length - 1; i >= 0; i--) {
    const t = localTimetables[i];
    const matchCourse = !course || t.course_code === course;
    const matchSem = !semester || t.semester_number === Number(semester);
    const matchSec = !section || t.section_name === section;
    const matchTerm = !term || t.academic_calendar_term === term;

    if (matchCourse && matchSem && matchSec && matchTerm) {
      localTimetables.splice(i, 1);
    }
  }

  const cleared = initialCount - localTimetables.length;
  res.json({ success: true, message: `Cleared ${cleared} timetable schedule(s).`, cleared });
});

// Delete specific timetable by ID
router.delete('/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const idx = localTimetables.findIndex((t) => t.timetable_id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'TIMETABLE_NOT_FOUND', message: `Timetable ${id} does not exist.` });
    return;
  }
  const [removed] = localTimetables.splice(idx, 1);
  res.json({
    success: true,
    message: `Timetable for ${removed.course_code} Sem ${removed.semester_number} (${removed.section_name}) deleted successfully.`,
  });
});

// Delete individual class entry from timetable
router.delete('/entries/:entryId', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { entryId } = req.params;
  let found = false;
  localTimetables.forEach((tt) => {
    const idx = tt.entries.findIndex((e) => e.entry_id === entryId);
    if (idx !== -1) {
      tt.entries.splice(idx, 1);
      found = true;
    }
  });

  if (!found) {
    res.status(404).json({ error: 'ENTRY_NOT_FOUND', message: 'Class period entry not found.' });
    return;
  }
  res.json({ success: true, message: 'Class period entry deleted successfully.' });
});

router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const tt = localTimetables.find((t) => t.timetable_id === id);
  if (!tt) {
    res.status(404).json({ error: 'TIMETABLE_NOT_FOUND', message: `Timetable ${id} does not exist.` });
    return;
  }
  res.json({ success: true, timetable: tt });
});

router.post(
  '/:id/entries',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tt = localTimetables.find((t) => t.timetable_id === id);
    if (!tt) {
      res.status(404).json({ error: 'TIMETABLE_NOT_FOUND', message: `Timetable ${id} does not exist.` });
      return;
    }

    const {
      day_of_week,
      period_index,
      start_time,
      end_time,
      subject_id,
      primary_faculty_id,
      room_id,
      class_type,
      group_id,
      group_name,
    } = req.body;

    const sub = localSubjects.find((s) => s.subject_id === subject_id);
    const teacher = localTeachers.find((t) => t.faculty_profile_id === primary_faculty_id);
    const room = localClassrooms.find((r) => r.room_id === room_id);

    const candidateEntry: TimetableEntry = {
      entry_id: `tte00000-0000-0000-0000-${String(tt.entries.length + 1).padStart(12, '0')}`,
      timetable_id: tt.timetable_id,
      day_of_week,
      period_index: Number(period_index),
      start_time: start_time || '09:00',
      end_time: end_time || '09:55',
      subject_id,
      subject_code: sub?.subject_code || req.body.subject_code || 'SUB-101',
      subject_name: sub?.subject_name || req.body.subject_name || 'Subject',
      class_type: class_type || 'THEORY',
      group_id: group_id || null,
      group_name: group_name || null,
      room_id: room_id || null,
      room_code: room?.room_code || req.body.room_code || 'R-101',
      primary_faculty_id,
      faculty_name: teacher?.full_name || req.body.faculty_name || 'Faculty Member',
      faculty_staff_id: teacher?.faculty_staff_id || req.body.faculty_staff_id || 'FAC-000',
    };

    const conflicts = TimetableEngine.checkConflicts([...tt.entries, candidateEntry], {
      timetable_id: tt.timetable_id,
      academic_calendar_term: tt.academic_calendar_term,
      course_id: tt.course_id,
      semester_id: tt.semester_id,
      section_id: tt.section_id,
    });

    if (conflicts.length > 0) {
      res.status(400).json({
        error: 'CONFLICTS_DETECTED',
        message: `Scheduling conflict detected: ${conflicts[0].message}`,
        conflicts,
      });
      return;
    }

    tt.entries.push(candidateEntry);
    res.status(201).json({ success: true, message: 'Timetable slot added successfully.', entry: candidateEntry });
  }
);

// =============================================================================
// 3. CONFLICT CHECKER ENDPOINT
// =============================================================================

router.post(
  '/check-conflicts',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { entries, metadata } = req.body;
      if (!Array.isArray(entries)) {
        res.status(400).json({ error: 'INVALID_ENTRIES', message: 'Entries array is required.' });
        return;
      }

      const conflicts = TimetableEngine.checkConflicts(entries, metadata || {
        academic_calendar_term: 'Autumn 2026',
        course_id: '',
        semester_id: '',
        section_id: '',
      });

      res.json({
        success: true,
        conflictsCount: conflicts.length,
        hasConflicts: conflicts.length > 0,
        conflicts,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'CONFLICT_CHECK_FAILED', message: err.message });
    }
  }
);


// =============================================================================
// 4. EXCEL IMPORT PREVIEW & COMMIT
// =============================================================================

router.post(
  '/import/preview',
  upload.single('file'),
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {

    try {
      if (!req.file || !req.file.buffer) {
        res.status(400).json({ error: 'FILE_REQUIRED', message: 'An Excel (.xlsx, .xls) file is required.' });
        return;
      }

      // Check if faculty overrides were provided
      let overrideMappings: Record<string, string> | undefined;
      if (req.body.mappings) {
        try {
          overrideMappings = typeof req.body.mappings === 'string'
            ? JSON.parse(req.body.mappings)
            : req.body.mappings;
        } catch {
          // ignore parsing error
        }
      }

      const preview = TimetableImportService.parseExcelWorkbook(req.file.buffer, overrideMappings);

      res.json({
        success: true,
        preview,
      });
    } catch (err: any) {
      console.error('Timetable import preview error:', err);
      res.status(500).json({ error: 'PARSING_ERROR', message: err.message || 'Failed to parse Excel timetable.' });
    }
  }
);

router.post(
  '/import/commit',
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { preview, enforceNoConflicts } = req.body;
      if (!preview || !preview.parsedEntries) {
        res.status(400).json({ error: 'PREVIEW_REQUIRED', message: 'Valid preview data is required to commit.' });
        return;
      }

      const userUid = req.user?.uid || 'admin-uid';
      const result = await TimetableImportService.commitTimetable(
        preview,
        userUid,
        enforceNoConflicts !== false
      );

      res.status(201).json({
        success: true,
        timetableId: result.timetableId,
        entriesCount: result.entriesCount,
        message: result.message,
      });
    } catch (err: any) {
      res.status(400).json({ error: 'COMMIT_FAILED', message: err.message });
    }
  }
);

// =============================================================================
// 5. TEACHER TIMETABLE SCHEDULE
// =============================================================================

router.get(
  '/teacher/schedule',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const teacherId = (req.query.facultyId as string) || req.user?.uid;
    const requestedDay = (req.query.day as string)?.toUpperCase();

    // Query active timetables for all entries where this teacher is primary or co-faculty
    const teacherAssignments: {
      timetable_id: string;
      course_code: string;
      semester_number: number;
      section_name: string;
      entry: TimetableEntry;
      sessionStatus: 'PENDING_ATTENDANCE' | 'REGISTER_DRAFT' | 'REGISTER_LOCKED';
    }[] = [];

    localTimetables
      .filter((t) => t.status === 'PUBLISHED')
      .forEach((tt) => {
        tt.entries.forEach((e) => {
          const isPrimary = e.primary_faculty_id === teacherId || e.faculty_staff_id === teacherId || req.user?.role === 'GLOBAL_ADMIN';
          const isCo = e.co_faculty_ids && e.co_faculty_ids.includes(teacherId || '');
          if (isPrimary || isCo) {
            if (!requestedDay || e.day_of_week === requestedDay) {
              teacherAssignments.push({
                timetable_id: tt.timetable_id,
                course_code: tt.course_code,
                semester_number: tt.semester_number,
                section_name: tt.section_name,
                entry: e,
                sessionStatus: 'PENDING_ATTENDANCE',
              });
            }
          }
        });
      });

    res.json({
      success: true,
      count: teacherAssignments.length,
      schedule: teacherAssignments,
    });
  }
);

// =============================================================================
// 6. TIMETABLE PUBLISHING & ARCHIVING
// =============================================================================

router.post(
  '/:id/publish',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tt = localTimetables.find((t) => t.timetable_id === id);
    if (!tt) {
      res.status(404).json({ error: 'TIMETABLE_NOT_FOUND', message: 'Timetable not found.' });
      return;
    }

    // Run backend conflict check
    const conflicts = TimetableEngine.checkConflicts(tt.entries, {
      timetable_id: tt.timetable_id,
      academic_calendar_term: tt.academic_calendar_term,
      course_id: tt.course_id,
      semester_id: tt.semester_id,
      section_id: tt.section_id,
    });

    if (conflicts.length > 0) {
      res.status(400).json({
        error: 'CONFLICTS_DETECTED',
        message: `Cannot publish timetable: ${conflicts.length} scheduling conflicts must be resolved first.`,
        conflicts,
      });
      return;
    }

    tt.status = 'PUBLISHED';
    tt.published_at = new Date().toISOString();

    res.json({ success: true, message: 'Timetable published successfully.', timetable: tt });
  }
);

router.post(
  '/:id/archive',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tt = localTimetables.find((t) => t.timetable_id === id);
    if (!tt) {
      res.status(404).json({ error: 'TIMETABLE_NOT_FOUND', message: 'Timetable not found.' });
      return;
    }
    tt.status = 'ARCHIVED';
    res.json({ success: true, message: 'Timetable archived successfully.', timetable: tt });
  }
);

// =============================================================================
// 7. CONVENIENCE & PORTAL ACCESS ENDPOINTS
// =============================================================================

// (Specific /published route moved above parameterized /:id route)

router.get('/preview/fixture', async (req: Request, res: Response): Promise<void> => {
  res.status(400).json({
    success: false,
    message: 'Mock fixture disabled. Please upload an authentic timetable file or create schedule manually.'
  });
});

router.post('/preview/fixture', async (req: Request, res: Response): Promise<void> => {
  res.status(400).json({
    success: false,
    message: 'Mock fixture disabled. Please upload an authentic timetable file or create schedule manually.'
  });
});

router.post('/commit', async (req: Request, res: Response): Promise<void> => {
  try {
    const { preview } = req.body;
    if (!preview) {
      res.status(400).json({ success: false, message: 'Preview payload required' });
      return;
    }
    const result = await TimetableImportService.commitTimetable(preview, 'admin-portal-user', false);
    res.json({ ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/conflicts/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const { entries, meta } = req.body;
    const conflicts = TimetableEngine.checkConflicts(entries || [], meta || {
      academic_calendar_term: 'Autumn 2026',
      course_id: '',
      semester_id: '',
      section_id: '',
    });
    res.json({ success: true, conflicts });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

