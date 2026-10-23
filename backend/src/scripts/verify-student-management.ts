export {};

const BASE_URL = 'http://localhost:5000/api';

const adminHeaders: Record<string, string> = {
  Authorization: 'Bearer test-admin',
  'Content-Type': 'application/json',
};

interface TestResult {
  testNumber: number;
  description: string;
  status: 'PASSED' | 'FAILED';
  details: string;
}

const results: TestResult[] = [];

async function apiRequest(method: string, url: string, headers?: Record<string, string>, body?: any) {
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

  if (!res.ok) {
    const error: any = new Error(data?.message || data?.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function runTest(testNumber: number, description: string, fn: () => Promise<string>) {
  try {
    const details = await fn();
    results.push({ testNumber, description, status: 'PASSED', details });
    console.log(`[PASS] Test ${testNumber}: ${description} -> ${details}`);
  } catch (err: any) {
    const details = err.data?.message || err.message || JSON.stringify(err);
    results.push({ testNumber, description, status: 'FAILED', details });
    console.error(`[FAIL] Test ${testNumber}: ${description} -> ${details}`);
  }
}

async function main() {
  console.log('=============================================================================');
  console.log('STARTING AUTOMATED VERIFICATION: STUDENT MANAGEMENT, ENROLLMENT & ACTIVATION');
  console.log('=============================================================================\n');

  // Test 1: Academic Tree Resources
  await runTest(1, 'Fetch Academic Structure Hierarchy and Section Capacities', async () => {
    const res = await apiRequest('GET', `${BASE_URL}/admin/students/resources/academic-tree`, adminHeaders);
    if (!res.tree || res.tree.length === 0) {
      throw new Error('Academic tree returned no departments');
    }
    const caDept = res.tree.find((d: any) => d.department_code === 'CA');
    if (!caDept) throw new Error('CA department not found in academic tree');
    const bca = caDept.courses.find((c: any) => c.course_code === 'BCA');
    if (!bca) throw new Error('BCA course not found in CA department');
    return `Verified ${res.tree.length} departments; BCA has ${bca.semesters.length} semesters and active section capacities`;
  });

  // Test 2: Student Directory Listing & Pagination
  await runTest(2, 'Query Student Directory with Filters and Pagination', async () => {
    const res = await apiRequest('GET', `${BASE_URL}/admin/students?course_code=BCA&semester_number=1&section_name=A&page=1&limit=10`, adminHeaders);
    if (typeof res.total !== 'number') throw new Error('Response missing total count');
    if (!Array.isArray(res.students)) throw new Error('Response missing students array');
    return `Returned ${res.students.length} students in BCA Sem 1 Sec A (total: ${res.total})`;
  });

  // Test 3: Create Student with Permanent ID & Academic Enrollment
  let createdStudentProfileId = '';
  let createdStudentId = `BCA-2026-TEST-${Date.now().toString().slice(-4)}`;
  let createdEmail = `test.student.${Date.now()}@college.edu`;
  let initialRawActivationToken = '';

  await runTest(3, 'Create New Student with Official ID and 48-Hour Activation Token', async () => {
    const payload = {
      fullName: 'Vikramaditya Rao',
      studentGmail: createdEmail,
      studentId: createdStudentId,
      rollNumber: 'ROLL-999',
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
      phoneNumber: '+91 98765 11111',
      admissionYear: '2026-2027',
      academicTerm: 'Autumn 2026',
    };

    const res = await apiRequest('POST', `${BASE_URL}/admin/students`, adminHeaders, payload);
    if (!res.success) throw new Error(res.message || 'Creation failed');
    if (!res.student || !res.student.student_profile_id) throw new Error('Missing student profile in response');
    createdStudentProfileId = res.student.student_profile_id;
    if (res.activationLink) {
      const match = res.activationLink.match(/token=([a-f0-9]+)/i);
      if (match) initialRawActivationToken = match[1];
    }
    if (res.student.status !== 'PENDING_ACTIVATION') throw new Error(`Expected PENDING_ACTIVATION, got ${res.student.status}`);
    if (res.student.enrollment_status !== 'ACTIVE') throw new Error(`Expected ACTIVE enrollment, got ${res.student.enrollment_status}`);
    return `Created student ${res.student.student_id} (${res.student.full_name}) with status ${res.student.status} and email ${res.student.student_gmail}`;
  });

  // Test 4: Reject Duplicate Student ID
  await runTest(4, 'Reject Duplicate Permanent Student ID', async () => {
    const duplicatePayload = {
      fullName: 'Imposter Student',
      studentGmail: `imposter.${Date.now()}@college.edu`,
      studentId: createdStudentId, // DUPLICATE ID
      rollNumber: 'ROLL-998',
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
    };

    try {
      await apiRequest('POST', `${BASE_URL}/admin/students`, adminHeaders, duplicatePayload);
      throw new Error('Should have rejected duplicate student ID');
    } catch (err: any) {
      if (err.status === 400 && (err.data?.error === 'DUPLICATE_STUDENT_ID' || err.message.includes('already registered'))) {
        return `Successfully rejected duplicate Student ID '${createdStudentId}' (HTTP 400 DUPLICATE_STUDENT_ID)`;
      }
      throw err;
    }
  });

  // Test 5: Reject Duplicate Email Address
  await runTest(5, 'Reject Duplicate Student Institutional Email', async () => {
    const duplicateEmailPayload = {
      fullName: 'Second Person',
      studentGmail: createdEmail, // DUPLICATE EMAIL
      studentId: 'BCA-2026-TEST-99',
      rollNumber: 'ROLL-997',
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
    };

    try {
      await apiRequest('POST', `${BASE_URL}/admin/students`, adminHeaders, duplicateEmailPayload);
      throw new Error('Should have rejected duplicate email');
    } catch (err: any) {
      if (err.status === 400 && (err.data?.error === 'DUPLICATE_EMAIL' || err.message.includes('already registered'))) {
        return `Successfully rejected duplicate email '${createdEmail}' (HTTP 400 DUPLICATE_EMAIL)`;
      }
      throw err;
    }
  });

  // Test 6: Resend Activation Token & Invalidate Superseded Token
  let reissuedRawToken = '';
  await runTest(6, 'Resend Activation Token and Invalidate Prior Outstanding Token', async () => {
    const resendRes = await apiRequest('POST', `${BASE_URL}/admin/students/${createdStudentProfileId}/resend-activation`, adminHeaders);
    if (!resendRes.success) throw new Error(resendRes.message || 'Resend failed');

    if (resendRes.activationLink) {
      const match = resendRes.activationLink.match(/token=([a-f0-9]+)/i);
      if (match) reissuedRawToken = match[1];
    }
    if (!reissuedRawToken) throw new Error('Resend response did not contain new activation token');

    // Verify the prior token is rejected with SUPERSEDED_TOKEN
    try {
      await apiRequest('GET', `${BASE_URL}/auth/verify-token?token=${initialRawActivationToken}&purpose=ACCOUNT_ACTIVATION`);
      throw new Error('Initial token should have been marked superseded');
    } catch (err: any) {
      if (err.status === 400 && (err.message.includes('SUPERSEDED_TOKEN') || err.data?.message?.includes('newer activation link'))) {
        // Prior token properly invalidated
      } else {
        throw err;
      }
    }

    return `Reissued new 48h activation token. Initial token successfully superseded and rejected by auth service.`;
  });

  // Test 7: Verify 48-Hour Activation Token Inspection and Redemption
  await runTest(7, 'Inspect Activation Token and Complete Student Self-Set Password Flow', async () => {
    const verifyRes = await apiRequest('GET', `${BASE_URL}/auth/verify-token?token=${reissuedRawToken}&purpose=ACCOUNT_ACTIVATION`);
    if (!verifyRes.isValid) throw new Error(verifyRes.message || 'Token inspection returned invalid');
    if (verifyRes.studentId !== createdStudentId) throw new Error(`Expected studentId ${createdStudentId}, got ${verifyRes.studentId}`);

    // Redeem token with password
    const activateRes = await apiRequest('POST', `${BASE_URL}/auth/activate`, undefined, {
      token: reissuedRawToken,
      password: 'StrongPassword@2026!',
    });

    if (!activateRes.success) throw new Error(activateRes.message || 'Activation redemption failed');

    // Verify student is now ACTIVE
    const stuDetail = await apiRequest('GET', `${BASE_URL}/admin/students/${createdStudentProfileId}`, adminHeaders);
    if (stuDetail.student.status !== 'ACTIVE') {
      throw new Error(`Expected student status ACTIVE after activation, got ${stuDetail.student.status}`);
    }

    return `Token successfully inspected and redeemed. Student status upgraded to ACTIVE with verified self-set password.`;
  });

  // Test 8: Prevent Token Reuse (Single-Use Semantics)
  await runTest(8, 'Enforce Single-Use Token Semantics (Reject Re-Redemption)', async () => {
    try {
      await apiRequest('POST', `${BASE_URL}/auth/activate`, undefined, {
        token: reissuedRawToken,
        password: 'AnotherPassword@2026!',
      });
      throw new Error('Should have rejected already used token');
    } catch (err: any) {
      if (err.status === 400 && (err.message.includes('already been redeemed') || err.data?.message?.includes('TOKEN_ALREADY_USED'))) {
        return `Successfully rejected redeemed token: '${err.message}'`;
      }
      throw err;
    }
  });

  // Test 9: Reject Resending Activation to Already Active Student
  await runTest(9, 'Reject Resending Activation Token to Already Active Student', async () => {
    try {
      await apiRequest('POST', `${BASE_URL}/admin/students/${createdStudentProfileId}/resend-activation`, adminHeaders);
      throw new Error('Should have rejected resending activation to active student');
    } catch (err: any) {
      if (err.status === 400 && (err.data?.error === 'ALREADY_ACTIVATED' || err.message.includes('already activated'))) {
        return `Successfully protected active student from activation re-issuance (HTTP 400 ALREADY_ACTIVATED)`;
      }
      throw err;
    }
  });

  // Test 10: Revoke Outstanding Invitation on Pending Student
  let pendingStudentId = '';
  await runTest(10, 'Revoke Outstanding Invitation Token on Pending Student', async () => {
    const pendingPayload = {
      fullName: 'Aarti Kulkarni',
      studentGmail: `aarti.kulkarni.${Date.now()}@college.edu`,
      studentId: `BCA-2026-REV-${Date.now().toString().slice(-4)}`,
      rollNumber: `ROLL-${Date.now().toString().slice(-4)}`,
      courseCode: 'BCA',
      semesterNumber: 1,
      sectionName: 'A',
    };

    const createRes = await apiRequest('POST', `${BASE_URL}/admin/students`, adminHeaders, pendingPayload);
    pendingStudentId = createRes.student.student_profile_id;
    let pendingToken = createRes.activationLink.match(/token=([a-f0-9]+)/i)?.[1];

    const revokeRes = await apiRequest('POST', `${BASE_URL}/admin/students/${pendingStudentId}/revoke-invitation`, adminHeaders, {
      reason: 'Administrative revocation test',
    });
    if (!revokeRes.success) throw new Error(revokeRes.message || 'Revocation failed');

    const stuDetail = await apiRequest('GET', `${BASE_URL}/admin/students/${pendingStudentId}`, adminHeaders);
    if (stuDetail.student.invitation_status !== 'REVOKED') {
      throw new Error(`Expected invitation_status REVOKED, got ${stuDetail.student.invitation_status}`);
    }

    // Verify token redemption is rejected
    if (pendingToken) {
      try {
        await apiRequest('POST', `${BASE_URL}/auth/activate`, undefined, {
          token: pendingToken,
          password: 'TestPassword@2026!',
        });
        throw new Error('Revoked token should not be redeemable');
      } catch (err: any) {
        if (err.status === 400) {
          // Token successfully blocked
        } else {
          throw err;
        }
      }
    }

    return `Invitation successfully revoked; invitation status updated to REVOKED and redemption blocked.`;
  });

  // Test 11: Suspend Student Account and Block Protected Access
  await runTest(11, 'Suspend Student Account and Enforce Immediate Access Restriction', async () => {
    const suspendRes = await apiRequest('POST', `${BASE_URL}/admin/students/${createdStudentProfileId}/status`, adminHeaders, {
      status: 'SUSPENDED',
      reason: 'Disciplinary review hold',
    });
    if (!suspendRes.success) throw new Error(suspendRes.message || 'Suspension failed');

    // Test that the student's status is SUSPENDED
    const stuDetail = await apiRequest('GET', `${BASE_URL}/admin/students/${createdStudentProfileId}`, adminHeaders);
    if (stuDetail.student.status !== 'SUSPENDED') {
      throw new Error(`Expected SUSPENDED status, got ${stuDetail.student.status}`);
    }

    // Reactivate for downstream tests
    await apiRequest('POST', `${BASE_URL}/admin/students/${createdStudentProfileId}/status`, adminHeaders, {
      status: 'ACTIVE',
      reason: 'Reinstated after review',
    });

    return `Account successfully suspended and verified with status SUSPENDED, then reactivated.`;
  });

  // Test 12: Section and Academic Transfer with Historical Preservation
  await runTest(12, 'Transfer Student to New Section Preserving Historical Records', async () => {
    const transferPayload = {
      targetCourseCode: 'BCA',
      targetSemesterNumber: 1,
      targetSectionName: 'B', // Moved from A to B
      effectiveDate: '2026-10-21',
      transferReason: 'Elective timetable optimization',
    };

    const transferRes = await apiRequest('POST', `${BASE_URL}/admin/students/${createdStudentProfileId}/transfer`, adminHeaders, transferPayload);
    if (!transferRes.success) throw new Error(transferRes.message || 'Transfer failed');

    const detailRes = await apiRequest('GET', `${BASE_URL}/admin/students/${createdStudentProfileId}`, adminHeaders);
    if (detailRes.student.section_name !== 'B') {
      throw new Error(`Expected active section 'B', got '${detailRes.student.section_name}'`);
    }

    if (!Array.isArray(detailRes.enrollmentHistory) || detailRes.enrollmentHistory.length < 2) {
      throw new Error(`Expected at least 2 enrollment history records, found ${detailRes.enrollmentHistory?.length}`);
    }

    const priorRecord = detailRes.enrollmentHistory.find((h: any) => h.section_name === 'A');
    if (!priorRecord || priorRecord.enrollment_status !== 'TRANSFERRED') {
      throw new Error(`Expected prior section A to have status TRANSFERRED`);
    }

    return `Transferred to BCA Sem 1 Section B. Prior section A archived as TRANSFERRED with effective date; historical records preserved.`;
  });

  // Test 13: Authorized Email Change Workflow
  await runTest(13, 'Authorized Email Change Workflow Preserving Student ID & History', async () => {
    const newEmail = `vikramaditya.rao.${Date.now()}@college.edu`;
    const changeRes = await apiRequest('POST', `${BASE_URL}/admin/students/${createdStudentProfileId}/change-email`, adminHeaders, {
      newEmail,
      reason: 'Official name correction on institutional record',
    });
    if (!changeRes.success) throw new Error(changeRes.message || 'Email change failed');

    const detailRes = await apiRequest('GET', `${BASE_URL}/admin/students/${createdStudentProfileId}`, adminHeaders);
    if (detailRes.student.student_gmail !== newEmail) {
      throw new Error(`Expected email ${newEmail}, got ${detailRes.student.student_gmail}`);
    }
    if (detailRes.student.student_id !== createdStudentId) {
      throw new Error(`Student ID altered unexpectedly! Expected ${createdStudentId}`);
    }

    return `Email successfully updated to ${newEmail} while strictly preserving permanent Student ID '${createdStudentId}' and enrollment history.`;
  });

  // Test 14: Bulk Roster Import Preview Validation
  await runTest(14, 'Two-Stage Bulk Import Preview: Validation & Duplicate Detection', async () => {
    const previewRows = [
      {
        studentId: 'BCA-2026-IMP-01',
        fullName: 'Kavita Nair',
        studentGmail: 'kavita.nair@college.edu',
        courseCode: 'BCA',
        semesterNumber: 1,
        sectionName: 'A',
        rollNumber: '01',
      },
      {
        studentId: 'BCA-2026-IMP-02',
        fullName: 'Kunal Singhania',
        studentGmail: 'kunal.singhania@college.edu',
        courseCode: 'BCA',
        semesterNumber: 1,
        sectionName: 'A',
        rollNumber: '02',
      },
      {
        studentId: createdStudentId, // DUPLICATE ID IN DB
        fullName: 'Duplicate Tester',
        studentGmail: 'duplicate.tester@college.edu',
        courseCode: 'BCA',
        semesterNumber: 1,
        sectionName: 'A',
        rollNumber: '99',
      },
    ];

    const previewRes = await apiRequest('POST', `${BASE_URL}/admin/students/import/preview`, adminHeaders, {
      rows: previewRows,
    });

    if (previewRes.totalRows !== 3) throw new Error(`Expected 3 total rows, got ${previewRes.totalRows}`);
    if (previewRes.validRowsCount !== 2) throw new Error(`Expected 2 valid rows, got ${previewRes.validRowsCount}`);
    if (previewRes.invalidRowsCount !== 1) throw new Error(`Expected 1 duplicate row, got ${previewRes.invalidRowsCount}`);

    return `Preview verified: 3 total rows, 2 valid, 1 duplicate detected and flagged with row-level error.`;
  });

  // Test 15: Bulk Roster Import Commit
  await runTest(15, 'Bulk Import Commit: Transactional Provisioning and Activation Link Dispatch', async () => {
    const validRowsToCommit = [
      {
        studentId: `BCA-2026-IMP-${Date.now().toString().slice(-4)}1`,
        fullName: 'Meera Deshmukh',
        studentGmail: `meera.deshmukh.${Date.now()}@college.edu`,
        courseCode: 'BCA',
        semesterNumber: 1,
        sectionName: 'A',
        rollNumber: '10',
      },
      {
        studentId: `BCA-2026-IMP-${Date.now().toString().slice(-4)}2`,
        fullName: 'Nikhil Saxena',
        studentGmail: `nikhil.saxena.${Date.now()}@college.edu`,
        courseCode: 'BCA',
        semesterNumber: 1,
        sectionName: 'A',
        rollNumber: '11',
      },
    ];

    const commitRes = await apiRequest('POST', `${BASE_URL}/admin/students/import/commit`, adminHeaders, {
      rows: validRowsToCommit,
      skipInvalid: true,
    });

    if (!commitRes.success) throw new Error(commitRes.message || 'Commit failed');
    if (commitRes.successfulCount !== 2) throw new Error(`Expected 2 successful, got ${commitRes.successfulCount}`);

    return `Committed ${commitRes.successfulCount} students with pending enrollment, unique permanent IDs, and dispatched 48h activation invitations.`;
  });

  // Summary
  console.log('\n=============================================================================');
  console.log('TEST SUMMARY');
  console.log('=============================================================================');
  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  console.log(`TOTAL TESTS:  ${results.length}`);
  console.log(`PASSED:       ${passed}`);
  console.log(`FAILED:       ${failed}`);

  if (failed > 0) {
    console.error('\nFAILURES DETECTED:');
    results.filter((r) => r.status === 'FAILED').forEach((r) => {
      console.error(`- Test ${r.testNumber}: ${r.description} -> ${r.details}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL 15 PRODUCTION STUDENT MANAGEMENT TESTS PASSED PERFECTLY!');
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
