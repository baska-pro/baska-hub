# LaviDeck publication readiness
Technical outputs:
[x] Application display name LaviDeck, versionCode 4 / versionName 2.2.0.
[x] Existing package com.lavi.apphub preserved for in-place update.
[x] Java/DEX APK build, v2/v3 APK verification and AAB bundle validation.
[x] API target 36 in manifest and Gradle Android compile SDK 36 sources.
[x] Narrow <queries> for launcher apps. No INTERNET/QUERY_ALL_PACKAGES.
[x] App drawer converted to recycled ListView rows (virtualization).
[x] Sticky drag/drop destination targets + backup menu for failed drag.
[x] Light Mode default retained; old user settings remain unchanged.
[ ] Real device validation: install/update, scroll, drag/drop, PIN, biometric,
    backup/export, website shortcut, accessibility and Android 15/16 insets.
[ ] Run CI Gradle + Android lint in clean environment with Android SDK 36.
[ ] Host support website/privacy policy with actual developer contact email.
[ ] Obtain real device screenshots; review store graphic.
[ ] Complete Google Play Data Safety, app content, app signing and submission.
[ ] Submit signed bundle to Play internal testing and resolve Play Console flags.
No claim of Play approval or production readiness until these gates pass.
