# Draft Tournament Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seat assignment and round 1 matchup display to all draft types (except Team Sealed), persisting tournament data inside the existing `drafts/{draftId}` Firestore document.

**Architecture:** New tournament types extend `Draft` via an optional `tournament` field. Two new components (`SeatAssignment`, `RoundMatchups`) are wired into `DraftHub` as new steps. For regular/sealed/mobius drafts, the save is deferred until after seating. For chaos drafts, tournament data is held in session store and written when the session is confirmed.

**Tech Stack:** React 19, TypeScript, Zustand, Firebase Firestore, Vitest, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types/index.ts` | Add 6 new tournament types; extend `Draft` |
| Create | `src/utils/tournamentPairings.ts` | Pure functions: shuffle, round 1 pairings, seats |
| Create | `src/utils/__tests__/tournamentPairings.test.ts` | Unit tests |
| Modify | `src/state/draftHistoryStore.ts` | Add `updateTournament` action |
| Modify | `src/state/sessionStore.ts` | Add `pendingTournament` + `setPendingTournament` |
| Create | `src/components/SeatAssignment.tsx` | Ordered list UI with up/down reorder |
| Create | `src/components/RoundMatchups.tsx` | Gradient VS row matchup display |
| Modify | `src/pages/RegularDraftPreview.tsx` | Replace `onSaved` with `onConfirmed`; remove save |
| Modify | `src/pages/RegularDraftSetup.tsx` | Add `onStartChaos`; remove direct navigation |
| Modify | `src/pages/DraftHub.tsx` | Add `seating` + `matchups` steps; orchestrate save |

---

## Task 1: Add tournament types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add types after the existing `DraftAllocationEntry` interface**

Open `src/types/index.ts` and add the following after the `DraftAllocationEntry` interface (line ~61):

```typescript
export type TournamentStatus = 'seating' | 'active' | 'finalized';

export interface DraftSeat {
  playerId: string;
  seat: number;
}

export interface PairingResult {
  player1Wins: number;
  player2Wins: number;
  ties: number;
  matchWinner: 'player1' | 'player2' | 'tie';
  isPartial: boolean;
  submittedBy: string;
  submittedAt: Timestamp;
}

export interface TournamentPairing {
  id: string;
  player1Id: string;
  player2Id: string | null;
  result?: PairingResult;
  status: 'pending' | 'complete';
}

export interface TournamentRound {
  roundNumber: number;
  pairings: TournamentPairing[];
  status: 'active' | 'complete';
}

export interface DraftTournament {
  seats: DraftSeat[];
  rounds: TournamentRound[];
  currentRound: number;
  totalRounds: number;
  status: TournamentStatus;
  finalizedAt?: Timestamp;
  finalizedBy?: string;
}
```

- [ ] **Step 2: Extend the `Draft` interface**

Add `tournament?: DraftTournament;` to the `Draft` interface after the `allocation` field:

```typescript
export interface Draft {
  id: string;
  type: DraftType;
  createdBy: string;
  createdAt: Timestamp;
  status: DraftStatus;
  players: DraftPlayer[];
  // Chaos-only
  sessionId?: string;
  restockComplete?: boolean;
  packsSelectedOrder?: DraftPackRef[];
  // Regular/Sealed/Mobius/Team Sealed
  sets?: DraftSetRef[];
  packsPerPerson?: number;
  finalizedAt?: Timestamp | null;
  finalizedBy?: string | null;
  allocation?: DraftAllocationEntry[];
  // Tournament
  tournament?: DraftTournament;
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no output (clean compile).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add tournament data model types"
```

---

## Task 2: Create `tournamentPairings.ts` utility (TDD)

**Files:**
- Create: `src/utils/tournamentPairings.ts`
- Create: `src/utils/__tests__/tournamentPairings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/tournamentPairings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  shufflePlayers,
  generateRound1Pairings,
  playersToSeats,
} from '../tournamentPairings';
import type { DraftPlayer } from '../../types';

const makePlayer = (id: string): DraftPlayer => ({ id, name: id, userId: null });

describe('shufflePlayers', () => {
  it('returns all original players', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const shuffled = shufflePlayers(players);
    expect(shuffled).toHaveLength(4);
    expect(shuffled.map(p => p.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the original array', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const original = [...players];
    shufflePlayers(players);
    expect(players).toEqual(original);
  });
});

describe('generateRound1Pairings', () => {
  it('pairs seat 1 vs seat N/2+1 for even count', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(2);
    expect(pairings[0]).toMatchObject({ player1Id: 'a', player2Id: 'c', status: 'pending' });
    expect(pairings[1]).toMatchObject({ player1Id: 'b', player2Id: 'd', status: 'pending' });
  });

  it('generates correct pairings for 6 players (1v4, 2v5, 3v6)', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(3);
    expect(pairings[0]).toMatchObject({ player1Id: 'p1', player2Id: 'p4' });
    expect(pairings[1]).toMatchObject({ player1Id: 'p2', player2Id: 'p5' });
    expect(pairings[2]).toMatchObject({ player1Id: 'p3', player2Id: 'p6' });
  });

  it('handles 2 players', () => {
    const players = ['a', 'b'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(1);
    expect(pairings[0]).toMatchObject({ player1Id: 'a', player2Id: 'b' });
  });

  it('gives the last player a bye for odd count', () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(3);
    const bye = pairings.find(p => p.player2Id === null);
    expect(bye?.player1Id).toBe('e');
  });

  it('pairs correctly for odd count (first 4 pair normally)', () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    const matches = pairings.filter(p => p.player2Id !== null);
    expect(matches[0]).toMatchObject({ player1Id: 'a', player2Id: 'c' });
    expect(matches[1]).toMatchObject({ player1Id: 'b', player2Id: 'd' });
  });

  it('all pairings have unique ids', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    const ids = pairings.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('playersToSeats', () => {
  it('assigns seats 1-N to all players for even count', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const seats = playersToSeats(players);
    expect(seats).toHaveLength(4);
    expect(seats[0]).toEqual({ playerId: 'a', seat: 1 });
    expect(seats[3]).toEqual({ playerId: 'd', seat: 4 });
  });

  it('excludes the last player (bye holder) for odd count', () => {
    const players = ['a', 'b', 'c'].map(makePlayer);
    const seats = playersToSeats(players);
    expect(seats).toHaveLength(2);
    expect(seats.find(s => s.playerId === 'c')).toBeUndefined();
  });

  it('seat numbers start at 1', () => {
    const players = ['a', 'b'].map(makePlayer);
    const seats = playersToSeats(players);
    expect(seats[0].seat).toBe(1);
    expect(seats[1].seat).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: multiple failures with "Cannot find module '../tournamentPairings'".

- [ ] **Step 3: Create the implementation**

Create `src/utils/tournamentPairings.ts`:

```typescript
import type { DraftPlayer, DraftSeat, TournamentPairing } from '../types';

export function shufflePlayers(players: DraftPlayer[]): DraftPlayer[] {
  const result = [...players];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateRound1Pairings(orderedPlayers: DraftPlayer[]): TournamentPairing[] {
  const isOdd = orderedPlayers.length % 2 !== 0;
  const activePlayers = isOdd ? orderedPlayers.slice(0, -1) : orderedPlayers;
  const byePlayer = isOdd ? orderedPlayers[orderedPlayers.length - 1] : null;
  const half = activePlayers.length / 2;
  const pairings: TournamentPairing[] = [];

  for (let i = 0; i < half; i++) {
    pairings.push({
      id: crypto.randomUUID(),
      player1Id: activePlayers[i].id,
      player2Id: activePlayers[i + half].id,
      status: 'pending',
    });
  }

  if (byePlayer) {
    pairings.push({
      id: crypto.randomUUID(),
      player1Id: byePlayer.id,
      player2Id: null,
      status: 'pending',
    });
  }

  return pairings;
}

export function playersToSeats(orderedPlayers: DraftPlayer[]): DraftSeat[] {
  const isOdd = orderedPlayers.length % 2 !== 0;
  const activePlayers = isOdd ? orderedPlayers.slice(0, -1) : orderedPlayers;
  return activePlayers.map((p, i) => ({ playerId: p.id, seat: i + 1 }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tournamentPairings.ts src/utils/__tests__/tournamentPairings.test.ts
git commit -m "feat: add tournament pairing utility functions"
```

---

## Task 3: Add `updateTournament` to `draftHistoryStore`

**Files:**
- Modify: `src/state/draftHistoryStore.ts`

- [ ] **Step 1: Add `updateTournament` to the interface**

In `src/state/draftHistoryStore.ts`, add to the `DraftHistoryState` interface after `linkDraftPlayers`:

```typescript
updateTournament: (draftId: string, tournament: Draft['tournament']) => Promise<void>;
```

Note: `Draft['tournament']` resolves to `DraftTournament | undefined`. You'll need to import `Draft` if it isn't already — it is, via `import type { Draft } from '../types';`.

- [ ] **Step 2: Add the implementation**

Add after the `linkDraftPlayers` implementation (before the closing `}));`):

```typescript
  updateTournament: async (draftId, tournament) => {
    await updateDoc(doc(db, 'drafts', draftId), { tournament });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament } : d),
    }));
  },
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/state/draftHistoryStore.ts
git commit -m "feat: add updateTournament store action"
```

---

## Task 4: Add `pendingTournament` to `sessionStore`

This holds chaos draft tournament data between seating confirmation and draft completion.

**Files:**
- Modify: `src/state/sessionStore.ts`

- [ ] **Step 1: Add import**

Add `DraftTournament` to the types import at the top of `src/state/sessionStore.ts`:

```typescript
import type { DraftTournament } from '../types';
```

- [ ] **Step 2: Add to the `SessionState` interface**

Add after the `confirmed` field and before `initializeSession`:

```typescript
  pendingTournament: DraftTournament | null;
  setPendingTournament: (tournament: DraftTournament) => void;
```

- [ ] **Step 3: Add initial state**

In the `create<SessionState>((set, get) => ({` block, add after `confirmed: false,`:

```typescript
  pendingTournament: null,
```

- [ ] **Step 4: Add `setPendingTournament` implementation**

Add after the `confirmSession` implementation:

```typescript
  setPendingTournament: (tournament) => {
    set({ pendingTournament: tournament });
  },
```

- [ ] **Step 5: Clear in `resetSession`**

In the `resetSession` function, add `pendingTournament: null` to the `set({...})` call:

```typescript
  resetSession: () => {
    const { players } = get();
    const { packs: inventory } = useInventoryStore.getState();
    const resetPlayers = players.map((p) => ({ ...p, selectedPacks: [] }));

    set({
      sessionId: crypto.randomUUID(),
      players: resetPlayers,
      packsSelectedOrder: [],
      tempInventory: inventory.map((p) => ({ ...p })),
      confirmed: false,
      pendingTournament: null,
    });
  },
```

- [ ] **Step 6: Include `pendingTournament` in `confirmSession`'s `saveDraft` call**

In `confirmSession`, update the `saveDraft` call to include the tournament:

```typescript
      await saveDraft({
        type: 'chaos',
        createdBy: uid,
        status: 'finalized',
        sessionId,
        players: players.map(p => ({
          id: p.id,
          name: p.name,
          userId: p.userId,
        })),
        packsSelectedOrder: packsSelectedOrder.map(p => ({
          id: p.id,
          name: p.name,
          imageUrl: p.imageUrl,
        })),
        restockComplete: false,
        tournament: get().pendingTournament ?? undefined,
      });
```

- [ ] **Step 7: Verify compile**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/state/sessionStore.ts
git commit -m "feat: add pendingTournament to session store for chaos drafts"
```

---

## Task 5: Create `SeatAssignment` component

**Files:**
- Create: `src/components/SeatAssignment.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/SeatAssignment.tsx`:

```tsx
import { useState } from 'react';
import { shufflePlayers } from '../utils/tournamentPairings';
import type { DraftPlayer } from '../types';

interface SeatAssignmentProps {
  players: DraftPlayer[];
  onConfirm: (orderedPlayers: DraftPlayer[]) => void;
  onBack: () => void;
}

export default function SeatAssignment({ players, onConfirm, onBack }: SeatAssignmentProps) {
  const [ordered, setOrdered] = useState<DraftPlayer[]>(() => shufflePlayers(players));
  const isOdd = ordered.length % 2 !== 0;

  const moveUp = (index: number) => {
    if (index === 0) return;
    setOrdered(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index === ordered.length - 1) return;
    setOrdered(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h2 className="text-xl font-bold text-white">Seat Assignment</h2>
      </div>

      <p className="text-gray-400 text-sm">
        Players are randomly seated. Use ▲▼ to reorder.
        {isOdd && <span className="text-yellow-400"> The player at the bottom receives a bye in round 1.</span>}
      </p>

      <div className="space-y-2">
        {ordered.map((player, i) => {
          const isBye = isOdd && i === ordered.length - 1;
          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
                isBye
                  ? 'bg-yellow-900/30 border-dashed border-yellow-700'
                  : 'bg-gray-800 border-gray-700'
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                isBye ? 'bg-yellow-800 text-yellow-300' : 'bg-blue-600 text-white'
              }`}>
                {isBye ? 'B' : i + 1}
              </span>
              <span className={`flex-1 font-medium text-sm ${isBye ? 'text-yellow-200' : 'text-white'}`}>
                {player.name}
                {isBye && <span className="text-yellow-400 text-xs ml-2">(Bye)</span>}
              </span>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  className="w-6 h-5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-300 rounded text-xs flex items-center justify-center"
                >▲</button>
                <button
                  onClick={() => moveDown(i)}
                  disabled={i === ordered.length - 1}
                  className="w-6 h-5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-300 rounded text-xs flex items-center justify-center"
                >▼</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setOrdered(shufflePlayers(players))}
          className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl"
        >
          🎲 Re-randomize
        </button>
        <button
          onClick={() => onConfirm(ordered)}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
        >
          Confirm Seats →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/SeatAssignment.tsx
git commit -m "feat: add SeatAssignment component"
```

---

## Task 6: Create `RoundMatchups` component

**Files:**
- Create: `src/components/RoundMatchups.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/RoundMatchups.tsx`:

```tsx
import type { DraftPlayer, TournamentPairing } from '../types';

interface RoundMatchupsProps {
  players: DraftPlayer[];
  pairings: TournamentPairing[];
  onStart: () => Promise<void>;
  disabled?: boolean;
}

export default function RoundMatchups({ players, pairings, onStart, disabled = false }: RoundMatchupsProps) {
  const playerMap = new Map(players.map(p => [p.id, p.name]));
  const matchPairings = pairings.filter(p => p.player2Id !== null);
  const byePairing = pairings.find(p => p.player2Id === null);

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">⚔️ Round 1</h2>
        <p className="text-gray-400 text-sm mt-1">First round matchups</p>
      </div>

      <div className="space-y-3">
        {matchPairings.map(pairing => (
          <div
            key={pairing.id}
            className="flex items-center gap-3 rounded-xl px-5 py-4 border border-blue-900/40"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #1a1f3e)' }}
          >
            <div className="flex-1 text-right">
              <span className="text-white font-bold text-base">{playerMap.get(pairing.player1Id)}</span>
            </div>
            <div className="bg-purple-700 text-white text-xs font-extrabold px-2 py-1 rounded flex-shrink-0">
              VS
            </div>
            <div className="flex-1 text-left">
              <span className="text-white font-bold text-base">{playerMap.get(pairing.player2Id!)}</span>
            </div>
          </div>
        ))}

        {byePairing && (
          <div className="flex items-center gap-3 rounded-xl px-5 py-3 bg-yellow-900/30 border border-dashed border-yellow-700">
            <span className="text-lg">🎟️</span>
            <span className="text-yellow-200 text-sm font-medium">
              Bye — {playerMap.get(byePairing.player1Id)}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={onStart}
        disabled={disabled}
        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl text-base"
      >
        {disabled ? 'Saving…' : 'Start Round 1 →'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/RoundMatchups.tsx
git commit -m "feat: add RoundMatchups component"
```

---

## Task 7: Update `RegularDraftPreview` — defer save to `DraftHub`

Currently `RegularDraftPreview` saves the draft itself. We need it to pass the allocation up to `DraftHub` instead, so `DraftHub` can include tournament data in the save.

**Files:**
- Modify: `src/pages/RegularDraftPreview.tsx`

- [ ] **Step 1: Change the `onSaved` prop to `onConfirmed`**

Replace the `RegularDraftPreviewProps` interface (lines 8-15):

```typescript
interface RegularDraftPreviewProps {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
  onBack: () => void;
  onConfirmed: (allocation: DraftAllocationEntry[]) => void;
}
```

- [ ] **Step 2: Update the destructured props**

Change the component signature (line 26):

```typescript
export default function RegularDraftPreview({
  players, sets, format, packsPerPerson, onBack, onConfirmed,
}: RegularDraftPreviewProps) {
```

- [ ] **Step 3: Remove `saving` state and `savePreview` from store usage**

Remove `saving` from `useState`:
```typescript
// Remove this line:
const [saving, setSaving] = useState(false);
```

Remove only `savePreview` and `previewAllocations` from the store destructure — keep `wasRounded` and `computePreview` as they are still used. The new line is:
```typescript
const { computePreview, wasRounded } = useRegularDraftStore();
```

- [ ] **Step 4: Replace `handleSave` with `handleConfirm`**

Replace the entire `handleSave` function (lines 111-139) with:

```typescript
  const handleConfirm = () => {
    if (!validate()) return;

    const flatAllocation: DraftAllocationEntry[] = [];
    for (const entries of overrides.values()) {
      for (const entry of entries) {
        if (entry.count > 0) {
          flatAllocation.push({
            userId: entry.userId,
            userName: entry.userName,
            catalogId: entry.catalogId,
            name: entry.name,
            count: entry.count,
          });
        }
      }
    }
    onConfirmed(flatAllocation);
  };
```

- [ ] **Step 5: Update `handleResetToDefault`**

`handleResetToDefault` currently calls `computePreview` which is still available. However it also references `previewAllocations` from the store. Replace it to use local state only:

```typescript
  const handleResetToDefault = () => {
    const { allocations } = computePreview(
      { players, sets, format, packsPerPerson },
      allItems
    );
    const userMap = new Map(publicProfiles.map(u => [u.uid, u.name]));
    const newOverrides = new Map<string, OverrideEntry[]>();

    allocations.forEach(allocation => {
      const itemsForSet = allItems.filter(
        item => item.catalogId === allocation.catalogId && item.count > 0
      );
      newOverrides.set(allocation.catalogId, itemsForSet.map(item => {
        const existing = allocation.contributions.find(c => c.userId === item.ownerId);
        return {
          userId: item.ownerId,
          userName: userMap.get(item.ownerId) ?? item.ownerId,
          catalogId: allocation.catalogId,
          name: allocation.name,
          available: item.count,
          count: existing?.count ?? 0,
        };
      }));
    });

    setOverrides(newOverrides);
    setValidationErrors(new Map());
  };
```

- [ ] **Step 6: Update the submit button**

Replace the button at the bottom of the return JSX:

```tsx
      <button
        onClick={handleConfirm}
        disabled={validationErrors.size > 0}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-base"
      >
        Confirm Allocation →
      </button>
```

- [ ] **Step 7: Verify compile**

```bash
npx tsc --noEmit
```

Expected: errors about `onSaved` no longer existing — these will be fixed in Task 9 when `DraftHub` is updated.

- [ ] **Step 8: Commit**

```bash
git add src/pages/RegularDraftPreview.tsx
git commit -m "refactor: RegularDraftPreview passes allocation up instead of saving directly"
```

---

## Task 8: Update `RegularDraftSetup` — add `onStartChaos` callback

Currently chaos drafts call `initializeSession` and navigate internally. We need them to go through the seating step instead.

**Files:**
- Modify: `src/pages/RegularDraftSetup.tsx`

- [ ] **Step 1: Add `onStartChaos` to props interface**

Replace `RegularDraftSetupProps` (lines 24-31):

```typescript
interface RegularDraftSetupProps {
  onNext: (config: {
    players: DraftPlayer[];
    sets: PackCatalogEntry[];
    format: DraftFormat;
    packsPerPerson: number;
  }) => void;
  onStartChaos: (players: DraftPlayer[]) => void;
}
```

- [ ] **Step 2: Destructure `onStartChaos` in the component**

```typescript
export default function RegularDraftSetup({ onNext, onStartChaos }: RegularDraftSetupProps) {
```

- [ ] **Step 3: Remove `useNavigate` and `useSessionStore` imports and usages**

Remove these lines from imports:
```typescript
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../state/sessionStore';
```

Remove from the component body:
```typescript
// Remove:
const navigate = useNavigate();
const initializeSession = useSessionStore(s => s.initializeSession);
```

Keep `useInventoryStore` and `const packs = useInventoryStore(s => s.packs)` — the chaos "no packs" warning block stays in the JSX.

- [ ] **Step 4: Update `handleSubmit`**

Replace `handleSubmit`:

```typescript
  const handleSubmit = () => {
    if (isChaos) {
      const namedPlayers = players.map((p, i) => ({
        ...p,
        name: p.name.trim() || `Player ${i + 1}`,
      }));
      onStartChaos(namedPlayers);
    } else {
      onNext({ players, sets, format: format as DraftFormat, packsPerPerson });
    }
  };
```

- [ ] **Step 5: Update `canProceed`**

The old `canProceed` for chaos checked `packs.length > 0`. Replace with a player name check for chaos (same as non-chaos):

```typescript
  const canProceed = players.every(p => p.name.trim().length > 0) && (
    isChaos || (sets.length > 0 && packsPerPerson > 0)
  );
```

- [ ] **Step 6: Verify compile**

```bash
npx tsc --noEmit
```

Expected: errors about `DraftHub` not yet passing `onStartChaos` — fixed in Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RegularDraftSetup.tsx
git commit -m "refactor: chaos draft setup delegates navigation to DraftHub via onStartChaos"
```

---

## Task 9: Rewrite `DraftHub` to orchestrate all steps

**Files:**
- Modify: `src/pages/DraftHub.tsx`

- [ ] **Step 1: Replace `DraftHub.tsx` entirely**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegularDraftSetup from './RegularDraftSetup';
import RegularDraftPreview from './RegularDraftPreview';
import SeatAssignment from '../components/SeatAssignment';
import RoundMatchups from '../components/RoundMatchups';
import { useRegularDraftStore } from '../state/regularDraftStore';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import { useSessionStore } from '../state/sessionStore';
import { generateRound1Pairings, playersToSeats } from '../utils/tournamentPairings';
import type {
  PackCatalogEntry,
  DraftFormat,
  DraftPlayer,
  DraftAllocationEntry,
  TournamentPairing,
  DraftTournament,
} from '../types';

type Step = 'setup' | 'preview' | 'seating' | 'matchups' | 'saved';

interface RegularConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
}

export default function DraftHub() {
  const [step, setStep] = useState<Step>('setup');
  const [config, setConfig] = useState<RegularConfig | null>(null);
  const [chaosPlayers, setChaosPlayers] = useState<DraftPlayer[] | null>(null);
  const [pendingAllocation, setPendingAllocation] = useState<DraftAllocationEntry[] | null>(null);
  const [orderedPlayers, setOrderedPlayers] = useState<DraftPlayer[] | null>(null);
  const [round1Pairings, setRound1Pairings] = useState<TournamentPairing[] | null>(null);
  const [starting, setStarting] = useState(false);

  const navigate = useNavigate();
  const { savePreview, previewAllocations } = useRegularDraftStore();
  const { updateTournament } = useDraftHistoryStore();
  const { initializeSession, setPendingTournament } = useSessionStore();

  const handleStartChaos = (players: DraftPlayer[]) => {
    setChaosPlayers(players);
    setStep('seating');
  };

  const handlePreviewConfirmed = (allocation: DraftAllocationEntry[]) => {
    setPendingAllocation(allocation);
    setStep('seating');
  };

  const handleSeatingConfirmed = (ordered: DraftPlayer[]) => {
    setOrderedPlayers(ordered);
    setRound1Pairings(generateRound1Pairings(ordered));
    setStep('matchups');
  };

  const handleStartRound1 = async () => {
    if (!orderedPlayers || !round1Pairings) return;
    setStarting(true);
    try {
      const seats = playersToSeats(orderedPlayers);
      const tournament: DraftTournament = {
        seats,
        rounds: [{ roundNumber: 1, pairings: round1Pairings, status: 'active' }],
        currentRound: 1,
        totalRounds: 3,
        status: 'active',
      };

      if (chaosPlayers) {
        const names = orderedPlayers.map((p, i) => p.name || `Player ${i + 1}`);
        const userIds = orderedPlayers.map(p => p.userId);
        initializeSession(orderedPlayers.length, names, userIds);
        setPendingTournament(tournament);
        navigate('/draft');
      } else if (config && pendingAllocation) {
        const draftId = await savePreview(config, previewAllocations, pendingAllocation);
        await updateTournament(draftId, tournament);
        setStep('saved');
      }
    } finally {
      setStarting(false);
    }
  };

  const handleStartOver = () => {
    setStep('setup');
    setConfig(null);
    setChaosPlayers(null);
    setPendingAllocation(null);
    setOrderedPlayers(null);
    setRound1Pairings(null);
  };

  const activePlayers = chaosPlayers ?? config?.players ?? [];

  if (step === 'setup') {
    return (
      <RegularDraftSetup
        onNext={(cfg) => { setConfig(cfg); setStep('preview'); }}
        onStartChaos={handleStartChaos}
      />
    );
  }

  if (step === 'preview' && config) {
    return (
      <RegularDraftPreview
        {...config}
        onBack={() => setStep('setup')}
        onConfirmed={handlePreviewConfirmed}
      />
    );
  }

  if (step === 'seating') {
    return (
      <SeatAssignment
        players={activePlayers}
        onConfirm={handleSeatingConfirmed}
        onBack={() => chaosPlayers ? setStep('setup') : setStep('preview')}
      />
    );
  }

  if (step === 'matchups' && orderedPlayers && round1Pairings) {
    return (
      <RoundMatchups
        players={orderedPlayers}
        pairings={round1Pairings}
        onStart={handleStartRound1}
        disabled={starting}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto text-center space-y-4 py-12">
      <div className="text-4xl">✅</div>
      <h2 className="text-xl font-bold text-white">Draft Saved</h2>
      <p className="text-gray-300 text-sm">
        The draft preview has been saved. An admin can finalize it from the History tab,
        which will deduct packs from everyone's private inventories.
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => navigate('/history')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium"
        >
          View in History
        </button>
        <button
          onClick={handleStartOver}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg font-medium"
        >
          New Draft
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify clean compile**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DraftHub.tsx
git commit -m "feat: wire seating and matchup steps into DraftHub for all draft types"
```

---

## Task 10: Smoke test the full flow

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test regular draft flow**

1. Navigate to New Draft
2. Select "Regular Draft", add 4+ players (linked to accounts), add 1+ set
3. Click "Preview Allocation →"
4. Verify allocation preview loads
5. Click "Confirm Allocation →"
6. Verify `SeatAssignment` screen appears with players randomly ordered
7. Use ▲▼ buttons to reorder — verify adjacent rows swap correctly
8. Click "🎲 Re-randomize" — verify order changes
9. Click "Confirm Seats →"
10. Verify `RoundMatchups` screen shows gradient VS rows with correct pairings (seat 1 vs seat N/2+1, etc.)
11. Click "Start Round 1 →"
12. Verify "Draft Saved" screen appears
13. Go to History tab, expand the new draft — verify it has `tournament` data with seats and round 1 pairings

- [ ] **Step 3: Test odd player count (bye)**

Repeat with 5 players. Verify:
- Last player in seat list shows amber "B" badge and "(Bye)" label
- Moving that player up works correctly
- After confirming, `RoundMatchups` shows 2 VS rows and 1 amber bye row

- [ ] **Step 4: Test chaos draft flow**

1. Select "Chaos Draft", add 4 players
2. Click "Start Draft"
3. Verify `SeatAssignment` screen appears
4. Confirm seats → verify `RoundMatchups` appears
5. Click "Start Round 1 →" → verify redirects to `/draft` (wheel)
6. Complete or abandon the chaos draft, confirm session
7. Check History tab — verify the chaos draft has `tournament` field with seats and pairings

- [ ] **Step 5: Commit any fixes**

If any bugs were found and fixed during smoke testing, commit them:

```bash
git add -A
git commit -m "fix: smoke test corrections for tournament phase 1"
```
