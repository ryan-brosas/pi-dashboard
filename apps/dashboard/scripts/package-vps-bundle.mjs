import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const forwardedArgs = process.argv.slice(2);
const args = forwardedArgs[0] === '--' ? forwardedArgs.slice(1) : forwardedArgs;
const outIndex = args.indexOf('--out');
if (args.length > 0 && (outIndex === -1 || outIndex !== 0 || args.length !== 2)) {
  throw new Error('Usage: package-vps-bundle.mjs [--out <directory>]');
}
const outputDir = resolve(projectRoot, outIndex === -1 ? 'release' : args[1]);
const { version } = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const bundleName = `pi-tps-web-v${version}-vps`;
const archiveName = `${bundleName}.tar.gz`;
const archivePath = join(outputDir, archiveName);
const checksumPath = `${archivePath}.sha256`;
const scratch = mkdtempSync(join(tmpdir(), 'pi-tps-vps-package-'));
const stage = join(scratch, bundleName);
const epoch = new Date(0);

function requireFile(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Required release file is missing: ${path}`);
  }
}

function normalizeTree(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) normalizeTree(target);
    chmodSync(target, entry.isDirectory() ? 0o755 : 0o644);
    utimesSync(target, epoch, epoch);
  }
  chmodSync(path, 0o755);
  utimesSync(path, epoch, epoch);
}

try {
  requireFile(join(projectRoot, 'apps/dashboard/dist/index.html'));
  requireFile(join(projectRoot, 'apps/dashboard/dist/duckdb/duckdb-mvp.wasm'));
  requireFile(join(projectRoot, 'apps/dashboard/Caddyfile'));
  requireFile(join(projectRoot, 'apps/dashboard/docker-compose.yml'));
  requireFile(join(projectRoot, 'LICENSE'));
  requireFile(join(projectRoot, 'docs/install.md'));

  mkdirSync(outputDir, { recursive: true });
  if (existsSync(archivePath) || existsSync(checksumPath)) {
    throw new Error(`Refusing to overwrite an existing release asset in ${outputDir}`);
  }

  mkdirSync(join(stage, 'metrics'), { recursive: true });
  cpSync(join(projectRoot, 'apps/dashboard/dist'), join(stage, 'dist'), { recursive: true });
  cpSync(join(projectRoot, 'apps/dashboard/Caddyfile'), join(stage, 'Caddyfile'));
  cpSync(join(projectRoot, 'apps/dashboard/docker-compose.yml'), join(stage, 'docker-compose.yml'));
  cpSync(join(projectRoot, 'LICENSE'), join(stage, 'LICENSE'));
  cpSync(join(projectRoot, 'docs/install.md'), join(stage, 'install.md'));
  writeFileSync(join(stage, 'metrics/README.txt'), '# Generated metrics files go here. See install.md.\n');
  writeFileSync(join(stage, '.env.example'), [
    'CADDY_DOMAIN=dashboard.example.com',
    'DEPLOY_ROOT=.',
    'DASHBOARD_ROOT=/srv/pi-dashboard/dist',
    'METRICS_ROOT=/srv/pi-dashboard/metrics',
    '',
  ].join('\n'));
  writeFileSync(join(stage, 'README.txt'), [
    `pi-tps-web v${version} VPS bundle`,
    '',
    '1. Copy .env.example to .env and set CADDY_DOMAIN.',
    '2. Place sanitized manifest.json, snapshot.json, and hourly/ under metrics/.',
    '3. Run: docker compose up -d',
    '4. Verify: curl -fsS https://YOUR_DOMAIN/feed/manifest.json',
    '',
    'Full instructions: install.md',
    '',
  ].join('\n'));
  normalizeTree(stage);

  execFileSync('tar', [
    '--sort=name',
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '--mtime=@0',
    '-C',
    scratch,
    '-czf',
    archivePath,
    bundleName,
  ]);
  const digest = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  writeFileSync(checksumPath, `${digest}  ${basename(archivePath)}\n`);
  console.log(JSON.stringify({ archive: archivePath, checksum: checksumPath, sha256: digest }));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
