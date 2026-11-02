// fazwaz-rentals — upstream fetcher & parsers
// All params/parse rules verified live on 2026-09-25 (see /workspace/fazwaz/)
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.fazwaz.com';

// ---------- cache ----------
function cachePath(key) {
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(CACHE_DIR, h.slice(0, 2), h + '.json');
}
function cacheGet(key, ttlMs) {
  try {
    const p = cachePath(key);
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}
function cacheSet(key, val) {
  try {
    const p = cachePath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(val));
  } catch { /* cache is best-effort */ }
}

// in-flight dedupe
const inflight = new Map();
async function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------- upstream fetch (via curl — Node TLS fingerprint trips Cloudflare, curl passes) ----------
const { execFile } = require('child_process');

function curlFetch(url, asJson) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sL', '-m', '20',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-w', '\\n__STATUS__%{http_code}',
      '--', url,
    ], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      const idx = stdout.lastIndexOf('\n__STATUS__');
      const status = parseInt(stdout.slice(idx + 11), 10);
      const body = stdout.slice(0, idx);
      resolve({ status, body });
    });
  });
}

// transient curl-level failures (DNS blip, connection reset, timeout) retry
// with backoff; HTTP-level responses (any status) are returned as-is
async function curlFetchRetry(url, asJson) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 700 * attempt));
    try { return await curlFetch(url, asJson); }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function fetchHtml(url) {
  return dedupe(url, async () => {
    const { status, body } = await curlFetchRetry(url);
    return { status, html: body };
  });
}

function fetchJson(url) {
  return dedupe(url, async () => {
    const { status, body } = await curlFetchRetry(url, true);
    if (status !== 200) throw new Error(`upstream ${status}`);
    return JSON.parse(body);
  });
}

// ---------- search URL builder ----------
// Verified param map. Ranges: "min,max" with null for open ends. Multi: comma-joined.
// NEVER use bracket syntax param[min] — silently ignored upstream.
const MULTI_PARAMS = new Set([
  'type', 'projectFeatures', 'projectAmenities', 'views', 'near_by',
  'pets', 'furniture', 'source', 'onlyVideoTourExists',
]);
const RANGE_PARAMS = new Set(['monthly_price', 'living_area', 'floors', 'storeys', 'land_plot', 'year_built']);
const ENUM_SINGLE = new Set(['bedrooms', 'order_by']);

function buildSearchUrl(params, page) {
  // alias: the app's beds chips speak 'beds'; upstream expects 'bedrooms'
  // (upstream bedrooms is OR-natively: bedrooms=1,2 matches either)
  if (params.beds !== undefined && params.bedrooms === undefined) {
    params = { ...params, bedrooms: params.beds };
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' ) continue;
    if (MULTI_PARAMS.has(k)) {
      const arr = Array.isArray(v) ? v : String(v).split(',');
      if (arr.length) qs.set(k, arr.join(','));
    } else if (RANGE_PARAMS.has(k)) {
      const [min, max] = Array.isArray(v) ? v : String(v).split(',');
      qs.set(k, `${min === '' || min === undefined ? 'null' : min},${max === '' || max === undefined ? 'null' : max}`);
    } else if (ENUM_SINGLE.has(k)) {
      qs.set(k, String(v));
    }
  }
  const p = parseInt(page, 10);
  if (p > 1 && p <= 25) qs.set('page', String(p));
  const q = qs.toString();
  return `${BASE}/property-for-rent/thailand/bangkok${q ? '?' + q : ''}`;
}

// ---------- parsers ----------
const CDN_RE = /https:\/\/cdn\.fazwaz\.com\/wbr\/[A-Za-z0-9_-]+\/\d+x\d+\/unit\/\d+\/[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp)/g;

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ').trim();
}

function parseSearch(html) {
  const unesc = html.replace(/\\\//g, '/');
  const mTotal = unesc.match(/"actuallyTotal":(\d+)/);
  const total = mTotal ? parseInt(mTotal[1], 10) : null;

  // thumbnails per unit from card markup
  const thumbs = {}; // unitId -> [{size,url}]
  for (const u of unesc.match(CDN_RE) || []) {
    const m = u.match(/\/(\d+x\d+)\/unit\/(\d+)\//);
    if (!m) continue;
    const [, size, id] = m;
    (thumbs[id] = thumbs[id] || []).push({ size, url: u });
  }

  // unit cards: split on unit-header; each has data-id and a detail link
  const cards = [];
  const seen = new Set();
  const parts = unesc.split('class="unit-header');
  for (const part of parts.slice(1)) {
    const idm = part.match(/data-id="(\d+)"/);
    if (!idm) continue;
    const id = idm[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const link = part.match(/href="(https:\/\/www\.fazwaz\.com\/property-rent\/[^"]+-u\d+)"/)
              || part.match(/href="(\/property-rent\/[^"]+-u\d+)"/);
    const title = part.match(/unit-info_title[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/)
               || part.match(/title="([^"]{10,120})"/);
    const price = part.match(/฿\s?([0-9,]{3,})/);
    const sqm = part.match(/([0-9,]+)\s?SqM/i);
    const beds = part.match(/(Studio|\d+)\s*Bed/i);
    cards.push({
      unitId: id,
      title: title ? title[1].trim() : null,
      price: price ? parseInt(price[1].replace(/,/g, ''), 10) : null,
      sqm: sqm ? parseInt(sqm[1].replace(/,/g, ''), 10) : null,
      beds: beds ? beds[1] : null,
      detailUrl: link ? (link[1].startsWith('http') ? link[1] : BASE + link[1]) : null,
      thumbs: (thumbs[id] || []).sort((a, b) => sizeArea(b.size) - sizeArea(a.size)),
    });
  }
  return { total, cards };
}

function sizeArea(s) {
  const [w, h] = s.split('x').map(Number);
  return (w || 0) * (h || 0);
}

function pickImage(list, minArea = 200000) {
  // prefer 950x505 / 1900x1010; fall back to best available
  if (!list || !list.length) return null;
  const good = list.filter(x => sizeArea(x.size) >= minArea);
  return (good.length ? good : list).sort((a, b) => sizeArea(b.size) - sizeArea(a.size))[0].url;
}

// detail page parser — returns full card payload
function parseDetail(html) {
  const h = html.replace(/\\\//g, '/');
  const out = {};

  const kv = {}; // basic-information topic -> info
  const biRe = /basic-information__item[^>]*>\s*(?:<span class="basic-information-topic">([^<]+?)<\/span>|<div class="basic-information-topic">([^<]*?)(?:<div class="basic-information__tooltip-message">([\s\S]*?)<\/div>)?\s*<\/div>)\s*<span class="basic-information-info[^"]*">([\s\S]*?)<\/span>\s*<\/div>/g;
  let m;
  while ((m = biRe.exec(h))) {
    const topic = stripTags(m[1] || m[2] || '');
    const info = stripTags(m[4]);
    if (topic && !(topic in kv)) kv[topic] = info;
  }
  out.basicInfo = kv;

  // title / project / location
  const t = h.match(/<title>([^<]+)<\/title>/);
  out.pageTitle = t ? t[1].trim() : null;
  const proj = h.match(/unit-name-header[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/);
  out.listingTitle = proj ? stripTags(proj[1]) : null;
  const loc = h.match(/class="project-location-header[^"]*"[^>]*>([\s\S]{0,300}?)<\/div>/);
  out.location = loc ? stripTags(loc[1]).replace(/,$/, '').trim() : null;
  const projUrl = h.match(/unit-name-header[^>]*>\s*<a href="([^"]+\/projects\/[^"]+)"/);
  out.projectUrl = projUrl ? projUrl[1] : null;
  // project name alone = listingTitle minus "N Bedroom X for rent at "
  out.project = out.listingTitle ? out.listingTitle.replace(/^.*?\sfor rent at\s+/i, '') : null;

  // price
  const price = h.match(/unit-sale-price__header-price">\s*฿\s?([0-9,]+)/);
  out.price = price ? parseInt(price[1].replace(/,/g, ''), 10) : (kv['Per month'] ? null : null);

  // property-info row: (value, label)
  const info = {};
  const piRe = /property-info-element[^>]*>[\s\S]*?<\/div>\s*<div class="icon-property-info">[\s\S]*?<\/div>\s*([^<]+?)\s*<small>\s*([^<]+?)\s*<\/small>/g;
  while ((m = piRe.exec(h))) {
    info[m[2].trim()] = stripTags(m[1]);
  }
  // fallback simpler pattern (svg between divs varies)
  const piRe2 = /property-info-element[^>]*>(?:(?!property-info-element)[\s\S])*?<\/svg>\s*<\/div>\s*([^<]+?)\s*<small>\s*([^<]+?)\s*<\/small>/g;
  while ((m = piRe2.exec(h))) {
    if (!(m[2].trim() in info)) info[m[2].trim()] = stripTags(m[1]);
  }
  out.specs = info;

  // description (unit-description div)
  const desc = h.match(/id="unit-description"[^>]*>([\s\S]*?)<\/div>/);
  out.description = desc ? stripTags(desc[1]).slice(0, 600) : null;

  // coords from street view link
  const sv = h.match(/viewpoint=(-?\d+\.\d+),(-?\d+\.\d+)/);
  out.lat = sv ? parseFloat(sv[1]) : null;
  out.lng = sv ? parseFloat(sv[2]) : null;

  // gallery photos grouped by filename, best size per photo
  const photos = {};
  for (const u of h.match(CDN_RE) || []) {
    const g = u.match(/\/(\d+x\d+)\/unit\/(\d+)\/([A-Za-z0-9_.-]+)$/);
    if (!g) continue;
    const [, size, uid, fname] = g;
    (photos[fname] = photos[fname] || []).push({ size, url: u });
  }
  out.gallery = Object.entries(photos)
    .map(([fname, variants]) => ({
      url: pickImage(variants, 800000) || pickImage(variants, 0),
      sizes: variants.map(v => v.size),
    }))
    .filter(p => p.url);

  // type from basic info
  out.type = kv['Property Type'] || null;
  out.beds = info['Bedrooms'] || null;
  out.baths = info['Bathroom'] || null;
  out.sqm = info['Size'] || null;
  out.floor = info['Floor'] || null;
  out.completed = info['Completed'] || null;
  return out;
}

// ---------- public API ----------
const SEARCH_TTL = 2 * 3600 * 1000;
const DETAIL_TTL = 12 * 3600 * 1000;

async function search(params, page = 1, opts = {}) {
  const url = buildSearchUrl(params, page);
  const key = 'search:' + url;
  if (!opts.fresh) {
    const hit = cacheGet(key, SEARCH_TTL);
    if (hit) return hit;
  }
  const res = await fetchHtml(url);
  if (res.status !== 200) {
    // upstream 404s when paging past the last page — that's "end of results",
    // not an error (only possible for page>1; page 1 never carries a page param)
    if (res.status === 404 && page > 1) {
      return { url, page, total: null, cards: [], fetchedAt: Date.now(), end: true };
    }
    throw new Error(`upstream ${res.status} for ${url}`);
  }
  const parsed = parseSearch(res.html);
  // learn slugs so /api/listing/:id works even without detailUrl
  for (const c of parsed.cards) if (c.detailUrl) slugMapSet(c.unitId, c.detailUrl);
  const payload = { url, page, total: parsed.total, cards: parsed.cards, fetchedAt: Date.now() };
  cacheSet(key, payload);
  return payload;
}

async function countOnly(params) {
  const payload = await orSearch(params, 1);
  return { total: payload.total };
}

const orCountOnly = countOnly;

// ---------- OR search fan-out ----------
// Convention (frontend mirrors this):
//   value.split('|') -> parts; a part containing '+' is an OR GROUP (its
//   members are OR-ed: "6082+6081" = balcony OR terrace); plain parts are
//   regular selections (AND-ed, comma lists).
// Upstream comma semantics are PER-KEY (verified live 2026-09-25):
//   AND-native (comma = intersection): type, projectFeatures,
//     projectAmenities, views  -> combined total < min(singles)
//   OR-native (comma = union): bedrooms/beds, pets, furniture, near_by,
//     source                    -> combined total > max(singles)
// For OR-native keys an OR group collapses to a comma-join (single request).
// For AND-native keys we fan out one upstream request per arm-combination
// ("cell") and merge results, deduping by unitId.
// Union count for fan-out: exact inclusion-exclusion over cell subsets
// (intersection of cells = comma-join of the union of their arm ids — valid
// because only AND-native keys produce multiple cells), for <= 4 cells;
// sum (upper bound) beyond that.
const OR_NATIVE = new Set(['bedrooms', 'type', 'pets', 'furniture', 'near_by', 'source']);

function applyBedsAlias(params) {
  if (params.beds !== undefined && params.bedrooms === undefined) {
    return { ...params, bedrooms: params.beds };
  }
  return params;
}

// the frontend speaks `order` (menu value); upstream expects order_by.
// 'sqm' is not an upstream key — it maps to living_area (verified live:
// order_by=living_area|desc sorts by size).
const SQM_ORDER = { 'sqm|asc': 'living_area|asc', 'sqm|desc': 'living_area|desc' };
function applyOrderAlias(params) {
  let p = params;
  if (p.order !== undefined && p.order_by === undefined) {
    p = { ...p, order_by: p.order };
    delete p.order;
  }
  if (p.order_by && SQM_ORDER[p.order_by]) p = { ...p, order_by: SQM_ORDER[p.order_by] };
  return p;
}

function orArmsForKey(key, v) {
  const parts = String(v).split('|');
  const plain = [], groups = [];
  for (const pt of parts) (pt.includes('+') ? groups : plain).push(pt);
  const plainIds = plain.flatMap(p => p.split(',')).filter(Boolean);
  if (OR_NATIVE.has(key)) {
    // comma already means OR upstream — one arm with every id
    const all = [...new Set([...plainIds, ...groups.flatMap(g => g.split('+')).filter(Boolean)])];
    return [all];
  }
  let combos = [[]];
  for (const g of groups) {
    const alts = g.split('+').filter(Boolean);
    combos = combos.flatMap(c => alts.map(a => [...c, a]));
  }
  if (!combos[0].length) return [plainIds]; // no groups: single AND arm
  return combos.map(c => [...new Set([...plainIds, ...c])]);
}

// returns [{key, arms:[[id,...],...]}, ...] for keys that carry OR values
function splitOrValues(params) {
  const out = [];
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && (v.includes('|') || v.includes('+'))
        && (MULTI_PARAMS.has(k) || OR_NATIVE.has(k))) {
      out.push({ key: k, arms: orArmsForKey(k, v) });
    }
  }
  return out;
}

function crossProduct(armsByKey, i = 0, acc = {}) {
  if (i === armsByKey.length) return [acc];
  const out = [];
  const { key, arms } = armsByKey[i];
  for (const arm of arms) out.push(...crossProduct(armsByKey, i + 1, { ...acc, [key]: arm }));
  return out;
}

function orCells(params) {
  const groups = splitOrValues(params);
  return groups.length ? crossProduct(groups.map(g => ({ key: g.key, arms: g.arms }))) : null;
}

// intersection of a subset of cells: for each OR key, comma-join the UNION of
// the arm id-sets appearing in the subset (upstream comma = AND = intersection)
function cellsIntersectionParams(params, cells) {
  const out = { ...params };
  for (const g of splitOrValues(params)) {
    const ids = new Set();
    for (const c of cells) for (const id of c[g.key]) ids.add(id);
    out[g.key] = [...ids].join(',');
  }
  return out;
}

async function unionTotal(params, cells, opts) {
  // inclusion-exclusion: totals of every non-empty subset of cells
  const subsets = [];
  for (let mask = 1; mask < (1 << cells.length); mask++) {
    const sub = cells.filter((_, i) => mask & (1 << i));
    subsets.push({ cells: sub, sign: (sub.length % 2 === 1) ? 1 : -1 });
  }
  const totals = await Promise.all(subsets.map(s =>
    search(cellsIntersectionParams(params, s.cells), 1, opts)
      .then(r => r.total).catch(() => null)));
  if (totals.some(t => t == null)) return null;
  return totals.reduce((acc, t, i) => acc + subsets[i].sign * t, 0);
}

async function orSearch(rawParams, page = 1, opts = {}) {
  const params = applyOrderAlias(applyBedsAlias(rawParams));
  const cells = orCells(params);
  if (!cells) return search(params, page, opts);

  const results = await Promise.all(cells.map(c => search({ ...params, ...c }, page, opts)));

  // dedupe across branches (their result windows overlap on later pages)
  const seen = new Set();
  const cards = [];
  let firstErr = null;
  for (const r of results) {
    if (r.error) { firstErr = firstErr || r.error; continue; }
    for (const c of r.cards || []) {
      if (!seen.has(c.unitId)) { seen.add(c.unitId); cards.push(c); }
    }
  }
  if (results.every(r => r.error)) throw new Error(firstErr || 'all OR branches failed');

  let total = null;
  if (results.every(r => !r.error)) {
    total = cells.length <= 4
      ? await unionTotal(params, cells, opts)
      : results.reduce((a, r) => a + (r.total || 0), 0); // upper bound (approx)
  }
  return { total, cards, page, fetchedAt: Date.now(), or: true };
}

const SLUG_MAP = path.join(CACHE_DIR, 'slug-map.json');
function slugMap() {
  try { return JSON.parse(fs.readFileSync(SLUG_MAP, 'utf8')); } catch { return {}; }
}
function slugMapSet(id, url) {
  try {
    const m = slugMap();
    m[id] = url;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(SLUG_MAP, JSON.stringify(m));
  } catch { /* best-effort */ }
}

async function listing(unitId, detailUrl, opts = {}) {
  const key = 'unit:' + unitId;
  if (!opts.fresh) {
    const hit = cacheGet(key, DETAIL_TTL);
    if (hit) return hit;
  }
  let url = detailUrl || slugMap()[unitId];
  if (!url) throw new Error(`no slug known for unit ${unitId}; run a search first`);
  slugMapSet(unitId, url);
  const res = await fetchHtml(url);
  if (res.status !== 200) throw new Error(`upstream ${res.status} for unit ${unitId}`);
  const parsed = parseDetail(res.html);
  parsed.unitId = unitId;
  const payload = { ...parsed, fetchedAt: Date.now() };
  cacheSet(key, payload);
  return payload;
}

async function pois(unitId) {
  const key = 'pois:' + unitId;
  const hit = cacheGet(key, DETAIL_TTL);
  if (hit) return hit;
  const data = await fetchJson(`${BASE}/api/location-matrix?type=unit&id=${unitId}`);
  const payload = { unitId, pois: data.result || [] };
  cacheSet(key, payload);
  return payload;
}

// ---------- project pages (verified live 2026-10-10) ----------
// Project URL: /projects/thailand/{city}/{district}/{subdistrict}/{slug}
// Server-rendered HTML + JSON-LD LocalBusiness node + key-fact blocks.
// Rental units come from the available-units XHR (cursor pagination).
function parseProject(html) {
  const h = html.replace(/\\\//g, '/');
  const out = {};
  // og:image carries the signed hero photo AND the numeric project id
  const og = h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
  if (og) {
    out.hero = og[1];
    const pm = og[1].match(/project\/(\d+)\//);
    if (pm) out.projectId = pm[1];
  }
  // JSON-LD @graph -> LocalBusiness node
  let biz = {};
  const ld = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      const graph = JSON.parse(ld[1])['@graph'] || [];
      biz = graph.find(n => n['@type'] === 'LocalBusiness') || {};
    } catch { /* keep empty */ }
  }
  if (biz.name) out.name = biz.name;
  if (!out.name) {
    const h1 = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (h1) out.name = stripTags(h1[1]);
  }
  out.description = biz.description || null;
  out.address = biz.address
    ? [biz.address.streetAddress, biz.address.addressLocality, biz.address.addressRegion].filter(Boolean).join(', ')
    : null;
  out.lat = biz.geo ? Number(biz.geo.latitude) : null;
  out.lng = biz.geo ? Number(biz.geo.longitude) : null;
  out.rating = biz.aggregateRating ? Number(biz.aggregateRating.ratingValue) : null;
  out.reviewCount = biz.aggregateRating ? Number(biz.aggregateRating.reviewCount) : null;
  out.reviews = (biz.reviews || []).map(r => ({
    date: r.datePublished || null,
    author: (r.author && r.author.name) || null,
    rating: r.reviewRating ? Number(r.reviewRating.ratingValue) : null,
    text: r.reviewBody || null,
  }));
  out.amenities = (biz.amenityFeature || []).map(a => a.name).filter(Boolean);
  // key facts: <div class="property-info-element"> <div class="icon-property-info">…svg…</div> Value <small>Label</small> </div>
  // (value may be plain text or wrapped in spans, e.g. <span id="resultTotalUnit">1,046</span>)
  const facts = {};
  const factRes = [
    /property-info-element[^>]*>(?:(?!property-info-element)[\s\S])*?<\/svg>\s*<\/div>\s*([^<]+?)\s*<small>\s*([^<]+?)\s*<\/small>/g,
    /property-info-element[^>]*>(?:(?!property-info-element)[\s\S])*?<\/svg>\s*<\/div>\s*([\s\S]*?)\s*<small>\s*([^<]+?)\s*<\/small>/g,
  ];
  for (const factRe of factRes) {
    let fm;
    while ((fm = factRe.exec(h))) {
      const value = stripTags(fm[1].replace(/<span id="valueTotalUnit">[\s\S]*?<\/span>/, ''));
      const label = stripTags(fm[2]);
      if (label && value && !(label in facts)) facts[label] = value;
    }
  }
  out.facts = facts;
  // gallery: project CDN photos. Two URLs per photo: `url` = display variant
  // (~720x466, sized for card carousels) and `full` = largest available
  // (lightbox). The signed CDN tokens are per (size,file) — sizes can't be
  // fabricated, only chosen from the variants present in the HTML.
  const photos = {};
  const pRe = /https:\/\/cdn\.fazwaz\.com\/wbr\/[A-Za-z0-9_-]+\/(\d+x\d+)\/project\/(\d+)\/([A-Za-z0-9_.-]+\.(?:jpe?g|png|webp))/g;
  let pm2;
  while ((pm2 = pRe.exec(h))) {
    const [, size, , fname] = pm2;
    (photos[fname] = photos[fname] || []).push({ size, url: pm2[0] });
  }
  const projectDisplayUrl = variants => {
    // card/carousel display: smallest variant that's still sharp enough;
    // photos that exist ONLY as an unranked size (e.g. 0x0 original) keep it
    const ranked = ['720x466', '500x500', '1550x700', '1900x1010', '250x250'];
    for (const s of ranked) {
      const v = variants.find(x => x.size === s);
      if (v) return v.url;
    }
    return pickImage(variants, 0);
  };
  out.gallery = Object.values(photos)
    .map(variants => ({
      url: projectDisplayUrl(variants),
      full: pickImage(variants, 0), // largest available — lightbox only
      rank: variants.some(v => v.size !== '0x0') ? 0 : 1, // originals-only photos are heavy
    }))
    .filter(p => p.url && !p.url.includes('/344x160/')) // floorplan/map/streetview thumbs — lightbox only
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank, ...rest }) => rest)
    .slice(0, 30);
  // developer name from the About-the-Developer heading
  const dev = h.match(/About the Developer\s*-\s*([^<]+)</);
  out.developer = dev ? stripTags(dev[1]) : null;
  return out;
}

async function project(projectUrl, opts = {}) {
  const url = projectUrl.startsWith('http') ? projectUrl : BASE + projectUrl;
  if (!/^https:\/\/www\.fazwaz\.com\/projects\//.test(url)) throw new Error('not a project url');
  const key = 'project:' + url;
  if (!opts.fresh) {
    const hit = cacheGet(key, DETAIL_TTL);
    if (hit) return hit;
  }
  const res = await fetchHtml(url);
  if (res.status !== 200) throw new Error(`upstream ${res.status} for project`);
  const parsed = parseProject(res.html);
  parsed.url = url;
  const payload = { ...parsed, fetchedAt: Date.now() };
  cacheSet(key, payload);
  return payload;
}

// ---------- project directory pages (Top-30 projects per subdistrict) ----------
// /project-directory/<country>/<region>/<city>/<subdistrict> pages are server-
// rendered listing blocks: .site-map-item[data-id=<projectId>] anchors.
function parseProjectDirectory(html) {
  const h = html.replace(/\\\//g, '/');
  const cards = [];
  const re = /<div class="site-map-item" data-tk="project-directory" data-type="project" data-id="(\d+)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/g;
  let m;
  while ((m = re.exec(h))) {
    const seg = m[2];
    const link = seg.match(/href="(https:\/\/www\.fazwaz\.com\/projects\/[^"]+)"/);
    if (!link) continue;
    const img = seg.match(/<img src="(https:\/\/cdn\.fazwaz\.com[^"]+)"/);
    const name = seg.match(/class="project-header">([^<]+)</);
    const address = seg.match(/class="project-formatted-address">\s*(?:<img[^>]*>)?\s*([^<]+?)\s*</);
    const sales = seg.match(/Sales Prices<\/small>\s*([^<]+?)\s*</);
    const rent = seg.match(/Monthly Rentals<\/small>\s*([^<]+?)\s*</);
    const units = seg.match(/nearby__footer__item">\s*([\d,]+)\s*<small[^>]*>\s*Number of units/);
    const completed = seg.match(/nearby__footer__item">\s*([A-Za-z]{3} \d{4})\s*<small[^>]*>\s*Completed/);
    const transit = seg.match(/nearby__footer__item">\s*([0-9.]+\s*km)\s*<small[^>]*>\s*([^<]+?)\s*<\/small>/);
    cards.push({
      projectId: m[1],
      url: link[1],
      name: name ? name[1].trim() : null,
      address: address ? address[1].trim() : null,
      img: img ? img[1] : null,
      salesPrice: sales ? sales[1].trim() : null,
      rentPrice: rent ? rent[1].trim() : null,
      units: units ? parseInt(units[1].replace(/,/g, ''), 10) : null,
      completed: completed ? completed[1].trim() : null,
      transit: transit ? { distance: transit[1].trim(), label: transit[2].trim() } : null,
    });
  }
  return cards;
}

// the project-directory sitemap lists every subdistrict directory page
async function projectDirSitemap(opts = {}) {
  const key = 'projdirs';
  if (!opts.fresh) {
    const hit = cacheGet(key, 7 * 24 * 3600 * 1000);
    if (hit) return hit;
  }
  const res = await fetchHtml(BASE + '/sitemaps/www.fazwaz.com-project-directory.xml');
  if (res.status !== 200) throw new Error(`upstream ${res.status} for project-directory sitemap`);
  const dirs = [...new Set([...res.html.matchAll(/<loc>(https:\/\/www\.fazwaz\.com\/project-directory\/[^<]+)<\/loc>/g)]
    .map(m => m[1]))];
  const payload = { dirs, fetchedAt: Date.now() };
  cacheSet(key, payload);
  return payload;
}

async function projectDirectory(dirUrl, opts = {}) {
  if (!/^https:\/\/www\.fazwaz\.com\/project-directory\//.test(dirUrl)) throw new Error('not a project-directory url');
  const key = 'projdir:' + dirUrl;
  if (!opts.fresh) {
    const hit = cacheGet(key, DETAIL_TTL);
    if (hit) return hit;
  }
  const res = await fetchHtml(dirUrl);
  if (res.status !== 200) throw new Error(`upstream ${res.status} for ${dirUrl}`);
  let cards = parseProjectDirectory(res.html);
  // some directory pages are POI-based ("near <beach>") and include projects
  // from neighbouring cities — keep only cards inside the dir's own region.
  // The caller's region prefix is exact; fallback keeps country/region/city
  // (first 3 segments) which is correct for both region shapes upstream uses.
  let regionPath = opts.regionPrefix ? String(opts.regionPrefix).replace(/^\//, '') : null;
  if (!regionPath) {
    const seg = dirUrl.slice(dirUrl.indexOf('/project-directory/') + '/project-directory/'.length).split('/');
    regionPath = seg.slice(0, 3).join('/');
  }
  cards = cards.filter(c => (c.url || '').includes('/projects/' + regionPath + '/'));
  const payload = { url: dirUrl, cards, fetchedAt: Date.now() };
  cacheSet(key, payload);
  return payload;
}

// upstream geometric auto-complete: the only public project-NAME search.
// Projects group options carry label (name), value {region, city, location,
// model_id}, formattedAddress and defaultSearch (canonical /projects/ URL).
async function projectSuggest(q, opts = {}) {
  const query = String(q || '').trim();
  if (query.length < 2) return [];
  const url = `${BASE}/api/geometric/auto-complete?q=${encodeURIComponent(query)}&forSale=0&type=project`;
  const key = 'psugg:' + query.toLowerCase();
  if (!opts.fresh) {
    const hit = cacheGet(key, 24 * 3600 * 1000);
    if (hit) return hit;
  }
  const data = await fetchJson(url);
  const out = [];
  for (const grp of data.data || []) {
    if (grp.label !== 'Projects') continue;
    for (const o of grp.options || []) {
      const v = o.value || {};
      if (!o.label || !v.model_id) continue;
      out.push({
        id: String(v.model_id),
        name: o.label,
        url: (o.defaultSearch || '').split('?')[0] || null,
        address: o.formattedAddress || null,
        region: v.region ? '/' + [v.country, v.region].filter(Boolean).join('/') : null,
      });
    }
  }
  cacheSet(key, out);
  return out;
}

// cards from the available-units XHR: link, price, ฿/SqM, thumb, beds/baths/size/floor
function parseUnitCards(cardsHtml) {
  const h = cardsHtml.replace(/\\\//g, '/');
  const units = [];
  const re = /<a href="(https:\/\/www\.fazwaz\.com\/property-(?:rent|sales)\/[^"]+-u(\d+))"\s+class="list list-item available-units-table-list[^"]*">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(h))) {
    const seg = m[3];
    const price = seg.match(/resale-rental-full-price">\s*฿\s?([\d,]+)/);
    const psqm = seg.match(/__price-area">\s*฿?\s?([\d,]+)\s*\/\s*SqM/i);
    const img = seg.match(/src="(https:\/\/cdn\.fazwaz\.com[^"]+)"/);
    // float tags: "Available: <date|Now>" and "Updated <rel>"
    const tags = [...seg.matchAll(/float-tag">([\s\S]*?)<\/span>/g)].map(t => stripTags(t[1]));
    const availTag = tags.find(t => /^available:/i.test(t)) || null;
    const updTag = tags.find(t => /^updated/i.test(t)) || null;
    let availableFrom = null;
    if (availTag) {
      const v = availTag.replace(/^available:\s*/i, '').trim();
      availableFrom = /^now$/i.test(v) ? 'now' : v;
    }
    const info = [];
    const iRe = /available-units-table-list__item[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let im;
    while ((im = iRe.exec(seg))) info.push(stripTags(im[1]));
    units.push({
      unitId: m[2],
      url: m[1],
      price: price ? parseInt(price[1].replace(/,/g, ''), 10) : null,
      priceSqm: psqm ? parseInt(psqm[1].replace(/,/g, ''), 10) : null,
      img: img ? img[1] : null,
      updated: updTag || tags[0] || null,
      availableFrom,
      beds: info[0] || null,
      baths: info[1] || null,
      sqm: info[2] || null,
      floor: info[3] || null,
    });
  }
  return units;
}

// rentals-only: forrent tab of the project's available-units widget
async function projectUnits(projectId, opts = {}) {
  const key = 'project-units:' + projectId;
  if (!opts.fresh) {
    const hit = cacheGet(key, DETAIL_TTL);
    if (hit) return hit;
  }
  const qs = cursor => {
    const p = new URLSearchParams({
      project_id: projectId, sale_type: 'forrent', bedroom: 'all',
      property_type: 'all', unit_type: 'default',
      sort: 'ranking_total_score|desc', is_verified_listings: '0',
    });
    if (cursor) p.set('cursor', JSON.stringify(cursor));
    return p.toString();
  };
  let data = await fetchJson(`${BASE}/api/available-unit-table/unit-detail?${qs()}`);
  const units = parseUnitCards(data.cards_html || '');
  let guard = 0;
  while (data.has_more && Array.isArray(data.next_cursor) && data.next_cursor.length && ++guard < 30) {
    data = await fetchJson(`${BASE}/api/available-unit-table/unit-detail?${qs(data.next_cursor)}`);
    units.push(...parseUnitCards(data.cards_html || ''));
  }
  const seen = new Set();
  const uniq = [];
  for (const u of units) if (!seen.has(u.unitId)) { seen.add(u.unitId); uniq.push(u); }
  const payload = {
    projectId: String(projectId),
    rentalCount: data.rental_count != null ? data.rental_count : uniq.length,
    total: uniq.length,
    units: uniq,
    fetchedAt: Date.now(),
  };
  cacheSet(key, payload);
  return payload;
}

async function projectPois(projectId) {
  const key = 'project-pois:' + projectId;
  const hit = cacheGet(key, DETAIL_TTL);
  if (hit) return hit;
  const data = await fetchJson(`${BASE}/api/location-matrix?type=project&id=${projectId}`);
  const payload = { projectId: String(projectId), pois: data.result || [] };
  cacheSet(key, payload);
  return payload;
}

module.exports = { search, orSearch, countOnly, orCountOnly, listing, pois, buildSearchUrl, parseSearch, parseDetail, project, projectUnits, projectPois, parseProject, parseUnitCards, parseProjectDirectory, projectDirSitemap, projectDirectory, projectSuggest };
