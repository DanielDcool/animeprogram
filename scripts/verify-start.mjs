import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tanku-anime-start-'));

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port == null) reject(new Error('Could not allocate a local port'));
        else resolve(port);
      });
    });
  });
}

const serverPort = await getAvailablePort();
let webPort = await getAvailablePort();
while (webPort === serverPort) webPort = await getAvailablePort();

const child = fork(path.join(rootDir, 'scripts', 'start.mjs'), [], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(serverPort),
    WEB_PORT: String(webPort),
    DATA_DIR: path.join(tempRoot, 'data'),
    MEDIA_DIR: path.join(tempRoot, 'media'),
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});

let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = `${output}${chunk}`.slice(-12_000);
  });
}

let childResult = null;
const childExit = new Promise((resolve) => {
  child.once('exit', (code, signal) => {
    childResult = { code, signal };
    resolve(childResult);
  });
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (childResult) {
      throw new Error(`${label} did not become ready before the app stopped`);
    }
    try {
      if (await check()) return;
    } catch {
      // The development servers can refuse connections while they are starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${serverPort}/api/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok && (await response.json()).ok === true;
  }, 'the health endpoint');

  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${webPort}/`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok && (await response.text()).includes('<title>tanku Anime');
  }, 'the web application');

  console.log('Verified app startup, web page, health endpoint, SQLite, and media-directory watcher.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (output) console.error(output);
  process.exitCode = 1;
} finally {
  if (!childResult) {
    if (child.connected) child.send({ type: 'shutdown' });
    else child.kill('SIGTERM');
  }
  const stopped = await Promise.race([childExit.then(() => true), delay(5_000).then(() => false)]);
  if (!stopped) {
    child.kill('SIGKILL');
    await childExit;
  }
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
