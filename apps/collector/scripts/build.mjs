import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(packageRoot, 'dist/extension.js');

await mkdir(dirname(output), { recursive: true });
await build({
  entryPoints: [resolve(packageRoot, 'src/extension.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external: [
    '@earendil-works/pi-ai',
    '@earendil-works/pi-coding-agent',
  ],
});

console.log(`Built ${output}`);
