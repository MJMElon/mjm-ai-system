/* ================================================================
   MJM AI POWERED SYSTEM — SHARED ACCESS HELPER
   shared/shared_access.js

   Loads the current user's permissions row from shared_profiles and
   exposes simple helpers to gate UI / actions per module.

   Usage:
     <script src="../shared/shared_supabase.js"></script>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="../shared/shared_access.js"></script>
     ...
     await MJMAccess.load(_supabase);
     if (!MJMAccess.canAccess('operation')) {
        window.location.href = 'operation_dashboard.html';
        return;
     }
     if (MJMAccess.isAdminOf('operation')) showReviewButtons();

   Permission shape (shared_profiles.permissions JSONB):
     {
       "modules": {
         "operation": "admin" | "normal" | "none",
         "salesweb":  "admin" | "normal" | "none",
         "audit":     "admin" | "normal" | "none",
         "mobile":    "admin" | "normal" | "none"
       },
       "manage_users": true | false
     }
   ================================================================ */
(function (global) {
  // Default skeleton — used when nothing is loaded yet. The full set of
  // active modules is sourced from the data itself in normalize() so
  // adding a new module (e.g. reports, audit_trail) doesn't require a
  // helper redeploy.
  const DEFAULT_PERMS = {
    modules: { operation: 'none', reports: 'none', audit_trail: 'none', salesweb: 'none', audit: 'none', mobile: 'none' },
    manage_users: false,
    can_verify_operation: false
  };

  const VALID_LEVELS = new Set(['admin', 'normal', 'none']);

  const state = {
    user: null,        // { id, email, full_name }
    permissions: null  // permissions JSONB (or DEFAULT_PERMS if unset)
  };

  function normalize(perms) {
    const out = JSON.parse(JSON.stringify(DEFAULT_PERMS));
    if (!perms || typeof perms !== 'object') return out;
    if (perms.modules && typeof perms.modules === 'object') {
      // Copy ANY module key from the data — not just the defaults — so
      // newly-added modules immediately work without updating this file.
      for (const [k, v] of Object.entries(perms.modules)) {
        if (VALID_LEVELS.has(v)) out.modules[k] = v;
      }
    }
    out.manage_users = !!perms.manage_users;
    out.can_verify_operation = !!perms.can_verify_operation;
    // Per-page access INSIDE the operation module, managed from the module's
    // own User Access page. Shape: { batch:'admin'|'normal'|'none', ... }.
    // A missing key means "allowed" (default 'normal') so existing users are
    // unaffected until an admin explicitly locks a page.
    if (perms.operation_pages && typeof perms.operation_pages === 'object') {
      out.operation_pages = {};
      for (const [k, v] of Object.entries(perms.operation_pages)) {
        if (VALID_LEVELS.has(v)) out.operation_pages[k] = v;
      }
    }
    return out;
  }

  async function load(supa) {
    if (!supa) throw new Error('MJMAccess.load(supabase) — supabase client required');
    const { data: { session } } = await supa.auth.getSession();
    if (!session) {
      state.user = null;
      state.permissions = normalize(null);
      return state;
    }
    const u = session.user;
    state.user = {
      id: u.id,
      email: u.email || '',
      full_name: (u.user_metadata && u.user_metadata.full_name) || ''
    };
    let fetchOk = false;
    try {
      const { data, error } = await supa
        .from('shared_profiles')
        .select('full_name, email, permissions')
        .eq('id', u.id)
        .single();
      if (error) throw error;
      if (data) {
        if (data.full_name) state.user.full_name = data.full_name;
        state.permissions = normalize(data.permissions);
      } else {
        state.permissions = normalize(null);
      }
      fetchOk = true;
    } catch (e) {
      console.warn('[MJMAccess] failed to load permissions:', e);
      state.permissions = normalize(null);
    }

    // Whole-system gate. The signed-in user MUST have at least one
    // staff-grade entry on their permissions row — manage_users,
    // can_verify_operation, or a non-'none' module level. Without that
    // they have no business loading any ops page, so kick them back to
    // the hub's index.html where the Pending Access screen explains
    // they're awaiting admin approval.
    //
    // Fails OPEN on a profile-read error so a transient Supabase
    // hiccup doesn't lock real ops admins out. Same policy as the hub
    // gate. Allow opt-out via window.__MJM_SKIP_ACCESS_GATE for pages
    // that already handle their own gating.
    if (fetchOk && !global.__MJM_SKIP_ACCESS_GATE) {
      const p = state.permissions || {};
      let anyAccess = !!(p.manage_users || p.can_verify_operation);
      if (!anyAccess && p.modules) {
        for (const k in p.modules) {
          if (p.modules[k] && p.modules[k] !== 'none') { anyAccess = true; break; }
        }
      }
      if (!anyAccess) {
        console.warn('[MJMAccess] no ops access — redirecting to hub');
        const here = (global.location && global.location.pathname) || '';
        // From /operation/foo.html → ../index.html. From / or /index.html
        // we're already on the hub; don't redirect-loop.
        if (!/\/index\.html?$/.test(here) && here !== '/' && here !== '') {
          global.location.href = '../index.html';
          // Throw so the caller's awaited code does not continue executing
          // pre-redirect (we're navigating away anyway).
          throw new Error('NO_OPS_ACCESS');
        }
      }
    }

    return state;
  }

  function user()        { return state.user; }
  function permissions() { return state.permissions || normalize(null); }

  function moduleLevel(name) {
    const p = permissions();
    return (p.modules && p.modules[name]) || 'none';
  }

  function canAccess(name)  { return moduleLevel(name) !== 'none'; }
  function isAdminOf(name)  { return moduleLevel(name) === 'admin'; }
  function canManageUsers() { return !!permissions().manage_users; }

  // Convenience for batch-detail tab review gating.
  function canReviewOperation() { return isAdminOf('operation'); }

  // Two-person batch verification: Verifier flag (or operation admin) may verify
  // a tab; only operation admins may then mark it as reviewed.
  function canVerifyOperation() {
    return !!permissions().can_verify_operation || isAdminOf('operation');
  }

  // Per-page access inside the operation module (see operation_pages above).
  // Page keys mirror the dashboard cards: batch, orders, stock, settings.
  // (Reports and Audit Trail keep their own module levels.)
  function operationPageLevel(name) {
    const op = permissions().operation_pages;
    const v = op && op[name];
    return VALID_LEVELS.has(v) ? v : 'normal'; // unset = allowed
  }
  function canOpenOperationPage(name) { return operationPageLevel(name) !== 'none'; }

  /**
   * Redirect away from a module page if the user lacks access.
   * Call after MJMAccess.load(supa).
   *   MJMAccess.guard('operation', 'operation_dashboard.html');
   */
  function guard(moduleName, redirectTo) {
    if (!canAccess(moduleName)) {
      window.location.href = redirectTo || '../index.html';
      return false;
    }
    return true;
  }

  global.MJMAccess = {
    load,
    user,
    permissions,
    moduleLevel,
    canAccess,
    isAdminOf,
    canManageUsers,
    canReviewOperation,
    canVerifyOperation,
    operationPageLevel,
    canOpenOperationPage,
    guard
  };
})(window);
