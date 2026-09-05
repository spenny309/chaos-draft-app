import { Timestamp } from 'firebase/firestore';
import { describe, expect, it, vi } from 'vitest';
import type {
  ActiveChaosDraft,
  DraftPackRef,
  DraftPlayer,
  DraftTournament,
} from '../../types';
import {
  ChaosDraftConflictError,
  createActiveChaosDraftRepository,
  type CheckpointCommand,
  type CreateChaosDraftInput,
  type FirestoreAdapter,
  type FirestoreTransactionAdapter,
} from '../activeChaosDraftRepository';

vi.mock('../../firebase', () => ({
  auth: { currentUser: null },
  db: {},
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
}

function fakeAdapter(initial: FakeAdapterState = {}) {
  let checkpoint = initial.checkpoint;
  const timestamp = Timestamp.fromMillis(3);

  const get = vi.fn(async (path: string): Promise<unknown | null> => {
    if (path === 'activeChaosDrafts/admin-1') return checkpoint ?? null;
    if (path === 'packs/pack-1') return initial.pack ?? null;
    return null;
  });
  const create = vi.fn((path: string, value: Record<string, unknown>) => {
    if (path === 'activeChaosDrafts/admin-1') checkpoint = value as unknown as ActiveChaosDraft;
  });
  const update = vi.fn((path: string, value: Record<string, unknown>) => {
    if (path === 'activeChaosDrafts/admin-1' && checkpoint) {
      checkpoint = { ...checkpoint, ...value } as ActiveChaosDraft;
    }
  });
  const remove = vi.fn((path: string) => {
    if (path === 'activeChaosDrafts/admin-1') checkpoint = undefined;
  });
  const transaction: FirestoreTransactionAdapter = { get, create, update, delete: remove };
  const runTransaction = vi.fn(
    async (operation: (value: FirestoreTransactionAdapter) => Promise<unknown>) => {
      const result = await operation(transaction);
      if (initial.checkpointAfterTransaction) checkpoint = initial.checkpointAfterTransaction;
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
  } satisfies FirestoreAdapter & FirestoreTransactionAdapter;

  return adapter;
}

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

  it('undo removes only the final pick and increments revision', async () => {
    const repository = createActiveChaosDraftRepository(
      fakeAdapter({
        checkpoint: checkpointFixture({
          packsSelectedOrder: [packRefFixture()],
          revision: 1,
        }),
      }),
      () => 'admin-1',
    );

    await expect(repository.undo(commandFixture({ expectedRevision: 1 }))).resolves.toMatchObject({
      revision: 2,
      packsSelectedOrder: [],
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
    expect(adapter.get).not.toHaveBeenCalled();
    expect(adapter.runTransaction).not.toHaveBeenCalled();
  });
});
