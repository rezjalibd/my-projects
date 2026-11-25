'use strict';
/* My Projects panel — frontend for GitHub Pages.
   No project data is stored in the repo or the browser: every read/write
   goes to the Cloudflare Worker API. Only the panel password is kept in
   sessionStorage (cleared when the tab closes).
   Design and flow match the My Projects Space (prwjhhy-mn) exactly:
   same statuses, same list/detail/wizard structure, same tokens. */
const API = 'https://my-projects-api.rezajalilibd.workers.dev';

/* Space statuses (the Space's model) and their Worker values. */
const SPACE_STATUSES = [
  { key: 'idea', fa: 'ایده', worker: 'جدید', hint: 'ایده‌ای که هنوز شروع نشده' },
  { key: 'active', fa: 'در حال انجام', worker: 'در حال انجام', hint: 'پروژه در حال انجام است' },
  { key: 'paused', fa: 'متوقف', worker: 'در انتظار', hint: 'موقتاً متوقف شده' },
  { key: 'done', fa: 'تکمیل‌شده', worker: 'تکمیل‌شده', hint: 'به پایان رسیده' },
];
const SETTLEMENTS = ['تسویه‌نشده', 'تسویه جزئی', 'تسویه‌شده'];
const toSpaceKey = (w) => ({ 'جدید': 'idea', 'در حال انجام': 'active', 'در انتظار': 'paused', 'تکمیل‌شده': 'done', 'لغوشده': 'cancelled' }[w] || 'idea');
const toSpaceFa = (w) => ({ 'جدید': 'ایده', 'در حال انجام': 'در حال انجام', 'در انتظار': 'متوقف', 'تکمیل‌شده': 'تکمیل‌شده', 'لغوشده': 'لغوشده' }[w] || w);
const toWorkerStatus = (k) => (SPACE_STATUSES.find((s) => s.key === k) || {}).worker || 'جدید';
const chipClass = (w) => ({ 'جدید': 'st-idea', 'در حال انجام': 'st-active', 'در انتظار': 'st-paused', 'تکمیل‌شده': 'st-done', 'لغوشده': 'st-cancel' }[w] || 'st-idea');

let pw = sessionStorage.getItem('mp_pw') || '';
let projects = [];
let current = null;
let viewMode = true;
let query = '';
let filterStatus = 'all';
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
  try { return new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { return ''; }
};
const shamsiPlusDays = (days) => {
  try {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (e) { return ''; }
};
const normShamsi = (s) => {
  const fa = String(s || '').replace(/[0-9]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c]);
  const p = fa.trim().split('/');
  if (p.length !== 3) return fa;
  return p[0] + '/' + p[1].padStart(2, '۰') + '/' + p[2].padStart(2, '۰');
};
const isUrgent = (d) => d ? normShamsi(d) <= normShamsi(shamsiPlusDays(3)) : false;

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
  $('#wizard-view').hidden = true;
  if (msg) { const e = $('#login-error'); e.textContent = msg; e.hidden = false; }
}
function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#wizard-view').hidden = true;
  $('#login-error').hidden = true;
  $('#list-view').hidden = false;
  $('#detail-view').hidden = true;
}

async function loadProjects() {
  const data = await api('GET', '/api/projects');
  projects = data.projects || [];
  renderList();
}

function visibleProjects() {
  const q = query.trim();
  return projects.filter((p) => {
    if (filterStatus !== 'all' && toSpaceKey(p.status) !== filterStatus) return false;
    if (q && !((p.name || '') + ' ' + (p.client || '')).includes(q)) return false;
    return true;
  });
}

function renderSummary() {
  const box = $('#summary');
  if (!projects.length) { box.hidden = true; return; }
  box.hidden = false;
  $('#sum-total').textContent = projects.length.toLocaleString('fa-IR');
  $('#sum-doing').textContent = projects.filter((p) => toSpaceKey(p.status) === 'active').length.toLocaleString('fa-IR');
  $('#sum-done').textContent = projects.filter((p) => toSpaceKey(p.status) === 'done').length.toLocaleString('fa-IR');
}

function renderFilters() {
  const box = $('#filter-chips');
  const chips = [{ key: 'all', fa: 'همه' }].concat(SPACE_STATUSES);
  box.innerHTML = chips.map((c) => `<button class="fchip ${filterStatus === c.key ? 'on' : ''}" data-filter="${c.key}">${c.fa}</button>`).join('');
  $$('.fchip', box).forEach((b) => b.addEventListener('click', () => { filterStatus = b.dataset.filter; renderList(); }));
}

function renderList() {
  renderSummary();
  renderFilters();
  $('#detail-view').hidden = true;
  $('#list-view').hidden = false;
  const grid = $('#project-grid');
  const list = visibleProjects();
  if (!projects.length) {
    grid.innerHTML = '<div class="empty">هنوز پروژه‌ای تعریف نکرده‌ای<div><button class="btn primary" id="empty-new-btn">+ پروژه‌ی جدید</button></div></div>';
    $('#empty-new-btn').addEventListener('click', openWizard);
    return;
  }
  if (!list.length) {
    grid.innerHTML = '<div class="empty">پروژه‌ای با این مشخصات پیدا نشد.</div>';
    return;
  }
  grid.innerHTML = list.map((p) => {
    const done = (p.tasks || []).filter((t) => t.done).length;
    const total = (p.tasks || []).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `
    <button class="pcard" data-id="${esc(p.id)}">
      <div class="pcard-top"><h3>${esc(p.name)}</h3><span class="chip ${chipClass(p.status)}">${esc(toSpaceFa(p.status))}</span></div>
      <div class="pcard-client">${esc(p.client || '—')}</div>
      <div class="pcard-next"><b>قدم بعدی:</b> ${esc(p.nextStep || '—')}</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="pcard-meta ${isUrgent(p.deliveryDate) ? 'warn' : ''}">تحویل: ${esc(p.deliveryDate || '—')}</div>
      <div class="pcard-amount">مبلغ: ${faNum(p.amount)} تومان</div>
      <div class="pcard-meta">${done.toLocaleString('fa-IR')}/${total.toLocaleString('fa-IR')} کار انجام‌شده</div>
    </button>`;
  }).join('');
  $$('.pcard', grid).forEach((c) => c.addEventListener('click', () => openDetail(c.dataset.id)));
}

async function openDetail(id) {
  const data = await api('GET', '/api/projects/' + encodeURIComponent(id));
  current = data.project;
  viewMode = true;
  renderDetail();
  $('#list-view').hidden = true;
  $('#detail-view').hidden = false;
  window.scrollTo(0, 0);
}

function sectionsHtml(p) {
  return `
    <section class="block">
      <h3>چک‌لیست کارها</h3>
      <div class="tasklist">${(p.tasks || []).map((t) => `
        <label class="task"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''}><span class="${t.done ? 'done' : ''}">${esc(t.text)}</span><button class="mini danger" data-del-task="${esc(t.id)}" type="button">✕</button></label>`).join('') || '<div class="task"><span class="muted">کاری ثبت نشده است.</span></div>'}</div>
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
}

function bindSections() {
  $$('#detail-view .task input[type=checkbox]').forEach((cb) => cb.addEventListener('change', async () => {
    const t = current.tasks.find((x) => x.id === cb.dataset.task);
    if (t) { t.done = cb.checked; await saveProject(); }
  }));
  $$('#detail-view [data-del-task]').forEach((b) => b.addEventListener('click', async () => {
    current.tasks = current.tasks.filter((x) => x.id !== b.dataset.delTask);
    await saveProject();
  }));
  $('#add-task-btn').addEventListener('click', async () => {
    const v = $('#new-task').value.trim(); if (!v) return;
    current.tasks.push({ id: uid(), text: v, done: false });
    await saveProject();
  });
  $$('#detail-view [data-del-note]').forEach((b) => b.addEventListener('click', async () => {
    current.notes = current.notes.filter((x) => x.id !== b.dataset.delNote);
    await saveProject();
  }));
  $('#add-note-btn').addEventListener('click', async () => {
    const v = $('#new-note').value.trim(); if (!v) return;
    current.notes.push({ id: uid(), text: v, createdAt: todayShamsi() });
    await saveProject();
  });
  $$('#detail-view [data-del-link]').forEach((b) => b.addEventListener('click', async () => {
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

function renderDetail() {
  const p = current;
  const view = $('#detail-view');
  if (viewMode) {
    view.innerHTML = `
    <div class="detail-head">
      <button class="back-btn" id="back-btn">← همه‌ی پروژه‌ها</button>
      <span class="spacer"></span>
      <button class="back-btn" id="edit-btn">ویرایش پروژه</button>
    </div>
    <div class="pcard-top"><h2 class="detail-title">${esc(p.name)}</h2><span class="chip ${chipClass(p.status)}">${esc(toSpaceFa(p.status))}</span></div>
    <dl class="info-grid">
      <div class="info-card"><dt>کارفرما</dt><dd>${esc(p.client || '—')}</dd></div>
      <div class="info-card"><dt>تاریخ تحویل</dt><dd>${esc(p.deliveryDate || '—')}</dd></div>
      <div class="info-card"><dt>مبلغ</dt><dd>${faNum(p.amount)} تومان</dd></div>
      <div class="info-card"><dt>تسویه</dt><dd>${esc(p.settlement || '—')}</dd></div>
    </dl>
    <div class="next-box"><b>قدم بعدی:</b> ${esc(p.nextStep || '—')}</div>
    ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ''}
    ${sectionsHtml(p)}`;
    $('#back-btn').addEventListener('click', () => { current = null; renderList(); });
    $('#edit-btn').addEventListener('click', () => { viewMode = false; renderDetail(); });
  } else {
    const key = toSpaceKey(p.status);
    const opts = SPACE_STATUSES.map((s) => `<option value="${s.key}" ${s.key === key ? 'selected' : ''}>${s.fa}</option>`).join('')
      + (key === 'cancelled' ? '<option value="cancelled" selected>لغوشده</option>' : '');
    view.innerHTML = `
    <div class="detail-head">
      <button class="back-btn" id="back-btn">← بازگشت</button>
      <span class="spacer"></span>
    </div>
    <div class="pcard-top"><input id="f-name" class="detail-title-input" value="${esc(p.name)}" placeholder="نام پروژه"><span class="chip ${chipClass(p.status)}" id="f-chip">${esc(toSpaceFa(p.status))}</span></div>
    <dl class="info-grid">
      <div class="info-card"><dt>کارفرما</dt><dd><input id="f-client" value="${esc(p.client)}"></dd></div>
      <div class="info-card"><dt>وضعیت</dt><dd><select id="f-status">${opts}</select></dd></div>
      <div class="info-card"><dt>تاریخ تحویل (شمسی)</dt><dd><input id="f-date" value="${esc(p.deliveryDate)}" placeholder="۱۴۰۵/۰۹/۰۴"></dd></div>
      <div class="info-card"><dt>مبلغ (تومان)</dt><dd><input id="f-amount" value="${esc(p.amount)}" inputmode="numeric"></dd></div>
      <div class="info-card"><dt>تسویه</dt><dd><select id="f-settle">${SETTLEMENTS.map((s) => `<option ${s === p.settlement ? 'selected' : ''}>${s}</option>`).join('')}</select></dd></div>
    </dl>
    <div class="next-box"><b>قدم بعدی:</b><input id="f-next" value="${esc(p.nextStep)}"></div>
    <div class="detail-actions">
      <button class="btn primary" id="save-btn">ذخیره تغییرات</button>
      <button class="btn danger" id="delete-btn">حذف پروژه</button>
    </div>
    ${sectionsHtml(p)}`;
    $('#back-btn').addEventListener('click', () => { viewMode = true; renderDetail(); });
    $('#f-status').addEventListener('change', (e) => {
      const k = e.target.value;
      const chip = $('#f-chip');
      const w = k === 'cancelled' ? 'لغوشده' : toWorkerStatus(k);
      chip.className = 'chip ' + chipClass(w);
      chip.textContent = toSpaceFa(w);
    });
    $('#save-btn').addEventListener('click', saveDetail);
    $('#delete-btn').addEventListener('click', deleteCurrent);
  }
  bindSections();
}

function readDetailFields() {
  current.name = $('#f-name').value.trim();
  current.client = $('#f-client').value.trim();
  const k = $('#f-status').value;
  current.status = k === 'cancelled' ? 'لغوشده' : toWorkerStatus(k);
  current.deliveryDate = $('#f-date').value.trim();
  current.amount = $('#f-amount').value.trim();
  current.settlement = $('#f-settle').value;
  current.nextStep = $('#f-next').value.trim();
}

async function saveDetail() {
  readDetailFields();
  if (!current.name) { alert('نام پروژه را وارد کنید'); return; }
  await saveProject();
  viewMode = true;
  renderDetail();
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

/* ---------- wizard (full-screen view, like the Space) ---------- */
const WIZ_STEPS = [
  { title: 'اطلاعات پایه', desc: 'نام پروژه و کارفرما را وارد کنید.' },
  { title: 'وضعیت و زمان تحویل', desc: 'وضعیت پروژه و تاریخ تحویل شمسی را مشخص کنید.' },
  { title: 'مبلغ و تسویه', desc: 'مبلغ قرارداد و وضعیت تسویه را وارد کنید.' },
  { title: 'قدم بعدی و کارهای اول', desc: 'قدم بعدی چیست و چه کارهایی در پیش است؟' },
  { title: 'یادداشت و لینک‌ها', desc: 'یادداشت اولیه و لینک‌های مرتبط را اضافه کنید.' },
  { title: 'بازبینی و ساخت', desc: 'اطلاعات را بررسی کنید و پروژه را بسازید.' },
];

function openWizard() {
  wiz = { name: '', client: '', statusKey: 'active', deliveryDate: '', amount: '', settlement: 'تسویه‌نشده', nextStep: '', tasks: [], notes: [], links: [] };
  wizStep = 1;
  $('#wiz-confirm').hidden = true;
  $('#app-view').hidden = true;
  $('#wizard-view').hidden = false;
  renderWizard();
  window.scrollTo(0, 0);
}
function closeWizard() {
  $('#wizard-view').hidden = true;
  $('#app-view').hidden = false;
  wiz = null;
  renderList();
}

function wizStepHtml() {
  if (wizStep === 1) return `
    <label>نام پروژه *<input id="w-name" value="${esc(wiz.name)}" placeholder="مثلاً: طراحی سایت فروشگاهی"></label>
    <label>کارفرما<input id="w-client" value="${esc(wiz.client)}" placeholder="نام مشتری یا شرکت"></label>`;
  if (wizStep === 2) return `
    <div>${SPACE_STATUSES.map((s) => `<button type="button" class="status-opt ${wiz.statusKey === s.key ? 'sel' : ''}" data-status="${s.key}"><b>${s.fa}</b><small>${s.hint}</small></button>`).join('')}</div>
    <label>تاریخ تحویل (شمسی)<input id="w-date" value="${esc(wiz.deliveryDate)}" placeholder="۱۴۰۵/۰۹/۰۴"></label>`;
  if (wizStep === 3) return `
    <label>مبلغ (تومان)<input id="w-amount" value="${esc(wiz.amount)}" inputmode="numeric" placeholder="مثلاً ۱۵۰۰۰۰۰۰"></label>
    <label>وضعیت تسویه<select id="w-settle">${SETTLEMENTS.map((s) => `<option ${s === wiz.settlement ? 'selected' : ''}>${s}</option>`).join('')}</select></label>`;
  if (wizStep === 4) return `
    <label>قدم بعدی چیست؟<input id="w-next" value="${esc(wiz.nextStep)}" placeholder="مثلاً: ارسال پیش‌فاکتور به مشتری"></label>
    <div class="tasklist">${wiz.tasks.map((t) => `<div class="task"><span>${esc(t.text)}</span><button class="mini danger" data-w-del-task="${esc(t.id)}" type="button">✕</button></div>`).join('') || '<div class="task"><span class="muted">هنوز کاری اضافه نشده است.</span></div>'}</div>
    <div class="add-row"><input id="w-new-task" placeholder="کار جدید…"><button class="btn" id="w-add-task" type="button">افزودن</button></div>`;
  if (wizStep === 5) return `
    <label>یادداشت اولیه<textarea id="w-note" rows="2" placeholder="یادداشت…">${esc(wiz.notes[0] ? wiz.notes[0].text : '')}</textarea></label>
    <div class="add-row"><input id="w-link-title" placeholder="عنوان لینک"><input id="w-link-url" placeholder="https://…" dir="ltr"><button class="btn" id="w-add-link" type="button">افزودن لینک</button></div>
    <div>${wiz.links.map((l) => `<div class="link-row"><span>${esc(l.title)}</span><span class="muted">${esc(l.url)}</span><button class="mini danger" data-w-del-link="${esc(l.id)}" type="button">✕</button></div>`).join('')}</div>`;
  const rows = [
    ['نام پروژه', wiz.name, 1], ['کارفرما', wiz.client || '—', 1],
    ['وضعیت', (SPACE_STATUSES.find((s) => s.key === wiz.statusKey) || {}).fa || '—', 2],
    ['تاریخ تحویل', wiz.deliveryDate || '—', 2],
    ['مبلغ', (wiz.amount ? faNum(wiz.amount) + ' تومان' : '—'), 3],
    ['تسویه', wiz.settlement, 3],
    ['قدم بعدی', wiz.nextStep || '—', 4],
    ['کارها', wiz.tasks.length.toLocaleString('fa-IR') + ' کار', 4],
    ['یادداشت', wiz.notes[0] ? wiz.notes[0].text : '—', 5],
    ['لینک‌ها', wiz.links.length.toLocaleString('fa-IR') + ' لینک', 5],
  ];
  return rows.map(([label, value, step]) => `
    <div class="review-row"><div class="rl"><b>${label}</b><div>${esc(value)}</div></div><button class="back-btn" data-goto="${step}" type="button">ویرایش</button></div>`).join('');
}

function renderWizard() {
  const s = WIZ_STEPS[wizStep - 1];
  $('#wiz-counter').textContent = 'گام ' + wizStep.toLocaleString('fa-IR') + ' از ۶';
  $('#wiz-segments').innerHTML = WIZ_STEPS.map((_, i) => `<span class="${i + 1 <= wizStep ? 'on' : ''}"></span>`).join('');
  $('#wiz-step-title').textContent = s.title;
  $('#wiz-step-desc').textContent = s.desc;
  $('#wizard-body').innerHTML = wizStepHtml();
  $('#wiz-back').style.visibility = wizStep === 1 ? 'hidden' : 'visible';
  const nextBtn = $('#wiz-next');
  if (wizStep === 6) nextBtn.textContent = 'ساخت پروژه';
  else if (wizStep === 4 && !wiz.nextStep && !wiz.tasks.length) nextBtn.textContent = 'رد کردن این گام';
  else if (wizStep === 5 && !(wiz.notes[0] && wiz.notes[0].text) && !wiz.links.length) nextBtn.textContent = 'رد کردن این گام';
  else nextBtn.textContent = 'گام بعد';
  $$('#wizard-body .status-opt').forEach((b) => b.addEventListener('click', () => {
    collectWizard(); wiz.statusKey = b.dataset.status; renderWizard();
  }));
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
  $$('#wizard-body [data-goto]').forEach((b) => b.addEventListener('click', () => {
    wizStep = Number(b.dataset.goto); renderWizard();
  }));
}

function collectWizard() {
  const g = (id) => { const el = $(id); return el ? el.value.trim() : ''; };
  if ($('#w-name')) wiz.name = g('#w-name');
  if ($('#w-client')) wiz.client = g('#w-client');
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
  if (wizStep < 6) { wizStep++; renderWizard(); window.scrollTo(0, 0); return; }
  const body = {
    name: wiz.name, client: wiz.client, status: toWorkerStatus(wiz.statusKey),
    deliveryDate: wiz.deliveryDate, amount: wiz.amount, settlement: wiz.settlement,
    nextStep: wiz.nextStep, tasks: wiz.tasks, notes: wiz.notes, links: wiz.links,
  };
  const data = await api('POST', '/api/projects', body);
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
  $('#search-input').addEventListener('input', (e) => { query = e.target.value; renderList(); });
  $('#new-project-btn').addEventListener('click', openWizard);
  $('#wiz-cancel').addEventListener('click', () => { $('#wiz-confirm').hidden = false; });
  $('#wiz-confirm-exit').addEventListener('click', closeWizard);
  $('#wiz-confirm-stay').addEventListener('click', () => { $('#wiz-confirm').hidden = true; });
  $('#wiz-back').addEventListener('click', () => { collectWizard(); if (wizStep > 1) { wizStep--; renderWizard(); } });
  $('#wiz-next').addEventListener('click', wizardNext);
  if (pw) {
    api('GET', '/api/projects').then(() => { showApp(); loadProjects(); }).catch(() => showLogin());
  }
});
