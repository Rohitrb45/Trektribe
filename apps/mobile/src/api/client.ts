import createClient from 'openapi-fetch';
import type { paths } from './schema';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

/** Tokens are resolved for every request, never captured at client creation. */
export function createApiClient(baseUrl: string, token: () => string, fetcher: typeof fetch = fetch) {
  const client = createClient<paths>({ baseUrl: `${baseUrl.replace(/\/+$/, '')}/v1`, fetch: fetcher });
  client.use({
    onRequest({ request }) {
      if (!baseUrl) throw new Error('The API URL is missing.');
      request.headers.set('Authorization', `Bearer ${token()}`);
      return request;
    },
    async onResponse({ response }) {
      if (!response.ok) {
        const payload = await response.clone().json().catch(() => null);
        const message = payload?.error?.message;
        throw new ApiError(typeof message === 'string' ? message : 'The server could not complete this request.', response.status);
      }
    },
  });
  return client;
}

export async function apiData<T>(request: Promise<{ data?: T }>): Promise<T> {
  const { data } = await request;
  if (data === undefined) throw new Error('The server returned an empty response.');
  return data;
}
