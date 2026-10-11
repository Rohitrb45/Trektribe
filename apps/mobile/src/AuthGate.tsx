import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { clearSession, restoreSession, saveSession } from './session';

WebBrowser.maybeCompleteAuthSession();
const issuer = process.env.EXPO_PUBLIC_OIDC_ISSUER;
const clientId = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID;
const audience = process.env.EXPO_PUBLIC_OIDC_AUDIENCE;

export function AuthGate({ children }: { children: (logout: () => Promise<void>) => React.ReactNode }) {
  const [ready, setReady] = useState(false), [signedIn, setSignedIn] = useState(false), [error, setError] = useState('');
  useEffect(() => { restoreSession().then(setSignedIn).catch(() => setError('Could not restore your session. Please sign in again.')).finally(() => setReady(true)); }, []);
  const logout = async () => { await clearSession(); setSignedIn(false); };
  if (!ready) return <ActivityIndicator accessibilityLabel="Restoring session"/>;
  if (signedIn) return <>{children(logout)}</>;
  if (!issuer?.startsWith('https://') || !clientId || !process.env.EXPO_PUBLIC_API_URL) return <View style={{padding:32}}><Text>Sign-in is not configured for this build. Contact the app administrator.</Text></View>;
  return <Login issuer={issuer} clientId={clientId} onSuccess={() => setSignedIn(true)} initialError={error}/>;
}

function Login({ issuer, clientId, onSuccess, initialError }: { issuer: string; clientId: string; onSuccess: () => void; initialError: string }) {
  const discovery = AuthSession.useAutoDiscovery(issuer);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'trektribe', path: 'auth' });
  const [request, response, promptAsync] = AuthSession.useAuthRequest({
    clientId, redirectUri, responseType: AuthSession.ResponseType.Code, usePKCE: true,
    scopes: ['openid', 'profile'], extraParams: audience ? { audience } : undefined,
  }, discovery);
  const [error, setError] = useState(initialError), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (response?.type === 'error') setError('Sign-in failed. Please try again.');
    if (response?.type !== 'success' || !discovery || !request?.codeVerifier) return;
    let active = true;
    setBusy(true);
    AuthSession.exchangeCodeAsync({ clientId, code: response.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier } }, discovery)
      .then(async token => {
        if (!active) return;
        if (!token.expiresIn) throw new Error('The provider did not return a token expiry.');
        await saveSession(token.accessToken, token.expiresIn);
        if (active) onSuccess();
      }).catch(() => { if (active) setError('Could not finish sign-in. Please try again.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [response, discovery, request]);
  return <View style={{flex:1,justifyContent:'center',padding:32,gap:20,backgroundColor:'#f8f7f0'}}>
    <Text style={{fontSize:32,fontWeight:'700',color:'#234d3b'}}>Welcome to TrekTribe</Text>
    <Text>Sign in to save trails, share reports, and join your next outing.</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    <Button title={busy?'Signing in…':'Sign in'} disabled={!request||busy} onPress={() => { setError(''); promptAsync().catch(() => setError('Could not open sign-in.')); }}/>
  </View>;
}
