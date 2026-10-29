'use strict';
const TASK_STATUS = [['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['espera', 'En espera'], ['bloqueada', 'Bloqueada'], ['hecha', 'Hecha']];
const TASK_PRIO = [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const taskLabel = (arr, v) => (arr.find(x => x[0] === v) || [v, v])[1];

(function () {
  const KEY = 'tasks';
  const ST_ORDER = { en_curso: 0, bloqueada: 1, espera: 2, pendiente: 3, hecha: 4 };
  const PR_ORDER = { alta: 0, media: 1, baja: 2 };
  const load = () => Store.get(KEY, []);
  const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const todayKey = () => dayKey(Date.now());
  const lastActivity = t => Math.max(t.updated || 0, ...(t.comments || []).map(c => c.date));

  function dailySummary(tasks, day) {
    const lines = [];
    const active = tasks.filter(t => (t.comments || []).some(c => dayKey(c.date) === day) || dayKey(t.created) === day);
    lines.push(`Resumen ${day.split('-').reverse().join('/')}`);
    lines.push('');
    if (active.length) {
      lines.push('Actividad del día:');
      active.sort((a, b) => ST_ORDER[a.status] - ST_ORDER[b.status]).forEach(t => {
        lines.push(`- [${taskLabel(TASK_STATUS, t.status)}] ${t.title}${dayKey(t.created) === day ? ' (nueva)' : ''}`);
        (t.comments || []).filter(c => dayKey(c.date) === day).forEach(c => {
          const time = new Date(c.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          lines.push(`    - ${time} ${c.type === 'status' ? c.text : c.text.replace(/\n/g, '\n      ')}`);
        });
      });
    } else lines.push('Sin actividad registrada ese día.');
    const open = tasks.filter(t => t.status !== 'hecha' && !active.includes(t));
    if (open.length) {
      lines.push('');
      lines.push('Otras tareas abiertas:');
      open.sort((a, b) => ST_ORDER[a.status] - ST_ORDER[b.status] || PR_ORDER[a.priority] - PR_ORDER[b.priority])
        .forEach(t => lines.push(`- [${taskLabel(TASK_STATUS, t.status)}] ${t.title}`));
    }
    return lines.join('\n');
  }

  function showSummary(tasks) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="row" style="margin-bottom:10px"><label class="row small">Día <input type="date" data-day value="${todayKey()}"></label></div>
      <textarea class="mono" rows="18" data-sum></textarea>`;
    const ta = $('[data-sum]', wrap);
    const upd = () => { ta.value = dailySummary(tasks, $('[data-day]', wrap).value || todayKey()); };
    $('[data-day]', wrap).onchange = upd; upd();
    UI.modal({ title: 'Resumen diario', body: wrap, size: 'wide', actions: [{ label: 'Copiar', cls: 'primary', onClick: () => UI.copy(ta.value) }] });
  }

  App.register({
    id: 'tasks', title: 'Tareas', sub: 'seguimiento', group: 'Principal', keywords: 'seguimiento todo comentarios',
    count: () => load().filter(t => t.status !== 'hecha').length || '',
    render(view, actions) {
      let tasks = load();
      let selId = Store.get('tasks-sel', null);
      const filter = Object.assign({ status: 'activas', q: '', prio: '' }, Store.get('tasks-filter', {}));
      const save = () => { Store.set(KEY, tasks); App.refreshNav(); };
      const sel = () => tasks.find(t => t.id === selId);

      actions.innerHTML = '<button class="btn" type="button" data-sum>Resumen del día</button>';
      $('[data-sum]', actions).onclick = () => showSummary(tasks);

      view.innerHTML = `
        <div class="tasks-layout">
          <div class="tasks-list-pane">
            <form class="row" data-quick>
              <input class="grow" data-qa placeholder="Nueva tarea… (Enter para crear)" maxlength="250">
              <button class="btn primary" type="submit">Añadir</button>
            </form>
            <div class="row">
              <input type="search" class="grow" data-q placeholder="Buscar en títulos, etiquetas y comentarios…" value="${esc(filter.q)}">
              <select data-prio title="Prioridad"><option value="">Prioridad</option>${TASK_PRIO.map(([v, l]) => `<option value="${v}" ${filter.prio === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            </div>
            <div class="counts" data-counts></div>
            <div class="task-list" data-list></div>
          </div>
          <div class="card tasks-detail" data-detail></div>
        </div>`;
      const listEl = $('[data-list]', view);
      const detailEl = $('[data-detail]', view);
      const countsEl = $('[data-counts]', view);

      function matches(t) {
        if (filter.status === 'activas' && t.status === 'hecha') return false;
        if (filter.status === 'hoy' && !(t.comments || []).some(c => dayKey(c.date) === todayKey()) && dayKey(t.created) !== todayKey()) return false;
        if (!['activas', 'todas', 'hoy'].includes(filter.status) && t.status !== filter.status) return false;
        if (filter.prio && t.priority !== filter.prio) return false;
        if (filter.q) {
          const hay = [t.title, t.desc, t.tags, ...(t.comments || []).map(c => c.text)].join(' ').toLowerCase();
          if (!filter.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
        }
        return true;
      }

      function drawCounts() {
        const c = s => tasks.filter(t => t.status === s).length;
        const items = [
          ['activas', 'Activas', tasks.filter(t => t.status !== 'hecha').length, 'accent'],
          ['hoy', 'Hoy', tasks.filter(t => (t.comments || []).some(x => dayKey(x.date) === todayKey()) || dayKey(t.created) === todayKey()).length, 'info'],
          ...TASK_STATUS.map(([v, l]) => [v, l, c(v), 'st-' + v]),
          ['todas', 'Todas', tasks.length, ''],
        ];
        countsEl.innerHTML = items.map(([v, l, n, cls]) => `<span class="badge ${cls}" data-st="${v}" style="${filter.status === v ? 'outline:2px solid var(--accent);outline-offset:1px' : ''}">${l} · ${n}</span>`).join('');
      }

      function drawList() {
        drawCounts();
        const f = tasks.filter(matches).sort((a, b) =>
          (ST_ORDER[a.status] - ST_ORDER[b.status]) || (PR_ORDER[a.priority] - PR_ORDER[b.priority]) || (lastActivity(b) - lastActivity(a)));
        if (!f.length) { listEl.innerHTML = `<div class="empty">${tasks.length ? 'No hay tareas con este filtro.' : 'Crea tu primera tarea arriba.'}</div>`; return; }
        listEl.innerHTML = f.map(t => {
          const over = t.due && t.status !== 'hecha' && t.due < todayKey();
          const nc = (t.comments || []).filter(c => c.type !== 'status').length;
          return `<div class="task-item ${t.id === selId ? 'sel' : ''} ${t.status === 'hecha' ? 'done' : ''}" data-id="${t.id}" data-p="${t.priority}">
            <div class="t-title">${esc(t.title)}</div>
            <div class="t-meta">
              <span class="badge st-${t.status}">${taskLabel(TASK_STATUS, t.status)}</span>
              ${t.due ? `<span class="${over ? 'due-over' : ''}">vence ${t.due.split('-').reverse().join('/')}</span>` : ''}
              ${nc ? `<span>${nc} coment.</span>` : ''}
              ${(t.tags || '').split(',').map(s => s.trim()).filter(Boolean).map(s => `<span class="tag">${esc(s)}</span>`).join('')}
              <span style="margin-left:auto">${UI.ago(lastActivity(t))}</span>
            </div></div>`;
        }).join('');
      }

      function touch(t) { t.updated = Date.now(); save(); drawList(); }

      function drawDetail() {
        const t = sel();
        if (!t) { detailEl.innerHTML = '<div class="empty" style="border:0">Selecciona una tarea para ver su detalle y seguimiento.</div>'; return; }
        const comments = t.comments || [];
        detailEl.innerHTML = `
          <div class="row between">
            <input class="title-input" data-f="title" value="${esc(t.title)}">
            <button class="btn ghost small" type="button" data-del title="Eliminar tarea">borrar</button>
          </div>
          <div class="meta-grid">
            <label class="field"><span>Estado</span><select data-f="status">${TASK_STATUS.map(([v, l]) => `<option value="${v}" ${t.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span>Prioridad</span><select data-f="priority">${TASK_PRIO.map(([v, l]) => `<option value="${v}" ${t.priority === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span>Fecha límite</span><input type="date" data-f="due" value="${esc(t.due || '')}"></label>
            <label class="field"><span>Etiquetas</span><input data-f="tags" value="${esc(t.tags || '')}" placeholder="apigee, prod, ticket-123"></label>
          </div>
          <label class="field"><span>Descripción</span><textarea data-f="desc" rows="3" placeholder="Contexto, ticket, enlaces…">${esc(t.desc || '')}</textarea></label>
          <div class="muted small">Creada ${UI.fmtDate(t.created)} · Última actividad ${UI.ago(lastActivity(t))}</div>
          <h3 style="margin-top:16px">Seguimiento <span class="tag">${comments.filter(c => c.type !== 'status').length}</span></h3>
          <div class="timeline" data-tl>${comments.length ? comments.map(c => `
            <div class="tl-item ${c.type === 'status' ? 'status' : ''}" data-cid="${c.id}">
              <div class="tl-dot"></div>
              <div class="tl-body">
                ${c.type === 'status'
                  ? `<span>${esc(c.text)}</span> · <span>${UI.fmtDate(c.date)}</span>`
                  : `<div class="tl-head"><span>${UI.fmtDate(c.date)}${c.edited ? ' · editado' : ''}</span><span class="tl-actions"><button type="button" data-cedit>editar</button><button type="button" data-cdel>borrar</button></span></div><div class="tl-text">${UI.linkify(c.text)}</div>`}
              </div>
            </div>`).join('') : '<div class="muted small">Aún no hay comentarios.</div>'}</div>
          <form class="comment-form" data-cform>
            <textarea data-ctext placeholder="Añade un comentario de seguimiento… (Ctrl+Enter para guardar)"></textarea>
            <div class="row end" style="margin-top:8px">
              <select data-cstatus><option value="">Mantener estado</option>${TASK_STATUS.filter(([v]) => v !== t.status).map(([v, l]) => `<option value="${v}">Cambiar a: ${l}</option>`).join('')}</select>
              <button class="btn primary" type="submit">Comentar</button>
            </div>
          </form>`;
        const tl = $('[data-tl]', detailEl); tl.scrollTop = tl.scrollHeight;
      }

      function setStatus(t, s) {
        if (t.status === s) return;
        (t.comments = t.comments || []).push({ id: uid(), type: 'status', date: Date.now(), text: `Estado: ${taskLabel(TASK_STATUS, t.status)} → ${taskLabel(TASK_STATUS, s)}` });
        t.status = s;
        if (s === 'hecha') t.doneAt = Date.now();
      }

      function select(id) { selId = id; Store.set('tasks-sel', id); drawList(); drawDetail(); }

      $('[data-quick]', view).addEventListener('submit', e => {
        e.preventDefault();
        const inp = $('[data-qa]', view); const title = inp.value.trim(); if (!title) return;
        const t = { id: uid(), title, status: 'pendiente', priority: 'media', desc: '', tags: '', due: '', created: Date.now(), updated: Date.now(), comments: [] };
        tasks.unshift(t); inp.value = '';
        if (filter.status !== 'activas' && filter.status !== 'todas' && filter.status !== 'hoy' && filter.status !== 'pendiente') { filter.status = 'activas'; Store.set('tasks-filter', filter); }
        save(); select(t.id);
      });
      $('[data-q]', view).addEventListener('input', debounce(e => { filter.q = e.target.value.trim(); Store.set('tasks-filter', filter); drawList(); }, 150));
      $('[data-prio]', view).onchange = e => { filter.prio = e.target.value; Store.set('tasks-filter', filter); drawList(); };
      countsEl.addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (!b) return; filter.status = b.dataset.st; Store.set('tasks-filter', filter); drawList(); });
      listEl.addEventListener('click', e => { const it = e.target.closest('.task-item'); if (it) select(it.dataset.id); });

      detailEl.addEventListener('change', e => {
        const t = sel(); const f = e.target.dataset.f; if (!t || !f) return;
        if (f === 'status') { setStatus(t, e.target.value); touch(t); drawDetail(); return; }
        if (f === 'title' && !e.target.value.trim()) { e.target.value = t.title; return; }
        t[f] = f === 'desc' ? e.target.value : e.target.value.trim();
        touch(t);
      });
      detailEl.addEventListener('keydown', e => {
        if (e.target.dataset.f === 'title' && e.key === 'Enter') e.target.blur();
        if (e.target.matches('[data-ctext]') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('[data-cform]', detailEl).requestSubmit(); }
      });
      detailEl.addEventListener('submit', e => {
        e.preventDefault();
        const t = sel(); if (!t) return;
        const text = $('[data-ctext]', detailEl).value.trim();
        const ns = $('[data-cstatus]', detailEl).value;
        if (!text && !ns) return;
        t.comments = t.comments || [];
        if (text) t.comments.push({ id: uid(), type: 'note', date: Date.now(), text });
        if (ns) setStatus(t, ns);
        touch(t); drawDetail();
        $('[data-ctext]', detailEl).focus();
      });
      detailEl.addEventListener('click', async e => {
        const t = sel(); if (!t) return;
        if (e.target.closest('[data-del]')) {
          if (await UI.confirm(`¿Eliminar la tarea "${t.title}" y todo su seguimiento?`)) { tasks = tasks.filter(x => x !== t); save(); selId = null; drawList(); drawDetail(); }
          return;
        }
        const item = e.target.closest('[data-cid]'); if (!item) return;
        const c = t.comments.find(x => x.id === item.dataset.cid); if (!c) return;
        if (e.target.closest('[data-cdel]') && await UI.confirm('¿Borrar este comentario?')) { t.comments = t.comments.filter(x => x !== c); touch(t); drawDetail(); }
        if (e.target.closest('[data-cedit]')) {
          const v = await UI.form({ title: 'Editar comentario', values: c, fields: [{ name: 'text', label: 'Comentario', type: 'textarea', rows: 6, full: true, required: true }] });
          if (v && v.text.trim()) { c.text = v.text.trim(); c.edited = Date.now(); touch(t); drawDetail(); }
        }
      });

      drawList(); drawDetail();
      if (!sel()) setTimeout(() => $('[data-qa]', view).focus(), 0);
    },
  });
})();
