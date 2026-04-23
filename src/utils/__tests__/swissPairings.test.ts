import { describe, it, expect } from 'vitest';
import { computeStandings, generateSwissPairings } from '../swissPairings';
import type { DraftPlayer, TournamentRound } from '../../types';

function p(id: string): DraftPlayer {
  return { id, name: id, userId: null };
}

const fakeTs = { seconds: 0, nanoseconds: 0, toDate: () => new Date(), toMillis: () => 0 } as any;

function makeRound(
  roundNumber: number,
  pairings: Array<{
    p1: string;
    p2: string | null;
    p1w?: number;
    p2w?: number;
    ties?: number;
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

describe('computeStandings', () => {
  it('returns zeroed standings for players with no rounds', () => {
    const standings = computeStandings([p('A'), p('B')], []);
    expect(standings).toHaveLength(2);
    expect(standings.find(s => s.playerId === 'A')).toEqual({
      playerId: 'A', matchWins: 0, matchLosses: 0, matchTies: 0, gameWins: 0,
    });
  });

  it('records match win for player1', () => {
    const round = makeRound(1, [{ p1: 'A', p2: 'B', winner: 'player1', p1w: 2, p2w: 1 }]);
    const standings = computeStandings([p('A'), p('B')], [round]);
    const a = standings.find(s => s.playerId === 'A')!;
    const b = standings.find(s => s.playerId === 'B')!;
    expect(a.matchWins).toBe(1);
    expect(a.matchLosses).toBe(0);
    expect(a.gameWins).toBe(2);
    expect(b.matchWins).toBe(0);
    expect(b.matchLosses).toBe(1);
    expect(b.gameWins).toBe(1);
  });

  it('records match tie', () => {
    const round = makeRound(1, [{ p1: 'A', p2: 'B', winner: 'tie', p1w: 1, p2w: 1, ties: 1 }]);
    const standings = computeStandings([p('A'), p('B')], [round]);
    const a = standings.find(s => s.playerId === 'A')!;
    const b = standings.find(s => s.playerId === 'B')!;
    expect(a.matchTies).toBe(1);
    expect(b.matchTies).toBe(1);
  });

  it('accumulates across multiple rounds', () => {
    const r1 = makeRound(1, [{ p1: 'A', p2: 'B', winner: 'player1' }]);
    const r2 = makeRound(2, [{ p1: 'A', p2: 'C', winner: 'player2' }]);
    const standings = computeStandings([p('A'), p('B'), p('C')], [r1, r2]);
    const a = standings.find(s => s.playerId === 'A')!;
    expect(a.matchWins).toBe(1);
    expect(a.matchLosses).toBe(1);
  });

  it('excludes byes from match counts', () => {
    const round = makeRound(1, [{ p1: 'A', p2: null }]);
    const standings = computeStandings([p('A'), p('B')], [round]);
    const a = standings.find(s => s.playerId === 'A')!;
    expect(a.matchWins).toBe(0);
    expect(a.matchLosses).toBe(0);
  });
});

describe('generateSwissPairings', () => {
  it('pairs 4 players by record after 1 round (top vs top, bottom vs bottom)', () => {
    const players = [p('A'), p('B'), p('C'), p('D')];
    // Round 1: A beat B, C beat D
    const r1 = makeRound(1, [
      { p1: 'A', p2: 'B', winner: 'player1' },
      { p1: 'C', p2: 'D', winner: 'player1' },
    ]);
    const pairings = generateSwissPairings(players, [r1]);
    // A(1-0) and C(1-0) should be paired; B(0-1) and D(0-1) should be paired
    const ids = pairings.map(p => [p.player1Id, p.player2Id].sort().join(':'));
    expect(ids).toContain(['A', 'C'].sort().join(':'));
    expect(ids).toContain(['B', 'D'].sort().join(':'));
    expect(pairings).toHaveLength(2);
  });

  it('avoids rematches — slides to next eligible player', () => {
    const players = [p('A'), p('B'), p('C'), p('D')];
    // Round 1: A beat B; Round 2: A beat C → A has played B and C
    const r1 = makeRound(1, [
      { p1: 'A', p2: 'B', winner: 'player1' },
      { p1: 'C', p2: 'D', winner: 'player1' },
    ]);
    const r2 = makeRound(2, [
      { p1: 'A', p2: 'C', winner: 'player1' },
      { p1: 'B', p2: 'D', winner: 'player1' },
    ]);
    // After 2 rounds: A(2-0), B(1-1), C(1-1), D(0-2)
    // Sorted: A, B or C, B or C, D — A must play D (only unplayed opponent)
    const pairings = generateSwissPairings(players, [r1, r2]);
    const aMatch = pairings.find(p => p.player1Id === 'A' || p.player2Id === 'A')!;
    const aOpponent = aMatch.player1Id === 'A' ? aMatch.player2Id : aMatch.player1Id;
    expect(aOpponent).toBe('D');
    expect(pairings).toHaveLength(2);
  });

  it('gives bye to lowest-ranked player who has not had one (odd count)', () => {
    const players = [p('A'), p('B'), p('C'), p('D'), p('E')];
    // Round 1: A beat C, B beat D, E got bye
    const r1 = makeRound(1, [
      { p1: 'A', p2: 'C', winner: 'player1' },
      { p1: 'B', p2: 'D', winner: 'player1' },
      { p1: 'E', p2: null },
    ]);
    // A(1-0), B(1-0), E(0-0 bye), C(0-1), D(0-1)
    // E had the bye already; lowest eligible without bye = D
    const pairings = generateSwissPairings(players, [r1]);
    const byePairing = pairings.find(p => p.player2Id === null);
    expect(byePairing).toBeDefined();
    expect(byePairing!.player1Id).toBe('D');
  });

  it('falls back to lowest overall player when all have had a bye', () => {
    const players = [p('A'), p('B'), p('C')];
    // Rounds where everyone got a bye already
    const r1 = makeRound(1, [{ p1: 'A', p2: 'B', winner: 'player1' }, { p1: 'C', p2: null }]);
    const r2 = makeRound(2, [{ p1: 'A', p2: 'C', winner: 'player1' }, { p1: 'B', p2: null }]);
    const r3 = makeRound(3, [{ p1: 'B', p2: 'C', winner: 'player1' }, { p1: 'A', p2: null }]);
    // All 3 have had byes; A(3-0) = highest, C(0-3) = lowest → C gets bye again
    const pairings = generateSwissPairings(players, [r1, r2, r3]);
    const byePairing = pairings.find(p => p.player2Id === null);
    expect(byePairing).toBeDefined();
    expect(byePairing!.player1Id).toBe('C');
  });

  it('assigns new unique IDs to all pairings', () => {
    const players = [p('A'), p('B'), p('C'), p('D')];
    const r1 = makeRound(1, [
      { p1: 'A', p2: 'B', winner: 'player1' },
      { p1: 'C', p2: 'D', winner: 'player1' },
    ]);
    const pairings = generateSwissPairings(players, [r1]);
    const ids = pairings.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.length > 0)).toBe(true);
  });

  it('forces a rematch when no unplayed opponent exists', () => {
    const players = [p('A'), p('B')];
    const r1 = makeRound(1, [{ p1: 'A', p2: 'B', winner: 'player1' }]);
    const pairings = generateSwissPairings(players, [r1]);
    expect(pairings).toHaveLength(1);
    const ids = [pairings[0].player1Id, pairings[0].player2Id].sort().join(':');
    expect(ids).toBe('A:B');
  });
});
