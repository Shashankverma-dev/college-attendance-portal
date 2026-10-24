import * as xlsx from 'xlsx';
import { PoolClient } from 'pg';
import { runWithTransactionContext, pool } from '../config/db';
import { firebaseAuth } from '../config/firebase';
import { TokenService } from './token';
import { EmailService } from './email';
import { AuditService } from './audit';

export interface StudentImportRow {
  rowNumber: number;
  studentId?: string;
  enrollmentNo?: string;
  registrationNo?: string;
  registrationId?: string;
  fullName: string;
  studentGmail: string;
  schoolCode?: string;
  schoolId?: string;
  courseCode: string;
  semesterNumber: number;
  sectionName: string;
  rollNumber: string;
  phoneNumber?: string;
  parentContact?: string;
  dob?: string;
  bloodGroup?: string;
  admissionCategory?: string;
}

export interface ImportError {
  rowNumber: number;
  studentIdentifier: string;
  field: string;
  message: string;
}

export interface BulkImportResult {
  totalProcessed: number;
  successfulCount: number;
  failedCount: number;
  errors: ImportError[];
  quotaWarning?: string;
}

/**
 * Sanitizes input values against CSV/Excel Formula Injection attacks without corrupting valid data.
 * During ingestion into database / internal data models, legitimate identifiers, valid phone numbers
 * (e.g. starting with '+91'), and negative numbers are preserved in their true form.
 * Dangerous spreadsheet calculation triggers ('=', '@', or command execution sequences) are neutralized.
 */
export function sanitizeFormulaValue(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (str.length === 0) return '';

  // If the value is a valid international phone number (e.g. +91 9876543210) or pure signed number (e.g. -5), preserve it
  if (/^\+\d{1,4}[\s\d\-]{6,16}$/.test(str) || /^[+-]?\d+(\.\d+)?$/.test(str)) {
    return str;
  }

  // Escape formula injection prefixes when not pure numeric or standard phone
  if (['=', '@', '+', '-'].includes(str.charAt(0))) {
    return `'` + str;
  }
  return str;
}

/**
 * Escapes values specifically during CSV / Excel export generation to prevent formula execution in client spreadsheets.
 */
export function sanitizeForExport(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (str.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(str.charAt(0))) {
    return `'` + str;
  }
  return str;
}

/**
 * In-Memory Fallback Store for Local Development & Offline Testing
 */
export type StudentAccountStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED';
export type StudentEnrollmentStatus = 'PENDING' | 'ACTIVE' | 'TRANSFERRED' | 'COMPLETED' | 'WITHDRAWN';
export type StudentInvitationStatus = 'NOT_SENT' | 'SENT' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED' | 'DELIVERY_FAILED';

export interface InMemStudentProfile {
  student_profile_id: string;
  user_uid: string;
  student_id: string;
  enrollment_no: string;
  registration_no: string | null;
  registration_id: string | null;
  full_name: string;
  student_gmail: string;
  school_id?: string;
  school_code?: string;
  school_name?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  course_id?: string;
  course_code: string;
  course_name?: string;
  semester_id?: string;
  semester_number: number;
  section_id?: string;
  section_name: string;
  roll_number: string;
  phone_number: string | null;
  parent_guardian_contact: string | null;
  admission_academic_year?: string;
  academic_calendar_term?: string;
  dob?: string | null;
  blood_group?: string | null;
  admission_category?: string | null;
  status: StudentAccountStatus;
  enrollment_status?: StudentEnrollmentStatus;
  invitation_status?: StudentInvitationStatus;
  invitation_sent_at?: string | null;
  last_login_at?: string | null;
  created_at: string;
  activated_at: string | null;
}

export const localStudents: InMemStudentProfile[] = [];

export function initializeSeedStudents(): void {
  if (localStudents.length === 0) {
    localStudents.push(
      {
        student_profile_id: 'stu-prof-101',
        user_uid: 'usr-stu-101',
        student_id: 'STU-101',
        enrollment_no: 'SRHU2026101',
        registration_no: 'REG2026101',
        registration_id: 'REG2026101',
        full_name: 'Alex Chen',
        student_gmail: 'alex.chen@college.edu',
        course_code: 'BCA',
        semester_number: 1,
        section_name: 'A',
        roll_number: '01',
        phone_number: '+91 9876543201',
        parent_guardian_contact: '+91 9876543200',
        status: 'ACTIVE',
        enrollment_status: 'ACTIVE',
        invitation_status: 'ACCEPTED',
        created_at: '2026-08-01T00:00:00Z',
        activated_at: '2026-08-01T00:00:00Z',
      },
      {
        student_profile_id: 'stu-prof-102',
        user_uid: 'usr-stu-102',
        student_id: 'STU-102',
        enrollment_no: 'SRHU2026102',
        registration_no: 'REG2026102',
        registration_id: 'REG2026102',
        full_name: 'Brian Patel',
        student_gmail: 'brian.patel@college.edu',
        course_code: 'BCA',
        semester_number: 1,
        section_name: 'A',
        roll_number: '02',
        phone_number: '+91 9876543202',
        parent_guardian_contact: '+91 9876543200',
        status: 'ACTIVE',
        enrollment_status: 'ACTIVE',
        invitation_status: 'ACCEPTED',
        created_at: '2026-08-01T00:00:00Z',
        activated_at: '2026-08-01T00:00:00Z',
      },
      {
        student_profile_id: 'stu-prof-103',
        user_uid: 'usr-stu-103',
        student_id: 'STU-103',
        enrollment_no: 'SRHU2026103',
        registration_no: 'REG2026103',
        registration_id: 'REG2026103',
        full_name: 'Claire Zhang',
        student_gmail: 'claire.zhang@college.edu',
        course_code: 'BCA',
        semester_number: 1,
        section_name: 'A',
        roll_number: '03',
        phone_number: '+91 9876543203',
        parent_guardian_contact: '+91 9876543200',
        status: 'ACTIVE',
        enrollment_status: 'ACTIVE',
        invitation_status: 'ACCEPTED',
        created_at: '2026-08-01T00:00:00Z',
        activated_at: '2026-08-01T00:00:00Z',
      }
    );
  }
}

initializeSeedStudents();

async function isDbConnected(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1');
    return res.rowCount === 1;
  } catch {
    return false;
  }
}

/**
 * High-Volume Bulk Student Onboarding Engine (PRD §2.8A, SRS FR-45, FR-46, FR-47, FR-63)
 * Architected to parse CSV/Excel rosters, sanitize formula injection, validate section capacity with
 * concurrency-safe row-level locking, allocate collision-free student IDs, provision Firebase Auth
 * with compensating rollback, and dispatch 48-hour activation emails.
 */
export class BulkOnboardingService {
  /**
   * Parses raw file buffer into structured rows with formula injection neutralization.
   */
  static parseRosterBuffer(buffer: Buffer, isExcel: boolean): StudentImportRow[] {
    const workbook = xlsx.read(buffer, { type: 'buffer', cellFormula: false, raw: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: true });

    return rawRows.map((row, idx) => {
      const getVal = (...keys: string[]) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== '') {
            return sanitizeFormulaValue(row[k]);
          }
        }
        return '';
      };

      const rawEnrollment = getVal('enrollment_no', 'Enrollment No', 'enrollment_number', 'Enrollment Number', 'student_id', 'Student ID', 'studentId', 'id', 'ID');
      const rawRegistration = getVal('registration_no', 'Registration No', 'registration_number', 'Registration Number', 'registration_id', 'Registration ID', 'reg_no', 'Reg No');

      return {
        rowNumber: idx + 2, // Account for header row
        studentId: rawEnrollment || getVal('student_id', 'Student ID', 'studentId', 'id', 'ID'),
        enrollmentNo: rawEnrollment,
        registrationNo: rawRegistration,
        registrationId: rawRegistration,
        fullName: getVal('full_name', 'Full Name', 'name', 'Name', 'student_name', 'Student Name'),
        studentGmail: getVal('student_gmail', 'Gmail', 'email', 'Email', 'student_email').toLowerCase(),
        schoolCode: getVal('school_code', 'School Code', 'school', 'School', 'school_name', 'School Name'),
        courseCode: getVal('course_code', 'Course', 'course', 'Program', 'program_code').toUpperCase(),
        semesterNumber: parseInt(getVal('semester_number', 'Semester', 'sem', 'semester') || '1', 10),
        sectionName: getVal('section_name', 'Section', 'sec', 'section').toUpperCase(),
        rollNumber: getVal('roll_number', 'Roll No', 'roll_no', 'Roll Number', 'roll'),
        phoneNumber: getVal('phone_number', 'Phone', 'phone', 'Mobile', 'mobile_number'),
        parentContact: getVal('parent_guardian_contact', 'Parent Contact', 'parent_contact', 'guardian_phone'),
        dob: getVal('date_of_birth', 'DOB', 'dob'),
        bloodGroup: getVal('blood_group', 'Blood Group', 'blood_group'),
        admissionCategory: getVal('admission_category', 'Category', 'category'),
      };
    });
  }

  /**
   * Processes parsed student roster with atomic transactions, concurrency-safe section
   * capacity checks, sequential ID generation, Firebase provisioning with compensation,
   * and 48-hour activation email dispatch.
   */
  static async processRoster(
    rows: StudentImportRow[],
    academicTerm: string,
    actorUid: string,
    actorRole: string
  ): Promise<BulkImportResult> {
    const errors: ImportError[] = [];
    let successfulCount = 0;

    // 1. Quota Pre-Verification
    const quotaCheck = EmailService.verifyDailyQuota(rows.length);

    // 2. Pre-Flight In-Batch Duplicate Detection
    const seenEmails = new Set<string>();
    const seenStudentIds = new Set<string>();
    const seenEnrollmentNos = new Set<string>();
    const seenRegistrationNos = new Set<string>();
    const seenSectionRolls = new Set<string>();

    const validatedRows: StudentImportRow[] = [];

    for (const row of rows) {
      // Validate mandatory fields
      if (!row.fullName || !row.studentGmail || !row.courseCode || !row.sectionName || !row.rollNumber) {
        errors.push({
          rowNumber: row.rowNumber,
          studentIdentifier: row.studentGmail || row.fullName || 'Row ' + row.rowNumber,
          field: 'required_fields',
          message: 'Missing mandatory fields: full_name, student_gmail, course_code, section_name, or roll_number.',
        });
        continue;
      }

      // Email format verification
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.studentGmail)) {
        errors.push({
          rowNumber: row.rowNumber,
          studentIdentifier: row.studentGmail,
          field: 'student_gmail',
          message: 'Invalid email address format.',
        });
        continue;
      }

      // Check within-batch duplicate email
      if (seenEmails.has(row.studentGmail)) {
        errors.push({
          rowNumber: row.rowNumber,
          studentIdentifier: row.studentGmail,
          field: 'student_gmail',
          message: `Duplicate email '${row.studentGmail}' encountered multiple times in uploaded spreadsheet.`,
        });
        continue;
      }
      seenEmails.add(row.studentGmail);

      // Check within-batch duplicate student ID (if explicitly provided)
      if (row.studentId) {
        if (seenStudentIds.has(row.studentId.toUpperCase())) {
          errors.push({
            rowNumber: row.rowNumber,
            studentIdentifier: row.studentId,
            field: 'student_id',
            message: `Duplicate Student ID '${row.studentId}' specified multiple times in uploaded spreadsheet.`,
          });
          continue;
        }
        seenStudentIds.add(row.studentId.toUpperCase());
      }

      // Check within-batch duplicate enrollment number
      if (row.enrollmentNo) {
        if (seenEnrollmentNos.has(row.enrollmentNo.trim())) {
          errors.push({
            rowNumber: row.rowNumber,
            studentIdentifier: row.enrollmentNo,
            field: 'enrollment_no',
            message: `Duplicate Enrollment Number '${row.enrollmentNo}' specified multiple times in uploaded spreadsheet.`,
          });
          continue;
        }
        seenEnrollmentNos.add(row.enrollmentNo.trim());
      }

      // Check within-batch duplicate registration number (preserve original case)
      if (row.registrationNo) {
        if (seenRegistrationNos.has(row.registrationNo.trim())) {
          errors.push({
            rowNumber: row.rowNumber,
            studentIdentifier: row.registrationNo,
            field: 'registration_no',
            message: `Duplicate Registration Number '${row.registrationNo}' specified multiple times in uploaded spreadsheet.`,
          });
          continue;
        }
        seenRegistrationNos.add(row.registrationNo.trim());
      }

      // Check within-batch duplicate roll number in same course & section
      const sectionRollKey = `${row.courseCode}-${row.semesterNumber}-${row.sectionName}-${row.rollNumber}`;
      if (seenSectionRolls.has(sectionRollKey)) {
        errors.push({
          rowNumber: row.rowNumber,
          studentIdentifier: row.studentGmail,
          field: 'roll_number',
          message: `Duplicate Roll Number '${row.rollNumber}' for ${row.courseCode} Sem ${row.semesterNumber} Section ${row.sectionName} in uploaded spreadsheet.`,
        });
        continue;
      }
      seenSectionRolls.add(sectionRollKey);

      validatedRows.push(row);
    }

    const dbOnline = await isDbConnected();

    // 3. Process each validated student record
    for (const row of validatedRows) {
      if (dbOnline) {
        let createdFirebaseUid: string | null = null;
        try {
          await runWithTransactionContext(
            { userUid: actorUid, role: actorRole as any },
            async (client: PoolClient) => {
              // A. Resolve Course, Semester, Section with Row Locking (FOR UPDATE OF sec)
              const sectionRes = await client.query(
                `SELECT sec.section_id, sec.max_capacity, sem.semester_id, ay.academic_year_id, c.course_id, c.school_id 
                 FROM sections sec
                 JOIN semesters sem ON sec.semester_id = sem.semester_id
                 JOIN academic_years ay ON sem.academic_year_id = ay.academic_year_id
                 JOIN courses c ON ay.course_id = c.course_id
                 WHERE c.course_code = $1 
                   AND sem.semester_number = $2 
                   AND sec.section_name = $3 
                   AND sec.academic_calendar_term = $4
                 FOR UPDATE OF sec`,
                [row.courseCode, row.semesterNumber, row.sectionName, academicTerm]
              );

              if (sectionRes.rowCount === 0) {
                throw {
                  field: 'section',
                  message: `Section not found for ${row.courseCode} Sem ${row.semesterNumber} Sec ${row.sectionName} (${academicTerm}).`,
                };
              }

              const { section_id, max_capacity, semester_id, academic_year_id, course_id, school_id } = sectionRes.rows[0];

              // B. Enforce Section Capacity Check under locked transaction
              const countRes = await client.query(
                `SELECT COUNT(*) as current_count 
                 FROM student_profiles 
                 WHERE current_section_id = $1`,
                [section_id]
              );

              const currentCount = parseInt(countRes.rows[0].current_count, 10);
              if (currentCount >= max_capacity) {
                throw {
                  field: 'capacity',
                  message: `Section capacity exceeded (${currentCount}/${max_capacity}). Row rejected per institutional enrollment limits.`,
                };
              }

              // Check existing roll number in same section in DB
              const rollCheck = await client.query(
                `SELECT student_profile_id FROM student_profiles WHERE current_section_id = $1 AND roll_number = $2`,
                [section_id, row.rollNumber]
              );
              if (rollCheck.rowCount && rollCheck.rowCount > 0) {
                throw {
                  field: 'roll_number',
                  message: `Roll Number '${row.rollNumber}' is already registered in ${row.courseCode} Section ${row.sectionName}.`,
                };
              }

              // C. Concurrency-Safe Student ID & Enrollment Number Generation:
              let finalStudentId = row.studentId || row.enrollmentNo;
              let finalEnrollmentNo = row.enrollmentNo || finalStudentId;
              if (!finalStudentId) {
                // Lock course row to serialize sequence allocation
                await client.query(`SELECT course_id FROM courses WHERE course_id = $1 FOR UPDATE`, [course_id]);
                const currentYear = new Date().getFullYear();
                const prefix = `${row.courseCode}-${currentYear}-%`;

                const seqRes = await client.query(
                  `SELECT COALESCE(MAX(CAST(SUBSTRING(student_id FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next_seq
                   FROM student_profiles 
                   WHERE current_course_id = $1 AND student_id LIKE $2`,
                  [course_id, prefix]
                );
                const seq = String(seqRes.rows[0].next_seq).padStart(4, '0');
                finalStudentId = `${row.courseCode}-${currentYear}-${seq}`;
                finalEnrollmentNo = `SRHU${String(currentYear).slice(-2)}${seq}`;
              } else {
                const idCheck = await client.query(
                  `SELECT student_profile_id FROM student_profiles WHERE student_id = $1 OR enrollment_no = $1`,
                  [finalStudentId]
                );
                if (idCheck.rowCount && idCheck.rowCount > 0) {
                  throw {
                    field: 'student_id',
                    message: `Student ID or Enrollment Number '${finalStudentId}' already exists in the institutional registry.`,
                  };
                }
              }

              // Check Registration Number Uniqueness
              if (row.registrationNo) {
                const regCheck = await client.query(
                  `SELECT student_profile_id FROM student_profiles WHERE registration_no = $1`,
                  [row.registrationNo]
                );
                if (regCheck.rowCount && regCheck.rowCount > 0) {
                  throw {
                    field: 'registration_no',
                    message: `Registration Number '${row.registrationNo}' already exists in the institutional registry.`,
                  };
                }
              }

              // D. Provision Firebase User (Compensating rollback on DB failure)
              let firebaseUser;
              try {
                firebaseUser = await firebaseAuth.createUser({
                  email: row.studentGmail,
                  displayName: row.fullName,
                  disabled: false,
                  emailVerified: false,
                });
                createdFirebaseUid = firebaseUser.uid;
                await firebaseAuth.setCustomUserClaims(firebaseUser.uid, { role: 'STUDENT' });
              } catch (fbErr: any) {
                if (fbErr.code === 'auth/email-already-exists') {
                  firebaseUser = await firebaseAuth.getUserByEmail(row.studentGmail);
                } else {
                  throw { field: 'firebase_auth', message: fbErr.message };
                }
              }

              // E. Upsert User in PostgreSQL
              await client.query(
                `INSERT INTO users (user_uid, email, role, status, is_email_verified)
                 VALUES ($1, $2, 'STUDENT', 'PENDING_ACTIVATION', FALSE)
                 ON CONFLICT (user_uid) DO NOTHING`,
                [firebaseUser.uid, row.studentGmail]
              );

              // F. Insert Student Profile with Dual Identifiers & School
              const profileRes = await client.query(
                `INSERT INTO student_profiles (
                  user_uid, student_id, enrollment_no, registration_no, registration_id, full_name, student_gmail,
                  current_course_id, current_academic_year_id, current_semester_id,
                  current_section_id, roll_number, phone_number, parent_guardian_contact,
                  admission_category, school_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                 ON CONFLICT (student_id) DO UPDATE SET
                   current_section_id = EXCLUDED.current_section_id,
                   roll_number = EXCLUDED.roll_number
                 RETURNING student_profile_id`,
                [
                  firebaseUser.uid,
                  finalStudentId,
                  finalEnrollmentNo,
                  row.registrationNo || null,
                  row.registrationNo || row.registrationId || null,
                  row.fullName,
                  row.studentGmail,
                  course_id,
                  academic_year_id,
                  semester_id,
                  section_id,
                  row.rollNumber,
                  row.phoneNumber || null,
                  row.parentContact || null,
                  row.admissionCategory || null,
                  school_id || null,
                ]
              );

              const studentProfileId = profileRes.rows[0].student_profile_id;

              // G. Record Enrollment History
              await client.query(
                `INSERT INTO student_enrollment_history (
                  student_profile_id, course_id, academic_year_id, semester_id,
                  section_id, academic_calendar_term, enrollment_status, term_start_date
                 ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', CURRENT_DATE)
                 ON CONFLICT (student_profile_id, academic_calendar_term) DO NOTHING`,
                [studentProfileId, course_id, academic_year_id, semester_id, section_id, academicTerm]
              );

              // H. Generate 48-Hour Cryptographic Activation Token (FR-20)
              const token = TokenService.generateToken(48);
              await TokenService.storeToken(
                client,
                firebaseUser.uid,
                token.tokenHash,
                'ACCOUNT_ACTIVATION',
                row.studentGmail,
                token.expiresAt
              );

              // I. Dispatch Activation Email with Persistent Idempotency
              const appBaseUrl = process.env.APP_URL || 'http://localhost:5000';
              const activationLink = `${appBaseUrl}/signin.html?mode=activate&token=${token.rawToken}`;
              const idempotencyKey = `activation-${firebaseUser.uid}-${token.tokenHash.substring(0, 16)}`;

              await EmailService.sendEmail({
                to: row.studentGmail,
                subject: 'Activate Your Student Attendance Portal Account',
                idempotencyKey,
                operationType: 'ACCOUNT_ACTIVATION',
                html: `
                  <div style="font-family: 'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #17345C; background: #F8FAFC; border: 1px solid #D7E3F0; border-radius: 8px;">
                    <div style="background: #1D3C72; padding: 16px 20px; border-radius: 6px; margin-bottom: 20px;">
                      <h1 style="color: #FFFFFF; font-size: 20px; margin: 0; font-weight: 700;">Swami Rama Himalayan University</h1>
                      <p style="color: #93C5FD; font-size: 13px; margin: 4px 0 0 0;">Official Attendance & Examination Marks Portal</p>
                    </div>
                    <h2 style="color: #1D3C72; margin-top: 0;">Welcome, ${row.fullName}!</h2>
                    <p style="font-size: 15px; line-height: 1.5;">Your student profile has been created with Enrollment No: <strong style="color: #1D3C72; font-size: 16px;">${finalEnrollmentNo}</strong>.</p>
                    <p style="font-size: 14px; line-height: 1.5;">Please activate your account and set your secure password (minimum 12 characters with uppercase, lowercase, numbers, and special symbols) using the button below:</p>
                    <div style="margin: 28px 0;">
                      <a href="${activationLink}" style="background: #1D3C72; color: #FFFFFF; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; display: inline-block;">
                        Activate Account & Set Password
                      </a>
                    </div>
                    <p style="color: #64748B; font-size: 13px; margin-bottom: 4px;">Link: <a href="${activationLink}" style="color: #1D3C72;">${activationLink}</a></p>
                    <p style="color: #64748B; font-size: 12px; margin-top: 16px; border-top: 1px solid #E2E8F0; padding-top: 12px;">This activation link is cryptographically signed and expires in exactly 48 hours.</p>
                  </div>
                `,
              });

              // J. Append-Only Audit Log
              await AuditService.record(client, {
                actorUid,
                actorRole,
                clientIp: '127.0.0.1',
                actionCategory: 'BULK_IMPORT',
                targetEntityName: 'student_profiles',
                targetEntityId: studentProfileId,
                changeDetails: {
                  studentId: finalStudentId,
                  enrollmentNo: finalEnrollmentNo,
                  registrationNo: row.registrationNo,
                  email: row.studentGmail,
                  courseCode: row.courseCode,
                  section: row.sectionName,
                  rollNumber: row.rollNumber,
                },
              });

              successfulCount++;
            }
          );
        } catch (err: any) {
          // Compensating rollback for Firebase Auth if PostgreSQL failed
          if (createdFirebaseUid) {
            try {
              await firebaseAuth.deleteUser(createdFirebaseUid);
            } catch (cleanupErr) {
              console.error('Compensating rollback failed to remove orphaned Firebase user:', cleanupErr);
            }
          }

          errors.push({
            rowNumber: row.rowNumber,
            studentIdentifier: row.studentGmail || row.fullName,
            field: err.field || 'general',
            message: err.message || 'Failed to process student record.',
          });
        }
      } else {
        // In-Memory Mode (Local Dev & Unit Test Environment)
        try {
          // Check duplicate email
          const existingEmail = localStudents.some(
            (s) => s.student_gmail.toLowerCase() === row.studentGmail.toLowerCase()
          );
          if (existingEmail) {
            throw { field: 'student_gmail', message: `Email '${row.studentGmail}' is already registered.` };
          }

          // Generate or check student ID and Enrollment Number
          let finalStudentId = row.studentId || row.enrollmentNo;
          let finalEnrollmentNo = row.enrollmentNo || finalStudentId;
          if (!finalStudentId) {
            const currentYear = new Date().getFullYear();
            const courseCount = localStudents.filter((s) => s.course_code === row.courseCode).length + 1;
            finalStudentId = `${row.courseCode}-${currentYear}-${String(courseCount).padStart(4, '0')}`;
            finalEnrollmentNo = `SRHU${String(currentYear).slice(-2)}${String(courseCount + 1000).padStart(4, '0')}`;
          } else {
            const existingId = localStudents.some(
              (s) => s.student_id.toLowerCase() === finalStudentId!.toLowerCase() ||
                     (s.enrollment_no && s.enrollment_no.toLowerCase() === finalStudentId!.toLowerCase())
            );
            if (existingId) {
              throw { field: 'enrollment_no', message: `Student ID / Enrollment Number '${finalStudentId}' is already registered.` };
            }
          }

          // Check Registration Number Uniqueness (preserve exact case & leading zeros)
          let finalRegistrationNo = row.registrationNo || null;
          if (finalRegistrationNo) {
            const existingReg = localStudents.some(
              (s) => s.registration_no && s.registration_no.toLowerCase() === finalRegistrationNo!.toLowerCase()
            );
            if (existingReg) {
              throw { field: 'registration_no', message: `Registration Number '${finalRegistrationNo}' is already registered.` };
            }
          }

          const newProfileId = `20000000-0000-0000-0000-${String(localStudents.length + 10).padStart(12, '0')}`;
          const newUserUid = `firebase-uid-stu-${finalStudentId.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

          const newStudent: InMemStudentProfile = {
            student_profile_id: newProfileId,
            user_uid: newUserUid,
            student_id: finalStudentId,
            enrollment_no: finalEnrollmentNo || finalStudentId,
            registration_no: finalRegistrationNo,
            registration_id: row.registrationId || finalRegistrationNo || null,
            school_id: row.schoolId || '',
            school_code: row.schoolCode || '',
            school_name: (row as any).schoolName || '',
            full_name: row.fullName,
            student_gmail: row.studentGmail,
            course_code: row.courseCode,
            semester_number: row.semesterNumber,
            section_name: row.sectionName,
            roll_number: row.rollNumber,
            phone_number: row.phoneNumber || null,
            parent_guardian_contact: row.parentContact || null,
            status: 'PENDING_ACTIVATION',
            created_at: new Date().toISOString(),
            activated_at: null,
          };

          localStudents.unshift(newStudent);

          // Simulated 48-hour activation token & email dispatch
          const token = TokenService.generateToken(48);
          await TokenService.storeToken(
            null,
            newUserUid,
            token.tokenHash,
            'ACCOUNT_ACTIVATION',
            row.studentGmail,
            token.expiresAt
          );

          successfulCount++;
        } catch (memErr: any) {
          errors.push({
            rowNumber: row.rowNumber,
            studentIdentifier: row.studentGmail || row.fullName,
            field: memErr.field || 'general',
            message: memErr.message || 'Failed to onboard student.',
          });
        }
      }
    }

    return {
      totalProcessed: rows.length,
      successfulCount,
      failedCount: errors.length,
      errors,
      quotaWarning: quotaCheck.isWithinQuota ? undefined : quotaCheck.explanation,
    };
  }

  /**
   * Resends an activation email with a freshly minted 48-hour token,
   * invalidating any previously outstanding tokens for security.
   */
  static async resendActivation(
    studentIdentifier: string,
    actorUid: string,
    actorRole: string
  ): Promise<{ success: boolean; message: string; activationLink?: string }> {
    const dbOnline = await isDbConnected();

    if (dbOnline) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const studentRes = await client.query(
          `SELECT sp.student_profile_id, sp.user_uid, sp.student_id, sp.full_name, sp.student_gmail, u.status
           FROM student_profiles sp
           JOIN users u ON sp.user_uid = u.user_uid
           WHERE sp.student_id = $1 OR LOWER(sp.student_gmail) = LOWER($1)`,
          [studentIdentifier.trim()]
        );

        if (studentRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return { success: false, message: `Student '${studentIdentifier}' was not found in the institutional records.` };
        }

        const student = studentRes.rows[0];

        if (student.status === 'ACTIVE') {
          await client.query('ROLLBACK');
          return { success: false, message: `Student ${student.full_name} (${student.student_id}) has already activated their account.` };
        }

        // Invalidate old tokens & generate new 48-hr token
        const token = TokenService.generateToken(48);
        await TokenService.storeToken(
          client,
          student.user_uid,
          token.tokenHash,
          'ACCOUNT_ACTIVATION',
          student.student_gmail,
          token.expiresAt
        );

        const appBaseUrl = process.env.APP_URL || 'http://localhost:5000';
        const activationLink = `${appBaseUrl}/signin.html?mode=activate&token=${token.rawToken}`;

        await EmailService.sendEmail({
          to: student.student_gmail,
          subject: 'Reissued: Activate Your Student Attendance Portal Account',
          idempotencyKey: `resend-act-${student.user_uid}-${Date.now()}`,
          operationType: 'ACCOUNT_ACTIVATION',
          html: `
            <div style="font-family: sans-serif; padding: 24px; color: #17345C; background: #F8FAFC; border: 1px solid #D7E3F0; border-radius: 8px;">
              <h2 style="color: #1D3C72;">Account Activation Link Reissued</h2>
              <p>Hello <strong>${student.full_name}</strong>,</p>
              <p>Your institutional activation link has been refreshed by the administrator. Use the link below to set your password:</p>
              <p style="margin: 24px 0;">
                <a href="${activationLink}" style="background: #1D3C72; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                  Activate Account
                </a>
              </p>
              <p style="font-size: 13px; color: #64748B;">This link is valid for 48 hours. Any previously sent activation links are now void.</p>
            </div>
          `,
        });

        await AuditService.record(client, {
          actorUid,
          actorRole,
          clientIp: '127.0.0.1',
          actionCategory: 'ACCOUNT_LIFECYCLE',
          targetEntityName: 'student_profiles',
          targetEntityId: student.student_profile_id,
          changeDetails: {
            studentId: student.student_id,
            email: student.student_gmail,
            reissuedAt: new Date().toISOString(),
          },
        });

        await client.query('COMMIT');
        return {
          success: true,
          message: `Fresh 48-hour activation link dispatched to ${student.student_gmail}.`,
          activationLink,
        };
      } catch (err: any) {
        await client.query('ROLLBACK');
        return { success: false, message: err.message || 'Failed to resend activation link.' };
      } finally {
        client.release();
      }
    }

    // In-memory lookup
    const student = localStudents.find(
      (s) => s.student_id.toLowerCase() === studentIdentifier.toLowerCase() || s.student_gmail.toLowerCase() === studentIdentifier.toLowerCase()
    );

    if (!student) {
      return { success: false, message: `Student '${studentIdentifier}' not found in registry.` };
    }

    const token = TokenService.generateToken(48);
    await TokenService.storeToken(null, student.user_uid, token.tokenHash, 'ACCOUNT_ACTIVATION', student.student_gmail, token.expiresAt);

    const appBaseUrl = process.env.APP_URL || 'http://localhost:5000';
    const activationLink = `${appBaseUrl}/signin.html?mode=activate&token=${token.rawToken}`;

    return {
      success: true,
      message: `Fresh 48-hour activation link reissued for ${student.full_name} (${student.student_gmail}).`,
      activationLink,
    };
  }

  /**
   * Retrieves registered student rosters for administrative verification.
   */
  static async getStudents(): Promise<any[]> {
    const dbOnline = await isDbConnected();
    if (dbOnline) {
      const res = await pool.query(
        `SELECT sp.student_profile_id, sp.student_id, sp.registration_id, sp.full_name, sp.student_gmail,
                c.course_code, c.course_name, s.semester_number, sec.section_name, sp.roll_number,
                u.status, u.is_email_verified, u.created_at, u.activated_at
         FROM student_profiles sp
         JOIN users u ON sp.user_uid = u.user_uid
         JOIN courses c ON sp.current_course_id = c.course_id
         JOIN semesters s ON sp.current_semester_id = s.semester_id
         JOIN sections sec ON sp.current_section_id = sec.section_id
         ORDER BY sp.created_at DESC LIMIT 500`
      );
      return res.rows;
    }
    return localStudents;
  }

  /**
   * Generates a sample CSV roster template with safe placeholder values and formula protection.
   */
  static generateSampleCsvTemplate(): string {
    const headers = [
      'full_name',
      'student_gmail',
      'course_code',
      'semester_number',
      'section_name',
      'roll_number',
      'student_id',
      'phone_number',
      'parent_guardian_contact',
    ];

    const sampleRows = [
      'Aarav Sharma,aarav.sharma@example.com,BCA,1,A,01,,+919876543210,+919876543211',
      'Diya Patel,diya.patel@example.com,BCA,1,A,02,,+919876543212,+919876543213',
      'Rohan Verma,rohan.verma@example.com,BCA,1,A,03,,+919876543214,+919876543215',
    ];

    return [headers.join(','), ...sampleRows].join('\n');
  }
}
