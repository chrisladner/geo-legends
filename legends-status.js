/* Legends Status – gemeinsamer Baustein der Legends-Apps und von Legends HQ.
   Original: apps/legends-hq/shared/legends-status.js. Kopien nie von Hand ändern:
   hier ändern, dann `node tools/verteilen.mjs`.

   Rechnet aus dem Stand einer App einen kleinen Lagebericht (nur Zahlen, kein Name) und daraus die
   Ampel: Ist das Kind für den nächsten Test im Plan? Format und Regeln: docs/schnittstelle.md,
   fachliche Grundlage: auftraege/2026-11-06_eltern-hub.md. Klassisches Skript ohne Abhängigkeiten,
   hängt sich an globalThis.LegendsStatus (Browser, Worker, node). */
(function (root) {
  'use strict';

  const FORMAT = 1;
  const LOG_TAGE = 90;
  const LAEUFE = 40;
  const PLAN_LAEUFE = 200;
  // Prognose und Plan rechnen mit derselben festen Trefferquote. Mit der eigenen Quote des Kindes würde der Abstand
  // zum Plan auch bei perfektem Üben um bis zu 27 Punkte schwanken (Kalibrierung lernforschung, 06.11.2026).
  const P_PLAN = 0.85;

  // paket: Neues kommt in ganzen Paketen (Geo: Länder einer Region); 1 = einzeln
  const STANDARD = {
    pausen: [0, 1, 2, 4, 7, 14, 30], maxPause: 60, maxStufe: 6, sicherAb: 3, fehlerMinus: 2,
    neuProTag: 8, vorlauf: 1, wdhLimit: 0, paket: 1, sekNeu: 30, sekWdh: 8, sekFehler: 23
  };

  // ================================================================
  // Datum (lokale Tage als 'JJJJ-MM-TT', gerechnet in UTC – keine Sommerzeit-Fallen)
  // ================================================================
  function ms(ds) { const [y, m, d] = ds.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function zwei(n) { return String(n).padStart(2, '0'); }
  function addDays(ds, n) {
    const d = new Date(ms(ds) + n * 864e5);
    return d.getUTCFullYear() + '-' + zwei(d.getUTCMonth() + 1) + '-' + zwei(d.getUTCDate());
  }
  function daysBetween(a, b) { return Math.round((ms(b) - ms(a)) / 864e5); }

  // ================================================================
  // Tagesprotokoll S.log  { 'JJJJ-MM-TT': { a, r, n, s, f, o, k } }
  // ================================================================
  function eintrag(log, tag) {
    if (!log[tag] || typeof log[tag] !== 'object') log[tag] = { a: 0, r: 0, n: 0, s: 0, f: 0, o: 0, k: 0 };
    return log[tag];
  }
  // Je Aufgabe zählen höchstens 60 Sekunden – wer das Handy weglegt, übt nicht.
  function sek(x) { const s = Math.round(Number(x) || 0); return Math.max(0, Math.min(60, s)); }
  // Erster Versuch des Tages bei einer fälligen Karte (der, der die Stufe ändert)
  function zaehleAntwort(log, tag, richtig, sekunden) {
    const e = eintrag(log, tag);
    e.a += 1;
    if (richtig) e.r += 1;
    e.s += sek(sekunden);
  }
  function zaehleNeu(log, tag, sekunden) { const e = eintrag(log, tag); e.n += 1; e.s += sek(sekunden); }
  function zaehleZeit(log, tag, sekunden) { eintrag(log, tag).s += sek(sekunden); }
  function kuerzen(log, heute) {
    const grenze = addDays(heute, -LOG_TAGE);
    for (const t of Object.keys(log)) if (t < grenze) delete log[t];
    return log;
  }

  // ================================================================
  // Zufall mit festem Startwert: derselbe Stand gibt dieselbe Prognose
  // ================================================================
  function zufall(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function streuwert(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ================================================================
  // Vorwärts-Simulation des App-Plans bis zum Vortag des Tests.
  // Das Kind macht nach `pause` Tagen ohne Üben jeden Tag die Runde und liegt mit p richtig.
  // Ergebnis: Anteil sicherer Karten im Ziel am Testtag (%) und nötige Minuten pro Tag.
  // heuteNeu: wie viel Neues die App heute noch verlangt (Tag 0 einer Prognose ab jetzt); ohne Angabe
  // rechnet Tag 0 die volle Tagesmenge (Plan ab dem Eintragetag).
  // ================================================================
  function simuliere(eingabe, pause, p, laeufe, heuteNeu) {
    const R = Object.assign({}, STANDARD, eingabe.regeln || {});
    const heute = eingabe.heute, T = eingabe.test.datum;
    const tage = daysBetween(heute, T);
    if (tage < 1) return null;
    const vortag = addDays(T, -1);
    const kappe = (tag, due) => (due > vortag && tag < vortag ? vortag : due);   // Endspurt: am Vortag noch einmal
    const basis = (eingabe.karten || []).filter(k => k.imZiel);
    const neuStart = (eingabe.neuOffen && eingabe.neuOffen.ziel) || 0;
    const rnd = zufall(streuwert(heute + '|' + eingabe.app + '|' + pause + '|' + basis.length + '|' + neuStart));
    let summeSicher = 0, summeMin = 0;
    for (let l = 0; l < laeufe; l++) {
      const karten = basis.map(k => ({ lv: k.lv, due: kappe(heute, k.due) }));
      let neu = neuStart;
      const minuten = [];
      for (let d = 0; d < tage; d++) {
        const tag = addDays(heute, d);
        if (d < pause) { minuten.push(0); continue; }
        let s = 0;
        let faellig = karten.filter(k => k.due <= tag);
        if (R.wdhLimit > 0 && faellig.length > R.wdhLimit) {
          faellig = faellig.sort((x, y) => (x.lv - y.lv) || (x.due < y.due ? -1 : x.due > y.due ? 1 : 0)).slice(0, R.wdhLimit);
        }
        for (const k of faellig) {
          if (rnd() < p) {
            const von = k.lv;
            k.lv = Math.min(R.maxStufe, von + 1);
            k.due = kappe(tag, addDays(tag, von >= R.maxStufe ? R.maxPause : (R.pausen[k.lv] || 1)));
            s += R.sekWdh;
          } else {
            k.lv = Math.max(1, k.lv - R.fehlerMinus);
            k.due = kappe(tag, addDays(tag, 1));
            s += R.sekWdh + R.sekFehler;
          }
        }
        // Neues wie in den Apps: auf die Tage bis kurz vor dem Test verteilt, mindestens die übliche Menge.
        // Mit Paketen wird aufgerundet: eine angefangene Runde nimmt immer ein ganzes Paket.
        if (neu > 0) {
          let q;
          if (d === 0 && pause === 0 && heuteNeu != null) {
            q = Math.min(neu, Math.max(0, heuteNeu));   // heute ist ein Teil vielleicht schon erledigt
          } else {
            const verfuegbar = Math.max(1, (tage - d) - R.vorlauf);
            q = Math.max(R.neuProTag, Math.ceil(neu / verfuegbar));
            if (R.paket > 1) q = Math.ceil(q / R.paket) * R.paket;
            q = Math.min(neu, q);
          }
          for (let i = 0; i < q; i++) karten.push({ lv: 1, due: kappe(tag, addDays(tag, R.pausen[1] || 1)) });
          neu -= q;
          s += q * R.sekNeu;
        }
        minuten.push(s / 60);
      }
      const gesamt = karten.length + neu;
      const sicher = karten.filter(k => k.lv >= R.sicherAb).length;
      summeSicher += gesamt ? sicher / gesamt : 1;
      // Nötige Minuten: Durchschnitt der Übungstage bis 3 Tage vor dem Test
      const bis = Math.max(pause + 1, tage - 3);
      const ueben = minuten.slice(pause, bis);
      summeMin += ueben.length ? ueben.reduce((x, y) => x + y, 0) / ueben.length : 0;
    }
    return { sicher: Math.round(100 * summeSicher / laeufe), minuten: Math.round(summeMin / laeufe) };
  }

  // ================================================================
  // Plan: Was hätte der App-Plan ab dem Tag, an dem der Termin eingetragen wurde, erreicht?
  // Einmal gerechnet und in e.plaene (S.plaene der App) eingefroren; neu nur, wenn sich Datum oder
  // Stoffmenge ändern. Ab dem ersten Bericht gerechnet, bliebe ein später Start unsichtbar.
  // ================================================================
  function planFuer(e, R, test, ziel, neuZiel, heute) {
    const gesamt = ziel.length + neuZiel;
    const schluessel = test.datum + '|' + gesamt;
    const ablage = e.plaene && typeof e.plaene === 'object' ? e.plaene : null;
    if (ablage && ablage[schluessel]) return ablage[schluessel];
    let seit = test.seit && test.seit < heute ? test.seit : heute;
    if (daysBetween(seit, test.datum) < 1) seit = heute;
    // Stand am Eintragetag nachbilden: Was erst danach gesammelt wurde, war damals noch neu.
    const damals = ziel.filter(k => !k.since || k.since <= seit);
    const neuDamals = neuZiel + (ziel.length - damals.length);
    const r = simuliere(Object.assign({}, e, {
      regeln: R, heute: seit, karten: damals, neuOffen: { ziel: neuDamals, gesamt: neuDamals }
    }), 0, P_PLAN, PLAN_LAEUFE);
    const plan = { seit, sicher: r.sicher, minuten: r.minuten };
    if (ablage) {
      for (const k of Object.keys(ablage)) if (k.split('|')[0] < heute) delete ablage[k];   // vergangene Termine
      ablage[schluessel] = plan;
    }
    return plan;
  }

  // ================================================================
  // Lagebericht
  // ================================================================
  function bericht(e) {
    const R = Object.assign({}, STANDARD, e.regeln || {});
    const heute = e.heute;
    const log = e.log || {};
    const karten = e.karten || [];
    const ziel = karten.filter(k => k.imZiel);
    const neuZiel = (e.neuOffen && e.neuOffen.ziel) || 0;
    const test = e.test && e.test.datum && e.test.datum >= heute ? e.test : null;
    const sicher = ziel.filter(k => k.lv >= R.sicherAb).length;
    const offen = { faellig: Math.max(0, (e.heuteOffen && e.heuteOffen.faellig) || 0), neu: Math.max(0, (e.heuteOffen && e.heuteOffen.neu) || 0) };
    const fertig = offen.faellig + offen.neu === 0;
    // Erster Tag mit Protokoll = Beginn der Eltern-Verbindung (beim ersten Bericht nach dem Update: heute).
    // Davor weiß die App nicht, ob geübt wurde – diese Tage zählen nie gegen das Kind.
    const ersterTag = Object.keys(log).sort()[0] || heute;

    // Heute ins Protokoll: offen, sicher, fertig (nur wenn heute auch geübt wurde)
    const eh = eintrag(log, heute);
    eh.o = offen.faellig + offen.neu;
    eh.k = sicher;
    if (fertig && eh.a + eh.n > 0) eh.f = 1;

    // Was war an einem vergangenen Tag fällig und blieb liegen? (für Tage ohne Protokoll)
    const neuWarGeplant = d => !!(test && neuZiel > 0 && test.seit && d >= test.seit && d < test.datum);
    const warFaellig = d => karten.some(k => k.last < d && k.due <= d) || neuWarGeplant(d);

    // Ausgelassene Tage festhalten, solange die Karten noch zeigen, was dort fällig war. Nach dem Aufholen
    // steht bei den Karten „zuletzt geübt: heute“, und der Tag sähe aus wie ein freier. Nur nach dem ersten
    // Protokolltag. (Geo macht dasselbe zusätzlich vor der ersten Antwort eines neuen Tages; gleiche Regel.)
    for (let i = 14; i >= 1; i--) {
      const d = addDays(heute, -i);
      if (d <= ersterTag || log[d]) continue;
      const n = karten.filter(k => k.last < d && k.due <= d).length;
      if (n > 0 || neuWarGeplant(d)) log[d] = { a: 0, r: 0, n: 0, s: 0, f: 0, o: Math.max(1, n), k: 0 };
    }
    // Aufgeholt = die Mission des Tages ist geschafft (so, wie die App sie stellt – auch wenn sie, wie Word in
    // der Schularbeitszeit, Wiederholungen deckelt). Lücken davor zählen dann nicht mehr für die Ampel; den
    // Rückstand im Stoff misst die Prognose gegen den Plan.
    const aufgeholt = fertig;
    const letzteRunde = Object.keys(log).filter(t => t <= heute && log[t] && log[t].f).sort().pop() || '';

    const tage = [];
    for (let i = 14; i >= 1; i--) {
      const d = addDays(heute, -i);
      const x = log[d];
      let s;
      if (x && x.f) s = 'fertig';
      else if (x && x.a + x.n > 0) s = 'teil';
      else if (x && x.o > 0) s = 'aus';
      else if (x || d < ersterTag) s = 'frei';   // nichts offen, oder vor der Eltern-Verbindung (unbekannt)
      else s = warFaellig(d) ? 'aus' : 'frei';
      tage.push({ d, s, a: x ? x.a : 0, r: x ? x.r : 0, min: x ? Math.round(x.s / 60) : 0 });
    }

    // Trefferquote der ersten Versuche, 7 Tage inkl. heute
    let a7 = 0, r7 = 0;
    for (let i = 0; i < 7; i++) { const x = log[addDays(heute, -i)]; if (x) { a7 += x.a; r7 += x.r; } }
    const quote7 = a7 >= 20 ? Math.round(1000 * r7 / a7) / 1000 : null;

    // Fällige Karten an den nächsten 14 Tagen, wenn ab jetzt niemand übt
    const faellig14 = [offen.faellig];
    for (let i = 1; i < 14; i++) {
      const d = addDays(heute, i);
      faellig14.push(karten.filter(k => k.due <= d).length);
    }

    let prognose = null;
    if (test && daysBetween(heute, test.datum) >= 1 && ziel.length + neuZiel > 0) {
      const sicherP = [], minP = [];
      for (let k = 0; k < 4; k++) {
        const r = simuliere(Object.assign({}, e, { regeln: R }), k, P_PLAN, LAEUFE, offen.neu);
        sicherP.push(r.sicher);
        minP.push(r.minuten);
      }
      prognose = { sicher: sicherP, minuten: minP, plan: planFuer(e, R, test, ziel, neuZiel, heute) };
    }

    // Wackelige Karten: viele Fehler, niedrige Stufe – Stoff des Tests zuerst
    const punkte = k => (k.bad || 0) - (k.ok || 0) * 0.5;
    const wackelig = karten
      .filter(k => k.label && ((k.bad || 0) > 0 || k.lv <= 1))
      .sort((x, y) => ((y.imZiel ? 1 : 0) - (x.imZiel ? 1 : 0)) || (punkte(y) - punkte(x)) || (x.lv - y.lv))
      .slice(0, 8)
      .map(k => String(k.label).slice(0, 60));

    return {
      v: FORMAT,
      app: e.app, name: e.name, version: e.version || '',
      tag: heute, zeit: e.zeit || '',
      test: test ? { datum: test.datum, titel: test.titel || 'Test', quelle: test.quelle || 'eltern' } : null,
      ziel: e.ziel || '',
      stoff: { gesamt: ziel.length + neuZiel, gesammelt: ziel.length, sicher },
      heute: { faellig: offen.faellig, neu: offen.neu, fertig, antworten: eh.a, richtig: eh.r, minuten: Math.round(eh.s / 60) },
      aufgeholt,
      letzteRunde,
      tage,
      quote7,
      offenMin: Math.round((offen.faellig * R.sekWdh + offen.neu * R.sekNeu) / 60),
      faellig14,
      neuGeplant: !!(test && neuZiel > 0),
      sek: { neu: R.sekNeu, wdh: R.sekWdh },
      prognose,
      wackelig
    };
  }

  // ================================================================
  // Ampel – reine Funktion: dieselbe Antwort in der App, in der Eltern-App und im Worker
  // ================================================================
  const RANG = { gruen: 0, gelb: 1, rot: 2 };

  function urteil(b, heute, opt) {
    opt = opt || {};
    if (!b || !b.tag) {
      return {
        stufe: 'unbekannt', gruende: [{ stufe: 'gelb', text: 'Noch keine Meldung von dieser App' }], alter: null,
        testIn: null, endspurt: false, heuteOffen: false, verpasst: 0, prognose: null, minuten: null, plan: null, abstand: null,
        kind: { titel: 'Los geht\'s', text: 'Mach deine erste Mission.' },
        eltern: { titel: 'Noch keine Meldung', text: 'Diese App hat sich noch nicht gemeldet.', tipp: '' }
      };
    }
    const alter = Math.max(0, daysBetween(b.tag, heute));
    const test = b.test && b.test.datum >= heute ? b.test : null;
    const testIn = test ? daysBetween(heute, test.datum) : null;
    const endspurt = testIn !== null && testIn <= 7;
    const heuteB = b.heute || { faellig: 0, neu: 0, fertig: true };
    const f14 = b.faellig14 || [];
    const gruende = [];
    const grund = (stufe, text) => gruende.push({ stufe, text });

    // War an Tag d (nach dem Bericht) etwas zu tun?
    const zuTun = i => ((f14[Math.min(i, f14.length - 1)] || 0) > 0) || !!b.neuGeplant;
    const nichtFertigAmBerichtstag = !heuteB.fertig && (heuteB.faellig + heuteB.neu) > 0;

    // Lücken zählen nur seit der letzten fertigen Runde: Wer aufholt, ist wieder im Plan – auch am nächsten Morgen.
    // Den Rückstand im Stoff misst die Prognose gegen den Plan.
    let seit = b.letzteRunde || '';
    for (const t of b.tage || []) if (t.s === 'fertig' && t.d > seit) seit = t.d;
    if (b.aufgeholt && b.tag > seit) seit = b.tag;

    // Tage ohne fertige Runde in einem Fenster vor heute (nach der letzten fertigen Runde), dazu Tage ohne Meldung
    function verpasstIn(fensterTage, auchTeil) {
      const ab = addDays(heute, -fensterTage);
      let n = 0;
      for (const t of b.tage || []) {
        if (t.d > seit && t.d >= ab && t.d < heute && (t.s === 'aus' || (auchTeil && t.s === 'teil'))) n++;
      }
      if (b.tag < heute && b.tag >= ab && b.tag > seit && nichtFertigAmBerichtstag) n++;
      for (let i = 1; i < alter; i++) {
        const d = addDays(b.tag, i);
        if (d >= ab && zuTun(i)) n++;
      }
      return n;
    }

    let heuteOffen = false;
    if (opt.abend) heuteOffen = alter === 0 ? nichtFertigAmBerichtstag : zuTun(alter);

    let verpasst, prognose = null, minuten = null, plan = null, abstand = null;
    if (test) {
      verpasst = verpasstIn(7, true);
      if (verpasst >= 3) grund('rot', `${verpasst} Runden in den letzten 7 Tagen nicht fertig`);
      else if (verpasst >= 1) grund('gelb', `${verpasst === 1 ? '1 Runde' : verpasst + ' Runden'} in den letzten 7 Tagen nicht fertig`);
      if (b.prognose && testIn >= 1) {
        const k = Math.min(3, alter);
        prognose = b.prognose.sicher[k];
        minuten = b.prognose.minuten[k];
        plan = b.prognose.plan || null;
        // Maßstab ist der eigene Plan: Wo stünde das Kind, wenn es seit dem Eintragen täglich geübt hätte?
        // Schwellen: Kalibrierung lernforschung 06.11.2026 (auftraege/2026-11-06_eltern-hub.md).
        if (plan) {
          abstand = Math.max(0, plan.sicher - prognose);
          if (abstand >= 20) grund('rot', `${abstand} Prozentpunkte hinter dem Plan (Prognose ${prognose} %, Plan ${plan.sicher} %)`);
          else if (abstand >= 10) grund('gelb', `${abstand} Prozentpunkte hinter dem Plan (Prognose ${prognose} %, Plan ${plan.sicher} %)`);
          // Pläne, die sich auch mit täglichem Üben nicht ausgehen (GW im Oktober)
          if (plan.sicher < 50 || plan.minuten > 25) grund('rot', `Der Plan geht sich nicht aus: auch mit täglichem Üben nur ${plan.sicher} % sicher, ${plan.minuten} Minuten am Tag`);
          else if (plan.sicher < 65 || plan.minuten > 20) grund('gelb', `Der Plan ist knapp: mit täglichem Üben ${plan.sicher} % sicher, ${plan.minuten} Minuten am Tag`);
        }
        if (testIn >= 3) {
          if (minuten > 25) grund('rot', `braucht ${minuten} Minuten pro Tag, um es zu schaffen`);
          else if (minuten > 20) grund('gelb', `braucht ${minuten} Minuten pro Tag`);
        }
      }
      if (endspurt && heuteOffen) grund('gelb', 'heute noch keine fertige Runde');
      if (alter >= 3) grund('rot', `seit ${alter} Tagen keine Meldung`);
      else if (alter === 2) grund('gelb', 'seit 2 Tagen keine Meldung');
    } else {
      verpasst = verpasstIn(14, false);
      if (verpasst >= 7) grund('rot', `${verpasst} Tage in den letzten 2 Wochen nicht geübt, obwohl etwas fällig war`);
      else if (verpasst >= 3) grund('gelb', `${verpasst} Tage in den letzten 2 Wochen nicht geübt, obwohl etwas fällig war`);
      const sekWdh = (b.sek && b.sek.wdh) || STANDARD.sekWdh;
      const offenJetzt = alter === 0 ? (b.offenMin || 0)
        : Math.max(b.offenMin || 0, Math.round((f14[Math.min(alter, f14.length - 1)] || 0) * sekWdh / 60));
      if (offenJetzt > 30) grund('rot', `${offenJetzt} Minuten Wiederholung liegen offen`);
      else if (offenJetzt > 15) grund('gelb', `${offenJetzt} Minuten Wiederholung liegen offen`);
    }
    if (b.quote7 != null) {
      const q = Math.round(b.quote7 * 100);
      if (q < 65) grund('rot', `Trefferquote nur ${q} % (rät er?)`);
      else if (q < 75) grund('gelb', `Trefferquote ${q} %`);
    }

    let stufe = 'gruen';
    for (const g of gruende) if (RANG[g.stufe] > RANG[stufe]) stufe = g.stufe;

    return {
      stufe, gruende, alter, testIn, endspurt, heuteOffen, verpasst, prognose, minuten, plan, abstand,
      kind: textKind(stufe, b, test, testIn, gruende),
      eltern: textEltern(stufe, b, test, testIn, gruende, alter)
    };
  }

  // Ohne Artikel, weil das Geschlecht des Titels unbekannt ist („Englisch-Test in 14 Tagen.“)
  function bisTest(test, testIn) {
    if (!test) return '';
    if (testIn === 0) return `Heute: ${test.titel}.`;
    if (testIn === 1) return `Morgen: ${test.titel}.`;
    return `${test.titel} in ${testIn} Tagen.`;
  }

  // Das Kind sieht dieselbe Stufe wie die Eltern, in seinem Ton und ohne Rot. Hat es heute schon alles
  // erledigt, zählt zuerst das: Anerkennung für heute und der Blick nach vorn. „Mission“ = alle Runden des Tages.
  function textKind(stufe, b, test, testIn, gruende) {
    const fertig = b.heute && b.heute.fertig;
    if (stufe === 'rot') {
      return fertig
        ? { titel: 'Notfallplan', text: 'Mission geschafft, stark! Morgen geht der Aufhol-Plan weiter.' }
        : { titel: 'Notfallplan', text: 'Macht heute zusammen einen Aufhol-Plan. Das geht sich aus.' };
    }
    if (stufe === 'gelb') {
      if (fertig) return { titel: 'Aufholen', text: 'Mission geschafft ✓ Bleib dran, dann bist du bald wieder im Plan.' };
      const lang = gruende.some(g => /Minuten pro Tag/.test(g.text));
      return { titel: 'Aufholen', text: lang ? 'Heute deine Mission, gern in zwei kurzen Etappen. Dann bist du wieder im Plan.' : 'Heute deine Mission, dann bist du wieder im Plan.' };
    }
    if (test && testIn === 0) return { titel: 'Im Plan ✓', text: `Heute: ${test.titel}. Viel Erfolg!` };
    const dazu = fertig ? 'Mission geschafft ✓ Dranbleiben zahlt sich aus.' : 'Mach heute deine Mission, dann bleibst du im Plan.';
    return { titel: 'Im Plan ✓', text: (bisTest(test, testIn) + ' ' + dazu).trim() };
  }

  function textEltern(stufe, b, test, testIn, gruende, alter) {
    const st = b.stoff || { gesamt: 0, sicher: 0 };
    const stand = st.gesamt ? `${st.sicher} von ${st.gesamt} sicher` : '';
    const wann = alter === 0 ? `Gemeldet heute ${b.zeit || ''}`.trim() : alter === 1 ? 'Zuletzt gemeldet gestern' : `Zuletzt gemeldet vor ${alter} Tagen`;
    const teile = [bisTest(test, testIn), stand ? stand + '.' : '', wann + '.'].filter(Boolean);
    if (stufe === 'gruen') return { titel: 'Im Plan', text: teile.join(' '), tipp: '' };
    const warum = gruende.filter(g => g.stufe === stufe).map(g => g.text).join(' · ');
    if (stufe === 'gelb') {
      return { titel: 'Aufholen nötig', text: warum + '. ' + teile.join(' '),
        tipp: 'Freundlich fragen, wann die Runde dran ist, und eine feste Zeit ausmachen. Nur die heutige Runde.' };
    }
    return { titel: 'Eingreifen', text: warum + '. ' + teile.join(' '),
      tipp: 'Besprechen, was ihn abhält. Dann täglich danebensitzen (Duell, Probetest), bis es wieder grün ist. Keine Strafe.' };
  }

  root.LegendsStatus = {
    FORMAT, STANDARD, P_PLAN,
    bericht, urteil,
    eintrag, zaehleAntwort, zaehleNeu, zaehleZeit, kuerzen,
    addDays, daysBetween, simuliere
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
