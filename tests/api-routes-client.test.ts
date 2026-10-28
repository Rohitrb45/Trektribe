import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { routeSchema } from '../apps/api/src/validation';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../apps/mobile/src/api/client';
import { publishGpx, getPinnedRoute } from '../apps/mobile/src/api/routes';

test('route adapter selects import/version endpoints and validates pinned geometry', async()=>{
  const requests:Request[]=[];
  let coordinates=[[79,30],[79.1,30.1]];
  const client=createApiClient('https://example.test',()=> 'token',async input=>{
    requests.push(input as Request);
    return Response.json({id:'version',coordinates,distanceKm:1,elevationM:0,hasElevation:false});
  });
  const body={gpx:'<gpx/>',title:'Trail',region:'Region',description:'',difficulty:'Easy'};
  await publishGpx(client,body);
  await publishGpx(client,body,'trail');
  assert.equal(requests[0].url,'https://example.test/v1/treks/import');
  assert.equal(requests[1].url,'https://example.test/v1/treks/trail/route-versions');
  assert.deepEqual(await requests[1].json(),body);
  assert.deepEqual((await getPinnedRoute(client,'outing')).coordinates,coordinates);
  assert.equal(requests[2].url,'https://example.test/v1/group-treks/outing/route');
  await assert.rejects(publishGpx(client,{...body,difficulty:'Invalid'}),/Unsupported trail difficulty/);
  assert.equal(requests.length,3);
  coordinates=[[79,91]];
  await assert.rejects(getPinnedRoute(client,'outing'),/invalid trail coordinates/);
});

test('GPX request contract matches server validation',()=>{
  const contract=JSON.parse(readFileSync('api/core.openapi.json','utf8'));
  const schema=z.toJSONSchema(routeSchema);delete schema.$schema;
  assert.deepEqual(contract.components.schemas.GpxImport,schema);
});