import * as xlsx from 'xlsx';
import { PoolClient } from 'pg';
import { runWithTransactionContext, pool } from '../config/db';
import { AuditService } from './audit';

// =============================================================================
// TIMETABLE & ACADEMIC DATA MODELS
// =============================================================================

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';
export type ClassType = 'THEORY' | 'PRACTICAL' | 'TUTORIAL' | 'LABORATORY' | 'ACTIVITY';
export type RoomType = 'LECTURE_HALL' | 'CLASSROOM' | 'LABORATORY' | 'SEMINAR_HALL';
export type TimetableStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';

export interface ClassroomLab {
  room_id: string;
  room_code: string;
  room_name: string;
  room_type: RoomType;
  capacity: number;
  department_id: string;
  is_active: boolean;
}

export interface PeriodSlot {
  period_index: number;
  period_label: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  is_instructional: boolean;
}

export interface SectionGroup {
  group_id: string;
  section_id: string;
  group_name: string; // e.g., 'C1', 'C2', 'All'
  description?: string;
  enrolled_student_ids: string[];
}

export interface TimetableEntry {
  entry_id: string;
  timetable_id: string;
  day_of_week: DayOfWeek;
  period_index: number;
  start_time: string;
  end_time: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  class_type: ClassType;
  group_id?: string | null;
  group_name?: string | null; // e.g. 'C1', 'C2' or null for whole section
  room_id?: string | null;
  room_code?: string | null;
  primary_faculty_id: string;
  faculty_name: string;
  faculty_staff_id: string;
  co_faculty_ids?: string[];
  co_faculty_names?: string[];
  is_cancelled?: boolean;
}

export interface TimetableMaster {
  timetable_id: string;
  academic_calendar_term: string;
  department_id: string;
  department_code: string;
  department_name: string;
  course_id: string;
  course_code: string;
  course_name: string;
  semester_id: string;
  semester_number: number;
  section_id: string;
  section_name: string;
  effective_date: string;
  version_number: number;
  status: TimetableStatus;
  created_by: string;
  created_at: string;
  published_at?: string | null;
  entries: TimetableEntry[];
}

export interface SchedulingConflict {
  type: 'TEACHER_OVERLAP' | 'ROOM_OVERLAP' | 'SECTION_OVERLAP' | 'GROUP_OVERLAP' | 'TIME_BOUNDARY' | 'INVALID_ASSIGNMENT';
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  day: DayOfWeek;
  period_index: number;
  timeSlot: string;
  conflictingEntity: string;
  details: {
    firstClass: string;
    secondClass: string;
    affectedTeacher?: string;
    affectedRoom?: string;
    affectedSection?: string;
    affectedGroup?: string;
  };
}

export interface FacultyMappingCandidate {
  abbreviation: string;
  matchedFacultyId?: string;
  matchedFacultyName?: string;
  matchedStaffId?: string;
  isAmbiguous: boolean;
  status: 'RESOLVED' | 'UNRESOLVED';
}

export interface TimetableImportPreview {
  sheetName: string;
  academicContext: {
    department: string;
    course: string;
    semester: number;
    section: string;
    academicTerm: string;
    effectiveDate: string;
  };
  totalEntriesFound: number;
  validEntriesCount: number;
  duplicateEntriesCount: number;
  unresolvedFacultyCount: number;
  conflictsCount: number;
  facultyMappings: FacultyMappingCandidate[];
  roomsDetected: string[];
  groupsDetected: string[];
  parsedEntries: TimetableEntry[];
  conflicts: SchedulingConflict[];
  warnings: string[];
}

// =============================================================================
// STATEFUL IN-MEMORY REPOSITORY (Initialized with Institutional Data)
// =============================================================================

export const localClassrooms: ClassroomLab[] = [
  { room_id: 'r0000000-0000-0000-0000-000000000001', room_code: 'R-101', room_name: 'Lecture Hall 101', room_type: 'LECTURE_HALL', capacity: 90, department_id: 'b0000000-0000-0000-0000-000000000001', is_active: true },
  { room_id: 'r0000000-0000-0000-0000-000000000002', room_code: 'R-102', room_name: 'Lecture Hall 102', room_type: 'LECTURE_HALL', capacity: 90, department_id: 'b0000000-0000-0000-0000-000000000001', is_active: true },
  { room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204', room_name: 'Academic Block B, Room 204', room_type: 'CLASSROOM', capacity: 80, department_id: 'b0000000-0000-0000-0000-000000000001', is_active: true },
  { room_id: 'r0000000-0000-0000-0000-000000000004', room_code: 'R-305', room_name: 'Academic Block B, Room 305', room_type: 'CLASSROOM', capacity: 80, department_id: 'b0000000-0000-0000-0000-000000000001', is_active: true },
  { room_id: 'r0000000-0000-0000-0000-000000000005', room_code: 'LAB-1', room_name: 'Software Engineering Laboratory (Lab 1)', room_type: 'LABORATORY', capacity: 45, department_id: 'b0000000-0000-0000-0000-000000000001', is_active: true },
  { room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3', room_name: 'Turing Computing Laboratory (Lab 3)', room_type: 'LABORATORY', capacity: 45, department_id: 'b0000000-0000-0000-0000-000000000001', is_active: true },
  { room_id: 'r0000000-0000-0000-0000-000000000007', room_code: 'LAB-4', room_name: 'Web & Cloud Laboratory (Lab 4)', room_type: 'LABORATORY', capacity: 45, department_id: 'b0000000-0000-0000-0000-000000000002', is_active: true },
  { room_id: 'r0000000-0000-0000-0000-000000000008', room_code: 'HARDWARE-LAB', room_name: 'Digital Electronics & Hardware Lab', room_type: 'LABORATORY', capacity: 40, department_id: 'b0000000-0000-0000-0000-000000000003', is_active: true },
];

export const defaultPeriodSlots: PeriodSlot[] = [
  { period_index: 1, period_label: 'Period 1', start_time: '09:00', end_time: '09:55', is_instructional: true },
  { period_index: 2, period_label: 'Period 2', start_time: '09:55', end_time: '10:50', is_instructional: true },
  { period_index: 3, period_label: 'Period 3', start_time: '10:50', end_time: '11:45', is_instructional: true },
  { period_index: 4, period_label: 'Period 4', start_time: '11:45', end_time: '12:40', is_instructional: true },
  { period_index: 5, period_label: 'Lunch Break', start_time: '12:40', end_time: '13:30', is_instructional: false },
  { period_index: 6, period_label: 'Period 5', start_time: '13:30', end_time: '14:25', is_instructional: true },
  { period_index: 7, period_label: 'Period 6', start_time: '14:25', end_time: '15:20', is_instructional: true },
  { period_index: 8, period_label: 'Period 7', start_time: '15:20', end_time: '16:15', is_instructional: true },
];

export const localSectionGroups: SectionGroup[] = [
  { group_id: 'grp-c1', section_id: 'sec-bca-5c', group_name: 'C1', description: 'Subgroup C1 (Roll No 1-40)', enrolled_student_ids: [] },
  { group_id: 'grp-c2', section_id: 'sec-bca-5c', group_name: 'C2', description: 'Subgroup C2 (Roll No 41-80)', enrolled_student_ids: [] },
];

export const localTimetables: TimetableMaster[] = [
  {
    timetable_id: 'tt-bca-5c-autumn-2026',
    academic_calendar_term: 'Autumn 2026',
    department_id: '10000000-0000-0000-0000-000000000004',
    department_code: 'CA',
    department_name: 'Department of Computer Applications',
    course_id: 'prog-bca',
    course_code: 'BCA',
    course_name: 'Bachelor of Computer Applications',
    semester_id: 'sem-bca-5',
    semester_number: 5,
    section_id: 'sec-bca-5c',
    section_name: 'C',
    effective_date: '2026-08-04',
    version_number: 1,
    status: 'PUBLISHED',
    created_by: 'ADM-001',
    created_at: '2026-08-01T00:00:00Z',
    published_at: '2026-08-04T00:00:00Z',
    entries: [
      // Monday
      { entry_id: 'e-mon-1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 1, start_time: '09:00', end_time: '09:55', subject_id: 'subj-501', subject_code: 'BCA-501', subject_name: 'Java Programming', class_type: 'THEORY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-mon-2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 2, start_time: '09:55', end_time: '10:50', subject_id: 'subj-502', subject_code: 'BCA-502', subject_name: 'Operating Systems', class_type: 'THEORY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-mon-3', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 3, start_time: '10:50', end_time: '11:45', subject_id: 'subj-503', subject_code: 'BCA-503', subject_name: 'Computer Networks', class_type: 'THEORY', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-mon-4', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 4, start_time: '11:45', end_time: '12:40', subject_id: 'subj-504', subject_code: 'BCA-504', subject_name: 'Database Management', class_type: 'THEORY', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-mon-5-c1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-os-lab', subject_code: 'Lab 3 (ND)', subject_name: 'OS Lab', class_type: 'LABORATORY', group_name: 'C1', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-mon-5-c2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-net-lab', subject_code: 'Lab 4 (Shiv P)', subject_name: 'Networks Lab', class_type: 'LABORATORY', group_name: 'C2', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000007', room_code: 'LAB-4' },
      { entry_id: 'e-mon-6-c1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-os-lab', subject_code: 'Lab 3 (ND)', subject_name: 'OS Lab', class_type: 'LABORATORY', group_name: 'C1', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-mon-6-c2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-net-lab', subject_code: 'Lab 4 (Shiv P)', subject_name: 'Networks Lab', class_type: 'LABORATORY', group_name: 'C2', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000007', room_code: 'LAB-4' },
      { entry_id: 'e-mon-7', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'MONDAY', period_index: 8, start_time: '15:20', end_time: '16:15', subject_id: 'subj-mentoring', subject_code: 'Mentoring / Remedial', subject_name: 'Mentoring / Remedial', class_type: 'ACTIVITY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      // Tuesday
      { entry_id: 'e-tue-1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 1, start_time: '09:00', end_time: '09:55', subject_id: 'subj-503', subject_code: 'BCA-503', subject_name: 'Computer Networks', class_type: 'THEORY', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-tue-2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 2, start_time: '09:55', end_time: '10:50', subject_id: 'subj-501', subject_code: 'BCA-501', subject_name: 'Java Programming', class_type: 'THEORY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-tue-3', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 3, start_time: '10:50', end_time: '11:45', subject_id: 'subj-504', subject_code: 'BCA-504', subject_name: 'Database Management', class_type: 'THEORY', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-tue-4', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 4, start_time: '11:45', end_time: '12:40', subject_id: 'subj-502', subject_code: 'BCA-502', subject_name: 'Operating Systems', class_type: 'THEORY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-tue-5-c1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-net-lab', subject_code: 'Lab 4 (Shiv P)', subject_name: 'Networks Lab', class_type: 'LABORATORY', group_name: 'C1', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000007', room_code: 'LAB-4' },
      { entry_id: 'e-tue-5-c2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-os-lab', subject_code: 'Lab 3 (ND)', subject_name: 'OS Lab', class_type: 'LABORATORY', group_name: 'C2', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-tue-6-c1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-net-lab', subject_code: 'Lab 4 (Shiv P)', subject_name: 'Networks Lab', class_type: 'LABORATORY', group_name: 'C1', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000007', room_code: 'LAB-4' },
      { entry_id: 'e-tue-6-c2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-os-lab', subject_code: 'Lab 3 (ND)', subject_name: 'OS Lab', class_type: 'LABORATORY', group_name: 'C2', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-tue-7', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'TUESDAY', period_index: 8, start_time: '15:20', end_time: '16:15', subject_id: 'subj-lib', subject_code: 'Library / Self Study', subject_name: 'Library & Research', class_type: 'ACTIVITY', primary_faculty_id: 'fac-pp', faculty_name: 'Dr. Priya Patel', faculty_staff_id: 'FAC-005', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      // Wednesday
      { entry_id: 'e-wed-1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'WEDNESDAY', period_index: 1, start_time: '09:00', end_time: '09:55', subject_id: 'subj-502', subject_code: 'BCA-502', subject_name: 'Operating Systems', class_type: 'THEORY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-wed-2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'WEDNESDAY', period_index: 2, start_time: '09:55', end_time: '10:50', subject_id: 'subj-503', subject_code: 'BCA-503', subject_name: 'Computer Networks', class_type: 'THEORY', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-wed-3', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'WEDNESDAY', period_index: 3, start_time: '10:50', end_time: '11:45', subject_id: 'subj-501', subject_code: 'BCA-501', subject_name: 'Java Programming', class_type: 'THEORY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-wed-4', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'WEDNESDAY', period_index: 4, start_time: '11:45', end_time: '12:40', subject_id: 'subj-505', subject_code: 'BCA-505', subject_name: 'Web Frameworks', class_type: 'THEORY', primary_faculty_id: 'fac-pp', faculty_name: 'Dr. Priya Patel', faculty_staff_id: 'FAC-005', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-wed-5', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'WEDNESDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-504', subject_code: 'BCA-504', subject_name: 'Database Management', class_type: 'THEORY', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-wed-6', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'WEDNESDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-placement', subject_code: 'Placement Training', subject_name: 'Placement Training', class_type: 'ACTIVITY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000001', room_code: 'LH-101' },
      { entry_id: 'e-wed-7', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'WEDNESDAY', period_index: 8, start_time: '15:20', end_time: '16:15', subject_id: 'subj-placement', subject_code: 'Placement Training', subject_name: 'Placement Training', class_type: 'ACTIVITY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000001', room_code: 'LH-101' },
      // Thursday
      { entry_id: 'e-thu-1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 1, start_time: '09:00', end_time: '09:55', subject_id: 'subj-504', subject_code: 'BCA-504', subject_name: 'Database Management', class_type: 'THEORY', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-thu-2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 2, start_time: '09:55', end_time: '10:50', subject_id: 'subj-505', subject_code: 'BCA-505', subject_name: 'Web Frameworks', class_type: 'THEORY', primary_faculty_id: 'fac-pp', faculty_name: 'Dr. Priya Patel', faculty_staff_id: 'FAC-005', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-thu-3', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 3, start_time: '10:50', end_time: '11:45', subject_id: 'subj-502', subject_code: 'BCA-502', subject_name: 'Operating Systems', class_type: 'THEORY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-thu-4', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 4, start_time: '11:45', end_time: '12:40', subject_id: 'subj-501', subject_code: 'BCA-501', subject_name: 'Java Programming', class_type: 'THEORY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-thu-5-c1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-web-lab', subject_code: 'Web Lab (Sanjay K)', subject_name: 'Web Technologies Lab', class_type: 'LABORATORY', group_name: 'C1', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000007', room_code: 'LAB-4' },
      { entry_id: 'e-thu-5-c2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-proj-lab', subject_code: 'Project Lab (Rajesh S)', subject_name: 'Capstone Project Lab', class_type: 'LABORATORY', group_name: 'C2', primary_faculty_id: 'fac-rs', faculty_name: 'Dr. Rajesh Sharma', faculty_staff_id: 'FAC-006', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-thu-6-c1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-web-lab', subject_code: 'Web Lab (Sanjay K)', subject_name: 'Web Technologies Lab', class_type: 'LABORATORY', group_name: 'C1', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000007', room_code: 'LAB-4' },
      { entry_id: 'e-thu-6-c2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-proj-lab', subject_code: 'Project Lab (Rajesh S)', subject_name: 'Capstone Project Lab', class_type: 'LABORATORY', group_name: 'C2', primary_faculty_id: 'fac-rs', faculty_name: 'Dr. Rajesh Sharma', faculty_staff_id: 'FAC-006', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-thu-7', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'THURSDAY', period_index: 8, start_time: '15:20', end_time: '16:15', subject_id: 'subj-seminar', subject_code: 'Seminar / Activity', subject_name: 'Seminar / Activity', class_type: 'ACTIVITY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      // Friday
      { entry_id: 'e-fri-1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'FRIDAY', period_index: 1, start_time: '09:00', end_time: '09:55', subject_id: 'subj-501', subject_code: 'BCA-501', subject_name: 'Java Programming', class_type: 'THEORY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-fri-2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'FRIDAY', period_index: 2, start_time: '09:55', end_time: '10:50', subject_id: 'subj-502', subject_code: 'BCA-502', subject_name: 'Operating Systems', class_type: 'THEORY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-fri-3', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'FRIDAY', period_index: 3, start_time: '10:50', end_time: '11:45', subject_id: 'subj-503', subject_code: 'BCA-503', subject_name: 'Computer Networks', class_type: 'THEORY', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-fri-4', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'FRIDAY', period_index: 4, start_time: '11:45', end_time: '12:40', subject_id: 'subj-504', subject_code: 'BCA-504', subject_name: 'Database Management', class_type: 'THEORY', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-fri-5', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'FRIDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-mini-proj', subject_code: 'Mini Project Guidance (Shiv P)', subject_name: 'Mini Project Guidance', class_type: 'PRACTICAL', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-fri-6', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'FRIDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-mini-proj', subject_code: 'Mini Project Guidance (Shiv P)', subject_name: 'Mini Project Guidance', class_type: 'PRACTICAL', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000006', room_code: 'LAB-3' },
      { entry_id: 'e-fri-7', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'FRIDAY', period_index: 8, start_time: '15:20', end_time: '16:15', subject_id: 'subj-sports', subject_code: 'Sports & Cultural', subject_name: 'Sports & Cultural Activities', class_type: 'ACTIVITY', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      // Saturday
      { entry_id: 'e-sat-1', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'SATURDAY', period_index: 1, start_time: '09:00', end_time: '09:55', subject_id: 'subj-505', subject_code: 'BCA-505', subject_name: 'Web Frameworks', class_type: 'THEORY', primary_faculty_id: 'fac-pp', faculty_name: 'Dr. Priya Patel', faculty_staff_id: 'FAC-005', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-sat-2', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'SATURDAY', period_index: 2, start_time: '09:55', end_time: '10:50', subject_id: 'subj-503', subject_code: 'BCA-503', subject_name: 'Computer Networks', class_type: 'THEORY', primary_faculty_id: 'fac-sp', faculty_name: 'Dr. Shiv Prasad', faculty_staff_id: 'FAC-003', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-sat-3', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'SATURDAY', period_index: 3, start_time: '10:50', end_time: '11:45', subject_id: 'subj-502', subject_code: 'BCA-502', subject_name: 'Operating Systems', class_type: 'THEORY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-sat-4', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'SATURDAY', period_index: 4, start_time: '11:45', end_time: '12:40', subject_id: 'subj-tech-comm', subject_code: 'Technical Communication (SS)', subject_name: 'Technical Communication', class_type: 'THEORY', primary_faculty_id: 'fac-ssv', faculty_name: 'Dr. S.S. Verma', faculty_staff_id: 'FAC-001', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-sat-5', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'SATURDAY', period_index: 6, start_time: '13:30', end_time: '14:25', subject_id: 'subj-remedial', subject_code: 'Remedial / Doubt Clearing', subject_name: 'Remedial / Doubt Clearing', class_type: 'ACTIVITY', primary_faculty_id: 'fac-sk', faculty_name: 'Dr. Sanjay Kumar', faculty_staff_id: 'FAC-004', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' },
      { entry_id: 'e-sat-6', timetable_id: 'tt-bca-5c-autumn-2026', day_of_week: 'SATURDAY', period_index: 7, start_time: '14:25', end_time: '15:20', subject_id: 'subj-clubs', subject_code: 'Student Club Activities', subject_name: 'Student Club Activities', class_type: 'ACTIVITY', primary_faculty_id: 'fac-nd', faculty_name: 'Dr. Neha Dave', faculty_staff_id: 'FAC-002', room_id: 'r0000000-0000-0000-0000-000000000003', room_code: 'R-204' }
    ]
  }
];

// =============================================================================
// CONFLICT DETECTION & VALIDATION ENGINE
// =============================================================================

export class TimetableEngine {
  /**
   * Evaluates conflicts within a candidate set of entries, and optionally against other published timetables.
   */
  public static checkConflicts(
    candidateEntries: TimetableEntry[],
    timetableMeta: {
      timetable_id?: string;
      academic_calendar_term: string;
      course_id: string;
      semester_id: string;
      section_id: string;
    },
    existingTimetables: TimetableMaster[] = localTimetables
  ): SchedulingConflict[] {
    const conflicts: SchedulingConflict[] = [];

    // Filter to other published timetables in the same term (excluding the target section being updated)
    const otherPublishedEntries: { entry: TimetableEntry; timetable: TimetableMaster }[] = [];
    existingTimetables.forEach((tt) => {
      const isCurrentSection =
        (timetableMeta.section_id && tt.section_id === timetableMeta.section_id) ||
        (timetableMeta.timetable_id && tt.timetable_id === timetableMeta.timetable_id);

      if (
        tt.status === 'PUBLISHED' &&
        tt.academic_calendar_term === timetableMeta.academic_calendar_term &&
        !isCurrentSection
      ) {
        tt.entries.forEach((e) => {
          if (!e.is_cancelled) {
            otherPublishedEntries.push({ entry: e, timetable: tt });
          }
        });
      }
    });

    // 1. In-Batch & Cross-Timetable Validation
    for (let i = 0; i < candidateEntries.length; i++) {
      const a = candidateEntries[i];
      if (a.is_cancelled) continue;

      // Check intra-batch collisions with subsequent entries
      for (let j = i + 1; j < candidateEntries.length; j++) {
        const b = candidateEntries[j];
        if (b.is_cancelled) continue;

        if (a.day_of_week === b.day_of_week && a.period_index === b.period_index) {
          const timeSlot = `${a.start_time} - ${a.end_time}`;

          // A. Teacher Double Booking
          if (a.primary_faculty_id && a.primary_faculty_id === b.primary_faculty_id) {
            conflicts.push({
              type: 'TEACHER_OVERLAP',
              severity: 'CRITICAL',
              message: `Teacher ${a.faculty_name} (${a.faculty_staff_id}) is assigned to two overlapping classes at the same period.`,
              day: a.day_of_week,
              period_index: a.period_index,
              timeSlot,
              conflictingEntity: a.faculty_name,
              details: {
                firstClass: `${a.subject_code} (${a.group_name || 'Entire Section'})`,
                secondClass: `${b.subject_code} (${b.group_name || 'Entire Section'})`,
                affectedTeacher: a.faculty_name,
              },
            });
          }

          // B. Room Double Booking
          if (a.room_id && b.room_id && a.room_id === b.room_id) {
            conflicts.push({
              type: 'ROOM_OVERLAP',
              severity: 'CRITICAL',
              message: `Room/Laboratory ${a.room_code} is double-booked for two separate classes simultaneously.`,
              day: a.day_of_week,
              period_index: a.period_index,
              timeSlot,
              conflictingEntity: a.room_code || 'Room',
              details: {
                firstClass: `${a.subject_code} by ${a.faculty_name}`,
                secondClass: `${b.subject_code} by ${b.faculty_name}`,
                affectedRoom: a.room_code || undefined,
              },
            });
          }

          // C. Section Collision (Applies only when entries belong to the same section or same timetable)
          const isSameSection = !a.timetable_id || !b.timetable_id || a.timetable_id === b.timetable_id;
          if (isSameSection) {
            const isParallelSubgroup =
              Boolean(a.group_name &&
              b.group_name &&
              a.group_name !== b.group_name &&
              a.group_name !== 'All' &&
              b.group_name !== 'All');

            if (!isParallelSubgroup) {
              conflicts.push({
                type: a.group_name && a.group_name === b.group_name ? 'GROUP_OVERLAP' : 'SECTION_OVERLAP',
                severity: 'CRITICAL',
                message: `Section or practical group ${a.group_name || 'Whole Section'} has conflicting parallel classes scheduled.`,
                day: a.day_of_week,
                period_index: a.period_index,
                timeSlot,
                conflictingEntity: a.group_name || 'Section',
                details: {
                  firstClass: `${a.subject_code} (${a.group_name || 'Whole Section'})`,
                  secondClass: `${b.subject_code} (${b.group_name || 'Whole Section'})`,
                  affectedGroup: a.group_name || undefined,
                },
              });
            }
          }
        }
      }

      // Check external published timetables (cross-section collisions)
      for (const other of otherPublishedEntries) {
        const b = other.entry;
        if (a.day_of_week === b.day_of_week && a.period_index === b.period_index) {
          const timeSlot = `${a.start_time} - ${a.end_time}`;

          // Teacher clash across different sections/courses
          if (a.primary_faculty_id && a.primary_faculty_id === b.primary_faculty_id) {
            conflicts.push({
              type: 'TEACHER_OVERLAP',
              severity: 'CRITICAL',
              message: `Teacher ${a.faculty_name} is already committed to teach ${other.timetable.course_code} Sec ${other.timetable.section_name} (${b.subject_code}) on ${a.day_of_week} at ${timeSlot}.`,
              day: a.day_of_week,
              period_index: a.period_index,
              timeSlot,
              conflictingEntity: a.faculty_name,
              details: {
                firstClass: `This schedule: ${a.subject_code}`,
                secondClass: `${other.timetable.course_code} Sec ${other.timetable.section_name}: ${b.subject_code}`,
                affectedTeacher: a.faculty_name,
              },
            });
          }

          // Room clash across different sections/courses
          if (a.room_id && b.room_id && a.room_id === b.room_id) {
            conflicts.push({
              type: 'ROOM_OVERLAP',
              severity: 'CRITICAL',
              message: `Room/Lab ${a.room_code} is already allocated to ${other.timetable.course_code} Sec ${other.timetable.section_name} on ${a.day_of_week} at ${timeSlot}.`,
              day: a.day_of_week,
              period_index: a.period_index,
              timeSlot,
              conflictingEntity: a.room_code || 'Room',
              details: {
                firstClass: `This schedule: ${a.subject_code}`,
                secondClass: `${other.timetable.course_code} Sec ${other.timetable.section_name}: ${b.subject_code}`,
                affectedRoom: a.room_code || undefined,
              },
            });
          }
        }
      }
    }

    return conflicts;
  }
}

let registeredTeachersProvider: () => Array<{ id: string; name: string; staffId: string; status?: string }> = () => [];
export function setRegisteredTeachersProvider(provider: () => Array<{ id: string; name: string; staffId: string; status?: string }>): void {
  registeredTeachersProvider = provider;
}

// =============================================================================
// EXCEL TIMETABLE IMPORT & INTERPRETATION SERVICE
// =============================================================================

export class TimetableImportService {
  /**
   * Known faculty directory dictionary for automatic resolution of initials / abbreviations.
   * Derived dynamically from registered faculty without hardcoded mock entries.
   */
  public static getFacultyDirectory(): {
    abbreviations: Record<string, { id: string; name: string; staffId: string }>;
  } {
    const abbreviations: Record<string, { id: string; name: string; staffId: string }> = {};
    const teachers = registeredTeachersProvider();
    teachers.forEach((t) => {
      if (t.name) {
        const cleanName = t.name.replace(/^(?:Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim();
        const cleanInitials = cleanName
          .split(' ')
          .map((part) => part[0])
          .join('')
          .toUpperCase();
        if (cleanInitials) {
          abbreviations[cleanInitials] = { id: t.id, name: t.name, staffId: t.staffId };
        }
        const nameParts = cleanName.split(' ');
        if (nameParts.length >= 2) {
          const shortName = `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}`.toUpperCase();
          abbreviations[shortName] = { id: t.id, name: t.name, staffId: t.staffId };
        }
        const initials = t.name
          .split(' ')
          .map((part) => part[0])
          .join('')
          .toUpperCase();
        if (initials) {
          abbreviations[initials] = { id: t.id, name: t.name, staffId: t.staffId };
        }
        abbreviations[t.name.toUpperCase()] = { id: t.id, name: t.name, staffId: t.staffId };
        abbreviations[cleanName.toUpperCase()] = { id: t.id, name: t.name, staffId: t.staffId };
      }
      if (t.staffId) {
        abbreviations[t.staffId.toUpperCase()] = { id: t.id, name: t.name, staffId: t.staffId };
      }
    });

    return { abbreviations };
  }

  /**
   * Parses an Excel Timetable file buffer into a comprehensive Dry-Run Preview.
   */
  public static parseExcelWorkbook(
    buffer: Buffer,
    overrideMappings?: Record<string, string> // e.g. { 'F2': 'faculty-uuid-...', 'F3': 'faculty-uuid-...' }
  ): TimetableImportPreview {
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0] || 'Timetable';
    const ws = wb.Sheets[sheetName];

    // Read full sheet raw grid
    const rawData: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // 1. Discover header context (Department, Course, Semester, Section, Effective Date)
    let department = 'Department of Computer Applications';
    let course = 'BCA';
    let semester = 5;
    let section = 'C';
    let academicTerm = 'August 2026 - January 2027';
    let effectiveDate = '2026-08-04';

    // Scan top 6 rows for metadata strings
    for (let r = 0; r < Math.min(6, rawData.length); r++) {
      const rowStr = rawData[r].join(' ').toUpperCase();
      if (rowStr.includes('COMPUTER SCIENCE') || rowStr.includes('CSE')) {
        department = 'Department of Computer Science & Engineering';
      }
      if (rowStr.includes('BCA')) course = 'BCA';
      if (rowStr.includes('B.TECH') || rowStr.includes('BTECH')) course = 'BTECH-CSE';
      if (rowStr.includes('V') || rowStr.includes('5TH') || rowStr.includes('SEM 5')) semester = 5;
      if (rowStr.includes('III') || rowStr.includes('3RD') || rowStr.includes('SEM 3')) semester = 3;
      if (rowStr.includes('I') && !rowStr.includes('III') && !rowStr.includes('V')) semester = 1;
      if (rowStr.includes('SEC C') || rowStr.includes('SECTION C') || rowStr.includes('(V-C)') || rowStr.includes('V-C')) section = 'C';
      if (rowStr.includes('SEC A') || rowStr.includes('SECTION A')) section = 'A';
      if (rowStr.includes('SEC B') || rowStr.includes('SECTION B')) section = 'B';
      if (rowStr.includes('2026') || rowStr.includes('AUG')) {
        effectiveDate = '2026-08-04';
      }
    }

    const facultyDirectory = this.getFacultyDirectory().abbreviations;
    const detectedFacultyAbbrs = new Set<string>();
    const detectedRooms = new Set<string>();
    const detectedGroups = new Set<string>();
    const parsedEntries: TimetableEntry[] = [];
    const warnings: string[] = [];

    // Standard institutional days
    const dayKeywords: Record<string, DayOfWeek> = {
      'MON': 'MONDAY',
      'MONDAY': 'MONDAY',
      'TUE': 'TUESDAY',
      'TUESDAY': 'TUESDAY',
      'WED': 'WEDNESDAY',
      'WEDNESDAY': 'WEDNESDAY',
      'THU': 'THURSDAY',
      'THURSDAY': 'THURSDAY',
      'FRI': 'FRIDAY',
      'FRIDAY': 'FRIDAY',
      'SAT': 'SATURDAY',
      'SATURDAY': 'SATURDAY',
    };

    // Locate header row containing period indices / time slots
    let headerRowIdx = -1;
    for (let r = 0; r < rawData.length; r++) {
      const row = rawData[r];
      const hasDay = row.some((c: any) => String(c).trim().toUpperCase() in dayKeywords || String(c).trim().toUpperCase() === 'DAY');
      const hasPeriod = row.some((c: any) => /P(?:ERIOD)?\s*[1-8]/i.test(String(c)) || /\d{1,2}:\d{2}/.test(String(c)));
      if (hasDay || hasPeriod) {
        headerRowIdx = r;
        break;
      }
    }

    // Default column to period mapping (Col 1-4 = P1-P4, Col 5 = Lunch, Col 6-8 = P5-P7)
    const colToPeriodMap: Record<number, number> = {
      1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8
    };

    // Parse grid rows
    const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 4;
    for (let r = startRow; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0] || '').trim().toUpperCase();
      const matchedDay = dayKeywords[firstCell];
      if (!matchedDay) continue;

      // Iterate through period columns
      for (let c = 1; c < Math.min(row.length, 9); c++) {
        const cellContent = String(row[c] || '').trim();
        if (!cellContent || cellContent === '-' || cellContent.toUpperCase() === 'LUNCH' || cellContent.toUpperCase() === 'BREAK') {
          continue;
        }

        const periodIdx = colToPeriodMap[c] || c;
        const periodSlot = defaultPeriodSlots.find((p) => p.period_index === periodIdx) || {
          start_time: '09:00',
          end_time: '09:55',
        };

        // Distinguish parallel practical subgroups (C1/C2) from multi-line single lecture cells (Subject \n Room)
        let lines: string[] = [];
        const hasSubgroups = /(?:^|\n|\/)\s*(?:C[12]|G[12]|GROUP\s*[12])[:\s-]/i.test(cellContent);

        if (hasSubgroups) {
          lines = cellContent.split(/\r?\n|\s*\/\s*(?=[A-Z0-9]+:)/).filter((l) => l.trim().length > 0);
        } else {
          lines = [cellContent];
        }

        lines.forEach((line) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          // Detect group (e.g. C1, C2)
          let groupName: string | null = null;
          const groupMatch = /^(C[12]|G[12]|GROUP\s*[12])[:\s-]/i.exec(trimmedLine);
          if (groupMatch) {
            groupName = groupMatch[1].toUpperCase();
            detectedGroups.add(groupName);
          }

          // Detect Room / Lab
          let roomCode: string = 'R-204';
          const roomMatch = /(LAB[- ]?\d+|R[- ]?\d+|LH[- ]?\d+|ROOM[- ]?\d+|WEB[- ]?LAB|PROJECT[- ]?LAB|HARDWARE[- ]?LAB)/i.exec(trimmedLine);
          if (roomMatch) {
            roomCode = roomMatch[1].toUpperCase().replace(/\s+/, '-');
            if (roomCode === 'WEB-LAB') roomCode = 'LAB-4';
            if (roomCode === 'PROJECT-LAB') roomCode = 'LAB-1';
            detectedRooms.add(roomCode);
          } else if (/WEB\s*LAB/i.test(trimmedLine)) {
            roomCode = 'LAB-4';
            detectedRooms.add(roomCode);
          } else if (/PROJECT\s*LAB/i.test(trimmedLine)) {
            roomCode = 'LAB-1';
            detectedRooms.add(roomCode);
          }


          // Detect Subject Code / Title
          let subjectCode = 'BCA-501';
          let subjectName = 'Advanced Web Technologies';
          const subjMatch = /(BCA[- ]?\d{3}|CSE[- ]?\d{3}|CS[- ]?\d{3})/i.exec(trimmedLine);
          if (subjMatch) {
            subjectCode = subjMatch[1].toUpperCase().replace(/\s+/, '-');
            subjectName = `Course Subject ${subjectCode}`;
          } else if (/JAVA|PYTHON|DATABASE|NETWORK|CLOUD|PROJECT|SEMINAR|INTERNSHIP/i.test(trimmedLine)) {
            const word = /JAVA|PYTHON|DATABASE|NETWORK|CLOUD|PROJECT|SEMINAR|INTERNSHIP/i.exec(trimmedLine)![0].toUpperCase();
            subjectCode = `BCA-${word.substring(0, 4)}`;
            subjectName = `${word} Programming & Application`;
          }

          // Detect Class Type
          let classType: ClassType = 'THEORY';
          if (/LAB|PRACTICAL/i.test(trimmedLine) || roomCode.includes('LAB') || groupName !== null) {
            classType = 'PRACTICAL';
          } else if (/TUTORIAL|TUT/i.test(trimmedLine)) {
            classType = 'TUTORIAL';
          } else if (/PROJECT|SEMINAR|ACTIVITY/i.test(trimmedLine)) {
            classType = 'ACTIVITY';
          }

          // Detect Faculty Abbreviation (in parentheses or following subject)
          // e.g. (SS), (ND), (Shiv P), (Sanjay K), (F2), (F3)
          let facultyAbbr = 'SS';
          const facultyParenMatch = /\(([A-Za-z0-9\s.]+)\)/.exec(trimmedLine);
          if (facultyParenMatch) {
            facultyAbbr = facultyParenMatch[1].trim().toUpperCase();
          } else {
            // Check known abbreviations
            for (const k of Object.keys(facultyDirectory)) {
              if (new RegExp(`\\b${k}\\b`, 'i').test(trimmedLine)) {
                facultyAbbr = k;
                break;
              }
            }
          }
          detectedFacultyAbbrs.add(facultyAbbr);

          // Resolve faculty
          let facultyId = '30000000-0000-0000-0000-000000000005';
          let facultyName = `Faculty (${facultyAbbr})`;
          let staffId = `FAC-${facultyAbbr}`;

          if (overrideMappings && overrideMappings[facultyAbbr]) {
            facultyId = overrideMappings[facultyAbbr];
            facultyName = `Assigned Faculty (${facultyAbbr})`;
          } else if (facultyDirectory[facultyAbbr]) {
            const resolved = facultyDirectory[facultyAbbr];
            facultyId = resolved.id;
            facultyName = resolved.name;
            staffId = resolved.staffId;
          }

          parsedEntries.push({
            entry_id: `entry-${matchedDay}-${periodIdx}-${groupName || 'ALL'}-${parsedEntries.length + 1}`,
            timetable_id: 'preview-id',
            day_of_week: matchedDay,
            period_index: periodIdx,
            start_time: periodSlot.start_time,
            end_time: periodSlot.end_time,
            subject_id: `subj-${subjectCode}`,
            subject_code: subjectCode,
            subject_name: subjectName,
            class_type: classType,
            group_id: groupName ? `group-${groupName}` : null,
            group_name: groupName,
            room_id: `room-${roomCode}`,
            room_code: roomCode,
            primary_faculty_id: facultyId,
            faculty_name: facultyName,
            faculty_staff_id: staffId,
          });
        });
      }
    }

    // Build faculty mapping report
    const facultyMappings: FacultyMappingCandidate[] = [];
    detectedFacultyAbbrs.forEach((abbr) => {
      const isOverridden = overrideMappings && overrideMappings[abbr];
      const resolved = facultyDirectory[abbr];
      if (isOverridden) {
        facultyMappings.push({
          abbreviation: abbr,
          matchedFacultyId: overrideMappings![abbr],
          matchedFacultyName: `User-Mapped (${abbr})`,
          isAmbiguous: false,
          status: 'RESOLVED',
        });
      } else if (resolved) {
        facultyMappings.push({
          abbreviation: abbr,
          matchedFacultyId: resolved.id,
          matchedFacultyName: resolved.name,
          matchedStaffId: resolved.staffId,
          isAmbiguous: false,
          status: 'RESOLVED',
        });
      } else {
        facultyMappings.push({
          abbreviation: abbr,
          isAmbiguous: true,
          status: 'UNRESOLVED',
        });
        warnings.push(`Faculty code "${abbr}" is ambiguous or unmapped. Administrator mapping is required prior to publication.`);
      }
    });

    // Run conflict detection on parsed entries
    const conflicts = TimetableEngine.checkConflicts(parsedEntries, {
      academic_calendar_term: academicTerm,
      course_id: 'c0000000-0000-0000-0000-000000000001',
      semester_id: 'e0000000-0000-0000-0000-000000000005',
      section_id: 'f0000000-0000-0000-0000-000000000003',
    });

    const unresolvedCount = facultyMappings.filter((f) => f.status === 'UNRESOLVED').length;

    return {
      sheetName,
      academicContext: {
        department,
        course,
        semester,
        section,
        academicTerm,
        effectiveDate,
      },
      totalEntriesFound: parsedEntries.length,
      validEntriesCount: parsedEntries.length - conflicts.length,
      duplicateEntriesCount: 0,
      unresolvedFacultyCount: unresolvedCount,
      conflictsCount: conflicts.length,
      facultyMappings,
      roomsDetected: Array.from(detectedRooms),
      groupsDetected: Array.from(detectedGroups),
      parsedEntries,
      conflicts,
      warnings,
    };
  }

  /**
   * Commits an interpreted timetable to the stateful store / database.
   */
  public static async commitTimetable(
    preview: TimetableImportPreview,
    userUid: string,
    enforceNoConflicts: boolean = true
  ): Promise<{ success: boolean; timetableId: string; entriesCount: number; message: string }> {
    if (preview.unresolvedFacultyCount > 0) {
      throw new Error(`Cannot commit timetable: ${preview.unresolvedFacultyCount} faculty abbreviations are unresolved. Please map all faculty codes.`);
    }

    if (enforceNoConflicts && preview.conflicts.length > 0) {
      throw new Error(`Cannot commit timetable: ${preview.conflicts.length} scheduling conflicts detected.`);
    }

    const timetableId = `tt-${Date.now()}`;
    const newMaster: TimetableMaster = {
      timetable_id: timetableId,
      academic_calendar_term: preview.academicContext.academicTerm,
      department_id: 'b0000000-0000-0000-0000-000000000001',
      department_code: 'CA',
      department_name: preview.academicContext.department,
      course_id: 'c0000000-0000-0000-0000-000000000001',
      course_code: preview.academicContext.course,
      course_name: 'Bachelor of Computer Applications',
      semester_id: 'e0000000-0000-0000-0000-000000000005',
      semester_number: preview.academicContext.semester,
      section_id: 'f0000000-0000-0000-0000-000000000003',
      section_name: preview.academicContext.section,
      effective_date: preview.academicContext.effectiveDate,
      version_number: 1,
      status: 'PUBLISHED',
      created_by: userUid,
      created_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      entries: preview.parsedEntries.map((e, idx) => ({
        ...e,
        entry_id: `${timetableId}-e${idx + 1}`,
        timetable_id: timetableId,
      })),
    };

    // Prevent duplicate entries by deactivating or replacing prior active timetable for this section
    const existingIdx = localTimetables.findIndex(
      (t) =>
        t.course_code === newMaster.course_code &&
        t.semester_number === newMaster.semester_number &&
        t.section_name === newMaster.section_name &&
        t.status === 'PUBLISHED'
    );
    if (existingIdx >= 0) {
      localTimetables[existingIdx].status = 'ARCHIVED';
    }

    localTimetables.push(newMaster);

    // Automatically synchronize published timetable entries into faculty teaching allocations
    if (newMaster.status === 'PUBLISHED') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { localAssignments, localSubjects } = require('../routes/admin.routes');
        newMaster.entries.forEach((e) => {
          if (e.primary_faculty_id && e.subject_code) {
            const exists = localAssignments.some(
              (a: any) =>
                (a.faculty_profile_id === e.primary_faculty_id || a.faculty_staff_id === e.faculty_staff_id) &&
                (a.subject_id === e.subject_id || a.subject_code.toLowerCase() === e.subject_code.toLowerCase()) &&
                (a.section_id === newMaster.section_id || a.section_name.toLowerCase() === newMaster.section_name.toLowerCase()) &&
                a.is_active
            );
            if (!exists) {
              const sub = localSubjects.find(
                (s: any) => s.subject_id === e.subject_id || s.subject_code.toLowerCase() === e.subject_code.toLowerCase()
              );
              localAssignments.push({
                assignment_id: `40000000-0000-0000-0000-${String(localAssignments.length + 10).padStart(12, '0')}`,
                faculty_profile_id: e.primary_faculty_id,
                subject_id: sub?.subject_id || e.subject_id,
                subject_code: e.subject_code,
                subject_name: e.subject_name,
                section_id: newMaster.section_id,
                section_name: newMaster.section_name,
                course_code: newMaster.course_code,
                course_name: newMaster.course_name,
                semester_number: newMaster.semester_number,
                academic_calendar_term: newMaster.academic_calendar_term,
                is_active: true,
              });
            }
          }
        });
      } catch (err) {
        // Continue silently if module cycle during bootstrap
      }
    }

    return {
      success: true,
      timetableId,
      entriesCount: newMaster.entries.length,
      message: `Timetable successfully published with ${newMaster.entries.length} scheduled periods across Monday to Saturday.`,
    };
  }
}

