/* Geo Legends – Erdkunde-Trainer
   Vanilla JS, keine Abhängigkeiten. Fortschritt liegt in localStorage.
   Lernmodell: Karteikasten mit Stempeln (Bronze → Silber → Gold → Diamant).
   Neues wird bis zum Testdatum verteilt, am Tag davor kommt alles noch einmal dran (Generalprobe). */
(() => {
'use strict';

const GEO = window.GEO;
const MAPS = window.MAPS;

// ================================================================
// Konstanten
// ================================================================
const STORE_KEY = 'geolegends.v1';
const INTERVALS = [0, 1, 1, 2, 4];   // Tage Pause nach Erreichen der Stufe 1–4
const DIAMOND_INTERVAL = 7;          // Diamant und wieder richtig
const TIER = ['Neu', 'Bronze', 'Silber', 'Gold', 'Diamant'];
const TIER_ICON = ['✦', '🥉', '🥈', '🥇', '💎'];
const XP = { learn: 5, find: 8, mc: 5, type: 10, list: 15, typo: 3, hint: 4, levelUp: 5, combo: 10, round: 20 };
const NEW_DEFAULT = 15;   // neue Aufgaben pro Tag, wenn kein Test ansteht
const ROUND_NEW = 18;     // höchstens so viele neue pro Runde (es werden nur ganze Pakete genommen)
const ROUND_REVIEW = 30;  // höchstens so viele Wiederholungen pro Runde
const MAXZ = 14;          // stärkster Kartenzoom
const TITLES = [[1, 'Entdecker'], [4, 'Weltenbummler'], [8, 'Kartenprofi'], [14, 'Atlas-Ass'], [22, 'Geo Legend']];
const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const $ = s => document.querySelector(s);
const app = $('#app');

// ================================================================
// Themen, Pakete, Aufgaben
// ================================================================
const TOPICS = [
  { id: 'at', title: 'Bundesländer', icon: '🇦🇹', map: 'austria' },
  { id: 'st', title: 'Steckbrief', icon: '📋' },
  { id: 'eu', title: 'Länder Europas', short: 'Europa', icon: '🗺️', map: 'europe' },
  { id: 'welt', title: 'Kontinente & Ozeane', short: 'Welt', icon: '🌍', map: 'world' }
];
const TOPIC = Object.fromEntries(TOPICS.map(t => [t.id, t]));
const REGION = Object.fromEntries(GEO.regions.map(r => [r.id, r]));

function regionPacks(id) {
  const r = REGION[id];
  return [
    { id: id + '-l', topic: 'eu', title: r.title, map: 'europe',
      hint: 'Schau dir genau an, wo die Länder liegen. Tippe ein Land an, dann bekommst du einen Merktipp.' },
    { id: id + '-c', topic: 'eu', title: 'Hauptstädte · ' + r.title, map: 'europe', caps: true,
      hint: 'Lies die Paare halblaut vor – das hilft beim Merken.' }
  ];
}
const PACKS = [
  { id: 'kont', topic: 'welt', title: 'Die 7 Kontinente', map: 'world',
    hint: 'Präg dir ein, wo die Kontinente liegen. Tippe einen an, dann bekommst du einen Merktipp.' },
  { id: 'ozean', topic: 'welt', title: 'Die Ozeane', map: 'world',
    hint: 'Der Pazifik ist so groß, dass du ihn links und rechts auf der Karte siehst.' },
  { id: 'weltfakten', topic: 'welt', title: 'Rekorde der Erde' },
  { id: 'atl', topic: 'at', title: 'Die 9 Bundesländer', map: 'austria',
    hint: 'Von Westen nach Osten: Vorarlberg, Tirol, Salzburg … Tippe ein Bundesland an für einen Merktipp.' },
  { id: 'atc', topic: 'at', title: 'Die Landeshauptstädte', map: 'austria', caps: true,
    hint: 'Jedes Bundesland hat eine Landeshauptstadt. Lies die Paare halblaut vor.' },
  { id: 'st1', topic: 'st', title: 'Steckbrief Österreich · Teil 1' },
  ...regionPacks('nachbarn'),
  { id: 'st2', topic: 'st', title: 'Steckbrief Österreich · Teil 2' },
  ...regionPacks('west'),
  ...regionPacks('nord'),
  { id: 'st3', topic: 'st', title: 'Steckbrief Österreich · Teil 3' },
  ...regionPacks('ost'),
  ...regionPacks('sued'),
  ...regionPacks('mini')
];
const PACK = Object.fromEntries(PACKS.map((p, i) => [p.id, { ...p, index: i }]));

const ITEMS = [];
const IT = Object.create(null);
function addItem(it) { it.n = ITEMS.length; ITEMS.push(it); IT[it.id] = it; }
const factKind = f => (f.type === 'list' ? 'list' : 'fact');
GEO.continents.forEach(c => addItem({ id: 'k:' + c.id, topic: 'welt', kind: 'loc', map: 'world', ref: c, pack: 'kont' }));
GEO.oceans.forEach(o => addItem({ id: 'o:' + o.id, topic: 'welt', kind: 'loc', map: 'world', ref: o, pack: 'ozean', ocean: true }));
GEO.facts.filter(f => f.topic === 'welt').forEach(f => addItem({ id: 'f:' + f.id, topic: 'welt', kind: factKind(f), ref: f, pack: f.pack }));
GEO.states.forEach(s => addItem({ id: 'bl:' + s.id, topic: 'at', kind: 'loc', map: 'austria', ref: s, pack: 'atl' }));
GEO.states.forEach(s => addItem({ id: 'lh:' + s.id, topic: 'at', kind: 'cap', map: 'austria', ref: s, pack: 'atc' }));
GEO.facts.filter(f => !f.topic).forEach(f => addItem({ id: 'f:' + f.id, topic: 'st', kind: factKind(f), ref: f, pack: f.pack }));
GEO.countries.forEach(c => addItem({ id: 'l:' + c.id, topic: 'eu', kind: 'loc', map: 'europe', ref: c, pack: c.region + '-l' }));
GEO.countries.forEach(c => addItem({ id: 'h:' + c.id, topic: 'eu', kind: 'cap', map: 'europe', ref: c, pack: c.region + '-c' }));

const LOC = Object.create(null);   // 'europe:FRA' → Lage-Aufgabe
for (const it of ITEMS) if (it.kind === 'loc') LOC[it.map + ':' + it.ref.id] = it;
const CAP = Object.create(null);   // 'europe:FRA' → Hauptstadt-Aufgabe
for (const it of ITEMS) if (it.kind === 'cap') CAP[it.map + ':' + it.ref.id] = it;

function shortOf(r) { return r.short || r.name; }
function fullName(r) { return r.short && r.short !== r.name ? `${r.name} (${r.short})` : r.name; }
function nameAnswers(it) { return [it.ref.name, ...(it.ref.alt || [])]; }
function capAnswers(it) { return [it.ref.cap, ...(it.ref.capAlt || [])]; }
function capWord(it) { return it.map === 'austria' ? 'Landeshauptstadt' : 'Hauptstadt'; }
function vonOf(r) { return r.von || 'von ' + shortOf(r); }
function sameName(it) { return norm(it.ref.cap) === norm(it.ref.name); }
function flagOf(it) { return it.ref.flag ? it.ref.flag + ' ' : ''; }
function itemLabel(it) {
  if (it.kind === 'cap') return it.ref.cap;
  if (it.kind === 'loc') return flagOf(it) + shortOf(it.ref);
  return it.ref.label;
}
function regionTitle(map, id) {
  const it = LOC[map + ':' + id];
  if (it && (it.topic !== 'eu' || chosen(it.ref))) return shortOf(it.ref);
  if (map === 'europe') return (GEO.context[id] || (it ? shortOf(it.ref) : ''));
  return it ? shortOf(it.ref) : '';
}

// ================================================================
// Antworten prüfen
// ================================================================
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’ʼ`´']/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[.,!?;:…"“”„«»()/–—-]/g, ' ')
    .replace(/\bsankt\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}
function loose(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function aeForm(s) { return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'); }

// Abstand mit Vertauschung (Damerau): "Kopenhagne" → "Kopenhagen" = 1
function dist(a, b) {
  const m = a.length, n = b.length;
  const d = [];
  for (let i = 0; i <= m; i++) { d.push(new Array(n + 1).fill(0)); d[i][0] = i; }
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

// mode: name (Land, Bundesland, Kontinent …) | cap (Hauptstadt) | fact
function answersFor(it, mode) {
  if (mode === 'cap') return capAnswers(it);
  if (mode === 'fact') return it.ref.a;
  return nameAnswers(it);
}
function notesFor(it, mode) { return (mode === 'cap' ? it.ref.capNotes : it.ref.notes) || {}; }

// Hat das Kind eine andere Antwort aus derselben Karte geschrieben? (z. B. Budapest statt Bukarest)
function confusedWith(it, n, mode) {
  if (mode === 'fact' || !it.map) return null;
  const ln = loose(n);
  const want = mode === 'cap' ? 'cap' : 'loc';
  const pool = ITEMS.filter(o => o.map === it.map && (o.kind === 'loc' || o.kind === 'cap') && o.ref !== it.ref && !!o.ocean === !!it.ocean)
    .sort((a, b) => (a.kind === want ? 0 : 1) - (b.kind === want ? 0 : 1));
  for (const o of pool) {
    const ans = (o.kind === 'cap' ? capAnswers(o) : nameAnswers(o)).map(norm);
    if (ans.some(a => a === n || loose(a) === ln)) return o;
  }
  return null;
}

// res: ok | typo (fast richtig) | wrong
function check(it, input, mode) {
  const n = norm(input);
  if (!n) return { res: 'wrong', empty: true };
  const raw = answersFor(it, mode);
  const acc = raw.map(norm);
  if (acc.includes(n) || acc.some(a => aeForm(a) === aeForm(n))) return { res: 'ok' };
  for (const [k, v] of Object.entries(notesFor(it, mode))) {
    if (norm(k) === n || loose(norm(k)) === loose(n)) return { res: v[0], note: v[1] };
  }
  const ln = loose(n);
  const li = acc.findIndex(a => loose(a) === ln);
  if (li > -1) return { res: 'typo', near: raw[li], accent: true };
  const other = confusedWith(it, n, mode);
  if (other) return { res: 'wrong', confused: other };
  let best = 99, bi = 0;
  acc.forEach((a, i) => { const d = dist(ln, loose(a)); if (d < best) { best = d; bi = i; } });
  const len = loose(acc[bi]).replace(/[^a-z]/g, '').length;
  if ((best === 1 && len >= 4) || (best === 2 && len >= 9)) return { res: 'typo', near: raw[bi] };
  return { res: 'wrong' };
}

// Markiert im richtigen Wort die Buchstaben, die in der Eingabe fehlen oder falsch sind
function diffMark(input, target) {
  const a = input.trim().toLowerCase(), b = target.toLowerCase(), m = a.length, n = b.length;
  if (m === n) return [...target].map((c, k) => (a[k] === b[k] ? esc(c) : `<mark>${esc(c)}</mark>`)).join('');
  const L = [];
  for (let i = 0; i <= m; i++) L.push(new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const keep = new Array(n).fill(false);
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { keep[j] = true; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return [...target].map((c, k) => (keep[k] || c === ' ') ? esc(c) : `<mark>${esc(c)}</mark>`).join('');
}

// "St. Pölten" → "S_. P_____"
function pattern(s) {
  return s.split(' ').map(w => {
    let first = true;
    return [...w].map(c => {
      if (!/\p{L}/u.test(c)) return c;
      if (first) { first = false; return c; }
      return '_';
    }).join('');
  }).join('   ');
}

// ================================================================
// Datum (lokale Tage, keine Uhrzeiten)
// ================================================================
let dayOffset = 0;   // nur zum Testen: sessionStorage 'gl.dayOffset'
try { dayOffset = parseInt(sessionStorage.getItem('gl.dayOffset') || '0', 10) || 0; } catch (e) { /* egal */ }

function fmt(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function today() { return fmt(new Date(Date.now() + dayOffset * 864e5)); }
function addDays(ds, n) {
  const [y, m, d] = ds.split('-').map(Number);
  return fmt(new Date(y, m - 1, d + n, 12));
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}
function inDays(n) {
  if (n <= 0) return 'heute';
  if (n === 1) return 'morgen';
  return `in ${n} Tagen`;
}
function niceDate(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return `${WEEKDAY[dt.getDay()]}, ${d}.${m}.`;
}
function testDays() { return S.settings.testDate ? daysBetween(today(), S.settings.testDate) : null; }

// ================================================================
// Speicher
// ================================================================
function fresh() {
  return {
    v: 1,
    settings: { name: '', testDate: GEO.testDate || '', sel: null, sfx: true },
    it: {},
    stats: { xp: 0, streak: 0, best: 0, lastDay: '', answers: 0, right: 0, sessions: 0 },
    day: { date: '', newCount: 0 },
    ui: { hideInstall: false, onboarded: false }
  };
}
function upgrade(s) {
  const d = fresh();
  return {
    v: 1,
    settings: { ...d.settings, ...(s.settings || {}) },
    it: s.it && typeof s.it === 'object' ? s.it : {},
    stats: { ...d.stats, ...(s.stats || {}) },
    day: { ...d.day, ...(s.day || {}) },
    ui: { ...d.ui, ...(s.ui || {}) }
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return upgrade(JSON.parse(raw));
  } catch (e) { /* frisch starten */ }
  return fresh();
}
let S = load();
let saveWarned = false;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) {
    if (!saveWarned) { saveWarned = true; toast('Speichern klappt gerade nicht. Ist privates Surfen an?'); }
  }
}

// ================================================================
// Auswahl der markierten Länder
// ================================================================
function chosen(c) { return S.settings.sel ? S.settings.sel.includes(c.id) : !c.opt; }
function active(it) { return it.topic !== 'eu' || chosen(it.ref); }
function chosenCount() { return GEO.countries.filter(chosen).length; }

// ================================================================
// Karteikasten-Logik
// ================================================================
// Mit Testdatum: keine Karte wird erst nach dem Tag vor dem Test fällig (Generalprobe)
function effDue(st) {
  const t = S.settings.testDate;
  if (t && daysBetween(today(), t) >= 1) {
    const cap = addDays(t, -1);
    return st.due < cap ? st.due : cap;
  }
  return st.due;
}
function lv(it) { return S.it[it.id] ? S.it[it.id].lv : 0; }
function isDue(it) { const st = S.it[it.id]; return !!st && active(it) && st.last !== today() && effDue(st) <= today(); }
function dueItems() { return ITEMS.filter(isDue); }
function packIndex(it) { return PACK[it.pack] ? PACK[it.pack].index : 99; }
function unseenItems() { return ITEMS.filter(it => active(it) && !S.it[it.id]).sort((a, b) => packIndex(a) - packIndex(b) || a.n - b.n); }
function seenItems() { return ITEMS.filter(it => active(it) && S.it[it.id]); }
function newToday() { return S.day.date === today() ? S.day.newCount : 0; }

// Wie viele neue Aufgaben heute noch dran sind: alles Neue ist zwei Tage vor dem Test durch,
// der letzte Tag gehört der Wiederholung.
function newQuota() {
  const unseen = unseenItems().length, done = newToday();
  let per = NEW_DEFAULT;
  const d = testDays();
  if (d !== null && d >= 1) per = Math.max(10, Math.ceil((unseen + done) / Math.max(1, d - 1)));
  return Math.max(0, Math.min(unseen, per - done));
}

// Neue Aufgaben für eine Runde – nur ganze Pakete, damit zusammengehört, was zusammen gelernt wird
function newForRound(quota) {
  if (quota <= 0) return [];
  const list = unseenItems(), out = [];
  const cap = Math.min(ROUND_NEW, quota);
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j < list.length && list[j].pack === list[i].pack) j++;
    if (out.length && out.length + (j - i) > cap) break;
    out.push(...list.slice(i, j));
    i = j;
    if (out.length >= cap) break;
  }
  return out;
}

function collect(id) {
  const t = today();
  S.it[id] = { lv: 1, due: addDays(t, 1), last: t, ok: 0, bad: 0, since: t };
  if (S.day.date !== t) S.day = { date: t, newCount: 0 };
  S.day.newCount++;
}

// Nur der erste Versuch des Tages bei einer fälligen Aufgabe zählt für den Stempel
function review(id, res) {
  const st = S.it[id], t = today(), from = st.lv;
  if (res === 'ok') {
    st.lv = Math.min(4, from + 1);
    st.due = addDays(t, from === 4 ? DIAMOND_INTERVAL : INTERVALS[st.lv]);
  } else if (res === 'typo' || res === 'hint') {
    st.due = addDays(t, 1);
  } else {
    st.lv = Math.max(1, from - 1);
    st.due = addDays(t, 1);
  }
  st.last = t;
  return { from, to: st.lv };
}

function tierCounts(filter) {
  const c = [0, 0, 0, 0, 0];
  for (const it of ITEMS) if (active(it) && (!filter || filter(it))) c[lv(it)]++;
  return c;
}

// Streak: reißt nur, wenn an einem verpassten Tag wirklich etwas zu tun gewesen wäre
function refreshStreak() {
  const last = S.stats.lastDay;
  if (!last || !S.stats.streak || daysBetween(last, today()) <= 1) return;
  const yesterday = addDays(today(), -1);
  const restDay = seenItems().every(it => S.it[it.id].due > yesterday) && !unseenItems().length;
  if (!restDay) { S.stats.streak = 0; save(); }
}
function markDay() {
  const t = today();
  if (S.stats.lastDay === t) return false;
  S.stats.streak += 1;
  S.stats.best = Math.max(S.stats.best, S.stats.streak);
  S.stats.lastDay = t;
  return true;
}

function levelInfo(xp) {
  let lvl = 1, base = 0, need = 100;
  while (xp >= base + need) { base += need; lvl++; need = 100 + (lvl - 1) * 50; }
  let title = TITLES[0][1];
  for (const [l, name] of TITLES) if (lvl >= l) title = name;
  return { lvl, into: xp - base, need, title };
}

// ================================================================
// Aufgaben zusammenstellen
// ================================================================
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Abfrageart: zuerst erkennen (antippen, auswählen), dann selbst schreiben – wie im Test
function fmtFor(it, step) {
  const l = lv(it), r = Math.random();
  if (it.kind === 'list') return 'list';
  if (it.kind === 'fact') {
    const f = it.ref;
    if (f.type === 'mc' || step === 'learn') return 'factMC';
    return f.type === 'num' ? 'factNum' : 'factType';
  }
  if (it.kind === 'loc') {
    const eu = it.map === 'europe';
    if (step === 'learn') return eu ? 'nameMC' : 'find';
    if (step === 'learn2') return eu ? 'find' : 'nameType';
    if (l <= 1) return r < 0.5 ? 'find' : (eu ? 'nameMC' : 'nameType');
    return r < 0.6 ? 'nameType' : 'find';
  }
  const at = it.map === 'austria', rev = !sameName(it);
  if (step === 'learn') return 'capMC';
  if (step === 'learn2') return 'capType';
  if (l <= 1) return r < 0.5 ? 'capType' : (at ? 'dotMC' : rev ? 'revMC' : 'capMC');
  if (at) return r < 0.45 ? 'capType' : r < 0.8 ? 'dotType' : rev ? 'revType' : 'capType';
  return r < 0.65 || !rev ? 'capType' : 'revType';
}
function testFmt(it) {
  if (it.kind === 'loc') return 'nameType';
  if (it.kind === 'cap') return it.map === 'austria' && Math.random() < 0.4 ? 'dotType' : 'capType';
  if (it.ref.type === 'mc') return 'factMC';
  return it.ref.type === 'num' ? 'factNum' : 'factType';
}
const MAP_FMTS = new Set(['find', 'nameMC', 'nameType', 'capMC', 'capType', 'dotMC', 'dotType']);
const isMapFmt = f => MAP_FMTS.has(f);
const isTyped = f => /Type$|Num$/.test(f) || f === 'list';
const isMC = f => /MC$/.test(f);
function modeOf(f) {
  if (/^(cap|dot)/.test(f)) return 'cap';
  if (/^fact/.test(f)) return 'fact';
  return 'name';
}

// Runde: erst ein paar Wiederholungen zum Aufwärmen, dann je Paket die Einführung und die neuen
// Aufgaben, dazwischen wieder Wiederholungen
function buildRound(newList, reviews) {
  const rv = shuffle(reviews).slice(0, ROUND_REVIEW).map(it => ({ id: it.id, step: 'review', scored: true }));
  const groups = [];
  for (const it of newList) {
    const g = groups[groups.length - 1];
    if (g && g.pack === it.pack) g.ids.push(it.id); else groups.push({ pack: it.pack, ids: [it.id] });
  }
  const q = [];
  let r = 0;
  const take = n => { for (let k = 0; k < n && r < rv.length; k++) q.push(rv[r++]); };
  take(groups.length ? 3 : rv.length);
  for (const g of groups) {
    q.push({ type: 'pack', pack: g.pack, ids: g.ids });
    for (const id of shuffle(g.ids)) q.push({ id, step: 'learn', learn: true });
    take(4);
  }
  take(rv.length);
  return q;
}
function buildPractice(items, n = 12) {
  const score = it => lv(it) * 2 - (S.it[it.id] ? S.it[it.id].bad : 0) * 0.5 + Math.random() * 1.5;
  return items.map(it => [it, score(it)]).sort((a, b) => a[1] - b[1]).slice(0, n)
    .map(([it]) => ({ id: it.id, step: 'practice' }));
}
function buildTest(n) {
  const pool = seenItems().filter(it => it.kind !== 'list');
  const by = { at: [], st: [], eu: [], welt: [] };
  for (const it of shuffle(pool)) by[it.topic].push(it);
  const share = { at: 0.25, st: 0.2, eu: 0.4, welt: 0.15 };
  const total = Math.min(n, pool.length);
  const want = {};
  for (const k of Object.keys(share)) want[k] = Math.min(by[k].length, Math.round(total * share[k]));
  let sum = Object.values(want).reduce((a, b) => a + b, 0);
  for (const k of ['eu', 'at', 'st', 'welt']) {   // fehlende Plätze aus anderen Themen auffüllen
    while (sum < total && want[k] < by[k].length) { want[k]++; sum++; }
  }
  for (const k of ['eu', 'at', 'st', 'welt']) {   // zu viele (durch Runden) wieder abziehen
    while (sum > total && want[k] > 0) { want[k]--; sum--; }
  }
  const order = ['at', 'st', 'eu', 'welt'];
  const q = [];
  for (const k of order) {
    // innerhalb eines Teils: erst Karten, dann Hauptstädte, dann Fakten – wie auf einem Testblatt
    const part = by[k].slice(0, want[k]).sort((a, b) => ({ loc: 0, cap: 1, fact: 2 })[a.kind] - ({ loc: 0, cap: 1, fact: 2 })[b.kind]);
    for (const it of part) q.push({ id: it.id, step: 'test', fmt: testFmt(it), section: k });
  }
  return q;
}

// Auswahlmöglichkeiten: Nachbarn und Länder aus demselben Paket zuerst – so wird es knifflig
function optionsFor(it, f) {
  if (f === 'factMC') return shuffle(it.ref.mc.map((text, i) => ({ text, ok: i === 0 })));
  const field = (f === 'capMC' || f === 'dotMC') ? 'cap' : 'name';
  const nb = ((MAPS[it.map] || {}).n || {})[it.ref.id] || [];
  const grp = it.pack.replace(/-[lc]$/, '');
  const text = o => (field === 'cap' ? o.ref.cap : shortOf(o.ref));
  const mine = text(it);
  const pool = ITEMS.filter(o => o.kind === 'loc' && o.map === it.map && o.ref !== it.ref && !!o.ocean === !!it.ocean
    && (o.topic !== 'eu' || chosen(o.ref) || nb.includes(o.ref.id)))
    .map(o => [o, (nb.includes(o.ref.id) ? 0 : 1.2) + (o.pack.replace(/-[lc]$/, '') === grp ? 0 : 1) + Math.random() * 1.4])
    .sort((a, b) => a[1] - b[1]);
  const seen = new Set([norm(mine)]), others = [];
  for (const [o] of pool) {
    const t = text(o);
    if (seen.has(norm(t))) continue;
    seen.add(norm(t));
    others.push(t);
    if (others.length === 3) break;
  }
  return shuffle([{ text: mine, ok: true }, ...others.map(t => ({ text: t, ok: false }))]);
}

// ================================================================
// Ton und Vibration
// ================================================================
let actx = null;
function sfx(kind) {
  if (!S.settings.sfx) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const seq = {
      ok: [[660, 0], [990, 0.09]],
      bad: [[220, 0], [165, 0.11]],
      tap: [[520, 0]],
      level: [[523, 0], [659, 0.09], [784, 0.18], [1046, 0.27]]
    }[kind] || [];
    for (const [f, d] of seq) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = kind === 'bad' ? 'square' : 'triangle';
      o.frequency.value = f;
      const peak = kind === 'bad' ? 0.05 : 0.16;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(peak, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(actx.destination);
      o.start(t + d);
      o.stop(t + d + 0.2);
    }
  } catch (e) { /* kein Ton */ }
}
// iPhone hat keine Vibration-API; ein unsichtbarer Schalter (iOS 18+) löst ein kurzes Haptik-Feedback aus
function haptic() {
  if (!S.settings.sfx) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(18); return; }
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch (e) { /* egal */ }
}

// ================================================================
// Kleine UI-Helfer
// ================================================================
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function restartAnim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function shake(el) { restartAnim(el, 'shake'); }

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Einfaches Bottom-Sheet. buttons: [{ label, value, cls }]
function sheet(html, buttons) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}
      <div class="sheet-btns">${(buttons || []).map((b, i) => `<button class="btn ${b.cls || ''}" type="button" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    const close = val => { wrap.remove(); resolve(val); };
    wrap.addEventListener('click', e => {
      if (e.target === wrap) return close(null);
      const b = e.target.closest('[data-i]');
      if (b) close(buttons[+b.dataset.i].value);
    });
    document.body.appendChild(wrap);
    const first = wrap.querySelector('textarea, input');
    if (first) first.focus();
  });
}

let fxToken = 0;
function stopFx() {
  fxToken++;
  const cv = $('#fx');
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const token = ++fxToken;
  const cv = $('#fx'), ctx = cv.getContext('2d');
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = ['#B6F23A', '#FFD23F', '#5EE0F5', '#E9A06B', '#FF5168', '#FFFFFF'];
  const P = Array.from({ length: 110 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.3,
    vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 12 - 5,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
    w: 7 + Math.random() * 7, h: 10 + Math.random() * 8,
    c: colors[Math.floor(Math.random() * colors.length)]
  }));
  let last = performance.now();
  const frame = now => {
    if (token !== fxToken) return;
    const k = Math.min(2, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of P) {
      p.vy += 0.38 * k; p.vx *= 0.995; p.x += p.vx * k; p.y += p.vy * k; p.r += p.vr * k;
      if (p.y > H + 30) continue;
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0F2A3D';
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}

// Sichtbare Höhe über der Tastatur (iPhone) für das Layout der Abfrage
function syncViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : innerHeight;
  document.documentElement.style.setProperty('--vvh', h + 'px');
  document.body.classList.toggle('kb', !!vv && innerHeight - vv.height > 120);
}
if (window.visualViewport) visualViewport.addEventListener('resize', syncViewport);
addEventListener('resize', syncViewport);

// ================================================================
// Karte: SVG mit Zoomen (zwei Finger), Verschieben und Antippen
// Die Kamera ist die viewBox; Beschriftungen bleiben beim Zoomen gleich groß (--u).
// ================================================================
const VIEWS = new Set();
// Beschriftungen, die sonst über den Rand ragen oder sich überdecken (Karteneinheiten, Schrift in px)
const LABEL_TWEAK = {
  'austria:vbg': { rot: -90, dy: 4 },
  'europe:LIE': { anchor: 'end', dx: -6, dy: 12 },
  'europe:SMR': { anchor: 'start', dx: 6 },
  'europe:VAT': { dy: 16 },
  'europe:MCO': { anchor: 'end', dx: -6 },
  'europe:AND': { dy: 16 },
  'europe:LUX': { anchor: 'start', dx: 7 },
  'europe:MLT': { dy: 16 }
};
const CITY_TWEAK = {
  'austria:wien': { anchor: 'start', dx: 9, dy: 4 },
  'austria:noe': { anchor: 'end', dx: -9, dy: 4 },
  'austria:bgld': { dy: 21 },
  'austria:vbg': { anchor: 'start', dx: -12 },
  'europe:AUT': { anchor: 'end', dx: -9, dy: 4 },
  'europe:SVK': { anchor: 'start', dx: 9, dy: 4 },
  'europe:VAT': { dy: 21 },
  'europe:MCO': { anchor: 'end', dx: -9, dy: 4 },
  'europe:SMR': { anchor: 'start', dx: 9, dy: 4 },
  'europe:MKD': { dy: 21 },
  'europe:ALB': { dy: 21 },
  'europe:LIE': { anchor: 'end', dx: -9, dy: 4 },
  'europe:CHE': { dy: 21 },
  'europe:LUX': { anchor: 'start', dx: 9, dy: 4 },
  'europe:BEL': { anchor: 'end', dx: -9, dy: 4 },
  'europe:EST': { anchor: 'start', dx: 9, dy: 4 },
  'europe:FIN': { dy: -10 }
};
const AT_NEIGHBOURS = { DEU: 'Deutschland', CZE: 'Tschechien', SVK: 'Slowakei', HUN: 'Ungarn', SVN: 'Slowenien', ITA: 'Italien', CHE: 'Schweiz' };
function clearViews() { VIEWS.forEach(v => v.destroy()); VIEWS.clear(); }

class MapView {
  constructor(host, id, opts = {}) {
    this.id = id;
    this.m = MAPS[id];
    this.opts = opts;
    this.onTap = opts.onTap || null;
    this.cam = { cx: this.m.w / 2, cy: this.m.h / 2, z: 1 };
    this.fit = { w: this.m.w, h: this.m.h };
    this.cw = 1;
    this.u = 1;
    this.items = [];
    this.base = id === 'austria' ? Object.entries(AT_NEIGHBOURS).map(([k, text]) => {
      const [x, y] = this.m.nl[k];
      const anchor = x > this.m.w * 0.9 ? 'end' : x < this.m.w * 0.1 ? 'start' : 'middle';
      return { x: Math.min(this.m.w - 6, Math.max(6, x)), y, text, cls: 'nb-l', anchor };
    }) : [];
    this.ptr = new Map();
    host.innerHTML = this.html();
    this.box = host.querySelector('.mapbox');
    this.svg = this.box.querySelector('svg');
    this.ov = this.svg.querySelector('.ov');
    this.els = Object.create(null);
    this.svg.querySelectorAll('[data-id]').forEach(el => { (this.els[el.dataset.id] = this.els[el.dataset.id] || []).push(el); });
    this.bind();
    this.measure();
    requestAnimationFrame(() => this.measure());
    if ('ResizeObserver' in window) { this.ro = new ResizeObserver(() => this.measure()); this.ro.observe(this.box); }
    VIEWS.add(this);
  }

  html() {
    const m = this.m, id = this.id;
    let g = '';
    if (id === 'world') g += `<path class="sphere" d="${m.sphere}"/>` + Object.entries(m.o).map(([k, d]) => `<path class="oc" data-id="${k}" d="${d}"/>`).join('');
    else g += `<rect class="${id === 'austria' ? 'nbg' : 'sea'}" width="${m.w}" height="${m.h}"/>`;
    if (id === 'austria') g += `<path class="nland" d="${m.land}"/><path class="nborder" d="${m.borders}"/>`;
    g += Object.entries(m.r).map(([k, r]) => `<path class="rg" data-id="${k}" d="${r.d}"/>`).join('');
    if (id === 'austria') g += `<path class="lake" d="${m.lakes}"/><path class="river" d="${m.river}"/>`;
    if (id === 'world') g += `<path class="lake" d="${m.lakes}"/><path class="rim" d="${m.sphere}"/>`;
    else g += `<rect class="frame" width="${m.w}" height="${m.h}"/>`;
    const zoom = this.opts.zoom === false ? '' : `<div class="zoom">
      <button type="button" data-z="in" aria-label="Hineinzoomen">+</button>
      <button type="button" data-z="out" aria-label="Herauszoomen">−</button>
      <button type="button" data-z="fit" aria-label="Ganze Karte">⤢</button></div>`;
    return `<div class="mapbox map-${id}" style="--ar:${m.w} / ${m.h}"><svg class="map" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" viewBox="0 0 ${m.w} ${m.h}"><g class="vp">${g}</g><g class="ov"></g></svg>${zoom}</div>`;
  }

  destroy() {
    if (this.ro) this.ro.disconnect();
    cancelAnimationFrame(this.anim);
    VIEWS.delete(this);
  }

  measure() {
    const r = this.box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.cw = r.width;
    const a = r.width / r.height, A = this.m.w / this.m.h;
    this.fit = a > A ? { w: this.m.h * a, h: this.m.h } : { w: this.m.w, h: this.m.w / a };
    this.apply();
  }
  view() {
    const c = this.cam, w = this.fit.w / c.z, h = this.fit.h / c.z;
    return { x: c.cx - w / 2, y: c.cy - h / 2, w, h };
  }
  clamp() {
    const c = this.cam, W = this.m.w, H = this.m.h;
    c.z = Math.min(MAXZ, Math.max(1, c.z));
    const w = this.fit.w / c.z, h = this.fit.h / c.z;
    c.cx = w >= W ? W / 2 : Math.min(W - w / 2, Math.max(w / 2, c.cx));
    c.cy = h >= H ? H / 2 : Math.min(H - h / 2, Math.max(h / 2, c.cy));
  }
  apply() {
    this.clamp();
    const v = this.view();
    this.svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    this.u = v.w / this.cw;   // Karteneinheiten pro Bildschirmpixel
    this.svg.style.setProperty('--u', this.u.toFixed(4));
    this.updateOverlay();
  }

  // ----- Kamera -----
  fly(target, ms = 480) {
    const from = { ...this.cam }, to = { ...this.cam, ...target };
    cancelAnimationFrame(this.anim);
    if (ms <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(this.cam, to); this.apply(); return; }
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.cam.z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * e);
      this.cam.cx = from.cx + (to.cx - from.cx) * e;
      this.cam.cy = from.cy + (to.cy - from.cy) * e;
      this.apply();
      if (k < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
  fitAll(ms) { this.fly({ cx: this.m.w / 2, cy: this.m.h / 2, z: 1 }, ms); }
  // Rahmen um mehrere Länder; sehr große Länder zählen nur mit ihrer Mitte (sonst wird alles winzig)
  boxFor(ids, big = 260) {
    const bs = ids.map(id => {
      const r = this.m.r[id];
      if (!r) return null;
      const b = r.b;
      if (ids.length === 1 || Math.hypot(b[2] - b[0], b[3] - b[1]) <= big || !r.p) return b;
      return [r.p[0] - 70, r.p[1] - 70, r.p[0] + 70, r.p[1] + 70];
    }).filter(Boolean);
    if (!bs.length) return null;
    return [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];
  }
  camFor(b, o = {}) {
    const pad = o.pad || 2.4, min = o.min || 150;
    const bw = Math.max((b[2] - b[0]) * pad, min), bh = Math.max((b[3] - b[1]) * pad, min);
    const z = Math.min(o.maxz || MAXZ, Math.max(1, Math.min(this.fit.w / bw, this.fit.h / bh)));
    return { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, z };
  }
  frameIds(ids, o = {}) {
    const b = this.boxFor(ids, o.big);
    if (!b) { this.fitAll(o.ms); return { z: 1 }; }
    const t = this.camFor(b, o);
    this.fly(t, o.ms);
    return t;
  }
  uAt(z) { return this.fit.w / z / this.cw; }
  toMap(x, y) {
    const r = this.svg.getBoundingClientRect(), v = this.view();
    return { x: v.x + (x - r.left) / r.width * v.w, y: v.y + (y - r.top) / r.height * v.h };
  }
  // Kamera so setzen, dass der Kartenpunkt p unter dem Bildschirmpunkt (x, y) liegt
  place(p, x, y) {
    const r = this.svg.getBoundingClientRect();
    const w = this.fit.w / this.cam.z, h = this.fit.h / this.cam.z;
    this.cam.cx = p.x - ((x - r.left) / r.width - 0.5) * w;
    this.cam.cy = p.y - ((y - r.top) / r.height - 0.5) * h;
    this.apply();
  }
  zoomAt(x, y, f, animate) {
    const p = this.toMap(x, y);
    const z = Math.min(MAXZ, Math.max(1, this.cam.z * f));
    if (animate) {
      const r = this.svg.getBoundingClientRect(), w = this.fit.w / z, h = this.fit.h / z;
      this.fly({ z, cx: p.x - ((x - r.left) / r.width - 0.5) * w, cy: p.y - ((y - r.top) / r.height - 0.5) * h }, 280);
      return;
    }
    this.cam.z = z;
    this.place(p, x, y);
  }

  // ----- Finger und Maus -----
  bind() {
    const s = this.svg;
    s.addEventListener('pointerdown', e => this.down(e));
    s.addEventListener('pointermove', e => this.move(e));
    s.addEventListener('pointerup', e => this.up(e, false));
    s.addEventListener('pointercancel', e => this.up(e, true));
    s.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
    const z = this.box.querySelector('.zoom');
    if (z) {
      z.addEventListener('click', e => {
        const b = e.target.closest('[data-z]');
        if (!b) return;
        const r = this.svg.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2;
        if (b.dataset.z === 'in') this.zoomAt(mx, my, 1.8, true);
        else if (b.dataset.z === 'out') this.zoomAt(mx, my, 1 / 1.8, true);
        else this.fitAll(320);
      });
      z.addEventListener('mousedown', e => e.preventDefault());   // Tastatur bleibt offen
    }
  }
  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { this.svg.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
    this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(this.anim);
    if (this.ptr.size === 1) {
      this.g = { x0: e.clientX, y0: e.clientY, t0: performance.now(), cx: this.cam.cx, cy: this.cam.cy, moved: false };
    } else if (this.ptr.size === 2) {
      const [a, b] = [...this.ptr.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: this.cam.z, p: this.toMap(mid.x, mid.y) };
      if (this.g) this.g.moved = true;
    }
  }
  move(e) {
    if (!this.ptr.has(e.pointerId)) return;
    this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptr.size >= 2 && this.pinch) {
      const [a, b] = [...this.ptr.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.cam.z = Math.min(MAXZ, Math.max(1, this.pinch.z0 * d / this.pinch.d0));
      this.place(this.pinch.p, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (this.g) {
      const dx = e.clientX - this.g.x0, dy = e.clientY - this.g.y0;
      if (!this.g.moved && Math.hypot(dx, dy) > 9) this.g.moved = true;
      if (this.g.moved && this.cam.z > 1.001) {
        this.cam.cx = this.g.cx - dx * this.u;
        this.cam.cy = this.g.cy - dy * this.u;
        this.apply();
      }
    }
  }
  up(e, cancel) {
    if (!this.ptr.has(e.pointerId)) return;
    this.ptr.delete(e.pointerId);
    if (this.ptr.size === 1) {   // nach dem Zoomen mit dem verbleibenden Finger weiter verschieben
      const [p] = [...this.ptr.values()];
      this.g = { x0: p.x, y0: p.y, t0: 0, cx: this.cam.cx, cy: this.cam.cy, moved: true };
      this.pinch = null;
      return;
    }
    if (!this.ptr.size) {
      const g = this.g;
      this.g = null;
      this.pinch = null;
      if (!cancel && g && !g.moved && performance.now() - g.t0 < 700) this.tap(e.clientX, e.clientY);
    }
  }
  // Kleine Länder sind schwer zu treffen: In ihrer Nähe wird erst hineingezoomt
  tap(x, y) {
    if (!this.onTap) return;
    const el = document.elementFromPoint(x, y);
    const hit = el && el.closest ? el.closest('[data-id]') : null;
    let id = hit && this.svg.contains(hit) ? hit.dataset.id : null;
    const p = this.toMap(x, y), small = [];
    for (const [rid, r] of Object.entries(this.m.r)) {
      const b = r.b, diag = Math.hypot(b[2] - b[0], b[3] - b[1]) / this.u;
      if (diag > 16) continue;
      const c = r.p || [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      small.push({ rid, diag, d: Math.hypot(c[0] - p.x, c[1] - p.y) / this.u });
    }
    // Direkt auf ein winziges Land getippt (oder daneben ins Meer): erst näher heran, dann zählt der Tipp
    const near = small.filter(n => n.d < (id ? Math.max(6, n.diag / 2 + 4) : 14)).sort((a, b) => a.d - b.d);
    if (near.length && !(id && near.some(n => n.rid === id))) {
      if (!id && near.length === 1) id = near[0].rid;
      else if (this.cam.z < MAXZ - 0.5) {
        // so weit hinein, dass das kleinste Land in der Nähe gut zu treffen ist
        const f = Math.max(2.6, 16 / Math.max(0.5, near[0].diag));
        this.zoomAt(x, y, f, true);
        toast('Hier ist es eng – ich zoome näher ran. Tipp nochmal.');
        return;
      } else id = near[0].rid;
    }
    this.onTap(id, x, y);
  }

  // ----- Darstellung -----
  setBase(fn) {
    for (const [id, els] of Object.entries(this.els)) {
      const c = fn ? (fn(id) || '') : '';
      for (const el of els) el.setAttribute('class', (el.classList.contains('oc') ? 'oc' : 'rg') + (c ? ' ' + c : ''));
    }
  }
  mark(id, cls, on = true) { (this.els[id] || []).forEach(el => el.classList.toggle(cls, on)); }
  unmarkAll(...cls) { for (const els of Object.values(this.els)) for (const el of els) el.classList.remove(...cls); }
  labelPoints(id) {
    if (this.m.r[id]) return [this.m.r[id].p];
    if (this.m.ol && this.m.ol[id]) return this.m.ol[id];
    return [];
  }
  // items: { x, y, text, cls, dot, halo, anchor, dy, diag, minPx }
  setOverlay(items) {
    this.items = [...this.base, ...items];
    this.ov.innerHTML = this.items.map(o => {
      const ty = o.dy != null ? o.dy : (o.dot ? -10 : 4);
      const rot = o.rot ? ` transform="rotate(${o.rot})"` : '';
      return `<g class="ovi ${o.cls || ''}" transform="translate(${o.x.toFixed(1)} ${o.y.toFixed(1)})"><g class="ovs">`
        + (o.halo ? '<circle class="halo" r="13"/>' : '')
        + (o.dot ? '<circle class="dot" r="4.6"/>' : '')
        + (o.text ? `<text x="${o.dx || 0}" y="${ty}" text-anchor="${o.anchor || 'middle'}"${rot}>${esc(o.text)}</text>` : '')
        + '</g></g>';
    }).join('');
    this.ovEls = [...this.ov.children];
    this.updateOverlay();
  }
  updateOverlay() {
    if (!this.ovEls) return;
    if (this.opts.autoHide) {   // nur Beschriftungen zeigen, die gerade Platz haben – Wichtiges zuerst
      const placed = [], v = this.view(), u = this.u;
      const order = this.items.map((o, i) => i).sort((a, b) => (this.items[b].prio || 0) - (this.items[a].prio || 0));
      for (const i of order) {
        const o = this.items[i], el = this.ovEls[i];
        if (!o.text || !el) continue;
        let ok = null;
        const inView = o.x > v.x && o.x < v.x + v.w && o.y > v.y && o.y < v.y + v.h;
        if (inView && (!o.diag || o.diag / u >= (o.minPx || 10))) {   // winzige Länder erst beim Hineinzoomen
          const base = o.dy != null ? o.dy : (o.dot ? -10 : 4);
          for (const dy of (o.dot ? [base, base + 29] : [base, base - 14, base + 14])) {
            const box = labelBox(o, u, dy);
            // am Kartenrand nach innen schieben statt abschneiden
            let sx = 0;
            if (box[0] < v.x + 3 * u) sx = v.x + 3 * u - box[0];
            else if (box[2] > v.x + v.w - 3 * u) sx = v.x + v.w - 3 * u - box[2];
            box[0] += sx; box[2] += sx;
            if (!placed.some(p => overlaps(p, box))) { ok = { dy, box, sx }; break; }
          }
        }
        el.classList.toggle('notext', !ok);
        if (ok) {
          placed.push(ok.box);
          const tx = el.querySelector('text');
          if (tx) { tx.setAttribute('y', ok.dy); tx.setAttribute('x', ((o.dx || 0) + ok.sx / u).toFixed(1)); }
        }
      }
      return;
    }
    this.items.forEach((o, i) => {
      if (o.diag && this.ovEls[i]) this.ovEls[i].style.display = o.diag / this.u >= (o.minPx || 22) ? '' : 'none';
    });
  }
  regionLabel(id, text, cls, extra = {}) {
    const tw = LABEL_TWEAK[this.id + ':' + id] || {};
    return this.labelPoints(id).filter(Boolean).map(p => {
      const r = this.m.r[id];
      return { x: p[0], y: p[1], text, cls, diag: extra.small && r ? Math.hypot(r.b[2] - r.b[0], r.b[3] - r.b[1]) : 0, ...tw, ...extra };
    });
  }
  cityPoint(id) { return this.m.c && this.m.c[id]; }
  // Punkt + Name einer Hauptstadt
  cityLabel(id, text, cls, extra = {}) {
    const c = this.cityPoint(id);
    if (!c) return [];
    return [{ x: c[0], y: c[1], dot: true, text, cls: 'cap ' + (cls || ''), ...(text && text !== '?' ? CITY_TWEAK[this.id + ':' + id] || {} : {}), ...extra }];
  }
}

// Ungefährer Platz, den eine Beschriftung auf der Karte braucht (in Karteneinheiten)
function labelBox(o, u, dy) {
  const big = /\bbig\b/.test(o.cls || '');
  const w = o.text.length * (big ? 9.6 : 7.3) * u, h = (big ? 18 : 14) * u;
  const shift = o.anchor === 'start' ? 0 : o.anchor === 'end' ? -w : -w / 2;
  const x0 = o.x + (o.dx || 0) * u + shift;
  const y1 = o.y + (dy != null ? dy : (o.dy != null ? o.dy : (o.dot ? -10 : 4))) * u;   // Grundlinie
  return [x0, y1 - h * 0.8, x0 + w, y1 + h * 0.25];
}
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// Beschriftungen, die sich überdecken würden, eine Zeile nach oben oder unten schieben.
// u = Karteneinheiten pro Bildschirmpixel bei der Zoomstufe, für die entzerrt wird.
function declutter(items, u) {
  const placed = [];
  for (const o of items) {
    if (!o.text || o.rot) continue;
    const base = o.dy != null ? o.dy : (o.dot ? -10 : 4);
    const tries = o.dot ? [base, base + 29, base - 15, base + 44] : [base, base - 15, base + 15, base - 30, base + 30];
    let pick = null;
    for (const dy of tries) {
      const box = labelBox(o, u, dy);
      if (!placed.some(p => overlaps(p, box))) { pick = { dy, box }; break; }
    }
    if (!pick) pick = { dy: base, box: labelBox(o, u, base) };
    if (pick.dy !== base) o.dy = pick.dy;
    placed.push(pick.box);
  }
  return items;
}

// ================================================================
// Screens
// ================================================================
let screen = '';

function topbar(title, back = 'home') {
  return `<header class="topbar">
    <button class="icon-btn" type="button" data-act="${back}" aria-label="Zurück">‹</button>
    <h1 class="outline">${title}</h1>
  </header>`;
}
const GLOBE = `<svg class="globe" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="#9ED8F2" stroke="#0F2A3D" stroke-width="4"/>
  <path d="M15 21c5-4 11-3 14 1s-1 7 3 10 4 8-1 11-11 1-13-4-7-6-6-10 0-6 3-8zM38 14c5 0 11 3 14 9-3 1-7 0-9 3s1 7-2 9-6-1-6-6-4-6-3-10 2-5 6-5z" fill="#B6F23A" stroke="#0F2A3D" stroke-width="2.5" stroke-linejoin="round"/>
  <ellipse cx="32" cy="32" rx="12" ry="27" fill="none" stroke="#0F2A3D" stroke-width="2.5" opacity=".45"/>
  <path d="M5 32h54" stroke="#0F2A3D" stroke-width="2.5" opacity=".45"/></svg>`;

// ---------- Willkommen ----------
function welcome() {
  scrollTo(0, 0);
  screen = 'welcome';
  stopFx();
  clearViews();
  const d = testDays();
  app.innerHTML = `
  <section class="screen welcome">
    <div class="logo-fan" aria-hidden="true">
      <span class="mini" style="--i:-1;--tier:var(--t1)"></span>
      <span class="mini" style="--i:1;--tier:var(--t3)"></span>
      <span class="mini hero-card" style="--i:0">${GLOBE}</span>
    </div>
    <h1 class="outline hero">Geo Legends</h1>
    <p class="lead">Österreich, Europa und die ganze Welt –<br>auf der Karte gelernt.${d !== null && d >= 0 ? `<br>Fit für den Test am ${esc(niceDate(S.settings.testDate))}` : ''}</p>
    <ul class="rules">
      <li><span>🗺️</span><p><b>Karten statt Listen:</b> Du tippst auf die Karte und schreibst die Namen selbst – so wie im Test.</p></li>
      <li><span>🥇</span><p><b>Stempel sammeln:</b> Bronze, Silber, Gold, Diamant. Jeden Tag kann ein Stempel eine Stufe steigen.</p></li>
      <li><span>📅</span><p><b>Der Plan bis zum Test:</b> Jeden Tag ein Stück Neues, am Tag davor die Generalprobe.</p></li>
    </ul>
    <form class="panel name-form" id="welcome-form">
      <label for="nm">Wie heißt du?</label>
      <input id="nm" type="text" maxlength="20" placeholder="Dein Name" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" value="${esc(S.settings.name)}">
      <button class="btn go big" type="submit">Los geht’s</button>
    </form>
  </section>`;
  $('#welcome-form').addEventListener('submit', async e => {
    e.preventDefault();
    S.settings.name = $('#nm').value.trim().slice(0, 20);
    S.ui.onboarded = true;
    save();
    $('#nm').blur();
    const v = await sheet(`<h2 class="sheet-title">Markierte Länder</h2>
      <p>Habt ihr im Unterricht Länder für die Wiederholung markiert? Dann wähle genau diese aus – die App lernt dann nur die.</p>`,
      [{ label: 'Ja, ich wähle sie aus', value: 'choose', cls: 'go' }, { label: 'Nein – alle Länder lernen', value: 'all' }]);
    if (v === 'choose') choose('home'); else home();
  });
}

// ---------- Start ----------
function isStandalone() { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

function home() {
  scrollTo(0, 0);
  screen = 'home';
  stopFx();
  clearViews();
  SES = null;
  document.body.classList.remove('in-session');
  refreshStreak();
  const due = dueItems();
  const quota = newQuota();
  const nNew = quota ? Math.max(quota, newForRound(quota).length) : 0;
  const L = levelInfo(S.stats.xp);
  const streak = S.stats.streak;
  const name = S.settings.name;
  const d = testDays();

  let eyebrow = 'Heute';
  if (d === 1) eyebrow = 'Heute · Generalprobe';
  let mission;
  if (d === 0) {
    mission = `
      <div class="eyebrow">Heute ist der Test</div>
      <p class="mission-done">Viel Glück! 🍀</p>
      <p class="mission-line">Du hast dich gut vorbereitet. Eine kurze Aufwärmrunde weckt dein Gehirn auf.</p>
      <button class="btn go big" type="button" data-act="warmup">Aufwärmen · 12 Fragen</button>
      ${due.length || nNew ? `<button class="link" type="button" data-act="start">Oder die normale Mission (${due.length + nNew})</button>` : ''}`;
  } else if (due.length || nNew) {
    const mins = Math.max(1, Math.round((due.length * 8 + nNew * 30) / 60));
    let line;
    if (due.length && nNew) line = `<b>${due.length}</b> ${due.length === 1 ? 'Wiederholung' : 'Wiederholungen'} und <b>${nNew}</b> neue ${nNew === 1 ? 'Sache' : 'Sachen'}.`;
    else if (due.length) line = d === 1 ? `Heute kommt alles noch einmal: <b>${due.length}</b> Fragen.` : `<b>${due.length}</b> ${due.length === 1 ? 'Wiederholung wartet' : 'Wiederholungen warten'}.`;
    else line = seenItems().length ? `<b>${nNew}</b> neue ${nNew === 1 ? 'Sache wartet' : 'Sachen warten'} auf dich.` : `<b>${nNew}</b> Stempel warten heute auf dich.`;
    const rounds = Math.max(1, Math.ceil(due.length / ROUND_REVIEW), Math.ceil(nNew / ROUND_NEW));
    mission = `
      <div class="eyebrow">${eyebrow}</div>
      ${stampsHTML(due, nNew)}
      <p class="mission-line">${line}</p>
      <p class="mission-time">ca. ${mins} ${mins === 1 ? 'Minute' : 'Minuten'}${rounds > 1 ? ` · in ${rounds} Runden, Pausen erlaubt` : ''}</p>
      <button class="btn go big" type="button" data-act="start">Start</button>`;
  } else {
    const tomorrow = addDays(today(), 1);
    const nTomorrow = seenItems().filter(it => effDue(S.it[it.id]) <= tomorrow).length;
    const unseen = unseenItems().length;
    let next = '';
    if (d === 1) next = 'Generalprobe geschafft – morgen bist du bereit!';
    else if (nTomorrow) next = `Morgen ${nTomorrow === 1 ? 'kommt' : 'kommen'} <b>${nTomorrow}</b> ${nTomorrow === 1 ? 'Wiederholung' : 'Wiederholungen'}${unseen ? ' und Neues' : ''}.`;
    mission = `
      <div class="eyebrow">${eyebrow}</div>
      <p class="mission-done">Mission geschafft ✓</p>
      <p class="mission-line">${next}</p>
      <div class="two">
        ${unseen ? `<button class="btn" type="button" data-act="extraNew">Mehr lernen</button>` : ''}
        ${seenItems().length ? `<button class="btn" type="button" data-act="practiceAll">Freies Üben</button>` : ''}
      </div>
      <p class="fineprint">Extra-Runden bringen XP. Stempel steigen aber erst, wenn die Aufgabe wieder dran ist.</p>`;
  }

  let testPill = '';
  if (d !== null && d >= 0) testPill = `<div class="pill test">📝 ${d === 0 ? 'Test heute!' : d === 1 ? 'Test morgen' : `Test in ${d} Tagen`}</div>`;

  const installHint = (!isStandalone() && isIOS() && !S.ui.hideInstall) ? `
    <div class="panel install">
      <p><b>Als App aufs iPhone:</b> unten auf <span class="share">⬆︎</span> Teilen tippen, dann „Zum Home-Bildschirm“. So bleibt dein Fortschritt sicher gespeichert.</p>
      <button class="link" type="button" data-act="hideInstall">Ausblenden</button>
    </div>` : '';

  app.innerHTML = `
  <section class="screen home">
    <header class="home-top">
      <h1 class="outline hello">${name ? `Hi ${esc(name)}!` : 'Hi!'}</h1>
      <button class="icon-btn" type="button" data-act="settings" aria-label="Einstellungen">⚙︎</button>
    </header>
    <div class="pills">
      <div class="pill streak ${streak ? '' : 'off'}">🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'}</div>
      <div class="pill level">★ Level ${L.lvl}<span class="xpmini"><i style="width:${Math.round(L.into / L.need * 100)}%"></i></span></div>
      ${testPill}
    </div>
    <div class="panel mission">${mission}</div>
    ${installHint}
    <div class="passport">
      <div class="shelf-head"><h2>Dein Reisepass</h2><span>${tierLegend()}</span></div>
      <div class="tiles">${TOPICS.map(topicTile).join('')}</div>
    </div>
    <div class="two">
      <button class="btn" type="button" data-act="test">📝 Probetest</button>
      <button class="btn" type="button" data-act="atlas">🧭 Atlas</button>
    </div>
  </section>`;
}

function tierLegend() {
  return TIER_ICON.slice(1).map((ic, i) => `<i class="lg" style="--tier:var(--t${i + 1})" title="${TIER[i + 1]}"></i>`).join('');
}
function stampsHTML(due, nNew) {
  const all = due.slice(0, 4).map(it => ({ l: lv(it) }));
  for (let k = all.length; k < 5 && k < all.length + nNew; k++) all.push({ l: 0 });
  const mid = (all.length - 1) / 2;
  return `<div class="stamps" aria-hidden="true">${all.map((x, i) => x.l
    ? `<span class="stamp" style="--i:${i - mid};--tier:var(--t${x.l})">${TIER_ICON[x.l]}</span>`
    : `<span class="stamp new" style="--i:${i - mid}">?</span>`).join('')}</div>`;
}
function topicTile(t) {
  const c = tierCounts(it => it.topic === t.id);
  const total = c.reduce((a, b) => a + b, 0);
  const learned = total - c[0];
  const seg = c.slice(1).map((n, i) => n ? `<i style="--tier:var(--t${i + 1});flex:${n}"></i>` : '').join('') + (c[0] ? `<i class="rest" style="flex:${c[0]}"></i>` : '');
  const gold = c[3] + c[4];
  return `<button class="tile" type="button" data-act="topic" data-t="${t.id}">
    <span class="tile-ic">${t.icon}</span>
    <b>${esc(t.title)}</b>
    <span class="tbar">${total ? seg : '<i class="rest" style="flex:1"></i>'}</span>
    <span class="tnum">${learned}/${total} gelernt${gold ? ` · ${gold} 🥇` : ''}</span>
  </button>`;
}

async function topicSheet(id) {
  const t = TOPIC[id];
  const seen = seenItems().filter(it => it.topic === id);
  const extra = id === 'eu' ? [{ label: `Länder auswählen (${chosenCount()})`, value: 'choose' }] : [];
  const v = await sheet(`<h2 class="sheet-title">${t.icon} ${esc(t.title)}</h2>
    <p>${seen.length ? `${seen.length} Aufgaben gelernt. Im Atlas kannst du alles nachschauen.` : 'Das kommt in den nächsten Missionen dran. Im Atlas kannst du schon vorschauen.'}</p>`,
    [{ label: 'Im Atlas ansehen', value: 'atlas', cls: 'go' },
      ...(seen.length ? [{ label: 'Nur dieses Thema üben', value: 'practice' }] : []), ...extra]);
  if (v === 'atlas') atlas(id);
  else if (v === 'practice') startSession('practice', buildPractice(seen));
  else if (v === 'choose') choose('home');
}

// ---------- Atlas ----------
let atlasTab = 'at', atlasCaps = false, atlasMap = null;
function atlas(tab) {
  scrollTo(0, 0);
  screen = 'atlas';
  stopFx();
  clearViews();
  atlasTab = tab || atlasTab;
  const t = TOPIC[atlasTab];
  const chips = TOPICS.map(x => `<button class="chipbtn ${x.id === atlasTab ? 'on' : ''}" type="button" data-act="atlasTab" data-t="${x.id}">${x.icon} ${esc(x.short || x.title)}</button>`).join('');
  let body;
  if (atlasTab === 'st') {
    body = `<div class="panel steck">${steckbriefHTML(ITEMS.filter(it => it.topic === 'st'), true)}</div>`;
  } else {
    const capToggle = atlasTab !== 'welt' ? `<div class="seg two-seg">
      <button type="button" class="${atlasCaps ? '' : 'on'}" data-act="atlasCaps" data-v="0">Namen</button>
      <button type="button" class="${atlasCaps ? 'on' : ''}" data-act="atlasCaps" data-v="1">Hauptstädte</button></div>` : '';
    body = `${capToggle}
      <div class="atlas-map" id="atlas-map"></div>
      <div class="panel info" id="atlas-info"><p class="fineprint">Tippe auf ${atlasTab === 'welt' ? 'einen Kontinent oder Ozean' : atlasTab === 'at' ? 'ein Bundesland' : 'ein Land'}. Mit zwei Fingern kannst du zoomen. Die Farbe zeigt deinen Stempel.</p></div>
      <div class="legend">${TIER.map((n, i) => `<span><i style="--tier:var(--t${i})"></i>${n}</span>`).join('')}</div>
      ${atlasTab === 'welt' ? `<div class="panel steck">${steckbriefHTML(ITEMS.filter(it => it.topic === 'welt' && it.kind !== 'loc'), true)}</div>` : ''}`;
  }
  app.innerHTML = `<section class="screen atlas">${topbar('Atlas')}<div class="chips">${chips}</div>${body}</section>`;
  if (atlasTab !== 'st') drawAtlas(t);
}

function drawAtlas(t) {
  const mv = new MapView($('#atlas-map'), t.map, { onTap: id => atlasInfo(t, id), autoHide: true });
  atlasMap = mv;
  const tierOf = id => {
    const it = (atlasCaps ? CAP : LOC)[t.map + ':' + id];
    if (!it || !active(it)) return null;
    return lv(it);
  };
  mv.setBase(id => {
    if (t.map === 'europe') {
      const it = LOC['europe:' + id];
      if (!it) return 'ctx';
      if (!chosen(it.ref)) return 'off';
    }
    const l = tierOf(id);
    return l ? 't' + l : '';
  });
  const ov = [];
  for (const id of Object.keys(t.map === 'world' ? { ...mv.m.r, ...mv.m.o } : mv.m.r)) {
    const it = LOC[t.map + ':' + id];
    if (!it) continue;
    const off = it.topic === 'eu' && !chosen(it.ref);
    const r = mv.m.r[id];
    const diag = r ? Math.hypot(r.b[2] - r.b[0], r.b[3] - r.b[1]) : 0;
    const prio = (off ? 0 : 1000) + (r ? diag : 500);
    if (atlasCaps) {
      if (!off) ov.push(...mv.cityLabel(id, it.ref.cap, '', { prio, diag }));
    } else {
      ov.push(...mv.regionLabel(id, shortOf(it.ref), (off ? 'dim ' : '') + (it.ocean ? 'sea-l' : ''), { prio, diag }));
    }
  }
  mv.setOverlay(ov);
}

function atlasInfo(t, id) {
  const box = $('#atlas-info');
  if (!box || !id) return;
  const it = LOC[t.map + ':' + id];
  atlasMap.unmarkAll('pick');
  if (!it) {
    const n = t.map === 'europe' ? GEO.context[id] : '';
    box.innerHTML = n ? `<p><b>${esc(n)}</b></p><p class="fineprint">Gehört nicht zu den Lernländern.</p>` : '';
    return;
  }
  atlasMap.mark(id, 'pick');
  const r = it.ref, capIt = CAP[t.map + ':' + id];
  const stamp = x => (x && S.it[x.id] ? `${TIER_ICON[lv(x)]} ${TIER[lv(x)]}` : 'noch nicht gelernt');
  const off = it.topic === 'eu' && !chosen(r);
  box.innerHTML = `
    <div class="info-head"><span class="info-flag">${r.flag || (it.ocean ? '🌊' : t.map === 'world' ? '🌍' : '📍')}</span><div><b class="info-name">${esc(fullName(r))}</b>
      ${capIt ? `<span class="info-cap">${capWord(it)}: <b>${esc(r.cap)}</b></span>` : ''}</div></div>
    ${r.tip ? `<p class="tip">💡 ${esc(r.tip)}</p>` : ''}
    ${capIt && r.capTip ? `<p class="tip">🏛️ ${esc(r.capTip)}</p>` : ''}
    <p class="detail-stats">${off ? 'Nicht ausgewählt (Einstellungen → Länder auswählen)' : `📍 Lage: ${stamp(it)}${capIt ? ` · 🏛️ ${capWord(it)}: ${stamp(capIt)}` : ''}`}</p>`;
}

function steckbriefHTML(items, withStamps) {
  return `<div class="steck-band" aria-hidden="true"></div><dl class="steck-list">${items.map(it => {
    const f = it.ref;
    return `<div class="steck-row"><dt>${esc(f.label)}</dt><dd>${esc(f.show)}${withStamps && S.it[it.id] ? ` <span class="mini-stamp" title="${TIER[lv(it)]}">${TIER_ICON[lv(it)]}</span>` : ''}</dd></div>`;
  }).join('')}</dl>`;
}

// ---------- Länder auswählen ----------
let chooseBack = 'home';
let chooseSel = new Set();
function choose(back) {
  scrollTo(0, 0);
  screen = 'choose';
  stopFx();
  clearViews();
  if (back) chooseBack = back;
  chooseSel = new Set(GEO.countries.filter(chosen).map(c => c.id));
  renderChoose();
}
function renderChoose() {
  const sel = chooseSel;
  app.innerHTML = `
    <section class="screen choose">
      ${topbar('Länder auswählen', 'chooseDone')}
      <p class="lead">Welche Länder habt ihr für die Wiederholung markiert? Tippe sie an – nur diese kommen in den Missionen.</p>
      <div class="two"><button class="btn" type="button" data-act="pickAll">Alle</button><button class="btn" type="button" data-act="pickNone">Keine</button></div>
      ${GEO.regions.map(r => `
        <div class="group-head">${esc(r.title)}</div>
        <div class="pick-grid">${GEO.countries.filter(c => c.region === r.id).map(c => `
          <button class="pickbtn ${sel.has(c.id) ? 'on' : ''}" type="button" data-act="pickCountry" data-c="${c.id}"><span>${c.flag}</span>${esc(shortOf(c))}</button>`).join('')}</div>`).join('')}
      <p class="fineprint center">Die Türkei liegt größtenteils in Asien und ist deshalb nur dabei, wenn du sie auswählst.</p>
      <button class="btn go big sticky-go" type="button" data-act="chooseDone">Fertig · ${sel.size} ${sel.size === 1 ? 'Land' : 'Länder'}</button>
    </section>`;
}
function pickCountry(b) {
  const id = b.dataset.c;
  if (chooseSel.has(id)) chooseSel.delete(id); else chooseSel.add(id);
  b.classList.toggle('on', chooseSel.has(id));
  const n = chooseSel.size;
  $('.sticky-go').textContent = `Fertig · ${n} ${n === 1 ? 'Land' : 'Länder'}`;
}
function chooseDone() {
  if (!chooseSel.size) { toast('Wähle mindestens ein Land aus.'); return; }
  S.settings.sel = GEO.countries.filter(c => chooseSel.has(c.id)).map(c => c.id);
  save();
  const n = chooseSel.size;
  toast(`${n} ${n === 1 ? 'Land' : 'Länder'} gespeichert ✓`);
  if (chooseBack === 'settings') settings(); else home();
}

// ---------- Probetest ----------
function testSetup() {
  scrollTo(0, 0);
  screen = 'test';
  stopFx();
  clearViews();
  const n = seenItems().filter(it => it.kind !== 'list').length;
  const unseen = unseenItems().length;
  let body;
  if (n < 8) {
    body = `<div class="panel"><p>Lerne zuerst ein paar Missionen – dann kannst du dich testen wie in der Schule.</p>
      <button class="btn go big" type="button" data-act="home">Zur Mission</button></div>`;
  } else {
    const sizes = [...new Set([15, 30].map(k => Math.min(k, n)))];
    body = `<div class="panel">
      <p class="lead dark">Wie bei der Wiederholung: vier Teile – Österreich, Steckbrief, Europa, Welt. Du schreibst die Namen selbst, ohne Tipps. Die Note gibt’s am Ende.</p>
      <p class="fineprint">Halbe Punkte für kleine Schreibfehler.${unseen ? ` Es kommt nur vor, was du schon gelernt hast (${n} Aufgaben).` : ''}</p>
      <div class="sizes">${sizes.map(k => `<button class="btn ${k === sizes[sizes.length - 1] ? 'go' : ''}" type="button" data-act="testGo" data-n="${k}">${k} Fragen</button>`).join('')}</div>
    </div>`;
  }
  app.innerHTML = `<section class="screen">${topbar('Probetest')}${body}</section>`;
}

function gradeOf(pct) {
  if (pct >= 90) return [1, 'Sehr gut'];
  if (pct >= 80) return [2, 'Gut'];
  if (pct >= 65) return [3, 'Befriedigend'];
  if (pct >= 50) return [4, 'Genügend'];
  return [5, 'Nicht genügend'];
}
const SECTION = { at: 'Österreich', st: 'Steckbrief', eu: 'Europa', welt: 'Welt' };
let lastMisses = [];

function testResult(s) {
  scrollTo(0, 0);
  screen = 'testresult';
  clearViews();
  const max = s.results.length;
  const pts = s.results.reduce((a, r) => a + r.pts, 0);
  const pct = max ? pts / max * 100 : 0;
  const [g, gname] = gradeOf(pct);
  const fmtPts = x => String(Math.round(x * 2) / 2).replace('.', ',');
  lastMisses = s.results.filter(r => r.pts < 1).map(r => r.id);
  const parts = ['at', 'st', 'eu', 'welt'].map(k => {
    const rs = s.results.filter(r => r.section === k);
    if (!rs.length) return '';
    const p = rs.reduce((a, r) => a + r.pts, 0);
    return `<div class="part"><span>${SECTION[k]}</span><span class="pbar"><i style="width:${Math.round(p / rs.length * 100)}%"></i></span><b>${fmtPts(p)}/${rs.length}</b></div>`;
  }).join('');
  app.innerHTML = `
  <section class="screen result">
    <h1 class="outline hero center">Probetest</h1>
    <div class="gstamp g${g}"><b>${g}</b><span>${gname}</span></div>
    <p class="score">${fmtPts(pts)} von ${max} Punkten · ${Math.round(pct)} %</p>
    <div class="panel parts">${parts}</div>
    <p class="fineprint center">Ungefähre Note – jede Lehrerin und jeder Lehrer bewertet ein bisschen anders.</p>
    <div class="panel list">
      ${s.results.map(r => {
        const it = IT[r.id];
        const mark = r.pts === 1 ? '✓' : r.pts > 0 ? '½' : '✗';
        const cls = r.pts === 1 ? 'good' : r.pts > 0 ? 'almost' : 'bad';
        return `<div class="rrow ${cls}"><span class="rmark">${mark}</span><span class="rq">${esc(r.q)}</span><span class="ra">${esc(r.answer)}${r.pts < 1 ? `<small>${r.input ? 'du: ' + esc(r.input) : 'leer gelassen'}</small>` : ''}</span></div>`;
      }).join('')}
    </div>
    ${lastMisses.length ? `<button class="btn go big" type="button" data-act="trainMisses">Fehler üben (${lastMisses.length})</button>` : ''}
    <button class="btn big" type="button" data-act="home">Fertig</button>
  </section>`;
  S.ui.lastTest = { date: today(), grade: g, pct: Math.round(pct) };
  save();
  if (g <= 2) confetti();
  sfx(g <= 3 ? 'level' : 'tap');
}

// ---------- Einstellungen ----------
function toggleHTML(key, title, help) {
  return `<label class="toggle">
    <span><b>${title}</b>${help ? `<small>${help}</small>` : ''}</span>
    <input type="checkbox" data-set="${key}" ${S.settings[key] ? 'checked' : ''}>
    <i aria-hidden="true"></i>
  </label>`;
}

function settings() {
  scrollTo(0, 0);
  screen = 'settings';
  stopFx();
  clearViews();
  const s = S.settings;
  app.innerHTML = `
  <section class="screen settings">
    ${topbar('Einstellungen')}
    <div class="panel form">
      <label class="field"><b>Name</b>
        <input id="set-name" type="text" maxlength="20" value="${esc(s.name)}" autocomplete="off" autocorrect="off" spellcheck="false"></label>
      <label class="field"><b>Testdatum</b>
        <span class="daterow"><input id="set-test" type="date" value="${esc(s.testDate)}">${s.testDate ? '<button class="link" type="button" data-act="clearTest">löschen</button>' : ''}</span>
        <small>Bis zwei Tage vor dem Test kommt alles Neue dran. Am Tag davor ist Generalprobe: Jede Aufgabe kommt noch einmal.</small></label>
      <div class="field"><b>Markierte Länder</b>
        <button class="btn" type="button" data-act="chooseFromSettings">${chosenCount()} ${chosenCount() === 1 ? 'Land' : 'Länder'} ausgewählt · ändern</button>
        <small>Nur diese Länder kommen bei „Länder Europas“ dran.</small></div>
      ${toggleHTML('sfx', 'Töne & Vibration', '')}
    </div>
    <button class="btn big" type="button" data-act="about">So funktioniert’s</button>
    <div class="panel form">
      <div class="field"><b>Fortschritt sichern</b>
        <small>Der Code enthält den ganzen Fortschritt. Damit kannst du alles wiederherstellen, z. B. auf einem neuen Handy.</small></div>
      <div class="two"><button class="btn" type="button" data-act="exportCode">Code kopieren</button><button class="btn" type="button" data-act="importCode">Code einfügen</button></div>
    </div>
    <button class="btn danger big" type="button" data-act="reset">Fortschritt löschen</button>
    <p class="fineprint center">Geo Legends · ${ITEMS.filter(active).length} Aufgaben · Karten: Natural Earth, Statistik Austria</p>
  </section>`;
  $('#set-name').addEventListener('change', e => { S.settings.name = e.target.value.trim().slice(0, 20); save(); });
  $('#set-test').addEventListener('change', e => {
    const v = e.target.value;
    if (v && daysBetween(today(), v) < 0) { toast('Das Datum liegt in der Vergangenheit.'); e.target.value = S.settings.testDate; return; }
    S.settings.testDate = v;
    save();
    settings();
    if (v) toast(`Test ${inDays(daysBetween(today(), v))} – alles klar!`);
  });
  app.querySelectorAll('[data-set]').forEach(el => el.addEventListener('change', () => {
    S.settings[el.dataset.set] = el.checked;
    save();
    if (el.checked && el.dataset.set === 'sfx') { sfx('ok'); haptic(); }
  }));
}

function about() {
  scrollTo(0, 0);
  screen = 'about';
  stopFx();
  clearViews();
  const kid = S.settings.name ? esc(S.settings.name) : 'dein Kind';
  app.innerHTML = `
  <section class="screen about">
    ${topbar('So funktioniert’s', 'settings')}
    <div class="panel prose">
      <h2>Kurz gesagt</h2>
      <ul>
        <li><b>Jeden Tag eine Mission</b>, aufgeteilt in Runden. Zwischen den Runden darfst du Pause machen.</li>
        <li><b>Stempel:</b> Bronze, wenn du etwas kennenlernst. Danach steigt der Stempel höchstens einmal pro Tag – Silber, Gold, Diamant.</li>
        <li><b>Fehler sind okay.</b> Die Aufgabe kommt in derselben Runde noch einmal und morgen wieder.</li>
      </ul>
    </div>
    <div class="panel prose">
      <h2>Für Eltern: die Methode dahinter</h2>
      <p><b>Abrufen statt Anschauen.</b> Jede Aufgabe verlangt, dass ${kid} die Antwort selbst aus dem Gedächtnis holt – auf der Karte antippen, auswählen oder schreiben. Sich selbst abzufragen bringt deutlich mehr als Wiederlesen (Testing-Effekt).</p>
      <p><b>Lernen am Ort.</b> Länder, Bundesländer und Ozeane werden immer auf der Karte gelernt. Wer weiß, wo etwas liegt, behält auch den Namen besser – und genau so kommt es im Test (stumme Karte).</p>
      <p><b>Vom Erkennen zum Schreiben.</b> Neues wird zuerst angetippt oder ausgewählt, später ohne Hilfe geschrieben. Rechtschreibung zählt: kleine Fehler gelten als „fast“ und werden einmal richtig abgeschrieben.</p>
      <p><b>Verteilt bis zum Testdatum.</b> Der Stoff wird so aufgeteilt, dass zwei Tage vor dem Test alles einmal dran war. Jede Aufgabe kommt danach täglich wieder, bis sie sitzt. Am Tag vor dem Test ist Generalprobe: Alles kommt noch einmal.</p>
      <p><b>Gemischt üben.</b> Wiederholungen aus allen vier Themen wechseln sich ab. Das ist anstrengender als Blöcke, wirkt aber nachhaltiger (Interleaving). Ähnliche Länder wie Slowakei und Slowenien kommen bewusst als Auswahl nebeneinander.</p>
      <p><b>Probetest.</b> Vier Teile wie im echten Test, Note nach dem österreichischen Schulnotensystem, danach gezieltes Üben der Fehler.</p>
      <p><b>Steckbrief.</b> Die Zahlen stammen aus aktuellen Quellen. Wenn im Schulbuch (S. 10) etwas anders steht, gilt das Buch – dann kann der Steckbrief in data.js angepasst werden.</p>
    </div>
  </section>`;
}

// ---------- Zusammenfassung ----------
function summary(s, extra) {
  scrollTo(0, 0);
  screen = 'summary';
  clearViews();
  $('#toast').classList.remove('show');
  const L = levelInfo(S.stats.xp);
  const streak = S.stats.streak;
  const more = s.mode === 'mission' && (dueItems().length || newQuota() > 0);
  const title = s.mode === 'mission' ? (more ? 'Runde geschafft!' : 'Mission geschafft!') : 'Runde geschafft!';
  const parade = (list, label) => list.length ? `
    <h2 class="sub">${label}</h2>
    <div class="parade">${list.map((p, i) => `<div class="pstamp" style="--tier:var(--t${p.lv});--d:${i * 60}ms"><span>${TIER_ICON[p.lv]}</span><b>${esc(itemLabel(IT[p.id]))}</b></div>`).join('')}</div>` : '';
  app.innerHTML = `
  <section class="screen summary">
    <h1 class="outline hero center">${title}</h1>
    ${extra.streakUp && streak ? `<p class="streak-up">🔥 ${streak === 1 ? 'Tag 1 – der Anfang!' : `${streak} Tage in Folge!`}</p>` : ''}
    <div class="statrow">
      <div class="stat"><b>${s.right}/${s.first}</b><span>richtig</span></div>
      <div class="stat"><b>+${s.xp}</b><span>XP</span></div>
      ${!s.ups.length && s.learned.length
        ? `<div class="stat"><b>${s.learned.length}</b><span>Neu</span></div>`
        : `<div class="stat"><b>${s.ups.length}</b><span>Stempel ▲</span></div>`}
    </div>
    ${parade(s.ups.map(u => ({ id: u.id, lv: u.to })), 'Stempel aufgewertet')}
    ${parade(s.learned.slice(0, 9).map(id => ({ id, lv: 1 })), 'Neu kennengelernt')}
    ${s.learned.length > 9 ? `<p class="fineprint center more">… und ${s.learned.length - 9} weitere</p>` : ''}
    <div class="panel lvlbox">
      <div class="lvlrow"><b>Level ${L.lvl}</b><span>${L.title}</span>${L.lvl > s.lvlBefore ? '<em>Level up!</em>' : ''}</div>
      <div class="xpbar"><i style="width:${Math.round(L.into / L.need * 100)}%"></i></div>
      <small>noch ${L.need - L.into} XP bis Level ${L.lvl + 1}</small>
    </div>
    ${more ? `<button class="btn go big" type="button" data-act="start">Nächste Runde</button><button class="btn big" type="button" data-act="home">Pause</button>`
      : `<button class="btn go big" type="button" data-act="home">Fertig</button>`}
  </section>`;
  confetti();
  sfx('level');
}

// ================================================================
// Abfrage-Runde
// ================================================================
let SES = null;
let E = {};

function startSession(mode, queue) {
  if (!queue.length) { toast('Gerade gibt es nichts zu üben.'); return home(); }
  refreshStreak();
  SES = {
    mode, queue, total: queue.length, cur: null, phase: '', done: 0,
    xp: 0, combo: 0, first: 0, right: 0, ups: [], learned: [], scored: new Set(),
    results: [], hintUsed: false, emptyOnce: false, list: null, lvlBefore: levelInfo(S.stats.xp).lvl
  };
  sessionShell();
  next();
}
function startMission() {
  const quota = newQuota();
  startSession('mission', buildRound(newForRound(quota), dueItems()));
}

function sessionShell() {
  screen = 'session';
  stopFx();
  clearViews();
  document.body.classList.add('in-session');
  app.innerHTML = `
  <section class="session">
    <header class="ses-top">
      <button class="icon-btn" type="button" data-act="quit" aria-label="Runde beenden">✕</button>
      <div class="bar"><i id="ses-bar"></i></div>
      <div class="combo" id="ses-combo" aria-live="polite"></div>
    </header>
    <div class="ses-q" id="ses-q" aria-live="polite"></div>
    <div class="ses-stage" id="ses-stage"></div>
    <div class="ses-fb" id="ses-fb" hidden></div>
    <div class="choices" id="ses-choices" hidden></div>
    <form class="answer" id="ses-form" autocomplete="off" novalidate hidden>
      <input id="ses-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="go" aria-label="Deine Antwort">
      <button class="btn go" id="ses-main" type="submit">Prüfen</button>
    </form>
    <button class="btn go big" id="ses-next" type="button" data-act="next" hidden>Weiter</button>
  </section>`;
  E = {
    q: $('#ses-q'), stage: $('#ses-stage'), fb: $('#ses-fb'), choices: $('#ses-choices'),
    form: $('#ses-form'), input: $('#ses-input'), main: $('#ses-main'), next: $('#ses-next'),
    bar: $('#ses-bar'), combo: $('#ses-combo'), map: null, mapId: null
  };
  E.form.addEventListener('submit', e => { e.preventDefault(); onSubmit(); });
  // Während der Rückmeldung bleibt die Tastatur offen, aber Tippen wird ignoriert (Enter = Weiter)
  E.input.addEventListener('beforeinput', e => { if (SES && SES.phase === 'feedback') e.preventDefault(); });
  syncViewport();
}

function bar() {
  const total = SES.done + SES.queue.length + (SES.cur ? 1 : 0);
  E.bar.style.width = (total ? SES.done / total * 100 : 100) + '%';
  E.combo.innerHTML = SES.combo >= 2 ? `🔥${SES.combo}` : '';
}

// kind: type | choices | next | none
function mode(kind, label) {
  const typing = kind === 'type';
  E.form.hidden = !typing;
  E.choices.hidden = kind !== 'choices';
  E.next.hidden = kind !== 'next';
  if (label) E.next.textContent = label;
  if (typing) focusInput(); else E.input.blur();
}
function focusInput() {
  try { E.input.focus({ preventScroll: true }); } catch (e) { E.input.focus(); }
}

function useMap(id) {
  if (E.map && E.mapId === id && E.stage.contains(E.map.box)) return E.map;
  if (E.map) E.map.destroy();
  E.stage.className = 'ses-stage map-mode';
  E.map = new MapView(E.stage, id, { onTap: onMapTap, zoom: id === 'europe' });
  E.mapId = id;
  return E.map;
}
function useCard(html, cls = '') {
  if (E.map) { E.map.destroy(); E.map = null; E.mapId = null; }
  E.stage.className = 'ses-stage card-mode';
  E.stage.innerHTML = `<article class="qcard ${cls}">${html}</article>`;
  restartAnim(E.stage.firstElementChild, 'pop');
}

function next() {
  if (!SES) return;
  if (SES.cur) SES.done++;
  if (!SES.queue.length) { SES.cur = null; return finish(); }
  SES.cur = SES.queue.shift();
  showTask();
}

function stepChip(t, it) {
  if (SES.mode === 'test') return `${SECTION[t.section]} · Frage ${SES.done + 1} von ${SES.total}`;
  if (t.learn || !S.it[it.id]) return '✦ Neu';
  if (t.step === 'learn2') return '✦ Neu · nochmal';
  if (t.step === 'retry') return 'Nochmal';
  if (t.step === 'practice') return 'Üben';
  return `${TIER_ICON[lv(it)]} ${TIER[lv(it)]}`;
}

function showTask() {
  const t = SES.cur;
  E.fb.hidden = true;
  E.fb.innerHTML = '';
  E.choices.innerHTML = '';
  E.input.value = '';
  E.input.className = '';
  E.input.inputMode = 'text';
  E.main.textContent = SES.mode === 'test' ? 'Weiter' : 'Prüfen';
  SES.hintUsed = false;
  SES.emptyOnce = false;
  SES.list = null;
  if (t.type === 'pack') return showPack(t);
  const it = IT[t.id];
  if (!t.fmt) t.fmt = fmtFor(it, t.step);
  const f = t.fmt, r = it.ref;
  SES.phase = 'answer';
  bar();

  const chip = stepChip(t, it);
  let qtext = '';
  if (isMapFmt(f)) {
    const what = it.ocean ? 'r Ozean' : it.map === 'world' ? 'r Kontinent' : it.map === 'austria' ? 's Bundesland' : 's Land';
    if (f === 'find') qtext = `Tippe auf <b>${esc(shortOf(r))}</b>`;
    else if (f === 'nameMC' || f === 'nameType') qtext = `Welche${what} ist markiert?`;
    else if (f === 'capMC' || f === 'capType') qtext = `${capWord(it)} ${esc(vonOf(r).replace(shortOf(r), ''))}<b>${esc(shortOf(r))}</b>?`;
    else qtext = 'Welche Landeshauptstadt ist markiert?';
    E.q.innerHTML = `<div class="qline"><span class="chip">${esc(chip)}</span><span class="tools" id="ses-tools"></span></div><h2 class="qtext">${qtext}</h2>`;
    setupMap(it, f);
  } else {
    E.q.innerHTML = `<div class="qline"><span class="chip">${esc(chip)}</span><span class="tools" id="ses-tools"></span></div>`;
    let card;
    if (f === 'revMC' || f === 'revType') {
      card = `<div class="qkicker">🏛️ ${capWord(it)}</div><div class="qbig">${esc(r.cap)}</div><div class="qsub">ist die ${capWord(it)} von …</div>`;
    } else if (f === 'list') {
      card = '';
    } else {
      card = `<div class="qkicker">${it.topic === 'st' ? 'Steckbrief Österreich' : 'Kontinente & Ozeane'}</div><div class="qmid">${esc(r.q)}</div>`;
    }
    useCard(card, it.topic === 'st' ? 'steck-card' : '');
    if (f === 'list') startList(it);
  }

  const tools = $('#ses-tools');
  if (SES.mode !== 'test') {
    if (f === 'list') tools.innerHTML = `<button class="tool keepfocus" type="button" data-act="listDone">Auflösen</button>`;
    else if (isTyped(f)) tools.innerHTML = `<button class="tool keepfocus" type="button" data-act="hint">💡 Tipp</button><button class="tool keepfocus" type="button" data-act="idk">Weiß nicht</button>`;
    else if (f === 'find') tools.innerHTML = `<button class="tool" type="button" data-act="idk">Weiß nicht</button>`;
  }

  if (isMC(f)) {
    E.choices.innerHTML = optionsFor(it, f).map(o => `<button class="btn choice" type="button" data-act="choice" data-ok="${o.ok ? 1 : 0}">${esc(o.text)}</button>`).join('');
    E.choices.classList.toggle('long', optionsLong());
    mode('choices');
  } else if (isTyped(f)) {
    E.input.placeholder = f === 'factNum' ? 'Zahl …' : f === 'list' ? 'Einen Namen …' : 'Antwort schreiben …';
    if (f === 'factNum') E.input.inputMode = 'numeric';
    E.main.textContent = SES.mode === 'test' ? 'Weiter' : f === 'list' ? 'Dazu' : 'Prüfen';
    mode('type');
  } else {
    mode('none');
  }
}
function optionsLong() { return [...E.choices.children].some(b => b.textContent.length > 16); }

// Karte für die Aufgabe vorbereiten
function setupMap(it, f) {
  const mv = useMap(it.map);
  const rid = it.ref.id;
  mv.setBase(baseFor(it.map));
  mv.setOverlay([]);
  const eu = it.map === 'europe';
  if (f === 'find') {
    if (eu) mv.fitAll();
    else mv.fitAll();
  } else if (f === 'nameMC' || f === 'nameType') {
    mv.mark(rid, 'hl');
    if (eu) {
      const t = mv.frameIds([rid], euFrame(mv, rid));
      // Winzige Länder (Liechtenstein, Vatikan …) bekommen einen Ring, damit man sie sieht
      const r = mv.m.r[rid];
      if (r && Math.hypot(r.b[2] - r.b[0], r.b[3] - r.b[1]) / mv.uAt(t.z) < 14) mv.setOverlay([{ x: r.p[0], y: r.p[1], halo: true, cls: 'ring' }]);
    } else mv.fitAll();
  } else if (f === 'capMC' || f === 'capType') {
    mv.mark(rid, 'soft');
    const c = mv.cityPoint(rid);
    if (c) mv.setOverlay([{ x: c[0], y: c[1], dot: true, halo: true, text: '?', cls: 'q' }]);
    if (eu) mv.frameIds([rid], euFrame(mv, rid)); else mv.fitAll();
  } else {   // dot
    const c = mv.cityPoint(rid);
    if (c) mv.setOverlay([{ x: c[0], y: c[1], dot: true, halo: true, text: '?', cls: 'q' }]);
    mv.fitAll();
  }
}
// Ausschnitt für ein Land: genug Umgebung zum Orientieren, kleine Länder näher heran
function euFrame(mv, id) {
  const r = mv.m.r[id];
  const d = r ? Math.hypot(r.b[2] - r.b[0], r.b[3] - r.b[1]) : 100;
  return { pad: 3, min: d < 30 ? 170 : 270 };
}
function baseFor(map) {
  if (map !== 'europe') return null;
  return id => {
    const it = LOC['europe:' + id];
    if (!it) return 'ctx';
    return chosen(it.ref) ? '' : 'off';
  };
}

// ---------- Neues Paket: erst anschauen, dann testen ----------
function showPack(t) {
  const P = PACK[t.pack];
  SES.phase = 'pack';
  bar();
  const items = t.ids.map(id => IT[id]);
  E.q.innerHTML = `<div class="qline"><span class="chip">✦ Neu · ${esc(TOPIC[P.topic].title)}</span></div><h2 class="qtext">${esc(P.title)}</h2>`;
  if (P.map) {
    const mv = useMap(P.map);
    mv.setBase(baseFor(P.map));
    const ov = [];
    for (const it of items) {
      mv.mark(it.ref.id, 'soft');
      if (P.caps) {
        ov.push(...mv.cityLabel(it.ref.id, it.ref.cap));
      } else {
        ov.push(...mv.regionLabel(it.ref.id, shortOf(it.ref), it.ocean ? 'sea-l' : ''));
      }
    }
    let z = 1;
    if (P.map === 'europe') z = mv.frameIds(items.map(it => it.ref.id), { pad: 1.3, min: 260 }).z; else mv.fitAll();
    mv.setOverlay(declutter(ov, mv.uAt(z)));
    SES.packItems = items;
    const pairs = P.caps ? `<div class="pairs">${items.map(it => `<span>${it.ref.flag || '📍'} ${esc(shortOf(it.ref))} → <b>${esc(it.ref.cap)}</b></span>`).join('')}</div>` : '';
    E.fb.innerHTML = `<div class="fb info"><div class="fb-body"><p class="fineprint" id="pack-tip">${esc(P.hint || '')}</p>${pairs}</div></div>`;
    E.fb.hidden = false;
  } else {
    useCard(`<div class="qkicker">${P.topic === 'st' ? 'Lies dir das genau durch' : 'Merk dir diese Rekorde'}</div>${steckbriefHTML(items, false)}`, 'steck-card');
  }
  mode('next', 'Los – teste mich!');
}

// Antippen auf der Karte
function onMapTap(id) {
  if (!SES) return;
  if (SES.phase === 'pack') return packTap(id);
  const t = SES.cur;
  if (!t || SES.phase !== 'answer' || t.fmt !== 'find') return;
  if (!id) { toast(E.mapId === 'austria' ? 'Tippe auf ein Bundesland in Österreich.' : 'Das ist Wasser – tippe auf die Karte.'); return; }
  const it = IT[t.id];
  resolve(id === it.ref.id ? 'ok' : 'wrong', { tapped: id });
}
function packTap(id) {
  const items = SES.packItems || [];
  const it = items.find(x => x.ref.id === id);
  const tip = $('#pack-tip');
  if (!tip) return;
  E.map.unmarkAll('pick');
  if (!it) { tip.textContent = id ? `${regionTitle(E.mapId, id) || 'Das'} gehört nicht zu diesem Paket.` : (PACK[SES.cur.pack].hint || ''); return; }
  E.map.mark(id, 'pick');
  const r = it.ref, P = PACK[SES.cur.pack];
  tip.innerHTML = P.caps
    ? `<b>${esc(r.cap)}</b> – ${capWord(it)} ${esc(vonOf(r))}${r.capTip ? `<br>💡 ${esc(r.capTip)}` : ''}`
    : `<b>${r.flag ? r.flag + ' ' : ''}${esc(fullName(r))}</b>${r.tip ? `<br>💡 ${esc(r.tip)}` : ''}`;
  sfx('tap');
}

function onNext() {
  if (!SES) return;
  if (SES.phase === 'pack' || SES.phase === 'feedback') next();
}

function onSubmit() {
  if (!SES || !SES.cur) return;
  const t = SES.cur, val = E.input.value;
  if (SES.phase === 'feedback') return next();
  if (SES.phase === 'retype') return retype(val);
  if (SES.phase !== 'answer') return;
  if (t.fmt === 'list') return listAdd(val);
  if (SES.mode === 'test') return testAnswer(val);
  if (!norm(val)) { shake(E.input); focusInput(); return; }
  const it = IT[t.id];
  const r = check(it, val, modeOf(t.fmt));
  let res = r.res;
  if (SES.hintUsed && res === 'ok') res = 'hint';
  resolve(res, { r, input: val });
}

function onChoice(btn) {
  if (!SES || SES.phase !== 'answer') return;
  const t = SES.cur, it = IT[t.id];
  const ok = btn.dataset.ok === '1';
  E.choices.querySelectorAll('.choice').forEach(b => {
    b.disabled = true;
    if (b.dataset.ok === '1' && SES.mode !== 'test') b.classList.add('right');
  });
  if (SES.mode === 'test') { btn.classList.add('picked'); return testAnswer(btn.textContent, ok); }
  if (!ok) { btn.classList.add('wrong'); shake(btn); }
  const text = btn.textContent;
  const confused = ok ? null : confusedWith(it, norm(text), modeOf(t.fmt));
  resolve(ok ? 'ok' : 'wrong', { input: ok ? '' : text, r: { confused }, mc: true });
}

function push(task, offset) { SES.queue.splice(Math.min(offset, SES.queue.length), 0, task); }

function addXP(n) {
  if (!n) return;
  S.stats.xp += n;
  if (SES) SES.xp += n;
}

function resolve(res, info) {
  const t = SES.cur, it = IT[t.id], f = t.fmt;
  const good = res === 'ok';
  if (!S.it[it.id]) { collect(it.id); SES.learned.push(it.id); }
  const st = S.it[it.id];

  SES.first++;
  S.stats.answers++;
  if (good) { SES.right++; S.stats.right++; st.ok++; }
  else if (res !== 'hint') st.bad++;

  let sched = null;
  if (t.scored && !SES.scored.has(it.id)) {
    SES.scored.add(it.id);
    sched = review(it.id, res);
    if (sched.to > sched.from) SES.ups.push({ id: it.id, from: sched.from, to: sched.to });
  }
  if (t.step === 'practice' && !good) {   // Fehler beim freien Üben: spätestens morgen wieder dran
    const tm = addDays(today(), 1);
    if (st.due > tm) st.due = tm;
  }

  let xp = 0;
  if (good) {
    xp = t.learn ? XP.learn : f === 'list' ? XP.list : f === 'find' ? XP.find : isMC(f) ? XP.mc : XP.type;
    SES.combo++;
    if (SES.combo % 5 === 0) { xp += XP.combo; toast(`Combo ×${SES.combo}! +${XP.combo} XP`); }
  } else {
    xp = res === 'hint' ? XP.hint : res === 'typo' ? XP.typo : 0;
    SES.combo = 0;
  }
  if (sched && sched.to > sched.from) xp += XP.levelUp;
  addXP(xp);

  // In dieser Runde noch einmal: Neues ein zweites Mal (schwerer), Fehler bis zu zweimal
  if (t.learn && good && it.kind !== 'list') push({ id: it.id, step: 'learn2' }, 6);
  else if (!good && (t.re || 0) < 2) push({ id: it.id, step: 'retry', fmt: f, learn: t.learn, re: (t.re || 0) + 1 }, res === 'hint' ? 5 : 3);

  save();
  feedback(res, info, sched, xp);
}

function answerLine(it) {
  const r = it.ref;
  if (it.kind === 'loc') {
    const cap = r.cap ? ` <span class="sep">·</span> ${capWord(it)} ${esc(r.cap)}` : '';
    return `${r.flag ? r.flag + ' ' : ''}<b>${esc(fullName(r))}</b>${cap}`;
  }
  if (it.kind === 'cap') return `🏛️ <b>${esc(r.cap)}</b> <span class="sep">·</span> ${capWord(it)} ${esc(vonOf(r))} ${r.flag || ''}`;
  return `${esc(r.label)}: <b>${esc(r.show)}</b>`;
}
function targetText(it, f) {
  if (modeOf(f) === 'cap') return it.ref.cap;
  if (modeOf(f) === 'fact') return it.ref.a[0];
  return shortOf(it.ref);
}

function feedback(res, info, sched, xp) {
  const t = SES.cur, it = IT[t.id], f = t.fmt, r = info.r || {};
  const good = res === 'ok' || res === 'hint';
  const typed = isTyped(f);
  const needRetype = typed && f !== 'list' && (res === 'typo' || res === 'wrong');
  SES.phase = needRetype ? 'retype' : 'feedback';

  if (isMapFmt(f)) mapFeedback(it, f, res, info);

  const titles = {
    ok: t.learn ? pick(['Super, gemerkt!', 'Richtig!', 'Genau!']) : pick(['Richtig!', 'Stark!', 'Genau!', 'Super!']),
    hint: 'Richtig – mit Tipp',
    typo: r.accent ? 'Fast! Achte auf die Pünktchen' : 'Fast! Achte auf die Schreibweise',
    wrong: info.idk ? 'Kein Problem – merk es dir' : r.confused ? 'Verwechselt!' : 'Leider falsch'
  };
  if (f === 'list') {
    const miss = it.ref.items.length - (SES.list ? SES.list.order.length : 0);
    titles.ok = 'Alle gefunden!';
    titles.typo = 'Alle gefunden – fast richtig geschrieben';
    titles.wrong = miss === it.ref.items.length ? 'Kein Problem – merk sie dir' : `${miss} ${miss === 1 ? 'fehlt' : 'fehlen'} noch`;
  }
  const cls = good ? 'good' : res === 'typo' ? 'almost' : 'bad';
  let body = '';
  if (f === 'list') body += listSolution(it);
  else body += `<div class="fb-ans">${answerLine(it)}</div>`;
  const typedVal = (info.input || '').trim();
  if (res === 'typo' && r.near && typed) body += `<div class="yours">Du: <s>${esc(typedVal)}</s> · richtig: <span class="fix">${diffMark(typedVal, r.near)}</span></div>`;
  else if (res === 'wrong' && typedVal && !info.idk && typed) body += `<div class="yours">Du: <s>${esc(typedVal)}</s></div>`;
  if (r.note) body += `<p class="note">${esc(r.note)}</p>`;
  if (r.confused) body += `<p class="note">${confusedNote(r.confused)}</p>`;
  if (info.tapped && info.tapped !== it.ref.id && !r.confused) {
    const n = regionTitle(it.map, info.tapped);
    if (n) body += `<p class="note">Du hast auf <b>${esc(n)}</b> getippt.</p>`;
  }
  const tip = modeOf(f) === 'cap' ? (it.ref.capTip || '') : (it.ref.tip || '');
  if (tip && (!good || t.learn || res === 'hint')) body += `<p class="tip">💡 ${esc(tip)}</p>`;
  if (sched) {
    if (sched.to > sched.from) body += `<p class="sched up">${TIER_ICON[sched.to]} ${TIER[sched.to]}-Stempel!</p>`;
    else if (sched.to < sched.from) body += `<p class="sched down">▼ Zurück auf ${TIER[sched.to]} – kommt morgen wieder.</p>`;
    else if (!good || res === 'hint') body += `<p class="sched">Bleibt ${TIER[sched.to]} – kommt morgen wieder.</p>`;
  }
  if (needRetype) body += `<p class="retype">Schreib es einmal richtig ab:</p>`;

  const up = sched && sched.to > sched.from;
  E.fb.innerHTML = `<div class="fb ${cls}"><div class="fb-band"><span>${titles[res]}</span><span>${xp ? '+' + xp + ' XP' : ''}</span></div>
    ${up ? `<div class="lvup" style="--tier:var(--t${sched.to})">${TIER_ICON[sched.to]}</div>` : ''}<div class="fb-body">${body}</div></div>`;
  E.fb.hidden = false;
  E.fb.scrollTop = 0;
  restartAnim(E.fb.firstElementChild, good ? 'pop' : 'nudge');
  const tools = $('#ses-tools');
  if (tools) tools.innerHTML = '';
  bar();

  if (good) sfx('ok'); else sfx('bad');
  haptic();
  if (up) setTimeout(() => sfx('level'), 260);

  if (typed && f !== 'list') {
    E.input.className = needRetype ? 'retype' : cls;
    if (needRetype) {
      E.input.value = '';
      E.input.placeholder = targetText(it, f);
      E.main.textContent = 'Prüfen';
    } else {
      E.main.textContent = 'Weiter';
    }
    focusInput();
  } else {
    mode('next', 'Weiter');
  }
}

function confusedNote(o) {
  const r = o.ref;
  if (o.kind === 'cap') return `${esc(r.cap)} ist die ${capWord(o)} ${esc(vonOf(r))}.`;
  if (o.map === 'europe' && r.cap) return `${r.flag ? r.flag + ' ' : ''}${esc(shortOf(r))} liegt woanders – schau auf die Karte. Seine Hauptstadt ist ${esc(r.cap)}.`;
  if (o.map === 'austria') return `${esc(r.name)} liegt woanders – schau auf die Karte.`;
  return `${esc(fullName(r))} liegt woanders – schau auf die Karte.`;
}

function mapFeedback(it, f, res, info) {
  const mv = E.map;
  if (!mv) return;
  const rid = it.ref.id, good = res === 'ok' || res === 'hint';
  const cls = good ? 'good' : res === 'typo' ? 'almost' : 'reveal';
  const ov = [];
  if (f === 'find' || f === 'nameMC' || f === 'nameType') {
    mv.unmarkAll('hl');
    mv.mark(rid, cls);
    const r = mv.m.r[rid];
    if (r && it.map === 'europe' && Math.hypot(r.b[2] - r.b[0], r.b[3] - r.b[1]) < 30) ov.push({ x: r.p[0], y: r.p[1], halo: true, cls: 'ring' });
    ov.push(...mv.regionLabel(rid, shortOf(it.ref), 'big ' + (it.ocean ? 'sea-l' : '')));
    const other = info.tapped && info.tapped !== rid ? info.tapped
      : (info.r && info.r.confused && info.r.confused.map === it.map && info.r.confused.kind === 'loc' ? info.r.confused.ref.id : null);
    if (other) {
      mv.mark(other, 'bad');
      const n = regionTitle(it.map, other);
      if (n) ov.push(...mv.regionLabel(other, n, 'bad-l'));
    }
    let z = mv.cam.z;
    if (it.map === 'europe') z = mv.frameIds(other ? [rid, other] : [rid], other ? { pad: 1.6, min: 200 } : euFrame(mv, rid)).z;
    mv.setOverlay(declutter(ov, mv.uAt(z)));
  } else {
    const conf = info.r && info.r.confused && info.r.confused.kind === 'cap' && info.r.confused.map === it.map ? info.r.confused : null;
    ov.push(...mv.cityLabel(rid, it.ref.cap, 'big ' + (good ? 'good' : res === 'typo' ? 'almost' : ''), { halo: true }));
    if (conf) ov.push(...mv.cityLabel(conf.ref.id, conf.ref.cap, 'bad-l'));
    if (f === 'dotMC' || f === 'dotType') mv.mark(rid, 'soft');
    let z = mv.cam.z;
    if (conf && it.map === 'europe') z = mv.frameIds([rid, conf.ref.id], { pad: 1.5 }).z;
    mv.setOverlay(declutter(ov, mv.uAt(z)));
  }
}

function retype(val) {
  const t = SES.cur, it = IT[t.id];
  const r = check(it, val, modeOf(t.fmt));
  if (r.res === 'ok') { sfx('tap'); return next(); }
  shake(E.input);
  focusInput();
}

// ---------- Aufzählen ----------
function startList(it) {
  SES.list = { found: new Array(it.ref.items.length).fill(null), order: [], tries: 0 };
  renderList(it);
}
function renderList(it) {
  const L = SES.list, items = it.ref.items;
  const card = E.stage.querySelector('.qcard');
  const filled = L.order.map(i => `<span class="slot ${L.found[i].typo ? 'almost' : 'ok'}">${esc(items[i][0])}</span>`);
  const empty = Array.from({ length: items.length - L.order.length }, (_, k) => `<span class="slot empty">${L.order.length + k + 1}</span>`);
  card.innerHTML = `<div class="qkicker">${it.topic === 'st' ? 'Steckbrief Österreich' : 'Kontinente & Ozeane'}</div>
    <div class="qmid">${esc(it.ref.q)}</div>
    <div class="slots">${filled.join('')}${empty.join('')}</div>
    <p class="qsub">${L.order.length} von ${items.length} gefunden</p>`;
}
function listAdd(val) {
  const it = IT[SES.cur.id], L = SES.list, items = it.ref.items;
  const n = norm(val);
  if (!n) { shake(E.input); focusInput(); return; }
  const match = (strict) => items.findIndex((alts, i) => {
    const acc = alts.map(norm);
    if (strict) return acc.includes(n) || acc.some(a => aeForm(a) === aeForm(n));
    return acc.some(a => loose(a) === loose(n) || (dist(loose(n), loose(a)) === 1 && loose(a).length >= 5));
  });
  let i = match(true), typo = false;
  if (i < 0) { i = match(false); typo = i > -1; }
  if (i < 0) {
    L.tries++;
    shake(E.input);
    sfx('bad');
    toast('Das gehört nicht dazu – probier ein anderes.');
    focusInput();
    return;
  }
  E.input.value = '';
  if (L.found[i]) { toast(`${items[i][0]} hast du schon!`); focusInput(); return; }
  L.found[i] = { typo };
  L.order.push(i);
  sfx('tap');
  if (typo) toast(`Fast: ${items[i][0]}`);
  renderList(it);
  if (L.order.length === items.length) return finishList();
  focusInput();
}
function finishList() {
  if (!SES || SES.phase !== 'answer' || !SES.list) return;
  const L = SES.list;
  const all = L.found.every(Boolean), typo = L.found.some(x => x && x.typo);
  resolve(all ? (typo ? 'typo' : 'ok') : 'wrong', { idk: !L.order.length });
}
function listSolution(it) {
  const L = SES.list || { found: [] };
  return `<div class="slots sol">${it.ref.items.map((alts, i) => {
    const f = L.found[i];
    return `<span class="slot ${f ? (f.typo ? 'almost' : 'ok') : 'miss'}">${esc(alts[0])}</span>`;
  }).join('')}</div>`;
}

// ---------- Probetest ----------
function testAnswer(val, mcOk) {
  const t = SES.cur, it = IT[t.id], f = t.fmt;
  let res, pts;
  if (mcOk !== undefined) { res = mcOk ? 'ok' : 'wrong'; pts = mcOk ? 1 : 0; }
  else {
    if (!norm(val) && !SES.emptyOnce) {
      SES.emptyOnce = true;
      shake(E.input);
      toast('Weißt du es nicht? Nochmal „Weiter“ lässt es leer.');
      focusInput();
      return;
    }
    const r = check(it, val, modeOf(f));
    res = r.res;
    pts = res === 'ok' ? 1 : res === 'typo' ? 0.5 : 0;
  }
  const q = f === 'nameType' ? `Karte: ${it.map === 'austria' ? 'Bundesland' : it.map === 'europe' ? 'Land' : it.ocean ? 'Ozean' : 'Kontinent'}`
    : f === 'capType' ? `${capWord(it)} ${vonOf(it.ref)}`
    : f === 'dotType' ? 'Karte: Landeshauptstadt'
    : it.ref.label;
  const answer = modeOf(f) === 'cap' ? it.ref.cap : modeOf(f) === 'fact' ? it.ref.show : fullName(it.ref);
  SES.results.push({ id: it.id, input: String(val || '').trim(), res, pts, section: t.section, q, answer });
  if (!S.it[it.id]) collect(it.id);
  const st = S.it[it.id];
  S.stats.answers++;
  if (pts === 1) { S.stats.right++; st.ok++; }
  else {
    st.bad++;
    const tm = addDays(today(), 1);   // Fehler aus dem Probetest kommen spätestens morgen dran
    if (st.due > tm) st.due = tm;
  }
  save();
  sfx('tap');
  setTimeout(next, mcOk !== undefined ? 180 : 0);
}

function hint() {
  if (!SES || SES.phase !== 'answer' || SES.hintUsed) return;
  const t = SES.cur, it = IT[t.id];
  SES.hintUsed = true;
  const target = targetText(it, t.fmt);
  E.fb.innerHTML = `<div class="fb info"><div class="fb-body"><div class="pattern">${esc(pattern(target))}</div></div></div>`;
  E.fb.hidden = false;
  const b = $('#ses-tools [data-act="hint"]');
  if (b) b.disabled = true;
  focusInput();
}

function idk() {
  if (!SES || SES.phase !== 'answer') return;
  if (SES.cur.fmt === 'list') return finishList();
  resolve('wrong', { idk: true, input: '' });
}

async function quit() {
  if (!SES) return home();
  const s = SES;
  E.input.blur();
  const choice = await sheet(`<h2 class="sheet-title">Runde beenden?</h2><p>Alles, was du bis jetzt geübt hast, ist gespeichert.</p>`,
    [{ label: 'Weiterüben', value: 'stay', cls: 'go' }, { label: 'Beenden', value: 'quit' }]);
  if (choice !== 'quit') {
    if (SES === s && !E.form.hidden) focusInput();
    return;
  }
  if (s.mode !== 'test' && s.first >= 10) { markDay(); save(); }
  home();
}

function finish() {
  const s = SES;
  E.input.blur();
  SES = null;
  document.body.classList.remove('in-session');
  if (s.mode === 'test') { markDay(); S.stats.sessions++; save(); return testResult(s); }
  if (s.mode === 'mission' && !dueItems().length && !newQuota()) { S.stats.xp += XP.round; s.xp += XP.round; }
  const streakUp = markDay();
  S.stats.sessions++;
  save();
  summary(s, { streakUp });
}

// ================================================================
// Export / Import / Reset
// ================================================================
async function exportCode() {
  const code = 'GL1:' + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  try {
    await navigator.clipboard.writeText(code);
    toast('Code kopiert. Am besten in eine Notiz einfügen.');
  } catch (e) {
    sheet(`<h2 class="sheet-title">Dein Sicherungs-Code</h2><p>Alles markieren und kopieren:</p><textarea class="code" readonly>${esc(code)}</textarea>`,
      [{ label: 'Fertig', value: null, cls: 'go' }]);
  }
}
let importBuffer = '';
document.addEventListener('input', e => { if (e.target && e.target.id === 'imp') importBuffer = e.target.value; });
async function importCode() {
  importBuffer = '';
  const val = await sheet(`<h2 class="sheet-title">Code einfügen</h2><p>Achtung: Das ersetzt den Fortschritt auf diesem Gerät.</p><textarea class="code" id="imp" placeholder="GL1:…"></textarea>`,
    [{ label: 'Wiederherstellen', value: 'go', cls: 'go' }, { label: 'Abbrechen', value: null }]);
  if (val !== 'go') return;
  try {
    const txt = importBuffer.trim().replace(/^GL1:/, '');
    const obj = JSON.parse(decodeURIComponent(escape(atob(txt))));
    if (!obj || typeof obj.it !== 'object' || !obj.settings) throw new Error('kein Geo-Legends-Code');
    S = upgrade(obj);
    save();
    toast('Fortschritt wiederhergestellt ✓');
    home();
  } catch (e) {
    toast('Der Code passt nicht. Bitte ganz kopieren.');
  }
}
async function resetAll() {
  const v = await sheet(`<h2 class="sheet-title">Fortschritt löschen?</h2><p>Alle Stempel, XP und der Streak gehen verloren. Name, Testdatum und Länderauswahl bleiben.</p>`,
    [{ label: 'Ja, alles löschen', value: 'yes', cls: 'danger' }, { label: 'Abbrechen', value: null, cls: 'go' }]);
  if (v !== 'yes') return;
  const keep = { settings: S.settings, ui: S.ui };
  S = fresh();
  S.settings = keep.settings;
  S.ui = keep.ui;
  save();
  toast('Alles zurückgesetzt.');
  home();
}

// ================================================================
// Aktionen
// ================================================================
const ACT = {
  home: () => home(),
  start: () => startMission(),
  warmup: () => startSession('practice', buildPractice(seenItems(), 12)),
  extraNew: () => startSession('extra', buildRound(newForRound(ROUND_NEW), [])),
  practiceAll: () => startSession('practice', buildPractice(seenItems(), 12)),
  trainMisses: () => startSession('practice', shuffle(lastMisses).map(id => ({ id, step: 'practice' }))),
  topic: b => topicSheet(b.dataset.t),
  atlas: () => atlas(),
  atlasTab: b => atlas(b.dataset.t),
  atlasCaps: b => { atlasCaps = b.dataset.v === '1'; atlas(); },
  test: () => testSetup(),
  testGo: b => startSession('test', buildTest(+b.dataset.n)),
  settings: () => settings(),
  chooseFromSettings: () => choose('settings'),
  chooseDone: () => chooseDone(),
  pickCountry: b => pickCountry(b),
  pickAll: () => { GEO.countries.forEach(c => { if (!c.opt) chooseSel.add(c.id); }); const y = scrollY; renderChoose(); scrollTo(0, y); },
  pickNone: () => { chooseSel.clear(); const y = scrollY; renderChoose(); scrollTo(0, y); },
  about: () => about(),
  next: () => onNext(),
  quit: () => quit(),
  hint: () => hint(),
  idk: () => idk(),
  listDone: () => finishList(),
  choice: b => onChoice(b),
  clearTest: () => { S.settings.testDate = ''; save(); settings(); },
  exportCode: () => exportCode(),
  importCode: () => importCode(),
  reset: () => resetAll(),
  hideInstall: () => { S.ui.hideInstall = true; save(); home(); }
};

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACT[b.dataset.act];
  if (fn) fn(b, e);
});
// Tipp-Knöpfe sollen die Tastatur nicht schließen
app.addEventListener('mousedown', e => { if (e.target.closest('.keepfocus')) e.preventDefault(); });
// Kein Seiten-Zoom mit zwei Fingern auf der Karte (Safari)
document.addEventListener('gesturestart', e => { if (e.target.closest && e.target.closest('.mapbox')) e.preventDefault(); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && screen === 'home') home();
});

// Nur zum Testen am Mac: GL.shiftDays(1) springt einen Tag weiter
window.GL = {
  get state() { return S; },
  today,
  items: ITEMS,
  check: (id, input, m) => check(IT[id], input, m || 'name'),
  get ses() { return SES && { cur: SES.cur, phase: SES.phase, item: SES.cur && IT[SES.cur.id], left: SES.queue.length }; },
  get map() { return E.map; },
  shiftDays(n) {
    dayOffset += n;
    try { sessionStorage.setItem('gl.dayOffset', String(dayOffset)); } catch (e) { /* egal */ }
    if (screen === 'home') home();
    return today();
  }
};

// ================================================================
// Start
// ================================================================
syncViewport();
if (S.ui.onboarded) home(); else welcome();

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/nosw/.test(location.search)) {   // ?nosw zum Entwickeln
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
