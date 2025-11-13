/* ====== CONFIG ====== */
const API = 'https://script.google.com/macros/s/AKfycbxV-q6-l9maz034eJXk7suC3lHUynjClzDZYr4yHd7UKjeQY_CvLDlFDrqK3NzQj4I/exec'; // e.g. https://script.google.com/macros/s/AKfy.../exec

/* ====== CORE HELPERS ====== */
const $ = s => document.querySelector(s);
const el = (t, attrs={}, ...kids) => {
  const x = document.createElement(t);
  Object.entries(attrs).forEach(([k,v])=> (k==='class')? x.className=v : (k==='html')? x.innerHTML=v : x.setAttribute(k,v));
  kids.forEach(k=> x.appendChild(typeof k==='string'? document.createTextNode(k):k));
  return x;
};
const fmt = n => new Intl.NumberFormat().format(n);

/* ====== NAV ====== */
const views = ['registration','log','transfer','inventory','history','analysis'];
const main = $('#main');
document.querySelectorAll('nav button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    showView(b.dataset.view);
  });
});
function showView(name){
  const tpl = document.getElementById('tpl-'+name);
  main.innerHTML = '';
  main.appendChild(tpl.content.cloneNode(true));
  if(name==='registration') initRegistration();
  if(name==='log') initLog();
  if(name==='transfer') initTransfer();
  if(name==='inventory') initInventory();
  if(name==='history') initHistory();
  if(name==='analysis') initAnalysis();
}
showView('registration');

/* ====== API ====== */
async function getJSON(path, params={}){
  const qs = new URLSearchParams({fn:path, ...params});
  const res = await fetch(API+'?'+qs.toString(), { method:'GET' });
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}
// REPLACE your current postJSON with this
async function postJSON(path, data){
  // Don't set Content-Type; let the browser default to form-encoded (simple request)
  const qs = new URLSearchParams({ fn: path });
  // Flatten data; stringify objects/arrays (e.g., cart) so Apps Script can parse
  const form = new URLSearchParams();
  Object.entries(data || {}).forEach(([k, v]) => {
    form.append(k, (typeof v === 'object') ? JSON.stringify(v) : String(v));
  });

  const res = await fetch(API + '?' + qs.toString(), {
    method: 'POST',
    body: form
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}


/* ====== REGISTRATION ====== */
function initRegistration(){
  $('#btn-save-item').addEventListener('click', async ()=>{
    const payload = {
      itemCode: $('#r-code').value,
      itemName: $('#r-name').value,
      brand: $('#r-brand').value,
      category: $('#r-cat').value,
      remarks: $('#r-remarks').value,
      criticalLevel: Number($('#r-crit').value||0)
    };
    const msg = $('#reg-msg');
    msg.textContent = 'Saving...';
    try{
      const r = await postJSON('additem', payload);
      msg.textContent = r.ok? 'Saved ✅' : ('Error: '+r.error);
    }catch(e){ msg.textContent = 'Error: '+e.message; }
  });
}

/* ====== AUTOCOMPLETE (shared) ====== */
function setupTypeahead(inputEl, suggestEl, onPick){
  let timer = null;
  inputEl.addEventListener('input', ()=>{
    clearTimeout(timer);
    timer = setTimeout(async ()=>{
      const q = inputEl.value.trim();
      if(!q){ suggestEl.style.display='none'; suggestEl.innerHTML=''; return; }
      try{
        const res = await getJSON('items', { q });
        suggestEl.innerHTML = '';
        res.items.forEach(it=>{
          const d = el('div',{}, `${it.ItemCode} — ${it.ItemName} (${it.Brand||'–'})`);
          d.addEventListener('click', ()=>{
            suggestEl.style.display='none';
            inputEl.value = `${it.ItemCode} — ${it.ItemName}`;
            onPick(it);
          });
          suggestEl.appendChild(d);
        });
        suggestEl.style.display = res.items.length? 'block':'none';
      }catch(_){}
    }, 200);
  });
  document.addEventListener('click', (e)=>{
    if(!suggestEl.contains(e.target) && e.target!==inputEl) suggestEl.style.display='none';
  });
}

/* ====== LOG ====== */
const logCart = [];
function initLog(){
  let selected = null;
  setupTypeahead($('#l-search'), $('#l-suggestions'), it=> selected = it);
  $('#l-add').addEventListener('click', ()=>{
    if(!selected){ alert('Pick an item from suggestions.'); return; }
    const qty = Number($('#l-qty').value||0);
    if(qty<=0){ alert('Qty must be > 0'); return; }
    const notes = $('#l-notes').value.trim();
    logCart.push({ itemCode:selected.ItemCode, itemName:selected.ItemName, qty, notes });
    selected=null; $('#l-search').value=''; $('#l-qty').value=1; $('#l-notes').value='';
    renderCart('#l-cart', logCart, (i)=>{ logCart.splice(i,1); renderCart('#l-cart', logCart); });
  });
  $('#l-confirm').addEventListener('click', async ()=>{
    const msg=$('#l-msg');
    if(!logCart.length){ msg.textContent='Cart empty'; return; }
    msg.textContent='Posting...';
    try{
      const r = await postJSON('stockin', { cart: logCart });
      if(r.ok){ msg.textContent = `Logged ${r.count} item(s) ✅`; logCart.length=0; renderCart('#l-cart', logCart); }
      else{ msg.textContent = 'Error: '+r.error; }
    }catch(e){ msg.textContent = 'Error: '+e.message; }
  });
}
function renderCart(sel, cart, onDel){
  const t = document.querySelector(sel);
  t.innerHTML = '<tr><th>Code</th><th>Name</th><th>Qty</th><th>Notes</th><th></th></tr>' +
    cart.map((r,i)=>`<tr><td>${r.itemCode}</td><td>${r.itemName}</td><td>${r.qty}</td><td>${r.notes||''}</td>
    <td><button class="secondary" data-i="${i}">✖</button></td></tr>`).join('');
  t.querySelectorAll('button[data-i]').forEach(b=> b.onclick=()=>onDel && onDel(Number(b.dataset.i)));
}

/* ====== TRANSFER ====== */
const trCart = [];
async function initTransfer(){
  let wards = [];
  const wardSel = $('#t-ward');
  const msg = $('#t-msg');
  msg.textContent = 'Loading wards...';
  try{
    const w = await getJSON('wards');
    wards = w.wards||[];
    wardSel.innerHTML = wards.map(x=>`<option value="${x}">${x}</option>`).join('');
    msg.textContent = '';
  }catch(e){ msg.textContent = 'Failed to load wards: '+e.message; }

  let selected = null;
  setupTypeahead($('#t-search'), $('#t-suggestions'), it=> selected = it);
  $('#t-add').addEventListener('click', ()=>{
    if(!selected){ alert('Pick an item from suggestions.'); return; }
    const qty = Number($('#t-qty').value||0);
    if(qty<=0){ alert('Qty must be > 0'); return; }
    const ward = wardSel.value;
    const notes = $('#t-notes').value.trim();
    trCart.push({ itemCode:selected.ItemCode, itemName:selected.ItemName, qty, ward, notes });
    selected=null; $('#t-search').value=''; $('#t-qty').value=1; $('#t-notes').value='';
    renderCart('#t-cart', trCart, (i)=>{ trCart.splice(i,1); renderCart('#t-cart', trCart); });
  });
  $('#t-confirm').addEventListener('click', async ()=>{
    if(!trCart.length){ msg.textContent='Cart empty'; return; }
    msg.textContent='Transferring...';
    try{
      const r = await postJSON('transfer', { cart: trCart });
      if(r.ok){ msg.textContent = `Transferred ${r.count} item(s) ✅`; trCart.length=0; renderCart('#t-cart', trCart); }
      else{ msg.textContent = 'Error: '+r.error; }
    }catch(e){ msg.textContent = 'Error: '+e.message; }
  });
}

/* ====== INVENTORY (CENTRAL ONLY) ====== */
async function initInventory(){
  const tbl = $('#i-table');
  const search = $('#i-search');
  const refresh = async ()=>{
    tbl.innerHTML = '<tr><td>Loading...</td></tr>';
    try{
      const res = await getJSON('inventory', { search: search.value||'' });
      tbl.innerHTML = '<tr><th>Code</th><th>Name</th><th>Brand</th><th>Category</th><th>Qty</th><th>Critical</th></tr>' +
        res.items.map(r=>{
          const crit = r.Qty <= (r.CriticalLevel||0);
          return `<tr class="${crit?'critical':''}">
            <td>${r.ItemCode}</td><td>${r.ItemName}</td><td>${r.Brand||''}</td><td>${r.Category||''}</td>
            <td>${fmt(r.Qty)}</td><td>${r.CriticalLevel||0}</td></tr>`;
        }).join('');
    }catch(e){ tbl.innerHTML = `<tr><td>Error: ${e.message}</td></tr>`; }
  };
  $('#i-refresh').onclick = refresh;
  search.oninput = ()=>{ clearTimeout(window.__it); window.__it=setTimeout(refresh, 200); };
  refresh();
}

/* ====== HISTORY ====== */
function ymd(d){ return d.toISOString().slice(0,10); }
async function initHistory(){
  const from = $('#h-from'), to = $('#h-to'), t = $('#h-table'), msg=$('#h-msg');
  const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth(), 1);
  from.value = ymd(s); to.value = ymd(new Date(d.getFullYear(), d.getMonth()+1, 0));

  async function load(){
    msg.textContent='Loading...';
    try{
      const res = await getJSON('transactions',{ dateFrom:from.value, dateTo:to.value });
      t.innerHTML = '<tr><th>When</th><th>Type</th><th>Code</th><th>Name</th><th>Qty</th><th>From</th><th>To</th><th>Notes</th><th></th></tr>' +
        res.transactions.map(r=>`<tr>
        <td>${r.DateTime}</td><td>${r.Type}</td><td>${r.ItemCode}</td><td>${r.ItemName}</td>
        <td>${r.Qty}</td><td>${r.FromWard||''}</td><td>${r.ToWard||''}</td><td>${r.Notes||''}</td>
        <td>${String(r.Deleted)==='true'?'—':`<button class="secondary" data-tx="${r.TxID}">🗑</button>`}</td></tr>`).join('');
      t.querySelectorAll('button[data-tx]').forEach(b=>{
        b.onclick = async ()=>{
          if(!confirm('Delete this transaction? Stock will be auto-reversed.')) return;
          msg.textContent='Deleting...';
          try{
            const r = await postJSON('deletetx', { txId:b.dataset.tx });
            msg.textContent = r.ok? 'Deleted ✅' : ('Error: '+r.error);
            await load();
          }catch(e){ msg.textContent = 'Error: '+e.message; }
        };
      });
      msg.textContent='';
    }catch(e){ msg.textContent='Error: '+e.message; }
  }

  $('#h-load').onclick = load;
  $('#h-export').onclick = ()=>{
    const url = `${API}?fn=export&dateFrom=${from.value}&dateTo=${to.value}`;
    window.open(url, '_blank');
  };
  load();
}

/* ====== ANALYSIS ====== */
async function initAnalysis(){
  const from = $('#a-from'), to = $('#a-to');
  const d=new Date(); const s=new Date(d.getFullYear(),d.getMonth(),1);
  from.value = ymd(s); to.value = ymd(new Date(d.getFullYear(), d.getMonth()+1, 0));

  const run = async ()=>{
    const res = await getJSON('analytics',{ dateFrom:from.value, dateTo:to.value });
    $('#a-kpis').innerHTML = [
      el('div',{class:'card'}, el('div',{style:'font-weight:600'},'Critical Items'), el('div',{}, String(res.critical.length))),
      el('div',{class:'card'}, el('div',{style:'font-weight:600'},'Fast Moving (top20)'), el('div',{}, String(res.fast.length))),
      el('div',{class:'card'}, el('div',{style:'font-weight:600'},'Unused (period)'), el('div',{}, String(res.unused.length)))
    ].map(n=>n.outerHTML).join('');

    function table(sel, rows){
      const t=$(sel);
      t.innerHTML = '<tr><th>Code</th><th>Name</th><th>Moved</th><th>Qty</th><th>Critical</th></tr>' +
        rows.map(r=>`<tr${r.Critical?' class="critical"':''}><td>${r.ItemCode}</td><td>${r.ItemName}</td><td>${fmt(r.Moved)}</td><td>${fmt(r.Qty)}</td><td>${r.CriticalLevel||0}</td></tr>`).join('');
    }
    table('#a-fast', res.fast);
    table('#a-slow', res.slow);
    table('#a-unused', res.unused);
    table('#a-critical', res.critical);
  };

  $('#a-run').onclick = run;
  run();
}
