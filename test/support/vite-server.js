import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import path from 'node:path';

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForServer(baseUrl, child, timeoutMs = 6000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode != null) break;
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch (_) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }
  throw new Error(`Vite server did not start at ${baseUrl}`);
}

export async function withViteServer(callback) {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteBin = path.join(process.cwd(), 'node_modules/.bin/vite');
  const vite = spawn(viteBin, [
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ], {
    cwd: new URL('../..', import.meta.url),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  vite.stdout.on('data', chunk => { output += chunk; });
  vite.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer(baseUrl, vite);
    await callback(baseUrl);
  } catch (error) {
    error.message += `\nVite output:\n${output}`;
    throw error;
  } finally {
    if (vite.exitCode == null && !vite.killed) {
      try {
        process.kill(-vite.pid, 'SIGTERM');
      } catch (_) {
        vite.kill('SIGTERM');
      }
      await Promise.race([
        once(vite, 'close'),
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
    }
  }
}
