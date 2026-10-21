import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const authenticatedMode = process.env.EXPO_PUBLIC_AUTH_MODE === 'oidc';
type Session = { accessToken: string; expiresAt: number };
let current: Session | null = null;
const key = 'trektribe.session.v1';
export async function restoreSession() {
  if (Platform.OS !== 'web') {
    const raw = await SecureStore.getItemAsync(key);
    try { current = raw ? JSON.parse(raw) : null; } catch { current = null; }
  }
  if (!current || typeof current.accessToken !== 'string' || !Number.isFinite(current.expiresAt) || current.expiresAt <= Date.now()) {
    await clearSession(); return false;
  }
  return true;
}
export async function saveSession(accessToken: string, expiresIn: number) {
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('The sign-in provider returned an invalid session.');
  current = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  // Browser tokens stay in memory; native tokens use the OS secure store.
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(key, JSON.stringify(current));
}
export async function clearSession() {
  current = null;
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key);
}
export function accessToken() {
  if (!current || current.expiresAt <= Date.now()) throw new Error('Your session expired. Sign out and sign in again.');
  return current.accessToken;
}
