# Geo Legends – Erdkunde-Trainer

Web-App (PWA) fürs iPhone, Schwester-App von Word Legends. Gelernt wird auf echten Karten:
Bundesländer und Landeshauptstädte, Steckbrief Österreich, Länder Europas mit Hauptstädten,
Kontinente und Ozeane. Kein App Store, kein Build-Schritt, keine Abhängigkeiten. Läuft offline,
sobald sie einmal geöffnet wurde.

Anlass: schriftliche Wiederholung GW am Fr, 23.10.2026 (Bundesländer, Steckbrief Buch S. 10,
Länder Europas + Hauptstädte, Kontinente und Ozeane).

## Aufs iPhone

Live: **https://chrisladner.github.io/geo-legends/** (GitHub Pages aus `main` /, Update = commit + push)

1. In **Safari** die Adresse öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm“**.
3. Ab jetzt nur noch über das Icon starten. Der Fortschritt liegt auf dem Gerät, in der
   Home-Bildschirm-App. Sicherung: Einstellungen → „Code kopieren“.

Beim ersten Start fragt die App nach den **im Unterricht markierten Ländern**. Nur die kommen dann
bei „Länder Europas“ dran (später änderbar unter Einstellungen → Markierte Länder).

## Wie gelernt wird

| Baustein | Umsetzung |
|---|---|
| Lernen am Ort | Länder, Bundesländer, Kontinente, Ozeane immer auf der Karte: antippen, erkennen, benennen |
| Vom Erkennen zum Schreiben | Neu: Paket ansehen → antippen/auswählen → später selbst schreiben (wie im Test) |
| Pakete | Kontinente, Ozeane, Bundesländer, Landeshauptstädte, Steckbrief 1–3, Europa nach Regionen (erst Lage, dann Hauptstädte) |
| Stempel | Bronze (kennengelernt) → Silber → Gold → Diamant; höchstens eine Stufe pro Tag |
| Pausen | 1 · 1 · 2 · 4 Tage, Diamant und richtig: 7 Tage |
| Fehler | −1 Stufe (mind. Bronze), morgen wieder, in derselben Runde bis zu zweimal nochmal |
| Schreibfehler | 1 Buchstabe daneben oder fehlende Pünktchen = „Fast!“, einmal richtig abschreiben |
| Testdatum | Neues ist zwei Tage vor dem Test durch; Tag davor = Generalprobe (alles einmal); am Testtag Aufwärmrunde. Der offizielle Termin aus `data.js` gilt immer; einen eigenen Termin kann das Kind nur ohne offiziellen eintragen |
| Runden | höchstens 18 neue (ganze Pakete) + 30 Wiederholungen pro Runde, Pausen dazwischen erlaubt |
| Gemischt | Wiederholungen aus allen Themen wechseln sich ab; Auswahl-Antworten sind Nachbarländer |
| Probetest | 4 Teile wie im Test (Österreich, Steckbrief, Europa, Welt), Note 1–5, danach Fehler üben |
| Atlas | Karten zum Nachschlagen, Farbe = Stempel, Namen/Hauptstädte umschaltbar |

## Inhalte ändern

Alles steht in `data.js` (Format oben in der Datei). ids nie ändern – der Fortschritt hängt daran.

- **Steckbrief** (`facts`, Pakete `st1`–`st3`): Werte mit Buch S. 10 vergleichen und dort anpassen.
- **Länder**: `opt: true` = nur dabei, wenn ausdrücklich ausgewählt (Türkei).
- **Testtermin** (setzen Mama und Papa über `/stoff`): `testDate: 'JJJJ-MM-TT'` ist der offizielle Termin. Er gilt,
  solange er nicht vorbei ist, und das Kind kann ihn in der App nicht verschieben (Feld gesperrt, „Termin von
  Mama/Papa“). Dazu `testSeit: 'JJJJ-MM-TT'` = an dem Tag eingetragen (für den Plan im Lagebericht; fehlt es,
  zählt der Tag, an dem die App den Termin zuerst sieht) und optional `testTitle` (sonst „GW-Test“).
  Bis gl-v1 wurde der Termin in den Speicher kopiert, darum kam ein neuer Termin nie an; der alte Wert wird
  beim Laden verworfen.
- Danach `sw.js` → `VERSION` **und** `app.js` → `VERSION` hochzählen (Stand `gl-v4`) und neu veröffentlichen.

So kommt ein Update aufs iPhone (seit `gl-v2`, wie Word Legends seit `wl-v5`): Mit Internet holt der
Offline-Cache die App-Dateien immer frisch vom Server (höchstens 2,5 s warten, sonst Cache). Ein neuer
`VERSION`-Stand wird beim Öffnen und beim Zurückholen aus dem Hintergrund gefunden; die App lädt dann von selbst
neu, sobald man auf der Startseite ist, nie mitten in einer Runde. Kommt das Update von `gl-v1` (die Seite konnte
sich noch nicht selbst neu laden), lädt der neue Offline-Cache das offene Fenster einmal neu (`LEGACY`). Welche
Version am Handy läuft, steht unten in den Einstellungen („Version 4“). Der Offline-Cache löscht nur eigene alte
Caches (`gl-…`), denn Word Legends liegt unter derselben Adresse.

## Eltern-Verbindung und Plan-Karte

Stand `gl-v4`. Vertrag: `legends-hq/docs/schnittstelle.md`. `legends-status.js` und `legends-sync.js` sind Kopien
aus `legends-hq/shared/` – nie hier ändern, sondern dort und dann `node tools/verteilen.mjs`. Seit `gl-v4` heißt
der ganze Tag auch in den Texten der Ampel „Mission“ (z. B. „Mission geschafft ✓“, bei den Eltern „Mission
fertig“); Bericht und Ampel rechnen unverändert.

- **Plan-Karte** auf der Startseite: dieselbe Ampel wie bei den Eltern, im Ton fürs Kind (ohne Termin seit `gl-v3` grau „Kein Termin“; sonst Im Plan ✓ · Aufholen ·
  Notfallplan), dazu die letzten 7 Tage als Punkte (✓ geschafft · halb = angefangen · leer = nicht geübt ·
  klein = frei · gestrichelt = heute noch offen) und „Das sehen Mama und Papa auch.“ Kein Rot, keine Minuten,
  keine XP. Rechnet auch ohne Verbindung, neu nur, wenn sich Stand oder Tag geändert haben.
- **Tagesprotokoll** `S.log` (90 Tage): erste Versuche fälliger Aufgaben (`a`, davon richtig `r`), neu gesammelte
  (`n`), aktive Sekunden (`s`, je Aufgabe vom Anzeigen bis zur Antwort, höchstens 60; auch das Anschauen eines
  neuen Pakets). Ausgelassene Tage werden beim nächsten Öffnen eingetragen, solange die Karten noch zeigen, was
  fällig war (ab dem ersten Protokolltag, also erst ab `gl-v2`). `S.plaene` hält den Plan je Termin fest.
- **Lagebericht** (`berichtEingabe()` → `LegendsStatus.bericht`): Ziel = alle aktiven Aufgaben, unter 2 KB, kein Name.
- **Einstellungen → Eltern-Verbindung:** Verbindungs-Code (`HQ1:…`) einfügen → „Verbinden“. Liegt auf dem Server
  schon eine Sicherung mit mehr Fortschritt (neues Gerät), bietet die App sie gleich an. Danach Zustand
  („verbunden · gemeldet 18:02 · gesichert 18:02“ oder der letzte Fehler), „Aus Sicherung holen“ (mit Rückfrage,
  Datum und Umfang der Sicherung) und „Trennen“. Der Code liegt in `localStorage['legends.sync.v1']`, getrennt vom
  Fortschritt, und steht nie im Sicherungs-Code.
- **Melden** (nur mit Verbindung, im Hintergrund, Fehler still): nach dem Start, beim Zurückholen aus dem Hintergrund
  (höchstens einmal pro Minute) und am Ende jeder Runde. **Sichern** (verschlüsselt) am Ende jeder Runde, auch
  wenn sie abgebrochen wurde. Alle Server-Aufrufe laufen nacheinander.
- Ohne Verbindungs-Code verlässt nichts das Gerät.

## Dateien

- `index.html` – Gerüst, iOS-Meta-Tags
- `styles.css` – Design (Meerestürkis, Tinten-Konturen, Stempelfarben `--t0`…`--t4`)
- `data.js` – Lerninhalte und Testtermin
- `maps.js` – Kartendaten (erzeugt, nicht von Hand ändern)
- `legends-status.js`, `legends-sync.js` – Lagebericht, Ampel, Verbindung (Kopien aus `legends-hq/shared/`)
- `app.js` – Lernlogik, Karte (Zoomen/Antippen), Oberfläche, Plan-Karte, Eltern-Verbindung
- `sw.js` – Offline-Cache
- `manifest.webmanifest`, `icons/` – App-Icon (Quelle: `icons/icon-source.html`)
- `tools/build_maps.py` – erzeugt `maps.js`

## Lokal testen

```bash
python3 -m http.server 8766 --directory geo-legends
```

Adresse mit `?nosw` öffnen (ohne Offline-Cache); ohne `?nosw` für den Update-Test.
In der Konsole: `GL.shiftDays(1)` springt einen Tag weiter (nur in diesem Tab),
`GL.check('h:SVN', 'Lubljana', 'cap')` prüft eine Antwort, `GL.bericht()` zeigt den Lagebericht,
`GL.urteil()` die Ampel, `GL.eingabe()` die Eingabe dafür, `GL.state.log` das Tagesprotokoll.
Verbindung testen: `node tools/dev.mjs` in `legends-hq` (druckt einen Verbindungs-Code für localhost).

## Karten neu erzeugen

Quellen: Natural Earth (gemeinfrei) und Bundesländer von Statistik Austria (CC BY 4.0, über
github.com/ginseng666/GeoJSON-TopoJSON-Austria). Werkzeug: mapshaper (npm).

```bash
mkdir -p /tmp/geo/ne /tmp/geo/at /tmp/geo/tools
NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_50m_admin_0_countries_lakes ne_110m_admin_0_countries ne_110m_lakes ne_10m_lakes ne_10m_lakes_europe ne_10m_rivers_lake_centerlines; do curl -sSfL -o /tmp/geo/ne/$f.geojson $NE/$f.geojson; done
curl -sSfL -o /tmp/geo/at/laender_995_geo.json https://raw.githubusercontent.com/ginseng666/GeoJSON-TopoJSON-Austria/master/2021/simplified-99.5/laender_995_geo.json
(cd /tmp/geo/tools && npm init -y >/dev/null && npm install mapshaper@0.6)
python3 geo-legends/tools/build_maps.py /tmp/geo /tmp/geo/tools/node_modules/.bin/mapshaper geo-legends/maps.js
```

Die Krim gehört in den Karten zur Ukraine, Nordzypern zu Zypern, Kosovo ist eigener Staat
(wie in österreichischen Schulatlanten). Europa/Asien-Grenze auf der Weltkarte: Ural, Kaukasus.

## Icons neu erzeugen

```bash
cd geo-legends/icons
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --hide-scrollbars --window-size=1024,1024 --virtual-time-budget=6000 --screenshot=$PWD/i.png "file://$PWD/icon-source.html"
"$CH" --headless=new --hide-scrollbars --window-size=1024,1024 --virtual-time-budget=6000 --screenshot=$PWD/m.png "file://$PWD/icon-source.html?s=0.6"
magick i.png -resize 180x180 apple-touch-icon.png && magick i.png -resize 192x192 icon-192.png
magick i.png -resize 512x512 icon-512.png && magick m.png -resize 512x512 icon-maskable-512.png && rm i.png m.png
```
