/* Monthly Night Watchman Record: the Mata Malam report, moved off the phone.

   The office: "把Mata Malam的report整个搬去 Nursery Operation Management,
   Nursery Work & Schedule, Monthly Night Watchman Record". The report was a
   screen of the Mata Malam app (generateReport / dailyWork in MataMalam
   app.js). It is here now and the app no longer carries it.

   ONE ROW PER NIGHT for the nursery picked at the top of the page, in the
   month picked there. The rules are the app own, copied, so the two never
   say different things about one night:
   - the night is the SHIFT day (it runs past midnight, so a check-in at 3am
     belongs to the day before);
   - a check-in TIME is done when EVERY pin of the location was checked in at
     it (a record naming no pin answers every pin, logCoversPoint);
   - a night is Completed when every time is done, In Progress while a time
     is still open, Not Completed once the last window has closed short;
   - the times, the pins and the window are what System Setting > Mata Malam
     holds NOW, so a time added today is asked of last week too;
   - a night before the first check-in anybody ever made is not a missed
     night, so the list starts there.

   Read-only. It reads mata_malam_settings and mata_malam_logs as the signed
   in staff account (shared/RUN_ME_mata_malam_report_in_office.sql lets staff
   read the logs) and writes nothing. */
(function () {
  const DEFAULT_SLOTS = ['18:00', '21:00', '00:00', '03:00', '06:00'];
  const DEFAULT_TIMING = { opensBeforeMinutes: 15, windowMinutes: 60 };
  const MIN = 60 * 1000;
  let firstLogDate = null;   // the first night anything was recorded, any location
  let drawSeq = 0;
  const T = {
    en: {
      title: 'Monthly Night Watchman Record', print: 'Print',
      date: 'Date', times: 'Check-in Times', done: 'Done', day: 'Night', guards: 'Guards',
      ok: 'Completed', no: 'Not Completed', wait: 'In Progress',
      complete: 'nights complete', none: 'No nights to report.',
      off: 'Mata Malam does not patrol {n}. It is switched off on System Setting > Mata Malam.',
      loading: 'Loading…',
      refused: 'The night watchman records could not be read. Run shared/RUN_ME_mata_malam_report_in_office.sql in Supabase.',
      failed: 'The night watchman records could not be read just now. Try again in a moment.'
    },
    bm: {
      title: 'Rekod Jaga Malam Bulanan', print: 'Cetak',
      date: 'Tarikh', times: 'Masa Daftar Masuk', done: 'Selesai', day: 'Malam', guards: 'Pengawal',
      ok: 'Lengkap', no: 'Tidak Lengkap', wait: 'Sedang Berjalan',
      complete: 'malam lengkap', none: 'Tiada malam untuk dilaporkan.',
      off: 'Mata Malam tidak meronda {n}. Ia dimatikan di System Setting > Mata Malam.',
      loading: 'Memuatkan…',
      refused: 'Rekod jaga malam tidak dapat dibaca. Jalankan shared/RUN_ME_mata_malam_report_in_office.sql di Supabase.',
      failed: 'Rekod jaga malam tidak dapat dibaca sekarang. Cuba lagi sebentar lagi.'
    }
  };
  const L = (k, vars) => {
    const lang = (typeof currentLang !== 'undefined' && currentLang === 'bm') ? 'bm' : 'en';
    let s = T[lang][k] || T.en[k] || k;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, x) => (vars[x] == null ? m : String(vars[x])));
    return s;
  };
  const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const code = name => String(name || '').replace(/\s+/g, '').toUpperCase();
  const isMain = c => /^(BNN|UNN)\d*$/.test(c);

  /* ---- the app own rules (MataMalam app.js), copied ---- */
  function shiftDate(now) {
    const d = new Date(now.getTime() - 12 * 60 * MIN);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const offsetOf = (h, m) => (h < 12 ? h + 24 : h) * 60 + m;
  function slotLabel(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const suf = h < 12 ? 'am' : 'pm';
    return m === 0 ? `${h12}${suf}` : `${h12}:${String(m).padStart(2, '0')}${suf}`;
  }
  function parseLabel(label) {
    const mt = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(label || '');
    if (!mt) return NaN;
    return offsetOf((Number(mt[1]) % 12) + (mt[3] === 'pm' ? 12 : 0), Number(mt[2] || 0));
  }
  const isSlotList = v => Array.isArray(v) && v.length > 0 && v.every(s => /^\d{2}:\d{2}$/.test(s));
  function sortSlots(list) {
    const off = s => { const [h, m] = s.split(':').map(Number); return offsetOf(h, m); };
    return [...list].sort((a, b) => off(a) - off(b));
  }
  function clock(label) {
    const off = parseLabel(label);
    if (Number.isNaN(off)) return label;
    return `${String(Math.floor(off / 60) % 24).padStart(2, '0')}:${String(off % 60).padStart(2, '0')}`;
  }
  function windowOf(date, label, timing) {
    const [y, mo, d] = date.split('-').map(Number);
    const at = new Date(y, mo - 1, d, 0, parseLabel(label)).getTime();
    const opens = at - timing.opensBeforeMinutes * MIN;
    return opens + timing.windowMinutes * MIN;
  }
  const covers = (log, point) => !log.point || !point || log.point === point;
  function addDays(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  /* What System Setting > Mata Malam says about one location */
  function planFor(settings, loc) {
    const s = (settings && settings.locations && settings.locations[loc]) || {};
    const active = typeof s.active === 'boolean' ? s.active : isMain(loc);
    const slots = isSlotList(s.slots) ? sortSlots(s.slots) : [...DEFAULT_SLOTS];
    const tm = settings && settings.timing;
    const timing = tm && Number.isFinite(tm.opensBeforeMinutes) && Number.isFinite(tm.windowMinutes)
      ? { opensBeforeMinutes: tm.opensBeforeMinutes, windowMinutes: tm.windowMinutes } : { ...DEFAULT_TIMING };
    const points = [];
    const pins = settings && settings.pins;
    if (Array.isArray(pins)) {
      pins.forEach(p => {
        const name = String((p && p.name) || '').trim();
        if (p && code(p.location) === loc && name && !points.includes(name)) points.push(name);
      });
    } else if (pins && typeof pins === 'object' && pins[loc]) points.push(`${loc} pin`);
    return { active, times: slots.map(slotLabel), timing, points: points.length ? points : [''] };
  }

  /* One location on one night */
  function night(date, loc, plan, logs, now) {
    const mine = logs.filter(l => l.shift_date === date && code(l.location) === loc && l.status !== 'missed');
    const guards = new Set();
    const times = plan.times.map(time => {
      const at = mine.filter(l => l.slot === time);
      const done = plan.points.every(pt => at.some(l => covers(l, pt)));
      at.forEach(l => { if (l.worker_name) guards.add(l.worker_name); });
      const closes = windowOf(date, time, plan.timing);
      return { time, done, state: done ? 'ok' : (now < closes ? 'wait' : 'no') };
    });
    const done = times.filter(t => t.done).length;
    const state = !times.length ? null : (done === times.length ? 'ok' : (times.some(t => t.state === 'wait') ? 'wait' : 'no'));
    return { date, times, done, state, guards: [...guards] };
  }

  function refusedRead(err) {
    const m = String((err && (err.message || err.code)) || '');
    return /permission|policy|row-level|42501/i.test(m);
  }

  async function renderWatchman() {
    const box = document.getElementById('recview-watchman');
    if (!box || !box.classList.contains('active')) return;
    const seq = ++drawSeq;
    const loc = code(typeof getNursery === 'function' ? getNursery() : 'BNN');
    const ym = ((document.getElementById('global-month') || {}).value || '').trim();
    const mm = /^(\d{4})-(\d{2})$/.exec(ym);
    const placeName = (typeof NURSERY_NAMES !== 'undefined' && NURSERY_NAMES[loc]) || loc;
    box.innerHTML = `<div class="wm-wrap"><div class="wm-note">${escH(L('loading'))}</div></div>`;
    if (!mm || typeof _supabase === 'undefined' || !_supabase) return;
    const from = `${mm[1]}-${mm[2]}-01`;
    const to = addDays(addDays(from, 31).slice(0, 8) + '01', -1);

    let settings = {}, logs = [];
    try {
      const [s, l, f] = await Promise.all([
        _supabase.from('mata_malam_settings').select('settings').eq('id', 1).maybeSingle(),
        _supabase.from('mata_malam_logs')
          .select('location, point, shift_date, slot, status, worker_name')
          .gte('shift_date', from).lte('shift_date', to).limit(20000),
        firstLogDate ? Promise.resolve({ data: [{ shift_date: firstLogDate }] })
          : _supabase.from('mata_malam_logs').select('shift_date').order('shift_date', { ascending: true }).limit(1)
      ]);
      if (l.error) throw l.error;
      settings = (s && s.data && s.data.settings) || {};
      logs = l.data || [];
      if (f && !f.error && f.data && f.data[0]) firstLogDate = f.data[0].shift_date;
    } catch (err) {
      if (seq !== drawSeq) return;
      box.innerHTML = `<div class="wm-wrap"><div class="wm-note wm-bad">${escH(refusedRead(err) ? L('refused') : L('failed'))}</div></div>`;
      return;
    }
    if (seq !== drawSeq) return;

    const plan = planFor(settings, loc);
    const now = Date.now();
    const today = shiftDate(new Date(now));
    const rows = [];
    if (plan.active && firstLogDate) {
      const start = firstLogDate > from ? firstLogDate : from;
      // Newest night first: the record opens on what happened last
      for (let d = today < to ? today : to; d >= start; d = addDays(d, -1)) {
        const n = night(d, loc, plan, logs, now);
        if (n.state) rows.push(n);
      }
    }
    const over = rows.filter(r => r.state !== 'wait');
    const ok = over.filter(r => r.state === 'ok').length;

    let body;
    if (!plan.active) body = `<div class="wm-note">${escH(L('off', { n: placeName }))}</div>`;
    else if (!rows.length) body = `<div class="wm-note">${escH(L('none'))}</div>`;
    else {
      body = `<div class="wm-sum"><strong>${escH(loc)}</strong> ${ok} / ${over.length} ${escH(L('complete'))}</div>
      <div class="tbl-wrap"><table class="rec-table wm-table">
        <thead><tr><th>${escH(L('date'))}</th><th>${escH(L('times'))}</th><th class="wm-c">${escH(L('done'))}</th><th class="wm-c">${escH(L('day'))}</th><th>${escH(L('guards'))}</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="wm-row-${r.state}">
          <td class="wm-date">${escH(r.date)}</td>
          <td><span class="wm-times">${r.times.map(t => `<span class="wm-time ${t.state}">${t.state === 'ok' ? '✓' : (t.state === 'no' ? '✕' : '…')} ${escH(clock(t.time))}</span>`).join('')}</span></td>
          <td class="wm-c">${r.done} / ${r.times.length}</td>
          <td class="wm-c"><span class="wm-day ${r.state}">${escH(L(r.state))}</span></td>
          <td>${escH(r.guards.length ? r.guards.join(', ') : '-')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
    box.innerHTML = `<div class="wm-wrap">
      <div class="wm-head"><div><div class="wm-title">${escH(L('title'))}</div>
        <div class="wm-sub">${escH(placeName)} · ${escH(typeof getMonth === 'function' ? getMonth() : ym)}</div></div>
        ${rows.length ? `<button type="button" class="wm-print" onclick="printWatchman()">${escH(L('print'))}</button>` : ''}
      </div>${body}</div>`;
  }

  /* Printed through a hidden frame of its own, so the sheet is the report and
     not the whole page around it, and no popup blocker can eat it */
  function printWatchman() {
    const wrap = document.querySelector('#recview-watchman .wm-wrap');
    if (!wrap) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escH(L('title'))}</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;color:#1f2a24;margin:16px}
      .wm-print{display:none}.wm-title{font-size:16px;font-weight:700}.wm-sub{color:#555;margin:2px 0 10px}
      .wm-sum{margin:0 0 8px}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f3f2}
      .wm-c{text-align:center}.wm-time{display:inline-block;margin:0 6px 2px 0;white-space:nowrap}
      .wm-time.no,.wm-day.no{color:#b42318}.wm-time.ok,.wm-day.ok{color:#1b6b3a}
    </style></head><body>${wrap.innerHTML}</body></html>`);
    doc.close();
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {}
      setTimeout(() => frame.remove(), 60000);
    }, 200);
  }

  window.renderWatchman = renderWatchman;
  window.printWatchman = printWatchman;
  window.MJMWatchman = { planFor, night, shiftDate };
})();
