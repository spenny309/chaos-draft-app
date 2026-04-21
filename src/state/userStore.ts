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
