import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { commandSchema } from '../apps/api/src/validation';
import { executeCommand } from '../apps/mobile/src/api/commands';
import { createApiClient } from '../apps/mobile/src/api/client';

test('mutation request contracts match the server command validators', () => {
  const doc=JSON.parse(readFileSync('api/core.openapi.json','utf8'));
  const names={profile:'updateProfile','create-trip':'createTrip','cancel-trip':'cancelTrip',cohost:'setCohost',post:'createPost',comment:'createComment',join:'joinTrip',leave:'leaveTrip',approve:'approveMember'};
  for (const [kind,name] of Object.entries(names)) {
    const validator=commandSchema.options.find(s=>s.shape.type.value===kind)!;
    const schema=z.toJSONSchema(validator);
    delete schema.$schema;
    for (const key of ['type','tripId','postId']) {
      delete schema.properties![key];
      schema.required=schema.required!.filter(k=>k!==key);
    }
    assert.deepEqual(doc.components.schemas[name+'Body'],schema,kind);
  }
});

test('command adapter preserves retry IDs and rejects unsupported choices before sending', async () => {
  const requests: Request[]=[];
  const client=createApiClient('https://example.test',()=> 'token',async input=>{requests.push(input as Request);return Response.json({});});
  const command={type:'post' as const,id:'same-retry-id',trekId:'trail',content:'Hello',rating:4,observedAt:'2020-01-01',condition:'Clear'};
  await executeCommand(client,command);await executeCommand(client,command);
  assert.deepEqual(await requests[0].json(),await requests[1].json());
  assert.equal(requests.length,2);
  await assert.rejects(executeCommand(client,{...command,condition:'Invalid'}),/Unsupported value/);
  await assert.rejects(executeCommand(client,{type:'profile',name:'Name',bio:'',gear:[],level:'Invalid'}),/Unsupported value/);
  assert.equal(requests.length,2);
});
