# scan-packing-list (Supabase Edge Function)

Used by the **Seed Audit** tab to parse a supplier packing list (image or PDF)
into bag rows via Claude vision.

## One-time setup

1. Install the Supabase CLI: <https://supabase.com/docs/guides/cli/getting-started>
2. From the repo root, link to the project:
   ```sh
   supabase link --project-ref kibqjztozokohqmhqqqf
   ```
3. Set the Anthropic API key as a function secret:
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
   (Optional override) `CLAUDE_MODEL` defaults to `claude-sonnet-4-6`.
4. Deploy:
   ```sh
   supabase functions deploy scan-packing-list --no-verify-jwt
   ```
   `--no-verify-jwt` lets the browser hit it with the public anon key. If you
   prefer JWT-only access, omit the flag and pass an authenticated session
   token from the client.

## Request / response

`POST` JSON:

```json
{
  "file_base64": "<base64 string, no data: prefix>",
  "mime_type":   "image/jpeg | image/png | application/pdf",
  "filename":    "optional, used only for logs"
}
```

Response on success:

```json
{ "bags": [ { "bag_no": "MJ24-001", "supplier_qty": 1000 }, ... ] }
```

Errors return `{ "error": "..." }` with an appropriate HTTP status code.
