'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import Badge from '@/components/Badge';

export default function VerificationsPage() {
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [photo,        setPhoto]        = useState(null);   // { url, name }
  const [working,      setWorking]      = useState(null);   // userId being approved/rejected
  const [loadingPhoto, setLoadingPhoto] = useState(null);   // userId whose photo is loading

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/verify/admin/pending');
      setUsers(res.data.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  async function handleViewPhoto(user) {
    setLoadingPhoto(user.id);
    try {
      // Fetch image bytes through the API (sends x-admin-secret header automatically).
      // This avoids presigned URLs that embed the S3 host — which breaks in production
      // when AWS_ENDPOINT / MINIO_PUBLIC_URL point to a local Docker address.
      const res = await api.get(`/verify/admin/${user.id}/nid-photo`, { responseType: 'blob' });
      const url  = URL.createObjectURL(res.data);
      setPhoto({ url, name: user.name });
    } catch {
      alert('Could not load photo. The file may not have been uploaded yet.');
    } finally {
      setLoadingPhoto(null);
    }
  }

  async function handleDecision(userId, status) {
    setWorking(userId);
    try {
      await api.put(`/verify/admin/${userId}`, { status });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      alert('Action failed. Please try again.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NID Verifications</h1>
          <p className="text-gray-500 text-sm mt-1">{users.length} pending review</p>
        </div>
        <button onClick={fetchPending} className="text-sm text-red-600 hover:text-red-700 font-medium">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium">No pending verifications</p>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-5">
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{user.name || 'No name'}</p>
                <p className="text-sm text-gray-500 mt-0.5">{user.id}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Submitted {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {user.nidPhotoUrl && (
                  <button
                    onClick={() => handleViewPhoto(user)}
                    disabled={loadingPhoto === user.id}
                    className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  >
                    {loadingPhoto === user.id ? 'Loading…' : 'View Photo'}
                  </button>
                )}
                <button
                  disabled={working === user.id}
                  onClick={() => handleDecision(user.id, 'VERIFIED')}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  Approve
                </button>
                <button
                  disabled={working === user.id}
                  onClick={() => handleDecision(user.id, 'UNVERIFIED')}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo modal */}
      {photo && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl p-4 max-w-lg w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-800">NID Photo — {photo.name}</p>
              <button onClick={() => setPhoto(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <img
              src={photo.url}
              alt="NID"
              className="w-full rounded-lg object-contain max-h-96"
            />
            <p className="text-xs text-gray-400 mt-2 text-center">Served securely through the API</p>
          </div>
        </div>
      )}
    </div>
  );
}
