/* The to-do list must show what is COMING, not only what falls on today.
 *
 * `selDay` is set to today on load, so the day scope was the default view
 * and the day filter was the default filter. A Plot Condition, Papan Tanda
 * or Seedling Height round whose window opens on the 20th was therefore
 * not in the list on the 14th: the only way to see it was to tap today's
 * chip a second time to clear the selection, which nothing on the screen
 * says. The auditor asking "what is next" got "nothing".
 *
 * So on TODAY every undone row of this month shows — upcoming and soon
 * included — while picking any OTHER day still answers literally, with
 * what falls on that date. Carried rows from earlier months (`fromY` set)
 * ride on today only while they are overdue, which is the only reason
 * they were carried.
 *
 * It reads the SHIPPED audit_home.html and runs the page's own occStatus
 * and its own day filter, lifted out by text, so the test cannot drift
 * away from the file it is about.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = path.join(__dirname, '..', 'audit', 'audit_home.html');
const src = fs.readFileSync(SRC, 'utf8');

/* --- lift the two pieces out of the page ------------------------------- */

function block(text, from){            // brace-match a function body
  let i = text.indexOf('{', from), depth = 0;
  for (let j = i; j < text.length; j++){
    if (text[j] === '{') depth++;
    else if (text[j] === '}' && --depth === 0) return text.slice(from, j + 1);
  }
  throw new Error('unbalanced braces');
}

const occStatusSrc = block(src, src.indexOf('function occStatus(o, y, m)'));
if (!occStatusSrc) throw new Error('occStatus not found in audit_home.html');

const head = 'if (selDay !== null) list = list.filter(';
const at = src.indexOf(head);
if (at < 0) throw new Error('the day filter is not where the test expects it');
/* Comments in the predicate carry their own brackets, so they go first. */
const tail = src.slice(at + head.length).replace(/\/\*[\s\S]*?\*\//g, '');
let depth = 1, end = -1;
for (let j = 0; j < tail.length; j++){
  if (tail[j] === '(') depth++;
  else if (tail[j] === ')' && --depth === 0){ end = j; break; }
}
if (end < 0) throw new Error('unbalanced brackets in the day filter');
const predicateSrc = tail.slice(0, end);

/* --- run them --------------------------------------------------------- */

/* Today is the 14th of a 31-day month, which is the shape of the day the
   office reported: three rounds later in the same month, none of them on
   screen. */
const year = 2026, month = 9, day = 14;   // 14 Oct 2026

function build(doneKeys){
  const ctx = {
    year, month, day, Date, Math,
    viewY: year, viewM: month, selDay: day,
    showingToday: true,
    nurseryState: (o, y, m) => [{nursery:'PN', done: doneKeys.has(`${o.id}|${y}|${m}`)}],
    isDone: null, occStatus: null, keep: null,
  };
  vm.createContext(ctx);
  vm.runInContext(
    'function isDone(o, y, m){ return nurseryState(o, y, m).every(x => x.done); }\n' +
    occStatusSrc + '\n' +
    'keep = (' + predicateSrc + ');', ctx);
  return ctx;
}

const rows = [
  {id:'pc',    mod:'plot',   start:20, end:25, title:'Plot Condition'},
  {id:'pt',    mod:'papan',  start:16, end:18, title:'Papan Tanda'},
  {id:'sh',    mod:'height', start:28, end:30, title:'Seedling Height'},
  {id:'open',  mod:'plot',   start:10, end:16, title:'window open now'},
  {id:'past',  mod:'plot',   start: 1, end: 5, title:'overdue this month'},
  {id:'maint', mod:'maint',  start:12, end:12, title:'Maintenance'},
];
const carried = {id:'carr', mod:'plot', start:20, end:25, fromY:2026, fromM:8,
                 title:'carried from September'};

let fail = 0;
const ok = (cond, what) => {
  console.log((cond ? '  pass  ' : '  FAIL  ') + what);
  if (!cond) fail = 1;
};

/* ── 1. on today, this month's upcoming rows are in the list ─────────── */
{
  const ctx = build(new Set());
  const kept = rows.concat([carried]).filter(ctx.keep).map(o => o.id);
  ok(kept.includes('pc'),    'Plot Condition opening on the 20th shows on the 14th');
  ok(kept.includes('pt'),    'Papan Tanda opening on the 16th shows on the 14th');
  ok(kept.includes('sh'),    'Seedling Height opening on the 28th shows on the 14th');
  ok(kept.includes('open'),  'a window open today still shows');
  ok(kept.includes('past'),  'an overdue window still shows');
  ok(kept.includes('maint'), 'Maintenance still rides on today');
  ok(kept.includes('carr'),  'a carried overdue row still rides on today');
  ok(ctx.occStatus(rows[0], year, month) === 'upcoming',
     'the Plot Condition row reads upcoming, so it draws greyed and does not navigate');
  ok(ctx.occStatus(rows[1], year, month) === 'soon',
     'the Papan Tanda row two days out reads soon');
}

/* ── 2. a row somebody has signed off stays out ──────────────────────── */
{
  const ctx = build(new Set([`pc|${year}|${month}`]));
  ok(ctx.occStatus(rows[0], year, month) === 'done',
     'a completed upcoming round reads done, which the list drops before this filter');
}

/* ── 3. picking another day still answers literally ──────────────────── */
{
  const ctx = build(new Set());
  ctx.selDay = 21; ctx.showingToday = false;
  const kept = rows.concat([carried]).filter(ctx.keep).map(o => o.id);
  ok(kept.includes('pc'),    'the 21st shows the round whose window covers it');
  ok(!kept.includes('pt'),   'the 21st does not show a window that closed on the 18th');
  ok(!kept.includes('sh'),   'the 21st does not show a window that opens on the 28th');
  ok(!kept.includes('maint'),'picking a day off today scopes maintenance too');
  ok(!kept.includes('carr'), 'a carried row belongs to its own month, not to a day of this one');
}

/* ── 4. a carried row that is no longer overdue does not ride ────────── */
{
  const ctx = build(new Set());
  /* Same shape as `carried`, but its window in the month it came from has
     not closed — carriedOverdue would never have handed it over, and the
     filter must not let one through on its own either. */
  const future = {id:'fut', mod:'plot', start:20, end:25, fromY:2026, fromM:10};
  ok(!ctx.keep(future),
     'a carried row whose own window has not closed is not on today');
}

console.log('');
console.log(fail ? 'FAILED' : 'all green');
process.exit(fail);
