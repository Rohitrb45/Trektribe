import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, apiData } from '../apps/mobile/src/api/client';

test('blocking and invitation requests preserve false values and keep invitation tokens in the body', async () => {
  const requests: Request[]=[];
  const client=createApiClient('https://example.test',()=> 'session',async input=>{requests.push(input as Request);return Response.json({});});
  await apiData(client.GET('/me/blocks'));
  await apiData(client.POST('/me/blocks/{id}',{params:{path:{id:'person'}},body:{blocked:false}}));
  await apiData(client.POST('/group-treks/{id}/invitations',{params:{path:{id:'outing'}}}));
  const token='a'.repeat(43);
  await apiData(client.POST('/invitations/accept',{body:{token}}));
  assert.equal(requests[0].method,'GET');
  assert.deepEqual(await requests[1].json(),{blocked:false});
  assert.equal(requests[2].url,'https://example.test/v1/group-treks/outing/invitations');
  assert.equal(requests[2].method,'POST');
  assert.equal(await requests[2].text(),'');
  assert.deepEqual(await requests[3].json(),{token});
  assert.equal(requests[3].url.includes(token),false);
  assert.ok(requests.every(r=>r.headers.get('Authorization')==='Bearer session'));
});
