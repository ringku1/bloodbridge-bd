// utils/formatters.js
//
// Pure helper functions for display formatting.
// The backend stores data in a compact format (e.g. "A_POS", "2026-04-22T...").
// These functions convert them to human-readable strings.

import { COLORS } from '../config';

// Map backend blood group enum values → display labels
const BLOOD_GROUP_LABELS = {
  A_POS:  'A+',
  A_NEG:  'A−',
  B_POS:  'B+',
  B_NEG:  'B−',
  O_POS:  'O+',
  O_NEG:  'O−',
  AB_POS: 'AB+',
  AB_NEG: 'AB−',
};

// All blood groups as an array — used by BloodGroupPicker
export const BLOOD_GROUPS = Object.entries(BLOOD_GROUP_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function formatBloodGroup(bloodGroup) {
  return BLOOD_GROUP_LABELS[bloodGroup] || bloodGroup || '—';
}

// "2026-04-22T10:00:00Z" → "22 Apr 2026"
export function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-GB', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  });
}

// Returns "2 hours ago", "3 days ago", etc.
export function timeAgo(dateString) {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Map request status → { label, color }
export function formatRequestStatus(status) {
  const map = {
    OPEN:      { label: 'Open',      color: COLORS.warning },
    MATCHED:   { label: 'Matched',   color: '#2563EB' },
    FULFILLED: { label: 'Fulfilled', color: COLORS.success },
    EXPIRED:   { label: 'Expired',   color: COLORS.textMuted },
  };
  return map[status] || { label: status, color: COLORS.textMuted };
}
