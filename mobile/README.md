# TechAssures Lab: Android app (sideload)

The app is a thin shell that opens the live site, so server updates reach everyone without a new APK.
GitHub builds and signs it: Actions → "Build Android app" → Run workflow → download the `TechAssures-Lab-apk` artifact.

One-time setup: in the repo, Settings → Secrets and variables → Actions, add
- `ANDROID_KEYSTORE_B64` – the base64 text of your release keystore
- `ANDROID_KEYSTORE_PASSWORD` – its password (alias is `techassures`)

Keep the keystore safe. Every future build must be signed with the same key, otherwise phones refuse to update the app.
Google sign-in: create an Android OAuth client in Google Cloud with package `in.techassures.lab` and the keystore's SHA-1.
