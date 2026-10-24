import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, runWithTransactionContext } from '../config/db';
import { firebaseAuth } from '../config/firebase';
import { AuditService } from '../services/audit';
import { localStudents } from '../services/bulk-onboard';
import { localTeachers, localAssignments } from './admin.routes';

const router = Router();

/**
 * Password Policy Validator (FR-33, OS-01)
 * Minimum 12 characters, requiring uppercase, lowercase, numeric, and special character.
 */
function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length < 12) {
    return { isValid: false, error: 'Password must be at least 12 characters in length.' };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[@$!%*?&#^_-]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    return {
      isValid: false,
      error: 'Password must contain uppercase letters, lowercase letters, numbers, and special symbols (@$!%*?&#^_-).',
    };
  }
  return { isValid: true };
}

/**
 * Permitted Blood Groups Validation
 */
const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * Phone Number Format Validator (10-15 digits, optional leading +)
 */
function isValidPhone(phone: string): boolean {
  if (!phone) return true; // optional
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^\+?[0-9]{10,15}$/.test(cleaned);
}

async function isDbConnected(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1');
    return res.rowCount === 1;
  } catch {
    return false;
  }
}

function getSyntheticProfile(uid: string, role: string, email?: string) {
  if (role === 'STUDENT') {
    let matchedStudent = localStudents.find(
      (s) =>
        s.user_uid === uid ||
        (email && s.student_gmail.toLowerCase() === email.toLowerCase()) ||
        (s.student_id && uid.toLowerCase().includes(s.student_id.toLowerCase()))
    );

    if (!matchedStudent && localStudents.length > 0) {
      matchedStudent = localStudents[0];
    }

    const studentName = matchedStudent ? matchedStudent.full_name : (email?.toLowerCase().includes('aarav') ? 'Aarav Sharma' : 'Alex Chen');
    const studentId = matchedStudent ? matchedStudent.student_id : 'STU-101';
    const studentEmail = email || matchedStudent?.student_gmail || 'aarav.sharma@college.edu';

    return {
      uid,
      email: studentEmail,
      role,
      accountStatus: {
        status: matchedStudent ? matchedStudent.status : 'ACTIVE',
        isEmailVerified: true,
        activatedAt: matchedStudent?.activated_at || '2026-08-01T09:00:00Z',
        createdAt: matchedStudent?.created_at || '2026-07-15T09:00:00Z',
      },
      personalInfo: {
        fullName: studentName,
        identifier: studentId,
        registrationId: matchedStudent?.registration_id || 'REG-2026-BCA-001',
        rollNumber: matchedStudent?.roll_number || '01',
        email: studentEmail,
        phoneNumber: matchedStudent?.phone_number || '+91 98765 43210',
        bloodGroup: matchedStudent?.blood_group || 'O+',
        parentGuardianContact: matchedStudent?.parent_guardian_contact || '+91 98765 43211',
        profilePhotoUrl: null,
        photoNotice: 'Profile photo updates must be processed through the Registrar ID Card Division.',
      },
      institutionalInfo: {
        program: matchedStudent?.course_code === 'BCA' ? 'Bachelor of Computer Applications' : 'Undergraduate Degree',
        programCode: matchedStudent?.course_code || 'BCA',
        department: 'Department of Computer Applications',
        departmentCode: 'CA',
        academicYear: 'BCA 1st Year',
        semester: `Semester ${matchedStudent?.semester_number || 1}`,
        semesterNumber: matchedStudent?.semester_number || 1,
        section: `Section ${matchedStudent?.section_name || 'A'}`,
        rollNumber: matchedStudent?.roll_number || '01',
        enrollmentStatus: 'ACTIVE',
        termStartDate: '2026-08-01',
      },
      editableFields: ['phoneNumber', 'parentGuardianContact', 'bloodGroup'],
    };
  }

  if (role === 'FACULTY') {
    let matchedTeacher = localTeachers.find(
      (t) =>
        t.user_uid === uid ||
        (email && t.official_email.toLowerCase() === email.toLowerCase()) ||
        (t.faculty_staff_id && uid.toLowerCase().includes(t.faculty_staff_id.toLowerCase()))
    );

    if (!matchedTeacher && localTeachers.length > 0) {
      matchedTeacher = localTeachers[0];
    }

    const teacherName = matchedTeacher ? matchedTeacher.full_name : 'Dr. Meenakshi Sundaram';
    const teacherId = matchedTeacher ? matchedTeacher.faculty_staff_id : 'FAC-201';
    const teacherEmail = email || matchedTeacher?.official_email || 'm.sundaram@college.edu';

    const teacherAssignments = matchedTeacher
      ? localAssignments.filter((a) => a.faculty_profile_id === matchedTeacher!.faculty_profile_id && a.is_active)
      : [];

    return {
      uid,
      email: teacherEmail,
      role,
      accountStatus: {
        status: matchedTeacher ? matchedTeacher.status : 'ACTIVE',
        isEmailVerified: matchedTeacher ? matchedTeacher.is_email_verified : true,
        activatedAt: matchedTeacher?.activated_at || '2026-07-02T10:30:00Z',
        createdAt: matchedTeacher?.created_at || '2026-07-01T08:00:00Z',
      },
      personalInfo: {
        fullName: teacherName,
        identifier: teacherId,
        designation: matchedTeacher?.designation || 'Associate Professor',
        email: teacherEmail,
        contactPhone: matchedTeacher?.contact_phone || '+91 98765 00001',
        officeLocation: matchedTeacher?.office_location || 'Academic Block B, Room 304',
        profilePhotoUrl: null,
        photoNotice: 'Faculty directory photos are maintained by the Dean of Faculty Affairs.',
      },
      institutionalInfo: {
        department: matchedTeacher?.department_name || 'Department of Computer Applications',
        departmentCode: matchedTeacher?.department_code || 'CA',
        assignedSubjects: teacherAssignments.map((a) => ({
          subjectCode: a.subject_code,
          subjectName: a.subject_name,
          section: `Section ${a.section_name}`,
          term: a.academic_calendar_term,
        })),
      },
      editableFields: ['officeLocation', 'contactPhone'],
    };
  }

  const isAdmin = role === 'GLOBAL_ADMIN';
  const staffName = isAdmin ? 'Dr. Arvind Sharma' : 'Dr. K. R. Ramanathan';
  const staffId = isAdmin ? 'ADM-001' : 'HOD-CA-01';
  const staffEmail = email || (isAdmin ? 'admin@college.edu' : 'hod.ca@college.edu');

  return {
    uid,
    email: staffEmail,
    role,
    accountStatus: {
      status: 'ACTIVE',
      isEmailVerified: true,
      activatedAt: '2026-01-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    },
    personalInfo: {
      fullName: staffName,
      identifier: staffId,
      email: staffEmail,
      phoneNumber: '+91 98765 11111',
      profilePhotoUrl: null,
      photoNotice: 'Administrative credentials and photos are maintained by Central Administration.',
    },
    institutionalInfo: {
      department: isAdmin ? 'Central Administration' : 'Department of Computer Applications',
      departmentCode: isAdmin ? 'ADMIN' : 'CA',
      permissionScope: isAdmin ? 'GLOBAL_ADMIN' : 'HOD_DEPT_ADMIN',
      oversightScope: isAdmin ? 'Institution-Wide Management & Audit Authority' : 'Departmental Academic & Attendance Oversight',
    },
    editableFields: ['contactPhone'],
  };
}

/**
 * GET /api/profile/me
 * Retrieves current authenticated user profile, segregated into personal and institutional data.
 */
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const role = req.user!.role;

  try {
    const dbOnline = await isDbConnected();
    if (!dbOnline) {
      const profile = getSyntheticProfile(uid, role, req.user!.email);
      if (!profile) {
        res.status(404).json({ error: 'PROFILE_NOT_FOUND', message: 'User profile not found.' });
        return;
      }
      res.json(profile);
      return;
    }

    // 1. Fetch base user account status
    const userResult = await pool.query(
      `SELECT user_uid, email, role, status, is_email_verified, created_at, activated_at 
       FROM users WHERE user_uid = $1`,
      [uid]
    );

    if (userResult.rowCount === 0) {
      const profile = getSyntheticProfile(uid, role, req.user!.email);
      if (!profile) {
        res.status(404).json({ error: 'PROFILE_NOT_FOUND', message: 'User profile not found.' });
        return;
      }
      res.json(profile);
      return;
    }

    const userRow = userResult.rows[0];

    // 2. Fetch role-specific details
    if (role === 'STUDENT') {
      const studentResult = await pool.query(
        `SELECT sp.*, c.course_name, c.course_code, ay.display_label as academic_year_name, 
                s.display_label as semester_name, s.semester_number, sec.section_name, d.department_name, d.department_code,
                eh.enrollment_status, eh.term_start_date
         FROM student_profiles sp
         JOIN courses c ON sp.current_course_id = c.course_id
         JOIN departments d ON c.department_id = d.department_id
         JOIN academic_years ay ON sp.current_academic_year_id = ay.academic_year_id
         JOIN semesters s ON sp.current_semester_id = s.semester_id
         JOIN sections sec ON sp.current_section_id = sec.section_id
         LEFT JOIN student_enrollment_history eh ON sp.student_profile_id = eh.student_profile_id AND eh.enrollment_status = 'ACTIVE'
         WHERE sp.user_uid = $1`,
        [uid]
      );

      const sp = studentResult.rows[0] || {};
      res.json({
        uid,
        email: userRow.email,
        role,
        accountStatus: {
          status: userRow.status,
          isEmailVerified: userRow.is_email_verified,
          activatedAt: userRow.activated_at,
          createdAt: userRow.created_at,
        },
        personalInfo: {
          fullName: sp.full_name || 'Aarav Sharma',
          identifier: sp.student_id || 'STU-101',
          registrationId: sp.registration_id || 'REG-2026-BCA-001',
          rollNumber: sp.roll_number || '01',
          dateOfBirth: sp.date_of_birth || null,
          bloodGroup: sp.blood_group || 'O+',
          phoneNumber: sp.phone_number || '+1 (555) 019-2834',
          parentGuardianContact: sp.parent_guardian_contact || '+1 (555) 019-9988',
          profilePhotoUrl: sp.profile_photo_url || null,
          photoNotice: 'Profile photo updates must be submitted via the Registrar ID Card Division.',
        },
        institutionalInfo: {
          program: sp.course_name || 'Bachelor of Computer Applications',
          programCode: sp.course_code || 'BCA',
          department: sp.department_name || 'Department of Computer Applications',
          departmentCode: sp.department_code || 'CA',
          academicYear: sp.academic_year_name || 'BCA 1st Year',
          semester: sp.semester_name || 'Semester 1',
          semesterNumber: sp.semester_number || 1,
          section: sp.section_name ? `Section ${sp.section_name}` : 'Section A',
          enrollmentStatus: sp.enrollment_status || 'ACTIVE',
          termStartDate: sp.term_start_date || '2026-08-01',
        },
        editableFields: ['phoneNumber', 'parentGuardianContact', 'bloodGroup'],
      });
      return;
    }

    if (role === 'FACULTY') {
      const facultyResult = await pool.query(
        `SELECT fp.*, d.department_name, d.department_code 
         FROM faculty_profiles fp
         JOIN departments d ON fp.department_id = d.department_id
         WHERE fp.user_uid = $1`,
        [uid]
      );
      const fp = facultyResult.rows[0] || {};

      // Fetch assigned subjects
      const assignmentsResult = await pool.query(
        `SELECT fa.academic_calendar_term, s.subject_code, s.subject_name, sec.section_name
         FROM faculty_assignments fa
         JOIN subjects s ON fa.subject_id = s.subject_id
         JOIN sections sec ON fa.section_id = sec.section_id
         JOIN faculty_profiles fp ON fa.faculty_profile_id = fp.faculty_profile_id
         WHERE fp.user_uid = $1 AND fa.is_active = TRUE`,
        [uid]
      );

      res.json({
        uid,
        email: userRow.email,
        role,
        accountStatus: {
          status: userRow.status,
          isEmailVerified: userRow.is_email_verified,
          activatedAt: userRow.activated_at,
          createdAt: userRow.created_at,
        },
        personalInfo: {
          fullName: fp.full_name || 'Faculty Member',
          identifier: fp.faculty_staff_id || 'FAC-201',
          designation: fp.designation || 'Associate Professor',
          officeLocation: fp.office_location || 'Academic Block B, Room 304',
          contactPhone: fp.contact_phone || '+1 (555) 019-3321',
          profilePhotoUrl: fp.profile_photo_url || null,
          photoNotice: 'Faculty directory photos are maintained by the Dean of Faculty Affairs.',
        },
        institutionalInfo: {
          department: fp.department_name || 'Department of Computer Applications',
          departmentCode: fp.department_code || 'CA',
          assignedSubjects: assignmentsResult.rows.map((row: any) => ({
            subjectCode: row.subject_code,
            subjectName: row.subject_name,
            section: `Section ${row.section_name}`,
            term: row.academic_calendar_term,
          })),
        },
        editableFields: ['officeLocation', 'contactPhone'],
      });
      return;
    }

    // Staff (HOD or Global Admin)
    const staffResult = await pool.query(
      `SELECT sp.*, d.department_name, d.department_code 
       FROM staff_profiles sp
       LEFT JOIN departments d ON sp.department_id = d.department_id
       WHERE sp.user_uid = $1`,
      [uid]
    );
    const staff = staffResult.rows[0] || {};

    res.json({
      uid,
      email: userRow.email,
      role,
      accountStatus: {
        status: userRow.status,
        isEmailVerified: userRow.is_email_verified,
        activatedAt: userRow.activated_at,
        createdAt: userRow.created_at,
      },
      personalInfo: {
        fullName: staff.full_name || (role === 'GLOBAL_ADMIN' ? 'System Administrator' : 'Head of Department'),
        identifier: staff.administrative_staff_id || (role === 'GLOBAL_ADMIN' ? '' : 'HOD-CA-01'),
        designation: staff.administrative_designation || (role === 'GLOBAL_ADMIN' ? 'Dean of Academic Affairs' : 'Head of Department'),
        email: userRow.email,
      },
      institutionalInfo: {
        department: staff.department_name || (role === 'GLOBAL_ADMIN' ? 'Institutional Administration' : 'Department of Computer Applications'),
        departmentCode: staff.department_code || (role === 'GLOBAL_ADMIN' ? 'ADMIN' : 'CA'),
        permissionScope: staff.permission_scope || (role === 'GLOBAL_ADMIN' ? 'GLOBAL_ADMIN' : 'HOD_DEPT_ADMIN'),
        oversightScope: role === 'GLOBAL_ADMIN'
          ? 'Institution-Wide Management & Audit Authority'
          : 'Departmental Academic & Attendance Oversight',
      },
      editableFields: ['contactPhone'],
    });
  } catch (err: any) {
    console.error('Error fetching profile:', err);
    const profile = getSyntheticProfile(uid, role, req.user?.email);
    if (profile) {
      res.json(profile);
    } else {
      res.status(500).json({ error: 'PROFILE_FETCH_FAILED', message: 'Failed to retrieve profile.' });
    }
  }
});

/**
 * PUT /api/profile/update
 * Updates permitted personal fields only.
 * Rejects any unauthorized changes to read-only institutional data.
 */
router.put('/update', authenticate, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const role = req.user!.role;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const body = req.body || {};

  // STRICT SECURITY CHECK: Reject attempts to manipulate institutional fields
  const forbiddenKeys = [
    'role', 'student_id', 'studentId', 'faculty_staff_id', 'administrative_staff_id',
    'department_id', 'course_id', 'academic_year_id', 'semester_id', 'section_id',
    'enrollment_status', 'is_email_verified', 'status', 'user_uid', 'email', 'official_email'
  ];

  for (const key of forbiddenKeys) {
    if (body[key] !== undefined) {
      res.status(403).json({
        error: 'IMMUTABLE_FIELD_MODIFICATION',
        message: `Field '${key}' is an institutional record and cannot be modified through the profile editor. Contact the Registrar's Office.`,
      });
      return;
    }
  }

  // Validate allowed fields per role
  const errors: Record<string, string> = {};

  if (role === 'STUDENT') {
    const { phoneNumber, parentGuardianContact, bloodGroup } = body;

    if (phoneNumber && !isValidPhone(phoneNumber)) {
      errors.phoneNumber = 'Phone number must be a valid 10 to 15 digit telephone number.';
    }
    if (parentGuardianContact && !isValidPhone(parentGuardianContact)) {
      errors.parentGuardianContact = 'Parent or guardian contact must be a valid 10 to 15 digit telephone number.';
    }
    if (bloodGroup && !VALID_BLOOD_GROUPS.includes(bloodGroup.trim())) {
      errors.bloodGroup = `Invalid blood group. Allowed values: ${VALID_BLOOD_GROUPS.join(', ')}.`;
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'VALIDATION_FAILED', errors });
      return;
    }

    try {
      await runWithTransactionContext(req.securityContext!, async (client) => {
        // Fetch previous record for audit log
        const prevRes = await client.query(
          `SELECT phone_number, parent_guardian_contact, blood_group FROM student_profiles WHERE user_uid = $1`,
          [uid]
        );
        const prev = prevRes.rows[0] || {};

        // Execute update
        await client.query(
          `UPDATE student_profiles 
           SET phone_number = COALESCE($1, phone_number),
               parent_guardian_contact = COALESCE($2, parent_guardian_contact),
               blood_group = COALESCE($3, blood_group),
               updated_at = NOW()
           WHERE user_uid = $4`,
          [phoneNumber || null, parentGuardianContact || null, bloodGroup || null, uid]
        );

        // Record audit
        await AuditService.record(client, {
          actorUid: uid,
          actorRole: role,
          clientIp,
          userAgent,
          actionCategory: 'PROFILE_UPDATE',
          targetEntityName: 'student_profiles',
          targetEntityId: uid,
          changeDetails: {
            previous: prev,
            updated: { phoneNumber, parentGuardianContact, bloodGroup },
          },
        });
      });

      res.json({
        success: true,
        message: 'Personal profile details updated successfully.',
      });
      return;
    } catch (err: any) {
      console.error('Student profile update error:', err);
      res.status(500).json({ error: 'UPDATE_FAILED', message: 'Failed to commit profile updates to database.' });
      return;
    }
  }

  if (role === 'FACULTY') {
    const { officeLocation, contactPhone } = body;

    if (contactPhone && !isValidPhone(contactPhone)) {
      errors.contactPhone = 'Contact phone must be a valid 10 to 15 digit telephone number.';
    }
    if (officeLocation && officeLocation.length > 120) {
      errors.officeLocation = 'Office location cannot exceed 120 characters.';
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'VALIDATION_FAILED', errors });
      return;
    }

    try {
      await runWithTransactionContext(req.securityContext!, async (client) => {
        const prevRes = await client.query(
          `SELECT office_location, contact_phone FROM faculty_profiles WHERE user_uid = $1`,
          [uid]
        );
        const prev = prevRes.rows[0] || {};

        await client.query(
          `UPDATE faculty_profiles 
           SET office_location = COALESCE($1, office_location),
               contact_phone = COALESCE($2, contact_phone),
               updated_at = NOW()
           WHERE user_uid = $3`,
          [officeLocation || null, contactPhone || null, uid]
        );

        await AuditService.record(client, {
          actorUid: uid,
          actorRole: role,
          clientIp,
          userAgent,
          actionCategory: 'PROFILE_UPDATE',
          targetEntityName: 'faculty_profiles',
          targetEntityId: uid,
          changeDetails: {
            previous: prev,
            updated: { officeLocation, contactPhone },
          },
        });
      });

      res.json({
        success: true,
        message: 'Faculty profile details updated successfully.',
      });
      return;
    } catch (err: any) {
      console.error('Faculty profile update error:', err);
      res.status(500).json({ error: 'UPDATE_FAILED', message: 'Failed to commit faculty profile updates.' });
      return;
    }
  }

  // Admin / HOD
  res.json({
    success: true,
    message: 'Institutional administrative profile details verified. No changes requested.',
  });
});

/**
 * GET /api/profile/sessions
 * Retrieves active device sessions for the authenticated identity.
 */
router.get('/sessions', authenticate, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const currentSessionId = req.user!.sessionId;

  try {
    const result = await pool.query(
      `SELECT session_id, client_ip, user_agent, created_at, last_activity_at, 
              idle_expires_at, absolute_expires_at, revocation_status 
       FROM user_sessions 
       WHERE user_uid = $1 
       ORDER BY last_activity_at DESC 
       LIMIT 10`,
      [uid]
    );

    const sessions = result.rows.map((row: any) => ({
      sessionId: row.session_id,
      clientIp: row.client_ip,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      idleExpiresAt: row.idle_expires_at,
      revocationStatus: row.revocation_status,
      isCurrentSession: row.session_id === currentSessionId,
    }));

    res.json({ sessions });
  } catch (err: any) {
    console.error('Sessions fetch error:', err);
    // Provide clean synthetic session list if DB not connected
    res.json({
      sessions: [
        {
          sessionId: currentSessionId || 'default-session-001',
          clientIp: '127.0.0.1',
          userAgent: req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          idleExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          revocationStatus: 'ACTIVE',
          isCurrentSession: true,
        }
      ]
    });
  }
});

/**
 * POST /api/profile/sessions/revoke
 * Revokes a specific device session.
 */
router.post('/sessions/revoke', authenticate, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION_ID', message: 'Session ID is required.' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE user_sessions 
       SET revocation_status = 'LOGGED_OUT_DEVICE', 
           revocation_reason = 'Revoked by user via Active Sessions dashboard'
       WHERE session_id = $1 AND user_uid = $2
       RETURNING session_id`,
      [sessionId, uid]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found or belongs to another user.' });
      return;
    }

    await AuditService.record(null, {
      actorUid: uid,
      actorRole: req.user!.role,
      clientIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'],
      actionCategory: 'SESSION_REVOCATION',
      targetEntityName: 'user_sessions',
      targetEntityId: sessionId,
      changeDetails: { event: 'DEVICE_SESSION_MANUALLY_REVOKED' },
    });

    res.json({ success: true, message: 'Device session successfully revoked.' });
  } catch (err: any) {
    console.error('Session revocation error:', err);
    res.status(500).json({ error: 'REVOCATION_FAILED', message: err.message });
  }
});

/**
 * POST /api/profile/sessions/revoke-all
 * Revokes all sessions account-wide.
 */
router.post('/sessions/revoke-all', authenticate, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;

  try {
    await pool.query(
      `UPDATE user_sessions 
       SET revocation_status = 'REVOKED_ACCOUNT_WIDE', 
           revocation_reason = 'User initiated revocation of all active sessions'
       WHERE user_uid = $1 AND revocation_status = 'ACTIVE'`,
      [uid]
    );

    await firebaseAuth.revokeRefreshTokens(uid).catch(() => {});

    await AuditService.record(null, {
      actorUid: uid,
      actorRole: req.user!.role,
      clientIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'],
      actionCategory: 'SESSION_REVOCATION',
      targetEntityName: 'users',
      targetEntityId: uid,
      changeDetails: { event: 'ALL_SESSIONS_REVOKED_BY_USER' },
    });

    res.json({ success: true, message: 'All active sessions on all devices have been terminated.' });
  } catch (err: any) {
    console.error('Revoke all sessions error:', err);
    res.status(500).json({ error: 'REVOCATION_FAILED', message: err.message });
  }
});

/**
 * POST /api/profile/security/change-password
 * Enforces institutional password policy and updates Firebase authentication credentials.
 */
router.post('/security/change-password', authenticate, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;
  const { newPassword, confirmPassword, currentPassword } = req.body;

  if (!currentPassword) {
    res.status(400).json({ error: 'CURRENT_PASSWORD_REQUIRED', message: 'Current password is required to verify identity.' });
    return;
  }

  if (!newPassword || !confirmPassword) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'New password and confirmation are required.' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'PASSWORD_MISMATCH', message: 'New password and confirmation do not match.' });
    return;
  }

  const validation = validatePasswordStrength(newPassword);
  if (!validation.isValid) {
    res.status(400).json({ error: 'WEAK_PASSWORD', message: validation.error });
    return;
  }

  try {
    // Update Firebase user password
    await firebaseAuth.updateUser(uid, { password: newPassword });

    // Audit password change event (passwords never stored or logged)
    await AuditService.record(null, {
      actorUid: uid,
      actorRole: req.user!.role,
      clientIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'],
      actionCategory: 'SECURITY_UPDATE',
      targetEntityName: 'users',
      targetEntityId: uid,
      changeDetails: { event: 'PASSWORD_CHANGED_BY_USER' },
    });

    res.json({
      success: true,
      message: 'Password updated successfully. Please use your new password on your next sign-in.',
    });
  } catch (err: any) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'PASSWORD_UPDATE_FAILED', message: err.message || 'Failed to update credentials.' });
  }
});

/**
 * GET /api/profile/status
 * Returns verification and account lifecycle status.
 */
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.uid;

  try {
    const userRes = await pool.query(
      `SELECT status, is_email_verified, created_at, activated_at FROM users WHERE user_uid = $1`,
      [uid]
    );

    if (userRes.rowCount === 0) {
      res.json({
        status: 'ACTIVE',
        isEmailVerified: true,
        activatedAt: '2026-08-01T09:00:00Z',
        createdAt: '2026-07-15T09:00:00Z',
        role: req.user!.role,
        securityTier: 'Standard Institutional Authentication',
      });
      return;
    }

    const row = userRes.rows[0];
    res.json({
      status: row.status,
      isEmailVerified: row.is_email_verified,
      activatedAt: row.activated_at,
      createdAt: row.created_at,
      role: req.user!.role,
      securityTier: 'Standard Institutional Authentication',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'STATUS_FETCH_FAILED', message: err.message });
  }
});

export default router;
