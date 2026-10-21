import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { configuredVerifier, tokenVerifier } from '../apps/api/src/auth';

test('OIDC verifies signatures, issuer, audience, expiry, and required claims', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' }] });
  const verify = tokenVerifier('https://identity.example', 'trektribe-api', keys);
  const sign = (claims: Record<string, unknown> = {}, key = privateKey) => new SignJWT({
    sub: 'account-a', iss: 'https://identity.example', aud: 'trektribe-api',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...claims,
  }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(key);
  assert.deepEqual(await verify(`Bearer ${await sign()}`), { issuer: 'https://identity.example', subject: 'account-a' });
  for (const claims of [{ iss: 'https://attacker.example' }, { aud: 'other-api' }, { exp: 1 }, { sub: '' }, { exp: undefined }, { iat: undefined }, { nbf: Math.floor(Date.now() / 1000) + 600 }]) {
    await assert.rejects(verify(`Bearer ${await sign(claims)}`), { status: 401 });
  }
  await assert.rejects(verify(`Bearer ${await sign({}, other.privateKey)}`), { status: 401 });
  await assert.rejects(verify('Bearer trektribe-local-demo'), { status: 401 });
  await assert.rejects(verify(), { status: 401 });
});

test('OIDC requires explicit issuer, API audience, and HTTPS keys endpoint', () => {
  assert.throws(() => configuredVerifier({}));
  assert.throws(() => configuredVerifier({ OIDC_ISSUER: 'https://identity.example', OIDC_AUDIENCE: 'api', OIDC_JWKS_URL: 'http://identity.example/keys' }));
});
