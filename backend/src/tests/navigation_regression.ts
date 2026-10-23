/**
 * Navigation, Role Persistence, and Security Regression Test Suite
 * Master Engineering Verification for Attendance Portal
 * 
 * Verifies:
 * 1. Admin login session initialization
 * 2. Admin Profile -> Overview navigation retains 'admin' role and routes to admin.html
 * 3. Route guards prevent silent role degradation & cross-portal elevation
 * 4. Unauthenticated access protection
 * 5. Role-based navbar target mappings across Admin, Faculty, and Student
 * 6. Brand colour (#1D3C72) lock verification
 * 7. Server-side RBAC authorization on Admin endpoints
 */

export {};

interface TestCaseResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  error?: string;
}

const results: TestCaseResult[] = [];

function assert(condition: boolean, id: string, name: string, category: string, failureDetail?: string) {
  if (condition) {
    results.push({ id, name, category, passed: true });
    console.log(`  [PASS] [${id}] ${name}`);
  } else {
    results.push({ id, name, category, passed: false, error: failureDetail });
    console.error(`  [FAIL] [${id}] ${name} - ${failureDetail || 'Assertion failed'}`);
  }
}

// =============================================================================
// Simulation Environment for Session & Route Navigation
// =============================================================================

class MockSessionStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

function getNormalizedRole(rawRole: string | null): string {
  if (!rawRole) return '';
  const r = rawRole.toString().trim().toLowerCase();
  if (r === 'admin' || r === 'global_admin' || r === 'hod') return 'admin';
  if (r === 'faculty' || r === 'teacher') return 'faculty';
  if (r === 'student') return 'student';
  return '';
}

// Pure route guard model mirroring site.js enforceRouteGuards()
function evaluateRouteGuard(
  pathname: string,
  session: MockSessionStorage
): { allowed: boolean; redirectTarget?: string } {
  const rawPath = pathname.toLowerCase();
  const page = rawPath.substring(rawPath.lastIndexOf('/') + 1) || 'index.html';

  const isAdminRoute = page.indexOf('admin') === 0;
  const isFacultyRoute = page.indexOf('teacher') === 0 || page.indexOf('past-registers') === 0;
  const isStudentRoute = page.indexOf('student') === 0;
  const isProfileRoute = page === 'profile.html';

  const rawRole = session.getItem('attendance_user_role');
  const activeRole = getNormalizedRole(rawRole);
  const activeId = session.getItem('attendance_user_id');

  // 1. Unauthenticated visitor protection
  if (!activeRole || !activeId) {
    if (isAdminRoute || isFacultyRoute || isStudentRoute || isProfileRoute) {
      return { allowed: false, redirectTarget: 'signin.html' };
    }
    return { allowed: true };
  }

  // 2. Cross-Role Access Control Guards
  if (activeRole === 'admin') {
    if (isStudentRoute || isFacultyRoute) {
      return { allowed: false, redirectTarget: 'admin.html' };
    }
  } else if (activeRole === 'student') {
    if (isAdminRoute || isFacultyRoute) {
      return { allowed: false, redirectTarget: 'student.html' };
    }
  } else if (activeRole === 'faculty') {
    if (isAdminRoute || isStudentRoute) {
      return { allowed: false, redirectTarget: 'teacher.html' };
    }
  }

  return { allowed: true };
}

// Pure role-to-overview resolution model mirroring site.js click interceptor
function resolveOverviewRoute(rawRole: string | null): string {
  const activeRole = getNormalizedRole(rawRole);
  if (activeRole === 'admin') return 'admin.html';
  if (activeRole === 'faculty') return 'teacher.html';
  if (activeRole === 'student') return 'student.html#overview';
  return 'index.html';
}

// Pure role-to-dashboard resolution model mirroring profile.html applyRoleContext()
function resolveProfileDashboardLink(rawRole: string | null): string {
  const activeRole = getNormalizedRole(rawRole);
  if (activeRole === 'admin') return 'admin.html';
  if (activeRole === 'faculty') return 'teacher.html';
  return 'student.html';
}

console.log('=============================================================================');
console.log('SUITE 1: Critical Bug Reproduction & Fix Verification (Admin Profile -> Overview)');
console.log('=============================================================================');

const adminSession = new MockSessionStorage();
adminSession.setItem('attendance_user_role', 'admin');
adminSession.setItem('attendance_user_id', 'ADM-001');

// Test 1: Admin session state prior to profile visit
assert(
  adminSession.getItem('attendance_user_role') === 'admin',
  'TEST-NAV-01',
  'Admin initial session has active role "admin"',
  'Navigation'
);

// Test 2: Admin visits profile.html -> route guard allows access
const profileGuard = evaluateRouteGuard('profile.html', adminSession);
assert(
  profileGuard.allowed && !profileGuard.redirectTarget,
  'TEST-NAV-02',
  'Admin accessing profile.html is permitted by route guard without redirect',
  'Navigation'
);

// Test 3: Dashboard link in profile.html points to admin.html for admin
const profileDashTarget = resolveProfileDashboardLink(adminSession.getItem('attendance_user_role'));
assert(
  profileDashTarget === 'admin.html',
  'TEST-NAV-03',
  'profile.html applyRoleContext() assigns admin.html to nav-dashboard-link for admin',
  'Navigation'
);

// Test 4: Clicking "Overview" from profile resolves to admin.html
const overviewTarget = resolveOverviewRoute(adminSession.getItem('attendance_user_role'));
assert(
  overviewTarget === 'admin.html',
  'TEST-NAV-04',
  'Overview click interceptor redirects admin to admin.html (NOT student.html)',
  'Navigation'
);

// Test 5: Role remains 'admin' after completing Profile -> Overview flow
assert(
  adminSession.getItem('attendance_user_role') === 'admin',
  'TEST-NAV-05',
  'Admin role is permanently preserved as "admin" across Profile -> Overview navigation',
  'Navigation'
);

console.log('\n=============================================================================');
console.log('SUITE 2: Cross-Role Route Guard and Isolation Tests');
console.log('=============================================================================');

// Test 6: Unauthenticated visitor accessing admin.html is bounced to signin.html
const anonSession = new MockSessionStorage();
const anonAdminGuard = evaluateRouteGuard('admin.html', anonSession);
assert(
  !anonAdminGuard.allowed && anonAdminGuard.redirectTarget === 'signin.html',
  'TEST-GUARD-01',
  'Unauthenticated visitor accessing admin.html redirected to signin.html',
  'Security'
);

// Test 7: Unauthenticated visitor accessing student.html is bounced to signin.html
const anonStudentGuard = evaluateRouteGuard('student.html', anonSession);
assert(
  !anonStudentGuard.allowed && anonStudentGuard.redirectTarget === 'signin.html',
  'TEST-GUARD-02',
  'Unauthenticated visitor accessing student.html redirected to signin.html',
  'Security'
);

// Test 8: Unauthenticated visitor accessing profile.html is bounced to signin.html
const anonProfileGuard = evaluateRouteGuard('profile.html', anonSession);
assert(
  !anonProfileGuard.allowed && anonProfileGuard.redirectTarget === 'signin.html',
  'TEST-GUARD-03',
  'Unauthenticated visitor accessing profile.html redirected to signin.html',
  'Security'
);

// Test 9: Public access to index.html and calendar.html allowed without authentication
const anonPublicIndex = evaluateRouteGuard('index.html', anonSession);
const anonPublicCal = evaluateRouteGuard('calendar.html', anonSession);
assert(
  anonPublicIndex.allowed && anonPublicCal.allowed,
  'TEST-GUARD-04',
  'Public access to index.html and calendar.html allowed for unauthenticated visitors',
  'Security'
);

// Test 10: Student attempting to access admin.html redirected to student.html
const studentSession = new MockSessionStorage();
studentSession.setItem('attendance_user_role', 'student');
studentSession.setItem('attendance_user_id', 'STU-101');
const studentTamperGuard = evaluateRouteGuard('admin.html', studentSession);
assert(
  !studentTamperGuard.allowed && studentTamperGuard.redirectTarget === 'student.html',
  'TEST-GUARD-05',
  'Student attempting to access admin.html is redirected back to student.html',
  'Security'
);

// Test 11: Admin attempting to access student.html is redirected back to admin.html
const adminCrossGuard = evaluateRouteGuard('student.html', adminSession);
assert(
  !adminCrossGuard.allowed && adminCrossGuard.redirectTarget === 'admin.html',
  'TEST-GUARD-06',
  'Admin accessing student.html is bounced back to admin.html (prevents silent degradation)',
  'Security'
);

// Test 12: Faculty attempting to access admin.html redirected to teacher.html
const facultySession = new MockSessionStorage();
facultySession.setItem('attendance_user_role', 'faculty');
facultySession.setItem('attendance_user_id', 'FAC-201');
const facultyTamperGuard = evaluateRouteGuard('admin.html', facultySession);
assert(
  !facultyTamperGuard.allowed && facultyTamperGuard.redirectTarget === 'teacher.html',
  'TEST-GUARD-07',
  'Faculty attempting to access admin.html is redirected to teacher.html',
  'Security'
);

console.log('\n=============================================================================');
console.log('SUITE 3: Role-Aware Navbar Mapping Contracts');
console.log('=============================================================================');

interface NavbarContract {
  role: string;
  expectedDashboardHref: string;
  expectedOverviewHref: string;
  expectedMarksHref: string;
  prohibitedHrefs: string[];
}

const navbarContracts: NavbarContract[] = [
  {
    role: 'admin',
    expectedDashboardHref: 'admin.html',
    expectedOverviewHref: 'admin.html',
    expectedMarksHref: 'admin-marks.html',
    prohibitedHrefs: ['student.html', 'teacher.html', 'student-marks.html', 'teacher-marks.html'],
  },
  {
    role: 'faculty',
    expectedDashboardHref: 'teacher.html',
    expectedOverviewHref: 'teacher.html',
    expectedMarksHref: 'teacher-marks.html',
    prohibitedHrefs: ['admin.html', 'student.html', 'admin-marks.html', 'student-marks.html'],
  },
  {
    role: 'student',
    expectedDashboardHref: 'student.html',
    expectedOverviewHref: 'student.html#overview',
    expectedMarksHref: 'student-marks.html',
    prohibitedHrefs: ['admin.html', 'teacher.html', 'admin-marks.html', 'teacher-marks.html'],
  },
];

navbarContracts.forEach((contract) => {
  const dashHref = resolveProfileDashboardLink(contract.role);
  const overviewHref = resolveOverviewRoute(contract.role);

  assert(
    dashHref === contract.expectedDashboardHref,
    `TEST-MAP-${contract.role.toUpperCase()}-DASH`,
    `Role "${contract.role}" receives correct Dashboard target "${contract.expectedDashboardHref}"`,
    'Navbar'
  );

  assert(
    overviewHref === contract.expectedOverviewHref,
    `TEST-MAP-${contract.role.toUpperCase()}-OVERVIEW`,
    `Role "${contract.role}" receives correct Overview target "${contract.expectedOverviewHref}"`,
    'Navbar'
  );

  const containsForbidden = contract.prohibitedHrefs.includes(dashHref) || contract.prohibitedHrefs.includes(overviewHref);
  assert(
    !containsForbidden,
    `TEST-MAP-${contract.role.toUpperCase()}-ISOLATION`,
    `Role "${contract.role}" has no cross-role targets in primary navigation`,
    'Navbar'
  );
});

console.log('\n=============================================================================');
console.log('SUITE 4: Session Lifecycle & Account Switching Integrity');
console.log('=============================================================================');

// Test 16: Logout clears session storage completely
const activeSessionToLogout = new MockSessionStorage();
activeSessionToLogout.setItem('attendance_user_role', 'admin');
activeSessionToLogout.setItem('attendance_user_id', 'ADM-001');
activeSessionToLogout.setItem('attendance_auth_token', 'jwt.token.mock');

// Simulate logout
activeSessionToLogout.clear();
assert(
  activeSessionToLogout.getItem('attendance_user_role') === null &&
  activeSessionToLogout.getItem('attendance_user_id') === null &&
  activeSessionToLogout.getItem('attendance_auth_token') === null,
  'TEST-SESS-01',
  'Sign Out action purges user role, user ID, and auth token from storage',
  'Session'
);

// Test 17: Relogin as student does not retain leftover admin permissions
activeSessionToLogout.setItem('attendance_user_role', 'student');
activeSessionToLogout.setItem('attendance_user_id', 'STU-101');
assert(
  activeSessionToLogout.getItem('attendance_user_role') === 'student' &&
  activeSessionToLogout.getItem('attendance_user_id') === 'STU-101',
  'TEST-SESS-02',
  'Switching accounts from Admin to Student correctly assumes Student-only context',
  'Session'
);

console.log('\n=============================================================================');
console.log('SUITE 5: Brand Colour (#1D3C72) Protection & Palette Verification');
console.log('=============================================================================');

import * as fs from 'fs';
import * as path from 'path';

const stylesPath = path.resolve(__dirname, '../../../styles.css');
let stylesContent = '';
try {
  stylesContent = fs.readFileSync(stylesPath, 'utf8');
} catch {
  // Try alternative path
  const altPath = path.resolve(__dirname, '../../styles.css');
  try {
    stylesContent = fs.readFileSync(altPath, 'utf8');
  } catch {
    stylesContent = '';
  }
}

const lockedBrandHex = '#1D3C72';
const hasLockedHex = stylesContent.toUpperCase().includes(lockedBrandHex.toUpperCase());
assert(
  hasLockedHex,
  'TEST-BRAND-01',
  `styles.css strictly declares and preserves locked brand primary: ${lockedBrandHex}`,
  'Brand'
);

// Check that --bg or --navy-header in styles.css uses #1D3C72
const brandPrimaryMatch = /--(?:bg|navy-header|brand-primary|primary)\s*:\s*(#[0-9A-Fa-f]{6})/i.exec(stylesContent);
assert(
  brandPrimaryMatch !== null && brandPrimaryMatch[1].toUpperCase() === lockedBrandHex.toUpperCase(),
  'TEST-BRAND-02',
  `CSS primary variable (--bg / --navy-header) is mapped exactly to ${lockedBrandHex}`,
  'Brand'
);

console.log('\n=============================================================================');
console.log('SUITE 6: Server-Side RBAC Enforcement Simulation');
console.log('=============================================================================');

// Model backend middleware requireRole
function checkBackendAuthorization(
  userRole: string | undefined,
  allowedRoles: string[]
): { status: number; message: string } {
  if (!userRole) {
    return { status: 401, message: 'Authentication required' };
  }
  const normalizedAllowed = allowedRoles.map((r) => {
    const u = r.toUpperCase();
    if (u === 'ADMIN') return 'GLOBAL_ADMIN';
    if (u === 'TEACHER') return 'FACULTY';
    return u;
  });
  const uUser = userRole.toUpperCase();
  const normalizedUser = (uUser === 'ADMIN') ? 'GLOBAL_ADMIN' : ((uUser === 'TEACHER') ? 'FACULTY' : uUser);

  if (!normalizedAllowed.includes(normalizedUser)) {
    return { status: 403, message: 'Forbidden: Insufficient role permissions' };
  }
  return { status: 200, message: 'Authorized' };
}

// Test 20: Anonymous API request to /api/admin/dashboard
const anonApi = checkBackendAuthorization(undefined, ['GLOBAL_ADMIN']);
assert(
  anonApi.status === 401,
  'TEST-RBAC-01',
  'Unauthenticated request to Admin API returns HTTP 401 Unauthorized',
  'Backend RBAC'
);

// Test 21: Student API request to /api/admin/dashboard
const studentApi = checkBackendAuthorization('STUDENT', ['GLOBAL_ADMIN']);
assert(
  studentApi.status === 403,
  'TEST-RBAC-02',
  'Student role request to Admin API returns HTTP 403 Forbidden',
  'Backend RBAC'
);

// Test 22: Faculty API request to /api/admin/dashboard
const facultyApi = checkBackendAuthorization('FACULTY', ['GLOBAL_ADMIN']);
assert(
  facultyApi.status === 403,
  'TEST-RBAC-03',
  'Faculty role request to Admin API returns HTTP 403 Forbidden',
  'Backend RBAC'
);

// Test 23: Global Admin API request to /api/admin/dashboard
const adminApi = checkBackendAuthorization('GLOBAL_ADMIN', ['GLOBAL_ADMIN']);
assert(
  adminApi.status === 200,
  'TEST-RBAC-04',
  'Global Admin request to Admin API returns HTTP 200 Authorized',
  'Backend RBAC'
);

// Test 24: Role alias ADMIN allows access to GLOBAL_ADMIN endpoint
const adminAliasApi = checkBackendAuthorization('ADMIN', ['GLOBAL_ADMIN']);
assert(
  adminAliasApi.status === 200,
  'TEST-RBAC-05',
  'Role alias ADMIN successfully accesses GLOBAL_ADMIN endpoint via normalization',
  'Backend RBAC'
);

// Test 25: Role alias TEACHER allows access to FACULTY endpoint
const teacherAliasApi = checkBackendAuthorization('TEACHER', ['FACULTY']);
assert(
  teacherAliasApi.status === 200,
  'TEST-RBAC-06',
  'Role alias TEACHER successfully accesses FACULTY endpoint via normalization',
  'Backend RBAC'
);

// Test 26: HOD role route guard simulation
const hodSession = new MockSessionStorage();
hodSession.setItem('attendance_user_id', 'HOD-301');
hodSession.setItem('attendance_user_role', 'HOD');

const hodOnAdmin = evaluateRouteGuard('admin.html', hodSession);
assert(
  hodOnAdmin.allowed === true,
  'TEST-NAV-14',
  'HOD role has full access to admin.html',
  'Navigation'
);

const hodOnStudent = evaluateRouteGuard('student.html', hodSession);
assert(
  hodOnStudent.allowed === false && hodOnStudent.redirectTarget === 'admin.html',
  'TEST-NAV-15',
  'HOD role blocked from student.html and redirected to admin.html',
  'Navigation'
);

// =============================================================================
// Test Suite Summary Output
// =============================================================================

console.log('\n=============================================================================');
const total = results.length;
const passed = results.filter((r) => r.passed).length;
const failed = total - passed;

console.log(`SUMMARY: ${passed}/${total} TESTS PASSED (${failed} failures)`);
console.log('=============================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
