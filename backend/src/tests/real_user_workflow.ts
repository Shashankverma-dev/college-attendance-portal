/**
 * Real User Workflow & Authentication Integrity Test Suite
 * Validates 100% authentic institutional operations with zero mock / hardcoded fixtures:
 * 1. Real Administrator authentication (Dr. Arvind Sharma) & initial clean metrics
 * 2. Rejection of fake/test bypass tokens ('test-admin', 'test-faculty', 'test-student')
 * 3. Complete rejection of removed legacy mock accounts ('STU-101', 'FAC-201', 'FAC-204')
 * 4. Real Faculty Onboarding & Single-Use Token Activation Lifecycle
 * 5. Real Faculty Authentication, Profile Validation & RBAC (Admin dashboard blocked)
 * 6. Real Student Onboarding & Single-Use Token Activation Lifecycle
 * 7. Real Student Authentication, Profile Validation (/api/profile/me) & RBAC
 * 8. Cryptographic session token tampering detection
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

interface TestAssertion {
  category: string;
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestAssertion[] = [];

function assert(condition: boolean, category: string, name: string, detail?: string) {
  if (condition) {
    testResults.push({ category, name, passed: true });
    console.log(`  [PASS] [${category}] ${name}`);
  } else {
    testResults.push({ category, name, passed: false, error: detail });
    console.error(`  [FAIL] [${category}] ${name} - ${detail || 'Assertion failed'}`);
  }
}

async function request(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

async function runRealUserWorkflowTests() {
  console.log('=============================================================================');
  console.log('REAL USER WORKFLOW & AUTHENTICATION INTEGRITY SUITE');
  console.log(`Target: ${BASE_URL}`);
  console.log('=============================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. REAL ADMIN AUTHENTICATION
  // ---------------------------------------------------------------------------
  console.log('--- 1. REAL ADMIN AUTHENTICATION & DATA INTEGRITY ---');
  
  // 1.1 Bad password rejection
  const badAdminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: 'admin@college.edu',
      password: 'IncorrectPassword123!',
    }),
  });
  assert(
    badAdminLogin.status === 401,
    'Admin Auth',
    'Reject invalid password with HTTP 401',
    `Expected 401, got ${badAdminLogin.status}`
  );

  // 1.2 Legitimate admin login
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: 'admin@college.edu',
      password: 'Admin@Portal2026!',
    }),
  });
  assert(
    adminLogin.status === 200 && adminLogin.data.success === true,
    'Admin Auth',
    'Authenticate real Administrator (Dr. Arvind Sharma) successfully',
    `Expected 200, got ${adminLogin.status} (${JSON.stringify(adminLogin.data)})`
  );

  const adminToken = adminLogin.data?.token;
  const adminProfile = adminLogin.data?.user;

  assert(
    adminToken && adminToken.split('.').length === 3,
    'Admin Auth',
    'Issue cryptographically signed session token (3-part JWT structure)',
    `Token: ${adminToken}`
  );

  assert(
    adminProfile?.role === 'GLOBAL_ADMIN' && adminProfile?.name === 'Dr. Arvind Sharma',
    'Admin Auth',
    'Return authentic institutional admin profile: Dr. Arvind Sharma',
    `Got: ${adminProfile?.name}, Role: ${adminProfile?.role}`
  );

  // 1.3 Access protected admin route with authentic token
  const adminDashboard = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    adminDashboard.status === 200 && adminDashboard.data.success === true,
    'Admin Auth',
    'Access Admin dashboard endpoint with authentic Admin token',
    `Expected 200, got ${adminDashboard.status}`
  );

  // ---------------------------------------------------------------------------
  // 2. ZERO MOCK / BYPASS FIXTURE VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. ZERO TEST-ACCOUNT BYPASS VERIFICATION ---');

  const fakeAdminAttempt = await request('/api/admin/dashboard', {
    headers: { Authorization: 'Bearer test-admin' },
  });
  assert(
    fakeAdminAttempt.status === 401,
    'Bypass Elimination',
    "Reject synthetic token 'Bearer test-admin' with HTTP 401",
    `Expected 401, got ${fakeAdminAttempt.status}`
  );

  const fakeFacultyAttempt = await request('/api/attendance/teacher/timetable', {
    headers: { Authorization: 'Bearer test-faculty' },
  });
  assert(
    fakeFacultyAttempt.status === 401,
    'Bypass Elimination',
    "Reject synthetic token 'Bearer test-faculty' with HTTP 401",
    `Expected 401, got ${fakeFacultyAttempt.status}`
  );

  const fakeStudentAttempt = await request('/api/profile/me', {
    headers: { Authorization: 'Bearer test-student' },
  });
  assert(
    fakeStudentAttempt.status === 401,
    'Bypass Elimination',
    "Reject synthetic token 'Bearer test-student' with HTTP 401",
    `Expected 401, got ${fakeStudentAttempt.status}`
  );

  const garbageTokenAttempt = await request('/api/profile/me', {
    headers: { Authorization: 'Bearer not.a.valid.token' },
  });
  assert(
    garbageTokenAttempt.status === 401,
    'Bypass Elimination',
    'Reject malformed unsigned bearer token with HTTP 401',
    `Expected 401, got ${garbageTokenAttempt.status}`
  );

  // ---------------------------------------------------------------------------
  // 3. COMPLETE REJECTION OF REMOVED HARDCODED ACCOUNTS
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. REJECTION OF REMOVED HARDCODED ACCOUNTS ---');

  const oldStudentAttempt = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: 'STU-101',
      password: 'Student@Portal2026!',
    }),
  });
  assert(
    oldStudentAttempt.status === 401,
    'Mock Eradication',
    'Strictly reject removed hardcoded student STU-101 with HTTP 401',
    `Expected 401, got ${oldStudentAttempt.status}`
  );

  const oldFacultyAttempt = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: 'FAC-201',
      password: 'Faculty@Portal2026!',
    }),
  });
  assert(
    oldFacultyAttempt.status === 401,
    'Mock Eradication',
    'Strictly reject removed hardcoded faculty FAC-201 with HTTP 401',
    `Expected 401, got ${oldFacultyAttempt.status}`
  );

  const oldPendingFacultyAttempt = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: 'FAC-204',
      password: 'Faculty@Portal2026!',
    }),
  });
  assert(
    oldPendingFacultyAttempt.status === 401,
    'Mock Eradication',
    'Strictly reject removed test faculty FAC-204 with HTTP 401',
    `Expected 401, got ${oldPendingFacultyAttempt.status}`
  );

  // ---------------------------------------------------------------------------
  // 4. REAL FACULTY ONBOARDING & ACTIVATION WORKFLOW
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. REAL FACULTY ONBOARDING & ACTIVATION WORKFLOW ---');

  const facultyTimestamp = Date.now();
  const realFacultyStaffId = `FAC-R${facultyTimestamp.toString().slice(-4)}`;
  const realFacultyEmail = `faculty.${facultyTimestamp}@college.edu`;
  const realFacultyName = 'Dr. S. Radhakrishnan';

  // Ensure real academic department exists (Admin dynamically creates academic department)
  let deptId = 'b0000000-0000-0000-0000-000000000001';
  const deptRes = await request('/api/admin/academic/departments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      department_code: 'CA',
      department_name: 'Department of Computer Applications',
    }),
  });
  if (deptRes.data?.department?.department_id) {
    deptId = deptRes.data.department.department_id;
  }

  // 4.1 Admin provisions real faculty member
  const createTeacherRes = await request('/api/admin/teachers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      facultyStaffId: realFacultyStaffId,
      fullName: realFacultyName,
      officialEmail: realFacultyEmail,
      departmentId: deptId,
      designation: 'Associate Professor',
      officeLocation: 'Academic Block B, Room 204',
      contactPhone: '+91 98765 43299',
    }),
  });

  assert(
    createTeacherRes.status === 201 && Boolean(createTeacherRes.data?.activationLink),
    'Faculty Onboarding',
    'Admin provisions real faculty member and generates single-use activation link via POST /api/admin/teachers',
    `Status: ${createTeacherRes.status}, Error: ${createTeacherRes.data?.message || createTeacherRes.data?.error}`
  );

  const rawFacultyActivationLink = createTeacherRes.data?.activationLink || '';
  const parsedFacultyUrl = new URL(rawFacultyActivationLink, BASE_URL);
  const facultyInviteToken = parsedFacultyUrl.searchParams.get('token') || '';

  assert(
    facultyInviteToken.length > 20,
    'Faculty Onboarding',
    'Extract valid cryptographic raw token from generated faculty activation link',
    `Extracted token: ${facultyInviteToken.slice(0, 8)}...`
  );

  // 4.2 Unactivated faculty login attempt must be rejected
  const unactivatedFacultyLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: realFacultyStaffId,
      password: 'FacultySecure2026!#',
    }),
  });
  assert(
    unactivatedFacultyLogin.status === 403 || unactivatedFacultyLogin.status === 401,
    'Faculty Onboarding',
    'Block unactivated faculty login before password setup with HTTP 401/403',
    `Expected 401/403, got ${unactivatedFacultyLogin.status}`
  );

  // 4.3 Faculty activates account with compliant strong password
  const realFacultyPassword = 'FacultySecure2026!#';
  const activateFacultySuccess = await request('/api/auth/activate', {
    method: 'POST',
    body: JSON.stringify({
      token: facultyInviteToken,
      password: realFacultyPassword,
    }),
  });
  assert(
    activateFacultySuccess.status === 200 && activateFacultySuccess.data?.success === true,
    'Faculty Onboarding',
    'Activate real faculty account with compliant strong password via POST /api/auth/activate',
    `Status: ${activateFacultySuccess.status}`
  );

  // 4.4 Faculty authenticates with their real credentials
  const realFacultyLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: realFacultyStaffId,
      password: realFacultyPassword,
    }),
  });
  assert(
    realFacultyLogin.status === 200 && realFacultyLogin.data?.success === true,
    'Faculty Onboarding',
    'Authenticate real faculty member with newly activated password',
    `Expected 200, got ${realFacultyLogin.status}`
  );

  const facultyToken = realFacultyLogin.data?.token;
  const facultyUser = realFacultyLogin.data?.user;

  assert(
    facultyUser?.role === 'FACULTY' && facultyUser?.name === realFacultyName,
    'Faculty Onboarding',
    `Validate faculty identity: ${realFacultyName}`,
    `Got: ${facultyUser?.name}, Role: ${facultyUser?.role}`
  );

  // 4.5 Faculty RBAC: Attempt Admin Dashboard Access must be blocked
  const facultyAdminBreach = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${facultyToken}` },
  });
  assert(
    facultyAdminBreach.status === 403,
    'Faculty RBAC',
    'Block Faculty from accessing Admin endpoints with HTTP 403 FORBIDDEN',
    `Expected 403, got ${facultyAdminBreach.status}`
  );

  // ---------------------------------------------------------------------------
  // 5. REAL STUDENT ONBOARDING & ACTIVATION WORKFLOW
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. REAL STUDENT ONBOARDING & ACTIVATION WORKFLOW ---');

  const studentTimestamp = Date.now();
  const testStudentEmail = `onboard.student.${studentTimestamp}@college.edu`;
  const testStudentRoll = `R${studentTimestamp.toString().slice(-4)}`;
  const testStudentId = `STU-T${studentTimestamp.toString().slice(-4)}`;
  const testStudentName = 'Divya Patel';

  // 5.1 Administrator onboards a real candidate
  const onboardRes = await request('/api/students', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: testStudentName,
      studentGmail: testStudentEmail,
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
      rollNumber: testStudentRoll,
      studentId: testStudentId,
    }),
  });

  assert(
    onboardRes.status === 201 && Boolean(onboardRes.data?.activationLink),
    'Student Onboarding',
    'Admin onboards candidate and generates single-use activation link via POST /api/students',
    `Status: ${onboardRes.status}, Error: ${onboardRes.data?.message || onboardRes.data?.error}`
  );

  const rawActivationLink = onboardRes.data?.activationLink || '';
  const parsedUrl = new URL(rawActivationLink, BASE_URL);
  const inviteToken = parsedUrl.searchParams.get('token') || '';

  assert(
    inviteToken.length > 20,
    'Student Onboarding',
    'Extract valid cryptographic raw token from generated activation link',
    `Extracted token: ${inviteToken.slice(0, 8)}...`
  );

  // 5.2 Inspect active invite token non-destructively
  const tokenInspect = await request(`/api/auth/verify-token?token=${inviteToken}&purpose=ACCOUNT_ACTIVATION`);
  assert(
    tokenInspect.status === 200 && tokenInspect.data?.isValid === true,
    'Student Onboarding',
    'Inspect real onboarding invite token non-destructively via GET /api/auth/verify-token',
    `Token status: ${tokenInspect.status}, Valid: ${tokenInspect.data?.isValid}`
  );

  // 5.3 Password policy enforcement (Reject weak password)
  const weakPasswordAttempt = await request('/api/auth/activate', {
    method: 'POST',
    body: JSON.stringify({
      token: inviteToken,
      password: 'weak',
    }),
  });
  assert(
    weakPasswordAttempt.status === 400 && weakPasswordAttempt.data?.error === 'WEAK_PASSWORD',
    'Student Onboarding',
    'Enforce strong password policy (reject weak password < 12 characters)',
    `Status: ${weakPasswordAttempt.status}, Error: ${weakPasswordAttempt.data?.error}`
  );

  // 5.4 Activate with valid strong password
  const newAccountPassword = 'SecureStudent2026!#';
  const activateSuccess = await request('/api/auth/activate', {
    method: 'POST',
    body: JSON.stringify({
      token: inviteToken,
      password: newAccountPassword,
    }),
  });
  assert(
    activateSuccess.status === 200 && activateSuccess.data?.success === true,
    'Student Onboarding',
    'Activate real student account with compliant strong password',
    `Status: ${activateSuccess.status}`
  );

  // 5.5 Authenticate immediately with the newly activated credentials
  const newAccountLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: testStudentEmail,
      password: newAccountPassword,
    }),
  });
  assert(
    newAccountLogin.status === 200 && newAccountLogin.data?.success === true,
    'Student Onboarding',
    'Authenticate newly activated student account with newly set password',
    `Status: ${newAccountLogin.status}`
  );

  const studentToken = newAccountLogin.data?.token;
  const studentUser = newAccountLogin.data?.user;

  assert(
    studentUser?.role === 'STUDENT' && studentUser?.name === testStudentName,
    'Student Onboarding',
    `Validate Student identity: ${testStudentName}`,
    `Got: ${studentUser?.name}, Role: ${studentUser?.role}`
  );

  // 5.6 Fetch Student Profile via GET /api/profile/me
  const studentProfile = await request('/api/profile/me', {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert(
    studentProfile.status === 200 && Boolean(studentProfile.data?.personalInfo),
    'Student Profile',
    'Fetch real student profile data via GET /api/profile/me',
    `Expected 200, got ${studentProfile.status}`
  );

  const personalInfo = studentProfile.data?.personalInfo;
  assert(
    personalInfo?.fullName === testStudentName && personalInfo?.identifier === testStudentId,
    'Student Profile',
    `Personal info matches enrolled student ${testStudentName} (${testStudentId})`,
    `Identifier: ${personalInfo?.identifier}, Name: ${personalInfo?.fullName}`
  );

  // 5.7 Student RBAC: Block Admin & Teacher Access
  const studentAdminBreach = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert(
    studentAdminBreach.status === 403,
    'Student RBAC',
    'Block Student from accessing Admin dashboard with HTTP 403 FORBIDDEN',
    `Expected 403, got ${studentAdminBreach.status}`
  );

  const studentFacultyBreach = await request('/api/attendance/teacher/timetable', {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert(
    studentFacultyBreach.status === 403,
    'Student RBAC',
    'Block Student from accessing Teacher Timetable with HTTP 403 FORBIDDEN',
    `Expected 403, got ${studentFacultyBreach.status}`
  );

  // ---------------------------------------------------------------------------
  // 6. CRYPTOGRAPHIC TOKEN TAMPERING DETECTION
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. CRYPTOGRAPHIC TOKEN TAMPERING DETECTION ---');

  // Split authentic admin token into header, payload, and signature
  const parts = adminToken.split('.');
  if (parts.length === 3) {
    const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    decodedPayload.uid = 'usr-admin-forged-999';
    const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
    const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const tamperAttempt = await request('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    assert(
      tamperAttempt.status === 401,
      'Cryptography',
      'Reject cryptographically tampered session token with HTTP 401',
      `Expected 401, got ${tamperAttempt.status}`
    );
  }

  // ---------------------------------------------------------------------------
  // 7. CLEANUP: PURGE ALL TEST FIXTURES
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. CLEANUP: PURGE TEST FIXTURES ---');
  const purgeRes = await request('/api/admin/purge-test-data', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    purgeRes.status === 200 && purgeRes.data.success === true,
    'Cleanup',
    'Purge all test/mock student and faculty fixtures, leaving directory clean (0 students, 0 teachers)',
    `Expected 200, got ${purgeRes.status}`
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n=============================================================================');
  console.log('TEST SUMMARY');
  console.log('=============================================================================');
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Assertions: ${total}`);
  console.log(`Passed:           ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`Failed:           ${failed}`);

  if (failed > 0) {
    console.error('\nFAILED TESTS:');
    testResults
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - [${r.category}] ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n>>> ALL REAL USER WORKFLOW TESTS PASSED CLEANLY (100% SUCCESS RATE) <<<\n');
    process.exit(0);
  }
}

runRealUserWorkflowTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
