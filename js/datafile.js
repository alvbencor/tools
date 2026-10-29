'use strict';

const HandleDB = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('workdesk', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async op(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); res(req && req.result); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    });
  },
  get(k) { return this.op('readonly', s => s.get(k)); },
  set(k, v) { return this.op('readwrite', s => s.put(v, k)); },
  del(k) { return this.op('readwrite', s => s.delete(k)); },
};

const DataFile = {
  handle: null,
  state: 'none',
  lastSaved: 0,
  error: '',
  timer: null,
  queue: Promise.resolve(),
  supported: typeof window.showSaveFilePicker === 'function' && typeof indexedDB !== 'undefined',
  pickerOpts: { types: [{ description: 'Datos de workdesk', accept: { 'application/json': ['.json'] } }] },

  async init() {
    if (!this.supported) { this.state = 'unsupported'; this.renderStatus(); return; }
    try { this.handle = await HandleDB.get('datafile'); } catch (e) { this.handle = null; }
    if (!this.handle) this.state = 'none';
    else {
      let perm = 'prompt';
      try { perm = await this.handle.queryPermission({ mode: 'readwrite' }); } catch (e) { }
      if (perm === 'granted') await this.sync();
      else this.state = 'needs-permission';
    }
    this.renderStatus();
    let skip = false;
    try { skip = sessionStorage.getItem('wd-skip-choose') === '1'; } catch (e) { }
    if ((this.state === 'none' || this.state === 'needs-permission') && !skip) this.choose(true);
  },

  async reconnect() {
    if (!this.handle) return;
    try {
      const perm = await this.handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { UI.toast('Sin permiso no se puede usar el archivo', 'warn'); return; }
      await this.sync();
      App.render();
    } catch (e) { this.fail(e); }
  },

  async readFile() {
    const f = await this.handle.getFile();
    const text = await f.text();
    if (!text.trim()) return null;
    const json = JSON.parse(text);
    if (!json || json.app !== 'workdesk' || typeof json.data !== 'object') throw new Error('El archivo no es un JSON de datos de workdesk.');
    return json;
  },

  async sync() {
    try {
      const json = await this.readFile();
      if (!json) {
        await this.write();
      } else if (Store.localModified() > (json.saved || 0)) {
        await this.write();
        UI.toast('Los datos de este navegador eran más recientes y se han guardado en el archivo.');
      } else {
        Store.replaceAll(json.data, json.saved);
        this.lastSaved = json.saved || Date.now();
      }
      this.state = 'connected';
      this.error = '';
      App.refreshNav();
    } catch (e) { this.fail(e); }
    this.renderStatus();
  },

  async create() {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: 'workdesk-datos.json', ...this.pickerOpts });
      this.handle = h;
      await HandleDB.set('datafile', h);
      await this.write();
      this.state = 'connected';
      this.error = '';
      UI.toast('Datos guardados en ' + h.name);
    } catch (e) { if (e.name !== 'AbortError') this.fail(e); }
    this.renderStatus();
  },

  async open() {
    try {
      const [h] = await window.showOpenFilePicker({ multiple: false, ...this.pickerOpts });
      const perm = await h.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { UI.toast('Hace falta permiso de escritura', 'warn'); return; }
      const prev = this.handle;
      this.handle = h;
      let json;
      try { json = await this.readFile(); } catch (e) { this.handle = prev; throw e; }
      await HandleDB.set('datafile', h);
      if (json) { Store.replaceAll(json.data, json.saved); this.lastSaved = json.saved || Date.now(); }
      else await this.write();
      this.state = 'connected';
      this.error = '';
      UI.toast('Usando ' + h.name);
      App.refreshNav();
      App.render();
    } catch (e) { if (e.name !== 'AbortError') this.fail(e); }
    this.renderStatus();
  },

  async disconnect() {
    clearTimeout(this.timer);
    await this.flush();
    try { await HandleDB.del('datafile'); } catch (e) { }
    this.handle = null;
    this.state = this.supported ? 'none' : 'unsupported';
    this.renderStatus();
  },

  schedule() {
    if (this.state !== 'connected') { this.renderStatus(); return; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  },

  flush() {
    clearTimeout(this.timer);
    if (this.state !== 'connected') return this.queue;
    this.queue = this.queue.then(() => this.write()).catch(e => this.fail(e));
    return this.queue;
  },

  async write() {
    const saved = Math.max(Date.now(), Store.modified || 0);
    const body = JSON.stringify({ app: 'workdesk', version: 1, saved, data: Store.dump() }, null, 1);
    const w = await this.handle.createWritable();
    await w.write(body);
    await w.close();
    this.lastSaved = saved;
    this.renderStatus();
  },

  fail(e) {
    this.error = e.message || String(e);
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') this.state = 'needs-permission';
    else if (e.name === 'NotFoundError') this.state = 'missing';
    else if (this.state === 'connected') this.state = 'error';
    UI.toast('Archivo de datos: ' + this.error, 'error', 6000);
    this.renderStatus();
  },

  renderStatus() {
    const el = $('#backupStatus');
    if (!el) return;
    const name = this.handle ? esc(this.handle.name) : '';
    if (this.state === 'connected') {
      const pending = (Store.modified || 0) > this.lastSaved;
      el.innerHTML = `<button class="badge ok df-btn" type="button" data-df title="Cambiar archivo de datos">${pending ? 'guardando…' : 'guardado'} en ${name}</button>`;
    } else if (this.state === 'needs-permission') {
      el.innerHTML = `<button class="btn small primary" type="button" data-reconnect>reconectar ${name}</button> <button class="btn small ghost" type="button" data-df>cambiar</button>`;
      $('[data-reconnect]', el).onclick = () => this.reconnect();
    } else if (this.state === 'unsupported') {
      el.innerHTML = '<span class="badge warn">abre con Chrome o Edge para guardar en JSON</span>';
    } else if (this.state === 'missing' || this.state === 'error') {
      el.innerHTML = `<button class="badge err df-btn" type="button" data-df>error con ${name || 'el archivo'}</button>`;
    } else {
      el.innerHTML = '<button class="btn small primary" type="button" data-df>elegir archivo de datos</button>';
    }
    const b = $('[data-df]', el);
    if (b) b.onclick = () => this.choose();
  },

  choose(startup) {
    if (this.chooser) return;
    const st = this.state;
    const name = this.handle ? esc(this.handle.name) : '';
    const intro = {
      none: 'Los datos (tareas, links y topologías) se guardan en un archivo JSON que eliges tú. Cada cambio se escribe en él al momento.',
      'needs-permission': `El navegador necesita permiso para seguir usando <b>${name}</b>. En Chrome puedes marcar «permitir siempre» para que no vuelva a preguntar.`,
      connected: `Ahora se guarda en <b>${name}</b> (último guardado ${UI.fmtDate(this.lastSaved)}).`,
      missing: `No se encuentra <b>${name}</b>. ¿Se ha movido o borrado? Ábrelo de nuevo o crea otro.`,
      error: `Error con <b>${name}</b>: ${esc(this.error)}`,
    }[st] || '';
    const actions = [];
    if (startup) actions.push({ label: 'Ahora no', cls: 'ghost', onClick: c => { try { sessionStorage.setItem('wd-skip-choose', '1'); } catch (e) { } c(); } });
    if (this.handle && !startup) actions.push({ label: 'Dejar de usar el archivo', cls: 'ghost', onClick: async c => { c(); await this.disconnect(); } });
    actions.push({ label: 'Abrir archivo existente', cls: st === 'none' ? '' : 'ghost', onClick: async c => { c(); await this.open(); } });
    actions.push({ label: 'Crear archivo nuevo', cls: st === 'none' ? 'primary' : '', onClick: async c => { c(); await this.create(); } });
    if (st === 'needs-permission') actions.push({ label: 'Reconectar', cls: 'primary', onClick: async c => { c(); await this.reconnect(); } });
    this.chooser = UI.modal({
      title: 'Archivo de datos', body: `<p>${intro}</p><p class="muted small">Si ya tenías un archivo, usa «Abrir archivo existente» y se cargarán sus datos.</p>`,
      actions, onClose: () => { this.chooser = null; },
    });
  },
};

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') DataFile.flush(); });
window.addEventListener('pagehide', () => DataFile.flush());
