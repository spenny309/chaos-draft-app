import { create } from "zustand";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  where,
  query,
  runTransaction,
  writeBatch,
  getDoc,
  deleteField,
} from "firebase/firestore";
import { db, auth } from "../firebase";

export interface Pack {
  id: string; // Firestore document ID (string)
  name: string;
  imageUrl: string;
  inPerson: number;
  inTransit: number;
  ownerId: string; // ID of the user who owns this pack
}

interface InventoryState {
  packs: Pack[];
  loading: boolean;
  addPack: (pack: Omit<Pack, "id" | "ownerId">) => Promise<void>;
  updatePack: (pack: Pack) => Promise<void>;
  deletePack: (id: string) => Promise<void>;
  loadPacks: () => Promise<void>;
  clearAll: () => Promise<void>;
  confirmSessionPicks: (selectedPacks: Pack[]) => Promise<void>;
}

const packsCollectionRef = collection(db, "packs");

export const useInventoryStore = create<InventoryState>((set, get) => ({
  packs: [],
  loading: true,

  loadPacks: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return set({ packs: [], loading: false });

    set({ loading: true });
    try {
      const q = query(packsCollectionRef, where("ownerId", "==", userId));
      const querySnapshot = await getDocs(q);
      const packs: Pack[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Pack));
      set({ packs, loading: false });
    } catch (error) {
      console.error("Error loading packs: ", error);
      // This is often a permission error or a missing index.
      // Check the developer console for a link to create the index.
      set({ loading: false });
    }
  },

  /**
   * ✅ UPDATED addPack function with "upsert" logic.
   * If a pack with the same name exists, it updates the quantity and image.
   * Otherwise, it creates a new pack.
   */
  addPack: async (pack) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      // 1. Check for duplicates (same name, same owner)
      const q = query(
        packsCollectionRef,
        where("ownerId", "==", userId),
        where("name", "==", pack.name)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // 2. DUPLICATE FOUND: Update the existing pack
        const existingDoc = querySnapshot.docs[0];
        const existingPack = existingDoc.data() as Omit<Pack, "id">;
        const docRef = doc(db, "packs", existingDoc.id);

        await updateDoc(docRef, {
          inPerson: existingPack.inPerson + pack.inPerson,
          inTransit: existingPack.inTransit + pack.inTransit,
          imageUrl: pack.imageUrl, // Use the new image URL
        });
      } else {
        // 3. NEW PACK: Add it
        await addDoc(packsCollectionRef, {
          ...pack,
          ownerId: userId,
        });
      }
      
      // 4. Refresh the state from the DB to show the change
      await get().loadPacks();

    } catch (error) {
      console.error("Error adding pack: ", error);
      // IMPORTANT: See note below about this error.
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
        set((state) => ({ packs: state.packs.filter((p) => p.id !== id) }));
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

      set({ packs: [] });
    } catch (error) {
      console.error("Error clearing all packs: ", error);
    }
  },

  confirmSessionPicks: async (selectedPacks) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const packCounts = new Map<string, number>();
    for (const pack of selectedPacks) {
      packCounts.set(pack.id, (packCounts.get(pack.id) || 0) + 1);
    }

    try {
      await runTransaction(db, async (transaction) => {
        const docsToUpdate: {
          docRef: any;
          newQuantity: number;
        }[] = [];

        // 1. READS FIRST
        for (const [packId, numPicked] of packCounts.entries()) {
          const docRef = doc(db, "packs", packId);
          const packDoc = await transaction.get(docRef);

          if (!packDoc.exists() || packDoc.data().ownerId !== userId) {
            throw new Error(`Pack ${packId} not found or permission denied.`);
          }

          const newQuantity = Math.max(
            0,
            packDoc.data().inPerson - numPicked
          );
          docsToUpdate.push({ docRef, newQuantity });
        }

        // 2. WRITES SECOND
        for (const { docRef, newQuantity } of docsToUpdate) {
          transaction.update(docRef, { inPerson: newQuantity });
        }
      });

      await get().loadPacks(); // Refresh state after transaction
    } catch (error) {
      console.error("Failed to confirm session transaction: ", error);
    }
  },
}));