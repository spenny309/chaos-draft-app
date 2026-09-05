# Chaos Draft Checkpoint Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an in-progress Chaos Draft recoverable on any admin device and make finalization an atomic creation/deduction/checkpoint-deletion transaction, without restricting any non-Chaos format for approved non-admin users.

**Architecture:** Store the canonical in-progress state in `activeChaosDrafts/{ownerId}` and keep display-only state derived in Zustand. A focused repository owns all Firestore transactions, pure helpers validate and reconstruct sessions, and React coordinates durable writes with the existing visual animation. The final draft ID is allocated without writing a draft document and is used only by the single atomic finalization transaction.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Firebase Web SDK 12/Cloud Firestore, Vitest 4, Firestore Emulator, Vite 7

**Spec:** `docs/superpowers/specs/2026-09-05-chaos-draft-checkpoint-recovery-design.md`

## Global Constraints

- This feature applies only to Chaos Draft; Regular Draft, Mobius Draft, Sealed, Team Sealed, and Cube flows keep working for every approved user.
- Only an approved admin may discover, create, resume, mutate, discard, or finalize an active Chaos Draft.
- Use exactly one checkpoint document per inventory owner: `activeChaosDrafts/{ownerId}`.
- Keep inventory unchanged during create, append, undo, tournament persistence, resume, and discard.
- Generate `finalDraftId` locally from a Firestore document reference; do not write `drafts/{finalDraftId}` until finalization.
- Persist the selected pack while its animation runs, reveal it only after the animation and write both finish, and retry the same pack after a failed write.
- Do not show a normal saving indicator; show subtle status only if the write is still unresolved about one second after the animation ends.
- Every mutation verifies both `sessionId` and exact `revision`; a successful mutation increments revision by exactly one.
- Round 1 must be persisted in `pendingTournament` before finalization is enabled.
- Finalization performs every read before every write and atomically creates the complete draft, deducts exact inventory counts, and deletes the checkpoint.
- Any failed finalization leaves both checkpoint and inventory unchanged; an ambiguous response is resolved by a server-authoritative read-only transaction.
- Checkpoints never expire automatically.
- Preserve the existing uncommitted repair utility files and dependency changes. Never stage `scripts/repairChaosDraft.ts`, `src/utils/chaosDraftRepair.ts`, or `src/utils/__tests__/chaosDraftRepair.test.ts` in this feature's commits.

---

## File Structure

- `src/types/index.ts`: shared checkpoint, command, mutation-result, and reconciliation types.
- `src/utils/chaosDraftCheckpoint.ts`: pure validation, pack counting, player reconstruction, and temporary-inventory reconstruction.
- `src/utils/__tests__/chaosDraftCheckpoint.test.ts`: round-robin and malformed-checkpoint unit coverage.
- `src/repositories/activeChaosDraftRepository.ts`: all checkpoint and atomic-finalization Firestore reads/transactions.
- `src/repositories/__tests__/activeChaosDraftRepository.test.ts`: unit coverage for transaction commands and error classification.
- `src/state/sessionStore.ts`: async durable Chaos session actions and hydration into view state.
- `src/state/__tests__/sessionStore.test.ts`: store behavior with the repository mocked.
- `src/utils/spinCheckpointCoordinator.ts`: small testable coordinator joining one animation with one durable result.
- `src/utils/__tests__/spinCheckpointCoordinator.test.ts`: concurrency, delayed-state, and exact-pack retry tests.
- `src/components/ActiveChaosDraftPrompt.tsx`: unfinished-draft Resume/Discard panel.
- `src/pages/RegularDraftSetup.tsx`: remove Chaos from the format choices for non-admins while retaining all other choices.
- `src/pages/DraftHub.tsx`: admin-only checkpoint discovery/start/resume/discard orchestration.
- `src/pages/Draft.tsx`: direct-route hydration, animation-time save, retry/conflict UX, async undo/tournament/finalize/discard.
- `src/utils/__tests__/chaosDraftAccess.test.ts`: explicit non-admin format and checkpoint-discovery regression coverage.
- `firestore.rules`: owner/admin checkpoint rules.
- `firebase.json`: local Firestore emulator configuration.
- `vitest.config.ts`: include emulator integration tests.
- `test/firestore/activeChaosDraft.integration.test.ts`: security, ownership, inventory, finalization, and reconciliation integration tests.

---

### Task 1: Canonical checkpoint types and reconstruction helpers

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/chaosDraftCheckpoint.ts`
- Create: `src/utils/__tests__/chaosDraftCheckpoint.test.ts`

**Interfaces:**
- Consumes: `Pack` from `src/state/inventoryStore.ts`; `DraftPackRef`, `DraftPlayer`, `DraftTournament`, and `Timestamp` from `src/types/index.ts`.
- Produces: `ActiveChaosDraft`, `CheckpointMutationResult`, `ChaosDraftSessionView`, `countSelectedPacks`, `validateCheckpointShape`, and `reconstructChaosSession`.

- [ ] **Step 1: Write failing tests for round-robin reconstruction and inventory subtraction**

```ts
// src/utils/__tests__/chaosDraftCheckpoint.test.ts
import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { ActiveChaosDraft } from '../../types';
import type { Pack } from '../../state/inventoryStore';
import { countSelectedPacks, reconstructChaosSession } from '../chaosDraftCheckpoint';

const inventory: Pack[] = [
  { id: 'a', ownerId: 'admin-1', catalogId: 'cat-a', name: 'Alpha', imageUrl: 'a.jpg', inPerson: 3, inTransit: 0 },
  { id: 'b', ownerId: 'admin-1', catalogId: 'cat-b', name: 'Beta', imageUrl: 'b.jpg', inPerson: 2, inTransit: 0 },
];

const checkpoint: ActiveChaosDraft = {
  ownerId: 'admin-1', sessionId: 'session-1', finalDraftId: 'draft-1', revision: 3,
  players: [
    { id: 'p1', name: 'Jieming', userId: null },
    { id: 'p2', name: 'Markus', userId: null },
  ],
  numPacks: 6,
  packsSelectedOrder: [
    { id: 'a', name: 'Alpha', imageUrl: 'a.jpg' },
    { id: 'b', name: 'Beta', imageUrl: 'b.jpg' },
    { id: 'a', name: 'Alpha', imageUrl: 'a.jpg' },
  ],
  createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(2),
};

describe('chaos checkpoint reconstruction', () => {
  it('counts repeats and assigns picks by position modulo player count', () => {
    expect(countSelectedPacks(checkpoint.packsSelectedOrder)).toEqual(new Map([['a', 2], ['b', 1]]));
    const view = reconstructChaosSession(checkpoint, inventory, 'admin-1');
    expect(view.players.map(player => player.selectedPacks.map(pack => pack.id))).toEqual([['a', 'a'], ['b']]);
    expect(view.nextPlayerIndex).toBe(1);
    expect(view.tempInventory.map(pack => [pack.id, pack.inPerson])).toEqual([['a', 1], ['b', 1]]);
    expect(inventory.map(pack => pack.inPerson)).toEqual([3, 2]);
  });
});
```

- [ ] **Step 2: Write failing tests for invalid owner, missing inventory, insufficient quantity, and over-selection**

```ts
it.each([
  ['wrong owner', { ...checkpoint, ownerId: 'other' }, inventory, 'admin-1', /owner/i],
  ['missing pack', { ...checkpoint, packsSelectedOrder: [{ id: 'missing', name: 'Missing', imageUrl: 'x' }] }, inventory, 'admin-1', /missing/i],
  ['insufficient quantity', { ...checkpoint, packsSelectedOrder: Array(4).fill({ id: 'a', name: 'Alpha', imageUrl: 'a.jpg' }) }, inventory, 'admin-1', /quantity/i],
  ['too many selections', { ...checkpoint, numPacks: 2 }, inventory, 'admin-1', /numPacks/i],
])('%s is rejected', (_label, value, packs, ownerId, pattern) => {
  expect(() => reconstructChaosSession(value as ActiveChaosDraft, packs, ownerId)).toThrow(pattern as RegExp);
});
```

- [ ] **Step 3: Run the new test file and verify the imports fail**

Run: `npm test -- src/utils/__tests__/chaosDraftCheckpoint.test.ts`

Expected: FAIL because `ActiveChaosDraft` and `chaosDraftCheckpoint` do not exist.

- [ ] **Step 4: Add the shared types**

```ts
// append to src/types/index.ts
export interface ActiveChaosDraft {
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

export interface CheckpointMutationResult {
  revision: number;
  packsSelectedOrder: DraftPackRef[];
  pendingTournament?: DraftTournament;
}

export type FinalizationReconciliation =
  | { status: 'committed'; draftId: string }
  | { status: 'not-committed'; checkpoint: ActiveChaosDraft }
  | { status: 'integrity-error' };
```

- [ ] **Step 5: Implement validation and reconstruction without mutating live inventory**

```ts
// src/utils/chaosDraftCheckpoint.ts
import type { ActiveChaosDraft, DraftPackRef } from '../types';
import type { Pack } from '../state/inventoryStore';
import type { Player } from '../state/sessionStore';

export interface ChaosDraftSessionView {
  players: Player[];
  packsSelectedOrder: Pack[];
  tempInventory: Pack[];
  nextPlayerIndex: number;
}

export function countSelectedPacks(packs: DraftPackRef[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pack of packs) counts.set(pack.id, (counts.get(pack.id) ?? 0) + 1);
  return counts;
}

export function validateCheckpointShape(checkpoint: ActiveChaosDraft, ownerId: string): void {
  if (checkpoint.ownerId !== ownerId) throw new Error('Checkpoint owner does not match the signed-in admin.');
  if (!checkpoint.sessionId || !checkpoint.finalDraftId) throw new Error('Checkpoint identity is incomplete.');
  if (!Number.isInteger(checkpoint.revision) || checkpoint.revision < 0) throw new Error('Checkpoint revision is invalid.');
  if (!Number.isInteger(checkpoint.numPacks) || checkpoint.numPacks <= 0) throw new Error('Checkpoint numPacks is invalid.');
  if (checkpoint.players.length < 2) throw new Error('Checkpoint player list is invalid.');
  if (checkpoint.players.some(player => !player.id || !player.name)) throw new Error('Checkpoint player data is invalid.');
  if (checkpoint.packsSelectedOrder.length > checkpoint.numPacks) throw new Error('Checkpoint selection exceeds numPacks.');
}

export function reconstructChaosSession(
  checkpoint: ActiveChaosDraft,
  inventory: Pack[],
  ownerId: string,
): ChaosDraftSessionView {
  validateCheckpointShape(checkpoint, ownerId);
  const byId = new Map(inventory.map(pack => [pack.id, pack]));
  const counts = countSelectedPacks(checkpoint.packsSelectedOrder);
  for (const [packId, selected] of counts) {
    const live = byId.get(packId);
    if (!live) throw new Error(`Selected pack ${packId} is missing from inventory.`);
    if (live.ownerId !== ownerId) throw new Error(`Selected pack ${packId} has the wrong owner.`);
    if (live.inPerson < selected) throw new Error(`Selected pack ${packId} has insufficient quantity.`);
  }
  const selected = checkpoint.packsSelectedOrder.map(ref => ({ ...byId.get(ref.id)!, ...ref }));
  const players: Player[] = checkpoint.players.map((player, playerIndex) => ({
    ...player,
    selectedPacks: selected.filter((_pack, index) => index % checkpoint.players.length === playerIndex),
  }));
  const tempInventory = inventory
    .map(pack => ({ ...pack, inPerson: pack.inPerson - (counts.get(pack.id) ?? 0) }))
    .filter(pack => pack.inPerson > 0 || pack.inTransit > 0);
  return {
    players,
    packsSelectedOrder: selected,
    tempInventory,
    nextPlayerIndex: selected.length % players.length,
  };
}
```

- [ ] **Step 6: Run the helper tests and typecheck**

Run: `npm test -- src/utils/__tests__/chaosDraftCheckpoint.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit only Task 1 files**

```powershell
git add src/types/index.ts src/utils/chaosDraftCheckpoint.ts src/utils/__tests__/chaosDraftCheckpoint.test.ts
git commit -m "feat: add chaos checkpoint reconstruction"
```

### Task 2: Transactional active-checkpoint repository

**Files:**
- Create: `src/repositories/activeChaosDraftRepository.ts`
- Create: `src/repositories/__tests__/activeChaosDraftRepository.test.ts`

**Interfaces:**
- Consumes: `ActiveChaosDraft`, `CheckpointMutationResult`, `DraftPackRef`, `DraftPlayer`, and `DraftTournament` from `src/types/index.ts`.
- Produces: `ChaosDraftConflictError`, `ChaosDraftValidationError`, `CreateChaosDraftInput`, `CheckpointCommand`, `createActiveChaosDraftRepository`, and singleton `activeChaosDraftRepository` with `get`, `create`, `appendPack`, `undo`, `saveTournament`, and `discard`.

- [ ] **Step 1: Write repository tests around an injected Firestore transaction adapter**

```ts
// src/repositories/__tests__/activeChaosDraftRepository.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createActiveChaosDraftRepository, ChaosDraftConflictError } from '../activeChaosDraftRepository';

describe('activeChaosDraftRepository', () => {
  it('rejects an append when the stored revision differs', async () => {
    const adapter = fakeAdapter({ checkpoint: checkpointFixture({ revision: 4 }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');
    await expect(repository.appendPack({ ownerId: 'admin-1', sessionId: 'session-1', expectedRevision: 3 }, packFixture()))
      .rejects.toBeInstanceOf(ChaosDraftConflictError);
    expect(adapter.update).not.toHaveBeenCalled();
  });

  it('appends canonical metadata and increments exactly once without updating inventory', async () => {
    const adapter = fakeAdapter({ checkpoint: checkpointFixture({ revision: 0 }), pack: packFixture({ inPerson: 2 }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');
    await expect(repository.appendPack({ ownerId: 'admin-1', sessionId: 'session-1', expectedRevision: 0 }, packFixture()))
      .resolves.toMatchObject({ revision: 1, packsSelectedOrder: [{ id: 'pack-1', name: 'Pack 1', imageUrl: 'pack.jpg' }] });
    expect(adapter.update).toHaveBeenCalledWith('activeChaosDrafts/admin-1', expect.objectContaining({ revision: 1 }));
    expect(adapter.update).not.toHaveBeenCalledWith('packs/pack-1', expect.anything());
  });

  it('keeps the document when a stale discard is attempted', async () => {
    const adapter = fakeAdapter({ checkpoint: checkpointFixture({ revision: 2 }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');
    await expect(repository.discard({ ownerId: 'admin-1', sessionId: 'session-1', expectedRevision: 1 }))
      .rejects.toBeInstanceOf(ChaosDraftConflictError);
    expect(adapter.delete).not.toHaveBeenCalled();
  });
});
```

In the same test file, define `checkpointFixture`, `packFixture`, and `fakeAdapter` as typed local functions. `fakeAdapter` must record `get`, `create`, `update`, and `delete` calls and execute the callback passed to `runTransaction`; do not mock Firebase module globals.

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `npm test -- src/repositories/__tests__/activeChaosDraftRepository.test.ts`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement the repository adapter and active-session operations**

```ts
// public surface in src/repositories/activeChaosDraftRepository.ts
export class ChaosDraftConflictError extends Error {}
export class ChaosDraftValidationError extends Error {}

export interface CreateChaosDraftInput {
  ownerId: string;
  sessionId: string;
  players: DraftPlayer[];
  numPacks: number;
}

export interface CheckpointCommand {
  ownerId: string;
  sessionId: string;
  expectedRevision: number;
}

export interface ActiveChaosDraftRepository {
  get(ownerId: string): Promise<ActiveChaosDraft | null>;
  create(input: CreateChaosDraftInput): Promise<ActiveChaosDraft>;
  appendPack(command: CheckpointCommand, pack: DraftPackRef): Promise<CheckpointMutationResult>;
  undo(command: CheckpointCommand): Promise<CheckpointMutationResult>;
  saveTournament(command: CheckpointCommand, tournament: DraftTournament): Promise<CheckpointMutationResult>;
  discard(command: CheckpointCommand): Promise<void>;
}
```

Implement a small `FirestoreAdapter` whose production implementation wraps `getDoc`, `runTransaction`, `doc`, `collection`, and `serverTimestamp`. Every public method first requires `getCurrentUid() === ownerId`. `create` runs a transaction, rejects an existing checkpoint, obtains `finalDraftId` from `doc(collection(db, 'drafts')).id`, writes revision `0` with an empty selection, and reads the committed checkpoint afterward. `appendPack` reads the checkpoint and selected pack, checks session/revision/owner/capacity, counts prior reservations for that ID, stores only `{id,name,imageUrl}` from the pack document, and updates only selection/revision/updatedAt. `undo`, `saveTournament`, and `discard` use the same identity check. `saveTournament` validates active Round 1 pairings for exactly the checkpoint player IDs before writing. `discard` deletes only after the transaction read matches.

- [ ] **Step 4: Add tests for one-active-session creation, exact-pack capacity, undo, and tournament validation**

```ts
it('refuses to replace an existing checkpoint', async () => {
  const repository = createActiveChaosDraftRepository(fakeAdapter({ checkpoint: checkpointFixture() }), () => 'admin-1');
  await expect(repository.create(createInput())).rejects.toThrow(/unfinished/i);
});

it('requires live quantity to cover all reservations of the same pack', async () => {
  const existing = checkpointFixture({ packsSelectedOrder: [packRefFixture()], revision: 1 });
  const repository = createActiveChaosDraftRepository(fakeAdapter({ checkpoint: existing, pack: packFixture({ inPerson: 1 }) }), () => 'admin-1');
  await expect(repository.appendPack(commandFixture({ expectedRevision: 1 }), packRefFixture())).rejects.toThrow(/quantity/i);
});

it('undo removes only the final pick and increments revision', async () => {
  const repository = createActiveChaosDraftRepository(fakeAdapter({ checkpoint: checkpointFixture({ packsSelectedOrder: [packRefFixture()], revision: 1 }) }), () => 'admin-1');
  await expect(repository.undo(commandFixture({ expectedRevision: 1 }))).resolves.toMatchObject({ revision: 2, packsSelectedOrder: [] });
});

it('rejects tournament seats that do not match checkpoint players', async () => {
  const repository = createActiveChaosDraftRepository(fakeAdapter({ checkpoint: checkpointFixture() }), () => 'admin-1');
  await expect(repository.saveTournament(commandFixture(), tournamentFixture({ playerId: 'unknown' }))).rejects.toThrow(/players/i);
});
```

- [ ] **Step 5: Run repository tests and the full unit suite**

Run: `npm test -- src/repositories/__tests__/activeChaosDraftRepository.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit only repository files**

```powershell
git add src/repositories/activeChaosDraftRepository.ts src/repositories/__tests__/activeChaosDraftRepository.test.ts
git commit -m "feat: add active chaos draft repository"
```

### Task 3: Atomic finalization and authoritative reconciliation

**Files:**
- Modify: `src/repositories/activeChaosDraftRepository.ts`
- Modify: `src/repositories/__tests__/activeChaosDraftRepository.test.ts`
- Modify: `src/state/inventoryStore.ts`

**Interfaces:**
- Consumes: `CheckpointCommand` and canonical checkpoint state from Task 2.
- Produces: `finalize(command): Promise<{ draftId: string }>` and `reconcile(ownerId, finalDraftId): Promise<FinalizationReconciliation>` on `ActiveChaosDraftRepository`.

- [ ] **Step 1: Write failing tests that specify the transaction's complete first draft write**

```ts
it('creates the complete draft, deducts exact quantities, then deletes the checkpoint in one transaction', async () => {
  const active = completeCheckpointFixture();
  const adapter = fakeAdapter({ checkpoint: active, draftExists: false, packs: [packFixture({ id: 'a', inPerson: 3 }), packFixture({ id: 'b', inPerson: 2 })] });
  const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');
  await expect(repository.finalize(commandFixture({ expectedRevision: active.revision }))).resolves.toEqual({ draftId: active.finalDraftId });
  expect(adapter.create).toHaveBeenCalledWith(`drafts/${active.finalDraftId}`, expect.objectContaining({
    type: 'chaos', status: 'finalized', createdBy: 'admin-1', sessionId: active.sessionId,
    players: active.players, packsSelectedOrder: active.packsSelectedOrder,
    restockComplete: false, tournament: active.pendingTournament,
  }));
  expect(adapter.update).toHaveBeenCalledWith('packs/a', { inPerson: 1 });
  expect(adapter.delete).toHaveBeenCalledWith('activeChaosDrafts/admin-1');
  expect(adapter.operationNames()).toEqual(expect.arrayContaining(['read:checkpoint', 'read:draft', 'read:pack:a', 'read:pack:b', 'create:draft', 'update:pack:a', 'update:pack:b', 'delete:checkpoint']));
  expect(adapter.lastReadIndex()).toBeLessThan(adapter.firstWriteIndex());
});
```

- [ ] **Step 2: Add failing rollback and reconciliation tests**

```ts
it.each(['missing tournament', 'existing final draft', 'insufficient inventory'])('%s prevents every write', async scenario => {
  const adapter = adapterForFailedFinalization(scenario);
  const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');
  await expect(repository.finalize(commandFixture())).rejects.toThrow();
  expect(adapter.writeOperations()).toEqual([]);
});

it.each([
  [true, false, 'committed'],
  [false, true, 'not-committed'],
  [true, true, 'integrity-error'],
  [false, false, 'integrity-error'],
])('reconciles draft=%s checkpoint=%s as %s', async (draftExists, checkpointExists, status) => {
  const adapter = fakeAdapter({ draftExists, checkpoint: checkpointExists ? checkpointFixture() : null });
  const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');
  await expect(repository.reconcile('admin-1', 'draft-1')).resolves.toMatchObject({ status });
  expect(adapter.readSource).toBe('server-transaction');
});
```

- [ ] **Step 3: Run the focused tests and verify missing methods fail**

Run: `npm test -- src/repositories/__tests__/activeChaosDraftRepository.test.ts`

Expected: FAIL because `finalize` and `reconcile` are not implemented.

- [ ] **Step 4: Implement finalization with all reads before writes**

Inside the existing repository factory, add these methods to the interface and returned object:

```ts
finalize(command: CheckpointCommand): Promise<{ draftId: string }>;
reconcile(ownerId: string, finalDraftId: string): Promise<FinalizationReconciliation>;
```

`finalize` must read checkpoint, draft, and every unique pack document before calling any write method. Validate exact session/revision, `packsSelectedOrder.length === numPacks`, a valid persisted active Round 1 tournament, absent final draft, canonical pack metadata/owner, and `inPerson >= selectedCount`. Then issue this exact draft creation and exact quantity updates before deleting the checkpoint:

```ts
transaction.create(draftRef, {
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
});
for (const item of inventoryUpdates) transaction.update(item.ref, { inPerson: item.inPerson });
transaction.delete(checkpointRef);
```

`reconcile` must use one Firestore transaction with server reads for the exact draft and checkpoint paths and return only the three states in `FinalizationReconciliation`. It must never write.

- [ ] **Step 5: Remove the split Chaos inventory-deduction action**

Delete `confirmSessionPicks` from `InventoryState` and its implementation in `src/state/inventoryStore.ts`. Run `rg -n "confirmSessionPicks" src`; after Task 4 it must return no matches. Do not change private-inventory deduction or restock behavior.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- src/repositories/__tests__/activeChaosDraftRepository.test.ts`

Expected: PASS.

Run: `npm run build`

Expected at this intermediate commit: FAIL only at `sessionStore.ts` because it still calls the removed `confirmSessionPicks`; leave the removal unstaged until Task 4 if the compiler cannot accept this task independently. Prefer keeping the repository changes staged and folding `inventoryStore.ts` into Task 4 so every commit builds.

- [ ] **Step 7: Commit the independently buildable repository changes**

```powershell
git add src/repositories/activeChaosDraftRepository.ts src/repositories/__tests__/activeChaosDraftRepository.test.ts
git commit -m "feat: finalize chaos drafts atomically"
```

### Task 4: Durable session store and conflict-safe hydration

**Files:**
- Modify: `src/state/sessionStore.ts`
- Modify: `src/state/inventoryStore.ts`
- Create: `src/state/__tests__/sessionStore.test.ts`

**Interfaces:**
- Consumes: repository singleton and `reconstructChaosSession`.
- Produces async actions `initializeSession`, `hydrateSession`, `checkpointSelectedPack`, `applyCheckpointedPack`, `undoLastPick`, `setPendingTournament`, `discardSession`, `confirmSession`, and `reconcileConfirmation`.

- [ ] **Step 1: Write failing store tests with the repository singleton mocked**

```ts
vi.mock('../../repositories/activeChaosDraftRepository', () => ({
  activeChaosDraftRepository: repositoryMock,
  ChaosDraftConflictError: class ChaosDraftConflictError extends Error {},
}));

it('does not expose an appended pick before applyCheckpointedPack', async () => {
  const pack = packFixture();
  repositoryMock.appendPack.mockResolvedValue({ revision: 1, packsSelectedOrder: [packRefFixture()] });
  const revision = await useSessionStore.getState().checkpointSelectedPack(pack);
  expect(useSessionStore.getState().packsSelectedOrder).toEqual([]);
  useSessionStore.getState().applyCheckpointedPack(pack, revision);
  expect(useSessionStore.getState().packsSelectedOrder.map(value => value.id)).toEqual([pack.id]);
  expect(useSessionStore.getState().revision).toBe(1);
});

it('hydrates a partial checkpoint into players and temporary inventory', () => {
  useInventoryStore.setState({ packs: inventoryFixture() });
  useSessionStore.getState().hydrateSession(checkpointFixture());
  expect(useSessionStore.getState()).toMatchObject({ sessionId: 'session-1', revision: 2, confirmed: false });
  expect(useSessionStore.getState().players[0].selectedPacks).toHaveLength(1);
});

it('keeps local state when discard fails', async () => {
  hydrateFixture();
  repositoryMock.discard.mockRejectedValue(new Error('offline'));
  await expect(useSessionStore.getState().discardSession()).rejects.toThrow('offline');
  expect(useSessionStore.getState().sessionId).toBe('session-1');
});

it('persists Round 1 and consumes its returned revision before finalization', async () => {
  hydrateCompleteFixture();
  repositoryMock.saveTournament.mockResolvedValue({ revision: 19, packsSelectedOrder: packRefs(18), pendingTournament: tournamentFixture() });
  await useSessionStore.getState().setPendingTournament(tournamentFixture());
  expect(useSessionStore.getState()).toMatchObject({ revision: 19, pendingTournament: tournamentFixture() });
});
```

- [ ] **Step 2: Run the store test and verify it fails**

Run: `npm test -- src/state/__tests__/sessionStore.test.ts`

Expected: FAIL because durable actions and revision state do not exist.

- [ ] **Step 3: Replace local-only actions with the durable store surface**

Use this state/action contract:

```ts
export interface SessionState {
  ownerId: string;
  sessionId: string;
  finalDraftId: string;
  revision: number;
  players: Player[];
  numPacks: number;
  packsSelectedOrder: Pack[];
  tempInventory: Pack[];
  confirmed: boolean;
  pendingTournament: DraftTournament | null;
  mutationPending: boolean;
  initializeSession(players: DraftPlayer[], numPacks?: number): Promise<void>;
  hydrateSession(checkpoint: ActiveChaosDraft): void;
  checkpointSelectedPack(pack: Pack): Promise<number>;
  applyCheckpointedPack(pack: Pack, committedRevision: number): void;
  undoLastPick(): Promise<void>;
  setPendingTournament(tournament: DraftTournament): Promise<void>;
  discardSession(): Promise<void>;
  confirmSession(): Promise<{ draftId: string }>;
  reconcileConfirmation(): Promise<FinalizationReconciliation>;
  clearLocalSession(): void;
}
```

`initializeSession` requires `auth.currentUser.uid`, converts the ordered `DraftPlayer[]` directly without regenerating IDs, awaits repository creation, and hydrates the committed result before navigation. `checkpointSelectedPack` calls `appendPack` and returns the committed revision without changing displayed picks. `applyCheckpointedPack` requires `committedRevision === revision + 1`, updates exactly one player and temporary quantity, and stores the new revision. `undoLastPick` and `setPendingTournament` set `mutationPending`, await the repository, update only after success, and always clear the pending flag. `discardSession` clears local state only after repository success. `confirmSession` requires completeness and persisted tournament, then calls only `repository.finalize`; it never calls `saveDraft` or an inventory action. Conflict errors are rethrown so React can reload the checkpoint.

- [ ] **Step 4: Remove the legacy split deduction now that the store no longer calls it**

Delete `confirmSessionPicks` from `src/state/inventoryStore.ts` as specified in Task 3, then verify:

Run: `rg -n "confirmSessionPicks|saveDraft\(" src/state/sessionStore.ts src/state/inventoryStore.ts`

Expected: no matches.

- [ ] **Step 5: Run store, inventory, and full tests**

Run: `npm test -- src/state/__tests__/sessionStore.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: existing Draft Hub and Draft call-site type failures identify the exact UI updates for Tasks 6 and 7; do not commit until temporary compatibility wrappers make this commit build, or implement the call-site signature-only edits in the same commit.

- [ ] **Step 6: Commit the store migration as a buildable unit**

```powershell
git add src/state/sessionStore.ts src/state/inventoryStore.ts src/state/__tests__/sessionStore.test.ts src/pages/DraftHub.tsx src/pages/Draft.tsx
git commit -m "feat: make chaos session mutations durable"
```

Only stage `DraftHub.tsx` and `Draft.tsx` here if their edits are limited to compiling against the new async signatures; behavioral UI changes remain in Tasks 6 and 7.

### Task 5: Animation/write coordinator

**Files:**
- Create: `src/utils/spinCheckpointCoordinator.ts`
- Create: `src/utils/__tests__/spinCheckpointCoordinator.test.ts`

**Interfaces:**
- Consumes: one already-chosen `Pack`, `persist(pack)`, and animation-completion signal.
- Produces: `createSpinCheckpointCoordinator` with `markAnimationComplete`, `retry`, `subscribe`, and immutable `SpinCheckpointState` snapshots.

- [ ] **Step 1: Write failing concurrency and retry tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createSpinCheckpointCoordinator } from '../spinCheckpointCoordinator';

it('starts persistence immediately and reveals only after both operations finish', async () => {
  let resolveSave!: (revision: number) => void;
  const persist = vi.fn(() => new Promise<number>(resolve => { resolveSave = resolve; }));
  const coordinator = createSpinCheckpointCoordinator(packFixture(), persist);
  expect(persist).toHaveBeenCalledWith(packFixture());
  expect(coordinator.getState().phase).toBe('animating');
  coordinator.markAnimationComplete();
  expect(coordinator.getState().phase).toBe('waiting-for-save');
  resolveSave(8);
  await coordinator.settled;
  expect(coordinator.getState()).toMatchObject({ phase: 'ready', pack: packFixture(), revision: 8 });
});

it('retries the identical landed pack after failure', async () => {
  const persist = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(9);
  const coordinator = createSpinCheckpointCoordinator(packFixture(), persist);
  coordinator.markAnimationComplete();
  await coordinator.settled;
  expect(coordinator.getState().phase).toBe('failed');
  await coordinator.retry();
  expect(persist).toHaveBeenNthCalledWith(2, packFixture());
  expect(coordinator.getState()).toMatchObject({ phase: 'ready', revision: 9 });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/utils/__tests__/spinCheckpointCoordinator.test.ts`

Expected: FAIL because the coordinator module does not exist.

- [ ] **Step 3: Implement the finite-state coordinator**

```ts
export type SpinCheckpointPhase = 'animating' | 'waiting-for-save' | 'failed' | 'ready';

export interface SpinCheckpointState<TPack> {
  phase: SpinCheckpointPhase;
  pack: TPack;
  revision?: number;
  error?: Error;
}

export function createSpinCheckpointCoordinator<TPack>(pack: TPack, persist: (pack: TPack) => Promise<number>) {
  let animationComplete = false;
  let state: SpinCheckpointState<TPack> = { phase: 'animating', pack };
  const listeners = new Set<(value: SpinCheckpointState<TPack>) => void>();
  let resolveSettled!: () => void;
  let settled = new Promise<void>(resolve => { resolveSettled = resolve; });

  const publish = (next: SpinCheckpointState<TPack>) => {
    state = next;
    listeners.forEach(listener => listener(state));
  };
  const save = async () => {
    try {
      const revision = await persist(pack);
      if (animationComplete) publish({ phase: 'ready', pack, revision });
      else publish({ phase: 'animating', pack, revision });
    } catch (value) {
      publish({ phase: 'failed', pack, error: value instanceof Error ? value : new Error(String(value)) });
    } finally {
      resolveSettled();
    }
  };
  void save();

  return {
    get settled() { return settled; },
    getState: () => state,
    subscribe(listener: (value: SpinCheckpointState<TPack>) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    markAnimationComplete() {
      animationComplete = true;
      if (state.revision !== undefined) publish({ phase: 'ready', pack, revision: state.revision });
      else if (state.phase !== 'failed') publish({ phase: 'waiting-for-save', pack });
    },
    async retry() {
      settled = new Promise<void>(resolve => { resolveSettled = resolve; });
      publish({ phase: animationComplete ? 'waiting-for-save' : 'animating', pack });
      await save();
    },
  };
}
```

- [ ] **Step 4: Add a test proving fast saves never enter waiting-for-save**

```ts
it('keeps a fast save visually silent until the animation completes', async () => {
  const coordinator = createSpinCheckpointCoordinator(packFixture(), async () => 2);
  await coordinator.settled;
  expect(coordinator.getState().phase).toBe('animating');
  coordinator.markAnimationComplete();
  expect(coordinator.getState().phase).toBe('ready');
});
```

- [ ] **Step 5: Run and commit**

Run: `npm test -- src/utils/__tests__/spinCheckpointCoordinator.test.ts`

Expected: PASS.

```powershell
git add src/utils/spinCheckpointCoordinator.ts src/utils/__tests__/spinCheckpointCoordinator.test.ts
git commit -m "feat: coordinate chaos spin checkpoints"
```

### Task 6: Admin-only entry, recovery panel, and non-admin format regression

**Files:**
- Create: `src/components/ActiveChaosDraftPrompt.tsx`
- Modify: `src/pages/RegularDraftSetup.tsx`
- Modify: `src/pages/DraftHub.tsx`
- Create: `src/utils/chaosDraftAccess.ts`
- Create: `src/utils/__tests__/chaosDraftAccess.test.ts`

**Interfaces:**
- Consumes: `profile` from `useUserStore`, repository `get`, and session `initializeSession`/`hydrateSession`/`discardSession`.
- Produces: `availableSetupFormats(isAdmin)`, `shouldDiscoverChaosCheckpoint(profile)`, and `ActiveChaosDraftPrompt`.

- [ ] **Step 1: Write the explicit non-admin regression tests**

```ts
import { describe, expect, it } from 'vitest';
import { availableCardSources, availableSetupFormats, shouldDiscoverChaosCheckpoint } from '../chaosDraftAccess';

it('keeps every non-chaos format available to an approved non-admin', () => {
  expect(availableSetupFormats(false)).toEqual([
    'Regular Draft', 'Mobius Draft', 'Sealed', 'Team Sealed',
  ]);
});

it('keeps cube as a card source for non-admin regular formats', () => {
  expect(availableCardSources('Regular Draft')).toEqual(['sets', 'cube']);
  expect(availableCardSources('Mobius Draft')).toEqual(['sets', 'cube']);
  expect(availableSetupFormats(false)).not.toContain('Chaos Draft');
});

it('only discovers checkpoints for approved admins', () => {
  expect(shouldDiscoverChaosCheckpoint({ role: 'admin', status: 'approved' })).toBe(true);
  expect(shouldDiscoverChaosCheckpoint({ role: 'user', status: 'approved' })).toBe(false);
  expect(shouldDiscoverChaosCheckpoint({ role: 'admin', status: 'pending' })).toBe(false);
});
```

- [ ] **Step 2: Run the policy test and verify it fails**

Run: `npm test -- src/utils/__tests__/chaosDraftAccess.test.ts`

Expected: FAIL because `chaosDraftAccess.ts` does not exist.

- [ ] **Step 3: Implement the pure access policy and make setup consume it**

```ts
// src/utils/chaosDraftAccess.ts
import type { DraftFormat } from '../types';

export type SetupFormat = 'Chaos Draft' | DraftFormat;
const NON_CHAOS_FORMATS: DraftFormat[] = ['Regular Draft', 'Mobius Draft', 'Sealed', 'Team Sealed'];

export function availableSetupFormats(isAdmin: boolean): SetupFormat[] {
  return isAdmin ? ['Chaos Draft', ...NON_CHAOS_FORMATS] : [...NON_CHAOS_FORMATS];
}

export function availableCardSources(format: SetupFormat): Array<'sets' | 'cube'> {
  return format === 'Chaos Draft' ? ['sets'] : ['sets', 'cube'];
}

export function shouldDiscoverChaosCheckpoint(profile: { role: string; status: string } | null): boolean {
  return profile?.role === 'admin' && profile.status === 'approved';
}
```

Add `canStartChaos: boolean` to `RegularDraftSetupProps`. Initialize `format` with `availableSetupFormats(canStartChaos)[0]`, render that returned array, and preserve both `sets` and `cube` source buttons for all non-Chaos formats. Reject `handleSubmit` if `format === 'Chaos Draft' && !canStartChaos` as a defense in depth.

- [ ] **Step 4: Build the recovery panel with explicit confirmation before discard**

```tsx
interface Props {
  checkpoint: ActiveChaosDraft;
  busy: boolean;
  error: string | null;
  onResume(): void;
  onDiscard(): Promise<void>;
}

export default function ActiveChaosDraftPrompt({ checkpoint, busy, error, onResume, onDiscard }: Props) {
  const discard = async () => {
    if (window.confirm('Discard this unfinished Chaos Draft? Its checkpoint cannot be recovered afterward.')) {
      await onDiscard();
    }
  };
  return (
    <section aria-label="Unfinished Chaos Draft" className="bg-gray-800 rounded-xl border border-yellow-700 p-5 space-y-3">
      <h2 className="text-xl font-bold text-yellow-300">Unfinished Chaos Draft</h2>
      <p>{checkpoint.packsSelectedOrder.length} / {checkpoint.numPacks} packs selected · {checkpoint.players.length} players</p>
      <p className="text-sm text-gray-400">Last updated {checkpoint.updatedAt.toDate().toLocaleString()}</p>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button disabled={busy} onClick={onResume}>Resume Draft</button>
        <button disabled={busy} onClick={() => void discard()}>Discard Draft</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Integrate admin-only discovery and durable start into Draft Hub**

In `DraftHub`, derive `isAdmin = profile?.role === 'admin' && profile.status === 'approved'`. Only inside that true branch call `activeChaosDraftRepository.get(profile.uid)`. A load error sets `chaosUnavailableError` but still renders `RegularDraftSetup` and all non-Chaos formats. An existing checkpoint renders `ActiveChaosDraftPrompt`; Resume calls `hydrateSession(checkpoint)` then navigates, and Discard awaits `discardSession()` before clearing the panel. Chaos seating confirmation awaits `initializeSession(ordered, ordered.length * 3)` before navigation and retains setup with a retryable error on failure.

- [ ] **Step 6: Verify tests, build, and format accessibility manually**

Run: `npm test -- src/utils/__tests__/chaosDraftAccess.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit the admin boundary and recovery panel**

```powershell
git add src/components/ActiveChaosDraftPrompt.tsx src/pages/RegularDraftSetup.tsx src/pages/DraftHub.tsx src/utils/chaosDraftAccess.ts src/utils/__tests__/chaosDraftAccess.test.ts
git commit -m "feat: add admin chaos draft recovery entry"
```

### Task 7: Draft-page hydration, checkpointed animation, undo, tournament, discard, and finalization UX

**Files:**
- Modify: `src/pages/Draft.tsx`
- Modify: `src/state/__tests__/sessionStore.test.ts`

**Interfaces:**
- Consumes: Task 4 durable session actions, Task 5 coordinator, authenticated admin profile, live inventory, repository `get`, and draft-history `loadDrafts`.
- Produces: recoverable direct `/draft` access and all required pending/error/conflict states.

- [ ] **Step 1: Add store tests for failed tournament persistence, conflict hydration, and ambiguous confirmation**

```ts
it('does not expose a tournament when persistence fails', async () => {
  hydrateCompleteFixture();
  repositoryMock.saveTournament.mockRejectedValue(new Error('offline'));
  await expect(useSessionStore.getState().setPendingTournament(tournamentFixture())).rejects.toThrow('offline');
  expect(useSessionStore.getState().pendingTournament).toBeNull();
});

it('returns unknown reconciliation failures without clearing local state', async () => {
  hydrateCompleteFixture();
  repositoryMock.reconcile.mockRejectedValue(new Error('offline'));
  await expect(useSessionStore.getState().reconcileConfirmation()).rejects.toThrow('offline');
  expect(useSessionStore.getState().sessionId).toBe('session-1');
});
```

- [ ] **Step 2: Add direct-route hydration and access protection**

On mount, wait for profile and inventory loading. If the user is not an approved admin, render a message and link back to `/drafts`; do not call the checkpoint repository. If local `sessionId` is empty for an admin, read `activeChaosDrafts/{uid}`, validate/hydrate it, or show a blocking explanation that keeps the server checkpoint intact. Disable all mutation controls during hydration.

- [ ] **Step 3: Start checkpoint persistence at winner selection and finish reveal after both boundaries**

Immediately after `pickWeightedRandomPack`, create the coordinator before `requestAnimationFrame(animate)`:

```ts
const coordinator = createSpinCheckpointCoordinator(selectedPack, checkpointSelectedPack);
spinCheckpointRef.current = coordinator;
unsubscribeSpinRef.current = coordinator.subscribe(state => {
  setSpinCheckpointState(state);
  if (state.phase === 'ready' && state.revision !== undefined) {
    applyCheckpointedPack(state.pack, state.revision);
    setSelectedForDisplay(state.pack);
    setShowPopup(true);
    selectedPackRef.current = null;
    spinCheckpointRef.current = null;
  }
});
```

At the existing animation completion boundary call `coordinator.markAnimationComplete()` instead of `selectPackForNextPlayer`. Keep the landed image visible while phase is `waiting-for-save`. Start a 1000 ms timer only after that phase begins; show `Saving selected pack…` if the phase is still unresolved when it fires. Clear the timer for `ready` or `failed`. A failed state renders `Could not save this pack` and a **Retry Save** button wired to `coordinator.retry()`; it never chooses another pack.

- [ ] **Step 4: Disable every mutation while a spin write or other durable action is pending**

Define one guard:

```ts
const mutationLocked = mutationPending || spinCheckpointState?.phase === 'animating' || spinCheckpointState?.phase === 'waiting-for-save';
const canSpin = !spinning && !mutationLocked && availablePacks.length > 0 && !confirmed;
const canUndo = packsSelectedOrder.length > 0 && !spinning && !mutationLocked && !confirmed;
```

Apply it to Spin, Undo, Discard, Round 1, and Confirm. Keep the regular animation text unchanged; do not add a saving label for a fast write.

- [ ] **Step 5: Await tournament persistence before finalization**

```ts
const handleStartRound1 = async () => {
  const tournament: DraftTournament = {
    seats: playersToSeats(players),
    rounds: [{ roundNumber: 1, pairings: round1Pairings, status: 'active' }],
    currentRound: 1,
    totalRounds: 3,
    status: 'active',
  };
  setIsConfirming(true);
  try {
    await setPendingTournament(tournament);
    setShowMatchupsModal(false);
    await handleConfirm();
  } catch (error) {
    setConfirmationError(error instanceof Error ? error.message : 'Failed to save Round 1.');
  } finally {
    setIsConfirming(false);
  }
};
```

Confirmation stays disabled unless `pendingTournament !== null` and `packsSelectedOrder.length === numPacks`.

- [ ] **Step 6: Replace Reset Session and implement finalization/reconciliation outcomes**

Replace **Reset Session** with **Discard Draft**. Its click uses `window.confirm`, awaits `discardSession`, and navigates to `/drafts` only on success. `handleConfirm` calls the atomic `confirmSession`; on success it awaits `loadDrafts()` then navigates to `/tournament`. If the transaction throws a network/unknown-commit error, render **Check Again** and call `reconcileConfirmation`. Handle outcomes exactly: `committed` clears local state, loads drafts, and navigates; `not-committed` rehydrates its checkpoint and enables retry; `integrity-error` blocks mutations and shows support-identifying owner/session/finalDraft IDs. A reconciliation request failure leaves **Check Again** visible and does not retry finalization.

- [ ] **Step 7: Reload newest checkpoint on revision conflicts**

Catch `ChaosDraftConflictError` from append, undo, tournament, and discard. Read the current checkpoint, call `hydrateSession` with live inventory, cancel any visual pending spin, and show `This draft was updated on another device. The latest saved state has been loaded.` Never re-run a random selection automatically.

- [ ] **Step 8: Run focused tests, full tests, lint, and build**

Run: `npm test -- src/state/__tests__/sessionStore.test.ts src/utils/__tests__/spinCheckpointCoordinator.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 9: Commit Draft-page integration**

```powershell
git add src/pages/Draft.tsx src/state/__tests__/sessionStore.test.ts
git commit -m "feat: checkpoint chaos picks during animation"
```

### Task 8: Firestore rules and emulator integration coverage

**Files:**
- Modify: `firestore.rules`
- Create: `firebase.json`
- Modify: `vitest.config.ts`
- Create: `test/firestore/activeChaosDraft.integration.test.ts`

**Interfaces:**
- Consumes: production repository factory with emulator Firestore instances and mock authenticated tokens.
- Produces: verified owner/admin rule boundaries and end-to-end transaction invariants.

- [ ] **Step 1: Configure the emulator and test discovery**

```json
// firebase.json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "firestore": { "host": "127.0.0.1", "port": 8080 },
    "singleProjectMode": true
  }
}
```

Change the Vitest include list to:

```ts
include: ['src/**/*.{test,spec}.{ts,tsx}', 'api/**/*.{test,spec}.js', 'test/**/*.{test,spec}.ts'],
```

- [ ] **Step 2: Write emulator helpers using only the installed Firebase Web SDK**

In `test/firestore/activeChaosDraft.integration.test.ts`, create named Firebase apps per actor, call `connectAuthEmulator` and `connectFirestoreEmulator`, and pass `mockUserToken: { sub: uid, user_id: uid, email: `${uid}@test.invalid` }`. Seed each actor's own `users/{uid}` document through the permitted self-create rule. Clear emulator state between tests with:

```ts
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
```

Use project ID `demo-chaos-checkpoints` so tests cannot reach production.

- [ ] **Step 3: Add checkpoint rules with exact ownership, key, type, and transition restrictions**

Add these helper functions and match block to `firestore.rules`:

```text
function validChaosCheckpointCreate(ownerId) {
  return request.resource.data.keys().hasAll([
      'ownerId', 'sessionId', 'finalDraftId', 'revision', 'players',
      'numPacks', 'packsSelectedOrder', 'createdAt', 'updatedAt'
    ])
    && request.resource.data.keys().hasOnly([
      'ownerId', 'sessionId', 'finalDraftId', 'revision', 'players',
      'numPacks', 'packsSelectedOrder', 'pendingTournament', 'createdAt', 'updatedAt'
    ])
    && request.resource.data.ownerId == ownerId
    && request.resource.data.ownerId == request.auth.uid
    && request.resource.data.sessionId is string
    && request.resource.data.finalDraftId is string
    && request.resource.data.revision == 0
    && request.resource.data.players is list
    && request.resource.data.players.size() >= 2
    && request.resource.data.numPacks is int
    && request.resource.data.numPacks > 0
    && request.resource.data.packsSelectedOrder is list
    && request.resource.data.packsSelectedOrder.size() == 0
    && request.resource.data.createdAt is timestamp
    && request.resource.data.updatedAt is timestamp;
}

function validChaosCheckpointUpdate() {
  let changed = request.resource.data.diff(resource.data).affectedKeys();
  return !changed.hasAny(['ownerId', 'sessionId', 'finalDraftId', 'players', 'numPacks', 'createdAt'])
    && changed.hasOnly(['packsSelectedOrder', 'pendingTournament', 'revision', 'updatedAt'])
    && request.resource.data.revision == resource.data.revision + 1
    && request.resource.data.packsSelectedOrder is list
    && request.resource.data.packsSelectedOrder.size() >= 0
    && request.resource.data.packsSelectedOrder.size() <= resource.data.numPacks
    && request.resource.data.updatedAt is timestamp
    && (
      (
        changed.hasAny(['packsSelectedOrder'])
        && !changed.hasAny(['pendingTournament'])
        && (
          request.resource.data.packsSelectedOrder.size() == resource.data.packsSelectedOrder.size() + 1
          || request.resource.data.packsSelectedOrder.size() == resource.data.packsSelectedOrder.size() - 1
        )
      )
      || (
        changed.hasAny(['pendingTournament'])
        && !changed.hasAny(['packsSelectedOrder'])
      )
    );
}

match /activeChaosDrafts/{ownerId} {
  allow read: if isAdmin() && request.auth.uid == ownerId;
  allow create: if isAdmin() && validChaosCheckpointCreate(ownerId);
  allow update: if isAdmin() && request.auth.uid == ownerId && validChaosCheckpointUpdate();
  allow delete: if isAdmin() && request.auth.uid == ownerId;
}
```

Also narrow only Chaos creation in the existing `drafts` match while preserving every non-Chaos create for approved users:

```text
match /drafts/{draftId} {
  allow read: if isApproved();
  allow create: if isApproved()
    && (request.resource.data.type != 'chaos' || isAdmin());
  allow update: if isApproved() && (
    isAdmin()
    || nonAdminDraftUpdateAllowed()
  );
  allow delete: if isAdmin();
}
```

- [ ] **Step 4: Write security tests for admin owner, non-admin, cross-owner, malformed create, and stale revision**

```ts
it('allows only the approved admin owner to read and create a checkpoint', async () => {
  await expect(adminRepository.create(createInput())).resolves.toMatchObject({ ownerId: 'admin-1' });
  await expect(userRepository.get('user-1')).rejects.toThrow();
  await expect(otherAdminRepository.get('admin-1')).rejects.toThrow();
});

it('rejects malformed and stale direct updates', async () => {
  await expect(updateDoc(activeRef, { revision: 4, ownerId: 'other' })).rejects.toThrow();
  await expect(updateDoc(activeRef, { revision: 9, updatedAt: serverTimestamp() })).rejects.toThrow();
});

it.each(['regular', 'mobius', 'sealed', 'team-sealed'])('allows an approved non-admin to create a %s draft', async type => {
  await expect(setDoc(doc(userDb, 'drafts', `user-${type}`), nonChaosDraftFixture(type))).resolves.toBeUndefined();
});

it('denies direct Chaos draft creation by an approved non-admin', async () => {
  await expect(setDoc(doc(userDb, 'drafts', 'user-chaos'), chaosDraftFixture())).rejects.toThrow();
});
```

- [ ] **Step 5: Write repository integration tests for inventory and atomic finalization**

Cover these exact assertions in separate `it` blocks:

```ts
expect((await getDoc(packRef)).data()?.inPerson).toBe(quantityBeforeCheckpoint);
expect((await getDoc(finalDraftRef)).exists()).toBe(false);
```

After successful finalization, assert the first and only draft snapshot contains every exact payload field, both timestamp fields are `Timestamp` instances, each inventory quantity equals `before - count`, and the checkpoint is absent. For existing draft, insufficient inventory, missing/invalid tournament, stale revision, and injected permission failure, assert the final draft is absent, every inventory quantity is unchanged, and the checkpoint still exists. Add a stale-discard test using two clients and assert the newer checkpoint survives.

- [ ] **Step 6: Write reconciliation tests for all four document-presence combinations**

Test `draft only -> committed`, `checkpoint only -> not-committed`, `both -> integrity-error`, and `neither -> integrity-error`. Stop the emulator or point a dedicated client at an unused port for one test and assert reconciliation rejects rather than returning a success/failure state from cache.

- [ ] **Step 7: Run the emulator integration suite**

Run: `firebase emulators:exec --only firestore --project demo-chaos-checkpoints "npm test -- test/firestore/activeChaosDraft.integration.test.ts"`

Expected: PASS, with the command starting only the local Firestore emulator.

- [ ] **Step 8: Run all verification and commit**

Run: `npm test`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

```powershell
git add firestore.rules firebase.json vitest.config.ts test/firestore/activeChaosDraft.integration.test.ts
git commit -m "test: enforce chaos checkpoint transactions"
```

### Task 9: End-to-end browser verification and final cleanup

**Files:**
- Modify only if verification exposes a defect: files already listed in Tasks 1–8.

**Interfaces:**
- Consumes: the complete checkpoint feature and local Firestore emulator.
- Produces: verified recovery and access behavior with no stray checkpoint/history documents.

- [ ] **Step 1: Start the app against the Firestore emulator**

Run the emulator and Vite with an emulator-only environment. Use a `demo-` project ID and never point this verification at production data.

Run: `firebase emulators:start --only firestore --project demo-chaos-checkpoints`

Run in a second terminal: `npm run dev -- --host 127.0.0.1`

Expected: Firestore listens on `127.0.0.1:8080` and Vite prints its localhost URL.

- [ ] **Step 2: Verify the fast checkpoint and refresh path**

As an approved admin, start a Chaos Draft, spin one pack, refresh during its animation after the emulator shows the checkpoint commit, resume, and verify progress is `1 / N`, the pack belongs to player 1, and inventory has not changed. Continue one full seating rotation and verify the next-player name and round-robin assignment.

- [ ] **Step 3: Verify failed-write retry and conflict behavior**

Disconnect the Firestore emulator after a winner is chosen. Let the animation finish and verify the landed pack remains, the normal flow initially shows no saving interruption, delayed status appears, and the error offers **Retry Save** for the same pack. Restore the emulator and retry. Open a second admin browser session, advance the checkpoint, then attempt undo in the stale session and verify it reloads the newer state without rerolling.

- [ ] **Step 4: Verify atomic completion and history cleanliness**

Complete the required picks and Round 1 setup. Before confirmation, inspect the emulator and verify `drafts/{finalDraftId}` does not exist. Confirm, then verify one fully populated finalized draft exists, quantities were deducted exactly once, and `activeChaosDrafts/{ownerId}` is absent. Force a failed confirmation in a separate run and verify the checkpoint remains, inventory is unchanged, and no draft-history row exists.

- [ ] **Step 5: Verify non-admin formats independently**

As an approved non-admin, verify there is no Chaos Draft format and no read is attempted against `activeChaosDrafts`. Successfully reach preview/seating for Regular Draft, Mobius Draft, Sealed, Team Sealed, and Regular Draft with Cube source. Verify `/draft` shows the access explanation while `/drafts` remains usable.

- [ ] **Step 6: Run the final automated gate and inspect the diff**

Run: `npm test`

Expected: PASS.

Run: `firebase emulators:exec --only firestore --project demo-chaos-checkpoints "npm test -- test/firestore/activeChaosDraft.integration.test.ts"`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: only the pre-existing repair utility/package changes remain unstaged; all checkpoint feature files are committed.

- [ ] **Step 7: Commit any verification fixes after reviewing their exact diff**

First run `git diff --name-only` and inspect every reported file. If verification changed only `src/pages/Draft.tsx` and `src/state/sessionStore.ts`, commit exactly those paths:

```powershell
git add src/pages/Draft.tsx src/state/sessionStore.ts
git diff --cached --check
git commit -m "fix: harden chaos draft recovery flow"
```

If the reported checkpoint fix uses a different file from Tasks 1–8, substitute that explicit checkpoint file path before running the command. Do not use `git add -A` because the unrelated repair utility remains in the worktree. If verification required no fix, skip this commit.
