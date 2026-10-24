import { TokenService } from '../services/token';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

const adminToken = TokenService.createSessionToken({
  uid: 'usr-admin-001',
  email: 'admin@college.edu',
  role: 'GLOBAL_ADMIN',
});

const teacherToken = TokenService.createSessionToken({
  uid: 'usr-fac-201',
  email: 'm.sundaram@college.edu',
  role: 'FACULTY',
  departmentId: 'b0000000-0000-0000-0000-000000000001',
});

const adminHeaders: Record<string, string> = {
  Authorization: `Bearer ${adminToken}`,
  'Content-Type': 'application/json',
};

const teacherHeaders: Record<string, string> = {
  Authorization: `Bearer ${teacherToken}`,
  'Content-Type': 'application/json',
};

interface TestResult {
  testNumber: number;
  category: string;
  description: string;
  status: 'PASSED' | 'FAILED';
  details: string;
}

const results: TestResult[] = [];

async function apiRequest(method: string, endpoint: string, headers?: Record<string, string>, body?: any) {
  const url = `${BASE_URL}${endpoint}`;
  const reqHeaders: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(headers || {}),
  };

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

function recordResult(testNumber: number, category: string, description: string, passed: boolean, details: string) {
  const status = passed ? 'PASSED' : 'FAILED';
  results.push({ testNumber, category, description, status, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [Test ${testNumber}] [${category}] ${description}: ${status}`);
  if (!passed || process.env.VERBOSE) {
    console.log(`   Details: ${details}`);
  }
}

async function runAllTests() {
  console.log('========================================================================');
  console.log('🚀 MASTER CAPABILITIES VERIFICATION: INSTITUTIONAL ID, SCHOOLS & LIVE QR');
  console.log('========================================================================\n');

  let testIdx = 1;

  // -------------------------------------------------------------------------
  // 1. INSTITUTIONAL SCHOOLS VERIFICATION & SEEDING
  // -------------------------------------------------------------------------
  console.log('--- Phase A: Institutional Schools Seeding & Hierarchy ---');
  try {
    const res = await apiRequest('GET', '/admin/schools', adminHeaders);
    const schools = res.data?.schools || [];
    const hasSST = schools.some((s: any) => s.school_code === 'SST');
    const hasSBS = schools.some((s: any) => s.school_code === 'SBS');
    const hasSOM = schools.some((s: any) => s.school_code === 'SOM');

    const passed = res.ok && hasSST && hasSBS && hasSOM;
    recordResult(
      testIdx++,
      'Schools Seeding',
      'Verify seeded institutional schools (SST, SBS, SOM)',
      passed,
      `Found ${schools.length} schools: ${schools.map((s: any) => s.school_code).join(', ')}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Schools Seeding', 'Verify seeded institutional schools (SST, SBS, SOM)', false, err.message);
  }

  // Verify Academic Structure API includes Schools
  try {
    const res = await apiRequest('GET', '/admin/academic/structure', adminHeaders);
    const hasSchoolsArray = Array.isArray(res.data?.schools) && res.data.schools.length >= 3;
    recordResult(
      testIdx++,
      'Academic Structure',
      'Verify /api/admin/academic/structure includes first-class schools list',
      res.ok && hasSchoolsArray,
      `Structure schools count: ${res.data?.schools?.length || 0}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Academic Structure', 'Verify /api/admin/academic/structure includes schools', false, err.message);
  }

  // -------------------------------------------------------------------------
  // 2. CONFIGURABLE SCHOOL MANAGEMENT CRUD
  // -------------------------------------------------------------------------
  console.log('\n--- Phase B: Configurable School Management CRUD ---');
  const runId = Date.now().toString().slice(-4);
  const targetSchoolCode = `S${runId}`;
  let createdSchoolId = '';
  try {
    const newSchoolPayload = {
      school_code: targetSchoolCode,
      school_name: `School of Law & Justice ${runId}`,
      description: 'Faculty of Legal Studies & Constitutional Law',
    };
    const res = await apiRequest('POST', '/admin/schools', adminHeaders, newSchoolPayload);
    createdSchoolId = res.data?.school?.school_id || '';
    const passed = res.status === 201 && res.data?.school?.school_code === targetSchoolCode;
    recordResult(
      testIdx++,
      'School CRUD',
      `Admin creates new School of Law (${targetSchoolCode})`,
      passed,
      `Status: ${res.status}, ID: ${createdSchoolId}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'School CRUD', 'Admin creates new School of Law', false, err.message);
  }

  // Update School
  try {
    const updatePayload = {
      school_name: `School of Law & Governance ${runId}`,
      description: 'Faculty of Legal Studies, Governance & Policy',
    };
    const res = await apiRequest('PUT', `/admin/schools/${createdSchoolId}`, adminHeaders, updatePayload);
    const passed = res.ok && res.data?.school?.school_name === `School of Law & Governance ${runId}`;
    recordResult(
      testIdx++,
      'School CRUD',
      'Admin updates school name and description',
      passed,
      `Status: ${res.status}, Updated name: ${res.data?.school?.school_name}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'School CRUD', 'Admin updates school name and description', false, err.message);
  }

  // Duplicate School Code rejection
  try {
    const duplicatePayload = {
      school_code: targetSchoolCode,
      school_name: 'School of Litigation',
    };
    const res = await apiRequest('POST', '/admin/schools', adminHeaders, duplicatePayload);
    const passed = res.status === 400 && res.data?.message?.includes('already exists');
    recordResult(
      testIdx++,
      'School Validation',
      'Reject creation of duplicate school_code',
      passed,
      `Status: ${res.status}, Error message: ${res.data?.message}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'School Validation', 'Reject creation of duplicate school_code', false, err.message);
  }

  // -------------------------------------------------------------------------
  // 3. INSTITUTIONAL STUDENT IDENTITY (DUAL IDENTIFIERS)
  // -------------------------------------------------------------------------
  console.log('\n--- Phase C: Institutional Student Identity (Dual IDs) ---');
  const targetEnrollment = `SRHU23${runId}`;
  const targetRegistration = `dd241104${runId}`;
  let createdStudentId = '';

  try {
    const studentPayload = {
      fullName: `Kavita Raman ${runId}`,
      studentGmail: `kavita.raman.${runId}@college.edu`,
      enrollmentNo: targetEnrollment,
      registrationNo: targetRegistration,
      schoolId: '10000000-0000-0000-0000-000000000001', // SST
      departmentId: 'b0000000-0000-0000-0000-000000000001',
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
      rollNumber: `${runId.slice(-2)}`,
      phoneNumber: '+1 (555) 019-9999',
      parentContact: '+1 (555) 019-8888',
      admissionYear: '2026-2027',
      academicTerm: 'Autumn 2026',
    };

    const res = await apiRequest('POST', '/students', adminHeaders, studentPayload);
    createdStudentId = res.data?.student?.student_profile_id || '';
    const studentData = res.data?.student;
    const preservesCaseAndZeros = studentData?.registration_no === targetRegistration;
    const preservesEnrollment = studentData?.enrollment_no === targetEnrollment;

    const passed = (res.status === 201 || res.status === 200) && preservesCaseAndZeros && preservesEnrollment;
    recordResult(
      testIdx++,
      'Dual Identity',
      'Create student with separate Enrollment No & Registration No (exact case & leading zeros preserved)',
      passed,
      `Enrollment: ${studentData?.enrollment_no}, Registration: ${studentData?.registration_no}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Dual Identity', 'Create student with separate Enrollment No & Registration No', false, err.message);
  }

  // Duplicate Enrollment Number Rejection
  try {
    const dupEnrollPayload = {
      fullName: 'Another Student',
      studentGmail: `another.student.${runId}@college.edu`,
      enrollmentNo: targetEnrollment, // Duplicate!
      registrationNo: `dd999999${runId}`,
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
      rollNumber: `98`,
    };
    const res = await apiRequest('POST', '/students', adminHeaders, dupEnrollPayload);
    const passed = res.status === 400 && (res.data?.error === 'DUPLICATE_ENROLLMENT_NO' || res.data?.message?.includes('Enrollment Number'));
    recordResult(
      testIdx++,
      'Dual Identity',
      'Reject student creation with duplicate Enrollment Number',
      passed,
      `Status: ${res.status}, Error: ${res.data?.error || res.data?.message}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Dual Identity', 'Reject duplicate Enrollment Number', false, err.message);
  }

  // Duplicate Registration Number Rejection
  try {
    const dupRegPayload = {
      fullName: 'Third Student',
      studentGmail: `third.student.${runId}@college.edu`,
      enrollmentNo: `SRHU99${runId}`,
      registrationNo: targetRegistration, // Duplicate!
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
      rollNumber: `97`,
    };
    const res = await apiRequest('POST', '/students', adminHeaders, dupRegPayload);
    const passed = res.status === 400 && (res.data?.error === 'DUPLICATE_REGISTRATION_NO' || res.data?.message?.includes('Registration Number'));
    recordResult(
      testIdx++,
      'Dual Identity',
      'Reject student creation with duplicate Registration Number',
      passed,
      `Status: ${res.status}, Error: ${res.data?.error || res.data?.message}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Dual Identity', 'Reject duplicate Registration Number', false, err.message);
  }

  // -------------------------------------------------------------------------
  // 4. LIVE QR-BASED ATTENDANCE WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n--- Phase D: Live QR-Based Classroom Attendance ---');
  let activeSessionId = '';
  let activeToken = '';
  let activeBackupCode = '';

  const alexToken = TokenService.createSessionToken({
    uid: 'usr-stu-101',
    email: 'alex.chen@college.edu',
    role: 'STUDENT',
  });
  const alexHeaders = {
    Authorization: `Bearer ${alexToken}`,
    'Content-Type': 'application/json',
  };

  const brianToken = TokenService.createSessionToken({
    uid: 'usr-stu-102',
    email: 'brian.patel@college.edu',
    role: 'STUDENT',
  });
  const brianHeaders = {
    Authorization: `Bearer ${brianToken}`,
    'Content-Type': 'application/json',
  };

  const claireToken = TokenService.createSessionToken({
    uid: 'usr-stu-103',
    email: 'claire.zhang@college.edu',
    role: 'STUDENT',
  });
  const claireHeaders = {
    Authorization: `Bearer ${claireToken}`,
    'Content-Type': 'application/json',
  };

  const ineligibleToken = TokenService.createSessionToken({
    uid: 'usr-stu-999',
    email: 'ineligible@college.edu',
    role: 'STUDENT',
  });
  const ineligibleHeaders = {
    Authorization: `Bearer ${ineligibleToken}`,
    'Content-Type': 'application/json',
  };

  // Step 4.1: Teacher launches Live QR Session
  try {
    const startPayload = {
      timetableEntryId: 'tte00000-0000-0000-0000-000000000001', // BCA 1-A Dr. Meenakshi Sundaram
      intervalSeconds: 20,
      durationMinutes: 60,
    };
    const res = await apiRequest('POST', '/attendance/qr/start', teacherHeaders, startPayload);
    activeSessionId = res.data?.session?.session_id || res.data?.session?.qr_session_id || '';
    activeToken = res.data?.currentToken || '';
    activeBackupCode = res.data?.session?.backup_challenge_code || res.data?.session?.backup_code || '';

    const hasHmacToken = activeToken.length === 64; // SHA256 hex string
    const hasBackupCode = activeBackupCode.length === 6 && /^\d{6}$/.test(activeBackupCode);

    const passed = res.ok && hasHmacToken && hasBackupCode && !!activeSessionId;
    recordResult(
      testIdx++,
      'Live QR Session',
      'Teacher launches live QR session with rotating HMAC token and 6-digit backup challenge',
      passed,
      `SessionId: ${activeSessionId}, Token length: ${activeToken.length}, BackupCode: ${activeBackupCode}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Live QR Session', 'Teacher launches live QR session', false, err.message);
  }

  // Step 4.2: Fetch Live Token and Check Countdown
  try {
    const res = await apiRequest('GET', `/attendance/qr/token/${activeSessionId}`, teacherHeaders);
    const token = res.data?.token || '';
    const secondsRemaining = res.data?.secondsRemaining;
    const backupCode = res.data?.challengeCode || res.data?.backupCode;

    const passed = res.ok && token.length === 64 && secondsRemaining > 0 && backupCode === activeBackupCode;
    recordResult(
      testIdx++,
      'Live QR Token',
      'Retrieve active token and countdown window from teacher projector endpoint',
      passed,
      `Seconds remaining: ${secondsRemaining}, Backup code: ${backupCode}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Live QR Token', 'Retrieve active token and countdown window', false, err.message);
  }

  // Step 4.3: Eligible Student Scans QR Token
  try {
    // Alex Chen: STU-101 in BCA Sem 1 Sec A
    const scanPayload = {
      sessionId: activeSessionId,
      token: activeToken,
      deviceInfo: { browser: 'Chrome 120', platform: 'Android' },
    };
    const res = await apiRequest('POST', '/attendance/qr/scan', alexHeaders, scanPayload);
    const passed = res.ok && res.data?.success === true && res.data?.student?.studentId === 'STU-101';
    recordResult(
      testIdx++,
      'Student QR Scan',
      'Eligible student scans live rotating QR token successfully',
      passed,
      `Success: ${res.data?.success}, Student: ${res.data?.student?.fullName}, Scanned at: ${res.data?.scannedAt}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Student QR Scan', 'Eligible student scans live rotating QR token', false, err.message);
  }

  // Step 4.4: Anti-Replay / Duplicate Scan Idempotency
  try {
    const scanPayload = {
      sessionId: activeSessionId,
      token: activeToken,
    };
    const res = await apiRequest('POST', '/attendance/qr/scan', alexHeaders, scanPayload);
    const isAlreadyRecorded = res.data?.alreadyRecorded === true;
    recordResult(
      testIdx++,
      'Anti-Replay',
      'Duplicate scan by same student is recognized idempotently',
      res.ok && isAlreadyRecorded,
      `Message: ${res.data?.message}, alreadyRecorded: ${res.data?.alreadyRecorded}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Anti-Replay', 'Duplicate scan handling', false, err.message);
  }

  // Step 4.5: 6-Digit Backup Code Verification
  try {
    // Brian Patel: STU-102 in BCA Sem 1 Sec A
    const scanPayload = {
      sessionId: activeSessionId,
      backupCode: activeBackupCode,
      deviceInfo: { browser: 'Safari Mobile', fallback: true },
    };
    const res = await apiRequest('POST', '/attendance/qr/scan', brianHeaders, scanPayload);
    const passed = res.ok && res.data?.success === true && res.data?.student?.studentId === 'STU-102';
    recordResult(
      testIdx++,
      'Backup Code',
      'Eligible student checks in using 6-digit backup challenge code',
      passed,
      `Success: ${res.data?.success}, Student: ${res.data?.student?.fullName}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Backup Code', 'Eligible student checks in using 6-digit backup code', false, err.message);
  }

  // Step 4.6: Invalid / Forged Token Rejection
  try {
    // Claire Zhang: STU-103
    const scanPayload = {
      sessionId: activeSessionId,
      token: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // invalid HMAC
    };
    const res = await apiRequest('POST', '/attendance/qr/scan', claireHeaders, scanPayload);
    const passed = (res.status === 400 || res.status === 403) && (res.data?.code === 'INVALID_OR_EXPIRED_TOKEN' || res.data?.error === 'INVALID_OR_EXPIRED_TOKEN' || res.data?.message?.includes('expired') || res.data?.message?.includes('invalid'));
    recordResult(
      testIdx++,
      'Token Integrity',
      'Reject forged/expired QR token with cryptographic validation error',
      passed,
      `Status: ${res.status}, Code: ${res.data?.code || res.data?.error}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Token Integrity', 'Reject forged QR token', false, err.message);
  }

  // Step 4.7: Cross-Section / Ineligible Student Rejection
  try {
    const scanPayload = {
      sessionId: activeSessionId,
      token: activeToken,
    };
    const res = await apiRequest('POST', '/attendance/qr/scan', ineligibleHeaders, scanPayload);
    const passed = res.status === 403 || res.status === 400 || res.status === 404;
    recordResult(
      testIdx++,
      'Enrollment Guard',
      'Reject attendance check-in from student not enrolled in lecture course/section',
      passed,
      `Status: ${res.status}, Error: ${res.data?.error || res.data?.message}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Enrollment Guard', 'Reject ineligible student', false, err.message);
  }

  // Step 4.8: Teacher Live Attendance Monitor
  try {
    const res = await apiRequest('GET', `/attendance/qr/live/${activeSessionId}`, teacherHeaders);
    const totalPresent = res.data?.totalPresent || 0;
    const scans = res.data?.recentScans || [];
    const hasAlex = scans.some((s: any) => s.student_name?.includes('Alex') || s.student_id === 'STU-101');
    const hasBrian = scans.some((s: any) => s.student_name?.includes('Brian') || s.student_id === 'STU-102');

    const passed = res.ok && totalPresent >= 2 && hasAlex && hasBrian;
    recordResult(
      testIdx++,
      'Live Monitor',
      'Teacher live monitor displays real-time verified count and student check-in feed',
      passed,
      `Total present: ${totalPresent}, Scans logged: ${scans.length}, Alex present: ${hasAlex}, Brian present: ${hasBrian}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Live Monitor', 'Teacher live monitor verification', false, err.message);
  }

  // Step 4.9: Teacher Closes Session & Locks Register
  try {
    const closePayload = {
      sessionId: activeSessionId,
    };
    const res = await apiRequest('POST', '/attendance/qr/close', teacherHeaders, closePayload);
    const passed = res.ok && res.data?.session?.status === 'CLOSED';
    recordResult(
      testIdx++,
      'Session Closure',
      'Teacher closes session, locks live QR display, and finalizes attendance records',
      passed,
      `Status: ${res.data?.session?.status}, Total Present: ${res.data?.summary?.verifiedCount}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Session Closure', 'Teacher closes session and locks register', false, err.message);
  }

  // Step 4.10: Rejection of Scans after Session Closure
  try {
    const scanPayload = {
      sessionId: activeSessionId,
      backupCode: activeBackupCode,
    };
    const res = await apiRequest('POST', '/attendance/qr/scan', claireHeaders, scanPayload);
    const passed = (res.status === 410 || res.status === 400) && (res.data?.code === 'SESSION_CLOSED' || res.data?.error === 'SESSION_CLOSED' || res.data?.message?.includes('closed'));
    recordResult(
      testIdx++,
      'Post-Closure Guard',
      'Reject scans submitted after teacher closed live attendance session',
      passed,
      `Status: ${res.status}, Code: ${res.data?.code || res.data?.error}`
    );
  } catch (err: any) {
    recordResult(testIdx++, 'Post-Closure Guard', 'Reject scans after closure', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('========================================================================');
  const passedCount = results.filter((r) => r.status === 'PASSED').length;
  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Executed: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.error('\n❌ FAILURES ENCOUNTERED:');
    results
      .filter((r) => r.status === 'FAILED')
      .forEach((r) => {
        console.error(`- [Test ${r.testNumber}] ${r.category}: ${r.description} -> ${r.details}`);
      });
    process.exit(1);
  } else {
    console.log('\n✨ ALL CAPABILITIES SUCCESSFULLY VERIFIED WITH ZERO FAILURES!');
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
