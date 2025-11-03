import { useState, useEffect } from "react";
import { auth } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import type { User } from "firebase/auth";

// Simple "Lock" icon as a placeholder
const AuthIcon = () => (
  <svg
    className="w-14 h-14 text-blue-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err.message.replace("Firebase: ", ""));
    }
  };

  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err.message.replace("Firebase: ", ""));
    }
  };

  const handleLogOut = async () => {
    setError("");
    try {
      await signOut(auth);
    } catch (err: any) {
      setError(err.message.replace("Firebase: ", ""));
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-400">Loading user...</div>;
  }

  // --- LOGGED IN STATE ---
  if (user) {
    return (
      <div className="flex justify-end items-center w-full">
        <button
          onClick={handleLogOut}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-sm transition-all hover:shadow-lg"
        >
          Log Out
        </button>
      </div>
    );
  }

  // --- LOGGED OUT STATE (NEW DESIGN) ---
  // This part will be centered on the whole page by the new App.tsx logic
  return (
    <div
      className="w-full max-w-xl p-10 space-y-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700
                 transition-all duration-300 ease-in-out hover:scale-[1.01] hover:shadow-blue-500/20"
    >
      <div className="flex flex-col items-center">
        <AuthIcon />
        <h2 className="mt-6 text-4xl font-extrabold text-center text-white">
          Welcome Back
        </h2>
        <p className="mt-2 text-center text-lg text-gray-400">
          Log in or sign up to manage your drafts
        </p>
      </div>

      <form className="space-y-6">
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
            className="mt-1 block w-full px-4 py-4 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            className="mt-1 block w-full px-4 py-4 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p className="text-sm text-red-400 text-center font-medium">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-4 pt-4">
          <button
            onClick={handleLogIn}
            type="submit"
            className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-blue-500/30 text-base"
          >
            Log In
          </button>
          <button
            onClick={handleSignUp}
            type="button"
            className="w-full py-4 px-4 bg-gray-800 text-gray-300 ring-2 ring-gray-600 hover:bg-gray-700 font-bold rounded-lg transition-all text-base"
          >
            Sign Up
          </button>
        </div>
      </form>
    </div>
  );
}