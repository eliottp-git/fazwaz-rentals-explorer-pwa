// fazwaz-rentals — Express server (local-webapps pattern)
const express = require('express');
const path = require('path');
const fs = require('fs');
const fw = require('./lib/fazwaz');

const app = express();
const PORT = process.env.PORT || 3100;
// Base path for the PWA manifest/service-worker scope. The hub proxy serves
// this app under /fazwaz-rentals; standalone users can leave the default since
// all routes are mounted at root too.
const BASE_PATH = process.env.BASE_PATH || '/fazwaz-rentals';

// data/ holds runtime user files (favourites, notes, saved searches…).
// filters.json ships in the repo; everything else is created on demand so a
// fresh clone works out of the box.
fs.mkdirSync(path.join(__dirname, 'data', 'cache'), { recursive: true });

// PWA: manifest + service worker + register script (must come before static).
// lib/pwa.js is a vendored copy of the hub's shared _shared/pwa.js so the repo
// is self-contained; all routes are mounted under both BASE_PATH and '/' so
// the app works standalone (no hub) and behind the hub proxy.
const mountPwa = require('./lib/pwa').mountPwa;
mountPwa(app, {
  base: BASE_PATH, name: 'fazwaz-rentals', title: 'FazWaz Rentals', shortName: 'FazWaz',
  themeColor: '#006CE3', backgroundColor: '#f5f7fa', version: 'v1',
  assets: ['/', '/style.css', '/app.js'],
});
mountPwa(app, {
  base: '', name: 'fazwaz-rentals', title: 'FazWaz Rentals', shortName: 'FazWaz',
  themeColor: '#006CE3', backgroundColor: '#f5f7fa', version: 'v1',
  assets: ['/', '/style.css', '/app.js'],
});

app.use(express.json());

// API routers — mounted at root AND prefixed (hub forwards full path, no strip)
const api = express.Router();
api.get('/filters', (req, res) => {
  res.sendFile(path.join(__dirname, 'data', 'filters.json'));
});

api.get('/search', async (req, res) => {
  try {
    const page = Math.min(Math.max(parseInt(req.query.page || '1', 10) || 1, 1), 25);
    const params = { ...req.query };
    delete params.page;
    const payload = await fw.orSearch(params, page);
    res.json(payload);
  } catch (e) {
    res.status(502).json({ error: 'search failed', detail: String(e.message || e) });
  }
});

api.get('/count', async (req, res) => {
  try {
    const params = { ...req.query };
    delete params.page;
    res.json(await fw.orCountOnly(params));
  } catch (e) {
    res.status(502).json({ error: 'count failed', detail: String(e.message || e) });
  }
});

api.get('/listing/:id', async (req, res) => {
  try {
    res.json(await fw.listing(req.params.id, req.query.url));
  } catch (e) {
    res.status(502).json({ error: 'listing failed', detail: String(e.message || e) });
  }
});

api.get('/listing/:id/pois', async (req, res) => {
  try {
    res.json(await fw.pois(req.params.id));
  } catch (e) {
    res.status(502).json({ error: 'pois failed', detail: String(e.message || e) });
  }
});

// ---------- project pages (rentals) ----------
api.get('/project', async (req, res) => {
  try {
    if (!req.query.url) return res.status(400).json({ error: 'url required' });
    res.json(await fw.project(req.query.url));
  } catch (e) {
    res.status(502).json({ error: 'project failed', detail: String(e.message || e) });
  }
});

api.get('/project/:id/units', async (req, res) => {
  try {
    res.json(await fw.projectUnits(req.params.id));
  } catch (e) {
    res.status(502).json({ error: 'project units failed', detail: String(e.message || e) });
  }
});

api.get('/project/:id/pois', async (req, res) => {
  try {
    res.json(await fw.projectPois(req.params.id));
  } catch (e) {
    res.status(502).json({ error: 'project pois failed', detail: String(e.message || e) });
  }
});

// ---------- projects section (directory corpus + name search + enrich) ----------
// deterministic shuffle so /api/projects pages are stable between requests
function seededShuffle(arr, seedStr) {
  let h = 2166136261;
  for (const c of String(seedStr)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rand = () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PROJECT_DIRS_PER_REQ = 12; // directory pages per request (~24-30 projects)

api.get('/projects', async (req, res) => {
  try {
    const region = String(req.query.region || '/thailand/bangkok');
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const { dirs } = await fw.projectDirSitemap();
    // region filter must match the path SEGMENT (…/project-directory/<region-path>/<city>/…):
    // a plain prefix also matches sibling cities (e.g. /chon-buri/pattaya picks up
    // /chon-buri/si-racha pages, which border it in the sitemap order)
    const filtered = region && region !== 'all'
      ? dirs.filter(d => {
          const tail = d.slice(d.indexOf('/project-directory/') + '/project-directory/'.length);
          return tail.startsWith(region.replace(/^\//, '') + '/');
        })
      : dirs.slice();
    const slice = filtered.slice((page - 1) * PROJECT_DIRS_PER_REQ, page * PROJECT_DIRS_PER_REQ);
    const regionPrefix = region && region !== 'all' ? region : null;
    const results = await Promise.all(slice.map(u => fw.projectDirectory(u, { regionPrefix }).catch(() => null)));
    let cards = [];
    for (const r of results) if (r && r.cards) cards.push(...r.cards);
    const seen = new Set();
    cards = cards.filter(c => c.projectId && !seen.has(c.projectId) && seen.add(c.projectId));
    cards = seededShuffle(cards, region + ':' + page);
    res.json({
      page,
      total: cards.length,
      hasMore: page * PROJECT_DIRS_PER_REQ < filtered.length,
      dirsTotal: filtered.length,
      cards,
    });
  } catch (e) {
    res.status(502).json({ error: 'projects failed', detail: String(e.message || e) });
  }
});

// project NAME search (upstream auto-complete — typo-tolerant, returns canonical urls)
api.get('/projects/search', async (req, res) => {
  try {
    res.json({ results: await fw.projectSuggest(req.query.q) });
  } catch (e) {
    res.status(502).json({ error: 'project search failed', detail: String(e.message || e) });
  }
});

// hydrate directory cards with project-page data (amenities, facts, geo, gallery).
// POST { urls: [...] } -> { projects: { [url]: payload|null } }
api.post('/projects/enrich', async (req, res) => {
  try {
    const urls = (Array.isArray(req.body && req.body.urls) ? req.body.urls : [])
      .filter(u => /^https:\/\/www\.fazwaz\.com\/projects\//.test(u))
      .slice(0, 40);
    const pairs = await Promise.all(urls.map(async u => {
      try { return [u, await fw.project(u)]; } catch { return [u, null]; }
    }));
    const projects = {};
    for (const [u, p] of pairs) projects[u] = p;
    res.json({ projects });
  } catch (e) {
    res.status(502).json({ error: 'enrich failed', detail: String(e.message || e) });
  }
});

// ---------- project favourites (JSON file: data/project-favourites.json) ----------
const PFAVS_PATH = path.join(__dirname, 'data', 'project-favourites.json');

function readProjFavs() {
  try { return JSON.parse(fs.readFileSync(PFAVS_PATH, 'utf8')); } catch { return []; }
}
function writeProjFavs(list) {
  const tmp = PFAVS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, PFAVS_PATH);
}

api.get('/project-favourites', (req, res) => {
  const all = readProjFavs().sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  res.json({ total: all.length, ids: all.map(x => x.projectId), favourites: all });
});

api.post('/project-favourites', (req, res) => {
  const { projectId, snapshot } = req.body || {};
  if (!projectId || !snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ error: 'projectId and snapshot required' });
  }
  const list = readProjFavs();
  const item = { projectId: String(projectId), savedAt: new Date().toISOString(), snapshot };
  const i = list.findIndex(x => x.projectId === String(projectId));
  if (i >= 0) list[i] = item; else list.push(item);
  writeProjFavs(list);
  res.json(item);
});

api.delete('/project-favourites/:projectId', (req, res) => {
  const list = readProjFavs();
  const i = list.findIndex(x => x.projectId === req.params.projectId);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [removed] = list.splice(i, 1);
  writeProjFavs(list);
  res.json({ ok: true, projectId: removed.projectId });
});

// ---------- saved searches (JSON file: data/saved-searches.json) ----------
const SAVED_PATH = path.join(__dirname, 'data', 'saved-searches.json');

function readSaved() {
  try { return JSON.parse(fs.readFileSync(SAVED_PATH, 'utf8')); } catch { return []; }
}
function writeSaved(list) {
  const tmp = SAVED_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, SAVED_PATH);
}
const uid = () => {
  // short human-friendly ref: S-<4-char base36>, unique within the file
  const list = readSaved();
  const taken = new Set(list.map(x => x.id));
  let id;
  do {
    id = 'S-' + Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, '0');
  } while (taken.has(id));
  return id;
};

api.get('/saved', (req, res) => res.json(readSaved()));

api.post('/saved', (req, res) => {
  const { title, search } = req.body || {};
  if (!title || !search || typeof search !== 'object' || !search.params) {
    return res.status(400).json({ error: 'title and search{region,order,params} required' });
  }
  const list = readSaved();
  const item = {
    id: uid(),
    title: String(title).slice(0, 80),
    createdAt: new Date().toISOString(),
    search: { region: String(search.region || ''), order: String(search.order || ''), params: search.params },
  };
  list.push(item);
  writeSaved(list);
  res.json(item);
});

api.patch('/saved/:id', (req, res) => {
  const body = req.body || {};
  const hasTitle = typeof body.title === 'string' && body.title.trim();
  const hasDefault = typeof body.isDefault === 'boolean';
  if (!hasTitle && !hasDefault) return res.status(400).json({ error: 'title or isDefault required' });
  // accept either the raw id or the S-XXXX display form
  const raw = req.params.id.replace(/^S-/i, '');
  const list = readSaved();
  const item = list.find(x => x.id === req.params.id || x.id === raw || 'S-' + x.id.toUpperCase() === req.params.id.toUpperCase());
  if (!item) return res.status(404).json({ error: 'not found' });
  if (hasTitle) item.title = String(body.title).slice(0, 80);
  if (hasDefault) {
    // exactly one default at a time — clearing all others is part of the same atomic write
    if (body.isDefault) list.forEach(x => { x.isDefault = x === item; });
    else delete item.isDefault;
  }
  writeSaved(list);
  res.json(item);
});

api.delete('/saved/:id', (req, res) => {
  const list = readSaved();
  const i = list.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [removed] = list.splice(i, 1);
  writeSaved(list);
  res.json({ ok: true, id: removed.id });
});

// ---------- favourites (JSON file: data/favourites.json) ----------
const FAVS_PATH = path.join(__dirname, 'data', 'favourites.json');

function readFavs() {
  try { return JSON.parse(fs.readFileSync(FAVS_PATH, 'utf8')); } catch { return []; }
}
function writeFavs(list) {
  const tmp = FAVS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, FAVS_PATH);
}

api.get('/favourites', async (req, res) => {
  try {
    const all = readFavs().sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    const hasFilter = MULTI_FILTER_KEYS.some(k => req.query[k] != null)
      || RANGE_FILTER_KEYS.some(k => req.query[k] != null);
    if (!hasFilter) {
      return res.json({ total: all.length, ids: all.map(x => x.unitId), favourites: all });
    }
    const filt = { multi: {}, ranges: {} };
    for (const k of MULTI_FILTER_KEYS) if (req.query[k] != null) filt.multi[k] = req.query[k];
    for (const k of RANGE_FILTER_KEYS) if (req.query[k] != null) {
      const [a, b] = String(req.query[k]).split(',');
      filt.ranges[k] = [a === 'null' ? null : parseFloat(a), b === 'null' ? null : parseFloat(b)];
    }
    const needPois = filt.multi.near_by !== undefined;
    const pairs = await Promise.all(all.map(async f => {
      let pois = null;
      if (needPois) { try { pois = (await fw.pois(f.unitId)).pois; } catch { pois = null; } }
      return [f, pois];
    }));
    const favourites = pairs.filter(([f, pois]) => favDetailMatches(f, filt, pois)).map(([f]) => f);
    res.json({ total: favourites.length, ids: all.map(x => x.unitId), favourites });
  } catch (e) {
    res.status(502).json({ error: 'favourites failed', detail: String(e.message || e) });
  }
});

// filter keys that can be applied to stored favourite snapshots
const MULTI_FILTER_KEYS = ['beds', 'type', 'projectFeatures', 'projectAmenities', 'views', 'near_by', 'pets', 'furniture', 'source'];
const RANGE_FILTER_KEYS = ['monthly_price', 'living_area', 'floors', 'storeys', 'land_plot', 'year_built'];
// near_by chip id -> POI category from /api/location-matrix
const FAV_NEARBY_MAP = { '158': 'bts-station', '159': 'mrt-station', '160': 'airport-rail-link-station' };

// '|' separates parts; a part with '+' is an OR group; plain parts are comma lists
function splitFilterValue(v) {
  const plain = [], groups = [];
  for (const p of String(v).split('|')) {
    if (p.includes('+')) groups.push(p.split('+').filter(Boolean));
    else plain.push(...p.split(',').filter(Boolean));
  }
  return { plain, groups };
}
const unionIds = v => { const { plain, groups } = splitFilterValue(v); return [...new Set([...plain, ...groups.flat()])]; };

// apply the active filters to one favourite's stored snapshot data.
// projectFeatures/projectAmenities/views/source aren't parsed from detail
// pages, so they can't be verified and are treated as no-ops (include).
function favDetailMatches(f, filt, pois) {
  const s = f.snapshot || {};
  const d = s.d || null;
  const c = s.c || {};
  const kv = (d && d.basicInfo) || {};
  // beds — OR-native, exact values (Studio, 1..4)
  if (filt.multi.beds !== undefined) {
    const ids = unionIds(filt.multi.beds);
    const bv = d && d.beds != null ? String(d.beds) : null;
    if (!bv || !ids.includes(bv)) return false;
  }
  // type — AND-native upstream, but a listing has one type
  if (filt.multi.type !== undefined) {
    const { plain, groups } = splitFilterValue(filt.multi.type);
    const t = d && d.type ? String(d.type).toLowerCase() : null;
    if (!t) return false;
    if (plain.length > 1) return false; // AND of two types can never match
    if (plain.length === 1 && plain[0].toLowerCase() !== t) return false;
    if (groups.length && !groups.some(g => g.some(id => id.toLowerCase() === t))) return false;
  }
  // pets — OR-native, substring of the detail Pets field
  if (filt.multi.pets !== undefined) {
    const ids = unionIds(filt.multi.pets);
    const pets = (kv['Pets'] || '').toLowerCase();
    if (!ids.some(id => pets.includes(id.toLowerCase()))) return false;
  }
  // furniture
  if (filt.multi.furniture !== undefined) {
    const ids = unionIds(filt.multi.furniture);
    const fu = (kv['Furniture'] || '').toLowerCase();
    const ok = ids.some(id => id === 'fully-furnished'
      ? fu.includes('fully')
      : fu.includes('unfurnished') || fu.includes('not furnished'));
    if (!ok) return false;
  }
  // near_by — OR-native via POI categories; unknown (POI fetch failed) -> include
  if (filt.multi.near_by !== undefined) {
    const cats = unionIds(filt.multi.near_by).map(id => FAV_NEARBY_MAP[id]).filter(Boolean);
    if (cats.length && pois) {
      const have = new Set(pois.map(p => p.category_clean_name));
      if (!cats.some(cat => have.has(cat))) return false;
    }
  }
  // ranges — unknown values exclude (same as upstream filtering them out);
  // storeys/land_plot aren't in stored data -> no-op
  for (const [k, [min, max]] of Object.entries(filt.ranges)) {
    let raw = null;
    if (k === 'monthly_price') raw = c.price != null ? c.price : (d && d.price);
    else if (k === 'living_area') raw = d && d.sqm;
    else if (k === 'floors') raw = d && d.floor;
    else if (k === 'year_built') raw = d && d.completed ? (String(d.completed).match(/\d{4}/) || [null])[0] : null;
    else continue;
    const n = parseFloat(raw);
    if (raw == null || isNaN(n)) return false;
    if (min != null && n < min) return false;
    if (max != null && n > max) return false;
  }
  return true;
}

api.post('/favourites', (req, res) => {
  const { unitId, snapshot } = req.body || {};
  if (!unitId || !snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ error: 'unitId and snapshot required' });
  }
  const list = readFavs();
  const item = { unitId: String(unitId), savedAt: new Date().toISOString(), snapshot };
  const i = list.findIndex(x => x.unitId === String(unitId));
  if (i >= 0) list[i] = item; else list.push(item);
  writeFavs(list);
  res.json(item);
});

api.delete('/favourites/:unitId', (req, res) => {
  const list = readFavs();
  const i = list.findIndex(x => x.unitId === req.params.unitId);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [removed] = list.splice(i, 1);
  writeFavs(list);
  res.json({ ok: true, unitId: removed.unitId });
});

// ---------- applied marks (JSON file: data/applied.json) ----------
// Tracks which properties the user has applied to. Item = { unitId, appliedAt }.
const APPLIED_PATH = path.join(__dirname, 'data', 'applied.json');

function readApplied() {
  try { return JSON.parse(fs.readFileSync(APPLIED_PATH, 'utf8')); } catch { return []; }
}
function writeApplied(list) {
  const tmp = APPLIED_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, APPLIED_PATH);
}

api.get('/applied', (req, res) => {
  const all = readApplied().sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  res.json({ total: all.length, ids: all.map(x => x.unitId), applied: all });
});

api.post('/applied', (req, res) => {
  const { unitId } = req.body || {};
  if (!unitId) return res.status(400).json({ error: 'unitId required' });
  const list = readApplied();
  const item = { unitId: String(unitId), appliedAt: new Date().toISOString() };
  const i = list.findIndex(x => x.unitId === String(unitId));
  if (i >= 0) list[i] = item; else list.push(item);
  writeApplied(list);
  res.json(item);
});

api.delete('/applied/:unitId', (req, res) => {
  const list = readApplied();
  const i = list.findIndex(x => x.unitId === req.params.unitId);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [removed] = list.splice(i, 1);
  writeApplied(list);
  res.json({ ok: true, unitId: removed.unitId });
});

// ---------- per-listing notes (JSON file: data/notes.json) ----------
// unitId -> { text, updatedAt }. Saving empty text removes the entry.
const NOTES_PATH = path.join(__dirname, 'data', 'notes.json');

function readNotes() {
  try { return JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8')); } catch { return {}; }
}
function writeNotes(obj) {
  const tmp = NOTES_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, NOTES_PATH);
}

api.get('/notes', (req, res) => {
  res.json(readNotes());
});

api.put('/notes/:unitId', (req, res) => {
  const text = String((req.body || {}).text || '');
  const unitId = String(req.params.unitId);
  const notes = readNotes();
  if (!text.trim()) {
    delete notes[unitId];
    writeNotes(notes);
    return res.json({ ok: true, unitId, text: '' });
  }
  const item = { text, updatedAt: new Date().toISOString() };
  notes[unitId] = item;
  writeNotes(notes);
  res.json({ ok: true, unitId, ...item });
});

app.use('/api', api);
app.use(BASE_PATH + '/api', api);

// ---------- Longdo map key (shared with JobThai via /workspace/secrets/longdo.env) ----------
let LONGDO_KEY = process.env.LONGDO_API_KEY || '';
if (!LONGDO_KEY) {
  try {
    const line = fs.readFileSync('/workspace/secrets/longdo.env', 'utf8').split(/\r?\n/)
      .find(l => l.startsWith('LONGDO_API_KEY=') && l.length > 15);
    if (line) LONGDO_KEY = line.split('=').slice(1).join('=').trim();
  } catch { /* file absent -> Leaflet fallback */ }
}
api.get('/longdo-key', (req, res) => res.json({ key: LONGDO_KEY || null }));

// ---------- district boundary (Nominatim, cached 30d — for zoom-to-district map view) ----------
const DISTRICT_CACHE = path.join(__dirname, 'data', 'district-cache.json');
const readDistrictCache = () => { try { return JSON.parse(fs.readFileSync(DISTRICT_CACHE, 'utf8')); } catch { return {}; } };
function writeDistrictCache(c) {
  const tmp = DISTRICT_CACHE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c));
  fs.renameSync(tmp, DISTRICT_CACHE);
}
api.get('/district', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q required' });
  const key = q.toLowerCase();
  const cache = readDistrictCache();
  if (cache[key] && Date.now() - cache[key].t < 30 * 24 * 3600 * 1000) return res.json(cache[key].v);
  try {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    // location strings are "subdistrict, district, city" — query the DISTRICT
    // (last two components) so the boundary is the whole เขต, not the khwaeng
    const parts = key.split(',').map(s => s.trim()).filter(Boolean);
    const districtQ = parts.length >= 2 ? parts.slice(-2).join(', ') : key;
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=1&q='
      + encodeURIComponent(districtQ + ', Thailand');
    // curl with a real UA (Nominatim rejects generic client UAs; curl also matches lib/fazwaz.js)
    const { stdout } = await promisify(execFile)('curl', ['-s', '--max-time', '15', '-A', 'fazwaz-rentals-local/1.0 (local home hub)', url], { timeout: 20000 });
    const hits = JSON.parse(stdout);
    const h = Array.isArray(hits) && hits[0];
    const out = h && h.geojson ? { polygon: h.geojson, display: h.display_name } : null;
    if (out) { cache[key] = { t: Date.now(), v: out }; writeDistrictCache(cache); }
    res.json(out || { error: 'not found' });
  } catch (e) {
    res.status(502).json({ error: 'nominatim failed', detail: String(e.message || e) });
  }
});

// ---------- static (prefixed + root both work behind hub proxy) ----------
const pub = path.join(__dirname, 'public');
app.use(BASE_PATH, express.static(pub));
app.use(express.static(pub));
app.get(BASE_PATH, (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get(BASE_PATH + '/', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get(BASE_PATH + '/favourites', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get('/', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get('/favourites', (req, res) => res.sendFile(path.join(pub, 'index.html')));
// applied section (client renders marked properties at <base>/applied)
app.get(BASE_PATH + '/applied', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get('/applied', (req, res) => res.sendFile(path.join(pub, 'index.html')));
// project page (client renders from ?url=<fazwaz project url>)
app.get(BASE_PATH + '/project', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get('/project', (req, res) => res.sendFile(path.join(pub, 'index.html')));
// projects listing section (client renders the corpus at <base>/projects)
app.get(BASE_PATH + '/projects', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get('/projects', (req, res) => res.sendFile(path.join(pub, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`fazwaz-rentals on ${PORT}`));
