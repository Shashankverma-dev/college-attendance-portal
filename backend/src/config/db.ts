import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL Connection Pool configured for Render, Supabase, Cloud SQL and local development
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'attendance_db',
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client pool', err);
});

export interface UserSecurityContext {
  userUid: string;
  role: 'STUDENT' | 'FACULTY' | 'HOD' | 'GLOBAL_ADMIN';
  departmentId?: string | null;
}

/**
 * Executes a callback within a managed database transaction where PostgreSQL RLS
 * context is securely injected using transaction-local configuration (`SET LOCAL`).
 * 
 * In PgBouncer transaction pooling mode, `SET LOCAL` guarantees that session
 * authorization state automatically purges on COMMIT/ROLLBACK, preventing pool contamination.
 */
export async function runWithTransactionContext<T>(
  context: UserSecurityContext,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Inject trusted transaction-local context variables for Row-Level Security
    await client.query(
      'SELECT app.set_transaction_context($1, $2, $3)',
      [context.userUid, context.role, context.departmentId || null]
    );

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
let lastDbCheckTime = 0;
let cachedDbStatus = false;
const DB_CHECK_TTL_MS = 10000; // 10-second TTL cache to eliminate sequential connection hangs

export async function isDbConnected(): Promise<boolean> {
  const now = Date.now();
  if (now - lastDbCheckTime < DB_CHECK_TTL_MS) {
    return cachedDbStatus;
  }

  try {
    // Fast 1000ms timeout for connectivity ping
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB_PING_TIMEOUT')), 1000)
    );
    const queryPromise = pool.query('SELECT 1');
    const res = await Promise.race([queryPromise, timeoutPromise]);
    cachedDbStatus = (res as any)?.rowCount === 1;
  } catch {
    cachedDbStatus = false;
  }
  lastDbCheckTime = now;
  return cachedDbStatus;
}

export function assertProductionDbAvailable(dbOnline: boolean): void {
  if (process.env.NODE_ENV === 'production' && !dbOnline) {
    throw new Error('DATABASE_UNAVAILABLE: Production Cloud SQL PostgreSQL connection is required. Silent fallback to in-memory storage is prohibited.');
  }
}
