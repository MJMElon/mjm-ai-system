// Post-build cleaner for the not-yet-migrated static pages in dist/.
//
// Strips HTML comments and minifies inline <script>/<style> blocks and
// standalone classic .js/.css files, WITHOUT renaming any identifier —
// these are classic scripts whose top-level vars/functions are globals
// wired to onclick= attributes and shared across files, so identifier
// renaming or IIFE-wrapping would break them. Whitespace/comment-only
// minification keeps behaviour equivalent.
//
// Walks dist/ recursively (operation/, audit/, training/, …) but skips
// Vite's own assets/ output (already minified). Service-worker files are
// cleaned like any other JS — their cache-version strings are content,
// not filenames, so behaviour is unchanged.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { transform } from 'esbuild';

const DIST = 'dist';
const SKIP = new Set([]); // no always-static pages in this repo

const JS_OPTS = {
  loader: 'js',
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false, // NEVER rename — globals cross file/attribute boundaries
  legalComments: 'none',
};
const CSS_OPTS = { loader: 'css', minify: true };

async function minifyJs(code) {
  return (await transform(code, JS_OPTS)).code;
}
async function minifyCss(code) {
  return (await transform(code, CSS_OPTS)).code;
}

// Split an HTML document into [text, comment, script, style, ...] segments
// so we never regex-strip "comments" inside script/style content. Comments
// are matched FIRST so a literal "<script>" quoted inside a comment doesn't
// get mistaken for a real script block (verified: no inline JS in this
// codebase contains "<!--" in a string, so comment-precedence is safe).
function segments(html) {
  const re = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi;
  const parts = [];
  let last = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > last) parts.push({ kind: 'text', s: html.slice(last, m.index) });
    const low = m[0].toLowerCase();
    const kind = low.startsWith('<!--') ? 'comment' : low.startsWith('<script') ? 'script' : 'style';
    parts.push({ kind, s: m[0] });
    last = m.index + m[0].length;
  }
  if (last < html.length) parts.push({ kind: 'text', s: html.slice(last) });
  return parts;
}

async function cleanHtml(html) {
  const out = [];
  for (const part of segments(html)) {
    if (part.kind === 'comment') {
      continue; // drop HTML comments entirely
    } else if (part.kind === 'text') {
      out.push(part.s);
    } else if (part.kind === 'script') {
      const open = part.s.match(/^<script\b[^>]*>/i)[0];
      const body = part.s.slice(open.length, -'</script>'.length);
      const isExternal = /\bsrc\s*=/i.test(open);
      const type = (open.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
      const isJs = !type || /^(text|application)\/(java|ecma)script$/i.test(type) || type === 'module';
      if (isExternal || !isJs || !body.trim()) {
        out.push(part.s);
      } else {
        let code;
        try {
          code = await minifyJs(body);
        } catch (e) {
          console.warn('  ! inline script left unminified (parse error):', e.message.split('\n')[0]);
          code = body;
        }
        if (/<\/script/i.test(code)) code = code.replace(/<\/script/gi, '<\\/script');
        out.push(open + code + '</script>');
      }
    } else {
      const open = part.s.match(/^<style\b[^>]*>/i)[0];
      const body = part.s.slice(open.length, -'</style>'.length);
      let css;
      try {
        css = await minifyCss(body);
      } catch {
        css = body;
      }
      out.push(open + css + '</style>');
    }
  }
  return out.join('');
}

async function* walk(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (relative(DIST, p) === 'assets') continue; // Vite output, already minified
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

let cleaned = 0;
for await (const path of walk(DIST)) {
  const rel = relative(DIST, path);
  if (SKIP.has(rel)) { console.log('skip:', rel); continue; }
  if (rel.endsWith('.html')) {
    const before = await readFile(path, 'utf8');
    const after = await cleanHtml(before);
    await writeFile(path, after);
    console.log(`cleaned ${rel}: ${before.length} -> ${after.length} bytes`);
    cleaned++;
  } else if (rel.endsWith('.js') && !rel.endsWith('.min.js')) {
    const before = await readFile(path, 'utf8');
    try {
      const after = await minifyJs(before);
      await writeFile(path, after);
      console.log(`cleaned ${rel}: ${before.length} -> ${after.length} bytes`);
      cleaned++;
    } catch (e) {
      console.warn('  ! left unminified (parse error):', rel, e.message.split('\n')[0]);
    }
  } else if (rel.endsWith('.css')) {
    const before = await readFile(path, 'utf8');
    try {
      const after = await minifyCss(before);
      await writeFile(path, after);
      console.log(`cleaned ${rel}: ${before.length} -> ${after.length} bytes`);
      cleaned++;
    } catch {
      console.warn('  ! left unminified (css parse error):', rel);
    }
  }
}
console.log(`done — ${cleaned} files cleaned.`);
