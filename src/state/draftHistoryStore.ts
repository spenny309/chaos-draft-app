import { create } from "zustand";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
  where,
  doc,
  runTransaction,
  updateDoc, // 👈 ADDED
} from "firebase/firestore";
import { useInventoryStore } from "./inventoryStore";

// Define the types for our draft history data
export interface DraftedPack {
  id: string;
  name: string;
  imageUrl: string;
}

export interface DraftPlayer {
  id: string;
  name: string;
  packs: DraftedPack[];
}

export interface DraftHistoryEntry {
  id: string; // Firestore document ID
  sessionId: string;
  userId: string;
  completedAt: Timestamp;
  players: DraftPlayer[];
  restockComplete: boolean; // 👈 ADDED
}

interface DraftHistoryState {
  drafts: DraftHistoryEntry[];
  loading: boolean;
  error: string | null;
  loadDrafts: () => Promise<void>;
  clearDrafts: () => void;
  deleteDraft: (draftId: string, players: DraftPlayer[]) => Promise<void>;
  markRestockComplete: (draftId: string) => Promise<void>; // 👈 ADDED
}

export const useDraftHistoryStore = create<DraftHistoryState>((set) => ({
  drafts: [],
  loading: true,
  error: null,
  loadDrafts: async () => {
    const user = auth.currentUser;
    if (!user) return; // Should not happen if called correctly

    set({ loading: true, error: null });
    try {
      const draftsCollection = collection(db, "drafts");
      const q = query(
        draftsCollection,
        where("userId", "==", user.uid),
        orderBy("completedAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const draftsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as DraftHistoryEntry)
      );
      set({ drafts: draftsData, loading: false });
    } catch (err)
    {
      console.error("Error fetching draft history:", err);
      set({ error: "Failed to load draft history.", loading: false });
    }
  },
  clearDrafts: () => {
    set({ drafts: [], loading: false, error: null });
  },

  deleteDraft: async (draftId: string, players: DraftPlayer[]) => {
    const user = auth.currentUser;
    if (!user) {
      console.error("User not authenticated to delete draft.");
      return;
    }

    // 1. Aggregate all packs and their counts from the draft
    const packCounts = new Map<string, number>();
    for (const player of players) {
      for (const pack of player.packs) {
        // Use pack.id, which should be the Firestore document ID
        packCounts.set(pack.id, (packCounts.get(pack.id) || 0) + 1);
      }
    }

    if (packCounts.size === 0) {
      console.warn(
        "No packs found in this draft to revert. Deleting draft entry only."
      );
    }

    try {
      // 2. Run a transaction
      await runTransaction(db, async (transaction) => {
        const draftDocRef = doc(db, "drafts", draftId);

        // --- READS ---
        // First, check if draft exists and belongs to user
        const draftDoc = await transaction.get(draftDocRef);
        if (!draftDoc.exists() || draftDoc.data().userId !== user.uid) {
          throw new Error("Draft not found or permission denied.");
        }

        const packRefsAndData = new Map<any, { newInPerson: number }>();

        // Read all packs that need to be updated
        for (const [packId, count] of packCounts.entries()) {
          const packDocRef = doc(db, "packs", packId);
          const packDoc = await transaction.get(packDocRef);

          let newInPerson = count;
          if (packDoc.exists() && packDoc.data().ownerId === user.uid) {
            // If pack exists, add to its current quantity
            newInPerson = (packDoc.data().inPerson || 0) + count;
          }
          // If pack doesn't exist, we'll just set its quantity (though it should exist)

          packRefsAndData.set(packDocRef, { newInPerson });
        }

        // --- WRITES ---
        // Update all pack quantities
        for (const [packDocRef, data] of packRefsAndData.entries()) {
          // Note: `update` will fail if the doc doesn'File exist.
          // Use `set` with `merge: true` if you want to recreate a deleted pack.
          // For this use case, `update` is safer.
          transaction.update(packDocRef, { inPerson: data.newInPerson });
        }

        // Finally, delete the draft
        transaction.delete(draftDocRef);
      });

      // 3. If transaction is successful, update local state
      console.log("Draft successfully deleted and inventory reverted.");
      set((state) => ({
        drafts: state.drafts.filter((d) => d.id !== draftId),
      }));

      // 4. Tell the inventory store to re-fetch its data
      useInventoryStore.getState().loadPacks();
    } catch (err) {
      console.error("Transaction failed: ", err);
      // Optionally, set an error state here for the UI
    }
  },

  // 👇 --- ADDED THIS ENTIRE FUNCTION ---
  markRestockComplete: async (draftId: string) => {
    const user = auth.currentUser;
    if (!user) {
      console.error("User not authenticated.");
      return;
    }

    const draftDocRef = doc(db, "drafts", draftId);

    try {
      // Set restockComplete to true
      await updateDoc(draftDocRef, {
        restockComplete: true,
      });

      // Update the state locally
      set((state) => ({
        drafts: state.drafts.map((draft) =>
          draft.id === draftId
            ? { ...draft, restockComplete: true }
            : draft
        ),
      }));
    } catch (err) {
      console.error("Error marking restock as complete: ", err);
      // Optionally set an error state
    }
  },
}));