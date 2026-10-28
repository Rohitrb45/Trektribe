import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { threadInput, replyInput } from '../apps/api/src/forums';
import { createApiClient, apiData } from '../apps/mobile/src/api/client';

test('forum creation contracts match server validators',()=>{
  const contract=JSON.parse(readFileSync('api/core.openapi.json','utf8'));
  for(const [name,validator] of [['NewThread',threadInput],['NewReply',replyInput]] as const){
    const schema=z.toJSONSchema(validator);delete schema.$schema;
    assert.deepEqual(contract.components.schemas[name],schema);
  }
});

test('forum client serializes pagination and reopening without replacing retry IDs',async()=>{
  const requests:Request[]=[];
  const client=createApiClient('https://example.test',()=> 'token',async input=>{requests.push(input as Request);return Response.json({});});
  await apiData(client.GET('/forum/threads/{id}',{params:{path:{id:'thread'},query:{cursor:42,limit:1}}}));
  await apiData(client.POST('/forum/threads/{id}/closed',{params:{path:{id:'thread'}},body:{closed:false}}));
  const body={id:'retry-id',body:'Reply'};
  await apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id:'thread'}},body}));
  await apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id:'thread'}},body}));
  assert.equal(new URL(requests[0].url).searchParams.get('cursor'),'42');
  assert.equal(new URL(requests[0].url).searchParams.get('limit'),'1');
  assert.deepEqual(await requests[1].json(),{closed:false});
  assert.deepEqual(await requests[2].json(),body);
  assert.deepEqual(await requests[3].json(),body);
});
