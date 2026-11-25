/* THE BOSS'S AI AGENT AND THE STOCK ANALYSIS DASHBOARD SAY THE SAME THING.

   supabase/functions/mjm-mcp is the MJM AI System as an MCP server: the
   boss's Claude checks stock, makes a quotation and confirms an order
   through it. This drives the REAL index.ts in Deno, against a small fake
   of Supabase's REST API serving the SAME ledger
   tests/stock_analysis_dashboard.cjs puts through the real page — so the
   agent's 5,200 available and 7,000 owed are the page's 5,200 and 7,000.

   It also holds:
     · the shared rule is ONE file in two places, byte for byte
       (shared/ and supabase/functions/_shared/)
     · the key is the link: a wrong or missing key is a 404, nothing more
     · a quotation is a DRAFT, numbered QOPS<n>/MM/YY after the highest,
       and a number taken a moment ago (23505) moves to the next
     · confirm_order marks it ACCEPTED, refuses a rejected one, and writes
       to shared_quotations and nowhere else; nothing is ever deleted

   Needs Deno. It is found on PATH, at $DENO, or installed with
   `npm install deno` into any folder and pointed at with DENO=.
   Run: node tests/the_mcp_reads_the_dashboard.cjs
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : ' → got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)));
};

console.log('0. one rule, two copies');
const a = fs.readFileSync(path.join(ROOT, 'shared/shared_stock_analysis.js'), 'utf8');
const bPath = path.join(ROOT, 'supabase/functions/_shared/stock_analysis.js');
check('the Edge Function copy of the stock rule is the page copy, byte for byte',
  fs.existsSync(bPath) && fs.readFileSync(bPath, 'utf8') === a, true);
const page = fs.readFileSync(path.join(ROOT, 'operation/operation_stock_sales.js'), 'utf8');
check('the dashboard classifies through the shared rule', /MJMStockAnalysis\.classify\(/.test(page), true);

function findDeno() {
  if (process.env.DENO && fs.existsSync(process.env.DENO)) return process.env.DENO;
  try { return execSync('command -v deno', { encoding: 'utf8' }).trim() || null; } catch (e) { return null; }
}
const DENO = findDeno();
if (!DENO) {
  console.log('\nNo Deno found — the end-to-end half was NOT run. Set DENO=/path/to/deno.');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

/* The dashboard test's ledger, with the clock at 17 Nov 2026 (Malaysia). */
const tl = (plot, batch, qty, date) => ({ transaction_type: 'Transplanted', plot_name: plot, batch_name: batch,
  breed_name: 'AA Hybrida 1S', quantity_change: qty, remark: 'Transplant. Date: ' + date, created_at: date + 'T00:00:00Z' });
let nextId = 1;
const withIds = (list) => list.map((r) => Object.assign({ id: nextId++ }, r));
const DB = {
  shared_inventory_logs: withIds([
    tl('U1', '250', 1000, '2026-01-10'), tl('U2', '260', 2000, '2026-02-20'),
    tl('U3', '270', 3000, '2026-04-05'), tl('U4', '271', 1000, '2026-03-15'),
    tl('U5', '272', 1000, '2026-01-05'), tl('U6', '273', 1000, '2026-04-20'),
    // Seed-in dates: available is 10 months and above. U7 matured by the old
    // +9 months rule but turns 10 months on 26 Nov, so it is not available.
    tl('U7', '274', 500, '2026-01-08'),
    ...[['250', '2025-12-01'], ['260', '2026-01-10'], ['270', '2026-04-01'], ['271', '2026-02-10'],
        ['272', '2025-12-15'], ['273', '2026-03-20'], ['274', '2026-01-25']].map(([b, d]) => ({
      transaction_type: 'Seeds_Received', batch_name: b, breed_name: 'AA Hybrida 1S', quantity_change: 1,
      transaction_date: d, created_at: d + 'T00:00:00Z', remark: '' })),
    { transaction_type: '3rd_Culling', plot_name: 'U5', batch_name: '272', quantity_change: 1000,
      remark: '3rd Culling. DestType: main MapQty: 1000 CullDate:2026-10-20' },
  ]),
  operation_batch_verifications: [{ batch_name: '272', stage: 'cull_3' }],
  shared_plots: ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'].map((p) => ({ plot_name: p, nursery_name: 'UNN 1' })),
  shared_plot_allocations: [],
  shared_do_records: withIds([{ do_number: 'DO-ORD1001', al_number: null, delivery_date: '2026-11-03', total_qty: 200,
    status: 'Issued', remark: '', plot_1: 'U1', batch_1: '250', qty_1: 200 }]),
  audit_height_records: withIds([
    { plot: 'U03', batch: '270', sample_1: 150, sample_2: 160, sample_3: 155, date: '2026-11-01' },
    { plot: 'U04', batch: '271', sample_1: 120, sample_2: 120, sample_3: 120, date: '2026-11-01' },
    { plot: 'U06', batch: '273', sample_1: 149.9, sample_2: 149.9, sample_3: 149.9, date: '2026-11-01' },
  ]),
  salesweb_customer_orders: [
    { id: 1, order_number: 'ORD1', customer_name: 'Alpha', billing_name: 'Alpha', total: 1, status: 'Paid', created_at: '2026-08-01T00:00:00Z', payment_terms: 'credit' },
    { id: 2, order_number: 'ORD2', customer_name: 'Beta', billing_name: 'Beta', total: 1, status: 'Paid', created_at: '2026-10-01T00:00:00Z', payment_terms: 'credit' },
    { id: 3, order_number: 'ORD3', customer_name: 'Gamma', billing_name: 'Gamma', total: 1, status: 'Pending Payment', created_at: '2026-11-01T00:00:00Z', payment_terms: 'cash' },
  ],
  salesweb_order_items: withIds([
    { order_id: 1, quantity: 3000 }, { order_id: 2, quantity: 4000 }, { order_id: 3, quantity: 999 },
  ]),
  salesweb_order_collections: [],
  shared_al_orders: [],
  operation_stock_analysis_excluded: [],
  salesweb_products: [
    { id: 11, name: 'AA Hybrida 1S (Nov 2026)', price: 9.5, sell_month: 'November', sell_year: 2026, stock_qty: 5000, is_published: true },
    { id: 12, name: 'Old line', price: 7, is_published: false },
  ],
  shared_quotations: [
    { id: 'q-old', quote_number: 'QOPS005/10/26', quote_date: '2026-10-02', customer_name: 'Delta', total: 100, status: 'draft', notes: null, created_at: '2026-10-02T00:00:00Z' },
    { id: 'q-rej', quote_number: 'QOPS004/10/26', quote_date: '2026-10-01', customer_name: 'Echo', total: 50, status: 'rejected', notes: null, created_at: '2026-10-01T00:00:00Z' },
  ],
};
// The page stamps a quotation number taken a moment ago by somebody else
// on the Quotation page: the first insert of QOPS006 meets the UNIQUE index.
let takenOnce = 'QOPS006/11/26';
const writes = [];

/* ── a fake of the Supabase REST API, as much of it as supabase-js uses ── */
function matches(row, key, expr) {
  const dot = expr.indexOf('.'); const op = expr.slice(0, dot); const val = expr.slice(dot + 1);   // URLSearchParams has already decoded it
  const v = row[key];
  if (op === 'eq') return String(v) === val;
  if (op === 'ilike') {
    const re = new RegExp('^' + val.split('%').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
    return re.test(String(v == null ? '' : v));
  }
  if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v));
  throw new Error('fake does not know ' + op);
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function filterRows(table, params) {
  let rows = (DB[table] || []).slice();
  for (const [k, v] of params) if (!RESERVED.has(k)) rows = rows.filter((r) => matches(r, k, v));
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((s) => s.split('.'));
    rows.sort((x, y) => {
      for (const [col, dir] of keys) {
        const a = x[col], b = y[col];
        if (a === b) continue;
        const c = a > b ? 1 : -1;
        return dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  const off = Number(params.get('offset') || 0), lim = params.get('limit');
  return rows.slice(off, lim != null ? off + Number(lim) : undefined);
}
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    if (!m) return send(404, { message: 'no route' });
    const table = m[1];
    const single = /vnd\.pgrst\.object/.test(req.headers.accept || '');
    const wantsRows = /return=representation/.test(req.headers.prefer || '');
    if (req.method === 'GET') {
      if (!(table in DB)) return send(404, { code: '42P01', message: 'relation does not exist' });
      return send(200, filterRows(table, u.searchParams));
    }
    if (req.method === 'POST') {
      const rows = [].concat(JSON.parse(body || '[]'));
      writes.push({ method: 'POST', table, rows });
      if (table === 'shared_quotations') {
        for (const r of rows) {
          if (r.quote_number === takenOnce) { takenOnce = null; return send(409, { code: '23505', message: 'duplicate key value violates unique constraint' }); }
          if (DB.shared_quotations.some((q) => q.quote_number === r.quote_number)) return send(409, { code: '23505', message: 'duplicate key' });
        }
      }
      const saved = rows.map((r) => Object.assign({ id: 'id-' + nextId++, created_at: '2026-11-17T02:00:00Z' }, r));
      (DB[table] = DB[table] || []).push(...saved);
      if (!wantsRows) return send(201);
      return send(201, single ? saved[0] : saved);
    }
    if (req.method === 'PATCH') {
      const patch = JSON.parse(body || '{}');
      writes.push({ method: 'PATCH', table, patch, query: u.search });
      const hit = filterRows(table, u.searchParams);
      hit.forEach((r) => Object.assign(r, patch));
      return send(200, wantsRows ? hit : undefined);
    }
    writes.push({ method: req.method, table });
    return send(405, { message: 'not allowed in the fake' });
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const restPort = server.address().port;
  const fnPort = 18000 + Math.floor(Math.random() * 1000);
  const SECRET = 'test-secret-0123456789';
  const deno = spawn(DENO, ['run', '--node-modules-dir=none', '--allow-net', '--allow-env', '--allow-read', '--allow-sys',
    path.join(ROOT, 'supabase/functions/mjm-mcp/index.ts')], {
    env: Object.assign({}, process.env, {
      SUPABASE_URL: 'http://127.0.0.1:' + restPort, SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
      MCP_SECRET: SECRET, MJM_MCP_TEST_NOW: '2026-11-17T02:00:00Z', PORT: String(fnPort),
      DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:' + fnPort,
    }),
    detached: true,   // its own process group, so an npm wrapper and the real deno both go
  });
  let log = '';
  // A crash anywhere must not leave the function running on the port.
  process.on('exit', () => { try { process.kill(-deno.pid, 'SIGKILL'); } catch (e) {} });
  deno.stdout.on('data', (d) => (log += d)); deno.stderr.on('data', (d) => (log += d));
  const base = 'http://127.0.0.1:' + fnPort;
  // Deno.serve listens on 8000 unless DENO_SERVE_ADDRESS is honoured; find which.
  let url = null;
  for (let i = 0; i < 240 && !url; i++) {
    for (const b of [base, 'http://127.0.0.1:8000']) {
      try { const r = await fetch(b + '/mjm-mcp/' + SECRET, { method: 'OPTIONS' }); if (r.ok) { url = b; break; } } catch (e) {}
    }
    if (!url) await new Promise((r) => setTimeout(r, 500));
  }
  if (!url) { console.log('FAIL the function did not start\n' + log); process.exit(1); }
  const endpoint = url + '/mjm-mcp/' + SECRET;
  let rid = 0;
  const rpc = async (method, params, opts = {}) => {
    const r = await fetch(opts.url || endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(opts.notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++rid, method, params }) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  const call = async (name, args) => (await rpc('tools/call', { name, arguments: args || {} })).body.result;

  console.log('1. the key is the link');
  check('a wrong key is a 404', (await rpc('initialize', {}, { url: url + '/mjm-mcp/nope' })).status, 404);
  check('no key at all is a 404', (await rpc('initialize', {}, { url: url + '/mjm-mcp' })).status, 404);
  const ini = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  check('initialize answers with the version asked for', ini.body.result.protocolVersion, '2025-06-18');
  check('and says it has tools', !!ini.body.result.capabilities.tools, true);
  check('a notification is a 202 with no body', (await rpc('notifications/initialized', {}, { notify: true })).status, 202);
  const list = (await rpc('tools/list', {})).body.result.tools.map((t) => t.name);
  check('the five tools', list, ['check_stock', 'list_products', 'create_quotation', 'find_quotations', 'confirm_order']);
  check('a GET is refused (no event stream)', (await fetch(endpoint)).status, 405);

  console.log('2. check_stock is the dashboard');
  let s = await call('check_stock');
  check('available stock is the dashboard figure', s.structuredContent.available_stock, 5200);
  check('10 months & above / 1.5 m & above', [s.structuredContent.matured, s.structuredContent.reached_1_5m], [2500, 2700]);
  check('turning 10 months next month', s.structuredContent.maturing_next_month, 900);
  check('actual order owed, cash-unpaid left out', s.structuredContent.actual_order_balance, 7000);
  check('available minus actual order', s.structuredContent.available_minus_actual_order, -1800);
  check('by breed', s.structuredContent.by_breed.map((b) => [b.breed, b.available, b.plots]), [['AA Hybrida 1S', 5200, 3]]);
  check('the text says it too', /Available stock: 5,200/.test(s.content[0].text), true);
  DB.operation_stock_analysis_excluded.push({ order_key: 'ORD2' });
  s = await call('check_stock');
  check('an order the office unticked is not counted', [s.structuredContent.actual_order_balance, s.structuredContent.orders_unticked_by_office], [3000, 1]);
  DB.operation_stock_analysis_excluded.length = 0;
  s = await call('check_stock', { breed: 'dura' });
  check('a breed with nothing standing reads nought', s.structuredContent.available_stock, 0);

  console.log('3. products and a quotation');
  const p = await call('list_products');
  check('only the published products', p.structuredContent.products.map((x) => [x.product_id, x.price]), [[11, 9.5]]);
  const before = DB.shared_quotations.length;
  const q = await call('create_quotation', { customer_name: 'Foxtrot Plantation', customer_contact: '012-3456789',
    items: [{ product_id: 11, qty: 1000 }, { description: 'Transport', qty: 1, unit: 'Trip', unit_price: 350 }] });
  check('a quotation was saved', q.isError, false);
  check('numbered after the highest, past the one taken a moment ago', q.structuredContent.quote_number, 'QOPS007/11/26');
  check('the Sales Web price, and a typed line', q.structuredContent.items.map((i) => [i.description, i.qty, i.unit_price, i.line_total]),
    [['AA Hybrida 1S (Nov 2026)', 1000, 9.5, 9500], ['Transport', 1, 350, 350]]);
  check('the total', q.structuredContent.total, 9850);
  const row = DB.shared_quotations.find((x) => x.quote_number === 'QOPS007/11/26') || {};
  check('stored as a DRAFT, Cash Only, dated in Malaysia', [row.status, row.terms, row.quote_date], ['draft', 'Cash Only', '2026-11-17']);
  check('says who made it', row.created_by_name, 'AI agent (MCP)');
  check('one row added', DB.shared_quotations.length, before + 1);
  const bad = await call('create_quotation', { customer_name: 'X', items: [{ product_id: 12, qty: 5 }] });
  check('an unpublished product is refused, saying why', [bad.isError, /no published product with product_id 12/.test(bad.content[0].text)], [true, true]);
  const bad2 = await call('create_quotation', { customer_name: '', items: [{ description: 'a', qty: 1, unit_price: 1 }] });
  check('a quotation needs a customer', bad2.isError, true);

  console.log('4. find and confirm');
  const f = await call('find_quotations', { customer: 'foxtrot' });
  check('found by customer', f.structuredContent.quotations.map((x) => x.quote_number), ['QOPS007/11/26']);
  const c = await call('confirm_order', { quote_number: 'QOPS007/11/26' });
  check('confirmed', [c.isError, c.structuredContent.status, c.structuredContent.changed], [false, 'accepted', true]);
  check('stored as accepted, with a note saying how', [row.status, /Accepted via AI agent \(MCP\) on 2026-11-17/.test(row.notes || '')], ['accepted', true]);
  const c2 = await call('confirm_order', { quote_number: 'QOPS007/11/26' });
  check('confirming twice changes nothing', [c2.isError, c2.structuredContent.changed], [false, false]);
  const c3 = await call('confirm_order', { quote_number: 'QOPS004/10/26' });
  check('a rejected quotation cannot be confirmed', [c3.isError, DB.shared_quotations.find((x) => x.id === 'q-rej').status], [true, 'rejected']);
  const c4 = await call('confirm_order', { quote_number: 'QOPS999/01/26' });
  check('an unknown number says so', c4.isError, true);

  console.log('5. what it touched');
  check('it wrote to shared_quotations and nowhere else', [...new Set(writes.map((w) => w.table))], ['shared_quotations']);
  check('it never deleted anything', writes.some((w) => w.method === 'DELETE'), false);

  try { process.kill(-deno.pid, 'SIGKILL'); } catch (e) {}
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
