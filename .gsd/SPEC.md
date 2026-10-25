# Swami Rama Himalayan University (SRHU) Attendance & Examination Portal

> **Status**: `FINALIZED`
>
> ⚠️ **Planning Lock**: Specification baseline is locked and approved.

## Vision
An institutional-grade, multi-role academic management, attendance tracking, and examination portal designed for Swami Rama Himalayan University (SRHU). Built with Node.js 20, TypeScript, Express, PostgreSQL (Cloud SQL), Firebase Authentication, and a responsive frontend adhering strictly to the SRHU institutional design system.

## Goals
1. **Multi-Role RBAC & Academic Scoping** — Enforce strict server-side role boundaries across Global Administrator, Head of Department (HOD), Faculty/Teacher, and Student with school and department scoping.
2. **Attendance Integrity & Rotating QR Codes** — Zero-denominator safety, leave-exclusion calculation, duplicate-session prevention, and dynamic HMAC-SHA256 rotating QR-code attendance sessions with anti-replay protection.
3. **Dual Institutional Identifiers** — Independent validation and storage for both Enrollment Numbers (e.g. `SRHU/2026/001`) and Registration Numbers (e.g. `REG2026101`), preserving exact casing and leading zeros.
4. **Timetable Planning & Conflict Engine** — Strict interval validation ($\text{start} < \text{end}$), teacher and classroom overlap detection, and parallel practical lab subgroup scheduling.
5. **Continuous Internal Assessment (CIA) & Examination** — Structured marks lifecycle (`DRAFT` $\to$ `SUBMITTED` $\to$ `PUBLISHED`) with student privacy isolation.
6. **Cryptographic Audit Trail** — Linear SHA-256 hash-chained audit logging ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{payload}_i)$) with tamper-detection verification.

## Non-Goals (Out of Scope)
- Commercial payment gateway processing for student tuition fees.
- Unofficial third-party social media integrations.
- Client-side biometric attendance scanning without server verification.
- Arbitrary modification of published academic marks without administrator audit approval.

## Constraints
- **Runtime & Language**: Node.js >= 20.0.0, TypeScript 5.x on backend, Semantic HTML5/CSS3/ES6+ on frontend.
- **Authoritative Database**: PostgreSQL 15+ (Cloud SQL or Render PostgreSQL) with transactional Row-Level Security.
- **Identity & Auth**: Firebase Authentication with server-side Firebase Admin SDK token verification + HMAC-SHA256 session tokens.
- **Hosting**: Firebase Hosting for frontend static assets, Render / Cloud Run for Express API.
- **Branding**: SRHU Institutional Blue brand tokens (`#1D3C72`, `#2A5298`) and accessible typography.

## Success Criteria
- [x] Zero-denominator attendance calculation returns explicit `N/A` without dividing by zero.
- [x] Approved Leave (`L`) is strictly excluded from attendance rate numerator and denominator.
- [x] Dynamic rotating QR tokens expire within 20 seconds with valid HMAC verification.
- [x] Bulk student onboarding neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@`).
- [x] Linear hash-chained audit log passes verification queries with zero hash breaks.
- [x] All automated unit and integration tests in `backend/` execute and pass.

---

*Last updated: 2026-10-25*
