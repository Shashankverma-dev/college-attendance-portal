import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../config/firebase';
import { pool, UserSecurityContext } from '../config/db';
import { TokenService } from '../services/token';
import { localStudents } from '../services/bulk-onboard';
import { localTeachers } from '../routes/admin.routes';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  role: 'STUDENT' | 'FACULTY' | 'HOD' | 'GLOBAL_ADMIN';
  sessionId: string;
  departmentId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      securityContext?: UserSecurityContext;
    }
  }
}

const IDLE_TIMEOUT_MINUTES = 15;

/**
 * Authentication & Session Integrity Middleware
 * Enforces Cryptographically Verified Portal Session / Firebase ID token validation
 * AND server-side per-device idle-timeout enforcement (15 minutes) via PostgreSQL user_sessions.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const sessionId = req.headers['x-session-id'] as string;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header.' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // 1. Verify authentic token (First verify HMAC portal session token, then verify Firebase ID token)
    let decodedToken: { uid: string; email?: string; role?: string; departmentId?: string | null };
    const sessionTokenPayload = TokenService.verifySessionToken(idToken);
    if (sessionTokenPayload) {
      decodedToken = sessionTokenPayload;
    } else {
      decodedToken = await firebaseAuth.verifyIdToken(idToken, true);
    }


    const uid = decodedToken.uid;
    const email = (decodedToken.email || '').toLowerCase();
    let role: 'STUDENT' | 'FACULTY' | 'HOD' | 'GLOBAL_ADMIN';
    let departmentId = (decodedToken.departmentId as string) || null;

    // Check trusted server-side user record if PostgreSQL is available
    let dbChecked = false;
    try {
      const userCheck = await pool.query(
        `SELECT role, status, department_id FROM users WHERE user_uid = $1 OR LOWER(email) = $2`,
        [uid, email]
      );
      if (userCheck.rowCount && userCheck.rowCount > 0) {
        dbChecked = true;
        const userRow = userCheck.rows[0];
        const userStatus = userRow.status;
        if (userStatus === 'INACTIVE' || userStatus === 'SUSPENDED') {
          res.status(403).json({
            error: 'ACCOUNT_DEACTIVATED',
            message: 'Your account has been deactivated or suspended by institutional administration.',
          });
          return;
        }

        const dbRole = (userRow.role || '').toString().trim().toUpperCase();
        if (dbRole === 'GLOBAL_ADMIN' || dbRole === 'ADMIN') {
          role = 'GLOBAL_ADMIN';
        } else if (dbRole === 'HOD') {
          role = 'HOD';
        } else if (dbRole === 'FACULTY' || dbRole === 'TEACHER') {
          role = 'FACULTY';
        } else {
          role = 'STUDENT';
        }
        if (userRow.department_id) {
          departmentId = userRow.department_id;
        }
      } else {
        // Fall back to cryptographically verified claims or directory email
        let rawRole = (decodedToken.role || '').toString().trim().toUpperCase();
        if (!rawRole && process.env.NODE_ENV !== 'production') {
          if (email === 'admin@college.edu' || email === 'shashankvermahsst@gmail.com' || email.includes('admin')) {
            rawRole = 'GLOBAL_ADMIN';
          } else if (localTeachers.some((t) => t.official_email.toLowerCase() === email)) {
            rawRole = 'FACULTY';
          }
        }
        rawRole = rawRole || 'STUDENT';
        if (rawRole === 'GLOBAL_ADMIN' || rawRole === 'ADMIN') {
          role = 'GLOBAL_ADMIN';
        } else if (rawRole === 'HOD') {
          role = 'HOD';
        } else if (rawRole === 'FACULTY' || rawRole === 'TEACHER') {
          role = 'FACULTY';
        } else {
          role = 'STUDENT';
        }
      }
    } catch (dbErr) {
      // Fail closed in production: database errors during auth must never grant access
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: 'AUTHORIZATION_SERVICE_UNAVAILABLE',
          message: 'Unable to verify account status with institutional directory.',
        });
        return;
      }

      // Development / Test mode fallback
      let rawRole = (decodedToken.role || '').toString().trim().toUpperCase();
      if (!rawRole && process.env.NODE_ENV !== 'production') {
        if (email === 'admin@college.edu' || email === 'shashankvermahsst@gmail.com' || email.includes('admin')) {
          rawRole = 'GLOBAL_ADMIN';
        } else if (localTeachers.some((t) => t.official_email.toLowerCase() === email)) {
          rawRole = 'FACULTY';
        }
      }
      rawRole = rawRole || 'STUDENT';
      if (rawRole === 'GLOBAL_ADMIN' || rawRole === 'ADMIN') {
        role = 'GLOBAL_ADMIN';
      } else if (rawRole === 'HOD') {
        role = 'HOD';
      } else if (rawRole === 'FACULTY' || rawRole === 'TEACHER') {
        role = 'FACULTY';
      } else {
        role = 'STUDENT';
      }
    }

    // In-memory student suspension check
    const inMemStudent = localStudents.find((s) => s.user_uid === uid || (email && s.student_gmail.toLowerCase() === email));
    if (inMemStudent && inMemStudent.status === 'SUSPENDED') {
      res.status(403).json({
        error: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deactivated or suspended by institutional administration.',
      });
      return;
    }

    // In-memory faculty deactivation/suspension check
    const inMemTeacher = localTeachers.find((t) => t.user_uid === uid || (email && t.official_email.toLowerCase() === email));
    if (inMemTeacher && (inMemTeacher.status === 'INACTIVE' || inMemTeacher.status === 'SUSPENDED')) {
      res.status(403).json({
        error: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deactivated or suspended by institutional administration.',
      });
      return;
    }

    // 2. Validate per-device session if X-Session-ID is present
    if (sessionId) {
      const sessionResult = await pool.query(
        `SELECT session_id, user_uid, last_activity_at, idle_expires_at, absolute_expires_at, revocation_status 
         FROM user_sessions 
         WHERE session_id = $1 AND user_uid = $2`,
        [sessionId, uid]
      );

      if (sessionResult.rowCount === 0) {
        res.status(401).json({ error: 'INVALID_SESSION', message: 'Device session not found or unrecognized.' });
        return;
      }

      const session = sessionResult.rows[0];

      if (session.revocation_status !== 'ACTIVE') {
        res.status(401).json({ 
          error: 'SESSION_REVOKED', 
          message: `Session has been revoked: ${session.revocation_status}` 
        });
        return;
      }

      const now = new Date();
      // Server-side idle expiration enforcement
      if (now > new Date(session.idle_expires_at)) {
        await pool.query(
          `UPDATE user_sessions 
           SET revocation_status = 'EXPIRED_IDLE', revocation_reason = '15-minute server-side inactivity timeout' 
           WHERE session_id = $1`,
          [sessionId]
        );
        res.status(401).json({ 
          error: 'SESSION_IDLE_TIMEOUT', 
          message: 'Your session has expired due to 15 minutes of inactivity. Please sign in again.' 
        });
        return;
      }

      // Check absolute session expiration (8 hours)
      if (now > new Date(session.absolute_expires_at)) {
        await pool.query(
          `UPDATE user_sessions 
           SET revocation_status = 'EXPIRED_ABSOLUTE', revocation_reason = '8-hour absolute session duration exceeded' 
           WHERE session_id = $1`,
          [sessionId]
        );
        res.status(401).json({ 
          error: 'SESSION_ABSOLUTE_TIMEOUT', 
          message: 'Maximum session duration exceeded. Please re-authenticate.' 
        });
        return;
      }

      // Throttled activity refresh (update at most once every 60 seconds to avoid write amplification)
      const lastActivity = new Date(session.last_activity_at).getTime();
      if (now.getTime() - lastActivity > 60000) {
        await pool.query(
          `UPDATE user_sessions 
           SET last_activity_at = NOW(), 
               idle_expires_at = NOW() + INTERVAL '${IDLE_TIMEOUT_MINUTES} minutes' 
           WHERE session_id = $1`,
          [sessionId]
        );
      }
    }

    req.user = {
      uid,
      email: decodedToken.email || '',
      role,
      sessionId: sessionId || 'default-session',
      departmentId,
    };

    req.securityContext = {
      userUid: uid,
      role,
      departmentId,
    };

    next();
  } catch (error: any) {
    if (error.code === 'auth/id-token-revoked') {
      res.status(401).json({ error: 'TOKEN_REVOKED', message: 'Account-wide credentials revoked. Please sign in.' });
      return;
    }
    res.status(401).json({ error: 'AUTHENTICATION_FAILED', message: 'Invalid authentication credentials.' });
  }
}

/**
 * Role-Based Access Control Guard
 */
export function requireRole(allowedRoles: ('STUDENT' | 'FACULTY' | 'HOD' | 'GLOBAL_ADMIN' | 'ADMIN' | 'TEACHER')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ 
        error: 'FORBIDDEN', 
        message: 'Insufficient administrative or academic permissions for this resource.' 
      });
      return;
    }

    const normalizedAllowed = allowedRoles.map((r) => {
      const upper = (r || '').toString().toUpperCase();
      if (upper === 'ADMIN') return 'GLOBAL_ADMIN';
      if (upper === 'TEACHER') return 'FACULTY';
      return upper;
    });

    const userRole = (req.user.role || '').toString().toUpperCase();
    const normalizedUser = (userRole === 'ADMIN') ? 'GLOBAL_ADMIN' : ((userRole === 'TEACHER') ? 'FACULTY' : userRole);

    if (!normalizedAllowed.includes(normalizedUser)) {
      res.status(403).json({ 
        error: 'FORBIDDEN', 
        message: 'Insufficient administrative or academic permissions for this resource.' 
      });
      return;
    }
    next();
  };
}
