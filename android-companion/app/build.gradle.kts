plugins {
    id("com.android.application") version "8.6.0"
    id("org.jetbrains.kotlin.android") version "2.0.20"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.20"
    id("com.google.gms.google-services") version "4.4.2"
}

android {
    namespace = "ai.researchmate.slr"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.researchmate.slr"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "3.0.0"

        buildConfigField("String", "API_BASE_URL", "\"https://ais-pre-u5d2abymag3t4nh76ks2gf-560885339256.europe-west2.run.app/\"")
    }

    signingConfigs {
        create("release") {
            // Configure via gradle.properties or CI secrets for Google Play App Signing
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "release-keystore.jks")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")

    // Firebase Auth + Firestore + Storage
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-firestore-ktx")
    implementation("com.google.firebase:firebase-storage-ktx")
    implementation("com.google.android.gms:play-services-auth:21.2.0")

    // Networking & Offline Sync
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Google Play Billing Library
    implementation("com.android.billingclient:billing-ktx:7.1.1")
}
