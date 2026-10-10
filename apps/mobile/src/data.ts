import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyCommand, Command, createSeed, DEMO_USER, State } from '@trektribe/core';
const key = 'trektribe.demo.v1';
export const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const mode = apiUrl ? 'Connected demo' : 'Local demo';
let queue: Promise<unknown> = Promise.resolve();
async function request(path: string, body?: Command): Promise<State> {
  const response = await fetch(`${apiUrl}/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer trektribe-local-demo' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'The server could not complete this request.');
  return data;
}
export async function loadState(): Promise<State> {
  if (apiUrl) return request('/demo/state');
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return createSeed();
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1) throw new Error('This saved demo uses a different data version. Clear app storage to restart.');
  return parsed;
}
export function dispatch(command: Command): Promise<State> {
  const result = queue.then(async () => {
    if (apiUrl) return request('/demo/commands', command);
    const next = applyCommand(await loadState(), command, DEMO_USER);
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return next;
  });
  queue = result.catch(() => undefined);
  return result;
}
/** Local demo IDs only; server rejects malformed UUIDs and enforces ownership. */
export function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random()*16); return (c==='x' ? r : (r&3)|8).toString(16);
  });
}
