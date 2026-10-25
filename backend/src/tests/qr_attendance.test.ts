import { QRAttendanceService } from '../services/qr-attendance';
import crypto from 'crypto';

describe('Phase 8.2 & Phase 9: Live Rotating QR Attendance Engine', () => {
  const testSecretKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const testSessionId = 'sess-test-lecture-101';

  describe('HMAC-SHA256 Rotating Token Generation', () => {
    it('generates a deterministic 64-character SHA-256 hex token for a given window', () => {
      const windowIndex = 1000000;
      const token1 = QRAttendanceService.generateWindowToken(testSecretKey, testSessionId, windowIndex);
      const token2 = QRAttendanceService.generateWindowToken(testSecretKey, testSessionId, windowIndex);

      expect(token1).toBe(token2);
      expect(token1).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
    });

    it('generates distinct tokens across consecutive 20-second time windows', () => {
      const window1 = 1000000;
      const window2 = 1000001;

      const token1 = QRAttendanceService.generateWindowToken(testSecretKey, testSessionId, window1);
      const token2 = QRAttendanceService.generateWindowToken(testSecretKey, testSessionId, window2);

      expect(token1).not.toBe(token2);
    });

    it('generates distinct tokens for different sessions in the same time window', () => {
      const windowIndex = 1000000;
      const otherSessionId = 'sess-test-lecture-102';

      const token1 = QRAttendanceService.generateWindowToken(testSecretKey, testSessionId, windowIndex);
      const token2 = QRAttendanceService.generateWindowToken(testSecretKey, otherSessionId, windowIndex);

      expect(token1).not.toBe(token2);
    });

    it('generates distinct tokens when different secret keys are used', () => {
      const windowIndex = 1000000;
      const otherKey = crypto.randomBytes(32).toString('hex');

      const token1 = QRAttendanceService.generateWindowToken(testSecretKey, testSessionId, windowIndex);
      const token2 = QRAttendanceService.generateWindowToken(otherKey, testSessionId, windowIndex);

      expect(token1).not.toBe(token2);
    });
  });

  describe('Backup Challenge Code (6-Digit Fallback)', () => {
    it('generates a valid 6-digit numeric string', () => {
      const challenge = QRAttendanceService.generateBackupChallenge(testSecretKey, testSessionId);

      expect(challenge).toHaveLength(6);
      expect(/^\d{6}$/.test(challenge)).toBe(true);

      const numVal = parseInt(challenge, 10);
      expect(numVal).toBeGreaterThanOrEqual(100000);
      expect(numVal).toBeLessThanOrEqual(999999);
    });

    it('remains deterministic for the same session and secret key', () => {
      const code1 = QRAttendanceService.generateBackupChallenge(testSecretKey, testSessionId);
      const code2 = QRAttendanceService.generateBackupChallenge(testSecretKey, testSessionId);

      expect(code1).toBe(code2);
    });
  });

  describe('Window Index Timing Calculation', () => {
    it('calculates the correct window index based on 20-second default intervals', () => {
      const defaultInterval = 20;
      const expectedWindow = Math.floor(Date.now() / (defaultInterval * 1000));
      const calculatedWindow = QRAttendanceService.getCurrentWindowIndex(defaultInterval);

      expect(Math.abs(calculatedWindow - expectedWindow)).toBeLessThanOrEqual(1);
    });
  });
});
