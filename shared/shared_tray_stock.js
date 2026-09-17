/* =====================================================================
   WHAT IS STANDING IN EACH TRAY

   One rule, two screens. The batch report uses it to decide how much may
   still be planted into a tray on the form in front of you; the batch
   list's Tray Status tab uses it to show the same trays from the other
   side — how full each one is and whose seedlings are in it.

   It lived inside operation_batch_detail.html's initDetail and was about
   to be copied into operation_batch_record.html. A copied rule is two
   rules the moment somebody fixes one of them, and a tray reading 1,200
   vacant on one page and 2,560 on the other is exactly the kind of thing
   nobody notices until a planting is refused.

   Nothing here touches the network or the DOM: hand it rows, get maps
   back. That is what makes it testable without the database.
   ===================================================================== */
(function (global) {
    'use strict';

    // A tray holds what Settings says it holds. Before that field existed
    // every tray was assumed to be 2,560, so a tray with no size keeps that
    // figure rather than reading as having no room at all.
    const DEFAULT_CAPACITY = 2560;

    function capacityOf(tray) {
        const n = Number(tray && tray.total_vacant);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAPACITY;
    }

    /* Which tray a transplant log LEFT. The destination is plot_name; the
       source is written into the remark when the movement is saved. */
    function sourceTrayOf(log) {
        const m = String((log && log.remark) || '').match(/from tray \[([^\]]+)\]/i);
        return m ? m[1].trim() : '';
    }

    /**
     * compute({ trays, planted, transplanted, cull1 })
     *
     *   trays         operation_trays rows        (tray_name, nursery_name, total_vacant)
     *   planted       Planted logs                (plot_name IS the tray, batch_name, quantity_change)
     *   transplanted  Transplanted / _Premium / _DoubleTone logs, WITH remark
     *   cull1         1st_Culling logs            (plot_name IS the tray)
     *
     * → { capacity, occupied, vacant, usage, byBatch, rows }
     */
    function compute(input) {
        const trays        = (input && input.trays)        || [];
        const planted      = (input && input.planted)      || [];
        const transplanted = (input && input.transplanted) || [];
        const cull1        = (input && input.cull1)        || [];

        /* Which batches have emptied their pre-nursery altogether
           (planted − transplanted − 1st culling ≤ 0). Their trays are free
           for the next batch, whatever the per-tray arithmetic comes to. */
        const plantedByBatch = {}, transplantedByBatch = {}, cull1ByBatch = {};
        planted.forEach(l => {
            plantedByBatch[l.batch_name] = (plantedByBatch[l.batch_name] || 0) + (l.quantity_change || 0);
        });
        transplanted.forEach(l => {
            transplantedByBatch[l.batch_name] = (transplantedByBatch[l.batch_name] || 0) + Math.abs(l.quantity_change || 0);
        });
        cull1.forEach(l => {
            cull1ByBatch[l.batch_name] = (cull1ByBatch[l.batch_name] || 0) + Math.abs(l.quantity_change || 0);
        });
        function batchPnEmptied(b) {
            const p = plantedByBatch[b] || 0;
            if (p <= 0) return false;   // never planted — leave behaviour unchanged
            return p - (transplantedByBatch[b] || 0) - (cull1ByBatch[b] || 0) <= 0;
        }

        // Which batch is holding each tray. A tray whose batch has emptied
        // its pre-nursery is nobody's.
        const usage = {};
        planted.forEach(log => {
            if (batchPnEmptied(log.batch_name)) return;
            usage[log.plot_name] = log.batch_name;
        });

        /* ── What is standing in each tray, counted tray by tray ──
           Every movement names its tray, so none of this is estimated:
             Planted        plot_name IS the tray            → in
             1st_Culling    plot_name IS the tray            → out
             Transplanted*  remark says "from tray [X]"      → out of X,
                            and plot_name is where they went — which for
                            premium care and double-tone is itself a tray,
                            so those receive.
           Transplant a hundred out of P4 and P4 frees exactly a hundred. */
        const trayNames = new Set(trays.map(t => t.tray_name));
        const inTray = {}, outTray = {};
        // …and the same sums kept per batch, so a tray shared by two live
        // batches can say who has what rather than naming only the last one.
        const inByBatch = {}, outByBatch = {};
        const bump = (map, tray, qty) => { if (trayNames.has(tray)) map[tray] = (map[tray] || 0) + qty; };
        const bumpBatch = (map, tray, batch, qty) => {
            if (!trayNames.has(tray) || !batch) return;
            (map[tray] = map[tray] || {})[batch] = (map[tray][batch] || 0) + qty;
        };
        const addIn = (tray, batch, qty) => { bump(inTray, tray, qty);  bumpBatch(inByBatch,  tray, batch, qty); };
        const addOut = (tray, batch, qty) => { bump(outTray, tray, qty); bumpBatch(outByBatch, tray, batch, qty); };

        planted.forEach(l => addIn(l.plot_name, l.batch_name, Math.abs(l.quantity_change || 0)));
        cull1.forEach(l => addOut(l.plot_name, l.batch_name, Math.abs(l.quantity_change || 0)));
        transplanted.forEach(l => {
            const qty = Math.abs(l.quantity_change || 0);
            const src = sourceTrayOf(l);
            if (src) addOut(src, l.batch_name, qty);
            addIn(l.plot_name, l.batch_name, qty);   // only lands if the destination is a tray
        });

        const capacity = {}, occupied = {}, vacant = {}, byBatch = {};
        const rows = [];
        trays.forEach(t => {
            const name = t.tray_name;
            const cap = capacityOf(t);
            capacity[name] = cap;

            const occupier = usage[name];
            let inUse = Math.max(0, (inTray[name] || 0) - (outTray[name] || 0));
            // Safety net for anything logged before the source tray was written
            // into the remark: if no live batch is holding the tray, it is free
            // whatever the per-tray sums come to.
            if (!occupier) inUse = 0;
            inUse = Math.min(cap, inUse);

            // Remembered per batch so that re-opening a batch does not see its
            // OWN seedlings as somebody else's occupancy and refuse the figures
            // already keyed in.
            occupied[name] = { batch: occupier, qty: inUse };
            vacant[name]   = Math.max(0, cap - inUse);

            /* Whose seedlings, batch by batch — for display only. The
               occupancy figure above is what the form obeys, so the split
               is scaled to it rather than allowed to disagree with it. */
            let split = [];
            if (inUse > 0) {
                const ins = inByBatch[name] || {};
                const outs = outByBatch[name] || {};
                split = Object.keys(ins)
                    .map(b => ({ batch: b, qty: Math.max(0, (ins[b] || 0) - (outs[b] || 0)) }))
                    .filter(r => r.qty > 0 && !batchPnEmptied(r.batch))
                    .sort((a, b) => b.qty - a.qty);
                const sum = split.reduce((s, r) => s + r.qty, 0);
                if (!split.length) split = [{ batch: occupier, qty: inUse }];
                else if (sum !== inUse && sum > 0) {
                    // The tray-wide figure is capped and floored; keep the parts
                    // adding up to the whole so a reader can check the row.
                    let left = inUse;
                    split = split.map((r, i) => {
                        const q = i === split.length - 1 ? left : Math.round(r.qty * inUse / sum);
                        left -= q;
                        return { batch: r.batch, qty: Math.max(0, q) };
                    }).filter(r => r.qty > 0);
                }
            }
            byBatch[name] = split;

            rows.push({
                tray: name,
                nursery: t.nursery_name || '',
                capacity: cap,
                occupied: inUse,
                vacant: vacant[name],
                batch: occupier || '',
                batches: split
            });
        });

        rows.sort((a, b) =>
            (a.nursery || '').localeCompare(b.nursery || '')
            || (a.tray || '').localeCompare(b.tray || '', undefined, { numeric: true, sensitivity: 'base' }));

        return { capacity, occupied, vacant, usage, byBatch, rows };
    }

    global.MJMTrayStock = { DEFAULT_CAPACITY, capacityOf, sourceTrayOf, compute };
})(typeof window !== 'undefined' ? window : globalThis);
