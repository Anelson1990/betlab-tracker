plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.june.watchcompanion.phone"
    compileSdk = 34

    defaultConfig {
        // SAME applicationId as :wear — required for the Wear Data Layer to pair
        // the two apps (together with the SAME signing key). Do not diverge.
        applicationId = "ai.june.watchcompanion"
        minSdk = 26
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
    buildFeatures { viewBinding = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.google.android.gms:play-services-wearable:18.2.0")
}
