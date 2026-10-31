const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// 1. Let Metro treat .wasm files as assets for expo-sqlite web
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// 2. Enable package exports so Metro can resolve wa-sqlite
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
