import { TokenService } from '../services/token';
import jwt from 'jsonwebtoken';

describe('Phase 2: Authentication & Token Security', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.SESSION_SIGNING_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.SESSION_SIGNING_SECRET = originalSecret;
  });

  describe('TokenService Signing & Verification', () => {
    it('generates a valid signed JWT session token with required institutional claims', () => {
      const token = TokenService.createSessionToken({
        uid: 'user-stu-001',
        email: 'student@srhu.edu.in',
        role: 'STUDENT',
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const decoded: any = TokenService.verifySessionToken(token);
      expect(decoded.uid).toBe('user-stu-001');
      expect(decoded.email).toBe('student@srhu.edu.in');
      expect(decoded.role).toBe('STUDENT');
      expect(decoded.iss).toBe('srhu-attendance-portal');
      expect(decoded.aud).toBe('srhu-portal-client');
      expect(decoded.typ).toBe('ACCESS_TOKEN');
    });

    it('rejects tampered tokens with invalid signature', () => {
      const token = TokenService.createSessionToken({
        uid: 'user-stu-001',
        email: 'student@srhu.edu.in',
        role: 'STUDENT',
      });

      const parts = token.split('.');
      // Tamper with payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      payload.role = 'GLOBAL_ADMIN'; // Attempted privilege escalation
      const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

      expect(TokenService.verifySessionToken(tamperedToken)).toBeNull();
    });

    it('rejects tokens signed with an arbitrary untrusted key', () => {
      const rogueToken = jwt.sign(
        {
          uid: 'user-rogue-001',
          role: 'GLOBAL_ADMIN',
          typ: 'ACCESS_TOKEN',
          iss: 'srhu-attendance-portal',
          aud: 'srhu-portal-client',
        },
        'unauthorized-secret-key-that-does-not-match',
        { algorithm: 'HS256' }
      );

      expect(TokenService.verifySessionToken(rogueToken)).toBeNull();
    });

    it('rejects tokens with invalid token type (e.g. REFRESH_TOKEN as ACCESS_TOKEN)', () => {
      const secret = TokenService.getSessionSecret();
      const refreshToken = jwt.sign(
        {
          uid: 'user-stu-001',
          role: 'STUDENT',
          typ: 'REFRESH_TOKEN',
          iss: 'srhu-attendance-portal',
          aud: 'srhu-portal-client',
        },
        secret,
        { algorithm: 'HS256' }
      );

      expect(TokenService.verifySessionToken(refreshToken)).toBeNull();
    });

    it('rejects tokens with invalid issuer or audience', () => {
      const secret = TokenService.getSessionSecret();
      const badIssuerToken = jwt.sign(
        {
          uid: 'user-stu-001',
          role: 'STUDENT',
          typ: 'ACCESS_TOKEN',
          iss: 'foreign-untrusted-issuer',
          aud: 'srhu-portal-client',
        },
        secret,
        { algorithm: 'HS256' }
      );

      expect(TokenService.verifySessionToken(badIssuerToken)).toBeNull();
    });

    it('strictly enforces 32+ character secrets in production mode', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SESSION_SECRET;
      delete process.env.SESSION_SIGNING_SECRET;

      expect(() => {
        TokenService.getSessionSecret();
      }).toThrow(/FATAL_SECURITY_CONFIG/i);

      process.env.SESSION_SECRET = 'short';
      expect(() => {
        TokenService.getSessionSecret();
      }).toThrow(/FATAL_SECURITY_CONFIG/i);

      process.env.SESSION_SECRET = 'portal-session-secret-key-institution-2026';
      expect(() => {
        TokenService.getSessionSecret();
      }).toThrow(/FATAL_SECURITY_CONFIG/i);
    });
  });
});
