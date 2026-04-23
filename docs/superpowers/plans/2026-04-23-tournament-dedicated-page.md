# Tournament Dedicated Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tournament management from the History tab into a dedicated `/tournament` page with standings, polished history cards, and automatic redirect when a tournament is created.

**Architecture:** Six tasks in order. `TournamentView` gets a standings table and compact past-round display. A new `Tournament` page handles active-tournament discovery (0/1/2+ concurrent) and specific-draft lookup via `?draft=` query param. `App.tsx` gains a conditional amber-dot nav item and route. `DraftHistory.tsx` drops the inline `TournamentView` in favour of a compact widget. `DraftHub.tsx` and `Draft.tsx` navigate to `/tournament` after a tournament is saved.

**Tech Stack:** React 19, React Router v6 (`useSearchParams`, `useNavigate`, `Navigate`, `Link`), Zustand (`useDraftHistoryStore`, `useUserStore`), Tailwind CSS, `computeStandings` from `src/utils/swissPairings.ts`.

---

### Task 1: TournamentView — standings table + compact past rounds

**Files:**
- Modify: `src/components/TournamentView.tsx`

Context: `TournamentView` is at `src/components/TournamentView.tsx`. It currently renders past rounds using the full `<ScoreEntry>` component and has no standings table. We're adding a standings table (shown when `currentRound > 1`) and replacing the past-round `<ScoreEntry>` usage with compact inline result rows.

`computeStandings(players, rounds)` is exported from `src/utils/swissPairings.ts` and returns `{ playerId: string; matchWins: number; gameWins: number }[]` sorted by matchWins desc, gameWins desc.

- [ ] **Step 1: Update the swissPairings import to include `computeStandings`**

In `src/components/TournamentView.tsx`, change line 4:

```typescript
// Before
import { generateSwissPairings } from '../utils/swissPairings';

// After
import { generateSwissPairings, computeStandings } from '../utils/swissPairings';
```

- [ ] **Step 2: Add standings and record precomputation before the return statement**

In `src/components/TournamentView.tsx`, after line 28 (`const pastRounds = ...`), add:

```typescript
  const standings = tournament.currentRound > 1
    ? computeStandings(players, tournament.rounds)
    : [];

  const allResultPairings = tournament.rounds
    .flatMap(r => r.pairings)
    .filter(p => p.result != null && p.player2Id !== null);

  const recordMap = new Map(
    players.map(p => {
      const wins = allResultPairings.filter(x =>
        (x.player1Id === p.id && x.result!.matchWinner === 'player1') ||
        (x.player2Id === p.id && x.result!.matchWinner === 'player2')
      ).length;
      const losses = allResultPairings.filter(x =>
        (x.player1Id === p.id && x.result!.matchWinner === 'player2') ||
        (x.player2Id === p.id && x.result!.matchWinner === 'player1')
      ).length;
      return [p.id, { wins, losses }] as const;
    })
  );
```

- [ ] **Step 3: Add the standings table JSX**

In the JSX return, insert this block immediately after the opening `<div className="mt-6 pt-6 ...">` and before the `{/* Past rounds summary */}` comment (currently around line 99):

```tsx
      {/* Standings */}
      {standings.length > 0 && (
        <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[24px_1fr_60px_50px] px-4 py-2.5 bg-gray-800/80 border-b border-gray-700/50 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Record</span>
            <span className="text-right">GW</span>
          </div>
          {standings.map((s, i) => {
            const rec = recordMap.get(s.playerId);
            return (
              <div key={s.playerId} className="grid grid-cols-[24px_1fr_60px_50px] px-4 py-2.5 text-sm border-b border-gray-700/30 last:border-0">
                <span className="text-gray-600 font-bold text-xs">{i + 1}</span>
                <span className="text-gray-200 font-semibold">{playerName(s.playerId, players)}</span>
                <span className="text-gray-400 text-xs text-right">{rec ? `${rec.wins}–${rec.losses}` : '—'}</span>
                <span className="text-gray-600 text-xs text-right">{s.gameWins}</span>
              </div>
            );
          })}
        </div>
      )}
```

- [ ] **Step 4: Replace past-round ScoreEntry with compact result rows**

In the `{/* Past rounds summary */}` block, the inner map currently renders `<ScoreEntry>` for non-bye pairings. Replace the entire `round.pairings.map(...)` block with the compact version:

```tsx
          {round.pairings.map(pairing => (
            <div key={pairing.id}>
              {pairing.player2Id === null ? (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-2 text-xs text-amber-300">
                  🎟️ Bye — {playerName(pairing.player1Id, players)}
                </div>
              ) : (
                <div className="flex items-center text-sm bg-gray-800/50 border border-gray-700/30 rounded-lg px-3 py-2">
                  <span className={`font-semibold flex-1 ${pairing.result?.matchWinner === 'player1' ? 'text-white' : 'text-gray-500'}`}>
                    {playerName(pairing.player1Id, players)}
                  </span>
                  <span className="text-gray-600 text-xs font-mono px-3">
                    {pairing.result ? `${pairing.result.player1Wins} – ${pairing.result.player2Wins}` : '? – ?'}
                  </span>
                  <span className={`font-semibold flex-1 text-right ${pairing.result?.matchWinner === 'player2' ? 'text-white' : 'text-gray-500'}`}>
                    {playerName(pairing.player2Id, players)}
                  </span>
                </div>
              )}
            </div>
          ))}
```

- [ ] **Step 5: Verify — type check and tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TypeScript errors, all 50 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/TournamentView.tsx
git commit -m "feat: add standings table and compact past-round display to TournamentView"
```

---

### Task 2: Tournament page (new file)

**Files:**
- Create: `src/pages/Tournament.tsx`

Context: This is the new dedicated tournament page. It reads `?draft=<id>` from the URL. If present, it shows that specific draft's tournament (any status). If absent, it finds all active tournaments: 0 → redirect home, 1 → show directly, 2+ → show a dropdown. The `TournamentView` component (modified in Task 1) is reused here as the content body.

`useDraftHistoryStore` is at `src/state/draftHistoryStore.ts`. `useUserStore` is at `src/state/userStore.ts`. Both follow the Zustand `create` pattern used throughout the codebase.

- [ ] **Step 1: Create `src/pages/Tournament.tsx`**

```tsx
import { useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import { useUserStore } from '../state/userStore';
import TournamentView from '../components/TournamentView';
import type { Draft } from '../types';

function formatDraftOption(draft: Draft): string {
  const type = draft.type.charAt(0).toUpperCase() + draft.type.slice(1);
  const date = draft.createdAt?.toDate().toLocaleDateString() ?? 'Unknown date';
  const t = draft.tournament!;
  return `${type} Draft ${date} — Round ${t.currentRound} of ${t.totalRounds}`;
}

export default function Tournament() {
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get('draft');
  const { drafts, loading } = useDraftHistoryStore();
  const { profile } = useUserStore();
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
        <p className="text-gray-400 text-lg">Loading…</p>
      </div>
    );
  }

  const activeDrafts = drafts.filter(d => d.tournament?.status === 'active');

  let selectedDraft: Draft | undefined;

  if (draftIdParam) {
    const found = drafts.find(d => d.id === draftIdParam);
    if (!found || !found.tournament) return <Navigate to="/" />;
    selectedDraft = found;
  } else {
    if (activeDrafts.length === 0) return <Navigate to="/" />;
    selectedDraft = activeDrafts[Math.min(selectedIndex, activeDrafts.length - 1)]!;
  }

  const t = selectedDraft.tournament!;
  const type = selectedDraft.type.charAt(0).toUpperCase() + selectedDraft.type.slice(1);
  const date = selectedDraft.createdAt?.toDate().toLocaleDateString() ?? 'Unknown date';
  const playerNames = selectedDraft.players.map(p => p.name).join(', ');
  const isFinalized = t.status === 'finalized';
  const showDropdown = !draftIdParam && activeDrafts.length >= 2;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{type} Draft</h2>
        <div className="flex items-center gap-3 flex-wrap mt-1">
          {isFinalized ? (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-700/30">
              Finalized
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-900/60 text-blue-400 border border-blue-700/40">
              ● Active
            </span>
          )}
          <span className="text-sm text-gray-400">{playerNames}</span>
          <span className="text-sm text-gray-500">·</span>
          <span className="text-sm text-gray-400">{date}</span>
          {!isFinalized && (
            <span className="text-sm text-gray-400">· Round {t.currentRound} of {t.totalRounds}</span>
          )}
        </div>

        {showDropdown && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-gray-500">Tournament:</span>
            <select
              value={selectedIndex}
              onChange={e => setSelectedIndex(Number(e.target.value))}
              className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {activeDrafts.map((d, i) => (
                <option key={d.id} value={i}>{formatDraftOption(d)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <TournamentView
        draft={selectedDraft}
        isAdmin={profile?.role === 'admin'}
        currentUserId={profile?.uid}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify — type check and tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TypeScript errors, all 50 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Tournament.tsx
git commit -m "feat: add Tournament dedicated page with active-tournament discovery and draft lookup"
```

---

### Task 3: App.tsx — conditional nav item and route

**Files:**
- Modify: `src/App.tsx`

Context: `src/App.tsx` already imports `useDraftHistoryStore` and subscribes to individual selectors (lines 88–89). `drafts` itself is not yet subscribed to — we add that. The nav renders `<NavLink>` items; we add a conditional one between History and Admin. A new route `/tournament` is added inside `<Routes>`.

Current nav (around line 173–176):
```tsx
<NavLink to="/">Draft</NavLink>
<NavLink to="/inventory">Inventory</NavLink>
<NavLink to="/history">History</NavLink>
{isAdmin && <NavLink to="/admin">Admin</NavLink>}
```

- [ ] **Step 1: Add `Tournament` import and `drafts` subscription**

Add to the import block at the top of `src/App.tsx`:
```typescript
import Tournament from './pages/Tournament';
```

Inside the `App` function, after the existing `useDraftHistoryStore` selector calls (after line 89), add:
```typescript
  const drafts = useDraftHistoryStore(s => s.drafts);
  const hasActiveTournament = drafts.some(d => d.tournament?.status === 'active');
```

- [ ] **Step 2: Add the conditional nav item**

In the `<nav>` block, between `<NavLink to="/history">History</NavLink>` and `{isAdmin && <NavLink to="/admin">Admin</NavLink>}`, add:

```tsx
            {hasActiveTournament && (
              <NavLink to="/tournament">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5 relative -top-px" />
                Tournament
              </NavLink>
            )}
```

- [ ] **Step 3: Add the `/tournament` route**

Inside `<Routes>`, after `<Route path="/history" element={<DraftHistory />} />`, add:

```tsx
            <Route path="/tournament" element={<Tournament />} />
```

- [ ] **Step 4: Verify — type check and tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TypeScript errors, all 50 tests pass.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`, open the app, go to History, find a draft with a tournament, expand it. The `TournamentView` inline section should still be there for now (removed in Task 4). Navigate to `/tournament` directly in the address bar — if no active tournament exists in the database you'll be redirected to `/`, which is correct.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add /tournament route and conditional nav item with active-tournament detection"
```

---

### Task 4: DraftHistory.tsx — tournament widget, card polish, remove inline TournamentView

**Files:**
- Modify: `src/pages/DraftHistory.tsx`

Context: `src/pages/DraftHistory.tsx` currently renders `<TournamentView>` inline inside each expanded draft card (around line 464). We remove it, add a compact `TournamentWidget` component, and polish the section labels and player chips. `computeStandings` is already exported from `src/utils/swissPairings.ts`. `Link` comes from `react-router-dom` (not yet imported in this file).

Current section label style: `text-sm text-gray-400 uppercase tracking-wide font-semibold`
New style: `text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block`

Current player chip style: `bg-gray-700 text-gray-200 px-3 py-1 rounded-full text-sm`
New style: `bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm`

- [ ] **Step 1: Add new imports**

At the top of `src/pages/DraftHistory.tsx`, add to the existing imports:

```typescript
import { Link } from 'react-router-dom';
import { computeStandings } from '../utils/swissPairings';
```

- [ ] **Step 2: Remove TournamentView import and usage**

Remove this import line:
```typescript
import TournamentView from '../components/TournamentView';
```

Remove the usage block (around line 464–470):
```tsx
                    {draft.tournament && (
                      <TournamentView
                        draft={draft}
                        isAdmin={profile?.role === 'admin'}
                        currentUserId={profile?.uid}
                      />
                    )}
```

- [ ] **Step 3: Add the TournamentWidget component**

Add this component definition before the `export default function DraftHistory()` line:

```tsx
function TournamentWidget({ draft }: { draft: Draft }) {
  const t = draft.tournament!;
  const isFinalized = t.status === 'finalized';

  let winnerName: string | null = null;
  if (isFinalized) {
    const standings = computeStandings(draft.players, t.rounds);
    winnerName = draft.players.find(p => p.id === standings[0]?.playerId)?.name ?? null;
  }

  const matchesComplete = t.rounds
    .flatMap(r => r.pairings)
    .filter(p => p.status === 'complete' && p.player2Id !== null).length;

  return (
    <div className="mt-6 pt-6 border-t border-gray-700/50">
      <div className={`flex items-center gap-4 bg-gray-900/60 border rounded-xl p-4 ${
        isFinalized ? 'border-green-700/30' : 'border-blue-700/30'
      }`}>
        <span className="text-xl">🏆</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-200">
              {isFinalized ? 'Tournament complete' : 'Tournament in progress'}
            </span>
            {isFinalized ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-700/30">
                Finalized
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-400 border border-blue-700/40">
                Round {t.currentRound} of {t.totalRounds}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {isFinalized && winnerName
              ? `Winner: ${winnerName}`
              : `${matchesComplete} matches complete`
            }
          </p>
        </div>
        <Link
          to={`/tournament?draft=${draft.id}`}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
            isFinalized
              ? 'bg-green-900/20 text-green-400 border-green-700/30 hover:bg-green-900/40'
              : 'bg-blue-900/40 text-blue-300 border-blue-700/30 hover:bg-blue-900/60'
          }`}
        >
          {isFinalized ? 'View Results →' : 'View Tournament →'}
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add TournamentWidget usage where TournamentView was removed**

In the expanded card body, in the location where `TournamentView` was removed (between `LinkPlayersSection` and the delete button), add:

```tsx
                    {draft.tournament && (
                      <TournamentWidget draft={draft} />
                    )}
```

- [ ] **Step 5: Polish section labels — "Players"**

Change the "Players" label in the expanded card (around line 374):
```tsx
// Before
<span className="text-sm text-gray-400 uppercase tracking-wide font-semibold">
  Players
</span>

// After
<span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block">
  Players
</span>
```

- [ ] **Step 6: Polish section labels — "Packs Drafted" and "Sets"**

Change the "Packs Drafted" label (chaos section, around line 390):
```tsx
// Before
<span className="text-sm text-gray-400 uppercase tracking-wide font-semibold">
  Packs Drafted
</span>

// After
<span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block">
  Packs Drafted
</span>
```

Change the "Sets" label (non-chaos section, around line 413):
```tsx
// Before
<p className="text-gray-400 text-sm font-medium">Sets:</p>

// After
<p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Sets</p>
```

- [ ] **Step 7: Polish player chips**

Change the player chip class (around line 380):
```tsx
// Before
className="bg-gray-700 text-gray-200 px-3 py-1 rounded-full text-sm"

// After
className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm"
```

- [ ] **Step 8: Verify — type check and tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TypeScript errors, all 50 tests pass.

- [ ] **Step 9: Manual smoke test**

Run `npm run dev`. Go to History and expand a draft that has a tournament. Confirm:
- The old inline tournament UI is gone
- A tournament widget appears with "View Tournament →" or "View Results →"
- Clicking the link navigates to `/tournament?draft=<id>` and shows the tournament

- [ ] **Step 10: Commit**

```bash
git add src/pages/DraftHistory.tsx
git commit -m "feat: replace inline TournamentView with compact widget in History, polish card sections"
```

---

### Task 5: DraftHub.tsx — redirect to /tournament after regular draft creation

**Files:**
- Modify: `src/pages/DraftHub.tsx`

Context: `src/pages/DraftHub.tsx` creates regular draft tournaments in `handleStartRound1` (around line 84). Currently it sets `step` to `'saved'` and the fallback return renders "✅ Draft Saved". We replace this with `navigate('/tournament')`. `useNavigate` is already imported and `navigate` is already called at line 39/83 (for the chaos path). The `'saved'` step and its JSX are removed entirely.

- [ ] **Step 1: Replace `setStep('saved')` with `navigate('/tournament')`**

In `handleStartRound1`, in the `else if (config && pendingAllocation)` branch, change the last line of the try block:

```typescript
// Before
        const draftId = await savePreview(config, previewAllocations, pendingAllocation);
        await updateTournament(draftId, tournament);
        setStep('saved');

// After
        const draftId = await savePreview(config, previewAllocations, pendingAllocation);
        await updateTournament(draftId, tournament);
        navigate('/tournament');
```

- [ ] **Step 2: Remove `'saved'` from the Step type**

```typescript
// Before
type Step = 'setup' | 'preview' | 'seating' | 'matchups' | 'saved';

// After
type Step = 'setup' | 'preview' | 'seating' | 'matchups';
```

- [ ] **Step 3: Remove the "Draft Saved" fallback JSX**

The final `return` at the bottom of the component (around lines 160–184) currently renders the "✅ Draft Saved" screen. Replace it with `return null;` since this path is now unreachable (we always navigate away):

```tsx
// Before — the entire <div className="max-w-md mx-auto text-center..."> block

// After
  return null;
```

- [ ] **Step 4: Verify — type check and tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TypeScript errors, all 50 tests pass.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. Start a new regular draft, go through setup → preview → seating → matchups, then click "Start Round 1". Confirm you are redirected to `/tournament` and see the new Tournament page for this draft.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DraftHub.tsx
git commit -m "feat: redirect to /tournament after regular draft tournament creation"
```

---

### Task 6: Draft.tsx — redirect to /tournament after chaos draft confirm

**Files:**
- Modify: `src/pages/Draft.tsx`

Context: `src/pages/Draft.tsx` is the chaos draft page. When the user clicks "Confirm Session", `handleConfirm` calls `confirmSession()` from `useSessionStore`. `confirmSession` saves the draft (including `pendingTournament` if set) and sets `confirmed: true`. After a successful confirm, if a tournament was pending, we navigate to `/tournament`. `useSessionStore` is already imported in this file (line 10). `react-router-dom` is NOT currently imported — we add `useNavigate`.

`pendingTournament` is read from `useSessionStore.getState()` (direct Zustand store access, valid outside React render). We read it BEFORE calling `confirmSession()` because `confirmSession` does not clear `pendingTournament` — but reading it before ensures correctness regardless of future store changes.

- [ ] **Step 1: Add `useNavigate` import**

At the top of `src/pages/Draft.tsx`, add:
```typescript
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Add `navigate` hook inside the component**

Inside the `Draft` component function, after the existing `useSessionStore` destructuring (around line 139), add:
```typescript
  const navigate = useNavigate();
```

- [ ] **Step 3: Update `handleConfirm` to redirect when a tournament was pending**

Replace the existing `handleConfirm` function (around lines 441–449):

```typescript
// Before
  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await confirmSession();
    } catch (error) {
      console.error("Error saving draft:", error);
    } finally {
      setIsConfirming(false);
    }
  };

// After
  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const hadTournament = !!useSessionStore.getState().pendingTournament;
      await confirmSession();
      if (hadTournament) {
        navigate('/tournament');
      }
    } catch (error) {
      console.error("Error saving draft:", error);
    } finally {
      setIsConfirming(false);
    }
  };
```

- [ ] **Step 4: Verify — type check and tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TypeScript errors, all 50 tests pass.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. Start a chaos draft with seating configured (go through the full DraftHub → seating → matchups → confirm flow so a `pendingTournament` is set). Complete the chaos draft picks and click "Confirm Session". Confirm you are redirected to `/tournament` and see the Tournament page. If no tournament was pending (a chaos draft started without going through the matchup step), confirm the page stays on the "🎉 Draft Complete!" view as before.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Draft.tsx
git commit -m "feat: redirect to /tournament after chaos draft confirm when tournament is pending"
```
