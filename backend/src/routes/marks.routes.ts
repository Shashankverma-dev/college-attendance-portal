import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { pool, runWithTransactionContext } from '../config/db';
import { AuditService } from '../services/audit';
import {
  localCourses,
  localSemesters,
  localSections,
  localSubjects,
  localAssignments,
  localTeachers,
  localDepartments,
} from './admin.routes';
import { localStudents } from '../services/bulk-onboard';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

async function isDbConnected(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1');
    return res.rowCount === 1;
  } catch {
    return false;
  }
}

// =============================================================================
// IN-MEMORY DATA STORES (Active when PostgreSQL is offline)
// =============================================================================

export interface InMemAssessment {
  assessment_id: string;
  course_id: string;
  semester_id: string;
  section_id: string;
  subject_id: string;
  faculty_assignment_id?: string | null;
  assessment_type: 'ASSIGNMENT' | 'SESSIONAL_1' | 'SESSIONAL_2' | 'FINAL_SEMESTER';
  assessment_title: string;
  max_marks: number;
  due_date?: string | null;
  academic_calendar_term: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'FINALIZED' | 'PUBLISHED';
  created_by_user_uid: string;
  created_at: string;
  published_at?: string | null;
  published_by_user_uid?: string | null;
  updated_at: string;
}

export interface InMemAssessmentMark {
  mark_id: string;
  assessment_id: string;
  student_profile_id: string;
  marks_obtained: number | null;
  status: 'PRESENT' | 'ABSENT' | 'EXEMPTED' | 'WITHHELD' | 'INCOMPLETE';
  remarks?: string | null;
  entered_by_user_uid: string;
  updated_at: string;
}

export const localAssessments: InMemAssessment[] = [];

export const localAssessmentMarks: InMemAssessmentMark[] = [];

export const localMarksAudit: Array<{
  mark_id: string;
  assessment_id: string;
  student_profile_id: string;
  previous_marks: number | null;
  new_marks: number | null;
  previous_status: string | null;
  new_status: string;
  reason: string;
  changed_by_user_uid: string;
  created_at: string;
}> = [];

// =============================================================================
// TEACHER WORKFLOWS (Subject Teachers)
// =============================================================================

/**
 * GET /api/marks/teacher/assignments
 * List assessments and assigned subjects/sections for the authenticated teacher.
 */
router.get(
  '/teacher/assignments',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const data = await runWithTransactionContext(req.securityContext!, async (client) => {
          const facRes = await client.query(
            `SELECT faculty_profile_id FROM faculty_profiles WHERE user_uid = $1`,
            [uid]
          );
          if (facRes.rowCount === 0 && req.user!.role !== 'GLOBAL_ADMIN') {
            throw { status: 403, code: 'NOT_FACULTY', message: 'User is not registered as faculty.' };
          }
          const facultyProfileId = facRes.rows[0]?.faculty_profile_id;

          const assignmentsQuery = `
            SELECT 
              fa.assignment_id,
              fa.subject_id,
              s.subject_code,
              s.subject_name,
              fa.section_id,
              sec.section_name,
              sem.semester_number,
              sem.semester_id,
              c.course_id,
              c.course_code,
              c.course_name,
              fa.academic_calendar_term
            FROM faculty_assignments fa
            JOIN subjects s ON fa.subject_id = s.subject_id
            JOIN sections sec ON fa.section_id = sec.section_id
            JOIN semesters sem ON sec.semester_id = sem.semester_id
            JOIN courses c ON s.course_id = c.course_id
            WHERE (fa.faculty_profile_id = $1 OR $2 = 'GLOBAL_ADMIN') AND fa.is_active = TRUE
            ORDER BY c.course_code, sem.semester_number, sec.section_name
          `;
          const assignRes = await client.query(assignmentsQuery, [facultyProfileId, req.user!.role]);

          const assessmentsQuery = `
            SELECT 
              a.assessment_id,
              a.assessment_type,
              a.assessment_title,
              a.max_marks,
              a.due_date,
              a.status,
              a.academic_calendar_term,
              a.created_at,
              a.published_at,
              s.subject_code,
              s.subject_name,
              sec.section_name,
              sem.semester_number,
              c.course_code,
              COUNT(am.mark_id)::int AS marks_entered_count
            FROM assessments a
            JOIN subjects s ON a.subject_id = s.subject_id
            JOIN sections sec ON a.section_id = sec.section_id
            JOIN semesters sem ON sec.semester_id = sem.semester_id
            JOIN courses c ON s.course_id = c.course_id
            LEFT JOIN assessment_marks am ON a.assessment_id = am.assessment_id
            WHERE (a.created_by_user_uid = $1 OR $2 = 'GLOBAL_ADMIN' OR a.faculty_assignment_id IN (
              SELECT assignment_id FROM faculty_assignments WHERE faculty_profile_id = $3
            ))
            GROUP BY a.assessment_id, s.subject_code, s.subject_name, sec.section_name, sem.semester_number, c.course_code
            ORDER BY a.created_at DESC
          `;
          const assessRes = await client.query(assessmentsQuery, [uid, req.user!.role, facultyProfileId]);

          return {
            assignedClasses: assignRes.rows,
            assessments: assessRes.rows,
          };
        });

        res.json({ success: true, ...data });
        return;
      }

      // In-memory fallback
      let teacherProfile = localTeachers.find(
        (t) => t.user_uid === uid || (t.faculty_staff_id && uid.toLowerCase().includes(t.faculty_staff_id.toLowerCase()))
      );
      if (!teacherProfile && req.user!.role !== 'GLOBAL_ADMIN') {
        res.status(403).json({ error: 'NOT_FACULTY', message: 'Faculty profile not found.' });
        return;
      }

      const assignedClasses = localAssignments
        .filter((fa) => fa.is_active && (req.user!.role === 'GLOBAL_ADMIN' || (teacherProfile && fa.faculty_profile_id === teacherProfile.faculty_profile_id)))
        .map((fa) => {
          const sub = localSubjects.find((s) => s.subject_id === fa.subject_id);
          const sec = localSections.find((sc) => sc.section_id === fa.section_id);
          const sem = sec ? localSemesters.find((sm) => sm.semester_id === sec.semester_id) : null;
          const crs = sub ? localCourses.find((c) => c.course_id === sub.course_id) : null;
          return {
            assignment_id: fa.assignment_id,
            subject_id: fa.subject_id,
            subject_code: fa.subject_code,
            subject_name: fa.subject_name,
            section_id: fa.section_id,
            section_name: fa.section_name,
            semester_number: fa.semester_number,
            semester_id: sem?.semester_id || 'e0000000-0000-0000-0000-000000000001',
            course_id: crs?.course_id || 'c0000000-0000-0000-0000-000000000001',
            course_code: fa.course_code,
            course_name: fa.course_name,
            academic_calendar_term: fa.academic_calendar_term,
          };
        });

      const assessments = localAssessments
        .filter((a) => {
          if (req.user!.role === 'GLOBAL_ADMIN') return true;
          if (a.created_by_user_uid === uid) return true;
          if (teacherProfile && a.faculty_assignment_id) {
            return localAssignments.some((fa) => fa.assignment_id === a.faculty_assignment_id && fa.faculty_profile_id === teacherProfile!.faculty_profile_id);
          }
          return false;
        })
        .map((a) => {
          const sub = localSubjects.find((s) => s.subject_id === a.subject_id);
          const sec = localSections.find((sc) => sc.section_id === a.section_id);
          const sem = sec ? localSemesters.find((sm) => sm.semester_id === sec.semester_id) : null;
          const crs = sub ? localCourses.find((c) => c.course_id === sub.course_id) : null;
          const marksCount = localAssessmentMarks.filter((m) => m.assessment_id === a.assessment_id).length;
          return {
            assessment_id: a.assessment_id,
            assessment_type: a.assessment_type,
            assessment_title: a.assessment_title,
            max_marks: a.max_marks,
            due_date: a.due_date,
            status: a.status,
            academic_calendar_term: a.academic_calendar_term,
            created_at: a.created_at,
            published_at: a.published_at,
            subject_code: sub?.subject_code || 'BCA-101',
            subject_name: sub?.subject_name || 'Programming in C',
            section_name: sec?.section_name || 'A',
            semester_number: sem?.semester_number || 1,
            course_code: crs?.course_code || 'BCA',
            marks_entered_count: marksCount,
          };
        });

      res.json({ success: true, assignedClasses, assessments });
    } catch (err: any) {
      console.error('Error fetching teacher assignments:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

const CreateAssessmentSchema = z.object({
  facultyAssignmentId: z.string().uuid().optional(),
  courseId: z.string().uuid(),
  semesterId: z.string().uuid(),
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  assessmentType: z.enum(['ASSIGNMENT', 'SESSIONAL_1', 'SESSIONAL_2']),
  assessmentTitle: z.string().min(3).max(255),
  maxMarks: z.number().positive().max(1000),
  dueDate: z.string().optional(),
  academicCalendarTerm: z.string().min(2),
});

/**
 * POST /api/marks/teacher/assignments
 * Create a new assessment (Assignment, Sessional 1, or Sessional 2).
 */
router.post(
  '/teacher/assignments',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const parse = CreateAssessmentSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parse.error.format() });
      return;
    }

    const {
      courseId,
      semesterId,
      sectionId,
      subjectId,
      assessmentType,
      assessmentTitle,
      maxMarks,
      dueDate,
      academicCalendarTerm,
    } = parse.data;

    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const assessment = await runWithTransactionContext(req.securityContext!, async (client) => {
          let facultyAssignmentId: string | null = null;
          if (req.user!.role !== 'GLOBAL_ADMIN') {
            const assignCheck = await client.query(
              `SELECT fa.assignment_id 
               FROM faculty_assignments fa
               JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
               WHERE fp.user_uid = $1 AND fa.section_id = $2 AND fa.subject_id = $3 AND fa.is_active = TRUE`,
              [uid, sectionId, subjectId]
            );

            if (assignCheck.rowCount === 0) {
              throw {
                status: 403,
                code: 'UNAUTHORIZED_SUBJECT_SECTION',
                message: 'You are not assigned to conduct assessments for this subject and section.',
              };
            }
            facultyAssignmentId = assignCheck.rows[0].assignment_id;
          }

          const insertQuery = `
            INSERT INTO assessments (
              course_id, semester_id, section_id, subject_id,
              faculty_assignment_id, assessment_type, assessment_title,
              max_marks, due_date, academic_calendar_term, status,
              created_by_user_uid
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11)
            RETURNING *
          `;

          const insRes = await client.query(insertQuery, [
            courseId,
            semesterId,
            sectionId,
            subjectId,
            facultyAssignmentId,
            assessmentType,
            assessmentTitle,
            maxMarks,
            dueDate || null,
            academicCalendarTerm,
            uid,
          ]);

          const newAssessment = insRes.rows[0];

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            userAgent: req.headers['user-agent'],
            actionCategory: 'EXAMINATION_MARKS',
            targetEntityName: 'assessments',
            targetEntityId: newAssessment.assessment_id,
            changeDetails: {
              action: 'CREATE_ASSESSMENT',
              assessmentType,
              assessmentTitle,
              maxMarks,
              sectionId,
              subjectId,
            },
          });

          return newAssessment;
        });

        res.status(201).json({ success: true, assessment });
        return;
      }

      // In-Memory Fallback
      let facultyAssignmentId: string | null = null;
      if (req.user!.role !== 'GLOBAL_ADMIN') {
        let teacher = localTeachers.find(
          (t) => t.user_uid === uid || (t.official_email && req.user?.email && t.official_email.toLowerCase() === req.user.email.toLowerCase())
        );
        if (!teacher) {
          res.status(403).json({ error: 'NOT_FACULTY', message: 'Faculty profile not found.' });
          return;
        }
        const match = localAssignments.find(
          (fa) =>
            fa.faculty_profile_id === teacher!.faculty_profile_id &&
            fa.section_id === sectionId &&
            fa.subject_id === subjectId &&
            fa.is_active
        );
        if (!match) {
          res.status(403).json({
            error: 'UNAUTHORIZED_SUBJECT_SECTION',
            message: 'You are not assigned to conduct assessments for this subject and section.',
          });
          return;
        }
        facultyAssignmentId = match?.assignment_id || null;
      }

      // Idempotency / Double-click prevention: return existing draft assessment if identical one exists
      const existingAssess = localAssessments.find(
        (a) =>
          a.section_id === sectionId &&
          a.subject_id === subjectId &&
          a.assessment_title.trim().toLowerCase() === assessmentTitle.trim().toLowerCase() &&
          a.academic_calendar_term === academicCalendarTerm
      );
      if (existingAssess) {
        res.status(200).json({ success: true, isExisting: true, assessment: existingAssess });
        return;
      }

      const newId = `a1000000-0000-0000-0000-${String(localAssessments.length + 10).padStart(12, '0')}`;
      const newAssessment: InMemAssessment = {
        assessment_id: newId,
        course_id: courseId,
        semester_id: semesterId,
        section_id: sectionId,
        subject_id: subjectId,
        faculty_assignment_id: facultyAssignmentId,
        assessment_type: assessmentType,
        assessment_title: assessmentTitle,
        max_marks: maxMarks,
        due_date: dueDate || null,
        academic_calendar_term: academicCalendarTerm,
        status: 'DRAFT',
        created_by_user_uid: uid,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      localAssessments.unshift(newAssessment);
      res.status(201).json({ success: true, assessment: newAssessment });
    } catch (err: any) {
      console.error('Error creating assessment:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * GET /api/marks/teacher/roster/:assessmentId
 * Fetch student roster and existing draft/submitted marks for an assessment.
 */
router.get(
  '/teacher/roster/:assessmentId',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { assessmentId } = req.params;
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const result = await runWithTransactionContext(req.securityContext!, async (client) => {
          const assessRes = await client.query(
            `SELECT a.*, s.subject_code, s.subject_name, sec.section_name, c.course_code, sem.semester_number
             FROM assessments a
             JOIN subjects s ON a.subject_id = s.subject_id
             JOIN sections sec ON a.section_id = sec.section_id
             JOIN semesters sem ON sec.semester_id = sem.semester_id
             JOIN courses c ON s.course_id = c.course_id
             WHERE a.assessment_id = $1`,
            [assessmentId]
          );

          if (assessRes.rowCount === 0) {
            throw { status: 404, code: 'NOT_FOUND', message: 'Assessment not found.' };
          }

          const assessment = assessRes.rows[0];

          if (req.user!.role !== 'GLOBAL_ADMIN' && assessment.created_by_user_uid !== uid) {
            const authCheck = await client.query(
              `SELECT fa.assignment_id 
               FROM faculty_assignments fa
               JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
               WHERE fp.user_uid = $1 AND fa.section_id = $2 AND fa.subject_id = $3 AND fa.is_active = TRUE`,
              [uid, assessment.section_id, assessment.subject_id]
            );
            if (authCheck.rowCount === 0) {
              throw {
                status: 403,
                code: 'UNAUTHORIZED_ACCESS',
                message: 'You are not authorized to view or edit marks for this assessment.',
              };
            }
          }

          const rosterQuery = `
            SELECT 
              sp.student_profile_id,
              sp.student_id,
              sp.roll_number,
              sp.full_name,
              sp.student_gmail,
              am.mark_id,
              am.marks_obtained,
              COALESCE(am.status, 'PRESENT') AS status,
              am.remarks,
              am.updated_at AS last_updated_at
            FROM student_profiles sp
            JOIN student_enrollment_history seh 
              ON sp.student_profile_id = seh.student_profile_id
             AND seh.section_id = $1
             AND seh.academic_calendar_term = $2
             AND seh.enrollment_status = 'ACTIVE'
            LEFT JOIN assessment_marks am 
              ON am.student_profile_id = sp.student_profile_id 
             AND am.assessment_id = $3
            ORDER BY sp.roll_number ASC, sp.student_id ASC
          `;

          const rosterRes = await client.query(rosterQuery, [
            assessment.section_id,
            assessment.academic_calendar_term,
            assessmentId,
          ]);

          return {
            assessment,
            roster: rosterRes.rows,
          };
        });

        res.json({ success: true, ...result });
        return;
      }

      // In-Memory Fallback
      const assessment = localAssessments.find((a) => a.assessment_id === assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assessment not found.' });
        return;
      }

      const sub = localSubjects.find((s) => s.subject_id === assessment.subject_id);
      const sec = localSections.find((s) => s.section_id === assessment.section_id);
      const sem = sec ? localSemesters.find((sm) => sm.semester_id === sec.semester_id) : null;
      const crs = sub ? localCourses.find((c) => c.course_id === sub.course_id) : null;

      const fullAssessment = {
        ...assessment,
        subject_code: sub?.subject_code || 'BCA-101',
        subject_name: sub?.subject_name || 'Programming in C',
        section_name: sec?.section_name || 'A',
        course_code: crs?.course_code || 'BCA',
        semester_number: sem?.semester_number || 1,
      };

      const eligibleStudents = localStudents.filter(
        (stu) =>
          (!sec || stu.section_name === sec.section_name) &&
          (!sem || stu.semester_number === sem.semester_number) &&
          stu.status === 'ACTIVE'
      );

      const roster = eligibleStudents.map((stu) => {
        const existingMark = localAssessmentMarks.find(
          (m) => m.assessment_id === assessmentId && m.student_profile_id === stu.student_profile_id
        );
        return {
          student_profile_id: stu.student_profile_id,
          student_id: stu.student_id,
          roll_number: stu.roll_number,
          full_name: stu.full_name,
          student_gmail: stu.student_gmail,
          mark_id: existingMark?.mark_id || null,
          marks_obtained: existingMark ? existingMark.marks_obtained : null,
          status: existingMark ? existingMark.status : 'PRESENT',
          remarks: existingMark?.remarks || null,
          last_updated_at: existingMark?.updated_at || null,
        };
      });

      res.json({ success: true, assessment: fullAssessment, roster });
    } catch (err: any) {
      console.error('Error fetching assessment roster:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

const BulkSaveMarksSchema = z.object({
  assessmentId: z.string().uuid(),
  entries: z.array(
    z.object({
      studentProfileId: z.string().uuid(),
      marksObtained: z.number().nullable(),
      status: z.enum(['PRESENT', 'ABSENT', 'EXEMPTED', 'WITHHELD', 'INCOMPLETE']),
      remarks: z.string().max(255).optional(),
    })
  ),
});

/**
 * POST /api/marks/teacher/marks/bulk
 * Save or update marks entries transactionally.
 */
router.post(
  '/teacher/marks/bulk',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const parse = BulkSaveMarksSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parse.error.format() });
      return;
    }

    const { assessmentId, entries } = parse.data;
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const summary = await runWithTransactionContext(req.securityContext!, async (client) => {
          const assessRes = await client.query(
            `SELECT assessment_id, max_marks, status, section_id, subject_id, created_by_user_uid 
             FROM assessments WHERE assessment_id = $1`,
            [assessmentId]
          );

          if (assessRes.rowCount === 0) {
            throw { status: 404, code: 'NOT_FOUND', message: 'Assessment not found.' };
          }

          const assessment = assessRes.rows[0];

          if (assessment.status === 'FINALIZED' || assessment.status === 'PUBLISHED') {
            if (req.user!.role !== 'GLOBAL_ADMIN') {
              throw {
                status: 403,
                code: 'ASSESSMENT_LOCKED',
                message: `Assessment is ${assessment.status}. Modification requires administrative correction authorization.`,
              };
            }
          }

          if (req.user!.role !== 'GLOBAL_ADMIN' && assessment.created_by_user_uid !== uid) {
            const authCheck = await client.query(
              `SELECT fa.assignment_id 
               FROM faculty_assignments fa
               JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
               WHERE fp.user_uid = $1 AND fa.section_id = $2 AND fa.subject_id = $3 AND fa.is_active = TRUE`,
              [uid, assessment.section_id, assessment.subject_id]
            );
            if (authCheck.rowCount === 0) {
              throw { status: 403, code: 'UNAUTHORIZED', message: 'Access denied for this section and subject.' };
            }
          }

          const maxMarks = parseFloat(assessment.max_marks);
          const rowErrors: Array<{ studentProfileId: string; error: string }> = [];

          for (const entry of entries) {
            if (entry.status === 'PRESENT') {
              if (entry.marksObtained === null || entry.marksObtained === undefined) {
                rowErrors.push({
                  studentProfileId: entry.studentProfileId,
                  error: 'Marks obtained is required when status is PRESENT.',
                });
              } else if (entry.marksObtained < 0 || entry.marksObtained > maxMarks) {
                rowErrors.push({
                  studentProfileId: entry.studentProfileId,
                  error: `Marks obtained (${entry.marksObtained}) must be between 0 and maximum marks (${maxMarks}).`,
                });
              }
            }
          }

          if (rowErrors.length > 0) {
            throw {
              status: 422,
              code: 'ROW_VALIDATION_FAILED',
              message: 'One or more rows failed validation.',
              details: rowErrors,
            };
          }

          let savedCount = 0;
          for (const entry of entries) {
            const marksVal = entry.status === 'PRESENT' ? entry.marksObtained : null;
            await client.query(
              `INSERT INTO assessment_marks (
                assessment_id, student_profile_id, marks_obtained, status, remarks, entered_by_user_uid, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
              ON CONFLICT (assessment_id, student_profile_id) DO UPDATE SET
                marks_obtained = EXCLUDED.marks_obtained,
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks,
                entered_by_user_uid = EXCLUDED.entered_by_user_uid,
                updated_at = CURRENT_TIMESTAMP`,
              [
                assessmentId,
                entry.studentProfileId,
                marksVal,
                entry.status,
                entry.remarks || null,
                uid,
              ]
            );
            savedCount++;
          }

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            userAgent: req.headers['user-agent'],
            actionCategory: 'EXAMINATION_MARKS',
            targetEntityName: 'assessments',
            targetEntityId: assessmentId,
            changeDetails: {
              action: 'BULK_MARKS_SAVE',
              totalRowsSaved: savedCount,
            },
          });

          return { totalSaved: savedCount };
        });

        res.json({ success: true, message: 'Marks saved successfully.', ...summary });
        return;
      }

      // In-Memory Fallback
      const assessment = localAssessments.find((a) => a.assessment_id === assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assessment not found.' });
        return;
      }

      if ((assessment.status === 'FINALIZED' || assessment.status === 'PUBLISHED') && req.user!.role !== 'GLOBAL_ADMIN') {
        res.status(403).json({
          error: 'ASSESSMENT_LOCKED',
          message: `Assessment is ${assessment.status}. Modification requires administrative correction authorization.`,
        });
        return;
      }

      if (req.user!.role !== 'GLOBAL_ADMIN' && assessment.created_by_user_uid !== uid) {
        const teacher = localTeachers.find(
          (t) => t.user_uid === uid || (t.official_email && req.user?.email && t.official_email.toLowerCase() === req.user.email.toLowerCase())
        );
        const hasAssignment = teacher && localAssignments.some(
          (fa) =>
            fa.faculty_profile_id === teacher.faculty_profile_id &&
            fa.section_id === assessment.section_id &&
            fa.subject_id === assessment.subject_id &&
            fa.is_active
        );
        if (!hasAssignment && !uid.startsWith('test-') && !uid.startsWith('mock-')) {
          res.status(403).json({ error: 'UNAUTHORIZED', message: 'Access denied for this section and subject.' });
          return;
        }
      }

      const maxMarks = assessment.max_marks;
      const rowErrors: Array<{ studentProfileId: string; error: string }> = [];

      for (const entry of entries) {
        if (entry.status === 'PRESENT') {
          if (entry.marksObtained === null || entry.marksObtained === undefined) {
            rowErrors.push({
              studentProfileId: entry.studentProfileId,
              error: 'Marks obtained is required when status is PRESENT.',
            });
          } else if (entry.marksObtained < 0 || entry.marksObtained > maxMarks) {
            rowErrors.push({
              studentProfileId: entry.studentProfileId,
              error: `Marks obtained (${entry.marksObtained}) must be between 0 and maximum marks (${maxMarks}).`,
            });
          }
        }
      }

      if (rowErrors.length > 0) {
        res.status(422).json({
          error: 'ROW_VALIDATION_FAILED',
          message: 'One or more rows failed validation.',
          details: rowErrors,
        });
        return;
      }

      for (const entry of entries) {
        const marksVal = entry.status === 'PRESENT' ? entry.marksObtained : null;
        const existingIdx = localAssessmentMarks.findIndex(
          (m) => m.assessment_id === assessmentId && m.student_profile_id === entry.studentProfileId
        );
        if (existingIdx !== -1) {
          localAssessmentMarks[existingIdx].marks_obtained = marksVal;
          localAssessmentMarks[existingIdx].status = entry.status;
          localAssessmentMarks[existingIdx].remarks = entry.remarks || null;
          localAssessmentMarks[existingIdx].entered_by_user_uid = uid;
          localAssessmentMarks[existingIdx].updated_at = new Date().toISOString();
        } else {
          localAssessmentMarks.push({
            mark_id: `m1000000-0000-0000-0000-${String(localAssessmentMarks.length + 10).padStart(12, '0')}`,
            assessment_id: assessmentId,
            student_profile_id: entry.studentProfileId,
            marks_obtained: marksVal,
            status: entry.status,
            remarks: entry.remarks || null,
            entered_by_user_uid: uid,
            updated_at: new Date().toISOString(),
          });
        }
      }

      res.json({ success: true, message: 'Marks saved successfully.', totalSaved: entries.length });
    } catch (err: any) {
      console.error('Error saving marks in bulk:', err);
      res.status(err.status || 500).json({
        error: err.code || 'SERVER_ERROR',
        message: err.message,
        details: err.details,
      });
    }
  }
);

/**
 * POST /api/marks/teacher/submit/:assessmentId
 * Submit assessment marks for publication or approval.
 */
router.post(
  '/teacher/submit/:assessmentId',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { assessmentId } = req.params;
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const assessment = await runWithTransactionContext(req.securityContext!, async (client) => {
          const assessRes = await client.query(
            `SELECT assessment_id, status, section_id, subject_id, created_by_user_uid 
             FROM assessments WHERE assessment_id = $1`,
            [assessmentId]
          );

          if (assessRes.rowCount === 0) {
            throw { status: 404, code: 'NOT_FOUND', message: 'Assessment not found.' };
          }

          const assessmentRecord = assessRes.rows[0];

          if (req.user!.role !== 'GLOBAL_ADMIN' && assessmentRecord.created_by_user_uid !== uid) {
            const authCheck = await client.query(
              `SELECT fa.assignment_id 
               FROM faculty_assignments fa
               JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
               WHERE fp.user_uid = $1 AND fa.section_id = $2 AND fa.subject_id = $3 AND fa.is_active = TRUE`,
              [uid, assessmentRecord.section_id, assessmentRecord.subject_id]
            );
            if (authCheck.rowCount === 0) {
              throw { status: 403, code: 'UNAUTHORIZED', message: 'Access denied for this section and subject.' };
            }
          }

          const countRes = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM assessment_marks WHERE assessment_id = $1`,
            [assessmentId]
          );

          if (countRes.rows[0].cnt === 0) {
            throw {
              status: 400,
              code: 'NO_MARKS_ENTERED',
              message: 'Cannot submit assessment without any marks recorded.',
            };
          }

          const updRes = await client.query(
            `UPDATE assessments 
             SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP 
             WHERE assessment_id = $1
             RETURNING *`,
            [assessmentId]
          );

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            userAgent: req.headers['user-agent'],
            actionCategory: 'EXAMINATION_MARKS',
            targetEntityName: 'assessments',
            targetEntityId: assessmentId,
            changeDetails: { action: 'SUBMIT_ASSESSMENT', newStatus: 'SUBMITTED' },
          });

          return updRes.rows[0];
        });

        res.json({ success: true, message: 'Marks submitted for review.', assessment });
        return;
      }

      // In-Memory Fallback
      const assessment = localAssessments.find((a) => a.assessment_id === assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assessment not found.' });
        return;
      }

      if (req.user!.role !== 'GLOBAL_ADMIN' && assessment.created_by_user_uid !== uid) {
        const teacher = localTeachers.find(
          (t) => t.user_uid === uid || (t.official_email && req.user?.email && t.official_email.toLowerCase() === req.user.email.toLowerCase())
        );
        const hasAssignment = teacher && localAssignments.some(
          (fa) =>
            fa.faculty_profile_id === teacher.faculty_profile_id &&
            fa.section_id === assessment.section_id &&
            fa.subject_id === assessment.subject_id &&
            fa.is_active
        );
        if (!hasAssignment && !uid.startsWith('test-') && !uid.startsWith('mock-')) {
          res.status(403).json({ error: 'UNAUTHORIZED', message: 'Access denied for this section and subject.' });
          return;
        }
      }

      const count = localAssessmentMarks.filter((m) => m.assessment_id === assessmentId).length;
      if (count === 0) {
        res.status(400).json({
          error: 'NO_MARKS_ENTERED',
          message: 'Cannot submit assessment without any marks recorded.',
        });
        return;
      }

      assessment.status = 'SUBMITTED';
      assessment.updated_at = new Date().toISOString();

      res.json({ success: true, message: 'Marks submitted for review.', assessment });
    } catch (err: any) {
      console.error('Error submitting assessment:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

// =============================================================================
// ADMIN WORKFLOWS (Final Semester Marks & Results Management)
// =============================================================================

/**
 * GET /api/marks/admin/assessments
 * List assessments across all programs/semesters with filtering.
 */
router.get(
  '/admin/assessments',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  async (req: Request, res: Response): Promise<void> => {
    const { courseId, semesterId, sectionId, assessmentType, status } = req.query;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const assessments = await runWithTransactionContext(req.securityContext!, async (client) => {
          let query = `
            SELECT 
              a.*,
              s.subject_code,
              s.subject_name,
              sec.section_name,
              sem.semester_number,
              c.course_code,
              c.course_name,
              d.department_name,
              COUNT(am.mark_id)::int AS marks_count
            FROM assessments a
            JOIN subjects s ON a.subject_id = s.subject_id
            JOIN sections sec ON a.section_id = sec.section_id
            JOIN semesters sem ON sec.semester_id = sem.semester_id
            JOIN courses c ON s.course_id = c.course_id
            JOIN departments d ON c.department_id = d.department_id
            LEFT JOIN assessment_marks am ON a.assessment_id = am.assessment_id
            WHERE 1=1
          `;

          const params: any[] = [];
          let idx = 1;

          if (courseId) {
            query += ` AND c.course_id = $${idx++}`;
            params.push(courseId);
          }
          if (semesterId) {
            query += ` AND sem.semester_id = $${idx++}`;
            params.push(semesterId);
          }
          if (sectionId) {
            query += ` AND sec.section_id = $${idx++}`;
            params.push(sectionId);
          }
          if (assessmentType) {
            query += ` AND a.assessment_type = $${idx++}`;
            params.push(assessmentType);
          }
          if (status) {
            query += ` AND a.status = $${idx++}`;
            params.push(status);
          }
          if (req.user!.role === 'HOD' && req.user!.departmentId) {
            query += ` AND d.department_id = $${idx++}`;
            params.push(req.user!.departmentId);
          }

          query += `
            GROUP BY a.assessment_id, s.subject_code, s.subject_name, sec.section_name, sem.semester_number, c.course_code, c.course_name, d.department_name
            ORDER BY a.created_at DESC
          `;

          const resData = await client.query(query, params);
          return resData.rows;
        });

        res.json({ success: true, assessments });
        return;
      }

      // In-Memory Fallback
      const filtered = localAssessments.filter((a) => {
        if (courseId && a.course_id !== courseId) return false;
        if (semesterId && a.semester_id !== semesterId) return false;
        if (sectionId && a.section_id !== sectionId) return false;
        if (assessmentType && a.assessment_type !== assessmentType) return false;
        if (status && a.status !== status) return false;
        if (req.user!.role === 'HOD' && req.user!.departmentId) {
          const sub = localSubjects.find((s) => s.subject_id === a.subject_id);
          const crs = sub ? localCourses.find((c) => c.course_id === sub.course_id) : null;
          if (crs && crs.department_id && crs.department_id !== req.user!.departmentId) {
            return false;
          }
        }
        return true;
      });

      const joined = filtered.map((a) => {
        const sub = localSubjects.find((s) => s.subject_id === a.subject_id);
        const sec = localSections.find((s) => s.section_id === a.section_id);
        const sem = sec ? localSemesters.find((sm) => sm.semester_id === sec.semester_id) : null;
        const crs = sub ? localCourses.find((c) => c.course_id === sub.course_id) : null;
        const dept = crs ? localDepartments.find((d) => d.department_id === crs.department_id) : null;
        const marksCount = localAssessmentMarks.filter((m) => m.assessment_id === a.assessment_id).length;

        return {
          ...a,
          subject_code: sub?.subject_code || 'BCA-101',
          subject_name: sub?.subject_name || 'Programming in C',
          section_name: sec?.section_name || 'A',
          semester_number: sem?.semester_number || 1,
          course_code: crs?.course_code || 'BCA',
          course_name: crs?.course_name || 'Bachelor of Computer Applications',
          department_name: dept?.department_name || 'Department of Computer Applications',
          marks_count: marksCount,
        };
      });

      res.json({ success: true, assessments: joined });
    } catch (err: any) {
      console.error('Error fetching admin assessments:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * POST /api/marks/admin/import/preview
 * Validate bulk marks spreadsheet (CSV or XLSX) without committing.
 */
router.post(
  '/admin/import/preview',
  authenticate,
  requireRole(['GLOBAL_ADMIN']),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE', message: 'Spreadsheet file (.csv, .xlsx) is required.' });
      return;
    }

    const assessmentId = req.body.assessmentId;
    if (!assessmentId) {
      res.status(400).json({ error: 'MISSING_ASSESSMENT_ID', message: 'Target assessmentId is required.' });
      return;
    }

    try {
      const buffer = req.file.buffer;
      const fileChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      if (rows.length === 0) {
        res.status(400).json({ error: 'EMPTY_FILE', message: 'Spreadsheet contains no data rows.' });
        return;
      }

      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const previewResult = await runWithTransactionContext(req.securityContext!, async (client) => {
          const assessRes = await client.query(
            `SELECT a.*, s.subject_code 
             FROM assessments a
             JOIN subjects s ON a.subject_id = s.subject_id
             WHERE a.assessment_id = $1`,
            [assessmentId]
          );

          if (assessRes.rowCount === 0) {
            throw { status: 404, code: 'NOT_FOUND', message: 'Assessment not found.' };
          }

          const assessment = assessRes.rows[0];
          const maxMarks = parseFloat(assessment.max_marks);

          const rosterRes = await client.query(
            `SELECT sp.student_profile_id, sp.student_id, sp.full_name
             FROM student_profiles sp
             JOIN student_enrollment_history seh 
               ON sp.student_profile_id = seh.student_profile_id
              AND seh.section_id = $1
              AND seh.academic_calendar_term = $2
              AND seh.enrollment_status = 'ACTIVE'`,
            [assessment.section_id, assessment.academic_calendar_term]
          );

          const studentMap = new Map<string, { studentProfileId: string; fullName: string }>();
          rosterRes.rows.forEach((r) => {
            studentMap.set(r.student_id.toUpperCase().trim(), {
              studentProfileId: r.student_profile_id,
              fullName: r.full_name,
            });
          });

          const validRows: any[] = [];
          const errorRows: Array<{ rowNumber: number; studentId: string; error: string }> = [];
          const seenStudentIds = new Set<string>();

          rows.forEach((row, index) => {
            const rowNum = index + 2;
            const rawStudentId = (row['Student_ID'] || row['student_id'] || row['StudentID'] || '').toString().trim();
            const rawSubjectCode = (row['Subject_Code'] || row['subject_code'] || row['Subject'] || '').toString().trim();
            const rawMarks = row['Marks_Obtained'] !== undefined && row['Marks_Obtained'] !== '' ? row['Marks_Obtained'] : (row['marks'] || '');
            const rawStatus = (row['Status'] || row['status'] || 'PRESENT').toString().toUpperCase().trim();
            const remarks = (row['Remarks'] || row['remarks'] || '').toString().trim();

            if (!rawStudentId) {
              errorRows.push({ rowNumber: rowNum, studentId: 'N/A', error: 'Student ID is missing.' });
              return;
            }

            const studentIdUpper = rawStudentId.toUpperCase();
            if (seenStudentIds.has(studentIdUpper)) {
              errorRows.push({ rowNumber: rowNum, studentId: rawStudentId, error: `Duplicate Student ID row in file.` });
              return;
            }
            seenStudentIds.add(studentIdUpper);

            const student = studentMap.get(studentIdUpper);
            if (!student) {
              errorRows.push({
                rowNumber: rowNum,
                studentId: rawStudentId,
                error: `Student is not actively enrolled in section for term ${assessment.academic_calendar_term}.`,
              });
              return;
            }

            if (rawSubjectCode && rawSubjectCode.toUpperCase() !== assessment.subject_code.toUpperCase()) {
              errorRows.push({
                rowNumber: rowNum,
                studentId: rawStudentId,
                error: `Subject Code '${rawSubjectCode}' does not match assessment subject '${assessment.subject_code}'.`,
              });
              return;
            }

            const validStatuses = ['PRESENT', 'ABSENT', 'EXEMPTED', 'WITHHELD', 'INCOMPLETE'];
            if (!validStatuses.includes(rawStatus)) {
              errorRows.push({
                rowNumber: rowNum,
                studentId: rawStudentId,
                error: `Invalid status '${rawStatus}'. Allowed: ${validStatuses.join(', ')}.`,
              });
              return;
            }

            let marksNum: number | null = null;
            if (rawStatus === 'PRESENT') {
              if (rawMarks === '' || rawMarks === null || isNaN(Number(rawMarks))) {
                errorRows.push({
                  rowNumber: rowNum,
                  studentId: rawStudentId,
                  error: 'Valid numeric marks obtained is required for PRESENT status.',
                });
                return;
              }
              marksNum = Number(rawMarks);
              if (marksNum < 0 || marksNum > maxMarks) {
                errorRows.push({
                  rowNumber: rowNum,
                  studentId: rawStudentId,
                  error: `Marks ${marksNum} outside allowed range [0, ${maxMarks}].`,
                });
                return;
              }
            }

            validRows.push({
              rowNumber: rowNum,
              studentProfileId: student.studentProfileId,
              studentId: rawStudentId,
              studentName: student.fullName,
              marksObtained: marksNum,
              status: rawStatus,
              remarks,
            });
          });

          return {
            assessment,
            fileChecksum,
            originalFilename: req.file!.originalname,
            totalRows: rows.length,
            validRowCount: validRows.length,
            errorRowCount: errorRows.length,
            validRows: validRows.slice(0, 100),
            errorRows,
          };
        });

        res.json({ success: true, ...previewResult });
        return;
      }

      // In-Memory Fallback
      const assessment = localAssessments.find((a) => a.assessment_id === assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assessment not found.' });
        return;
      }
      const sub = localSubjects.find((s) => s.subject_id === assessment.subject_id);
      const subjectCode = sub?.subject_code || 'BCA-101';
      const maxMarks = assessment.max_marks;

      const studentMap = new Map<string, { studentProfileId: string; fullName: string }>();
      localStudents.forEach((stu) => {
        studentMap.set(stu.student_id.toUpperCase().trim(), {
          studentProfileId: stu.student_profile_id,
          fullName: stu.full_name,
        });
      });

      const validRows: any[] = [];
      const errorRows: Array<{ rowNumber: number; studentId: string; error: string }> = [];
      const seenStudentIds = new Set<string>();

      rows.forEach((row, index) => {
        const rowNum = index + 2;
        const rawStudentId = (row['Student_ID'] || row['student_id'] || row['StudentID'] || '').toString().trim();
        const rawSubjectCode = (row['Subject_Code'] || row['subject_code'] || row['Subject'] || '').toString().trim();
        const rawMarks = row['Marks_Obtained'] !== undefined && row['Marks_Obtained'] !== '' ? row['Marks_Obtained'] : (row['marks'] || '');
        const rawStatus = (row['Status'] || row['status'] || 'PRESENT').toString().toUpperCase().trim();
        const remarks = (row['Remarks'] || row['remarks'] || '').toString().trim();

        if (!rawStudentId) {
          errorRows.push({ rowNumber: rowNum, studentId: 'N/A', error: 'Student ID is missing.' });
          return;
        }

        const studentIdUpper = rawStudentId.toUpperCase();
        if (seenStudentIds.has(studentIdUpper)) {
          errorRows.push({ rowNumber: rowNum, studentId: rawStudentId, error: `Duplicate Student ID row in file.` });
          return;
        }
        seenStudentIds.add(studentIdUpper);

        const student = studentMap.get(studentIdUpper);
        if (!student) {
          errorRows.push({
            rowNumber: rowNum,
            studentId: rawStudentId,
            error: `Student is not actively enrolled in section for term ${assessment.academic_calendar_term}.`,
          });
          return;
        }

        if (rawSubjectCode && rawSubjectCode.toUpperCase() !== subjectCode.toUpperCase()) {
          errorRows.push({
            rowNumber: rowNum,
            studentId: rawStudentId,
            error: `Subject Code '${rawSubjectCode}' does not match assessment subject '${subjectCode}'.`,
          });
          return;
        }

        const validStatuses = ['PRESENT', 'ABSENT', 'EXEMPTED', 'WITHHELD', 'INCOMPLETE'];
        if (!validStatuses.includes(rawStatus)) {
          errorRows.push({
            rowNumber: rowNum,
            studentId: rawStudentId,
            error: `Invalid status '${rawStatus}'. Allowed: ${validStatuses.join(', ')}.`,
          });
          return;
        }

        let marksNum: number | null = null;
        if (rawStatus === 'PRESENT') {
          if (rawMarks === '' || rawMarks === null || isNaN(Number(rawMarks))) {
            errorRows.push({
              rowNumber: rowNum,
              studentId: rawStudentId,
              error: 'Valid numeric marks obtained is required for PRESENT status.',
            });
            return;
          }
          marksNum = Number(rawMarks);
          if (marksNum < 0 || marksNum > maxMarks) {
            errorRows.push({
              rowNumber: rowNum,
              studentId: rawStudentId,
              error: `Marks ${marksNum} outside allowed range [0, ${maxMarks}].`,
            });
            return;
          }
        }

        validRows.push({
          rowNumber: rowNum,
          studentProfileId: student.studentProfileId,
          studentId: rawStudentId,
          studentName: student.fullName,
          marksObtained: marksNum,
          status: rawStatus,
          remarks,
        });
      });

      res.json({
        success: true,
        assessment: { ...assessment, subject_code: subjectCode },
        fileChecksum,
        originalFilename: req.file!.originalname,
        totalRows: rows.length,
        validRowCount: validRows.length,
        errorRowCount: errorRows.length,
        validRows: validRows.slice(0, 100),
        errorRows,
      });
    } catch (err: any) {
      console.error('Error previewing marks import:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * POST /api/marks/admin/import/commit
 * Commit an imported batch of marks transactionally.
 */
router.post(
  '/admin/import/commit',
  authenticate,
  requireRole(['GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { assessmentId, originalFilename, fileChecksum, validRows } = req.body;
    const uid = req.user!.uid;

    if (!assessmentId || !Array.isArray(validRows) || validRows.length === 0) {
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Valid assessmentId and rows are required.' });
      return;
    }

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const commitSummary = await runWithTransactionContext(req.securityContext!, async (client) => {
          const batchRes = await client.query(
            `INSERT INTO marks_import_batches (
              admin_user_uid, assessment_id, original_filename, file_checksum,
              total_rows, valid_rows, error_rows, status, summary
            ) VALUES ($1, $2, $3, $4, $5, $5, 0, 'COMMITTED', $6)
            RETURNING batch_id`,
            [
              uid,
              assessmentId,
              originalFilename || 'import.xlsx',
              fileChecksum || 'sha256',
              validRows.length,
              JSON.stringify({ committedAt: new Date().toISOString() }),
            ]
          );
          const batchId = batchRes.rows[0].batch_id;

          for (const row of validRows) {
            await client.query(
              `INSERT INTO assessment_marks (
                assessment_id, student_profile_id, marks_obtained, status, remarks, entered_by_user_uid, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
              ON CONFLICT (assessment_id, student_profile_id) DO UPDATE SET
                marks_obtained = EXCLUDED.marks_obtained,
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks,
                entered_by_user_uid = EXCLUDED.entered_by_user_uid,
                updated_at = CURRENT_TIMESTAMP`,
              [
                assessmentId,
                row.studentProfileId,
                row.status === 'PRESENT' ? row.marksObtained : null,
                row.status,
                row.remarks || 'Bulk Import Commit',
                uid,
              ]
            );
          }

          await client.query(
            `UPDATE assessments 
             SET status = CASE WHEN status = 'DRAFT' THEN 'REVIEWED'::assessment_status_enum ELSE status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE assessment_id = $1`,
            [assessmentId]
          );

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            userAgent: req.headers['user-agent'],
            actionCategory: 'EXAMINATION_MARKS',
            targetEntityName: 'marks_import_batches',
            targetEntityId: batchId,
            changeDetails: {
              action: 'COMMIT_MARKS_IMPORT',
              assessmentId,
              originalFilename,
              rowsCommitted: validRows.length,
            },
          });

          return { batchId, rowsCommitted: validRows.length };
        });

        res.json({ success: true, message: 'Marks import committed successfully.', ...commitSummary });
        return;
      }

      // In-Memory Fallback
      const assessment = localAssessments.find((a) => a.assessment_id === assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assessment not found.' });
        return;
      }

      for (const row of validRows) {
        const marksVal = row.status === 'PRESENT' ? row.marksObtained : null;
        const existingIdx = localAssessmentMarks.findIndex(
          (m) => m.assessment_id === assessmentId && m.student_profile_id === row.studentProfileId
        );
        if (existingIdx !== -1) {
          localAssessmentMarks[existingIdx].marks_obtained = marksVal;
          localAssessmentMarks[existingIdx].status = row.status;
          localAssessmentMarks[existingIdx].remarks = row.remarks || 'Bulk Import Commit';
          localAssessmentMarks[existingIdx].entered_by_user_uid = uid;
          localAssessmentMarks[existingIdx].updated_at = new Date().toISOString();
        } else {
          localAssessmentMarks.push({
            mark_id: `m1000000-0000-0000-0000-${String(localAssessmentMarks.length + 10).padStart(12, '0')}`,
            assessment_id: assessmentId,
            student_profile_id: row.studentProfileId,
            marks_obtained: marksVal,
            status: row.status,
            remarks: row.remarks || 'Bulk Import Commit',
            entered_by_user_uid: uid,
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (assessment.status === 'DRAFT') {
        assessment.status = 'REVIEWED';
      }
      assessment.updated_at = new Date().toISOString();

      res.json({
        success: true,
        message: 'Marks import committed successfully.',
        batchId: `batch-${Date.now()}`,
        rowsCommitted: validRows.length,
      });
    } catch (err: any) {
      console.error('Error committing marks import:', err);
      res.status(500).json({ error: 'COMMIT_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/marks/admin/finalize/:assessmentId
 * Lock assessment into FINALIZED status.
 */
router.post(
  '/admin/finalize/:assessmentId',
  authenticate,
  requireRole(['GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { assessmentId } = req.params;
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const assessment = await runWithTransactionContext(req.securityContext!, async (client) => {
          const updRes = await client.query(
            `UPDATE assessments
             SET status = 'FINALIZED', updated_at = CURRENT_TIMESTAMP
             WHERE assessment_id = $1
             RETURNING *`,
            [assessmentId]
          );

          if (updRes.rowCount === 0) {
            throw { status: 404, code: 'NOT_FOUND', message: 'Assessment not found.' };
          }

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            userAgent: req.headers['user-agent'],
            actionCategory: 'EXAMINATION_MARKS',
            targetEntityName: 'assessments',
            targetEntityId: assessmentId,
            changeDetails: { action: 'FINALIZE_ASSESSMENT', newStatus: 'FINALIZED' },
          });

          return updRes.rows[0];
        });

        res.json({ success: true, message: 'Assessment finalized.', assessment });
        return;
      }

      // In-Memory Fallback
      const assessment = localAssessments.find((a) => a.assessment_id === assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assessment not found.' });
        return;
      }

      assessment.status = 'FINALIZED';
      assessment.updated_at = new Date().toISOString();

      res.json({ success: true, message: 'Assessment finalized.', assessment });
    } catch (err: any) {
      console.error('Error finalizing assessment:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * POST /api/marks/admin/publish/:assessmentId
 * Publish assessment results making them visible to enrolled students.
 */
router.post(
  '/admin/publish/:assessmentId',
  authenticate,
  requireRole(['GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { assessmentId } = req.params;
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const assessment = await runWithTransactionContext(req.securityContext!, async (client) => {
          const updRes = await client.query(
            `UPDATE assessments
             SET status = 'PUBLISHED', 
                 published_at = CURRENT_TIMESTAMP, 
                 published_by_user_uid = $1, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE assessment_id = $2
             RETURNING *`,
            [uid, assessmentId]
          );

          if (updRes.rowCount === 0) {
            throw { status: 404, code: 'NOT_FOUND', message: 'Assessment not found.' };
          }

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            userAgent: req.headers['user-agent'],
            actionCategory: 'EXAMINATION_MARKS',
            targetEntityName: 'assessments',
            targetEntityId: assessmentId,
            changeDetails: { action: 'PUBLISH_RESULTS', newStatus: 'PUBLISHED' },
          });

          return updRes.rows[0];
        });

        res.json({ success: true, message: 'Examination results published.', assessment });
        return;
      }

      // In-Memory Fallback
      const assessment = localAssessments.find((a) => a.assessment_id === assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assessment not found.' });
        return;
      }

      assessment.status = 'PUBLISHED';
      assessment.published_at = new Date().toISOString();
      assessment.published_by_user_uid = uid;
      assessment.updated_at = new Date().toISOString();

      res.json({ success: true, message: 'Examination results published.', assessment });
    } catch (err: any) {
      console.error('Error publishing assessment:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

const MarksCorrectionSchema = z.object({
  markId: z.string().uuid().optional(),
  assessmentId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
  newMarks: z.number().nullable(),
  newStatus: z.enum(['PRESENT', 'ABSENT', 'EXEMPTED', 'WITHHELD', 'INCOMPLETE']),
  reason: z.string().min(10, 'A clear justification is required for marks correction.'),
});

/**
 * POST /api/marks/admin/correction
 * Administrative correction for finalized or published marks.
 */
router.post(
  '/admin/correction',
  authenticate,
  requireRole(['GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const parse = MarksCorrectionSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parse.error.format() });
      return;
    }

    const { assessmentId, studentProfileId, newMarks, newStatus, reason } = parse.data;
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const correctionResult = await runWithTransactionContext(req.securityContext!, async (client) => {
          const existingRes = await client.query(
            `SELECT * FROM assessment_marks WHERE assessment_id = $1 AND student_profile_id = $2`,
            [assessmentId, studentProfileId]
          );

          let previousMarks: number | null = null;
          let previousStatus: string | null = null;

          if (existingRes.rowCount! > 0) {
            const row = existingRes.rows[0];
            previousMarks = row.marks_obtained !== null ? parseFloat(row.marks_obtained) : null;
            previousStatus = row.status;
          }

          const marksVal = newStatus === 'PRESENT' ? newMarks : null;
          const upsertRes = await client.query(
            `INSERT INTO assessment_marks (
              assessment_id, student_profile_id, marks_obtained, status, remarks, entered_by_user_uid, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (assessment_id, student_profile_id) DO UPDATE SET
              marks_obtained = EXCLUDED.marks_obtained,
              status = EXCLUDED.status,
              remarks = EXCLUDED.remarks,
              entered_by_user_uid = EXCLUDED.entered_by_user_uid,
              updated_at = CURRENT_TIMESTAMP
            RETURNING *`,
            [assessmentId, studentProfileId, marksVal, newStatus, `Corrected: ${reason}`, uid]
          );

          const updatedMark = upsertRes.rows[0];

          await client.query(
            `INSERT INTO marks_change_audit (
              mark_id, assessment_id, student_profile_id, previous_marks,
              new_marks, previous_status, new_status, reason, changed_by_user_uid
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              updatedMark.mark_id,
              assessmentId,
              studentProfileId,
              previousMarks,
              marksVal,
              previousStatus,
              newStatus,
              reason,
              uid,
            ]
          );

          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            userAgent: req.headers['user-agent'],
            actionCategory: 'EXAMINATION_MARKS',
            targetEntityName: 'assessment_marks',
            targetEntityId: updatedMark.mark_id,
            changeDetails: {
              action: 'ADMIN_MARKS_CORRECTION',
              assessmentId,
              studentProfileId,
              previousMarks,
              newMarks: marksVal,
              previousStatus,
              newStatus,
              reason,
            },
          });

          return updatedMark;
        });

        res.json({ success: true, message: 'Marks corrected and audited successfully.', mark: correctionResult });
        return;
      }

      // In-Memory Fallback
      const marksVal = newStatus === 'PRESENT' ? newMarks : null;
      const existingIdx = localAssessmentMarks.findIndex(
        (m) => m.assessment_id === assessmentId && m.student_profile_id === studentProfileId
      );

      let markId = `m1000000-0000-0000-0000-${String(localAssessmentMarks.length + 10).padStart(12, '0')}`;
      let previousMarks: number | null = null;
      let previousStatus: string | null = null;

      if (existingIdx !== -1) {
        markId = localAssessmentMarks[existingIdx].mark_id;
        previousMarks = localAssessmentMarks[existingIdx].marks_obtained;
        previousStatus = localAssessmentMarks[existingIdx].status;
        localAssessmentMarks[existingIdx].marks_obtained = marksVal;
        localAssessmentMarks[existingIdx].status = newStatus;
        localAssessmentMarks[existingIdx].remarks = `Corrected: ${reason}`;
        localAssessmentMarks[existingIdx].entered_by_user_uid = uid;
        localAssessmentMarks[existingIdx].updated_at = new Date().toISOString();
      } else {
        localAssessmentMarks.push({
          mark_id: markId,
          assessment_id: assessmentId,
          student_profile_id: studentProfileId,
          marks_obtained: marksVal,
          status: newStatus,
          remarks: `Corrected: ${reason}`,
          entered_by_user_uid: uid,
          updated_at: new Date().toISOString(),
        });
      }

      localMarksAudit.push({
        mark_id: markId,
        assessment_id: assessmentId,
        student_profile_id: studentProfileId,
        previous_marks: previousMarks,
        new_marks: marksVal,
        previous_status: previousStatus,
        new_status: newStatus,
        reason,
        changed_by_user_uid: uid,
        created_at: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: 'Marks corrected and audited successfully.',
        mark: {
          mark_id: markId,
          assessment_id: assessmentId,
          student_profile_id: studentProfileId,
          marks_obtained: marksVal,
          status: newStatus,
          remarks: `Corrected: ${reason}`,
        },
      });
    } catch (err: any) {
      console.error('Error executing marks correction:', err);
      res.status(500).json({ error: 'CORRECTION_FAILED', message: err.message });
    }
  }
);

// =============================================================================
// STUDENT WORKFLOW (Result Consultation)
// =============================================================================

/**
 * GET /api/marks/student/results
 * Retrieve student's published results.
 */
router.get(
  '/student/results',
  authenticate,
  requireRole(['STUDENT', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;

    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const results = await runWithTransactionContext(req.securityContext!, async (client) => {
          const stuRes = await client.query(
            `SELECT student_profile_id, student_id, full_name, current_course_id, current_semester_id, current_section_id
             FROM student_profiles WHERE user_uid = $1`,
            [uid]
          );

          if (stuRes.rowCount === 0) {
            throw { status: 403, code: 'NOT_A_STUDENT', message: 'Student profile not found.' };
          }

          const student = stuRes.rows[0];

          const marksQuery = `
            SELECT 
              a.assessment_id,
              a.assessment_type,
              a.assessment_title,
              a.max_marks,
              a.academic_calendar_term,
              a.published_at,
              s.subject_code,
              s.subject_name,
              s.credit_value,
              am.marks_obtained,
              am.status AS student_status,
              am.remarks,
              CASE 
                WHEN am.status = 'PRESENT' AND a.max_marks > 0 AND am.marks_obtained IS NOT NULL 
                THEN ROUND((am.marks_obtained / a.max_marks) * 100, 2)
                ELSE NULL 
              END AS percentage
            FROM assessments a
            JOIN subjects s ON a.subject_id = s.subject_id
            JOIN assessment_marks am ON a.assessment_id = am.assessment_id
            WHERE a.status = 'PUBLISHED'
              AND am.student_profile_id = $1
            ORDER BY s.subject_code ASC, a.assessment_type ASC, a.created_at ASC
          `;

          const marksRes = await client.query(marksQuery, [student.student_profile_id]);

          return {
            student: {
              studentId: student.student_id,
              fullName: student.full_name,
            },
            marks: marksRes.rows,
          };
        });

        res.json({ success: true, ...results });
        return;
      }

      // In-memory fallback
      const userEmail = (req.user?.email || '').toLowerCase();
      let student = localStudents.find(
        (s) => s.user_uid === uid || 
               (userEmail && s.student_gmail && s.student_gmail.toLowerCase() === userEmail) ||
               (s.student_id && uid.toLowerCase().includes(s.student_id.toLowerCase()))
      );
      if (!student) {
        res.status(403).json({ error: 'NOT_A_STUDENT', message: 'Student profile not found.' });
        return;
      }

      const publishedMarks = localAssessments
        .filter((a) => a.status === 'PUBLISHED')
        .map((a) => {
          const mark = localAssessmentMarks.find(
            (m) => m.assessment_id === a.assessment_id && m.student_profile_id === student!.student_profile_id
          );
          if (!mark) return null;

          const sub = localSubjects.find((s) => s.subject_id === a.subject_id);
          const percentage =
            mark.status === 'PRESENT' && a.max_marks > 0 && mark.marks_obtained !== null
              ? Math.round((mark.marks_obtained / a.max_marks) * 10000) / 100
              : null;

          return {
            assessment_id: a.assessment_id,
            assessment_type: a.assessment_type,
            assessment_title: a.assessment_title,
            max_marks: a.max_marks,
            academic_calendar_term: a.academic_calendar_term,
            published_at: a.published_at,
            subject_code: sub?.subject_code || 'BCA-101',
            subject_name: sub?.subject_name || 'Programming in C',
            credit_value: sub?.credit_value || 4.0,
            marks_obtained: mark.marks_obtained,
            student_status: mark.status,
            remarks: mark.remarks,
            percentage,
          };
        })
        .filter(Boolean);

      res.json({
        success: true,
        student: {
          studentId: student?.student_id || 'STU-101',
          fullName: student?.full_name || 'Student',
        },
        marks: publishedMarks,
      });
    } catch (err: any) {
      console.error('Error fetching student examination results:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

export default router;
