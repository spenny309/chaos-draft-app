# Phase 3: Player Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-draft stats page that aggregates match records by player name, shows a ranked leaderboard with per-draft breakdowns, and supports head-to-head lookups between any two players.

**Architecture:** All stats are computed at read time from `draft.tournament.rounds[].pairings[]` across all drafts in the Zustand store — no pre-aggregation. Player identity is a case-insensitive trimmed name. A new `playerStats.ts` utility holds three pure functions; a new `Stats.tsx` page consumes them via `useMemo`.

**Tech Stack:** TypeScript, React 19, Zustand (`useDraftHistoryStore`), Vitest

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/utils/playerStats.ts` | Three pure stat functions + three exported types |
| Create | `src/utils/__tests__/playerStats.test.ts` | Vitest unit tests for all three functions |
| Create | `src/pages/Stats.tsx` | Leaderboard + expandable per-draft rows + H2H UI |
| Modify | `src/App.tsx` | Add Stats import, permanent nav item, `/stats` route |

---

### Task 1: playerStats utility + tests (TDD)

**Files:**
- Create: `src/utils/__tests__/playerStats.test.ts`
- Create: `src/utils/playerStats.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/playerStats.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/utils/__tests__/playerStats.test.ts
```

Expected: FAIL with "Cannot find module '../playerStats'"

- [ ] **Step 3: Implement `src/utils/playerStats.ts`**

```typescript
import type { Draft, DraftType } from '../types';

export interface PlayerAggregate {
  displayName: string;
  normalizedName: string;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  gameWins: number;
  gameLosses: number;
  tournamentsPlayed: number;
  matchWinRate: number;
}

export interface HeadToHeadMatch {
  draftId: string;
  result: 'aWin' | 'bWin' | 'tie';
  aGames: number;
  bGames: number;
}

export interface HeadToHeadRecord {
  nameA: string;
  nameB: string;
  aWins: number;
  bWins: number;
  ties: number;
  matches: HeadToHeadMatch[];
}

export interface PlayerDraftResult {
  draftId: string;
  draftType: DraftType;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  gameWins: number;
  gameLosses: number;
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

export function computePlayerAggregates(drafts: Draft[]): PlayerAggregate[] {
  const map = new Map<string, PlayerAggregate>();

  for (const draft of drafts) {
    if (!draft.tournament) continue;
    const playerById = new Map(draft.players.map(p => [p.id, p]));

    for (const player of draft.players) {
      const key = norm(player.name);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          displayName: player.name.trim(),
          normalizedName: key,
          matchWins: 0, matchLosses: 0, matchTies: 0,
          gameWins: 0, gameLosses: 0,
          tournamentsPlayed: 0,
          matchWinRate: 0,
        });
      }
      map.get(key)!.tournamentsPlayed++;
    }

    for (const round of draft.tournament.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.player2Id === null || !pairing.result) continue;
        const p1 = playerById.get(pairing.player1Id);
        const p2 = playerById.get(pairing.player2Id);
        if (!p1 || !p2) continue;
        const s1 = map.get(norm(p1.name));
        const s2 = map.get(norm(p2.name));
        if (!s1 || !s2) continue;

        const { matchWinner, player1Wins, player2Wins } = pairing.result;
        s1.gameWins += player1Wins;
        s1.gameLosses += player2Wins;
        s2.gameWins += player2Wins;
        s2.gameLosses += player1Wins;

        if (matchWinner === 'player1') { s1.matchWins++; s2.matchLosses++; }
        else if (matchWinner === 'player2') { s2.matchWins++; s1.matchLosses++; }
        else { s1.matchTies++; s2.matchTies++; }
      }
    }
  }

  for (const agg of map.values()) {
    const total = agg.matchWins + agg.matchLosses + agg.matchTies;
    agg.matchWinRate = total > 0 ? agg.matchWins / total : 0;
  }

  return [...map.values()].sort((a, b) =>
    b.matchWins !== a.matchWins
      ? b.matchWins - a.matchWins
      : b.matchWinRate - a.matchWinRate
  );
}

export function computeHeadToHead(nameA: string, nameB: string, drafts: Draft[]): HeadToHeadRecord {
  const kA = norm(nameA);
  const kB = norm(nameB);
  const record: HeadToHeadRecord = { nameA, nameB, aWins: 0, bWins: 0, ties: 0, matches: [] };

  for (const draft of drafts) {
    if (!draft.tournament) continue;
    const playerById = new Map(draft.players.map(p => [p.id, p]));

    for (const round of draft.tournament.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.player2Id === null || !pairing.result) continue;
        const p1 = playerById.get(pairing.player1Id);
        const p2 = playerById.get(pairing.player2Id);
        if (!p1 || !p2) continue;

        const k1 = norm(p1.name);
        const k2 = norm(p2.name);
        let aIsP1: boolean;
        if (k1 === kA && k2 === kB) aIsP1 = true;
        else if (k1 === kB && k2 === kA) aIsP1 = false;
        else continue;

        const { matchWinner, player1Wins, player2Wins } = pairing.result;
        const aGames = aIsP1 ? player1Wins : player2Wins;
        const bGames = aIsP1 ? player2Wins : player1Wins;

        let result: 'aWin' | 'bWin' | 'tie';
        if (matchWinner === 'tie') result = 'tie';
        else if ((matchWinner === 'player1') === aIsP1) result = 'aWin';
        else result = 'bWin';

        if (result === 'aWin') record.aWins++;
        else if (result === 'bWin') record.bWins++;
        else record.ties++;

        record.matches.push({ draftId: draft.id, result, aGames, bGames });
      }
    }
  }

  return record;
}

export function computePlayerDraftHistory(name: string, drafts: Draft[]): PlayerDraftResult[] {
  const key = norm(name);
  const results: PlayerDraftResult[] = [];

  for (const draft of drafts) {
    if (!draft.tournament) continue;
    const player = draft.players.find(p => norm(p.name) === key);
    if (!player) continue;

    const result: PlayerDraftResult = {
      draftId: draft.id,
      draftType: draft.type,
      matchWins: 0, matchLosses: 0, matchTies: 0,
      gameWins: 0, gameLosses: 0,
    };

    for (const round of draft.tournament.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.player2Id === null || !pairing.result) continue;
        if (pairing.player1Id !== player.id && pairing.player2Id !== player.id) continue;

        const isP1 = pairing.player1Id === player.id;
        const { matchWinner, player1Wins, player2Wins } = pairing.result;
        result.gameWins += isP1 ? player1Wins : player2Wins;
        result.gameLosses += isP1 ? player2Wins : player1Wins;

        if (matchWinner === 'player1') { if (isP1) result.matchWins++; else result.matchLosses++; }
        else if (matchWinner === 'player2') { if (!isP1) result.matchWins++; else result.matchLosses++; }
        else result.matchTies++;
      }
    }

    results.push(result);
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/utils/__tests__/playerStats.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/playerStats.ts src/utils/__tests__/playerStats.test.ts
git commit -m "feat: add playerStats utility with aggregates, H2H, and draft history"
```

---

### Task 2: Stats page + App wiring

**Files:**
- Create: `src/pages/Stats.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/pages/Stats.tsx`**

```tsx
import { useState, useMemo } from 'react';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import {
  computePlayerAggregates,
  computeHeadToHead,
  computePlayerDraftHistory,
} from '../utils/playerStats';

export default function Stats() {
  const drafts = useDraftHistoryStore(s => s.drafts);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [h2hNameA, setH2hNameA] = useState('');
  const [h2hNameB, setH2hNameB] = useState('');

  const aggregates = useMemo(() => computePlayerAggregates(drafts), [drafts]);
  const playerNames = aggregates.map(a => a.displayName);

  const expandedHistory = useMemo(
    () => expandedPlayer ? computePlayerDraftHistory(expandedPlayer, drafts) : [],
    [expandedPlayer, drafts]
  );

  const h2hResult = useMemo(() => {
    if (!h2hNameA || !h2hNameB) return null;
    return computeHeadToHead(h2hNameA, h2hNameB, drafts);
  }, [h2hNameA, h2hNameB, drafts]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold text-white">Stats</h2>

      {/* Leaderboard */}
      <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-800/80 border-b border-gray-700/50">
          <h3 className="text-white font-semibold">Leaderboard</h3>
        </div>
        <div className="grid grid-cols-[24px_1fr_80px_55px_40px_55px] px-4 py-2 bg-gray-800/50 border-b border-gray-700/30 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Record</span>
          <span className="text-right">Win%</span>
          <span className="text-right">GW</span>
          <span className="text-right">Events</span>
        </div>
        {aggregates.length === 0 && (
          <p className="px-4 py-8 text-gray-500 text-sm text-center">No tournament data yet.</p>
        )}
        {aggregates.map((agg, i) => (
          <div key={agg.normalizedName}>
            <button
              onClick={() =>
                setExpandedPlayer(expandedPlayer === agg.normalizedName ? null : agg.normalizedName)
              }
              className="w-full grid grid-cols-[24px_1fr_80px_55px_40px_55px] px-4 py-3 text-sm border-b border-gray-700/30 last:border-0 hover:bg-gray-800/40 text-left transition-colors"
            >
              <span className="text-gray-600 font-bold text-xs self-center">{i + 1}</span>
              <span className="text-gray-200 font-semibold self-center">{agg.displayName}</span>
              <span className="text-gray-400 text-xs text-right self-center">
                {agg.matchTies > 0
                  ? `${agg.matchWins}–${agg.matchLosses}–${agg.matchTies}`
                  : `${agg.matchWins}–${agg.matchLosses}`}
              </span>
              <span className="text-gray-400 text-xs text-right self-center">
                {(agg.matchWinRate * 100).toFixed(0)}%
              </span>
              <span className="text-gray-600 text-xs text-right self-center">{agg.gameWins}</span>
              <span className="text-gray-600 text-xs text-right self-center">{agg.tournamentsPlayed}</span>
            </button>
            {expandedPlayer === agg.normalizedName && (
              <div className="px-4 pb-3 bg-gray-800/20 border-b border-gray-700/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2">
                  Draft History
                </p>
                {expandedHistory.length === 0 ? (
                  <p className="text-gray-600 text-xs italic">No completed matches found.</p>
                ) : (
                  <div className="space-y-1">
                    {expandedHistory.map(dh => (
                      <div
                        key={dh.draftId}
                        className="grid grid-cols-[1fr_70px_40px] text-xs text-gray-400 py-1.5 border-b border-gray-700/20 last:border-0"
                      >
                        <span className="text-gray-500 font-mono text-[10px] self-center">
                          {dh.draftType} · {dh.draftId.slice(0, 8)}
                        </span>
                        <span className="text-right self-center">
                          {dh.matchTies > 0
                            ? `${dh.matchWins}–${dh.matchLosses}–${dh.matchTies}`
                            : `${dh.matchWins}–${dh.matchLosses}`}
                        </span>
                        <span className="text-right text-gray-600 self-center">{dh.gameWins}gw</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Head-to-Head */}
      <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-800/80 border-b border-gray-700/50">
          <h3 className="text-white font-semibold">Head-to-Head</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={h2hNameA}
              onChange={e => { setH2hNameA(e.target.value); if (e.target.value === h2hNameB) setH2hNameB(''); }}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Player A…</option>
              {playerNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-gray-500 text-sm font-medium shrink-0">vs</span>
            <select
              value={h2hNameB}
              onChange={e => setH2hNameB(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Player B…</option>
              {playerNames.filter(n => n !== h2hNameA).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {h2hResult && h2hResult.matches.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-2">
              These players haven't faced each other yet.
            </p>
          )}

          {h2hResult && h2hResult.matches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-8 py-4 bg-gray-800/50 rounded-lg">
                <div className="text-center">
                  <p className="text-3xl font-bold text-white">{h2hResult.aWins}</p>
                  <p className="text-xs text-gray-400 mt-1">{h2hResult.nameA}</p>
                </div>
                {h2hResult.ties > 0 && (
                  <>
                    <div className="text-gray-600 text-lg font-medium">–</div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-white">{h2hResult.ties}</p>
                      <p className="text-xs text-gray-400 mt-1">Ties</p>
                    </div>
                  </>
                )}
                <div className="text-gray-600 text-lg font-medium">–</div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-white">{h2hResult.bWins}</p>
                  <p className="text-xs text-gray-400 mt-1">{h2hResult.nameB}</p>
                </div>
              </div>
              <div className="space-y-1">
                {h2hResult.matches.map((m, idx) => (
                  <div
                    key={`${m.draftId}-${idx}`}
                    className="flex items-center text-sm bg-gray-800/50 border border-gray-700/30 rounded-lg px-3 py-2"
                  >
                    <span className={`font-semibold flex-1 ${m.result === 'aWin' ? 'text-white' : 'text-gray-500'}`}>
                      {h2hResult.nameA}
                    </span>
                    <span className="text-gray-600 text-xs font-mono px-3">{m.aGames} – {m.bGames}</span>
                    <span className={`font-semibold flex-1 text-right ${m.result === 'bWin' ? 'text-white' : 'text-gray-500'}`}>
                      {h2hResult.nameB}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire up in `src/App.tsx`**

Add the import near the other page imports (after `Tournament`):
```typescript
import Stats from './pages/Stats';
```

Add the nav item inside `<nav>` after the History link (always visible, not conditional):
```tsx
<NavLink to="/stats">Stats</NavLink>
```

Add the route inside `<Routes>` after the `/history` route:
```tsx
<Route path="/stats" element={<Stats />} />
```

- [ ] **Step 3: Verify the build passes**

```
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Stats.tsx src/App.tsx
git commit -m "feat: add Stats page with leaderboard, per-draft history, and head-to-head"
```

---

### Task 3: Deploy

- [ ] **Step 1: Push to main**

```bash
git push
```

Expected: Vercel deployment triggered automatically. Check https://vercel.com for build status.
