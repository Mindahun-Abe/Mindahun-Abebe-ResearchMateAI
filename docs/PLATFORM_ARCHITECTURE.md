# ResearchMate AI Platform Architecture & Operations Guide

## 1. System Architecture
- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + `vite-plugin-pwa` (installable offline-ready PWA).
- **Backend API**: Express (`server.ts` + `src/server/commercialRoutes.ts`) serving Vite in development (`npm run dev`) and static `dist/` in production (`npm run start`) on port `3000`.
- **Authentication**: Firebase Authentication (`signInWithPopup` Google Sign-In + Email/Password registration, verification & password reset) verified server-side via `firebase-admin` ID tokens (`src/middleware/auth.ts`).
- **Relational Database**: Cloud SQL PostgreSQL (`europe-west2`, instance `ai-studio-79fef535`) managed via Drizzle ORM (`src/db/schema.ts`, `src/db/commercial.ts`).
- **Document Sync & Real-Time Store**: Cloud Firestore (`ai-studio-remixresearchmat-79fef535-a9b7-4fe6-b96d-5653c2f18a76`) governed by Eight-Pillars `firestore.rules` and `firebase-blueprint.json`.
- **Object Storage**: Firebase Storage governed by owner-isolated `storage.rules` + quota enforcement in PostgreSQL `storage_documents`.
- **Legacy Partitioned Disk Reviews Preserved**: Local SLR review folders under `./database/reviews/<slug>__<id>/` remain 100% readable and writable without disrupting existing datasets.

## 2. Database Tables (`src/db/schema.ts`)
- `users`: UID, email, role (`researcher`, `institutional`, `admin`), status (`active`, `suspended`), `plan_code`, `ai_credits_balance`, `storage_used_bytes`, organization, country, `email_verified`, `mfa_enabled`, `last_login_at`.
- `subscription_plans`: Configurable limits (`max_projects`, `max_articles_per_project`, `monthly_ai_credits`, `storage_quota_mb`, `team_seats`, USD/ETB pricing).
- `subscriptions`: Active entitlement tracking across providers (`free`, `chapa`, `telebirr`, `google_play`, `admin_grant`), trial/grace dates, cancellation flags.
- `payment_transactions`: Idempotent `tx_ref`, invoice numbers, currency, verification & refund timestamps.
- `cloud_projects`, `research_notes`, `research_snapshots`, `storage_documents`: Owner-scoped SLR persistence.
- `login_history`, `audit_logs`, `announcements`, `support_tickets`: Security telemetry, admin governance, and user support.

## 3. Cloud Run Deployment Runbook
1. Set environment variables in Cloud Run / AI Studio Secrets (never commit secrets):
   - `GEMINI_API_KEY`, `APP_URL`, `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`.
2. Build frontend assets:
   ```bash
   npm run build
   ```
3. Start production server (`NODE_ENV=production npm start`).
4. Deploy Firestore & Storage rules:
   - `firestore.rules` (linted via `npx eslint firestore.rules`)
   - `storage.rules` (via Firebase Console or `firebase deploy --only storage`).

## 4. Backup, Recovery & Data-Retention Policy
- **Cloud SQL Automated Backups**: Enable automated daily backups and Point-in-Time Recovery (PITR) on Cloud SQL instance `ai-studio-79fef535` (GCP Console -> SQL -> Backups).
- **Review JSON Export & Account Portability**: Users can export full SLR project JSON/RIS/BibTeX/CSV bundles via **Export & Backup Hub** and full personal records via `GET /api/account/export`.
- **Retention**: Deleting an account via `DELETE /api/account/delete` cascades deletions across `users`, `cloud_projects`, `research_notes`, `research_snapshots`, and `storage_documents` while preserving anonymized `audit_logs` compliance records.
