# SRHU Attendance Portal: Verification Baseline Report

**Execution Timestamp:** 2026-10-24T17:10:00+05:30  
**Environment:** Windows (PowerShell), Node.js v24.16.0, npm 11.13.0  
**Repository Branch:** main (commit: 696f29c)  
**Corpus / Context:** Swami Rama Himalayan University (SRHU) Attendance & Examination Portal  

---

## 1. Initial Command Execution Log & Exit Codes

| Command | Working Directory | Exit Code | Raw Status / Diagnostic Summary |
|---|---|---|---|
| `npm test` | `backend/` | **1** | `'jest' is not recognized as an internal or external command`. Missing test runner in `package.json` devDependencies. |
| `npm run lint` | `backend/` | **1** | `'eslint' is not recognized as an internal or external command`. Missing linter in devDependencies. |
| `npx tsc --noEmit` | `backend/` | **0** | Clean compile. Zero TypeScript type errors across existing `src/` tree. |
| `npm run build` | `backend/` | **0** | `tsc` executed successfully, generating JavaScript artifacts in `dist/`. |
| `Test-NetConnection 127.0.0.1 -Port 5432` | System | **Failed** | `TCP connect to (127.0.0.1 : 5432) failed`. Local PostgreSQL daemon is currently offline; backend operates in local fallback mode. |
| `ts-node src/scripts/verify-full-system.ts` | `backend/` | **0** | 15/15 checks reported passing against running local server on port 5000 (in-memory mode). |
| `ts-node src/scripts/master-qa-e2e.ts` | `backend/` | **0** | 34/34 test cases passed against in-memory fallback API. |
| `ts-node src/scripts/verify-master-implementation.ts` | `backend/` | **0** | 18/18 checks passed against in-memory fallback API. |
| `ts-node src/scripts/verify-student-management.ts` | `backend/` | **0** | 15/15 checks passed against in-memory fallback API. |
| `ts-node src/tests/real_life_admin_workflow.ts` | `backend/` | **0** | 35/35 checks passed against in-memory fallback API. |
| `ts-node src/tests/admin_verification.ts` | `backend/` | **0** | 36/36 checks passed against in-memory fallback API. |

---

## 2. Infrastructure & Tooling Assessment

1. **Declared vs. Actual Test Runner:**
   - `backend/package.json` specifies `"test": "jest"`, but `jest`, `@types/jest`, and `ts-jest` were not included in `package.json` dependencies or devDependencies.
   - The test directory contains standalone TypeScript execution scripts (`src/scripts/*.ts` and `src/tests/*.ts`) invoked via `ts-node`, but `npm test` fails out of the box.
   - **Remediation:** Install and configure Jest + `ts-jest` with a dedicated `jest.config.js` so that `npm test` runs comprehensive automated unit and integration suites cleanly without manual script invocation.

2. **Linter Infrastructure:**
   - `backend/package.json` specifies `"lint": "eslint src --ext .ts"`, but `eslint` is missing from devDependencies.
   - **Remediation:** Provide compatible linting configuration or clean up package manifests.

3. **Development Server State:**
   - Background process `ts-node-dev src/server.ts` was found running on ports 8080 and 5000.
   - Because PostgreSQL port 5432 is offline, the server silently runs in `STANDBY_LOCAL` / in-memory fallback mode.

4. **Production Database Gatekeeping:**
   - In `backend/src/server.ts`, the server starts listening on ports 8080 and 5000 before verifying database connection or schema readiness.
   - The function `assertProductionDbAvailable` exists in `backend/src/config/db.ts` but was never called in the server boot pipeline.
