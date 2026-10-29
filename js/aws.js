'use strict';
(function () {
  const TOPO_KEY = 'aws-topologies';
  const loadTopos = () => Store.get(TOPO_KEY, []);
  const saveTopos = t => Store.set(TOPO_KEY, t);

  function compressImage(file, maxSide = 2000) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let out = c.toDataURL('image/webp', 0.9);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.9);
        res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  function lightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}" alt="Diagrama">`;
    lb.onclick = () => lb.remove();
    const k = e => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', k); } };
    document.addEventListener('keydown', k);
    document.body.append(lb);
  }

  function subnetRow(s = {}) {
    return `<div class="subnet-row">
      <input placeholder="Nombre" data-k="name" value="${esc(s.name || '')}">
      <input placeholder="10.0.1.0/24" data-k="cidr" class="mono" value="${esc(s.cidr || '')}">
      <input placeholder="AZ" data-k="az" value="${esc(s.az || '')}">
      <select data-k="type">${['Privada', 'Pública', 'Aislada', 'TGW/Transit'].map(t => `<option ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input placeholder="Notas (rutas, NAT, SG…)" data-k="notes" value="${esc(s.notes || '')}">
      <button type="button" class="btn ghost small" data-del-subnet title="Quitar">x</button>
    </div>`;
  }

  function editTopo(topo, onSaved) {
    const t = topo ? JSON.parse(JSON.stringify(topo)) : { subnets: [] };
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form">
        <label class="field"><span>Nombre *</span><input name="name" value="${esc(t.name || '')}" placeholder="Ej. VPC Apigee runtime prod"></label>
        <label class="field"><span>Entorno</span><input name="env" value="${esc(t.env || '')}" list="envs" placeholder="prod, pre, dev…"><datalist id="envs"><option>prod</option><option>pre</option><option>dev</option><option>shared</option></datalist></label>
        <label class="field"><span>Cuenta AWS</span><input name="account" class="mono" value="${esc(t.account || '')}" placeholder="123456789012"></label>
        <label class="field"><span>Región</span><input name="region" value="${esc(t.region || '')}" placeholder="eu-west-1"></label>
        <label class="field"><span>VPC ID</span><input name="vpc" class="mono" value="${esc(t.vpc || '')}" placeholder="vpc-0abc…"></label>
        <label class="field"><span>CIDR(s) de la VPC</span><input name="cidr" class="mono" value="${esc(t.cidr || '')}" placeholder="10.0.0.0/16"></label>
      </div>
      <div class="field"><span>Subredes</span><div data-subnets>${(t.subnets || []).map(subnetRow).join('')}</div>
        <div><button type="button" class="btn small" data-add-subnet>+ Añadir subred</button></div></div>
      <div class="field"><span>Diagrama (arrastra, pega con Ctrl+V o haz clic)</span>
        <div class="img-drop" data-drop>${t.image ? `<img src="${t.image}" alt="">` : ''}<div>${t.image ? 'Clic para sustituir · ' : ''}Arrastra aquí una imagen o pégala desde el portapapeles</div></div>
        <div class="row"><input type="file" accept="image/*" data-file hidden>${t.image ? '<button type="button" class="btn small danger" data-rm-img>Quitar imagen</button>' : ''}</div>
      </div>
      <label class="field"><span>Notas / diagrama en texto (peering, TGW, endpoints, rutas, SG, NLB…)</span><textarea name="notes" class="mono" rows="8" placeholder="Internet → ALB (pública) → NLB → Apigee runtime&#10;Peering: vpc-xxx <-> vpc-yyy">${esc(t.notes || '')}</textarea></label>
      <label class="field"><span>Links relacionados (uno por línea)</span><textarea name="links" rows="2" placeholder="https://…">${esc(t.links || '')}</textarea></label>`;

    const drop = $('[data-drop]', wrap);
    const fileIn = $('[data-file]', wrap);
    const setImage = async file => {
      if (!file || !file.type.startsWith('image/')) return;
      try {
        t.image = await compressImage(file);
        drop.innerHTML = `<img src="${t.image}" alt=""><div>Clic para sustituir</div>`;
        UI.toast(`Imagen añadida (${Math.round(t.image.length / 1024)} KB)`);
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    drop.onclick = () => fileIn.click();
    fileIn.onchange = () => setImage(fileIn.files[0]);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); setImage(e.dataTransfer.files[0]); });
    const onPaste = e => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); setImage(item.getAsFile()); }
    };
    document.addEventListener('paste', onPaste);
    const rm = $('[data-rm-img]', wrap);
    if (rm) rm.onclick = () => { delete t.image; drop.innerHTML = '<div>Arrastra aquí una imagen o pégala desde el portapapeles</div>'; rm.remove(); };

    const subs = $('[data-subnets]', wrap);
    $('[data-add-subnet]', wrap).onclick = () => { subs.insertAdjacentHTML('beforeend', subnetRow()); subs.lastElementChild.querySelector('input').focus(); };
    subs.addEventListener('click', e => { if (e.target.closest('[data-del-subnet]')) e.target.closest('.subnet-row').remove(); });

    const m = UI.modal({
      title: topo ? 'Editar topología' : 'Nueva topología', body: wrap, size: 'wide',
      onClose: () => document.removeEventListener('paste', onPaste),
      actions: [
        { label: 'Cancelar', cls: 'ghost', onClick: c => c() },
        {
          label: 'Guardar', cls: 'primary', onClick: close => {
            const get = n => wrap.querySelector(`[name="${n}"]`).value;
            if (!get('name').trim()) { wrap.querySelector('[name="name"]').classList.add('invalid'); UI.toast('El nombre es obligatorio', 'error'); return; }
            ['name', 'env', 'account', 'region', 'vpc', 'cidr'].forEach(k => { t[k] = get(k).trim(); });
            t.notes = get('notes'); t.links = get('links');
            t.subnets = $$('.subnet-row', subs).map(r => {
              const o = {}; $$('[data-k]', r).forEach(i => { o[i.dataset.k] = i.value.trim(); }); return o;
            }).filter(s => s.name || s.cidr);
            t.updated = Date.now();
            const all = loadTopos();
            if (topo) { const i = all.findIndex(x => x.id === topo.id); all[i] = t; }
            else { t.id = uid(); t.created = Date.now(); all.unshift(t); }
            if (saveTopos(all)) { close(); onSaved(); UI.toast('Topología guardada'); }
          },
        },
      ],
    });
    return m;
  }

  function viewTopo(topo, onChange) {
    const links = (topo.links || '').split('\n').map(s => s.trim()).filter(Boolean);
    const body = `
      <div class="row wrap" style="margin-bottom:12px">
        ${topo.env ? `<span class="badge accent">${esc(topo.env)}</span>` : ''}
        ${topo.region ? `<span class="badge">${esc(topo.region)}</span>` : ''}
        ${topo.account ? `<span class="badge mono">${esc(topo.account)}</span>` : ''}
        ${topo.vpc ? `<span class="badge mono">${esc(topo.vpc)}</span>` : ''}
        ${topo.cidr ? `<span class="badge info mono">${esc(topo.cidr)}</span>` : ''}
        <span class="muted small">Actualizada ${UI.ago(topo.updated)}</span>
      </div>
      ${topo.image ? `<img class="topo-img" src="${topo.image}" alt="Diagrama" data-zoom>` : ''}
      ${(topo.subnets || []).length ? `<h3 style="margin:16px 0 8px">Subredes</h3><div class="table-wrap"><table class="grid"><tr><th>Nombre</th><th>CIDR</th><th>AZ</th><th>Tipo</th><th>Notas</th></tr>
        ${topo.subnets.map(s => `<tr><td>${esc(s.name)}</td><td class="mono">${esc(s.cidr)}</td><td>${esc(s.az)}</td><td>${esc(s.type)}</td><td>${esc(s.notes)}</td></tr>`).join('')}</table></div>` : ''}
      ${topo.notes ? `<h3 style="margin:16px 0 8px">Notas</h3><pre class="out wrap mono">${esc(topo.notes)}</pre>` : ''}
      ${links.length ? `<h3 style="margin:16px 0 8px">Links</h3>${links.map(l => { const u = UI.safeUrl(l); return u ? `<div><a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a></div>` : ''; }).join('')}` : ''}`;
    const m = UI.modal({
      title: topo.name, body, size: 'xl',
      actions: [
        { label: 'Eliminar', cls: 'danger', onClick: async c => { if (await UI.confirm(`¿Eliminar la topología "${topo.name}"?`)) { saveTopos(loadTopos().filter(t => t.id !== topo.id)); c(); onChange(); } } },
        { label: 'Duplicar', cls: 'ghost', onClick: c => { const all = loadTopos(); const copy = { ...JSON.parse(JSON.stringify(topo)), id: uid(), name: topo.name + ' (copia)', created: Date.now(), updated: Date.now() }; all.unshift(copy); saveTopos(all); c(); onChange(); } },
        { label: 'Editar', cls: 'primary', onClick: c => { c(); editTopo(topo, onChange); } },
      ],
    });
    const img = $('[data-zoom]', m.el);
    if (img) img.onclick = () => lightbox(topo.image);
  }

  function renderTopos(root) {
    let q = '';
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" class="grow" placeholder="Buscar por nombre, VPC, CIDR, región, notas…" data-tq>
        <button class="btn primary" type="button" data-tadd>+ Nueva topología</button>
      </div><div data-tbody></div>`;
    const body = $('[data-tbody]', root);
    function draw() {
      const all = loadTopos();
      const f = all.filter(t => !q || [t.name, t.env, t.account, t.region, t.vpc, t.cidr, t.notes, ...(t.subnets || []).map(s => s.name + ' ' + s.cidr)].join(' ').toLowerCase().includes(q));
      if (!f.length) { body.innerHTML = `<div class="empty">${all.length ? 'Ninguna topología coincide.' : 'Guarda aquí tus VPCs, subredes, diagramas y notas de red.'}</div>`; return; }
      body.innerHTML = `<div class="topo-grid">${f.map(t => `
        <div class="topo-card" data-id="${t.id}">
          <div class="topo-thumb" style="${t.image ? `background-image:url('${t.image}')` : ''}">${t.image ? '' : 'sin diagrama'}</div>
          <div class="topo-info">
            <div style="font-weight:600">${esc(t.name)}</div>
            <div class="row">
              ${t.env ? `<span class="badge accent">${esc(t.env)}</span>` : ''}
              ${t.region ? `<span class="badge">${esc(t.region)}</span>` : ''}
              ${t.cidr ? `<span class="badge info mono">${esc(t.cidr)}</span>` : ''}
            </div>
            <div class="muted small">${(t.subnets || []).length} subredes · ${UI.ago(t.updated)}</div>
          </div>
        </div>`).join('')}</div>`;
    }
    body.addEventListener('click', e => {
      const c = e.target.closest('.topo-card'); if (!c) return;
      const t = loadTopos().find(x => x.id === c.dataset.id); if (t) viewTopo(t, draw);
    });
    $('[data-tq]', root).addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    $('[data-tadd]', root).onclick = () => editTopo(null, draw);
    draw();
  }

  window.renderTopologies = renderTopos;
})();
