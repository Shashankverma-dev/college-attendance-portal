import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth';
import { BulkOnboardingService } from '../services/bulk-onboard';
import { UploadService } from '../services/upload';
import { EmailService } from '../services/email';

const router = Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB institutional default (OS-04)
});

/**
 * POST /api/admin/onboard/bulk
 * Upload CSV or Excel spreadsheet to onboard bulk students.
 */
router.post(
  '/bulk',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'FILE_REQUIRED', message: 'Please upload a .csv or .xlsx roster file.' });
      return;
    }

    const { academicTerm } = req.body;
    if (!academicTerm) {
      res.status(400).json({ error: 'ACADEMIC_TERM_REQUIRED', message: 'Academic calendar term is mandatory.' });
      return;
    }

    // Inspect magic bytes against MIME spoofing
    const inspection = UploadService.inspectMagicBytes(req.file.buffer, 'bulk_roster');
    if (!inspection.isValid) {
      res.status(400).json({ error: 'INVALID_FILE_SIGNATURE', message: inspection.failureReason });
      return;
    }

    const isExcel = req.file.originalname.toLowerCase().endsWith('.xlsx');
    const parsedRows = BulkOnboardingService.parseRosterBuffer(req.file.buffer, isExcel);

    if (parsedRows.length === 0) {
      res.status(400).json({ error: 'EMPTY_FILE', message: 'No student records detected in spreadsheet.' });
      return;
    }

    if (parsedRows.length > 5000) {
      res.status(400).json({
        error: 'MAX_ROWS_EXCEEDED',
        message: `Roster contains ${parsedRows.length} rows. Maximum allowed per batch is 5,000 records.`,
      });
      return;
    }

    const result = await BulkOnboardingService.processRoster(
      parsedRows,
      academicTerm,
      req.user!.uid,
      req.user!.role
    );

    res.json({
      success: result.failedCount === 0,
      totalProcessed: result.totalProcessed,
      successfulCount: result.successfulCount,
      failedCount: result.failedCount,
      errors: result.errors,
      quotaWarning: result.quotaWarning,
    });
  }
);

/**
 * POST /api/admin/onboard/resend-activation
 * Reissues a 48-hour activation link and invalidates previously sent tokens.
 */
router.post(
  '/resend-activation',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  async (req: Request, res: Response): Promise<void> => {
    const { studentIdentifier } = req.body;

    if (!studentIdentifier || typeof studentIdentifier !== 'string') {
      res.status(400).json({
        error: 'IDENTIFIER_REQUIRED',
        message: 'Student ID or registered student Gmail address is required.',
      });
      return;
    }

    const outcome = await BulkOnboardingService.resendActivation(
      studentIdentifier,
      req.user!.uid,
      req.user!.role
    );

    if (!outcome.success) {
      res.status(404).json({ error: 'RESEND_FAILED', message: outcome.message });
      return;
    }

    res.json(outcome);
  }
);

/**
 * GET /api/admin/onboard/students
 * Lists enrolled student profiles and their activation status.
 */
router.get(
  '/students',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const students = await BulkOnboardingService.getStudents();
      res.json({ success: true, count: students.length, students });
    } catch (err: any) {
      res.status(500).json({ error: 'FETCH_STUDENTS_FAILED', message: err.message });
    }
  }
);

/**
 * GET /api/admin/onboard/template
 * Downloads a standardized CSV roster template.
 */
router.get(
  '/template',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  (_req: Request, res: Response): void => {
    const csvContent = BulkOnboardingService.generateSampleCsvTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students_sample_template.csv"');
    res.status(200).send(csvContent);
  }
);

/**
 * GET /api/admin/onboard/quota-check
 * Pre-onboarding Google Workspace quota verification.
 */
router.get(
  '/quota-check',
  authenticate,
  requireRole(['GLOBAL_ADMIN', 'HOD']),
  (req: Request, res: Response): void => {
    const studentCount = parseInt((req.query.count as string) || '4165', 10);
    const check = EmailService.verifyDailyQuota(studentCount);
    res.json(check);
  }
);

export default router;
