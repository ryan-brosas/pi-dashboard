import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS_URL = 'https://tokenwatch.wyrdwerk.com/api/v1/models';
const PERFORMANCE_URL = 'https://tokenwatch.wyrdwerk.com/performance.json';
const PAGE_SIZE = 500;
const MAX_MODELS = 5_000;
const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function fetchModelPage(offset) {
  const url = new URL(MODELS_URL);
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  const payload = await fetchJson(url);
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.models)) {
    throw new Error(`Invalid model page at offset ${offset}`);
  }
  return payload;
}

async function fetchModels() {
  const first = await fetchModelPage(0);
  const reportedTotal = Number(first.total ?? first.models.length);
  if (!Number.isFinite(reportedTotal) || reportedTotal < 1 || reportedTotal > MAX_MODELS) {
    throw new Error(`Invalid model total: ${first.total}`);
  }

  const offsets = [];
  for (let offset = PAGE_SIZE; offset < reportedTotal; offset += PAGE_SIZE) offsets.push(offset);
  const pages = await Promise.all(offsets.map(fetchModelPage));
  const models = [first, ...pages].flatMap((page) => page.models);
  if (models.length !== reportedTotal) {
    throw new Error(`Expected ${reportedTotal} models, received ${models.length}`);
  }

  return { generated_at: first.generated_at, models };
}

async function writeJson(fileName, payload) {
  const target = resolve(OUTPUT_DIR, fileName);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload)}\n`, 'utf8');
  await rename(temporary, target);
}

const [models, performance] = await Promise.all([
  fetchModels(),
  fetchJson(PERFORMANCE_URL),
]);
if (!performance || typeof performance !== 'object' || Array.isArray(performance)) {
  throw new Error('Invalid market performance payload');
}

await mkdir(OUTPUT_DIR, { recursive: true });
await Promise.all([
  writeJson('model-market.json', models),
  writeJson('model-performance.json', performance),
]);

console.log(`Synced ${models.models.length} market routes to ${OUTPUT_DIR}`);
