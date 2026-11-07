import { accessToken, authenticatedMode } from './session';
import { apiData, createApiClient } from './api/client';
import { createPrivateTrack, uploadPrivateTrackChunk, completePrivateTrack, removePrivateTrack } from './api/recordings';
import { uploadCredentialGuard, type UploadConnection } from './track-outbox';

export async function connectTrackUpload(active: () => boolean): Promise<UploadConnection & { accountName: string }> {
  if (!authenticatedMode) throw new Error('Sign in with an OIDC account to upload a private recording. Demo mode does not upload recordings.');
  const api = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  const issuer = process.env.EXPO_PUBLIC_OIDC_ISSUER;
  if (!api || !issuer) throw new Error('Sign-in and API configuration are required.');
  for (const endpoint of [api,issuer]) {
    const parsed = new URL(endpoint);
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use an API/issuer URL without credentials, query parameters or fragments.');
  }
  const token = accessToken();
  const assertActive = uploadCredentialGuard(token,accessToken,active);
  const boundedFetch: typeof fetch = async (input, init) => {
    assertActive();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      const body = await response.text();
      return new Response(response.status === 204 ? null : body, { status: response.status, headers: response.headers });
    }
    finally { clearTimeout(timer); }
  };
  // Freeze the credential for this run. Never resolve a replacement account's token mid-upload.
  const client = createApiClient(api, () => { assertActive(); return token; }, boundedFetch);
  const profile = await apiData(client.GET('/me'));
  if (typeof profile.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(profile.id) || typeof profile.name !== 'string') throw new Error('The API did not return a valid signed-in profile.');
  assertActive();
  // Server identity is derived from verified issuer/subject; no unverified JWT decoding is used.
  const scope = JSON.stringify([api, issuer, profile.id]);
  return { scope, accountName: profile.name, assertActive,
    create: job => createPrivateTrack(client,{ id:job.id,title:job.title,chunkCount:job.chunkCount,pointCount:job.pointCount }),
    chunk: (id,n,body) => uploadPrivateTrackChunk(client,id,n,body),
    complete: id => completePrivateTrack(client,id), remove: id => removePrivateTrack(client,id),
  };
}
