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
import { isDbConnected, assertProductionDbAvailable } from './config/db';

dotenv.config(); // Reloaded with Gmail SMTP configuration

// Startup Environment Validation
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  process.env.SESSION_SECRET = 'srhu-portal-cryptographic-session-signing-secret-key-production-fallback-2026-v1-secure';
}

if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['DATABASE_URL', 'GOOGLE_CLOUD_PROJECT'];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0 && (!process.env.DB_HOST || !process.env.DB_NAME)) {
    console.warn(`⚠️ CONFIGURATION NOTICE: Missing production environment variables: ${missing.join(', ')}`);
    console.warn('👉 Configure DATABASE_URL in your Render Dashboard (Environment -> Environment Variables) to enable PostgreSQL persistence.');
  }
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

// Security & Header Configurations
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
// Permissive and secure CORS for Firebase Hosting, Render and Local Development
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [
      'https://attendace-d3b3e.web.app',
      'https://attendace-d3b3e.firebaseapp.com',
      'http://localhost:8080',
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-side cron, or Render health probes)
      if (!origin) return callback(null, true);

      // In production or development, reflect requesting origin if matching domain pattern or explicit list
      if (
        process.env.ALLOWED_ORIGINS === '*' ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.web.app') ||
        origin.endsWith('.firebaseapp.com') ||
        origin.endsWith('.onrender.com') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, origin);
      }
      // Allow origin to avoid blocking frontend while supporting credentials
      return callback(null, origin);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Session-Id', 'Idempotency-Key'],
  })
);
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend assets from project root if directory exists
const projectRoot = path.resolve(__dirname, '../../');
try {
  app.use(express.static(projectRoot));
} catch (_e) {}

// Liveness Probe: indicates whether the process is alive and responsive
app.get(['/health', '/api/health'], async (_req, res) => {
  res.json({
    status: 'ALIVE',
    service: 'attendance-backend',
    timestamp: new Date().toISOString(),
    version: '1.8.0',
  });
});

// Readiness Probe: indicates whether mandatory dependencies (PostgreSQL) are ready for traffic
app.get(['/ready', '/api/ready'], async (_req, res) => {
  const dbOnline = await isDbConnected();
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !dbOnline) {
    res.status(503).json({
      status: 'NOT_READY',
      service: 'attendance-backend',
      database: 'DISCONNECTED',
      error: 'DATABASE_UNAVAILABLE: Production database connection required.',
      timestamp: new Date().toISOString(),
      version: '1.8.0',
    });
    return;
  }

  res.json({
    status: 'READY',
    service: 'attendance-backend',
    database: dbOnline ? 'CONNECTED' : 'STANDBY_LOCAL',
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

async function startServer() {
  const dbOnline = await isDbConnected();
  if (process.env.NODE_ENV === 'production') {
    if (dbOnline) {
      console.log('✅ PostgreSQL connection verified for production environment.');
    } else {
      console.warn('⚠️ CONFIGURATION NOTICE: PostgreSQL connection not established in production.');
      console.warn('👉 Set DATABASE_URL in Render Dashboard (Environment -> Environment Variables) to connect your PostgreSQL instance.');
      console.warn('🔒 Readiness probe (/ready) will return HTTP 503 and database routes will fail closed until DATABASE_URL is configured.');
    }
  } else {
    console.log(`ℹ️ Database status: ${dbOnline ? 'PostgreSQL CONNECTED' : 'In-memory fallback (development mode)'}`);
  }

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
}

startServer();

export default app;
