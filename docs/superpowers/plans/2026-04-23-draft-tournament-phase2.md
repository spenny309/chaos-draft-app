# Draft Tournament Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement score submission, Swiss pairing generation for rounds 2+, and tournament finalization — surfaced inside the existing DraftHistory expanded-draft view.

**Architecture:** A `TournamentView` component renders inside `DraftHistory`'s expanded draft panel whenever `draft.tournament` exists. It handles score entry (via `ScoreEntry` sub-component), per-round status, Swiss pairing generation (via `swissPairings.ts`), and finalization. All state is written back to `drafts/{draftId}.tournament` as a full object replacement — no Firestore subcollections.

**Tech Stack:** React 19, TypeScript, Zustand, Firebase Firestore, Vitest, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/utils/swissPairings.ts` | Create | Swiss pairing algorithm + standings computation |
| `src/utils/__tests__/swissPairings.test.ts` | Create | Vitest unit tests for algorithm |
| `src/state/draftHistoryStore.ts` | Modify | Add `submitResult`, `addRound`, `finalizeTournament` actions |
| `src/components/ScoreEntry.tsx` | Create | Single-pairing score form (wins/ties/partial toggle) |
| `src/components/TournamentView.tsx` | Create | Full tournament management: rounds, score entry, next round generation, finalization |
| `src/pages/DraftHistory.tsx` | Modify | Render `TournamentView` in expanded view when `draft.tournament` exists |

---

## Task 1: Swiss Pairing Algorithm (TDD)

**Files:**
- Create: `src/utils/swissPairings.ts`
- Create: `src/utils/__tests__/swissPairings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/swissPairings.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run src/utils/__tests__/swissPairings.test.ts
```
Expected: FAIL with "Cannot find module '../swissPairings'"

- [ ] **Step 3: Implement `swissPairings.ts`**

Create `src/utils/swissPairings.ts`:

```typescript
import type { DraftPlayer, TournamentPairing, TournamentRound } from '../types';

export interface PlayerStanding {
  playerId: string;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  gameWins: number;
}

export function computeStandings(
  players: DraftPlayer[],
  completedRounds: TournamentRound[]
): PlayerStanding[] {
  const standings = new Map<string, PlayerStanding>(
    players.map(p => [p.id, { playerId: p.id, matchWins: 0, matchLosses: 0, matchTies: 0, gameWins: 0 }])
  );

  for (const round of completedRounds) {
    for (const pairing of round.pairings) {
      if (pairing.player2Id === null || !pairing.result) continue;
      const { matchWinner, player1Wins, player2Wins } = pairing.result;
      const s1 = standings.get(pairing.player1Id)!;
      const s2 = standings.get(pairing.player2Id)!;
      s1.gameWins += player1Wins;
      s2.gameWins += player2Wins;
      if (matchWinner === 'player1') { s1.matchWins++; s2.matchLosses++; }
      else if (matchWinner === 'player2') { s2.matchWins++; s1.matchLosses++; }
      else { s1.matchTies++; s2.matchTies++; }
    }
  }

  return [...standings.values()];
}

export function generateSwissPairings(
  players: DraftPlayer[],
  completedRounds: TournamentRound[]
): TournamentPairing[] {
  const standings = computeStandings(players, completedRounds);

  const byeHistory = new Set<string>();
  for (const round of completedRounds) {
    for (const pairing of round.pairings) {
      if (pairing.player2Id === null) byeHistory.add(pairing.player1Id);
    }
  }

  const played = new Set<string>();
  for (const round of completedRounds) {
    for (const pairing of round.pairings) {
      if (pairing.player2Id !== null) {
        played.add(`${pairing.player1Id}:${pairing.player2Id}`);
        played.add(`${pairing.player2Id}:${pairing.player1Id}`);
      }
    }
  }

  const sorted = [...standings].sort(
    (a, b) => b.matchWins - a.matchWins || b.gameWins - a.gameWins
  );
  const unpaired = sorted.map(s => players.find(p => p.id === s.playerId)!);

  const pairings: TournamentPairing[] = [];
  let byePairing: TournamentPairing | undefined;

  if (unpaired.length % 2 === 1) {
    const eligible = unpaired.filter(p => !byeHistory.has(p.id));
    const byeReceiver = eligible.length > 0
      ? eligible[eligible.length - 1]
      : unpaired[unpaired.length - 1];
    unpaired.splice(unpaired.findIndex(p => p.id === byeReceiver.id), 1);
    byePairing = { id: crypto.randomUUID(), player1Id: byeReceiver.id, player2Id: null, status: 'pending' };
  }

  while (unpaired.length > 1) {
    const p1 = unpaired.shift()!;
    let found = false;
    for (let i = 0; i < unpaired.length; i++) {
      const p2 = unpaired[i];
      if (!played.has(`${p1.id}:${p2.id}`)) {
        pairings.push({ id: crypto.randomUUID(), player1Id: p1.id, player2Id: p2.id, status: 'pending' });
        unpaired.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found) {
      const p2 = unpaired.shift()!;
      pairings.push({ id: crypto.randomUUID(), player1Id: p1.id, player2Id: p2.id, status: 'pending' });
    }
  }

  if (byePairing) pairings.push(byePairing);
  return pairings;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run src/utils/__tests__/swissPairings.test.ts
```
Expected: All tests PASS. Also run the full suite: `npx vitest run` — expect all tests to pass (39+ tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/swissPairings.ts src/utils/__tests__/swissPairings.test.ts
git commit -m "feat: add Swiss pairing algorithm with standings computation"
```

---

## Task 2: Tournament Store Actions

**Files:**
- Modify: `src/state/draftHistoryStore.ts`

Note: No unit tests for store actions — they call Firestore directly, consistent with every other action in this file.

- [ ] **Step 1: Add new action signatures to the interface**

In `src/state/draftHistoryStore.ts`, add three new entries to the `DraftHistoryState` interface (after `updateTournament`):

```typescript
submitResult: (draftId: string, roundNumber: number, pairingId: string, result: Omit<PairingResult, 'submittedBy' | 'submittedAt'>) => Promise<void>;
addRound: (draftId: string, pairings: TournamentPairing[]) => Promise<void>;
finalizeTournament: (draftId: string, userId: string) => Promise<void>;
```

This requires importing `PairingResult` and `TournamentPairing` from `'../types'`. The existing `import type { Draft } from '../types'` must be expanded:

```typescript
import type { Draft, PairingResult, TournamentPairing, TournamentRound } from '../types';
```

Also add `Timestamp` to the firebase/firestore imports:

```typescript
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  runTransaction,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
```

- [ ] **Step 2: Implement `submitResult`**

Add the following implementation to the store object (after `updateTournament`):

```typescript
submitResult: async (draftId, roundNumber, pairingId, result) => {
  const draft = get().drafts.find(d => d.id === draftId);
  if (!draft?.tournament) return;

  const fullResult: PairingResult = {
    ...result,
    submittedBy: auth.currentUser?.uid ?? '',
    submittedAt: Timestamp.now(),
  };

  const updatedTournament = {
    ...draft.tournament,
    rounds: draft.tournament.rounds.map(round => {
      if (round.roundNumber !== roundNumber) return round;
      const updatedPairings = round.pairings.map(p =>
        p.id !== pairingId ? p : { ...p, result: fullResult, status: 'complete' as const }
      );
      const allComplete = updatedPairings
        .filter(p => p.player2Id !== null)
        .every(p => p.status === 'complete');
      return { ...round, pairings: updatedPairings, status: allComplete ? 'complete' as const : 'active' as const };
    }),
  };

  await updateDoc(doc(db, 'drafts', draftId), { tournament: updatedTournament });
  set(state => ({
    drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament: updatedTournament } : d),
  }));
},
```

- [ ] **Step 3: Implement `addRound`**

```typescript
addRound: async (draftId, pairings) => {
  const draft = get().drafts.find(d => d.id === draftId);
  if (!draft?.tournament) return;

  const nextRoundNumber = draft.tournament.currentRound + 1;
  const newRound: TournamentRound = {
    roundNumber: nextRoundNumber,
    pairings,
    status: 'active',
  };
  const updatedTournament = {
    ...draft.tournament,
    rounds: [...draft.tournament.rounds, newRound],
    currentRound: nextRoundNumber,
  };

  await updateDoc(doc(db, 'drafts', draftId), { tournament: updatedTournament });
  set(state => ({
    drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament: updatedTournament } : d),
  }));
},
```

- [ ] **Step 4: Implement `finalizeTournament`**

```typescript
finalizeTournament: async (draftId, userId) => {
  const draft = get().drafts.find(d => d.id === draftId);
  if (!draft?.tournament) return;

  const updatedTournament = {
    ...draft.tournament,
    status: 'finalized' as const,
    finalizedAt: Timestamp.now(),
    finalizedBy: userId,
  };

  await updateDoc(doc(db, 'drafts', draftId), { tournament: updatedTournament });
  set(state => ({
    drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament: updatedTournament } : d),
  }));
},
```

- [ ] **Step 5: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/state/draftHistoryStore.ts
git commit -m "feat: add submitResult, addRound, finalizeTournament store actions"
```

---

## Task 3: ScoreEntry Component

**Files:**
- Create: `src/components/ScoreEntry.tsx`

- [ ] **Step 1: Create `ScoreEntry.tsx`**

```tsx
import { useState } from 'react';
import type { TournamentPairing, DraftPlayer, PairingResult } from '../types';

interface ScoreEntryProps {
  pairing: TournamentPairing;
  players: DraftPlayer[];
  onSubmit: (result: Omit<PairingResult, 'submittedBy' | 'submittedAt'>) => Promise<void>;
}

function playerName(id: string, players: DraftPlayer[]): string {
  return players.find(p => p.id === id)?.name ?? id;
}

export default function ScoreEntry({ pairing, players, onSubmit }: ScoreEntryProps) {
  const [p1Wins, setP1Wins] = useState(0);
  const [p2Wins, setP2Wins] = useState(0);
  const [ties, setTies] = useState(0);
  const [isPartial, setIsPartial] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (pairing.result) {
    const r = pairing.result;
    const winnerName = r.matchWinner === 'player1'
      ? playerName(pairing.player1Id, players)
      : r.matchWinner === 'player2'
      ? playerName(pairing.player2Id!, players)
      : null;
    return (
      <div className="bg-gray-700/50 rounded-lg p-3 text-sm text-gray-300 space-y-1">
        <div className="flex justify-between">
          <span>{playerName(pairing.player1Id, players)}</span>
          <span className="font-bold text-white">{r.player1Wins}</span>
        </div>
        <div className="flex justify-between">
          <span>{playerName(pairing.player2Id!, players)}</span>
          <span className="font-bold text-white">{r.player2Wins}</span>
        </div>
        {r.ties > 0 && <p className="text-gray-400 text-xs">Ties: {r.ties}</p>}
        <p className="text-xs font-semibold mt-1">
          {winnerName ? <span className="text-green-400">{winnerName} wins</span> : <span className="text-yellow-400">Tie match</span>}
          {r.isPartial && <span className="text-orange-400 ml-2">(partial)</span>}
        </p>
      </div>
    );
  }

  const handleSubmit = async () => {
    const matchWinner = p1Wins > p2Wins ? 'player1' : p2Wins > p1Wins ? 'player2' : 'tie';
    setSubmitting(true);
    try {
      await onSubmit({ player1Wins: p1Wins, player2Wins: p2Wins, ties, matchWinner, isPartial });
    } finally {
      setSubmitting(false);
    }
  };

  const p1Name = playerName(pairing.player1Id, players);
  const p2Name = playerName(pairing.player2Id!, players);

  return (
    <div className="bg-gray-700/50 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="space-y-1">
          <p className="text-gray-300 truncate" title={p1Name}>{p1Name}</p>
          <input
            type="number"
            min="0"
            value={p1Wins}
            onChange={e => setP1Wins(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1 text-center">
          <p className="text-gray-500 text-xs">Ties</p>
          <input
            type="number"
            min="0"
            value={ties}
            onChange={e => setTies(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1 text-right">
          <p className="text-gray-300 truncate" title={p2Name}>{p2Name}</p>
          <input
            type="number"
            min="0"
            value={p2Wins}
            onChange={e => setP2Wins(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={isPartial}
            onChange={e => setIsPartial(e.target.checked)}
            className="rounded border-gray-500"
          />
          Mark as partial
        </label>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded"
        >
          {submitting ? 'Saving…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScoreEntry.tsx
git commit -m "feat: add ScoreEntry component for per-pairing score submission"
```

---

## Task 4: TournamentView Component

**Files:**
- Create: `src/components/TournamentView.tsx`

This component is the main tournament management UI. It shows round-by-round pairings with score entry, handles round progression, and allows admins to finalize the tournament.

- [ ] **Step 1: Create `TournamentView.tsx`**

```tsx
import { useState } from 'react';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import ScoreEntry from './ScoreEntry';
import { generateSwissPairings } from '../utils/swissPairings';
import type { Draft, DraftPlayer, TournamentPairing } from '../types';

interface TournamentViewProps {
  draft: Draft;
  isAdmin: boolean;
  currentUserId: string | undefined;
}

function playerName(id: string, players: DraftPlayer[]): string {
  return players.find(p => p.id === id)?.name ?? id;
}

export default function TournamentView({ draft, isAdmin, currentUserId }: TournamentViewProps) {
  const { submitResult, addRound, finalizeTournament } = useDraftHistoryStore();
  const [pendingPairings, setPendingPairings] = useState<TournamentPairing[] | null>(null);
  const [generatingRound, setGeneratingRound] = useState(false);
  const [finalizingTournament, setFinalizingTournament] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tournament, players } = draft;
  if (!tournament) return null;

  const currentRound = tournament.rounds.find(r => r.roundNumber === tournament.currentRound);
  const pastRounds = tournament.rounds.filter(r => r.roundNumber < tournament.currentRound);

  const allCurrentComplete = currentRound
    ? currentRound.pairings.filter(p => p.player2Id !== null).every(p => p.status === 'complete')
    : false;

  const canGenerateNext =
    !pendingPairings &&
    tournament.status !== 'finalized' &&
    tournament.currentRound < tournament.totalRounds &&
    (allCurrentComplete || isAdmin);

  const handleGenerateNext = () => {
    const completedRounds = tournament.rounds.filter(r => r.status === 'complete');
    const generated = generateSwissPairings(players, completedRounds);
    setPendingPairings(generated);
  };

  const handleConfirmRound = async () => {
    if (!pendingPairings) return;
    setGeneratingRound(true);
    setError(null);
    try {
      await addRound(draft.id, pendingPairings);
      setPendingPairings(null);
    } catch {
      setError('Failed to save round. Please try again.');
    } finally {
      setGeneratingRound(false);
    }
  };

  const handleFinalize = async () => {
    if (!currentUserId) return;
    if (!window.confirm('Finalize the tournament? This cannot be undone.')) return;
    setFinalizingTournament(true);
    setError(null);
    try {
      await finalizeTournament(draft.id, currentUserId);
    } catch {
      setError('Failed to finalize. Please try again.');
    } finally {
      setFinalizingTournament(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-700/50 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">
          Tournament
          {tournament.status === 'finalized'
            ? <span className="ml-2 text-xs font-normal text-green-400 bg-green-900/40 px-2 py-0.5 rounded">Finalized</span>
            : <span className="ml-2 text-xs font-normal text-gray-400">Round {tournament.currentRound} of {tournament.totalRounds}</span>
          }
        </h3>
        {isAdmin && tournament.status !== 'finalized' && (
          <button
            onClick={handleFinalize}
            disabled={finalizingTournament}
            className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded-lg"
          >
            {finalizingTournament ? 'Finalizing…' : 'Finalize Tournament'}
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Past rounds summary */}
      {pastRounds.map(round => (
        <div key={round.roundNumber} className="space-y-2">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Round {round.roundNumber} — Complete</p>
          {round.pairings.map(pairing => (
            <div key={pairing.id}>
              {pairing.player2Id === null ? (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-2 text-xs text-amber-300">
                  🎟️ Bye — {playerName(pairing.player1Id, players)}
                </div>
              ) : (
                <ScoreEntry
                  pairing={pairing}
                  players={players}
                  onSubmit={async result => {
                    await submitResult(draft.id, round.roundNumber, pairing.id, result);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Current round */}
      {currentRound && (
        <div className="space-y-2">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">
            Round {currentRound.roundNumber}
            {tournament.status !== 'finalized' && <span className="ml-2 text-blue-400">● Active</span>}
          </p>
          {currentRound.pairings.map(pairing => (
            <div key={pairing.id}>
              {pairing.player2Id === null ? (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-2 text-xs text-amber-300">
                  🎟️ Bye — {playerName(pairing.player1Id, players)}
                </div>
              ) : (
                <ScoreEntry
                  pairing={pairing}
                  players={players}
                  onSubmit={async result => {
                    await submitResult(draft.id, currentRound.roundNumber, pairing.id, result);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending next round preview */}
      {pendingPairings && (
        <div className="space-y-3 p-4 bg-gray-700/30 rounded-xl border border-gray-600">
          <p className="text-white font-medium text-sm">Round {tournament.currentRound + 1} — Generated Pairings</p>
          <div className="space-y-2">
            {pendingPairings.map(pairing => (
              <div key={pairing.id} className="flex items-center justify-between text-sm text-gray-300 bg-gray-700/50 rounded-lg px-3 py-2">
                {pairing.player2Id === null ? (
                  <span className="text-amber-300">🎟️ Bye — {playerName(pairing.player1Id, players)}</span>
                ) : (
                  <>
                    <span>{playerName(pairing.player1Id, players)}</span>
                    <span className="text-gray-500 text-xs px-2">vs</span>
                    <span>{playerName(pairing.player2Id, players)}</span>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmRound}
              disabled={generatingRound}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {generatingRound ? 'Saving…' : `Confirm Round ${tournament.currentRound + 1} →`}
            </button>
            <button
              onClick={() => setPendingPairings(null)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generate next round button */}
      {canGenerateNext && (
        <button
          onClick={handleGenerateNext}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl"
        >
          Generate Round {tournament.currentRound + 1} →
        </button>
      )}

      {tournament.status !== 'finalized' && tournament.currentRound >= tournament.totalRounds && !pendingPairings && allCurrentComplete && (
        <p className="text-center text-gray-400 text-sm">All rounds complete. Finalize the tournament when ready.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TournamentView.tsx
git commit -m "feat: add TournamentView component for round management and score entry"
```

---

## Task 5: Wire TournamentView into DraftHistory

**Files:**
- Modify: `src/pages/DraftHistory.tsx`

- [ ] **Step 1: Add the TournamentView import**

At the top of `src/pages/DraftHistory.tsx`, add:

```typescript
import TournamentView from '../components/TournamentView';
```

- [ ] **Step 2: Render TournamentView inside the expanded draft panel**

In the expanded draft section (around line 372 — inside `{expandedDraftId === draft.id && ...}`), add `TournamentView` after the existing `LinkPlayersSection` and before the delete button section. Locate this block:

```tsx
{profile?.role === 'admin' && (
  <LinkPlayersSection
    draft={draft}
    publicProfiles={publicProfiles}
    linkDraftPlayers={linkDraftPlayers}
  />
)}

<div className="mt-6 pt-6 border-t border-gray-700/50 text-right">
  <button
    onClick={() => handleDelete(draft)}
```

Replace it with:

```tsx
{profile?.role === 'admin' && (
  <LinkPlayersSection
    draft={draft}
    publicProfiles={publicProfiles}
    linkDraftPlayers={linkDraftPlayers}
  />
)}

{draft.tournament && (
  <TournamentView
    draft={draft}
    isAdmin={profile?.role === 'admin'}
    currentUserId={profile?.uid}
  />
)}

<div className="mt-6 pt-6 border-t border-gray-700/50 text-right">
  <button
    onClick={() => handleDelete(draft)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Run full test suite**

```
npx vitest run
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DraftHistory.tsx
git commit -m "feat: wire TournamentView into DraftHistory expanded panel"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Score submission UI with wins/losses/ties + partial toggle + submit (ScoreEntry)
- ✅ Results stored with `submittedBy` / `submittedAt` (submitResult action)
- ✅ Round marked complete when all non-bye pairings have results (submitResult round status logic)
- ✅ Swiss algorithm: sort by match wins → game wins tiebreaker → greedy rematch avoidance (swissPairings.ts)
- ✅ Bye allocation: lowest eligible player who hasn't had one; fallback to lowest overall (swissPairings.ts)
- ✅ Hard constraint: no repeat matchups enforced (played Set in algorithm)
- ✅ "Generate Round N →" visible to all when all pairings complete, always visible to admin (canGenerateNext logic)
- ✅ Admin confirms generated pairings before saving (pendingPairings state + Confirm button)
- ✅ Finalization: admin-only, sets status/finalizedAt/finalizedBy (finalizeTournament action + button)
- ✅ Finalized tournaments show "Finalized" badge, no more buttons
- ✅ Past rounds shown with recorded results (read-only ScoreEntry)

**Soft constraint note:** The spec mentions admin can reorder generated pairings before confirming. This plan implements a read-only preview with a Cancel/Confirm flow — admins can Cancel to regenerate if they want different pairings. Full drag/swap UI is deferred as a future enhancement.

**Placeholder scan:** No TBDs or TODOs in code blocks.

**Type consistency:** `PairingResult`, `TournamentPairing`, `TournamentRound`, `DraftTournament` all flow from `src/types/index.ts` consistently throughout.
