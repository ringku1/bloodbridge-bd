// src/config.js
//
// Central place for environment-specific config.
//
// ─── API URL for different environments ───────────────────────────────────────
// The URL depends on WHERE the app is running:
//
//   Physical Android device (on same WiFi as your PC):
//     Replace 192.168.x.x with your PC's local IP.
//     Find it with: ipconfig (Windows) or ifconfig (Linux/Mac)
//
//   Android emulator:
//     10.0.2.2 is a special alias that routes to localhost on the host machine.
//
//   iOS simulator:
//     localhost works directly.
//
//   Production:
//     Your deployed backend URL, e.g. https://api.bloodbridge.app

// export const API_BASE_URL = 'http://10.0.2.2:3000/api'; // Android emulator
export const API_BASE_URL = 'http://192.168.0.112:3000/api'; // physical device on same WiFi
// export const API_BASE_URL = 'https://api.bloodbridge.app/api'; // production

// ─── Brand colors ─────────────────────────────────────────────────────────────
export const COLORS = {
  primary:      '#DC2626', // blood red
  primaryDark:  '#B91C1C',
  primaryLight: '#FEE2E2',
  success:      '#16A34A',
  warning:      '#D97706',
  text:         '#111827',
  textMuted:    '#6B7280',
  border:       '#E5E7EB',
  background:   '#F9FAFB',
  white:        '#FFFFFF',
};
