'use client';

// /reset?token=XYZ
//
// Public-facing password reset page. The link in the reset email points here.
// No admin auth required — the token in the URL is the proof of identity.

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  useEffect(() => {
    if (!token) setError('Reset link is missing the token. Request a new one.');
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setLoading(true);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`,
        { token, newPassword: password }
      );
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset password. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
        <span className="text-5xl">✅</span>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">Password reset</h2>
        <p className="mt-2 text-gray-600">
          Your password has been updated. Open the Blood Bridge app and sign in with your new password.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-xl">
      <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
      <p className="mt-1 text-sm text-gray-500">Choose a new password (min. 8 characters).</p>

      <label className="block text-sm font-medium text-gray-700 mt-6 mb-1">New password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
        disabled={loading || !token}
        autoFocus
      />

      <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">Confirm password</label>
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repeat new password"
        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
        disabled={loading || !token}
      />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading || !token || !password || !confirm}
        className="mt-5 w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
      >
        {loading ? 'Saving…' : 'Reset password'}
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-5xl">🩸</span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Blood Bridge</h1>
        </div>
        <Suspense fallback={<div className="text-center text-gray-400">Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
