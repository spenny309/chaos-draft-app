# Draft Tournament System — Design Spec

**Date:** 2026-04-23  
**Status:** Approved  
**Applies to:** All draft types except Team Sealed

---

## Overview

A tournament management system embedded in the existing draft creation flow. Supports seat assignment, round 1 matchups derived from seating, Swiss pairings for subsequent rounds, score tracking, and stat derivation. All state lives inside the existing `drafts/{draftId}` Firestore document.

Implementation is split into three phases:
- **Phase 1:** Seating assignment + Round 1 matchup display
- **Phase 2:** Score submission + Swiss pairing engine for rounds 2+
- **Phase 3:** Stat display and player history

---

## Data Model

All new types are added to `src/types/index.ts`. The `Draft` interface gains one new optional field: `tournament?: DraftTournament`.

### New Types

```typescript
export type TournamentStatus = 'seating' | 'active' | 'finalized';

export interface DraftSeat {
  playerId: string;   // references DraftPlayer.id
  seat: number;       // 1-N
}

export interface PairingResult {
  player1Wins: number;    // games player1 won
  player2Wins: number;    // games player2 won
  ties: number;           // drawn games
  matchWinner: 'player1' | 'player2' | 'tie';
  isPartial: boolean;     // true if match wasn't fully completed (ran out of time)
  submittedBy: string;    // userId of submitter
  submittedAt: Timestamp;
}

export interface TournamentPairing {
  id: string;
  player1Id: string;
  player2Id: string | null;  // null = bye
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
  totalRounds: number;       // default 3; admin-adjustable at any time
  status: TournamentStatus;
  finalizedAt?: Timestamp;
  finalizedBy?: string;      // userId
}
```

### Key Design Decisions

- **No pre-computed stat aggregates.** All stats (match record, game record, win rate, head-to-head) are derived at read time by scanning `tournament.rounds[].pairings[]` across all draft documents. This avoids sync problems and maximises query flexibility.
- **Byes stored as `player2Id: null`.** Clearly distinguishable from real matches. Excluded from all stat calculations at query time.
- **`isPartial` on `PairingResult`** handles the "ran out of time" case without special-casing match winner logic.
- **`tournament.status` is independent from `Draft.status`.** Pack allocation lifecycle (`preview` / `finalized`) and tournament lifecycle (`seating` / `active` / `finalized`) are tracked separately. In Phase 1, the tournament is only written to Firestore on seat confirmation (always as `'active'`); `'seating'` is reserved for a future phase where mid-seating state may need to be persisted across page refreshes.
- **`totalRounds` is mutable.** Admin can increase it or finalize early at any point.

---

## App Flow Integration

### Chaos Drafts
```
Setup → Seating → Wheel (seat order = spin order)
```
The "Start Draft" button in setup is replaced by a transition to the seating step. Once seats are confirmed and round 1 pairings are shown, navigating to `/draft` begins the wheel with players in seat order.

### Regular / Sealed / Mobius Drafts
```
Setup → Allocation Preview → Seating → Save
```
The seating step is inserted between the allocation preview and saving the draft. The draft is saved to Firestore only after seats are confirmed.

---

## Phase 1: Seating Assignment + Round 1 Display

### SeatAssignment Component

**Behaviour:**
- Players are auto-randomly assigned seats on arrival — no blank state shown
- For odd player counts, one player is randomly assigned as the bye holder (shown in amber at the bottom of the list)
- "🎲 Re-randomize" reshuffles all seats and re-randomizes the bye holder
- Up/down buttons shift a player one position, displacing the adjacent player into the vacated slot
- "Confirm Seats →" generates round 1 pairings and advances the flow

**Bye holder:**
- Displayed at the bottom of the list with an amber "B" badge instead of a seat number
- Can be repositioned with up/down buttons like any other row
- The bye holder's position in the list does not affect their pairing (they always receive the bye); it only affects visual ordering

**On confirm:**
Writes `tournament` to the draft document:
```
status: 'active'
currentRound: 1
totalRounds: 3
seats: [{ playerId, seat }]
rounds: [{ roundNumber: 1, status: 'active', pairings: [...] }]
```

### Round 1 Pairing Algorithm

Seats are split at the midpoint:
- Seat 1 vs Seat `(N/2 + 1)`
- Seat 2 vs Seat `(N/2 + 2)`
- …
- For odd counts: the bye holder is excluded before splitting; the remaining even count pairs normally

### RoundMatchups Component

Displays round 1 pairings after confirmation:
- Gradient VS rows (dark blue gradient background, purple VS badge)
- Player names only — no seat numbers shown
- Bye holder shown separately below matches: amber row, "🎟️ Bye — [Name]"
- "Start Round 1 →" CTA at the bottom

---

## Phase 2: Score Submission + Round Progression

### Score Submission UI

Each pairing in the active round gets a score entry UI:
- Player 1 wins / Player 2 wins / Ties inputs (integer fields)
- "Mark as Partial" toggle for incomplete matches
- Submit button — writes `result` to the pairing and sets `status: 'complete'`
- Either player (or admin) can submit; `submittedBy` records who did

### Round Progression

Once all pairings in the current round are complete, or an admin explicitly advances with incomplete results:
- "Generate Round N →" button appears (visible to admin always; visible to others only when all pairings are complete)
- Runs the Swiss algorithm (see below)
- Shows the generated pairings in the same seating-style UI (up/down to swap) for admin override
- Admin confirms → pairings saved, `currentRound` incremented, new round added to `rounds[]`

### Swiss Pairing Algorithm

1. Sort players by match wins (desc), with total game wins as tiebreaker
2. Walk down the sorted list, greedily pair adjacent players who haven't played each other
3. If a conflict (repeat matchup), slide one position further down and try again
4. If an odd number of unpaired players remain, the bottom eligible player gets the bye
   - Eligible = has not already received a bye this tournament
   - If all remaining players have had a bye, the bottom player gets it anyway

**Hard constraints (enforced in algorithm, not bypassable via UI):**
- No repeat matchups ever

**Soft constraints (overrideable via admin UI):**
- Same-record pairing preference
- Bye goes to the lowest-ranked player first

### Finalization

- "Finalize Tournament" button available at any time (admin only)
- Incomplete pairings in the active round are left as-is — no auto-results assigned
- Sets `tournament.status = 'finalized'`, records `finalizedAt` and `finalizedBy`
- Partial rounds are preserved in the data; stat derivation skips pairings without a `result`

---

## Phase 3: Stat Display

All stats are computed at read time from `tournament.rounds[].pairings[]` across all draft documents. Byes (`player2Id: null`) are excluded from every calculation.

### Per-Player Stats (derivable)
- Matches played, match wins, match losses, match ties → match win rate
- Games played, game wins, game losses, game ties → game win rate
- Per-opponent head-to-head record
- Per-draft breakdown

### Stat Record Rules
- A bye round: not counted as a match played in numerator or denominator
- A partial match (`isPartial: true`): counted normally using the recorded result
- Only pairings with a `result` are included in any calculation

### UI (Phase 3)
- New Stats/Leaderboard page with per-player cards
- Head-to-head lookup
- Per-draft tournament results in the Draft History expanded view

---

## Firestore Rules

No rule changes required. The existing rule allows any approved user to update any draft field except `status`, `finalizedAt`, `finalizedBy`, and `allocation`. The `tournament` field falls outside those restrictions and is writable by all approved users.

Admin-only actions (finalizing the tournament, overriding pairings) are enforced at the application layer, not the security rule layer, consistent with the existing pattern in this codebase.

---

## New Files (Phase 1)

- `src/components/SeatAssignment.tsx` — seating step UI
- `src/components/RoundMatchups.tsx` — matchup reveal display
- `src/utils/tournamentPairings.ts` — round 1 pairing logic + Swiss algorithm (stubbed in Phase 1, implemented in Phase 2)

## Modified Files (Phase 1)

- `src/types/index.ts` — new tournament types
- `src/pages/DraftHub.tsx` — add `'seating'` step
- `src/pages/RegularDraftSetup.tsx` — chaos flow routes through seating before `/draft`
- `src/state/draftHistoryStore.ts` — add `updateTournament(draftId, tournament)` action
