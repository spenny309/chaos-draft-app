import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation, // Import useLocation
} from "react-router-dom";
import Inventory from "./pages/Inventory";
import SessionSetup from "./pages/SessionSetup";
import Draft from "./pages/Draft";

// Firebase & Auth Imports
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
// Assuming state is in src/state
import { useInventoryStore } from "./state/inventoryStore";
import Auth from "./components/Auth";

// NavLink component to handle active state
const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? "bg-blue-600 text-white"
          : "text-gray-300 hover:bg-gray-700 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPacks = useInventoryStore((s) => s.loadPacks);
  const clearPacks = () =>
    useInventoryStore.setState({ packs: [], loading: false });

  // Top-level listener for auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        loadPacks();
      } else {
        clearPacks();
      }
    });
    return () => unsubscribe();
  }, [loadPacks]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="text-xl font-semibold">Loading Application...</div>
      </div>
    );
  }

  // If no user, render ONLY the Auth component in a centered layout.
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
        <Auth />
      </div>
    );
  }

  // If we have a user, render the full app.
  return (
    <Router>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
        {/* Updated Header */}
        <header className="bg-gray-900 p-4 flex flex-col md:flex-row justify-between items-center shadow-lg gap-4 border-b border-gray-700">
          <div className="flex-shrink-0">
            <h1 className="text-2xl font-bold text-blue-400">
              MTG Chaos Draft
            </h1>
          </div>

          <nav className="flex items-center space-x-2">
            {/* --- UPDATED LINKS --- */}
            <NavLink to="/">Session Setup</NavLink>
            <NavLink to="/draft">Draft</NavLink>
            <NavLink to="/inventory">Inventory</NavLink>
          </nav>

          <div className="w-full md:w-auto">
            <Auth />
          </div>
        </header>

        {/* Updated main background color */}
        <main className="flex-1 p-6">
          <Routes>
            {/* --- UPDATED ROUTES --- */}
            <Route path="/" element={<SessionSetup />} />
            <Route path="/draft" element={<Draft />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

