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
    try {
      const snap = await getDocs(query(collection(db, 'packCatalog'), orderBy('name')));
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() } as PackCatalogEntry));
      set({ entries, isLoading: false });
    } catch (err) {
      console.error('Failed to load pack catalog:', err);
      set({ isLoading: false });
    }
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

    // Update catalog entry itself
    batch.update(doc(db, 'packCatalog', id), updates);

    // Update chaos inventory packs referencing this catalogId
    const packsSnap = await getDocs(
      query(collection(db, 'packs'), where('catalogId', '==', id))
    );
    packsSnap.docs.forEach(d => batch.update(d.ref, updates));

    // Update private inventory items referencing this catalogId
    const privSnap = await getDocs(
      query(collection(db, 'privateInventory'), where('catalogId', '==', id))
    );
    privSnap.docs.forEach(d => batch.update(d.ref, updates));

    await batch.commit();

    // Update draft documents (no array-contains for nested objects — read all and filter)
    const currentEntry = get().entries.find(e => e.id === id);
    const currentName = currentEntry?.name ?? '';
    const draftsSnap = await getDocs(collection(db, 'drafts'));
    const batch2 = writeBatch(db);
    let hasChanges = false;

    draftsSnap.docs.forEach(d => {
      const data = d.data();
      const updateData: Record<string, unknown> = {};

      // Chaos drafts: packsSelectedOrder matched by name (no catalogId in those entries)
      if (Array.isArray(data.packsSelectedOrder)) {
        const updated = data.packsSelectedOrder.map((p: Record<string, unknown>) =>
          p.name === currentName ? { ...p, ...updates } : p
        );
        if (JSON.stringify(updated) !== JSON.stringify(data.packsSelectedOrder)) {
          updateData.packsSelectedOrder = updated;
        }
      }

      // Regular drafts: sets array matched by catalogId
      if (Array.isArray(data.sets)) {
        const updated = data.sets.map((s: Record<string, unknown>) =>
          s.catalogId === id ? { ...s, ...updates } : s
        );
        if (JSON.stringify(updated) !== JSON.stringify(data.sets)) {
          updateData.sets = updated;
        }
      }

      // Regular drafts: allocation array matched by catalogId
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
    // Check for live references before allowing delete
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
