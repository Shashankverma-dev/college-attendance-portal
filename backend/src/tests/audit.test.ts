import { AuditService, localAuditLogs } from '../services/audit';
import crypto from 'crypto';

describe('Phase 14: Audit Log Hash-Chain Integrity', () => {
  const originalLogs = [...localAuditLogs];

  beforeEach(() => {
    localAuditLogs.length = 0;
  });

  afterAll(() => {
    localAuditLogs.length = 0;
    localAuditLogs.push(...originalLogs);
  });

  it('generates a cryptographically linked SHA-256 linear sequential hash chain', async () => {
    await AuditService.record(null, {
      actorUid: 'admin-001',
      actorRole: 'GLOBAL_ADMIN',
      clientIp: '127.0.0.1',
      userAgent: 'JestTest',
      actionCategory: 'AUTH',
      targetEntityName: 'users',
      targetEntityId: 'usr-001',
      changeDetails: { event: 'LOGIN' },
    });

    await AuditService.record(null, {
      actorUid: 'admin-001',
      actorRole: 'GLOBAL_ADMIN',
      clientIp: '127.0.0.1',
      userAgent: 'JestTest',
      actionCategory: 'ACCOUNT_LIFECYCLE',
      targetEntityName: 'students',
      targetEntityId: 'stu-001',
      changeDetails: { action: 'ACTIVATE' },
    });

    await AuditService.record(null, {
      actorUid: 'admin-001',
      actorRole: 'GLOBAL_ADMIN',
      clientIp: '127.0.0.1',
      userAgent: 'JestTest',
      actionCategory: 'ATTENDANCE_CORRECTION',
      targetEntityName: 'attendance_records',
      targetEntityId: 'rec-001',
      changeDetails: { from: 'A', to: 'P' },
    });

    expect(localAuditLogs).toHaveLength(3);

    // Entry 0 previous hash is 64 zeroes
    expect(localAuditLogs[0].previous_hash).toBe('0'.repeat(64));
    // Entry 1 previous hash links to Entry 0 record hash
    expect(localAuditLogs[1].previous_hash).toBe(localAuditLogs[0].record_hash);
    // Entry 2 previous hash links to Entry 1 record hash
    expect(localAuditLogs[2].previous_hash).toBe(localAuditLogs[1].record_hash);

    // Verify integrity succeeds
    const result = await AuditService.verifyIntegrity();
    expect(result.isValid).toBe(true);
    expect(result.details).toContain('Verified 3 audit records');
  });

  it('detects tampering when a record payload is modified in place', async () => {
    await AuditService.record(null, {
      actorUid: 'admin-001',
      actorRole: 'GLOBAL_ADMIN',
      clientIp: '127.0.0.1',
      userAgent: 'JestTest',
      actionCategory: 'AUTH',
      targetEntityName: 'users',
      targetEntityId: 'usr-001',
      changeDetails: { event: 'LOGIN' },
    });

    await AuditService.record(null, {
      actorUid: 'admin-001',
      actorRole: 'GLOBAL_ADMIN',
      clientIp: '127.0.0.1',
      userAgent: 'JestTest',
      actionCategory: 'EXAMINATION_MARKS',
      targetEntityName: 'marks',
      targetEntityId: 'mark-001',
      changeDetails: { marks: 85 },
    });

    // An attacker alters marks from 85 to 100 without recalculating record_hash
    localAuditLogs[1].changeDetails = { marks: 100 };

    const result = await AuditService.verifyIntegrity();
    expect(result.isValid).toBe(false);
    expect(result.details).toContain('Tampering detected');
    expect(result.details).toContain('invalid record hash');
  });

  it('detects tampering when a link in the hash chain is broken', async () => {
    await AuditService.record(null, {
      actorUid: 'admin-001',
      actorRole: 'GLOBAL_ADMIN',
      clientIp: '127.0.0.1',
      userAgent: 'JestTest',
      actionCategory: 'AUTH',
      targetEntityName: 'users',
      targetEntityId: 'usr-001',
      changeDetails: { event: 'LOGIN' },
    });

    await AuditService.record(null, {
      actorUid: 'admin-001',
      actorRole: 'GLOBAL_ADMIN',
      clientIp: '127.0.0.1',
      userAgent: 'JestTest',
      actionCategory: 'SECURITY_UPDATE',
      targetEntityName: 'keys',
      targetEntityId: 'key-001',
      changeDetails: { action: 'ROTATE' },
    });

    // Alter previous_hash link
    localAuditLogs[1].previous_hash = crypto.createHash('sha256').update('fake-hash').digest('hex');

    const result = await AuditService.verifyIntegrity();
    expect(result.isValid).toBe(false);
    expect(result.details).toContain('Tampering detected');
    expect(result.details).toContain('broken previous hash link');
  });
});
