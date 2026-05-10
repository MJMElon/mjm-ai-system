/*
═══════════════════════════════════════════════════
  ADMIN — PROMOTIONS DESIGNER WORKSPACE
  Drives the inline workspace in salesweb_admin.html → tab-promos.

  Layout:
    💬 Chat       ⇄ parses natural language into form fields
    📺 Preview    ⇄ live storefront mock (banner + product card)
    ⚙️ Form + Calculator (all fields editable; calculator shows
                          discounted price, RM saved, % saved)
    📜 History    — table of every promotion with status filter

  Globals exposed to inline handlers:
    initPromoWorkspace, sendChatMessage, syncFormToPreview,
    newPromoDraft, savePromoDraft, togglePublish, loadPromoHistory,
    editPromo, deletePromo

  Depends on: sb (Supabase client), toast(), esc().
═══════════════════════════════════════════════════
*/

let _promoState = {
  productNames: [],          // for chat "target detail" autodetection
  conversation: [],          // [{ role:'user'|'bot', text, ts, tags:[] }]
  draftId: null,             // null = unsaved draft
  publishedAt: null
};

/* ─────────────────── Bootstrap ─────────────────── */
async function initPromoWorkspace() {
  // First-time setup is idempotent
  if (!_promoState._inited) {
    _promoState._inited = true;
    await loadProductNamesForChat();
    pushBotMessage("Hi 👋 — describe the promotion in plain English. I'll fill in the form on the right and update the storefront preview in the middle.");
    pushBotMessage("Try: \"20% off all Musang King from 25 Dec to 31 Dec, applies to whole cart, max 100 redemptions\".");
    bindEnterToSend();
    syncFormToPreview();
  }
  await loadPromoHistory();
}

async function loadProductNamesForChat() {
  try {
    const { data } = await sb.from('salesweb_products').select('name, collection');
    const names = new Set();
    (data || []).forEach(p => { if (p.name) names.add(p.name); if (p.collection) names.add(p.collection); });
    _promoState.productNames = Array.from(names);
  } catch (e) {
    _promoState.productNames = [];
  }
}

function bindEnterToSend() {
  const ta = document.getElementById('promo-chat-input');
  if (!ta) return;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
}

/* ─────────────────── Chat ─────────────────── */
function nowIso() { return new Date().toISOString(); }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }); }

function pushUserMessage(text, tags) {
  const msg = { role: 'user', text, ts: nowIso(), tags: tags || [] };
  _promoState.conversation.push(msg);
  appendMessageToLog(msg);
}
function pushBotMessage(text, tags) {
  const msg = { role: 'bot', text, ts: nowIso(), tags: tags || [] };
  _promoState.conversation.push(msg);
  appendMessageToLog(msg);
}
function appendMessageToLog(msg) {
  const log = document.getElementById('promo-chat-log');
  if (!log) return;
  const tagHtml = (msg.tags && msg.tags.length)
    ? `<div class="chat-tags">${msg.tags.map(t => `<span class="promo-chat-tag">${esc(t)}</span>`).join('')}</div>`
    : '';
  const div = document.createElement('div');
  div.className = 'promo-chat-msg ' + msg.role;
  div.innerHTML = `${esc(msg.text)}${tagHtml}<span class="chat-time">${fmtTime(msg.ts)}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function sendChatMessage() {
  const ta = document.getElementById('promo-chat-input');
  const text = (ta.value || '').trim();
  if (!text) return;
  ta.value = '';

  pushUserMessage(text);
  const updates = parseChatToForm(text, { productNames: _promoState.productNames });
  applyUpdatesToForm(updates);

  if (Object.keys(updates).length === 0) {
    pushBotMessage("I couldn't extract anything from that — try mentioning a percentage, RM amount, dates, target name, or 'whole cart' / 'per item'.");
  } else {
    const tags = Object.entries(updates).map(([k, v]) => `${k}: ${formatVal(k, v)}`);
    pushBotMessage('Updated the design with these changes:', tags);
  }
  syncFormToPreview();
}

function formatVal(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'discount_value' && document.getElementById('mpr-dtype').value === 'percentage') return v + '%';
  if (k === 'discount_value' || k === 'min_order_rm') return 'RM ' + v;
  return String(v);
}

/* ─────────────────── Chat → form parser ─────────────────── */
function parseChatToForm(text, ctx) {
  const out = {};
  const lower = text.toLowerCase();

  // Percentage
  const pct = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
  if (pct) {
    out.discount_type = 'percentage';
    out.discount_value = parseFloat(pct[1]);
  }

  // Fixed RM (only if not already taken by percentage)
  if (!out.discount_value) {
    const rm = lower.match(/(?:rm|myr)\s*(\d+(?:\.\d+)?)/);
    if (rm) { out.discount_type = 'fixed'; out.discount_value = parseFloat(rm[1]); }
  }

  // Min order
  const min = lower.match(/min(?:imum)?\s*(?:order|spend|purchase)\s*(?:of\s*)?(?:rm\s*)?(\d+(?:\.\d+)?)/);
  if (min) out.min_order_rm = parseFloat(min[1]);

  // Min qty
  const minQty = lower.match(/min(?:imum)?\s*(?:qty|quantity)\s*(\d+)/);
  if (minQty) out.min_qty = parseInt(minQty[1]);

  // Max uses / cap
  const cap = lower.match(/(?:limit|max(?:imum)?|cap|up\s*to)\s*(\d+)\s*(?:uses?|redemptions?|orders?|customers?)/);
  if (cap) out.max_uses = parseInt(cap[1]);

  // Scope
  if (/(?:whole|entire|full)\s*(?:cart|order)|cart\s*total|order\s*total/.test(lower)) out.scope = 'cart';
  else if (/per\s*item|each\s*item|matching\s*item|line\s*item/.test(lower)) out.scope = 'line';

  // Target — match against known product/collection names
  if (ctx?.productNames?.length) {
    const sorted = ctx.productNames.slice().sort((a, b) => b.length - a.length);
    for (const n of sorted) {
      if (!n) continue;
      const re = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(text)) {
        out.target = 'specific';
        out.target_detail = n;
        break;
      }
    }
  }

  // Dates: "from <date> to <date>" or "until <date>"
  const fromTo = text.match(/from\s+(.+?)\s+(?:to|until|till|–|-)\s+(.+?)(?=[,.]|$)/i);
  if (fromTo) {
    const s = parseDateLoose(fromTo[1]); if (s) out.start_date = s;
    const e = parseDateLoose(fromTo[2]); if (e) out.end_date = e;
  } else {
    const onlyEnd = text.match(/(?:until|till|ends?\s*on|expires?\s*on)\s+([^,.]+)/i);
    if (onlyEnd) { const e = parseDateLoose(onlyEnd[1]); if (e) out.end_date = e; }
    const onlyStart = text.match(/(?:starts?\s*on|from)\s+([^,.]+)/i);
    if (onlyStart) { const s = parseDateLoose(onlyStart[1]); if (s) out.start_date = s; }
  }

  // Title (only if clearly suggested)
  const titled = text.match(/(?:title|name|call\s*it)\s*[:\-]?\s*"([^"]+)"/i);
  if (titled) out.title = titled[1].trim();

  return out;
}

function parseDateLoose(s) {
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const t = s.trim().replace(/(st|nd|rd|th)/gi, '');
  // YYYY-MM-DD or YYYY/MM/DD
  let m = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
  // DD/MM[/YYYY]
  m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) {
    const yr = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : new Date().getFullYear();
    return `${yr}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  }
  // DD MMM [YYYY] or MMM DD [YYYY]
  m = t.match(/(\d{1,2})\s+([a-z]{3,})\s*(\d{2,4})?/i);
  if (m && months[m[2].slice(0,3).toLowerCase()] !== undefined) {
    const yr = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : new Date().getFullYear();
    const mo = months[m[2].slice(0,3).toLowerCase()];
    return `${yr}-${String(mo+1).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  }
  m = t.match(/([a-z]{3,})\s+(\d{1,2})\s*(\d{2,4})?/i);
  if (m && months[m[1].slice(0,3).toLowerCase()] !== undefined) {
    const yr = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : new Date().getFullYear();
    const mo = months[m[1].slice(0,3).toLowerCase()];
    return `${yr}-${String(mo+1).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`;
  }
  return null;
}

function applyUpdatesToForm(u) {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  if (u.title)            setVal('mpr-name', u.title);
  if (u.discount_type)    setVal('mpr-dtype', u.discount_type);
  if (u.discount_value !== undefined) setVal('mpr-dval', u.discount_value);
  if (u.scope)            setVal('mpr-scope', u.scope);
  if (u.target)           setVal('mpr-target', u.target);
  if (u.target_detail)    setVal('mpr-tdetail', u.target_detail);
  if (u.min_order_rm !== undefined) setVal('mpr-min-rm', u.min_order_rm);
  if (u.min_qty !== undefined)      setVal('mpr-min-qty', u.min_qty);
  if (u.max_uses !== undefined)     setVal('mpr-max-uses', u.max_uses);
  if (u.start_date)       setVal('mpr-start', u.start_date);
  if (u.end_date)         setVal('mpr-end',   u.end_date);
}

/* ─────────────────── Form ⇄ Preview + Calculator ─────────────────── */
function syncFormToPreview() {
  const title  = document.getElementById('mpr-name').value || 'New Promotion';
  const desc   = document.getElementById('mpr-desc').value || 'Describe your promotion in chat — the banner updates live.';
  const dtype  = document.getElementById('mpr-dtype').value;
  const dval   = parseFloat(document.getElementById('mpr-dval').value) || 0;
  const target = document.getElementById('mpr-target').value;
  const tdet   = document.getElementById('mpr-tdetail').value;
  const start  = document.getElementById('mpr-start').value;
  const end    = document.getElementById('mpr-end').value;
  const orig   = parseFloat(document.getElementById('calc-orig').value) || 0;

  // Banner
  document.getElementById('pv-title').textContent  = title;
  document.getElementById('pv-desc').textContent   = desc;
  const eyebrowTxt = target === 'all' ? 'All Products' : `${target.charAt(0).toUpperCase()+target.slice(1)}: ${tdet || '—'}`;
  document.getElementById('pv-target').textContent = eyebrowTxt;
  document.getElementById('pv-meta').textContent   = (start || end) ? `${start || '—'} → ${end || '—'}` : 'No dates set';
  document.getElementById('pv-badge').textContent  = dval > 0
    ? (dtype === 'percentage' ? `${dval}% OFF` : `RM ${dval} OFF`)
    : '— OFF';

  // Sample product
  const newPrice = applyDiscount(orig, dtype, dval);
  document.getElementById('pv-orig').textContent = `RM ${orig.toFixed(2)}`;
  document.getElementById('pv-new').textContent  = `RM ${newPrice.toFixed(2)}`;
  const saving = orig - newPrice;
  document.getElementById('pv-save').textContent = saving > 0
    ? `You save RM ${saving.toFixed(2)} (${((saving/orig)*100).toFixed(1)}%)`
    : '— savings';

  // Calculator
  document.getElementById('calc-new').textContent     = `RM ${newPrice.toFixed(2)}`;
  document.getElementById('calc-save-rm').textContent  = `RM ${saving.toFixed(2)}`;
  document.getElementById('calc-save-pct').textContent = orig > 0 ? `${((saving/orig)*100).toFixed(1)}%` : '0%';
}

function applyDiscount(price, type, value) {
  if (!price || !value) return price || 0;
  if (type === 'percentage') return Math.max(0, price * (1 - value/100));
  return Math.max(0, price - value);
}

/* ─────────────────── Save / publish ─────────────────── */
function readFormToRow() {
  return {
    title:            document.getElementById('mpr-name').value.trim(),
    description:      document.getElementById('mpr-desc').value.trim(),
    discount_type:    document.getElementById('mpr-dtype').value,
    discount_value:   parseFloat(document.getElementById('mpr-dval').value) || 0,
    scope:            document.getElementById('mpr-scope').value,
    target:           document.getElementById('mpr-target').value,
    target_detail:    document.getElementById('mpr-tdetail').value.trim(),
    min_order_rm:     parseFloat(document.getElementById('mpr-min-rm').value) || 0,
    min_qty:          parseInt(document.getElementById('mpr-min-qty').value) || 0,
    max_uses:         document.getElementById('mpr-max-uses').value ? parseInt(document.getElementById('mpr-max-uses').value) : null,
    start_date:       document.getElementById('mpr-start').value || null,
    end_date:         document.getElementById('mpr-end').value   || null,
    is_active:        document.getElementById('promo-publish-toggle').checked,
    conversation_log: _promoState.conversation
  };
}

async function savePromoDraft() {
  const row = readFormToRow();
  if (!row.title) { toast('Title required', 'error'); return; }
  // Drafts are saved with is_active=false and no published_at change — even if the toggle is on,
  // we treat "Save Draft" as save-without-publish for safety. The user uses the toggle to publish.
  row.is_active = false;
  let res;
  if (_promoState.draftId) {
    res = await sb.from('salesweb_promotions').update(row).eq('id', _promoState.draftId).select().single();
  } else {
    res = await sb.from('salesweb_promotions').insert([row]).select().single();
  }
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  _promoState.draftId = res.data.id;
  document.getElementById('mpr-id').value = res.data.id;
  document.getElementById('promo-publish-toggle').checked = false;
  toast('Draft saved.');
  loadPromoHistory();
}

async function togglePublish(isOn) {
  const row = readFormToRow();
  if (!row.title) { toast('Title required before publishing', 'error'); document.getElementById('promo-publish-toggle').checked = false; return; }
  row.is_active = !!isOn;
  const patch = { ...row };
  if (isOn && !_promoState.publishedAt) patch.published_at = new Date().toISOString();

  let res;
  if (_promoState.draftId) {
    res = await sb.from('salesweb_promotions').update(patch).eq('id', _promoState.draftId).select().single();
  } else {
    res = await sb.from('salesweb_promotions').insert([patch]).select().single();
  }
  if (res.error) {
    toast('Publish failed: ' + res.error.message, 'error');
    document.getElementById('promo-publish-toggle').checked = !isOn;
    return;
  }
  _promoState.draftId = res.data.id;
  _promoState.publishedAt = res.data.published_at;
  document.getElementById('mpr-id').value = res.data.id;
  toast(isOn ? '🎉 Promotion is now live on web' : 'Promotion paused.');
  pushBotMessage(isOn ? 'Published this promotion to the storefront.' : 'Paused this promotion (no longer shown on the storefront).');
  loadPromoHistory();
}

function newPromoDraft() {
  if (!confirm('Start a new draft? Unsaved changes will be lost.')) return;
  _promoState.draftId = null;
  _promoState.publishedAt = null;
  _promoState.conversation = [];
  ['mpr-id','mpr-name','mpr-desc','mpr-dval','mpr-tdetail','mpr-min-rm','mpr-min-qty','mpr-max-uses','mpr-start','mpr-end'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('mpr-dtype').value = 'percentage';
  document.getElementById('mpr-scope').value = 'cart';
  document.getElementById('mpr-target').value = 'all';
  document.getElementById('mpr-uses-count').value = 0;
  document.getElementById('promo-publish-toggle').checked = false;
  document.getElementById('promo-chat-log').innerHTML = '';
  pushBotMessage('Started a fresh draft. Describe your promotion below.');
  syncFormToPreview();
}

async function editPromo(id) {
  const { data, error } = await sb.from('salesweb_promotions').select('*').eq('id', id).single();
  if (error || !data) { toast('Failed to load promotion', 'error'); return; }
  _promoState.draftId = data.id;
  _promoState.publishedAt = data.published_at;
  _promoState.conversation = Array.isArray(data.conversation_log) ? data.conversation_log : [];

  document.getElementById('mpr-id').value          = data.id;
  document.getElementById('mpr-name').value        = data.title || '';
  document.getElementById('mpr-desc').value        = data.description || '';
  document.getElementById('mpr-dtype').value       = data.discount_type || 'percentage';
  document.getElementById('mpr-dval').value        = data.discount_value || '';
  document.getElementById('mpr-scope').value       = data.scope || 'cart';
  document.getElementById('mpr-target').value      = data.target || 'all';
  document.getElementById('mpr-tdetail').value     = data.target_detail || '';
  document.getElementById('mpr-min-rm').value      = data.min_order_rm || '';
  document.getElementById('mpr-min-qty').value     = data.min_qty || '';
  document.getElementById('mpr-max-uses').value    = data.max_uses != null ? data.max_uses : '';
  document.getElementById('mpr-uses-count').value  = data.uses_count || 0;
  document.getElementById('mpr-start').value       = data.start_date || '';
  document.getElementById('mpr-end').value         = data.end_date   || '';
  document.getElementById('promo-publish-toggle').checked = !!data.is_active;

  // Replay chat log
  const log = document.getElementById('promo-chat-log');
  log.innerHTML = '';
  _promoState.conversation.forEach(appendMessageToLog);
  if (!_promoState.conversation.length) pushBotMessage('Loaded "' + (data.title || 'untitled') + '". Edit on the right or chat below to refine.');

  syncFormToPreview();
  // Scroll workspace into view
  document.querySelector('.promo-ws')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deletePromo(id, title) {
  if (!confirm(`Delete "${title || 'this promotion'}"? This cannot be undone.`)) return;
  const { error } = await sb.from('salesweb_promotions').delete().eq('id', id);
  if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
  if (_promoState.draftId === id) newPromoDraft();
  toast('Promotion deleted.');
  loadPromoHistory();
}

/* ─────────────────── History table ─────────────────── */
function derivePromoStatus(p, today) {
  if (!p.is_active) return 'draft';
  if (p.start_date && p.start_date > today) return 'scheduled';
  if (p.end_date   && p.end_date   < today) return 'expired';
  return 'active';
}

async function loadPromoHistory() {
  const el = document.getElementById('promos-table');
  if (!el) return;
  const { data, error } = await sb.from('salesweb_promotions').select('*').order('updated_at', { ascending: false });
  if (error) { el.innerHTML = `<div class="loading">Error: ${esc(error.message)}</div>`; return; }
  const rows = data || [];
  if (!rows.length) { el.innerHTML = '<div class="loading">No promotions saved yet — design one above.</div>'; return; }

  const today  = new Date().toISOString().slice(0, 10);
  const search = (document.getElementById('promo-history-search')?.value || '').toLowerCase();
  const stFilt = (document.getElementById('promo-history-status')?.value || '').toLowerCase();

  let filtered = rows.map(p => ({ ...p, _status: derivePromoStatus(p, today) }));
  if (search) filtered = filtered.filter(p =>
    (p.title || '').toLowerCase().includes(search) ||
    (p.target_detail || '').toLowerCase().includes(search));
  if (stFilt)  filtered = filtered.filter(p => p._status === stFilt);

  if (!filtered.length) { el.innerHTML = '<div class="loading">No promotions match the filters.</div>'; return; }

  let html = '<table class="data-table"><thead><tr>'
    + '<th>Title</th><th>Discount</th><th>Scope</th><th>Target</th>'
    + '<th>Period</th><th>Uses</th><th>Status</th>'
    + '<th>Created</th><th>Published</th><th>Actions</th>'
    + '</tr></thead><tbody>';

  filtered.forEach(p => {
    const dval = p.discount_type === 'percentage' ? `${p.discount_value}%` : `RM ${p.discount_value}`;
    const period = `${p.start_date || '—'} → ${p.end_date || '—'}`;
    const usesCap = p.max_uses != null ? ` / ${p.max_uses}` : '';
    const status = p._status;
    const stTxt = { draft:'Draft', scheduled:'Scheduled', active:'Active', expired:'Expired' }[status];
    const created   = p.created_at   ? new Date(p.created_at).toLocaleDateString('en-MY')   : '—';
    const published = p.published_at ? new Date(p.published_at).toLocaleDateString('en-MY') : '—';
    html += `<tr>
      <td style="font-weight:700;">${esc(p.title)}</td>
      <td>${dval}</td>
      <td>${esc(p.scope || 'cart')}</td>
      <td>${esc(p.target || 'all')}${p.target_detail ? ` · ${esc(p.target_detail)}` : ''}</td>
      <td style="font-size:11px;">${esc(period)}</td>
      <td>${(p.uses_count || 0).toLocaleString()}${usesCap}</td>
      <td><span class="promo-status-pill promo-st-${status}">${stTxt}</span></td>
      <td style="font-size:11px;color:var(--ink3);">${created}</td>
      <td style="font-size:11px;color:var(--ink3);">${published}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editPromo('${p.id}')">Edit</button>
        <button class="btn btn-outline btn-sm" onclick="deletePromo('${p.id}', ${JSON.stringify(p.title || '').replace(/"/g, '&quot;')})">🗑</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ─────────────────── Legacy shims (called by other code) ─────────────────── */
async function loadPromos() { return loadPromoHistory(); }
async function savePromo()  { return savePromoDraft(); }
function   openPromoForm(p) { if (p) editPromo(p.id); else newPromoDraft(); }
