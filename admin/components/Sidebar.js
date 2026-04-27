'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

const links = [
  { href: '/dashboard',      label: 'Dashboard',      icon: '📊' },
  { href: '/verifications',  label: 'Verifications',  icon: '🪪' },
  { href: '/users',          label: 'Users',          icon: '👥' },
  { href: '/requests',       label: 'Blood Requests', icon: '🩸' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  function handleLogout() {
    Cookies.remove('admin_secret');
    router.push('/login');
  }

  return (
    <aside className="w-64 min-h-screen bg-gray-900 flex flex-col">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-2xl">🩸</span>
        <span className="ml-2 text-white font-bold text-lg">Blood Bridge</span>
        <p className="text-gray-400 text-xs mt-0.5">Admin Dashboard</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-red-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-5">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span>🚪</span> Logout
        </button>
      </div>
    </aside>
  );
}
