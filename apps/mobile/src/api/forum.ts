import { apiData, createApiClient } from './client';
import type { components } from './schema';

type Schemas = components['schemas'];
export type ForumChange = { id:string } & (
  | { kind:'threads'; action:'edit'; data:Schemas['EditThread'] }
  | { kind:'replies'; action:'edit'; data:Schemas['EditReply'] }
  | { kind:'threads'|'replies'; action:'remove'; data:Schemas['RemoveForum'] }
  | { kind:'threads'|'replies'; action:'report'; data:Schemas['ReportForum'] }
);
export function submitForumChange(client:ReturnType<typeof createApiClient>, change:ForumChange) {
  const params={path:{id:change.id}};
  if(change.action==='edit')return change.kind==='threads'
    ? apiData(client.POST('/forum/threads/{id}/edit',{params,body:change.data}))
    : apiData(client.POST('/forum/replies/{id}/edit',{params,body:change.data}));
  if(change.action==='remove')return apiData(client.POST(`/forum/${change.kind}/{id}/remove`,{params,body:change.data}));
  return apiData(client.POST(`/forum/${change.kind}/{id}/report`,{params,body:change.data}));
}
