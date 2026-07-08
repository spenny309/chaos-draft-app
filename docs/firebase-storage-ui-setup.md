# Firebase Storage Setup for Deck Photo Uploads

This guide fixes the browser upload error:

```text
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin
'https://mtgchaos.vercel.app' has been blocked by CORS policy
```

That error happens before Firebase Storage rules are evaluated. Vercel deploys the app, but CORS and Firebase rules must be configured in Firebase / Google Cloud.

## 1. Confirm the Storage Bucket

1. Open the Firebase Console.
2. Select the `mtg-chaos-draft` project.
3. Go to **Build** > **Storage**.
4. Confirm the bucket name.

The upload error suggests the bucket is:

```text
mtg-chaos-draft.firebasestorage.app
```

Use the bucket shown in the Firebase Console if it differs.

## 2. Configure Storage CORS in the Google Cloud UI

1. Open the Google Cloud Console.
2. Select the same project used by Firebase: `mtg-chaos-draft`.
3. Go to **Cloud Storage** > **Buckets**.
4. Click the Firebase Storage bucket.
5. Open the **Configuration** tab.
6. Find **Cross-origin resource sharing (CORS)**.
7. Click **Edit CORS configuration**.
8. Enable **Allow cross-origin resource sharing**.
9. Add a CORS configuration with these values:

| Field | Value |
| --- | --- |
| Origins | `https://mtgchaos.vercel.app` |
| Methods | `GET`, `POST`, `PUT`, `DELETE`, `HEAD` |
| Response headers | `Content-Type`, `Authorization`, `x-goog-upload-command`, `x-goog-upload-header-content-type`, `x-goog-upload-protocol` |
| Max age | `3600` |

10. Save the configuration.

Optional local development origins:

```text
http://localhost:5173
http://localhost:4173
```

Add these only if you upload photos from local Vite dev or preview builds.

## 3. Publish Firebase Storage Rules

1. Open the Firebase Console.
2. Go to **Build** > **Storage**.
3. Open the **Rules** tab.
4. Replace the rules with the contents of [`../storage.rules`](../storage.rules).
5. Click **Publish**.

These rules allow approved users to view deck photos and allow admins or the uploading owner UID to create/update/delete objects under:

```text
deckPhotos/{draftId}/{playerId}/{ownerUid}/{fileName}
```

## 4. Publish Firestore Rules

1. Open the Firebase Console.
2. Go to **Build** > **Firestore Database**.
3. Open the **Rules** tab.
4. Replace the rules with the contents of [`../firestore.rules`](../firestore.rules).
5. Click **Publish**.

These rules are needed because uploaded Storage objects are only useful after the app attaches their URL/path metadata to the draft player record. The Firestore rules restrict non-admin player metadata updates to the linked player slot.

## 5. Test Uploading

1. Open `https://mtgchaos.vercel.app/history`.
2. Sign in as an approved user.
3. Expand a draft where your account is linked to a player, or sign in as an admin.
4. Open the player metadata editor.
5. Upload a deck photo.

Expected result:

- The upload completes without a CORS preflight error.
- The player chip shows the small photo indicator.
- Clicking the photo indicator opens the viewer modal.

If CORS is fixed but rules are not, the error will usually change to a Firebase authorization error such as `storage/unauthorized` or a Firestore permission error. In that case, re-check that both Storage rules and Firestore rules were published to the same Firebase project used by the deployed Vercel app.

## References

- Google Cloud Storage CORS UI: https://docs.cloud.google.com/storage/docs/using-cors
- Firebase Storage Security Rules: https://firebase.google.com/docs/storage/security
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
