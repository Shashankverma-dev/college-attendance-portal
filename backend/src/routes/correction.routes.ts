import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth';
import { runWithTransactionContext } from '../config/db';
import { UploadService } from '../services/upload';
import { AuditService } from '../services/audit';
import { EmailService } from '../services/email';

const router = Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit (OS-04)
});

/**
 * POST /api/attendance/corrections
 * Student submits an FR-48 attendance correction request with optional evidence file.
 */
router.post(
  '/',
  authenticate,
  requireRole(['STUDENT']),
  upload.single('evidence'),
  async (req: Request, res: Response): Promise<void> => {
    const { recordId, claimedStatus, category, justification } = req.body;
    const uid = req.user!.uid;

    if (!recordId || !claimedStatus || !category || !justification) {
      res.status(400).json({ error: 'MISSING_FIELDS', message: 'recordId, claimedStatus, category, and justification are mandatory.' });
      return;
    }

    try {
      let evidenceUrl = null;
      let evidenceChecksum = null;

      // Handle optional evidence upload
      if (req.file) {
        const inspection = UploadService.inspectMagicBytes(req.file.buffer, 'evidence');
        if (!inspection.isValid) {
          res.status(400).json({ error: 'INVALID_EVIDENCE_FORMAT', message: inspection.failureReason });
          return;
        }

        evidenceChecksum = UploadService.computeChecksum(req.file.buffer);
        const uploadRes = await UploadService.uploadToStorage(
          req.file.buffer,
          req.file.originalname,
          inspection.detectedMimeType || 'application/pdf',
          'evidence'
        );
        evidenceUrl = uploadRes.downloadUrl;
      }

      const result = await runWithTransactionContext(req.securityContext!, async (client) => {
        // 1. Verify student profile and ownership of attendance record
        const studentRes = await client.query(
          `SELECT sp.student_profile_id 
           FROM student_profiles sp 
           WHERE sp.user_uid = $1`,
          [uid]
        );
        if (studentRes.rowCount === 0) {
          throw { status: 404, code: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' };
        }
        const studentProfileId = studentRes.rows[0].student_profile_id;

        // Verify record ownership and 5-day dispute window (OS-01)
        const recordRes = await client.query(
          `SELECT ar.record_id, ar.session_id, sess.session_date, sess.conducting_faculty_id
           FROM attendance_records ar
           JOIN attendance_sessions sess ON ar.session_id = sess.session_id
           WHERE ar.record_id = $1 AND ar.student_profile_id = $2`,
          [recordId, studentProfileId]
        );

        if (recordRes.rowCount === 0) {
          throw { status: 403, code: 'RECORD_ACCESS_DENIED', message: 'You can only dispute your own attendance records.' };
        }

        const { session_id, session_date, conducting_faculty_id } = recordRes.rows[0];

        // Dispute window verification (5 academic days)
        const sessionDateObj = new Date(session_date);
        const daysDiff = (Date.now() - sessionDateObj.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 7) { // 5 working days ~ 7 calendar days
          throw { status: 400, code: 'DISPUTE_WINDOW_EXPIRED', message: 'Attendance correction requests must be submitted within 5 academic working days.' };
        }

        // Insert correction request
        const insertRes = await client.query(
          `INSERT INTO attendance_correction_requests (
            attendance_record_id, student_profile_id, session_id,
            claimed_status, category, student_justification,
            evidence_document_url, evidence_file_checksum,
            status, reviewing_faculty_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_FACULTY', $9)
           RETURNING request_id, status, created_at`,
          [
            recordId,
            studentProfileId,
            session_id,
            claimedStatus,
            category,
            justification,
            evidenceUrl,
            evidenceChecksum,
            conducting_faculty_id,
          ]
        );

        return insertRes.rows[0];
      });

      res.status(201).json({ success: true, correctionRequest: result });
    } catch (err: any) {
      console.error('Correction request submission error:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * POST /api/attendance/corrections/:requestId/review
 * Faculty reviews the request and recommends to HOD or rejects.
 */
router.post(
  '/:requestId/review',
  authenticate,
  requireRole(['FACULTY', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { requestId } = req.params;
    const { action, facultyRemarks } = req.body; // action: 'RECOMMEND' | 'REJECT'
    const uid = req.user!.uid;

    if (!['RECOMMEND', 'REJECT'].includes(action)) {
      res.status(400).json({ error: 'INVALID_ACTION', message: 'Action must be RECOMMEND or REJECT.' });
      return;
    }

    try {
      const result = await runWithTransactionContext(req.securityContext!, async (client) => {
        const reqRes = await client.query(
          `SELECT cr.*, fp.faculty_profile_id 
           FROM attendance_correction_requests cr
           JOIN faculty_profiles fp ON cr.reviewing_faculty_id = fp.faculty_profile_id
           WHERE cr.request_id = $1 AND cr.status = 'PENDING_FACULTY'`,
          [requestId]
        );

        if (reqRes.rowCount === 0) {
          throw { status: 404, code: 'REQUEST_NOT_FOUND', message: 'Correction request not found or not in pending faculty state.' };
        }

        const newStatus = action === 'RECOMMEND' ? 'RECOMMENDED_HOD' : 'REJECTED';

        await client.query(
          `UPDATE attendance_correction_requests 
           SET status = $1, faculty_remarks = $2, resolved_at = CASE WHEN $1 = 'REJECTED' THEN NOW() ELSE NULL END
           WHERE request_id = $3`,
          [newStatus, facultyRemarks || null, requestId]
        );

        return { requestId, newStatus };
      });

      res.json({ success: true, result });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * POST /api/attendance/corrections/:requestId/resolve
 * HOD or Admin grants final authorization and mutates attendance record atomically.
 */
router.post(
  '/:requestId/resolve',
  authenticate,
  requireRole(['HOD', 'GLOBAL_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    const { requestId } = req.params;
    const { decision, resolutionRemarks } = req.body; // decision: 'APPROVE' | 'REJECT'
    const uid = req.user!.uid;

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      res.status(400).json({ error: 'INVALID_DECISION', message: 'Decision must be APPROVE or REJECT.' });
      return;
    }

    try {
      const summary = await runWithTransactionContext(req.securityContext!, async (client) => {
        const reqRes = await client.query(
          `SELECT cr.*, sp.user_uid as student_user_uid, sp.student_gmail, sp.full_name
           FROM attendance_correction_requests cr
           JOIN student_profiles sp ON cr.student_profile_id = sp.student_profile_id
           WHERE cr.request_id = $1 AND cr.status = 'RECOMMENDED_HOD'
           FOR UPDATE`,
          [requestId]
        );

        if (reqRes.rowCount === 0) {
          throw { status: 404, code: 'NOT_FOUND', message: 'Correction request not found in RECOMMENDED_HOD state.' };
        }

        const reqData = reqRes.rows[0];

        // Resolve staff profile
        const staffRes = await client.query(`SELECT staff_profile_id FROM staff_profiles WHERE user_uid = $1`, [uid]);
        const staffProfileId = staffRes.rows[0]?.staff_profile_id || null;

        if (decision === 'APPROVE') {
          // Enable workflow bypass variable for locked attendance session mutation trigger
          await client.query(`SELECT set_config('app.in_approved_correction_workflow', 'TRUE', true)`);

          // 1. Mutate attendance record atomically
          await client.query(
            `UPDATE attendance_records 
             SET attendance_status = $1, remarks = 'Updated via approved FR-48 correction', updated_at = NOW()
             WHERE record_id = $2`,
            [reqData.claimed_status, reqData.attendance_record_id]
          );

          // 2. Mark request approved
          await client.query(
            `UPDATE attendance_correction_requests 
             SET status = 'APPROVED', approving_staff_id = $1, resolution_remarks = $2, resolved_at = NOW()
             WHERE request_id = $3`,
            [staffProfileId, resolutionRemarks || null, requestId]
          );

          // 3. Append to Linear Cryptographic Hash Chain Audit Log
          await AuditService.record(client, {
            actorUid: uid,
            actorRole: req.user!.role,
            clientIp: req.ip || '127.0.0.1',
            actionCategory: 'ATTENDANCE_CORRECTION',
            targetEntityName: 'attendance_records',
            targetEntityId: reqData.attendance_record_id,
            changeDetails: {
              requestId,
              oldStatus: reqData.claimed_status === 'P' ? 'A' : 'P',
              newStatus: reqData.claimed_status,
              justification: reqData.student_justification,
            },
          });
        } else {
          // Rejected
          await client.query(
            `UPDATE attendance_correction_requests 
             SET status = 'REJECTED', approving_staff_id = $1, resolution_remarks = $2, resolved_at = NOW()
             WHERE request_id = $3`,
            [staffProfileId, resolutionRemarks || null, requestId]
          );
        }

        return {
          requestId,
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          studentEmail: reqData.student_gmail,
        };
      });

      res.json({ success: true, resolution: summary });
    } catch (err: any) {
      console.error('Resolve correction error:', err);
      res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
  }
);

export default router;
