# Archetype Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players record the Magic color archetype they drafted, display it in History chips and Tournament standings, and store the data on `DraftPlayer` for future stats use.

**Architecture:** `MtgColor` and extended `DraftPlayer` types live in `src/types/index.ts`. Pure archetype name/format logic lives in `src/utils/archetypes.ts`. A new `setPlayerArchetype` store action rewrites the players array (same pattern as `linkDraftPlayers`). A new `PlayersWithArchetype` component in `DraftHistory.tsx` replaces the plain chip list. `TournamentView.tsx` gains a secondary archetype line in the standings table.

**Tech Stack:** React 19, TypeScript, Zustand, Firebase Firestore, Tailwind CSS v4, Vitest

---

### Task 1: Add types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `MtgColor` and extend `DraftPlayer`**

Open `src/types/index.ts`. After the existing imports, add `MtgColor` and extend `DraftPlayer`:

```ts
export type MtgColor = 'W' | 'U' | 'B' | 'R' | 'G';
```

Then change `DraftPlayer` from:

```ts
export interface DraftPlayer {
  id: string;
  name: string;
  userId: string | null;
}
```

to:

```ts
export interface DraftPlayer {
  id: string;
  name: string;
  userId: string | null;
  primaryColors?: MtgColor[];
  splashColors?: MtgColor[];
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors (the new fields are optional so existing code is unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add MtgColor type and archetype fields to DraftPlayer"
```

---

### Task 2: Archetype utility with TDD

**Files:**
- Create: `src/utils/archetypes.ts`
- Create: `src/utils/__tests__/archetypes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/archetypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sortColors, getArchetypeName, formatArchetype } from '../archetypes';
import type { MtgColor } from '../../types';

describe('sortColors', () => {
  it('sorts into WUBRG order', () => {
    expect(sortColors(['G', 'W', 'R'])).toEqual(['W', 'R', 'G']);
    expect(sortColors(['B', 'U', 'G', 'W', 'R'])).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  it('handles already-sorted input', () => {
    expect(sortColors(['W', 'U'])).toEqual(['W', 'U']);
  });

  it('returns empty array for empty input', () => {
    expect(sortColors([])).toEqual([]);
  });
});

describe('getArchetypeName', () => {
  it('returns empty string for no colors', () => {
    expect(getArchetypeName([])).toBe('');
  });

  it('returns mono-color names', () => {
    expect(getArchetypeName(['W'])).toBe('Mono-White');
    expect(getArchetypeName(['U'])).toBe('Mono-Blue');
    expect(getArchetypeName(['B'])).toBe('Mono-Black');
    expect(getArchetypeName(['R'])).toBe('Mono-Red');
    expect(getArchetypeName(['G'])).toBe('Mono-Green');
  });

  it('returns two-color guild names regardless of input order', () => {
    expect(getArchetypeName(['W', 'U'])).toBe('Azorius');
    expect(getArchetypeName(['R', 'W'])).toBe('Boros');
    expect(getArchetypeName(['U', 'W'])).toBe('Azorius');
    expect(getArchetypeName(['W', 'B'])).toBe('Orzhov');
    expect(getArchetypeName(['W', 'G'])).toBe('Selesnya');
    expect(getArchetypeName(['U', 'B'])).toBe('Dimir');
    expect(getArchetypeName(['U', 'R'])).toBe('Izzet');
    expect(getArchetypeName(['U', 'G'])).toBe('Simic');
    expect(getArchetypeName(['B', 'R'])).toBe('Rakdos');
    expect(getArchetypeName(['B', 'G'])).toBe('Golgari');
    expect(getArchetypeName(['R', 'G'])).toBe('Gruul');
  });

  it('returns three-color shard/wedge names', () => {
    expect(getArchetypeName(['W', 'U', 'B'])).toBe('Esper');
    expect(getArchetypeName(['W', 'U', 'R'])).toBe('Jeskai');
    expect(getArchetypeName(['W', 'U', 'G'])).toBe('Bant');
    expect(getArchetypeName(['W', 'B', 'R'])).toBe('Mardu');
    expect(getArchetypeName(['W', 'B', 'G'])).toBe('Abzan');
    expect(getArchetypeName(['W', 'R', 'G'])).toBe('Naya');
    expect(getArchetypeName(['U', 'B', 'R'])).toBe('Grixis');
    expect(getArchetypeName(['U', 'B', 'G'])).toBe('Sultai');
    expect(getArchetypeName(['U', 'R', 'G'])).toBe('Temur');
    expect(getArchetypeName(['B', 'R', 'G'])).toBe('Jund');
  });

  it('returns four-color names', () => {
    expect(getArchetypeName(['W', 'U', 'B', 'R'])).toBe('Yore-Tiller');
    expect(getArchetypeName(['U', 'B', 'R', 'G'])).toBe('Glint-Eye');
    expect(getArchetypeName(['W', 'B', 'R', 'G'])).toBe('Dune-Brood');
    expect(getArchetypeName(['W', 'U', 'R', 'G'])).toBe('Ink-Treader');
    expect(getArchetypeName(['W', 'U', 'B', 'G'])).toBe('Witch-Maw');
  });

  it('returns WUBRG for five-color', () => {
    expect(getArchetypeName(['W', 'U', 'B', 'R', 'G'])).toBe('WUBRG');
  });
});

describe('formatArchetype', () => {
  it('returns empty string when primary is empty', () => {
    expect(formatArchetype([], [])).toBe('');
    expect(formatArchetype([], ['B'])).toBe('');
  });

  it('returns just the name when no splash', () => {
    expect(formatArchetype(['W', 'R'], [])).toBe('Boros');
    expect(formatArchetype(['B', 'R', 'G'], [])).toBe('Jund');
  });

  it('appends a single splash color', () => {
    expect(formatArchetype(['W', 'U'], ['B'])).toBe('Azorius +B');
  });

  it('appends multiple splash colors in WUBRG order', () => {
    expect(formatArchetype(['B', 'R', 'G'], ['W', 'U'])).toBe('Jund +W +U');
    expect(formatArchetype(['B', 'R', 'G'], ['U', 'W'])).toBe('Jund +W +U');
  });

  it('handles unsorted primary input', () => {
    expect(formatArchetype(['U', 'W'], ['B'])).toBe('Azorius +B');
    expect(formatArchetype(['G', 'B', 'R'], [])).toBe('Jund');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/utils/__tests__/archetypes.test.ts
```

Expected: FAIL — `archetypes.ts` does not exist yet.

- [ ] **Step 3: Implement the utility**

Create `src/utils/archetypes.ts`:

```ts
import type { MtgColor } from '../types';

const COLOR_ORDER: MtgColor[] = ['W', 'U', 'B', 'R', 'G'];

const ARCHETYPE_NAMES: Record<string, string> = {
  W: 'Mono-White',
  U: 'Mono-Blue',
  B: 'Mono-Black',
  R: 'Mono-Red',
  G: 'Mono-Green',
  WU: 'Azorius',
  WB: 'Orzhov',
  WR: 'Boros',
  WG: 'Selesnya',
  UB: 'Dimir',
  UR: 'Izzet',
  UG: 'Simic',
  BR: 'Rakdos',
  BG: 'Golgari',
  RG: 'Gruul',
  WUB: 'Esper',
  WUR: 'Jeskai',
  WUG: 'Bant',
  WBR: 'Mardu',
  WBG: 'Abzan',
  WRG: 'Naya',
  UBR: 'Grixis',
  UBG: 'Sultai',
  URG: 'Temur',
  BRG: 'Jund',
  WUBR: 'Yore-Tiller',
  UBRG: 'Glint-Eye',
  WBRG: 'Dune-Brood',
  WURG: 'Ink-Treader',
  WUBG: 'Witch-Maw',
  WUBRG: 'WUBRG',
};

export function sortColors(colors: MtgColor[]): MtgColor[] {
  return [...colors].sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
}

export function getArchetypeName(primary: MtgColor[]): string {
  if (primary.length === 0) return '';
  const key = sortColors(primary).join('');
  return ARCHETYPE_NAMES[key] ?? key;
}

export function formatArchetype(primary: MtgColor[], splash: MtgColor[]): string {
  const name = getArchetypeName(primary);
  if (!name) return '';
  if (splash.length === 0) return name;
  const splashStr = sortColors(splash).map(c => `+${c}`).join(' ');
  return `${name} ${splashStr}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/utils/__tests__/archetypes.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/archetypes.ts src/utils/__tests__/archetypes.test.ts
git commit -m "feat: add archetypes utility with color name mapping and format helpers"
```

---

### Task 3: Store action

**Files:**
- Modify: `src/state/draftHistoryStore.ts`

- [ ] **Step 1: Add `setPlayerArchetype` to the store interface**

In `src/state/draftHistoryStore.ts`, update the import at the top to include `MtgColor` and `DraftPlayer`:

```ts
import type { Draft, DraftPlayer, MtgColor, PairingResult, TournamentPairing, TournamentRound } from '../types';
```

Then add `sortColors` to the archetypes import (add this after the existing imports):

```ts
import { sortColors } from '../utils/archetypes';
```

Add `setPlayerArchetype` to the `DraftHistoryState` interface:

```ts
setPlayerArchetype: (draftId: string, playerId: string, primary: MtgColor[], splash: MtgColor[]) => Promise<void>;
```

- [ ] **Step 2: Implement the action**

Add the implementation inside the `create(...)` call, after `finalizeTournament`:

```ts
setPlayerArchetype: async (draftId, playerId, primary, splash) => {
  const draft = get().drafts.find(d => d.id === draftId);
  if (!draft) return;

  const sortedPrimary = sortColors(primary);
  const sortedSplash = sortColors(splash);

  const updatedPlayers: DraftPlayer[] = draft.players.map(p => {
    if (p.id !== playerId) return p;
    if (sortedPrimary.length === 0) {
      return { id: p.id, name: p.name, userId: p.userId };
    }
    return {
      ...p,
      primaryColors: sortedPrimary,
      ...(sortedSplash.length > 0 ? { splashColors: sortedSplash } : {}),
    };
  });

  await updateDoc(doc(db, 'drafts', draftId), { players: updatedPlayers });
  set(state => ({
    drafts: state.drafts.map(d =>
      d.id === draftId ? { ...d, players: updatedPlayers } : d,
    ),
  }));
},
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/state/draftHistoryStore.ts
git commit -m "feat: add setPlayerArchetype store action"
```

---

### Task 4: DraftHistory — archetype chips, inline editor, section reorder

**Files:**
- Modify: `src/pages/DraftHistory.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/pages/DraftHistory.tsx`, add the `formatArchetype` import after the existing imports:

```ts
import { formatArchetype } from '../utils/archetypes';
```

Then find the existing types import line:

```ts
import type { Draft, DraftPackRef, DraftPlayer } from "../types";
```

And add `MtgColor` to it:

```ts
import type { Draft, DraftPackRef, DraftPlayer, MtgColor } from "../types";
```

- [ ] **Step 2: Add pip helpers before the existing component definitions**

Insert the following block near the top of the file, before the `typeBadgeColors` constant:

```ts
const ALL_COLORS: MtgColor[] = ['W', 'U', 'B', 'R', 'G'];

type PipValue = 'off' | 'primary' | 'splash';
type PipState = Record<MtgColor, PipValue>;

const PIP_STYLE: Record<MtgColor, string> = {
  W: 'bg-amber-100 text-amber-900',
  U: 'bg-blue-700 text-blue-100',
  B: 'bg-gray-800 text-gray-400 border border-gray-600',
  R: 'bg-red-700 text-red-100',
  G: 'bg-green-800 text-green-100',
};

function initPipState(player: DraftPlayer): PipState {
  const s = { W: 'off', U: 'off', B: 'off', R: 'off', G: 'off' } as PipState;
  for (const c of player.primaryColors ?? []) s[c] = 'primary';
  for (const c of player.splashColors ?? []) s[c] = 'splash';
  return s;
}

const EMPTY_PIPS: PipState = { W: 'off', U: 'off', B: 'off', R: 'off', G: 'off' };
```

- [ ] **Step 3: Add the `PlayersWithArchetype` component**

Insert this component after `initPipState`/`EMPTY_PIPS` and before `RestockAlert`:

```tsx
interface PlayersWithArchetypeProps {
  draft: Draft;
  currentUserId: string | undefined;
  isAdmin: boolean;
  setPlayerArchetype: (draftId: string, playerId: string, primary: MtgColor[], splash: MtgColor[]) => Promise<void>;
}

function PlayersWithArchetype({ draft, currentUserId, isAdmin, setPlayerArchetype }: PlayersWithArchetypeProps) {
  const myPlayer = draft.players.find(p => p.userId === currentUserId) ?? null;

  const canEdit = (playerId: string) =>
    isAdmin || myPlayer?.id === playerId;

  const autoOpenPlayer =
    myPlayer && (!myPlayer.primaryColors || myPlayer.primaryColors.length === 0)
      ? myPlayer
      : null;

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(
    autoOpenPlayer?.id ?? null,
  );
  const [pips, setPips] = useState<PipState>(
    autoOpenPlayer ? initPipState(autoOpenPlayer) : EMPTY_PIPS,
  );
  const [saving, setSaving] = useState(false);

  const openEditor = (player: DraftPlayer) => {
    setPips(initPipState(player));
    setEditingPlayerId(player.id);
  };

  const handleChipClick = (player: DraftPlayer) => {
    if (!canEdit(player.id)) return;
    if (editingPlayerId === player.id) {
      setEditingPlayerId(null);
    } else {
      openEditor(player);
    }
  };

  const cyclePip = (color: MtgColor) => {
    setPips(prev => {
      const cur = prev[color];
      const next: PipValue = cur === 'off' ? 'primary' : cur === 'primary' ? 'splash' : 'off';
      return { ...prev, [color]: next };
    });
  };

  const handleSave = async (playerId: string) => {
    setSaving(true);
    const primary = ALL_COLORS.filter(c => pips[c] === 'primary');
    const splash = ALL_COLORS.filter(c => pips[c] === 'splash');
    await setPlayerArchetype(draft.id, playerId, primary, splash);
    setSaving(false);
    setEditingPlayerId(null);
  };

  const editingPlayer = editingPlayerId
    ? (draft.players.find(p => p.id === editingPlayerId) ?? null)
    : null;

  const previewArch = editingPlayer
    ? formatArchetype(
        ALL_COLORS.filter(c => pips[c] === 'primary'),
        ALL_COLORS.filter(c => pips[c] === 'splash'),
      )
    : '';

  return (
    <div className="mb-4">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block">
        Players
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {draft.players.map(player => {
          const arch = formatArchetype(player.primaryColors ?? [], player.splashColors ?? []);
          const editable = canEdit(player.id);
          const isEditing = editingPlayerId === player.id;
          return (
            <button
              key={player.id}
              onClick={() => handleChipClick(player)}
              disabled={!editable}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors
                ${editable ? 'cursor-pointer' : 'cursor-default'}
                ${isEditing
                  ? 'bg-gray-800 border-blue-700 text-gray-200'
                  : editable
                    ? 'bg-gray-800 border-blue-900 text-gray-300 hover:border-blue-700'
                    : 'bg-gray-800 border-gray-700 text-gray-300'
                }`}
            >
              <span>{player.name}</span>
              {arch && (
                <>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-gray-400 text-xs">{arch}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {editingPlayer && (
        <div className="mt-3 bg-gray-900/60 border border-gray-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 text-sm w-20 shrink-0">{editingPlayer.name}</span>
            <div className="flex gap-1.5">
              {ALL_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => cyclePip(color)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${PIP_STYLE[color]}
                    ${pips[color] === 'off' ? 'opacity-25' : ''}
                    ${pips[color] === 'primary' ? 'ring-2 ring-offset-1 ring-offset-gray-900 ring-blue-400' : ''}
                    ${pips[color] === 'splash' ? 'ring-2 ring-offset-1 ring-offset-gray-900 ring-purple-500 opacity-75' : ''}
                  `}
                >
                  {color}
                </button>
              ))}
            </div>
            {previewArch && (
              <span className="text-gray-500 text-xs ml-1">{previewArch}</span>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleSave(editingPlayer.id)}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditingPlayerId(null)}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add `setPlayerArchetype` to the store destructuring**

In the `DraftHistory` function body, find the existing `useDraftHistoryStore` destructuring:

```ts
const { drafts, loading, error, deleteDraft, markRestockComplete, loadDrafts, linkDraftPlayers } =
  useDraftHistoryStore();
```

Replace it with:

```ts
const { drafts, loading, error, deleteDraft, markRestockComplete, loadDrafts, linkDraftPlayers, setPlayerArchetype } =
  useDraftHistoryStore();
```

- [ ] **Step 5: Replace the expanded card content with the new order**

Inside the `filtered.map((draft) => { ... })` block, find the entire expanded section — the block starting with:

```tsx
{expandedDraftId === draft.id && (
  <div className="mt-6 pt-6 border-t border-gray-700 animate-in fade-in duration-500">
    <div className="mb-4">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block">
        Players
      </span>
```

Replace the entire expanded section (from `{expandedDraftId === draft.id && (` through its closing `)}`) with:

```tsx
{expandedDraftId === draft.id && (
  <div className="mt-6 pt-6 border-t border-gray-700 animate-in fade-in duration-500">
    <PlayersWithArchetype
      draft={draft}
      currentUserId={profile?.uid}
      isAdmin={profile?.role === 'admin'}
      setPlayerArchetype={setPlayerArchetype}
    />

    {draft.tournament && (
      <TournamentWidget draft={draft} />
    )}

    {draft.type === 'chaos' && draft.packsSelectedOrder && (() => {
      const numPlayers = draft.players.length;
      const byPlayer = draft.players.map((player, pi) => ({
        player,
        packs: draft.packsSelectedOrder!.filter((_, i) => i % numPlayers === pi),
      }));
      return (
        <div className="mb-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-2">
            Packs Drafted
          </span>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {byPlayer.map(({ player, packs }) => (
              <div key={player.id}>
                <p className="text-xs font-semibold text-gray-400 mb-2 truncate">{player.name}</p>
                <div className="flex flex-wrap gap-2">
                  {packs.map((pack, idx) => (
                    <button
                      key={`${pack.id}-${idx}`}
                      onClick={() => setSelectedPack(pack)}
                      className="focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-md"
                    >
                      <img
                        src={pack.imageUrl}
                        alt={pack.name}
                        title={pack.name}
                        className="w-20 h-28 rounded-md object-cover border-2 border-gray-600 transition-all hover:border-blue-400"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    })()}

    {draft.type !== 'chaos' && draft.sets && (
      <div className="space-y-2 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Sets</p>
        {draft.sets.map(s => (
          <div key={s.catalogId} className="flex items-center gap-2 text-sm text-gray-300">
            <img src={s.imageUrl} alt={s.name} className="w-5 h-6 object-cover rounded" />
            <span>{s.name}</span>
            <span className="text-gray-500">({s.totalNeeded} packs)</span>
          </div>
        ))}
        {draft.allocation && draft.allocation.length > 0 && (
          <div className="mt-3">
            <p className="text-gray-400 text-sm font-medium mb-1">Allocation:</p>
            {draft.allocation.map((a, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-300">
                <span>{a.userName} — {a.name}</span>
                <span className="font-semibold">{a.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {!inventoryLoading && (
      <RestockAlert
        draft={draft}
        inventoryMap={inventoryMap}
        inventoryLoading={inventoryLoading}
        markRestockComplete={markRestockComplete}
      />
    )}

    {profile?.role === 'admin' && draft.status === 'preview' && draft.type !== 'chaos' && (
      <button
        onClick={() => handleFinalize(draft)}
        disabled={finalizing === draft.id}
        className="mt-3 w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
      >
        {finalizing === draft.id ? 'Finalizing…' : 'Finalize Draft'}
      </button>
    )}

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
        className="bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600 transition-colors"
      >
        Delete Draft{(draft.type === 'chaos' || (draft.status === 'finalized' && draft.allocation?.length)) ? ' & Revert Inventory' : ''}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Start the dev server and manually verify**

```bash
npm run dev
```

Open the app and expand a draft card. Verify:
- Player chips display names only (no archetype until one is saved)
- If you are a player with no archetype set, the pip editor opens automatically
- Clicking a pip cycles: off (dimmed) → primary (blue ring) → splash (purple ring, slightly dimmed) → off
- A live archetype name preview appears to the right of the pips (e.g. "Azorius +B")
- Save persists the archetype and closes the editor; the chip now shows "Name · Archetype"
- Cancel closes the editor without saving
- Clicking your chip (when archetype is set) reopens the editor pre-loaded with your current selection
- Players you cannot edit have no visible hover state or cursor change
- Tournament widget now appears directly below the Players section (above Packs/Sets)
- Section order: Players → Tournament → Packs/Sets → Restock → Admin tools → Delete

- [ ] **Step 8: Commit**

```bash
git add src/pages/DraftHistory.tsx
git commit -m "feat: add archetype chips and inline editor to DraftHistory players section"
```

---

### Task 5: Tournament standings archetype

**Files:**
- Modify: `src/components/TournamentView.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/TournamentView.tsx`, add:

```ts
import { formatArchetype } from '../utils/archetypes';
```

- [ ] **Step 2: Add a `playerArchetype` helper alongside the existing `playerName` helper**

After the existing `playerName` function (line 14–16), add:

```ts
function playerArchetype(id: string, players: DraftPlayer[]): string {
  const p = players.find(pl => pl.id === id);
  if (!p) return '';
  return formatArchetype(p.primaryColors ?? [], p.splashColors ?? []);
}
```

- [ ] **Step 3: Update the standings rows**

Find the standings `{standings.map(...)}` block. The current row JSX is:

```tsx
<div key={s.playerId} className="grid grid-cols-[24px_1fr_60px_50px] px-4 py-2.5 text-sm border-b border-gray-700/30 last:border-0">
  <span className="text-gray-600 font-bold text-xs">{i + 1}</span>
  <span className="text-gray-200 font-semibold">{playerName(s.playerId, players)}</span>
  <span className="text-gray-400 text-xs text-right">{s.matchTies > 0 ? `${s.matchWins} – ${s.matchLosses} – ${s.matchTies}` : `${s.matchWins} – ${s.matchLosses}`}</span>
  <span className="text-gray-600 text-xs text-right">{s.gameWins}</span>
</div>
```

Replace it with:

```tsx
<div key={s.playerId} className="grid grid-cols-[24px_1fr_60px_50px] px-4 py-2.5 text-sm border-b border-gray-700/30 last:border-0 items-start">
  <span className="text-gray-600 font-bold text-xs pt-0.5">{i + 1}</span>
  <div>
    <div className="text-gray-200 font-semibold">{playerName(s.playerId, players)}</div>
    {playerArchetype(s.playerId, players) && (
      <div className="text-xs text-gray-600 mt-0.5">{playerArchetype(s.playerId, players)}</div>
    )}
  </div>
  <span className="text-gray-400 text-xs text-right pt-0.5">{s.matchTies > 0 ? `${s.matchWins} – ${s.matchLosses} – ${s.matchTies}` : `${s.matchWins} – ${s.matchLosses}`}</span>
  <span className="text-gray-600 text-xs text-right pt-0.5">{s.gameWins}</span>
</div>
```

- [ ] **Step 4: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Navigate to a finalized tournament (`/tournament?draft=<id>`). Verify:
- Players who have an archetype set show the name as a small secondary line below their name in the standings table (e.g. "Markus" on one line, "Boros" on the line below in muted gray)
- Players without an archetype show just their name — no secondary line, no empty space
- Matchup cards in past rounds are unchanged

- [ ] **Step 6: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/TournamentView.tsx
git commit -m "feat: show archetype as secondary line in tournament standings"
```
