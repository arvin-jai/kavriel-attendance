import type { AppStateStatus } from 'react-native';

/**
 * Whether the app should be doing foreground work. `AppState.currentState` can be `null` or
 * `'unknown'` right after launch, so only an explicit background/inactive state pauses work.
 */
export function isForeground(state: AppStateStatus | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}
