# React Migration — mjm-ai-system (ai.mjmnursery.com)

This repo is being migrated from plain static HTML/JS to React + Vite,
page by page, with **zero downtime** (strangler pattern) — the same setup
already completed in MJMNursery-Sales-Web and matching the already-React
Mobile and Barcode_Counter repos.

## ⚠️ ONE-TIME SWITCH — DO THIS BEFORE MERGING TO MAIN

1. GitHub repo → **Settings → Pages → Build and deployment → Source** →
   change from "Deploy from a branch" to **"GitHub Actions"**. Nothing
   changes for visitors yet — the old site stays live until the first
   successful workflow run replaces it.
2. Merge the migration branch into `main`. The workflow builds and
   deploys `dist/` (identical content on the first deploy).

Merging **before** switching would break the site (Pages would rebuild
from the branch root where index.html no longer exists). Switch first.

**Rollback after merging:** `git revert` the merge commit — the workflow
redeploys the previous state in ~1–2 minutes; Pages deploys are atomic.

## How the strangler pattern works here

- Unmigrated pages live in `public/` (folder structure preserved:
  `public/operation/…`, `public/audit/…`) and are copied into `dist/`
  verbatim — same URLs, byte-identical content.
- Migrated pages are React: an HTML shell at the repo root (nested paths
  like `col_booking/col_booking.html` keep subfolder URLs) + an entry in
  `src/entries/` + a page under `src/pages/`, registered in
  `vite.config.js`.
- A page exists in exactly ONE of those two places (Vite errors on a
  collision).
- `legacy_urls.txt` (all 71 original file paths) is checked against
  `dist/` on every build by `scripts/check_urls.sh` — a missing file
  fails CI and blocks the deploy.
- `legacy/` holds an untouched snapshot of the original site.

## Special care

- **audit/ module is an offline PWA**: `audit/audit_sw.js` must keep its
  filename and stay a plain served file; bump its `VER` string whenever
  audit files change so field phones fetch the new version. The
  IndexedDB name/schema in `audit_dexie_offline.js` must never change
  (queued offline records survive). Emergency reset SW on standby at
  `public/audit/sw-reset.js.txt`.
- **mobile/ pages** will become redirect stubs to mobile.mjmnursery.com
  (already React) — the "entry/input" app; the main system lives here.
- `.github/workflows/claude.yml` (bot) stays.
- Query-param contracts: operation/training pages pass state via
  URLSearchParams — migrated pages keep the same parameter names.
- localStorage keys stay identical: `mjm_user`, `mjm_cached_creds`,
  `mjm_lang` (audit), `mjm-user`, `mjm-users` (training).

## Migration order (one commit each)

1. ✅ Build pipeline (this scaffold — deploys today's site unchanged)
2. `col_booking/col_booking.html` (1 page — proves nested entries)
3. Root hub `index.html` (login + module cards)
4. `training/` (12 pages; login first)
5. `operation/` (16 pages; dashboard → read-only pages → write-heavy →
   `operation_stock_sales` last)
6. `audit/` (11 pages; PWA — offline round-trip test on a phone per step)
7. `mobile/` → redirect stubs (confirm with owner first)

## Verify before every merge

```bash
npm ci
npm run build          # must succeed
npm run check:urls     # every legacy URL present in dist/
npm run preview        # click migrated page + one unmigrated page + login
```
