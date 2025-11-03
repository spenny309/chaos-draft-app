import { create } from "zustand";
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
  writeBatch,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase"; // Import from your firebase.ts

export interface Pack {
  id: string; // Firestore document ID (string)
  name: string;
  imageUrl: string;
  quantity: number;
  ownerId: string; // ID of the user who owns this pack
}

interface InventoryState {
  packs: Pack[];
  loading: boolean;
  addPack: (pack: Omit<Pack, "id" | "ownerId">) => Promise<void>;
  updatePack: (pack: Pack) => Promise<void>;
  deletePack: (id: string) => Promise<void>; // ID is now string
  loadPacks: () => Promise<void>;
  clearAll: () => Promise<void>;
  confirmSessionPicks: (selectedPacks: Pack[]) => Promise<void>;
}

// Helper reference to the 'packs' collection
const packsCollectionRef = collection(db, "packs");

export const useInventoryStore = create<InventoryState>((set, get) => ({
  packs: [],
  loading: true,

  loadPacks: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return set({ packs: [], loading: false });
    }

    set({ loading: true });
    try {
      // This query works because App.tsx only calls it AFTER login,
      // and it only queries for the user's own packs.
      const q = query(packsCollectionRef, where("ownerId", "==", userId));
      const querySnapshot = await getDocs(q);
      const packs: Pack[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Pack));
      set({ packs, loading: false });
    } catch (error) {
      console.error("Error loading packs: ", error);
      // This is a good place to check your Firestore Security Rules!
      set({ loading: false });
    }
  },

  addPack: async (pack) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      console.error("Cannot add pack, no user logged in.");
      return;
    }

    try {
      // We no longer check for duplicates, which removes the
      // complex query that was failing.
      await addDoc(packsCollectionRef, {
        ...pack,
        ownerId: userId,
      });

      // After adding, reload all packs from the DB to update the state
      await get().loadPacks();
    } catch (error) {
      console.error("Error adding pack: ", error);
      // If this fails, check your Firestore Security Rules for 'create'.
    }
  },

  updatePack: async (pack) => {
    const userId = auth.currentUser?.uid;
    if (!userId || pack.ownerId !== userId) {
      console.error("Permission denied or user not found.");
      return;
    }

    try {
      const docRef = doc(db, "packs", pack.id);
      const { id, ownerId, ...packData } = pack;
      await updateDoc(docRef, packData);
      await get().loadPacks(); // Refresh state
    } catch (error) {
      console.error("Error updating pack: ", error);
    }
  },

  deletePack: async (id) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const docRef = doc(db, "packs", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().ownerId === userId) {
        await deleteDoc(docRef);
        set({ packs: get().packs.filter((p) => p.id !== id) }); // Optimistic update
      } else {
        console.error("No such document or permission denied.");
      }
    } catch (error) {
      console.error("Error deleting pack: ", error);
    }
  },

  clearAll: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const q = query(packsCollectionRef, where("ownerId", "==", userId));
      const querySnapshot = await getDocs(q);

      const batch = writeBatch(db);
      querySnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      set({ packs: [] }); // Update state
    } catch (error) {
      console.error("Error clearing all packs: ", error);
    }
  },

  // ✅ --- UPDATED confirmSessionPicks FUNCTION ---
  confirmSessionPicks: async (selectedPacks) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Count how many of each unique pack ID were selected.
    const packCounts = new Map<string, number>();
    for (const pack of selectedPacks) {
      packCounts.set(pack.id, (packCounts.get(pack.id) || 0) + 1);
    }

    try {
      await runTransaction(db, async (transaction) => {
        // --- 1. READ PHASE ---
        // Create an array of all document references we need to read.
        const refsToRead = Array.from(packCounts.keys()).map((packId) =>
          doc(db, "packs", packId)
        );

        // Read all documents in parallel.
        const packDocs = await Promise.all(
          refsToRead.map((ref) => transaction.get(ref))
        );

        const updates: {
          ref: typeof refsToRead[0];
          newQuantity: number;
        }[] = [];

        // --- 2. LOGIC PHASE (no reads or writes) ---
        // Process the results of our reads.
        for (const packDoc of packDocs) {
          if (!packDoc.exists() || packDoc.data().ownerId !== userId) {
            throw new Error(`Pack ${packDoc.id} not found or permission denied.`);
          }

          const numPicked = packCounts.get(packDoc.id) || 0;
          const newQuantity = Math.max(
            0,
            packDoc.data().quantity - numPicked
          );

          updates.push({ ref: packDoc.ref, newQuantity });
        }

        // --- 3. WRITE PHASE ---
        // All reads are done. Now, queue all writes.
        for (const update of updates) {
          transaction.update(update.ref, { quantity: update.newQuantity });
        }
      });

      // After transaction succeeds, reload the state from the DB
      await get().loadPacks();
    } catch (error) {
      console.error("Failed to confirm session transaction: ", error);
    }
  },
}));