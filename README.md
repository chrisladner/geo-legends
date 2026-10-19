# Geo Legends – Erdkunde-Trainer

Web-App (PWA) fürs iPhone, Schwester-App von Word Legends. Gelernt wird auf echten Karten:
Bundesländer und Landeshauptstädte, Steckbrief Österreich, Länder Europas mit Hauptstädten,
Kontinente und Ozeane. Kein App Store, kein Build-Schritt, keine Abhängigkeiten. Läuft offline,
sobald sie einmal geöffnet wurde.

Anlass: schriftliche Wiederholung GW am Fr, 23.10.2026 (Bundesländer, Steckbrief Buch S. 10,
Länder Europas + Hauptstädte, Kontinente und Ozeane).

## Aufs iPhone

1. In **Safari** die veröffentlichte Adresse öffnen.
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
| Testdatum | Neues ist zwei Tage vor dem Test durch; Tag davor = Generalprobe (alles einmal); am Testtag Aufwärmrunde |
| Runden | höchstens 18 neue (ganze Pakete) + 30 Wiederholungen pro Runde, Pausen dazwischen erlaubt |
| Gemischt | Wiederholungen aus allen Themen wechseln sich ab; Auswahl-Antworten sind Nachbarländer |
| Probetest | 4 Teile wie im Test (Österreich, Steckbrief, Europa, Welt), Note 1–5, danach Fehler üben |
| Atlas | Karten zum Nachschlagen, Farbe = Stempel, Namen/Hauptstädte umschaltbar |

## Inhalte ändern

Alles steht in `data.js` (Format oben in der Datei). ids nie ändern – der Fortschritt hängt daran.

- **Steckbrief** (`facts`, Pakete `st1`–`st3`): Werte mit Buch S. 10 vergleichen und dort anpassen.
- **Länder**: `opt: true` = nur dabei, wenn ausdrücklich ausgewählt (Türkei).
- Danach `sw.js` → `VERSION` hochzählen (z. B. `gl-v2`) und neu veröffentlichen.
  Auf dem iPhone ist die neue Version ab dem **zweiten** Öffnen da.

## Dateien

- `index.html` – Gerüst, iOS-Meta-Tags
- `styles.css` – Design (Meerestürkis, Tinten-Konturen, Stempelfarben `--t0`…`--t4`)
- `data.js` – Lerninhalte
- `maps.js` – Kartendaten (erzeugt, nicht von Hand ändern)
- `app.js` – Lernlogik, Karte (Zoomen/Antippen), Oberfläche
- `sw.js` – Offline-Cache
- `manifest.webmanifest`, `icons/` – App-Icon (Quelle: `icons/icon-source.html`)
- `tools/build_maps.py` – erzeugt `maps.js`

## Lokal testen

```bash
python3 -m http.server 8766 --directory geo-legends
```

Adresse mit `?nosw` öffnen (ohne Offline-Cache, sonst sieht man Änderungen erst beim zweiten Laden).
In der Konsole: `GL.shiftDays(1)` springt einen Tag weiter (nur in diesem Tab),
`GL.check('h:SVN', 'Lubljana', 'cap')` prüft eine Antwort.

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
