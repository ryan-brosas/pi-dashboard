import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const RELAY_SCRIPT = join(process.cwd(), 'apps/collector/scripts/relay-metrics.sh');

function remotePublishBlock(): string {
  const script = readFileSync(RELAY_SCRIPT, 'utf8');
  const match = script.match(/<<'REMOTE'\n([\s\S]*?)\nREMOTE/);
  if (!match) throw new Error('Remote publish block not found');
  return match[1];
}

describe('relay metrics retention', () => {
  it('keeps a reactivated existing release when pruning old versions', () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-tps-relay-'));
    temporaryRoots.push(root);
    const releases = join(root, 'metrics-releases');
    mkdirSync(releases);

    const versions = ['7da22b5c1159', '111111111111', '222222222222', '333333333333'];
    versions.forEach((version, index) => {
      const release = join(releases, version);
      mkdirSync(release);
      writeFileSync(join(release, 'manifest.json'), `${version}\n`);
      const modified = new Date(Date.UTC(2026, 6, 29, 8, index));
      utimesSync(release, modified, modified);
    });
    symlinkSync(join(releases, versions[3]), join(root, 'metrics'));

    const payload = join(root, 'payload');
    mkdirSync(payload);
    writeFileSync(join(payload, 'manifest.json'), `${versions[0]} refreshed\n`);
    const archive = join(root, 'metrics.tar.gz');
    const tar = spawnSync('tar', ['-C', payload, '-czf', archive, '.']);
    expect(tar.status).toBe(0);

    const publish = spawnSync(
      'bash',
      ['-s', '--', root, versions[0], archive],
      { input: remotePublishBlock(), encoding: 'utf8' },
    );

    expect(publish.stderr).toBe('');
    expect(publish.status).toBe(0);
    expect(existsSync(join(releases, versions[0]))).toBe(true);
    expect(realpathSync(join(root, 'metrics'))).toBe(join(releases, versions[0]));
    expect(readdirSync(releases)).toHaveLength(3);
  });
});

describe('relay metrics publish timeout', () => {
  it('fails at the remote status check without attempting an upload', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'pi-tps-relay-timeout-'));
    temporaryRoots.push(scratch);
    const bin = join(scratch, 'bin');
    mkdirSync(bin);

    writeFileSync(join(bin, 'pnpm'), [
      '#!/usr/bin/env bash',
      'out=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in --out) shift; out="$1";; esac',
      '  shift',
      'done',
      'mkdir -p "$out"',
      'printf \'{"version":"5a441cfe3cb4","files":[],"recordCount":0,"snapshot":"snapshot.json"}\\n\' > "$out/manifest.json"',
      '',
    ].join('\n'));
    writeFileSync(join(bin, 'node'), '#!/usr/bin/env bash\nprintf \'5a441cfe3cb4\'\n');
    writeFileSync(join(bin, 'ssh'), '#!/usr/bin/env bash\nsleep 600\n');
    const scpMarker = join(scratch, 'scp-called');
    writeFileSync(join(bin, 'scp'), `#!/usr/bin/env bash\ntouch ${JSON.stringify(scpMarker)}\nexit 1\n`);
    for (const cmd of ['ssh', 'scp', 'pnpm', 'node']) {
      chmodSync(join(bin, cmd), 0o755);
    }

    const start = Date.now();
    const run = spawnSync('bash', [RELAY_SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: process.env.HOME,
        XDG_CACHE_HOME: scratch,
        PI_TPS_METRICS_HOST: 'dashboard@vps.example.com',
        PI_TPS_METRICS_ROOT: '/srv/pi-dashboard',
        PI_TPS_SSH_TIMEOUT: '1',
      },
      timeout: 15_000,
    });
    const elapsed = Date.now() - start;

    expect(run.status).toBe(1);
    expect(elapsed).toBeLessThan(5_000);
    expect(run.stderr).toContain('ssh status timed out or failed after 1s');
    expect(existsSync(scpMarker)).toBe(false);
  });
});
