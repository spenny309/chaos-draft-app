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
import type { UserProfile, PublicProfile } from '../types';

interface UserStore {
  profile: UserProfile | null;
  allUsers: UserProfile[];
  publicProfiles: PublicProfile[];
  isLoading: boolean;
  isRegistering: boolean;
  _unsubscribe: (() => void) | null;
  startListening: (uid: string) => void;
  stopListening: () => void;
  createProfile: (uid: string, name: string, email: string) => Promise<void>;
  loadAllUsers: () => Promise<void>;
  loadPublicProfiles: () => Promise<void>;
  updateUserStatus: (uid: string, status: UserProfile['status']) => Promise<void>;
  setIsRegistering: (v: boolean) => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  allUsers: [],
  publicProfiles: [],
  isLoading: false,
  isRegistering: false,
  _unsubscribe: null,

  startListening: (uid) => {
    get()._unsubscribe?.();
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          set({ profile: { uid, ...snap.data() } as UserProfile });
        } else {
          set({ profile: null });
        }
      },
      (error) => {
        console.error('[userStore] Failed to load user profile:', error.code, error.message);
      }
    );
    set({ _unsubscribe: unsub });
  },

  stopListening: () => {
    get()._unsubscribe?.();
    set({ _unsubscribe: null, profile: null });
  },

  createProfile: async (uid, name, email) => {
    try {
      const profilesSnap = await getDocs(collection(db, 'publicProfiles'));
      const nameLower = name.trim().toLowerCase();
      const taken = profilesSnap.docs.some(d => (d.data().name as string).toLowerCase() === nameLower);
      if (taken) throw new Error('That name is already taken. Please choose a different name.');
    } catch (err) {
      // Re-throw name conflict errors; silently skip if the read itself failed
      if ((err as Error).message.includes('already taken')) throw err;
    }

    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string;
    const isAdmin = email === adminEmail;
    await setDoc(doc(db, 'users', uid), {
      name,
      email,
      role: isAdmin ? 'admin' : 'user',
      status: isAdmin ? 'approved' : 'pending',
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'publicProfiles', uid), { name });
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
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      users.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return a.name.localeCompare(b.name);
      });
      set({ allUsers: users, isLoading: false });
    } catch (err) {
      console.error('Failed to load users:', err);
      set({ isLoading: false });
    }
  },

  setIsRegistering: (v) => set({ isRegistering: v }),

  loadPublicProfiles: async () => {
    try {
      const snap = await getDocs(collection(db, 'publicProfiles'));
      const profiles = snap.docs.map(d => ({ uid: d.id, name: d.data().name as string }));
      profiles.sort((a, b) => a.name.localeCompare(b.name));
      set({ publicProfiles: profiles });
    } catch (err) {
      console.error('Failed to load public profiles:', err);
    }
  },

  updateUserStatus: async (uid, status) => {
    await updateDoc(doc(db, 'users', uid), { status });
    set(state => ({
      allUsers: state.allUsers.map(u => u.uid === uid ? { ...u, status } : u),
    }));
  },
}));
