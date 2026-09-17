import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const TARGET_PORT = 5173;
const LISTEN_PORT = parseInt(process.env.PORT || '10000', 10);
const LISTEN_HOST = '0.0.0.0';

console.log(`Starting DeepSeek Harness on internal port ${TARGET_PORT}...`);

// Start dsh web on 127.0.0.1:5173
const dshProcess = spawn(
  'node',
  ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--port', String(TARGET_PORT), '--no-open'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SSH_CONNECTION: '1'
    }
  }
);

dshProcess.on('exit', (code, signal) => {
  console.log(`dsh process exited with code ${code}, signal ${signal}`);
  process.exit(code ?? 1);
});

// Wait for dsh web to become responsive
function waitForTarget(callback, retries = 60) {
  const req = http.get(`http://127.0.0.1:${TARGET_PORT}/`, (res) => {
    console.log(`DSH web server is ready (status: ${res.statusCode})`);
    callback();
  });
  req.on('error', () => {
    if (retries > 0) {
      setTimeout(() => waitForTarget(callback, retries - 1), 1000);
    } else {
      console.error('Timed out waiting for DSH web server to start');
      process.exit(1);
    }
  });
}

waitForTarget(() => {
  const server = http.createServer((req, res) => {
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
      console.error('Proxy request error:', err.message);
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
      console.error('Upgrade proxy error:', err.message);
      socket.destroy();
    });

    socket.on('error', () => {
      targetSocket.destroy();
    });
  });

  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    console.log(`Render ingress proxy listening on ${LISTEN_HOST}:${LISTEN_PORT} -> 127.0.0.1:${TARGET_PORT}`);
  });
});

process.on('SIGTERM', () => {
  dshProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  dshProcess.kill('SIGINT');
  process.exit(0);
});
