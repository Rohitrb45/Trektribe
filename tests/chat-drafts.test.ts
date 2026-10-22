import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ChatDrafts,draftKey,ChatDraft,DraftStorage } from '../apps/mobile/src/chat-drafts';

function storage(){
 const values=new Map<string,string>();
 const adapter:DraftStorage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v);},removeItem:async k=>{values.delete(k);}};
 return {values,adapter};
}
test('drafts persist message IDs across reopening and isolate accounts, APIs and outings',async()=>{
 const {adapter}=storage(),key=draftKey('https://api.example','alice','outing-a');
 const draft:ChatDraft={version:1,id:randomUUID(),body:'Bring water'};
 await new ChatDrafts(adapter,key).save(draft);
 assert.deepEqual(await new ChatDrafts(adapter,key).load(),draft);
 for(const scope of [['https://api.example','bob','outing-a'],['https://other.example','alice','outing-a'],['https://api.example','alice','outing-b']])assert.equal(await new ChatDrafts(adapter,draftKey(...scope as [string,string,string])).load(),null);
 assert.equal(draftKey('https://api.example/','alice','outing-a'),key);
 await new ChatDrafts(adapter,key).acknowledge(draft.id);
 assert.equal(await new ChatDrafts(adapter,key).load(),null);
});
test('queued saves survive rapid close/reopen and late acknowledgments preserve newer drafts',async()=>{
 const {adapter}=storage();let release!:()=>void;
 const delayed={...adapter,setItem:async(k:string,v:string)=>{await new Promise<void>(r=>{release=r;});await adapter.setItem(k,v);}};
 const key=draftKey('api','alice',randomUUID()),first=new ChatDrafts(delayed,key),reopened=new ChatDrafts(adapter,key);
 const old:ChatDraft={version:1,id:randomUUID(),body:'Old'},latest:ChatDraft={version:1,id:randomUUID(),body:'New'};
 const save=first.save(old);await new Promise(r=>setTimeout(r,0));
 const next=reopened.save(latest),ack=first.acknowledge(old.id),load=reopened.load();
 release();await Promise.all([save,next,ack]);assert.deepEqual(await load,latest);
 await reopened.discard();assert.equal(await reopened.load(),null);
});
test('storage failures do not poison later retries and invalid drafts are not silently overwritten',async()=>{
 const {adapter,values}=storage();let fail=true;
 const flaky={...adapter,setItem:async(k:string,v:string)=>{if(fail)throw new Error('Storage full');await adapter.setItem(k,v);}};
 const key=draftKey('api','alice',randomUUID()),drafts=new ChatDrafts(flaky,key),draft:ChatDraft={version:1,id:randomUUID(),body:'Retry me'};
 await assert.rejects(drafts.save(draft));fail=false;await drafts.save(draft);assert.deepEqual(await drafts.load(),draft);
 values.set(key,'invalid JSON');await assert.rejects(drafts.load());assert.equal(values.get(key),'invalid JSON');
 await drafts.discard();await drafts.save(draft);assert.deepEqual(await drafts.load(),draft);
 await assert.rejects(drafts.save({...draft,body:'x'.repeat(2001)}));assert.deepEqual(await drafts.load(),draft);
});
