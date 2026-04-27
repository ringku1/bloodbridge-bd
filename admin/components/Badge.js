const variants = {
  VERIFIED:   'bg-green-100 text-green-800',
  PENDING:    'bg-yellow-100 text-yellow-800',
  UNVERIFIED: 'bg-gray-100 text-gray-600',
  OPEN:       'bg-blue-100 text-blue-800',
  MATCHED:    'bg-purple-100 text-purple-800',
  FULFILLED:  'bg-green-100 text-green-800',
  EXPIRED:    'bg-gray-100 text-gray-500',
  true:       'bg-green-100 text-green-800',
  false:      'bg-red-100 text-red-700',
};

export default function Badge({ value, label }) {
  const cls = variants[String(value)] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {label ?? String(value)}
    </span>
  );
}
