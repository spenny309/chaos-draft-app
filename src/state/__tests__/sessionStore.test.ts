import { Timestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pack } from '../inventoryStore';
import type {
  ActiveChaosDraft,
  CheckpointMutationResult,
  DraftPlayer,
  DraftTournament,
} from '../../types';

const { repositoryMock, authMock } = vi.hoisted(() => ({
  repositoryMock: {
    get: vi.fn(),
    create: vi.fn(),
    appendPack: vi.fn(),
    undo: vi.fn(),
    saveTournament: vi.fn(),
    discard: vi.fn(),
    finalize: vi.fn(),
    reconcile: vi.fn(),
  },
  authMock: { currentUser: { uid: 'admin-1' } as { uid: string } | null },
}));

vi.mock('../../firebase', () => ({ auth: authMock, db: {} }));
vi.mock('../../repositories/activeChaosDraftRepository', () => ({
  activeChaosDraftRepository: repositoryMock,
  ChaosDraftConflictError: class ChaosDraftConflictError extends Error {},
}));
vi.mock('../inventoryStore', async () => {
  const { create } = await import('zustand');
  return {
    useInventoryStore: create(() => ({ packs: [], loading: false })),
  };
});

import { useInventoryStore } from '../inventoryStore';
import { useSessionStore } from '../sessionStore';

const players: DraftPlayer[] = [
  { id: 'seat-a', name: 'Ada', userId: 'user-a' },
  { id: 'seat-b', name: 'Bea', userId: null },
];

function packFixture(overrides: Partial<Pack> = {}): Pack {
  return {
    id: 'pack-1',
    ownerId: 'admin-1',
    catalogId: 'catalog-1',
    name: 'Pack One',
    imageUrl: 'one.jpg',
    inPerson: 3,
    inTransit: 0,
    ...overrides,
  };
}

function inventoryFixture(): Pack[] {
  return [packFixture(), packFixture({
    id: 'pack-2', catalogId: 'catalog-2', name: 'Pack Two', imageUrl: 'two.jpg', inPerson: 2,
  })];
}

function tournamentFixture(): DraftTournament {
  return {
    seats: players.map((player, index) => ({ playerId: player.id, seat: index + 1 })),
    rounds: [{
      roundNumber: 1,
      status: 'active',
      pairings: [{
        id: 'match-1', player1Id: 'seat-a', player2Id: 'seat-b', status: 'pending',
      }],
    }],
    currentRound: 1,
    totalRounds: 3,
    status: 'active',
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

function mutationFixture(overrides: Partial<CheckpointMutationResult> = {}): CheckpointMutationResult {
  return {
    revision: 1,
    packsSelectedOrder: [{ id: 'pack-1', name: 'Canonical Pack', imageUrl: 'canonical.jpg' }],
    ...overrides,
  };
}

function hydrateFixture(overrides: Partial<ActiveChaosDraft> = {}): void {
  useInventoryStore.setState({ packs: inventoryFixture(), loading: false });
  useSessionStore.getState().hydrateSession(checkpointFixture(overrides));
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.currentUser = { uid: 'admin-1' };
  useInventoryStore.setState({ packs: inventoryFixture(), loading: false });
  useSessionStore.getState().clearLocalSession();
});

describe('durable chaos session store', () => {
  it('creates before hydration and preserves ordered player IDs', async () => {
    repositoryMock.create.mockImplementation(async (input: {
      sessionId: string;
      players: DraftPlayer[];
      numPacks: number;
    }) => checkpointFixture({
      sessionId: input.sessionId,
      players: input.players,
      numPacks: input.numPacks,
    }));

    await useSessionStore.getState().initializeSession(players, 7);

    expect(repositoryMock.create).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'admin-1', players, numPacks: 7,
    }));
    expect(useSessionStore.getState()).toMatchObject({
      ownerId: 'admin-1', finalDraftId: 'draft-1', revision: 0, numPacks: 7,
    });
    expect(useSessionStore.getState().players.map((player) => player.id)).toEqual(['seat-a', 'seat-b']);
  });

  it('requires authentication before creating a session', async () => {
    authMock.currentUser = null;

    await expect(useSessionStore.getState().initializeSession(players)).rejects.toThrow(/sign/i);
    expect(repositoryMock.create).not.toHaveBeenCalled();
  });

  it('hydrates a partial checkpoint into players and temporary inventory', () => {
    hydrateFixture({
      revision: 1,
      packsSelectedOrder: [{ id: 'pack-1', name: 'Canonical Pack', imageUrl: 'canonical.jpg' }],
    });

    expect(useSessionStore.getState()).toMatchObject({
      ownerId: 'admin-1', sessionId: 'session-1', finalDraftId: 'draft-1', revision: 1,
      confirmed: false, mutationPending: false,
    });
    expect(useSessionStore.getState().players[0].selectedPacks).toHaveLength(1);
    expect(useSessionStore.getState().players[1].selectedPacks).toHaveLength(0);
    expect(useSessionStore.getState().tempInventory[0].inPerson).toBe(2);
  });

  it('keeps an appended canonical pick hidden and locked until a matching apply', async () => {
    hydrateFixture();
    repositoryMock.appendPack.mockResolvedValue(mutationFixture());
    const chosenPack = packFixture({ name: 'Stale Client Name', imageUrl: 'stale.jpg' });

    const revision = await useSessionStore.getState().checkpointSelectedPack(chosenPack);

    expect(revision).toBe(1);
    expect(useSessionStore.getState()).toMatchObject({ revision: 0, mutationPending: true });
    expect(useSessionStore.getState().packsSelectedOrder).toEqual([]);
    expect(() => useSessionStore.getState().applyCheckpointedPack(chosenPack, 2)).toThrow(/stale|revision/i);
    expect(useSessionStore.getState().mutationPending).toBe(true);

    useSessionStore.getState().applyCheckpointedPack(chosenPack, revision);

    expect(useSessionStore.getState().packsSelectedOrder).toMatchObject([
      { id: 'pack-1', name: 'Canonical Pack', imageUrl: 'canonical.jpg' },
    ]);
    expect(useSessionStore.getState()).toMatchObject({ revision: 1, mutationPending: false });
    expect(() => useSessionStore.getState().applyCheckpointedPack(chosenPack, revision)).toThrow(
      /pending|stale|apply/i,
    );
    expect(useSessionStore.getState().packsSelectedOrder).toHaveLength(1);
  });

  it('rejects mutations while an append is unresolved and unlocks after a failed append', async () => {
    hydrateFixture();
    let rejectAppend!: (error: Error) => void;
    repositoryMock.appendPack.mockReturnValue(new Promise((_resolve, reject) => { rejectAppend = reject; }));

    const append = useSessionStore.getState().checkpointSelectedPack(packFixture());
    expect(useSessionStore.getState().mutationPending).toBe(true);
    await expect(useSessionStore.getState().undoLastPick()).rejects.toThrow(/pending/i);

    rejectAppend(new Error('offline'));
    await expect(append).rejects.toThrow('offline');
    expect(useSessionStore.getState()).toMatchObject({ revision: 0, mutationPending: false });
  });

  it('applies undo only from the successful canonical result', async () => {
    hydrateFixture({
      revision: 1,
      packsSelectedOrder: [{ id: 'pack-1', name: 'Old Name', imageUrl: 'old.jpg' }],
    });
    repositoryMock.undo.mockResolvedValue(mutationFixture({ revision: 2, packsSelectedOrder: [] }));

    await useSessionStore.getState().undoLastPick();

    expect(useSessionStore.getState()).toMatchObject({ revision: 2, packsSelectedOrder: [], mutationPending: false });
    expect(useSessionStore.getState().players.every((player) => player.selectedPacks.length === 0)).toBe(true);
    expect(useSessionStore.getState().tempInventory[0].inPerson).toBe(3);
  });

  it('keeps local state when undo fails', async () => {
    hydrateFixture({
      revision: 1,
      packsSelectedOrder: [{ id: 'pack-1', name: 'Pack One', imageUrl: 'one.jpg' }],
    });
    repositoryMock.undo.mockRejectedValue(new Error('offline'));

    await expect(useSessionStore.getState().undoLastPick()).rejects.toThrow('offline');
    expect(useSessionStore.getState()).toMatchObject({ revision: 1, mutationPending: false });
    expect(useSessionStore.getState().packsSelectedOrder).toHaveLength(1);
  });

  it('persists Round 1 and consumes its canonical revision before finalization', async () => {
    const tournament = tournamentFixture();
    hydrateFixture({
      revision: 2,
      packsSelectedOrder: [
        { id: 'pack-1', name: 'Pack One', imageUrl: 'one.jpg' },
        { id: 'pack-2', name: 'Pack Two', imageUrl: 'two.jpg' },
      ],
    });
    repositoryMock.saveTournament.mockResolvedValue(mutationFixture({
      revision: 3,
      packsSelectedOrder: [
        { id: 'pack-1', name: 'Pack One', imageUrl: 'one.jpg' },
        { id: 'pack-2', name: 'Pack Two', imageUrl: 'two.jpg' },
      ],
      pendingTournament: tournament,
    }));

    await useSessionStore.getState().setPendingTournament(tournament);

    expect(useSessionStore.getState()).toMatchObject({
      revision: 3, pendingTournament: tournament, mutationPending: false,
    });
  });

  it('keeps local state when tournament persistence or discard fails', async () => {
    hydrateFixture();
    repositoryMock.saveTournament.mockRejectedValue(new Error('offline tournament'));
    await expect(useSessionStore.getState().setPendingTournament(tournamentFixture())).rejects.toThrow(
      'offline tournament',
    );
    expect(useSessionStore.getState()).toMatchObject({
      sessionId: 'session-1', revision: 0, pendingTournament: null, mutationPending: false,
    });

    repositoryMock.discard.mockRejectedValue(new Error('offline discard'));
    await expect(useSessionStore.getState().discardSession()).rejects.toThrow('offline discard');
    expect(useSessionStore.getState().sessionId).toBe('session-1');
  });

  it('clears local state only after discard succeeds', async () => {
    hydrateFixture();
    repositoryMock.discard.mockResolvedValue(undefined);

    await useSessionStore.getState().discardSession();

    expect(useSessionStore.getState()).toMatchObject({
      ownerId: '', sessionId: '', finalDraftId: '', revision: 0, players: [], mutationPending: false,
    });
  });

  it('requires completeness and persisted Round 1 before calling only atomic finalize', async () => {
    hydrateFixture();
    await expect(useSessionStore.getState().confirmSession()).rejects.toThrow(/complete/i);

    hydrateFixture({
      revision: 2,
      packsSelectedOrder: [
        { id: 'pack-1', name: 'Pack One', imageUrl: 'one.jpg' },
        { id: 'pack-2', name: 'Pack Two', imageUrl: 'two.jpg' },
      ],
    });
    await expect(useSessionStore.getState().confirmSession()).rejects.toThrow(/tournament|round/i);
    expect(repositoryMock.finalize).not.toHaveBeenCalled();

    hydrateFixture({
      revision: 3,
      packsSelectedOrder: [
        { id: 'pack-1', name: 'Pack One', imageUrl: 'one.jpg' },
        { id: 'pack-2', name: 'Pack Two', imageUrl: 'two.jpg' },
      ],
      pendingTournament: tournamentFixture(),
    });
    repositoryMock.finalize.mockResolvedValue({ draftId: 'draft-1' });

    await expect(useSessionStore.getState().confirmSession()).resolves.toEqual({ draftId: 'draft-1' });
    expect(useSessionStore.getState()).toMatchObject({ confirmed: true, sessionId: 'session-1' });
  });

  it('retains the checkpoint view when finalization fails', async () => {
    hydrateFixture({
      revision: 3,
      packsSelectedOrder: [
        { id: 'pack-1', name: 'Pack One', imageUrl: 'one.jpg' },
        { id: 'pack-2', name: 'Pack Two', imageUrl: 'two.jpg' },
      ],
      pendingTournament: tournamentFixture(),
    });
    repositoryMock.finalize.mockRejectedValue(new Error('unknown commit outcome'));

    await expect(useSessionStore.getState().confirmSession()).rejects.toThrow('unknown commit outcome');
    expect(useSessionStore.getState()).toMatchObject({
      sessionId: 'session-1', finalDraftId: 'draft-1', revision: 3, confirmed: false,
      mutationPending: false,
    });
  });

  it('consumes authoritative reconciliation outcomes without clearing retryable state', async () => {
    hydrateFixture();
    repositoryMock.reconcile.mockResolvedValueOnce({
      status: 'not-committed',
      checkpoint: checkpointFixture({ revision: 1 }),
    });
    await expect(useSessionStore.getState().reconcileConfirmation()).resolves.toMatchObject({
      status: 'not-committed',
    });
    expect(useSessionStore.getState()).toMatchObject({ revision: 1, confirmed: false });

    repositoryMock.reconcile.mockResolvedValueOnce({ status: 'integrity-error' });
    await expect(useSessionStore.getState().reconcileConfirmation()).resolves.toEqual({
      status: 'integrity-error',
    });
    expect(useSessionStore.getState()).toMatchObject({ sessionId: 'session-1', confirmed: false });

    repositoryMock.reconcile.mockResolvedValueOnce({ status: 'committed', draftId: 'draft-1' });
    await useSessionStore.getState().reconcileConfirmation();
    expect(useSessionStore.getState()).toMatchObject({ sessionId: 'session-1', confirmed: true });
  });
});
