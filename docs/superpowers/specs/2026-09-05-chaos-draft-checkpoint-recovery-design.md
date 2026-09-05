# Chaos Draft Checkpoint Recovery Design

**Date:** September 5, 2026

## Summary

Persist each in-progress chaos draft to Firestore so it can survive a page refresh, browser restart, or switch to another device. Chaos-draft hosting remains admin-only, matching the existing chaos-inventory write policy. Only one active chaos draft may exist per admin inventory owner. The active checkpoint remains separate from finalized draft history and is removed only when the owner explicitly discards it or Firestore atomically creates the finalized draft and deducts inventory.

This design applies only to chaos drafts. Regular, Mobius, Sealed, Team Sealed, and Cube draft flows are out of scope.

## Problem

The current chaos draft lives only in the in-memory Zustand `sessionStore`. Starting a draft initializes players, a temporary inventory snapshot, and an empty `packsSelectedOrder`. Each completed spin mutates that memory. Refreshing the page recreates the store with its empty defaults, losing every selected pack and the draft's next-player position.

Confirmation currently performs inventory deduction and finalized-draft creation as separate operations. A failure between those operations can leave inventory and draft history inconsistent. The inventory helper also catches deduction errors internally, allowing the save flow to continue without knowing that deduction failed.

## Goals

- Recover an unfinished chaos draft on any authenticated device used by its inventory owner.
- Preserve player seating order, every determined pack, the next player, and pending Round 1 setup.
- Keep normal spinner interaction uninterrupted by checkpoint latency.
- Permit only one active chaos draft per inventory owner.
- Prevent stale devices from overwriting newer progress.
- Keep inventory unchanged until final confirmation.
- Atomically create the finalized draft, deduct inventory, and delete the checkpoint.
- Preserve the checkpoint whenever finalization fails.
- Never create an empty or partially populated document in `drafts`.
- Preserve approved non-admin access to Regular, Mobius, Sealed, Team Sealed, and Cube draft flows.

## Non-Goals

- Offline drafting without Firestore connectivity.
- Multiple concurrent chaos drafts for one inventory owner.
- Simultaneous collaborative control of one draft from multiple devices.
- Recovery of a spinner's visual position or animation progress.
- Changes to finalized draft history, tournament scoring, or the meaning of `restockComplete`.
- Checkpointing non-chaos draft types.
- Allowing non-admin users to host chaos drafts or mutate chaos inventory.

## Firestore Data Model

Use one document per inventory owner:

```text
activeChaosDrafts/{ownerId}
```

The document shape is:

```ts
interface ActiveChaosDraft {
  ownerId: string;
  sessionId: string;
  finalDraftId: string;
  revision: number;
  players: DraftPlayer[];
  numPacks: number;
  packsSelectedOrder: DraftPackRef[];
  pendingTournament?: DraftTournament;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

`finalDraftId` is generated locally from a Firestore `drafts` document reference when the checkpoint is created. Generating the reference does not write a draft document. The ID exists only as checkpoint data until final confirmation.

The checkpoint stores only canonical state. The following values are derived when loading it:

- A player's selected packs are the entries whose array positions satisfy `position % players.length === playerIndex`.
- The next player is `packsSelectedOrder.length % players.length`.
- Temporary wheel inventory is a copy of live inventory with the checkpoint's selected quantities subtracted.
- Draft completeness is `packsSelectedOrder.length === numPacks`.

The checkpoint does not store `tempInventory`, per-player `selectedPacks`, spinner buffers, animation offsets, transient popup state, or `confirmed`.

## Session Lifecycle

### Starting a Draft

Chaos-draft setup and routes require an admin profile. Approved non-admin users retain access to every non-chaos setup and draft type. Every chaos-draft entry point checks `activeChaosDrafts/{ownerId}` before starting a new session. If a checkpoint exists, the user must resume or discard it; a new session cannot silently replace it.

After seating is confirmed, the app creates the checkpoint before navigating to `/draft`. Creation includes the ordered players, pack target, empty selection array, revision `0`, and preallocated `finalDraftId`. If creation fails, the app stays in setup and displays an actionable error.

### Selecting and Animating a Pack

The current spinner already chooses the weighted-random winner before starting its animation. The durable write moves to this point while the animation remains visual presentation:

1. Choose the winning pack from the currently available temporary inventory.
2. Start the spinner animation immediately.
3. In parallel, run a checkpoint transaction for that exact pack.
4. Read the checkpoint and selected `packs/{packId}` document.
5. Require the checkpoint session ID and revision to match the client's expected values.
6. Require the pack to belong to the checkpoint owner.
7. Count how many copies of that pack the checkpoint already reserves and require live `inPerson` to cover the new total.
8. Append `{id, name, imageUrl}`, increment `revision`, and update `updatedAt`.
9. When the animation lands, reveal and apply the already checkpointed result to local session state.

No saving label or modal appears during normal writes. The animation normally provides more time than the Firestore transaction needs. A new spin, undo, discard, or confirmation cannot mutate the session while this checkpoint promise is unresolved.

If the page refreshes during the animation after the transaction commits, resuming includes that pack as a completed selection. The spin is not rerun because its outcome was already determined and recorded.

If the animation finishes while the transaction is still pending, the landed pack remains visible and mutation controls remain disabled. A subtle saving status appears only after the pending write has lasted approximately one second beyond the normal interaction boundary.

If the checkpoint transaction fails, the UI retains the landed pack as a pending result and offers **Retry Save** for that same pack. It must not choose a replacement pack or advance the player. Refreshing before a failed or still-uncommitted write completes can rerun that spin because no durable outcome exists.

### Undo

Undo runs as a checkpoint transaction. It verifies the expected session ID and revision, removes only the final `packsSelectedOrder` entry, increments `revision`, and updates `updatedAt`. Local players and temporary inventory are updated only from the successful transaction result.

### Tournament Setup

Once all packs are selected, saving Round 1 setup updates `pendingTournament` on the same checkpoint, increments `revision`, and updates `updatedAt`. Round 1 setup is mandatory for chaos-draft finalization. The UI awaits this checkpoint transaction, consumes its returned revision, and enables confirmation only after the tournament write succeeds. A refresh after seating or pairing setup therefore restores the completed draft immediately before final confirmation.

### Resume

After authentication, profile resolution, and inventory loading, Draft Hub reads `activeChaosDrafts/{ownerId}` only when the profile is an approved admin. Approved non-admin users skip checkpoint discovery entirely and proceed directly to the non-chaos-capable setup UI without making a forbidden repository call. A checkpoint-loading error disables chaos-draft start/resume but does not block non-chaos setup. When an admin checkpoint exists, Draft Hub displays an **Unfinished Chaos Draft** panel containing:

- Selected-pack progress, such as `11 / 18`
- Player count
- Last-updated time
- **Resume Draft**
- **Discard Draft**

Visiting `/draft` directly also attempts checkpoint hydration. Hydration validates the checkpoint's owner, session ID, player data, pack count, selection length, and referenced inventory documents before reconstructing local state. Invalid or unreconstructable checkpoints produce a blocking explanation and retain the checkpoint for investigation; they are never silently discarded.

### Discard

Discard requires explicit confirmation and runs as a Firestore transaction. It reads the checkpoint, verifies the client's expected session ID and revision, and then deletes only `activeChaosDrafts/{ownerId}`. Local session state clears only after the delete commits. A conflict or failed delete retains local state and reloads or reports the current checkpoint. Because checkpoints do not deduct inventory, discard performs no inventory writes and does not touch any finalized draft.

The current **Reset Session** behavior is removed from active chaos drafts. Its UI is replaced by the explicit **Discard Draft** action so local state cannot reset independently from the durable checkpoint. Starting again requires a successful discard followed by normal checkpoint creation.

Checkpoints do not expire automatically.

## Cross-Device Conflict Handling

Each mutating action, including discard, carries the client's expected `sessionId` and `revision`. The Firestore transaction reads the current checkpoint and rejects the action if either differs. This prevents a stale browser from overwriting or deleting progress written by another device.

On conflict, the stale client stops its pending action, loads the latest checkpoint, reconstructs the session, and explains that the draft was updated elsewhere. It does not merge two selection arrays or retry a random choice against changed state.

A live Firestore subscription is not required for correctness. Conflict detection at each mutation boundary is sufficient and avoids allowing the current device's own during-animation checkpoint to reveal a selected pack before the spinner lands.

## Atomic Finalization

Final confirmation uses one Firestore transaction. The transaction performs all reads before any writes:

1. Read `activeChaosDrafts/{ownerId}`.
2. Validate the expected session ID and revision, require a complete selection, and require a valid persisted `pendingTournament` containing active Round 1 pairings for the checkpoint players.
3. Read `drafts/{finalDraftId}` and require that it does not exist.
4. Count selections by pack ID and read every unique `packs/{packId}` document.
5. Validate ownership and require each `inPerson` quantity to cover its selected count.
6. Calculate all post-deduction inventory quantities.
7. Write the complete finalized document to `drafts/{finalDraftId}`.
8. Write every inventory deduction.
9. Delete `activeChaosDrafts/{ownerId}`.

Firestore commits these writes atomically. If draft creation, inventory validation, inventory deduction, checkpoint deletion, or any other transaction step fails, none of the writes take effect. In particular, the checkpoint remains and inventory stays unchanged.

The finalized draft is fully populated on its first write. Its exact payload is:

```ts
{
  type: 'chaos',
  createdBy: checkpoint.ownerId,
  createdAt: serverTimestamp(),
  status: 'finalized',
  finalizedAt: serverTimestamp(),
  finalizedBy: checkpoint.ownerId,
  sessionId: checkpoint.sessionId,
  players: checkpoint.players,
  packsSelectedOrder: checkpoint.packsSelectedOrder,
  restockComplete: false,
  tournament: checkpoint.pendingTournament,
}
```

Fields for set-based and cube drafts are omitted. Both timestamps are server timestamps resolved by the commit. No empty or placeholder `drafts/{finalDraftId}` document is created during setup or checkpointing, so incomplete drafts cannot appear in Draft History.

The transaction uses the checkpoint's preallocated `finalDraftId` on every retry. If the client loses the response after commit, it waits for connectivity and runs a server-authoritative read-only Firestore transaction that reads the exact finalized draft and checkpoint in one consistent snapshot. Cached or independently timed reads are not accepted for reconciliation:

- Finalized draft exists and checkpoint does not: confirmation succeeded; load drafts and navigate to the tournament or history destination.
- Checkpoint exists and finalized draft does not: confirmation did not commit; retain the draft and allow retry.
- Both exist or neither exists: show a blocking integrity error and do not attempt automatic mutation.

If an authoritative reconciliation transaction cannot complete, the UI reports that confirmation status is still unknown and offers **Check Again**. It does not declare failure, retry finalization, or clear local state until a consistent server result is available.

This flow replaces the current separate `confirmSessionPicks()` and `saveDraft()` sequence for chaos drafts. Errors must propagate to the caller rather than being caught and suppressed inside inventory operations.

## Repository Boundaries

### Active Chaos Draft Repository

A focused repository module owns:

- Reading the owner's checkpoint
- Creating a new checkpoint only when none exists
- Appending a selected pack with revision and inventory validation
- Undoing the last selection
- Saving pending tournament setup
- Discarding a checkpoint
- Atomically finalizing the checkpoint

Firestore access and transaction invariants remain out of React components and out of pure reconstruction helpers.

### Session Store

`sessionStore` continues to expose session state to the drafting UI. Its actions become asynchronous where durability is required. It owns hydration into display state and applies transaction results locally, but delegates Firestore operations to the repository.

### Pure Reconstruction Helpers

Pure functions validate and derive:

- Selected packs by player
- Next-player index
- Remaining temporary inventory
- Selected quantity counts
- Whether a checkpoint can be resumed against current inventory

These functions are the shared source for hydration, UI display, and validation tests.

### UI Integration

Draft Hub owns unfinished-session discovery and the resume/discard choice. The Draft page owns during-animation checkpoint coordination, retry presentation, and conflict recovery. Existing tournament components continue to produce `DraftTournament`; the session action persists it to the checkpoint.

## Firestore Security Rules

Add rules for `activeChaosDrafts/{ownerId}` with these invariants:

- The caller must be an approved admin whose UID equals the path `ownerId`.
- On create, `request.resource.data.ownerId` must equal both the path `ownerId` and authenticated UID.
- On update, `ownerId`, `sessionId`, `finalDraftId`, `players`, `numPacks`, and `createdAt` are immutable.
- Revision must increase by exactly one for checkpoint updates; checkpoint creation starts at `0`, and deletion has no successor revision.
- `packsSelectedOrder` cannot exceed `numPacks`.
- No client, including another admin, can access a checkpoint under a different owner UID or move a checkpoint to another owner.

Only admins may create, read, update, or delete active chaos checkpoints. Checkpoint `ownerId` must equal the authenticated admin UID; another admin cannot take over or mutate that owner's checkpoint through the application flow. This matches the existing rule that only admins may write `packs` documents. Approved non-admin users remain authorized for existing non-chaos draft operations.

Checkpoint rules validate required keys and field types on create, require revision `0`, require an empty initial selection, and require `ownerId` to match both the path and authenticated UID. Updates permit only the field groups used by append, undo, or tournament persistence; immutable identity/setup fields cannot change, revision increases by exactly one, and selection length stays between zero and `numPacks`. Direct writes by non-admin users and cross-owner writes are denied and covered by emulator tests.

The repository performs canonical pack metadata, quantity, transition, expected-revision discard, and final payload validation. Firestore delete rules cannot receive a client's expected revision, so stale-discard protection is provided by the required repository transaction rather than by a direct-delete rule. Admins are trusted principals under the existing data model and can already mutate chaos inventory directly; the new rules protect role and ownership boundaries and prevent accidental malformed transitions, not malicious actions by a project administrator.

Finalization remains subject to the existing `drafts` create and `packs` update rules. The Firestore transaction is run through the authenticated client SDK; it does not require a permanent Admin SDK credential or a privileged repair script.

## Error Handling

- Session creation failure keeps the user in setup with retry available.
- Checkpoint timeout does not interrupt a normal animation; mutation controls remain locked until success or failure is known.
- Checkpoint failure retains the exact selected pack for retry.
- Revision conflict reloads the server checkpoint and does not reroll automatically.
- Discard conflict or failure retains local state and the server checkpoint.
- Tournament persistence failure keeps confirmation disabled and retains the selected packs.
- Resume validation failure preserves the checkpoint and provides identifying details suitable for support.
- Finalization failure preserves the checkpoint and inventory exactly as they were.
- Ambiguous finalization response is resolved after connectivity with a server-authoritative read-only transaction over the preallocated finalized draft ID and checkpoint; cached results are never accepted.

## Testing Strategy

### Pure Unit Tests

- Reconstruct each player's packs using round-robin selection positions.
- Derive the correct next player at every selection count.
- Subtract repeated selections from temporary inventory without mutating live inventory.
- Reject malformed checkpoints, too many selections, missing pack references, and insufficient quantities.

### Store and UI Tests

- Hydrate a partial checkpoint into the same visible player and selection state.
- Hydrate a completed checkpoint and expose Round 1 setup or confirmation as appropriate.
- Start a Firestore checkpoint concurrently with spinner animation.
- Avoid a normal saving indicator for quick writes.
- Show delayed status for an unusually slow write.
- Retry the same landed pack after a failed checkpoint.
- Persist undo and pending tournament setup.
- Display Resume/Discard when an active checkpoint exists.
- Skip checkpoint discovery entirely for non-admin profiles and keep non-chaos setup usable if admin checkpoint loading fails.
- Require confirmation before discard.
- Keep local state when discard fails and reject stale-device discard.
- Reload latest state after a revision conflict.
- Await tournament persistence and its new revision before enabling finalization.
- Keep confirmation disabled when tournament persistence fails.

### Firestore Emulator Integration Tests

- Enforce one checkpoint per admin owner.
- Deny checkpoint access to non-admin users and deny cross-owner checkpoint access.
- Reject stale revisions.
- Reject stale discard attempts through the repository transaction.
- Reject selection beyond available inventory.
- Confirm that checkpointing never changes inventory.
- Atomically create a fully populated finalized draft, deduct inventory, and delete the checkpoint.
- Assert every field and server timestamp in the finalized draft on its first creation write.
- Preserve checkpoint and inventory when finalized-draft creation fails.
- Preserve checkpoint and inventory when any selected pack has insufficient quantity.
- Preserve checkpoint and inventory when `pendingTournament` is absent or invalid.
- Prevent finalization from racing ahead of tournament persistence.
- Confirm no draft document exists before finalization.
- Resolve a simulated lost confirmation response using `finalDraftId`.
- Reconcile correctly when the read races finalization, and reject cached or unavailable reconciliation results.
- Confirm approved non-admin users retain access to non-chaos draft operations.

### Manual Browser Verification

- Refresh after one, several, and all selections.
- Refresh during an animation after its checkpoint commits.
- Resume from a second browser/device.
- Attempt mutations from two devices and verify stale-client recovery.
- Disconnect during a spin, reconnect, and retry the same result.
- Confirm a complete draft and verify Draft History and Tournament navigation.

## Success Criteria

- An unfinished chaos draft can be resumed from another authenticated device without losing a committed selection.
- Normal spins do not display checkpoint latency when the write completes during animation.
- No checkpoint action deducts inventory.
- No finalized draft document exists before confirmation.
- Finalization cannot leave only some of the draft creation, inventory deduction, or checkpoint deletion applied.
- A failed finalization always leaves a usable checkpoint for retry.
- A stale device cannot overwrite newer checkpoint state.
