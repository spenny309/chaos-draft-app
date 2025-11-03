import { useState, useEffect } from "react";
// ✅ FIXED: Import auth service from our config, and functions from 'firebase/auth'
import { auth } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
// ✅ FIXED: Import User as a type for verbatimModuleSyntax
import type { User } from "firebase/auth";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Listen for authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // User state will be updated by onAuthStateChanged
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // User state will be updated by onAuthStateChanged
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogOut = async () => {
    setError("");
    try {
      await signOut(auth);
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-400">Loading user...</div>
    );
  }

  if (user) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg shadow-md border border-gray-700 flex justify-between items-center">
        <div>
          <span className="text-gray-300">Logged in as:</span>
          <span className="ml-2 font-semibold text-white">{user.email}</span>
        </div>
        <button
          onClick={handleLogOut}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          Log Out
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
      <form className="space-y-4">
        <h2 className="text-2xl font-bold text-center text-white">
          Login or Sign Up
        </h2>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-300"
          >
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-300"
          >
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
        <div className="flex gap-4">
          <button
            onClick={handleLogIn}
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Log In
          </button>
          <button
            onClick={handleSignUp}
            type="button"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Sign Up
          </button>
        </div>
      </form>
    </div>
  );
}