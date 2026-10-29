'use strict';

const B64 = {
  fromBytes(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  },
  toBytes(str) {
    let s = String(str).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('El texto contiene caracteres que no son Base64.');
    s = s.replace(/=+$/, '');
    if (s.length % 4 === 1) throw new Error('Longitud de Base64 no válida.');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  },
  encode(text) { return this.fromBytes(new TextEncoder().encode(text)); },
  decode(b64) { return new TextDecoder().decode(this.toBytes(b64)); },
  urlSafe(s) { return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
};

const Hex = {
  from(bytes, sep = '') { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(sep); },
};

const PEM = {
  normalize(t) { return String(t).replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, ''); },
  blocks(text) {
    const t = this.normalize(text);
    const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
    const out = [];
    let m;
    while ((m = re.exec(t))) {
      const raw = m[2];
      const encrypted = /Proc-Type:\s*4,ENCRYPTED/i.test(raw) || m[1].includes('ENCRYPTED');
      const body = raw.replace(/^[A-Za-z-]+:.*$/gm, '').replace(/[^A-Za-z0-9+/=]/g, '');
      out.push({ type: m[1], body, encrypted, der: () => B64.toBytes(body) });
    }
    return out;
  },
  wrap(body, type) {
    const b = String(body).replace(/[^A-Za-z0-9+/=]/g, '');
    return `-----BEGIN ${type}-----\n${(b.match(/.{1,64}/g) || []).join('\n')}\n-----END ${type}-----`;
  },
};

const ASN1 = {
  parse(bytes, pos = 0) {
    if (pos >= bytes.length) throw new Error('ASN.1: fin de datos inesperado');
    const tag = bytes[pos];
    let p = pos + 1;
    let tagNum = tag & 0x1f;
    if (tagNum === 0x1f) {
      tagNum = 0; let b;
      do { b = bytes[p++]; tagNum = tagNum * 128 + (b & 0x7f); } while (b & 0x80);
    }
    let len = bytes[p++];
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0 || n > 4) throw new Error('ASN.1: longitud no soportada');
      len = 0;
      for (let i = 0; i < n; i++) len = len * 256 + bytes[p++];
    }
    const node = { tag, cls: tag >> 6, constructed: !!(tag & 0x20), tagNum, hstart: pos, start: p, len, end: p + len, bytes };
    if (node.end > bytes.length) throw new Error('ASN.1: estructura truncada (¿PEM incompleto?)');
    if (node.constructed) {
      node.children = [];
      let q = p;
      while (q < node.end) { const c = this.parse(bytes, q); node.children.push(c); q = c.end; }
    }
    return node;
  },
  content(n) { return n.bytes.subarray(n.start, n.end); },
  raw(n) { return n.bytes.subarray(n.hstart, n.end); },
  oid(n) {
    const b = this.content(n); const parts = []; let v = 0;
    for (let i = 0; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { parts.push(v); v = 0; } }
    const first = parts.shift();
    const a = first < 40 ? 0 : first < 80 ? 1 : 2;
    return [a, first - 40 * a, ...parts].join('.');
  },
  str(n) {
    const b = this.content(n);
    if (n.tag === 0x1e) { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; }
    if (n.tag === 0x0c) return new TextDecoder().decode(b);
    return new TextDecoder('latin1').decode(b);
  },
  isString(n) { return [0x0c, 0x12, 0x13, 0x14, 0x16, 0x1a, 0x1e, 0x1c].includes(n.tag); },
  time(n) {
    const s = this.str(n); let m;
    if (n.tag === 0x17) {
      m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
      if (!m) return null;
      let y = +m[1]; y += y < 50 ? 2000 : 1900;
      return new Date(Date.UTC(y, m[2] - 1, m[3], m[4], m[5], m[6] || 0));
    }
    m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
    return m ? new Date(Date.UTC(+m[1], m[2] - 1, m[3], m[4], m[5], m[6] || 0)) : null;
  },
  intHex(n) { const b = this.content(n); let i = 0; while (i < b.length - 1 && b[i] === 0) i++; return Hex.from(b.subarray(i)); },
  intBits(n) {
    const b = this.content(n); let i = 0;
    while (i < b.length && b[i] === 0) i++;
    if (i === b.length) return 0;
    let bits = (b.length - i) * 8; let x = b[i];
    while (!(x & 0x80)) { bits--; x <<= 1; }
    return bits;
  },
  intNum(n) { let v = 0; for (const x of this.content(n)) v = v * 256 + x; return v; },
  bitContent(n) { return n.bytes.subarray(n.start + 1, n.end); },
};

const DER = {
  len(n) { if (n < 128) return [n]; const a = []; while (n > 0) { a.unshift(n & 0xff); n = Math.floor(n / 256); } return [0x80 | a.length, ...a]; },
  cat(...parts) {
    const arrs = parts.map(p => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  },
  tlv(tag, content) { const c = content instanceof Uint8Array ? content : Uint8Array.from(content); return this.cat([tag], this.len(c.length), c); },
  seq(...items) { return this.tlv(0x30, this.cat(...items)); },
  oid(str) {
    const p = str.split('.').map(Number); const out = [40 * p[0] + p[1]];
    for (const v of p.slice(2)) { const s = [v & 0x7f]; let x = Math.floor(v / 128); while (x > 0) { s.unshift((x & 0x7f) | 0x80); x = Math.floor(x / 128); } out.push(...s); }
    return this.tlv(0x06, out);
  },
  NULL: Uint8Array.from([5, 0]),
};

const OID_RSA = '1.2.840.113549.1.1.1';
const OID_RSAPSS = '1.2.840.113549.1.1.10';
const OID_EC = '1.2.840.10045.2.1';
const CURVE_OIDS = { 'P-256': '1.2.840.10045.3.1.7', 'P-384': '1.3.132.0.34', 'P-521': '1.3.132.0.35' };

const OIDS = {
  '1.2.840.113549.1.1.1': 'RSA', '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.113549.1.1.4': 'md5WithRSAEncryption', '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption', '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption', '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.10045.2.1': 'EC', '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384', '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521', '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448',
  '2.5.29.17': 'Subject Alternative Name', '2.5.29.18': 'Issuer Alternative Name', '2.5.29.15': 'Key Usage', '2.5.29.37': 'Extended Key Usage',
  '2.5.29.19': 'Basic Constraints', '2.5.29.14': 'Subject Key Identifier', '2.5.29.35': 'Authority Key Identifier', '2.5.29.31': 'CRL Distribution Points',
  '2.5.29.32': 'Certificate Policies', '1.3.6.1.5.5.7.1.1': 'Authority Information Access', '1.3.6.1.4.1.11129.2.4.2': 'SCT (Certificate Transparency)',
  '1.3.6.1.5.5.7.3.1': 'serverAuth', '1.3.6.1.5.5.7.3.2': 'clientAuth', '1.3.6.1.5.5.7.3.3': 'codeSigning', '1.3.6.1.5.5.7.3.4': 'emailProtection',
  '1.3.6.1.5.5.7.3.8': 'timeStamping', '1.3.6.1.5.5.7.3.9': 'OCSPSigning',
  '1.2.840.113549.1.9.14': 'extensionRequest', '1.2.840.113549.1.9.7': 'challengePassword', '1.2.840.113549.1.9.2': 'unstructuredName',
};
const DN_SHORT = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber',
  '2.5.4.9': 'street', '2.5.4.17': 'postalCode', '1.2.840.113549.1.9.1': 'emailAddress', '0.9.2342.19200300.100.1.25': 'DC',
  '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.12': 'title', '2.5.4.97': 'organizationIdentifier', '0.9.2342.19200300.100.1.1': 'UID',
};

const X509 = {
  parseName(node) {
    const out = [];
    for (const set of node.children || []) for (const atv of set.children || []) {
      const oid = ASN1.oid(atv.children[0]);
      out.push({ oid, name: DN_SHORT[oid] || oid, value: ASN1.str(atv.children[1]) });
    }
    return out;
  },
  nameStr(arr) { return arr.map(a => `${a.name}=${a.value}`).join(', '); },
  cn(arr) { return (arr.find(a => a.name === 'CN') || {}).value || ''; },
  fmtIp(b) {
    if (b.length === 4) return Array.from(b).join('.');
    if (b.length === 16) { const g = []; for (let i = 0; i < 16; i += 2) g.push(((b[i] << 8) | b[i + 1]).toString(16)); return g.join(':'); }
    return Hex.from(b);
  },
  ascii(b) { return new TextDecoder('latin1').decode(b); },
  generalNames(n) {
    return (n.children || []).map(gn => {
      const c = ASN1.content(gn);
      switch (gn.tagNum) {
        case 1: return 'email:' + this.ascii(c);
        case 2: return 'DNS:' + this.ascii(c);
        case 6: return 'URI:' + this.ascii(c);
        case 7: return 'IP:' + this.fmtIp(c);
        case 4: return 'DirName:' + this.nameStr(this.parseName(gn.children[0]));
        default: return `otro[${gn.tagNum}]`;
      }
    });
  },
  collectUris(n, acc = []) {
    if (n.cls === 2 && n.tagNum === 6 && !n.constructed) acc.push(this.ascii(ASN1.content(n)));
    (n.children || []).forEach(c => this.collectUris(c, acc));
    return acc;
  },
  decodeExt(oid, bytes) {
    const n = ASN1.parse(bytes);
    switch (oid) {
      case '2.5.29.17': case '2.5.29.18': return this.generalNames(n).join('\n');
      case '2.5.29.15': {
        const b = ASN1.content(n);
        const names = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];
        return names.filter((nm, i) => { const byte = b[1 + (i >> 3)]; return byte !== undefined && (byte >> (7 - (i & 7))) & 1; }).join(', ');
      }
      case '2.5.29.37': return (n.children || []).map(c => { const o = ASN1.oid(c); return OIDS[o] || o; }).join(', ');
      case '2.5.29.19': {
        let ca = false, path;
        (n.children || []).forEach(c => { if (c.tag === 0x01) ca = ASN1.content(c)[0] !== 0; if (c.tag === 0x02) path = ASN1.intNum(c); });
        return `CA: ${ca ? 'Sí' : 'No'}${path !== undefined ? `, pathLen: ${path}` : ''}`;
      }
      case '2.5.29.14': return Hex.from(ASN1.content(n), ':').toUpperCase();
      case '2.5.29.35': {
        const k = (n.children || []).find(c => c.cls === 2 && c.tagNum === 0);
        return k ? 'keyid:' + Hex.from(ASN1.content(k), ':').toUpperCase() : '—';
      }
      case '2.5.29.31': case '1.3.6.1.5.5.7.1.1': return this.collectUris(n).join('\n') || '—';
      default: return Hex.from(bytes.subarray(0, 48), ' ') + (bytes.length > 48 ? ' …' : '');
    }
  },
  parseExtensions(seq) {
    const out = [];
    for (const ext of seq.children || []) {
      const oid = ASN1.oid(ext.children[0]);
      let critical = false, valNode = ext.children[1];
      if (valNode.tag === 0x01) { critical = ASN1.content(valNode)[0] !== 0; valNode = ext.children[2]; }
      let value;
      try { value = this.decodeExt(oid, ASN1.content(valNode)); } catch (e) { value = '(no se pudo decodificar)'; }
      out.push({ oid, name: OIDS[oid] || oid, critical, value });
    }
    return out;
  },
  parseSpki(node) {
    const algOid = ASN1.oid(node.children[0].children[0]);
    const params = node.children[0].children[1];
    const keyBits = ASN1.bitContent(node.children[1]);
    const r = { algOid, alg: OIDS[algOid] || algOid, der: ASN1.raw(node) };
    if (algOid === OID_RSA || algOid === OID_RSAPSS) {
      const k = ASN1.parse(keyBits);
      r.type = 'RSA'; r.bits = ASN1.intBits(k.children[0]); r.modulus = ASN1.intHex(k.children[0]); r.exponent = ASN1.intNum(k.children[1]);
    } else if (algOid === OID_EC) {
      const c = params && params.tag === 0x06 ? ASN1.oid(params) : '';
      r.type = 'EC'; r.curve = OIDS[c] || c || 'desconocida'; r.point = Hex.from(keyBits);
      r.bits = { 'P-256': 256, 'P-384': 384, 'P-521': 521 }[r.curve];
    } else if (algOid === '1.3.101.112' || algOid === '1.3.101.113') {
      r.type = OIDS[algOid]; r.point = Hex.from(keyBits);
    } else r.type = r.alg;
    return r;
  },
  keyDesc(k) {
    if (k.type === 'RSA') return `RSA ${k.bits} bits (e=${k.exponent})`;
    if (k.type === 'EC') return `EC ${k.curve}${k.bits ? ` (${k.bits} bits)` : ''}`;
    return k.type;
  },
  decodeCert(der) {
    const root = ASN1.parse(der);
    const tbs = root.children[0]; const ch = tbs.children; let i = 0;
    let version = 1;
    if (ch[0].cls === 2 && ch[0].tagNum === 0) { version = ASN1.intNum(ch[0].children[0]) + 1; i = 1; }
    const serial = ASN1.intHex(ch[i++]);
    i++;
    const issuer = this.parseName(ch[i++]);
    const validity = ch[i++];
    const subject = this.parseName(ch[i++]);
    const spki = this.parseSpki(ch[i++]);
    let extensions = [];
    for (; i < ch.length; i++) if (ch[i].cls === 2 && ch[i].tagNum === 3) extensions = this.parseExtensions(ch[i].children[0]);
    const sigOid = ASN1.oid(root.children[1].children[0]);
    return {
      kind: 'cert', version, serial, issuer, subject, spki, extensions, der,
      notBefore: ASN1.time(validity.children[0]), notAfter: ASN1.time(validity.children[1]),
      sigAlg: OIDS[sigOid] || sigOid,
    };
  },
  decodeCsr(der) {
    const root = ASN1.parse(der);
    const ch = root.children[0].children;
    const version = ASN1.intNum(ch[0]);
    const subject = this.parseName(ch[1]);
    const spki = this.parseSpki(ch[2]);
    let extensions = []; const attributes = [];
    const attrs = ch.find((c, idx) => idx >= 3 && c.cls === 2 && c.tagNum === 0);
    if (attrs) for (const a of attrs.children || []) {
      const oid = ASN1.oid(a.children[0]); const set = a.children[1];
      if (oid === '1.2.840.113549.1.9.14' && set.children && set.children[0]) extensions = this.parseExtensions(set.children[0]);
      else attributes.push({ oid, name: OIDS[oid] || oid, value: (set.children || []).map(v => (ASN1.isString(v) ? ASN1.str(v) : Hex.from(ASN1.content(v)))).join(', ') });
    }
    const sigOid = ASN1.oid(root.children[1].children[0]);
    return { kind: 'csr', version: version + 1, subject, spki, extensions, attributes, sigAlg: OIDS[sigOid] || sigOid, der };
  },
  privateKeyPublic(block) {
    if (block.encrypted) throw new Error('La clave privada está cifrada; descífrala antes de compararla.');
    const n = ASN1.parse(block.der());
    const ecFromSec1 = s => {
      const pub = (s.children || []).find(c => c.cls === 2 && c.tagNum === 1);
      if (!pub) throw new Error('La clave EC no incluye la parte pública, no se puede comparar.');
      return { type: 'EC', point: Hex.from(ASN1.bitContent(pub.children[0])) };
    };
    if (block.type === 'RSA PRIVATE KEY') return { type: 'RSA', modulus: ASN1.intHex(n.children[1]) };
    if (block.type === 'EC PRIVATE KEY') return ecFromSec1(n);
    if (block.type === 'PRIVATE KEY') {
      const algOid = ASN1.oid(n.children[1].children[0]);
      const inner = ASN1.parse(ASN1.content(n.children[2]));
      if (algOid === OID_RSA || algOid === OID_RSAPSS) return { type: 'RSA', modulus: ASN1.intHex(inner.children[1]) };
      if (algOid === OID_EC) return ecFromSec1(inner);
      throw new Error('Algoritmo de clave no soportado para comparar: ' + (OIDS[algOid] || algOid));
    }
    throw new Error('Tipo de bloque no reconocido como clave privada: ' + block.type);
  },
};

const JWT_ALGS = {
  HS256: { kind: 'HMAC', hash: 'SHA-256' }, HS384: { kind: 'HMAC', hash: 'SHA-384' }, HS512: { kind: 'HMAC', hash: 'SHA-512' },
  RS256: { kind: 'RSA', name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, RS384: { kind: 'RSA', name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' }, RS512: { kind: 'RSA', name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
  PS256: { kind: 'RSA', name: 'RSA-PSS', hash: 'SHA-256', salt: 32 }, PS384: { kind: 'RSA', name: 'RSA-PSS', hash: 'SHA-384', salt: 48 }, PS512: { kind: 'RSA', name: 'RSA-PSS', hash: 'SHA-512', salt: 64 },
  ES256: { kind: 'EC', name: 'ECDSA', hash: 'SHA-256', curve: 'P-256' }, ES384: { kind: 'EC', name: 'ECDSA', hash: 'SHA-384', curve: 'P-384' }, ES512: { kind: 'EC', name: 'ECDSA', hash: 'SHA-512', curve: 'P-521' },
};

const JwtCrypto = {
  ensure() { if (!(window.crypto && crypto.subtle)) throw new Error('WebCrypto no está disponible en este navegador/contexto.'); },
  params(alg) {
    const a = JWT_ALGS[alg];
    if (a.kind === 'HMAC') return { name: 'HMAC' };
    if (a.kind === 'EC') return { name: 'ECDSA', hash: a.hash };
    if (a.name === 'RSA-PSS') return { name: 'RSA-PSS', saltLength: a.salt };
    return { name: 'RSASSA-PKCS1-v1_5' };
  },
  async importKey(alg, keyText, usage, secretIsB64) {
    const a = JWT_ALGS[alg];
    if (!a) throw new Error('Algoritmo no soportado: ' + alg);
    this.ensure();
    if (a.kind === 'HMAC') {
      if (!keyText) throw new Error('Introduce el secreto.');
      const raw = secretIsB64 ? B64.toBytes(keyText.trim()) : new TextEncoder().encode(keyText);
      return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: a.hash }, false, [usage]);
    }
    const algo = a.kind === 'EC' ? { name: a.name, namedCurve: a.curve } : { name: a.name, hash: a.hash };
    const t = (keyText || '').trim();
    if (!t) throw new Error(usage === 'sign' ? 'Introduce la clave privada.' : 'Introduce la clave pública o certificado.');
    if (t.startsWith('{')) {
      const jwk = JSON.parse(t);
      const k = jwk.keys ? jwk.keys[0] : jwk;
      delete k.alg; delete k.key_ops; delete k.use;
      return crypto.subtle.importKey('jwk', k, algo, false, [usage]);
    }
    const blocks = PEM.blocks(t);
    if (!blocks.length) throw new Error('No se encontró ninguna clave PEM válida.');
    const b = blocks[0];
    if (usage === 'verify') {
      let spki;
      if (b.type === 'CERTIFICATE') spki = X509.decodeCert(b.der()).spki.der;
      else if (b.type === 'PUBLIC KEY') spki = b.der();
      else if (b.type === 'RSA PUBLIC KEY') spki = DER.seq(DER.seq(DER.oid(OID_RSA), DER.NULL), DER.tlv(0x03, DER.cat([0], b.der())));
      else throw new Error('Para verificar usa una clave pública (PUBLIC KEY), un certificado o un JWK.');
      return crypto.subtle.importKey('spki', spki, algo, false, ['verify']);
    }
    if (b.encrypted) throw new Error('La clave privada está cifrada.');
    let pk8;
    if (b.type === 'PRIVATE KEY') pk8 = b.der();
    else if (b.type === 'RSA PRIVATE KEY') pk8 = DER.seq(DER.tlv(2, [0]), DER.seq(DER.oid(OID_RSA), DER.NULL), DER.tlv(0x04, b.der()));
    else if (b.type === 'EC PRIVATE KEY') {
      const n = ASN1.parse(b.der());
      const p = (n.children || []).find(c => c.cls === 2 && c.tagNum === 0);
      const curveOid = p ? ASN1.oid(p.children[0]) : CURVE_OIDS[a.curve];
      pk8 = DER.seq(DER.tlv(2, [0]), DER.seq(DER.oid(OID_EC), DER.oid(curveOid)), DER.tlv(0x04, b.der()));
    } else throw new Error('Para firmar usa una clave privada (PRIVATE KEY, RSA PRIVATE KEY o EC PRIVATE KEY).');
    return crypto.subtle.importKey('pkcs8', pk8, algo, false, ['sign']);
  },
};

async function digestHex(alg, data) {
  JwtCrypto.ensure();
  const buf = await crypto.subtle.digest(alg, data);
  return new Uint8Array(buf);
}
function readFileAs(file, how = 'arraybuffer') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    if (how === 'text') r.readAsText(file);
    else if (how === 'dataurl') r.readAsDataURL(file);
    else r.readAsArrayBuffer(file);
  });
}
