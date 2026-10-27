import { apiData, createApiClient } from './client';
import type { components } from './schema';

export type ChatMessage = components['schemas']['ChatMessage'];
type Client = ReturnType<typeof createApiClient>;

export function listMessages(client: Client, tripId: string, after = 0, limit = 50) {
  return apiData(client.GET('/group-treks/{id}/messages', {
    params: { path: { id: tripId }, query: { after, limit } },
  }));
}

export function sendMessage(client: Client, tripId: string, message: components['schemas']['ChatSend']) {
  return apiData(client.POST('/group-treks/{id}/messages', {
    params: { path: { id: tripId } }, body: message,
  }));
}
