# Deck Photo Uploads Design

## Goal

Allow players to attach a photo of their drafted deck to their player entry for a draft or tournament. Photos should be visible to all approved users, but they should not clutter draft history by rendering inline by default.

## User Experience

Player chips in draft history remain compact. A player with an uploaded deck photo shows a small photo/camera icon on their chip. A player without a photo shows no icon, so users can immediately tell which players have photos without opening anything.

Clicking the photo icon opens a modal viewer. The modal focuses on the photo and includes the player name, the player's color identity if set, the draft title/date context, a close control, and an option to open the full-size image in a new tab.

Clicking the player chip keeps the current behavior: linked players and admins can open the player metadata editor. Inside that existing inline editor:

- If no photo exists, show a compact upload control.
- If a photo exists, show a small thumbnail plus replace and remove controls.
- Keep color identity controls first; deck photo controls are secondary metadata.

The file input accepts images with `accept="image/*"`. Version 1 does not add client-side file-size limits or image compression.

## Data Model

Extend `DraftPlayer` with optional deck photo metadata:

```ts
deckPhotoUrl?: string;
deckPhotoPath?: string;
deckPhotoUploadedAt?: Timestamp;
```

`deckPhotoUrl` is used for display. `deckPhotoPath` is used when replacing or removing the stored image. `deckPhotoUploadedAt` provides stable history metadata and can help future sorting/auditing if needed.

## Storage

Use Firebase Storage for image files. Store photos under a draft/player scoped path:

```text
deckPhotos/{draftId}/{playerId}/{generatedFilename}
```

Generated filenames avoid collisions when a player replaces a photo. When replacing or removing a photo, delete the previous `deckPhotoPath` if present after the metadata update succeeds.

## Permissions

All approved users can view deck photos.

Only the linked player for a `DraftPlayer` or an admin can upload, replace, or remove that player's photo. This matches the existing color identity editing model.

Firestore draft update rules continue to allow approved users to update draft player metadata. Firebase Storage rules should enforce read access for approved users and write/delete access for the owning linked user or admin.

## State Updates

Player metadata updates should be transactional. The current color identity flow rewrites the full `players` array from local state, which can lose concurrent player metadata edits. Deck photo work should introduce a shared transaction-based helper for updating one player inside the latest draft document, then use it for:

- color identity updates
- deck photo metadata updates

This keeps color and photo edits from overwriting each other when different users update their own deck metadata around the same time.

## Components

Add a small deck photo viewer modal component used by draft history player chips.

Extend the existing `PlayersWithArchetype` area rather than creating a new history section. The player chip owns the compact photo indicator; the inline editor owns upload/replace/remove controls.

## Error Handling

Show a concise inline error if upload, replace, remove, or metadata save fails. Keep the editor open so the user can retry.

If an upload succeeds but metadata update fails, attempt to delete the newly uploaded object to avoid orphaned storage. If cleanup fails, log the error and keep the user-facing message focused on the failed save.

If metadata update succeeds but old-photo deletion fails during replace/remove, keep the new visible state and log the cleanup failure.

## Testing

Add unit coverage for the transaction-based player metadata helper:

- preserves existing player fields while updating one player's photo metadata
- preserves concurrent metadata already present in the latest Firestore snapshot
- removes photo metadata without removing color identity
- keeps photo metadata when updating color identity

Add UI-level tests only if the current test setup supports component interaction without large new test infrastructure. Otherwise verify the UI manually in the browser as part of implementation.

## Out of Scope

- Client-side image compression
- Explicit file-size validation
- Image galleries
- Multiple deck photos per player
- Private or owner-only visibility
