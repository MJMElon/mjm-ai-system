/* Shared config + helpers — MJM Training Center (module of the MJM AI System)
   Identity comes from the AI System hub login via assets/auth.js, which sets
   localStorage 'mjm-user' to the signed-in email. Per-user records are stored
   in localStorage under 'mjm-u-<email>-...'. */
window.MJM = (function(){

  var ACTIVITIES = {
    'seed-planting': {name:'Seeds Planting',          icon:'fa-seedling',         desc:'Batches of germinated seeds planted'},
    'seed-culling':  {name:'Seed-Damage Culling',     icon:'fa-filter',           desc:'Damaged seeds culled while planting'},
    'watering':      {name:'Watering Sessions',       icon:'fa-droplet',          desc:'Watering rounds completed'},
    'manuring':      {name:'Manuring Rounds',         icon:'fa-flask',            desc:'Fertiliser applied per schedule'},
    'weeding':       {name:'Weeding Rounds',          icon:'fa-scissors',         desc:'Weeding of trays or polybags'},
    'spraying':      {name:'Pest & Disease Sprays',   icon:'fa-bug',              desc:'Spray rounds per schedule'},
    'interrow':      {name:'Inter-Row Sprays',        icon:'fa-spray-can',        desc:'Weed control between rows'},
    'transplanting': {name:'Seedlings Transplanted',  icon:'fa-right-left',       desc:'Pre-nursery to main-nursery moves'},
    'culling':       {name:'Culling Checks',          icon:'fa-magnifying-glass', desc:'Culling checkpoints carried out'},
    'case-open':     {name:'Carlos Cases Opened',     icon:'fa-circle-plus',      desc:'New cases opened in Carlos'},
    'case-solve':    {name:'Carlos Cases Resolved',   icon:'fa-circle-check',     desc:'Cases resolved within one week'},
    'order':         {name:'Sales Orders Processed',  icon:'fa-cart-shopping',    desc:'Online orders verified and completed'},
    'report':        {name:'Batch Reports Filed',     icon:'fa-file-lines',       desc:'Any of the six batch reports'},
    'collection':    {name:'Collections Handled',     icon:'fa-truck-ramp-box',   desc:'Customer collections at the plot'}
  };

  /* Each program = training slides + practical targets.
     Adjust the target numbers here as needed. */
  var PROGRAMS = {
    'operation': {name:'Nursery Operation', page:'operation.html', pages:9,
      practical:{'seed-planting':100,'seed-culling':20,'watering':50,'manuring':20,'weeding':10,
                 'spraying':10,'interrow':10,'transplanting':50,'culling':20}},
    'troubleshoot': {name:'Troubleshoot & Cases', page:'troubleshoot.html', pages:4,
      practical:{'case-open':10,'case-solve':10}},
    'admin-operation': {name:'Admin Operation', page:'admin-operation.html', pages:1,
      practical:{'report':30}},
    'copn': {name:'COPN — Code of Practice', page:'copn.html', pages:1, practical:{}},
    'sales': {name:'Sales', page:'sales.html', pages:2,
      practical:{'order':20,'collection':10}},
    'management': {name:'Team & Resource Management', page:'management.html', pages:1, practical:{}}
  };

  function user(){ try{ return localStorage.getItem('mjm-user'); }catch(e){ return null; } }
  function users(){ try{ return JSON.parse(localStorage.getItem('mjm-users')||'{}'); }catch(e){ return {}; } }
  function userName(){
    var u=users()[user()];
    return (u&&u.name)?u.name:(user()||'');
  }
  function requireLogin(){
    if(!user()){ location.replace('../index.html'); return false; }
    return true;
  }
  function pfx(){ return 'mjm-u-'+(user()||'guest')+'-'; }
  function get(k){ try{ return localStorage.getItem(pfx()+k); }catch(e){ return null; } }
  function set(k,v){ try{ localStorage.setItem(pfx()+k,v); }catch(e){} }

  function readCount(slug){ try{ return JSON.parse(get('read-'+slug)||'[]').length; }catch(e){ return 0; } }
  function pageTotal(slug){
    var n=parseInt(get('pages-'+slug)||'0',10);
    return n>0?n:PROGRAMS[slug].pages;
  }
  function log(){ try{ return JSON.parse(get('log')||'{}'); }catch(e){ return {}; } }
  function saveLog(l){ set('log',JSON.stringify(l)); }

  /* Combined program progress: slides read + practical counts.
     score = (slides read + capped practical counts) / (total slides + practical targets). */
  function progress(slug){
    var p=PROGRAMS[slug], l=log();
    var sTot=pageTotal(slug), sGot=Math.min(readCount(slug),sTot);
    var prac=Object.keys(p.practical).map(function(k){
      var t=p.practical[k], g=l[k]||0;
      return {key:k,name:ACTIVITIES[k].name,icon:ACTIVITIES[k].icon,desc:ACTIVITIES[k].desc,
              got:g,target:t,met:g>=t};
    });
    var got=sGot, tot=sTot;
    prac.forEach(function(x){ got+=Math.min(x.got,x.target); tot+=x.target; });
    var pGot=0,pTot=0;
    prac.forEach(function(x){ pGot+=Math.min(x.got,x.target); pTot+=x.target; });
    return {
      slides:{got:sGot,total:sTot,met:sGot>=sTot},
      practical:prac,
      practicalPct:pTot>0?Math.round(pGot/pTot*100):100,
      score:tot>0?Math.round(got/tot*100):0,
      complete:sGot>=sTot && prac.every(function(x){return x.met;})
    };
  }

  /* Show the signed-in user + a log out button in the topbar. */
  function initTopbar(){
    var bar=document.querySelector('.topbar-in');
    if(!bar||!user()) return;
    var box=document.createElement('div');
    box.className='userbox';
    var chip=document.createElement('span');
    chip.className='userchip';
    chip.innerHTML='<i class="fa-solid fa-circle-user"></i> ';
    chip.appendChild(document.createTextNode(userName()));
    var hub=document.createElement('button');
    hub.className='logout'; hub.type='button'; hub.title='Back to AI System hub';
    hub.innerHTML='<i class="fa-solid fa-table-cells-large"></i><span class="lbl"> Hub</span>';
    hub.addEventListener('click',function(){ location.href='../index.html'; });
    var out=document.createElement('button');
    out.className='logout'; out.type='button'; out.title='Log out';
    out.innerHTML='<i class="fa-solid fa-arrow-right-from-bracket"></i><span class="lbl"> Log out</span>';
    out.addEventListener('click',function(){
      // Sign out of the whole MJM AI System (same pattern as the audit module):
      // clear the shared login + Supabase tokens, then return to the hub login.
      try{
        localStorage.removeItem('mjm-user');
        localStorage.removeItem('mjm_user');
        Object.keys(localStorage).forEach(function(k){ if(k.indexOf('sb-')===0) localStorage.removeItem(k); });
        sessionStorage.removeItem('mjm_session_active');
      }catch(e){}
      location.href='../index.html';
    });
    box.appendChild(chip); box.appendChild(hub); box.appendChild(out);
    bar.appendChild(box);
  }

  return {
    ACTIVITIES:ACTIVITIES, PROGRAMS:PROGRAMS,
    user:user, userName:userName, requireLogin:requireLogin,
    get:get, set:set,
    readCount:readCount, pageTotal:pageTotal, log:log, saveLog:saveLog,
    progress:progress, initTopbar:initTopbar
  };
})();
