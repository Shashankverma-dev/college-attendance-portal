# College Attendance Management System — Backend Service (Phase 2)

Production backend service for the College Attendance Management System built with Node.js 20, TypeScript, Express, Firebase Admin SDK, and PostgreSQL (Cloud SQL).

---

## 1. Architecture Overview

- **Database Engine:** PostgreSQL 15+ (Cloud SQL / Firebase Data Connect) with PgBouncer connection pooling.
- **Security & Multi-Tenancy:**
  - **Transaction-Local Row-Level Security (RLS):** Injected via `SET LOCAL app.current_department_id = ...` and `SET LOCAL app.current_user_id = ...` inside explicit transactions (`BEGIN ... COMMIT`).
  - **Connection-Pool Isolation:** Prepared for PgBouncer transaction mode with `server_reset_query = DISCARD ALL`.
  - **Per-Device Session Tracking:** Enforces a 15-minute server-side inactivity timeout and 8-hour absolute session duration in `user_sessions`.
  - **Account-Wide Revocation:** Cascades to all device sessions and invokes `firebaseAuth.revokeRefreshTokens(uid)`.
- **Integrity & Idempotency:**
  - **Linear Sequential Cryptographic Hash Chain:** Audit log rows compute $H_i = \text{SHA-256}(H_{i-1} \parallel \text{actor} \parallel \text{action} \parallel \text{target} \parallel \text{details} \parallel \text{timestamp})$. Verification endpoint detects tampering and emits a **P1 security incident alert**.
  - **Persistent Idempotency:** Backed by `processed_idempotency_keys` table to protect task retries, activation emails, and account activations against duplicate execution across infinite time horizons.
- **Email Infrastructure:**
  - Google Workspace SMTP Relay with pre-onboarding quota checks (2,000/day threshold) and transactional fallback support.

---

## 2. Directory Structure

```text
backend/
├── db/
│   ├── schema.sql         # Production DDL: 20 entities, RLS policies, hash chain triggers
│   └── seed.sql           # Seed data: BCA & B.Tech academic structures, faculty assignments
├── src/
│   ├── config/
│   │   ├── db.ts          # PostgreSQL connection pool & transaction context runner
│   │   └── firebase.ts    # Firebase Admin SDK initialization
│   ├── middleware/
│   │   └── auth.ts        # ID token validation & 15-min idle timeout enforcement
│   ├── routes/
│   │   ├── academic.routes.ts    # Courses, semesters, sections, 5-tier calendar
│   │   ├── attendance.routes.ts  # Sessions, roster, session locking, student summaries
│   │   └── auth.routes.ts        # Session init, device logout, account-wide logout
│   ├── services/
│   │   ├── audit.ts       # Linear hash-chained audit logger and P1 verification
│   │   ├── email.ts       # Google Workspace SMTP Relay & quota verifier
│   │   └── idempotency.ts # Persistent application-level idempotency
│   └── server.ts          # Express application entry point
├── Dockerfile             # Multi-stage production container for Google Cloud Run
├── package.json           # Service dependencies
└── tsconfig.json          # TypeScript build configuration
```

---

## 3. Database Setup

1. Connect to your PostgreSQL instance (Cloud SQL or local):
   ```bash
   psql -U postgres -d attendance_db -f db/schema.sql
   ```
2. Populate the seed academic structures (BCA, B.Tech, sections, initial faculty & student accounts):
   ```bash
   psql -U postgres -d attendance_db -f db/seed.sql
   ```

---

## 4. Local Development

1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Configure `.env`:
   ```bash
   cp .env.example .env
   # Update database credentials and Google Cloud project ID
   ```
3. Run in development mode:
   ```bash
   npm run dev
   ```
4. Build and run in production mode:
   ```bash
   npm run build
   npm start
   ```

---

## 5. Google Cloud Run Deployment

Deploy the containerized service directly to Google Cloud Run:
```bash
gcloud run deploy attendance-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances <INSTANCE_CONNECTION_NAME> \
  --set-env-vars "NODE_ENV=production,DB_NAME=attendance_db,GOOGLE_CLOUD_PROJECT=<PROJECT_ID>"
```
