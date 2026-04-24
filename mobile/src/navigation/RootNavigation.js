// navigation/RootNavigation.js
//
// A navigation ref that lives outside the React tree.
// This lets non-component code (like push notification handlers in hooks)
// navigate without needing a navigation prop.
//
// Usage:
//   import { navigate } from '../navigation/RootNavigation';
//   navigate('DonorRequest', { requestId: '...' });

import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
