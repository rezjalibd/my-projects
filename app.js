'use strict';
/* My Projects panel — frontend for GitHub Pages.
   No project data is stored in the repo or the browser: every read/write
   goes to the Cloudflare Worker API. Only the panel password is kept in
   sessionStorage (cleared when the tab closes). */
const API = 'https://my-projects-api.rezajalilibd.workers.dev';
const STATUSES = ['جدید', 'در حال انجام', 'در انتظار', 'تکمیل‌شده', 'لغوشده'];
const SETTLEMENTS = ['تسویه‌نشده', 'تسویه جزئی', 'تسویه‌شده'];

let pw = sessionStorage.getItem('mp_pw') || '';
let projects = [];
let current = null;
let wiz = null;
let wizStep = 1;

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const faNum = (v) => {
  if (v === '' || v == null) return '—';
  const n = Number(String(v).replace(/[^\d]/g, ''));
  return Number.isNaN(n) ? esc(v) : n.toLocaleString('fa-IR');
};
const todayShamsi = () => {
  try { return new Date().toLocaleDateString('fa-IR'); } catch (e) { return ''; }
};

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + pw },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) { showLogin('رمز اشتباه است — دوباره وارد شوید'); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function showLogin(msg) {
  $('#login-view').hidden = false;
  $('#app-view').hidden = true;
  if (msg) { const e = $('#login-error'); e.textContent = msg; e.hidden = false; }
}
function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#login-error').hidden = true;
}

async function loadProjects() {
  const data = await api('GET', '/api/projects');
  projects = data.projects || [];
  renderList();
}

function statusClass(s) {
  return { 'جدید': 'st-new', 'در حال انجام': 'st-doing', 'در انتظار': 'st-wait', 'تکمیل‌شده': 'st-done', 'لغوشده': 'st-cancel' }[s] || 'st-new';
}

function renderList() {
  $('#detail-view').hidden = true;
  $('#list-view').hidden = false;
  const grid = $('#project-grid');
  if (!projects.length) {
    grid.innerHTML = '<div class="empty">هنوز پروژه‌ای ثبت نشده است — با دکمه «پروژه جدید» اولین پروژه را بسازید.</div>';
    return;
  }
  grid.innerHTML = projects.map((p) => `
    <article class="card" data-id="${esc(p.id)}">
      <div class="card-top"><h3>${esc(p.name)}</h3><span class="chip ${statusClass(p.status)}">${esc(p.status)}</span></div>
      <div class="card-client">${esc(p.client || '—')}</div>
      <dl>
        <div><dt>تحویل</dt><dd>${esc(p.deliveryDate || '—')}</dd></div>
        <div><dt>مبلغ</dt><dd>${faNum(p.amount)} تومان</dd></div>
        <div><dt>تسویه</dt><dd>${esc(p.settlement || '—')}</dd></div>
      </dl>
      <div class="card-next"><span>قدم بعدی:</span> ${esc(p.nextStep || '—')}</div>
      <div class="card-meta">${(p.tasks || []).filter((t) => t.done).length}/${(p.tasks || []).length} کار انجام‌شده</div>
    </article>`).join('');
  $$('.card', grid).forEach((c) => c.addEventListener('click', () => openDetail(c.dataset.id)));
}

async function openDetail(id) {
  const data = await api('GET', '/api/projects/' + encodeURIComponent(id));
  current = data.project;
  renderDetail();
  $('#list-view').hidden = true;
  $('#detail-view').hidden = false;
  window.scrollTo(0, 0);
}

function renderDetail() {
  const p = current;
  $('#detail-view').innerHTML = `
    <button class="btn ghost" id="back-btn">→ بازگشت به لیست</button>
    <div class="detail-head">
      <input id="f-name" value="${esc(p.name)}" placeholder="نام پروژه">
      <span class="chip ${statusClass(p.status)}">${esc(p.status)}</span>
    </div>
    <div class="form-grid">
      <label>کارفرما<input id="f-client" value="${esc(p.client)}"></label>
      <label>وضعیت<select id="f-status">${STATUSES.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>تاریخ تحویل (شمسی)<input id="f-date" value="${esc(p.deliveryDate)}" placeholder="۱۴۰۵/۰۹/۰۴"></label>
      <label>مبلغ (تومان)<input id="f-amount" value="${esc(p.amount)}" inputmode="numeric"></label>
      <label>تسویه<select id="f-settle">${SETTLEMENTS.map((s) => `<option ${s === p.settlement ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="wide">قدم بعدی<input id="f-next" value="${esc(p.nextStep)}"></label>
    </div>
    <div class="detail-actions">
      <button class="btn primary" id="save-btn">ذخیره تغییرات</button>
      <button class="btn danger" id="delete-btn">حذف پروژه</button>
    </div>
    <section class="block">
      <h3>چک‌لیست کارها</h3>
      <div id="task-list">${(p.tasks || []).map((t) => `
        <label class="task"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''}><span class="${t.done ? 'done' : ''}">${esc(t.text)}</span><button class="mini danger" data-del-task="${esc(t.id)}" type="button">✕</button></label>`).join('') || '<div class="muted">کاری ثبت نشده است.</div>'}</div>
      <div class="add-row"><input id="new-task" placeholder="کار جدید…"><button class="btn" id="add-task-btn" type="button">افزودن</button></div>
    </section>
    <section class="block">
      <h3>یادداشت‌ها</h3>
      <div id="note-list">${(p.notes || []).map((n) => `
        <div class="note"><div>${esc(n.text)}</div><div class="muted">${esc(n.createdAt || '')}</div><button class="mini danger" data-del-note="${esc(n.id)}" type="button">حذف</button></div>`).join('') || '<div class="muted">یادداشتی ثبت نشده است.</div>'}</div>
      <div class="add-row"><input id="new-note" placeholder="یادداشت جدید…"><button class="btn" id="add-note-btn" type="button">افزودن</button></div>
    </section>
    <section class="block">
      <h3>لینک‌ها</h3>
      <div id="link-list">${(p.links || []).map((l) => `
        <div class="link-row"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a><span class="muted">${esc(l.url)}</span><button class="mini danger" data-del-link="${esc(l.id)}" type="button">حذف</button></div>`).join('') || '<div class="muted">لینکی ثبت نشده است.</div>'}</div>
      <div class="add-row"><input id="new-link-title" placeholder="عنوان لینک"><input id="new-link-url" placeholder="https://…" dir="ltr"><button class="btn" id="add-link-btn" type="button">افزودن</button></div>
    </section>`;
  $('#back-btn').addEventListener('click', () => { current = null; renderList(); });
  $('#save-btn').addEventListener('click', saveDetail);
  $('#delete-btn').addEventListener('click', deleteCurrent);
  $$('#task-list input[type=checkbox]').forEach((cb) => cb.addEventListener('change', async () => {
    const t = current.tasks.find((x) => x.id === cb.dataset.task);
    if (t) { t.done = cb.checked; await saveProject(); }
  }));
  $$('#task-list [data-del-task]').forEach((b) => b.addEventListener('click', async () => {
    current.tasks = current.tasks.filter((x) => x.id !== b.dataset.delTask);
    await saveProject();
  }));
  $('#add-task-btn').addEventListener('click', async () => {
    const v = $('#new-task').value.trim(); if (!v) return;
    current.tasks.push({ id: uid(), text: v, done: false });
    await saveProject();
  });
  $$('#note-list [data-del-note]').forEach((b) => b.addEventListener('click', async () => {
    current.notes = current.notes.filter((x) => x.id !== b.dataset.delNote);
    await saveProject();
  }));
  $('#add-note-btn').addEventListener('click', async () => {
    const v = $('#new-note').value.trim(); if (!v) return;
    current.notes.push({ id: uid(), text: v, createdAt: todayShamsi() });
    await saveProject();
  });
  $$('#link-list [data-del-link]').forEach((b) => b.addEventListener('click', async () => {
    current.links = current.links.filter((x) => x.id !== b.dataset.delLink);
    await saveProject();
  }));
  $('#add-link-btn').addEventListener('click', async () => {
    const title = $('#new-link-title').value.trim();
    const url = $('#new-link-url').value.trim(); if (!url) return;
    current.links.push({ id: uid(), title: title || url, url });
    await saveProject();
  });
}

function readDetailFields() {
  current.name = $('#f-name').value.trim();
  current.client = $('#f-client').value.trim();
  current.status = $('#f-status').value;
  current.deliveryDate = $('#f-date').value.trim();
  current.amount = $('#f-amount').value.trim();
  current.settlement = $('#f-settle').value;
  current.nextStep = $('#f-next').value.trim();
}

async function saveDetail() {
  readDetailFields();
  if (!current.name) { alert('نام پروژه را وارد کنید'); return; }
  await saveProject();
  alert('ذخیره شد');
}

async function saveProject() {
  const data = await api('PUT', '/api/projects/' + encodeURIComponent(current.id), current);
  current = data.project;
  const i = projects.findIndex((p) => p.id === current.id);
  if (i >= 0) projects[i] = current;
  renderDetail();
}

async function deleteCurrent() {
  if (!confirm('پروژه «' + current.name + '» حذف شود؟')) return;
  await api('DELETE', '/api/projects/' + encodeURIComponent(current.id));
  current = null;
  await loadProjects();
}

function openWizard() {
  wiz = { name: '', client: '', status: 'جدید', deliveryDate: '', amount: '', settlement: 'تسویه‌نشده', nextStep: '', tasks: [], notes: [], links: [] };
  wizStep = 1;
  $('#wizard-modal').hidden = false;
  renderWizard();
}
function closeWizard() { $('#wizard-modal').hidden = true; wiz = null; }

function renderWizard() {
  const steps = [
    { title: 'نام و کارفرما', html: `
      <label>نام پروژه *<input id="w-name" value="${esc(wiz.name)}" placeholder="مثلاً: طراحی سایت فروشگاهی"></label>
      <label>کارفرما<input id="w-client" value="${esc(wiz.client)}" placeholder="نام مشتری یا شرکت"></label>` },
    { title: 'وضعیت و تاریخ تحویل', html: `
      <label>وضعیت<select id="w-status">${STATUSES.map((s) => `<option ${s === wiz.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>تاریخ تحویل (شمسی)<input id="w-date" value="${esc(wiz.deliveryDate)}" placeholder="۱۴۰۵/۰۹/۰۴"></label>` },
    { title: 'مبلغ و تسویه', html: `
      <label>مبلغ (تومان)<input id="w-amount" value="${esc(wiz.amount)}" inputmode="numeric" placeholder="مثلاً ۱۵۰۰۰۰۰۰"></label>
      <label>وضعیت تسویه<select id="w-settle">${SETTLEMENTS.map((s) => `<option ${s === wiz.settlement ? 'selected' : ''}>${s}</option>`).join('')}</select></label>` },
    { title: 'قدم بعدی', html: `
      <label>قدم بعدی چیست؟<input id="w-next" value="${esc(wiz.nextStep)}" placeholder="مثلاً: ارسال پیش‌فاکتور به مشتری"></label>` },
    { title: 'چک‌لیست کارها', html: `
      <div id="w-task-list">${wiz.tasks.map((t) => `<div class="task"><span>${esc(t.text)}</span><button class="mini danger" data-w-del-task="${esc(t.id)}" type="button">✕</button></div>`).join('') || '<div class="muted">هنوز کاری اضافه نشده است.</div>'}</div>
      <div class="add-row"><input id="w-new-task" placeholder="کار جدید…"><button class="btn" id="w-add-task" type="button">افزودن</button></div>` },
    { title: 'یادداشت و لینک‌ها', html: `
      <label>یادداشت اولیه<textarea id="w-note" rows="2" placeholder="یادداشت…">${esc(wiz.notes[0] ? wiz.notes[0].text : '')}</textarea></label>
      <div class="add-row"><input id="w-link-title" placeholder="عنوان لینک"><input id="w-link-url" placeholder="https://…" dir="ltr"><button class="btn" id="w-add-link" type="button">افزودن لینک</button></div>
      <div id="w-link-list">${wiz.links.map((l) => `<div class="link-row"><span>${esc(l.title)}</span><span class="muted">${esc(l.url)}</span><button class="mini danger" data-w-del-link="${esc(l.id)}" type="button">✕</button></div>`).join('')}</div>
      <div class="review">
        <div><b>پروژه:</b> ${esc(wiz.name)}${wiz.client ? ' — ' + esc(wiz.client) : ''}</div>
        <div><b>وضعیت:</b> ${esc(wiz.status)} | <b>تحویل:</b> ${esc(wiz.deliveryDate || '—')} | <b>مبلغ:</b> ${faNum(wiz.amount)} تومان | <b>تسویه:</b> ${esc(wiz.settlement)}</div>
        <div><b>قدم بعدی:</b> ${esc(wiz.nextStep || '—')} | <b>کارها:</b> ${wiz.tasks.length} | <b>لینک‌ها:</b> ${wiz.links.length}</div>
      </div>` },
  ];
  const s = steps[wizStep - 1];
  $('#wizard-body').innerHTML = `
    <div class="wiz-progress">مرحله ${wizStep} از ۶ — ${s.title}</div>
    <div class="wiz-dots">${steps.map((_, i) => `<span class="${i + 1 === wizStep ? 'on' : ''} ${i + 1 < wizStep ? 'done' : ''}"></span>`).join('')}</div>
    ${s.html}`;
  $('#wiz-back').style.visibility = wizStep === 1 ? 'hidden' : 'visible';
  $('#wiz-next').textContent = wizStep === 6 ? 'ثبت پروژه' : 'مرحله بعد';
  const addTask = $('#w-add-task');
  if (addTask) addTask.addEventListener('click', () => {
    const v = $('#w-new-task').value.trim(); if (!v) return;
    wiz.tasks.push({ id: uid(), text: v, done: false });
    collectWizard(); renderWizard();
  });
  $$('#wizard-body [data-w-del-task]').forEach((b) => b.addEventListener('click', () => {
    wiz.tasks = wiz.tasks.filter((x) => x.id !== b.dataset.wDelTask);
    collectWizard(); renderWizard();
  }));
  const addLink = $('#w-add-link');
  if (addLink) addLink.addEventListener('click', () => {
    const url = $('#w-link-url').value.trim(); if (!url) return;
    wiz.links.push({ id: uid(), title: $('#w-link-title').value.trim() || url, url });
    collectWizard(); renderWizard();
  });
  $$('#wizard-body [data-w-del-link]').forEach((b) => b.addEventListener('click', () => {
    wiz.links = wiz.links.filter((x) => x.id !== b.dataset.wDelLink);
    collectWizard(); renderWizard();
  }));
}

function collectWizard() {
  const g = (id) => { const el = $(id); return el ? el.value.trim() : ''; };
  if ($('#w-name')) wiz.name = g('#w-name');
  if ($('#w-client')) wiz.client = g('#w-client');
  if ($('#w-status')) wiz.status = $('#w-status').value;
  if ($('#w-date')) wiz.deliveryDate = g('#w-date');
  if ($('#w-amount')) wiz.amount = g('#w-amount');
  if ($('#w-settle')) wiz.settlement = $('#w-settle').value;
  if ($('#w-next')) wiz.nextStep = g('#w-next');
  if ($('#w-note')) {
    const v = g('#w-note');
    wiz.notes = v ? [{ id: (wiz.notes[0] && wiz.notes[0].id) || uid(), text: v, createdAt: todayShamsi() }] : [];
  }
}

async function wizardNext() {
  collectWizard();
  if (wizStep === 1 && !wiz.name) { alert('نام پروژه را وارد کنید'); return; }
  if (wizStep < 6) { wizStep++; renderWizard(); return; }
  const data = await api('POST', '/api/projects', wiz);
  closeWizard();
  await loadProjects();
  openDetail(data.project.id);
}

document.addEventListener('DOMContentLoaded', () => {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    pw = $('#password').value.trim();
    if (!pw) return;
    try {
      await api('GET', '/api/projects');
      sessionStorage.setItem('mp_pw', pw);
      showApp();
      await loadProjects();
    } catch (err) {
      if (err.message !== 'unauthorized') showLogin('خطا در اتصال — دوباره تلاش کنید');
    }
  });
  $('#logout-btn').addEventListener('click', () => {
    pw = ''; sessionStorage.removeItem('mp_pw');
    $('#password').value = '';
    showLogin();
  });
  $('#new-project-btn').addEventListener('click', openWizard);
  $('#wiz-close').addEventListener('click', closeWizard);
  $('#wiz-back').addEventListener('click', () => { collectWizard(); if (wizStep > 1) { wizStep--; renderWizard(); } });
  $('#wiz-next').addEventListener('click', wizardNext);
  if (pw) {
    api('GET', '/api/projects').then(() => { showApp(); loadProjects(); }).catch(() => showLogin());
  }
});
