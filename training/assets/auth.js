/* MJM Training Center — AI System auth bridge.
   Identity comes from the MJM AI System hub login (Supabase email/password).
   The hub writes localStorage 'mjm_user' = {email, full_name, name, role}
   after a successful sign-in; without it, this page bounces back to the hub.

   The training pages key every record off localStorage 'mjm-user'
   (the old staff-ID). This bridge sets that key to the signed-in email so
   all existing progress/logbook code works unchanged, with records kept
   per login account instead of a self-typed staff ID.

   Must be loaded synchronously in <head>, before any inline script that
   reads 'mjm-user'. */
(function () {
  var su = null;
  try { su = JSON.parse(localStorage.getItem('mjm_user') || 'null'); } catch (e) {}
  /* A Sales Web customer is not staff: the hub refuses one at sign-in and
     never writes mjm_user for them, but a copy cached before that rule must
     not open the training centre either. The hub shows the refusal.
     (The rule itself is shared/shared_staff_gate.js.) */
  var isCustomer = !!su && String(su.user_type || '').trim().toLowerCase() === 'customer';
  if (!su || !su.email || isCustomer) {
    location.replace('../index.html');
    return;
  }
  try {
    var id = String(su.email).trim().toLowerCase();
    var name = su.full_name || su.name || su.email;
    localStorage.setItem('mjm-user', id);
    var users = JSON.parse(localStorage.getItem('mjm-users') || '{}');
    users[id] = { name: name };
    localStorage.setItem('mjm-users', JSON.stringify(users));
  } catch (e) { /* storage blocked — pages will fall back to 'guest' */ }
})();
