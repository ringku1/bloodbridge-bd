'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import Badge from '@/components/Badge';

const BLOOD_GROUPS = ['A_POS','A_NEG','B_POS','B_NEG','O_POS','O_NEG','AB_POS','AB_NEG'];
const BG_LABEL = { A_POS:'A+', A_NEG:'A-', B_POS:'B+', B_NEG:'B-', O_POS:'O+', O_NEG:'O-', AB_POS:'AB+', AB_NEG:'AB-' };

export default function UsersPage() {
  const [users,   setUsers]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');
  const [bg,      setBg]      = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (status) params.verifiedStatus = status;
      if (bg)     params.bloodGroup = bg;
      const res = await api.get('/admin/users', { params });
      setUsers(res.data.users);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      console.error('[Admin]', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, bg]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function handleFilter() { setPage(1); fetchUsers(); }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total users</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 w-56"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400">
          <option value="">All statuses</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
        </select>
        <select value={bg} onChange={(e) => { setBg(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400">
          <option value="">All blood groups</option>
          {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{BG_LABEL[g]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Blood</th>
              <th className="px-5 py-3">District</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Available</th>
              <th className="px-5 py-3">Requests</th>
              <th className="px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No users found</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900">{u.name || <span className="text-gray-400">—</span>}</td>
                <td className="px-5 py-3 text-gray-600 text-xs">
                  {u.email}
                  {u.emailVerified && <span className="ml-1 text-green-600">✓</span>}
                </td>
                <td className="px-5 py-3">
                  {u.bloodGroup
                    ? <span className="font-bold text-red-600">{BG_LABEL[u.bloodGroup]}</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-5 py-3 text-gray-600">{u.district || '—'}</td>
                <td className="px-5 py-3"><Badge value={u.verifiedStatus} /></td>
                <td className="px-5 py-3">
                  <Badge value={u.isAvailable} label={u.isAvailable ? 'Yes' : 'No'} />
                </td>
                <td className="px-5 py-3 text-gray-500">{u._count.requests}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <button disabled={page === pages} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
