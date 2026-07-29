/**
 * pi-tps-web — Web Telemetry Inspector for pi
 *
 * Registers `/tps-web` to export session telemetry as JSONL, start a
 * loopback HTTP server for the built inspector, and open it in the browser.
 * Compatible TPS events are visualized when present; native Pi messages
 * provide usage and cost history without an additional telemetry source.
 */

import { execFile } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, extname, resolve, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const DEFAULT_PORT = 3141;
const PACKAGE_MANAGER = 'pnpm@11.6.0';
const BUILD_FAILURE_MESSAGE =
  'Dashboard build failed. In the package directory run: ' +
  `npx --yes ${PACKAGE_MANAGER} install --frozen-lockfile && npx --yes ${PACKAGE_MANAGER} build, ` +
  'then reload Pi and try again.';

// Resolve the dashboard bundle from either src/ or dist/ execution.
const extensionDir = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(extensionDir, '..', '..', '..');
const DIST_PATH = join(PKG_ROOT, 'apps', 'dashboard', 'dist');

/**
 * Ensure the built web app exists. Package installation normally prepares the
 * ignored assets through the npm lifecycle. Local-path packages and installs
 * with lifecycle scripts disabled use this pinned build as a fallback.
 *
 * Returns true if dist/ is available before or after the fallback build.
 */
async function ensureDist(): Promise<boolean> {
  if (existsSync(join(DIST_PATH, 'index.html'))) return true;

  // The fallback needs the dev dependencies that Pi's npm install omits.
  const run = (cmd: string, args: string[]): Promise<void> =>
    new Promise((res, rej) => {
      execFile(cmd, args, { cwd: PKG_ROOT, timeout: 180_000 }, (err) =>
        err ? rej(err) : res(),
      );
    });

  try {
    await run('npx', ['--yes', PACKAGE_MANAGER, 'install', '--frozen-lockfile']);
    await run('npx', ['--yes', PACKAGE_MANAGER, 'build']);
  } catch {
    return false;
  }

  return existsSync(join(DIST_PATH, 'index.html'));
}

function isPathSafe(requestPath: string, root: string): boolean {
  const resolved = resolve(root, requestPath);
  return resolved.startsWith(root + sep) || resolved === root;
}

function serveStatic(
  root: string,
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
): void {
  const urlPath = req.url?.split('?')[0] || '/';
  // Strip leading slash so resolve() treats this as relative to root,
  // not as an absolute path that replaces the base.
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');

  if (!isPathSafe(relativePath, root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const filePath = join(root, relativePath);

  // SPA fallback: if file doesn't exist or is a directory, serve index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    const fallback = join(root, 'index.html');
    if (existsSync(fallback)) {
      const content = readFileSync(fallback);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.html'],
        'Cache-Control': 'no-cache',
      });
      res.end(content);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end('Internal server error');
  }
}

export default function tpsWebExtension(pi: ExtensionAPI) {
  let server: ReturnType<typeof createServer> | null = null;
  let serverPort = DEFAULT_PORT;

  // In-memory telemetry data served via the API endpoint.
  // Updated on each /tps-web invocation.
  let telemetryJsonl: string | null = null;
  let telemetryVersion = 0;

  // Connected SSE clients for real-time push notifications.
  const sseClients = new Set<import('http').ServerResponse>();

  type HistorySession = { fileName: string; raw: string };
  let historySessions: HistorySession[] = [];
  let historySignature = '';
  let historyPoller: ReturnType<typeof setInterval> | null = null;
  let historyMode = false;

  function notifyVersion(): void {
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify({ version: telemetryVersion })}\n\n`);
    }
  }

  function sessionsRoot(): string {
    if (process.env.PI_CODING_AGENT_SESSION_DIR) {
      return resolve(process.env.PI_CODING_AGENT_SESSION_DIR);
    }
    const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
    return join(agentDir, 'sessions');
  }

  function findSessionFiles(root: string): string[] {
    if (!existsSync(root)) return [];
    const files: string[] = [];
    const pending = [root];
    while (pending.length > 0) {
      const directory = pending.pop()!;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) pending.push(path);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path);
      }
    }
    return files.sort();
  }

  function refreshHistory(force = false): boolean {
    const root = sessionsRoot();
    const files = findSessionFiles(root);
    const signature = files.map((path) => {
      const stat = statSync(path);
      return `${path}:${stat.size}:${stat.mtimeMs}`;
    }).join('|');
    if (!force && signature === historySignature) return false;

    historySessions = files.map((path) => ({
      fileName: relative(root, path).split(sep).join('/'),
      raw: readFileSync(path, 'utf8'),
    }));
    historySignature = signature;
    telemetryVersion++;
    notifyVersion();
    return true;
  }

  function startHistoryPolling(): void {
    historyMode = true;
    if (historyPoller) return;
    historyPoller = setInterval(() => {
      try { refreshHistory(); } catch { /* retry on the next tick */ }
    }, 2000);
  }

  function startServer(): Promise<number> {
    if (server) return Promise.resolve(serverPort);

    return new Promise((resolve, reject) => {
      const s = createServer((req, res) => {
        const urlPath = req.url?.split('?')[0] || '/';

        // API: all native Pi session files for the history usage dashboard.
        if (urlPath === '/api/history') {
          try {
            if (historyMode) refreshHistory();
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            });
            res.end(JSON.stringify({ version: telemetryVersion, sessions: historySessions }));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(error) }));
          }
          return;
        }

        // API: return the current telemetry data as JSONL
        if (urlPath === '/api/telemetry') {
          const data = telemetryJsonl || '';
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(data);
          return;
        }

        // API: version counter for polling (web app checks this to detect data changes)
        if (urlPath === '/api/version') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ version: telemetryVersion }));
          return;
        }

        // API: Server-Sent Events stream for real-time push.
        // When /tps-web updates the telemetry, the server pushes
        // the new version to all connected clients immediately,
        // eliminating the 2s polling latency.
        if (urlPath === '/api/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive',
          });
          res.write('');
          sseClients.add(res);
          req.on('close', () => {
            sseClients.delete(res);
          });
          return;
        }

        // Static files from dist/
        serveStatic(DIST_PATH, req, res);
      });

      // Loopback only: history responses contain local session transcripts.
      s.listen(serverPort, '127.0.0.1', () => {
        server = s;
        resolve(serverPort);
      });

      s.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port taken — try next one
          serverPort++;
          startServer().then(resolve, reject);
        } else {
          reject(err);
        }
      });
    });
  }

  // Clean up server on session shutdown
  pi.on('session_shutdown', () => {
    // Close all SSE connections before shutting down the server
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
    if (historyPoller) {
      clearInterval(historyPoller);
      historyPoller = null;
    }
    historyMode = false;
    if (server) {
      server.close();
      server = null;
    }
  });

  /**
   * Open a URL or path with the system's default handler.
   * Non-blocking — uses execFile instead of execSync.
   */
  function openInSystem(target: string): void {
    const [cmd, args] =
      process.platform === 'darwin'
        ? ['open', [target]]
        : ['xdg-open', [target]];
    execFile(cmd, args, (err) => {
      if (err) {
        // opener not available — ignore silently
      }
    });
  }

  pi.registerCommand('tps-web', {
    description:
      'Open the pi telemetry dashboard (--history for all sessions, --full for all current-session branches)',
    getArgumentCompletions: (argumentPrefix: string) => {
      return [
        { value: '--history', label: '--history (live usage and cost across all Pi sessions)' },
        { value: '--full', label: '--full (all branches in the current session)' },
      ].filter((item) => item.value.startsWith(argumentPrefix));
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const tokens = args.trim().split(/\s+/).filter(Boolean);
      const full = tokens.includes('--full');
      const history = tokens.includes('--history');

      // Snapshot the session data synchronously — this is fast (returns
      // references to in-memory objects). All heavy processing (filtering,
      // re-chaining, serializing, file I/O) is deferred to the background
      // so the handler returns immediately and the TUI stays responsive.
      const entries = full ? ctx.sessionManager.getEntries() : ctx.sessionManager.getBranch();
      const notify = ctx.ui.notify.bind(ctx.ui);

      if (!history && entries.length === 0) {
        const scope = full ? 'all-entries' : 'current-branch';
        ctx.ui.notify(`No entries found in ${scope}`, 'warning');
        return;
      }

      // Everything below is fire-and-forget — the handler returns now.
      (async () => {
        if (history) {
          try {
            refreshHistory(true);
            startHistoryPolling();
          } catch (error) {
            notify(`Unable to read Pi session history: ${error}`, 'error');
            return;
          }

          if (historySessions.length === 0) {
            notify(`No Pi session files found under ${sessionsRoot()}`, 'warning');
            return;
          }
          notify(`Loading ${historySessions.length} Pi sessions into the usage dashboard…`, 'info');

          if (!(await ensureDist())) {
            notify(BUILD_FAILURE_MESSAGE, 'warning');
            return;
          }
          try {
            if (!server) serverPort = DEFAULT_PORT;
            const port = await startServer();
            const url = `http://localhost:${port}?auto=history&v=${telemetryVersion}`;
            openInSystem(url);
            notify(`Live Pi usage dashboard: ${url}`, 'info');
          } catch (error) {
            notify(`Failed to start web server: ${error}`, 'error');
          }
          return;
        }

        const isStructural = (e: { type: string }) =>
          e.type === 'model_change' || e.type === 'branch_summary';

        const exportedEntries = entries.filter(
          (e: { type: string }) => isStructural(e) || e.type === 'custom',
        );

        if (exportedEntries.length === 0) {
          const scope = full ? 'all-entries' : 'current-branch';
          notify(`No matching entries found in ${scope}`, 'warning');
          return;
        }

        // Re-chain parentIds so the exported entries form a valid tree
        const byId = new Map(entries.map((e: { id: string }) => [e.id, e]));
        const exportedIds = new Set(exportedEntries.map((e: { id: string }) => e.id));

        const rechainParentId = (entry: { parentId: string | null }): string | null => {
          let current: string | null = entry.parentId;
          while (current) {
            if (exportedIds.has(current)) return current;
            const parent = byId.get(current) as { parentId?: string | null } | undefined;
            current = parent?.parentId ?? null;
          }
          return null;
        };

        const rechained = exportedEntries.map((e: { parentId: string | null }) => ({
          ...e,
          parentId: rechainParentId(e),
        }));

        const content = rechained.map((e: object) => JSON.stringify(e)).join('\n') + '\n';

        // Write a self-contained JSONL export before opening its folder.
        const cacheBase = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
        const dir = join(cacheBase, 'pi-telemetry');
        mkdirSync(dir, { recursive: true });

        const sessionId = ctx.sessionManager.getSessionId?.() ?? 'unknown';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const scope = full ? 'full' : 'branch';
        const filename = `pi-telemetry-${scope}-${sessionId.slice(0, 8)}-${timestamp}.jsonl`;
        const filepath = join(dir, filename);
        writeFileSync(filepath, content);

        // Open the folder containing the exported JSONL
        openInSystem(dir);

        // Update in-memory data for the API endpoint
        telemetryJsonl = content;
        telemetryVersion++;

        // Push update to all connected SSE clients
        notifyVersion();

        const structuralCount = exportedEntries.filter((e: { type: string }) => isStructural(e)).length;
        const customCount = exportedEntries.length - structuralCount;
        const parts: string[] = [];
        if (customCount > 0) parts.push(`${customCount} telemetry`);
        if (structuralCount > 0) parts.push(`${structuralCount} structural`);
        const summary = parts.length > 0 ? parts.join(' + ') : `${exportedEntries.length} entries`;

        notify(`Exporting ${summary} + starting web inspector…`, 'info');

        // Build (if needed), start server, open browser
        if (!(await ensureDist())) {
          notify(
            BUILD_FAILURE_MESSAGE,
            'warning',
          );
          return;
        }

        try {
          if (!server) {
            serverPort = DEFAULT_PORT;
          }
          const port = await startServer();
          const url = `http://localhost:${port}?auto=1&v=${telemetryVersion}`;
          openInSystem(url);
          notify(`Exported ${summary} → ${filepath}\nWeb inspector: http://localhost:${port}`, 'info');
        } catch (err) {
          notify(`Failed to start web server: ${err}`, 'error');
        }
      })();
    },
  });
}
