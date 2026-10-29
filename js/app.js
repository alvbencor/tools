'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    const gen = App.gen;
    t = setTimeout(() => { if (gen === App.gen) fn(...a); }, ms);
  };
};

const Store = {
  prefix: 'wd:',
  data: {},
  init() {
    this.data = {};
    try {
      Object.keys(localStorage).filter(k => k.startsWith(this.prefix)).forEach(k => {
        try { this.data[k.slice(this.prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) { }
      });
    } catch (e) { }
  },
  get(k, d) {
    if (!(k in this.data)) return typeof d === 'function' ? d() : d;
    return JSON.parse(JSON.stringify(this.data[k]));
  },
  persistLocal(k) {
    try {
      if (k in this.data) localStorage.setItem(this.prefix + k, JSON.stringify(this.data[k]));
      else localStorage.removeItem(this.prefix + k);
      return true;
    } catch (e) { return false; }
  },
  touch() {
    this.modified = Date.now();
    try { localStorage.setItem('wd-meta:modified', String(this.modified)); } catch (e) { }
    if (typeof DataFile !== 'undefined') DataFile.schedule();
  },
  set(k, v) {
    this.data[k] = JSON.parse(JSON.stringify(v));
    const ok = this.persistLocal(k);
    if (!ok && !(typeof DataFile !== 'undefined' && DataFile.state === 'connected')) {
      UI.toast('El almacenamiento del navegador está lleno. Elige un archivo de datos (abajo a la izquierda) para no perder cambios.', 'error', 7000);
    }
    this.touch();
    return true;
  },
  remove(k) { delete this.data[k]; this.persistLocal(k); this.touch(); },
  keys() { return Object.keys(this.data); },
  dump() { return JSON.parse(JSON.stringify(this.data)); },
  replaceAll(obj, modified) {
    Object.keys(this.data).forEach(k => { delete this.data[k]; this.persistLocal(k); });
    Object.entries(obj || {}).forEach(([k, v]) => { this.data[k] = v; this.persistLocal(k); });
    this.modified = modified || Date.now();
    try { localStorage.setItem('wd-meta:modified', String(this.modified)); } catch (e) { }
  },
  localModified() { try { return +localStorage.getItem('wd-meta:modified') || 0; } catch (e) { return 0; } },
  size() { return JSON.stringify(this.data).length; },
};

const UI = {
  toast(msg, type = 'ok', ms = 2200) {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  },
  async copy(text, label = 'Copiado al portapapeles') {
    if (!text) { this.toast('No hay nada que copiar', 'warn'); return; }
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    this.toast(label);
  },
  download(name, content, type = 'application/json') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  modal({ title, body, actions = [], size = '', onClose }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost small" type="button" data-close aria-label="Cerrar">cerrar</button></div>
      <div class="modal-body"></div><div class="modal-foot"></div></div>`;
    const mb = $('.modal-body', back);
    if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.append(body);
    const foot = $('.modal-foot', back);
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      back.remove(); document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = e => { if (e.key === 'Escape' && back === $$('.modal-back').pop()) close(); };
    document.addEventListener('keydown', onKey);
    let downOnBack = false;
    back.addEventListener('mousedown', e => { downOnBack = e.target === back; });
    back.addEventListener('mouseup', e => { if (downOnBack && e.target === back) close(); downOnBack = false; });
    $('[data-close]', back).onclick = close;
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
      b.onclick = () => a.onClick(close);
      foot.append(b);
    });
    if (!actions.length) foot.remove();
    document.body.append(back);
    return { el: back, body: mb, close };
  },
  confirm(msg, ok = 'Eliminar', cls = 'danger') {
    return new Promise(res => {
      let done = false;
      this.modal({
        title: 'Confirmar', body: `<p>${esc(msg)}</p>`,
        onClose: () => { if (!done) res(false); },
        actions: [
          { label: 'Cancelar', cls: 'ghost', onClick: c => c() },
          { label: ok, cls, onClick: c => { done = true; res(true); c(); } },
        ],
      });
    });
  },
  form({ title, fields, values = {}, submitLabel = 'Guardar', size = '' }) {
    return new Promise(res => {
      const f = document.createElement('form');
      f.className = 'form'; f.noValidate = false;
      fields.forEach(fd => {
        const id = 'f_' + fd.name + '_' + uid();
        const v = values[fd.name] ?? fd.default ?? '';
        let input;
        if (fd.type === 'textarea') input = `<textarea id="${id}" name="${fd.name}" rows="${fd.rows || 4}" class="${fd.mono ? 'mono' : ''}" placeholder="${esc(fd.placeholder || '')}" ${fd.required ? 'required' : ''}>${esc(v)}</textarea>`;
        else if (fd.type === 'select') input = `<select id="${id}" name="${fd.name}">${fd.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
        else input = `<input id="${id}" name="${fd.name}" type="${fd.type || 'text'}" value="${esc(v)}" placeholder="${esc(fd.placeholder || '')}" ${fd.list ? `list="${id}_dl"` : ''} ${fd.required ? 'required' : ''} autocomplete="off">${fd.list ? `<datalist id="${id}_dl">${fd.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}`;
        f.insertAdjacentHTML('beforeend', `<label class="field ${fd.full ? 'full' : ''}"><span>${esc(fd.label)}${fd.required ? ' *' : ''}</span>${input}${fd.hint ? `<small class="muted">${esc(fd.hint)}</small>` : ''}</label>`);
      });
      f.insertAdjacentHTML('beforeend', '<button type="submit" hidden></button>');
      let done = false;
      const m = this.modal({
        title, body: f, size,
        onClose: () => { if (!done) res(null); },
        actions: [
          { label: 'Cancelar', cls: 'ghost', onClick: c => c() },
          { label: submitLabel, cls: 'primary', onClick: () => f.requestSubmit() },
        ],
      });
      f.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); } });
      f.addEventListener('submit', e => {
        e.preventDefault();
        const o = {};
        fields.forEach(fd => { const el = f.elements[fd.name]; o[fd.name] = fd.type === 'textarea' ? el.value : el.value.trim(); });
        done = true; res(o); m.close();
      });
      const first = f.querySelector('input,textarea,select'); if (first) first.focus();
    });
  },
  fmtDate(ts, withTime = true) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + (withTime ? ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
  },
  ago(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    const fut = s < 0; const a = Math.abs(s);
    let v;
    if (a < 45) v = 'unos segundos';
    else if (a < 3600) v = Math.round(a / 60) + ' min';
    else if (a < 86400) v = Math.round(a / 3600) + ' h';
    else if (a < 86400 * 45) v = Math.round(a / 86400) + ' d';
    else if (a < 86400 * 365) v = Math.round(a / 2592000) + ' meses';
    else v = (a / 31536000).toFixed(1).replace('.0', '') + ' años';
    return fut ? 'en ' + v : 'hace ' + v;
  },
  linkify(text) {
    return esc(text).replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:)\]'"!?])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  },
  copyBtn(getText) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn small'; b.textContent = 'Copiar';
    b.onclick = () => UI.copy(typeof getText === 'function' ? getText() : getText);
    return b;
  },
  safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(javascript|data|vbscript):/i.test(u)) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    return u;
  },
};

const App = {
  routes: [],
  groups: ['Principal', 'Herramientas'],
  cleanup: null,
  gen: 0,
  register(r) { this.routes.push(r); },
  find(id) { return this.routes.find(r => r.id === id); },
  go(id) { location.hash = '#/' + id; },
  renderNav(filter = '') {
    const q = filter.trim().toLowerCase();
    const nav = $('#nav');
    nav.innerHTML = this.groups.map(g => {
      const items = this.routes.filter(r => r.group === g && !r.hidden && (!q || (r.title + ' ' + (r.keywords || '')).toLowerCase().includes(q)));
      if (!items.length) return '';
      return `<div class="nav-group">${esc(g)}</div>` + items.map(r => {
        const c = r.count ? r.count() : '';
        return `<a href="#/${r.id}" data-id="${r.id}"><span>${esc(r.title)}</span>${c ? `<span class="count">${c}</span>` : ''}</a>`;
      }).join('');
    }).join('') || '<div class="muted small" style="padding:10px">Sin resultados</div>';
    this.markActive();
  },
  markActive() { $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === this.currentId)); },
  refreshNav() { this.renderNav($('#navFilter').value); },
  render() {
    const id = location.hash.replace(/^#\/?/, '').split('?')[0] || 'tasks';
    const r = this.find(id) || this.find('tasks');
    if (this.cleanup) { try { this.cleanup(); } catch (e) { console.error(e); } this.cleanup = null; }
    this.gen++;
    this.currentId = r.id;
    $('#pageTitle').textContent = r.title;
    $('#pageSub').textContent = r.sub || '';
    const actions = $('#pageActions'); actions.innerHTML = '';
    const old = $('#view');
    const view = old.cloneNode(false);
    old.replaceWith(view);
    try {
      const c = r.render(view, actions);
      if (typeof c === 'function') this.cleanup = c;
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="msg err">Error al cargar la sección: ${esc(e.message)}</div>`;
    }
    this.markActive();
    document.title = r.title + ' · workdesk';
    document.body.classList.remove('nav-open');
    if (typeof DataFile !== 'undefined') DataFile.renderStatus();
  },
  async start() {
    Store.init();
    this.renderNav();
    if (typeof DataFile !== 'undefined') await DataFile.init();
    window.addEventListener('hashchange', () => this.render());
    $('#navFilter').addEventListener('input', e => this.renderNav(e.target.value));
    $('#navFilter').addEventListener('keydown', e => {
      if (e.key === 'Enter') { const a = $('#nav a'); if (a) { location.hash = a.getAttribute('href'); e.target.value = ''; this.renderNav(); e.target.blur(); } }
      if (e.key === 'Escape') { e.target.value = ''; this.renderNav(); e.target.blur(); }
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.body.classList.add('nav-open'); $('#navFilter').focus(); $('#navFilter').select(); }
    });
    $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
    this.render();
  },
};
