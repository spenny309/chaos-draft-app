import { create } from 'zustand';
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Cube } from '../types';

interface CubeStore {
  cubes: Cube[];
  loading: boolean;
  addCube: (data: Omit<Cube, 'id' | 'createdAt'>) => Promise<void>;
  deleteCube: (id: string) => Promise<void>;
}

export const useCubeStore = create<CubeStore>((set) => {
  // Store is a module-level singleton for the full app lifetime; unsubscribe is intentionally omitted.
  onSnapshot(collection(db, 'cubes'), (snap) => {
    const cubes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Cube));
    set({ cubes, loading: false });
  });

  return {
    cubes: [],
    loading: true,

    addCube: async ({ name, imageUrl, externalUrl, createdBy }) => {
      const data: Record<string, unknown> = {
        name,
        createdAt: serverTimestamp(),
        createdBy,
      };
      if (imageUrl !== undefined) data.imageUrl = imageUrl;
      if (externalUrl !== undefined) data.externalUrl = externalUrl;
      await addDoc(collection(db, 'cubes'), data);
    },

    deleteCube: async (id) => {
      await deleteDoc(doc(db, 'cubes', id));
    },
  };
});
