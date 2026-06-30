import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft, PairingResult } from '../../types';

const {
  mockDoc,
  mockRunTransaction,
  mockUpdateDoc,
  mockTimestampNow,
} = vi.hoisted(() => ({
  mockDoc: vi.fn(() => 'draft-doc-ref'),
  mockRunTransaction: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockTimestampNow: vi.fn(() => 'NOW'),
}));

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'submitter-1' } },
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  doc: mockDoc,
  runTransaction: mockRunTransaction,
  updateDoc: mockUpdateDoc,
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: mockTimestampNow },
}));

vi.mock('../inventoryStore', () => ({
  useInventoryStore: { getState: vi.fn(() => ({ loadPacks: vi.fn() })) },
}));

vi.mock('../privateInventoryStore', () => ({
  usePrivateInventoryStore: { getState: vi.fn(() => ({ batchRestore: vi.fn() })) },
}));

import { useDraftHistoryStore } from '../draftHistoryStore';

const existingResult: PairingResult = {
  player1Wins: 2,
  player2Wins: 0,
  ties: 0,
  matchWinner: 'player1',
  isPartial: false,
  submittedBy: 'submitter-2',
  submittedAt: 'EARLIER' as any,
};

function makeDraft(pairingAResult?: PairingResult): Draft {
  return {
    id: 'draft-1',
    type: 'regular',
    createdBy: 'creator',
    createdAt: 'CREATED' as any,
    status: 'preview',
    players: [
      { id: 'p1', name: 'One', userId: null },
      { id: 'p2', name: 'Two', userId: null },
      { id: 'p3', name: 'Three', userId: null },
      { id: 'p4', name: 'Four', userId: null },
    ],
    tournament: {
      seats: [],
      currentRound: 1,
      totalRounds: 3,
      status: 'active',
      rounds: [{
        roundNumber: 1,
        status: pairingAResult ? 'active' : 'active',
        pairings: [
          {
            id: 'match-a',
            player1Id: 'p1',
            player2Id: 'p2',
            status: pairingAResult ? 'complete' : 'pending',
            ...(pairingAResult ? { result: pairingAResult } : {}),
          },
          {
            id: 'match-b',
            player1Id: 'p3',
            player2Id: 'p4',
            status: 'pending',
          },
        ],
      }],
    },
  };
}

describe('useDraftHistoryStore tournament result writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDraftHistoryStore.setState({
      drafts: [makeDraft()],
      loading: false,
      error: null,
    });
  });

  it('merges a submitted result into the latest transaction snapshot', async () => {
    const transactionUpdate = vi.fn();
    mockRunTransaction.mockImplementation(async (_db, callback) => {
      await callback({
        get: vi.fn(async () => ({
          exists: () => true,
          data: () => makeDraft(existingResult),
        })),
        update: transactionUpdate,
      });
    });

    await useDraftHistoryStore.getState().submitResult('draft-1', 1, 'match-b', {
      player1Wins: 2,
      player2Wins: 1,
      ties: 0,
      matchWinner: 'player1',
      isPartial: false,
    });

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).not.toHaveBeenCalled();

    const updatedTournament = transactionUpdate.mock.calls[0][1].tournament;
    const updatedPairings = updatedTournament.rounds[0].pairings;
    expect(updatedPairings[0].result).toEqual(existingResult);
    expect(updatedPairings[1]).toMatchObject({
      id: 'match-b',
      status: 'complete',
      result: {
        player1Wins: 2,
        player2Wins: 1,
        submittedBy: 'submitter-1',
        submittedAt: 'NOW',
      },
    });
  });
});
