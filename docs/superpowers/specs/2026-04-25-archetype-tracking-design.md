# Archetype Tracking — Design Spec

**Date:** 2026-04-25
**Status:** Approved

## Overview

Players can record the color archetype they drafted in any draft (chaos, regular, sealed, etc.). Each player sets their own; admins can set anyone's. Archetypes are displayed in the DraftHistory player chips and in the Tournament standings table.

---

## Data Model

### New type

```ts
// src/types/index.ts
export type MtgColor = 'W' | 'U' | 'B' | 'R' | 'G';
```

### DraftPlayer extension

```ts
export interface DraftPlayer {
  id: string;
  name: string;
  userId: string | null;
  primaryColors?: MtgColor[];  // sorted WUBRG order
  splashColors?: MtgColor[];   // sorted WUBRG order, disjoint from primaryColors
}
```

Both fields are optional. Absence means the player has not recorded an archetype. Empty arrays are not valid — an archetype with no primary colors should be stored as `undefined`/absent.

Colors are always stored in canonical WUBRG order: W before U before B before R before G.

### Store action

```ts
// draftHistoryStore
setPlayerArchetype(
  draftId: string,
  playerId: string,
  primary: MtgColor[],
  splash: MtgColor[]
): Promise<void>
```

Uses the same full-array-rewrite pattern as `linkDraftPlayers`: loads the current `players` array, updates the matching player entry, and calls `updateDoc` with the full array.

---

## Archetype Utility (`src/utils/archetypes.ts`)

Pure module — no side effects, no imports from Firebase or stores.

### `getArchetypeName(primary: MtgColor[]): string`

Maps a sorted array of primary colors to the canonical archetype name. Returns `""` for an empty array.

| Colors | Name |
|--------|------|
| W | Mono-White |
| U | Mono-Blue |
| B | Mono-Black |
| R | Mono-Red |
| G | Mono-Green |
| W U | Azorius |
| W B | Orzhov |
| W R | Boros |
| W G | Selesnya |
| U B | Dimir |
| U R | Izzet |
| U G | Simic |
| B R | Rakdos |
| B G | Golgari |
| R G | Gruul |
| W U B | Esper |
| W U R | Jeskai |
| W U G | Bant |
| W B R | Mardu |
| W B G | Abzan |
| W R G | Naya |
| U B R | Grixis |
| U B G | Sultai |
| U R G | Temur |
| B R G | Jund |
| W U B R | Yore-Tiller |
| U B R G | Glint-Eye |
| W B R G | Dune-Brood |
| W U R G | Ink-Treader |
| W U B G | Witch-Maw |
| W U B R G | WUBRG |

Any unrecognized combination (e.g. a future edge case) falls back to joining the color letters: `"WUB"`.

### `formatArchetype(primary: MtgColor[], splash: MtgColor[]): string`

Produces the full display string. Returns `""` if `primary` is empty.

Examples:
- `(['R','W'], [])` → `"Boros"`
- `(['W','U'], ['B'])` → `"Azorius +B"`
- `(['B','R','G'], ['W','U'])` → `"Jund +W +U"`

Splash tokens are appended in WUBRG order, each as `+X`.

---

## DraftHistory Page

### Player chips

The existing player chip `<span>` becomes a button for players the current user may edit, and a plain `<span>` otherwise.

**Display (archetype set):**
```
Spencer · Azorius +B
```
**Display (archetype not set):**
```
Spencer
```
No pips, no "not set" label. The separator ` · ` and archetype name are only rendered when `formatArchetype(...)` returns a non-empty string.

Chips that the current user may edit (own player, or admin for any player) have a subtle blue border (`border-blue-800`) and pointer cursor. Clicking opens the inline editor for that player.

### Inline editor

Lives directly below the chips row, within the Players section. Renders a row per editable player (regular users: one row for themselves; admin: one row per player in the draft).

**Color picker:** Five pips in a row (W U B R G), each cycling through three states on click:
- **Off** — greyed out, no ring
- **Primary** — full color, blue outer ring
- **Splash** — full color, purple outer ring, slightly dimmed (opacity ~0.75)

Cycling rules:
- Off → Primary
- Primary → Splash (unless that would make it both primary and splash — impossible in the three-state model since each pip is in one state)
- Splash → Off

The archetype name preview (`"Azorius +B"`) updates live as the user toggles pips.

**Buttons:** Save (always enabled while editor is open) and Cancel (reverts to last saved state). If the archetype was unset when the editor opened, Cancel closes the editor and leaves the archetype unset.

Saving with no primary colors selected clears the archetype entirely (`primaryColors` and `splashColors` both removed from the player entry). Splash colors with no primary colors are not a valid state — if all primary pips are cycled off, any splash selections are also cleared.

### Editor auto-open rules

| Situation | Editor default |
|---|---|
| Current user's archetype is not set | Open automatically |
| Current user's archetype is already set | Closed; click own chip to open |
| Admin, own archetype not set | Open automatically for own row only |
| Admin, someone else's archetype not set | Closed; click their chip to open |
| User is not a player in this draft | No editor shown |
| Player has no linked `userId` | Admin-only: chip is clickable for admin, not for regular users |

### Section order in expanded draft card (updated)

1. Players (chips + inline archetype editor)
2. Tournament widget
3. Packs Drafted / Sets
4. Restock alert
5. Finalize Draft button (admin)
6. Link Players to Accounts (admin)
7. Delete button

---

## Tournament Page — Standings Table

The `Player` column gets a secondary line below the player name showing the archetype string. If no archetype is set, the row remains single-line.

```
# | Player          | Record | GW
1 | Markus          | 3 – 0  | 6
  | Boros           |        |
2 | Spencer         | 2 – 1  | 4
  | Azorius +B      |        |
3 | Alice           | 0 – 3  | 1
  | (no archetype)  |        |   ← row just shows "Alice", nothing below
```

The archetype text is styled `text-xs text-gray-600` to visually subordinate it to the player name. The matchup cards in past rounds and the current round are unchanged.

---

## Stats Page

No changes in this iteration. The archetype data is on `DraftPlayer` and will be available when archetype breakdown stats are added later. At that point `PlayerDraftResult` can be extended with `archetype?: string` and a new breakdown view added.

---

## Files Touched

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `MtgColor` type; extend `DraftPlayer` |
| `src/utils/archetypes.ts` | New file: `getArchetypeName`, `formatArchetype` |
| `src/state/draftHistoryStore.ts` | Add `setPlayerArchetype` action |
| `src/pages/DraftHistory.tsx` | Update Players section with archetype chips + inline editor; reorder sections |
| `src/components/TournamentView.tsx` | Add archetype secondary line to standings table |

No new pages, no new routes, no Firestore schema migration needed (new fields are optional).
