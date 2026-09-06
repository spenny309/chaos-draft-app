import { initializeApp } from 'firebase/app';
import { getFirestore, runTransaction, Timestamp, type Transaction } from 'firebase/firestore';
import { describe, expect, it, vi } from 'vitest';
import type {
  ActiveChaosDraft,
  DraftPackRef,
  DraftPlayer,
  DraftTournament,
} from '../../types';
import {
  ChaosDraftConflictError,
  ChaosDraftValidationError,
  createActiveChaosDraftRepository,
  createFirestoreAdapter,
  type CheckpointCommand,
  type CreateChaosDraftInput,
  type FirestoreAdapter,
  type FirestoreTransactionAdapter,
} from '../activeChaosDraftRepository';

vi.mock('../../firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  runTransaction: vi.fn(),
}));

interface InventoryPackDocument extends DraftPackRef {
  ownerId: string;
  catalogId: string;
  inPerson: number;
  inTransit: number;
}

const players: DraftPlayer[] = [
  { id: 'player-1', name: 'Player 1', userId: null },
  { id: 'player-2', name: 'Player 2', userId: null },
];

function packRefFixture(overrides: Partial<DraftPackRef> = {}): DraftPackRef {
  return { id: 'pack-1', name: 'Pack 1', imageUrl: 'pack.jpg', ...overrides };
}

function packFixture(overrides: Partial<InventoryPackDocument> = {}): InventoryPackDocument {
  return {
    ...packRefFixture(),
    ownerId: 'admin-1',
    catalogId: 'catalog-1',
    inPerson: 3,
    inTransit: 0,
    ...overrides,
  };
}

function checkpointFixture(overrides: Partial<ActiveChaosDraft> = {}): ActiveChaosDraft {
  return {
    ownerId: 'admin-1',
    sessionId: 'session-1',
    finalDraftId: 'draft-1',
    revision: 0,
    players,
    numPacks: 2,
    packsSelectedOrder: [],
    createdAt: Timestamp.fromMillis(1),
    updatedAt: Timestamp.fromMillis(2),
    ...overrides,
  };
}

function createInput(overrides: Partial<CreateChaosDraftInput> = {}): CreateChaosDraftInput {
  return {
    ownerId: 'admin-1',
    sessionId: 'session-1',
    players,
    numPacks: 2,
    ...overrides,
  };
}

function commandFixture(overrides: Partial<CheckpointCommand> = {}): CheckpointCommand {
  return {
    ownerId: 'admin-1',
    sessionId: 'session-1',
    expectedRevision: 0,
    ...overrides,
  };
}

function tournamentFixture(overrides: { playerId?: string } = {}): DraftTournament {
  return {
    seats: players.map((player, index) => ({ playerId: player.id, seat: index + 1 })),
    rounds: [
      {
        roundNumber: 1,
        status: 'active',
        pairings: [
          {
            id: 'round-1-match-1',
            player1Id: overrides.playerId ?? 'player-1',
            player2Id: 'player-2',
            status: 'pending',
          },
        ],
      },
    ],
    currentRound: 1,
    totalRounds: 1,
    status: 'active',
  };
}

interface FakeAdapterState {
  checkpoint?: ActiveChaosDraft;
  checkpointAfterTransaction?: ActiveChaosDraft;
  pack?: InventoryPackDocument;
  packs?: InventoryPackDocument[];
  draft?: Record<string, unknown>;
  failWrite?: string;
  transactionError?: Error;
}

function fakeAdapter(initial: FakeAdapterState = {}) {
  let documents = new Map<string, unknown>();
  if (initial.checkpoint) documents.set('activeChaosDrafts/admin-1', initial.checkpoint);
  if (initial.draft) documents.set('drafts/draft-1', initial.draft);
  for (const pack of initial.packs ?? (initial.pack ? [initial.pack] : [])) {
    documents.set(`packs/${pack.id}`, pack);
  }
  const timestamp = Timestamp.fromMillis(3);
  const operations: string[] = [];
  let pending = documents;

  const get = vi.fn(async (path: string): Promise<unknown | null> => documents.get(path) ?? null);
  function recordWrite(operation: string) {
    operations.push(operation);
    if (initial.failWrite === operation) throw new Error('Transaction write failed.');
  }
  const create = vi.fn((path: string, value: Record<string, unknown>) => {
    recordWrite(`create:${path}`);
    if (pending.has(path)) throw new Error('Document already exists.');
    pending.set(path, value);
  });
  const update = vi.fn((path: string, value: Record<string, unknown>) => {
    recordWrite(`update:${path}`);
    if (!pending.has(path)) throw new Error('Document does not exist.');
    pending.set(path, { ...pending.get(path) as Record<string, unknown>, ...value });
  });
  const remove = vi.fn((path: string) => {
    recordWrite(`delete:${path}`);
    pending.delete(path);
  });
  const transaction: FirestoreTransactionAdapter = {
    async get(path) {
      if (operations.some((operation) => !operation.startsWith('read:'))) {
        throw new Error('All transaction reads must precede writes.');
      }
      operations.push(`read:${path}`);
      return documents.get(path) ?? null;
    },
    create,
    update,
    delete: remove,
  };
  const runTransaction = vi.fn(
    async (operation: (value: FirestoreTransactionAdapter) => Promise<unknown>) => {
      operations.length = 0;
      pending = new Map(documents);
      const result = await operation(transaction);
      if (initial.transactionError) throw initial.transactionError;
      documents = pending;
      if (initial.checkpointAfterTransaction) {
        documents.set('activeChaosDrafts/admin-1', initial.checkpointAfterTransaction);
      }
      return result;
    },
  ) as FirestoreAdapter['runTransaction'];
  const adapter = {
    get,
    create,
    update,
    delete: remove,
    generateId: vi.fn(() => 'generated-draft-id'),
    serverTimestamp: vi.fn(() => timestamp),
    runTransaction,
    operationNames: () => [...operations],
    writeOperations: () => operations.filter((operation) => !operation.startsWith('read:')),
    snapshot: () => new Map(documents),
  } satisfies FirestoreAdapter & FirestoreTransactionAdapter & {
    operationNames(): string[];
    writeOperations(): string[];
    snapshot(): Map<string, unknown>;
  };

  return adapter;
}

function completeCheckpointFixture(overrides: Partial<ActiveChaosDraft> = {}): ActiveChaosDraft {
  return checkpointFixture({
    numPacks: 3,
    packsSelectedOrder: [
      packRefFixture({ id: 'a' }),
      packRefFixture({ id: 'b' }),
      packRefFixture({ id: 'a' }),
    ],
    pendingTournament: tournamentFixture(),
    ...overrides,
  });
}

function finalizedDraftFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const active = completeCheckpointFixture();
  return {
    type: 'chaos',
    createdBy: 'admin-1',
    createdAt: Timestamp.fromMillis(3),
    status: 'finalized',
    finalizedAt: Timestamp.fromMillis(3),
    finalizedBy: 'admin-1',
    sessionId: 'session-1',
    players,
    packsSelectedOrder: active.packsSelectedOrder,
    restockComplete: false,
    tournament: active.pendingTournament,
    ...overrides,
  };
}

describe('atomic finalization', () => {
  it('keeps draft history and inventory untouched throughout checkpointing and discard', async () => {
    const adapter = fakeAdapter({ pack: packFixture() });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await repository.create(createInput());
    await repository.appendPack(commandFixture(), packRefFixture());
    await repository.appendPack(commandFixture({ expectedRevision: 1 }), packRefFixture());
    await repository.undo(commandFixture({ expectedRevision: 2 }));
    await repository.appendPack(commandFixture({ expectedRevision: 3 }), packRefFixture());
    await repository.saveTournament(commandFixture({ expectedRevision: 4 }), tournamentFixture());
    await expect(repository.get('admin-1')).resolves.toMatchObject({ revision: 5 });

    expect(adapter.snapshot().has('drafts/generated-draft-id')).toBe(false);
    expect(adapter.snapshot().get('packs/pack-1')).toEqual(packFixture());
    await repository.discard(commandFixture({ expectedRevision: 5 }));
    expect(adapter.snapshot()).toEqual(new Map([['packs/pack-1', packFixture()]]));
    expect(adapter.create.mock.calls.map(([path]) => path)).toEqual(['activeChaosDrafts/admin-1']);
    expect(adapter.update.mock.calls.every(([path]) => path === 'activeChaosDrafts/admin-1')).toBe(true);
  });

  it('creates the complete first draft payload and deducts exact quantities before deleting the checkpoint', async () => {
    const active = completeCheckpointFixture();
    const adapter = fakeAdapter({
      checkpoint: active,
      packs: [packFixture({ id: 'a', inPerson: 3 }), packFixture({ id: 'b', inPerson: 2 })],
    });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.finalize(commandFixture())).resolves.toEqual({ draftId: 'draft-1' });

    expect(adapter.create).toHaveBeenCalledExactlyOnceWith('drafts/draft-1', {
      type: 'chaos',
      createdBy: 'admin-1',
      createdAt: Timestamp.fromMillis(3),
      status: 'finalized',
      finalizedAt: Timestamp.fromMillis(3),
      finalizedBy: 'admin-1',
      sessionId: 'session-1',
      players,
      packsSelectedOrder: [
        { id: 'a', name: 'Pack 1', imageUrl: 'pack.jpg' },
        { id: 'b', name: 'Pack 1', imageUrl: 'pack.jpg' },
        { id: 'a', name: 'Pack 1', imageUrl: 'pack.jpg' },
      ],
      restockComplete: false,
      tournament: tournamentFixture(),
    });
    expect(adapter.serverTimestamp).toHaveBeenCalledTimes(2);
    expect(adapter.operationNames()).toEqual([
      'read:activeChaosDrafts/admin-1', 'read:drafts/draft-1', 'read:packs/a', 'read:packs/b',
      'create:drafts/draft-1', 'update:packs/a', 'update:packs/b', 'delete:activeChaosDrafts/admin-1',
    ]);
    expect(adapter.update).toHaveBeenCalledWith('packs/a', { inPerson: 1 });
    expect(adapter.update).toHaveBeenCalledWith('packs/b', { inPerson: 1 });
    expect(adapter.snapshot().get('packs/a')).toEqual(packFixture({ id: 'a', inPerson: 1 }));
    expect(adapter.snapshot().get('packs/b')).toEqual(packFixture({ id: 'b', inPerson: 1 }));
    expect(adapter.snapshot().get('drafts/draft-1')).toEqual(finalizedDraftFixture());
    expect(adapter.snapshot().has('activeChaosDrafts/admin-1')).toBe(false);
    expect(adapter.runTransaction).toHaveBeenCalledTimes(1);
    expect(adapter.get).not.toHaveBeenCalled();
    expect(adapter.generateId).not.toHaveBeenCalled();
  });

  it.each([
    ['missing checkpoint', { checkpoint: undefined }],
    ['stale session', { checkpoint: completeCheckpointFixture({ sessionId: 'replacement' }) }],
    ['stale revision', { checkpoint: completeCheckpointFixture({ revision: 1 }) }],
    ['incomplete selection', { checkpoint: completeCheckpointFixture({ numPacks: 4 }) }],
    ['missing tournament', { checkpoint: completeCheckpointFixture({ pendingTournament: undefined }) }],
    ['inactive tournament', { checkpoint: completeCheckpointFixture({ pendingTournament: { ...tournamentFixture(), status: 'finalized' } }) }],
    ['wrong tournament players', { checkpoint: completeCheckpointFixture({ pendingTournament: tournamentFixture({ playerId: 'unknown' }) }) }],
    ['existing final draft', { draft: finalizedDraftFixture() }],
    ['missing pack', { packs: [packFixture({ id: 'a' })] }],
    ['insufficient inventory', { packs: [packFixture({ id: 'a' }), packFixture({ id: 'b', inPerson: 0 })] }],
    ['wrong pack owner', { packs: [packFixture({ id: 'a' }), packFixture({ id: 'b', ownerId: 'other-admin' })] }],
    ['invalid pack metadata', { packs: [packFixture({ id: 'a' }), packFixture({ id: 'b', name: '' })] }],
  ] satisfies [string, FakeAdapterState][])('%s prevents every write and preserves all documents', async (_label, overrides) => {
    const adapter = fakeAdapter({
      checkpoint: completeCheckpointFixture(),
      packs: [packFixture({ id: 'a' }), packFixture({ id: 'b' })],
      ...overrides,
    });
    const before = adapter.snapshot();
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.finalize(commandFixture())).rejects.toThrow();
    expect(adapter.writeOperations()).toEqual([]);
    expect(adapter.snapshot()).toEqual(before);
  });

  it('classifies malformed nested tournament data as validation and performs no writes', async () => {
    const malformedTournament = {
      ...tournamentFixture(),
      rounds: [{ ...tournamentFixture().rounds[0], pairings: [null] }],
    } as unknown as DraftTournament;
    const adapter = fakeAdapter({
      checkpoint: completeCheckpointFixture({ pendingTournament: malformedTournament }),
      packs: [packFixture({ id: 'a' }), packFixture({ id: 'b' })],
    });
    const before = adapter.snapshot();
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.finalize(commandFixture())).rejects.toBeInstanceOf(
      ChaosDraftValidationError,
    );
    expect(adapter.writeOperations()).toEqual([]);
    expect(adapter.snapshot()).toEqual(before);
  });

  it.each([
    'create:drafts/draft-1', 'update:packs/a', 'update:packs/b', 'delete:activeChaosDrafts/admin-1', 'commit',
  ])('rolls back all documents when %s fails', async (failure) => {
    const adapter = fakeAdapter({
      checkpoint: completeCheckpointFixture(),
      packs: [packFixture({ id: 'a' }), packFixture({ id: 'b' })],
      failWrite: failure,
      transactionError: failure === 'commit' ? new Error('Commit rejected.') : undefined,
    });
    const before = adapter.snapshot();
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.finalize(commandFixture())).rejects.toThrow();
    expect(adapter.snapshot()).toEqual(before);
    expect(adapter.snapshot().has('drafts/draft-1')).toBe(false);
  });
});

describe('authoritative finalization reconciliation', () => {
  it.each([
    [true, false, { status: 'committed', draftId: 'draft-1' }],
    [false, true, { status: 'not-committed', checkpoint: completeCheckpointFixture() }],
    [true, true, { status: 'integrity-error' }],
    [false, false, { status: 'integrity-error' }],
  ])('reconciles draft=%s checkpoint=%s in one read-only transaction', async (draftExists, checkpointExists, expected) => {
    const adapter = fakeAdapter({
      draft: draftExists ? finalizedDraftFixture() : undefined,
      checkpoint: checkpointExists ? completeCheckpointFixture() : undefined,
    });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).resolves.toEqual(expected);
    expect(adapter.runTransaction).toHaveBeenCalledTimes(1);
    expect(adapter.operationNames()).toEqual(['read:drafts/draft-1', 'read:activeChaosDrafts/admin-1']);
    expect(adapter.get).not.toHaveBeenCalled();
    expect(adapter.writeOperations()).toEqual([]);
  });

  it.each([
    { type: 'regular' }, { status: 'pending' }, { createdBy: 'other-admin' },
    { finalizedBy: 'other-admin' }, { sessionId: '' },
  ])('treats an unexpected finalized draft as an integrity error (%j)', async (overrides) => {
    const adapter = fakeAdapter({ draft: finalizedDraftFixture(overrides) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).resolves.toEqual({ status: 'integrity-error' });
    expect(adapter.writeOperations()).toEqual([]);
  });

  it('treats a finalized draft from a different session as an integrity error', async () => {
    const adapter = fakeAdapter({ draft: finalizedDraftFixture({ sessionId: 'other-session' }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).resolves.toEqual({
      status: 'integrity-error',
    });
    expect(adapter.writeOperations()).toEqual([]);
  });

  it('does not offer retry for a checkpoint that belongs to a different session', async () => {
    const adapter = fakeAdapter({ checkpoint: completeCheckpointFixture({ sessionId: 'other-session' }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).resolves.toEqual({
      status: 'integrity-error',
    });
    expect(adapter.writeOperations()).toEqual([]);
  });

  it('does not offer retry for a checkpoint that belongs to a different final draft', async () => {
    const adapter = fakeAdapter({ checkpoint: completeCheckpointFixture({ finalDraftId: 'replacement-draft' }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).resolves.toEqual({ status: 'integrity-error' });
    expect(adapter.writeOperations()).toEqual([]);
  });

  it('propagates unavailable authoritative reads as unknown instead of declaring an outcome', async () => {
    const failure = new Error('Server unavailable.');
    const adapter = fakeAdapter({ transactionError: failure });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).rejects.toBe(failure);
    expect(adapter.writeOperations()).toEqual([]);
  });

  it('uses the transaction result after a concurrent finalization instead of stale ordinary reads', async () => {
    const adapter = fakeAdapter({ draft: finalizedDraftFixture() });
    adapter.get.mockResolvedValue(completeCheckpointFixture());
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).resolves.toEqual({
      status: 'committed', draftId: 'draft-1',
    });
    expect(adapter.get).not.toHaveBeenCalled();
    expect(adapter.writeOperations()).toEqual([]);
  });
});

describe('production Firestore transaction authority', () => {
  const firestore = getFirestore(initializeApp({ projectId: 'authority-test' }, 'authority-test'));

  it.each([
    { fromCache: true, hasPendingWrites: false },
    { fromCache: false, hasPendingWrites: true },
    { fromCache: true, hasPendingWrites: true },
  ])('rejects non-authoritative snapshot metadata %j', async (metadata) => {
    const nativeTransaction = {
      get: vi.fn(async () => ({ exists: () => true, data: finalizedDraftFixture, metadata })),
      set: vi.fn(), update: vi.fn(), delete: vi.fn(),
    };
    vi.mocked(runTransaction).mockImplementationOnce(async (_firestore, operation) =>
      operation(nativeTransaction as unknown as Transaction),
    );
    const repository = createActiveChaosDraftRepository(createFirestoreAdapter(firestore), () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).rejects.toThrow(/authoritative|server/i);
    expect(nativeTransaction.set).not.toHaveBeenCalled();
    expect(nativeTransaction.update).not.toHaveBeenCalled();
    expect(nativeTransaction.delete).not.toHaveBeenCalled();
  });

  it('reads the exact two server documents through the same native transaction', async () => {
    const paths: string[] = [];
    const nativeTransaction = {
      get: vi.fn(async (reference: { path: string }) => {
        paths.push(reference.path);
        return {
          exists: () => reference.path === 'drafts/draft-1',
          data: finalizedDraftFixture,
          metadata: { fromCache: false, hasPendingWrites: false },
        };
      }),
      set: vi.fn(), update: vi.fn(), delete: vi.fn(),
    };
    vi.mocked(runTransaction).mockImplementationOnce(async (_firestore, operation) =>
      operation(nativeTransaction as unknown as Transaction),
    );
    const repository = createActiveChaosDraftRepository(createFirestoreAdapter(firestore), () => 'admin-1');

    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).resolves.toEqual({
      status: 'committed', draftId: 'draft-1',
    });
    expect(paths).toEqual(['drafts/draft-1', 'activeChaosDrafts/admin-1']);
    expect(nativeTransaction.set).not.toHaveBeenCalled();
    expect(nativeTransaction.update).not.toHaveBeenCalled();
    expect(nativeTransaction.delete).not.toHaveBeenCalled();
  });
});

describe('activeChaosDraftRepository', () => {
  it('rejects an append when the stored revision differs', async () => {
    const adapter = fakeAdapter({ checkpoint: checkpointFixture({ revision: 4 }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(
      repository.appendPack(
        { ownerId: 'admin-1', sessionId: 'session-1', expectedRevision: 3 },
        packFixture(),
      ),
    ).rejects.toBeInstanceOf(ChaosDraftConflictError);
    expect(adapter.update).not.toHaveBeenCalled();
  });

  it('appends canonical metadata and increments exactly once without updating inventory', async () => {
    const adapter = fakeAdapter({
      checkpoint: checkpointFixture({ revision: 0 }),
      pack: packFixture({ inPerson: 2, name: 'Canonical Pack', imageUrl: 'canonical.jpg' }),
    });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(
      repository.appendPack(
        { ownerId: 'admin-1', sessionId: 'session-1', expectedRevision: 0 },
        packFixture({ name: 'Stale Name', imageUrl: 'stale.jpg' }),
      ),
    ).resolves.toMatchObject({
      revision: 1,
      packsSelectedOrder: [
        { id: 'pack-1', name: 'Canonical Pack', imageUrl: 'canonical.jpg' },
      ],
    });
    expect(adapter.update).toHaveBeenCalledWith(
      'activeChaosDrafts/admin-1',
      expect.objectContaining({ revision: 1 }),
    );
    expect(adapter.update).not.toHaveBeenCalledWith('packs/pack-1', expect.anything());
  });

  it('keeps the document when a stale discard is attempted', async () => {
    const adapter = fakeAdapter({ checkpoint: checkpointFixture({ revision: 2 }) });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(
      repository.discard({
        ownerId: 'admin-1',
        sessionId: 'session-1',
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(ChaosDraftConflictError);
    expect(adapter.delete).not.toHaveBeenCalled();
  });

  it('refuses to replace an existing checkpoint', async () => {
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({ checkpoint: checkpointFixture() }),
      () => 'admin-1',
    );

    await expect(repository.create(createInput())).rejects.toThrow(/unfinished/i);
  });

  it('creates revision zero with a preallocated draft ID and reads the committed checkpoint', async () => {
    const adapter = fakeAdapter();
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.create(createInput())).resolves.toMatchObject({
      finalDraftId: 'generated-draft-id',
      revision: 0,
      packsSelectedOrder: [],
    });
    expect(adapter.generateId).toHaveBeenCalledWith('drafts');
    expect(adapter.create).toHaveBeenCalledWith(
      'activeChaosDrafts/admin-1',
      expect.objectContaining({ finalDraftId: 'generated-draft-id', revision: 0 }),
    );
    expect(adapter.get).toHaveBeenLastCalledWith('activeChaosDrafts/admin-1');
  });

  it.each([
    [
      'session ID',
      checkpointFixture({
        sessionId: 'replacement-session',
        finalDraftId: 'generated-draft-id',
      }),
    ],
    [
      'final draft ID',
      checkpointFixture({
        sessionId: 'session-1',
        finalDraftId: 'replacement-draft',
      }),
    ],
  ])('rejects a replacement with a different %s returned by the post-create read', async (
    _label,
    replacement,
  ) => {
    const adapter = fakeAdapter({
      checkpointAfterTransaction: replacement,
    });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(repository.create(createInput())).rejects.toBeInstanceOf(
      ChaosDraftConflictError,
    );
  });

  it('requires live quantity to cover all reservations of the same pack', async () => {
    const existing = checkpointFixture({
      packsSelectedOrder: [packRefFixture()],
      revision: 1,
    });
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({ checkpoint: existing, pack: packFixture({ inPerson: 1 }) }),
      () => 'admin-1',
    );

    await expect(
      repository.appendPack(commandFixture({ expectedRevision: 1 }), packRefFixture()),
    ).rejects.toThrow(/quantity/i);
  });

  it('rejects appends at the exact pack capacity', async () => {
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({
        checkpoint: checkpointFixture({
          revision: 2,
          packsSelectedOrder: [packRefFixture(), packRefFixture({ id: 'pack-2' })],
        }),
        pack: packFixture(),
      }),
      () => 'admin-1',
    );

    await expect(
      repository.appendPack(commandFixture({ expectedRevision: 2 }), packRefFixture()),
    ).rejects.toThrow(/complete|capacity/i);
  });

  it('undo removes only the final pick and leaves a valid tournament reconstructable', async () => {
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({
        checkpoint: checkpointFixture({
          packsSelectedOrder: [packRefFixture(), packRefFixture()],
          pendingTournament: tournamentFixture(),
          revision: 1,
        }),
      }),
      () => 'admin-1',
    );

    await expect(repository.undo(commandFixture({ expectedRevision: 1 }))).resolves.toMatchObject({
      revision: 2,
      packsSelectedOrder: [packRefFixture()],
      pendingTournament: tournamentFixture(),
    });
    await expect(repository.get('admin-1')).resolves.toMatchObject({
      revision: 2,
      packsSelectedOrder: [packRefFixture()],
      pendingTournament: tournamentFixture(),
    });
  });

  it('rejects tournament players that do not match checkpoint players', async () => {
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({
        checkpoint: checkpointFixture({ packsSelectedOrder: [packRefFixture(), packRefFixture()] }),
      }),
      () => 'admin-1',
    );

    await expect(
      repository.saveTournament(commandFixture(), tournamentFixture({ playerId: 'unknown' })),
    ).rejects.toThrow(/players/i);
  });

  it('requires a complete checkpoint before saving Round 1', async () => {
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({ checkpoint: checkpointFixture() }),
      () => 'admin-1',
    );

    await expect(repository.saveTournament(commandFixture(), tournamentFixture())).rejects.toThrow(
      /complete/i,
    );
  });

  it.each([
    ['omits the bye player', false],
    ['includes the bye player', true],
  ])('accepts an odd-player Round 1 that %s in its seats', async (_label, includeByeSeat) => {
    const oddPlayers = [...players, { id: 'player-3', name: 'Player 3', userId: null }];
    const tournament: DraftTournament = {
      seats: (includeByeSeat ? oddPlayers : players).map((player, index) => ({
        playerId: player.id,
        seat: index + 1,
      })),
      rounds: [
        {
          roundNumber: 1,
          status: 'active',
          pairings: [
            {
              id: 'match-1',
              player1Id: 'player-1',
              player2Id: 'player-2',
              status: 'pending',
            },
            { id: 'bye-1', player1Id: 'player-3', player2Id: null, status: 'pending' },
          ],
        },
      ],
      currentRound: 1,
      totalRounds: 1,
      status: 'active',
    };
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({
        checkpoint: checkpointFixture({
          players: oddPlayers,
          packsSelectedOrder: [packRefFixture(), packRefFixture()],
        }),
      }),
      () => 'admin-1',
    );

    await expect(repository.saveTournament(commandFixture(), tournament)).resolves.toMatchObject({
      revision: 1,
      pendingTournament: tournament,
    });
  });

  it.each([
    [
      'an unknown player',
      [
        { playerId: 'player-1', seat: 1 },
        { playerId: 'unknown', seat: 2 },
      ],
    ],
    [
      'a duplicate player',
      [
        { playerId: 'player-1', seat: 1 },
        { playerId: 'player-1', seat: 2 },
      ],
    ],
  ])('rejects tournament seats containing %s', async (_label, seats) => {
    const adapter = fakeAdapter({
      checkpoint: checkpointFixture({ packsSelectedOrder: [packRefFixture(), packRefFixture()] }),
    });
    const repository = createActiveChaosDraftRepository(adapter, () => 'admin-1');

    await expect(
      repository.saveTournament(commandFixture(), { ...tournamentFixture(), seats }),
    ).rejects.toThrow(/seats/i);
  });

  it('checks signed-in ownership before reading or starting a transaction', async () => {
    const adapter = fakeAdapter({ checkpoint: checkpointFixture(), pack: packFixture() });
    const repository = createActiveChaosDraftRepository(adapter, () => 'other-admin');

    await expect(repository.get('admin-1')).rejects.toThrow(/owner|authorized/i);
    await expect(repository.create(createInput())).rejects.toThrow(/owner|authorized/i);
    await expect(repository.appendPack(commandFixture(), packRefFixture())).rejects.toThrow(
      /owner|authorized/i,
    );
    await expect(repository.undo(commandFixture())).rejects.toThrow(/owner|authorized/i);
    await expect(repository.saveTournament(commandFixture(), tournamentFixture())).rejects.toThrow(
      /owner|authorized/i,
    );
    await expect(repository.discard(commandFixture())).rejects.toThrow(/owner|authorized/i);
    await expect(repository.finalize(commandFixture())).rejects.toThrow(/owner|authorized/i);
    await expect(repository.reconcile('admin-1', 'session-1', 'draft-1')).rejects.toThrow(/owner|authorized/i);
    expect(adapter.get).not.toHaveBeenCalled();
    expect(adapter.runTransaction).not.toHaveBeenCalled();
  });
});
