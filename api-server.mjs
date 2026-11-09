// Local API server mirroring the Netlify Functions handlers.
// Usage: node api-server.mjs
// Listens on 8787 and proxies /api/* from Vite via vite.config.ts proxy.
import http from 'node:http';
import { handler } from './netlify/functions/api.mjs';

const PORT = Number(process.env.API_PORT || 8787);
http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  // Netlify redirects /api/* to /.netlify/functions/api/:splat
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  const event = {
    httpMethod: req.method || 'GET',
    path,
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])
    ),
    body,
    isBase64Encoded: false,
  };
  const result = await handler(event);
  res.writeHead(result.statusCode || 200, result.headers || {});
  res.end(result.body ?? '');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[api-server] listening on http://127.0.0.1:${PORT}`);
});
