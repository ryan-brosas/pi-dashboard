import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

const projectRoot = process.cwd();
const piCommand = join(
  projectRoot,
  'apps/collector/node_modules/.bin',
  process.platform === 'win32' ? 'pi.cmd' : 'pi',
);
const scratch = mkdtempSync(join(tmpdir(), 'pi-tps-distribution-'));
const packageRoot = join(scratch, 'package');
const agentDir = join(scratch, 'agent');
const sessionDir = join(scratch, 'sessions');
const binDir = join(scratch, 'bin');
const buildLog = join(scratch, 'build.log');
let child;

function copySourcePackage() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: projectRoot, encoding: 'utf8' },
  ).split('\0').filter(Boolean);

  for (const relativePath of files) {
    const source = join(projectRoot, relativePath);
    if (!existsSync(source)) continue;
    const target = join(packageRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

function writeFixtureCommands() {
  const npx = join(binDir, 'npx');
  writeFileSync(npx, [
    '#!/usr/bin/env bash',
    'set -e',
    'printf \'%s\\n\' "$*" >> "$SMOKE_BUILD_LOG"',
    'if [[ " $* " == *" build "* ]]; then',
    '  mkdir -p "$PWD/apps/dashboard/dist"',
    '  printf \'<!doctype html><title>distribution smoke</title>\\n\' > "$PWD/apps/dashboard/dist/index.html"',
    'fi',
    '',
  ].join('\n'));
  const opener = join(binDir, 'xdg-open');
  writeFileSync(opener, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(npx, 0o755);
  chmodSync(opener, 0o755);
}

function waitForFirstUseBuild() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000;
    const check = () => {
      const commands = existsSync(buildLog)
        ? readFileSync(buildLog, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      if (commands.length >= 2 && existsSync(join(packageRoot, 'apps/dashboard/dist/index.html'))) {
        resolve(commands);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`First-use build timed out. Commands: ${commands.join(' | ')}`));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

try {
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(join(sessionDir, 'project'), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  copySourcePackage();
  writeFixtureCommands();
  writeFileSync(
    join(sessionDir, 'project/session.jsonl'),
    `${JSON.stringify({
      type: 'session',
      version: 3,
      id: 'synthetic-session',
      timestamp: '2026-01-01T00:00:00Z',
      cwd: '/synthetic',
    })}\n`,
  );

  if (existsSync(join(packageRoot, 'apps/dashboard/dist/index.html'))) {
    throw new Error('Clean package unexpectedly contains generated dashboard assets.');
  }

  const baseEnv = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: sessionDir,
    PI_OFFLINE: '1',
    SMOKE_BUILD_LOG: buildLog,
    PATH: `${binDir}:${process.env.PATH}`,
  };
  execFileSync('npm', ['install', '--omit=dev'], {
    cwd: packageRoot,
    env: { ...baseEnv, npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
  execFileSync(piCommand, ['install', packageRoot, '--approve'], { env: baseEnv, stdio: 'pipe' });

  child = spawn(
    piCommand,
    ['--mode', 'rpc', '--no-session', '--no-skills', '--no-prompt-templates', '--no-context-files'],
    { env: baseEnv, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const commandReady = new Promise((resolve, reject) => {
    lines.on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.command !== 'get_commands') return;
      const commands = message.data?.commands ?? [];
      if (!commands.some((command) => command.name === 'tps-web')) {
        reject(new Error(`tps-web command was not registered: ${line}`));
        return;
      }
      resolve();
    });
  });
  child.stdin.write(`${JSON.stringify({ type: 'get_commands' })}\n`);
  await Promise.race([
    commandReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Command discovery timed out. ${stderr}`)), 20_000)),
  ]);

  child.stdin.write(`${JSON.stringify({ id: 'history', type: 'prompt', message: '/tps-web --history' })}\n`);
  const buildCommands = await waitForFirstUseBuild();
  const { packageManager } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const expected = [
    `--yes ${packageManager} install --frozen-lockfile`,
    `--yes ${packageManager} build`,
  ];
  if (JSON.stringify(buildCommands.slice(0, 2)) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected first-use commands: ${buildCommands.join(' | ')}`);
  }

  console.log('Distribution smoke passed: source command discovery and pinned first-use build.');
} finally {
  child?.kill('SIGTERM');
  rmSync(scratch, { recursive: true, force: true });
}
