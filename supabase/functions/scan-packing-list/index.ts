// supabase/functions/scan-packing-list/index.ts
//
// Receives a supplier packing list (image or PDF, base64-encoded) from the
// Seed Audit tab and asks Claude vision to extract the bag rows.
//
// Deploy:
//   supabase functions deploy scan-packing-list --no-verify-jwt
// Set the secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Request JSON:
//   {
//     "file_base64": "<base64 without data: prefix>",
//     "mime_type":   "image/jpeg" | "image/png" | "application/pdf" | ...,
//     "filename":    "packing-list.pdf"   // optional, used only for logs
//   }
//
// Response JSON (success):
//   { "bags": [ { "bag_no": "MJ24-001", "supplier_qty": 1000 }, ... ] }

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-6";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `You are looking at a seed supplier's packing list (image or PDF).
Extract every bag listed on the document.

Return ONLY a single JSON object — no prose, no markdown fence — matching:
{
  "bags": [
    { "bag_no": "string", "supplier_qty": number }
  ]
}

Rules:
- "bag_no" is the bag number, seal number, lot ID, or any per-bag identifier printed on that row.
- "supplier_qty" is the quantity of seeds the supplier states are inside that specific bag.
- Skip header rows, subtotals, grand totals, signatures, address blocks, or any line that is not a real bag entry.
- If a row's quantity is illegible, omit that bag rather than guessing.
- If the document does not look like a packing list at all, return {"bags": []}.
- Output ONLY the JSON object. No commentary.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!ANTHROPIC_API_KEY) {
    return jsonResponse(
      { error: "ANTHROPIC_API_KEY secret not set on this function." },
      500,
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const fileB64: string | undefined = body?.file_base64;
  const mime: string = body?.mime_type || "";
  if (!fileB64 || !mime) {
    return jsonResponse(
      { error: "Missing file_base64 or mime_type." },
      400,
    );
  }

  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  if (!isPdf && !isImage) {
    return jsonResponse(
      {
        error:
          "Unsupported mime_type. Send an image/* file or application/pdf.",
      },
      400,
    );
  }

  const content: any[] = [
    isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileB64,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mime,
            data: fileB64,
          },
        },
    { type: "text", text: PROMPT },
  ];

  let claudeRes: Response;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (e) {
    return jsonResponse(
      { error: "Network error calling Anthropic API: " + String(e) },
      502,
    );
  }

  if (!claudeRes.ok) {
    const text = await claudeRes.text();
    return jsonResponse(
      { error: "Anthropic API error.", status: claudeRes.status, details: text },
      502,
    );
  }

  const claudeJson: any = await claudeRes.json();
  const text: string =
    claudeJson?.content?.[0]?.text ||
    claudeJson?.content?.map((c: any) => c?.text || "").join("\n") ||
    "";

  // Be lenient — pull the first {...} block out of the response.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return jsonResponse(
      { error: "Could not find JSON in AI response.", raw: text },
      502,
    );
  }
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    return jsonResponse(
      { error: "AI returned malformed JSON: " + String(e), raw: text },
      502,
    );
  }

  // Normalise the array
  const bags = Array.isArray(parsed?.bags) ? parsed.bags : [];
  const normalised = bags
    .map((b: any) => ({
      bag_no: String(b?.bag_no ?? b?.bagNo ?? "").trim(),
      supplier_qty: Number(b?.supplier_qty ?? b?.supplierQty ?? 0) || 0,
    }))
    .filter((b: any) => b.bag_no || b.supplier_qty > 0);

  return jsonResponse({ bags: normalised });
});
