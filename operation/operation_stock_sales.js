    const SUPABASE_URL = 'https://kibqjztozokohqmhqqqf.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpYnFqenRvem9rb2hxbWhxcXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzQzNjIsImV4cCI6MjA4OTgxMDM2Mn0.J7qJUZhWXYf5b9oey4wXJkjdi66jomEMw_NeV9NWF7M';
    const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── Nursery Status state ──────────────────────────────────────────────────
    let comboTab = 'basic';
    let nsdAggregates = null;
    let baseStock = 0;
    let currentOrdersQty = 0;

    async function loadNsd() {
        const now = new Date();
        const cm = now.getMonth();
        const cy = now.getFullYear();
        const startOfNextMonthISO = new Date(cy, cm + 1, 1).toISOString();
        const endOfMonth          = new Date(cy, cm + 1, 0, 23, 59, 59);
        const endOfMonthISO       = endOfMonth.toISOString();
        const endOfMonthDateOnly  = endOfMonthISO.slice(0, 10);

        const monthLabel = now.toLocaleString('en-MY', { month: 'short', year: 'numeric' });
        document.getElementById('current-month-label').innerText = monthLabel;

        try {
            const [transRes, auditRes, collRes, ordCollFallbackRes] = await Promise.all([
                _supabase.from('shared_inventory_logs')
                    .select('batch_name,plot_name,quantity_change,created_at')
                    .in('transaction_type', ['Transplanted','Transplanted_Premium','Transplanted_DoubleTone'])
                    .lte('created_at', endOfMonthISO),
                _supabase.from('audit_height_records')
                    .select('plot,batch,sample_1,sample_2,sample_3,avg_height,date')
                    .lte('date', endOfMonthDateOnly),
                // Multi-pickup table — falls back gracefully if it doesn't exist yet.
                _supabase.from('salesweb_order_collections')
                    .select('collected_qty,collected_at')
                    .lte('collected_at', endOfMonthISO)
                    .then(r => r, e => ({ data: null })),
                // Single-collection fallback on the order itself.
                _supabase.from('salesweb_customer_orders')
                    .select('collected_qty,collected_at')
                    .not('collected_qty', 'is', null)
                    .lte('collected_at', endOfMonthISO)
                    .then(r => r, e => ({ data: null }))
            ]);
            const transLogs = transRes.data || [];
            const audits    = auditRes.data || [];

            const groupKey = (b, p) => `${b||''}||${p||''}`;
            const groups = {};
            transLogs.forEach(l => {
                const k = groupKey(l.batch_name, l.plot_name);
                if (!groups[k]) groups[k] = { qty: 0, firstDate: l.created_at };
                groups[k].qty += (l.quantity_change || 0);
                if (l.created_at < groups[k].firstDate) groups[k].firstDate = l.created_at;
            });

            // Earliest ≥150cm audit per group → its "verified matured" date.
            const TALL_CM = 150;
            const auditFirstByGroup = {};
            audits.forEach(a => {
                const max = Math.max(a.sample_1 || 0, a.sample_2 || 0, a.sample_3 || 0, a.avg_height || 0);
                if (max < TALL_CM) return;
                const k = groupKey(a.batch, a.plot);
                if (!auditFirstByGroup[k] || a.date < auditFirstByGroup[k]) auditFirstByGroup[k] = a.date;
            });

            // Cumulative matured TO-DATE (after 10% culling).
            // - Stock To-Date  → groups whose 9-month maturity has passed
            // - Verified Stock → groups whose earliest of (9-month, audit ≥150cm) has passed
            const today = new Date();

            let rawByAge = 0, rawByAgeOrAudit = 0;
            Object.entries(groups).forEach(([k, g]) => {
                const transplantDate = new Date(g.firstDate);
                const ageMatureDate  = new Date(transplantDate); ageMatureDate.setMonth(ageMatureDate.getMonth() + 9);
                const auditMatureDate = auditFirstByGroup[k] ? new Date(auditFirstByGroup[k]) : null;

                if (ageMatureDate <= today) rawByAge += g.qty;

                let earliest = ageMatureDate;
                if (auditMatureDate && auditMatureDate < earliest) earliest = auditMatureDate;
                if (earliest <= today) rawByAgeOrAudit += g.qty;
            });

            // After 10% culling
            let qtyByAge        = Math.round(rawByAge        * 0.9);
            let qtyByAgeOrAudit = Math.round(rawByAgeOrAudit * 0.9);

            // Subtract all collections to-date so "matured" reflects seedlings still on hand.
            let collectedQty = 0;
            if (collRes?.data && collRes.data.length) {
                collectedQty = collRes.data.reduce((s, c) => s + (c.collected_qty || 0), 0);
            } else if (ordCollFallbackRes?.data) {
                collectedQty = ordCollFallbackRes.data.reduce((s, o) => s + (o.collected_qty || 0), 0);
            }
            qtyByAge        = Math.max(0, qtyByAge        - collectedQty);
            qtyByAgeOrAudit = Math.max(0, qtyByAgeOrAudit - collectedQty);

            const { data: pendingOrders } = await _supabase
                .from('salesweb_customer_orders')
                .select('id,status,created_at')
                .not('status', 'in', '("Pending Payment","Cancelled","Order Completed","Completed")')
                .lt('created_at', startOfNextMonthISO);

            const pendingIds = (pendingOrders || []).map(o => o.id);
            let pendingOrdersQty = 0;
            if (pendingIds.length) {
                const { data: items } = await _supabase
                    .from('salesweb_order_items')
                    .select('order_id,quantity')
                    .in('order_id', pendingIds);
                pendingOrdersQty = (items || []).reduce((s, it) => s + (it.quantity || 0), 0);
            }

            nsdAggregates = { qtyByAge, qtyByAgeOrAudit, pendingOrdersQty, collectedQty };
            renderNsdTab();
        } catch(e) {
            console.warn('NSD load error:', e);
            ['stat-matured','stat-orders-current'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = '—';
            });
        }
    }

    function switchComboTab(tab) {
        comboTab = tab;
        document.getElementById('combo-tab-basic').classList.toggle('active',    tab === 'basic');
        document.getElementById('combo-tab-verified').classList.toggle('active', tab === 'verified');
        renderNsdTab();
    }

    function renderNsdTab() {
        const verified = comboTab === 'verified';

        document.getElementById('matured-tile-label').innerText = verified
            ? 'Verified Matured (To-Date)'
            : 'Total Matured (To-Date)';
        document.getElementById('matured-tile-sub').innerText = verified
            ? '9-month + audit ≥ 1.5m, after 10% culling, less collections to-date'
            : '9-month rule, after 10% culling, less collections to-date';
        document.getElementById('nsd-remark-audit').style.display = verified ? '' : 'none';

        const availLabel = document.getElementById('avail-tab-label');
        if (availLabel) {
            availLabel.innerHTML = verified
                ? 'From <span class="text-emerald-700 font-black">Verified Stock</span>'
                : 'From <span class="text-emerald-700 font-black">Stock To-Date</span>';
        }

        if (!nsdAggregates) return;
        const matured = verified ? nsdAggregates.qtyByAgeOrAudit : nsdAggregates.qtyByAge;
        document.getElementById('stat-matured').innerText        = matured.toLocaleString();
        document.getElementById('stat-orders-current').innerText = nsdAggregates.pendingOrdersQty.toLocaleString();

        baseStock = matured;
        currentOrdersQty = nsdAggregates.pendingOrdersQty;
        updateGearing();
    }

    function updateGearing() {
        const matured = baseStock;
        const orders  = currentOrdersQty;
        const g = parseInt(document.getElementById('gearing-slider').value) / 10;

        const gearedMatured = Math.round(matured * g);
        const available     = Math.max(0, gearedMatured - orders);

        const isOversold     = orders > matured;
        const oversoldQty    = Math.max(0, orders - matured);
        const oversoldFactor = matured > 0 ? (orders / matured) : 0;
        const neededGearing  = matured > 0 ? Math.min(3.0, orders / matured) : 1.0;

        document.getElementById('stat-available').innerText  = available.toLocaleString();
        document.getElementById('calc-matured').innerText    = matured.toLocaleString();
        document.getElementById('calc-orders').innerText     = orders.toLocaleString();
        document.getElementById('calc-available').innerText  = available.toLocaleString();
        document.getElementById('gearing-display').innerText = g.toFixed(1) + '×';

        const statusBadge = document.getElementById('avail-status-badge');
        const oversoldBox = document.getElementById('oversold-warning');
        if (isOversold) {
            statusBadge.innerText = 'Oversold';
            statusBadge.className = 'text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full uppercase tracking-widest';
            oversoldBox.classList.remove('hidden');
            document.getElementById('oversold-qty').innerText            = oversoldQty.toLocaleString();
            document.getElementById('oversold-factor').innerText         = oversoldFactor.toFixed(2) + '×';
            document.getElementById('oversold-needed-gearing').innerText = neededGearing.toFixed(2) + '×';
        } else {
            statusBadge.innerText = 'OK';
            statusBadge.className = 'text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-widest';
            oversoldBox.classList.add('hidden');
        }

        const badge = document.getElementById('gearing-badge');
        if (g <= 1.5)      { badge.innerText = 'Conservative'; badge.className = 'text-[8px] font-black text-emerald-600 bg-white border border-emerald-200 rounded-full px-1.5 py-0.5 uppercase tracking-wider'; }
        else if (g <= 2.2) { badge.innerText = 'Moderate';     badge.className = 'text-[8px] font-black text-amber-600 bg-white border border-amber-200 rounded-full px-1.5 py-0.5 uppercase tracking-wider'; }
        else               { badge.innerText = 'Aggressive';   badge.className = 'text-[8px] font-black text-red-600 bg-white border border-red-200 rounded-full px-1.5 py-0.5 uppercase tracking-wider'; }
    }

    // ── To-Do list ────────────────────────────────────────────────────────────
    let todoTab = 'unpaid';
    let todoData = { unpaid: [], credit: [] };

    async function loadTodoList() {
        await Promise.all([loadUnpaidScenario(), loadCreditScenario()]);
        document.getElementById('todo-count-unpaid').innerText = todoData.unpaid.length;
        document.getElementById('todo-count-credit').innerText = todoData.credit.length;
        renderTodoTab();
        renderPaymentStatusSummary();
    }

    function renderPaymentStatusSummary() {
        const fmtRM = n => 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const unpaidCount  = todoData.unpaid.length;
        const unpaidAmt    = todoData.unpaid.reduce((s, r) => s + (r.totalAmount || 0), 0);
        const creditCount  = todoData.credit.length;
        const creditAmt    = todoData.credit.reduce((s, r) => s + (r.billAmount || 0), 0);

        const paidPending  = (allCustomerOrders || []).filter(r => r.derivedStatus === 'Paid · Pending Pickup');
        const paidCount    = paidPending.length;
        const paidQty      = paidPending.reduce((s, r) => s + (r.balance || 0), 0);

        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
        setText('pay-unpaid-count', unpaidCount.toLocaleString());
        setText('pay-unpaid-amt',   unpaidCount ? fmtRM(unpaidAmt) : '—');
        setText('pay-credit-count', creditCount.toLocaleString());
        setText('pay-credit-amt',   creditCount ? fmtRM(creditAmt) : '—');
        setText('pay-paid-count',   paidCount.toLocaleString());
        setText('pay-paid-amt',     paidCount ? `${paidQty.toLocaleString()} qty awaiting` : '—');

        const meta = document.getElementById('pay-status-meta');
        if (meta) meta.innerText = `${unpaidCount + creditCount + paidCount} action items`;
    }

    async function loadUnpaidScenario() {
        try {
            const { data: unpaidOrders, error } = await _supabase
                .from('salesweb_customer_orders')
                .select('id,order_number,customer_name,total,created_at,status')
                .eq('status', 'Pending Payment')
                .order('created_at', { ascending: false });
            if (error) throw error;

            const unpaidIds = (unpaidOrders || []).map(o => o.id);
            const itemsByOrder = {};
            if (unpaidIds.length) {
                const { data: items } = await _supabase
                    .from('salesweb_order_items')
                    .select('order_id,product_name,quantity,unit_price,subtotal')
                    .in('order_id', unpaidIds);
                (items || []).forEach(it => {
                    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
                    itemsByOrder[it.order_id].push(it);
                });
            }

            todoData.unpaid = (unpaidOrders || []).map(o => {
                const items = itemsByOrder[o.id] || [];
                return {
                    id: o.id,
                    orderNumber: o.order_number,
                    customerName: o.customer_name,
                    totalQty: items.reduce((s, it) => s + (it.quantity || 0), 0),
                    totalAmount: o.total || 0,
                    items
                };
            });
        } catch(e) {
            console.warn('[Unpaid] load failed:', e);
            todoData.unpaid = [];
        }
    }

    async function loadCreditScenario() {
        try {
            const { data: creditOrders, error } = await _supabase
                .from('salesweb_customer_orders')
                .select('id,order_number,customer_name,total,created_at,status,payment_method,billed_at,collected_qty,collected_at')
                .eq('payment_method', 'credit')
                .is('billed_at', null)
                .order('collected_at', { ascending: false, nullsFirst: false })
                .order('created_at',   { ascending: false });
            if (error) throw error;

            const creditIds = (creditOrders || []).map(o => o.id);
            const itemsByOrder = {};
            if (creditIds.length) {
                const { data: items } = await _supabase
                    .from('salesweb_order_items')
                    .select('order_id,product_name,quantity,unit_price,subtotal')
                    .in('order_id', creditIds);
                (items || []).forEach(it => {
                    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
                    itemsByOrder[it.order_id].push(it);
                });
            }

            todoData.credit = (creditOrders || []).map(o => {
                const items = itemsByOrder[o.id] || [];
                const orderedTotalQty = items.reduce((s, it) => s + (it.quantity || 0), 0);
                const orderedTotalAmt = items.reduce((s, it) => s + (it.subtotal || 0), 0);
                const unitPrice = orderedTotalQty > 0 ? (orderedTotalAmt / orderedTotalQty) : (items[0]?.unit_price || 0);
                const collectedQty = o.collected_qty != null ? o.collected_qty : orderedTotalQty;
                const billAmount   = unitPrice * collectedQty;
                const billingDate  = o.collected_at ? new Date(o.collected_at) : new Date(o.created_at);
                return {
                    id: o.id,
                    orderNumber: o.order_number,
                    customerName: o.customer_name,
                    collectedQty,
                    unitPrice,
                    billAmount,
                    billingMonth: billingDate.toLocaleString('en-MY', { month: 'short', year: 'numeric' })
                };
            });
        } catch(e) {
            console.warn('[Credit] unavailable:', e?.message || e);
            todoData.credit = [];
        }
    }

    function switchTodoTab(tab) {
        todoTab = tab;
        document.getElementById('todo-tab-unpaid').classList.toggle('active', tab === 'unpaid');
        document.getElementById('todo-tab-credit').classList.toggle('active', tab === 'credit');
        renderTodoTab();
    }

    function renderTodoTab() {
        const body = document.getElementById('todo-body');
        const meta = document.getElementById('todo-section-meta');
        const fmtRM = n => 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (todoTab === 'unpaid') {
            const total = todoData.unpaid.reduce((s, r) => s + (r.totalAmount || 0), 0);
            meta.innerHTML = todoData.unpaid.length
                ? `<span class="text-red-600 font-black">${todoData.unpaid.length}</span> orders · Total <span class="text-red-600 font-black">${fmtRM(total)}</span>`
                : '';

            if (!todoData.unpaid.length) {
                body.innerHTML = '<div class="text-center py-8 text-slate-500"><span class="text-2xl">✓</span><div class="text-[10px] font-bold uppercase tracking-widest mt-1">No pending payments</div></div>';
                return;
            }

            body.innerHTML = todoData.unpaid.map(r => `
                <div class="notebook-row">
                    <div class="nb-line1">
                        <span class="note-name" title="${escapeHtml(r.customerName || '')}">${escapeHtml(r.customerName || '—')}</span>
                        <span class="note-amt">${fmtRM(r.totalAmount)}</span>
                    </div>
                    <div class="nb-line2">
                        <span><span class="text-[8px] font-black px-1 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 uppercase tracking-widest mr-1">Unpaid</span><span class="note-id">${escapeHtml(r.orderNumber || '—')}</span></span>
                        <span>${r.totalQty.toLocaleString()} qty</span>
                    </div>
                </div>
            `).join('');
        } else {
            const now = new Date();
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const billLabel = lastMonth.toLocaleString('en-MY', { month: 'short', year: 'numeric' });
            const total = todoData.credit.reduce((s, r) => s + (r.billAmount || 0), 0);
            meta.innerHTML = todoData.credit.length
                ? `Bill for ${billLabel} · <span class="text-blue-600 font-black">${todoData.credit.length}</span> orders · Total <span class="text-blue-600 font-black">${fmtRM(total)}</span>`
                : '';

            if (!todoData.credit.length) {
                body.innerHTML = '<div class="text-center py-8 text-slate-500"><span class="text-2xl">✓</span><div class="text-[10px] font-bold uppercase tracking-widest mt-1">No credit billing pending</div><div class="text-[9px] mt-1">Tag orders with <span class="font-mono">payment_method=\'credit\'</span> to see them here.</div></div>';
                return;
            }

            body.innerHTML = todoData.credit.map(r => `
                <div class="notebook-row credit">
                    <div class="nb-line1">
                        <span class="note-name" title="${escapeHtml(r.customerName || '')}">${escapeHtml(r.customerName || '—')}</span>
                        <span class="note-amt">${fmtRM(r.billAmount)}</span>
                    </div>
                    <div class="nb-line2">
                        <span><span class="text-[8px] font-black px-1 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 uppercase tracking-widest mr-1">${escapeHtml(r.billingMonth)}</span><span class="note-id">${escapeHtml(r.orderNumber || '—')}</span></span>
                        <span>${r.collectedQty.toLocaleString()} × ${fmtRM(r.unitPrice)}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    // ── Monthly Maturity Allocation ──────────────────────────────────────────
    let allMatGroups = [];
    let plotAllocations = {};
    let activeMonthKey = null;
    let activeMonthKeys = [];
    let historyMonthKeys = [];

    function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
    function monthLabel(k) {
        const [y, m] = k.split('-').map(Number);
        return new Date(y, m-1, 1).toLocaleString('en-MY', { month: 'short', year: 'numeric' });
    }

    async function loadMaturity() {
        try {
            const [transRes, plotsRes, allocRes] = await Promise.all([
                _supabase.from('shared_inventory_logs')
                    .select('batch_name,plot_name,breed_name,quantity_change,created_at')
                    .in('transaction_type', ['Transplanted','Transplanted_Premium','Transplanted_DoubleTone']),
                _supabase.from('shared_plots').select('plot_name,nursery_name'),
                _supabase.from('shared_plot_allocations').select('*').then(r => r, e => ({ data: [], error: e }))
            ]);

            const trans = transRes.data || [];
            const plots = plotsRes.data || [];

            const plotNurseryMap = {};
            const prefixNurseryMap = {};
            const looksLikePlotCode = s => typeof s === 'string' && /^[A-Za-z]+\d+$/.test(s.trim());
            plots.forEach(p => {
                if (!p.plot_name || !p.nursery_name) return;
                if (looksLikePlotCode(p.nursery_name)) return;
                plotNurseryMap[p.plot_name] = p.nursery_name;
                const prefix = (p.plot_name.match(/^[A-Za-z]+/) || [])[0];
                if (prefix) prefixNurseryMap[prefix] = p.nursery_name;
            });
            const resolveLocation = plot => {
                if (!plot) return '—';
                if (plotNurseryMap[plot]) return plotNurseryMap[plot];
                const prefix = (plot.match(/^[A-Za-z]+/) || [])[0];
                return prefix && prefixNurseryMap[prefix] ? prefixNurseryMap[prefix] : '—';
            };

            const groups = {};
            trans.forEach(l => {
                const k = (l.batch_name||'') + '||' + (l.plot_name||'');
                if (!groups[k]) groups[k] = {
                    batch: l.batch_name, plot: l.plot_name, breed: l.breed_name,
                    qty: 0, firstDate: l.created_at
                };
                groups[k].qty += (l.quantity_change || 0);
                if (l.created_at < groups[k].firstDate) groups[k].firstDate = l.created_at;
                if (!groups[k].breed && l.breed_name) groups[k].breed = l.breed_name;
            });

            allMatGroups = Object.entries(groups).map(([k, g]) => {
                const t = new Date(g.firstDate);
                const matureDate = new Date(t); matureDate.setMonth(matureDate.getMonth() + 9);
                return {
                    key: k,
                    batch: g.batch,
                    plot: g.plot,
                    breed: g.breed || '—',
                    location: resolveLocation(g.plot),
                    qty: g.qty,
                    afterCulling: Math.round(g.qty * 0.9),
                    transplantDate: t,
                    matureDate
                };
            });

            plotAllocations = {};
            (allocRes?.data || []).forEach(a => {
                const k = (a.batch_name||'') + '||' + (a.plot_name||'');
                plotAllocations[k] = {
                    plot_status: a.plot_status || 'no_status',
                    reserved_for: a.reserved_for || '',
                    reserved_qty: a.reserved_qty || 0,
                    premium: !!a.premium
                };
            });

            const now = new Date();
            const curKey = monthKey(now);
            const monthsWithData = new Set(allMatGroups.map(g => monthKey(g.matureDate)));

            activeMonthKeys = [...monthsWithData].filter(k => k >= curKey).sort();
            historyMonthKeys = [...monthsWithData].filter(k => k < curKey).sort().reverse();

            if (!activeMonthKeys.includes(curKey)) activeMonthKeys.unshift(curKey);

            activeMonthKey = monthsWithData.has(curKey) ? curKey : (activeMonthKeys[0] || curKey);

            renderMonthTabs();
            renderMaturityTable();
        } catch(e) {
            console.warn('Maturity load error:', e);
            document.getElementById('maturity-rows').innerHTML = `<tr><td colspan="12" class="text-center py-8 text-[10px] text-red-500 font-bold uppercase tracking-widest">Failed to load maturity data</td></tr>`;
        }
    }

    function renderMonthTabs() {
        const now = new Date();
        const curKey = monthKey(now);
        const tabsEl = document.getElementById('month-tabs');
        tabsEl.innerHTML = '';
        activeMonthKeys.forEach(k => {
            const isCurrent = k === curKey;
            const btn = document.createElement('button');
            btn.className = 'month-tab' + (k === activeMonthKey ? ' active' : '') + (isCurrent ? ' is-current' : '');
            btn.innerText = monthLabel(k) + (isCurrent ? ' · now' : '');
            btn.onclick = () => { activeMonthKey = k; closeHistoryMenu(); renderMonthTabs(); renderMaturityTable(); renderActiveBanner(); };
            tabsEl.appendChild(btn);
        });

        const menu = document.getElementById('history-menu');
        document.getElementById('history-count').innerText = historyMonthKeys.length;
        if (!historyMonthKeys.length) {
            menu.innerHTML = '<div class="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center py-3">No past records</div>';
        } else {
            menu.innerHTML = historyMonthKeys.map(k => `
                <button onclick="selectHistoryMonth('${k}')" class="w-full text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-2 flex justify-between items-center ${k === activeMonthKey ? 'bg-amber-50 text-amber-800' : ''}">
                    <span>${monthLabel(k)}</span>
                    <span class="text-[9px] text-slate-400 uppercase tracking-widest">history</span>
                </button>
            `).join('');
        }

        renderActiveBanner();
    }

    function renderActiveBanner() {
        const banner = document.getElementById('active-month-banner');
        if (historyMonthKeys.includes(activeMonthKey)) {
            banner.classList.remove('hidden');
            banner.innerHTML = `🕘 Viewing <span class="font-black uppercase tracking-widest">history</span> — ${monthLabel(activeMonthKey)} (already matured & past)`;
        } else {
            banner.classList.add('hidden');
        }
    }

    function selectHistoryMonth(k) {
        activeMonthKey = k;
        closeHistoryMenu();
        renderMonthTabs();
        renderMaturityTable();
    }

    function toggleHistoryMenu() {
        const menu = document.getElementById('history-menu');
        menu.classList.toggle('hidden');
        if (!menu.classList.contains('hidden')) {
            setTimeout(() => {
                document.addEventListener('click', closeHistoryOnOutside, { once: true });
            }, 0);
        }
    }
    function closeHistoryMenu() {
        document.getElementById('history-menu').classList.add('hidden');
    }
    function closeHistoryOnOutside(e) {
        const menu = document.getElementById('history-menu');
        const btn  = document.getElementById('history-btn');
        if (!menu.contains(e.target) && !btn.contains(e.target)) closeHistoryMenu();
        else document.addEventListener('click', closeHistoryOnOutside, { once: true });
    }

    let _orderCollectionRatio = {};

    function rebuildOrderCollectionRatioCache() {
        _orderCollectionRatio = {};
        (allCustomerOrders || []).forEach(o => {
            if (o.totalQty > 0) {
                _orderCollectionRatio[o.id] = (o.totalCollected || 0) / o.totalQty;
            } else {
                _orderCollectionRatio[o.id] = 0;
            }
        });
    }

    function collectedForAllocations(rowAllocs) {
        if (!rowAllocs.length) return 0;
        let sum = 0;
        rowAllocs.forEach(a => {
            const ratio = _orderCollectionRatio[a.order_id] || 0;
            sum += Math.round((a.allocated_qty || 0) * ratio);
        });
        return sum;
    }

    function plotStatusPill(status) {
        const map = {
            no_status: { label: 'No Status', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
            open:      { label: 'Open',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            sisa:      { label: 'Sisa',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
            finished:  { label: 'Finished',  cls: 'bg-slate-200 text-slate-700 border-slate-300' }
        };
        const m = map[status] || map.no_status;
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${m.cls}">${m.label}</span>`;
    }

    function renderMaturityTable() {
        rebuildOrderCollectionRatioCache();

        const tbody = document.getElementById('maturity-rows');
        const tfoot = document.getElementById('maturity-foot');

        const rows = allMatGroups
            .filter(g => monthKey(g.matureDate) === activeMonthKey)
            .sort((a, b) => a.matureDate - b.matureDate);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center py-10 text-slate-400"><div class="text-2xl mb-1">🌱</div><div class="text-[10px] font-bold uppercase tracking-widest">No maturity allocations for this month</div></td></tr>`;
            tfoot.innerHTML = '';
            return;
        }

        let totQty = 0, totCull = 0, totReserved = 0, totCollected = 0;
        tbody.innerHTML = rows.map(r => {
            const alloc = plotAllocations[r.key] || { plot_status: 'no_status', reserved_for: '', reserved_qty: 0, premium: false };
            const rowAllocs = allocsForBatch(r.key);
            const allocSum  = rowAllocs.reduce((s, a) => s + (a.allocated_qty || 0), 0);
            const collected = collectedForAllocations(rowAllocs);
            const plotBalance       = r.afterCulling - collected;
            const afterDeductReserve = plotBalance - allocSum;

            totQty       += r.qty;
            totCull      += r.afterCulling;
            totReserved  += allocSum;
            totCollected += collected;

            const reservHtml = rowAllocs.length
                ? `<div class="reserv-stack">${rowAllocs.map(a => `
                    <div class="reserv-chip" draggable="true" data-alloc-id="${escapeHtml(a.id)}" title="${escapeHtml(a.order_number || '')} — drag chip to move to another row">
                        <span class="reserv-chip-grip">⋮⋮</span>
                        <span class="reserv-chip-name">${escapeHtml(a.customer_name || '—')}</span>
                        <span class="reserv-chip-qty">${(a.allocated_qty || 0).toLocaleString()}</span>
                        <button class="reserv-chip-x" onclick="event.stopPropagation();removeAllocation('${escapeHtml(a.id)}')" onmousedown="event.stopPropagation()" draggable="false" title="Remove allocation">×</button>
                    </div>`).join('')}</div>`
                : `<div class="reserv-empty"><span class="reserv-empty-emoji">🎯</span><span>Drop card here</span></div>`;

            const status = alloc.plot_status || 'no_status';

            return `
                <tr data-batch-key="${escapeHtml(r.key)}" data-batch-name="${escapeHtml(r.batch || '')}" data-plot-name="${escapeHtml(r.plot || '')}" data-batch-balance="${afterDeductReserve}">
                    <td class="col-prod">${r.matureDate.toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'})}</td>
                    <td class="col-prod">${escapeHtml(r.location)}</td>
                    <td class="col-prod"><span class="font-black text-slate-900">${escapeHtml(r.plot || '—')}</span></td>
                    <td class="col-prod font-mono">${escapeHtml(r.batch || '—')}</td>
                    <td class="col-prod">${escapeHtml(r.breed || '—')}</td>
                    <td class="col-prod num">${r.qty.toLocaleString()}</td>
                    <td class="col-prod num text-emerald-700 mat-sep-r">${r.afterCulling.toLocaleString()}</td>
                    <td class="col-plot">
                        <div class="flex items-center gap-2">
                            ${plotStatusPill(status)}
                            <select data-allockey="${r.key}" data-allocfield="plot_status" onchange="updateAllocation(this)"
                                class="text-[9px] font-black uppercase tracking-wider rounded-md border border-slate-200 px-1.5 py-0.5 bg-white">
                                <option value="no_status" ${status === 'no_status' ? 'selected' : ''}>No Status</option>
                                <option value="open"      ${status === 'open'      ? 'selected' : ''}>Open</option>
                                <option value="sisa"      ${status === 'sisa'      ? 'selected' : ''}>Sisa</option>
                                <option value="finished"  ${status === 'finished'  ? 'selected' : ''}>Finished</option>
                            </select>
                        </div>
                    </td>
                    <td class="col-plot num text-blue-700">${collected.toLocaleString()}</td>
                    <td class="col-plot num font-black mat-sep-r ${plotBalance < 0 ? 'text-red-600' : 'text-slate-800'}">${plotBalance.toLocaleString()}</td>
                    <td class="col-alloc">${reservHtml}</td>
                    <td class="col-alloc num font-black text-slate-700">${allocSum.toLocaleString()}</td>
                    <td class="col-alloc num font-black ${afterDeductReserve < 0 ? 'text-red-600' : afterDeductReserve === 0 ? 'text-slate-400' : 'text-emerald-700'}">${afterDeductReserve.toLocaleString()}</td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('tr[data-batch-key]').forEach(tr => {
            tr.addEventListener('dragover',  onRowDragOver);
            tr.addEventListener('dragleave', onRowDragLeave);
            tr.addEventListener('drop',      onRowDrop);
        });
        tbody.querySelectorAll('.reserv-chip[draggable="true"]').forEach(el => {
            el.addEventListener('dragstart', onChipDragStart);
            el.addEventListener('dragend',   onChipDragEnd);
        });

        const totAfterDeduct = totCull - totCollected - totReserved;
        tfoot.innerHTML = `
            <tr class="bg-slate-50 font-black">
                <td colspan="5" class="text-right text-[10px] uppercase tracking-widest text-slate-500 py-2 px-2">Totals (${rows.length} rows)</td>
                <td class="num text-slate-900">${totQty.toLocaleString()}</td>
                <td class="num text-emerald-700 mat-sep-r">${totCull.toLocaleString()}</td>
                <td></td>
                <td class="num text-blue-700">${totCollected.toLocaleString()}</td>
                <td class="num text-slate-800 mat-sep-r">${(totCull - totCollected).toLocaleString()}</td>
                <td></td>
                <td class="num text-slate-900">${totReserved.toLocaleString()}</td>
                <td class="num ${totAfterDeduct < 0 ? 'text-red-600' : 'text-emerald-700'}">${totAfterDeduct.toLocaleString()}</td>
            </tr>`;
    }

    async function updateAllocation(el) {
        const key = el.dataset.allockey;
        const field = el.dataset.allocfield;
        let value = el.type === 'checkbox' ? el.checked : el.value;
        if (field === 'reserved_qty') value = parseInt(value) || 0;

        const [batch, plot] = key.split('||');
        if (!plotAllocations[key]) plotAllocations[key] = { plot_status: 'open', reserved_for: '', reserved_qty: 0, premium: false };
        plotAllocations[key][field] = value;

        try {
            const payload = {
                batch_name: batch,
                plot_name: plot,
                plot_status: plotAllocations[key].plot_status,
                reserved_for: plotAllocations[key].reserved_for,
                reserved_qty: plotAllocations[key].reserved_qty,
                premium: plotAllocations[key].premium,
                updated_at: new Date().toISOString()
            };
            const { error } = await _supabase.from('shared_plot_allocations').upsert(payload, { onConflict: 'batch_name,plot_name' });
            if (error) throw error;
            renderMaturityTable();
        } catch(e) {
            console.warn('[Allocation] save failed (table may not exist yet):', e?.message || e);
            renderMaturityTable();
        }
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    let allCustomerOrders = [];

    async function loadCustomerOrders() {
        try {
            const monthStartStr = (() => {
                const d = new Date(); d.setDate(1);
                return d.toISOString().slice(0,10);
            })();

            const [ordRes, _itemsRes, _collRes, _bookRes] = await Promise.all([
                _supabase.from('salesweb_customer_orders')
                    .select('id,order_number,customer_name,total,status,created_at,payment_method,collected_qty,collected_at')
                    .order('created_at', { ascending: true }),
                _supabase.from('salesweb_order_items').select('order_id,quantity,unit_price,subtotal'),
                _supabase.from('salesweb_order_collections').select('order_id,collected_qty,collected_at')
                    .then(r => r, e => ({ data: null, error: e })),
                _supabase.from('shared_collection_bookings')
                    .select('order_number,booking_date,collection_qty,status')
                    .gte('booking_date', monthStartStr)
                    .not('status', 'in', '("cancelled")')
                    .then(r => r, e => ({ data: null, error: e }))
            ]);

            const orders = ordRes.data || [];
            const items  = _itemsRes.data || [];
            const collections = _collRes?.data;
            const bookings    = _bookRes?.data || [];

            const itemsByOrder = {};
            items.forEach(it => {
                if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = { qty: 0, amt: 0 };
                itemsByOrder[it.order_id].qty += (it.quantity || 0);
                itemsByOrder[it.order_id].amt += (it.subtotal || 0);
            });

            const collByOrder = {};
            if (collections && collections.length) {
                collections.forEach(c => {
                    if (!c.collected_at) return;
                    const k = monthKey(new Date(c.collected_at));
                    if (!collByOrder[c.order_id]) collByOrder[c.order_id] = {};
                    collByOrder[c.order_id][k] = (collByOrder[c.order_id][k] || 0) + (c.collected_qty || 0);
                });
            }
            if (!collections || !collections.length) {
                orders.forEach(o => {
                    if (o.collected_qty && o.collected_at) {
                        const k = monthKey(new Date(o.collected_at));
                        collByOrder[o.id] = { [k]: o.collected_qty };
                    }
                });
            }

            const bookByOrderNumber = {};
            bookings.forEach(b => {
                if (!b.order_number || !b.booking_date) return;
                const k = b.booking_date.slice(0,7);
                if (!bookByOrderNumber[b.order_number]) bookByOrderNumber[b.order_number] = {};
                bookByOrderNumber[b.order_number][k] = (bookByOrderNumber[b.order_number][k] || 0) + (b.collection_qty || 0);
            });

            allCustomerOrders = orders.map(o => {
                const it = itemsByOrder[o.id] || { qty: 0, amt: 0 };
                const colByMonth = collByOrder[o.id] || {};
                const bookByMonth = bookByOrderNumber[o.order_number] || {};
                const totalCollected = Object.values(colByMonth).reduce((s, v) => s + v, 0);
                const balance = it.qty - totalCollected;
                let derivedStatus = o.status;
                if (o.status !== 'Cancelled' && o.status !== 'Pending Payment') {
                    if      (totalCollected === 0)         derivedStatus = 'Paid · Pending Pickup';
                    else if (totalCollected >= it.qty)     derivedStatus = 'Completed';
                    else                                   derivedStatus = 'Partial · ' + Math.round((totalCollected/it.qty)*100) + '%';
                }
                return {
                    id: o.id,
                    orderNumber: o.order_number,
                    customer: o.customer_name,
                    orderDate: o.created_at ? new Date(o.created_at) : null,
                    totalQty: it.qty,
                    totalAmount: o.total ?? it.amt,
                    rawStatus: o.status,
                    derivedStatus,
                    paymentMethod: o.payment_method || 'standard',
                    collectionsByMonth: colByMonth,
                    bookingsByMonth: bookByMonth,
                    totalCollected,
                    balance
                };
            });

            renderCustomerGrid();
            renderPaymentStatusSummary();
        } catch(e) {
            console.warn('[Cust] load failed:', e);
            document.getElementById('cust-tbody').innerHTML = `<tr><td colspan="20" class="text-center py-8 text-[10px] text-red-500 font-bold uppercase tracking-widest">Failed to load customer orders</td></tr>`;
        }
    }

    function customerActiveMonths() {
        const now = new Date();
        const startKey = monthKey(now);
        const present = new Set([startKey]);

        (allCustomerOrders || []).forEach(r => {
            Object.entries(r.bookingsByMonth || {}).forEach(([k, v]) => {
                if (v && k >= startKey) present.add(k);
            });
            Object.entries(r.collectionsByMonth || {}).forEach(([k, v]) => {
                if (v && k >= startKey) present.add(k);
            });
        });

        return Array.from(present).sort().map(k => {
            const [y, m] = k.split('-').map(Number);
            const d = new Date(y, m - 1, 1);
            return { key: k, label: d.toLocaleString('en-MY', { month: 'short', year: 'numeric' }), date: d };
        });
    }

    function pillFor(derived) {
        if (!derived) return ['pill-pending', '—'];
        if (derived === 'Cancelled')               return ['pill-cancelled', 'Cancelled'];
        if (derived === 'Pending Payment')         return ['pill-pending',   'Unpaid'];
        if (derived === 'Completed')               return ['pill-completed', 'Completed'];
        if (derived === 'Paid · Pending Pickup')   return ['pill-paid',      'Paid'];
        if (derived.startsWith('Partial'))         return ['pill-partial',   derived];
        return ['pill-paid', derived];
    }

    function renderCustomerGrid() {
        const thead  = document.getElementById('cust-thead');
        const tbody  = document.getElementById('cust-tbody');
        const tfoot  = document.getElementById('cust-tfoot');
        const search = (document.getElementById('cust-search')?.value || '').toLowerCase().trim();
        const filter = document.getElementById('cust-filter')?.value || 'active';

        const months = customerActiveMonths();
        const nowKey = monthKey(new Date());
        const fmtRM  = n => 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        thead.innerHTML = `
            <tr>
                <th class="h-cust" style="width:38px;">#</th>
                <th class="h-cust" style="min-width:200px;">Customer</th>
                <th>Order Month</th>
                <th>Status</th>
                <th>Ordered Qty</th>
                ${months.map(m => `<th class="h-mo${m.key===nowKey?' is-now':''}">${m.label.replace(' ','<br>')}</th>`).join('')}
                <th class="h-tot">Total<br>Collected</th>
                <th class="h-tot">Balance</th>
                <th class="h-tot">Order Total</th>
            </tr>`;

        let rows = allCustomerOrders.filter(r => {
            if (search && !(r.orderNumber || '').toLowerCase().includes(search) && !(r.customer || '').toLowerCase().includes(search)) return false;
            if (filter === 'all') return true;
            if (filter === 'active')      return r.rawStatus !== 'Cancelled';
            if (filter === 'outstanding') return r.rawStatus !== 'Cancelled' && r.balance > 0;
            if (filter === 'completed')   return r.rawStatus !== 'Cancelled' && r.totalCollected >= r.totalQty && r.totalQty > 0;
            return true;
        });

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${5 + months.length + 3}" class="text-center py-10 text-slate-400"><div class="text-2xl mb-1">📋</div><div class="text-[10px] font-bold uppercase tracking-widest">No customer orders match the filter</div></td></tr>`;
            tfoot.innerHTML = '';
            return;
        }

        let totQty = 0, totColl = 0, totBalance = 0, totAmt = 0;
        const colCollTotals = months.map(() => 0);
        const colBookTotals = months.map(() => 0);

        tbody.innerHTML = rows.map((r, idx) => {
            totQty += r.totalQty; totColl += r.totalCollected; totBalance += r.balance; totAmt += (r.totalAmount || 0);
            const orderMonth = r.orderDate ? r.orderDate.toLocaleString('en-MY',{month:'short',year:'numeric'}) : '—';
            const [pillCls, pillTxt] = pillFor(r.derivedStatus);
            const cellsHtml = months.map((m, i) => {
                const collected = r.collectionsByMonth[m.key] || 0;
                const booked    = r.bookingsByMonth[m.key]    || 0;
                if (collected) colCollTotals[i] += collected;
                if (booked)    colBookTotals[i] += booked;

                const cls = [
                    't-mo',
                    collected ? 'has-qty' : '',
                    !collected && booked ? 'has-booked' : '',
                    m.key === nowKey ? 'is-now' : ''
                ].filter(Boolean).join(' ');

                let inner = '';
                if (collected && booked)      inner = `${collected.toLocaleString()}<span class="booked-tag">+${booked.toLocaleString()} booked</span>`;
                else if (collected)           inner = collected.toLocaleString();
                else if (booked)              inner = `${booked.toLocaleString()}<span class="booked-tag">booked</span>`;
                return `<td class="${cls}">${inner}</td>`;
            }).join('');
            return `
                <tr>
                    <td class="t-cust">${idx + 1}</td>
                    <td class="t-cust"><span class="cust-link" data-pickup data-cust="${escapeHtml(r.customer || '')}" data-order="${escapeHtml(r.orderNumber || '')}">${escapeHtml(r.customer || '—')}</span><div class="t-sub">${escapeHtml(r.orderNumber || '')}</div></td>
                    <td>${orderMonth}</td>
                    <td><span class="pill-status ${pillCls}">${escapeHtml(pillTxt)}</span></td>
                    <td class="font-black">${r.totalQty.toLocaleString()}</td>
                    ${cellsHtml}
                    <td class="t-tot">${r.totalCollected.toLocaleString()}</td>
                    <td class="t-tot${r.balance < 0 ? ' text-red-600' : r.balance === 0 ? ' text-emerald-700' : ''}">${r.balance.toLocaleString()}</td>
                    <td class="t-tot">${fmtRM(r.totalAmount)}</td>
                </tr>`;
        }).join('');

        const monthFootCells = months.map((m, i) => {
            const c = colCollTotals[i], b = colBookTotals[i];
            if (c && b) return `<td class="t-tot">${c.toLocaleString()}<span class="booked-tag">+${b.toLocaleString()} booked</span></td>`;
            if (c)      return `<td class="t-tot">${c.toLocaleString()}</td>`;
            if (b)      return `<td class="t-tot">${b.toLocaleString()}<span class="booked-tag">booked</span></td>`;
            return       `<td class="t-tot">—</td>`;
        }).join('');

        tfoot.innerHTML = `
            <tr class="bg-slate-50 font-black">
                <td colspan="4" class="text-right text-[10px] uppercase tracking-widest text-slate-500" style="padding:8px;">Totals (${rows.length} orders)</td>
                <td class="t-tot">${totQty.toLocaleString()}</td>
                ${monthFootCells}
                <td class="t-tot">${totColl.toLocaleString()}</td>
                <td class="t-tot">${totBalance.toLocaleString()}</td>
                <td class="t-tot">${fmtRM(totAmt)}</td>
            </tr>`;
    }

    let schedWeekStart = getSchedMonday(new Date());

    function getSchedMonday(d) {
        const dt = new Date(d);
        const dow = dt.getDay();
        const diff = dt.getDate() - dow + (dow === 0 ? -6 : 1);
        dt.setDate(diff); dt.setHours(0,0,0,0);
        return dt;
    }
    function fmtSchedDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function isSchedToday(d) {
        const t = new Date();
        return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
    }
    function changeSchedWeek(dir) {
        schedWeekStart.setDate(schedWeekStart.getDate() + dir * 7);
        loadScheduledCollection();
    }
    function goSchedToday() {
        schedWeekStart = getSchedMonday(new Date());
        loadScheduledCollection();
    }

    async function loadScheduledCollection() {
        const start = schedWeekStart;
        const end = new Date(start); end.setDate(end.getDate() + 5);
        const startStr = fmtSchedDate(start);
        const endStr = fmtSchedDate(end);

        const lbl = document.getElementById('sched-week-label');
        const fmtShort = d => d.toLocaleDateString('en-MY', { day:'2-digit', month:'short' });
        lbl.innerText = `${fmtShort(start)} — ${fmtShort(end)} ${start.getFullYear()}`;

        const { data, error } = await _supabase
            .from('shared_collection_bookings')
            .select('booking_date,start_time,customer_name,collection_qty,nursery_name,status')
            .gte('booking_date', startStr)
            .lte('booking_date', endStr)
            .neq('status', 'cancelled')
            .order('booking_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) {
            console.warn('Scheduled collection load error:', error);
            document.getElementById('sched-week-grid').innerHTML =
                `<div class="text-center py-4 text-[10px] text-red-500 font-bold uppercase tracking-widest col-span-full">Load failed</div>`;
            return;
        }
        renderScheduledCollection(data || []);
    }

    function renderScheduledCollection(rows) {
        const grid = document.getElementById('sched-week-grid');
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat'];
        let html = '';

        for (let i = 0; i < 6; i++) {
            const d = new Date(schedWeekStart);
            d.setDate(d.getDate() + i);
            const ds = fmtSchedDate(d);
            const dayRows = rows.filter(r => (r.booking_date || '').slice(0,10) === ds);
            const isTodayCls = isSchedToday(d);

            const headerCls = isTodayCls
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-200';
            const cardBorderCls = isTodayCls ? 'border-emerald-300' : 'border-slate-200';

            const dateLabel = d.toLocaleDateString('en-MY', { day:'2-digit', month:'short' });
            const totalQty = dayRows.reduce((s,r) => s + (r.collection_qty || 0), 0);

            html += `<div class="rounded-xl border ${cardBorderCls} bg-white overflow-hidden flex flex-col">`;
            html += `<div class="px-2.5 py-2 border-b ${cardBorderCls} ${headerCls} flex items-center justify-between gap-1">
                       <span class="text-[10px] font-black uppercase tracking-widest">${days[i]} ${dateLabel}</span>
                       ${dayRows.length ? `<span class="text-[9px] font-black bg-white/70 rounded-full px-1.5 py-0.5">${dayRows.length}</span>` : ''}
                     </div>`;
            html += `<div class="flex-1 p-2 space-y-1.5 min-h-[60px]">`;

            if (dayRows.length === 0) {
                html += `<div class="text-[9px] text-slate-300 font-bold uppercase tracking-widest text-center py-3">— No booking —</div>`;
            } else {
                dayRows.forEach(r => {
                    const time = (r.start_time || '').slice(0,5);
                    const nursery = (r.nursery_name || 'PENDING').toUpperCase();
                    const nurseryCls = nursery.startsWith('BNN')
                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                        : nursery.startsWith('UNN')
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                        : 'bg-amber-100 text-amber-700 border-amber-200';
                    const cust = (r.customer_name || '—');
                    const qty = (r.collection_qty || 0).toLocaleString();
                    html += `<div class="rounded-md border border-slate-100 bg-slate-50/60 p-1.5 text-[10px] leading-tight">
                                <div class="flex items-center justify-between gap-1 mb-0.5">
                                    <span class="font-black text-blue-700">${time}</span>
                                    <span class="text-[8px] font-black ${nurseryCls} border rounded px-1 py-0.5 uppercase tracking-widest">${nursery}</span>
                                </div>
                                <div class="font-bold text-slate-700 truncate" title="${cust}">${cust}</div>
                                <div class="font-black text-emerald-700">${qty} <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">pcs</span></div>
                             </div>`;
                });
                if (totalQty > 0) {
                    html += `<div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-right pt-1 border-t border-slate-100 mt-1">Total: <span class="text-emerald-700">${totalQty.toLocaleString()}</span></div>`;
                }
            }

            html += `</div></div>`;
        }
        grid.innerHTML = html;
    }

    let _ssmStockLoaded = false;

    function switchSsmTab(tab) {
        const customerPane = document.getElementById('ssm-pane-customer');
        const stockPane    = document.getElementById('ssm-pane-stock');
        const customerBtn  = document.getElementById('ssm-tab-customer');
        const stockBtn     = document.getElementById('ssm-tab-stock');
        const fab          = document.getElementById('alloc-fab');
        const drawer       = document.getElementById('alloc-drawer');

        if (tab === 'stock') {
            customerPane.classList.add('hidden');
            stockPane.classList.remove('hidden');
            customerBtn.classList.remove('active');
            stockBtn.classList.add('active');
            if (fab) fab.classList.remove('hidden-fab');
            if (!_ssmStockLoaded) {
                _ssmStockLoaded = true;
                loadCapacityHeatmap();
            }
        } else {
            stockPane.classList.add('hidden');
            customerPane.classList.remove('hidden');
            stockBtn.classList.remove('active');
            customerBtn.classList.add('active');
            if (fab)    fab.classList.add('hidden-fab');
            if (drawer) drawer.classList.remove('open');
        }
    }

    async function loadAgingReport() {
        const tbody = document.getElementById('aging-rows');
        const meta  = document.getElementById('aging-meta');
        try {
            const todayStr = new Date().toISOString().slice(0,10);
            const { data, error } = await _supabase
                .from('shared_collection_bookings')
                .select('id,customer_name,order_number,al_number,booking_date,start_time,collection_qty,status,nursery_name,plot_name')
                .lt('booking_date', todayStr)
                .not('status', 'in', '("completed","cancelled")')
                .order('booking_date', { ascending: true });
            if (error) throw error;
            renderAgingReport(data || []);
        } catch (e) {
            console.warn('Aging report load error:', e);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Unable to load aging report</td></tr>`;
            meta.textContent = '';
        }
    }

    function renderAgingReport(rows) {
        const tbody = document.getElementById('aging-rows');
        const meta  = document.getElementById('aging-meta');
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-emerald-700"><div class="text-2xl mb-1">✅</div><div class="text-[10px] font-black uppercase tracking-widest">No overdue collections — well done!</div></td></tr>`;
            meta.textContent = '0 overdue';
            return;
        }
        const today = new Date(); today.setHours(0,0,0,0);
        let totalOverdue = 0, totalQty = 0;

        tbody.innerHTML = rows.map(r => {
            const bd = r.booking_date ? new Date(r.booking_date + 'T00:00:00') : null;
            const days = bd ? Math.max(0, Math.floor((today - bd) / 86400000)) : 0;
            totalOverdue += 1; totalQty += (r.collection_qty || 0);
            const pillCls = days <= 7 ? 'warn' : days <= 14 ? 'bad' : 'severe';
            const dateLabel = bd
                ? bd.toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' }) + (r.start_time ? ' · ' + (r.start_time||'').substring(0,5) : '')
                : '—';
            const statusLabel = (r.status || 'booked').replace(/_/g,' ');
            return `
                <tr>
                    <td><span class="cust-link" data-pickup data-cust="${escapeHtml(r.customer_name || '')}" data-order="${escapeHtml(r.order_number || '')}">${escapeHtml(r.customer_name || '—')}</span></td>
                    <td class="font-mono text-[10px]">${escapeHtml(r.order_number || r.al_number || '—')}</td>
                    <td>${dateLabel}</td>
                    <td class="num"><span class="aging-pill ${pillCls}">${days}d</span></td>
                    <td class="num">${(r.collection_qty || 0).toLocaleString()}</td>
                    <td><span class="pill-status pill-pending">${escapeHtml(statusLabel)}</span></td>
                    <td><a href="operation_collection_booking.html" class="text-[10px] font-black text-blue-700 uppercase tracking-widest hover:underline" style="text-decoration:none;">Open booking →</a></td>
                </tr>`;
        }).join('');

        meta.textContent = totalOverdue + ' overdue · ' + totalQty.toLocaleString() + ' seedlings pending';
    }

    async function openPickupHistory(customerName, orderNumber) {
        const modal = document.getElementById('pickup-modal');
        const title = document.getElementById('pickup-modal-title');
        const sub   = document.getElementById('pickup-modal-sub');
        const summ  = document.getElementById('pickup-summary');
        const wrap  = document.getElementById('pickup-table-wrap');

        title.textContent = customerName || '—';
        sub.textContent   = orderNumber ? 'Order: ' + orderNumber : '';
        summ.innerHTML    = '';
        wrap.innerHTML    = `<div class="text-center py-8 text-[10px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">Loading history…</div>`;
        modal.classList.add('open');

        try {
            const filters = [];
            if (customerName) filters.push('customer_name.eq.' + customerName);
            if (orderNumber)  filters.push('order_number.eq.'  + orderNumber);
            const orFilter = filters.join(',');

            const [bookingsRes, ordersRes] = await Promise.all([
                _supabase.from('shared_collection_bookings').select('*').or(orFilter).order('booking_date', { ascending: false }),
                _supabase.from('salesweb_customer_orders').select('id,order_number,customer_name,total_amount,balance_amount,status,created_at,collected_qty,collected_at').or(orFilter).order('created_at', { ascending: false })
            ]);

            const bookings = bookingsRes.data || [];
            const orders   = ordersRes.data   || [];

            let collections = [];
            try {
                const orderIds = orders.map(o => o.id).filter(Boolean);
                if (orderIds.length) {
                    const { data } = await _supabase
                        .from('salesweb_order_collections')
                        .select('order_id,collected_qty,collected_at,al_number')
                        .in('order_id', orderIds);
                    collections = data || [];
                }
            } catch(e) { collections = []; }

            const totalOrdered    = orders.reduce((s,o)=> s + (o.total_amount || 0), 0);
            const totalCollected  = (collections.length
                ? collections.reduce((s,c)=> s + (c.collected_qty || 0), 0)
                : orders.reduce((s,o)=> s + (o.collected_qty || 0), 0));
            const totalBookings   = bookings.length;
            const fmtRM = n => 'RM ' + (Number(n)||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});

            summ.innerHTML = `
                <div class="ph-summary-card"><div class="ph-label">Total bookings</div><div class="ph-num">${totalBookings}</div></div>
                <div class="ph-summary-card"><div class="ph-label">Seedlings collected</div><div class="ph-num">${totalCollected.toLocaleString()}</div></div>
                <div class="ph-summary-card"><div class="ph-label">Order value (sum)</div><div class="ph-num">${fmtRM(totalOrdered)}</div></div>
            `;

            const events = [];
            bookings.forEach(b => events.push({
                kind: 'booking',
                date: b.booking_date,
                detail: 'Booked ' + (b.start_time||'').substring(0,5) + ' · ' + (b.collection_qty || 0) + ' pcs',
                ref:   b.al_number || b.order_number || '',
                place: [b.nursery_name, b.plot_name].filter(Boolean).join(' / ') || '—',
                status: b.status || 'booked',
            }));
            collections.forEach(c => events.push({
                kind: 'collection',
                date: (c.collected_at || '').slice(0,10),
                detail: 'Collected ' + (c.collected_qty || 0) + ' pcs',
                ref:   c.al_number || '',
                place: '—',
                status: 'collected',
            }));
            events.sort((a,b)=> (b.date || '').localeCompare(a.date || ''));

            if (!events.length) {
                wrap.innerHTML = `<div class="text-center py-8 text-[10px] text-slate-400 font-bold uppercase tracking-widest">No history found for this customer</div>`;
                return;
            }

            wrap.innerHTML = `
                <table class="ph-table">
                    <thead>
                        <tr>
                            <th>Date</th><th>Type</th><th>Detail</th><th>Ref</th><th>Nursery / Plot</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events.map(e => `
                            <tr>
                                <td>${e.date || '—'}</td>
                                <td><span class="pill-status ${e.kind==='collection'?'pill-completed':'pill-paid'}">${e.kind}</span></td>
                                <td>${escapeHtml(e.detail)}</td>
                                <td class="font-mono text-[11px]">${escapeHtml(e.ref || '')}</td>
                                <td>${escapeHtml(e.place || '—')}</td>
                                <td><span class="pill-status pill-paid">${escapeHtml((e.status||'').replace(/_/g,' '))}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
        } catch (e) {
            console.warn('Pickup history error:', e);
            wrap.innerHTML = `<div class="text-center py-8 text-[10px] text-red-500 font-bold uppercase tracking-widest">Unable to load history</div>`;
        }
    }

    function closePickupHistory() {
        document.getElementById('pickup-modal').classList.remove('open');
    }

    document.getElementById('pickup-modal').addEventListener('click', e => {
        if (e.target.id === 'pickup-modal') closePickupHistory();
    });

    document.addEventListener('click', e => {
        const el = e.target.closest('[data-pickup]');
        if (!el) return;
        openPickupHistory(el.dataset.cust || '', el.dataset.order || '');
    });

    async function loadCapacityHeatmap() {
        const area = document.getElementById('heatmap-area');
        try {
            const months = [];
            const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
            for (let i = 0; i < 6; i++) {
                const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
                const next = new Date(start.getFullYear(), start.getMonth() + i + 1, 1);
                months.push({
                    key:   d.toISOString().slice(0,7),
                    label: d.toLocaleString('en-MY', { month:'short', year:'2-digit' }),
                    start: d.toISOString(),
                    end:   next.toISOString(),
                    endDate: next.toISOString().slice(0,10),
                });
            }

            const earliestStart = months[0].start;
            const latestEnd     = months[months.length-1].end;

            const [transRes, plotsRes, bookingsRes] = await Promise.all([
                _supabase.from('shared_inventory_logs')
                    .select('batch_name,plot_name,quantity_change,created_at')
                    .in('transaction_type', ['Transplanted','Transplanted_Premium','Transplanted_DoubleTone']),
                _supabase.from('shared_plots').select('plot_name,nursery_name'),
                _supabase.from('shared_collection_bookings')
                    .select('booking_date,collection_qty,nursery_name,status')
                    .gte('booking_date', earliestStart.slice(0,10))
                    .lt('booking_date',  latestEnd.slice(0,10))
                    .neq('status', 'cancelled'),
            ]);

            const transLogs = transRes.data    || [];
            const plots     = plotsRes.data    || [];
            const bookings  = bookingsRes.data || [];

            const plotToNursery = {};
            plots.forEach(p => { if (p.plot_name) plotToNursery[p.plot_name] = p.nursery_name || 'Unassigned'; });

            const nurserySet = new Set(plots.map(p => p.nursery_name).filter(Boolean));
            bookings.forEach(b => { if (b.nursery_name) nurserySet.add(b.nursery_name); });
            const nurseries = Array.from(nurserySet).sort().slice(0, 6);
            if (!nurseries.length) {
                area.innerHTML = `<div class="text-center py-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest">No nursery data yet</div>`;
                return;
            }

            const groupKey = (b, p) => (b||'') + '||' + (p||'');
            const groups = {};
            transLogs.forEach(l => {
                const k = groupKey(l.batch_name, l.plot_name);
                if (!groups[k]) groups[k] = { qty: 0, firstDate: l.created_at, plot: l.plot_name };
                groups[k].qty += (l.quantity_change || 0);
                if (l.created_at < groups[k].firstDate) groups[k].firstDate = l.created_at;
            });

            const matured = {};
            Object.values(groups).forEach(g => {
                const tDate = new Date(g.firstDate);
                const matureDate = new Date(tDate); matureDate.setMonth(matureDate.getMonth() + 9);
                const mKey = matureDate.toISOString().slice(0,7);
                const nursery  = plotToNursery[g.plot] || 'Unassigned';
                if (!nurseries.includes(nursery)) return;
                const k = mKey + '|' + nursery;
                matured[k] = (matured[k] || 0) + Math.round(g.qty * 0.9);
            });

            const pending = {};
            bookings.forEach(b => {
                if (!b.booking_date) return;
                const mKey = b.booking_date.slice(0,7);
                const nursery  = b.nursery_name || 'Unassigned';
                if (!nurseries.includes(nursery)) return;
                const k = mKey + '|' + nursery;
                pending[k] = (pending[k] || 0) + (b.collection_qty || 0);
            });

            const cols = '120px ' + months.map(()=> 'minmax(80px,1fr)').join(' ');
            let html = `<div class="heat-grid" style="grid-template-columns:${cols};">`;
            html += `<div class="heat-cell h-label">Nursery</div>`;
            months.forEach(m => { html += `<div class="heat-cell h-month-label">${m.label}</div>`; });

            nurseries.forEach(n => {
                html += `<div class="heat-cell h-label">${escapeHtml(n)}</div>`;
                months.forEach(m => {
                    const k = m.key + '|' + n;
                    const mat = matured[k] || 0;
                    const pen = pending[k] || 0;
                    if (!mat && !pen) {
                        html += `<div class="heat-cell heat-na" title="No matured stock or bookings"><span class="h-pct">—</span><span class="h-meta">no data</span></div>`;
                        return;
                    }
                    const pct = mat > 0 ? Math.round((pen / mat) * 100) : (pen > 0 ? 999 : 0);
                    let bucket = 'heat-0';
                    if (pct > 100)      bucket = 'heat-5';
                    else if (pct >= 80) bucket = 'heat-4';
                    else if (pct >= 60) bucket = 'heat-3';
                    else if (pct >= 40) bucket = 'heat-2';
                    else if (pct >= 20) bucket = 'heat-1';
                    const pctLabel = pct > 100 ? 'OVER' : pct + '%';
                    html += `<div class="heat-cell ${bucket}" title="Matured ${mat.toLocaleString()} · Pending ${pen.toLocaleString()}"><span class="h-pct">${pctLabel}</span><span class="h-meta">${pen.toLocaleString()} / ${mat.toLocaleString()}</span></div>`;
                });
            });

            html += `<div class="heat-cell h-label" style="background:#f1f5f9;font-weight:900;color:#0f172a;">📦 Total Matured</div>`;
            months.forEach(m => {
                let totMat = 0, totPen = 0;
                nurseries.forEach(n => {
                    const k = m.key + '|' + n;
                    totMat += matured[k] || 0;
                    totPen += pending[k] || 0;
                });
                if (!totMat && !totPen) {
                    html += `<div class="heat-cell heat-na" style="background:#f8fafc;border-top:2px solid #cbd5e1;"><span class="h-pct">—</span><span class="h-meta">no data</span></div>`;
                    return;
                }
                html += `<div class="heat-cell" style="background:#0f172a;color:white;border-top:2px solid #cbd5e1;justify-content:center;align-items:center;display:flex;flex-direction:column;" title="Month total matured ${totMat.toLocaleString()} · Pending ${totPen.toLocaleString()}">
                    <span class="h-pct" style="color:#bae6fd;font-size:13px;">${totMat.toLocaleString()}</span>
                    <span class="h-meta" style="color:#94a3b8;">matured · pending ${totPen.toLocaleString()}</span>
                </div>`;
            });

            html += `</div>`;
            area.innerHTML = html;
        } catch (e) {
            console.warn('Heatmap error:', e);
            area.innerHTML = `<div class="text-center py-6 text-[10px] text-red-500 font-bold uppercase tracking-widest">Unable to load capacity heatmap</div>`;
        }
    }

    let batchAllocations = [];
    let _allocTab = 'active';
    let _allocBcaTableExists = true;
    let _draggingOrder = null;

    async function loadBatchAllocations() {
        try {
            const { data, error } = await _supabase
                .from('shared_batch_customer_allocations')
                .select('*');
            if (error) throw error;
            batchAllocations = data || [];
            _allocBcaTableExists = true;
        } catch (e) {
            console.warn('[BCA] table missing or read failed — drag-drop will not persist:', e?.message || e);
            batchAllocations = [];
            _allocBcaTableExists = false;
        }
    }

    function allocsForBatch(batchKey) {
        const [b, p] = batchKey.split('||');
        return batchAllocations.filter(a => a.batch_name === b && a.plot_name === p);
    }

    function allocsForOrder(orderId) {
        if (!orderId) return [];
        return batchAllocations.filter(a => a.order_id === orderId);
    }

    function orderUnallocatedQty(o) {
        const allocated = allocsForOrder(o.id).reduce((s, a) => s + (a.allocated_qty || 0), 0);
        return Math.max(0, (o.totalQty || 0) - (o.totalCollected || 0) - allocated);
    }

    function isPastMonthOrder(o) {
        if (!o.orderDate) return false;
        const now = new Date();
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return o.orderDate < firstOfThisMonth;
    }

    function isAllocatableStatus(o) {
        return o.rawStatus !== 'Cancelled' && o.rawStatus !== 'Pending Payment';
    }

    let _allocSearch = '';

    function toggleAllocDrawer() {
        const drawer = document.getElementById('alloc-drawer');
        drawer.classList.toggle('open');
        if (drawer.classList.contains('open')) renderAllocDrawer();
    }

    function switchAllocTab(tab) {
        _allocTab = tab;
        document.getElementById('alloc-tab-active').classList.toggle('active', tab === 'active');
        document.getElementById('alloc-tab-past').classList.toggle('active', tab === 'past');
        renderAllocDrawer();
    }

    function setAllocSearch(value) {
        _allocSearch = (value || '').toLowerCase().trim();
        const clear = document.getElementById('alloc-search-clear');
        if (clear) clear.classList.toggle('hidden', !_allocSearch);
        renderAllocDrawer();
    }

    function clearAllocSearch() {
        const input = document.getElementById('alloc-search');
        if (input) input.value = '';
        setAllocSearch('');
    }

    function matchesAllocSearch(o) {
        if (!_allocSearch) return true;
        const c = (o.customer || '').toLowerCase();
        const n = (o.orderNumber || '').toString().toLowerCase();
        return c.includes(_allocSearch) || n.includes(_allocSearch);
    }

    function renderAllocDrawer() {
        const body = document.getElementById('alloc-drawer-body');
        if (!allCustomerOrders.length) {
            body.innerHTML = `<div class="alloc-drawer-empty">No customer orders yet</div>`;
            updateAllocCounts(0, 0);
            return;
        }

        const eligible = allCustomerOrders.filter(isAllocatableStatus);
        const active = eligible.filter(o => !isPastMonthOrder(o) && orderUnallocatedQty(o) > 0);
        const past   = eligible.filter(o =>  isPastMonthOrder(o) && o.balance > 0);

        updateAllocCounts(active.length, past.length);

        const baseList = _allocTab === 'active' ? active : past;
        const showList = baseList.filter(matchesAllocSearch);

        if (!showList.length) {
            let msg;
            if (_allocSearch && baseList.length) {
                msg = `🔎 No orders match "${_allocSearch}"`;
            } else {
                msg = _allocTab === 'active'
                    ? '✅ All current orders are fully allocated'
                    : '✅ No past-month uncollected orders';
            }
            body.innerHTML = `<div class="alloc-drawer-empty">${msg}</div>`;
            return;
        }

        body.innerHTML = showList.map(o => orderCardHtml(o, _allocTab)).join('');

        if (_allocTab === 'active') {
            body.querySelectorAll('.order-card[draggable="true"]').forEach(el => {
                el.addEventListener('dragstart', onCardDragStart);
                el.addEventListener('dragend',   onCardDragEnd);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('alloc-search');
        const clear = document.getElementById('alloc-search-clear');
        if (input) input.addEventListener('input', (e) => setAllocSearch(e.target.value));
        if (clear) clear.addEventListener('click', clearAllocSearch);
        setupAllocDrawerDrag();
    });

    function setupAllocDrawerDrag() {
        const drawer = document.getElementById('alloc-drawer');
        if (!drawer) return;
        const handle = drawer.querySelector('.alloc-drawer-head');
        if (!handle) return;

        try {
            const saved = JSON.parse(localStorage.getItem('mjm_alloc_drawer_pos') || 'null');
            if (saved) {
                if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
                    drawer.style.width  = saved.width  + 'px';
                    drawer.style.height = saved.height + 'px';
                }
                if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
                    applyDrawerPos(saved.left, saved.top);
                }
            }
        } catch (e) { }

        const resizeHandle = drawer.querySelector('#alloc-resize-handle');
        if (resizeHandle) {
            let resizing = false, rsX = 0, rsY = 0, rsW = 0, rsH = 0, rsPid = null;
            resizeHandle.addEventListener('pointerdown', (e) => {
                resizing = true; rsPid = e.pointerId;
                try { resizeHandle.setPointerCapture(rsPid); } catch (err) { }
                const rect = drawer.getBoundingClientRect();
                rsX = e.clientX; rsY = e.clientY; rsW = rect.width; rsH = rect.height;
                e.preventDefault(); e.stopPropagation();
            });
            resizeHandle.addEventListener('pointermove', (e) => {
                if (!resizing) return;
                const minW = 300, minH = 280;
                const maxW = window.innerWidth  - drawer.getBoundingClientRect().left - 8;
                const maxH = window.innerHeight - drawer.getBoundingClientRect().top  - 8;
                const newW = Math.max(minW, Math.min(maxW, rsW + (e.clientX - rsX)));
                const newH = Math.max(minH, Math.min(maxH, rsH + (e.clientY - rsY)));
                drawer.style.width  = newW + 'px';
                drawer.style.height = newH + 'px';
            });
            const endResize = () => {
                if (!resizing) return;
                resizing = false;
                try { resizeHandle.releasePointerCapture(rsPid); } catch (err) { }
                const rect = drawer.getBoundingClientRect();
                try {
                    const prev = JSON.parse(localStorage.getItem('mjm_alloc_drawer_pos') || '{}');
                    localStorage.setItem('mjm_alloc_drawer_pos',
                        JSON.stringify({ ...prev, left: rect.left, top: rect.top, width: rect.width, height: rect.height }));
                } catch (e) { }
            };
            resizeHandle.addEventListener('pointerup',     endResize);
            resizeHandle.addEventListener('pointercancel', endResize);
        }

        function applyDrawerPos(left, top) {
            const rect = drawer.getBoundingClientRect();
            const w = rect.width  || 380;
            const h = rect.height || 400;
            const maxLeft = Math.max(0, window.innerWidth  - w - 4);
            const maxTop  = Math.max(0, window.innerHeight - h - 4);
            const clampedLeft = Math.min(Math.max(0, left), maxLeft);
            const clampedTop  = Math.min(Math.max(0, top),  maxTop);
            drawer.style.left  = clampedLeft + 'px';
            drawer.style.top   = clampedTop  + 'px';
            drawer.style.right = 'auto';
        }

        let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0, pid = null;

        handle.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button, input, select, textarea, a')) return;
            dragging = true;
            pid = e.pointerId;
            try { handle.setPointerCapture(pid); } catch (err) { }
            const rect = drawer.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY;
            origLeft = rect.left; origTop = rect.top;
            drawer.style.left  = origLeft + 'px';
            drawer.style.top   = origTop  + 'px';
            drawer.style.right = 'auto';
            e.preventDefault();
        });

        handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            applyDrawerPos(origLeft + (e.clientX - startX), origTop + (e.clientY - startY));
        });

        function endDrag() {
            if (!dragging) return;
            dragging = false;
            try { handle.releasePointerCapture(pid); } catch (err) { }
            const rect = drawer.getBoundingClientRect();
            try {
                const prev = JSON.parse(localStorage.getItem('mjm_alloc_drawer_pos') || '{}');
                localStorage.setItem('mjm_alloc_drawer_pos',
                    JSON.stringify({ ...prev, left: rect.left, top: rect.top, width: rect.width, height: rect.height }));
            } catch (e) { }
        }
        handle.addEventListener('pointerup',     endDrag);
        handle.addEventListener('pointercancel', endDrag);

        window.addEventListener('resize', () => {
            if (!drawer.classList.contains('open')) return;
            const rect = drawer.getBoundingClientRect();
            applyDrawerPos(rect.left, rect.top);
        });
    }

    function updateAllocCounts(active, past) {
        document.getElementById('alloc-count-active').textContent = active;
        document.getElementById('alloc-count-past').textContent   = past;
        const fab   = document.getElementById('alloc-fab');
        const badge = document.getElementById('alloc-fab-badge');
        badge.textContent = active;
    }

    function orderCardHtml(o, tab) {
        const remaining   = orderUnallocatedQty(o);
        const allocated   = allocsForOrder(o.id).reduce((s, a) => s + (a.allocated_qty || 0), 0);
        const total       = o.totalQty || 0;
        const collected   = o.totalCollected || 0;
        const pctAlloc    = total ? Math.min(100, ((allocated + collected) / total) * 100) : 0;
        const fullyAlloc  = remaining === 0 && tab === 'active';
        const dateLabel   = o.orderDate ? o.orderDate.toLocaleDateString('en-MY', { day:'2-digit', month:'short' }) : '—';
        const dragAttrs   = (tab === 'active' && remaining > 0)
            ? `draggable="true" data-order-id="${escapeHtml(o.id || '')}"`
            : '';
        const cls = (tab === 'past') ? 'order-card past-due' : (fullyAlloc ? 'order-card fully-allocated' : 'order-card');
        const grip = (tab === 'active' && remaining > 0) ? '<span class="order-card-grip">⋮⋮</span>' : '';

        let qtyDisplay, qtySubLabel;
        if (tab === 'past') {
            qtyDisplay = (o.balance || 0).toLocaleString();
            qtySubLabel = 'pcs uncollected · ordered ' + dateLabel;
        } else if (fullyAlloc) {
            qtyDisplay = '✓';
            qtySubLabel = 'fully allocated · ' + total.toLocaleString() + ' pcs';
        } else {
            qtyDisplay = remaining.toLocaleString();
            qtySubLabel = 'pcs to allocate · of ' + total.toLocaleString();
        }

        const remarkHtml = (tab === 'past')
            ? `<div class="order-card-remark">⏳ Customer not yet collected — follow up reminder only</div>`
            : '';

        return `
            <div class="${cls}" ${dragAttrs}>
                ${grip}
                <div class="order-card-name">${escapeHtml(o.customer || '—')}</div>
                <div class="order-card-meta">${escapeHtml(o.orderNumber || '')} · ${dateLabel}</div>
                <div class="order-card-qty-row">
                    <span class="order-card-qty-big">${qtyDisplay}</span>
                    <span class="order-card-qty-sub">${qtySubLabel}</span>
                </div>
                <div class="order-card-progress"><div class="order-card-progress-bar${pctAlloc >= 100 ? ' full' : ''}" style="width:${pctAlloc}%;"></div></div>
                ${remarkHtml}
            </div>`;
    }

    let _draggingAlloc = null;

    function onCardDragStart(e) {
        const orderId = e.currentTarget.dataset.orderId;
        const order = allCustomerOrders.find(o => o.id === orderId);
        if (!order) return;
        _draggingOrder = {
            orderId,
            customer:    order.customer || '',
            orderNumber: order.orderNumber || '',
            remaining:   orderUnallocatedQty(order),
        };
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        try { e.dataTransfer.setData('text/plain', orderId); } catch(_) {}

        document.querySelectorAll('#maturity-rows tr[data-batch-key]').forEach(tr => {
            const balance = parseInt(tr.dataset.batchBalance || '0', 10);
            if (balance > 0) tr.classList.add('drop-target');
            else             tr.classList.add('drop-disabled');
        });
    }

    function onCardDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        _draggingOrder = null;
        document.querySelectorAll('#maturity-rows tr').forEach(tr => {
            tr.classList.remove('drop-target', 'drop-hover', 'drop-disabled');
        });
    }

    function onChipDragStart(e) {
        if (e.target && e.target.closest && e.target.closest('.reserv-chip-x')) {
            e.preventDefault();
            return;
        }
        const allocId = e.currentTarget.dataset.allocId;
        const alloc = batchAllocations.find(a => a.id === allocId);
        if (!alloc) return;
        _draggingAlloc = {
            id: allocId,
            qty: alloc.allocated_qty || 0,
            sourceBatch: alloc.batch_name || '',
            sourcePlot:  alloc.plot_name  || '',
            customer:    alloc.customer_name || '',
        };
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', 'alloc:' + allocId); } catch(_) {}

        document.querySelectorAll('#maturity-rows tr[data-batch-key]').forEach(tr => {
            const isSource = tr.dataset.batchName === _draggingAlloc.sourceBatch
                          && tr.dataset.plotName  === _draggingAlloc.sourcePlot;
            if (isSource) return;
            const balance = parseInt(tr.dataset.batchBalance || '0', 10);
            if (balance > 0) tr.classList.add('drop-target');
            else             tr.classList.add('drop-disabled');
        });
    }

    function onChipDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        _draggingAlloc = null;
        document.querySelectorAll('#maturity-rows tr').forEach(tr => {
            tr.classList.remove('drop-target', 'drop-hover', 'drop-disabled');
        });
    }

    function onRowDragOver(e) {
        if (!_draggingOrder && !_draggingAlloc) return;
        const tr = e.currentTarget;
        if (_draggingAlloc) {
            const isSource = tr.dataset.batchName === _draggingAlloc.sourceBatch
                          && tr.dataset.plotName  === _draggingAlloc.sourcePlot;
            if (isSource) return;
        }
        const balance = parseInt(tr.dataset.batchBalance || '0', 10);
        if (balance <= 0) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = _draggingAlloc ? 'move' : 'copy';
        tr.classList.add('drop-hover');
    }
    function onRowDragLeave(e) { e.currentTarget.classList.remove('drop-hover'); }

    async function onRowDrop(e) {
        if (!_draggingOrder && !_draggingAlloc) return;
        e.preventDefault();
        const tr = e.currentTarget;
        tr.classList.remove('drop-hover');
        const balance   = parseInt(tr.dataset.batchBalance || '0', 10);
        const batchName = tr.dataset.batchName || '';
        const plotName  = tr.dataset.plotName  || '';
        if (balance <= 0) return;

        if (_draggingAlloc) {
            const isSource = batchName === _draggingAlloc.sourceBatch && plotName === _draggingAlloc.sourcePlot;
            if (isSource) return;
            const newQty = Math.min(balance, _draggingAlloc.qty);
            if (newQty <= 0) return;
            await moveAllocationToBatch(_draggingAlloc.id, batchName, plotName, newQty);
            return;
        }

        const { orderId, customer, orderNumber, remaining } = _draggingOrder;
        const allocQty = Math.min(balance, remaining);
        if (allocQty <= 0) return;

        await allocateOrderToBatch({
            orderId, customer, orderNumber,
            batchName, plotName, qty: allocQty,
        });
    }

    async function moveAllocationToBatch(allocId, batchName, plotName, qty) {
        const idx = batchAllocations.findIndex(a => a.id === allocId);
        if (idx === -1) return;
        const orig = batchAllocations[idx];
        const updated = { ...orig, batch_name: batchName, plot_name: plotName, allocated_qty: qty, updated_at: new Date().toISOString() };
        batchAllocations[idx] = updated;

        if (_allocBcaTableExists && !String(allocId).startsWith('local-')) {
            try {
                const { error } = await _supabase
                    .from('shared_batch_customer_allocations')
                    .update({ batch_name: batchName, plot_name: plotName, allocated_qty: qty, updated_at: updated.updated_at })
                    .eq('id', allocId);
                if (error) throw error;
            } catch (err) {
                console.warn('[BCA] move failed — restoring local state:', err?.message || err);
                batchAllocations[idx] = orig;
            }
        }
        renderMaturityTable();
        renderAllocDrawer();
    }

    async function allocateOrderToBatch({ orderId, customer, orderNumber, batchName, plotName, qty }) {
        const payload = {
            batch_name:    batchName,
            plot_name:     plotName,
            order_id:      orderId || null,
            order_number:  orderNumber || null,
            customer_name: customer || '—',
            allocated_qty: qty,
            updated_at:    new Date().toISOString(),
        };

        let saved = null;
        if (_allocBcaTableExists) {
            try {
                const { data, error } = await _supabase
                    .from('shared_batch_customer_allocations')
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                saved = data;
            } catch (e) {
                console.warn('[BCA] insert failed (table may not exist):', e?.message || e);
                _allocBcaTableExists = false;
            }
        }
        if (!saved) saved = { id: 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2), ...payload };
        batchAllocations.push(saved);

        renderMaturityTable();
        renderAllocDrawer();
    }

    async function removeAllocation(allocId) {
        const idx = batchAllocations.findIndex(a => a.id === allocId);
        if (idx === -1) return;
        const removed = batchAllocations[idx];
        batchAllocations.splice(idx, 1);

        if (_allocBcaTableExists && !String(allocId).startsWith('local-')) {
            try {
                const { error } = await _supabase
                    .from('shared_batch_customer_allocations')
                    .delete()
                    .eq('id', allocId);
                if (error) throw error;
            } catch (e) {
                console.warn('[BCA] delete failed — restoring local state:', e?.message || e);
                batchAllocations.splice(idx, 0, removed);
            }
        }
        renderMaturityTable();
        renderAllocDrawer();
    }

    window.removeAllocation = removeAllocation;

    document.getElementById('gearing-slider').addEventListener('input', updateGearing);
    _supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) { window.location.href = 'operation_dashboard.html'; return; }
        loadNsd();
        loadTodoList();
        loadMaturity();
        loadCustomerOrders().then(() => renderAllocDrawer());
        loadScheduledCollection();
        loadAgingReport();
        loadBatchAllocations().then(() => { renderMaturityTable(); renderAllocDrawer(); });
    });
