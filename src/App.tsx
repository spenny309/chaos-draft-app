import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Inventory from "./pages/Inventory";
import SessionSetup from "./pages/SessionSetup";
import Draft from "./pages/Draft";

// Firebase & Auth Imports
// ✅ FIXED: Imported onAuthStateChanged from 'firebase/auth'
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth"; // Import User type
import { useInventoryStore } from "./state/inventoryStore"; // Import inventory store
import Auth from "./components/Auth"; // Import the Auth component

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Get actions from the inventory store
  const loadPacks = useInventoryStore((s) => s.loadPacks);
  const clearPacks = () =>
    useInventoryStore.setState({ packs: [], loading: false });

  // Top-level listener for auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        // User just logged in, load their packs
        loadPacks();
      } else {
        // User just logged out, clear packs from state
        clearPacks();
      }
    });
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [loadPacks]); // Add loadPacks as a dependency

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-xl font-semibold">Loading Application...</div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
        <header className="bg-gray-800 p-4 flex flex-col md:flex-row justify-between items-center shadow-lg gap-4">
          <div className="flex-shrink-0">
            <h1 className="text-2xl font-bold">MTG Chaos Draft</h1>
          </div>

          {/* Show Nav Links only if logged in */}
          {user && (
            <nav className="space-x-4">
              <Link to="/" className="hover:text-blue-400">
                Inventory
              </Link>
              <Link to="/setup" className="hover:text-blue-400">
                Session Setup
              </Link>
              <Link to="/draft" className="hover:text-blue-400">
                Draft
              </Link>
            </nav>
          )}

          {/* Auth component is now part of the header */}
          <div className="w-full md:w-auto">
            <Auth />
          </div>
        </header>

        <main className="flex-1 p-6">
          {/* Conditionally render routes based on user state */}
          {user ? (
            <Routes>
              <Route path="/" element={<Inventory />} />
              <Route path="/setup" element={<SessionSetup />} />
              <Route path="/draft" element={<Draft />} />
            </Routes>
          ) : (
            <div className="text-center text-xl text-gray-400 mt-10">
              <h2 className="text-2xl font-semibold">Welcome!</h2>
              <p>Please log in or sign up to manage your inventory and start a draft.</p>
            </div>
          )}
        </main>
      </div>
    </Router>
  );
}

