# Deck Photo Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let linked players and admins upload, replace, remove, and view deck photos from compact player chips in draft history.

**Architecture:** Store image files in Firebase Storage and store only optional photo metadata on `DraftPlayer`. Player metadata updates go through a transaction-based helper so color identity and photo changes merge into the latest draft document. Draft history keeps the existing compact player chip layout, adding a small photo thumbnail indicator and a modal viewer only when a photo exists.

**Tech Stack:** React 19, TypeScript, Zustand, Firebase Firestore, Firebase Storage, Vitest, Vite.

## Global Constraints

- Photos are visible to all approved users.
- Player chips stay compact; photos are not rendered inline by default.
- A player with a photo shows a visible indicator; a player without a photo shows no photo affordance.
- Linked player or admin can upload, replace, or remove that player's photo.
- Use `accept="image/*"` for the file input.
- Do not add client-side file-size validation.
- Do not add client-side image compression.
- Do not add galleries, multiple photos per player, or private photo visibility.
- Use transaction-based player metadata updates for color identity and deck photo metadata.

---

## File Structure

- Modify `src/types/index.ts`: add optional deck photo fields to `DraftPlayer`.
- Modify `src/firebase.ts`: export Firebase Storage as `storage`.
- Create `storage.rules`: document and enforce Storage read/write/delete access for deck photo objects.
- Modify `src/state/draftHistoryStore.ts`: add transactional player metadata helper, convert `setPlayerArchetype`, and add `setPlayerDeckPhoto`.
- Modify `src/state/__tests__/draftHistoryStore.test.ts`: cover transactional player metadata behavior and photo metadata behavior.
- Create `src/utils/deckPhotos.ts`: upload/delete Storage helpers with path generation.
- Modify `src/pages/DraftHistory.tsx`: add compact photo indicator, upload/replace/remove controls, and photo viewer modal.

---

### Task 1: Firebase Storage Types And Rules

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/firebase.ts`
- Create: `storage.rules`

**Interfaces:**
- Produces: `DraftPlayer.deckPhotoUrl?: string`
- Produces: `DraftPlayer.deckPhotoPath?: string`
- Produces: `DraftPlayer.deckPhotoUploadedAt?: Timestamp`
- Produces: `storage` export from `src/firebase.ts`

- [ ] **Step 1: Extend `DraftPlayer`**

In `src/types/index.ts`, change `DraftPlayer` to include the new optional fields:

```ts
export interface DraftPlayer {
  id: string;
  name: string;
  userId: string | null;
  primaryColors?: MtgColor[];
  splashColors?: MtgColor[];
  deckPhotoUrl?: string;
  deckPhotoPath?: string;
  deckPhotoUploadedAt?: Timestamp;
}
```

- [ ] **Step 2: Export Firebase Storage**

In `src/firebase.ts`, add `getStorage` and export `storage`:

```ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
```

```ts
const storage = getStorage(app);

export { app, auth, db, storage };
```

- [ ] **Step 3: Add Storage rules**

Create `storage.rules`. The Storage path includes the uploader UID because the current draft `players` field is an array, which is not a reliable ownership index for Storage rules. Firestore still controls whether that uploaded object can be attached to a player record.

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAuthed() {
      return request.auth != null;
    }

    function userDoc() {
      return firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data;
    }

    function isApproved() {
      return isAuthed() && userDoc().status == 'approved';
    }

    function isAdmin() {
      return isApproved() && userDoc().role == 'admin';
    }

    match /deckPhotos/{draftId}/{playerId}/{ownerUid}/{fileName} {
      allow read: if isApproved();
      allow create, update, delete: if isApproved() && (isAdmin() || request.auth.uid == ownerUid);
    }
  }
}
```

- [ ] **Step 4: Verify TypeScript**

Run: `npm.cmd run build`

Expected: TypeScript and Vite build complete. Existing chunk-size warning is acceptable.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/firebase.ts storage.rules
git commit -m "feat: add deck photo storage fields"
```

---

### Task 2: Transactional Player Metadata Updates

**Files:**
- Modify: `src/state/draftHistoryStore.ts`
- Modify: `src/state/__tests__/draftHistoryStore.test.ts`

**Interfaces:**
- Consumes: `DraftPlayer` optional photo fields from Task 1.
- Produces: `updateDraftPlayerInTransaction(draftId, playerId, updatePlayer)` private helper.
- Produces: existing `setPlayerArchetype(draftId, playerId, primary, splash)` now transaction-backed.
- Produces: `setPlayerDeckPhoto(draftId, playerId, photo)` store action.

- [ ] **Step 1: Add failing tests for player metadata merging**

In `src/state/__tests__/draftHistoryStore.test.ts`, add helper data:

```ts
function makePlayerDraft(players = [
  { id: 'p1', name: 'One', userId: 'user-1' },
  { id: 'p2', name: 'Two', userId: 'user-2', deckPhotoUrl: 'https://old.test/photo.jpg', deckPhotoPath: 'deckPhotos/draft-1/p2/old.jpg' },
]): Draft {
  return {
    id: 'draft-1',
    type: 'regular',
    createdBy: 'creator',
    createdAt: 'CREATED' as any,
    status: 'preview',
    players,
  };
}
```

Add this test:

```ts
it('updates player archetype against the latest transaction snapshot without removing deck photo metadata', async () => {
  const transactionUpdate = vi.fn();
  mockRunTransaction.mockImplementation(async (_db, callback) => {
    await callback({
      get: vi.fn(async () => ({
        exists: () => true,
        data: () => makePlayerDraft([
          { id: 'p1', name: 'One', userId: 'user-1' },
          {
            id: 'p2',
            name: 'Two',
            userId: 'user-2',
            deckPhotoUrl: 'https://old.test/photo.jpg',
            deckPhotoPath: 'deckPhotos/draft-1/p2/old.jpg',
            deckPhotoUploadedAt: 'EARLIER' as any,
          },
        ]),
      })),
      update: transactionUpdate,
    });
  });

  useDraftHistoryStore.setState({ drafts: [makePlayerDraft()], loading: false, error: null });

  await useDraftHistoryStore.getState().setPlayerArchetype('draft-1', 'p2', ['U', 'B'], ['R']);

  const updatedPlayers = transactionUpdate.mock.calls[0][1].players;
  expect(updatedPlayers[1]).toMatchObject({
    id: 'p2',
    primaryColors: ['U', 'B'],
    splashColors: ['R'],
    deckPhotoUrl: 'https://old.test/photo.jpg',
    deckPhotoPath: 'deckPhotos/draft-1/p2/old.jpg',
  });
});
```

Add this test:

```ts
it('sets deck photo metadata without removing color identity', async () => {
  const transactionUpdate = vi.fn();
  mockRunTransaction.mockImplementation(async (_db, callback) => {
    await callback({
      get: vi.fn(async () => ({
        exists: () => true,
        data: () => makePlayerDraft([
          {
            id: 'p1',
            name: 'One',
            userId: 'user-1',
            primaryColors: ['G'],
          },
        ]),
      })),
      update: transactionUpdate,
    });
  });

  await useDraftHistoryStore.getState().setPlayerDeckPhoto('draft-1', 'p1', {
    url: 'https://new.test/photo.jpg',
    path: 'deckPhotos/draft-1/p1/new.jpg',
  });

  const updatedPlayers = transactionUpdate.mock.calls[0][1].players;
  expect(updatedPlayers[0]).toMatchObject({
    id: 'p1',
    primaryColors: ['G'],
    deckPhotoUrl: 'https://new.test/photo.jpg',
    deckPhotoPath: 'deckPhotos/draft-1/p1/new.jpg',
    deckPhotoUploadedAt: 'NOW',
  });
});
```

Add this test:

```ts
it('removes deck photo metadata without removing color identity', async () => {
  const transactionUpdate = vi.fn();
  mockRunTransaction.mockImplementation(async (_db, callback) => {
    await callback({
      get: vi.fn(async () => ({
        exists: () => true,
        data: () => makePlayerDraft([
          {
            id: 'p1',
            name: 'One',
            userId: 'user-1',
            primaryColors: ['R', 'G'],
            deckPhotoUrl: 'https://old.test/photo.jpg',
            deckPhotoPath: 'deckPhotos/draft-1/p1/old.jpg',
            deckPhotoUploadedAt: 'EARLIER' as any,
          },
        ]),
      })),
      update: transactionUpdate,
    });
  });

  await useDraftHistoryStore.getState().setPlayerDeckPhoto('draft-1', 'p1', null);

  const updatedPlayer = transactionUpdate.mock.calls[0][1].players[0];
  expect(updatedPlayer.primaryColors).toEqual(['R', 'G']);
  expect(updatedPlayer).not.toHaveProperty('deckPhotoUrl');
  expect(updatedPlayer).not.toHaveProperty('deckPhotoPath');
  expect(updatedPlayer).not.toHaveProperty('deckPhotoUploadedAt');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/state/__tests__/draftHistoryStore.test.ts`

Expected: FAIL because `setPlayerDeckPhoto` does not exist and `setPlayerArchetype` still uses `updateDoc`.

- [ ] **Step 3: Add store interface**

In `src/state/draftHistoryStore.ts`, extend `DraftHistoryState`:

```ts
setPlayerDeckPhoto: (
  draftId: string,
  playerId: string,
  photo: { url: string; path: string } | null
) => Promise<void>;
```

- [ ] **Step 4: Add transaction helper**

Above `export const useDraftHistoryStore`, add:

```ts
async function updateDraftPlayerInTransaction(
  draftId: string,
  playerId: string,
  updatePlayer: (player: DraftPlayer) => DraftPlayer,
): Promise<DraftPlayer[] | null> {
  const draftRef = doc(db, 'drafts', draftId);
  let updatedPlayers: DraftPlayer[] | null = null;

  await runTransaction(db, async (transaction) => {
    const draftSnap = await transaction.get(draftRef);
    if (!draftSnap.exists()) return;

    const latestDraft = draftSnap.data() as Draft;
    const players = latestDraft.players ?? [];
    let found = false;

    updatedPlayers = players.map(player => {
      if (player.id !== playerId) return player;
      found = true;
      return updatePlayer(player);
    });

    if (!found) {
      updatedPlayers = null;
      return;
    }

    transaction.update(draftRef, { players: updatedPlayers });
  });

  return updatedPlayers;
}
```

- [ ] **Step 5: Convert `setPlayerArchetype`**

Replace the current `setPlayerArchetype` body with:

```ts
setPlayerArchetype: async (draftId, playerId, primary, splash) => {
  const sortedPrimary = sortColors(primary);
  const sortedSplash = sortColors(splash);

  const updatedPlayers = await updateDraftPlayerInTransaction(draftId, playerId, player => {
    if (sortedPrimary.length === 0) {
      const { primaryColors: _primary, splashColors: _splash, ...rest } = player;
      return rest;
    }
    const { splashColors: _oldSplash, ...rest } = player;
    return {
      ...rest,
      primaryColors: sortedPrimary,
      ...(sortedSplash.length > 0 ? { splashColors: sortedSplash } : {}),
    };
  });

  if (!updatedPlayers) return;

  set(state => ({
    drafts: state.drafts.map(d =>
      d.id === draftId ? { ...d, players: updatedPlayers } : d,
    ),
  }));
},
```

- [ ] **Step 6: Add `setPlayerDeckPhoto`**

Add this store action after `setPlayerArchetype`:

```ts
setPlayerDeckPhoto: async (draftId, playerId, photo) => {
  const uploadedAt = photo ? Timestamp.now() : null;

  const updatedPlayers = await updateDraftPlayerInTransaction(draftId, playerId, player => {
    const {
      deckPhotoUrl: _oldUrl,
      deckPhotoPath: _oldPath,
      deckPhotoUploadedAt: _oldUploadedAt,
      ...rest
    } = player;

    if (!photo) return rest;

    return {
      ...rest,
      deckPhotoUrl: photo.url,
      deckPhotoPath: photo.path,
      deckPhotoUploadedAt: uploadedAt!,
    };
  });

  if (!updatedPlayers) return;

  set(state => ({
    drafts: state.drafts.map(d =>
      d.id === draftId ? { ...d, players: updatedPlayers } : d,
    ),
  }));
},
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- src/state/__tests__/draftHistoryStore.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/state/draftHistoryStore.ts src/state/__tests__/draftHistoryStore.test.ts
git commit -m "fix: make player metadata updates transactional"
```

---

### Task 3: Deck Photo Storage Helpers

**Files:**
- Create: `src/utils/deckPhotos.ts`

**Interfaces:**
- Consumes: `storage` from `src/firebase.ts`.
- Produces: `uploadDeckPhoto(draftId: string, playerId: string, file: File): Promise<{ url: string; path: string }>`
- Produces: `deleteDeckPhoto(path: string): Promise<void>`

- [ ] **Step 1: Create storage utility**

Create `src/utils/deckPhotos.ts`:

```ts
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';

export interface UploadedDeckPhoto {
  url: string;
  path: string;
}

function safeExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const fromType = file.type.split('/')[1]?.toLowerCase();
  if (fromType && /^[a-z0-9]+$/.test(fromType)) return fromType;
  return 'jpg';
}

export async function uploadDeckPhoto(
  draftId: string,
  playerId: string,
  file: File,
): Promise<UploadedDeckPhoto> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in to upload a deck photo.');

  const extension = safeExtension(file);
  const path = `deckPhotos/${draftId}/${playerId}/${uid}/${crypto.randomUUID()}.${extension}`;
  const photoRef = ref(storage, path);
  await uploadBytes(photoRef, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(photoRef);
  return { url, path };
}

export async function deleteDeckPhoto(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npm.cmd run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/utils/deckPhotos.ts
git commit -m "feat: add deck photo storage helpers"
```

---

### Task 4: Draft History Photo Indicator, Viewer, And Editor Controls

**Files:**
- Modify: `src/pages/DraftHistory.tsx`

**Interfaces:**
- Consumes: `DraftPlayer.deckPhotoUrl`, `deckPhotoPath`.
- Consumes: `setPlayerDeckPhoto(draftId, playerId, photo)` from Task 2.
- Consumes: `uploadDeckPhoto`, `deleteDeckPhoto` from Task 3.

- [ ] **Step 1: Add imports**

Update imports in `src/pages/DraftHistory.tsx`:

```ts
import { useRef, useState, useMemo } from "react";
import { deleteDeckPhoto, uploadDeckPhoto } from '../utils/deckPhotos';
```

- [ ] **Step 2: Extend props**

Change `PlayersWithArchetypeProps`:

```ts
interface PlayersWithArchetypeProps {
  draft: Draft;
  currentUserId: string | undefined;
  isAdmin: boolean;
  setPlayerArchetype: (draftId: string, playerId: string, primary: MtgColor[], splash: MtgColor[]) => Promise<void>;
  setPlayerDeckPhoto: (
    draftId: string,
    playerId: string,
    photo: { url: string; path: string } | null
  ) => Promise<void>;
}
```

Change the component signature:

```ts
function PlayersWithArchetype({
  draft,
  currentUserId,
  isAdmin,
  setPlayerArchetype,
  setPlayerDeckPhoto,
}: PlayersWithArchetypeProps) {
```

- [ ] **Step 3: Add viewer and upload state**

Inside `PlayersWithArchetype`, add:

```ts
const fileInputRef = useRef<HTMLInputElement | null>(null);
const [photoViewerPlayer, setPhotoViewerPlayer] = useState<DraftPlayer | null>(null);
const [photoSaving, setPhotoSaving] = useState(false);
const [photoError, setPhotoError] = useState<string | null>(null);
```

- [ ] **Step 4: Add photo handlers**

Inside `PlayersWithArchetype`, add:

```ts
const handlePhotoSelected = async (file: File | undefined) => {
  if (!file || !editingPlayer) return;
  setPhotoSaving(true);
  setPhotoError(null);
  let uploaded: { url: string; path: string } | null = null;

  try {
    uploaded = await uploadDeckPhoto(draft.id, editingPlayer.id, file);
    const oldPath = editingPlayer.deckPhotoPath;
    await setPlayerDeckPhoto(draft.id, editingPlayer.id, uploaded);
    if (oldPath) {
      deleteDeckPhoto(oldPath).catch(err => console.error('Failed to delete replaced deck photo:', err));
    }
  } catch (err) {
    if (uploaded) {
      deleteDeckPhoto(uploaded.path).catch(cleanupErr => console.error('Failed to clean up uploaded deck photo:', cleanupErr));
    }
    console.error('Failed to save deck photo:', err);
    setPhotoError('Failed to save deck photo. Please try again.');
  } finally {
    setPhotoSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
};

const handleRemovePhoto = async () => {
  if (!editingPlayer?.deckPhotoPath) return;
  setPhotoSaving(true);
  setPhotoError(null);
  const oldPath = editingPlayer.deckPhotoPath;

  try {
    await setPlayerDeckPhoto(draft.id, editingPlayer.id, null);
    deleteDeckPhoto(oldPath).catch(err => console.error('Failed to delete removed deck photo:', err));
  } catch (err) {
    console.error('Failed to remove deck photo:', err);
    setPhotoError('Failed to remove deck photo. Please try again.');
  } finally {
    setPhotoSaving(false);
  }
};
```

- [ ] **Step 5: Add chip photo indicator**

Replace the single player chip `<button>` with a compact pill wrapper containing a player button and, only when a photo exists, a sibling photo button. This avoids nesting interactive elements.

```tsx
<div
  key={player.id}
  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors
    ${isEditing
      ? 'bg-gray-800 border-blue-700 text-gray-200'
      : editable
        ? 'bg-gray-800 border-blue-900 text-gray-300 hover:border-blue-700'
        : 'bg-gray-800 border-gray-700 text-gray-300'
    }`}
>
  <button
    type="button"
    onClick={() => handleChipClick(player)}
    disabled={!editable}
    className={`${editable ? 'cursor-pointer' : 'cursor-default'} flex items-center gap-1.5`}
  >
    <span>{player.name}</span>
    {arch && (
      <>
        <span className="text-gray-600 text-xs">·</span>
        <span className="text-gray-400 text-xs">{arch}</span>
      </>
    )}
  </button>
  {player.deckPhotoUrl && (
    <button
      type="button"
      title="View deck photo"
      aria-label={`View ${player.name}'s deck photo`}
      onClick={() => setPhotoViewerPlayer(player)}
      className="h-5 w-5 overflow-hidden rounded-full border border-gray-600 bg-gray-900 hover:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <img src={player.deckPhotoUrl} alt="" className="h-full w-full object-cover" />
    </button>
  )}
</div>
```

- [ ] **Step 6: Add editor photo controls**

Below the existing Save/Cancel button row in the editor, add:

```tsx
<div className="mt-3 border-t border-gray-800 pt-3">
  <div className="flex items-center gap-3">
    {editingPlayer.deckPhotoUrl && (
      <button
        type="button"
        onClick={() => setPhotoViewerPlayer(editingPlayer)}
        className="h-12 w-12 overflow-hidden rounded-md border border-gray-700 bg-gray-800"
        title="View deck photo"
      >
        <img src={editingPlayer.deckPhotoUrl} alt="" className="h-full w-full object-cover" />
      </button>
    )}
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => handlePhotoSelected(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={photoSaving}
        onClick={() => fileInputRef.current?.click()}
        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-xs font-semibold rounded-lg border border-gray-700"
      >
        {editingPlayer.deckPhotoUrl ? 'Replace photo' : 'Upload photo'}
      </button>
      {editingPlayer.deckPhotoUrl && (
        <button
          type="button"
          disabled={photoSaving}
          onClick={handleRemovePhoto}
          className="px-3 py-1.5 text-red-300 hover:text-red-200 disabled:opacity-50 text-xs rounded-lg"
        >
          Remove
        </button>
      )}
      {photoSaving && <span className="text-xs text-gray-500">Saving photo...</span>}
    </div>
  </div>
  {photoError && <p className="mt-2 text-xs text-red-400">{photoError}</p>}
</div>
```

- [ ] **Step 7: Add photo viewer modal**

At the end of `PlayersWithArchetype` return, before the closing wrapper `</div>`, render:

```tsx
{photoViewerPlayer?.deckPhotoUrl && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    role="dialog"
    aria-modal="true"
    onClick={() => setPhotoViewerPlayer(null)}
  >
    <div
      className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg border border-gray-700 bg-gray-950 shadow-2xl"
      onClick={event => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{photoViewerPlayer.name}</p>
          <p className="text-xs text-gray-500">
            {formatArchetype(photoViewerPlayer.primaryColors ?? [], photoViewerPlayer.splashColors ?? []) || draftTitle(draft)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={photoViewerPlayer.deckPhotoUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white rounded-md border border-gray-700 hover:border-gray-500"
          >
            Open full size
          </a>
          <button
            type="button"
            onClick={() => setPhotoViewerPlayer(null)}
            className="px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white rounded-md border border-gray-700 hover:border-gray-500"
          >
            Close
          </button>
        </div>
      </div>
      <div className="flex max-h-[78vh] items-center justify-center bg-black">
        <img
          src={photoViewerPlayer.deckPhotoUrl}
          alt={`${photoViewerPlayer.name}'s deck photo`}
          className="max-h-[78vh] w-auto max-w-full object-contain"
        />
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 8: Pass store action into players section**

Where the store is destructured in `DraftHistory`, include `setPlayerDeckPhoto`:

```ts
const { drafts, loading, error, deleteDraft, markRestockComplete, loadDrafts, linkDraftPlayers, setPlayerArchetype, setPlayerDeckPhoto } =
  useDraftHistoryStore();
```

Where `PlayersWithArchetype` is rendered, pass:

```tsx
setPlayerDeckPhoto={setPlayerDeckPhoto}
```

- [ ] **Step 9: Verify manually**

Run: `npm.cmd run build`

Expected: Build succeeds.

Run the app with `npm run dev` and manually verify:

- Player without a photo has no photo indicator.
- Player with a photo has a small thumbnail indicator on the chip.
- Clicking the indicator opens the modal without toggling the editor.
- Upload photo writes metadata and shows the thumbnail.
- Replace photo updates the thumbnail.
- Remove photo removes the thumbnail.

- [ ] **Step 10: Commit**

```bash
git add src/pages/DraftHistory.tsx
git commit -m "feat: add deck photo controls to draft history"
```

---

### Task 5: Final Verification And Cleanup

**Files:**
- Review: `src/state/draftHistoryStore.ts`
- Review: `src/pages/DraftHistory.tsx`
- Review: `src/types/index.ts`
- Review: `storage.rules`

**Interfaces:**
- Confirms all prior task interfaces work together.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/state/__tests__/draftHistoryStore.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm.cmd run build`

Expected: PASS. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 4: Check final diff**

Run: `git status --short`

Expected: no unstaged implementation changes after all commits.

- [ ] **Step 5: Record manual QA notes**

In the final response, include:

```text
Manual QA:
- Upload photo:
- View photo:
- Replace photo:
- Remove photo:
```

Fill each item with `verified` or explain why it was not verified.
