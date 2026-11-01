const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// npm's Windows workspace junction can point outside Metro's watch root when
// this checkout is accessed through a short subst drive for native builds.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@trektribe/core') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, '../../packages/core/src/index.ts') };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
