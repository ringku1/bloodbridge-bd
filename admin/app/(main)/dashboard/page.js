'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl text-2xl ${color}`}>
        {icon}
      </div>
      <p className="mt-4 text-3xl font-bold text-gray-900">{value ?? '—'}</p>
      <p className="text-sm font-medium text-gray-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats')
      .then((r) => setStats(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-gray-500 text-sm mt-1">Overview of Blood Bridge activity</p>

      {loading ? (
        <p className="mt-8 text-gray-400">Loading…</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard icon="👥" label="Total Users"             value={stats.totalUsers}           color="bg-blue-50"   />
          <StatCard icon="🪪" label="Pending Verifications"  value={stats.pendingVerifications} color="bg-yellow-50" sub="Awaiting NID review" />
          <StatCard icon="🩸" label="Active Requests"        value={stats.activeRequests}       color="bg-red-50"    sub="Open or matched" />
          <StatCard icon="✅" label="Total Donations"        value={stats.totalDonations}       color="bg-green-50"  sub="Confirmed donations" />
        </div>
      )}
    </div>
  );
}
