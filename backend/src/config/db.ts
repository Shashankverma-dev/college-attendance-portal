import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL Connection Pool configured for Cloud SQL and PgBouncer
export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'attendance_db',
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

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
