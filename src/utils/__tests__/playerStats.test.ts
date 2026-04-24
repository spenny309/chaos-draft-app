import { describe, it, expect } from 'vitest';
import { computePlayerAggregates, computeHeadToHead, computePlayerDraftHistory } from '../playerStats';
import type { Draft, TournamentRound } from '../../types';

const fakeTs = { seconds: 0, nanoseconds: 0, toDate: () => new Date(), toMillis: () => 0 } as any;

function makeRound(
  roundNumber: number,
  pairings: Array<{
    p1: string; p2: string | null;
    p1w?: number; p2w?: number; ties?: number;
    winner?: 'player1' | 'player2' | 'tie';
  }>
): TournamentRound {
  return {
    roundNumber,
    status: 'complete',
    pairings: pairings.map(({ p1, p2, p1w = 2, p2w = 0, ties = 0, winner = 'player1' }) => ({
      id: `${p1}-${p2 ?? 'bye'}-r${roundNumber}`,
      player1Id: p1,
      player2Id: p2,
      status: p2 === null ? 'pending' : 'complete',
      ...(p2 !== null
        ? { result: { player1Wins: p1w, player2Wins: p2w, ties, matchWinner: winner, isPartial: false, submittedBy: 'tester', submittedAt: fakeTs } }
        : {}),
    })),
  };
}

function makeDraft(
  id: string,
  players: { id: string; name: string }[],
  rounds: TournamentRound[]
): Draft {
  return {
    id,
    type: 'chaos',
    createdBy: 'test',
    createdAt: fakeTs,
    status: 'finalized',
    players: players.map(p => ({ ...p, userId: null })),
    tournament: {
      seats: [],
      rounds,
      currentRound: rounds.length,
      totalRounds: 3,
      status: 'finalized',
    },
  };
}

// ── computePlayerAggregates ────────────────────────────────────────────────

describe('computePlayerAggregates', () => {
  it('returns empty array for no drafts', () => {
    expect(computePlayerAggregates([])).toEqual([]);
  });

  it('returns empty array when no drafts have tournaments', () => {
    const draft: Draft = {
      id: 'd1', type: 'chaos', createdBy: 'u', createdAt: fakeTs,
      status: 'finalized', players: [{ id: 'a', name: 'Alice', userId: null }],
    };
    expect(computePlayerAggregates([draft])).toEqual([]);
  });

  it('computes correct match record from one completed match', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', p1w: 2, p2w: 1, winner: 'player1' }])]
    );
    const aggs = computePlayerAggregates([draft]);
    const alice = aggs.find(x => x.normalizedName === 'alice')!;
    const bob = aggs.find(x => x.normalizedName === 'bob')!;
    expect(alice.matchWins).toBe(1);
    expect(alice.matchLosses).toBe(0);
    expect(alice.gameWins).toBe(2);
    expect(alice.gameLosses).toBe(1);
    expect(bob.matchWins).toBe(0);
    expect(bob.matchLosses).toBe(1);
    expect(bob.gameWins).toBe(1);
    expect(bob.gameLosses).toBe(2);
  });

  it('groups players by case-insensitive name across drafts', () => {
    const d1 = makeDraft('d1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    const d2 = makeDraft('d2',
      [{ id: 'c', name: 'ALICE' }, { id: 'd', name: 'Bob' }],
      [makeRound(1, [{ p1: 'c', p2: 'd', winner: 'player1' }])]
    );
    const aggs = computePlayerAggregates([d1, d2]);
    const alice = aggs.find(x => x.normalizedName === 'alice')!;
    expect(alice.matchWins).toBe(2);
    expect(alice.tournamentsPlayed).toBe(2);
  });

  it('excludes byes from match stats', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: null }])]
    );
    const aggs = computePlayerAggregates([draft]);
    const alice = aggs.find(x => x.normalizedName === 'alice')!;
    expect(alice.matchWins).toBe(0);
    expect(alice.matchLosses).toBe(0);
    expect(alice.gameWins).toBe(0);
  });

  it('excludes pairings without a result', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [{
        roundNumber: 1,
        status: 'active',
        pairings: [{ id: 'p1', player1Id: 'a', player2Id: 'b', status: 'pending' }],
      }]
    );
    const aggs = computePlayerAggregates([draft]);
    const alice = aggs.find(x => x.normalizedName === 'alice')!;
    expect(alice.matchWins).toBe(0);
  });

  it('counts tournamentsPlayed for each draft with a tournament', () => {
    const d1 = makeDraft('d1', [{ id: 'a', name: 'Alice' }], []);
    const d2 = makeDraft('d2', [{ id: 'b', name: 'Alice' }], []);
    const aggs = computePlayerAggregates([d1, d2]);
    const alice = aggs.find(x => x.normalizedName === 'alice')!;
    expect(alice.tournamentsPlayed).toBe(2);
  });

  it('sorts by matchWins descending, then matchWinRate descending', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Carol' }],
      [
        makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }, { p1: 'c', p2: null }]),
        makeRound(2, [{ p1: 'a', p2: 'c', winner: 'player1' }]),
      ]
    );
    const aggs = computePlayerAggregates([draft]);
    expect(aggs[0].normalizedName).toBe('alice');
  });

  it('computes matchWinRate correctly', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    const aggs = computePlayerAggregates([draft]);
    const alice = aggs.find(x => x.normalizedName === 'alice')!;
    expect(alice.matchWinRate).toBeCloseTo(1.0);
    const bob = aggs.find(x => x.normalizedName === 'bob')!;
    expect(bob.matchWinRate).toBeCloseTo(0.0);
  });
});

// ── computeHeadToHead ──────────────────────────────────────────────────────

describe('computeHeadToHead', () => {
  it('returns zero record when players have never met', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Carol' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    const result = computeHeadToHead('Alice', 'Carol', [draft]);
    expect(result.aWins).toBe(0);
    expect(result.bWins).toBe(0);
    expect(result.ties).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it('records a win for player A when A is player1', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    const result = computeHeadToHead('Alice', 'Bob', [draft]);
    expect(result.aWins).toBe(1);
    expect(result.bWins).toBe(0);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].result).toBe('aWin');
  });

  it('records a win for player A when A is player2', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'b', p2: 'a', winner: 'player2' }])]
    );
    const result = computeHeadToHead('Alice', 'Bob', [draft]);
    expect(result.aWins).toBe(1);
    expect(result.bWins).toBe(0);
  });

  it('is case-insensitive on names', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'ALICE' }, { id: 'b', name: 'bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    const result = computeHeadToHead('Alice', 'Bob', [draft]);
    expect(result.aWins).toBe(1);
  });

  it('accumulates across multiple drafts', () => {
    const d1 = makeDraft('d1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    const d2 = makeDraft('d2',
      [{ id: 'c', name: 'Alice' }, { id: 'd', name: 'Bob' }],
      [makeRound(1, [{ p1: 'c', p2: 'd', winner: 'player2' }])]
    );
    const result = computeHeadToHead('Alice', 'Bob', [d1, d2]);
    expect(result.aWins).toBe(1);
    expect(result.bWins).toBe(1);
    expect(result.matches).toHaveLength(2);
  });

  it('records game counts correctly', () => {
    const draft = makeDraft(
      'd1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', p1w: 2, p2w: 1, winner: 'player1' }])]
    );
    const result = computeHeadToHead('Alice', 'Bob', [draft]);
    expect(result.matches[0].aGames).toBe(2);
    expect(result.matches[0].bGames).toBe(1);
  });
});

// ── computePlayerDraftHistory ──────────────────────────────────────────────

describe('computePlayerDraftHistory', () => {
  it('returns empty array for no drafts', () => {
    expect(computePlayerDraftHistory('Alice', [])).toEqual([]);
  });

  it('excludes drafts without a tournament', () => {
    const draft: Draft = {
      id: 'd1', type: 'chaos', createdBy: 'u', createdAt: fakeTs,
      status: 'finalized', players: [{ id: 'a', name: 'Alice', userId: null }],
    };
    expect(computePlayerDraftHistory('Alice', [draft])).toHaveLength(0);
  });

  it('excludes drafts where player does not appear', () => {
    const draft = makeDraft('d1',
      [{ id: 'a', name: 'Bob' }, { id: 'b', name: 'Carol' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    expect(computePlayerDraftHistory('Alice', [draft])).toHaveLength(0);
  });

  it('returns one entry per draft the player appeared in', () => {
    const d1 = makeDraft('d1', [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }], []);
    const d2 = makeDraft('d2', [{ id: 'c', name: 'Alice' }, { id: 'd', name: 'Bob' }], []);
    expect(computePlayerDraftHistory('Alice', [d1, d2])).toHaveLength(2);
  });

  it('computes correct stats per draft', () => {
    const draft = makeDraft('d1',
      [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', p1w: 2, p2w: 0, winner: 'player1' }])]
    );
    const history = computePlayerDraftHistory('Alice', [draft]);
    expect(history).toHaveLength(1);
    expect(history[0].draftId).toBe('d1');
    expect(history[0].matchWins).toBe(1);
    expect(history[0].matchLosses).toBe(0);
    expect(history[0].gameWins).toBe(2);
    expect(history[0].gameLosses).toBe(0);
  });

  it('is case-insensitive on player name', () => {
    const draft = makeDraft('d1',
      [{ id: 'a', name: 'ALICE' }, { id: 'b', name: 'Bob' }],
      [makeRound(1, [{ p1: 'a', p2: 'b', winner: 'player1' }])]
    );
    const history = computePlayerDraftHistory('alice', [draft]);
    expect(history).toHaveLength(1);
    expect(history[0].matchWins).toBe(1);
  });
});
