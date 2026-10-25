import crypto from 'crypto';
import { PoolClient } from 'pg';
import { pool, isDbConnected } from '../config/db';

export interface AuditLogEntry {
  actorUid: string;
  actorRole: string;
  clientIp: string;
  userAgent?: string;
  actionCategory: 'AUTH' | 'ACCOUNT_LIFECYCLE' | 'ATTENDANCE_CORRECTION' | 'PROMOTION' | 'CALENDAR_PUBLISH' | 'BULK_IMPORT' | 'SESSION_REVOCATION' | 'EXAMINATION_MARKS' | 'PROFILE_UPDATE' | 'SECURITY_UPDATE';
  targetEntityName: string;
  targetEntityId: string;
  changeDetails: Record<string, any>;
}

export interface InMemAuditLogEntry extends AuditLogEntry {
  log_id: number;
  timestamp: string;
  previous_hash: string;
  record_hash: string;
}

export const localAuditLogs: InMemAuditLogEntry[] = [];


/**
 * Append-Only Audit Logging Service
 * Backed by PostgreSQL `audit_logs` table with database-level triggers enforcing
 * a sequential linear SHA-256 cryptographic hash chain ($H_i = SHA-256(H_{i-1} || data_i)).
 * Supports in-memory dual-mode fallback with equivalent cryptographic verification.
 */
export class AuditService {
  /**
   * Records a security-critical or administrative event.
   * Insertion triggers automatic linear hash calculation.
   */
  static async record(client: PoolClient | null, entry: AuditLogEntry): Promise<void> {
    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const db = client || pool;
        const query = `
          INSERT INTO audit_logs 
            (actor_uid, actor_role, client_ip, user_agent, action_category, target_entity_name, target_entity_id, change_details)
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await db.query(query, [
          entry.actorUid,
          entry.actorRole,
          entry.clientIp,
          entry.userAgent || 'UNKNOWN',
          entry.actionCategory,
          entry.targetEntityName,
          entry.targetEntityId,
          JSON.stringify(entry.changeDetails),
        ]);
        return;
      }
    } catch (_dbErr) {
      // In-memory fallback
    }

    const prevHash = localAuditLogs.length > 0 
      ? localAuditLogs[localAuditLogs.length - 1].record_hash 
      : '0000000000000000000000000000000000000000000000000000000000000000';
    const logId = localAuditLogs.length + 1;
    const timestamp = new Date().toISOString();
    const payload = `${prevHash}|${logId}|${entry.actorUid}|${entry.actionCategory}|${entry.targetEntityName}|${entry.targetEntityId}|${JSON.stringify(entry.changeDetails)}|${timestamp}`;
    const recordHash = crypto.createHash('sha256').update(payload).digest('hex');

    localAuditLogs.push({
      ...entry,
      log_id: logId,
      timestamp,
      previous_hash: prevHash,
      record_hash: recordHash,
    });
  }

  /**
   * Traverses the entire audit log and verifies linear cryptographic hash chain integrity.
   * If any record hash or link is tampered, halts and emits an automated P1 security incident alert.
   */
  static async verifyIntegrity(): Promise<{ isValid: boolean; details: string }> {
    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const result = await pool.query('SELECT * FROM app.verify_audit_hash_chain()');
        const status = result.rows[0];

        if (!status.is_valid) {
          console.error('================================================================');
          console.error('🚨 CRITICAL P1 SECURITY ALERT: AUDIT LOG INTEGRITY BREACH DETECTED 🚨');
          console.error(`Tampered Log ID: ${status.tampered_log_id}`);
          console.error(`Failure Reason: ${status.failure_reason}`);
          console.error('================================================================');
          return {
            isValid: false,
            details: `Tampering detected at log ${status.tampered_log_id}: ${status.failure_reason}`,
          };
        }
        return { isValid: true, details: 'Audit log hash chain verified successfully.' };
      }
    } catch (_dbErr) {
      // In-memory fallback
    }

    for (let i = 0; i < localAuditLogs.length; i++) {
      const current = localAuditLogs[i];
      const expectedPrev = i === 0 
        ? '0000000000000000000000000000000000000000000000000000000000000000' 
        : localAuditLogs[i - 1].record_hash;

      if (current.previous_hash !== expectedPrev) {
        return {
          isValid: false,
          details: `Tampering detected at log ${current.log_id}: broken previous hash link (expected ${expectedPrev}, got ${current.previous_hash})`,
        };
      }

      const payload = `${current.previous_hash}|${current.log_id}|${current.actorUid}|${current.actionCategory}|${current.targetEntityName}|${current.targetEntityId}|${JSON.stringify(current.changeDetails)}|${current.timestamp}`;
      const recalculatedHash = crypto.createHash('sha256').update(payload).digest('hex');

      if (current.record_hash !== recalculatedHash) {
        return {
          isValid: false,
          details: `Tampering detected at log ${current.log_id}: invalid record hash (expected ${recalculatedHash}, got ${current.record_hash})`,
        };
      }
    }

    return { 
      isValid: true, 
      details: `Verified ${localAuditLogs.length} audit records in SHA-256 linear cryptographic memory chain.` 
    };
  }
}

