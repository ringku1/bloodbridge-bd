'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import Badge from '@/components/Badge';

const BLOOD_GROUPS = ['A_POS','A_NEG','B_POS','B_NEG','O_POS','O_NEG','AB_POS','AB_NEG'];
const BG_LABEL = { A_POS:'A+', A_NEG:'A-', B_POS:'B+', B_NEG:'B-', O_POS:'O+', O_NEG:'O-', AB_POS:'AB+', AB_NEG:'AB-' };
const STATUSES = ['OPEN','MATCHED','FULFILLED','EXPIRED'];

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pages,    setPages]    = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [status,   setStatus]   = useState('');
  const [bg,       setBg]       = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (status) params.status     = status;
      if (bg)     params.bloodGroup = bg;
      const res = await api.get('/admin/requests', { params });
      setRequests(res.data.requests);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      console.error('[Admin]', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, status, bg]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blood Requests</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total requests</p>
        </div>
        <button onClick={fetchRequests} className="text-sm text-red-600 hover:text-red-700 font-medium">
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
              <th className="px-5 py-3">Requester</th>
              <th className="px-5 py-3">Blood</th>
              <th className="px-5 py-3">Hospital</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Escalation</th>
              <th className="px-5 py-3">Responses</th>
              <th className="px-5 py-3">Units</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-gray-400">No requests found</td></tr>
            ) : requests.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{r.requester?.name || '—'}</p>
                  <p className="text-xs text-gray-400 font-mono">{r.requester?.phone}</p>
                </td>
                <td className="px-5 py-3 font-bold text-red-600">{BG_LABEL[r.bloodGroup]}</td>
                <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{r.hospitalName}</td>
                <td className="px-5 py-3"><Badge value={r.status} /></td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    r.escalationLevel === 0 ? 'bg-gray-100 text-gray-500'
                    : r.escalationLevel === 1 ? 'bg-orange-100 text-orange-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                    Level {r.escalationLevel}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500">{r._count.responses}</td>
                <td className="px-5 py-3 text-gray-500">{r.unitsNeeded}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-xs">
                  <span className={new Date(r.expiresAt) < new Date() ? 'text-red-400' : 'text-gray-400'}>
                    {new Date(r.expiresAt).toLocaleDateString()}
                  </span>
                </td>
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
