plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.june.watchcompanion.wear"
    compileSdk = 34

    defaultConfig {
        // SAME applicationId as :phone — required for the Data Layer to pair them
        // (with the SAME signing key). Do not diverge.
        applicationId = "ai.june.watchcompanion"
        minSdk = 30            // Wear OS 3+
        targetSdk = 34
        versionCode = 1
        versionName = "0.1-v0"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    // Compose compiler extension pinned to Kotlin 1.9.24 (1.5.14). If you bump
    // Kotlin to 2.0+, remove this and apply the org.jetbrains.kotlin.plugin.compose plugin.
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.google.android.gms:play-services-wearable:18.2.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.wear.compose:compose-material:1.3.1")
    implementation("androidx.wear.compose:compose-foundation:1.3.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
