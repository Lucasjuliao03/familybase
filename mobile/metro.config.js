const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Regenera catálogo e regista quantos avatares existem (qualquer forma de iniciar o Metro)
try {
  require('./scripts/syncAvatarCatalog.js');
} catch (err) {
  console.warn('[metro] sync:avatars:', err?.message || err);
}

const config = getDefaultConfig(__dirname);

// ─────────────────────────────────────────────────────────────────────────────
// Fix: react-native-maps v1.27.x imports bare specifiers like './ProviderConstants'
// without a file extension. Metro needs to try .ts/.tsx for those.
// ─────────────────────────────────────────────────────────────────────────────
const originalSourceExts = config.resolver.sourceExts || [];
config.resolver.sourceExts = [
  'ts', 'tsx',
  ...originalSourceExts.filter(ext => ext !== 'ts' && ext !== 'tsx'),
];

// Custom resolver to handle react-native-maps bare imports
const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // When react-native-maps tries to import ./ProviderConstants (or similar bare paths)
  // and they fail, try appending .ts
  if (defaultResolver) {
    try {
      return defaultResolver(context, moduleName, platform);
    } catch (_) {}
  }

  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (_) {
    // Try with .ts extension explicitly for react-native-maps src files
    if (!moduleName.match(/\.(ts|tsx|js|jsx|mjs|cjs)$/) && moduleName.startsWith('.')) {
      const callerDir = path.dirname(context.originModulePath);
      const candidate = path.resolve(callerDir, moduleName + '.ts');
      const fs = require('fs');
      if (fs.existsSync(candidate)) {
        return { filePath: candidate, type: 'sourceFile' };
      }
    }
    throw _;
  }
};

module.exports = config;
