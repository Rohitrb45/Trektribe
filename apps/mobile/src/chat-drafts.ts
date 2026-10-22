export type ChatDraft={version:1;id:string;body:string};
export type DraftStorage={getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>};
const queues=new Map<string,Promise<unknown>>();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function draftKey(api:string,userId:string,tripId:string){
  return `trektribe.chat-draft.v1:${JSON.stringify([api.replace(/\/$/,''),userId,tripId])}`;
}
function parse(raw:string|null):ChatDraft|null{
  if(raw===null)return null;
  const value=JSON.parse(raw);
  if(value?.version!==1||typeof value.id!=='string'||!uuid.test(value.id)||typeof value.body!=='string'||value.body.length>2000)throw new Error('Saved draft could not be read. Discard it to start again.');
  return {version:1,id:value.id,body:value.body};
}
/** Serializes writes and reloads, including when a conversation is closed and reopened. */
export class ChatDrafts {
  constructor(private storage:DraftStorage,private key:string){}
  private serial<T>(operation:()=>Promise<T>):Promise<T>{
    const task=(queues.get(this.key)??Promise.resolve()).catch(()=>{}).then(operation);
    queues.set(this.key,task);
    void task.finally(()=>{if(queues.get(this.key)===task)queues.delete(this.key);}).catch(()=>{});
    return task;
  }
  load(){return this.serial(async()=>parse(await this.storage.getItem(this.key)));}
  save(draft:ChatDraft){return this.serial(async()=>{parse(JSON.stringify(draft));await this.storage.setItem(this.key,JSON.stringify(draft));});}
  discard(){return this.serial(()=>this.storage.removeItem(this.key));}
  acknowledge(id:string){return this.serial(async()=>{
    const current=parse(await this.storage.getItem(this.key));
    // A late acknowledgment from an old screen must not erase a newer draft.
    if(current?.id===id)await this.storage.removeItem(this.key);
  });}
}
