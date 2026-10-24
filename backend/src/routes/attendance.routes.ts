import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { runWithTransactionContext, pool } from '../config/db';
import { AuditService } from '../services/audit';
import { IdempotencyService } from '../services/idempotency';
import { localTimetables, localSectionGroups, TimetableEntry, DayOfWeek } from '../services/timetable';
import { localStudents } from '../services/bulk-onboard';
import { QRAttendanceService } from '../services/qr-attendance';

const router = Router();

async function isDbConnected(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1');
    return res.rowCount === 1;
  } catch {
    return false;
  }
}

// In-Memory Fallback Stores for Attendance Sessions and Records
export interface InMemAttendanceSession {
  session_id: string;
  faculty_assignment_id?: string | null;
  timetable_entry_id?: string | null;
  section_id: string;
  section_name?: string;
  group_name?: string | null;
  subject_id: string;
  subject_code?: string;
  subject_name?: string;
  conducting_faculty_id: string;
  conducting_faculty_name?: string;
  session_date: string;
  start_time: string;
  end_time: string;
  instructional_hours: number;
  submission_status: 'DRAFT' | 'LOCKED';
  submitted_at?: string | null;
  submitting_user_uid?: string | null;
  created_at: string;
}

export interface InMemAttendanceRecord {
  record_id: string;
  session_id: string;
  student_profile_id: string;
  student_id: string;
  student_name: string;
  roll_number: string;
  attendance_status: 'P' | 'A' | 'L';
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

export const localAttendanceSessions: InMemAttendanceSession[] = [];

export const localAttendanceRecords: InMemAttendanceRecord[] = [];

/**
 * Institutional Formula Requirement:
 * Attendance percentage = Present / (Present + Absent) * 100
 * Approved Leave (L) is strictly excluded from both numerator and denominator.
 * Returns null when denominator is 0.
 */
export function calculateAttendancePercentage(records: Array<{ attendance_status: 'P' | 'A' | 'L' }>): string | null {
  const present = records.filter((r) => r.attendance_status === 'P').length;
  const absent = records.filter((r) => r.attendance_status === 'A').length;
  const denominator = present + absent;
  if (denominator === 0) {
    return null;
  }
  return ((present / denominator) * 100).toFixed(1);
}

/**
 * GET /api/attendance/teacher/timetable
 * Returns authorized daily and weekly timetable entries for the authenticated teacher.
 */
router.get(
  '/teacher/timetable',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const teacherUid = req.user?.uid;
      const today = new Date();
      const dayNames: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as any;
      const currentDay = dayNames[today.getDay()] || 'MONDAY';

      // Find published timetables matching this teacher
      const matchingClasses: {
        timetable_id: string;
        entry_id: string;
        day_of_week: DayOfWeek;
        period_index: number;
        start_time: string;
        end_time: string;
        course_code: string;
        semester_number: number;
        section_id: string;
        section_name: string;
        group_name?: string | null;
        subject_id: string;
        subject_code: string;
        subject_name: string;
        room_code: string;
        class_type: string;
        isToday: boolean;
        existingSessionStatus: 'PENDING' | 'DRAFT' | 'LOCKED';
        sessionId?: string;
      }[] = [];

      localTimetables
        .filter((t) => t.status === 'PUBLISHED')
        .forEach((tt) => {
          tt.entries.forEach((e) => {
            const isAssigned =
              e.primary_faculty_id === teacherUid ||
              e.faculty_staff_id === teacherUid ||
              (e.faculty_staff_id && teacherUid && e.faculty_staff_id.toLowerCase() === teacherUid.toLowerCase()) ||
              req.user?.role === 'GLOBAL_ADMIN';

            if (isAssigned) {
              const existingSess = localAttendanceSessions.find(
                (s) =>
                  s.timetable_entry_id === e.entry_id ||
                  (s.section_id === tt.section_id && s.subject_id === e.subject_id && s.start_time === e.start_time)
              );

              matchingClasses.push({
                timetable_id: tt.timetable_id,
                entry_id: e.entry_id,
                day_of_week: e.day_of_week,
                period_index: e.period_index,
                start_time: e.start_time,
                end_time: e.end_time,
                course_code: tt.course_code,
                semester_number: tt.semester_number,
                section_id: tt.section_id,
                section_name: tt.section_name,
                group_name: e.group_name,
                subject_id: e.subject_id,
                subject_code: e.subject_code,
                subject_name: e.subject_name,
                room_code: e.room_code || 'TBD',
                class_type: e.class_type,
                isToday: e.day_of_week === currentDay,
                existingSessionStatus: existingSess ? existingSess.submission_status : 'PENDING',
                sessionId: existingSess?.session_id,
              });
            }
          });
        });

      res.json({
        success: true,
        currentDay,
        totalClasses: matchingClasses.length,
        todayClassesCount: matchingClasses.filter((c) => c.isToday).length,
        schedule: matchingClasses,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'TIMETABLE_FETCH_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/attendance/sessions/from-timetable
 * Opens an attendance register directly linked to a scheduled timetable entry.
 * Accurately restricts the enrolled roster for practical subgroups (e.g., C1 vs C2).
 */
router.post(
  '/sessions/from-timetable',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { timetableEntryId, sessionDate } = req.body;
    const uid = req.user!.uid;

    try {
      // Find timetable entry
      let targetEntry: TimetableEntry | undefined;
      let parentTimetable: any;

      for (const tt of localTimetables) {
        const found = tt.entries.find((e) => e.entry_id === timetableEntryId);
        if (found) {
          targetEntry = found;
          parentTimetable = tt;
          break;
        }
      }

      if (!targetEntry) {
        res.status(404).json({ error: 'TIMETABLE_ENTRY_NOT_FOUND', message: 'Timetable entry not found.' });
        return;
      }

      const activeDate = sessionDate || new Date().toISOString().split('T')[0];

      // Check if session already exists for this exact occurrence
      const existing = localAttendanceSessions.find(
        (s) =>
          s.timetable_entry_id === timetableEntryId &&
          s.session_date === activeDate &&
          (!targetEntry!.group_name || s.group_name === targetEntry!.group_name)
      );

      if (existing) {
        // Return existing session directly (idempotent open)
        const roster = localAttendanceRecords.filter((r) => r.session_id === existing.session_id);
        res.json({
          success: true,
          isExisting: true,
          session: existing,
          roster,
        });
        return;
      }

      // Filter eligible students based on whole section vs group
      let eligibleStudents = localStudents.filter(
        (stu) =>
          stu.section_name === parentTimetable.section_name &&
          stu.semester_number === parentTimetable.semester_number &&
          stu.status === 'ACTIVE'
      );

      if (targetEntry.group_name) {
        // Find group members
        const groupObj = localSectionGroups.find(
          (g) => g.group_name.toUpperCase() === targetEntry!.group_name!.toUpperCase()
        );
        if (groupObj) {
          eligibleStudents = eligibleStudents.filter((stu) =>
            groupObj.enrolled_student_ids.includes(stu.student_id)
          );
        }
      }

      const newSessionId = `sess-${Date.now()}`;
      const newSession: InMemAttendanceSession = {
        session_id: newSessionId,
        timetable_entry_id: targetEntry.entry_id,
        section_id: parentTimetable.section_id,
        section_name: parentTimetable.section_name,
        group_name: targetEntry.group_name,
        subject_id: targetEntry.subject_id,
        subject_code: targetEntry.subject_code,
        subject_name: targetEntry.subject_name,
        conducting_faculty_id: targetEntry.primary_faculty_id,
        conducting_faculty_name: targetEntry.faculty_name,
        session_date: activeDate,
        start_time: targetEntry.start_time,
        end_time: targetEntry.end_time,
        instructional_hours: 1.0,
        submission_status: 'DRAFT',
        created_at: new Date().toISOString(),
      };

      localAttendanceSessions.push(newSession);

      // Pre-fill roster records
      const rosterRecords: InMemAttendanceRecord[] = eligibleStudents.map((stu, idx) => ({
        record_id: `rec-${newSessionId}-${idx + 1}`,
        session_id: newSessionId,
        student_profile_id: stu.student_profile_id,
        student_id: stu.student_id,
        student_name: stu.full_name,
        roll_number: stu.roll_number,
        attendance_status: 'P',
        remarks: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      localAttendanceRecords.push(...rosterRecords);

      res.status(201).json({
        success: true,
        isExisting: false,
        session: newSession,
        roster: rosterRecords,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'SESSION_CREATION_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/attendance/sessions
 * Standard session creation endpoint.
 */
router.post(
  '/sessions',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { sectionId, subjectId, sessionDate, startTime, endTime, instructionalHours } = req.body;
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();

      if (dbOnline) {
        const result = await runWithTransactionContext(req.securityContext!, async (client) => {
          const facultyRes = await client.query(
            `SELECT faculty_profile_id FROM faculty_profiles WHERE user_uid = $1`,
            [uid]
          );
          if (facultyRes.rowCount === 0) {
            throw { status: 403, code: 'NOT_FACULTY', message: 'User is not registered as faculty.' };
          }
          const facultyProfileId = facultyRes.rows[0].faculty_profile_id;

          const assignRes = await client.query(
            `SELECT assignment_id FROM faculty_assignments 
             WHERE faculty_profile_id = $1 AND section_id = $2 AND subject_id = $3 AND is_active = TRUE`,
            [facultyProfileId, sectionId, subjectId]
          );

          if (assignRes.rowCount === 0 && req.user!.role !== 'GLOBAL_ADMIN') {
            throw {
              status: 403,
              code: 'UNAUTHORIZED_SECTION_ASSIGNMENT',
              message: 'You are not assigned to conduct attendance for this section and subject.',
            };
          }

          const assignmentId = assignRes.rows[0]?.assignment_id || null;

          const sessionRes = await client.query(
            `INSERT INTO attendance_sessions 
              (faculty_assignment_id, section_id, subject_id, conducting_faculty_id, session_date, start_time, end_time, instructional_hours, submission_status)
             VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT')
             RETURNING session_id, session_date, start_time, end_time, submission_status`,
            [assignmentId, sectionId, subjectId, facultyProfileId, sessionDate, startTime, endTime, instructionalHours || 1.0]
          );

          const newSession = sessionRes.rows[0];

          await client.query(
            `INSERT INTO attendance_records (session_id, student_profile_id, attendance_status)
             SELECT $1, student_profile_id, 'P'::attendance_mark_enum
             FROM student_profiles
             WHERE current_section_id = $2`,
            [newSession.session_id, sectionId]
          );

          return newSession;
        });

        res.status(201).json({ success: true, session: result });
        return;
      }

      // In-Memory Mode
      const targetSectionId = sectionId || 'f0000000-0000-0000-0000-000000000001';
      const targetSubjectId = subjectId || '10000000-0000-0000-0000-000000000001';
      const targetSessionDate = sessionDate || new Date().toISOString().split('T')[0];
      const targetStartTime = startTime || '10:00';

      // Idempotency / Double-submission protection: reuse existing session if created concurrently
      const existingSession = localAttendanceSessions.find(
        (s) =>
          s.section_id === targetSectionId &&
          s.subject_id === targetSubjectId &&
          s.session_date === targetSessionDate &&
          s.start_time === targetStartTime
      );

      if (existingSession) {
        const roster = localAttendanceRecords.filter((r) => r.session_id === existingSession.session_id);
        res.status(200).json({
          success: true,
          isExisting: true,
          session: existingSession,
          roster,
        });
        return;
      }

      const newSessionId = `sess-${Date.now()}`;
      const newSession: InMemAttendanceSession = {
        session_id: newSessionId,
        section_id: targetSectionId,
        section_name: 'A',
        subject_id: targetSubjectId,
        subject_code: 'BCA-101',
        subject_name: 'Programming Fundamentals using C',
        conducting_faculty_id: '30000000-0000-0000-0000-000000000001',
        conducting_faculty_name: 'Dr. Meenakshi Sundaram',
        session_date: targetSessionDate,
        start_time: targetStartTime,
        end_time: endTime || '11:00',
        instructional_hours: instructionalHours || 1.0,
        submission_status: 'DRAFT',
        created_at: new Date().toISOString(),
      };
      localAttendanceSessions.push(newSession);

      const rosterRecords: InMemAttendanceRecord[] = localStudents.map((stu, idx) => ({
        record_id: `rec-${newSessionId}-${idx + 1}`,
        session_id: newSessionId,
        student_profile_id: stu.student_profile_id,
        student_id: stu.student_id,
        student_name: stu.full_name,
        roll_number: stu.roll_number,
        attendance_status: 'P',
        remarks: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      localAttendanceRecords.push(...rosterRecords);

      res.status(201).json({ success: true, session: newSession });
    } catch (err: any) {
      console.error('Error creating attendance session:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * GET /api/attendance/sessions/:sessionId/roster
 */
router.get(
  '/sessions/:sessionId/roster',
  authenticate,
  requireRole(['FACULTY', 'HOD', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;

    try {
      const dbOnline = await isDbConnected();

      if (dbOnline) {
        const result = await runWithTransactionContext(req.securityContext!, async (client) => {
          const sessionRes = await client.query(
            `SELECT s.*, sub.subject_name, sec.section_name 
             FROM attendance_sessions s
             JOIN subjects sub ON s.subject_id = sub.subject_id
             JOIN sections sec ON s.section_id = sec.section_id
             WHERE s.session_id = $1`,
            [sessionId]
          );

          if (sessionRes.rowCount === 0) {
            throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Attendance session not found.' };
          }

          const session = sessionRes.rows[0];

          const rosterRes = await client.query(
            `SELECT ar.record_id, ar.attendance_status, ar.remarks,
                    sp.student_profile_id, sp.student_id, sp.roll_number, sp.full_name
             FROM attendance_records ar
             JOIN student_profiles sp ON ar.student_profile_id = sp.student_profile_id
             WHERE ar.session_id = $1
             ORDER BY sp.roll_number ASC`,
            [sessionId]
          );

          return { session, roster: rosterRes.rows };
        });

        res.json(result);
        return;
      }

      // In-Memory Mode
      const session = localAttendanceSessions.find((s) => s.session_id === sessionId);
      if (!session) {
        res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Attendance session not found.' });
        return;
      }

      const roster = localAttendanceRecords.filter((r) => r.session_id === sessionId);
      res.json({ session, roster });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * POST /api/attendance/sessions/:sessionId/submit
 */
router.post(
  '/sessions/:sessionId/submit',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;
    const { records, idempotencyKey } = req.body;
    const uid = req.user!.uid;

    if (idempotencyKey) {
      const claim = await IdempotencyService.claim(null, idempotencyKey, 'SUBMIT_ATTENDANCE_SESSION', sessionId);
      if (claim.isAlreadyProcessed) {
        res.json(claim.cachedResponse);
        return;
      }
    }

    try {
      const dbOnline = await isDbConnected();

      if (dbOnline) {
        const summary = await runWithTransactionContext(req.securityContext!, async (client) => {
          const sessionRes = await client.query(
            `SELECT submission_status FROM attendance_sessions WHERE session_id = $1 FOR UPDATE`,
            [sessionId]
          );
          if (sessionRes.rowCount === 0) {
            throw { status: 404, code: 'NOT_FOUND', message: 'Session does not exist.' };
          }
          if (sessionRes.rows[0].submission_status === 'LOCKED') {
            throw { status: 400, code: 'ALREADY_LOCKED', message: 'Session is already locked. Use FR-48 correction workflow.' };
          }

          if (Array.isArray(records)) {
            for (const item of records) {
              await client.query(
                `UPDATE attendance_records 
                 SET attendance_status = $1, remarks = $2, updated_at = NOW()
                 WHERE session_id = $3 AND student_profile_id = $4`,
                [item.status, item.remarks || null, sessionId, item.studentProfileId]
              );
            }
          }

          await client.query(
            `UPDATE attendance_sessions 
             SET submission_status = 'LOCKED', submitted_at = NOW(), submitting_user_uid = $2 
             WHERE session_id = $1`,
            [sessionId, uid]
          );

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            actionCategory: 'AUTH',
            targetEntityName: 'attendance_sessions',
            targetEntityId: sessionId,
            changeDetails: { event: 'ATTENDANCE_SESSION_LOCKED', totalMarked: records?.length || 0 },
          });

          const countRes = await client.query(
            `SELECT attendance_status, COUNT(*) as count 
             FROM attendance_records 
             WHERE session_id = $1 
             GROUP BY attendance_status`,
            [sessionId]
          );

          return { sessionId, status: 'LOCKED', counts: countRes.rows };
        });

        if (idempotencyKey) {
          await IdempotencyService.complete(null, idempotencyKey, { success: true, summary });
        }

        res.json({ success: true, summary });
        return;
      }

      // In-Memory Mode
      const sess = localAttendanceSessions.find((s) => s.session_id === sessionId);
      if (!sess) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Session does not exist.' });
        return;
      }
      if (sess.submission_status === 'LOCKED') {
        res.status(400).json({ error: 'ALREADY_LOCKED', message: 'Session is already locked.' });
        return;
      }

      if (Array.isArray(records)) {
        records.forEach((item) => {
          const rec = localAttendanceRecords.find(
            (r) => r.session_id === sessionId && (r.student_id === item.studentId || r.student_profile_id === item.studentProfileId)
          );
          if (rec) {
            rec.attendance_status = item.status;
            rec.remarks = item.remarks || null;
            rec.updated_at = new Date().toISOString();
          }
        });
      }

      sess.submission_status = 'LOCKED';
      sess.submitted_at = new Date().toISOString();
      sess.submitting_user_uid = uid;

      const pCount = localAttendanceRecords.filter((r) => r.session_id === sessionId && r.attendance_status === 'P').length;
      const aCount = localAttendanceRecords.filter((r) => r.session_id === sessionId && r.attendance_status === 'A').length;
      const lCount = localAttendanceRecords.filter((r) => r.session_id === sessionId && r.attendance_status === 'L').length;

      const summary = {
        sessionId,
        status: 'LOCKED',
        counts: [
          { attendance_status: 'P', count: pCount },
          { attendance_status: 'A', count: aCount },
          { attendance_status: 'L', count: lCount },
        ],
      };

      res.json({ success: true, summary });
    } catch (err: any) {
      console.error('Submit attendance error:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * GET /api/attendance/student/summary
 */
router.get(
  '/student/summary',
  authenticate,
  requireRole(['STUDENT', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();

      if (dbOnline) {
        const summary = await runWithTransactionContext(req.securityContext!, async (client) => {
          const studentRes = await client.query(
            `SELECT student_profile_id, full_name, student_id FROM student_profiles WHERE user_uid = $1`,
            [uid]
          );

          if (studentRes.rowCount === 0) {
            throw { status: 404, code: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' };
          }

          const studentProfileId = studentRes.rows[0].student_profile_id;

          const query = `
            SELECT 
              sub.subject_id,
              sub.subject_code,
              sub.subject_name,
              COUNT(ar.record_id) AS total_sessions,
              COUNT(CASE WHEN ar.attendance_status = 'P' THEN 1 END) AS attended_sessions,
              COUNT(CASE WHEN ar.attendance_status = 'L' THEN 1 END) AS approved_leave_sessions,
              ROUND(
                (COUNT(CASE WHEN ar.attendance_status = 'P' THEN 1 END)::numeric / 
                 NULLIF(COUNT(CASE WHEN ar.attendance_status IN ('P', 'A') THEN 1 END), 0)) * 100, 
                1
              ) AS attendance_percentage
            FROM attendance_records ar
            JOIN attendance_sessions sess ON ar.session_id = sess.session_id
            JOIN subjects sub ON sess.subject_id = sub.subject_id
            WHERE ar.student_profile_id = $1 AND sess.submission_status = 'LOCKED'
            GROUP BY sub.subject_id, sub.subject_code, sub.subject_name
            ORDER BY sub.subject_code ASC;
          `;

          const recordsRes = await client.query(query, [studentProfileId]);
          return {
            student: studentRes.rows[0],
            subjects: recordsRes.rows,
          };
        });

        res.json(summary);
        return;
      }

      // In-Memory Mode
      const userEmail = (req.user?.email || '').toLowerCase();
      const student = localStudents.find((s) => 
        s.user_uid === uid || 
        (userEmail && s.student_gmail && s.student_gmail.toLowerCase() === userEmail) ||
        (s.student_id && uid.toLowerCase().includes(s.student_id.toLowerCase()))
      );

      if (!student) {
        res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' });
        return;
      }

      // Find all locked sessions and the student's records for them
      const studentRecords = localAttendanceRecords.filter(
        (r) => r.student_id === student.student_id || r.student_profile_id === student.student_profile_id
      );

      // Collect all distinct locked sessions
      const sessionMap = new Map<string, InMemAttendanceSession>();
      localAttendanceSessions.forEach((sess) => {
        if (sess.submission_status === 'LOCKED') {
          sessionMap.set(sess.session_id, sess);
        }
      });

      // Group records by subject
      const subjectStats = new Map<string, {
        subject_id: string;
        subject_code: string;
        subject_name: string;
        total_sessions: number;
        attended_sessions: number;
        approved_leave_sessions: number;
        absent_sessions: number;
      }>();

      for (const rec of studentRecords) {
        const sess = sessionMap.get(rec.session_id);
        if (!sess) continue;

        const subId = sess.subject_id;
        if (!subjectStats.has(subId)) {
          subjectStats.set(subId, {
            subject_id: subId,
            subject_code: sess.subject_code || 'SUB-000',
            subject_name: sess.subject_name || 'Subject',
            total_sessions: 0,
            attended_sessions: 0,
            approved_leave_sessions: 0,
            absent_sessions: 0,
          });
        }

        const stat = subjectStats.get(subId)!;
        stat.total_sessions++;
        if (rec.attendance_status === 'P') stat.attended_sessions++;
        else if (rec.attendance_status === 'L') stat.approved_leave_sessions++;
        else if (rec.attendance_status === 'A') stat.absent_sessions++;
      }

      const subjects = Array.from(subjectStats.values()).map((st) => {
        const validDenominator = st.attended_sessions + st.absent_sessions;
        const percentage = validDenominator > 0
          ? ((st.attended_sessions / validDenominator) * 100).toFixed(1)
          : null;

        return {
          subject_id: st.subject_id,
          subject_code: st.subject_code,
          subject_name: st.subject_name,
          total_sessions: st.total_sessions,
          attended_sessions: st.attended_sessions,
          approved_leave_sessions: st.approved_leave_sessions,
          attendance_percentage: percentage,
        };
      });

      res.json({
        student: {
          student_profile_id: student.student_profile_id,
          full_name: student.full_name,
          student_id: student.student_id,
        },
        subjects,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * GET /api/attendance/reports
 * Institutional multi-scope attendance reports (by student, section, subject, teacher, term).
 */
router.get(
  '/reports',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD', 'FACULTY']),
  async (req: Request, res: Response): Promise<void> => {
    const { section, subject, teacher, term } = req.query;

    const dbOnline = await isDbConnected();

    if (dbOnline) {
      try {
        const summaryRes = await pool.query(`
          SELECT 
            COUNT(DISTINCT s.session_id)::int as total_conducted_sessions,
            COUNT(ar.record_id)::int as total_attendance_entries,
            COUNT(CASE WHEN ar.attendance_status = 'P' THEN 1 END)::int as present_count,
            COUNT(CASE WHEN ar.attendance_status = 'A' THEN 1 END)::int as absent_count,
            COUNT(CASE WHEN ar.attendance_status = 'L' THEN 1 END)::int as leave_count
          FROM attendance_sessions s
          LEFT JOIN attendance_records ar ON s.session_id = ar.session_id
          WHERE s.submission_status = 'LOCKED'
        `);
        const row = summaryRes.rows[0];
        const validDenom = (row?.present_count || 0) + (row?.absent_count || 0);
        const overallRate = validDenom > 0 
          ? `${(((row.present_count || 0) / validDenom) * 100).toFixed(1)}%` 
          : 'N/A';

        const sectionRes = await pool.query(`
          SELECT 
            sec.section_name as section,
            COUNT(DISTINCT sp.student_profile_id)::int as enrolled_count,
            ROUND(
              (COUNT(CASE WHEN ar.attendance_status = 'P' THEN 1 END)::numeric / 
               NULLIF(COUNT(CASE WHEN ar.attendance_status IN ('P', 'A') THEN 1 END), 0)) * 100, 
              1
            ) as avg_attendance
          FROM sections sec
          LEFT JOIN student_profiles sp ON sec.section_id = sp.current_section_id
          LEFT JOIN attendance_sessions s ON sec.section_id = s.section_id AND s.submission_status = 'LOCKED'
          LEFT JOIN attendance_records ar ON s.session_id = ar.session_id AND sp.student_profile_id = ar.student_profile_id
          GROUP BY sec.section_id, sec.section_name
          ORDER BY sec.section_name ASC
        `);

        const sectionBreakdown = sectionRes.rows.map((r: any) => ({
          section: r.section,
          enrolledCount: r.enrolled_count,
          averageAttendance: r.avg_attendance ? `${r.avg_attendance}%` : 'N/A',
          complianceStatus: r.avg_attendance && parseFloat(r.avg_attendance) >= 75.0 ? 'COMPLIANT' : 'DEFICIENT',
        }));

        res.json({
          success: true,
          term: term || 'Autumn 2026',
          summary: {
            totalConductedSessions: row?.total_conducted_sessions || 0,
            totalAttendanceEntries: row?.total_attendance_entries || 0,
            overallAttendanceRate: overallRate,
            shortageThreshold: 75.0,
          },
          sectionBreakdown,
        });
        return;
      } catch (dbErr: any) {
        if (process.env.NODE_ENV === 'production') {
          res.status(500).json({ error: 'DATABASE_QUERY_ERROR', message: dbErr.message });
          return;
        }
      }
    }

    const lockedSessions = localAttendanceSessions.filter((s) => s.submission_status === 'LOCKED');
    const totalRecords = localAttendanceRecords.length;
    const presentRecords = localAttendanceRecords.filter((r) => r.attendance_status === 'P').length;
    const absentRecords = localAttendanceRecords.filter((r) => r.attendance_status === 'A').length;
    const leaveRecords = localAttendanceRecords.filter((r) => r.attendance_status === 'L').length;
    const totalValid = presentRecords + absentRecords;
    const attendancePct = totalValid > 0 ? `${((presentRecords / totalValid) * 100).toFixed(1)}%` : 'N/A';

    // Calculate dynamic section breakdown from local in-memory records
    const sectionMap = new Map<string, { present: number; totalValid: number; enrolled: Set<string> }>();
    for (const rec of localAttendanceRecords) {
      const sess = localAttendanceSessions.find((s) => s.session_id === rec.session_id);
      const secName = sess?.section_name || 'General';
      if (!sectionMap.has(secName)) {
        sectionMap.set(secName, { present: 0, totalValid: 0, enrolled: new Set() });
      }
      const entry = sectionMap.get(secName)!;
      entry.enrolled.add(rec.student_id);
      if (rec.attendance_status === 'P') {
        entry.present++;
        entry.totalValid++;
      } else if (rec.attendance_status === 'A') {
        entry.totalValid++;
      }
    }

    const sectionBreakdown = Array.from(sectionMap.entries()).map(([secName, data]) => {
      const avg = data.totalValid > 0 ? ((data.present / data.totalValid) * 100).toFixed(1) : null;
      return {
        section: secName,
        enrolledCount: data.enrolled.size,
        averageAttendance: avg ? `${avg}%` : 'N/A',
        complianceStatus: avg && parseFloat(avg) >= 75.0 ? 'COMPLIANT' : 'DEFICIENT',
      };
    });

    res.json({
      success: true,
      term: term || 'Autumn 2026',
      summary: {
        totalConductedSessions: lockedSessions.length,
        totalAttendanceEntries: totalRecords,
        overallAttendanceRate: attendancePct,
        shortageThreshold: 75.0,
      },
      sectionBreakdown,
    });
  }
);

// =============================================================================
// LIVE QR ATTENDANCE SUBSYSTEM ENDPOINTS
// =============================================================================

/**
 * POST /api/attendance/qr/start
 * Teacher initiates a live dynamic QR attendance session for an assigned lecture.
 */
router.post(
  '/qr/start',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { timetableEntryId, intervalSeconds, durationMinutes } = req.body;
      const teacherUid = req.user!.uid;
      const teacherRole = req.user!.role;

      if (!timetableEntryId) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'timetableEntryId is required.' });
        return;
      }

      const result = await QRAttendanceService.startSession({
        timetableEntryId,
        teacherUid,
        teacherRole,
        intervalSeconds: Number(intervalSeconds) || 20,
        durationMinutes: Number(durationMinutes) || 60,
      });

      res.status(201).json({
        success: true,
        message: 'Live QR attendance session started successfully.',
        ...result,
      });
    } catch (err: any) {
      console.error('Error starting live QR session:', err);
      res.status(err.status || 500).json({
        error: err.code || 'QR_START_FAILED',
        message: err.message || 'Failed to start live QR attendance session.',
      });
    }
  }
);

/**
 * GET /api/attendance/qr/token/:sessionId
 * Classroom display projector fetches current active rotating token & countdown.
 */
router.get(
  '/qr/token/:sessionId',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const result = QRAttendanceService.getTokenForDisplay(sessionId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(err.status || 500).json({
        error: err.code || 'QR_TOKEN_FETCH_FAILED',
        message: err.message || 'Failed to fetch active QR token.',
      });
    }
  }
);

/**
 * GET /api/attendance/qr/live/:sessionId
 * Teacher live dashboard fetches real-time attendance counter & roster list.
 */
router.get(
  '/qr/live/:sessionId',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const result = QRAttendanceService.getLiveSessionState(sessionId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(err.status || 500).json({
        error: err.code || 'LIVE_STATE_FETCH_FAILED',
        message: err.message || 'Failed to fetch live session state.',
      });
    }
  }
);

/**
 * POST /api/attendance/qr/close
 * Teacher finalizes and closes the live session. Rejects all subsequent scans.
 */
router.post(
  '/qr/close',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body;
      const teacherUid = req.user!.uid;

      if (!sessionId) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'sessionId is required.' });
        return;
      }

      const result = QRAttendanceService.closeSession(sessionId, teacherUid);
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 500).json({
        error: err.code || 'SESSION_CLOSE_FAILED',
        message: err.message || 'Failed to close attendance session.',
      });
    }
  }
);

/**
 * POST /api/attendance/qr/scan
 * Authenticated student submits scanned QR token or 6-digit backup challenge code.
 */
router.post(
  '/qr/scan',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, token, challengeCode, backupCode, scanMethod } = req.body;
      const effectiveChallenge = challengeCode || backupCode;
      const studentUid = req.user!.uid;

      if (!sessionId) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'sessionId is required.' });
        return;
      }

      if (!token && !effectiveChallenge) {
        res.status(400).json({ error: 'MISSING_CREDENTIAL', message: 'Either QR token or 6-digit backup challenge code is required.' });
        return;
      }

      const result = await QRAttendanceService.recordStudentScan({
        sessionId,
        token,
        challengeCode: effectiveChallenge,
        studentUid,
        scanMethod: scanMethod || (effectiveChallenge ? 'MANUAL_CODE' : 'CAMERA_QR'),
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
        userAgent: req.headers['user-agent'],
      });

      res.json(result);
    } catch (err: any) {
      console.error('Error recording student QR scan:', err);
      res.status(err.status || 500).json({
        error: err.code || 'QR_SCAN_REJECTED',
        message: err.message || 'Attendance scan was rejected.',
      });
    }
  }
);

/**
 * POST /api/attendance/qr/manual-override
 * Teacher manually updates attendance mark for a specific student in an active/draft session.
 */
router.post(
  '/qr/manual-override',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, studentProfileId, status, remarks } = req.body;

      if (!sessionId || !studentProfileId || !status) {
        res.status(400).json({ error: 'MISSING_PARAMS', message: 'sessionId, studentProfileId, and status are required.' });
        return;
      }

      if (!['P', 'A', 'L'].includes(status)) {
        res.status(400).json({ error: 'INVALID_STATUS', message: 'Status must be P, A, or L.' });
        return;
      }

      const record = localAttendanceRecords.find(
        (r) => r.session_id === sessionId && r.student_profile_id === studentProfileId
      );

      if (!record) {
        res.status(404).json({ error: 'RECORD_NOT_FOUND', message: 'Student roster entry not found in this session.' });
        return;
      }

      record.attendance_status = status;
      record.remarks = remarks || 'Manual teacher update';
      record.updated_at = new Date().toISOString();

      res.json({
        success: true,
        message: `Updated status to '${status}' for ${record.student_name}.`,
        record,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'OVERRIDE_FAILED', message: err.message });
    }
  }
);

export default router;
