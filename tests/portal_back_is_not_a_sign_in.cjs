/* COMING BACK TO THE PORTAL IS NOT SIGNING IN AGAIN.
 *
 * index.html shows the sign-in screen until onAuthStateChange has read the
 * profile over the network, so every module [<- Portal] put the login up
 * for a second or two over somebody who was signed in the whole time. The
 * office read it as being thrown out to the login page.
 *
 * Drives the real index.html with a database that never answers, so the
 * only thing that can draw the hub is the device's own session:
 *
 *   - a session and a remembered profile: the hub, straight away
 *   - a session and nothing remembered: neither screen, rather than login
 *   - no session: the sign-in screen, as it always was
 *   - a sign-in link in the address is left to the handler
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/portal_back_is_not_a_sign_in.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require((process.env.NODE_PATH || '/opt/node22/lib/node_modules') + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(fs.readFileSync(f));
});

// A database that never answers: no auth event, no profile read.
const SILENT_SUPABASE = `
window.supabase = { createClient: function () {
  var never = new Promise(function () {});
  function b() { var x = {}; ['select','eq','order','limit','maybeSingle','single','in','is','neq'].forEach(function (m) { x[m] = function () { return x; }; }); x.then = function (r, j) { return never.then(r, j); }; return x; }
  return {
    from: b, rpc: function () { return never; },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    auth: {
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      getSession: function () { return never; },
      signInWithPassword: function () { return never; },
      signOut: function () { return Promise.resolve({}); }
    }
  };
} };`;

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}

async function open(browser, port, store, hash) {
  const page = await browser.newPage();
  await page.route('**/*', (r) => r.request().url().startsWith('http://localhost:' + port) ? r.continue() : r.fulfill({ status: 200, contentType: 'text/plain', body: '' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SILENT_SUPABASE }));
  await page.addInitScript((store) => { if (!sessionStorage.getItem('__seeded')) { Object.keys(store).forEach((k) => localStorage.setItem(k, store[k])); sessionStorage.setItem('__seeded', '1'); } }, store);
  await page.goto('http://localhost:' + port + '/index.html' + (hash || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const shown = await page.evaluate(() => ({
    auth: getComputedStyle(document.getElementById('auth-screen')).display !== 'none',
    hub: getComputedStyle(document.getElementById('hub-screen')).display !== 'none',
    sealTile: (() => { const c = document.querySelector('.module-card[data-module="seal"]'); return c ? c.style.display !== 'none' : null; })(),
  }));
  await page.close();
  return shown;
}

const SESSION = JSON.stringify({ access_token: 'tok', refresh_token: 'r', user: { id: 'u1', email: 'amy@mjm', user_metadata: { full_name: 'Amy' } } });
const PROFILE = JSON.stringify({ ts: Date.now(), data: { id: 'u1', permissions: { modules: { seal: 'normal', operation: 'admin' } } } });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    let s = await open(browser, port, { 'sb-kib-auth-token': SESSION, mjm_perm_last__u1: PROFILE });
    is([s.auth, s.hub], [false, true], 'signed in on this device: back to the portal opens on the hub, with the network still silent');
    is(s.sealTile, true, 'and the tiles are the ones this account was last given');

    s = await open(browser, port, { 'sb-kib-auth-token': SESSION });
    is([s.auth, s.hub], [false, false], 'signed in but nothing remembered: no login screen while the profile is read');

    s = await open(browser, port, {});
    is([s.auth, s.hub], [true, false], 'not signed in: the sign-in screen, as always');

    s = await open(browser, port, { 'sb-kib-auth-token': SESSION, mjm_perm_last__u1: PROFILE }, '#access_token=abc&type=recovery');
    is(s.hub, false, 'a password recovery link is left to the sign-in screen');
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
