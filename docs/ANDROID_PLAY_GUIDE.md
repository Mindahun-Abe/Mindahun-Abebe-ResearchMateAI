# Android Companion & Google Play App Bundle Guide

## 1. Included Companion Source (`android-companion/`)
The `android-companion/` folder provides a Kotlin + Jetpack Compose starter module aligned with the ResearchMate AI cloud backend:
- `app/build.gradle.kts`: Targets Android 15 (API 35), minSdk 26, Jetpack Compose, Firebase Auth/Firestore/Storage, WorkManager, Retrofit, and Play Billing v7.
- `app/src/main/java/ai/researchmate/slr/network/ApiClient.kt`: Connects directly to `/api/account/me`, `/api/cloud/projects`, and `/api/cloud/sync`.
- `app/src/main/java/ai/researchmate/slr/MainActivity.kt`: Compose UI for researcher login, cloud sync status badge, entitlement display, and synced project list.

## 2. Google Play Signing & `.aab` Build Checklist (Requires Local Android Studio / SDK)
1. Place `google-services.json` from Firebase Console (Project `exemplary-plasma-r4mm2`) into `android-companion/app/`.
2. Generate an upload keystore (keep offline backup):
   ```bash
   keytool -genkey -v -keystore release-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias researchmate-upload
   ```
3. Export environment variables for Gradle signing:
   - `ANDROID_KEYSTORE_PATH`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
4. Build signed Android App Bundle:
   ```bash
   ./gradlew bundleRelease
   ```
   Output: `app/build/outputs/bundle/release/app-release.aab`.
5. Upload to **Google Play Console** with **Play App Signing** enabled, configure subscription product IDs matching `subscription_plans.code`, and attach your Play Developer API service account JSON (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`) on the backend for server-side purchase verification.
