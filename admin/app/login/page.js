'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import axios from 'axios';

export default function LoginPage() {
  const [secret, setSecret] = useState('');
  const [error,  setError]  = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    if (!secret.trim()) return;
    setLoading(true);
    setError('');

    try {
      // Verify the secret by hitting a protected endpoint
      await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/admin/stats`, {
        headers: { 'x-admin-secret': secret.trim() },
      });

      Cookies.set('admin_secret', secret.trim(), { expires: 7 });
      router.push('/dashboard');
    } catch {
      setError('Invalid admin secret. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-5xl">🩸</span>
          <h1 className="mt-3 text-2xl font-bold text-white">Blood Bridge</h1>
          <p className="text-gray-400 text-sm mt-1">Admin Dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="bg-gray-800 rounded-2xl p-8 shadow-xl">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Admin Secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter your admin secret"
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            autoFocus
          />

          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !secret.trim()}
            className="mt-5 w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Verifying…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
