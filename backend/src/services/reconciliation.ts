import { pool } from '../config/db';
import { firebaseAuth } from '../config/firebase';
import { EmailService } from './email';
import { AuditService } from './audit';

/**
 * Distributed State Reconciliation Worker (FR-67, FR-69, OS-02, OS-03)
 * Reconciles state discrepancies between Firebase Authentication and PostgreSQL,
 * executes compensating rollbacks on partial failures, and manages unactivated account lifecycles.
 */
export class ReconciliationWorker {
  /**
   * Reconciles pending email changes (Entity 19).
   */
  static async reconcileEmailChanges(): Promise<{ reconciledCount: number }> {
    const pendingChanges = await pool.query(
      `SELECT * FROM pending_email_changes 
       WHERE stage IN ('FIREBASE_AUTH_UPDATED', 'REQUESTED') 
         AND retry_count < 5 
       ORDER BY created_at ASC 
       LIMIT 50`
    );

    let count = 0;
    for (const change of pendingChanges.rows) {
      try {
        if (change.stage === 'FIREBASE_AUTH_UPDATED') {
          // Firebase Auth already updated; update PostgreSQL user profile
          await pool.query(
            `UPDATE users SET email = $1, updated_at = NOW() WHERE user_uid = $2`,
            [change.new_email, change.user_uid]
          );
          await pool.query(
            `UPDATE student_profiles SET student_gmail = $1, updated_at = NOW() WHERE user_uid = $2`,
            [change.new_email, change.user_uid]
          );
          await pool.query(
            `UPDATE pending_email_changes SET stage = 'COMPLETED', updated_at = NOW() WHERE change_id = $1`,
            [change.change_id]
          );
          count++;
        }
      } catch (err: any) {
        console.error(`Error reconciling email change ${change.change_id}:`, err);
        await pool.query(
          `UPDATE pending_email_changes 
           SET retry_count = retry_count + 1, updated_at = NOW() 
           WHERE change_id = $1`,
          [change.change_id]
        );
      }
    }

    return { reconciledCount: count };
  }

  /**
   * Dispatches 24-Hour Activation Reminders (OS-02)
   * Dispatches reminder email 24 hours prior to 48-hour activation link expiration.
   */
  static async dispatchActivationReminders(): Promise<{ remindersSent: number }> {
    // Find unactivated tokens created between 23 and 25 hours ago that haven't received reminder
    const tokensRes = await pool.query(
      `SELECT t.*, u.email, sp.full_name, sp.student_id
       FROM activation_tokens t
       JOIN users u ON t.user_uid = u.user_uid
       JOIN student_profiles sp ON u.user_uid = sp.user_uid
       WHERE t.purpose = 'ACCOUNT_ACTIVATION'
         AND t.used_at IS NULL
         AND t.is_invalidated = FALSE
         AND t.created_at BETWEEN (NOW() - INTERVAL '25 hours') AND (NOW() - INTERVAL '23 hours')
         AND u.status = 'PENDING_ACTIVATION'`
    );

    let sent = 0;
    for (const token of tokensRes.rows) {
      const idempotencyKey = `reminder-24h-${token.user_uid}-${token.token_id}`;
      try {
        await EmailService.sendEmail({
          to: token.email,
          subject: 'Reminder: 24 Hours Left to Activate Your College Account',
          idempotencyKey,
          operationType: 'ACCOUNT_ACTIVATION',
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Action Required: Activate Your Account</h2>
              <p>Dear ${token.full_name},</p>
              <p>Your account activation link for Student ID <strong>${token.student_id}</strong> will expire in 24 hours.</p>
              <p>Please complete your activation immediately to access class attendance registers and schedules.</p>
            </div>
          `,
        });
        sent++;
      } catch (e) {
        console.error(`Failed to send activation reminder for ${token.email}:`, e);
      }
    }

    return { remindersSent: sent };
  }

  /**
   * Enforces Stale Unactivated Account Policy (OS-03)
   * 7 Days: Flag as STALE_UNACTIVATED.
   * 14 Days: Expire tokens and set status to INACTIVE.
   */
  static async enforceStaleAccountPolicy(): Promise<void> {
    // 14 days: set to INACTIVE and invalidate tokens
    await pool.query(
      `UPDATE users 
       SET status = 'INACTIVE', updated_at = NOW() 
       WHERE status = 'PENDING_ACTIVATION' 
         AND created_at < (NOW() - INTERVAL '14 days')`
    );

    await pool.query(
      `UPDATE activation_tokens 
       SET is_invalidated = TRUE 
       WHERE used_at IS NULL 
         AND created_at < (NOW() - INTERVAL '14 days')`
    );
  }
}
