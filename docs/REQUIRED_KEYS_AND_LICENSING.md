# ResearchMate AI — Required Keys, Licenses & Non-Key Readiness Checklist

This document lists **what is already configured and active right now without commercial/business licenses**, versus **which keys and merchant/store credentials are intentionally deferred** until your personal business license and third-party approvals are ready.

---

## 1. Already Configured & Working Without Commercial Keys

No payment keys or business license are required to run the full web workbench, database, authentication, PWA, and literature search platform:

| Subsystem | Configuration Files | Status |
|---|---|---|
| **Web Frontend & PWA** | `vite.config.ts`, `index.html`, `package.json` | Active on port `3000` (`npm run dev` / `npm start`) |
| **Firebase Auth & Cloud Firestore** | `firebase-applet-config.json`, `firestore.rules`, `firebase-blueprint.json`, `src/lib/firebase.ts`, `src/lib/firebase-admin.ts` | Active (`ai-studio-remixresearchmat-79fef535-a9b7-4fe6-b96d-5653c2f18a76`) |
| **Firebase Storage Rules** | `storage.rules` | Configured with owner-isolated PDF & attachment paths |
| **Cloud SQL PostgreSQL + Drizzle ORM** | `src/db/schema.ts`, `src/db/index.ts`, `src/db/drizzle.config.ts`, `src/db/commercial.ts` | Active schema for users, plans, projects, notes, snapshots, audit logs |
| **Local Partitioned Review Storage** | `server.ts` (`./database/reviews/`) | Active isolated review folders + chunked JSON persistence |
| **Focused Online Literature Search** | `server.ts` (`/api/online/search`) | Active across PubMed, Europe PMC, Crossref Polite Pool, DOAJ, OpenAIRE, arXiv, Google Scholar, and publisher filters (no keys required) |
| **Android Companion Source** | `android-companion/` | Kotlin + Jetpack Compose starter project configured against `/api/*` |

---

## 2. Deferred Keys Requiring Business License / Approvals (Add When Ready)

Payment and commercial store gateways remain gracefully optional (`chapaConfigured: false`, `telebirrConfigured: false`, `googlePlayConfigured: false` in `/api/commercial/plans` and `/api/commercial/admin/health`) so the platform runs cleanly without blocking development or research workflows.

When your business license and merchant accounts are approved, set these **server-side environment variables** in Cloud Run / `.env` (never expose them in frontend `VITE_*` variables):

### A. Chapa Hosted Checkout (Requires Business License & Chapa Merchant Approval)
- `CHAPA_SECRET_KEY` — Live/Test secret key from Chapa Merchant Dashboard
- `CHAPA_WEBHOOK_SECRET` — Webhook HMAC verification secret
- `APP_URL` — Public HTTPS Cloud Run URL (for verified return & webhook callbacks)

### B. Telebirr Merchant Payment (Requires Business License & Ethio Telecom Merchant Onboarding)
- `TELEBIRR_APP_ID`
- `TELEBIRR_APP_KEY`
- `TELEBIRR_MERCHANT_CODE`
- `TELEBIRR_PRIVATE_KEY`

### C. Google Play Billing & Android Publication (Requires Google Play Developer Account & Verification)
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — Google Cloud Service Account JSON with Android Publisher API permission for server-side purchase verification
- `android-companion/app/google-services.json` — Downloaded from Firebase Console (Android package matching `applicationId`)
- Release App Bundle signing keys (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) — see `docs/ANDROID_PLAY_GUIDE.md`

### D. AI & Optional Literature Index API Keys
- `GEMINI_API_KEY` — Server-side Gemini API key (automatically injected when running in AI Studio / Cloud Run with Gemini enabled)
- `OPENALEX_API_KEY` *(optional)* — Raises OpenAlex daily quota if added later
- `SEMANTIC_SCHOLAR_API_KEY` *(optional)* — Raises Semantic Scholar Graph API rate limits if an API key is obtained
- `SCOPUS_API_KEY` *(optional, institutional)* — Enables direct Elsevier Scopus API calls when institutional access is configured
- `WOS_API_KEY` *(optional, institutional)* — Enables direct Clarivate Web of Science API calls when institutional access is configured

---

## 3. Pre-Launch Verification Commands (Once Keys Are Added)
1. Verify TypeScript & bundle build:
   ```bash
   npm run lint && npm run build
   ```
2. Push PostgreSQL schema if Cloud SQL env vars changed:
   ```bash
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   ```
3. Inspect live gateway readiness as an Admin via `GET /api/commercial/admin/health` and `GET /api/commercial/plans`.
