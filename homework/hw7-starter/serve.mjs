/*
  serve.mjs — the "legacy on-prem server" for Sandpiper Surf Supply's front desk.

  WHO uses this: you, on your laptop, before the migration. In the assignment's
  story this program is the aging in-office machine the business wants to retire.
  WHAT it does: serves the static files inside ./site over plain HTTP.
  WHERE it runs: only on your machine, at http://localhost:8080.
  WHEN you run it: Part 0 (preflight) and any time you want to preview a site
  change before uploading it to S3.
  WHY it exists: so you can feel the exact thing S3 static website hosting
  replaces — a computer you must keep powered, patched, and reachable just to
  hand out unchanging files.

  It uses only Node's built-in modules on purpose: nothing to npm install.
*/

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname does not exist in ES modules, so we rebuild it from import.meta.url.
const here = path.dirname(fileURLToPath(import.meta.url));

// Every file we serve lives under ./site — the same folder you will upload to S3.
const siteRoot = path.join(here, 'site');

// The server only speaks for file types the site actually contains.
// A real web server has a much longer table; the idea is identical.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const PORT = 8080;

const server = createServer(async (req, res) => {
  try {
    // Strip the query string; a static server only cares about the path part.
    const rawPath = new URL(req.url, `http://localhost:${PORT}`).pathname;

    // "/" means the front page — exactly the rule S3 applies when you set
    // index.html as the website's index document.
    const relative = rawPath === '/' ? 'index.html' : rawPath.slice(1);

    // SECURITY: resolve the requested path and refuse anything that escapes
    // ./site (for example "../../secrets"). Without this check a static server
    // becomes a read-anything-on-disk server.
    const filePath = path.resolve(siteRoot, relative);
    if (!filePath.startsWith(siteRoot + path.sep) && filePath !== siteRoot) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    const body = await readFile(filePath);
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch {
    // Missing file (or unreadable file) → 404, the same answer S3 gives for a
    // key that does not exist in the bucket.
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  // console.log is safe here — unlike an MCP stdio server, a web server's
  // stdout is just a log, not a protocol channel.
  console.log(`Sandpiper front desk (legacy) → http://localhost:${PORT}`);
  console.log('Stop it with Ctrl+C. While it is stopped, the "old" site is down — remember that feeling.');
});
