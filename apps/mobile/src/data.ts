import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyCommand, Command, createSeed, DEMO_USER, State, Post, Comment, Profile, Trip, Trek } from '@trektribe/core';
import { accessToken, authenticatedMode } from './session';
const key = 'trektribe.demo.v1';
export const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const mode = authenticatedMode ? 'Connected' : apiUrl ? 'Connected demo' : 'Local demo';
let queue: Promise<unknown> = Promise.resolve();
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authenticatedMode ? accessToken() : 'trektribe-local-demo'}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'The server could not complete this request.');
  return data;
}
export async function loadState(): Promise<State> {
  if (authenticatedMode) {
    if (!apiUrl) throw new Error('The API URL is missing.');
    const [profile, treks, trips, saved, page] = await Promise.all([
      request<Profile>('/me'), request<{items:Trek[]}>('/treks'), request<{items:Trip[]}>('/group-treks'),
      request<{items:string[]}>('/me/saved-treks'), request<{items:Post[]}>('/feed?limit=50'),
    ]);
    const comments = await Promise.all(page.items.map(p=>request<{items:Comment[]}>(`/posts/${p.id}/comments`)));
    return {version:1,profile,treks:treks.items,trips:trips.items,saved:{[profile.id]:saved.items},posts:page.items,comments:comments.flatMap(p=>p.items)};
  }
  if (apiUrl) return request('/demo/state');
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return createSeed();
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1) throw new Error('This saved demo uses a different data version. Clear app storage to restart.');
  return parsed;
}
export function dispatch(command: Command): Promise<State> {
  const result = queue.then(async () => {
    if (authenticatedMode) {
      switch(command.type) {
        case 'profile': { const {type,...body}=command;await request('/me',body);break; }
        case 'create-trip': { const {type,...body}=command;await request('/group-treks',body);break; }
        case 'cancel-trip': await request(`/group-treks/${command.tripId}/cancel`,{});break;
        case 'save': await request(`/me/saved-treks/${command.trekId}`,{saved:command.saved});break;
        case 'like': await request(`/posts/${command.postId}/like`,{liked:command.liked});break;
        case 'post': { const {type,...body}=command;await request('/posts',body);break; }
        case 'comment': await request(`/posts/${command.postId}/comments`,{id:command.id,body:command.body});break;
        case 'join': case 'leave': await request(`/group-treks/${command.tripId}/${command.type}`,{});break;
        case 'approve': await request(`/group-treks/${command.tripId}/approve`,{userId:command.userId});break;
      }
      return loadState();
    }
    if (apiUrl) return request<State>('/demo/commands', command);
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
