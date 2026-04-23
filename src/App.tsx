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
  const [profileTimedOut, setProfileTimedOut] = useState(false);

  const { profile, startListening, stopListening, loadPublicProfiles, isRegistering } = useUserStore();
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

  // If firebaseUser is set but profile never arrives, show a fallback after 6s
  useEffect(() => {
    if (!firebaseUser || profile) {
      setProfileTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setProfileTimedOut(true), 6000);
    return () => clearTimeout(timer);
  }, [firebaseUser, profile]);

  // Once profile is approved, load app data
  useEffect(() => {
    if (profile?.status === 'approved') {
      loadPacks();
      loadDrafts();
      loadCatalog();
      loadMyInventory();
      loadPublicProfiles();
    }
  }, [profile?.status]);

  if (!isRegistering && (authLoading || (firebaseUser && !profile && !profileTimedOut))) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="text-xl font-semibold">Loading…</div>
      </div>
    );
  }

  if (firebaseUser && !profile && profileTimedOut) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-bold text-yellow-400">Account Pending Approval</h2>
          <p className="text-gray-300">Your registration is awaiting admin approval. You'll be able to log in once your account has been approved.</p>
          <button
            onClick={() => auth.signOut()}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  if (!firebaseUser || isRegistering) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
        <Auth currentUser={null} />
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
            <Auth currentUser={firebaseUser} />
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
