import { useSyncExternalStore } from 'react';

// Browser history can remount the Router layout. Keep only discovery preferences
// above that lifecycle; account data and dialogs remain owned by Application.
const initial = { query: '', difficulty: 'All', savedOnly: false };
let filters = initial;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => filters;
export function resetDiscoveryFilters() { filters = initial; listeners.forEach(listener => listener()); }
export function useDiscoveryFilters() {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const update = (patch: Partial<typeof initial>) => {
    filters = { ...filters, ...patch };
    listeners.forEach(listener => listener());
  };
  return { ...value, setQuery: (query: string) => update({ query }),
    setDifficulty: (difficulty: string) => update({ difficulty }),
    setSavedOnly: (savedOnly: boolean) => update({ savedOnly }) };
}
