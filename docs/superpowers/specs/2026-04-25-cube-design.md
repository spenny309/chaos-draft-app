# Cube Support Design

## Goal

Add a shared "Cube" collection representing reusable card sets the group owns, and allow any non-chaos draft format (Regular, Mobius, Sealed, Team Sealed) to use a cube as its card source instead of drawing from per-player inventory.

## Architecture

Cubes are a new top-level Firestore collection (`cubes`). A cube is the card source for a draft — it replaces the `sets` field. The draft `type` (regular, mobius, sealed, team-sealed) is unchanged; the cube is additive via two new optional fields on `Draft`. Because cubes are reusable and shared, no inventory tracking, allocation, or pack deduction is needed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Firebase Firestore, Zustand

---

## Data Model

### New `Cube` type (`src/types/index.ts`)

```ts
export interface Cube {
  id: string;
  name: string;
  imageUrl?: string;      // iconic card art used as "pack face"
  externalUrl?: string;   // Cubecobra or Moxfield link
  createdAt: Timestamp;
  createdBy: string;
}
```

### Changes to `Draft` (`src/types/index.ts`)

Two new optional fields added to the `Draft` interface:

```ts
cubeId?: string;    // Firestore doc ID in 'cubes' collection
cubeName?: string;  // denormalized — avoids extra reads in history/tournament views
```

`sets` and `allocation` are absent on cube drafts (same as chaos drafts omit `sets`). `packsPerPerson` still applies — it controls how many packs of cube cards each player opens.

---

## Cube Management (Admin Page)

A new "Cubes" section in `src/pages/Admin.tsx`, below the existing pack catalog section.

**State:** New `src/state/cubeStore.ts` (Zustand + Firestore). Subscribes to the `cubes` collection on mount and exposes `cubes`, `loading`, `addCube`, and `deleteCube`. Follows the same pattern as `packCatalogStore`.

**UI:**
- Lists existing cubes: image thumbnail (if set), name, external link icon (if set), delete button
- Inline add form: name input (required), image URL input (optional), external URL input (optional)
- Delete with `window.confirm`, same pattern as pack catalog

---

## Draft Setup Flow

### `src/pages/RegularDraftSetup.tsx`

For non-chaos formats, the "Sets to Draft" section gains a **Sets / Cube** toggle at the top.

- **Sets selected (default):** existing `PackCatalogSearch` picker, unchanged
- **Cube selected:** replaces sets picker with a list/dropdown of cubes from `cubeStore`; selecting one stores `{ cubeId, cubeName }` in local state; sets array is cleared

`canProceed` validation:
- Sets mode: `sets.length > 0 && packsPerPerson > 0` (unchanged)
- Cube mode: `cubeId != null && packsPerPerson > 0`

The component's `onNext` callback is extended to carry `cubeId?: string` and `cubeName?: string` in the config object.

### `src/state/regularDraftStore.ts`

`RegularDraftConfig` gains:
```ts
cubeId?: string;
cubeName?: string;
```

`savePreview` gains a cube-aware path: when `cubeId` is present, write the Firestore doc with `cubeId`, `cubeName`, and `status: 'finalized'` directly (no `sets`, no `allocation`). The existing set-based path is unchanged.

### `src/pages/DraftHub.tsx`

When the config includes a `cubeId`, the **allocation preview step is skipped**. The flow becomes:

```
setup → seating → matchups (tournament) or done
```

Instead of:
```
setup → preview (allocation) → seating → matchups
```

The `handlePreviewConfirmed` branch is bypassed; after setup the hub calls `savePreview` directly (which writes a finalized cube draft) then advances to seating.

---

## History & Tournament Display

### `src/utils/draftTitle.ts`

`draftTitle()` gets a new first branch before the existing chaos/sets logic:

```ts
if (draft.cubeId && draft.cubeName) {
  const typeLabel = draft.type === 'regular'
    ? ''
    : ` ${draft.type.charAt(0).toUpperCase() + draft.type.slice(1)}`;
  return `${draft.cubeName}${typeLabel} Draft`;
}
```

This means Tournament page titles and History card headings automatically use the cube name.

### `src/pages/DraftHistory.tsx`

The expanded draft detail currently shows a "Sets" section for non-chaos drafts. This is updated to:

1. If `draft.cubeId` is set → show a "Cube" section: cube image (if present), cube name, external link icon (if present)
2. Else if `draft.sets?.length` → show existing "Sets" section (unchanged)
3. Else → show nothing

---

## Correctness Checklist

All places currently using set names to derive display text, and how each is handled:

| Location | Current behaviour | Cube behaviour |
|---|---|---|
| `draftTitle()` | derives name from `draft.sets` | new branch: uses `draft.cubeName` |
| History card heading | calls `draftTitle()` | covered by `draftTitle()` update |
| History expanded "Sets" section | renders `draft.sets` | replaced by "Cube" section when `cubeId` set |
| Tournament page `<h2>` | calls `draftTitle()` | covered by `draftTitle()` update |
| `formatDraftOption()` dropdown | calls `draftTitle()` | covered |
| `TournamentView.tsx` | no set references | no change needed |
| Player stats / archetype utilities | operate on players only | no change needed |

---

## Out of Scope

- Per-cube card list management (the app doesn't track individual cards)
- Cube ownership / per-user cube inventory
- Cube editing (name/image/URL changes after creation) — can be added later; delete + re-add covers the need for now
