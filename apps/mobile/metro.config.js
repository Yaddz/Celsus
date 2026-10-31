const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// 1. Let Metro treat .wasm files as assets for expo-sqlite web
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// 2. Enable package exports so Metro can resolve wa-sqlite
config.resolver.unstable_enablePackageExports = true;

// 3. Ensure polyfills run BEFORE React Native's setup-env initializes.
// In Hermes / modern runtimes, global.performance is defined as getter-only/read-only.
// When React Native's setUpPerformance.js assigns `global.performance = new Performance()`,
// it throws `TypeError: property is not writable` unless setupPolyfills runs first in the bundle preamble.
const originalGetModulesRunBeforeMainModule = config.serializer.getModulesRunBeforeMainModule;
config.serializer.getModulesRunBeforeMainModule = (entryFilePath) => {
  const polyfillPath = path.resolve(__dirname, 'src/setupPolyfills.ts');
  const modules = originalGetModulesRunBeforeMainModule
    ? originalGetModulesRunBeforeMainModule(entryFilePath)
    : [];
  return [polyfillPath, ...modules.filter((m) => m !== polyfillPath)];
};

module.exports = config;
