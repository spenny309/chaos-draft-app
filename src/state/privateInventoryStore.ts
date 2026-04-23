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
    try {
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
    } catch {
      set({ isLoading: false });
    }
  },

  loadAllInventory: async () => {
    set({ isLoading: true });
    try {
      const snap = await getDocs(collection(db, 'privateInventory'));
      const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateInventoryItem));
      set({ allItems, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addOrUpdateItem: async (catalogId, name, imageUrl, count) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
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
    } finally {
      await get().loadMyInventory();
    }
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

    // Resolve document references BEFORE entering the transaction
    const docRefs: { ref: ReturnType<typeof doc>; count: number }[] = [];
    for (const { userId, catalogId, count } of deductions.values()) {
      const snap = await getDocs(
        query(
          collection(db, 'privateInventory'),
          where('ownerId', '==', userId),
          where('catalogId', '==', catalogId)
        )
      );
      if (!snap.empty) {
        docRefs.push({ ref: snap.docs[0].ref, count });
      }
    }

    await runTransaction(db, async (transaction) => {
      // Reads first (using transaction.get for conflict detection)
      const updates: { ref: ReturnType<typeof doc>; newCount: number }[] = [];
      for (const { ref, count } of docRefs) {
        const snap = await transaction.get(ref);
        if (snap.exists()) {
          const current = snap.data().count as number;
          updates.push({ ref, newCount: Math.max(0, current - count) });
        }
      }
      // Writes second
      for (const { ref, newCount } of updates) {
        transaction.update(ref, { count: newCount });
      }
    });

    await get().loadMyInventory();
    await get().loadAllInventory();
  },
}));
