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
  linkDraftPlayers: (draftId: string, players: Draft['players']) => Promise<void>;
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

  linkDraftPlayers: async (draftId, players) => {
    await updateDoc(doc(db, 'drafts', draftId), { players });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, players } : d),
    }));
  },
}));
