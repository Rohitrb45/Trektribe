import Constants from 'expo-constants';

export let configuredMaps: typeof import('@rnmapbox/maps').default | undefined;
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token?.startsWith('pk.') && Constants.executionEnvironment !== 'storeClient') {
  try {
    configuredMaps = require('@rnmapbox/maps').default;
    configuredMaps!.setAccessToken(token);
  } catch { configuredMaps = undefined; }
}
