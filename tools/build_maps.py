#!/usr/bin/env python3
"""
Geo Legends – Karten bauen
---------------------------------------------------------------
Erzeugt maps.js mit SVG-Pfaden für drei Karten:
  austria  Bundesländer (Statistik Austria) + Nachbarländer, Seen, Donau
  europe   Staaten Europas (Natural Earth 1:50 Mio., Lambert flächentreu)
  world    Kontinente + Ozeane (Natural Earth 1:110 Mio., Equal Earth)

Aufruf (Daten und mapshaper siehe README):
  python3 tools/build_maps.py <datenordner> <pfad-zu-mapshaper> maps.js

<datenordner> enthält:
  ne/ne_50m_admin_0_countries_lakes.geojson
  ne/ne_110m_admin_0_countries.geojson
  ne/ne_110m_lakes.geojson
  ne/ne_10m_lakes.geojson
  ne/ne_10m_lakes_europe.geojson
  ne/ne_10m_rivers_lake_centerlines.geojson
  at/laender_995_geo.json      (github.com/ginseng666/GeoJSON-TopoJSON-Austria, 2021)
"""
import json, os, subprocess, sys, tempfile

DATA, MS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
TMP = tempfile.mkdtemp(prefix='geo-maps-')
W = 1000  # Breite jeder Karte in SVG-Einheiten


def ms(*args):
    r = subprocess.run([MS, *args], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit('mapshaper: ' + r.stderr + r.stdout)


def tmp(name):
    return os.path.join(TMP, name)


def dump(name, obj):
    p = tmp(name)
    with open(p, 'w') as f:
        json.dump(obj, f)
    return p


def load(p):
    with open(p) as f:
        obj = json.load(f)
    if obj.get('type') == 'GeometryCollection':   # mapshaper schreibt Ebenen ohne Attribute so
        obj = fc([feat(g) for g in obj['geometries']])
    return obj


def feat(geom, **props):
    return {'type': 'Feature', 'properties': props, 'geometry': geom}


def polygon(*rings, **props):
    return feat({'type': 'Polygon', 'coordinates': [list(map(list, r)) for r in rings]}, **props)


def point(lon, lat, **props):
    return feat({'type': 'Point', 'coordinates': [lon, lat]}, **props)


def fc(features):
    return {'type': 'FeatureCollection', 'features': features}


def src(*parts):
    return os.path.join(DATA, *parts)


def line(a, b, n=40):
    """Gerade in Länge/Breite mit Zwischenpunkten (für gekrümmte Projektionen)."""
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]


def chain(*segments):
    pts = []
    for seg in segments:
        for p in seg:
            if not pts or pts[-1] != tuple(p):
                pts.append(tuple(p))
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


# ----------------------------------------------------------------
# Geometrie → SVG
# ----------------------------------------------------------------
def rings_of(geom):
    t = geom['type']
    if t == 'Polygon':
        return [geom['coordinates']]
    if t == 'MultiPolygon':
        return geom['coordinates']
    if t == 'LineString':
        return [[geom['coordinates']]]
    if t == 'MultiLineString':
        return [[c] for c in geom['coordinates']]
    return []


class Frame:
    def __init__(self, x0, y0, x1, y1):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        self.s = W / (x1 - x0)
        self.h = round((y1 - y0) * self.s, 1)

    def t(self, x, y):
        return (round((x - self.x0) * self.s, 1), round((self.y1 - y) * self.s, 1))


def num(v):
    s = ('%.1f' % v).rstrip('0').rstrip('.')
    if s in ('-0', ''):
        s = '0'
    if s.startswith('0.'):
        s = s[1:]
    elif s.startswith('-0.'):
        s = '-' + s[2:]
    return s


def join_nums(vals):
    out = ''
    for v in vals:
        s = num(v)
        if out and not s.startswith('-'):
            out += ' '
        out += s
    return out


def path_d(geom, fr, closed=True):
    d = []
    for poly in rings_of(geom):
        for ring in poly:
            pts = []
            for x, y in ring:
                p = fr.t(x, y)
                if not pts or p != pts[-1]:
                    pts.append(p)
            if closed and len(pts) > 1 and pts[0] == pts[-1]:
                pts.pop()
            if len(pts) < (3 if closed else 2):
                continue
            rel = []
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                rel += [bx - ax, by - ay]
            d.append('M' + join_nums(pts[0]) + 'l' + join_nums(rel) + ('z' if closed else ''))
    return ''.join(d)


def ring_area(r):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1]))) / 2


def bbox_main(geom, fr, share=0.03):
    """Rahmen um die wichtigen Teile (kleine, weit entfernte Inseln zählen nicht)."""
    polys = rings_of(geom)
    areas = [ring_area(p[0]) for p in polys]
    big = max(areas) if areas else 0
    xs, ys = [], []
    for p, a in zip(polys, areas):
        if a >= big * share:
            for x, y in p[0]:
                X, Y = fr.t(x, y)
                xs.append(X)
                ys.append(Y)
    return [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]


def neighbours(features, key='id'):
    """Länder, die mindestens zwei gemeinsame Grenzpunkte haben."""
    owners = {}
    for f in features:
        k = f['properties'][key]
        for poly in rings_of(f['geometry']):
            for ring in poly:
                for x, y in ring:
                    owners.setdefault((round(x), round(y)), set()).add(k)
    pairs = {}
    for ks in owners.values():
        if len(ks) > 1:
            ks = sorted(ks)
            for i in range(len(ks)):
                for j in range(i + 1, len(ks)):
                    pairs[(ks[i], ks[j])] = pairs.get((ks[i], ks[j]), 0) + 1
    nb = {}
    for (a, b), n in pairs.items():
        if n >= 2:
            nb.setdefault(a, []).append(b)
            nb.setdefault(b, []).append(a)
    return {k: sorted(v) for k, v in nb.items()}


def inner_points(path_in, key):
    out = tmp('inner-' + os.path.basename(path_in))
    ms(path_in, '-points', 'inner', '-o', 'format=geojson', out)
    return {f['properties'][key]: f['geometry']['coordinates'] for f in load(out)['features'] if f['geometry']}


def project_points(pts, proj, name):
    """pts: {id: (lon, lat)} → {id: (x, y)} in Projektionseinheiten."""
    p_in = dump(name + '-in.json', fc([point(lon, lat, id=k) for k, (lon, lat) in pts.items()]))
    p_out = tmp(name + '-out.json')
    ms(p_in, '-proj', proj, '-o', 'format=geojson', p_out)
    return {f['properties']['id']: f['geometry']['coordinates'] for f in load(p_out)['features']}


def bounds_of(features):
    xs, ys = [], []
    for f in features:
        for poly in rings_of(f['geometry']):
            for ring in poly:
                for x, y in ring:
                    xs.append(x)
                    ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


# ================================================================
# Europa
# ================================================================
LAEA_EU = '+proj=laea +lat_0=52 +lon_0=10 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'
EU_FRAME = (-1800000, -1900000, 2350000, 2300000)
EU_CAPITALS = {
    'ALB': (19.8187, 41.3275), 'AND': (1.5218, 42.5063), 'AUT': (16.3738, 48.2082), 'BLR': (27.559, 53.9006),
    'BEL': (4.3517, 50.8503), 'BIH': (18.4131, 43.8563), 'BGR': (23.3219, 42.6977), 'HRV': (15.9819, 45.815),
    'CZE': (14.4378, 50.0755), 'DNK': (12.5683, 55.6761), 'EST': (24.7536, 59.437), 'FIN': (24.9384, 60.1699),
    'FRA': (2.3522, 48.8566), 'DEU': (13.405, 52.52), 'GRC': (23.7275, 37.9838), 'HUN': (19.0402, 47.4979),
    'ISL': (-21.9426, 64.1466), 'IRL': (-6.2603, 53.3498), 'ITA': (12.4964, 41.9028), 'KOS': (21.1655, 42.6629),
    'LVA': (24.1052, 56.9496), 'LIE': (9.5209, 47.141), 'LTU': (25.2797, 54.6872), 'LUX': (6.1319, 49.6116),
    'MLT': (14.5146, 35.8989), 'MDA': (28.8638, 47.0105), 'MCO': (7.4246, 43.7384), 'MNE': (19.2594, 42.4304),
    'NLD': (4.9041, 52.3676), 'MKD': (21.4254, 41.9981), 'NOR': (10.7522, 59.9139), 'POL': (21.0122, 52.2297),
    'PRT': (-9.1393, 38.7223), 'ROU': (26.1025, 44.4268), 'RUS': (37.6173, 55.7558), 'SMR': (12.4578, 43.9424),
    'SRB': (20.4489, 44.7866), 'SVK': (17.1077, 48.1486), 'SVN': (14.5058, 46.0569), 'ESP': (-3.7038, 40.4168),
    'SWE': (18.0686, 59.3293), 'CHE': (7.4474, 46.948), 'UKR': (30.5234, 50.4501), 'GBR': (-0.1278, 51.5074),
    'VAT': (12.4534, 41.9029), 'CYP': (33.3823, 35.1856), 'TUR': (32.8597, 39.9334),
}


def build_europe():
    raw = tmp('eu-raw.json')
    ms(src('ne', 'ne_50m_admin_0_countries_lakes.geojson'),
       '-clip', 'bbox=-45,22,75,84',
       '-each', 'id = ADM0_A3; if (id == "CYN") id = "CYP"; if (id == "ALD") id = "FIN";'
                ' if (["GGY", "JEY", "IMN"].indexOf(id) > -1) id = "GBR";',
       '-explode',
       # Krim: völkerrechtlich Ukraine (so auch in österreichischen Schulatlanten)
       '-each', 'if (ADM0_A3 == "RUS" && this.centroidX > 32 && this.centroidX < 37 && this.centroidY > 44 && this.centroidY < 46.4) id = "UKR"',
       '-dissolve2', 'id',
       '-proj', LAEA_EU,
       '-clip', 'bbox=' + ','.join(map(str, EU_FRAME)),
       '-o', 'format=geojson', raw)
    nb = neighbours(load(raw)['features'])
    simp = tmp('eu-simp.json')
    ms(raw, '-simplify', 'interval=2500', 'keep-shapes', '-o', 'format=geojson', simp)
    fr = Frame(*EU_FRAME)
    inner = inner_points(simp, 'id')
    caps = project_points(EU_CAPITALS, LAEA_EU, 'eu-caps')
    regions = {}
    for f in load(simp)['features']:
        k = f['properties']['id']
        if not f['geometry']:
            continue
        regions[k] = {'d': path_d(f['geometry'], fr), 'b': bbox_main(f['geometry'], fr),
                      'p': list(fr.t(*inner[k])) if k in inner else None}
    cities = {k: list(fr.t(*v)) for k, v in caps.items()}
    return {'w': W, 'h': fr.h, 'r': regions, 'c': cities, 'n': nb}


# ================================================================
# Österreich
# ================================================================
LAEA_AT = '+proj=laea +lat_0=47.6 +lon_0=13.3 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'
AT_IDS = {'Burgenland': 'bgld', 'Kärnten': 'ktn', 'Niederösterreich': 'noe', 'Oberösterreich': 'ooe',
          'Salzburg': 'sbg', 'Steiermark': 'stmk', 'Tirol': 'tirol', 'Vorarlberg': 'vbg', 'Wien': 'wien'}
AT_CAPITALS = {
    'bgld': (16.5233, 47.8456), 'ktn': (14.3053, 46.6247), 'noe': (15.6256, 48.2047), 'ooe': (14.2858, 48.3069),
    'sbg': (13.055, 47.8095), 'stmk': (15.4395, 47.0707), 'tirol': (11.4041, 47.2692), 'vbg': (9.7471, 47.5031),
    'wien': (16.3738, 48.2082),
}
AT_MARKS = {'glockner': (12.6947, 47.0742)}
AT_NEIGHBOUR_LABELS = {   # Lage des Namens; Ausrichtung (start/middle/end) steht in app.js
    'DEU': (11.4, 48.85), 'CZE': (15.2, 49.2), 'SVK': (17.62, 48.62), 'HUN': (17.62, 47.25),
    'SVN': (15.1, 46.2), 'ITA': (11.6, 46.3), 'CHE': (9.3, 46.5), 'LIE': (9.42, 47.2),
}
AT_LAKES = ['Bodensee', 'Neusiedler', 'Attersee', 'Traunsee', 'Wörthersee', 'Millstätter', 'Ossiacher',
            'Achensee', 'Mondsee', 'Wolfgangsee', 'Chiemsee', 'Gardasee', 'Plattensee', 'Balaton']


def build_austria():
    states = tmp('at-states.json')
    ms(src('at', 'laender_995_geo.json'), '-proj', LAEA_AT, '-o', 'format=geojson', states)
    sf = load(states)['features']
    for f in sf:
        f['properties']['id'] = AT_IDS[f['properties']['name']]
    dump('at-states-id.json', fc(sf))
    nb = neighbours(sf)
    x0, y0, x1, y1 = bounds_of(sf)
    wx = x1 - x0
    frame = (x0 - wx * 0.05, y0 - wx * 0.07, x1 + wx * 0.06, y1 + wx * 0.07)
    fr = Frame(*frame)
    bbox = 'bbox=' + ','.join(str(round(v)) for v in frame)

    simp = tmp('at-simp.json')
    ms(tmp('at-states-id.json'), '-simplify', 'interval=280', 'keep-shapes', '-o', 'format=geojson', simp)
    inner = inner_points(simp, 'id')

    land = tmp('at-land.json')
    lines = tmp('at-lines.json')
    countries = '["DEU","CZE","SVK","HUN","SVN","ITA","CHE","LIE","HRV","AUT","POL"]'
    ms(src('ne', 'ne_50m_admin_0_countries_lakes.geojson'), '-filter', countries + '.indexOf(ADM0_A3) > -1',
       '-clip', 'bbox=6,44,20,51.5', '-proj', LAEA_AT, '-clip', bbox,
       '-each', 'id = ADM0_A3', '-o', 'format=geojson', land)
    ms(land, '-filter', 'id != "AUT"', '-innerlines', '-o', 'format=geojson', lines)

    lakes = []
    for name in ('ne_10m_lakes_europe.geojson', 'ne_10m_lakes.geojson'):
        p_out = tmp('at-' + name)
        ms(src('ne', name), '-clip', 'bbox=8.5,45.4,18.2,49.6', '-proj', LAEA_AT, '-clip', bbox,
           '-o', 'format=geojson', p_out)
        for f in load(p_out)['features']:
            n = (f['properties'].get('name_de') or '') + ' ' + (f['properties'].get('name') or '')
            if f['geometry'] and any(k.lower() in n.lower() for k in AT_LAKES):
                lakes.append((n.strip(), f['geometry']))
    seen, lake_d = set(), []
    for n, g in lakes:
        key = n.split(' ')[0]
        if key in seen:
            continue
        seen.add(key)
        lake_d.append(path_d(g, fr))

    river = tmp('at-river.json')
    ms(src('ne', 'ne_10m_rivers_lake_centerlines.geojson'), '-filter', 'name == "Donau" || name == "Danube"',
       '-clip', 'bbox=8,45,19,50', '-proj', LAEA_AT, '-clip', bbox, '-o', 'format=geojson', river)

    caps = project_points(AT_CAPITALS, LAEA_AT, 'at-caps')
    marks = project_points(AT_MARKS, LAEA_AT, 'at-marks')
    nlab = project_points(AT_NEIGHBOUR_LABELS, LAEA_AT, 'at-nlab')

    regions = {}
    for f in load(simp)['features']:
        k = f['properties']['id']
        regions[k] = {'d': path_d(f['geometry'], fr), 'b': bbox_main(f['geometry'], fr),
                      'p': list(fr.t(*inner[k]))}
    return {
        'w': W, 'h': fr.h, 'r': regions, 'n': nb,
        'c': {k: list(fr.t(*v)) for k, v in caps.items()},
        'm': {k: list(fr.t(*v)) for k, v in marks.items()},
        'nl': {k: list(fr.t(*v)) for k, v in nlab.items()},
        'land': ''.join(path_d(f['geometry'], fr) for f in load(land)['features'] if f['geometry']),
        'borders': ''.join(path_d(f['geometry'], fr, closed=False) for f in load(lines)['features'] if f['geometry']),
        'lakes': ''.join(lake_d),
        'river': ''.join(path_d(f['geometry'], fr, closed=False) for f in load(river)['features'] if f['geometry']),
    }


# ================================================================
# Welt: Kontinente + Ozeane
# ================================================================
WORLD_PROJ = '+proj=robin +lon_0=0 +R=6371000 +units=m +no_defs'
CONT_IDS = {'Europe': 'europa', 'Asia': 'asien', 'Africa': 'afrika', 'North America': 'nordamerika',
            'South America': 'suedamerika', 'Oceania': 'ozeanien', 'Antarctica': 'antarktis'}

# Grenze Europa/Asien: Ural, Uralfluss, Kaukasus (Russland westlich davon = Europa)
URAL_ASIA = [(72, 85), (72, 77.5), (67, 72.5), (67, 70), (66, 68.5), (65.5, 67.5), (60, 64.5), (59.3, 61),
             (59.5, 58), (59.8, 55), (59, 52.5), (58.5, 50.5), (58.5, 40), (180, 40), (180, 85), (72, 85)]
CHUKOTKA = [(-180, 40), (-160, 40), (-160, 85), (-180, 85), (-180, 40)]
THRACE = [(25.5, 42.3), (28.2, 42.3), (29.05, 41.25), (28.9, 40.95), (27.5, 40.85), (26.7, 40.45),
          (26.2, 40.05), (25.5, 40.0), (25.5, 42.3)]
NEW_GUINEA = [(130.9, 0.5), (141.5, 0.5), (141.5, -10.5), (130.9, -10.5), (130.9, 0.5)]
FRENCH_GUIANA = [(-55, 1.5), (-51, 1.5), (-51, 6.5), (-55, 6.5), (-55, 1.5)]

# Ozeane: Grenzen im offenen Meer folgen den üblichen Linien (Kap Hoorn, Kap Agulhas, Tasmanien,
# 60° Süd, Polarkreis); wo eine Grenze über Land läuft, liegt der Kontinent ohnehin darüber.
ARCTIC_LAT = 66.56
AMERICA = [(-67.3, -60), (-67.3, -55.9), (-68.0, -54.2), (-71.0, -50.0), (-69.0, -40.0), (-65.0, -25.0),
           (-62.0, -10.0), (-62.0, 0.0), (-66.0, 6.0), (-75.0, 6.0), (-77.4, 8.2), (-80.5, 8.4), (-84.4, 10.6),
           (-85.6, 12.5), (-87.5, 14.5), (-90.5, 15.5), (-94.5, 17.0), (-100.0, 21.0), (-104.0, 28.0),
           (-105.0, 40.0), (-105.0, 60.0), (-105.0, ARCTIC_LAT)]
AFRICA = [(20, -60), (20, -34.6), (20, 0), (25, 5), (30, 20), (32.0, 29.0), (32.3, 30.5)]
EURASIA_W = [(32.3, 30.5), (35.5, 32.0), (37, 35), (42, 39), (44, 42.5), (45, 46), (45, 50), (35, 58), (30, 63),
             (25.5, 66.4), (15, ARCTIC_LAT)]
ASIA_S = [(32.3, 30.5), (40, 30), (50, 33), (60, 30), (75, 25), (90, 26), (98.5, 17), (99.2, 12.5),
          (99.0, 10.5), (99.6, 8.0), (100.6, 6.3), (101.5, 4.0), (102.0, 0.0), (104.5, -4.5), (106.0, -6.3),
          (110, -7.2), (114, -8.0), (121, -8.6), (125, -9.2), (131.0, -12.8), (135.0, -25.0), (146.5, -41.8),
          (146.9, -43.6)]
ASIA_E = [(98.5, 17), (100, 40), (100, ARCTIC_LAT)]


def dense(pts, step=2.0):
    out = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / step))
        out += line(a, b, n)
    out.append(pts[-1])
    return out


def ocean_polygons():
    def lat_run(lon_a, lon_b, lat):
        return dense([(lon_a, lat), (lon_b, lat)])
    atlantic = chain(dense(AMERICA), lat_run(-105, 15, ARCTIC_LAT), dense(list(reversed(EURASIA_W))),
                     dense(list(reversed(AFRICA))), lat_run(20, -67.3, -60))
    indian = chain(dense(AFRICA), dense(ASIA_S), dense([(146.9, -43.6), (146.9, -60)]), lat_run(146.9, 20, -60))
    asia_s_rev = list(reversed(ASIA_S))
    idx = asia_s_rev.index((98.5, 17))
    pacific_w = chain(dense([(146.9, -60), (146.9, -43.6)]), dense(asia_s_rev[:idx + 1]), dense(ASIA_E),
                      lat_run(100, 180, ARCTIC_LAT), dense([(180, ARCTIC_LAT), (180, -60)]), lat_run(180, 146.9, -60))
    pacific_e = chain(lat_run(-180, -67.3, -60), dense(AMERICA), lat_run(-105, -180, ARCTIC_LAT),
                      dense([(-180, ARCTIC_LAT), (-180, -60)]))
    southern = chain(lat_run(-180, 180, -60), dense([(180, -60), (180, -90)]), lat_run(180, -180, -90),
                     dense([(-180, -90), (-180, -60)]))
    return [polygon(atlantic, id='atlantik'), polygon(indian, id='indik'), polygon(pacific_w, id='pazifik'),
            polygon(pacific_e, id='pazifik'), polygon(southern, id='suedpolarmeer')]


def build_world():
    base = src('ne', 'ne_110m_admin_0_countries.geojson')
    parts = []

    def piece(name, flt, clip_poly, mode, cont):
        out = tmp('w-' + name + '.json')
        args = [base, '-filter', flt]
        if clip_poly:
            args += ['-' + mode, dump('w-' + name + '-clip.json', fc(clip_poly))]
        args += ['-each', 'cont = "%s"' % cont, '-o', 'format=geojson', out]
        ms(*args)
        parts.append(out)

    ural = [polygon(URAL_ASIA), polygon(CHUKOTKA)]
    piece('rus-asia', 'ADM0_A3 == "RUS"', ural, 'clip', 'Asia')
    piece('rus-eu', 'ADM0_A3 == "RUS"', ural, 'erase', 'Europe')
    piece('tur-eu', 'ADM0_A3 == "TUR"', [polygon(THRACE)], 'clip', 'Europe')
    piece('tur-asia', 'ADM0_A3 == "TUR"', [polygon(THRACE)], 'erase', 'Asia')
    piece('idn-ng', 'ADM0_A3 == "IDN"', [polygon(NEW_GUINEA)], 'clip', 'Oceania')
    piece('idn-asia', 'ADM0_A3 == "IDN"', [polygon(NEW_GUINEA)], 'erase', 'Asia')
    piece('fra-guf', 'ADM0_A3 == "FRA"', [polygon(FRENCH_GUIANA)], 'clip', 'South America')
    piece('fra-eu', 'ADM0_A3 == "FRA"', [polygon(FRENCH_GUIANA)], 'erase', 'Europe')
    rest = tmp('w-rest.json')
    ms(base, '-filter', '["RUS", "TUR", "IDN", "FRA"].indexOf(ADM0_A3) == -1 && CONTINENT != "Seven seas (open ocean)"',
       '-each', 'cont = CONTINENT', '-o', 'format=geojson', rest)
    parts.append(rest)

    merged = tmp('w-merged.json')
    ms('-i', *parts, 'combine-files', '-merge-layers', 'force', '-each', 'id = ' + json.dumps(CONT_IDS) + '[cont]',
       '-filter', '!!id', '-dissolve2', 'id', '-proj', WORLD_PROJ, '-simplify', 'interval=9000', 'keep-shapes',
       '-o', 'format=geojson', merged)
    cf = load(merged)['features']
    inner = inner_points(merged, 'id')

    # Kugel (Kartenrand) und Ozeane
    sphere_ll = chain(dense([(-180, -90), (-180, 90)]), dense([(-180, 90), (180, 90)]),
                      dense([(180, 90), (180, -90)]), dense([(180, -90), (-180, -90)]))
    sphere = tmp('w-sphere.json')
    ms(dump('w-sphere-ll.json', fc([polygon(sphere_ll, id='sphere')])), '-proj', WORLD_PROJ, 'densify',
       '-o', 'format=geojson', sphere)
    oceans_p = tmp('w-oceans.json')
    ms(dump('w-oceans-ll.json', fc(ocean_polygons())), '-proj', WORLD_PROJ, 'densify', '-o', 'format=geojson', oceans_p)
    arctic = tmp('w-arctic.json')
    ms(sphere, '-erase', oceans_p, '-each', 'id = "nordpolarmeer"', '-o', 'format=geojson', arctic)
    lakes = tmp('w-lakes.json')
    ms(src('ne', 'ne_110m_lakes.geojson'), '-proj', WORLD_PROJ, '-o', 'format=geojson', lakes)

    sph = load(sphere)['features'][0]
    x0, y0, x1, y1 = bounds_of([sph])
    fr = Frame(x0, y0, x1, y1)
    regions = {}
    for f in cf:
        k = f['properties']['id']
        regions[k] = {'d': path_d(f['geometry'], fr), 'b': bbox_main(f['geometry'], fr), 'p': list(fr.t(*inner[k]))}
    oceans = {}
    for f in load(oceans_p)['features'] + load(arctic)['features']:
        k = f['properties']['id']
        oceans[k] = oceans.get(k, '') + path_d(f['geometry'], fr)
    ocean_labels = {
        'pazifik': [(-140, 2), (162, 12)], 'atlantik': [(-38, 28), (-17, -22)], 'indik': [(77, -20)],
        'nordpolarmeer': [(-8, 79)], 'suedpolarmeer': [(-110, -63.5)],
    }
    flat = {'%s-%d' % (k, i): ll for k, lst in ocean_labels.items() for i, ll in enumerate(lst)}
    lab = project_points(flat, WORLD_PROJ, 'w-olab')
    olab = {}
    for key, xy in lab.items():
        olab.setdefault(key.rsplit('-', 1)[0], []).append(list(fr.t(*xy)))
    return {
        'w': W, 'h': fr.h, 'r': regions, 'o': oceans, 'ol': olab,
        'sphere': path_d(sph['geometry'], fr),
        'lakes': ''.join(path_d(f['geometry'], fr) for f in load(lakes)['features'] if f['geometry']),
    }


if __name__ == '__main__':
    maps = {'austria': build_austria(), 'europe': build_europe(), 'world': build_world()}
    head = ('/* Geo Legends – Kartendaten (automatisch erzeugt mit tools/build_maps.py, nicht von Hand ändern)\n'
            '   Quellen: Natural Earth (gemeinfrei), Bundesländer: Statistik Austria (CC BY 4.0) */\n')
    with open(OUT, 'w') as f:
        f.write(head + 'window.MAPS = ' + json.dumps(maps, ensure_ascii=False, separators=(',', ':')) + ';\n')
    for k, m in maps.items():
        print(k, 'h=%s' % m['h'], 'regions=%d' % len(m['r']), 'bytes=%d' % len(json.dumps(m, separators=(',', ':'))))
    print('neighbours AUT:', maps['europe']['n'].get('AUT'))
    print('austria nb:', maps['austria']['n'])
