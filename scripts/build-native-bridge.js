#!/usr/bin/env node
/**
 * Recompila a ponte Go (services/market-api/pkg/mobilebridge) para Android e atualiza o módulo
 * Expo `apps/mobile/modules/celsus-market`:
 *   - android/libs/celsusmarket.jar          (classes Java geradas pelo gomobile)
 *   - android/libs/celsusmarket-sources.jar
 *   - android/src/main/jniLibs/<abi>/libgojni.so
 *
 * Requisitos: Go, gomobile (`go install golang.org/x/mobile/cmd/gomobile@latest`),
 * Android SDK + NDK (ANDROID_HOME e, opcionalmente, ANDROID_NDK_HOME).
 * Depois de rodar, gere o app com módulo nativo novo: `cd apps/mobile && npx expo run:android`.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serviceDir = path.join(root, 'services', 'market-api');
const moduleAndroid = path.join(root, 'apps', 'mobile', 'modules', 'celsus-market', 'android');
const libsDir = path.join(moduleAndroid, 'libs');
const jniDir = path.join(moduleAndroid, 'src', 'main', 'jniLibs');
const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

const env = { ...process.env };
env.ANDROID_HOME = env.ANDROID_HOME || path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Local/Android/Sdk' : 'Android/Sdk');
if (!env.ANDROID_NDK_HOME) {
  const ndkRoot = path.join(env.ANDROID_HOME, 'ndk');
  if (fs.existsSync(ndkRoot)) {
    const versions = fs.readdirSync(ndkRoot).sort().reverse();
    if (versions.length) env.ANDROID_NDK_HOME = path.join(ndkRoot, versions[0]);
  }
}
const goBin = path.join(os.homedir(), 'go', 'bin');
env.PATH = `${env.PATH}${path.delimiter}${goBin}`;

console.log(`ANDROID_HOME     = ${env.ANDROID_HOME}`);
console.log(`ANDROID_NDK_HOME = ${env.ANDROID_NDK_HOME || '(não encontrado)'}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celsusmarket-'));
const aar = path.join(tmp, 'celsusmarket.aar');

console.log('\n[1/3] gomobile bind (pode levar alguns minutos)...');
execSync(`gomobile bind -target=android -androidapi 24 -o "${aar}" ./pkg/mobilebridge`, {
  cwd: serviceDir,
  env,
  stdio: 'inherit',
});

console.log('\n[2/3] Extraindo o .aar...');
const extracted = path.join(tmp, 'aar');
fs.mkdirSync(extracted);
try {
  execSync(`unzip -q "${aar}" -d "${extracted}"`, { stdio: 'inherit' });
} catch {
  execSync(`tar -xf "${aar}" -C "${extracted}"`, { stdio: 'inherit' }); // Windows (bsdtar)
}

console.log('[3/3] Atualizando o módulo celsus-market...');
fs.mkdirSync(libsDir, { recursive: true });
fs.copyFileSync(path.join(extracted, 'classes.jar'), path.join(libsDir, 'celsusmarket.jar'));
const sources = path.join(tmp, 'celsusmarket-sources.jar');
if (fs.existsSync(sources)) fs.copyFileSync(sources, path.join(libsDir, 'celsusmarket-sources.jar'));
for (const abi of ABIS) {
  const from = path.join(extracted, 'jni', abi, 'libgojni.so');
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.join(jniDir, abi), { recursive: true });
  fs.copyFileSync(from, path.join(jniDir, abi, 'libgojni.so'));
  console.log(`  ✓ ${abi}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nPronto. Agora: cd apps/mobile && npx expo run:android');
