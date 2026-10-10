plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zenz.transmitter"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.zenz.transmitter"
        minSdk = 24
        // 34 evita o modo "borda a borda" obrigatório do Android 15 neste layout simples.
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        // Celulares de verdade são arm; evita APK gigante com x86.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
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
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // libwebrtc pré-compilada (API org.webrtc.*)
    implementation("io.getstream:stream-webrtc-android:1.3.9")
}
