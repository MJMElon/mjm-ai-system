// Project Monitoring System: the settings a brand new database starts from.
// The tasks themselves are seeded by shared/RUN_ME_project_monitoring.sql, never from here:
// two copies of the task list is two lists.
window.SEED_SETTINGS = {
 "projects": [
  {"id":"p1","name":"Nursery","code":"N","start":"2026-03-22","duration":365,"actualEnd":"","modules":[
   "Customer Order Management","Batch Records","Seed Management","Monthly Maintenance Work Schedule",
   "Monthly Maintenance Work Record","Sales Web - Admin Portal","Sales Web","Payroll System",
   "Worker Portal - FC Portal","Worker Portal - Worker Portal","Audit System"]},
  {"id":"p2","name":"Machinery","code":"M","start":"2026-05-18","duration":180,"actualEnd":"","modules":[]},
  {"id":"p3","name":"NASA","code":"NA","start":"","duration":180,"actualEnd":"","modules":[]},
  {"id":"p4","name":"DIA","code":"D","start":"2026-05-18","duration":180,"actualEnd":"","modules":[]},
  {"id":"p5","name":"Others","code":"Z","start":"","duration":180,"actualEnd":"","modules":[]}
 ],
 "priorities": ["High","Medium","Low"],
 "types": ["Mobile","Web","Mobile & Web"],
 "team": [
  {"id":"m1","name":"Coco Lau"},
  {"id":"m2","name":"Joyce Yii"},
  {"id":"m3","name":"Esther Wong"},
  {"id":"m4","name":"Ruth Wong"},
  {"id":"m5","name":"Ken Tan"},
  {"id":"m6","name":"Ms Chai"}
 ]
};
