/* The Nursery Reporting System's sidebar — one component, drawn from a menu.

   It knows nothing about any report. It reads the menu (report_menu.js),
   draws it, and tells the page which item was picked. A page mounts it:

     MJMReportSidebar.mount({
       host:     document.getElementById('rs-host'),   // where the <aside> goes
       menu:     window.MJM_REPORT_MENU,
       active:   'seed',                                // item id now open
       onSelect: item => { ... }                        // a VIEW of this page
     });

   An item with `view` on the page the menu calls `home` is handed to
   onSelect, so the page switches without a reload; anywhere else, and for an
   item with `href`, the browser goes there. setActive(id) moves the
   highlight when the page changed view by some other route (a card, the
   address bar).

   Four rules in it, each a way a sidebar goes wrong:
   - A CATEGORY WITH NO ITEMS CANNOT BE OPENED. It is drawn, with its icon
     and "Coming soon", and the button is disabled — a menu entry that opens
     onto nothing reads as a broken page.
   - ONE CATEGORY OPEN AT A TIME, and the one holding the active report opens
     by itself.
   - COLLAPSED IS A PREFERENCE, kept on this device. With none kept, a
     tablet-width window starts collapsed and a desk starts open. A phone
     never collapses: the sidebar is a drawer there, closed until the menu
     button opens it, and closed again after a pick.
   - THE PAGE IS TOLD WHEN THE WIDTH SETTLES (a `resize` event after the
     animation), because a chart drawn to the old width would otherwise sit
     in the new one at the wrong size. */
(function (global) {
  'use strict';

  const ICONS = {
    leaf:   '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19c3-4 6-7 10-9"/>',
    grid:   '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    seed:   '<path d="M12 21c-4-2-7-5.5-7-10a7 7 0 0 1 14 0c0 4.5-3 8-7 10z"/><path d="M12 21V10"/><path d="M12 14l-3-3M12 12l3-3"/>',
    cart:   '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7z"/><path d="M12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5z"/><path d="M7 21h10"/>',
    shield: '<path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
    box:    '<path d="M4 7.5L12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5l8 3.5 8-3.5M12 11v9"/>',
    chart:  '<path d="M4 20h16"/><path d="M7 16v-4M12 16V7M17 16v-6"/>',
    back:   '<path d="M15 18l-6-6 6-6"/>',
    chev:   '<path d="M9 6l6 6-6 6"/>',
    menu:   '<path d="M4 7h16M4 12h16M4 17h16"/>',
    panel:  '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15"/>',
    close:  '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const svg = (k, cls) => `<svg class="${cls || 'rs-ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.chart}</svg>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: the sidebar still works, it just forgets */ } },
  };
  const K_COLLAPSED = 'mjm_rs_collapsed', K_OPEN = 'mjm_rs_open';
  const PHONE = '(max-width: 767.98px)', TABLET = '(max-width: 1199.98px)';

  const CSS = `
  .rs-shell { display:flex; align-items:flex-start; min-height:100vh; }
  .rs-content { flex:1; min-width:0; }
  .rs { --rs-w:260px; position:sticky; top:0; height:100vh; width:var(--rs-w); flex:0 0 var(--rs-w);
        background:#fff; border-right:1px solid var(--line, #DCE3E8); display:flex; flex-direction:column;
        transition:width .22s ease, flex-basis .22s ease; z-index:40; font-family:inherit; color:var(--ink, #253247); }
  .rs.rs-collapsed { --rs-w:72px; }
  .rs-head { display:flex; align-items:center; gap:12px; padding:18px 16px 16px 18px; border-bottom:1px solid var(--line, #DCE3E8); min-height:72px; }
  .rs-logo { width:36px; height:36px; border-radius:10px; background:var(--green, #246B4A); color:#fff; display:grid; place-items:center; flex:0 0 36px; }
  .rs-logo svg { width:20px; height:20px; }
  .rs-brand { min-width:0; flex:1; overflow:hidden; white-space:nowrap; transition:opacity .15s; }
  .rs-brand-t { font-size:13px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink, #253247); }
  .rs-brand-s { font-size:12px; color:var(--ink-2, #6B7280); margin-top:2px; }
  .rs-close { appearance:none; border:0; background:none; width:32px; height:32px; border-radius:8px; color:var(--ink-2, #6B7280);
        display:grid; place-items:center; cursor:pointer; flex:0 0 32px; }
  .rs-close:hover { background:#F2F5F7; color:var(--ink, #253247); }
  .rs-close svg { width:18px; height:18px; }
  .rs-close { display:none; }
  .rs-nav { flex:1; overflow-y:auto; overflow-x:hidden; padding:12px 12px 16px; }
  .rs-sec { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted, #9AA3AE);
            padding:14px 10px 6px; white-space:nowrap; overflow:hidden; transition:opacity .15s; }
  .rs-item, .rs-cat { appearance:none; border:0; background:none; width:100%; display:flex; align-items:center; gap:12px;
            min-height:40px; padding:8px 10px; border-radius:8px; font-family:inherit; font-size:13px; font-weight:500;
            color:var(--ink, #253247); text-align:left; text-decoration:none; cursor:pointer; position:relative; }
  .rs-item:hover, .rs-cat:not(:disabled):hover { background:#F4F6F8; }
  .rs-ic { width:20px; height:20px; flex:0 0 20px; color:var(--ink-2, #6B7280); }
  .rs-lbl { flex:1; min-width:0; line-height:1.3; transition:opacity .15s; }
  .rs-soon { display:block; font-size:11px; font-weight:500; color:var(--muted, #9AA3AE); margin-top:1px; }
  .rs-chev { width:16px; height:16px; flex:0 0 16px; color:var(--muted, #9AA3AE); transition:transform .2s ease; }
  .rs-cat[aria-expanded="true"] .rs-chev { transform:rotate(90deg); }
  .rs-cat:disabled { cursor:default; color:var(--ink-2, #6B7280); }
  .rs-cat:disabled .rs-ic { color:#B8C0C8; }
  .rs-cat.rs-has-active .rs-ic, .rs-cat.rs-has-active { color:var(--green, #246B4A); }
  .rs-cat.rs-has-active { font-weight:600; }
  .rs-sub { overflow:hidden; display:grid; grid-template-rows:0fr; transition:grid-template-rows .22s ease; }
  .rs-sub.rs-open { grid-template-rows:1fr; }
  .rs-sub > div { min-height:0; }
  .rs-sub .rs-item { padding-left:42px; min-height:36px; margin-top:2px; }
  .rs-item.rs-active { background:var(--green-l, #EAF3ED); color:var(--green, #246B4A); font-weight:600; }
  .rs-item.rs-active .rs-ic { color:var(--green, #246B4A); }
  .rs-sub .rs-item.rs-active::before { content:''; position:absolute; left:26px; top:50%; width:6px; height:6px; margin-top:-3px; border-radius:50%; background:var(--green, #246B4A); }
  .rs-foot { border-top:1px solid var(--line, #DCE3E8); padding:10px 12px; }
  .rs-foot .rs-item { color:var(--ink-2, #6B7280); }
  .rs-collapsed .rs-brand, .rs-collapsed .rs-lbl, .rs-collapsed .rs-chev { display:none; }
  .rs-collapsed .rs-head { justify-content:center; padding:18px 0 16px; }
  .rs-collapsed .rs-sec { font-size:0; height:1px; padding:0; margin:10px 8px; background:var(--line, #DCE3E8); }
  .rs-collapsed .rs-item, .rs-collapsed .rs-cat { min-height:44px; }
  .rs-collapsed .rs-sub { grid-template-rows:0fr; }
  .rs-collapsed .rs-cat.rs-has-active { background:var(--green-l, #EAF3ED); }
  .rs-collapsed .rs-item, .rs-collapsed .rs-cat { justify-content:center; padding:10px 0; gap:0; }
  .rs-tip { position:fixed; z-index:90; pointer-events:none; background:var(--ink, #253247); color:#fff; font-size:12px; font-weight:500;
            padding:6px 10px; border-radius:6px; white-space:nowrap; box-shadow:0 6px 18px rgba(37,50,71,.18); font-family:inherit; }
  .rs-tip span { color:#C9D2DA; margin-left:6px; }
  .rs-scrim { display:none; }
  .rs-menu-btn { display:none; appearance:none; border:1px solid var(--line, #DCE3E8); background:#fff; width:40px; height:40px; border-radius:8px;
                 color:var(--ink, #253247); place-items:center; cursor:pointer; flex:0 0 40px; }
  .rs-menu-btn svg { width:20px; height:20px; }
  @media ${PHONE} {
    .rs, .rs.rs-collapsed { --rs-w:280px; position:fixed; left:0; top:0; height:100%; transform:translateX(-100%);
          transition:transform .25s ease; box-shadow:none; z-index:80; }
    .rs.rs-drawer-open { transform:none; box-shadow:0 18px 48px rgba(37,50,71,.25); }
    .rs-shell > .rs { flex:0 0 0; }
    .rs.rs-collapsed .rs-brand, .rs.rs-collapsed .rs-lbl, .rs.rs-collapsed .rs-chev { display:block; }
    .rs.rs-collapsed .rs-chev { flex:0 0 16px; }
    .rs.rs-collapsed .rs-head { justify-content:flex-start; padding:18px 16px 16px 18px; }
    .rs.rs-collapsed .rs-sec { font-size:11px; height:auto; margin:0; background:none; }
    .rs.rs-collapsed .rs-item, .rs.rs-collapsed .rs-cat { justify-content:flex-start; padding:8px 10px; gap:12px; }
    .rs.rs-collapsed .rs-sub .rs-item { padding-left:42px; }
    .rs.rs-collapsed .rs-sec { padding:14px 10px 6px; }
    .rs.rs-collapsed .rs-sub.rs-open { grid-template-rows:1fr; }
    .rs.rs-collapsed .rs-cat.rs-has-active { background:none; }
    .rs-collapse { display:none; }
    .rs-close { display:grid; }
    .rs-scrim { display:block; position:fixed; inset:0; background:rgba(37,50,71,.38); z-index:79; opacity:0; pointer-events:none; transition:opacity .25s; }
    .rs-scrim.rs-on { opacity:1; pointer-events:auto; }
    .rs-menu-btn { display:grid; }
  }
  @media print { .rs, .rs-scrim, .rs-tip, .rs-menu-btn { display:none !important; } .rs-shell { display:block; } }
  @media (prefers-reduced-motion: reduce) { .rs, .rs-sub, .rs-chev, .rs-scrim { transition:none !important; } }
  `;

  let M = null, host = null, aside = null, scrim = null, tip = null, active = null, onSelect = null, openCat = null;
  const phone = () => global.matchMedia && global.matchMedia(PHONE).matches;
  const allItems = () => [].concat(M.main || [], ...(M.categories || []).map(c => c.items || []), M.foot || []);
  const catOf = id => (M.categories || []).find(c => (c.items || []).some(i => i.id === id));
  const onHome = () => {
    const page = (location.pathname.split('/').pop() || '').toLowerCase();
    return !M.home || page === String(M.home).toLowerCase();
  };
  const hrefOf = it => it.href || (M.home || '') + (it.view && it.view !== 'home' ? '#' + it.view : '');

  function itemHtml(it, sub) {
    const on = it.id === active;
    return `<a class="rs-item${on ? ' rs-active' : ''}" href="${esc(hrefOf(it))}" data-rs-item="${esc(it.id)}"
              data-tip="${esc(it.label)}"${on ? ' aria-current="page"' : ''}>${sub ? '' : svg(it.icon)}<span class="rs-lbl">${esc(it.label)}</span></a>`;
  }
  function catHtml(c) {
    const items = c.items || [];
    const soon = !items.length;
    const open = !soon && openCat === c.id;
    const hasActive = items.some(i => i.id === active);
    return `<div class="rs-group" data-rs-group="${esc(c.id)}">
      <button type="button" class="rs-cat${hasActive ? ' rs-has-active' : ''}" data-rs-cat="${esc(c.id)}"
        data-tip="${esc(c.label)}"${soon ? ' data-tip-note="Coming soon" disabled aria-disabled="true"' : ` aria-expanded="${open}" aria-controls="rs-sub-${esc(c.id)}"`}>
        ${svg(c.icon)}<span class="rs-lbl">${esc(c.label)}${soon ? '<span class="rs-soon">Coming soon</span>' : ''}</span>${soon ? '' : svg('chev', 'rs-chev')}
      </button>
      ${soon ? '' : `<div class="rs-sub${open ? ' rs-open' : ''}" id="rs-sub-${esc(c.id)}"><div>${items.map(i => itemHtml(i, true)).join('')}</div></div>`}
    </div>`;
  }

  function draw() {
    const collapsed = aside && aside.classList.contains('rs-collapsed');
    const drawer = aside && aside.classList.contains('rs-drawer-open');
    aside.className = 'rs' + (collapsed ? ' rs-collapsed' : '') + (drawer ? ' rs-drawer-open' : '');
    const b = M.brand || {};
    aside.innerHTML = `
      <div class="rs-head">
        <span class="rs-logo">${svg(b.icon || 'leaf', '')}</span>
        <div class="rs-brand"><div class="rs-brand-t">${esc(b.title)}</div><div class="rs-brand-s">${esc(b.sub)}</div></div>
        <button type="button" class="rs-close" data-rs-close aria-label="Close menu">${svg('close', '')}</button>
      </div>
      <nav class="rs-nav" aria-label="Reports">
        <div class="rs-sec">Main menu</div>
        ${(M.main || []).map(i => itemHtml(i)).join('')}
        <div class="rs-sec">Reports</div>
        ${(M.categories || []).map(catHtml).join('')}
      </nav>
      <div class="rs-foot">${(M.foot || []).map(i => itemHtml(i)).join('')}
        <button type="button" class="rs-item rs-collapse" data-rs-collapse data-tip="Expand menu">${svg('panel')}<span class="rs-lbl">Collapse menu</span></button>
      </div>`;
    syncCollapseLabel();
  }
  function syncCollapseLabel() {
    const btn = aside.querySelector('[data-rs-collapse]');
    if (btn) btn.setAttribute('aria-label', aside.classList.contains('rs-collapsed') ? 'Expand menu' : 'Collapse menu');
    if (btn) btn.setAttribute('aria-expanded', String(!aside.classList.contains('rs-collapsed')));
  }

  function setCollapsed(on, remember) {
    if (on === aside.classList.contains('rs-collapsed')) return;
    aside.classList.toggle('rs-collapsed', on);
    if (remember) store.set(K_COLLAPSED, on ? '1' : '0');
    syncCollapseLabel();
    hideTip();
    settle();
  }
  /* The width is animated, so tell the page once it has stopped moving. */
  let settleT;
  function settle() {
    clearTimeout(settleT);
    settleT = setTimeout(() => global.dispatchEvent(new Event('resize')), 260);
  }
  function openDrawer(on) {
    aside.classList.toggle('rs-drawer-open', on);
    scrim.classList.toggle('rs-on', on);
    document.querySelectorAll('[data-rs-toggle]').forEach(b => b.setAttribute('aria-expanded', String(on)));
    if (on) { const f = aside.querySelector('.rs-item.rs-active, .rs-item, .rs-cat:not(:disabled)'); if (f) f.focus({ preventScroll: true }); }
  }
  function toggleCat(id) {
    openCat = openCat === id ? null : id;
    if (openCat) store.set(K_OPEN, openCat);
    aside.querySelectorAll('[data-rs-cat]').forEach(b => {
      const me = b.dataset.rsCat === openCat;
      if (!b.disabled) b.setAttribute('aria-expanded', String(me));
    });
    aside.querySelectorAll('.rs-sub').forEach(s => s.classList.toggle('rs-open', s.id === 'rs-sub-' + openCat));
  }

  function hideTip() { if (tip) tip.style.display = 'none'; }
  function showTip(el) {
    if (!aside.classList.contains('rs-collapsed') || phone()) return;
    const r = el.getBoundingClientRect();
    tip.innerHTML = esc(el.dataset.tip) + (el.dataset.tipNote ? `<span>${esc(el.dataset.tipNote)}</span>` : '');
    tip.style.display = 'block';
    tip.style.left = (r.right + 10) + 'px';
    tip.style.top = (r.top + r.height / 2 - tip.offsetHeight / 2) + 'px';
  }

  function pick(id, ev) {
    const it = allItems().find(i => i.id === id);
    if (!it) return;
    if (it.view && !it.href && onHome() && typeof onSelect === 'function') {
      if (ev) ev.preventDefault();
      setActive(id);
      onSelect(it);
    }
    /* anything else is an ordinary link and the browser follows it */
    if (phone()) openDrawer(false);
  }

  function setActive(id) {
    active = id;
    const c = catOf(id);
    if (c) openCat = c.id;
    aside.querySelectorAll('[data-rs-item]').forEach(a => {
      const on = a.dataset.rsItem === id;
      a.classList.toggle('rs-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    aside.querySelectorAll('[data-rs-cat]').forEach(b => {
      const g = (M.categories || []).find(x => x.id === b.dataset.rsCat);
      b.classList.toggle('rs-has-active', !!g && (g.items || []).some(i => i.id === id));
    });
    if (c) { openCat = null; toggleCat(c.id); }
  }

  function mount(opts) {
    M = opts.menu; host = opts.host; onSelect = opts.onSelect; active = opts.active || null;
    if (!document.getElementById('rs-style')) {
      const st = document.createElement('style'); st.id = 'rs-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    const c = catOf(active);
    openCat = c ? c.id : store.get(K_OPEN);
    if (openCat && !(M.categories || []).some(x => x.id === openCat && (x.items || []).length)) openCat = null;

    aside = document.createElement('aside');
    aside.id = 'rs'; aside.className = 'rs';
    const kept = store.get(K_COLLAPSED);
    const startCollapsed = kept != null ? kept === '1' : !!(global.matchMedia && global.matchMedia(TABLET).matches);
    if (startCollapsed) aside.classList.add('rs-collapsed');
    host.insertBefore(aside, host.firstChild);
    draw();

    scrim = document.createElement('div'); scrim.className = 'rs-scrim';
    document.body.appendChild(scrim);
    tip = document.createElement('div'); tip.className = 'rs-tip'; tip.style.display = 'none'; tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);

    aside.addEventListener('click', ev => {
      const item = ev.target.closest('[data-rs-item]');
      if (item) return pick(item.dataset.rsItem, ev);
      const cat = ev.target.closest('[data-rs-cat]');
      if (cat && !cat.disabled) {
        /* Collapsed, a category has nowhere to open into, so it opens the sidebar too. */
        if (aside.classList.contains('rs-collapsed') && !phone()) { setCollapsed(false, true); if (openCat !== cat.dataset.rsCat) toggleCat(cat.dataset.rsCat); return; }
        return toggleCat(cat.dataset.rsCat);
      }
      if (ev.target.closest('[data-rs-collapse]')) return setCollapsed(!aside.classList.contains('rs-collapsed'), true);
      if (ev.target.closest('[data-rs-close]')) return openDrawer(false);
    });
    aside.addEventListener('mouseover', ev => { const t = ev.target.closest('[data-tip]'); if (t) showTip(t); });
    aside.addEventListener('mouseout', ev => { const t = ev.target.closest('[data-tip]'); if (t && !t.contains(ev.relatedTarget)) hideTip(); });
    aside.addEventListener('focusin', ev => { const t = ev.target.closest('[data-tip]'); if (t) showTip(t); });
    aside.addEventListener('focusout', hideTip);
    aside.querySelector('.rs-nav').addEventListener('scroll', hideTip);
    scrim.addEventListener('click', () => openDrawer(false));
    document.addEventListener('click', ev => { const b = ev.target.closest('[data-rs-toggle]'); if (b) openDrawer(!aside.classList.contains('rs-drawer-open')); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && aside.classList.contains('rs-drawer-open')) openDrawer(false); });
    if (global.matchMedia) {
      const mq = global.matchMedia(PHONE);
      const off = () => { if (!mq.matches) openDrawer(false); };
      mq.addEventListener ? mq.addEventListener('change', off) : mq.addListener(off);
    }
    return api;
  }

  const api = {
    mount, setActive, setCollapsed: on => setCollapsed(!!on, true), openDrawer,
    state: () => ({ active, openCat, collapsed: !!aside && aside.classList.contains('rs-collapsed'), drawer: !!aside && aside.classList.contains('rs-drawer-open') }),
    menuButton: () => `<button type="button" class="rs-menu-btn" data-rs-toggle aria-label="Open menu" aria-controls="rs" aria-expanded="false">${svg('menu', '')}</button>`,
  };
  global.MJMReportSidebar = api;
})(window);
