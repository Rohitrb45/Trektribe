import type { components } from './api/schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { withReportRatings, applyCommand, Command, createSeed, DEMO_USER, State } from '@trektribe/core';
import { accessToken, authenticatedMode } from './session';
import { createApiClient, apiData } from './api/client';
import { toTrek } from './api/treks';
import { publishGpx, getPinnedRoute } from './api/routes';
import { executeCommand } from './api/commands';
const key = 'trektribe.demo.v1';
export const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const client = createApiClient(apiUrl || '', () => authenticatedMode ? accessToken() : 'trektribe-local-demo');
export const mode = authenticatedMode ? 'Connected' : apiUrl ? 'Connected demo' : 'Local demo';
export function listBlocks(){return apiData(client.GET('/me/blocks'));}
export function setBlock(id:string,blocked:boolean){return apiData(client.POST('/me/blocks/{id}',{params:{path:{id}},body:{blocked}}));}
export type ForumThread=components['schemas']['ForumThread'];
export type ForumReply=components['schemas']['ForumReply'];
export type ForumReport={id:number;reason:string;title:string;body:string;reportedTitle:string;reportedBody:string;removed:boolean};
export function forumCapabilities(){return apiData(client.GET('/forum/capabilities'));}
export function changeForum(kind:'threads'|'replies',id:string,action:'edit'|'remove'|'report',data:unknown){return request(`/forum/${kind}/${id}/${action}`,data);}
export function forumQueue(cursor=0){return request<{items:ForumReport[];nextCursor:number|null}>(`/forum/moderation?cursor=${cursor}`);}
export function decideForum(id:number,action:'dismiss'|'remove',reason:string){return request(`/forum/moderation/${id}`,{action,reason});}
export function forumThreads(cursor=0){return apiData(client.GET('/forum/threads',{params:{query:{cursor}}}));}
export function forumThread(id:string,cursor=0){return apiData(client.GET('/forum/threads/{id}',{params:{path:{id},query:{cursor}}}));}
export function createForumThread(data:{id:string;title:string;body:string}){return apiData(client.POST('/forum/threads',{body:data}));}
export function replyToForum(id:string,data:{id:string;body:string}){return apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id}},body:data}));}
export function closeForumThread(id:string,closed:boolean){return apiData(client.POST('/forum/threads/{id}/closed',{params:{path:{id}},body:{closed}}));}
export async function createInvitation(tripId:string) {
  if(!apiUrl)throw new Error('Invitations require a connected PostgreSQL API.');
  return apiData(client.POST('/group-treks/{id}/invitations',{params:{path:{id:tripId}}}));
}
export async function acceptInvitation(token:string) {
  if(!apiUrl)throw new Error('Invitations require a connected PostgreSQL API.');
  return apiData(client.POST('/invitations/accept',{body:{token}}));
}
export function importGpx(body:{gpx:string;title:string;region:string;description:string;difficulty:string},trekId?:string){
  return publishGpx(client,body,trekId);
}
export function pinnedRoute(tripId:string){
  return getPinnedRoute(client,tripId);
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
      apiData(client.GET('/me')), apiData(client.GET('/treks')), apiData(client.GET('/group-treks')),
      apiData(client.GET('/me/saved-treks')), apiData(client.GET('/feed', {params:{query:{limit:50}}})),
    ]);
    const comments = await Promise.all(page.items.map(p=>apiData(client.GET('/posts/{id}/comments', {params:{path:{id:p.id}}}))));
    return {version:1,profile,treks:treks.items.map(toTrek),trips:trips.items,saved:{[profile.id]:saved.items},posts:page.items,comments:comments.flatMap(p=>p.items)};
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
      await executeCommand(client, command);
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
