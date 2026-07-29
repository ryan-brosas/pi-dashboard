import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Git package distribution', () => {
  it('loads a tracked source extension before generated assets exist', () => {
    const rootPackage = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      pi?: { extensions?: string[] };
      version?: string;
      keywords?: string[];
      license?: string;
      engines?: { node?: string };
      packageManager?: string;
    };
    const extension = rootPackage.pi?.extensions?.[0];

    expect(extension).toBe('./apps/collector/src/extension.ts');
    expect(existsSync(join(process.cwd(), extension!))).toBe(true);
    expect(rootPackage.keywords).toContain('pi-package');
    expect(rootPackage.license).toBe('MIT');
    expect(rootPackage.engines?.node).toBe('>=22.19.0');
    expect(rootPackage.packageManager).toBe('pnpm@11.6.0');
    for (const manifest of [
      'apps/collector/package.json',
      'apps/dashboard/package.json',
      'packages/metrics-core/package.json',
    ]) {
      const workspacePackage = JSON.parse(readFileSync(join(process.cwd(), manifest), 'utf8'));
      expect(workspacePackage.version).toBe(rootPackage.version);
    }
  });

  it('keeps portfolio metadata owned by this project', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

    expect(existsSync(join(process.cwd(), '.github/FUNDING.yml'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'npm-shrinkwrap.json'))).toBe(false);
    expect(readme).toContain('pi-tps-web combines a browser-based TPS inspector');
  });

  it('keeps generated public feed files out of Git', () => {
    const ignored = execFileSync(
      'git',
      ['check-ignore', 'apps/dashboard/metrics/manifest.json'],
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();

    expect(ignored).toBe('apps/dashboard/metrics/manifest.json');
  });

  it('resolves atomic release symlinks inside a live parent mount', () => {
    const compose = readFileSync(join(process.cwd(), 'apps/dashboard/docker-compose.yml'), 'utf8');
    const caddy = readFileSync(join(process.cwd(), 'apps/dashboard/Caddyfile'), 'utf8');

    expect(compose).toContain('${DEPLOY_ROOT:-.}:/srv/pi-dashboard:ro');
    expect(compose).not.toContain(':/srv/dashboard:ro');
    expect(compose).not.toContain(':/srv/metrics:ro');
    expect(caddy).toContain('root * {$DASHBOARD_ROOT}');
    expect(caddy).toContain('root * {$METRICS_ROOT}');
  });
});
