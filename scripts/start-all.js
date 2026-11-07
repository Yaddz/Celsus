const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const marketApiDir = path.join(rootDir, 'services', 'market-api');
const binDir = path.join(marketApiDir, 'bin');
const isWin = process.platform === 'win32';
const binaryName = isWin ? 'market-api.exe' : 'market-api';
const binaryPath = path.join(binDir, binaryName);

console.log('\x1b[36m%s\x1b[0m', '==========================================================');
console.log('\x1b[36m%s\x1b[0m', '   CELSUS — AMBIENTE INTEGRADO (GO BACKEND + EXPO FRONT)   ');
console.log('\x1b[36m%s\x1b[0m', '==========================================================\n');

// 1. Compilar o Backend Go
console.log('\x1b[33m%s\x1b[0m', '[1/4] Compilando Backend Go (services/market-api)...');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

try {
  execSync(`go build -o "${binaryPath}" .`, {
    cwd: marketApiDir,
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('\x1b[32m%s\x1b[0m', `✓ Backend compilado com sucesso em: ${path.relative(rootDir, binaryPath)}\n`);
} catch (err) {
  console.error('\x1b[31m%s\x1b[0m', '✗ Falha ao compilar o backend Go!');
  console.error(err.message);
  process.exit(1);
}

// 2. Configurar ADB Reverse (se dispositivo USB estiver conectado)
console.log('\x1b[33m%s\x1b[0m', '[2/4] Verificando conexão ADB via cabo...');
try {
  const adbDevices = execSync('adb devices', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const hasDevice = adbDevices.split('\n').some(line => {
    const parts = line.trim().split(/\s+/);
    return parts.length >= 2 && parts[1] === 'device';
  });

  if (hasDevice) {
    execSync('adb reverse tcp:8080 tcp:8080', { stdio: 'ignore' });
    execSync('adb reverse tcp:8081 tcp:8081', { stdio: 'ignore' });
    console.log('\x1b[32m%s\x1b[0m', '✓ Dispositivo Android detectado: portas 8080 e 8081 mapeadas via adb reverse.\n');
  } else {
    console.log('\x1b[90m%s\x1b[0m', 'ℹ Nenhum dispositivo Android conectado no modo "device" via ADB no momento.\n');
  }
} catch {
  console.log('\x1b[90m%s\x1b[0m', 'ℹ ADB não disponível ou sem suporte a reverse.\n');
}

// 3. Iniciar o Backend Go
console.log('\x1b[33m%s\x1b[0m', '[3/4] Iniciando Backend de Mercado Go na porta 8080...');
const backendPort = process.env.PORT || '8080';
const backendProcess = spawn(binaryPath, [], {
  cwd: marketApiDir,
  env: {
    ...process.env,
    PORT: backendPort,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

backendProcess.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  for (const line of lines) {
    if (line.trim()) console.log(`\x1b[90m[backend]\x1b[0m ${line}`);
  }
});

backendProcess.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  for (const line of lines) {
    if (line.trim()) console.error(`\x1b[31m[backend]\x1b[0m ${line}`);
  }
});

let isShuttingDown = false;
function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n\x1b[33m%s\x1b[0m', 'Encerrando serviços Celsus...');
  try {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!backendProcess.killed) backendProcess.kill('SIGKILL');
        } catch {}
      }, 2000);
    }
  } catch {}
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', cleanup);

// Aguardar o health check do backend
function checkHealth(attempt = 1, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${backendPort}/v1/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });
    });

    req.on('error', () => {
      retry();
    });

    function retry() {
      if (attempt >= maxAttempts) {
        reject(new Error(`Timeout aguardando inicialização do backend na porta ${backendPort}`));
      } else {
        setTimeout(() => {
          checkHealth(attempt + 1, maxAttempts).then(resolve).catch(reject);
        }, 500);
      }
    }
  });
}

checkHealth()
  .then(() => {
    console.log('\x1b[32m%s\x1b[0m', `✓ Backend Go saudável e pronto em http://localhost:${backendPort}/v1/health\n`);

    // 4. Iniciar o Frontend Expo
    console.log('\x1b[33m%s\x1b[0m', '[4/4] Iniciando App Mobile Expo...');
    const extraArgs = process.argv.slice(2);
    // O pacote `expo` está instalado em apps/mobile (não na raiz), então o Expo
    // precisa rodar com esse diretório como cwd.
    const expoProcess = spawn('npx', ['expo', 'start', ...extraArgs], {
      cwd: require('path').join(rootDir, 'apps', 'mobile'),
      env: {
        ...process.env,
        EXPO_PUBLIC_MARKET_API_URL: `http://localhost:${backendPort}`,
      },
      stdio: 'inherit',
    });

    expoProcess.on('exit', (code) => {
      cleanup();
      process.exit(code || 0);
    });
  })
  .catch((err) => {
    console.error('\x1b[31m%s\x1b[0m', `✗ ${err.message}`);
    cleanup();
    process.exit(1);
  });
