'use strict';
(function () {
  const PERFILES = [
    { nombre: 'Nombre', C: 'codigo', ST: 'estado', L: 'localidad', O: 'organizacion', OU: 'unidad', E: 'mail' },
    { nombre: 'Nombre', C: 'codigo', ST: 'estado', L: 'localidad', O: 'organizacion', OU: 'unidad', E: 'mail' },
    { nombre: 'Personalizado', C: '', ST: '', L: '', O: '', OU: '', E: '' },
  ];
  const CAMPOS = [['C', 'C (país)'], ['ST', 'ST (estado/provincia)'], ['L', 'L (localidad)'], ['O', 'O (organización)'], ['OU', 'OU (unidad)'], ['E', 'emailAddress (opcional)']];

  async function genKey() {
    const subtle = window.crypto && window.crypto.subtle;
    if (subtle) {
      try {
        const kp = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
        const der = new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey));
        let s = '';
        for (const b of der) s += String.fromCharCode(b);
        const priv = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(s));
        return { privateKey: priv, publicKey: forge.pki.setRsaPublicKey(priv.n, priv.e) };
      } catch (e) { }
    }
    return forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  }

  async function makeCert(cn, f) {
    const keys = await genKey();
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(15));
    const now = new Date(Date.now() - 5 * 60000);
    cert.validity.notBefore = now;
    const end = new Date(now);
    end.setFullYear(end.getFullYear() + 10);
    cert.validity.notAfter = end;
    const attrs = [
      { shortName: 'C', value: f.C }, { shortName: 'ST', value: f.ST }, { shortName: 'L', value: f.L },
      { shortName: 'O', value: f.O }, { shortName: 'OU', value: f.OU }, { shortName: 'CN', value: cn },
    ].filter(a => a.value);
    if (f.E) attrs.push({ name: 'emailAddress', value: f.E });
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 2, value: cn }] },
      { name: 'subjectKeyIdentifier' },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return { cn, cert, key: keys.privateKey };
  }

  function makeP12(entries, password) {
    const A = forge.asn1;
    let all = null;
    for (const e of entries) {
      const p = forge.pkcs12.toPkcs12Asn1(e.key, [e.cert], password, { algorithm: '3des', friendlyName: e.cn, generateLocalKeyId: true });
      if (!all) { all = p; continue; }
      const getSeq = pfx => { const octet = pfx.value[1].value[1].value[0]; return { octet, seq: A.fromDer(octet.value) }; };
      const a = getSeq(all), b = getSeq(p);
      a.seq.value.push(...b.seq.value);
      a.octet.value = A.toDer(a.seq).getBytes();
    }
    if (password !== null) {
      const authSafeBytes = all.value[1].value[1].value[0].value;
      const salt = forge.random.getBytesSync(8), count = 2048;
      const macKey = forge.pkcs12.generateKey(password, forge.util.createBuffer(salt), 3, count, 20);
      const mac = forge.hmac.create();
      mac.start('sha1', macKey);
      mac.update(authSafeBytes);
      all.value[2] = A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
        A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
          A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
            A.create(A.Class.UNIVERSAL, A.Type.OID, false, A.oidToDer(forge.pki.oids.sha1).getBytes()),
            A.create(A.Class.UNIVERSAL, A.Type.NULL, false, '')]),
          A.create(A.Class.UNIVERSAL, A.Type.OCTETSTRING, false, mac.digest().getBytes())]),
        A.create(A.Class.UNIVERSAL, A.Type.OCTETSTRING, false, salt),
        A.create(A.Class.UNIVERSAL, A.Type.INTEGER, false, A.integerToDer(count).getBytes())]);
    }
    return A.toDer(all).getBytes();
  }

  function makeJks(entries, password) {
    const sha1 = s => { const m = forge.md.sha1.create(); m.update(s); return m.digest().getBytes(); };
    let pw = '';
    for (const ch of password) { const c = ch.charCodeAt(0); pw += String.fromCharCode(c >> 8, c & 255); }
    const u32 = n => String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    const u16 = n => String.fromCharCode((n >> 8) & 255, n & 255);
    const utf = s => { const b = forge.util.encodeUtf8(s); return u16(b.length) + b; };
    const u64 = n => u32(Math.floor(n / 4294967296)) + u32(n >>> 0);
    const A = forge.asn1;
    let out = u32(0xFEEDFEED) + u32(2) + u32(entries.length);
    const now = Date.now();
    for (const e of entries) {
      const plain = A.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(e.key))).getBytes();
      const salt = forge.random.getBytesSync(20);
      let digest = salt, enc = '';
      for (let i = 0; i < plain.length; i += 20) {
        digest = sha1(pw + digest);
        for (let j = 0; j < 20 && i + j < plain.length; j++) enc += String.fromCharCode(plain.charCodeAt(i + j) ^ digest.charCodeAt(j));
      }
      const prot = salt + enc + sha1(pw + plain);
      const epki = A.toDer(A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
        A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
          A.create(A.Class.UNIVERSAL, A.Type.OID, false, A.oidToDer('1.3.6.1.4.1.42.2.17.1.1').getBytes()),
          A.create(A.Class.UNIVERSAL, A.Type.NULL, false, '')]),
        A.create(A.Class.UNIVERSAL, A.Type.OCTETSTRING, false, prot)])).getBytes();
      const certDer = A.toDer(forge.pki.certificateToAsn1(e.cert)).getBytes();
      out += u32(1) + utf(e.cn.toLowerCase()) + u64(now) + u32(epki.length) + epki + u32(1) + utf('X.509') + u32(certDer.length) + certDer;
    }
    return out + sha1(pw + 'Mighty Aphrodite' + out);
  }

  function makeCsr(e) {
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = forge.pki.setRsaPublicKey(e.key.n, e.key.e);
    csr.setSubject(e.cert.subject.attributes.map(a => ({ type: a.type, value: a.value })));
    csr.setAttributes([{ name: 'extensionRequest', extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: e.cn }] }] }]);
    csr.sign(e.key, forge.md.sha256.create());
    return forge.pki.certificationRequestToPem(csr);
  }

  const toBytes = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const safe = cn => cn.replace(/\*/g, 'wildcard').replace(/[\\/:?"<>|]/g, '_');
  const wait = ms => new Promise(r => setTimeout(r, ms));

  App.register({
    id: 'certgen', title: 'Generar certificados', sub: 'p12 + jks + zip', group: 'Herramientas', keywords: 'kse keystore p12 jks autofirmado csr clave',
    render(v) {
      if (!window.forge || !window.JSZip) {
        v.innerHTML = '<div class="msg err">No se han cargado forge.min.js o jszip.min.js (carpeta js/vendor).</div>';
        return;
      }
      Object.assign(PERFILES[2], Store.get('certgen-custom', {}));
      let actual = Store.get('certgen-perfil', 0);

      v.innerHTML = `
        <p class="nt">RSA 2048 · SHA-256 · validez 10 años · SAN = CN</p>
        <div class="grid2">
          <div class="card">
            <div class="card-head"><h3>Dominios (CN = SAN), uno por línea</h3><span class="muted small" data-count>0 dominios</span></div>
            <textarea data-hosts class="mono" rows="9" spellcheck="false" placeholder="api.ejemplo.com&#10;*.ejemplo.com"></textarea>
          </div>
          <div class="card">
            <div class="card-head"><h3>Subject</h3></div>
            <div class="row wrap" style="margin-bottom:12px">${PERFILES.map((p, i) => `<label class="check"><input type="radio" name="perfil" value="${i}"> ${esc(p.nombre)}</label>`).join('')}</div>
            <div class="form">${CAMPOS.map(([k, l]) => `<label class="field"><span>${l}</span><input data-c="${k}" class="mono"></label>`).join('')}</div>
            <div class="muted small" data-pinfo></div>
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="card-head"><h3>Exportar</h3></div>
          <div class="stack" style="gap:6px">
            <label class="check"><input type="checkbox" data-o="p12" checked> keystore .p12 con todos (sin contraseña)</label>
            <label class="check"><input type="checkbox" data-o="jks"> keystore .jks con todos</label>
            <label class="field hidden" data-jksbox style="max-width:320px;margin:0 0 0 22px"><span>contraseña del .jks (vacía = sin contraseña)</span><input data-jkspw class="mono"></label>
            <label class="check"><input type="checkbox" data-o="files"> ficheros por dominio (.p12, .crt, .key, .csr y .jks si está marcado)</label>
          </div>
          <p class="muted small" style="margin-top:10px">Con una sola opción de keystore se descarga ese fichero directamente. Con varias, un ZIP con una carpeta con el nombre del CN.</p>
          <button class="btn primary" type="button" data-go>Generar y descargar</button>
          <div data-log class="out wrap mono small" style="margin-top:12px;max-height:240px"></div>
        </div>`;

      const q = s => $(s, v);
      const logEl = q('[data-log]');
      const log = (m, c) => { const d = document.createElement('div'); if (c) d.className = c; d.textContent = m; logEl.append(d); logEl.scrollTop = 1e9; };
      const hostsList = () => [...new Set(q('[data-hosts]').value.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')))];

      function cargar(i) {
        actual = i;
        Store.set('certgen-perfil', i);
        $$('input[name=perfil]', v).forEach(r => { r.checked = +r.value === i; });
        CAMPOS.forEach(([k]) => { const el = q(`[data-c="${k}"]`); el.value = PERFILES[i][k] || ''; el.readOnly = i !== 2; });
        q('[data-pinfo]').textContent = i === 2 ? 'Rellena los campos, se guardan en este navegador.' : 'Valores fijos. Elige «Personalizado» para usar otros.';
      }
      CAMPOS.forEach(([k]) => q(`[data-c="${k}"]`).addEventListener('input', e => {
        if (actual !== 2) return;
        PERFILES[2][k] = e.target.value;
        const { nombre, ...datos } = PERFILES[2];
        Store.set('certgen-custom', datos);
      }));
      $$('input[name=perfil]', v).forEach(r => r.addEventListener('change', () => cargar(+r.value)));
      cargar(actual);

      q('[data-o="jks"]').onchange = e => q('[data-jksbox]').classList.toggle('hidden', !e.target.checked);
      q('[data-hosts]').addEventListener('input', () => { const n = hostsList().length; q('[data-count]').textContent = n + ' dominio' + (n === 1 ? '' : 's'); });

      function descargar(name, data, type) {
        const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.textContent = 'descargar ' + name + ' (si no se ha descargado solo)';
        a.style.display = 'block';
        logEl.append(a);
        a.click();
      }

      q('[data-go]').onclick = async () => {
        const hosts = hostsList();
        logEl.textContent = '';
        if (!hosts.length) { log('Introduce al menos un dominio.', 'err'); return; }
        const wantP12 = q('[data-o="p12"]').checked, wantJks = q('[data-o="jks"]').checked, wantFiles = q('[data-o="files"]').checked;
        if (!wantP12 && !wantJks && !wantFiles) { log('Marca al menos una opción de exportación.', 'err'); return; }
        const f = {};
        CAMPOS.forEach(([k]) => { f[k] = q(`[data-c="${k}"]`).value.trim(); });
        if (!f.C || !f.O) { log('Rellena al menos C y O.', 'err'); return; }
        const jksPw = q('[data-jkspw]').value;
        const btn = q('[data-go]');
        btn.disabled = true;
        try {
          const entries = [];
          for (const cn of hosts) { entries.push(await makeCert(cn, f)); log('ok  ' + cn); await wait(0); }
          const base = safe(hosts[0]) + (hosts.length > 1 ? '_y_' + (hosts.length - 1) + '_mas' : '');
          const nOpts = [wantP12, wantJks, wantFiles].filter(Boolean).length;
          if (nOpts === 1 && wantP12) descargar(base + '.p12', toBytes(makeP12(entries, '')), 'application/x-pkcs12');
          else if (nOpts === 1 && wantJks) descargar(base + '.jks', toBytes(makeJks(entries, jksPw)));
          else {
            const zip = new JSZip();
            const dir = zip.folder(base);
            if (wantP12) dir.file(base + '.p12', toBytes(makeP12(entries, '')));
            if (wantJks) dir.file(base + '.jks', toBytes(makeJks(entries, jksPw)));
            if (wantFiles) for (const e of entries) {
              const b = safe(e.cn);
              const d = hosts.length > 1 ? dir.folder(b) : dir;
              d.file(b + '.p12', toBytes(makeP12([e], '')));
              if (wantJks) d.file(b + '.jks', toBytes(makeJks([e], jksPw)));
              d.file(b + '.crt', forge.pki.certificateToPem(e.cert));
              d.file(b + '.key', forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(e.key))));
              d.file(b + '.csr', makeCsr(e));
            }
            descargar(base + '.zip', await zip.generateAsync({ type: 'blob' }), 'application/zip');
          }
          log('Listo: ' + entries.length + ' certificado(s). En KSE: Archivo > Abrir' + (wantJks && jksPw ? ' (contraseña del .jks: la que has puesto).' : ' y deja la contraseña en blanco.'), 'ok');
        } catch (err) {
          log('Error: ' + err.message, 'err');
        } finally {
          btn.disabled = false;
        }
      };
      q('[data-hosts]').focus();
    },
  });
})();
