import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dashboardIndex = join(projectRoot, 'apps/dashboard/dist/index.html');
const lifecycleExecutable = basename(process.env.npm_execpath ?? '');
const isNpmLifecycle = ['npm', 'npm.cmd', 'npm-cli.js'].includes(lifecycleExecutable);

if (
  existsSync(dashboardIndex)
  || process.env.PI_TPS_PACKAGE_PREPARE === '1'
  || !isNpmLifecycle
) {
  process.exit(0);
}

const { packageManager } = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
if (typeof packageManager !== 'string' || !/^pnpm@\d+\.\d+\.\d+$/.test(packageManager)) {
  throw new Error('package.json must pin an exact pnpm version.');
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const env = { ...process.env, PI_TPS_PACKAGE_PREPARE: '1' };

console.log(`Preparing pi-tps-web with ${packageManager}...`);
execFileSync(npx, ['--yes', packageManager, 'install', '--frozen-lockfile'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
  timeout: 300_000,
});
execFileSync(npx, ['--yes', packageManager, 'build'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
  timeout: 300_000,
});
