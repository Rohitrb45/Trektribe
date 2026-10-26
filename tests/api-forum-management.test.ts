import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { editThread, editReply, removeInput, reportInput, decisionInput } from '../apps/api/src/forum-management';
import { createApiClient } from '../apps/mobile/src/api/client';
import { submitForumChange } from '../apps/mobile/src/api/forum';

test('forum management contracts preserve server revision and moderation validation',()=>{
  const contract=JSON.parse(readFileSync('api/core.openapi.json','utf8'));
  for(const [name,input] of Object.entries({EditThread:editThread,EditReply:editReply,RemoveForum:removeInput,ReportForum:reportInput,ModerationDecision:decisionInput})){
    const schema=z.toJSONSchema(input);delete schema.$schema;
    assert.deepEqual(contract.components.schemas[name],schema);
  }
});
test('forum changes serialize kind-specific edits and revision-checked deletion',async()=>{
  const requests:Request[]=[];
  const client=createApiClient('https://example.test',()=> 'token',async input=>{requests.push(input as Request);return Response.json({id:'target'});});
  await submitForumChange(client,{kind:'threads',id:'target',action:'edit',data:{revision:3,title:'Title',body:'Body'}});
  await submitForumChange(client,{kind:'replies',id:'reply',action:'edit',data:{revision:2,body:'Reply'}});
  await submitForumChange(client,{kind:'replies',id:'reply',action:'remove',data:{revision:4}});
  await submitForumChange(client,{kind:'threads',id:'target',action:'report',data:{reason:'Review'}});
  assert.equal(requests[0].url,'https://example.test/v1/forum/threads/target/edit');
  assert.deepEqual(await requests[0].json(),{revision:3,title:'Title',body:'Body'});
  assert.deepEqual(await requests[1].json(),{revision:2,body:'Reply'});
  assert.deepEqual(await requests[2].json(),{revision:4});
  assert.deepEqual(await requests[3].json(),{reason:'Review'});
});
