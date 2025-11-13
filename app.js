// --- API WRAPPER ---
const API_URL = window.APP_CONFIG.API_URL;
async function api(action, payload={}, withAuth=true){
  const body = JSON.stringify({ action, payload, session: withAuth ? state.token : '' });
  const res = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain'}, body });
  if (!res.ok) throw new Error('Network error');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Server error');
  return json.data;
}

// --- APP STATE ---
const state = {
  token: '',
  role: '',      // CSR|WARD
  wardCode: '',  // for WARD
  username: '',
  menu: '',      // selected menu
};

// --- UTIL ---
const $ = (sel,root=document)=>root.querySelector(sel);
function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if (k==='class') n.className = v;
    else if (k==='html') n.innerHTML = v;
    else n.setAttribute(k,v);
  });
  (Array.isArray(children)?children:[children]).filter(Boolean).forEach(c=>{
    if (typeof c==='string') n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  });
  return n;
}
function toast(msg, ms=2200){
  const t = el('div',{class:'toast'},msg);
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), ms);
}

// --- VIEWS ---
function viewLogin(){
  const app = $('#app'); app.innerHTML='';
  const logo = 'https://maxterrenal-hash.github.io/justculture/osmak-logo.png';

  const card = el('div',{class:'card',style:'min-width:340px;'},[
    el('div',{class:'row',style:'align-items:center;gap:12px;'},[
      el('img',{src:logo,alt:'Osmak',style:'width:40px;height:40px;border-radius:8px;border:1px solid #eee'}),
      el('div',{class:'h1'},'Ospital ng Makati Inventory'),
    ]),
    el('div',{class:'col',style:'margin-top:12px'},[
      el('input',{id:'username',class:'input',placeholder:'Username'}),
      el('input',{id:'password',class:'input',placeholder:'Password',type:'password'}),
      el('select',{id:'role',class:'input'},[
        el('option',{value:'CSR'},'CSR'),
        el('option',{value:'WARD'},'Ward'),
      ]),
      el('button',{class:'btn primary',onclick:async()=>{
        const username = $('#username').value.trim();
        const password = $('#password').value;
        const rolePick = $('#role').value; // informational

        try{
          const data = await api('login',{ username, password }, false);
          // server decides role; we ignore dropdown for security
          state.token = data.token; state.role = data.role; state.wardCode = data.wardCode||''; state.username = data.username;
          state.menu = (state.role==='CSR') ? 'inventory' : 'inventory';
          renderApp();
          toast('Logged in');
        }catch(err){ toast(err.message||String(err)); }
      }},'Login'),
      el('div',{class:'note'},'Tip: Use demo accounts seeded by the backend (csr1/test123 or eruser/test123) while testing.')
    ])
  ]);

  const wrap = el('div',{class:'center'},card);
  app.appendChild(wrap);
}

function layoutShell(){
  const app = $('#app'); app.innerHTML='';
  const sidebar = el('div',{class:'sidebar'},[
    el('div',{class:'brand'},[
      el('img',{src:'https://maxterrenal-hash.github.io/justculture/osmak-logo.png',alt:'Osmak'}),
      el('div',{},[
        el('div',{},'Ospital ng Makati'),
        el('div',{class:'note'},'Inventory Management'),
      ])
    ]),
    el('div',{class:'menu',id:'menu'}),
    el('div',{class:'userbar'},[
      el('div',{}, state.username+(state.role==='WARD'?' • '+state.wardCode:'') ),
      el('div',{class:'note'}, state.role==='CSR'?'CSR':'Ward'),
      el('div',{style:'margin-top:8px'},[
        el('button',{class:'btn ghost',onclick:()=>{ Object.assign(state,{token:'',role:'',wardCode:'',username:'',menu:''}); viewLogin(); }},'Logout')
      ])
    ])
  ]);
  const main = el('div',{class:'main',id:'main'},[]);
  const root = el('div',{class:'layout'},[sidebar,main]);
  app.appendChild(root);

  const menu = $('#menu');
  const itemsCSR = [
    ['registration','Registration'],
    ['log','Log'],
    ['transfer','Transfer'],
    ['inventory','Inventory'],
    ['tx','Transaction History'],
    ['analysis','Data Analysis']
  ];
  const itemsWard = [
    ['registerPatient','Register Patient'],
    ['charge','Charge'],
    ['inventory','Inventory'],
    ['tx','Transaction History'],
    ['analysis','Data Analysis']
  ];
  const items = (state.role==='CSR') ? itemsCSR : itemsWard;
  items.forEach(([key,label])=>{
    const btn = el('button',{class: (state.menu===key?'active':''), onclick:()=>{ state.menu=key; renderMain(); }}, label);
    menu.appendChild(btn);
  });

  renderMain();
}

function renderMain(){
  const main = $('#main'); main.innerHTML='';
  const titleMap = {
    registration:'Item Registration',
    log:'Log (Stock In)',
    transfer:'Transfer',
    inventory:'Inventory',
    tx:'Transaction History',
    analysis:'Data Analysis',
    registerPatient:'Register Patient',
    charge:'Charge'
  };
  main.appendChild(el('h2',{},titleMap[state.menu] || ''));
  if (state.menu==='inventory') return viewInventory(main);
  // Placeholders to prove the swapping works
  main.appendChild(el('p',{class:'note'},'Module shell ready. Backend endpoints will be wired next.'));
}

async function viewInventory(main){
  const toolbar = el('div',{class:'toolbar'},[]);
  if (state.role==='CSR'){
    // CSR can filter by location
    const locSel = el('select',{class:'input',id:'invLoc'},[
      el('option',{value:'ALL'},'All locations'),
      el('option',{value:'CENTRAL'},'Central')
    ]);
    // Fetch wards for filter
    try{
      const wards = await api('listWards',{});
      wards.forEach(w=>locSel.appendChild(el('option',{value:w.WardCode},`${w.WardCode} — ${w.WardName}`)));
    }catch(_){}
    toolbar.appendChild(locSel);
  } else {
    toolbar.appendChild(el('span',{class:'badge green'}, `Ward: ${state.wardCode}`));
  }
  const search = el('input',{class:'input',placeholder:'Search item name/code/brand',style:'min-width:280px',id:'invSearch'});
  const refreshBtn = el('button',{class:'btn'},'Refresh');
  toolbar.appendChild(search);
  toolbar.appendChild(refreshBtn);
  main.appendChild(toolbar);

  const table = el('table',{class:'table'});
  const thead = el('thead',{}, el('tr',{},[
    el('th',{},'Item Code'),
    el('th',{},'Item Name'),
    el('th',{},'Brand'),
    el('th',{},'Location'),
    el('th',{},'Qty'),
    el('th',{},'Reorder'),
    el('th',{},'Status')
  ]));
  const tbody = el('tbody',{});
  table.appendChild(thead); table.appendChild(tbody);
  main.appendChild(table);

  async function load(){
    const q = $('#invSearch').value.trim();
    const loc = $('#invLoc') ? $('#invLoc').value : 'ALL';
    try{
      const data = await api('getInventory',{ location: loc, query: q });
      tbody.innerHTML='';
      if (!data.length){
        tbody.appendChild(el('tr',{}, el('td',{colspan:'7'},'No inventory.')));
        return;
      }
      data.forEach(r=>{
        const critical = (r.ReorderPoint!=='' && Number(r.Qty)<=Number(r.ReorderPoint));
        const tr = el('tr',{},[
          el('td',{},r.ItemCode||''),
          el('td',{},r.ItemName||''),
          el('td',{},r.Brand||''),
          el('td',{},r.Location||''),
          el('td',{},String(r.Qty)),
          el('td',{}, r.ReorderPoint===''?'':String(r.ReorderPoint)),
          el('td',{}, critical? 'CRITICAL' : 'OK')
        ]);
        tbody.appendChild(tr);
      });
    }catch(err){ toast(err.message||String(err)); }
  }
  refreshBtn.onclick = load;
  search.oninput = ()=>{ clearTimeout(search._t); search._t=setTimeout(load,250); };
  if ($('#invLoc')) $('#invLoc').onchange = load;
  load();
}

// --- ROOT RENDER ---
function renderApp(){
  if (!state.token) return viewLogin();
  return layoutShell();
}
window.addEventListener('DOMContentLoaded', renderApp);

window.addEventListener('error', e => { console.error('JS error', e.message, e.error); });
window.addEventListener('unhandledrejection', e => { console.error('Promise rejection', e.reason); });

// --- Minimal login wiring (drop-in) ---
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('button.btn.primary');
  if (!btn) return console.warn('Login button not found at DOMContentLoaded');

  btn.addEventListener('click', async () => {
    const api = window.APP_CONFIG?.API_URL;
    const username = document.getElementById('username')?.value?.trim() || '';
    const password = document.getElementById('password')?.value || '';
    if (!api) return alert('API URL not set in index.html');
    if (!username || !password) return alert('Enter username and password');

    try {
      const r = await fetch(api, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'login', payload: { username, password } })
      });
      const j = await r.json();
      if (!j.ok) return alert(j.error || 'Login failed');

      // Save session (simple + works)
      sessionStorage.setItem('token', j.data.token);
      sessionStorage.setItem('role', j.data.role);
      sessionStorage.setItem('wardCode', j.data.wardCode || '');
      sessionStorage.setItem('username', j.data.username);

      // If your app has a renderApp/state, use it; else just navigate.
      if (typeof renderApp === 'function' && typeof state === 'object') {
        state.token = j.data.token;
        state.role = j.data.role;
        state.wardCode = j.data.wardCode || '';
        state.username = j.data.username;
        state.menu = 'inventory';
        renderApp();
      } else {
        // Fallback: change URL or reload so your app can pick up sessionStorage
        window.location.hash = '#inventory';
        location.reload();
      }
    } catch (e) {
      alert('Network error: ' + e);
    }
  });
});
