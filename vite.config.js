import fs from 'node:fs/promises';
import path from 'node:path';

const TAKEOFF_LOG_DIR = '/Users/isaiahcalvo/Documents/Takeoff/Logs';

function sanitizeLogFilename(filename) {
  const safe = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '');
  return safe.endsWith('.json') ? safe : `${safe || 'takeoff-performance-log'}.json`;
}

function takeoffLogPlugin() {
  return {
    name: 'takeoff-local-performance-logs',
    configureServer(server) {
      server.middlewares.use('/__takeoff_logs', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        try {
          let body = '';
          for await (const chunk of req) body += chunk;
          const parsed = JSON.parse(body || '{}');
          const filename = sanitizeLogFilename(parsed.filename);
          const target = path.join(TAKEOFF_LOG_DIR, filename);
          await fs.mkdir(TAKEOFF_LOG_DIR, { recursive: true });
          await fs.writeFile(target, JSON.stringify(parsed.payload || {}, null, 2));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ saved: target }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error?.message || String(error) }));
        }
      });
    },
  };
}

export default {
  base: './',
  plugins: [takeoffLogPlugin()],
};
