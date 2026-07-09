// ============================================================
//  Pocket Cloud starter app — "tenant storefront"
//  CEN4086 · Zero dependencies: runs on Node's standard library.
//
//  One image, many tenants: branding comes from environment
//  variables, product data from a mounted JSON file.
//
//    TENANT_NAME   e.g. "Palmetto Surf Co."
//    THEME_COLOR   e.g. "#0f8b8d"
//    TAGLINE       e.g. "Boards, wax & good vibes"
//    PORT          default 3000
//    PRODUCTS_FILE default ./products.json
//
//  ── MILESTONE 4 SEAM ─────────────────────────────────────
//  Everything below is split into STATIC (frontend) and API
//  (backend) sections. In M4 you will extract the API section
//  into its own service. The seam is marked with comments.
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const TENANT = process.env.TENANT_NAME || 'Palmetto Surf Co.';
const COLOR = process.env.THEME_COLOR || '#0f8b8d';
const TAGLINE = process.env.TAGLINE || 'Boards, wax & good vibes';
const PRODUCTS_FILE = process.env.PRODUCTS_FILE || path.join(__dirname, 'products.json');

const startedAt = Date.now();
const orders = [];                 // in-memory: a lesson in itself (M3: where should state live?)
const meter = {};                  // request counter per route — "measured service"

function count(route) { meter[route] = (meter[route] || 0) + 1; }

function loadProducts() {
  try { return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); }
  catch (e) { return [{ id: 1, name: 'Data missing — check PRODUCTS_FILE mount', price: 0, stock: 0 }]; }
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj, null, 2));
}

// ── API SECTION (extract this in Milestone 4) ────────────────
function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ["api", "products", "2"]

  if (req.method === 'GET' && url.pathname === '/api/health') {
    count('/api/health');
    return json(res, 200, {
      status: 'ok', tenant: TENANT,
      served_by: os.hostname(),                    // watch this change behind the load balancer!
      uptime_seconds: Math.round((Date.now() - startedAt) / 1000)
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    count('/api/config');
    return json(res, 200, { tenant: TENANT, color: COLOR, tagline: TAGLINE, served_by: os.hostname() });
  }

  if (req.method === 'GET' && url.pathname === '/api/products') {
    count('/api/products');
    return json(res, 200, loadProducts());
  }

  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'products' && parts[2]) {
    count('/api/products/:id');
    const p = loadProducts().find(x => String(x.id) === parts[2]);
    return p ? json(res, 200, p) : json(res, 404, { error: 'product not found', id: parts[2] });
  }

  if (req.method === 'POST' && url.pathname === '/api/orders') {
    count('/api/orders');
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const o = JSON.parse(body || '{}');
        if (!o.productId) return json(res, 400, { error: 'productId is required' });
        const order = { orderId: orders.length + 1, productId: o.productId, qty: o.qty || 1, placedAt: new Date().toISOString() };
        orders.push(order);
        json(res, 201, order);
      } catch { json(res, 400, { error: 'invalid JSON body' }); }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/orders') {
    count('/api/orders');
    return json(res, 200, orders);
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    // Your metering endpoint: this is what you'll "bill" the tenant from.
    count('/api/stats');
    return json(res, 200, { tenant: TENANT, served_by: os.hostname(), requests_by_route: meter, orders_taken: orders.length });
  }

  return json(res, 404, { error: 'no such endpoint', hint: 'see /api/health, /api/config, /api/products, /api/orders, /api/stats' });
}
// ── END API SECTION ──────────────────────────────────────────

// ── STATIC SECTION (this stays with the frontend in M4) ─────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function handleStatic(req, res, url) {
  count('static');
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[\/\\])+/, ''); // no path traversal
  const full = path.join(__dirname, 'public', file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 — not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
}
// ── END STATIC SECTION ───────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return handleStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`☁️  ${TENANT} storefront up on port ${PORT} (host: ${os.hostname()})`);
});
