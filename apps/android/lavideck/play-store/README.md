# Google Play / Android Studio build for Lavi Shortcuts

Open this play-store directory in Android Studio with Android SDK API 36,
Android Gradle Plugin 8.13.2, Gradle 8.13, and JDK 17.

Source paths point to ../app/src/main so APK and Play build share the same code.
For CI, the workflow at play-store/.github/workflows/android-ci.yml expects
this repository layout at root; copy that workflow into .github/workflows
when uploading the full LAVI_APPS_SHORTCUT project to GitHub.

Build:
    gradle :app:assembleDebug :app:bundleRelease :app:lintDebug

To SIGN release bundle set four environment vars for the build process:
LAVI_UPLOAD_KEYSTORE = absolute path to copied keystore
LAVI_UPLOAD_PASSWORD = private keystore password
LAVI_UPLOAD_ALIAS = laviapps

Never publish signing/ or source bundle containing private signing secrets.
CI without credentials produces an unsigned bundle for validation only.
Official signed AAB is also generated locally by build-aab.sh.

Google Play: an already-created certified developer account, Play Console
registration, Data Safety form, hosted privacy policy, graphics, real-device
testing, and completed review are still required.
