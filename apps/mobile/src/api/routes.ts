import { apiData, createApiClient } from './client';
import { coordinate } from './treks';

type Client = ReturnType<typeof createApiClient>;
export async function publishGpx(client: Client, input: {gpx:string;title:string;region:string;description:string;difficulty:string}, trekId?:string) {
  const difficulty = (['Easy','Moderate','Hard'] as const).find(value=>value===input.difficulty);
  if (!difficulty) throw new Error('Unsupported trail difficulty.');
  const body={gpx:input.gpx,title:input.title,region:input.region,description:input.description,difficulty};
  return trekId
    ? apiData(client.POST('/treks/{id}/route-versions',{params:{path:{id:trekId}},body}))
    : apiData(client.POST('/treks/import',{body}));
}
export async function getPinnedRoute(client: Client, tripId:string) {
  const route=await apiData(client.GET('/group-treks/{id}/route',{params:{path:{id:tripId}}}));
  return {...route,coordinates:route.coordinates.map(coordinate)};
}
