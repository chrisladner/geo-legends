/* Legends Sync – Verbindung einer Legends-App zu Legends HQ (Eltern-Hub).
   Original: apps/legends-hq/shared/legends-sync.js. Kopien nie von Hand ändern:
   hier ändern, dann `node tools/verteilen.mjs`.

   - Verbindungs-Code „HQ1:…“ lesen (Server-Adresse + Familien-Schlüssel), gespeichert in
     localStorage['legends.sync.v1'] – getrennt vom Speicherstand der App, nie im Sicherungs-Code.
   - Lagebericht melden, Sicherung verschlüsselt ablegen und zurückholen.
   - Der Familien-Schlüssel verlässt das Gerät nie: Der Server bekommt nur ein abgeleitetes Token,
     die Sicherung ist mit einem zweiten, abgeleiteten Schlüssel verschlüsselt (AES-GCM).
   Format: docs/schnittstelle.md, Abschnitte 3 und 8. Klassisches Skript, hängt sich an
   globalThis.LegendsSync. Braucht fetch, crypto.subtle und localStorage. */
(function (root) {
  'use strict';

  const SPEICHER = 'legends.sync.v1';
  const SALZ = 'legends-hq|sicherung|v1';
  const RUNDEN = 150000;
  const WARTEN = 8000;
  let APP = '';

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // ================================================================
  // Hilfen
  // ================================================================
  function lade() {
    try { return JSON.parse(root.localStorage.getItem(SPEICHER) || '{}') || {}; } catch (e) { return {}; }
  }
  function speichere(z) {
    try { root.localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch (e) { /* privates Surfen: dann eben nicht */ }
  }
  function b64u(daten) {
    const b = new Uint8Array(daten);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function vonB64u(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = root.atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function normSchluessel(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function zwei(n) { return String(n).padStart(2, '0'); }
  function jetzt() {
    const d = new Date();
    return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate()) + ' ' + zwei(d.getHours()) + ':' + zwei(d.getMinutes());
  }

  // ================================================================
  // Verbindungs-Code: HQ1:<base64url({"u": Server, "k": Schlüssel})>
  // ================================================================
  function codeLesen(code) {
    const m = String(code || '').replace(/\s+/g, '').match(/^HQ1:([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    try {
      const o = JSON.parse(dec.decode(vonB64u(m[1])));
      if (!o || typeof o.u !== 'string' || typeof o.k !== 'string') return null;
      const api = o.u.trim().replace(/\/+$/, '');
      if (!/^https?:\/\/[^/]+/.test(api)) return null;
      const key = normSchluessel(o.k);
      if (key.length < 16) return null;
      return { api, key };
    } catch (e) {
      return null;
    }
  }
  function codeBauen(api, key) {
    return 'HQ1:' + b64u(enc.encode(JSON.stringify({ u: String(api).replace(/\/+$/, ''), k: key })));
  }

  // ================================================================
  // Schlüssel
  // ================================================================
  async function token(key) {
    const h = await root.crypto.subtle.digest('SHA-256', enc.encode('legends-hq|api|' + normSchluessel(key)));
    return b64u(h);
  }
  async function aesSchluessel(key) {
    const basis = await root.crypto.subtle.importKey('raw', enc.encode(normSchluessel(key)), 'PBKDF2', false, ['deriveKey']);
    return root.crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALZ), iterations: RUNDEN },
      basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function verschluesseln(key, obj) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const k = await aesSchluessel(key);
    const ct = await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
    return { v: 1, iv: b64u(iv), ct: b64u(ct) };
  }
  async function entschluesseln(key, blob) {
    if (!blob || blob.v !== 1 || !blob.iv || !blob.ct) throw new Error('Sicherung hat ein unbekanntes Format');
    const k = await aesSchluessel(key);
    const pt = await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: vonB64u(blob.iv) }, k, vonB64u(blob.ct));
    return JSON.parse(dec.decode(pt));
  }

  // ================================================================
  // Server
  // ================================================================
  async function anfrage(verbindung, methode, pfad, koerper) {
    const ctrl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    const uhr = ctrl ? setTimeout(() => ctrl.abort(), WARTEN) : null;
    try {
      const kopf = { Authorization: 'Bearer ' + await token(verbindung.key) };
      if (koerper !== undefined) kopf['Content-Type'] = 'application/json';
      const res = await root.fetch(verbindung.api + pfad, {
        method: methode, headers: kopf, cache: 'no-store',
        body: koerper !== undefined ? JSON.stringify(koerper) : undefined,
        signal: ctrl ? ctrl.signal : undefined
      });
      let daten = null;
      try { daten = await res.json(); } catch (e) { /* kein JSON */ }
      if (!res.ok) {
        const f = new Error((daten && daten.fehler) || ('HTTP ' + res.status));
        f.status = res.status;
        throw f;
      }
      return daten;
    } finally {
      if (uhr) clearTimeout(uhr);
    }
  }
  function kurz(e) {
    if (e && e.status === 401) return 'Code passt nicht zum Server';
    if (e && e.status === 413) return 'zu groß für den Server';
    if (e && e.status === 400) return 'Meldung abgelehnt – stimmt die Uhrzeit am Gerät?';
    if (e && e.status) return 'Server-Fehler ' + e.status;
    if (e && e.name === 'AbortError') return 'Server antwortet nicht';
    return 'kein Internet oder Server nicht erreichbar';
  }
  function verbindung() {
    const z = lade();
    return z.api && z.key ? { api: z.api, key: z.key } : null;
  }
  function appZustand(z) {
    z.apps = z.apps && typeof z.apps === 'object' ? z.apps : {};
    if (!z.apps[APP]) z.apps[APP] = {};
    return z.apps[APP];
  }
  // Zustand nach einer Anfrage neu laden und nur den Teil dieser App ändern. Sonst schriebe eine Meldung,
  // die während „Trennen“ unterwegs war, den gelöschten Code zurück.
  function merke(aendern) {
    const z = lade();
    aendern(appZustand(z));
    speichere(z);
  }
  // Alle Aufrufe nacheinander: zwei gleichzeitige Meldungen würden sich sonst den Zustand überschreiben.
  let kette = Promise.resolve();
  function nacheinander(fn) {
    const p = kette.then(fn, fn);
    kette = p.then(() => {}, () => {});
    return p;
  }
  // Zufällige Kennung dieses Geräts (kein Name). Melden zwei Geräte für dieselbe App, kann die Eltern-App warnen:
  // Bericht und Sicherung des einen überschreiben sonst die des anderen.
  function geraet() {
    const z = lade();
    if (!z.geraet) {
      const b = root.crypto.getRandomValues(new Uint8Array(6));
      z.geraet = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      speichere(z);
    }
    return z.geraet;
  }

  root.LegendsSync = {
    // Einmal beim Start: welche App spricht (z. B. 'wl', 'gl'; die Eltern-App 'hq')
    configure(o) { APP = String((o && o.app) || ''); },

    verbunden() { return !!verbindung(); },

    zustand() {
      const z = lade();
      const a = (z.apps || {})[APP] || {};
      return { verbunden: !!(z.api && z.key), server: z.api || '', gemeldet: a.gemeldet || '',
        gesichert: a.gesichert || '', fehler: a.fehler || '', wartet: !!a.offen };
    },

    // Prüft den Code beim Server (GET /api/ping) und speichert ihn erst dann.
    verbinden(code) {
      return nacheinander(async () => {
        const c = codeLesen(code);
        if (!c) return { ok: false, fehler: 'Der Code passt nicht. Er beginnt mit HQ1:' };
        try {
          await anfrage(c, 'GET', '/api/ping');
        } catch (e) {
          return { ok: false, fehler: e && e.status === 401 ? 'Der Code passt nicht zum Server.' : 'Server nicht erreichbar. Ist Internet da?' };
        }
        const z = lade();
        z.api = c.api;
        z.key = c.key;
        speichere(z);
        return { ok: true };
      });
    },

    trennen() {
      const z = lade();
      delete z.api;
      delete z.key;
      speichere(z);
    },

    // Lagebericht senden (mit Geräte-Kennung). Klappt es nicht, wird beim nächsten Mal der neuere geschickt.
    melden(bericht) {
      return nacheinander(async () => {
        const v = verbindung();
        if (!v) return { ok: false, fehler: 'nicht verbunden' };
        try {
          await anfrage(v, 'POST', '/api/bericht', Object.assign({}, bericht, { geraet: geraet() }));
          merke(a => { a.gemeldet = jetzt(); a.fehler = ''; delete a.offen; });
          return { ok: true };
        } catch (e) {
          const fehler = kurz(e);
          merke(a => { a.fehler = fehler; a.offen = 1; });
          return { ok: false, fehler };
        }
      });
    },

    // Ganzen Speicherstand verschlüsselt ablegen. info: { tag, version }
    sichern(stand, info) {
      return nacheinander(async () => {
        const v = verbindung();
        if (!v) return { ok: false, fehler: 'nicht verbunden' };
        try {
          const tag = (info && info.tag) || '';
          const blob = await verschluesseln(v.key, { app: APP, tag, version: (info && info.version) || '', stand });
          blob.app = APP;
          blob.tag = tag;
          blob.geraet = geraet();
          await anfrage(v, 'PUT', '/api/sicherung/' + APP, blob);
          merke(a => { a.gesichert = jetzt(); });
          return { ok: true };
        } catch (e) {
          const fehler = kurz(e);
          merke(a => { a.fehler = fehler; });
          return { ok: false, fehler };
        }
      });
    },

    // Letzte Sicherung holen und entschlüsseln → { app, tag, version, stand }
    holen() {
      return nacheinander(async () => {
        const v = verbindung();
        if (!v) throw new Error('nicht verbunden');
        const blob = await anfrage(v, 'GET', '/api/sicherung/' + APP);
        return entschluesseln(v.key, blob);
      });
    },

    // Für die Eltern-App: beliebige API-Aufrufe mit der gespeicherten Verbindung
    abrufen(methode, pfad, koerper) {
      return nacheinander(async () => {
        const v = verbindung();
        if (!v) throw new Error('nicht verbunden');
        return anfrage(v, methode, pfad, koerper);
      });
    },

    geraet,

    // Bausteine, auch für Werkzeuge und Tests
    code: { lesen: codeLesen, bauen: codeBauen },
    token, verschluesseln, entschluesseln, normSchluessel
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
