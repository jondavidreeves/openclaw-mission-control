import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../../dist');

const contentTypes = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function safeResolve(requestPath: string): string {
  const cleanPath = requestPath === '/' ? '/index.html' : requestPath;
  const resolved = path.resolve(distDir, `.${cleanPath}`);
  if (!resolved.startsWith(distDir)) {
    throw new Error('Invalid path');
  }
  return resolved;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let filePath = safeResolve(url.pathname);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': contentTypes.get(ext) ?? 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  } catch (error) {
    const status = error instanceof Error && error.message === 'Invalid path' ? 400 : 404;
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(status === 400 ? 'Bad request' : 'Not found');
  }
});

const port = Number(process.env.MISSION_CONTROL_WEB_PORT ?? 4173);
const host = process.env.MISSION_CONTROL_WEB_HOST ?? '127.0.0.1';

server.listen(port, host, () => {
  console.log(`Mission Control web listening on http://${host}:${port}`);
});
