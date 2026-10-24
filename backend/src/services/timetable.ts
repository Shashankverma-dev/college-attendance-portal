import * as xlsx from 'xlsx';
import { randomUUID } from 'crypto';
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

export const localClassrooms: ClassroomLab[] = [];

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

export const localSectionGroups: SectionGroup[] = [];

export const localTimetables: TimetableMaster[] = [];

export function initializeMasterTimetables(): void {
  // Preseeded mock classrooms, section groups, and timetables removed.
  // The system relies exclusively on authentic timetables created and managed by the administrator.
}


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

    // Helper to evaluate half-open interval [start, end) overlap
    const checkIntervalOverlap = (
      e1: { period_index: number; start_time: string; end_time: string },
      e2: { period_index: number; start_time: string; end_time: string }
    ): boolean => {
      if (e1.period_index === e2.period_index) return true;
      if (e1.start_time && e1.end_time && e2.start_time && e2.end_time) {
        return e1.start_time < e2.end_time && e2.start_time < e1.end_time;
      }
      return false;
    };

    // 1. In-Batch & Cross-Timetable Validation
    for (let i = 0; i < candidateEntries.length; i++) {
      const a = candidateEntries[i];
      if (a.is_cancelled) continue;

      // Validate that end_time is strictly later than start_time
      if (a.start_time && a.end_time && a.start_time >= a.end_time) {
        conflicts.push({
          type: 'TIME_BOUNDARY',
          severity: 'CRITICAL',
          message: `Session end time (${a.end_time}) must be strictly later than start time (${a.start_time}).`,
          day: a.day_of_week,
          period_index: a.period_index,
          timeSlot: `${a.start_time} - ${a.end_time}`,
          conflictingEntity: a.subject_code,
          details: {
            firstClass: a.subject_code,
            secondClass: 'Invalid Time Boundary',
          },
        });
      }

      // Check intra-batch collisions with subsequent entries
      for (let j = i + 1; j < candidateEntries.length; j++) {
        const b = candidateEntries[j];
        if (b.is_cancelled) continue;

        if (a.day_of_week === b.day_of_week && checkIntervalOverlap(a, b)) {
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
        if (a.day_of_week === b.day_of_week && checkIntervalOverlap(a, b)) {
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
          let facultyId: string = randomUUID();
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
      course_id: course,
      semester_id: String(semester),
      section_id: section,
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
    const adminRoutes = require('../routes/admin.routes');
    const matchedDept = (preview.academicContext.department
      ? (adminRoutes.localDepartments || []).find((d: any) =>
          d.department_code === preview.academicContext.department ||
          d.department_name.toLowerCase().includes(preview.academicContext.department.toLowerCase())
        )
      : null) || (adminRoutes.localDepartments || [])[0];

    const matchedCrs = (preview.academicContext.course
      ? (adminRoutes.localCourses || []).find((c: any) =>
          c.course_code === preview.academicContext.course ||
          c.course_name.toLowerCase().includes(preview.academicContext.course.toLowerCase())
        )
      : null) || (adminRoutes.localCourses || [])[0];

    const matchedSem = (preview.academicContext.semester
      ? (adminRoutes.localSemesters || []).find((s: any) =>
          s.semester_number === preview.academicContext.semester && (!matchedCrs || s.course_id === matchedCrs.course_id)
        )
      : null) || (adminRoutes.localSemesters || [])[0];

    const matchedSec = (preview.academicContext.section
      ? (adminRoutes.localSections || []).find((sc: any) =>
          sc.section_name.toLowerCase() === preview.academicContext.section.toLowerCase() &&
          (!matchedSem || sc.semester_id === matchedSem.semester_id)
        )
      : null) || (adminRoutes.localSections || [])[0];

    const newMaster: TimetableMaster = {
      timetable_id: timetableId,
      academic_calendar_term: preview.academicContext.academicTerm,
      department_id: matchedDept?.department_id || randomUUID(),
      department_code: matchedDept?.department_code || preview.academicContext.department || 'GEN',
      department_name: matchedDept?.department_name || preview.academicContext.department || 'Department',
      course_id: matchedCrs?.course_id || randomUUID(),
      course_code: matchedCrs?.course_code || preview.academicContext.course || 'GEN',
      course_name: matchedCrs?.course_name || 'Course',
      semester_id: matchedSem?.semester_id || randomUUID(),
      semester_number: matchedSem?.semester_number || preview.academicContext.semester || 1,
      section_id: matchedSec?.section_id || randomUUID(),
      section_name: matchedSec?.section_name || preview.academicContext.section || 'A',
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

