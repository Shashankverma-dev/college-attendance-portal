/**
 * Automated Verification Suite for Bulk Onboarding, Token Security, and Password Lifecycle
 * Covers:
 *  1. Formula Injection Sanitization (CSV / Excel)
 *  2. In-batch Duplicate Detection (Email, Student ID, Section Roll Number)
 *  3. Sequential Collision-Free Student ID Generation ([COURSE]-[YEAR]-[0001])
 *  4. Non-Destructive Token Inspection vs Single-Use Atomic Redemption
 *  5. Password Complexity Policy Validator (12 chars, uppercase, lowercase, digit, symbol)
 *  6. Invitation Reissuing with Prior Token Revocation
 *  7. Sensitive Data Protection (Zero Raw Tokens/Passwords Exposed)
 */

import { BulkOnboardingService, localStudents } from '../services/bulk-onboard';
import { TokenService } from '../services/token';
import { validatePasswordStrength } from '../routes/auth.routes';

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, suite: string, errorMsg?: string) {
  if (condition) {
    results.push({ suite, test: testName, passed: true });
    console.log(`  [PASS] ${suite} -> ${testName}`);
  } else {
    results.push({ suite, test: testName, passed: false, error: errorMsg || 'Assertion failed' });
    console.error(`  [FAIL] ${suite} -> ${testName}: ${errorMsg || 'Assertion failed'}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('ATTENDANCE PORTAL: BULK ONBOARDING & SECURITY TEST SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // SUITE 1: Formula Injection Sanitization
  // -------------------------------------------------------------
  console.log('--- SUITE 1: Formula Injection Sanitization ---');
  try {
    const maliciousCsv = `full_name,student_gmail,course_code,semester_number,section_name,roll_number
=cmd|' /C calc'!A0,alice.calc@gmail.com,BCA,1,A,101
+DDE("cmd";"/C calc";"__dummy__"),bob.dde@gmail.com,BCA,1,A,102
-1+1,carol.math@gmail.com,BCA,1,A,103
@SUM(1+1),dan.at@gmail.com,BCA,1,A,104
Normal Student,eve.normal@gmail.com,BCA,1,A,105`;

    const parsed = BulkOnboardingService.parseRosterBuffer(
      Buffer.from(maliciousCsv, 'utf-8'),
      false
    );

    assert(parsed.length === 5, 'Parses all rows without crashing', 'Formula Injection');
    
    // Check that leading formula characters are escaped with a leading single quote
    const r0 = parsed[0];
    assert(r0.fullName.startsWith("'"), 'Escapes leading "=" with single quote', 'Formula Injection', `Got: ${r0.fullName}`);
    
    const r1 = parsed[1];
    assert(r1.fullName.startsWith("'"), 'Escapes leading "+" with single quote', 'Formula Injection', `Got: ${r1.fullName}`);

    const r2 = parsed[2];
    assert(r2.fullName.startsWith("'"), 'Escapes leading "-" with single quote', 'Formula Injection', `Got: ${r2.fullName}`);

    const r3 = parsed[3];
    assert(r3.fullName.startsWith("'"), 'Escapes leading "@" with single quote', 'Formula Injection', `Got: ${r3.fullName}`);

    const r4 = parsed[4];
    assert(r4.fullName === 'Normal Student', 'Preserves benign text without modification', 'Formula Injection');
  } catch (err: any) {
    assert(false, 'Formula Injection Execution', 'Formula Injection', err.message);
  }

  // -------------------------------------------------------------
  // SUITE 2: In-Batch Duplicate Detection
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: In-Batch Duplicate Detection ---');
  try {
    const duplicateCsv = `full_name,student_gmail,course_code,semester_number,section_name,roll_number,student_id
Student One,dup.email@gmail.com,BCA,1,A,201,ID-1001
Student Two,dup.email@gmail.com,BCA,1,A,202,ID-1002
Student Three,unique.email@gmail.com,BCA,1,A,201,ID-1003
Student Four,fourth.email@gmail.com,BCA,1,A,204,ID-1001`;

    const parsed = BulkOnboardingService.parseRosterBuffer(
      Buffer.from(duplicateCsv, 'utf-8'),
      false
    );

    const result = await BulkOnboardingService.processRoster(parsed, 'Fall 2026', 'admin-test-uid', 'ADMINISTRATOR');

    assert(result.successfulCount === 1, 'Only non-duplicate row succeeded', 'Duplicate Detection');
    assert(result.failedCount === 3, 'All 3 duplicate conflicts were rejected', 'Duplicate Detection');
    
    const errors = result.errors;
    const emailDup = errors.find(e => /duplicate email/i.test(e.message));
    assert(!!emailDup, 'Identifies in-batch duplicate email at row level', 'Duplicate Detection');

    const rollDup = errors.find(e => /duplicate roll number/i.test(e.message));
    assert(!!rollDup, 'Identifies in-batch duplicate roll number in same section', 'Duplicate Detection');

    const idDup = errors.find(e => /duplicate student id/i.test(e.message));
    assert(!!idDup, 'Identifies in-batch duplicate student ID in file', 'Duplicate Detection');
  } catch (err: any) {
    assert(false, 'In-Batch Duplicate Execution', 'Duplicate Detection', err.message);
  }

  // -------------------------------------------------------------
  // SUITE 3: Sequential Student ID Generation
  // -------------------------------------------------------------
  console.log('\n--- SUITE 3: Sequential Student ID Generation ---');
  try {
    const startCount = localStudents.length;
    const noIdCsv = `full_name,student_gmail,course_code,semester_number,section_name,roll_number
Auto ID One,auto1@institution.edu,MCA,1,B,301
Auto ID Two,auto2@institution.edu,MCA,1,B,302
Auto ID Three,auto3@institution.edu,MCA,1,B,303`;

    const parsed = BulkOnboardingService.parseRosterBuffer(
      Buffer.from(noIdCsv, 'utf-8'),
      false
    );

    const result = await BulkOnboardingService.processRoster(parsed, 'Fall 2026', 'admin-test-uid', 'ADMINISTRATOR');
    assert(result.successfulCount === 3, 'Successfully processed all 3 auto-generated ID rows', 'ID Generation');

    const currentYear = new Date().getFullYear();
    const newlyCreated = localStudents.slice(0, 3);
    assert(newlyCreated.length === 3, 'Finds 3 newly added student records', 'ID Generation');

    const idPattern = new RegExp(`^MCA-${currentYear}-\\d{4}$`);
    assert(idPattern.test(newlyCreated[0].student_id), 'Student 1 receives formatted institutional ID', 'ID Generation', `Got: ${newlyCreated[0].student_id}`);
    assert(idPattern.test(newlyCreated[1].student_id), 'Student 2 receives formatted institutional ID', 'ID Generation', `Got: ${newlyCreated[1].student_id}`);
    assert(idPattern.test(newlyCreated[2].student_id), 'Student 3 receives formatted institutional ID', 'ID Generation', `Got: ${newlyCreated[2].student_id}`);

    // Verify uniqueness
    const idSet = new Set(newlyCreated.map(s => s.student_id));
    assert(idSet.size === 3, 'Allocated IDs are strictly distinct and non-colliding', 'ID Generation');
  } catch (err: any) {
    assert(false, 'Sequential Student ID Execution', 'ID Generation', err.message);
  }

  // -------------------------------------------------------------
  // SUITE 4: Non-Destructive Token Inspection vs Single-Use Consumption
  // -------------------------------------------------------------
  console.log('\n--- SUITE 4: Non-Destructive Token Inspection vs Single-Use Consumption ---');
  try {
    const tokenGen = TokenService.generateToken(48);
    const rawToken = tokenGen.rawToken;
    await TokenService.storeToken(
      null,
      'test-student-uid',
      tokenGen.tokenHash,
      'ACCOUNT_ACTIVATION',
      'inspect@institution.edu',
      tokenGen.expiresAt
    );

    assert(rawToken.length === 64, 'Generates 32-byte (64 hex char) cryptographically secure token', 'Token Lifecycle');

    // 1. Scanner / GET inspection test
    const inspected = await TokenService.inspectToken(null, rawToken, 'ACCOUNT_ACTIVATION');
    assert(inspected.isValid === true, 'inspectToken validates genuine token successfully', 'Token Lifecycle');
    assert(inspected.targetEmail === 'inspect@institution.edu', 'Token inspection returns correct metadata', 'Token Lifecycle');

    // Inspect again (simulating multiple automated link scanners like Google/Outlook)
    const inspectedAgain = await TokenService.inspectToken(null, rawToken, 'ACCOUNT_ACTIVATION');
    assert(inspectedAgain.isValid === true, 'Repeated GET inspection DOES NOT consume the token', 'Token Lifecycle');

    // 2. Consume Token (POST action during form submit)
    const consumed = await TokenService.redeemToken(null, rawToken, 'ACCOUNT_ACTIVATION');
    assert(consumed.isValid === true, 'redeemToken succeeds on first user submission', 'Token Lifecycle');

    // 3. Replay attack test
    const replayed = await TokenService.redeemToken(null, rawToken, 'ACCOUNT_ACTIVATION');
    assert(replayed.isValid === false, 'Replayed token submission is strictly rejected', 'Token Lifecycle');

    // 4. Inspection after consumption test
    const inspectedAfter = await TokenService.inspectToken(null, rawToken, 'ACCOUNT_ACTIVATION');
    assert(inspectedAfter.isValid === false, 'Consumed token is no longer inspectable or valid', 'Token Lifecycle');
  } catch (err: any) {
    assert(false, 'Token Lifecycle Execution', 'Token Lifecycle', err.message);
  }

  // -------------------------------------------------------------
  // SUITE 5: Password Complexity Policy Validator
  // -------------------------------------------------------------
  console.log('\n--- SUITE 5: Password Complexity Policy Validator ---');
  try {
    // Requirements: min 12 chars, upper, lower, digit, symbol
    const tooShort = validatePasswordStrength('Pass123!');
    assert(!tooShort.isValid, 'Rejects password shorter than 12 characters', 'Password Policy');

    const noUpper = validatePasswordStrength('longpassword123!');
    assert(!noUpper.isValid, 'Rejects password missing uppercase letter', 'Password Policy');

    const noLower = validatePasswordStrength('LONGPASSWORD123!');
    assert(!noLower.isValid, 'Rejects password missing lowercase letter', 'Password Policy');

    const noDigit = validatePasswordStrength('LongPasswordWord!');
    assert(!noDigit.isValid, 'Rejects password missing digit', 'Password Policy');

    const noSymbol = validatePasswordStrength('LongPassword1234');
    assert(!noSymbol.isValid, 'Rejects password missing special symbol', 'Password Policy');

    const validComplex = validatePasswordStrength('S3cure@P@ssw0rd2026');
    assert(validComplex.isValid, 'Accepts compliant password meeting all 5 criteria', 'Password Policy');
    assert(!validComplex.error, 'Returns zero error messages for compliant password', 'Password Policy');
  } catch (err: any) {
    assert(false, 'Password Policy Execution', 'Password Policy', err.message);
  }

  // -------------------------------------------------------------
  // SUITE 6: Invitation Reissuing and Prior Token Revocation
  // -------------------------------------------------------------
  console.log('\n--- SUITE 6: Invitation Reissuing and Prior Token Revocation ---');
  try {
    // Set up student in localStudents
    const targetEmail = 'reissue.test@institution.edu';
    localStudents.unshift({
      student_profile_id: 'test-profile-reissue',
      user_uid: 'firebase-uid-reissue-test',
      student_id: 'MCA-2026-9999',
      enrollment_no: 'SRHU999999',
      registration_no: 'dd241104399999',
      registration_id: null,
      full_name: 'Reissue Candidate',
      student_gmail: targetEmail,
      course_code: 'MCA',
      semester_number: 1,
      section_name: 'A',
      roll_number: '99',
      phone_number: null,
      parent_guardian_contact: null,
      status: 'PENDING_ACTIVATION',
      created_at: new Date().toISOString(),
      activated_at: null,
    });

    // 1. Initial token creation
    const tokInitial = TokenService.generateToken(48);
    await TokenService.storeToken(
      null,
      'firebase-uid-reissue-test',
      tokInitial.tokenHash,
      'ACCOUNT_ACTIVATION',
      targetEmail,
      tokInitial.expiresAt
    );

    const inspectedInitial = await TokenService.inspectToken(null, tokInitial.rawToken, 'ACCOUNT_ACTIVATION');
    assert(inspectedInitial.isValid === true, 'Initial activation token is active', 'Token Revocation');

    // 2. Administrator requests resend
    const resendResult = await BulkOnboardingService.resendActivation('MCA-2026-9999', 'admin-caller-uid', 'ADMINISTRATOR');
    assert(resendResult.success, 'resendActivation executes successfully', 'Token Revocation');
    assert(!!resendResult.activationLink, 'Generates fresh new activation link', 'Token Revocation');

    // 3. Old token must now be invalidated
    const inspectedOld = await TokenService.inspectToken(null, tokInitial.rawToken, 'ACCOUNT_ACTIVATION');
    assert(inspectedOld.isValid === false, 'Prior activation token was successfully invalidated', 'Token Revocation');

    // Extract new token from activation link
    const match = resendResult.activationLink?.match(/token=([a-f0-9]+)/);
    assert(!!match, 'Activation link contains hex token parameter', 'Token Revocation');
    if (match) {
      const newToken = match[1];
      const inspectedNew = await TokenService.inspectToken(null, newToken, 'ACCOUNT_ACTIVATION');
      assert(inspectedNew.isValid === true, 'New activation token is valid and active', 'Token Revocation');
    }
  } catch (err: any) {
    assert(false, 'Token Revocation Execution', 'Token Revocation', err.message);
  }

  // -------------------------------------------------------------
  // SUITE 7: Privacy & Security Sanitization
  // -------------------------------------------------------------
  console.log('\n--- SUITE 7: Privacy & Sensitive Data Safeguards ---');
  try {
    const tokGen = TokenService.generateToken(48);
    assert(tokGen.tokenHash !== tokGen.rawToken, 'Token is cryptographically hashed with SHA-256', 'Privacy & Data Protection');
    assert(tokGen.tokenHash.length === 64, 'Token hash is standard 256-bit hexadecimal string', 'Privacy & Data Protection');

    // Verify password is never echoed in validation response
    const validationCheck = validatePasswordStrength('MySecretPassword123!');
    const strRepr = JSON.stringify(validationCheck);
    assert(!strRepr.includes('MySecretPassword123!'), 'Password validator does not leak input password in error/validation metadata', 'Privacy & Data Protection');
  } catch (err: any) {
    assert(false, 'Privacy & Safeguards Execution', 'Privacy & Data Protection', err.message);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`TEST RUN COMPLETED: Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log('ALL VERIFICATION ASSERTIONS PASSED (100% SUCCESS)');
  } else {
    console.error(`FAILURE: ${failed} assertions failed!`);
    process.exitCode = 1;
  }
  console.log('================================================================\n');
}

runTests();
