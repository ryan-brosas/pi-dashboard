import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const INSTALL_SCRIPT = join(process.cwd(), 'apps/collector/scripts/install-relay-timer.sh');

function generatedUnits(remoteHost: string, remoteRoot: string): {
  service: string;
  timer: string;
  systemctlCalls: string;
  loginctlCalls: string;
  home: string;
} {
  const scratch = mkdtempSync(join(tmpdir(), 'pi-tps-installer-'));
  temporaryRoots.push(scratch);
  const userDir = join(scratch, '.config', 'systemd', 'user');
  mkdirSync(userDir, { recursive: true });
  const fakeSystemctl = join(scratch, 'systemctl');
  writeFileSync(fakeSystemctl, `#!/usr/bin/env bash\necho "stubbed: $*"\n`);
  chmodSync(fakeSystemctl, 0o755);
  const fakeLoginctl = join(scratch, 'loginctl');
  writeFileSync(fakeLoginctl, [
    '#!/usr/bin/env bash',
    'echo "$*" >> "$HOME/loginctl.log"',
    'if [ "$1" = "show-user" ]; then',
    '  if [ -f "$HOME/linger-enabled" ]; then echo yes; else echo no; fi',
    'elif [ "$1" = "enable-linger" ]; then',
    '  touch "$HOME/linger-enabled"',
    'fi',
    '',
  ].join('\n'));
  chmodSync(fakeLoginctl, 0o755);

  const out = spawnSync('bash', [INSTALL_SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: scratch,
      USER: 'test-user',
      PATH: `${dirname(fakeSystemctl)}:${process.env.PATH}`,
      PI_TPS_METRICS_HOST: remoteHost,
      PI_TPS_METRICS_ROOT: remoteRoot,
    },
  });
  expect(out.error ?? out.status, `installer stderr: ${out.stderr}`).toBe(0);

  const service = readFileSync(join(userDir, 'pi-tps-metrics-relay.service'), 'utf8');
  const timer = readFileSync(join(userDir, 'pi-tps-metrics-relay.timer'), 'utf8');
  const loginctlCalls = readFileSync(join(scratch, 'loginctl.log'), 'utf8');
  return { service, timer, systemctlCalls: out.stdout, loginctlCalls, home: scratch };
}

describe('install-relay-timer', () => {
  it('generates a bounded oneshot that retries failures without a restart storm', () => {
    const { service, systemctlCalls } = generatedUnits('dashboard@vps.example.com', '/srv/pi-dashboard');

    expect(service).toMatch(/Type=oneshot/);
    expect(service).toMatch(/TimeoutStartSec=5m/);
    expect(service).toMatch(/Restart=on-failure/);
    expect(service).toMatch(/RestartSec=10m/);
    expect(service).toMatch(/StartLimitIntervalSec=1h/);
    expect(service).toMatch(/StartLimitBurst=4/);
    expect(systemctlCalls).toContain('start --no-block pi-tps-metrics-relay.service');
  });

  it('generates a persistent hourly timer that catches up after downtime', () => {
    const { timer } = generatedUnits('dashboard@vps.example.com', '/srv/pi-dashboard');

    expect(timer).toMatch(/Persistent=true/);
    expect(timer).toMatch(/OnCalendar=hourly/);
    expect(timer).toMatch(/WantedBy=timers\.target/);
  });

  it('enables and verifies lingering so the user timer survives a reboot before login', () => {
    const { loginctlCalls } = generatedUnits('dashboard@vps.example.com', '/srv/pi-dashboard');
    expect(loginctlCalls).toContain('show-user test-user');
    expect(loginctlCalls).toContain('enable-linger test-user');
    expect(loginctlCalls.match(/show-user test-user/g)).toHaveLength(2);
  });

  it('injects portable paths and the relay destination into the service environment', () => {
    const { service, home } = generatedUnits('dashboard@vps.example.com', '/srv/pi-dashboard');
    const pathLine = service.split('\n').find((line) => line.startsWith('Environment="PATH='));
    expect(pathLine).toContain(`${home}/.pi/agent/bin:${home}/.local/bin:`);
    expect(service).toContain('PI_TPS_METRICS_HOST=dashboard@vps.example.com');
    expect(service).toContain('PI_TPS_METRICS_ROOT=/srv/pi-dashboard');
  });
});
