import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const TARGET_PORT = 5173;
const LISTEN_PORT = parseInt(process.env.PORT || '10000', 10);
const LISTEN_HOST = '0.0.0.0';

console.log(`[Entrypoint] Starting DeepSeek Harness on internal port ${TARGET_PORT}...`);
console.log(`[Entrypoint] Render ingress proxy will listen on ${LISTEN_HOST}:${LISTEN_PORT}`);

let isReady = false;
let launchToken = null;

// Start dsh web on 127.0.0.1:5173
const dshProcess = spawn(
  'node',
  [
    '--import', 'tsx/esm',
    'apps/cli/src/bin.ts',
    'web',
    '--port', String(TARGET_PORT),
    '--no-open'
  ],
  {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SSH_CONNECTION: '1'
    }
  }
);

dshProcess.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  const match = text.match(/token=([a-zA-Z0-9_-]+)/);
  if (match) {
    launchToken = match[1];
    console.log(`[Entrypoint] Captured DSH launch token: ${launchToken}`);
  }
});

dshProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

dshProcess.on('error', (err) => {
  console.error('[Entrypoint] Failed to start dsh process:', err);
  process.exit(1);
});

dshProcess.on('exit', (code, signal) => {
  console.log(`[Entrypoint] dsh process exited with code ${code}, signal ${signal}`);
  process.exit(code ?? 1);
});

// Continuously probe target until ready
function checkTargetReady() {
  const req = http.get(`http://127.0.0.1:${TARGET_PORT}/`, (res) => {
    if (!isReady) {
      isReady = true;
      console.log(`[Entrypoint] DSH web server is ready! (probe status: ${res.statusCode})`);
    }
  });
  req.on('error', () => {
    setTimeout(checkTargetReady, 1000);
  });
}
checkTargetReady();

// Start ingress proxy immediately so Render detects open port without delay
const server = http.createServer((req, res) => {
  if (!isReady) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '5' });
    res.end('<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#111;color:#eee"><div><h2>DeepSeek Harness is starting up...</h2><p>Please wait a moment while the agent loads.</p></div></body></html>');
    return;
  }

  // Auto-authenticate unauthenticated browser visits by attaching the captured launch token
  if (launchToken && req.method === 'GET' && req.url === '/' && !req.headers.cookie?.includes('dsh-auth')) {
    res.writeHead(302, {
      'Location': `/?token=${launchToken}`,
      'Cache-Control': 'no-store'
    });
    res.end();
    return;
  }

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${TARGET_PORT}`,
        ...(req.headers.origin ? { origin: `http://127.0.0.1:${TARGET_PORT}` } : {})
      }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[Proxy] HTTP error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
  });

  req.pipe(proxyReq);
});

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
  const targetSocket = net.connect(TARGET_PORT, '127.0.0.1', () => {
    let headersStr = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'host') {
        headersStr += `host: 127.0.0.1:${TARGET_PORT}\r\n`;
      } else if (key.toLowerCase() === 'origin') {
        headersStr += `origin: http://127.0.0.1:${TARGET_PORT}\r\n`;
      } else if (Array.isArray(value)) {
        for (const v of value) headersStr += `${key}: ${v}\r\n`;
      } else {
        headersStr += `${key}: ${value}\r\n`;
      }
    }
    headersStr += '\r\n';
    targetSocket.write(headersStr);
    if (head && head.length > 0) {
      targetSocket.write(head);
    }
    targetSocket.pipe(socket);
    socket.pipe(targetSocket);
  });

  targetSocket.on('error', (err) => {
    console.error('[Proxy] Upgrade error:', err.message);
    socket.destroy();
  });

  socket.on('error', () => {
    targetSocket.destroy();
  });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[Entrypoint] Render ingress proxy listening on ${LISTEN_HOST}:${LISTEN_PORT} -> 127.0.0.1:${TARGET_PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[Entrypoint] Received SIGTERM, shutting down...');
  dshProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Entrypoint] Received SIGINT, shutting down...');
  dshProcess.kill('SIGINT');
  process.exit(0);
});
