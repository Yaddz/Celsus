const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const action = process.argv[2];
if (!['lock', 'verify', 'unlock', 'status'].includes(action)) {
  console.error('Usage: node scripts/test-lock.js [lock|verify|unlock|status]');
  process.exit(1);
}

const workspaceRoot = path.resolve(__dirname, '..');
const lockFilePath = path.join(workspaceRoot, 'tests.lock.json');

function getTestFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !['node_modules', '.git', 'dist', 'build', '.expo'].includes(entry.name)
    ) {
      getTestFiles(fullPath, fileList);
    } else if (
      entry.isFile() &&
      (_isTestFile(entry.name))
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function _isTestFile(fileName) {
  return (
    fileName.endsWith('_test.go') ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(fileName)
  );
}

function getRelativePath(fullPath) {
  return path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
}

function getFileHash(fullPath) {
  const buf = fs.readFileSync(fullPath);
  return crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
}

if (action === 'lock') {
  const files = getTestFiles(workspaceRoot);
  files.sort();
  const entries = {};

  for (const file of files) {
    const rel = getRelativePath(file);
    const hash = getFileHash(file);
    const stat = fs.statSync(file);
    try {
      fs.chmodSync(file, 0o444);
    } catch {}
    entries[rel] = {
      sha256: hash,
      lockedAt: new Date().toISOString(),
      sizeBytes: stat.size,
    };
  }

  const payload = {
    protocol: 'CELSUS_IMMUTABLE_TDD_LOCK_V1',
    updatedAt: new Date().toISOString(),
    totalLockedFiles: files.length,
    files: entries,
  };

  try {
    if (fs.existsSync(lockFilePath)) {
      fs.chmodSync(lockFilePath, 0o666);
    }
  } catch {}

  fs.writeFileSync(lockFilePath, JSON.stringify(payload, null, 2), 'utf8');

  try {
    fs.chmodSync(lockFilePath, 0o444);
  } catch {}

  console.log(`\x1b[32m[TDD LOCK] ${files.length} arquivo(s) de teste bloqueado(s) e registrados em tests.lock.json.\x1b[0m`);
  process.exit(0);
}

if (action === 'verify') {
  if (!fs.existsSync(lockFilePath)) {
    console.error('\x1b[31m[TDD VIOLATION] Arquivo tests.lock.json nao encontrado!\x1b[0m');
    process.exit(1);
  }

  const raw = fs.readFileSync(lockFilePath, 'utf8').replace(/^\uFEFF/, '');
  const lockData = JSON.parse(raw);
  const violations = [];

  for (const [relPath, info] of Object.entries(lockData.files)) {
    const fullPath = path.join(workspaceRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      violations.push(`REMOVIDO: ${relPath} foi deletado!`);
      continue;
    }

    const actualHash = getFileHash(fullPath);
    if (actualHash !== info.sha256.toLowerCase()) {
      violations.push(`ADULTERADO: ${relPath} modificado! (Esperado: ${info.sha256} | Atual: ${actualHash})`);
    }
  }

  if (violations.length > 0) {
    console.error('\x1b[31m================================================================');
    console.error('[SECURITY PROTOCOL: TDD LOCK VIOLATION DETECTED]');
    console.error('O agente alterou arquivos de teste bloqueados! Reverta os testes e corrija o CODIGO DE PRODUCAO.');
    violations.forEach((v) => console.error(` - ${v}`));
    console.error('================================================================\x1b[0m');
    process.exit(1);
  }

  console.log(`\x1b[32m[TDD VERIFIED] Integridade de todos os ${lockData.totalLockedFiles} arquivos de teste confirmada via SHA-256.\x1b[0m`);
  process.exit(0);
}

if (action === 'unlock') {
  const files = getTestFiles(workspaceRoot);
  for (const file of files) {
    try {
      fs.chmodSync(file, 0o666);
    } catch {}
  }
  try {
    if (fs.existsSync(lockFilePath)) {
      fs.chmodSync(lockFilePath, 0o666);
    }
  } catch {}
  console.log(`\x1b[33m[TDD UNLOCK] Arquivos de teste desbloqueados para escrita de novos testes (Fase A).\x1b[0m`);
  process.exit(0);
}

if (action === 'status') {
  if (!fs.existsSync(lockFilePath)) {
    console.log('\x1b[33m[TDD STATUS] Nenhum lock ativo ainda (tests.lock.json ausente).\x1b[0m');
    process.exit(0);
  }
  const raw = fs.readFileSync(lockFilePath, 'utf8').replace(/^\uFEFF/, '');
  const lockData = JSON.parse(raw);
  console.log(`\x1b[36m[TDD STATUS] Lock ativo desde ${lockData.updatedAt} com ${lockData.totalLockedFiles} arquivo(s) protegido(s).\x1b[0m`);
  process.exit(0);
}
