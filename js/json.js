'use strict';

const JsonCheck = {
  messages: [
    [/Expected double-quoted property name/i, 'Se esperaba un nombre de propiedad entre comillas dobles'],
    [/Unexpected end of JSON input|end of data|Unterminated string in JSON at position \d+$/i, 'El JSON se acaba antes de tiempo (falta cerrar algo)'],
    [/Unexpected non-whitespace character after JSON|unexpected non-whitespace character after JSON data/i, 'Hay contenido después del final del JSON'],
    [/Bad control character in string literal|bad control character/i, 'Carácter de control sin escapar dentro de un string (salto de línea o tabulador)'],
    [/Expected ',' or '}' after property value/i, 'Falta una coma o un } después del valor'],
    [/Expected ',' or '\]' after array element/i, 'Falta una coma o un ] después del elemento'],
    [/Expected ':' after property name/i, 'Faltan los dos puntos después del nombre de la propiedad'],
    [/Unterminated string/i, 'String sin cerrar'],
    [/Bad escaped character|bad escaped character/i, 'Secuencia de escape no válida'],
    [/No number after minus sign|Exponent part is missing|Unterminated fractional|no number after minus sign|missing digits/i, 'Número mal formado'],
    [/Unexpected token '?(.)'?,?/i, m => `Carácter inesperado «${m[1]}»`],
  ],
  parseError(e, text) {
    const raw = e.message;
    let pos = null;
    let m = raw.match(/line (\d+) column (\d+)/i);
    if (m) {
      const lines = text.split('\n');
      pos = 0;
      for (let i = 0; i < +m[1] - 1 && i < lines.length; i++) pos += lines[i].length + 1;
      pos += +m[2] - 1;
    } else if ((m = raw.match(/position (\d+)/i))) pos = +m[1];
    else if (/Unexpected end of JSON input/i.test(raw)) pos = text.length;
    let msg = raw;
    for (const [re, tr] of this.messages) {
      const mm = raw.match(re);
      if (mm) { msg = typeof tr === 'function' ? tr(mm) : tr; break; }
    }
    const hints = [];
    if (pos !== null) {
      const ch = text[pos];
      const before = text.slice(0, pos).replace(/\s+$/, '');
      if ((ch === '}' || ch === ']') && before.endsWith(',')) hints.push('Sobra una coma antes de cerrar.');
      if (ch === "'") hints.push('En JSON los strings y las claves van con comillas dobles, no simples.');
      if (text.slice(pos, pos + 2) === '//' || text.slice(pos, pos + 2) === '/*') hints.push('JSON no admite comentarios.');
      if (/^[A-Za-z_$]/.test(ch || '') && /[{,]$/.test(before)) hints.push('Las claves tienen que ir entre comillas dobles.');
      if (/^(NaN|Infinity|undefined)/.test(text.slice(pos))) hints.push('NaN, Infinity y undefined no son valores JSON válidos.');
    }
    if (/^\s*[\[{]/.test(text) === false && /^\s*"/.test(text) === false && text.trim()) hints.push('Un JSON debe empezar por {, [, comillas, número, true, false o null.');
    let line = null, col = null, snippet = '';
    if (pos !== null) {
      const upto = text.slice(0, pos).split('\n');
      line = upto.length; col = upto[upto.length - 1].length + 1;
      const all = text.split('\n');
      const from = Math.max(0, line - 3);
      const pad = String(line + 1).length;
      snippet = all.slice(from, line).map((l, i) => `${String(from + i + 1).padStart(pad)} | ${l}`).join('\n')
        + '\n' + ' '.repeat(pad) + ' | ' + ' '.repeat(Math.max(0, col - 1)) + '^';
      if (all[line] !== undefined) snippet += '\n' + `${String(line + 1).padStart(pad)} | ${all[line]}`;
    }
    return { msg, raw, pos, line, col, snippet, hints };
  },
  stats(v) {
    let depth = 0, keys = 0, items = 0;
    const walk = (x, d) => {
      depth = Math.max(depth, d);
      if (Array.isArray(x)) { items += x.length; x.forEach(y => walk(y, d + 1)); }
      else if (x && typeof x === 'object') { const k = Object.keys(x); keys += k.length; k.forEach(y => walk(x[y], d + 1)); }
    };
    walk(v, 0);
    const type = Array.isArray(v) ? `array de ${v.length} elementos` : v === null ? 'null' : typeof v === 'object' ? `objeto con ${Object.keys(v).length} claves` : typeof v;
    return { type, depth, keys, items };
  },
  dupKeys(text) {
    const dups = [];
    const stack = [];
    const re = /"(?:[^"\\]|\\.)*"\s*:|[{}\[\]]/g;
    let m;
    while ((m = re.exec(text))) {
      const t = m[0];
      if (t === '{') stack.push(new Set());
      else if (t === '[') stack.push(null);
      else if (t === '}' || t === ']') stack.pop();
      else {
        const set = stack[stack.length - 1];
        if (!set) continue;
        const k = JSON.parse(t.replace(/\s*:$/, ''));
        if (set.has(k)) dups.push(k); else set.add(k);
      }
    }
    return [...new Set(dups)];
  },
};

App.register({
  id: 'json', title: 'Validador JSON', sub: 'validate + pretty', group: 'Herramientas', keywords: 'json validar formatear minificar errores',
  render(v) {
    v.innerHTML = `
      <div class="row wrap" style="margin-bottom:12px">
        <div class="btn-group">
          <button class="btn" type="button" data-a="format">Formatear</button>
          <button class="btn" type="button" data-a="minify">Minificar</button>
          <button class="btn" type="button" data-a="sort">Ordenar claves</button>
          <button class="btn" type="button" data-a="unescape">Quitar escape</button>
        </div>
        <select data-ind><option value="2">2 espacios</option><option value="4">4 espacios</option><option value="tab">tabulador</option></select>
        <span class="grow"></span>
        <button class="btn small" type="button" data-copy>Copiar</button>
        <button class="btn small ghost" type="button" data-clear>Limpiar</button>
      </div>
      <div class="card">
        <textarea data-in class="mono" spellcheck="false" style="min-height:52vh" placeholder='Pega aquí el JSON, por ejemplo {"cliente": "abc", "activo": true}'></textarea>
        <div data-res></div>
      </div>`;
    const inp = $('[data-in]', v), res = $('[data-res]', v);
    const ind = () => { const x = $('[data-ind]', v).value; return x === 'tab' ? '\t' : ' '.repeat(+x); };
    $('[data-ind]', v).value = Store.get('json-indent', '2');
    let lastErr = null;
    const sortKeys = o => Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.keys(o).sort().reduce((r, k) => { r[k] = sortKeys(o[k]); return r; }, {}) : o;

    function check() {
      const t = inp.value;
      lastErr = null;
      inp.classList.remove('invalid');
      if (!t.trim()) { res.innerHTML = ''; return null; }
      try {
        const val = JSON.parse(t);
        const s = JsonCheck.stats(val);
        const dups = JsonCheck.dupKeys(t);
        let extra = '';
        if (typeof val === 'string') {
          try { JSON.parse(val); extra += '<div class="msg info">Es un JSON escapado dentro de un string. Pulsa «Quitar escape» para verlo.</div>'; } catch (e) { }
        }
        if (dups.length) extra += `<div class="msg warn">Claves repetidas (solo vale la última): ${dups.map(esc).join(', ')}</div>`;
        res.innerHTML = `<div class="msg ok">JSON válido · ${esc(s.type)} · profundidad ${s.depth} · ${t.length.toLocaleString('es-ES')} caracteres</div>${extra}`;
        return val;
      } catch (e) {
        const er = JsonCheck.parseError(e, t);
        lastErr = er;
        inp.classList.add('invalid');
        res.innerHTML = `<div class="msg err"><b>JSON no válido</b>${er.line ? ` · línea ${er.line}, columna ${er.col}` : ''}<br>${esc(er.msg)}
          ${er.hints.map(h => `<br>${esc(h)}`).join('')}</div>
          ${er.snippet ? `<pre class="out mono" style="margin-top:8px">${esc(er.snippet)}</pre>` : ''}
          ${er.pos !== null ? '<button class="btn small" type="button" data-goto style="margin-top:8px">Ir al error</button>' : ''}
          ${er.msg !== er.raw ? `<div class="muted small" style="margin-top:6px">${esc(er.raw)}</div>` : ''}`;
        const g = $('[data-goto]', res);
        if (g) g.onclick = () => { inp.focus(); inp.setSelectionRange(er.pos, Math.min(er.pos + 1, t.length)); };
        return undefined;
      }
    }

    function act(a) {
      const val = check();
      if (val === undefined || val === null && !inp.value.trim()) return;
      if (a === 'unescape') {
        if (typeof val !== 'string') { UI.toast('No es un JSON escapado', 'warn'); return; }
        try { inp.value = JSON.stringify(JSON.parse(val), null, ind()); } catch (e) { inp.value = val; }
      } else if (a === 'minify') inp.value = JSON.stringify(val);
      else inp.value = JSON.stringify(a === 'sort' ? sortKeys(val) : val, null, ind());
      check();
    }

    $$('[data-a]', v).forEach(b => { b.onclick = () => act(b.dataset.a); });
    $('[data-ind]', v).onchange = e => { Store.set('json-indent', e.target.value); };
    inp.addEventListener('input', debounce(check, 250));
    inp.addEventListener('paste', () => setTimeout(() => { const val = check(); if (val !== undefined && val !== null && typeof val === 'object') { inp.value = JSON.stringify(val, null, ind()); check(); } }, 0));
    $('[data-copy]', v).onclick = () => UI.copy(inp.value);
    $('[data-clear]', v).onclick = () => { inp.value = ''; check(); inp.focus(); };
    inp.focus();
  },
});
