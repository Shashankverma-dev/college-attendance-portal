import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import attendanceRoutes from './routes/attendance.routes';
import academicRoutes from './routes/academic.routes';
import onboardingRoutes from './routes/onboarding.routes';
import correctionRoutes from './routes/correction.routes';
import marksRoutes from './routes/marks.routes';
import profileRoutes from './routes/profile.routes';
import adminRoutes from './routes/admin.routes';
import timetableRoutes from './routes/timetable.routes';
import studentRoutes from './routes/student.routes';
import { AuditService } from './services/audit';
import { ReconciliationWorker } from './services/reconciliation';
import path from 'path';
import { authenticate, requireRole } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

// Security & Header Configurations
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend assets from project root
const projectRoot = path.resolve(__dirname, '../../');
app.use(express.static(projectRoot));

// Liveness & Readiness Probes for Cloud Run & Firebase Hosting Rewrites
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'attendance-backend',
    timestamp: new Date().toISOString(),
    version: '1.8.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/onboard', onboardingRoutes);
app.use('/api/attendance/corrections', correctionRoutes);
app.use('/api/marks', marksRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/admin/students', studentRoutes);
app.use('/api/students', studentRoutes);

// Cloud Scheduler Cron Endpoint for Distributed State Reconciliation & 24h Reminders
app.post(
  '/api/admin/reconcile',
  authenticate,
  requireRole(['GLOBAL_ADMIN']),
  async (_req, res) => {
    try {
      const emailRes = await ReconciliationWorker.reconcileEmailChanges();
      const reminderRes = await ReconciliationWorker.dispatchActivationReminders();
      await ReconciliationWorker.enforceStaleAccountPolicy();
      res.json({ success: true, emailChangesReconciled: emailRes.reconciledCount, remindersSent: reminderRes.remindersSent });
    } catch (err: any) {
      res.status(500).json({ error: 'RECONCILIATION_ERROR', message: err.message });
    }
  }
);

// Daily Audit Integrity Verification Endpoint (invoked by Cloud Scheduler)
app.post(
  '/api/admin/audit-verify',
  authenticate,
  requireRole(['GLOBAL_ADMIN']),
  async (_req, res) => {
    try {
      const result = await AuditService.verifyIntegrity();
      if (!result.isValid) {
        res.status(500).json({ error: 'INTEGRITY_BREACH', details: result.details });
        return;
      }
      res.json({ success: true, details: result.details });
    } catch (err: any) {
      res.status(500).json({ error: 'VERIFICATION_ERROR', message: err.message });
    }
  }
);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API Exception:', err);
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred.',
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 College Attendance Portal Backend running on port ${PORT} (Environment: ${process.env.NODE_ENV || 'development'})`);
});

const SECONDARY_PORT = 5000;
if (!process.env.K_SERVICE && process.env.NODE_ENV !== 'production' && PORT !== SECONDARY_PORT) {
  const secondaryServer = app.listen(SECONDARY_PORT, '0.0.0.0', () => {
    console.log(`🌐 Also serving on port ${SECONDARY_PORT} (http://localhost:${SECONDARY_PORT})`);
  });
  secondaryServer.on('error', (err: any) => {
    console.warn(`Note: Secondary port ${SECONDARY_PORT} was not bound (${err.code || err.message}). Serving on primary port ${PORT}.`);
  });
}

export default app;
