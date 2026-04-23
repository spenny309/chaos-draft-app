# Tournament Dedicated Page Design

**Goal:** Move tournament management out of the History tab into a dedicated `/tournament` page with standings, a polished layout, and redirect-on-creation.

**Architecture:** A new `Tournament.tsx` page handles all active-tournament discovery (0/1/2+ concurrent logic) and specific-draft lookup via `?draft=` query param. `TournamentView.tsx` gains a standings table and compact past-round display. `DraftHistory.tsx` replaces inline `TournamentView` with a compact tournament widget. `DraftHub.tsx` and `Draft.tsx` redirect to `/tournament` after a tournament is created.

**Tech Stack:** React 19, React Router v6 (`useSearchParams`, `useNavigate`), Zustand (`useDraftHistoryStore`), Tailwind CSS, existing `computeStandings` from `src/utils/swissPairings.ts`.

---

## File Map

| Action | File |
|--------|------|
| Create | `src/pages/Tournament.tsx` |
| Modify | `src/App.tsx` |
| Modify | `src/pages/DraftHub.tsx` |
| Modify | `src/pages/Draft.tsx` |
| Modify | `src/pages/DraftHistory.tsx` |
| Modify | `src/components/TournamentView.tsx` |

---

## Route & URL Structure

- `/tournament` — the tournament hub. Reads `?draft=<draftId>` query param.
  - If `draft` param is present: finds that specific draft from the store (any tournament status) and renders its tournament.
  - If no `draft` param: collects all drafts where `draft.tournament?.status === 'active'`.
    - 0 active → `<Navigate to="/" />`
    - 1 active → renders that tournament directly, no dropdown
    - 2+ active → renders a `<select>` dropdown at the top; content re-renders for the selected tournament

The nav "Tournament" item always links to `/tournament` (no param). History's tournament widget links to `/tournament?draft=<draftId>` for both active and finalized drafts.

---

## `src/pages/Tournament.tsx` (new)

### Props / data
- Reads `drafts` from `useDraftHistoryStore`
- Reads `profile` from `useUserStore`
- Reads `?draft` query param via `useSearchParams()`

### Rendering logic

```
const draftIdParam = searchParams.get('draft');

if (draftIdParam) {
  // Specific draft lookup (from History links)
  const draft = drafts.find(d => d.id === draftIdParam);
  if (!draft?.tournament) return <Navigate to="/" />;
  selectedDraft = draft;
} else {
  // Active tournament hub
  const activeDrafts = drafts.filter(d => d.tournament?.status === 'active');
  if (activeDrafts.length === 0) return <Navigate to="/" />;
  if (activeDrafts.length === 1) selectedDraft = activeDrafts[0];
  else {
    // show dropdown, selectedDraft = activeDrafts[dropdownIndex]
  }
}
```

### Layout (matches mockup)

```
[Draft type + date + players] [status badge] [round indicator]
[Dropdown — only when 2+ active AND no ?draft param]
[TournamentView — existing component, receives draft + isAdmin + currentUserId]
```

**Header details:**
- Title: `"{Type} Draft"` (e.g., "Regular Draft")
- Metadata row: amber/blue status badge + player names joined with commas + "Apr 20" date + "Round X of Y" label
- Status badge: blue `● Active` for active, green `Finalized` for finalized
- Date format: `draft.createdAt.toDate().toLocaleDateString()`

**Dropdown (2+ active, no ?draft param only):**
- `<select>` with options formatted as `"{Type} Draft {date} — Round {X} of {Y}"`
- Controlled by local `useState<number>` index into `activeDrafts`
- Hidden when `activeDrafts.length <= 1` or when `draftIdParam` is set

### Styles (Tailwind, matching mockup)

- Page container: `max-w-2xl mx-auto`
- Header: `mb-6`
- Title: `text-2xl font-bold text-white`
- Meta row: `flex items-center gap-3 flex-wrap mt-1`
- Active badge: `text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-900/60 text-blue-400 border border-blue-700/40`
- Finalized badge: `text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-700/30`
- Players/date/round: `text-sm text-gray-400`
- Dropdown: `px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm`

---

## `src/components/TournamentView.tsx` (modify)

### Add: Standings table

Add import at top of file:
```typescript
import { computeStandings } from '../utils/swissPairings';
```
(`generateSwissPairings` is already imported from this file — extend the same import.)

Show standings when `tournament.currentRound > 1` (i.e., at least one round has been played). Render above the current-round section.

**Computation:**
```typescript
import { computeStandings } from '../utils/swissPairings';
const standings = computeStandings(players, tournament.rounds);
```

**Table layout (matches mockup):**
- Container: `bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden mb-6`
- Header row: `px-4 py-2.5 bg-gray-800/80 border-b border-gray-700/50 grid grid-cols-[24px_1fr_60px_50px] text-[10px] font-bold uppercase tracking-widest text-gray-500`
- Columns: rank # | Player | Record | Game W
- Data rows: `px-4 py-2.5 grid grid-cols-[24px_1fr_60px_50px] text-sm border-b border-gray-700/30 last:border-0`
- Rank: `text-gray-600 font-bold text-xs`
- Player name: `text-gray-200 font-semibold`
- Record: `text-gray-400 text-xs` — formatted as `"{matchWins}–{matchLosses}"`
- Game W: `text-gray-600 text-xs`

**Record computation:** For each player in standings, `matchWins` = rounds where they are the `matchWinner` side, `matchLosses` = rounds where opponent is `matchWinner`. Ties count as neither (or show as `1–0–1` if desired). Keep it simple: wins–losses only (ignore ties in record display).

Actually, compute record by iterating `tournament.rounds` for each player:
```typescript
// In standings row render
const allPairings = tournament.rounds.flatMap(r => r.pairings).filter(p => p.result && p.player2Id !== null);
const wins = allPairings.filter(p =>
  (p.player1Id === s.playerId && p.result!.matchWinner === 'player1') ||
  (p.player2Id === s.playerId && p.result!.matchWinner === 'player2')
).length;
const losses = allPairings.filter(p =>
  (p.player1Id === s.playerId && p.result!.matchWinner !== 'player1' && p.result!.matchWinner !== 'tie') ||
  (p.player2Id === s.playerId && p.result!.matchWinner !== 'player2' && p.result!.matchWinner !== 'tie')
).length;
```

### Modify: Past rounds — compact display

Past rounds (`r.roundNumber < tournament.currentRound`) currently render `<ScoreEntry>` for each pairing. Replace with compact result rows:

```tsx
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
      {playerName(pairing.player2Id!, players)}
    </span>
  </div>
)}
```

Winners are rendered in `text-white`, losers in `text-gray-500`.

---

## `src/App.tsx` (modify)

### Active tournament detection
Inside the `App` component (after `useDraftHistoryStore` is already subscribed):
```typescript
const drafts = useDraftHistoryStore(s => s.drafts);
const hasActiveTournament = drafts.some(d => d.tournament?.status === 'active');
```

### Nav item
Add between History and Admin:
```tsx
{hasActiveTournament && (
  <NavLink to="/tournament">
    <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5 relative -top-px" />
    Tournament
  </NavLink>
)}
```

### Route
Add inside `<Routes>`:
```tsx
<Route path="/tournament" element={<Tournament />} />
```

Add import: `import Tournament from './pages/Tournament';`

---

## `src/pages/DraftHub.tsx` (modify)

### Regular draft redirect

In `handleStartRound1`, in the `else if (config && pendingAllocation)` branch (lines 84–95), replace `setStep('saved')` with `navigate('/tournament')`:

```typescript
// before
const draftId = await savePreview(config, previewAllocations, pendingAllocation);
await updateTournament(draftId, tournament);
setStep('saved');

// after
const draftId = await savePreview(config, previewAllocations, pendingAllocation);
await updateTournament(draftId, tournament);
navigate('/tournament');
```

### Remove "saved" step

- Remove `'saved'` from the `Step` type union.
- Remove the `step === 'saved'` JSX block (the `<div>` with "✅ Draft Saved" and the two buttons at the bottom of the component).

`navigate` is already imported via `useNavigate()` at line 39.

---

## `src/pages/Draft.tsx` (modify)

### Chaos draft redirect after confirm

After `await confirmSession()` succeeds, check if a tournament was pending and navigate:

```typescript
// Add to imports (react-router-dom is not yet imported in Draft.tsx — add this line)
import { useNavigate } from 'react-router-dom';
// useSessionStore is already imported in Draft.tsx — no change needed

// Inside component
const navigate = useNavigate();

// In handleConfirm
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

Read `pendingTournament` from store state *before* `confirmSession()` since `confirmSession` does not clear `pendingTournament` (only `resetSession` does).

---

## `src/pages/DraftHistory.tsx` (modify)

### Remove TournamentView
- Remove `import TournamentView from '../components/TournamentView'`
- Remove the `{draft.tournament && <TournamentView ... />}` block

### Add tournament widget

Replace the removed block with a tournament widget for any draft where `draft.tournament` exists:

```tsx
{draft.tournament && (
  <TournamentWidget draft={draft} players={draft.players} />
)}
```

Define `TournamentWidget` as a component in the same file:

```tsx
function TournamentWidget({ draft }: { draft: Draft }) {
  const t = draft.tournament!;
  const isFinalized = t.status === 'finalized';

  // Compute winner for finalized tournaments
  let winnerName: string | null = null;
  if (isFinalized) {
    const standings = computeStandings(draft.players, t.rounds);
    winnerName = draft.players.find(p => p.id === standings[0]?.playerId)?.name ?? null;
  }

  return (
    <div className={`mt-6 pt-6 border-t border-gray-700/50`}>
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
              : `${t.rounds.flatMap(r => r.pairings).filter(p => p.status === 'complete' && p.player2Id !== null).length} matches complete`
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

Add import at top of file:
```typescript
import { Link } from 'react-router-dom';
import { computeStandings } from '../utils/swissPairings';
```

### Polish: history card visual improvements

Apply these changes to the expanded card body:

1. **Section labels**: Change the `<span>` labels ("Players", "Packs Drafted", "Sets") to use the class `text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block` for consistent styling.

2. **Player chips**: Change `<span className="bg-gray-700 ...">` to `<span className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm">`.

3. **Sets list**: Each set row already shows image + name + count — no structural change, just ensure the count is right-aligned (`ml-auto`).

---

## Behaviour Notes

- **Loading state**: `Tournament.tsx` reads from `useDraftHistoryStore`. If `loading` is true, render a centered spinner/text ("Loading…"). This matches the pattern used in `DraftHistory.tsx`.
- **Non-existent draft**: If `?draft=<id>` is set but no matching draft exists, `<Navigate to="/" />`.
- **Finalized tournament on `/tournament` (no param)**: The page only shows active tournaments when no param is present. Finalized ones are only reachable via `?draft=` from History. This is intentional — the nav item disappears once all tournaments are finalized.
- **Multiple concurrent active tournaments**: The dropdown `<select>` only renders when `activeDrafts.length >= 2` AND no `?draft=` param is present. Default selection is index 0 (most recently created, since drafts are ordered by `createdAt desc`).
