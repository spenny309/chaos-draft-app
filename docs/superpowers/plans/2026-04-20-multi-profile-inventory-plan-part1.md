# Multi-Profile Inventory & Regular Draft Implementation Plan (Part 1: Tasks 1–12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is Part 1 of 2. See `2026-04-20-multi-profile-inventory-plan-part2.md` for Tasks 13–23.**

**Goal:** Add multi-user support with role-based access, three inventory types (Chaos/Private/Draft), and a Regular Draft mode with fair pack allocation from private inventories.

**Architecture:** Layer new Firestore collections (`users`, `packCatalog`, `privateInventory`) and a unified `drafts` schema on top of the existing Firebase/Zustand stack. New UI integrates via selectors and mode toggles. The allocation algorithm lives as pure functions in `src/utils/allocationAlgorithm.ts`. Admin role is bootstrapped via `VITE_ADMIN_EMAIL` env var.

**Tech Stack:** React 19 + TypeScript, Firebase Auth + Firestore, Zustand, Tailwind CSS v4, Vite + Vitest

**Spec:** `docs/superpowers/specs/2026-04-20-multi-profile-inventory-design.md`

---

## File Map

**New files:**
- `vitest.config.ts`
- `src/utils/allocationAlgorithm.ts`
- `src/utils/__tests__/allocationAlgorithm.test.ts`
- `src/types/index.ts`
- `src/state/userStore.ts`
- `src/state/packCatalogStore.ts`
- `src/state/privateInventoryStore.ts`
- `src/state/regularDraftStore.ts`
- `firestore.rules`
- `src/components/PackCatalogSearch.tsx`
- `src/components/PlayerSearch.tsx`
- `src/pages/Admin.tsx`
- `src/pages/PrivateInventory.tsx`
- `src/pages/DraftInventory.tsx`
- `src/pages/DraftHub.tsx`
- `src/pages/RegularDraftSetup.tsx`
- `src/pages/RegularDraftPreview.tsx`

**Modified files:**
- `src/state/inventoryStore.ts` — add `catalogId`, catalog-based `addPack`
- `src/state/draftHistoryStore.ts` — unified schema, remove userId filter, add `saveDraft`
- `src/state/sessionStore.ts` — add `userId` to players, save draft on confirm
- `src/components/Auth.tsx` — add Name field, pending/denied states
- `src/App.tsx` — role-based tabs, auth states, updated routes
- `src/pages/Inventory.tsx` — three-way selector
- `src/pages/SessionSetup.tsx` — player typeahead
- `src/pages/DraftHistory.tsx` — unified schema, all draft types, finalize button

---

## Task 1: Setup Vitest and implement allocation algorithm (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/utils/allocationAlgorithm.ts`
- Create: `src/utils/__tests__/allocationAlgorithm.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 3: Write failing tests**

Create `src/utils/__tests__/allocationAlgorithm.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  allocateFromPool,
  distributePacksAcrossSets,
  allocateRegularDraft,
} from '../allocationAlgorithm';

describe('allocateFromPool', () => {
  it('allocates evenly when contributors have equal stock', () => {
    const pool = [
      { userId: 'ben', userName: 'Ben', available: 6 },
      { userId: 'markus', userName: 'Markus', available: 6 },
    ];
    const { contributions, shortfall } = allocateFromPool(pool, 12);
    expect(shortfall).toBe(0);
    expect(contributions.find(c => c.userId === 'ben')?.count).toBe(6);
    expect(contributions.find(c => c.userId === 'markus')?.count).toBe(6);
  });

  it('uses more from contributors with larger stock after equalising smaller ones', () => {
    const pool = [
      { userId: 'ben', userName: 'Ben', available: 6 },
      { userId: 'markus', userName: 'Markus', available: 6 },
      { userId: 'spencer', userName: 'Spencer', available: 12 },
    ];
    const { contributions, shortfall } = allocateFromPool(pool, 24);
    expect(shortfall).toBe(0);
    const total = contributions.reduce((s, c) => s + c.count, 0);
    expect(total).toBe(24);
    expect(contributions.find(c => c.userId === 'ben')?.count).toBe(6);
    expect(contributions.find(c => c.userId === 'markus')?.count).toBe(6);
    expect(contributions.find(c => c.userId === 'spencer')?.count).toBe(12);
  });

  it('reports shortfall when pool is insufficient', () => {
    const pool = [{ userId: 'ben', userName: 'Ben', available: 6 }];
    const { contributions, shortfall } = allocateFromPool(pool, 10);
    expect(shortfall).toBe(4);
    expect(contributions.find(c => c.userId === 'ben')?.count).toBe(6);
  });

  it('returns no contributions when needed is 0', () => {
    const { contributions, shortfall } = allocateFromPool(
      [{ userId: 'ben', userName: 'Ben', available: 6 }],
      0
    );
    expect(contributions).toHaveLength(0);
    expect(shortfall).toBe(0);
  });

  it('handles empty pool', () => {
    const { contributions, shortfall } = allocateFromPool([], 10);
    expect(contributions).toHaveLength(0);
    expect(shortfall).toBe(10);
  });

  it('never exceeds needed even when pool has surplus', () => {
    const pool = [
      { userId: 'a', userName: 'A', available: 10 },
      { userId: 'b', userName: 'B', available: 10 },
    ];
    const { contributions, shortfall } = allocateFromPool(pool, 7);
    expect(shortfall).toBe(0);
    const total = contributions.reduce((s, c) => s + c.count, 0);
    expect(total).toBe(7);
  });
});

describe('distributePacksAcrossSets', () => {
  it('distributes evenly when divisible', () => {
    const { counts, wasRounded } = distributePacksAcrossSets(12, 3);
    expect(counts).toEqual([4, 4, 4]);
    expect(wasRounded).toBe(false);
  });

  it('uses largest-remainder method and sums exactly to total', () => {
    const { counts, wasRounded } = distributePacksAcrossSets(12, 5);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(12);
    expect(wasRounded).toBe(true);
    const sorted = [...counts].sort((a, b) => b - a);
    expect(sorted).toEqual([3, 3, 2, 2, 2]);
  });

  it('handles single set', () => {
    const { counts, wasRounded } = distributePacksAcrossSets(24, 1);
    expect(counts).toEqual([24]);
    expect(wasRounded).toBe(false);
  });

  it('handles zero sets', () => {
    const { counts } = distributePacksAcrossSets(24, 0);
    expect(counts).toEqual([]);
  });
});

describe('allocateRegularDraft', () => {
  it('uses participants before non-participants', () => {
    const result = allocateRegularDraft([{
      catalogId: 'avatar',
      name: 'Avatar',
      totalNeeded: 24,
      participants: [
        { userId: 'ben', userName: 'Ben', available: 6 },
        { userId: 'markus', userName: 'Markus', available: 6 },
        { userId: 'spencer', userName: 'Spencer', available: 12 },
      ],
      nonParticipants: [{ userId: 'elijah', userName: 'Elijah', available: 6 }],
    }]);
    const set = result[0];
    expect(set.shortfall).toBe(0);
    expect(set.contributions.find(c => c.userId === 'elijah')).toBeUndefined();
    expect(set.contributions.reduce((s, c) => s + c.count, 0)).toBe(24);
  });

  it('falls back to non-participants when participants are insufficient', () => {
    const result = allocateRegularDraft([{
      catalogId: 'avatar',
      name: 'Avatar',
      totalNeeded: 24,
      participants: [
        { userId: 'ben', userName: 'Ben', available: 6 },
        { userId: 'markus', userName: 'Markus', available: 6 },
      ],
      nonParticipants: [{ userId: 'elijah', userName: 'Elijah', available: 12 }],
    }]);
    const set = result[0];
    expect(set.shortfall).toBe(0);
    expect(set.contributions.find(c => c.userId === 'elijah')?.count).toBe(12);
    expect(set.contributions.reduce((s, c) => s + c.count, 0)).toBe(24);
  });

  it('reports shortfall when all inventories are insufficient', () => {
    const result = allocateRegularDraft([{
      catalogId: 'avatar',
      name: 'Avatar',
      totalNeeded: 24,
      participants: [{ userId: 'ben', userName: 'Ben', available: 6 }],
      nonParticipants: [],
    }]);
    expect(result[0].shortfall).toBe(18);
  });

  it('handles multiple sets independently', () => {
    const result = allocateRegularDraft([
      {
        catalogId: 'set-a', name: 'Set A', totalNeeded: 6,
        participants: [{ userId: 'ben', userName: 'Ben', available: 6 }],
        nonParticipants: [],
      },
      {
        catalogId: 'set-b', name: 'Set B', totalNeeded: 6,
        participants: [{ userId: 'markus', userName: 'Markus', available: 6 }],
        nonParticipants: [],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].shortfall).toBe(0);
    expect(result[1].shortfall).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests — confirm they fail**

```bash
npm test
```

Expected: `allocationAlgorithm` not found errors.

- [ ] **Step 5: Implement `src/utils/allocationAlgorithm.ts`**

```typescript
export interface Contributor {
  userId: string;
  userName: string;
  available: number;
}

export interface ContributionEntry {
  userId: string;
  userName: string;
  count: number;
}

export interface SetInput {
  catalogId: string;
  name: string;
  totalNeeded: number;
  participants: Contributor[];
  nonParticipants: Contributor[];
}

export interface SetAllocation {
  catalogId: string;
  name: string;
  totalNeeded: number;
  contributions: ContributionEntry[];
  shortfall: number;
}

/**
 * Distributes `needed` packs among contributors as evenly as possible,
 * processing smallest-stock contributors first so those with more cover the remainder.
 */
export function allocateFromPool(
  contributors: Contributor[],
  needed: number
): { contributions: ContributionEntry[]; shortfall: number } {
  if (needed <= 0) return { contributions: [], shortfall: 0 };

  const sorted = [...contributors].sort((a, b) => a.available - b.available);
  const contributions: ContributionEntry[] = [];
  let remaining = needed;

  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    const contributor = sorted[i];
    const remainingContributors = sorted.length - i;
    const fairShare = Math.ceil(remaining / remainingContributors);
    const take = Math.min(contributor.available, fairShare);
    if (take > 0) {
      contributions.push({
        userId: contributor.userId,
        userName: contributor.userName,
        count: take,
      });
      remaining -= take;
    }
  }

  return { contributions, shortfall: Math.max(0, remaining) };
}

/**
 * Distributes totalPacks across numSets using the largest-remainder method,
 * guaranteeing the counts sum to exactly totalPacks.
 */
export function distributePacksAcrossSets(
  totalPacks: number,
  numSets: number
): { counts: number[]; wasRounded: boolean } {
  if (numSets === 0) return { counts: [], wasRounded: false };
  if (numSets === 1) return { counts: [totalPacks], wasRounded: false };

  const floors = Array(numSets).fill(Math.floor(totalPacks / numSets));
  const remainder = totalPacks - floors.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remainder; i++) floors[i]++;

  return { counts: floors, wasRounded: remainder > 0 };
}

/**
 * For each set, allocates packs from participants first, then non-participants.
 */
export function allocateRegularDraft(sets: SetInput[]): SetAllocation[] {
  return sets.map(set => {
    const { contributions: participantContribs, shortfall: afterParticipants } =
      allocateFromPool(set.participants, set.totalNeeded);
    const { contributions: nonParticipantContribs, shortfall } =
      allocateFromPool(set.nonParticipants, afterParticipants);
    return {
      catalogId: set.catalogId,
      name: set.name,
      totalNeeded: set.totalNeeded,
      contributions: [...participantContribs, ...nonParticipantContribs],
      shortfall,
    };
  });
}
```

- [ ] **Step 6: Run tests — confirm they all pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/utils/allocationAlgorithm.ts src/utils/__tests__/allocationAlgorithm.test.ts package.json
git commit -m "feat: add allocation algorithm with tests"
```

---

## Task 2: Shared TypeScript types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create `src/types/index.ts`**

```typescript
import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'denied';
  createdAt: Timestamp;
}

export interface PackCatalogEntry {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: Timestamp;
}

export interface PrivateInventoryItem {
  id: string;
  ownerId: string;
  catalogId: string;
  name: string;
  imageUrl: string;
  count: number;
}

export type DraftType = 'chaos' | 'regular' | 'mobius' | 'sealed' | 'team-sealed';
export type DraftStatus = 'preview' | 'finalized';

export interface DraftPlayer {
  id: string;
  name: string;
  userId: string | null;
}

export interface DraftPackRef {
  id: string;      // pack doc ID in 'packs' collection (chaos only)
  name: string;
  imageUrl: string;
}

export interface DraftSetRef {
  catalogId: string;
  name: string;
  imageUrl: string;
  totalNeeded: number;
}

export interface DraftAllocationEntry {
  userId: string;
  userName: string;
  catalogId: string;
  name: string;
  count: number;
}

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
}

export type DraftFormat = 'Regular Draft' | 'Mobius Draft' | 'Sealed' | 'Team Sealed';

export const DEFAULT_PACKS_PER_PERSON: Record<DraftFormat, number> = {
  'Regular Draft': 3,
  'Mobius Draft': 6,
  'Sealed': 6,
  'Team Sealed': 3,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: userStore

**Files:**
- Create: `src/state/userStore.ts`

- [ ] **Step 1: Create `src/state/userStore.ts`**

```typescript
import { create } from 'zustand';
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../types';

interface UserStore {
  profile: UserProfile | null;
  allUsers: UserProfile[];
  isLoading: boolean;
  _unsubscribe: (() => void) | null;
  startListening: (uid: string) => void;
  stopListening: () => void;
  createProfile: (uid: string, name: string, email: string) => Promise<void>;
  loadAllUsers: () => Promise<void>;
  updateUserStatus: (uid: string, status: UserProfile['status']) => Promise<void>;
}

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  allUsers: [],
  isLoading: false,
  _unsubscribe: null,

  startListening: (uid) => {
    get()._unsubscribe?.();
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        set({ profile: { uid, ...snap.data() } as UserProfile });
      } else {
        set({ profile: null });
      }
    });
    set({ _unsubscribe: unsub });
  },

  stopListening: () => {
    get()._unsubscribe?.();
    set({ _unsubscribe: null, profile: null });
  },

  createProfile: async (uid, name, email) => {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string;
    const isAdmin = email === adminEmail;
    await setDoc(doc(db, 'users', uid), {
      name,
      email,
      role: isAdmin ? 'admin' : 'user',
      status: isAdmin ? 'approved' : 'pending',
      createdAt: serverTimestamp(),
    });
    if (!isAdmin) {
      await addDoc(collection(db, 'mail'), {
        to: adminEmail,
        message: {
          subject: `New registration: ${name}`,
          html: `<p><strong>${name}</strong> (${email}) has registered and is awaiting your approval in the Admin panel.</p>`,
        },
      });
    }
  },

  loadAllUsers: async () => {
    set({ isLoading: true });
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
    users.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return a.name.localeCompare(b.name);
    });
    set({ allUsers: users, isLoading: false });
  },

  updateUserStatus: async (uid, status) => {
    await updateDoc(doc(db, 'users', uid), { status });
    set(state => ({
      allUsers: state.allUsers.map(u => u.uid === uid ? { ...u, status } : u),
    }));
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/state/userStore.ts
git commit -m "feat: add userStore with profile listening and approval management"
```

---

## Task 4: packCatalogStore

**Files:**
- Create: `src/state/packCatalogStore.ts`

- [ ] **Step 1: Create `src/state/packCatalogStore.ts`**

```typescript
import { create } from 'zustand';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { PackCatalogEntry } from '../types';

interface PackCatalogStore {
  entries: PackCatalogEntry[];
  isLoading: boolean;
  loadEntries: () => Promise<void>;
  addEntry: (name: string, imageUrl: string) => Promise<void>;
  editEntry: (id: string, updates: Partial<Pick<PackCatalogEntry, 'name' | 'imageUrl'>>) => Promise<void>;
  deleteEntry: (id: string) => Promise<{ blockedBy: string[] }>;
}

export const usePackCatalogStore = create<PackCatalogStore>((set, get) => ({
  entries: [],
  isLoading: false,

  loadEntries: async () => {
    set({ isLoading: true });
    const snap = await getDocs(query(collection(db, 'packCatalog'), orderBy('name')));
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() } as PackCatalogEntry));
    set({ entries, isLoading: false });
  },

  addEntry: async (name, imageUrl) => {
    await addDoc(collection(db, 'packCatalog'), {
      name,
      imageUrl,
      createdAt: serverTimestamp(),
    });
    await get().loadEntries();
  },

  editEntry: async (id, updates) => {
    const batch = writeBatch(db);

    // Update catalog entry
    batch.update(doc(db, 'packCatalog', id), updates);

    // Update chaos inventory packs with this catalogId
    const packsSnap = await getDocs(
      query(collection(db, 'packs'), where('catalogId', '==', id))
    );
    packsSnap.docs.forEach(d => batch.update(d.ref, updates));

    // Update private inventory items with this catalogId
    const privSnap = await getDocs(
      query(collection(db, 'privateInventory'), where('catalogId', '==', id))
    );
    privSnap.docs.forEach(d => batch.update(d.ref, updates));

    await batch.commit();

    // Update draft documents (no compound query for nested arrays — read all and filter)
    const currentEntry = get().entries.find(e => e.id === id);
    const currentName = currentEntry?.name ?? '';
    const draftsSnap = await getDocs(collection(db, 'drafts'));
    const batch2 = writeBatch(db);
    let hasChanges = false;

    draftsSnap.docs.forEach(d => {
      const data = d.data();
      const updateData: Record<string, unknown> = {};

      // Chaos drafts: packsSelectedOrder matched by name (no catalogId embedded there)
      if (Array.isArray(data.packsSelectedOrder)) {
        const updated = data.packsSelectedOrder.map((p: Record<string, unknown>) =>
          p.name === currentName ? { ...p, ...updates } : p
        );
        if (JSON.stringify(updated) !== JSON.stringify(data.packsSelectedOrder)) {
          updateData.packsSelectedOrder = updated;
        }
      }

      // Regular drafts: sets array
      if (Array.isArray(data.sets)) {
        const updated = data.sets.map((s: Record<string, unknown>) =>
          s.catalogId === id ? { ...s, ...updates } : s
        );
        if (JSON.stringify(updated) !== JSON.stringify(data.sets)) {
          updateData.sets = updated;
        }
      }

      // Regular drafts: allocation array
      if (Array.isArray(data.allocation)) {
        const updated = data.allocation.map((a: Record<string, unknown>) =>
          a.catalogId === id ? { ...a, ...updates } : a
        );
        if (JSON.stringify(updated) !== JSON.stringify(data.allocation)) {
          updateData.allocation = updated;
        }
      }

      if (Object.keys(updateData).length > 0) {
        batch2.update(d.ref, updateData);
        hasChanges = true;
      }
    });

    if (hasChanges) await batch2.commit();
    await get().loadEntries();
  },

  deleteEntry: async (id) => {
    // Check for live references before deleting
    const [packsSnap, privSnap] = await Promise.all([
      getDocs(query(collection(db, 'packs'), where('catalogId', '==', id))),
      getDocs(query(collection(db, 'privateInventory'), where('catalogId', '==', id))),
    ]);

    const blockedBy: string[] = [];
    packsSnap.docs.forEach(d => blockedBy.push(`Chaos Inventory: ${d.data().name}`));
    privSnap.docs.forEach(d => blockedBy.push(`${d.data().name} (private inventory)`));

    if (blockedBy.length > 0) return { blockedBy };

    await deleteDoc(doc(db, 'packCatalog', id));
    set(state => ({ entries: state.entries.filter(e => e.id !== id) }));
    return { blockedBy: [] };
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/state/packCatalogStore.ts
git commit -m "feat: add packCatalogStore with propagating edit and reference-checked delete"
```

---

## Task 5: privateInventoryStore

**Files:**
- Create: `src/state/privateInventoryStore.ts`

- [ ] **Step 1: Create `src/state/privateInventoryStore.ts`**

```typescript
import { create } from 'zustand';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { PrivateInventoryItem, DraftAllocationEntry } from '../types';

interface PrivateInventoryStore {
  myItems: PrivateInventoryItem[];
  allItems: PrivateInventoryItem[];
  isLoading: boolean;
  loadMyInventory: () => Promise<void>;
  loadAllInventory: () => Promise<void>;
  addOrUpdateItem: (catalogId: string, name: string, imageUrl: string, count: number) => Promise<void>;
  updateCount: (id: string, count: number) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  batchDeduct: (allocation: DraftAllocationEntry[]) => Promise<void>;
}

export const usePrivateInventoryStore = create<PrivateInventoryStore>((set, get) => ({
  myItems: [],
  allItems: [],
  isLoading: false,

  loadMyInventory: async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    set({ isLoading: true });
    const snap = await getDocs(
      query(collection(db, 'privateInventory'), where('ownerId', '==', uid))
    );
    const myItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateInventoryItem));
    myItems.sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      return a.name.localeCompare(b.name);
    });
    set({ myItems, isLoading: false });
  },

  loadAllInventory: async () => {
    set({ isLoading: true });
    const snap = await getDocs(collection(db, 'privateInventory'));
    const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateInventoryItem));
    set({ allItems, isLoading: false });
  },

  addOrUpdateItem: async (catalogId, name, imageUrl, count) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const snap = await getDocs(
      query(
        collection(db, 'privateInventory'),
        where('ownerId', '==', uid),
        where('catalogId', '==', catalogId)
      )
    );
    if (!snap.empty) {
      const existing = snap.docs[0];
      await updateDoc(doc(db, 'privateInventory', existing.id), {
        count: (existing.data().count as number) + count,
      });
    } else {
      await addDoc(collection(db, 'privateInventory'), {
        ownerId: uid,
        catalogId,
        name,
        imageUrl,
        count,
      });
    }
    await get().loadMyInventory();
  },

  updateCount: async (id, count) => {
    await updateDoc(doc(db, 'privateInventory', id), { count });
    set(state => ({
      myItems: state.myItems.map(item => item.id === id ? { ...item, count } : item),
    }));
  },

  deleteItem: async (id) => {
    await deleteDoc(doc(db, 'privateInventory', id));
    set(state => ({ myItems: state.myItems.filter(item => item.id !== id) }));
  },

  batchDeduct: async (allocation) => {
    // Group allocation entries by userId + catalogId
    const deductions = new Map<string, { userId: string; catalogId: string; count: number }>();
    for (const entry of allocation) {
      const key = `${entry.userId}::${entry.catalogId}`;
      const existing = deductions.get(key);
      if (existing) {
        existing.count += entry.count;
      } else {
        deductions.set(key, { userId: entry.userId, catalogId: entry.catalogId, count: entry.count });
      }
    }

    await runTransaction(db, async (transaction) => {
      // READS FIRST
      const updates: { ref: ReturnType<typeof doc>; newCount: number }[] = [];
      for (const { userId, catalogId, count } of deductions.values()) {
        const snap = await getDocs(
          query(
            collection(db, 'privateInventory'),
            where('ownerId', '==', userId),
            where('catalogId', '==', catalogId)
          )
        );
        if (!snap.empty) {
          const itemDoc = snap.docs[0];
          const current = itemDoc.data().count as number;
          updates.push({ ref: itemDoc.ref, newCount: Math.max(0, current - count) });
        }
      }
      // WRITES SECOND
      for (const { ref, newCount } of updates) {
        transaction.update(ref, { count: newCount });
      }
    });

    await get().loadMyInventory();
    await get().loadAllInventory();
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/state/privateInventoryStore.ts
git commit -m "feat: add privateInventoryStore with upsert and batch deduct"
```

---

## Task 6: regularDraftStore

**Files:**
- Create: `src/state/regularDraftStore.ts`

- [ ] **Step 1: Create `src/state/regularDraftStore.ts`**

```typescript
import { create } from 'zustand';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { allocateRegularDraft, distributePacksAcrossSets } from '../utils/allocationAlgorithm';
import type {
  DraftPlayer,
  DraftSetRef,
  DraftAllocationEntry,
  DraftFormat,
  PackCatalogEntry,
} from '../types';
import type { PrivateInventoryItem } from '../types';

export interface RegularDraftConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
}

export interface SetAllocationWithMeta {
  catalogId: string;
  name: string;
  imageUrl: string;
  totalNeeded: number;
  contributions: { userId: string; userName: string; count: number; available: number }[];
  shortfall: number;
}

interface RegularDraftStore {
  config: RegularDraftConfig | null;
  previewAllocations: SetAllocationWithMeta[];
  wasRounded: boolean;
  savedDraftId: string | null;
  isLoading: boolean;
  setConfig: (config: RegularDraftConfig) => void;
  computePreview: (config: RegularDraftConfig, allPrivateInventory: PrivateInventoryItem[]) => {
    allocations: SetAllocationWithMeta[];
    wasRounded: boolean;
  };
  savePreview: (
    config: RegularDraftConfig,
    allocations: SetAllocationWithMeta[],
    overrides: DraftAllocationEntry[]
  ) => Promise<string>;
  finalizeDraft: (draftId: string, allocation: DraftAllocationEntry[]) => Promise<void>;
  reset: () => void;
}

export const useRegularDraftStore = create<RegularDraftStore>((set) => ({
  config: null,
  previewAllocations: [],
  wasRounded: false,
  savedDraftId: null,
  isLoading: false,

  setConfig: (config) => set({ config }),

  computePreview: (config, allPrivateInventory) => {
    const totalPacks = config.players.length * config.packsPerPerson;
    const { counts, wasRounded } = distributePacksAcrossSets(totalPacks, config.sets.length);

    // Build per-set availability maps
    const participantUserIds = new Set(
      config.players.map(p => p.userId).filter(Boolean) as string[]
    );

    const allocations: SetAllocationWithMeta[] = config.sets.map((catalogEntry, i) => {
      const totalNeeded = counts[i];
      const itemsForSet = allPrivateInventory.filter(
        item => item.catalogId === catalogEntry.id && item.count > 0
      );

      const toContributor = (item: PrivateInventoryItem) => ({
        userId: item.ownerId,
        userName: '', // filled below
        available: item.count,
      });

      const participantItems = itemsForSet.filter(item =>
        participantUserIds.has(item.ownerId)
      );
      const nonParticipantItems = itemsForSet.filter(item =>
        !participantUserIds.has(item.ownerId)
      );

      const result = allocateRegularDraft([{
        catalogId: catalogEntry.id,
        name: catalogEntry.name,
        totalNeeded,
        participants: participantItems.map(toContributor),
        nonParticipants: nonParticipantItems.map(toContributor),
      }])[0];

      // Enrich contributions with available counts and userNames (from allPrivateInventory)
      const enriched = result.contributions.map(c => {
        const item = itemsForSet.find(i => i.ownerId === c.userId);
        return { ...c, available: item?.count ?? 0 };
      });

      return {
        catalogId: catalogEntry.id,
        name: catalogEntry.name,
        imageUrl: catalogEntry.imageUrl,
        totalNeeded,
        contributions: enriched,
        shortfall: result.shortfall,
      };
    });

    set({ previewAllocations: allocations, wasRounded });
    return { allocations, wasRounded };
  },

  savePreview: async (config, allocations, overrides) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');

    const sets: DraftSetRef[] = allocations.map(a => ({
      catalogId: a.catalogId,
      name: a.name,
      imageUrl: a.imageUrl,
      totalNeeded: a.totalNeeded,
    }));

    const docRef = await addDoc(collection(db, 'drafts'), {
      type: config.format === 'Regular Draft' ? 'regular'
        : config.format === 'Mobius Draft' ? 'mobius'
        : config.format === 'Sealed' ? 'sealed'
        : 'team-sealed',
      createdBy: uid,
      createdAt: serverTimestamp(),
      status: 'preview',
      players: config.players,
      sets,
      packsPerPerson: config.packsPerPerson,
      finalizedAt: null,
      finalizedBy: null,
      allocation: overrides,
    });

    set({ savedDraftId: docRef.id });
    return docRef.id;
  },

  finalizeDraft: async (draftId, allocation) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');

    // Deduction is handled by privateInventoryStore.batchDeduct — called from the UI
    await updateDoc(doc(db, 'drafts', draftId), {
      status: 'finalized',
      finalizedAt: serverTimestamp(),
      finalizedBy: uid,
      allocation,
    });
  },

  reset: () => set({
    config: null,
    previewAllocations: [],
    wasRounded: false,
    savedDraftId: null,
  }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/state/regularDraftStore.ts
git commit -m "feat: add regularDraftStore with preview computation and finalization"
```

---

## Task 7: Update inventoryStore — add catalogId, catalog-based addPack

**Files:**
- Modify: `src/state/inventoryStore.ts`

- [ ] **Step 1: Add `catalogId` to the `Pack` interface**

In `src/state/inventoryStore.ts`, change:

```typescript
export interface Pack {
  id: string;
  name: string;
  imageUrl: string;
  inPerson: number;
  inTransit: number;
  ownerId: string;
}
```

To:

```typescript
export interface Pack {
  id: string;
  name: string;
  imageUrl: string;
  inPerson: number;
  inTransit: number;
  ownerId: string;
  catalogId: string;   // reference to packCatalog doc — required after migration
}
```

- [ ] **Step 2: Replace `addPack` signature to require `catalogId`**

Change the `addPack` method signature in `InventoryState`:

```typescript
addPack: (pack: { catalogId: string; name: string; imageUrl: string; inPerson: number; inTransit: number }) => Promise<void>;
```

- [ ] **Step 3: Update `addPack` implementation to use `catalogId` for duplicate check**

Replace the `addPack` implementation:

```typescript
addPack: async (pack) => {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    const q = query(
      packsCollectionRef,
      where('ownerId', '==', userId),
      where('catalogId', '==', pack.catalogId)
    );
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const existingDoc = querySnapshot.docs[0];
      const existingPack = existingDoc.data() as Omit<Pack, 'id'>;
      await updateDoc(doc(db, 'packs', existingDoc.id), {
        inPerson: existingPack.inPerson + pack.inPerson,
        inTransit: existingPack.inTransit + pack.inTransit,
        imageUrl: pack.imageUrl,
        name: pack.name,
      });
    } else {
      await addDoc(packsCollectionRef, { ...pack, ownerId: userId });
    }

    await get().loadPacks();
  } catch (error) {
    console.error('Error adding pack: ', error);
  }
},
```

- [ ] **Step 4: Commit**

```bash
git add src/state/inventoryStore.ts
git commit -m "feat: add catalogId to Pack type and update addPack to use catalog"
```

---

## Task 8: Update draftHistoryStore — unified schema, remove userId filter, add saveDraft

**Files:**
- Modify: `src/state/draftHistoryStore.ts`

- [ ] **Step 1: Replace the entire file with the updated version**

```typescript
import { create } from 'zustand';
import { auth, db } from '../firebase';
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
} from 'firebase/firestore';
import { useInventoryStore } from './inventoryStore';
import type { Draft } from '../types';

interface DraftHistoryState {
  drafts: Draft[];
  loading: boolean;
  error: string | null;
  loadDrafts: () => Promise<void>;
  clearDrafts: () => void;
  saveDraft: (draft: Omit<Draft, 'id' | 'createdAt'>) => Promise<string>;
  deleteDraft: (draftId: string) => Promise<void>;
  markRestockComplete: (draftId: string) => Promise<void>;
}

export const useDraftHistoryStore = create<DraftHistoryState>((set, get) => ({
  drafts: [],
  loading: true,
  error: null,

  loadDrafts: async () => {
    set({ loading: true, error: null });
    try {
      // All approved users can see all drafts — no userId filter
      const q = query(collection(db, 'drafts'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const drafts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Draft));
      set({ drafts, loading: false });
    } catch (err) {
      console.error('Error fetching draft history:', err);
      set({ error: 'Failed to load draft history.', loading: false });
    }
  },

  clearDrafts: () => set({ drafts: [], loading: false, error: null }),

  saveDraft: async (draft) => {
    const docRef = await addDoc(collection(db, 'drafts'), {
      ...draft,
      createdAt: serverTimestamp(),
    });
    await get().loadDrafts();
    return docRef.id;
  },

  deleteDraft: async (draftId) => {
    const user = auth.currentUser;
    if (!user) return;

    const draftDoc = get().drafts.find(d => d.id === draftId);
    if (!draftDoc) return;

    // For chaos drafts, revert inventory on delete
    if (draftDoc.type === 'chaos' && draftDoc.packsSelectedOrder) {
      const packCounts = new Map<string, number>();
      for (const pack of draftDoc.packsSelectedOrder) {
        packCounts.set(pack.id, (packCounts.get(pack.id) || 0) + 1);
      }

      await runTransaction(db, async (transaction) => {
        const draftDocRef = doc(db, 'drafts', draftId);
        const draftSnap = await transaction.get(draftDocRef);
        if (!draftSnap.exists()) throw new Error('Draft not found.');

        const updates: { ref: ReturnType<typeof doc>; newQty: number }[] = [];
        for (const [packId, count] of packCounts.entries()) {
          const packDocRef = doc(db, 'packs', packId);
          const packSnap = await transaction.get(packDocRef);
          if (packSnap.exists()) {
            updates.push({ ref: packDocRef, newQty: (packSnap.data().inPerson || 0) + count });
          }
        }
        for (const { ref, newQty } of updates) {
          transaction.update(ref, { inPerson: newQty });
        }
        transaction.delete(draftDocRef);
      });

      useInventoryStore.getState().loadPacks();
    } else {
      // For regular drafts (preview or finalized), just delete the record
      // Note: finalized regular drafts do NOT revert inventory on delete
      await runTransaction(db, async (transaction) => {
        const draftDocRef = doc(db, 'drafts', draftId);
        const snap = await transaction.get(draftDocRef);
        if (!snap.exists()) throw new Error('Draft not found.');
        transaction.delete(draftDocRef);
      });
    }

    set(state => ({ drafts: state.drafts.filter(d => d.id !== draftId) }));
  },

  markRestockComplete: async (draftId) => {
    await updateDoc(doc(db, 'drafts', draftId), { restockComplete: true });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, restockComplete: true } : d),
    }));
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/state/draftHistoryStore.ts
git commit -m "feat: update draftHistoryStore for unified schema, remove userId filter, add saveDraft"
```

---

## Task 9: Update sessionStore — add userId to players, save draft on confirm

**Files:**
- Modify: `src/state/sessionStore.ts`

- [ ] **Step 1: Add `userId` to the `Player` interface**

Change the `Player` interface:

```typescript
export interface Player {
  id: string;
  name: string;
  userId: string | null;    // linked registered user, null for guests
  selectedPacks: Pack[];
}
```

- [ ] **Step 2: Update `initializeSession` to accept optional userId per player**

Change the signature:

```typescript
initializeSession: (
  numPlayers: number,
  playerNames: string[],
  playerUserIds?: (string | null)[],
  numPacks?: number
) => void;
```

Update the implementation body:

```typescript
initializeSession: (numPlayers, playerNames, playerUserIds = [], numPacks) => {
  const { packs: inventory } = useInventoryStore.getState();
  const players: Player[] = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: `player-${i + 1}`,
      name: playerNames[i] || `Player ${i + 1}`,
      userId: playerUserIds[i] ?? null,
      selectedPacks: [],
    });
  }
  set({
    sessionId: crypto.randomUUID(),
    players,
    numPacks: numPacks || numPlayers * 3,
    packsSelectedOrder: [],
    tempInventory: inventory.map(p => ({ ...p })),
    confirmed: false,
  });
},
```

- [ ] **Step 3: Update `confirmSession` to save the draft record via draftHistoryStore**

Replace `confirmSession`:

```typescript
confirmSession: async () => {
  const { packsSelectedOrder, players, sessionId } = get();
  const { confirmSessionPicks } = useInventoryStore.getState();
  const { saveDraft } = useDraftHistoryStore.getState();
  const uid = auth.currentUser?.uid;

  if (packsSelectedOrder.length === 0 || !uid) return;

  try {
    await confirmSessionPicks(packsSelectedOrder);

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
    });

    set({ confirmed: true });
  } catch (error) {
    console.error('Failed to confirm session:', error);
  }
},
```

- [ ] **Step 4: Add missing imports to sessionStore**

At the top of `sessionStore.ts`, add:

```typescript
import { auth } from '../firebase';
import { useDraftHistoryStore } from './draftHistoryStore';
```

- [ ] **Step 5: Commit**

```bash
git add src/state/sessionStore.ts
git commit -m "feat: add userId to session players and save unified draft record on confirm"
```

---

## Task 10: Firestore security rules and .env setup

**Files:**
- Create: `firestore.rules`
- Modify: `.env` (document only — not committed)

- [ ] **Step 1: Add `VITE_ADMIN_EMAIL` to `.env`**

In the project root `.env` file (create if missing), add:

```
VITE_ADMIN_EMAIL=your-email@example.com
```

Add `.env` to `.gitignore` if not already present.

- [ ] **Step 2: Create `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthed() {
      return request.auth != null;
    }

    function userDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isApproved() {
      return isAuthed() && userDoc().status == 'approved';
    }

    function isAdmin() {
      return isApproved() && userDoc().role == 'admin';
    }

    // Users — anyone can create their own; only admin can read all or change status/role
    match /users/{userId} {
      allow read: if isAuthed() && (request.auth.uid == userId || isAdmin());
      allow create: if isAuthed() && request.auth.uid == userId;
      allow update: if isAdmin()
        || (isAuthed() && request.auth.uid == userId
            && !request.resource.data.diff(resource.data).affectedKeys()
                .hasAny(['role', 'status']));
    }

    // Pack catalog — approved users read; admin write
    match /packCatalog/{packId} {
      allow read: if isApproved();
      allow write: if isAdmin();
    }

    // Chaos inventory — approved users read; admin write
    match /packs/{packId} {
      allow read: if isApproved();
      allow write: if isAdmin();
    }

    // Private inventory — approved users read all (for Draft Inventory view);
    // users write only their own
    match /privateInventory/{itemId} {
      allow read: if isApproved();
      allow create, update: if isApproved()
        && request.resource.data.ownerId == request.auth.uid;
      allow delete: if isApproved()
        && resource.data.ownerId == request.auth.uid;
    }

    // Drafts — approved users read all and create;
    // only admin can set status to 'finalized'
    match /drafts/{draftId} {
      allow read: if isApproved();
      allow create: if isApproved();
      allow update: if isApproved() && (
        isAdmin()
        || !request.resource.data.diff(resource.data).affectedKeys()
            .hasAny(['status', 'finalizedAt', 'finalizedBy', 'allocation'])
      );
      allow delete: if isAdmin();
    }

    // Mail — write-only for Firebase Trigger Email extension
    match /mail/{mailId} {
      allow create: if isAuthed();
    }
  }
}
```

- [ ] **Step 3: Deploy rules**

```bash
firebase deploy --only firestore:rules
```

Expected: `Deploy complete!`

- [ ] **Step 4: Commit rules file**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for multi-user access control"
```

---

## Task 11: Update Auth.tsx — name field, pending/denied screens

**Files:**
- Modify: `src/components/Auth.tsx`

- [ ] **Step 1: Replace the entire `Auth.tsx` with the updated version**

```typescript
import { useState, useEffect } from 'react';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useUserStore } from '../state/userStore';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { createProfile } = useUserStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail(''); setPassword('');
    } catch (err: unknown) {
      setError((err as Error).message.replace('Firebase: ', ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await createProfile(credential.user.uid, name.trim(), email);
      setEmail(''); setPassword(''); setName('');
    } catch (err: unknown) {
      setError((err as Error).message.replace('Firebase: ', ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogOut = async () => {
    await signOut(auth);
  };

  if (loading) return null;

  // Logged-in state: just a logout button (shown in header)
  if (user) {
    return (
      <div className="flex justify-end">
        <button
          onClick={handleLogOut}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-sm transition-all"
        >
          Log Out
        </button>
      </div>
    );
  }

  // Logged-out state: login / signup form
  return (
    <div className="w-full max-w-xl p-10 space-y-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
      <h2 className="text-3xl font-extrabold text-center text-white">
        {isSignUp ? 'Create Account' : 'Welcome Back'}
      </h2>

      <form className="space-y-5" onSubmit={isSignUp ? handleSignUp : handleLogIn}>
        {isSignUp && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your full name"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-all"
        >
          {submitting ? 'Please wait…' : isSignUp ? 'Sign Up' : 'Log In'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-400">
        {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          className="text-blue-400 hover:underline"
        >
          {isSignUp ? 'Log in' : 'Sign up'}
        </button>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Auth.tsx
git commit -m "feat: add name field to registration and toggle between login/signup"
```

---

## Task 12: Update App.tsx — role-based access, auth states, updated routing

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the entire `App.tsx`**

```typescript
import { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useInventoryStore } from './state/inventoryStore';
import { useDraftHistoryStore } from './state/draftHistoryStore';
import { useUserStore } from './state/userStore';
import { usePackCatalogStore } from './state/packCatalogStore';
import { usePrivateInventoryStore } from './state/privateInventoryStore';
import Auth from './components/Auth';
import Inventory from './pages/Inventory';
import DraftHub from './pages/DraftHub';
import Draft from './pages/Draft';
import DraftHistory from './pages/DraftHistory';
import Admin from './pages/Admin';

const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
};

// Pending approval screen
function PendingScreen() {
  const handleLogOut = () => auth.signOut();
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold text-yellow-400">Account Pending Approval</h2>
        <p className="text-gray-300">Your registration has been received. You'll get access once an admin approves your account.</p>
        <button
          onClick={handleLogOut}
          className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

// Denied screen
function DeniedScreen() {
  const handleLogOut = () => auth.signOut();
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold text-red-400">Access Denied</h2>
        <p className="text-gray-300">Your registration request was not approved. Please contact the admin if you believe this is a mistake.</p>
        <button
          onClick={handleLogOut}
          className="mt-4 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const { profile, startListening, stopListening } = useUserStore();
  const loadPacks = useInventoryStore(s => s.loadPacks);
  const clearPacks = useInventoryStore(s => s.clearAll);
  const loadDrafts = useDraftHistoryStore(s => s.loadDrafts);
  const clearDrafts = useDraftHistoryStore(s => s.clearDrafts);
  const loadCatalog = usePackCatalogStore(s => s.loadEntries);
  const loadMyInventory = usePrivateInventoryStore(s => s.loadMyInventory);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (user) {
        startListening(user.uid);
      } else {
        stopListening();
        clearPacks();
        clearDrafts();
      }
    });
    return () => unsub();
  }, []);

  // Once profile is approved, load app data
  useEffect(() => {
    if (profile?.status === 'approved') {
      loadPacks();
      loadDrafts();
      loadCatalog();
      loadMyInventory();
    }
  }, [profile?.status]);

  if (authLoading || (firebaseUser && !profile)) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="text-xl font-semibold">Loading…</div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
        <Auth />
      </div>
    );
  }

  if (profile?.status === 'pending') return <PendingScreen />;
  if (profile?.status === 'denied') return <DeniedScreen />;

  const isAdmin = profile?.role === 'admin';

  return (
    <Router>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
        <header className="bg-gray-900 p-4 flex flex-col md:flex-row justify-between items-center shadow-lg gap-4 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-blue-400 flex-shrink-0">MTG Chaos Draft</h1>
          <nav className="flex items-center space-x-2">
            <NavLink to="/">Draft</NavLink>
            <NavLink to="/inventory">Inventory</NavLink>
            <NavLink to="/history">History</NavLink>
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="w-full md:w-auto">
            <Auth />
          </div>
        </header>

        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<DraftHub />} />
            <Route path="/draft" element={<Draft />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/history" element={<DraftHistory />} />
            {isAdmin && <Route path="/admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: update App with role-based tabs, pending/denied screens, and new routes"
```

---

*Continue in Part 2: `2026-04-20-multi-profile-inventory-plan-part2.md`*
