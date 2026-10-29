'use strict';

App.register({
  id: 'pem', title: 'PEM', sub: 'una línea', group: 'Herramientas', keywords: 'certificado clave cabeceras keystore kvm',
  render(v) {
    const TYPES = ['CERTIFICATE', 'PUBLIC KEY', 'PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'CERTIFICATE REQUEST', 'RSA PUBLIC KEY'];
    v.innerHTML = `
      <div class="card">
        <p class="muted">Pega un certificado, clave o CSR (también funciona con cadenas de varios bloques o con texto que ya tenga <code>\\n</code> literales).</p>
        <textarea data-in class="mono" rows="11" spellcheck="false" placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDdzCCAl+gAwIBAgIE…&#10;-----END CERTIFICATE-----"></textarea>
        <div class="row wrap" style="margin-top:10px">
          <div class="btn-group">
            <button class="btn" type="button" data-m="body">Quitar cabeceras (una línea)</button>
            <button class="btn" type="button" data-m="escaped">PEM en una línea con \\n</button>
            <button class="btn" type="button" data-m="clean">Normalizar PEM (64 col.)</button>
          </div>
          <span class="sep"></span>
          <select data-type>${TYPES.map(t => `<option>${t}</option>`).join('')}</select>
          <button class="btn" type="button" data-m="wrap">Una línea a PEM</button>
        </div>
        <div data-info class="msg info"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Resultado</h3><div class="row"><span data-len class="muted small"></span><button class="btn small primary" type="button" data-copy>Copiar</button></div></div>
        <pre data-out class="out wrap mono"></pre>
      </div>`;
    const inp = $('[data-in]', v), out = $('[data-out]', v), info = $('[data-info]', v);
    let mode = Store.get('pem-mode', 'body');
    const run = () => {
      const txt = inp.value;
      $$('[data-m]', v).forEach(b => b.classList.toggle('active', b.dataset.m === mode));
      info.className = 'msg info'; info.textContent = '';
      if (!txt.trim()) { out.textContent = ''; $('[data-len]', v).textContent = ''; return; }
      const blocks = PEM.blocks(txt);
      let res = '';
      if (blocks.length) info.textContent = 'Detectado: ' + blocks.map(b => b.type + (b.encrypted ? ' (cifrada)' : '')).join(' + ');
      if (mode === 'body') res = blocks.length ? blocks.map(b => b.body).join('\n') : PEM.normalize(txt).replace(/\s+/g, '');
      else if (mode === 'escaped') res = (blocks.length ? blocks.map(b => PEM.wrap(b.body, b.type)).join('\n') : PEM.wrap(txt, $('[data-type]', v).value)).replace(/\n/g, '\\n');
      else if (mode === 'clean') res = blocks.length ? blocks.map(b => PEM.wrap(b.body, b.type)).join('\n') : PEM.wrap(txt, $('[data-type]', v).value);
      else if (mode === 'wrap') {
        if (blocks.length) { res = blocks.map(b => PEM.wrap(b.body, b.type)).join('\n'); info.textContent += ' · ya tenía cabeceras, se ha normalizado.'; }
        else res = PEM.wrap(PEM.normalize(txt), $('[data-type]', v).value);
      }
      if (!blocks.length && mode !== 'wrap' && mode !== 'body') { info.className = 'msg warn'; info.textContent = 'No se han encontrado cabeceras BEGIN/END: se usa el tipo seleccionado.'; }
      out.textContent = res;
      $('[data-len]', v).textContent = res.length.toLocaleString('es-ES') + ' caracteres';
    };
    $$('[data-m]', v).forEach(b => { b.onclick = () => { mode = b.dataset.m; Store.set('pem-mode', mode); run(); }; });
    $('[data-type]', v).onchange = run;
    inp.addEventListener('input', run);
    $('[data-copy]', v).onclick = () => UI.copy(out.textContent);
    run(); inp.focus();
  },
});

function b64Pane(v) {
    v.innerHTML = `
      <div class="row wrap" style="margin-bottom:12px">
        <label class="check"><input type="checkbox" data-url> Base64URL (sin padding, - y _)</label>
        <label class="check"><input type="checkbox" data-wrap> Partir en líneas de 76</label>
        <span class="sep"></span>
        <label class="btn small">Archivo a Base64<input type="file" data-file hidden></label>
        <button class="btn small" type="button" data-swap>Intercambiar</button>
        <button class="btn small ghost" type="button" data-clear>Limpiar</button>
      </div>
      <div class="grid2">
        <div class="card"><div class="card-head"><h3>Texto plano</h3><div class="row"><span class="muted small" data-l1></span><button class="btn small" type="button" data-c1>Copiar</button></div></div>
          <textarea data-plain class="mono tall" spellcheck="false" placeholder="Escribe o pega texto para codificar…"></textarea></div>
        <div class="card"><div class="card-head"><h3>Base64</h3><div class="row"><span class="muted small" data-l2></span><button class="btn small" type="button" data-c2>Copiar</button></div></div>
          <textarea data-b64 class="mono tall" spellcheck="false" placeholder="…o pega Base64 para decodificar"></textarea>
          <div data-err class="msg"></div></div>
      </div>`;
    const plain = $('[data-plain]', v), b64 = $('[data-b64]', v), err = $('[data-err]', v);
    const urlCb = $('[data-url]', v), wrapCb = $('[data-wrap]', v);
    const lens = () => { $('[data-l1]', v).textContent = plain.value.length + ' car.'; $('[data-l2]', v).textContent = b64.value.length + ' car.'; };
    const fmt = s => { if (urlCb.checked) s = B64.urlSafe(s); if (wrapCb.checked) s = (s.match(/.{1,76}/g) || []).join('\n'); return s; };
    const encode = () => { err.textContent = ''; err.className = 'msg'; b64.value = plain.value ? fmt(B64.encode(plain.value)) : ''; lens(); };
    const decode = () => {
      err.textContent = ''; err.className = 'msg';
      if (!b64.value.trim()) { plain.value = ''; lens(); return; }
      try {
        const bytes = B64.toBytes(b64.value);
        try { plain.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch (e) { plain.value = Hex.from(bytes, ' '); err.className = 'msg warn'; err.textContent = `Contenido binario (${bytes.length} bytes): se muestra en hexadecimal.`; }
      } catch (e) { err.className = 'msg err'; err.textContent = e.message; }
      lens();
    };
    plain.addEventListener('input', encode);
    b64.addEventListener('input', decode);
    urlCb.onchange = encode; wrapCb.onchange = encode;
    $('[data-c1]', v).onclick = () => UI.copy(plain.value);
    $('[data-c2]', v).onclick = () => UI.copy(b64.value);
    $('[data-clear]', v).onclick = () => { plain.value = ''; b64.value = ''; err.textContent = ''; lens(); };
    $('[data-swap]', v).onclick = () => { const t = plain.value; plain.value = b64.value; b64.value = t; decode(); };
    $('[data-file]', v).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const buf = new Uint8Array(await readFileAs(f));
      b64.value = fmt(B64.fromBytes(buf)); plain.value = ''; lens();
      err.className = 'msg info'; err.textContent = `${f.name} · ${buf.length.toLocaleString('es-ES')} bytes codificados`;
      e.target.value = '';
    };
    lens(); plain.focus();
}

function basicPane(v) {
    v.innerHTML = `
      <div class="grid2">
        <div class="card"><div class="card-head"><h3>Generar cabecera</h3></div>
          <label class="field"><span>Usuario / Client ID</span><input data-u class="mono"></label>
          <label class="field"><span>Contraseña / Client Secret</span><input data-p class="mono"></label>
          <div class="list-out"><div><span data-h></span><button class="btn small ghost" type="button" data-ch>Copiar</button></div></div>
          <p class="muted small" style="margin-top:8px">Ejemplo curl:</p>
          <div class="list-out"><div><span data-curl></span><button class="btn small ghost" type="button" data-cc>Copiar</button></div></div></div>
        <div class="card"><div class="card-head"><h3>Decodificar cabecera</h3></div>
          <input data-in class="mono" style="width:100%" placeholder="Basic dXN1YXJpbzpjbGF2ZQ==">
          <div data-out style="margin-top:12px"></div></div>
      </div>`;
    const gen = () => {
      const h = 'Basic ' + B64.encode($('[data-u]', v).value + ':' + $('[data-p]', v).value);
      $('[data-h]', v).textContent = 'Authorization: ' + h;
      $('[data-curl]', v).textContent = `curl -X POST 'https://<host>/oauth/token' -H '${'Authorization: ' + h}' -d 'grant_type=client_credentials'`;
    };
    $('[data-u]', v).addEventListener('input', gen); $('[data-p]', v).addEventListener('input', gen);
    $('[data-ch]', v).onclick = () => UI.copy($('[data-h]', v).textContent.replace(/^Authorization: /, ''));
    $('[data-cc]', v).onclick = () => UI.copy($('[data-curl]', v).textContent);
    $('[data-in]', v).addEventListener('input', e => {
      const o = $('[data-out]', v); const s = e.target.value.trim().replace(/^Authorization:\s*/i, '').replace(/^Basic\s+/i, '');
      if (!s) { o.innerHTML = ''; return; }
      try {
        const d = B64.decode(s); const i = d.indexOf(':');
        o.innerHTML = i < 0 ? `<div class="msg warn">Decodificado sin «:»: ${esc(d)}</div>`
          : `<table class="kv"><tr><th>Usuario</th><td class="mono">${esc(d.slice(0, i))}</td></tr><tr><th>Contraseña</th><td class="mono">${esc(d.slice(i + 1))}</td></tr></table>`;
      } catch (err) { o.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
    });
    gen();
}

App.register({
  id: 'base64', title: 'Base64 / Basic Auth', sub: 'converter + auth header', group: 'Herramientas', keywords: 'codificar decodificar encode decode basic auth authorization header client id secret',
  render(view) {
    view.innerHTML = '<div class="tabs"><button type="button" data-tab="b64">Base64</button><button type="button" data-tab="basic">Basic Auth</button></div><div data-pane></div>';
    let pane = $('[data-pane]', view);
    const show = t => {
      Store.set('base64-tab', t);
      $$('.tabs button', view).forEach(b => b.classList.toggle('active', b.dataset.tab === t));
      const p = pane.cloneNode(false);
      pane.replaceWith(p);
      pane = p;
      if (t === 'basic') basicPane(p); else b64Pane(p);
    };
    $$('.tabs button', view).forEach(b => { b.onclick = () => show(b.dataset.tab); });
    show(Store.get('base64-tab', 'b64'));
  },
});

App.register({
  id: 'jwt', title: 'JWT', sub: 'decode + verify + sign', group: 'Herramientas', keywords: 'token jwt.io bearer oauth decodificar verificar firmar',
  render(v) {
    const SAMPLE_SECRET = 'mi-secreto-de-pruebas-de-32-bytes!!';
    v.innerHTML = `
      <div class="grid2">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Token codificado</h3><div class="row">
              <button class="btn small ghost" type="button" data-sample>Ejemplo</button>
              <button class="btn small" type="button" data-copy>Copiar</button>
              <button class="btn small ghost" type="button" data-clear>Limpiar</button></div></div>
            <textarea data-tok class="mono" rows="9" spellcheck="false" placeholder="Pega un JWT (eyJhbGciOi…). También acepta «Bearer eyJ…»"></textarea>
            <div data-colored class="jwt-colored mono"></div>
            <div data-err class="msg"></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Firma</h3><span data-badge class="badge">—</span></div>
            <label class="field"><span data-klabel>Secreto o clave pública</span>
              <textarea data-key class="mono" rows="5" spellcheck="false" placeholder="HS*: el secreto · RS/PS/ES: clave pública PEM, certificado o JWK"></textarea></label>
            <label class="check" data-b64wrap><input type="checkbox" data-b64> El secreto está codificado en Base64</label>
            <details data-signbox>
              <summary>Firmar y generar un token nuevo</summary>
              <p class="muted small">Se usan el header y el payload de la derecha. Para HS* se usa el secreto de arriba; para RS/PS/ES pega aquí la clave privada.</p>
              <textarea data-priv class="mono" rows="5" spellcheck="false" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
              <div class="row wrap" style="margin-top:8px">
                <button class="btn primary" type="button" data-sign>Generar token firmado</button>
                <button class="btn" type="button" data-now>iat = ahora, exp = +1 h</button>
              </div>
            </details>
          </div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3>Header</h3><span class="muted small">algoritmo y tipo</span></div>
            <textarea data-h class="mono jwt-h" rows="5" spellcheck="false"></textarea></div>
          <div class="card"><div class="card-head"><h3>Payload</h3><span class="muted small">claims</span></div>
            <textarea data-p class="mono jwt-p" rows="12" spellcheck="false"></textarea>
            <div data-claims style="margin-top:10px"></div></div>
        </div>
      </div>`;
    const tok = $('[data-tok]', v), hTa = $('[data-h]', v), pTa = $('[data-p]', v), keyTa = $('[data-key]', v), privTa = $('[data-priv]', v);
    const err = $('[data-err]', v), badge = $('[data-badge]', v), b64cb = $('[data-b64]', v);
    let parts = null, header = null, seq = 0;

    const setBadge = (cls, txt) => { badge.className = 'badge ' + cls; badge.textContent = txt; };
    const showErr = (m, cls = 'err') => { err.className = 'msg ' + cls; err.textContent = m || ''; };

    function claimsTable(p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return '';
      const desc = { iss: 'Emisor', sub: 'Sujeto', aud: 'Audiencia', exp: 'Expira', nbf: 'No válido antes de', iat: 'Emitido', jti: 'ID del token', scope: 'Scopes', client_id: 'Client ID', azp: 'Parte autorizada', auth_time: 'Autenticación' };
      const now = Date.now() / 1000;
      const rows = Object.keys(p).filter(k => desc[k] || ['exp', 'iat', 'nbf', 'auth_time'].includes(k)).map(k => {
        let val = p[k];
        if (['exp', 'iat', 'nbf', 'auth_time'].includes(k) && typeof val === 'number') {
          const ms = val * 1000;
          let extra = `<span class="muted"> · ${UI.ago(ms)}</span>`;
          if (k === 'exp') extra += val < now ? ' <span class="badge err">expirado</span>' : ' <span class="badge ok">vigente</span>';
          if (k === 'nbf' && val > now) extra += ' <span class="badge warn">aún no válido</span>';
          return `<tr><th>${desc[k]} <code>${k}</code></th><td>${new Date(ms).toLocaleString('es-ES')} <span class="muted mono">(${val})</span>${extra}</td></tr>`;
        }
        if (typeof val === 'object') val = JSON.stringify(val);
        return `<tr><th>${desc[k]} <code>${k}</code></th><td>${esc(val)}</td></tr>`;
      });
      return rows.length ? `<table class="kv">${rows.join('')}</table>` : '';
    }

    function updateKeyUi() {
      const alg = header && header.alg;
      const hs = alg && alg.startsWith('HS');
      $('[data-klabel]', v).textContent = hs ? `Secreto (${alg})` : alg && alg !== 'none' ? `Clave pública / certificado / JWK (${alg})` : 'Secreto o clave pública';
      $('[data-b64wrap]', v).style.display = hs || !alg ? '' : 'none';
      privTa.style.display = hs ? 'none' : '';
    }

    async function verify() {
      const my = ++seq;
      if (!parts || !header) { setBadge('', '—'); return; }
      const alg = header.alg;
      if (alg === 'none') { setBadge('warn', 'Sin firma (alg: none)'); return; }
      if (!JWT_ALGS[alg]) { setBadge('warn', 'Algoritmo no soportado: ' + alg); return; }
      if (!keyTa.value.trim()) { setBadge('', alg.startsWith('HS') ? 'Introduce el secreto para verificar' : 'Introduce la clave pública para verificar'); return; }
      try {
        const key = await JwtCrypto.importKey(alg, keyTa.value, 'verify', b64cb.checked);
        const ok = await crypto.subtle.verify(JwtCrypto.params(alg), key, B64.toBytes(parts[2] || ''), new TextEncoder().encode(parts[0] + '.' + parts[1]));
        if (my === seq) setBadge(ok ? 'ok' : 'err', ok ? 'Firma verificada' : 'Firma no válida');
      } catch (e) { if (my === seq) setBadge('warn', e.message); }
    }

    function decode(fromEdit = false) {
      showErr('');
      const raw = tok.value.trim().replace(/^Bearer\s+/i, '');
      $('[data-colored]', v).innerHTML = '';
      if (!raw) { parts = header = null; if (!fromEdit) { hTa.value = ''; pTa.value = ''; } $('[data-claims]', v).innerHTML = ''; setBadge('', '—'); updateKeyUi(); return; }
      const p = raw.split('.');
      $('[data-colored]', v).innerHTML = p.map((s, i) => `<span class="${['j-h', 'j-p', 'j-s', 'j-s', 'j-s'][i]}">${esc(s)}</span>`).join('.');
      if (p.length === 5) { showErr('Parece un JWE (token cifrado, 5 partes): no se puede decodificar el contenido sin la clave.', 'warn'); parts = header = null; return; }
      if (p.length !== 3) { showErr(`Un JWT debe tener 3 partes separadas por puntos (tiene ${p.length}).`); parts = header = null; return; }
      parts = p;
      try { header = JSON.parse(B64.decode(p[0])); if (!fromEdit) hTa.value = JSON.stringify(header, null, 2); }
      catch (e) { header = null; showErr('El header no es JSON Base64URL válido.'); }
      let payload = null;
      try { const txt = B64.decode(p[1]); try { payload = JSON.parse(txt); if (!fromEdit) pTa.value = JSON.stringify(payload, null, 2); } catch (e) { if (!fromEdit) pTa.value = txt; } }
      catch (e) { showErr('El payload no es Base64URL válido.'); }
      $('[data-claims]', v).innerHTML = claimsTable(payload);
      updateKeyUi(); verify();
    }

    async function sign() {
      let h, p;
      try { h = JSON.parse(hTa.value); hTa.classList.remove('invalid'); } catch (e) { hTa.classList.add('invalid'); showErr('El header no es JSON válido.'); return false; }
      try { p = JSON.parse(pTa.value); pTa.classList.remove('invalid'); } catch (e) { pTa.classList.add('invalid'); showErr('El payload no es JSON válido.'); return false; }
      const alg = h.alg || 'none';
      const enc = o => B64.urlSafe(B64.encode(JSON.stringify(o)));
      const input = enc(h) + '.' + enc(p);
      try {
        let sig = '';
        if (alg !== 'none') {
          const hs = alg.startsWith('HS');
          const key = await JwtCrypto.importKey(alg, hs ? keyTa.value : privTa.value, 'sign', hs && b64cb.checked);
          sig = B64.urlSafe(B64.fromBytes(new Uint8Array(await crypto.subtle.sign(JwtCrypto.params(alg), key, new TextEncoder().encode(input)))));
        }
        tok.value = input + '.' + sig;
        decode(true);
        return true;
      } catch (e) { showErr(e.message); return false; }
    }

    const onEdit = debounce(async () => {
      let h, p;
      try { h = JSON.parse(hTa.value); hTa.classList.remove('invalid'); } catch (e) { hTa.classList.add('invalid'); return; }
      try { p = JSON.parse(pTa.value); pTa.classList.remove('invalid'); } catch (e) { pTa.classList.add('invalid'); return; }
      const alg = h.alg || 'none';
      const canSign = alg === 'none' || (alg.startsWith('HS') ? keyTa.value : privTa.value.trim());
      if (canSign && JWT_ALGS[alg] || alg === 'none') { await sign(); return; }
      const enc = o => B64.urlSafe(B64.encode(JSON.stringify(o)));
      tok.value = enc(h) + '.' + enc(p) + '.' + (parts ? parts[2] : '');
      decode(true);
    }, 300);

    tok.addEventListener('input', () => decode(false));
    hTa.addEventListener('input', onEdit);
    pTa.addEventListener('input', onEdit);
    keyTa.addEventListener('input', debounce(verify, 250));
    b64cb.onchange = verify;
    $('[data-sign]', v).onclick = async () => { if (await sign()) UI.toast('Token generado'); };
    $('[data-now]', v).onclick = () => {
      try { const p = JSON.parse(pTa.value || '{}'); const n = Math.floor(Date.now() / 1000); p.iat = n; p.exp = n + 3600; pTa.value = JSON.stringify(p, null, 2); onEdit(); }
      catch (e) { showErr('El payload no es JSON válido.'); }
    };
    $('[data-copy]', v).onclick = () => UI.copy(tok.value.trim());
    $('[data-clear]', v).onclick = () => { tok.value = ''; decode(); };
    $('[data-sample]', v).onclick = async () => {
      const n = Math.floor(Date.now() / 1000);
      hTa.value = JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2);
      pTa.value = JSON.stringify({ sub: 'app-cliente-123', iss: 'https://api.ejemplo.com', aud: 'apigee', scope: 'read write', iat: n, exp: n + 3600 }, null, 2);
      keyTa.value = SAMPLE_SECRET; b64cb.checked = false;
      await sign();
    };
    tok.focus();
  },
});

App.register({
  id: 'diff', title: 'Comparador de texto', sub: 'comparador', group: 'Herramientas', keywords: 'diff comparar diferencias',
  render(v) {
    v.innerHTML = `
      <div class="grid2">
        <div class="card"><div class="card-head"><h3>Original</h3><span class="muted small" data-la></span></div><textarea data-a class="mono" rows="12" spellcheck="false" placeholder="Texto A"></textarea></div>
        <div class="card"><div class="card-head"><h3>Modificado</h3><span class="muted small" data-lb></span></div><textarea data-b class="mono" rows="12" spellcheck="false" placeholder="Texto B"></textarea></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="row wrap" style="margin-bottom:12px">
          <div class="btn-group"><button class="btn small" type="button" data-view="split">Lado a lado</button><button class="btn small" type="button" data-view="unified">Unificado</button></div>
          <label class="check"><input type="checkbox" data-opt="ws"> Ignorar espacios</label>
          <label class="check"><input type="checkbox" data-opt="case"> Ignorar mayúsculas</label>
          <label class="check"><input type="checkbox" data-opt="json"> Normalizar JSON (ordena claves)</label>
          <label class="check"><input type="checkbox" data-opt="only"> Solo cambios</label>
          <span class="grow"></span>
          <span data-sum></span>
          <button class="btn small" type="button" data-swap>Intercambiar</button>
          <button class="btn small ghost" type="button" data-clear>Limpiar</button>
        </div>
        <div data-out></div>
      </div>`;
    const A = $('[data-a]', v), B = $('[data-b]', v), out = $('[data-out]', v);
    const opts = Object.assign({ view: 'split', ws: false, case: false, json: false, only: false }, Store.get('diff-opts', {}));
    $$('[data-opt]', v).forEach(c => { c.checked = !!opts[c.dataset.opt]; });

    const sortKeys = o => Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.keys(o).sort().reduce((r, k) => { r[k] = sortKeys(o[k]); return r; }, {}) : o;
    const prep = t => { if (opts.json) { try { return JSON.stringify(sortKeys(JSON.parse(t)), null, 2); } catch (e) { } } return t; };
    const key = l => { if (opts.ws) l = l.trim().replace(/\s+/g, ' '); if (opts.case) l = l.toLowerCase(); return l; };

    function lineDiff(a, b) {
      const ka = a.map(key), kb = b.map(key);
      let pre = 0; while (pre < ka.length && pre < kb.length && ka[pre] === kb[pre]) pre++;
      let suf = 0; while (suf < ka.length - pre && suf < kb.length - pre && ka[ka.length - 1 - suf] === kb[kb.length - 1 - suf]) suf++;
      const X = ka.slice(pre, ka.length - suf), Y = kb.slice(pre, kb.length - suf);
      const n = X.length, m = Y.length;
      if ((n + 1) * (m + 1) > 9e6) throw new Error('Los textos tienen demasiadas líneas distintas para compararlos aquí (máx. ~3000×3000).');
      const W = m + 1, L = new Uint32Array((n + 1) * W);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = X[i] === Y[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      const ops = [];
      for (let k = 0; k < pre; k++) ops.push({ t: 'eq', a: k, b: k });
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (X[i] === Y[j]) { ops.push({ t: 'eq', a: pre + i, b: pre + j }); i++; j++; }
        else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) ops.push({ t: 'del', a: pre + i++ });
        else ops.push({ t: 'add', b: pre + j++ });
      }
      while (i < n) ops.push({ t: 'del', a: pre + i++ });
      while (j < m) ops.push({ t: 'add', b: pre + j++ });
      for (let k = 0; k < suf; k++) ops.push({ t: 'eq', a: a.length - suf + k, b: b.length - suf + k });
      return ops;
    }
    function intra(x, y) {
      let p = 0; while (p < x.length && p < y.length && x[p] === y[p]) p++;
      let s = 0; while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
      const w = (str, a, b) => esc(str.slice(0, a)) + (b > a ? `<mark>${esc(str.slice(a, b))}</mark>` : '') + esc(str.slice(b));
      return [w(x, p, x.length - s), w(y, p, y.length - s)];
    }

    function run() {
      Store.set('diff-opts', opts);
      $$('[data-view]', v).forEach(b => b.classList.toggle('active', b.dataset.view === opts.view));
      const ta = prep(A.value), tb = prep(B.value);
      const a = ta.split('\n'), b = tb.split('\n');
      $('[data-la]', v).textContent = A.value ? a.length + ' líneas' : '';
      $('[data-lb]', v).textContent = B.value ? b.length + ' líneas' : '';
      if (!A.value && !B.value) { out.innerHTML = '<div class="empty">Pega dos textos para compararlos.</div>'; $('[data-sum]', v).innerHTML = ''; return; }
      let ops;
      try { ops = lineDiff(a, b); } catch (e) { out.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
      const adds = ops.filter(o => o.t === 'add').length, dels = ops.filter(o => o.t === 'del').length;
      $('[data-sum]', v).innerHTML = adds || dels ? `<span class="badge ok">+${adds}</span> <span class="badge err">−${dels}</span>` : '<span class="badge ok">idénticos</span>';

      const rows = [];
      for (let k = 0; k < ops.length;) {
        if (ops[k].t === 'eq') { rows.push({ t: 'eq', a: ops[k].a, b: ops[k].b }); k++; continue; }
        const d = [], ad = [];
        while (k < ops.length && ops[k].t !== 'eq') { (ops[k].t === 'del' ? d : ad).push(ops[k]); k++; }
        const n = Math.max(d.length, ad.length);
        for (let z = 0; z < n; z++) rows.push({ t: 'chg', a: d[z] ? d[z].a : null, b: ad[z] ? ad[z].b : null });
      }
      const CTX = 3; const show = rows.map(() => !opts.only);
      if (opts.only) rows.forEach((r, i) => { if (r.t === 'chg') for (let z = Math.max(0, i - CTX); z <= Math.min(rows.length - 1, i + CTX); z++) show[z] = true; });

      const html = []; let skipped = 0;
      const flushSkip = cols => { if (skipped) { html.push(`<tr class="skip"><td colspan="${cols}">··· ${skipped} líneas iguales ···</td></tr>`); skipped = 0; } };
      if (opts.view === 'split') {
        html.push('<table class="diff"><colgroup><col style="width:46px"><col><col style="width:46px"><col></colgroup>');
        rows.forEach((r, i) => {
          if (!show[i]) { skipped++; return; }
          flushSkip(4);
          const la = r.a != null ? a[r.a] : null, lb = r.b != null ? b[r.b] : null;
          if (r.t === 'eq') { html.push(`<tr><td class="ln">${r.a + 1}</td><td>${esc(la)}</td><td class="ln">${r.b + 1}</td><td>${esc(lb)}</td></tr>`); return; }
          let ha = la != null ? esc(la) : '', hb = lb != null ? esc(lb) : '';
          if (la != null && lb != null) [ha, hb] = intra(la, lb);
          html.push(`<tr><td class="ln">${la != null ? r.a + 1 : ''}</td><td class="${la != null ? 'del' : 'empty-cell'}">${ha}</td><td class="ln">${lb != null ? r.b + 1 : ''}</td><td class="${lb != null ? 'add' : 'empty-cell'}">${hb}</td></tr>`);
        });
        flushSkip(4);
      } else {
        html.push('<table class="diff"><colgroup><col style="width:46px"><col style="width:46px"><col style="width:18px"><col></colgroup>');
        const pend = [];
        const flushPend = () => { pend.sort((x, y) => (x.t === 'del' ? 0 : 1) - (y.t === 'del' ? 0 : 1)).forEach(p => html.push(p.html)); pend.length = 0; };
        rows.forEach((r, i) => {
          if (!show[i]) { flushPend(); skipped++; return; }
          if (r.t === 'eq') { flushPend(); flushSkip(4); html.push(`<tr><td class="ln">${r.a + 1}</td><td class="ln">${r.b + 1}</td><td class="sg"></td><td>${esc(a[r.a])}</td></tr>`); return; }
          flushSkip(4);
          let ha = r.a != null ? esc(a[r.a]) : null, hb = r.b != null ? esc(b[r.b]) : null;
          if (ha != null && hb != null) [ha, hb] = intra(a[r.a], b[r.b]);
          if (ha != null) pend.push({ t: 'del', html: `<tr class="del"><td class="ln">${r.a + 1}</td><td class="ln"></td><td class="sg">−</td><td>${ha}</td></tr>` });
          if (hb != null) pend.push({ t: 'add', html: `<tr class="add"><td class="ln"></td><td class="ln">${r.b + 1}</td><td class="sg">+</td><td>${hb}</td></tr>` });
        });
        flushPend(); flushSkip(4);
      }
      html.push('</table>');
      out.innerHTML = `<div class="diff-wrap">${html.join('')}</div>`;
    }
    const drun = debounce(run, 250);
    A.addEventListener('input', drun); B.addEventListener('input', drun);
    $$('[data-opt]', v).forEach(c => { c.onchange = () => { opts[c.dataset.opt] = c.checked; run(); }; });
    $$('[data-view]', v).forEach(b => { b.onclick = () => { opts.view = b.dataset.view; run(); }; });
    $('[data-swap]', v).onclick = () => { const t = A.value; A.value = B.value; B.value = t; run(); };
    $('[data-clear]', v).onclick = () => { A.value = ''; B.value = ''; run(); };
    run(); A.focus();
  },
});

App.register({
  id: 'certs', title: 'CSR / certificados', sub: 'csr + crt decoder', group: 'Herramientas', keywords: 'csr x509 certificado decodificar cadena keystore clave privada coincide',
  render(v) {
    v.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>CSR, certificado o cadena (PEM)</h3>
          <div class="row"><label class="btn small">Abrir archivo (.pem .crt .cer .csr .der)<input type="file" data-file hidden></label><button class="btn small ghost" type="button" data-clear>Limpiar</button></div></div>
        <textarea data-in class="mono" rows="10" spellcheck="false" placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;…&#10;-----END CERTIFICATE REQUEST-----"></textarea>
        <details><summary>Comprobar que una clave privada corresponde a estos certificados/CSR</summary>
          <p class="muted small">Útil antes de subir un keystore a Apigee. La clave no sale de tu navegador.</p>
          <textarea data-key class="mono" rows="5" spellcheck="false" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
          <div data-keyres class="msg"></div>
        </details>
      </div>
      <div data-out></div>`;
    const inp = $('[data-in]', v), out = $('[data-out]', v), keyTa = $('[data-key]', v);
    let items = [];
    let derFromFile = null;

    const row = (k, val, mono) => val ? `<tr><th>${k}</th><td class="${mono ? 'mono' : ''}">${val}</td></tr>` : '';
    const dnTable = arr => arr.length ? arr.map(a => `<code>${esc(a.name)}</code>=${esc(a.value)}`).join('<br>') : '<span class="muted">(vacío)</span>';

    function validity(c) {
      const now = Date.now();
      const days = Math.floor((c.notAfter - now) / 86400000);
      let b;
      if (c.notBefore > now) b = '<span class="badge warn">aún no válido</span>';
      else if (days < 0) b = `<span class="badge err">caducado hace ${-days} días</span>`;
      else if (days < 30) b = `<span class="badge warn">caduca en ${days} días</span>`;
      else b = `<span class="badge ok">válido · ${days} días restantes</span>`;
      return `${UI.fmtDate(c.notBefore)} → ${UI.fmtDate(c.notAfter)} ${b}`;
    }

    function renderItem(it, idx) {
      if (it.error) return `<div class="card"><div class="msg err">Bloque ${idx + 1} (${esc(it.type)}): ${esc(it.error)}</div></div>`;
      const c = it.data;
      const san = c.extensions.find(e => e.oid === '2.5.29.17');
      const others = c.extensions.filter(e => e.oid !== '2.5.29.17');
      const isCa = c.kind === 'cert' && /CA: Sí/.test((c.extensions.find(e => e.oid === '2.5.29.19') || {}).value || '');
      const selfSigned = c.kind === 'cert' && X509.nameStr(c.issuer) === X509.nameStr(c.subject);
      const title = c.kind === 'csr' ? 'CSR' : `Certificado ${items.length > 1 ? '#' + (idx + 1) : ''}`;
      return `<div class="card cert-card">
        <div class="card-head"><h3>${title} <span class="badge accent">${esc(X509.cn(c.subject) || X509.nameStr(c.subject) || '(sin CN)')}</span>
          ${isCa ? '<span class="badge violet">CA</span>' : ''}${selfSigned ? '<span class="badge warn">autofirmado</span>' : ''}</h3>
          <button class="btn small" type="button" data-pem="${idx}">Copiar PEM en una línea</button></div>
        <table class="kv">
          ${row('Sujeto', dnTable(c.subject))}
          ${row('DN (una línea)', esc(X509.nameStr(c.subject)), true)}
          ${c.kind === 'cert' ? row('Emisor', esc(X509.nameStr(c.issuer))) : ''}
          ${c.kind === 'cert' ? row('Validez', validity(c)) : ''}
          ${c.kind === 'cert' ? row('Número de serie', esc(c.serial.toUpperCase().match(/.{1,2}/g).join(':')), true) : ''}
          ${row('Clave pública', esc(X509.keyDesc(c.spki)))}
          ${row('Algoritmo de firma', esc(c.sigAlg))}
          ${row('Subject Alternative Names', san ? esc(san.value).replace(/\n/g, '<br>') : '<span class="muted">ninguno</span>')}
          ${others.map(e => row(esc(e.name) + (e.critical ? ' <span class="tag">crítica</span>' : ''), esc(e.value).replace(/\n/g, '<br>'), /Identifier|Hex/.test(e.name))).join('')}
          ${(c.attributes || []).map(a => row(esc(a.name), esc(a.value))).join('')}
          ${row('Versión', String(c.version))}
          <tr><th>Huellas</th><td class="mono small" data-fp="${idx}">calculando…</td></tr>
        </table></div>`;
    }

    async function fingerprints() {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]; const cell = $(`[data-fp="${i}"]`, out); if (!cell || it.error) continue;
        try {
          const s1 = await digestHex('SHA-1', it.data.der), s2 = await digestHex('SHA-256', it.data.der);
          const spki = await digestHex('SHA-256', it.data.spki.der);
          cell.innerHTML = `SHA-1: ${Hex.from(s1, ':').toUpperCase()}<br>SHA-256: ${Hex.from(s2, ':').toUpperCase()}<br><span class="muted">SPKI SHA-256 (pin): ${B64.fromBytes(spki)}</span>`;
        } catch (e) { cell.textContent = e.message; }
      }
    }

    function chainInfo() {
      const certs = items.filter(i => !i.error && i.data.kind === 'cert');
      if (certs.length < 2) return '';
      const lines = [];
      for (let i = 0; i < certs.length - 1; i++) {
        const ok = X509.nameStr(certs[i].data.issuer) === X509.nameStr(certs[i + 1].data.subject);
        lines.push(`<div>${ok ? 'ok' : 'MAL'} #${i + 1} <b>${esc(X509.cn(certs[i].data.subject))}</b> ${ok ? 'emitido por' : 'NO está emitido por'} #${i + 2} <b>${esc(X509.cn(certs[i + 1].data.subject))}</b></div>`);
      }
      const bad = lines.some(l => l.startsWith('<div>MAL'));
      return `<div class="msg ${bad ? 'warn' : 'ok'}" style="margin:0 0 16px"><b>Cadena de ${certs.length} certificados</b> (orden esperado: hoja → intermedios → raíz)${lines.join('')}</div>`;
    }

    function checkKey() {
      const res = $('[data-keyres]', v);
      res.className = 'msg'; res.textContent = '';
      const t = keyTa.value.trim(); if (!t) return;
      const blk = PEM.blocks(t).find(b => /PRIVATE KEY/.test(b.type));
      if (!blk) { res.className = 'msg err'; res.textContent = 'No se encontró ninguna clave privada PEM.'; return; }
      try {
        const pk = X509.privateKeyPublic(blk);
        const valid = items.filter(i => !i.error);
        if (!valid.length) { res.className = 'msg info'; res.textContent = `Clave ${pk.type} leída. Pega arriba un certificado o CSR para compararla.`; return; }
        const match = valid.map((it, i) => {
          const s = it.data.spki;
          const ok = pk.type === 'RSA' ? s.modulus === pk.modulus : s.point === pk.point;
          return { i, ok, name: X509.cn(it.data.subject) || (it.data.kind === 'csr' ? 'CSR' : '#' + (i + 1)) };
        });
        const any = match.find(m => m.ok);
        res.className = 'msg ' + (any ? 'ok' : 'err');
        res.innerHTML = any ? `La clave privada corresponde a: <b>${esc(any.name)}</b>` : 'La clave privada NO corresponde a ninguno de los certificados/CSR.';
      } catch (e) { res.className = 'msg err'; res.textContent = e.message; }
    }

    function run() {
      items = [];
      const blocks = PEM.blocks(inp.value).filter(b => ['CERTIFICATE', 'CERTIFICATE REQUEST', 'NEW CERTIFICATE REQUEST', 'TRUSTED CERTIFICATE'].includes(b.type));
      if (derFromFile && !inp.value.trim()) {
        try { items.push({ type: 'DER', data: X509.decodeCert(derFromFile) }); }
        catch (e) { try { items.push({ type: 'DER', data: X509.decodeCsr(derFromFile) }); } catch (e2) { items.push({ type: 'DER', error: 'No es un certificado ni un CSR en DER válido.' }); } }
      }
      blocks.forEach(b => {
        try { items.push({ type: b.type, body: b.body, data: b.type.includes('REQUEST') ? X509.decodeCsr(b.der()) : X509.decodeCert(b.der()) }); }
        catch (e) { items.push({ type: b.type, error: e.message }); }
      });
      if (!items.length) {
        const other = PEM.blocks(inp.value);
        out.innerHTML = inp.value.trim()
          ? `<div class="msg ${other.length ? 'warn' : 'err'}">${other.length ? `Se encontró un bloque «${esc(other[0].type)}». Esta herramienta decodifica CERTIFICATE y CERTIFICATE REQUEST.` : 'No se encontró ningún bloque PEM válido.'}</div>`
          : '';
        checkKey(); return;
      }
      out.innerHTML = chainInfo() + items.map(renderItem).join('');
      fingerprints(); checkKey();
    }
    out.addEventListener('click', e => {
      const b = e.target.closest('[data-pem]'); if (!b) return;
      const it = items[+b.dataset.pem]; UI.copy(it.body || B64.fromBytes(it.data.der));
    });
    inp.addEventListener('input', debounce(() => { derFromFile = null; run(); }, 200));
    keyTa.addEventListener('input', debounce(checkKey, 200));
    $('[data-clear]', v).onclick = () => { inp.value = ''; keyTa.value = ''; derFromFile = null; run(); };
    $('[data-file]', v).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const bytes = new Uint8Array(await readFileAs(f));
      const text = new TextDecoder('latin1').decode(bytes);
      if (text.includes('-----BEGIN')) { inp.value = text; derFromFile = null; }
      else { inp.value = ''; derFromFile = bytes; }
      run(); e.target.value = '';
    };
    inp.focus();
  },
});
