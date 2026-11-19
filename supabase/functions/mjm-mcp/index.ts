// supabase/functions/mjm-mcp/index.ts
//
// The MJM AI System as an MCP server, so the boss's AI agent (Claude, as a
// custom connector) can check stock, make a quotation and confirm an order.
// The tools themselves are in tools.mjs; this file only speaks the protocol
// (MCP, Streamable HTTP, JSON responses, no session) and checks the key.
//
// THE LINK IS THE KEY. Claude's custom connector takes a URL and nothing
// else, so the secret rides in the path:
//   https://<project>.supabase.co/functions/v1/mjm-mcp/<MCP_SECRET>
// Anyone holding that link can use these five tools, so keep it private;
// changing MCP_SECRET switches the old link off at once.
//
// Deploy (CLI), from the repository root:
//   supabase secrets set MCP_SECRET=<a long random string>
//   supabase functions deploy mjm-mcp --no-verify-jwt
// --no-verify-jwt is required: Claude sends no Supabase login, and the key
// in the path is what is checked instead. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function by Supabase.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { TOOLS } from "./tools.mjs";

const SECRET = Deno.env.get("MCP_SECRET") || "";
const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
  auth: { persistSession: false },
});
// Tests only: freeze the clock so a month boundary cannot move the figures.
const TEST_NOW = Deno.env.get("MJM_MCP_TEST_NOW") || "";
const nowOf = () => (TEST_NOW ? new Date(TEST_NOW) : new Date());
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function keyOf(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("mjm-mcp");
  return (i >= 0 && parts[i + 1]) || url.searchParams.get("key") || "";
}

const INSTRUCTIONS =
  "MJM Nursery's AI System. check_stock answers whether there are seedlings to sell; " +
  "list_products gives prices; create_quotation saves a draft quotation; confirm_order marks a " +
  "quotation accepted. Always read the details back to the user and get a yes before " +
  "create_quotation or confirm_order. Quantities are seedlings; money is Malaysian ringgit.";

async function handle(msg: any): Promise<any | null> {
  const id = msg && msg.id;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Invalid request");
  if (id === undefined) return null;                 // a notification: nothing to answer
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params && msg.params.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mjm-ai-system", title: "MJM AI System", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ run: _run, ...t }) => t) });
    case "tools/call": {
      const name = msg.params && msg.params.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, "Unknown tool: " + name);
      try {
        const out = await tool.run(db, (msg.params && msg.params.arguments) || {}, nowOf());
        return reply({ content: [{ type: "text", text: out.text }], structuredContent: out.data, isError: false });
      } catch (e) {
        // A tool that could not do its job says so to the agent, as text it
        // can read back to the user, rather than as a protocol fault.
        return reply({ content: [{ type: "text", text: "Error: " + ((e as Error).message || String(e)) }], isError: true });
      }
    }
    default:
      return fail(-32601, "Method not found: " + msg.method);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SECRET) return json({ error: "MCP_SECRET is not set on this function." }, 503);
  if (!sameSecret(keyOf(new URL(req.url)), SECRET)) return json({ error: "Not found" }, 404);
  if (req.method === "GET") return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 405, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });
  let body: any;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter((x) => x !== null);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handle(body);
  return out === null ? new Response(null, { status: 202, headers: CORS }) : json(out);
});
