import { useState } from 'react';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { useUserStore } from '../state/userStore';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { createProfile } = useUserStore();
  const currentUser = auth.currentUser;

  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail(''); setPassword('');
    } catch (err: unknown) {
      setError((err as Error).message.replace('Firebase: ', ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await createProfile(credential.user.uid, name.trim(), email);
      setEmail(''); setPassword(''); setName('');
    } catch (err: unknown) {
      setError((err as Error).message.replace('Firebase: ', ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogOut = async () => {
    await signOut(auth);
  };

  // Logged-in state: just a logout button (shown in header)
  if (currentUser) {
    return (
      <div className="flex justify-end">
        <button
          onClick={handleLogOut}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-sm transition-all"
        >
          Log Out
        </button>
      </div>
    );
  }

  // Logged-out state: login / signup form
  return (
    <div className="w-full max-w-xl p-10 space-y-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
      <h2 className="text-3xl font-extrabold text-center text-white">
        {isSignUp ? 'Create Account' : 'Welcome Back'}
      </h2>

      <form className="space-y-5" onSubmit={isSignUp ? handleSignUp : handleLogIn}>
        {isSignUp && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your full name"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-all"
        >
          {submitting ? 'Please wait…' : isSignUp ? 'Sign Up' : 'Log In'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-400">
        {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          className="text-blue-400 hover:underline"
        >
          {isSignUp ? 'Log in' : 'Sign up'}
        </button>
      </p>
    </div>
  );
}
