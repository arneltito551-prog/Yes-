// script.js (ES module)

// Uses Firebase v10+ ES module CDN

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";

import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-analytics.js";

import {

  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy

} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

/* =========================

   CONFIG - Firebase + Cloudinary

   ========================= */

const firebaseConfig = {

  apiKey: "AIzaSyBgyHarH91njJRUTxBIcSCXcMb6sq4flzM",

  authDomain: "myself-4760b.firebaseapp.com",

  projectId: "myself-4760b",

  storageBucket: "myself-4760b.firebasestorage.app",

  messagingSenderId: "647961921695",

  appId: "1:647961921695:web:33ea2e021eff6fa43cbaaa",

  measurementId: "G-7NQDX6XK2P"

};

const cloudName = "dtmm8frik";  // your Cloudinary cloud name

const uploadPreset = "Crrd2025"; // your unsigned upload preset

/* Initialize Firebase */

const app = initializeApp(firebaseConfig);

try{ getAnalytics(app); } catch(e){ /* ignore analytics errors */ }

const db = getFirestore(app);

const itemsCol = collection(db, "materialsRequests");

/* =========================

   Helpers & State

   ========================= */

const qs = s => document.querySelector(s);

const qsa = s => Array.from(document.querySelectorAll(s));

const nowISO = () => new Date().toISOString();

const state = {

  items: [],

  currentFilter: 'all'

};

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* =========================

   Toast functions (TOP-RIGHT)

   ========================= */

const toastContainer = qs('#toastContainer');

function showToast(message, {type='info', duration=3000} = {}) {

  const t = document.createElement('div');

  t.className = `toast ${type}`;

  t.innerHTML = `<div>${escapeHtml(message)}</div>`;

  toastContainer.appendChild(t);

  // show

  requestAnimationFrame(()=> t.classList.add('show'));

  // auto remove

  setTimeout(()=> {

    t.classList.remove('show');

    setTimeout(()=> t.remove(), 240);

  }, duration);

}

/* =========================

   Cloudinary upload helper

   ========================= */

async function uploadToCloudinary(file) {

  if(!file) return '';

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;

  const formData = new FormData();

  formData.append("file", file);

  formData.append("upload_preset", uploadPreset);

  const res = await fetch(url, { method: "POST", body: formData });

  if(!res.ok) {

    const text = await res.text();

    throw new Error(`Cloudinary upload failed: ${text}`);

  }

  const data = await res.json();

  return data.secure_url || '';

}

/* =========================

   Firestore: realtime listener

   ========================= */

const q = query(itemsCol, orderBy('date','desc'));

onSnapshot(q, (snapshot) => {

  state.items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  renderAll();

});

/* =========================

   UI wiring

   ========================= */

const drawer = qs('#drawer');

qs('#hamburger').addEventListener('click', ()=> drawer.classList.add('open'));

qs('#closeDrawer').addEventListener('click', ()=> drawer.classList.remove('open'));

qs('#clearAll').addEventListener('click', async ()=> {

  if(!confirm('Clear ALL data? This cannot be undone.')) return;

  for(const it of state.items){

    try { await deleteDoc(doc(db, "materialsRequests", it.id)); } catch(e){ console.error(e); }

  }

  showToast('All data cleared', {type:'info'});

});

qsa('.drawer-item').forEach(a => {

  a.addEventListener('click', e => { e.preventDefault(); drawer.classList.remove('open'); showSection(a.dataset.section); });

});

function showSection(id){

  qsa('.screen').forEach(s => s.classList.remove('active'));

  const el = qs('#'+id); if(el) el.classList.add('active');

  qsa('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.section===id));

  if(id === 'view') renderRequests(state.currentFilter);

  if(id === 'delivered') renderDelivered();

  if(id === 'remaining') renderRemaining();

  if(id === 'usage') renderUsage();

  if(id === 'home') updateHomeStats();

  document.querySelector('.content').scrollTop = 0;

}

qsa('.nav-item').forEach(b => b.addEventListener('click', ()=> showSection(b.dataset.section)));

showSection('home');

qs('#fab').addEventListener('click', ()=> showSection('submit'));

/* =========================

   Form submit (add new request)

   ========================= */

qs('#requestForm').addEventListener('submit', async (e) => {

  e.preventDefault();

  const title = qs('#title').value.trim();

  const qty = Number(qs('#quantity').value);

  const requester = qs('#requester').value.trim();

  const description = qs('#description').value.trim();

  const fileInput = qs('#materialImage');

  if(!title || !qty || !requester){ showToast('Please fill required fields', {type:'error'}); return; }

  // upload image if present

  let imageUrl = '';

  try {

    if(fileInput && fileInput.files && fileInput.files[0]) {

      showToast('Uploading image...', {type:'info', duration:2000});

      imageUrl = await uploadToCloudinary(fileInput.files[0]);

    }

  } catch(err){

    console.error(err);

    showToast('Image upload failed. Submit without image or try again.', {type:'error'});

    return;

  }

  const item = {

    title,

    requestedQty: qty,

    deliveredQty: 0,

    remainingQty: 0, // starts 0 until deliveries

    requester,

    description,

    date: nowISO(),

    status: 'Pending',

    imageUrl,

    usedQty: 0,

    usageHistory: [] // { date, qty, note }

  };

  try {

    await addDoc(itemsCol, item);

    e.target.reset();

    showToast('Request submitted', {type:'success'});

    showSection('view');

  } catch(err){

    console.error(err);

    showToast('Failed to submit request', {type:'error'});

  }

});

/* =========================

   Render helpers & status

   ========================= */

function computeStatus(i){

  if((i.requestedQty||0) === 0) return { text:'No Request', class:'pending' };

  if((i.deliveredQty||0) >= (i.requestedQty||0) && (i.requestedQty||0) > 0) return { text:'Completed', class:'completed' };

  if((i.deliveredQty||0) > 0 && (i.deliveredQty||0) < (i.requestedQty||0)) return { text:'Pending', class:'pending' };

  if((i.status||'').toLowerCase() === 'rejected') return { text:'Rejected', class:'rejected' };

  return { text:'Pending', class:'pending' };

}

/* ---------------- Render Requests ---------------- */

let currentRenderedFilter = 'all';

function renderRequests(filter='all'){

  currentRenderedFilter = filter;

  const list = qs('#requestsList'); list.innerHTML = '';

  qsa('.tab').forEach(t => t.classList.toggle('active', t.dataset.filter===filter));

  let arr = state.items.slice();

  if(filter !== 'all'){

    arr = arr.filter(i => {

      if(filter === 'delivered') return (i.deliveredQty||0) > 0;

      if(filter === 'completed') return (i.deliveredQty||0) >= (i.requestedQty||0) && (i.requestedQty||0) > 0;

      return (i.status || '').toLowerCase() === filter.toLowerCase();

    });

  }

  if(arr.length === 0){ list.innerHTML = '<p class="muted">No requests found.</p>'; return; }

  arr.forEach(i => {

    const div = document.createElement('div'); div.className = 'req';

    const st = computeStatus(i);

    div.innerHTML = `

      <div class="row">

        <div>

          <h3>${escapeHtml(i.title)}</h3>

          <small>${escapeHtml(i.requester)} • ${new Date(i.date).toLocaleString()}</small>

        </div>

        <div><div class="badge ${st.class}">${st.text}</div></div>

      </div>

      <div><small>Requested: ${i.requestedQty || 0} • Delivered: ${i.deliveredQty || 0} • Remaining: ${i.remainingQty || 0} • Used: ${i.usedQty || 0}</small></div>

      ${i.description ? `<p>${escapeHtml(i.description)}</p>` : ''}

      ${i.imageUrl ? `<div><img src="${escapeHtml(i.imageUrl)}" style="max-width:120px;border-radius:8px;margin-top:6px" alt="image" /></div>` : ''}

      <div class="actions">

        <button class="btn" data-act="deliver" data-id="${i.id}">Deliver</button>

        <button class="btn" data-act="record" data-id="${i.id}">Record Usage</button>

        <button class="btn" data-act="approve" data-id="${i.id}">Approve</button>

        <button class="btn" data-act="reject" data-id="${i.id}">Reject</button>

        <button class="btn" data-act="delete" data-id="${i.id}">Delete</button>

        <button class="btn" data-act="goto" data-id="${i.id}">Open</button>

      </div>

    `;

    list.appendChild(div);

  });

}

qsa('.tab').forEach(t => t.addEventListener('click', ()=> renderRequests(t.dataset.filter)));

/* ------------- Request actions (delegate) ------------- */

qs('#requestsList').addEventListener('click', async (e) => {

  const btn = e.target.closest('button[data-act]');

  if(!btn) return;

  const id = btn.dataset.id;

  const act = btn.dataset.act;

  const it = state.items.find(x => x.id === id);

  if(!it) return;

  if(act === 'delete'){ 

    if(!confirm('Delete this request?')) return;

    try { await deleteDoc(doc(db, "materialsRequests", id)); showToast('Deleted', {type:'info'}); } catch(e){ console.error(e); showToast('Failed to delete', {type:'error'}); }

    return; 

  }

  if(act === 'approve'){ 

    try { await updateDoc(doc(db, "materialsRequests", id), { status: 'Approved' }); showToast('Approved', {type:'success'}); } 

    catch(e){ console.error(e); showToast('Failed', {type:'error'}); }

    return; 

  }

  if(act === 'reject'){ 

    try { await updateDoc(doc(db, "materialsRequests", id), { status: 'Rejected' }); showToast('Rejected', {type:'info'}); } 

    catch(e){ console.error(e); showToast('Failed', {type:'error'}); }

    return; 

  }

  if(act === 'goto'){ if(it.remainingQty > 0) showSection('remaining'); else showSection('delivered'); return; }

  if(act === 'record'){

    const avail = it.remainingQty || 0;

    if(avail <= 0){ showToast('No remaining stock to deduct. Use Deliver to add stock.', {type:'info'}); return; }

    const input = prompt(`Record usage for "${it.title}" (available: ${avail})`, 1);

    if(input === null) return;

    const n = Number(input); if(isNaN(n) || n <= 0){ showToast('Invalid', {type:'error'}); return; }

    const deduct = Math.min(n, avail);

    const newRemaining = Math.max(0, (it.remainingQty || 0) - deduct);

    const newUsedQty = (it.usedQty || 0) + deduct;

    const newUsageHistory = (it.usageHistory || []).slice();

    newUsageHistory.push({ date: nowISO(), qty: deduct, note: `Usage recorded` });

    // Keep record even if remaining becomes 0 — we store usedQty and usageHistory

    const newStatus = (it.deliveredQty || 0) >= (it.requestedQty || 0) || newRemaining <= 0 ? 'Completed' : 'Pending';

    try {

      await updateDoc(doc(db, "materialsRequests", id), { remainingQty: newRemaining, usedQty: newUsedQty, usageHistory: newUsageHistory, status: newStatus });

      showToast(`Deducted ${deduct} from ${it.title}`, {type:'success'});

    } catch(err){

      console.error(err); showToast('Failed to record usage', {type:'error'});

    }

    return;

  }

  if(act === 'deliver'){

    const promptMsg = `Enter delivered quantity for "${it.title}" (add only):`;

    const input = prompt(promptMsg, 1);

    if(input === null) return;

    const n = Number(input); if(isNaN(n) || n <= 0){ showToast('Invalid', {type:'error'}); return; }

    const deliveredNow = n;

    const newDelivered = (it.deliveredQty || 0) + deliveredNow;

    const newRemaining = (it.remainingQty || 0) + deliveredNow;

    // Status logic per your request:

    // If deliveredQty >= requestedQty -> Completed

    // Else -> Pending (partial remains pending)

    const newStatus = (newDelivered >= (it.requestedQty || 0) && (it.requestedQty||0) > 0) ? 'Completed' : 'Pending';

    try {

      await updateDoc(doc(db, "materialsRequests", id), {

        deliveredQty: newDelivered,

        remainingQty: newRemaining,

        status: newStatus

      });

      showToast(`Delivered ${deliveredNow} pcs for ${it.title}`, {type:'success'});

    } catch(err){

      console.error(err); showToast('Failed to update delivery', {type:'error'});

    }

    return;

  }

});

/* ------------- Delivered view ------------- */

function renderDelivered(){

  const out = qs('#deliveredList'); out.innerHTML = '';

  const arr = state.items.filter(i => i.deliveredQty > 0).sort((a,b)=> b.date.localeCompare(a.date));

  if(arr.length === 0){ out.innerHTML = '<p class="muted">No delivered items yet.</p>'; return; }

  arr.forEach(i => {

    const div = document.createElement('div'); div.className = 'req';

    div.innerHTML = `

      <div class="row">

        <div><h3>${escapeHtml(i.title)}</h3><small>${escapeHtml(i.requester)}</small></div>

        <div><div class="badge delivered">Delivered: ${i.deliveredQty}</div></div>

      </div>

      <div><small>Requested: ${i.requestedQty} • Remaining: ${i.remainingQty} • Used: ${i.usedQty || 0}</small></div>

      ${i.description ? `<p>${escapeHtml(i.description)}</p>` : ''}

      ${i.imageUrl ? `<div><img src="${escapeHtml(i.imageUrl)}" style="max-width:120px;border-radius:8px;margin-top:6px" alt="image" /></div>` : ''}

    `;

    out.appendChild(div);

  });

}

/* ------------- Remaining view ------------- */

function renderRemaining(){

  const out = qs('#remainingList'); out.innerHTML = '';

  const arr = state.items.filter(i => i.remainingQty > 0).sort((a,b)=> a.title.localeCompare(b.title));

  if(arr.length === 0){ out.innerHTML = '<p class="muted">No remaining items.</p>'; return; }

  arr.forEach(i => {

    const div = document.createElement('div'); div.className = 'req';

    const st = computeStatus(i);

    div.innerHTML = `

      <div class="row">

        <div><h3>${escapeHtml(i.title)}</h3><small>${escapeHtml(i.requester)}</small></div>

        <div><div class="badge ${st.class}">${st.text}</div></div>

      </div>

      <div><small>Remaining: ${i.remainingQty} • Requested: ${i.requestedQty} • Delivered: ${i.deliveredQty} • Used: ${i.usedQty || 0}</small></div>

      ${i.imageUrl ? `<div><img src="${escapeHtml(i.imageUrl)}" style="max-width:120px;border-radius:8px;margin-top:6px" alt="image" /></div>` : ''}

      <div class="actions">

        <button class="btn" data-act="use" data-id="${i.id}">Record Usage</button>

        <button class="btn" data-act="deliver" data-id="${i.id}">Deliver More</button>

        <button class="btn" data-act="delete" data-id="${i.id}">Delete</button>

      </div>

    `;

    out.appendChild(div);

  });

}

qs('#remainingList').addEventListener('click', async (e) => {

  const b = e.target.closest('button[data-act]');

  if(!b) return;

  const act = b.dataset.act; const id = b.dataset.id; const it = state.items.find(x => x.id === id);

  if(!it) return;

  if(act === 'delete'){ if(!confirm('Delete this request?')) return; try { await deleteDoc(doc(db, "materialsRequests", id)); showToast('Deleted', {type:'info'}); } catch(e){ console.error(e); showToast('Failed', {type:'error'}); } return; }

  if(act === 'deliver'){

    const input = prompt(`Deliver additional quantity for "${it.title}" (will increase delivered and remaining).`, 1);

    if(input === null) return;

    const n = Number(input); if(isNaN(n) || n <= 0){ showToast('Invalid', {type:'error'}); return; }

    const newDelivered = (it.deliveredQty || 0) + n;

    const newRemaining = (it.remainingQty || 0) + n;

    const newStatus = (newDelivered >= (it.requestedQty || 0) && (it.requestedQty||0)>0) ? 'Completed' : 'Pending';

    try {

      await updateDoc(doc(db, "materialsRequests", id), { deliveredQty: newDelivered, remainingQty: newRemaining, status: newStatus });

      showToast(`Delivered ${n} pcs`, {type:'success'});

    } catch(e){ console.error(e); showToast('Failed', {type:'error'}); }

    return;

  }

  if(act === 'use'){

    const avail = it.remainingQty || 0;

    if(avail <= 0){ showToast('No remaining stock to deduct.', {type:'info'}); return; }

    const input = prompt(`Record usage for "${it.title}" (available: ${avail})`, 1);

    if(input === null) return;

    const n = Number(input); if(isNaN(n) || n <= 0){ showToast('Invalid', {type:'error'}); return; }

    const deduct = Math.min(n, avail);

    const newRemaining = Math.max(0, (it.remainingQty || 0) - deduct);

    const newUsedQty = (it.usedQty || 0) + deduct;

    const newUsageHistory = (it.usageHistory || []).slice();

    newUsageHistory.push({ date: nowISO(), qty: deduct, note: 'Usage recorded via remaining list' });

    const newStatus = (it.deliveredQty || 0) >= (it.requestedQty || 0) || newRemaining <= 0 ? 'Completed' : 'Pending';

    try {

      await updateDoc(doc(db, "materialsRequests", id), { remainingQty: newRemaining, usedQty: newUsedQty, usageHistory: newUsageHistory, status: newStatus });

      showToast(`Deducted ${deduct}`, {type:'success'});

    } catch(e){ console.error(e); showToast('Failed', {type:'error'}); }

    return;

  }

});

/* ------------- Usage / Reports ------------- */

function renderUsage(){

  const el = qs('#usageSummary'); el.innerHTML = '';

  if(state.items.length === 0){ el.innerHTML = '<p class="muted">No data to summarize.</p>'; return; }

  const totalRequested = state.items.reduce((s,i)=> s + (i.requestedQty||0),0);

  const totalDelivered = state.items.reduce((s,i)=> s + (i.deliveredQty||0),0);

  const totalRemaining = state.items.reduce((s,i)=> s + (i.remainingQty||0),0);

  const totalUsed = state.items.reduce((s,i)=> s + (i.usedQty||0),0);

  el.innerHTML = `<p><strong>Total requested:</strong> ${totalRequested}</p>

                  <p><strong>Total delivered:</strong> ${totalDelivered}</p>

                  <p><strong>Remaining:</strong> ${totalRemaining}</p>

                  <p><strong>Used (total):</strong> ${totalUsed}</p>`;

  const byMaterial = state.items.reduce((acc,i)=>{

    const k = i.title || 'Unknown';

    if(!acc[k]) acc[k] = { req:0, del:0, rem:0, used:0 };

    acc[k].req += i.requestedQty || 0;

    acc[k].del += i.deliveredQty || 0;

    acc[k].rem += i.remainingQty || 0;

    acc[k].used += i.usedQty || 0;

    return acc;

  }, {});

  const list = document.createElement('div'); list.style.marginTop='12px';

  Object.entries(byMaterial).forEach(([k,v])=>{

    const p = document.createElement('div');

    p.style.display='flex'; p.style.justifyContent='space-between'; p.style.alignItems='center'; p.style.marginBottom='8px';

    p.innerHTML = `<div><strong>${escapeHtml(k)}</strong><div style="font-size:13px;color:var(--muted)">Requested: ${v.req} • Delivered: ${v.del} • Remaining: ${v.rem} • Used: ${v.used}</div></div>

                   <div><button class="btn" data-material="${escapeHtml(k)}">Deduct</button></div>`;

    list.appendChild(p);

  });

  el.appendChild(list);

}

/* Deduct by material across docs (FIFO oldest first) */
qs('#usageSummary').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-material]');
  if(!btn) return;
  const mat = btn.dataset.material;
  const matching = state.items.filter(i => i.title === mat && (i.remainingQty || 0) > 0).sort((a,b)=> a.date.localeCompare(b.date));
  const totalRem = matching.reduce((s,i)=> s + (i.remainingQty||0),0);
  if(totalRem <= 0){ showToast('No remaining quantity for this material', {type:'info'}); return; }
  const input = prompt(`Deduct from "${mat}" (available: ${totalRem}). Enter qty used:`, 1);
  if(input === null) return;
  const n = Number(input); if(isNaN(n) || n <= 0){ showToast('Invalid', {type:'error'}); return; }
  let remainingToDeduct = Math.min(n, totalRem);
  for(const it of matching){
    if(remainingToDeduct <= 0) break;
    const take = Math.min(it.remainingQty || 0, remainingToDeduct);
    const newRemaining = Math.max(0, (it.remainingQty || 0) - take);
    const newUsedQty = (it.usedQty || 0) + take;
    const newUsageHistory = (it.usageHistory || []).slice();
    newUsageHistory.push({ date: nowISO(), qty: take, note: `Bulk deduct for ${mat}` });
    const newStatus = (it.deliveredQty || 0) >= (it.requestedQty || 0) || newRemaining <= 0 ? 'Completed' : 'Pending';
    try {
      await updateDoc(doc(db, "materialsRequests", it.id), { remainingQty: newRemaining, usedQty: newUsedQty, usageHistory: newUsageHistory, status: newStatus });
    } catch(e){ console.error(e); showToast('Partial failure while deducting', {type:'error'}); }
    remainingToDeduct -= take;
  }
  showToast(`Deducted ${n - remainingToDeduct} from "${mat}"`, {type:'success'});
});

/* ------------- CSV Export ------------- */
qs('#exportCsv').addEventListener('click', ()=> {
  if(state.items.length === 0){ showToast('No data to export', {type:'info'}); return; }
  const rows = [['Title','RequestedQty','DeliveredQty','RemainingQty','UsedQty','Requester','Description','Date','Status','ImageUrl']];
  state.items.forEach(i=> rows.push([i.title,i.requestedQty,i.deliveredQty,i.remainingQty,i.usedQty,i.requester,(i.description||''),i.date,i.status,i.imageUrl||'']));
  const csv = rows.map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'materials.csv'; a.click(); URL.revokeObjectURL(url);
  showToast('CSV exported', {type:'success'});
});

/* ------------- Print All ------------- */
qs('#printAll').addEventListener('click', ()=> {
  if(state.items.length === 0){ showToast('No items to print', {type:'info'}); return; }
  let html = `<div id="printTable"><h2 style="text-align:center;">Materials Request Report</h2><table><thead>
    <tr><th>#</th><th>Material</th><th>Requested</th><th>Delivered</th><th>Remaining</th><th>Used</th><th>Requester</th><th>Status</th><th>Date</th></tr>
    </thead><tbody>`;
  state.items.forEach((i, idx) => {
    html += `<tr>
      <td>${idx+1}</td>
      <td>${escapeHtml(i.title)}</td>
      <td>${i.requestedQty||0}</td>
      <td>${i.deliveredQty||0}</td>
      <td>${i.remainingQty||0}</td>
      <td>${i.usedQty||0}</td>
      <td>${escapeHtml(i.requester)}</td>
      <td>${escapeHtml(i.status || computeStatus(i).text)}</td>
      <td>${new Date(i.date).toLocaleString()}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  const printWin = window.open('', '', 'width=1000,height=700');
  printWin.document.write(`<html><head><title>Print Materials Report</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:6px;font-size:13px}th{background:#eee}h2{text-align:center;margin-bottom:10px}</style></head><body>${html}</body></html>`);
  printWin.document.close();
  printWin.focus();
  printWin.print();
  showToast('Print dialog opened', {type:'info'});
});

/* ------------- Search overlay ------------- */
const searchOverlay = qs('#searchOverlay');
const searchInput = qs('#searchInput');
const searchBtn = qs('#searchBtn');
const closeSearch = qs('#closeSearch');
const searchResults = qs('#searchResults');

function openSearch(){ searchOverlay.classList.remove('hidden'); searchInput.value=''; searchResults.innerHTML = '<p class="muted">Type to search by material or requester...</p>'; setTimeout(()=> searchInput.focus(),60); }
function closeSearchOverlay(){ searchOverlay.classList.add('hidden'); }

searchBtn.addEventListener('click', openSearch);
closeSearch.addEventListener('click', closeSearchOverlay);
searchOverlay.addEventListener('click', (e)=> { if(e.target === searchOverlay) closeSearchOverlay(); });

searchInput.addEventListener('input', ()=>{
  const q = searchInput.value.trim().toLowerCase();
  if(q === ''){ searchResults.innerHTML = '<p class="muted">Type to search by material or requester...</p>'; return; }
  const matches = state.items.filter(i=> (i.title||'').toLowerCase().includes(q) || (i.requester||'').toLowerCase().includes(q));
  if(matches.length === 0){ searchResults.innerHTML = '<p class="muted">No matches</p>'; return; }
  searchResults.innerHTML = '';
  matches.forEach(i => {
    const d = document.createElement('div'); d.className = 'req';
    const st = computeStatus(i);
    d.innerHTML = `<div class="row"><div><strong>${escapeHtml(i.title)}</strong><div style="font-size:13px;color:var(--muted)">${escapeHtml(i.requester)} • ${st.text}</div></div>
                   <div><div class="badge ${st.class}">${st.text}</div></div></div>
                   <div style="margin-top:6px"><small>Requested: ${i.requestedQty || 0} • Delivered: ${i.deliveredQty || 0} • Remaining: ${i.remainingQty || 0}</small></div>`;
    d.style.cursor = 'pointer';
    d.addEventListener('click', ()=> {
      closeSearchOverlay();
      if(i.remainingQty > 0) showSection('remaining'); else showSection('delivered');
      setTimeout(()=> {
        const allReqs = Array.from(document.querySelectorAll('.req'));
        const el = allReqs.find(elm => elm.innerText.includes(i.title) && elm.innerText.includes(i.requester));
        if(el) { el.style.boxShadow = '0 0 0 3px rgba(30,136,229,0.12)'; setTimeout(()=> el.style.boxShadow = '', 1800); }
      }, 300);
    });
    searchResults.appendChild(d);
  });
});

/* ------------- Home stats ------------- */
function updateHomeStats(){
  const el = qs('#homeStats');
  const total = state.items.length;
  const pending = state.items.filter(i=> (i.status||'')==='Pending').length;
  const partial = state.items.filter(i=> (i.deliveredQty||0) > 0 && (i.deliveredQty||0) < (i.requestedQty||0)).length;
  const deliveredCount = state.items.filter(i=> (i.deliveredQty||0) > 0).length;
  const completed = state.items.filter(i=> (i.status||'')==='Completed').length;
  el.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">
    <div class="card" style="padding:8px"><strong>Total</strong><div>${total}</div></div>
    <div class="card" style="padding:8px;background:#fff6db"><strong>Pending</strong><div>${pending}</div></div>
    <div class="card" style="padding:8px;background:#e8f5e9"><strong>Delivered Items</strong><div>${deliveredCount}</div></div>
    <div class="card" style="padding:8px;background:#e7f0ff"><strong>Partial</strong><div>${partial}</div></div>
    <div class="card" style="padding:8px;background:#dcd6f7"><strong>Completed</strong><div>${completed}</div></div>
  </div>`;
}

/* ------------- Render All ------------- */
function renderAll(){
  renderRequests(currentRenderedFilter || 'all');
  renderDelivered();
  renderRemaining();
  renderUsage();
  updateHomeStats();
}
renderAll();