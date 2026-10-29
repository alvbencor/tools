'use strict';
(function () {
  const host = u => { try { return new URL(u).host || u; } catch (e) { return u; } };

  function parseLinks(text) {
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json : json && json.categorias;
    if (!Array.isArray(list)) throw new Error('Falta la lista "categorias".');
    return list.map((c, i) => {
      if (!c || typeof c.nombre !== 'string' || !c.nombre.trim()) throw new Error(`La categoría ${i + 1} no tiene "nombre".`);
      const links = Array.isArray(c.links) ? c.links : [];
      return {
        nombre: c.nombre.trim(),
        links: links.map((l, j) => {
          if (!l || !l.url) throw new Error(`Al link ${j + 1} de "${c.nombre}" le falta "url".`);
          const url = UI.safeUrl(l.url);
          if (!url) throw new Error(`URL no válida en "${c.nombre}": ${l.url}`);
          return { nombre: String(l.nombre || host(url)), url };
        }),
      };
    });
  }

  async function fetchLinks() {
    const r = await fetch('links.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }

  function renderLinks(root) {
    let cats = [];
    let source = '';
    let sel = Store.get('links-cat', '');
    let q = '';

    root.innerHTML = `
      <div class="toolbar">
        <input type="search" class="grow" placeholder="Buscar por nombre o URL…" data-lq>
        <button class="btn" type="button" data-reload>recargar links.json</button>
      </div>
      <div class="muted small" data-src style="margin:-6px 0 10px"></div>
      <div class="row wrap" data-chips style="margin-bottom:12px"></div>
      <div data-lbody></div>`;
    const body = $('[data-lbody]', root);
    const chips = $('[data-chips]', root);
    const search = $('[data-lq]', root);
    const srcEl = $('[data-src]', root);

    function drawChips() {
      const total = cats.reduce((n, c) => n + c.links.length, 0);
      chips.innerHTML = !cats.length ? '' : `<button type="button" class="btn small ${!sel ? 'active' : ''}" data-cat="">todas · ${total}</button>`
        + cats.map(c => `<button type="button" class="btn small ${sel === c.nombre ? 'active' : ''}" data-cat="${esc(c.nombre)}">${esc(c.nombre)} · ${c.links.length}</button>`).join('');
    }

    function card(l) {
      return `<div class="link-card">
        <a class="link-main" href="${esc(l.url)}" target="_blank" rel="noopener">
          <div class="link-title">${esc(l.nombre)}</div><div class="link-url">${esc(host(l.url))}</div>
        </a>
        <div class="card-actions"><button type="button" data-copy="${esc(l.url)}" title="Copiar URL">copiar</button></div>
      </div>`;
    }

    function draw() {
      if (sel && !cats.some(c => c.nombre === sel)) sel = '';
      drawChips();
      if (!cats.length) {
        body.innerHTML = source === 'none'
          ? `<div class="empty">El navegador no deja leer <b>links.json</b> solo cuando abres la página como archivo.<br><br><button class="btn primary" type="button" data-pick>elegir links.json</button><br><br><span class="small">Está en la misma carpeta que index.html. Se queda guardado hasta que pulses «recargar links.json».</span></div>`
          : '<div class="empty">links.json no tiene ningún link.</div>';
        return;
      }
      const match = l => !q || (l.nombre + ' ' + l.url).toLowerCase().includes(q);
      const html = cats.filter(c => !sel || c.nombre === sel).map(c => {
        const items = c.links.filter(match);
        if (!items.length) return '';
        return `${sel ? '' : `<h3 class="group-title">${esc(c.nombre)} <span class="tag">${items.length}</span></h3>`}<div class="link-grid">${items.map(card).join('')}</div>`;
      }).join('');
      body.innerHTML = html || `<div class="empty">${q ? 'Ningún link coincide con la búsqueda.' : 'Esta categoría está vacía.'}</div>`;
    }

    function useText(text, label) {
      cats = parseLinks(text);
      srcEl.textContent = label;
      draw();
    }

    function showError(e) {
      cats = [];
      chips.innerHTML = '';
      srcEl.textContent = '';
      body.innerHTML = `<div class="msg err">Error en links.json: ${esc(e.message)}</div>`;
    }

    function pick() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          parseLinks(text);
          Store.set('links-json', { name: f.name, loaded: Date.now(), text });
          source = 'cache';
          useText(text, `copia de ${f.name} cargada ${UI.fmtDate(Date.now())}. Si cambias el archivo, pulsa «recargar links.json».`);
          UI.toast('Links cargados');
        } catch (e) { showError(e); }
      };
      input.click();
    }

    async function load(manual) {
      try {
        const text = await fetchLinks();
        source = 'file';
        try { useText(text, 'leído de links.json'); } catch (e) { showError(e); }
        if (manual) UI.toast('links.json recargado');
        return;
      } catch (e) { }
      if (manual) { pick(); return; }
      const cached = Store.get('links-json', null);
      if (cached && cached.text) {
        source = 'cache';
        try { useText(cached.text, `copia de ${cached.name} cargada ${UI.fmtDate(cached.loaded)}. Si cambias el archivo, pulsa «recargar links.json».`); }
        catch (e) { showError(e); }
      } else {
        source = 'none';
        draw();
      }
    }

    chips.addEventListener('click', e => {
      const c = e.target.closest('[data-cat]');
      if (c) { sel = c.dataset.cat; Store.set('links-cat', sel); draw(); }
    });
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-copy]');
      if (b) { UI.copy(b.dataset.copy); return; }
      if (e.target.closest('[data-pick]')) pick();
    });
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
    $('[data-reload]', root).onclick = () => load(true);
    load(false);
    search.focus();
  }

  App.register({
    id: 'links', title: 'Links y AWS', sub: 'links + topologías', group: 'Principal', keywords: 'enlaces favoritos apigee aws vpc topologia red subredes categorias',
    render(view) {
      view.innerHTML = '<div class="tabs"><button type="button" data-tab="links">Links</button><button type="button" data-tab="topos">Topologías AWS</button></div><div data-pane></div>';
      const pane = $('[data-pane]', view);
      const show = t => {
        Store.set('links-tab', t);
        $$('.tabs button', view).forEach(b => b.classList.toggle('active', b.dataset.tab === t));
        pane.innerHTML = '';
        if (t === 'topos') window.renderTopologies(pane); else renderLinks(pane);
      };
      $$('.tabs button', view).forEach(b => { b.onclick = () => show(b.dataset.tab); });
      show(Store.get('links-tab', 'links'));
    },
  });
})();
