# Cube Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared Cube collection and allow any non-chaos draft format to use a cube as its card source, skipping inventory allocation entirely.

**Architecture:** Cubes are a new top-level Firestore collection. The draft `type` (regular/mobius/sealed/team-sealed) is unchanged — a cube is the card source, tracked via `cubeId`/`cubeName`/`cubeImageUrl`/`cubeExternalUrl` fields denormalized onto the `Draft` document. Cube drafts skip the allocation preview step and are saved as `status: 'finalized'` immediately. Display sites (`draftTitle`, History, Tournament) check for `cubeId` before falling back to set-name logic.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Firebase Firestore, Zustand, Vitest

---

## File Map

| Status | File | Change |
|--------|------|--------|
| Modify | `src/types/index.ts` | Add `Cube` interface; add 4 cube fields to `Draft` |
| Create | `src/utils/__tests__/draftTitle.test.ts` | Tests for cube + existing cases |
| Modify | `src/utils/draftTitle.ts` | Add cube branch before chaos/sets logic |
| Create | `src/state/cubeStore.ts` | Zustand store: load/add/delete cubes |
| Modify | `src/pages/Admin.tsx` | Add `'cubes'` tab + `CubeManagement` component |
| Modify | `src/pages/RegularDraftSetup.tsx` | Sets/Cube source toggle + cube picker |
| Modify | `src/state/regularDraftStore.ts` | Add cube fields to config; cube path in `savePreview` |
| Modify | `src/pages/DraftHub.tsx` | Skip preview step when `cubeId` present |
| Modify | `src/pages/DraftHistory.tsx` | Cube section replaces Sets section when `cubeId` set |

---

### Task 1: Add Cube type and update Draft

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `Cube` interface and cube fields on `Draft`**

In `src/types/index.ts`, add the `Cube` interface after `DraftAllocationEntry` and add four optional cube fields to `Draft`:

```ts
// After DraftAllocationEntry:

export interface Cube {
  id: string;
  name: string;
  imageUrl?: string;
  externalUrl?: string;
  createdAt: Timestamp;
  createdBy: string;
}
```

In the `Draft` interface, add after the `// Tournament` comment block:

```ts
  // Cube
  cubeId?: string;
  cubeName?: string;
  cubeImageUrl?: string;
  cubeExternalUrl?: string;
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: no TypeScript errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Cube type and cube fields to Draft"
```

---

### Task 2: Update `draftTitle` to handle cube drafts (TDD)

**Files:**
- Create: `src/utils/__tests__/draftTitle.test.ts`
- Modify: `src/utils/draftTitle.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/__tests__/draftTitle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { draftTitle } from '../draftTitle';
import type { Draft } from '../../types';

const fakeTs = { seconds: 0, nanoseconds: 0, toDate: () => new Date(), toMillis: () => 0 } as any;

function fakeDraft(overrides: Partial<Draft>): Draft {
  return {
    id: 'x',
    type: 'regular',
    createdBy: 'u1',
    createdAt: fakeTs,
    status: 'finalized',
    players: [],
    ...overrides,
  };
}

describe('draftTitle — cube drafts', () => {
  it('cube + regular → "Vintage Cube Draft" (no type label)', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'regular' }))).toBe('Vintage Cube Draft');
  });

  it('cube + mobius → "Vintage Cube Mobius Draft"', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'mobius' }))).toBe('Vintage Cube Mobius Draft');
  });

  it('cube + sealed → "Vintage Cube Sealed Draft"', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'sealed' }))).toBe('Vintage Cube Sealed Draft');
  });

  it('cube + team-sealed → "Vintage Cube Team-Sealed Draft"', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'team-sealed' }))).toBe('Vintage Cube Team-Sealed Draft');
  });
});

describe('draftTitle — sets-based drafts', () => {
  it('single set regular strips filler words', () => {
    expect(draftTitle(fakeDraft({
      type: 'regular',
      sets: [{ catalogId: 's1', name: 'Strixhaven: School of Mages Draft Booster', imageUrl: '', totalNeeded: 12 }],
    }))).toBe('Strixhaven: School of Mages Draft');
  });

  it('single set mobius appends type label', () => {
    expect(draftTitle(fakeDraft({
      type: 'mobius',
      sets: [{ catalogId: 's1', name: 'Strixhaven: School of Mages Draft Booster', imageUrl: '', totalNeeded: 24 }],
    }))).toBe('Strixhaven: School of Mages Mobius Draft');
  });

  it('multiple sets regular → "Regular Draft"', () => {
    expect(draftTitle(fakeDraft({
      type: 'regular',
      sets: [
        { catalogId: 's1', name: 'Dominaria United', imageUrl: '', totalNeeded: 6 },
        { catalogId: 's2', name: 'The Brothers\' War', imageUrl: '', totalNeeded: 6 },
      ],
    }))).toBe('Regular Draft');
  });

  it('multiple sets mobius → "Mobius Draft"', () => {
    expect(draftTitle(fakeDraft({
      type: 'mobius',
      sets: [
        { catalogId: 's1', name: 'Dominaria United', imageUrl: '', totalNeeded: 12 },
        { catalogId: 's2', name: 'The Brothers\' War', imageUrl: '', totalNeeded: 12 },
      ],
    }))).toBe('Mobius Draft');
  });
});

describe('draftTitle — chaos drafts', () => {
  it('chaos with one unique pack → strips filler and appends Draft', () => {
    expect(draftTitle(fakeDraft({
      type: 'chaos',
      packsSelectedOrder: [
        { id: 'p1', name: 'Strixhaven Draft Booster', imageUrl: '' },
        { id: 'p2', name: 'Strixhaven Draft Booster', imageUrl: '' },
      ],
    }))).toBe('Strixhaven Draft');
  });

  it('chaos with multiple unique packs → "Chaos Draft"', () => {
    expect(draftTitle(fakeDraft({
      type: 'chaos',
      packsSelectedOrder: [
        { id: 'p1', name: 'Dominaria United Draft Booster', imageUrl: '' },
        { id: 'p2', name: 'Strixhaven Draft Booster', imageUrl: '' },
      ],
    }))).toBe('Chaos Draft');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: 4 cube tests FAIL (cube branch doesn't exist yet), 5 sets/chaos tests PASS.

- [ ] **Step 3: Add cube branch to `draftTitle`**

Replace the full contents of `src/utils/draftTitle.ts`:

```ts
import type { Draft } from '../types';

const FILLER = /\b(draft|play|booster|collector|set|pack)s?\b/gi;

export function draftTitle(draft: Draft): string {
  if (draft.cubeId && draft.cubeName) {
    const typeLabel = draft.type === 'regular'
      ? ''
      : ` ${draft.type.charAt(0).toUpperCase() + draft.type.slice(1)}`;
    return `${draft.cubeName}${typeLabel} Draft`;
  }

  let rawNames: string[];
  if (draft.type === 'chaos') {
    const seen = new Set<string>();
    rawNames = [];
    for (const pack of draft.packsSelectedOrder ?? []) {
      if (!seen.has(pack.name)) { seen.add(pack.name); rawNames.push(pack.name); }
    }
  } else {
    rawNames = (draft.sets ?? []).map(s => s.name);
  }
  const setNames = rawNames.map(n => n.replace(FILLER, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const typeLabel = draft.type === 'regular'
    ? ''
    : ` ${draft.type.charAt(0).toUpperCase() + draft.type.slice(1)}`;
  if (setNames.length === 1) return `${setNames[0]}${typeLabel} Draft`;
  return `${draft.type === 'regular' ? 'Regular' : draft.type.charAt(0).toUpperCase() + draft.type.slice(1)} Draft`;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test -- --run`
Expected: all 86 + 9 new = 95 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/draftTitle.ts src/utils/__tests__/draftTitle.test.ts
git commit -m "feat: update draftTitle to use cube name when cubeId is present"
```

---

### Task 3: Create `cubeStore`

**Files:**
- Create: `src/state/cubeStore.ts`

- [ ] **Step 1: Create the store**

Create `src/state/cubeStore.ts`:

```ts
import { create } from 'zustand';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Cube } from '../types';

interface CubeStore {
  cubes: Cube[];
  isLoading: boolean;
  loadCubes: () => Promise<void>;
  addCube: (name: string, imageUrl: string | undefined, externalUrl: string | undefined) => Promise<void>;
  deleteCube: (id: string) => Promise<void>;
}

export const useCubeStore = create<CubeStore>((set, get) => ({
  cubes: [],
  isLoading: false,

  loadCubes: async () => {
    set({ isLoading: true });
    try {
      const snap = await getDocs(query(collection(db, 'cubes'), orderBy('name')));
      const cubes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Cube));
      set({ cubes, isLoading: false });
    } catch (err) {
      console.error('Failed to load cubes:', err);
      set({ isLoading: false });
    }
  },

  addCube: async (name, imageUrl, externalUrl) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');
    const data: Record<string, unknown> = {
      name,
      createdAt: serverTimestamp(),
      createdBy: uid,
    };
    if (imageUrl) data.imageUrl = imageUrl;
    if (externalUrl) data.externalUrl = externalUrl;
    await addDoc(collection(db, 'cubes'), data);
    await get().loadCubes();
  },

  deleteCube: async (id) => {
    await deleteDoc(doc(db, 'cubes', id));
    set(state => ({ cubes: state.cubes.filter(c => c.id !== id) }));
  },
}));
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/cubeStore.ts
git commit -m "feat: add cubeStore for Firestore cubes collection"
```

---

### Task 4: Cube management in Admin page

**Files:**
- Modify: `src/pages/Admin.tsx`

- [ ] **Step 1: Add the `'cubes'` section to Admin**

In `src/pages/Admin.tsx`, make the following changes:

**1. Update the import line:**

```ts
import { useEffect, useState } from 'react';
import { useUserStore } from '../state/userStore';
import { usePackCatalogStore } from '../state/packCatalogStore';
import { useCubeStore } from '../state/cubeStore';
import type { UserProfile } from '../types';
```

**2. Update the `AdminSection` type and add the tab:**

```ts
type AdminSection = 'users' | 'catalog' | 'cubes';
```

In the tab bar `<div>`, add after the Pack Catalog button:

```tsx
<button
  onClick={() => setSection('cubes')}
  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    section === 'cubes' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
  }`}
>
  Cubes
</button>
```

**3. Add the render branch** after `{section === 'catalog' && <PackCatalogManagement />}`:

```tsx
{section === 'cubes' && <CubeManagement />}
```

- [ ] **Step 2: Write the `CubeManagement` component**

Add this function at the bottom of `src/pages/Admin.tsx`, after `PackCatalogManagement`:

```tsx
function CubeManagement() {
  const { cubes, isLoading, loadCubes, addCube, deleteCube } = useCubeStore();
  const [newName, setNewName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newExternalUrl, setNewExternalUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCubes(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    await addCube(
      newName.trim(),
      newImageUrl.trim() || undefined,
      newExternalUrl.trim() || undefined,
    );
    setNewName(''); setNewImageUrl(''); setNewExternalUrl('');
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete cube "${name}"? This cannot be undone.`)) return;
    await deleteCube(id);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <h2 className="text-lg font-semibold text-gray-200">Add Cube</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Cube name (required)"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <input
            type="url"
            value={newImageUrl}
            onChange={e => setNewImageUrl(e.target.value)}
            placeholder="Image URL (optional — iconic card art)"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <input
            type="url"
            value={newExternalUrl}
            onChange={e => setNewExternalUrl(e.target.value)}
            placeholder="Cubecobra / Moxfield URL (optional)"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
          >
            {saving ? 'Saving…' : 'Add Cube'}
          </button>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-200">Cubes ({cubes.length})</h2>
        {isLoading && <div className="text-gray-400">Loading…</div>}
        {cubes.length === 0 && !isLoading && <p className="text-gray-400 text-sm">No cubes yet.</p>}
        {cubes.map(cube => (
          <div key={cube.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center gap-4">
            {cube.imageUrl ? (
              <img
                src={cube.imageUrl}
                alt={cube.name}
                className="w-10 object-cover rounded flex-shrink-0"
                style={{ height: '52px' }}
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x52/1F2937/FFF?text=?'; }}
              />
            ) : (
              <div className="w-10 h-13 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center text-gray-500 text-xs" style={{ height: '52px' }}>
                —
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium">{cube.name}</p>
              {cube.externalUrl && (
                <a
                  href={cube.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs truncate block max-w-xs"
                >
                  {cube.externalUrl}
                </a>
              )}
            </div>
            <button
              onClick={() => handleDelete(cube.id, cube.name)}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs rounded-lg font-medium flex-shrink-0"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat: add Cubes section to Admin page"
```

---

### Task 5: Sets/Cube source toggle in `RegularDraftSetup`

**Files:**
- Modify: `src/pages/RegularDraftSetup.tsx`

- [ ] **Step 1: Add cube source state and load cubes**

At the top of `src/pages/RegularDraftSetup.tsx`, add the `useCubeStore` import:

```ts
import { useCubeStore } from '../state/cubeStore';
```

Inside the `RegularDraftSetup` component, add after the existing `const packs = ...` line:

```ts
const { cubes, loadCubes } = useCubeStore();

const [source, setSource] = useState<'sets' | 'cube'>('sets');
const [selectedCubeId, setSelectedCubeId] = useState<string | null>(null);
const [selectedCubeName, setSelectedCubeName] = useState<string | null>(null);
const [selectedCubeImageUrl, setSelectedCubeImageUrl] = useState<string | null>(null);
const [selectedCubeExternalUrl, setSelectedCubeExternalUrl] = useState<string | null>(null);

useEffect(() => { loadCubes(); }, []);
```

- [ ] **Step 2: Update `handleFormatChange` to reset source for chaos**

Replace the existing `handleFormatChange`:

```ts
const handleFormatChange = (f: SetupFormat) => {
  setFormat(f);
  if (f === 'Chaos Draft') {
    setSource('sets');
    setSelectedCubeId(null);
    setSelectedCubeName(null);
    setSelectedCubeImageUrl(null);
    setSelectedCubeExternalUrl(null);
  } else {
    setPacksPerPerson(DEFAULT_PACKS_PER_PERSON[f as DraftFormat]);
  }
  const defaultPlayers = DEFAULT_PLAYERS[f];
  if (defaultPlayers) handleNumPlayersChange(defaultPlayers);
};
```

- [ ] **Step 3: Update `canProceed` and `handleSubmit`**

Replace the existing `canProceed`:

```ts
const canProceed = players.every(p => p.name.trim().length > 0) && (
  isChaos ||
  (source === 'sets' && sets.length > 0 && packsPerPerson > 0) ||
  (source === 'cube' && selectedCubeId != null && packsPerPerson > 0)
);
```

Replace `handleSubmit`:

```ts
const handleSubmit = () => {
  if (isChaos) {
    const namedPlayers = players.map((p, i) => ({
      ...p,
      name: p.name.trim() || `Player ${i + 1}`,
    }));
    onStartChaos(namedPlayers);
  } else {
    onNext({
      players,
      sets: source === 'sets' ? sets : [],
      format: format as DraftFormat,
      packsPerPerson,
      cubeId: source === 'cube' ? (selectedCubeId ?? undefined) : undefined,
      cubeName: source === 'cube' ? (selectedCubeName ?? undefined) : undefined,
      cubeImageUrl: source === 'cube' ? (selectedCubeImageUrl ?? undefined) : undefined,
      cubeExternalUrl: source === 'cube' ? (selectedCubeExternalUrl ?? undefined) : undefined,
    });
  }
};
```

- [ ] **Step 4: Update the `onNext` prop type**

Replace the `RegularDraftSetupProps` interface:

```ts
interface RegularDraftSetupProps {
  onNext: (config: {
    players: DraftPlayer[];
    sets: PackCatalogEntry[];
    format: DraftFormat;
    packsPerPerson: number;
    cubeId?: string;
    cubeName?: string;
    cubeImageUrl?: string;
    cubeExternalUrl?: string;
  }) => void;
  onStartChaos: (players: DraftPlayer[]) => void;
}
```

- [ ] **Step 5: Add the Sets/Cube toggle and cube picker to the JSX**

Find the `{/* Sets to Draft (non-chaos only) */}` section. Replace the entire block (from the comment through the closing `</div>`) with:

```tsx
{/* Sets to Draft (non-chaos only) */}
{!isChaos && (
  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-gray-200">Card Source</h3>
      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        <button
          onClick={() => { setSource('sets'); setSelectedCubeId(null); setSelectedCubeName(null); setSelectedCubeImageUrl(null); setSelectedCubeExternalUrl(null); }}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${source === 'sets' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        >
          Sets
        </button>
        <button
          onClick={() => { setSource('cube'); setSets([]); }}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${source === 'cube' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        >
          Cube
        </button>
      </div>
    </div>

    {source === 'sets' && (
      <>
        <PackCatalogSearch onSelect={handleAddSet} placeholder="Add a set…" />
        {sets.length > 0 && (
          <div className="space-y-2 mt-2">
            {sets.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-gray-700 rounded-lg px-3 py-2">
                <img src={s.imageUrl} alt={s.name} className="w-6 h-8 object-cover rounded" />
                <span className="text-white text-sm flex-1">{s.name}</span>
                <button onClick={() => handleRemoveSet(s.id)} className="text-gray-400 hover:text-red-400 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}
      </>
    )}

    {source === 'cube' && (
      <div className="space-y-2">
        {cubes.length === 0 ? (
          <p className="text-gray-400 text-sm">No cubes found. Add one in the Admin panel.</p>
        ) : cubes.map(cube => (
          <button
            key={cube.id}
            onClick={() => {
              setSelectedCubeId(cube.id);
              setSelectedCubeName(cube.name);
              setSelectedCubeImageUrl(cube.imageUrl ?? null);
              setSelectedCubeExternalUrl(cube.externalUrl ?? null);
            }}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors border ${
              selectedCubeId === cube.id
                ? 'bg-blue-700/40 border-blue-500'
                : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
            }`}
          >
            {cube.imageUrl ? (
              <img src={cube.imageUrl} alt={cube.name} className="w-6 h-8 object-cover rounded flex-shrink-0" />
            ) : (
              <div className="w-6 h-8 bg-gray-600 rounded flex-shrink-0" />
            )}
            <span className="text-white text-sm flex-1">{cube.name}</span>
            {selectedCubeId === cube.id && <span className="text-blue-300 text-xs font-semibold">✓</span>}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Verify build passes and tests still pass**

Run: `npm run build && npm test -- --run`
Expected: build succeeds, 95 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RegularDraftSetup.tsx
git commit -m "feat: add Sets/Cube source toggle to draft setup"
```

---

### Task 6: Cube-aware config and `savePreview` in `regularDraftStore`

**Files:**
- Modify: `src/state/regularDraftStore.ts`

- [ ] **Step 1: Add cube fields to `RegularDraftConfig`**

Replace the `RegularDraftConfig` interface:

```ts
export interface RegularDraftConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
  cubeId?: string;
  cubeName?: string;
  cubeImageUrl?: string;
  cubeExternalUrl?: string;
}
```

- [ ] **Step 2: Add cube path to `savePreview`**

Inside the `savePreview` action, add a cube branch at the very beginning, before the existing `sets` mapping code:

```ts
savePreview: async (config, allocations, overrides) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  if (config.cubeId) {
    const cubeDoc: Record<string, unknown> = {
      type: config.format === 'Regular Draft' ? 'regular'
        : config.format === 'Mobius Draft' ? 'mobius'
        : config.format === 'Sealed' ? 'sealed'
        : 'team-sealed',
      createdBy: uid,
      createdAt: serverTimestamp(),
      status: 'finalized',
      players: config.players,
      packsPerPerson: config.packsPerPerson,
      cubeId: config.cubeId,
      cubeName: config.cubeName,
      finalizedAt: serverTimestamp(),
      finalizedBy: uid,
    };
    if (config.cubeImageUrl) cubeDoc.cubeImageUrl = config.cubeImageUrl;
    if (config.cubeExternalUrl) cubeDoc.cubeExternalUrl = config.cubeExternalUrl;
    const docRef = await addDoc(collection(db, 'drafts'), cubeDoc);
    set({ savedDraftId: docRef.id });
    return docRef.id;
  }

  // existing sets path below (unchanged)
  const sets: DraftSetRef[] = allocations.map(a => ({
  // ... rest of existing savePreview implementation unchanged
```

The rest of the existing `savePreview` body remains as-is after the cube early-return.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/state/regularDraftStore.ts
git commit -m "feat: add cube-aware savePreview path to regularDraftStore"
```

---

### Task 7: Skip preview step for cube drafts in `DraftHub`

**Files:**
- Modify: `src/pages/DraftHub.tsx`

- [ ] **Step 1: Update the `RegularConfig` interface**

Replace the local `RegularConfig` interface in `src/pages/DraftHub.tsx`:

```ts
interface RegularConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
  cubeId?: string;
  cubeName?: string;
  cubeImageUrl?: string;
  cubeExternalUrl?: string;
}
```

- [ ] **Step 2: Skip preview when config has `cubeId`**

Find the `onNext` handler in the `RegularDraftSetup` render:

```tsx
<RegularDraftSetup
  onNext={(cfg) => { setConfig(cfg); setStep('preview'); }}
```

Replace it with:

```tsx
<RegularDraftSetup
  onNext={(cfg) => {
    setConfig(cfg);
    setStep(cfg.cubeId ? 'seating' : 'preview');
  }}
```

- [ ] **Step 3: Allow `handleStartRound1` to run without `pendingAllocation` for cube drafts**

Find `handleStartRound1`. Replace the guard at the top and the `savePreview` call:

```ts
const handleStartRound1 = async () => {
  if (!orderedPlayers || !round1Pairings || !config) return;
  if (!config.cubeId && !pendingAllocation) return;
  setStarting(true);
  setSaveError(null);
  try {
    const tournament: DraftTournament = {
      seats: playersToSeats(orderedPlayers),
      rounds: [{ roundNumber: 1, pairings: round1Pairings, status: 'active' }],
      currentRound: 1,
      totalRounds: 3,
      status: 'active',
    };
    const draftId = await savePreview(config, previewAllocations, pendingAllocation ?? []);
    await updateTournament(draftId, tournament);
    await loadDrafts();
    navigate('/tournament');
  } catch (err) {
    console.error('Failed to start round 1:', err);
    setSaveError('Failed to save. Please try again.');
  } finally {
    setStarting(false);
  }
};
```

- [ ] **Step 4: Verify build and tests pass**

Run: `npm run build && npm test -- --run`
Expected: build succeeds, 95 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DraftHub.tsx
git commit -m "feat: skip allocation preview for cube drafts in DraftHub"
```

---

### Task 8: Show Cube section in DraftHistory

**Files:**
- Modify: `src/pages/DraftHistory.tsx`

- [ ] **Step 1: Replace the Sets section with a cube-aware block**

Find this block in `src/pages/DraftHistory.tsx`:

```tsx
{draft.type !== 'chaos' && draft.sets && (
  <div className="space-y-2 mt-6 mb-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Sets</p>
    {draft.sets.map(s => (
```

Replace the outer condition from `draft.type !== 'chaos' && draft.sets` to handle the cube case:

```tsx
{draft.cubeId ? (
  <div className="space-y-2 mt-6 mb-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Cube</p>
    <div className="flex items-center gap-3 text-sm">
      {draft.cubeImageUrl && (
        <img src={draft.cubeImageUrl} alt={draft.cubeName} className="w-5 h-8 object-cover rounded" />
      )}
      <span className="text-gray-200 font-medium">{draft.cubeName}</span>
      {draft.cubeExternalUrl && (
        <a
          href={draft.cubeExternalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 text-xs"
        >
          View list ↗
        </a>
      )}
    </div>
  </div>
) : draft.type !== 'chaos' && draft.sets && (
  <div className="space-y-2 mt-6 mb-4">
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
        <button
          onClick={() => setExpandedAllocationIds(prev => {
            const next = new Set(prev);
            next.has(draft.id) ? next.delete(draft.id) : next.add(draft.id);
            return next;
          })}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expandedAllocationIds.has(draft.id) ? '▾ Hide allocation' : '▸ Show allocation'}
        </button>
        {expandedAllocationIds.has(draft.id) && (
          <div className="mt-2 space-y-0.5">
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
  </div>
)}
```

- [ ] **Step 2: Verify build and tests pass**

Run: `npm run build && npm test -- --run`
Expected: build succeeds, 95 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DraftHistory.tsx
git commit -m "feat: show Cube section in history expanded view when cubeId is set"
```

---

## Self-Review

**Spec coverage:**
- ✅ `Cube` interface with `name`, `imageUrl?`, `externalUrl?` — Task 1
- ✅ Cube fields on `Draft` — Task 1
- ✅ `cubeStore` (load/add/delete) — Task 3
- ✅ Admin Cubes management section — Task 4
- ✅ Sets/Cube toggle in draft setup — Task 5
- ✅ `savePreview` cube path (writes `status: 'finalized'`, no allocation) — Task 6
- ✅ `DraftHub` skips preview for cube drafts — Task 7
- ✅ `draftTitle` uses `cubeName` when `cubeId` present — Task 2
- ✅ History shows Cube section instead of Sets when `cubeId` set — Task 8
- ✅ Tournament page title via `draftTitle()` — covered by Task 2 (no separate change needed)

**Correctness checklist from spec:**
| Location | Handled by |
|---|---|
| `draftTitle()` | Task 2 |
| History card heading | Task 2 (uses `draftTitle`) |
| History expanded Sets/Cube section | Task 8 |
| Tournament page `<h2>` | Task 2 (uses `draftTitle`) |
| `formatDraftOption()` dropdown | Task 2 (uses `draftTitle`) |

**Type consistency:** `cubeId`, `cubeName`, `cubeImageUrl`, `cubeExternalUrl` used consistently across `Draft` (Task 1), `RegularDraftConfig` (Task 6), local `RegularConfig` in DraftHub (Task 7), and `RegularDraftSetup` prop type (Task 5). All four fields flow from setup → store → Firestore → display.
