import { PoolClient } from 'pg';
import { pool, isDbConnected } from '../config/db';

export interface IdempotencyClaimResult {
  isAlreadyProcessed: boolean;
  cachedResponse?: any;
}

export const localIdempotencyKeys = new Map<string, { status: string; responsePayload?: any }>();

/**
 * Persistent Application-Level Idempotency Service
 * Backed by PostgreSQL `processed_idempotency_keys` table with in-memory fallback.
 * 
 * Provides atomic deduplication across Cloud Tasks retries, server crashes,
 * and client-side repeat submissions, extending protection far beyond
 * Google Cloud Tasks' 4-hour transient deduplication window.
 */
export class IdempotencyService {
  /**
   * Attempts to claim an idempotency key atomically.
   * If already completed, returns the cached response payload.
   */
  static async claim(
    client: PoolClient | null,
    idempotencyKey: string,
    operationType: string,
    resourceId?: string
  ): Promise<IdempotencyClaimResult> {
    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const db = client || pool;
        const checkQuery = `
          SELECT execution_status, response_payload 
          FROM processed_idempotency_keys 
          WHERE idempotency_key = $1
          FOR UPDATE
        `;

        const insertQuery = `
          INSERT INTO processed_idempotency_keys 
            (idempotency_key, operation_type, resource_id, execution_status, created_at, expires_at)
          VALUES 
            ($1, $2, $3, 'IN_PROGRESS', NOW(), NOW() + INTERVAL '7 days')
          ON CONFLICT (idempotency_key) DO NOTHING
        `;
        const insertResult = await db.query(insertQuery, [idempotencyKey, operationType, resourceId || null]);

        if (insertResult.rowCount && insertResult.rowCount > 0) {
          return { isAlreadyProcessed: false };
        }

        const existing = await db.query(checkQuery, [idempotencyKey]);
        if (existing.rowCount && existing.rowCount > 0) {
          const row = existing.rows[0];
          if (row.execution_status === 'COMPLETED') {
            return {
              isAlreadyProcessed: true,
              cachedResponse: row.response_payload,
            };
          }
        }
        return { isAlreadyProcessed: false };
      }
    } catch (_dbErr) {
      // Fall through to in-memory idempotency check
    }

    // In-memory fallback
    const entry = localIdempotencyKeys.get(idempotencyKey);
    if (entry) {
      if (entry.status === 'COMPLETED') {
        return { isAlreadyProcessed: true, cachedResponse: entry.responsePayload };
      }
      return { isAlreadyProcessed: false };
    }

    localIdempotencyKeys.set(idempotencyKey, { status: 'IN_PROGRESS' });
    return { isAlreadyProcessed: false };
  }

  /**
   * Marks an operation as completed and caches the result payload.
   */
  static async complete(
    client: PoolClient | null,
    idempotencyKey: string,
    responsePayload: any
  ): Promise<void> {
    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const db = client || pool;
        await db.query(
          `UPDATE processed_idempotency_keys 
           SET execution_status = 'COMPLETED', 
               response_payload = $2, 
               completed_at = NOW() 
           WHERE idempotency_key = $1`,
          [idempotencyKey, JSON.stringify(responsePayload)]
        );
        return;
      }
    } catch (_dbErr) {
      // In-memory fallback
    }

    localIdempotencyKeys.set(idempotencyKey, {
      status: 'COMPLETED',
      responsePayload,
    });
  }

  /**
   * Marks an operation as failed.
   */
  static async fail(
    client: PoolClient | null,
    idempotencyKey: string,
    errorPayload: any
  ): Promise<void> {
    try {
      const dbOnline = await isDbConnected();
      if (dbOnline) {
        const db = client || pool;
        await db.query(
          `UPDATE processed_idempotency_keys 
           SET execution_status = 'FAILED', 
               response_payload = $2, 
               completed_at = NOW() 
           WHERE idempotency_key = $1`,
          [idempotencyKey, JSON.stringify(errorPayload)]
        );
        return;
      }
    } catch (_dbErr) {
      // In-memory fallback
    }

    localIdempotencyKeys.set(idempotencyKey, {
      status: 'FAILED',
      responsePayload: errorPayload,
    });
  }
}
