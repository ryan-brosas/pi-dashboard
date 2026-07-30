import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Pi package distribution', () => {
  it('loads a tracked source extension before generated assets exist', () => {
    const rootPackage = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      pi?: { extensions?: string[] };
      version?: string;
      description?: string;
      keywords?: string[];
      license?: string;
      engines?: { node?: string };
      packageManager?: string;
    };
    const extension = rootPackage.pi?.extensions?.[0];

    expect(extension).toBe('./apps/collector/src/extension.ts');
    expect(existsSync(join(process.cwd(), extension!))).toBe(true);
    expect(rootPackage.description).toContain('PAYG model market');
    expect(rootPackage.keywords).toEqual(expect.arrayContaining(['pi-package', 'payg', 'model-market', 'pricing']));
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

  it('publishes gallery-ready npm metadata and only required runtime files', () => {
    const rootPackage = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      name?: string;
      private?: boolean;
      files?: string[];
      scripts?: { prepack?: string };
      publishConfig?: { access?: string };
      peerDependencies?: Record<string, string>;
      pi?: { image?: string };
    };

    expect(rootPackage.name).toBe('pi-tps-web');
    expect(rootPackage.private).not.toBe(true);
    expect(rootPackage.files).toEqual([
      'apps/collector/scripts/prepare-package.mjs',
      'apps/collector/src/extension.ts',
      'apps/dashboard/dist',
      'docs/install.md',
    ]);
    expect(rootPackage.scripts?.prepack).toBe('pnpm build');
    expect(rootPackage.publishConfig?.access).toBe('public');
    expect(rootPackage.peerDependencies).toEqual({
      '@earendil-works/pi-ai': '*',
      '@earendil-works/pi-coding-agent': '*',
    });
    expect(rootPackage.pi?.image).toBe(
      'https://raw.githubusercontent.com/ryan-brosas/pi-dashboard/main/apps/dashboard/public/preview.png',
    );
  });

  it('keeps portfolio metadata owned by this project', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

    expect(existsSync(join(process.cwd(), '.github/FUNDING.yml'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'npm-shrinkwrap.json'))).toBe(false);
    expect(readme).toContain('pi-tps-web combines a browser-based TPS inspector');
    expect(readme).toContain('## Choose a PAYG route');
    expect(readme).toContain('Lowest PAYG');
    expect(readme).toContain('Fastest qualifying');
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
