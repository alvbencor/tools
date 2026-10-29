'use strict';

const NO_CAT = 'Sin categoría';

const SEED_URLS = [
  'https://apigee.google.com', 'https://cloud.google.com/apigee/docs', 'https://console.aws.amazon.com/',
  'https://console.aws.amazon.com/vpc/home', 'https://console.aws.amazon.com/ec2/home', 'https://console.aws.amazon.com/route53/v2/home',
  'https://console.aws.amazon.com/cloudwatch/home', 'https://console.aws.amazon.com/iam/home',
];

function migrateLinks() {
  let links = Store.get('links', []);
  let cats = Store.get('link-categories', []);
  const aws = Store.get('aws-links', null);
  let changed = false;
  if (aws !== null) {
    aws.forEach(l => {
      if (SEED_URLS.includes(l.url) || links.some(x => x.url === l.url)) return;
      const notes = [l.category && l.category !== 'AWS' ? l.category : '', l.notes || ''].filter(Boolean).join(' · ');
      links.push({ ...l, category: 'AWS', notes });
    });
    Store.remove('aws-links');
    Store.remove('aws-tab');
    changed = true;
  }
  if (!Store.get('seed-cleanup', false)) {
    links = links.filter(l => !SEED_URLS.includes(l.url));
    cats = cats.filter(c => !['Apigee', 'AWS'].includes(c) || links.some(l => l.category === c));
    Store.set('seed-cleanup', true);
    changed = true;
  }
  links.forEach(l => {
    if (!l.category) { l.category = NO_CAT; changed = true; }
    if (l.category !== NO_CAT && !cats.includes(l.category)) { cats.push(l.category); changed = true; }
  });
  if (changed) { Store.set('links', links); Store.set('link-categories', cats); }
}

(function () {
  const host = u => { try { return new URL(u).host || u; } catch (e) { return u; } };

  function renderLinks(root) {
    migrateLinks();
    let links = Store.get('links', []);
    let cats = Store.get('link-categories', []);
    let sel = Store.get('links-cat', '');
    let q = '';
    if (sel && sel !== NO_CAT && !cats.includes(sel)) sel = '';
    const save = () => { Store.set('links', links); Store.set('link-categories', cats); };
    const allCats = () => cats.concat(links.some(l => l.category === NO_CAT) ? [NO_CAT] : []);

    root.innerHTML = `
      <div class="toolbar">
        <input type="search" class="grow" placeholder="Buscar por nombre, URL o nota…" data-lq>
        <button class="btn primary" type="button" data-ladd>+ Link</button>
        <button class="btn" type="button" data-cadd>+ Categoría</button>
      </div>
      <div class="row wrap" data-chips style="margin-bottom:12px"></div>
      <div data-lbody></div>`;
    const body = $('[data-lbody]', root);
    const chips = $('[data-chips]', root);
    const search = $('[data-lq]', root);

    function drawChips() {
      const count = c => links.filter(l => l.category === c).length;
      chips.innerHTML = `<button type="button" class="btn small ${!sel ? 'active' : ''}" data-cat="">todas · ${links.length}</button>`
        + allCats().map(c => `<button type="button" class="btn small ${sel === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)} · ${count(c)}</button>`).join('')
        + (sel && sel !== NO_CAT ? `<span class="sep"></span>
          <button type="button" class="btn small ghost" data-cact="left" title="Mover a la izquierda">&lt;</button>
          <button type="button" class="btn small ghost" data-cact="right" title="Mover a la derecha">&gt;</button>
          <button type="button" class="btn small ghost" data-cact="rename">renombrar</button>
          <button type="button" class="btn small ghost" data-cact="delete">borrar categoría</button>` : '');
    }

    function card(l) {
      return `<div class="link-card" data-id="${l.id}">
        <a class="link-main" href="${esc(l.url)}" target="_blank" rel="noopener" data-open>
          <div class="link-title">${esc(l.title)}</div><div class="link-url">${esc(host(l.url))}</div>
        </a>
        ${l.notes ? `<div class="link-notes">${esc(l.notes)}</div>` : ''}
        <div class="card-actions">
          <button type="button" data-act="copy" title="Copiar URL">copiar</button>
          <button type="button" data-act="edit" title="Editar">editar</button>
          <button type="button" data-act="del" title="Eliminar">borrar</button>
        </div>
      </div>`;
    }

    function draw() {
      drawChips();
      const f = links.filter(l => (!sel || l.category === sel) && (!q || [l.title, l.url, l.category, l.notes].join(' ').toLowerCase().includes(q)));
      const order = (a, b) => (b.hits || 0) - (a.hits || 0) || a.title.localeCompare(b.title);
      if (!f.length) {
        body.innerHTML = `<div class="empty">${q ? 'Ningún link coincide con la búsqueda.' : sel ? 'Esta categoría está vacía.' : 'Aún no hay links. Crea una categoría con «+ Categoría» y añade tus links con «+ Link».'}</div>`;
        return;
      }
      body.innerHTML = allCats().filter(c => !sel || c === sel).map(c => {
        const items = f.filter(l => l.category === c).sort(order);
        if (!items.length) return '';
        return `${sel ? '' : `<h3 class="group-title">${esc(c)} <span class="tag">${items.length}</span></h3>`}<div class="link-grid">${items.map(card).join('')}</div>`;
      }).join('');
    }

    async function askCategory(title, value = '') {
      const v = await UI.form({ title, values: { name: value }, fields: [{ name: 'name', label: 'Nombre', required: true, full: true, placeholder: 'Ej. Monitorización, Jenkins, Clientes…' }] });
      if (!v) return null;
      const name = v.name.trim();
      if (!name || name === NO_CAT) return null;
      if (cats.some(c => c.toLowerCase() === name.toLowerCase() && c !== value)) { UI.toast('Ya existe esa categoría', 'warn'); return null; }
      return name;
    }

    async function newCategory() {
      const name = await askCategory('Nueva categoría');
      if (!name) return null;
      cats.push(name);
      save();
      return name;
    }

    async function edit(link) {
      const opts = cats.map(c => [c, c]).concat([[NO_CAT, NO_CAT], ['__new', '+ nueva categoría…']]);
      const v = await UI.form({
        title: link ? 'Editar link' : 'Nuevo link',
        values: link || { category: sel || cats[0] || NO_CAT },
        fields: [
          { name: 'title', label: 'Nombre', required: true, placeholder: 'Ej. Apigee UI (prod)' },
          { name: 'category', label: 'Categoría', type: 'select', options: opts },
          { name: 'url', label: 'URL', required: true, full: true, placeholder: 'https://…' },
          { name: 'notes', label: 'Notas', type: 'textarea', rows: 2, full: true, placeholder: 'Opcional' },
        ],
      });
      if (!v) return;
      v.url = UI.safeUrl(v.url);
      if (!v.url) { UI.toast('URL no válida', 'error'); return; }
      if (v.category === '__new') {
        v.category = await newCategory();
        if (!v.category) return;
      }
      if (link) Object.assign(link, v, { updated: Date.now() });
      else links.push({ id: uid(), hits: 0, created: Date.now(), ...v });
      save(); draw();
    }

    chips.addEventListener('click', async e => {
      const c = e.target.closest('[data-cat]');
      if (c) { sel = c.dataset.cat; Store.set('links-cat', sel); draw(); return; }
      const act = e.target.closest('[data-cact]')?.dataset.cact;
      if (!act) return;
      const i = cats.indexOf(sel);
      if (act === 'left' && i > 0) { [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; save(); draw(); }
      if (act === 'right' && i >= 0 && i < cats.length - 1) { [cats[i + 1], cats[i]] = [cats[i], cats[i + 1]]; save(); draw(); }
      if (act === 'rename') {
        const name = await askCategory('Renombrar categoría', sel);
        if (!name || name === sel) return;
        cats[i] = name;
        links.forEach(l => { if (l.category === sel) l.category = name; });
        sel = name; Store.set('links-cat', sel); save(); draw();
      }
      if (act === 'delete') {
        const n = links.filter(l => l.category === sel).length;
        const msg = n ? `¿Borrar la categoría "${sel}"? Sus ${n} links pasarán a «${NO_CAT}».` : `¿Borrar la categoría "${sel}"?`;
        if (!await UI.confirm(msg)) return;
        links.forEach(l => { if (l.category === sel) l.category = NO_CAT; });
        cats = cats.filter(c => c !== sel);
        sel = ''; Store.set('links-cat', sel); save(); draw();
      }
    });

    const hit = id => { const l = links.find(x => x.id === id); if (l) { l.hits = (l.hits || 0) + 1; l.lastUsed = Date.now(); Store.set('links', links); } };
    body.addEventListener('click', async e => {
      const el = e.target.closest('.link-card'); if (!el) return;
      const link = links.find(l => l.id === el.dataset.id); if (!link) return;
      if (e.target.closest('[data-open]')) { hit(link.id); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'copy') UI.copy(link.url);
      if (act === 'edit') edit(link);
      if (act === 'del' && await UI.confirm(`¿Eliminar el link "${link.title}"?`)) { links = links.filter(l => l !== link); save(); draw(); }
    });
    body.addEventListener('auxclick', e => {
      const el = e.target.closest('.link-card');
      if (el && e.target.closest('[data-open]')) hit(el.dataset.id);
    });
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
    $('[data-ladd]', root).onclick = () => edit(null);
    $('[data-cadd]', root).onclick = async () => {
      const name = await newCategory();
      if (name) { sel = name; Store.set('links-cat', sel); draw(); }
    };
    draw();
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
