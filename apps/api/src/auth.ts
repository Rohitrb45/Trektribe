import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import { UnauthorizedException } from '@nestjs/common';

export type Identity = { issuer: string; subject: string };
export function tokenVerifier(issuer: string, audience: string, keys: JWTVerifyGetKey) {
  return async (authorization?: string): Promise<Identity> => {
    try {
      if (!authorization?.startsWith('Bearer ') || authorization.length > 16384) throw new Error();
      const { payload } = await jwtVerify(authorization.slice(7), keys, {
        issuer, audience, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'],
      });
      if (!payload.sub || payload.sub.length > 255) throw new Error();
      return { issuer, subject: payload.sub };
    } catch { throw new UnauthorizedException('A valid access token is required.'); }
  };
}

export function configuredVerifier(env = process.env) {
  const { OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URL: jwks } = env;
  if (!issuer || !audience || !jwks) throw new Error('Set OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL.');
  for (const value of [issuer, jwks]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('OIDC endpoints must use HTTPS without embedded credentials.');
  }
  return tokenVerifier(issuer, audience, createRemoteJWKSet(new URL(jwks), { timeoutDuration: 5000 }));
}
