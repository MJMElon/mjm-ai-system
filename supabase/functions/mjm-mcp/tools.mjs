// supabase/functions/mjm-mcp/tools.mjs
//
// The four things the boss's AI agent may do in the MJM AI System, and
// nothing else. index.ts speaks MCP; this file does the work, so the tests
// can drive it with a fake database (tests/the_mcp_reads_the_dashboard.cjs).
//
//   check_stock        the Stock Analysis Dashboard's figures, off the
//                      SAME rule the page reads (_shared/stock_analysis.js)
//   list_products      the published Sales Web products and their prices,
//                      which is what the Quotation page offers
//   create_quotation   a DRAFT quotation in shared_quotations, numbered the
//                      way the Quotation page numbers them (QOPS<n>/MM/YY)
//   find_quotations    look a quotation up again
//   confirm_order      mark a quotation ACCEPTED. It creates no Sales Web
//                      order and no AL: the office does that, as today.
//
// It writes to ONE table, shared_quotations, and never deletes anything.

import "../_shared/stock_analysis.js";

const SA = globalThis.MJMStockAnalysis;
const MY_OFFSET_MS = 8 * 3600 * 1000;           // Malaysia, UTC+8, no DST
const AGENT_NAME = "AI agent (MCP)";

// A Date whose UTC getters read Malaysian wall-clock time. The Edge runtime
// is UTC, and a month or a quote date worked out in UTC is the day before in
// Malaysia for the first eight hours of every day.
export function myNow(now = new Date()) { return new Date(now.getTime() + MY_OFFSET_MS); }
function myDateIso(now) { return myNow(now).toISOString().slice(0, 10); }
// classify() reads getFullYear/getMonth, which are LOCAL getters; build a
// local Date carrying the Malaysian calendar day so they read it right.
function myLocalDay(now) {
  const d = myNow(now);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}

const fmt = (n) => (Number(n) || 0).toLocaleString("en-MY");
const money = (n) => "RM " + (Number(n) || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// PostgREST stops at 1,000 rows and says nothing; the ledger is far past it.
async function fetchAll(db, table, cols, apply) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols);
    if (apply) q = apply(q);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + 999);
    if (error) {
      // A table with no id column refuses the order; read it whole once.
      if (from === 0 && /id/.test(String(error.message || ""))) return one(db, table, cols, apply);
      return { data: null, error };
    }
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
    if (from > 200000) break;                       // a seatbelt, never reached
  }
  return { data: out, error: null };
}
async function one(db, table, cols, apply) {
  let q = db.from(table).select(cols);
  if (apply) q = apply(q);
  const { data, error } = await q;
  return { data: error ? null : (data || []), error };
}
function must(res, what) {
  if (res.error) throw new Error("Could not read " + what + ": " + (res.error.message || res.error));
  return res.data || [];
}
const logs = (db, type, cols) => fetchAll(db, "shared_inventory_logs", cols, (q) => q.eq("transaction_type", type));

// ── check_stock ──────────────────────────────────────────────────────────
export async function checkStock(db, args = {}, now = new Date()) {
  const LOGCOLS = "batch_name,plot_name,breed_name,quantity_change,created_at,transaction_date,remark";
  const [trans, xfer, cull3, seeds, rowVer, tabVer, plots, allocs, dos, heightsRaw,
         orders, items, colls, als, excl] = await Promise.all([
    logs(db, "Transplanted", LOGCOLS),
    logs(db, "Cull3_Transfer", LOGCOLS),
    logs(db, "3rd_Culling", "batch_name,plot_name,quantity_change,remark"),
    logs(db, "Seeds_Received", "batch_name,breed_name,transaction_date,created_at"),
    logs(db, "Row_Verification", "batch_name,plot_name"),
    one(db, "operation_batch_verifications", "batch_name,stage"),
    one(db, "shared_plots", "plot_name,nursery_name"),
    one(db, "shared_plot_allocations", "batch_name,plot_name,plot_status"),
    fetchAll(db, "shared_do_records", "do_number,al_number,delivery_date,total_qty,status,remark,plot_1,qty_1,batch_1,plot_2,qty_2,batch_2,plot_3,qty_3,batch_3,plot_4,qty_4,batch_4,plot_5,qty_5,batch_5"),
    fetchAll(db, "audit_height_records", "plot,batch,sample_1,sample_2,sample_3,date"),
    fetchAll(db, "salesweb_customer_orders", "id,order_number,customer_name,billing_name,total,status,created_at,payment_terms,collected_qty,collected_at"),
    fetchAll(db, "salesweb_order_items", "order_id,quantity"),
    fetchAll(db, "salesweb_order_collections", "order_id,collected_qty,collected_at"),
    fetchAll(db, "shared_al_orders", "al_number,order_number,quantity_ordered,balance_quantity,status,remark"),
    one(db, "operation_stock_analysis_excluded", "order_key"),
  ]);
  const notes = [];
  const rows = SA.buildStockRows({
    transplants: must(trans, "the transplant ledger"),
    transfers: must(xfer, "the transfers"),
    cull3: cull3.data || [],
    seeds: seeds.data || [],
    rowVer: rowVer.error ? null : rowVer.data,       // null waives the gate, as the page does
    tabVer: tabVer.data || [],
    plots: plots.data || [],
    allocations: allocs.data || [],
    dos: dos.data || [],
  });
  if (heightsRaw.error) notes.push("Seedling heights could not be read, so nothing is counted as reached 1.5 m.");
  const day = myLocalDay(now);
  const c = SA.classify(rows, { now: day, heights: SA.latestHeights(heightsRaw.data || []) });

  const ordersAll = SA.orderBalances({
    orders: must(orders, "the customer orders"), items: items.data || [],
    collections: colls.data || [], alRows: als.data || [],
    dos: (dos.data || []).filter((d) => String(d.status || "").toLowerCase() !== "cancelled"),
  });
  const ex = {};
  if (excl.error) notes.push("The list of orders the office unticked could not be read, so every order is counted.");
  else (excl.data || []).forEach((r) => { if (r.order_key) ex[r.order_key] = 1; });
  const open = SA.openOrders(ordersAll, ex);
  const openAll = SA.openOrders(ordersAll, {});
  const actual = open.reduce((s, o) => s + (Number(o.balance) || 0), 0);

  const want = String(args.breed || "").trim().toLowerCase();
  const pick = (r) => !want || String(r.breed || "").toLowerCase().includes(want);
  const availRows = c.avail.filter(pick);
  const byBreed = {};
  availRows.forEach((r) => {
    const b = byBreed[r.breed] || (byBreed[r.breed] = { breed: r.breed, available: 0, matured: 0, reached_1_5m: 0, plots: 0 });
    b.available += r.balance; b.plots++;
    if (r.why === "matured") b.matured += r.balance; else b.reached_1_5m += r.balance;
  });
  const breeds = Object.values(byBreed).sort((a, b) => b.available - a.available);
  const available = availRows.reduce((s, r) => s + r.balance, 0);
  const nextNew = c.nextMature.filter(pick).reduce((s, r) => s + r.balance, 0);
  const asOf = myDateIso(now);

  const result = {
    as_of: asOf,
    breed_filter: args.breed || null,
    available_stock: available,
    matured: availRows.filter((r) => r.why === "matured").reduce((s, r) => s + r.balance, 0),
    reached_1_5m: availRows.filter((r) => r.why === "tall").reduce((s, r) => s + r.balance, 0),
    maturing_next_month: nextNew,
    by_breed: breeds,
    actual_order_balance: actual,
    open_orders: open.length,
    orders_unticked_by_office: openAll.length - open.length,
    available_minus_actual_order: c.available - actual,
    notes,
  };
  const lines = [
    `Stock as at ${asOf}${args.breed ? " (breed matching \"" + args.breed + "\")" : ""}:`,
    `- Available stock: ${fmt(available)} seedlings (10 months & above ${fmt(result.matured)} + 1.5 m & above ${fmt(result.reached_1_5m)})`,
    `- Turning 10 months next month: ${fmt(nextNew)}`,
    ...breeds.map((b) => `  · ${b.breed}: ${fmt(b.available)} over ${b.plots} plot${b.plots === 1 ? "" : "s"}`),
    `- Actual order still to deliver (all breeds): ${fmt(actual)} over ${open.length} order${open.length === 1 ? "" : "s"}` +
      (result.orders_unticked_by_office ? ` (${result.orders_unticked_by_office} unticked by the office, not counted)` : ""),
    `- Available minus actual order (all breeds): ${c.available - actual >= 0 ? "+" : ""}${fmt(c.available - actual)}`,
    ...notes.map((n) => "Note: " + n),
    "Figures are the Stock Analysis Dashboard's: Plot Balance (after 10% culling, less DOs) of plots whose seedlings are 10 months old or more (from the seed-in date) or measured at 1.5 m or more.",
  ];
  return { text: lines.join("\n"), data: result };
}

// ── list_products ────────────────────────────────────────────────────────
export async function listProducts(db) {
  const res = await one(db, "salesweb_products", "id,name,price,sell_month,sell_year,stock_qty",
    (q) => q.eq("is_published", true).order("name", { ascending: true }));
  const list = must(res, "the Sales Web products").map((p) => ({
    product_id: p.id, name: p.name, price: Number(p.price) || 0,
    sell_month: p.sell_month || null, sell_year: p.sell_year || null, stock_qty: p.stock_qty ?? null,
  }));
  const text = list.length
    ? "Published Sales Web products:\n" + list.map((p) => `- ${p.name} — ${money(p.price)} per seedling` +
        (p.sell_month ? ` · ${p.sell_month} ${p.sell_year || ""}`.trimEnd() : "") + ` (product_id ${p.product_id})`).join("\n")
    : "No products are published on the Sales Web. A quotation can still be made with a description and a unit price.";
  return { text, data: { products: list } };
}

// ── create_quotation ─────────────────────────────────────────────────────
async function nextQuoteNumber(db, now) {
  const res = await one(db, "shared_quotations", "quote_number", (q) => q.ilike("quote_number", "QOPS%").limit(5000));
  let max = 0;
  (res.data || []).forEach((r) => {
    const m = /^QOPS(\d+)\//i.exec(r.quote_number || "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  const d = myNow(now);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return { n: max + 1, mm, yy, text: (n) => "QOPS" + String(n).padStart(3, "0") + "/" + mm + "/" + yy };
}

export async function createQuotation(db, args = {}, now = new Date()) {
  const name = String(args.customer_name || "").trim();
  if (!name) throw new Error("customer_name is required.");
  const reqItems = Array.isArray(args.items) ? args.items : [];
  if (!reqItems.length) throw new Error("At least one item is required.");

  const ids = reqItems.map((i) => i.product_id).filter((x) => x != null && x !== "");
  let products = {};
  if (ids.length) {
    const res = await one(db, "salesweb_products", "id,name,price,is_published", (q) => q.in("id", ids));
    // Only what is published on the Sales Web can be quoted at its price —
    // the Quotation page offers nothing else.
    must(res, "the Sales Web products").forEach((p) => { if (p.is_published) products[String(p.id)] = p; });
  }
  const items = reqItems.map((it, i) => {
    const p = it.product_id != null && it.product_id !== "" ? products[String(it.product_id)] : null;
    if (it.product_id != null && it.product_id !== "" && !p) throw new Error(`Item ${i + 1}: no published product with product_id ${it.product_id}. Use list_products.`);
    const qty = Number(it.qty);
    if (!(qty > 0)) throw new Error(`Item ${i + 1}: qty must be more than 0.`);
    const price = it.unit_price != null && it.unit_price !== "" ? Number(it.unit_price) : (p ? Number(p.price) : NaN);
    if (!(price >= 0)) throw new Error(`Item ${i + 1}: give a unit_price, or a product_id to take the Sales Web price.`);
    const description = String(it.description || (p && p.name) || "").trim();
    if (!description) throw new Error(`Item ${i + 1}: give a description or a product_id.`);
    return { product_id: p ? p.id : null, description, details: String(it.details || ""),
      qty, unit: String(it.unit || "Palm"), unit_price: price, line_total: qty * price };
  });
  const subtotal = items.reduce((s, it) => s + it.line_total, 0);
  const row = {
    quote_date: myDateIso(now),
    valid_until: args.valid_until || null,
    customer_name: name,
    customer_company: args.customer_company || null,
    customer_contact: args.customer_contact || null,
    customer_email: args.customer_email || null,
    customer_address: args.customer_address || null,
    items, subtotal, discount: 0, tax_rate: 0, tax_amount: 0, total: subtotal,
    notes: args.notes || null,
    terms: "Cash Only",
    status: "draft",
    created_by: null,
    created_by_name: AGENT_NAME,
  };
  // The number is the Quotation page's own scan-and-add-one, and the column
  // is UNIQUE: somebody saving one on the page at the same moment comes back
  // 23505, so the next number is tried rather than the save being lost.
  const seq = await nextQuoteNumber(db, now);
  let saved = null, lastErr = null;
  for (let k = 0; k < 5 && !saved; k++) {
    row.quote_number = seq.text(seq.n + k);
    const { data, error } = await db.from("shared_quotations").insert(row).select("id,quote_number,total,status").single();
    if (!error) { saved = data; break; }
    lastErr = error;
    if (String(error.code) !== "23505") break;
  }
  if (!saved) throw new Error("The quotation was not saved: " + ((lastErr && lastErr.message) || "unknown error"));
  const text = [
    `Quotation ${saved.quote_number} saved as a DRAFT for ${name}.`,
    ...items.map((it) => `- ${it.description}: ${fmt(it.qty)} ${it.unit} × ${money(it.unit_price)} = ${money(it.line_total)}`),
    `Total: ${money(subtotal)} (Cash Only).`,
    "The office can open it in Seedling Sales Control → Create Quotation to print the PDF. Use confirm_order once the customer accepts it.",
  ].join("\n");
  return { text, data: { id: saved.id, quote_number: saved.quote_number, status: saved.status, total: subtotal, items } };
}

// ── find_quotations ──────────────────────────────────────────────────────
export async function findQuotations(db, args = {}) {
  const lim = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const res = await one(db, "shared_quotations", "id,quote_number,quote_date,customer_name,customer_company,total,status,created_by_name",
    (q) => {
      let x = q;
      if (args.quote_number) x = x.eq("quote_number", String(args.quote_number).trim());
      if (args.customer) x = x.ilike("customer_name", "%" + String(args.customer).trim() + "%");
      if (args.status) x = x.eq("status", String(args.status).trim().toLowerCase());
      return x.order("quote_date", { ascending: false }).order("created_at", { ascending: false }).limit(lim);
    });
  const list = must(res, "the quotations");
  const text = list.length
    ? list.map((q) => `- ${q.quote_number} · ${q.quote_date} · ${q.customer_name}${q.customer_company ? " (" + q.customer_company + ")" : ""} · ${money(q.total)} · ${q.status}`).join("\n")
    : "No quotation matches.";
  return { text, data: { quotations: list } };
}

// ── confirm_order ────────────────────────────────────────────────────────
export async function confirmOrder(db, args = {}, now = new Date()) {
  const num = String(args.quote_number || "").trim();
  if (!num) throw new Error("quote_number is required.");
  const res = await one(db, "shared_quotations", "id,quote_number,customer_name,total,status,notes", (q) => q.eq("quote_number", num));
  const q = must(res, "the quotation")[0];
  if (!q) throw new Error(`No quotation numbered ${num}.`);
  if (q.status === "accepted") return { text: `${num} is already accepted. Nothing changed.`, data: { quote_number: num, status: "accepted", changed: false } };
  if (q.status === "rejected" || q.status === "expired")
    throw new Error(`${num} is ${q.status}, so it cannot be confirmed. Make a new quotation instead.`);
  const stamp = `[Accepted via ${AGENT_NAME} on ${myDateIso(now)}]`;
  const notes = q.notes ? q.notes + "\n" + stamp : stamp;
  // Only while it is still in the state it was read in: a quotation the
  // office changed a moment ago is theirs.
  const { data, error } = await db.from("shared_quotations").update({ status: "accepted", notes })
    .eq("id", q.id).eq("status", q.status).select("quote_number,status");
  if (error) throw new Error("Not confirmed: " + (error.message || error));
  if (!data || !data.length) throw new Error(`${num} changed while this was being confirmed. Look it up again.`);
  return {
    text: `Order confirmed: ${num} for ${q.customer_name} (${money(q.total)}) is now ACCEPTED. The office will raise the Sales Web order and the AL as usual.`,
    data: { quote_number: num, status: "accepted", changed: true },
  };
}

export const TOOLS = [
  {
    name: "check_stock",
    title: "Check seedling stock",
    description: "How many seedlings MJM Nursery has available to sell now, by breed, against the customer orders still to deliver. Same figures as the Stock Analysis Dashboard. Optionally filter by breed name.",
    inputSchema: { type: "object", properties: { breed: { type: "string", description: "Part of a breed name to filter by, e.g. \"Hybrida\". Leave out for all breeds." } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: checkStock,
  },
  {
    name: "list_products",
    title: "List products and prices",
    description: "The products published on the MJM Sales Web with their price per seedling. Use a product_id from here in create_quotation to take its price.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: listProducts,
  },
  {
    name: "create_quotation",
    title: "Create a quotation",
    description: "Save a new DRAFT quotation in the MJM AI System (numbered QOPS…). Each item takes a product_id (price from the Sales Web) or a description and unit_price; a unit_price given overrides the Sales Web price. Check the details with the user before calling.",
    inputSchema: {
      type: "object",
      required: ["customer_name", "items"],
      properties: {
        customer_name: { type: "string" },
        customer_company: { type: "string" },
        customer_contact: { type: "string", description: "Phone number" },
        customer_email: { type: "string" },
        customer_address: { type: "string" },
        valid_until: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
        items: {
          type: "array", minItems: 1,
          items: {
            type: "object", required: ["qty"],
            properties: {
              product_id: { type: ["string", "number"] },
              description: { type: "string" },
              details: { type: "string" },
              qty: { type: "number", description: "Number of seedlings" },
              unit: { type: "string", description: "Default Palm" },
              unit_price: { type: "number", description: "RM per unit" },
            },
          },
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: createQuotation,
  },
  {
    name: "find_quotations",
    title: "Find quotations",
    description: "Look up quotations by number, customer name or status (draft, sent, accepted, rejected, expired). Newest first.",
    inputSchema: { type: "object", properties: { quote_number: { type: "string" }, customer: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: findQuotations,
  },
  {
    name: "confirm_order",
    title: "Confirm an order",
    description: "Confirm the customer has accepted a quotation: marks it ACCEPTED. It does not create the Sales Web order or the AL — the office does that. Confirm with the user before calling.",
    inputSchema: { type: "object", required: ["quote_number"], properties: { quote_number: { type: "string", description: "e.g. QOPS012/11/26" } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: confirmOrder,
  },
];
