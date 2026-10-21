import AsyncStorage from '@react-native-async-storage/async-storage';
import { withReportRatings, applyCommand, Command, createSeed, DEMO_USER, State, Post, Comment, Profile, Trip, Trek } from '@trektribe/core';
import { accessToken, authenticatedMode } from './session';
const key = 'trektribe.demo.v1';
export const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const mode = authenticatedMode ? 'Connected' : apiUrl ? 'Connected demo' : 'Local demo';
export function listBlocks(){return request<{items:{id:string;name:string}[]}>('/me/blocks');}
export function setBlock(id:string,blocked:boolean){return request(`/me/blocks/${id}`,{blocked});}
export type ForumThread={id:string;userId:string;author:string;title:string;body:string;closed:boolean;revision:number};
export type ForumReply={id:string;userId:string;author:string;body:string;sequence:number;revision:number};
export type ForumReport={id:number;reason:string;title:string;body:string;reportedTitle:string;reportedBody:string;removed:boolean};
export function forumCapabilities(){return request<{moderator:boolean}>('/forum/capabilities');}
export function changeForum(kind:'threads'|'replies',id:string,action:'edit'|'remove'|'report',data:unknown){return request(`/forum/${kind}/${id}/${action}`,data);}
export function forumQueue(cursor=0){return request<{items:ForumReport[];nextCursor:number|null}>(`/forum/moderation?cursor=${cursor}`);}
export function decideForum(id:number,action:'dismiss'|'remove',reason:string){return request(`/forum/moderation/${id}`,{action,reason});}
export function forumThreads(cursor=0){return request<{items:ForumThread[];nextCursor:number|null}>(`/forum/threads?cursor=${cursor}`);}
export function forumThread(id:string,cursor=0){return request<{thread:ForumThread;items:ForumReply[];nextCursor:number|null}>(`/forum/threads/${id}?cursor=${cursor}`);}
export function createForumThread(data:{id:string;title:string;body:string}){return request<{id:string}>('/forum/threads',data);}
export function replyToForum(id:string,data:{id:string;body:string}){return request(`/forum/threads/${id}/replies`,data);}
export function closeForumThread(id:string,closed:boolean){return request(`/forum/threads/${id}/closed`,{closed});}
export async function createInvitation(tripId:string) {
  if(!apiUrl)throw new Error('Invitations require a connected PostgreSQL API.');
  return request<{token:string;expiresAt:string}>(`/group-treks/${tripId}/invitations`,{});
}
export async function acceptInvitation(token:string) {
  if(!apiUrl)throw new Error('Invitations require a connected PostgreSQL API.');
  return request<{tripId:string}>('/invitations/accept',{token});
}
export function importGpx(body:{gpx:string;title:string;region:string;description:string;difficulty:string},trekId?:string){
  return request<{trekId:string;routeVersionId:string}>(trekId?`/treks/${trekId}/route-versions`:'/treks/import',body);
}
export function pinnedRoute(tripId:string){
  return request<{id:string;coordinates:[number,number][];distanceKm:number;elevationM:number;hasElevation:boolean}>(`/group-treks/${tripId}/route`);
}
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
  return withReportRatings(parsed);
}
export function dispatch(command: Command): Promise<State> {
  const result = queue.then(async () => {
    if (authenticatedMode) {
      switch(command.type) {
        case 'profile': { const {type,...body}=command;await request('/me',body);break; }
        case 'create-trip': { const {type,...body}=command;await request('/group-treks',body);break; }
        case 'cancel-trip': await request(`/group-treks/${command.tripId}/cancel`,{});break;
        case 'cohost': await request(`/group-treks/${command.tripId}/cohosts`,{userId:command.userId,enabled:command.enabled});break;
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
