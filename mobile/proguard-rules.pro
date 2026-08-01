# Règles ProGuard/R8 — build de release Android (audit P2-8).
#
# `flutter build apk --release` active R8 dès que `minifyEnabled true`
# est posé dans le module Gradle (cf. android/app/build.gradle.kts,
# fragment fourni dans tools/android/build-release.gradle.kts.snippet).
#
# Ce fichier n'est PAS régénéré par `flutter create` : il est versionné
# ici et référencé depuis la configuration de build.
#
# Principe : R8 ne voit pas les appels faits par réflexion ni par les
# canaux de plateforme. Tout ce qui traverse une frontière JNI/Dart doit
# être conservé explicitement, sinon l'application compile, s'installe,
# puis échoue à l'exécution — le pire des trois moments.

# ── Flutter ─────────────────────────────────────────────────────────────
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# ── SQLite / drift (sqlite3_flutter_libs charge une lib native) ─────────
-keep class com.tekartik.sqflite.** { *; }
-keep class org.sqlite.** { *; }
-dontwarn org.sqlite.**

# ── Firebase Cloud Messaging (audit P1-3) ───────────────────────────────
# Les services FCM sont instanciés par le framework Android, pas par
# notre code : sans ces règles, les notifications cessent d'arriver en
# release alors qu'elles fonctionnent en debug.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }

# ── WorkManager (sync de fond) ──────────────────────────────────────────
# Les Worker sont résolus par NOM de classe à l'exécution.
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }
-keep class be.tramckrijte.workmanager.** { *; }

# ── flutter_secure_storage (Keystore Android) ───────────────────────────
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# ── Cryptographie (pointycastle, cryptography) ──────────────────────────
# Les fournisseurs BouncyCastle sont chargés par réflexion.
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**
-keep class javax.crypto.** { *; }

# ── Play Core (différé par Flutter, absent de nos deps) ─────────────────
-dontwarn com.google.android.play.core.**

# ── Diagnostic ──────────────────────────────────────────────────────────
# Conserver les numéros de ligne : sans eux, les rapports de crash
# remontent des piles inexploitables. Le mapping reste privé
# (à téléverser dans la console Play, jamais dans le dépôt).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations utilisées par les bibliothèques de sérialisation.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# ── Interdit ────────────────────────────────────────────────────────────
# Ne JAMAIS ajouter `-dontobfuscate` : l'obfuscation est une partie de la
# valeur de R8 pour une application distribuée.
