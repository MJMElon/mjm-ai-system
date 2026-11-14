/* The Nursery Reporting System's menu, and nothing else.

   The sidebar (report_sidebar.js) draws whatever is in here; a report page
   never names its own menu entry. To add a report: give it a page or a view,
   then add ONE item under its category below. A category with no items is
   drawn as "Coming soon" and cannot be opened, so the six are already in
   place for the reports that are not built yet.

   An item is { id, label, view } for a view of the Nursery Dashboard page
   (it opens as nursery_dashboard.html#<view>), or { id, label, href } for a
   page of its own. `icon` names one of the outline icons in the sidebar. */
window.MJM_REPORT_MENU = {
  brand: { title: 'Nursery Management', sub: 'Reporting System', icon: 'leaf' },
  home: 'nursery_dashboard.html',
  main: [
    { id: 'home', label: 'Dashboard', icon: 'grid', view: 'home' },
  ],
  categories: [
    { id: 'seed-proc',   label: 'Seed Procurement & Receiving',    icon: 'seed',
      items: [ { id: 'seed', label: 'Seed Summary', view: 'seed' } ] },
    { id: 'sales',       label: 'Sales & Marketing',               icon: 'cart',      items: [] },
    { id: 'operations',  label: 'Nursery Operations',              icon: 'sprout',    items: [] },
    { id: 'audit',       label: 'Audit & Compliance',              icon: 'shield',    items: [] },
    { id: 'inventory',   label: 'Inventory & Stock Control',       icon: 'box',       items: [] },
    { id: 'performance', label: 'Nursery Performance & Analytics', icon: 'chart',     items: [] },
  ],
  foot: [
    { id: 'back', label: 'Nursery Reporting System', icon: 'back', href: 'reporting_admin.html' },
  ],
};
