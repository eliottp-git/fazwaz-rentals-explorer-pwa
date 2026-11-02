/* fazwaz-rentals frontend */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtB = n => n == null ? '—' : '฿' + Number(n).toLocaleString('en-US');

// ---------- filter definitions (client mirror of data/filters.json param names) ----------
const FILTERS = {
  projectFeatures: [
    { id: '5', label: 'Private Pool' }, { id: '6', label: 'Pool Access' }, { id: '7', label: 'Jacuzzi' },
    { id: '8', label: 'Sauna' }, { id: '9', label: 'Private Garden' }, { id: '6081', label: 'Terrace' },
    { id: '6082', label: 'Balcony' }, { id: '3330', label: 'Corner Unit' }, { id: '3328', label: 'Duplex' },
    { id: '10', label: 'Private Gym' }, { id: '6063', label: 'Smart Home' }, { id: '6064', label: 'Fully Renovated' },
    { id: '11', label: 'Beachfront' }, { id: '12', label: 'Beach Access' },
  ],
  projectAmenities: [
    { id: '13', label: 'Communal Pool' }, { id: '14', label: 'Communal Gym' },
    { id: '15', label: 'Tennis Court' }, { id: '16', label: '24H Security' },
  ],
  views: [
    { id: '1', label: 'Sea View' }, { id: '2', label: 'Mountain View' },
    { id: '3', label: 'Golf or Park View' }, { id: '4', label: 'Lake or River View' },
  ],
  near_by: [
    { id: '158', label: 'BTS' }, { id: '159', label: 'MRT' }, { id: '160', label: 'ARL' }, { id: '5064', label: 'BRT' },
  ],
  pets: [{ id: 'dog', label: 'Dogs Allowed' }, { id: 'cat', label: 'Cats Allowed' }],
  furniture: [{ id: 'fully-furnished', label: 'Fully Furnished' }, { id: 'unfurnished', label: 'Unfurnished' }],
  source: [{ id: 'private', label: 'Owner' }, { id: 'agent', label: 'Agent' }],
};
const TYPES = ['condo', 'apartment', 'penthouse', 'villa', 'house', 'townhouse', 'land', 'private-island',
               'office', 'shophouse', 'retail-space', 'warehouse', 'hotel'];
const BEDS = ['Studio', '1', '2', '3', '4'];
const RANGES = [
  { key: 'living_area', label: 'Living Area (SqM)' },
  { key: 'floors', label: 'Floor (max 0 = ground)' },
  { key: 'storeys', label: 'Storeys' },
  { key: 'land_plot', label: 'Land Plot (SqM)' },
  { key: 'year_built', label: 'Year Built' },
];

// ---------- state ----------
const state = {
  region: '/thailand/bangkok',
  multi: { type: [], beds: [], projectFeatures: [], projectAmenities: [], views: [], near_by: [], pets: [], furniture: [], source: [] },
  ranges: { monthly_price: ['', ''], living_area: ['', ''], floors: ['', ''], storeys: ['', ''], land_plot: ['', ''], year_built: ['', ''] },
  onlyVideo: false,
  order: 'created_at|desc',
  page: 1,
  loading: false,
  total: null,
};

// ---------- build filter UI ----------
function chipRow(groupKey, items, target) {
  const div = document.createElement('div');
  div.className = 'chip-row';
  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = it.label;
    b.dataset.key = groupKey; b.dataset.id = it.id;
    b.addEventListener('click', () => {
      const arr = state.multi[groupKey];
      const i = arr.indexOf(it.id);
      i >= 0 ? arr.splice(i, 1) : arr.push(it.id);
      b.classList.toggle('on');
      scheduleCount();
    });
    div.appendChild(b);
  });
  $(target).appendChild(div);
}

function buildFilters() {
  // beds
  chipRow('beds', BEDS.map(b => ({ id: b, label: b === 'Studio' ? 'Studio' : b + '+' })), '#bedsChips');
  // types
  chipRow('type', TYPES.map(t => ({ id: t, label: t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })), '#typeChips');
  // more-filters panel
  const mf = $('#moreFilters');
  const groups = [
    ['projectFeatures', 'Property Features'], ['projectAmenities', 'Project Amenities'],
    ['views', 'Views'], ['near_by', 'Nearby'], ['pets', 'Pets'], ['furniture', 'Furniture'], ['source', 'Listing Source'],
  ];
  for (const [key, label] of groups) {
    const wrap = document.createElement('div'); wrap.className = 'mf-group';
    wrap.innerHTML = `<label>${label}</label>`;
    wrap.appendChild(wrap.querySelector('label'));
    const row = document.createElement('div'); row.className = 'chips';
    FILTERS[key].forEach(it => {
      const b = document.createElement('button');
      b.className = 'chip'; b.textContent = it.label;
      b.dataset.key = key; b.dataset.id = it.id;
      b.addEventListener('click', () => {
        const arr = state.multi[key]; const i = arr.indexOf(it.id);
        i >= 0 ? arr.splice(i, 1) : arr.push(it.id);
        b.classList.toggle('on'); scheduleCount();
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    mf.appendChild(wrap);
  }
  // video toggle
  const vid = document.createElement('div'); vid.className = 'mf-group';
  vid.innerHTML = `<label>Video Tour</label><div class="chips"><button class="chip" id="videoChip">Only with Video Tours</button></div>`;
  mf.appendChild(vid);
  $('#videoChip').addEventListener('click', e => {
    state.onlyVideo = !state.onlyVideo; e.target.classList.toggle('on'); scheduleCount();
  });
  // numeric ranges
  for (const r of RANGES) {
    const wrap = document.createElement('div'); wrap.className = 'mf-group';
    wrap.innerHTML = `<label>${r.label}</label>
      <div class="minmax"><input type="number" placeholder="Min" data-range="${r.key}" data-idx="0" inputmode="numeric">
      <span>–</span><input type="number" placeholder="Max" data-range="${r.key}" data-idx="1" inputmode="numeric"></div>`;
    mf.appendChild(wrap);
  }
  mf.querySelectorAll('input[data-range]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.ranges[inp.dataset.range][+inp.dataset.idx] = inp.value;
      scheduleCount();
    });
  });
  // keep the save button at the BOTTOM of the panel (groups were appended after it)
  const svRow = $('.save-search-row', mf);
  if (svRow) mf.appendChild(svRow);
  // price core inputs
  $('#priceMin').addEventListener('change', e => { state.ranges.monthly_price[0] = e.target.value; scheduleCount(); });
  $('#priceMax').addEventListener('change', e => { state.ranges.monthly_price[1] = e.target.value; scheduleCount(); });
}

// ---------- params ----------
// OR convention (mirrors lib/fazwaz.js): '|' separates parts; a part with '+'
// is an OR group (members OR-ed); plain parts are AND-ed comma lists.
// beds chips are labeled "N+" and upstream bedrooms is exact, so each chip
// expands to its exact set (1+ -> 1,2,3,4; Studio -> Studio); beds is
// OR-native upstream, so the expansion is a plain comma list.
const BEDS_SETS = { Studio: ['Studio'], 1: ['1', '2', '3', '4'], 2: ['2', '3', '4'], 3: ['3', '4'], 4: ['4'] };
function expandBedsIds(ids) {
  const out = new Set();
  for (const v of ids) for (const id of String(v).split('+'))
    for (const x of (BEDS_SETS[id] || [id])) out.add(x);
  return [...out];
}
function collapseBeds(list) {
  // inverse: find chips whose exact-sets cover the expanded list
  const set = new Set(list); const out = [];
  for (const id of ['Studio', '1', '2', '3', '4']) {
    const s = BEDS_SETS[id];
    if (s.every(x => set.has(x))) { s.forEach(x => set.delete(x)); out.push(id); }
  }
  for (const x of [...set]) if (BEDS_SETS[x]) out.push(x);
  return out;
}

function collectParams() {
  const p = {};
  for (const [k, arr] of Object.entries(state.multi)) {
    if (!arr.length) continue;
    if (k === 'beds') { p.beds = expandBedsIds(arr).join(','); continue; }
    const plain = arr.filter(v => !v.includes('+'));
    const groups = arr.filter(v => v.includes('+'));
    const parts = [];
    if (plain.length) parts.push(plain.join(','));
    parts.push(...groups);
    p[k] = parts.join('|');
  }
  if (state.onlyVideo) p.onlyVideoTourExists = 'yes';
  for (const [k, [min, max]] of Object.entries(state.ranges))
    if (min !== '' || max !== '') p[k] = `${min || 'null'},${max || 'null'}`;
  return p;
}

// inverse of collectParams for one multi value -> array of chip ids
// ('condo|6082+6081' -> ['condo','6082+6081']; '1,2' -> ['1','2'])
function parseMultiValue(k, v) {
  if (k === 'beds') return collapseBeds(String(v).split(','));
  const out = [];
  for (const part of String(v).split('|')) {
    if (part.includes('+')) out.push(part);
    else out.push(...part.split(',').filter(Boolean));
  }
  return out;
}

// ---------- live count ----------
let countTimer = null;
function scheduleCount() {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    updateCount();
    // filters apply to the favourites view too — re-render it live and
    // keep the URL (favs=1 + filter params) in sync
    if (favsVisible) { syncFavsUrl(); renderFavsView(true); }
  }, 700);
}
async function updateCount() {
  const box = $('#countBox');
  const qs = new URLSearchParams(collectParams()).toString();
  try {
    const r = await fetch(`./api/count${qs ? '?' + qs : ''}`);
    const d = await r.json();
    state.total = d.total;
    box.innerHTML = d.total != null ? `View <b>${d.total.toLocaleString()}</b> Properties` : '';
  } catch { box.textContent = ''; }
}

// ---------- search ----------
// Back-to-feed scroll restore: clicking a card's title link is a full page
// navigation, so the return trip re-renders the feed from page 1 at the top.
// The click stores {unitId, top, scrollY, page} in sessionStorage; after the
// search renders, restoreFeedScroll() pages forward until the remembered card
// reappears and puts the viewport back on it (card heights are fixed — the
// carousel never sizes from image aspect — so the pixel math holds).
let feedScrollMemo = null, feedRestoring = false, feedRestoreAttempts = 0;

async function doSearch(reset = true) {
  if (favsVisible) hideFavsView();
  if (reset) { state.page = 1; $('#results').innerHTML = ''; }
  const qs = new URLSearchParams({ ...collectParams(), page: state.page }).toString();
  setStatus(state.page === 1 ? 'Searching…' : 'Loading more…');
  state.loading = true;
  try {
    const r = await fetch(`./api/search?${qs}`);
    const d = await r.json();
    if (d.error) throw new Error(d.detail || d.error);
    if (d.total != null) {
      state.total = d.total;
      $('#countBox').innerHTML = `View <b>${d.total.toLocaleString()}</b> Properties`;
    }
    if (state.page === 1 && !d.cards.length) {
      setStatus('No properties match these filters.');
      return;
    }
    renderCards(d.cards);
    setStatus(d.cards.length ? '' : 'End of results.');
    updateUrl();
    if (reset) restoreFeedScroll();
  } catch (e) {
    setStatus('Search failed: ' + esc(e.message));
  } finally { state.loading = false; }
}

// ----- back-to-feed scroll restore -----
// captureFeedScroll: called on a card title-link click (real navigation).
// Reads the memo back out only on the restore IIFE path (bare/feed URL).
function captureFeedScroll(unitId) {
  try {
    sessionStorage.setItem('fw:scroll', JSON.stringify({
      unitId: String(unitId),
      top: Math.round(document.querySelector('.card[data-unit="' + CSS.escape(String(unitId)) + '"]')
            ?.getBoundingClientRect().top ?? 0),
      scrollY: window.scrollY,
      page: state.page,
      ts: Date.now(),
    }));
  } catch { /* storage unavailable — plain jump to top */ }
}

function findCard(unitId) {
  return document.querySelector('.card[data-unit="' + CSS.escape(String(unitId)) + '"]');
}

// After a fresh feed render, put the viewport back on the remembered card.
// Only fires on a genuine back/forward trip (popstate/nav-type) or when the
// memo is fresh — a plain visit/link into the feed never carries the memo for
// long, and the ts guard filters out leftovers from old tabs.
// The remembered page must exist in the DOM first: page forward silently
// (renderCards only — no per-page UI churn) until the card is present, then
// anchor the window on the card. Card heights are stable (carousels never size
// from image aspect), so anchoring on the card's document offset is safe even
// while the detail enrichment below it is still filling in.
async function restoreFeedScroll() {
  if (feedRestoring) return;
  let memo;
  try { memo = JSON.parse(sessionStorage.getItem('fw:scroll') || 'null'); } catch { memo = null; }
  sessionStorage.removeItem('fw:scroll');
  if (!memo || !memo.unitId) return;
  // only a genuine back/forward trip may restore: arriving at the feed by a
  // fresh navigation (Properties button, bookmark) must start at the top —
  // consume-and-drop the memo instead
  let navType = '';
  try { navType = (performance.getEntriesByType('navigation')[0] || {}).type || ''; } catch { }
  if (navType && navType !== 'back_forward') return;
  // stale? the memo is only meaningful within a short window around the back-nav
  if (!memo.ts || Date.now() - memo.ts > 10 * 60 * 1000) return;
  feedRestoring = true;
  try {
    // page forward until the remembered card exists (upstream caps at page 25)
    let guard = 0;
    while (!findCard(memo.unitId) && state.page < 25 && guard++ < 30) {
      if (state.loading) { await new Promise(r => setTimeout(r, 150)); continue; }
      if (state.total != null && document.querySelectorAll('.card').length >= state.total) break;
      state.page += 1;
      await (async () => {
        const qs = new URLSearchParams({ ...collectParams(), page: state.page }).toString();
        state.loading = true;
        try {
          const r = await fetch(`./api/search?${qs}`);
          const d = await r.json();
          if (!d.error) {
            if (d.total != null) state.total = d.total;
            renderCards(d.cards);
          }
        } catch { /* give up below */ }
        finally { state.loading = false; }
      })();
      if (!document.querySelectorAll('.card').length) break;
    }
    const el = findCard(memo.unitId);
    if (!el) return; // card gone (dropped by the pets guard, delisted, …) — stay at top
    // the memo top is the card's viewport-Y at click time; re-derive the
    // window offset from the card's CURRENT document position so any height
    // differences above it don't push the target off. A negative remembered
    // top (card was partly scrolled past) clamps to a small overlap margin.
    const docTop = el.getBoundingClientRect().top + window.scrollY;
    const want = memo.top >= 0 ? memo.top : Math.min(80, -memo.top);
    window.scrollTo({ top: Math.max(0, docTop - want), behavior: 'instant' });
  } finally {
    feedRestoring = false;
  }
}

function setStatus(t) { const s = $('#status'); if (projVisible) return; s.textContent = t; s.classList.toggle('hidden', !t); }

function updateUrl() {
  // never rewrite the URL while the project page is open (it carries ?url=…)
  // or while the projects section is open (it carries its own state)
  if (projVisible || isProjPath() || isProjectsPath()) return;
  if (isAppliedPath()) return;
  // only touch the URL when there is something to record; keeps a clean bare URL otherwise
  const params = collectParams();
  const hasFilters = Object.keys(params).length > 0;
  if (!hasFilters && state.page <= 1 && state.order === 'created_at|desc') {
    history.replaceState(null, '', location.pathname);
    return;
  }
  const qs = new URLSearchParams({ ...params, page: state.page, order: state.order });
  history.replaceState(null, '', '?' + qs.toString());
}

// ---------- cards ----------
const ICONS = {
  pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>',
  bed: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 18v2m18-2v2M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/></svg>',
  bath: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2zM6 12V5a2 2 0 0 1 4 0M8 19l-1 2m9-2 1 2"/></svg>',
  area: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h5V4M20 15h-5v5"/></svg>',
  home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>',
  heart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  heartFill: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
};

// shared home-page card shell: carousel + body skeleton used by the search
// feed AND the project page's Available-Rentals detail view. `c` needs at
// least unitId; title/price/beds/sqm/subtitle are optional placeholders that
// enrich()/fillCard() overwrite with detail data.
function buildCardShell(c) {
  const el = document.createElement('article');
  el.className = 'card'; el.dataset.unit = c.unitId;
  el.innerHTML = `
    <div class="carousel">
      <div class="track" data-unit="${c.unitId}"></div>
      <div class="dots"></div>
      <div class="badge-updated hidden"></div>
      <div class="img-count hidden"></div>
      <button class="applied-btn" data-unit="${c.unitId}" title="Mark as applied" aria-label="Toggle applied mark"></button>
      <button class="fav-btn" data-unit="${c.unitId}" title="Save as favourite" aria-label="Toggle favourite"></button>
    </div>
    <div class="body">
      <h2>${esc(c.title || 'Property ' + c.unitId)}</h2>
      <div class="loc-line"></div>
      <div class="subtitle">${esc(c.subtitle || '')}</div>
      <div class="price">${c.price != null ? fmtB(c.price) : '—'}<small>/mo</small></div>
      <p class="summary">Loading details…</p>
      <div class="spec-row">${spec(ICONS.bed, c.beds, 'Bed')}${spec(ICONS.bath, '—', 'Bath')}${spec(ICONS.area, c.sqm ? c.sqm + ' SqM' : '—')}${spec(ICONS.home, '—')}</div>
      <div class="chips-wrap"><span class="status-mini" style="color:var(--muted);font-size:12px">Loading features…</span></div>
      <div class="avail"></div>
      <textarea class="card-notes" data-unit="${c.unitId}" rows="2" placeholder="Notes… (saved automatically)" spellcheck="false"></textarea>
    </div>`;
  syncFavBtn(el.querySelector('.fav-btn'));
  syncAppliedBtn(el.querySelector('.applied-btn'));
  return el;
}

function renderCards(cards) {
  const main = $('#results');
  for (const c of cards) {
    const el = buildCardShell(c);
    main.appendChild(el);
    enrich(el, c);
    hydrateCarousel(el.querySelector('.track'), el, c);
  }
}

function spec(icon, value, suffix) {
  const v = value == null || value === '—' ? '—' : esc(value) + (suffix ? ' ' + suffix : '');
  return `<span class="spec">${icon}${v}</span>`;
}

// per-card detail enrichment
const enriched = new Set();
async function enrich(el, c, opts = {}) {
  if (enriched.has(c.unitId)) { fillFromCache(el, c.unitId); return; }
  try {
    const r = await fetch(`./api/listing/${c.unitId}?url=${encodeURIComponent(c.detailUrl || '')}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    enriched.add(c.unitId);
    localStorage.setItem('fw:' + c.unitId, JSON.stringify({ t: Date.now(), d: { ...d, detailUrl: c.detailUrl } }));
    cardCache.set(String(c.unitId), { c, d: { ...d, detailUrl: c.detailUrl } });
    // search-index mismatch guard: upstream's pets/type filters are often stale
    // (listing says "Pets: Not Allowed" but still surfaces in pets=cat, etc.).
    // When the active search filtered on a key the detail data contradicts,
    // drop the card — the user asked FOR this filter. opts.noGuard skips the
    // check for explicitly-opened detail views (project page unit card), where
    // leftover properties-side filters must not hide the chosen listing.
    if (!opts.noGuard && cardContradictsSearch(c.unitId, d)) {
      el.remove();
      scheduleCount();
      return;
    }
    fillCard(el, { ...d, detailUrl: c.detailUrl });
  } catch {
    el.querySelector('.summary').textContent = 'Details unavailable.';
    el.querySelector('.chips-wrap').innerHTML = '';
  }
}

// true when an active search filter's requirement is contradicted by the
// listing's own detail data (checked only for keys where upstream search
// filtering is unreliable)
function cardContradictsSearch(unitId, d) {
  const p = collectParams();
  const kv = d.basicInfo || {};
  if (p.pets && /^not allowed/i.test(kv['Pets'] || '')) return true;
  return false;
}

function fillFromCache(el, id) {
  try {
    const rec = JSON.parse(localStorage.getItem('fw:' + id));
    if (rec) fillCard(el, rec.d);
  } catch { /* noop */ }
}

// clear stale local caches from previous app versions
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('fw:')) {
      const rec = JSON.parse(localStorage.getItem(k));
      if (!rec.d || !rec.d.detailUrl) localStorage.removeItem(k);
    }
  }
} catch { /* noop */ }

function fillCard(el, d) {
  // title: project name preferred; links to the in-app project page
  const h2 = el.querySelector('h2');
  if (d.project) {
    if (d.projectUrl) {
      const a = document.createElement('a');
      a.className = 'title-link';
      a.href = projectPageUrl(d.projectUrl);
      a.textContent = d.project;
      a.title = 'Open project information';
      h2.replaceChildren(a);
    } else {
      h2.textContent = d.project;
    }
  }
  // location line (clickable -> map)
  if (d.location) {
    const btn = document.createElement('button');
    btn.className = 'loc';
    btn.innerHTML = `${ICONS.pin}<span>${esc(d.location)}</span>`;
    btn.addEventListener('click', () => openMap(d));
    el.querySelector('.loc-line').replaceChildren(btn);
  }
  // subtitle: listing title minus project ("2 Bedroom Condo for rent")
  if (d.listingTitle) {
    const sub = d.listingTitle.replace(/\s+at\s+.*$/, '');
    el.querySelector('.subtitle').textContent = sub;
  }
  // summary
  if (d.description) el.querySelector('.summary').textContent = d.description.slice(0, 180) + (d.description.length > 180 ? '…' : '');
  // specs
  const sr = el.querySelector('.spec-row');
  sr.innerHTML =
    spec(ICONS.bed, d.beds, d.beds === 'Studio' ? '' : 'Bed' + (parseInt(d.beds) > 1 ? 's' : '')) +
    spec(ICONS.bath, d.baths, parseInt(d.baths) > 1 ? 'Baths' : 'Bath') +
    spec(ICONS.area, d.sqm) +
    spec(ICONS.home, d.type);
  // chips
  const chips = buildChips(d);
  const cw = el.querySelector('.chips-wrap');
  cw.replaceChildren(...chips.map(g => {
    const row = document.createElement('div'); row.className = 'chip-row';
    row.append(...g);
    return row;
  }));
  const kv = d.basicInfo || {};
  const av = el.querySelector('.avail');
  const propUrl = d.detailUrl || (d.projectUrl ? d.projectUrl.replace('/projects/', '/property-rent/') : null);
  const bits = [];
  if (kv['Available From']) bits.push(`Available: <b>${esc(kv['Available From'])}</b>`);
  if (kv['Min. Rental Duration']) bits.push(`Min. Rental Duration: <b>${esc(kv['Min. Rental Duration'])}</b>`);
  if (kv['Updated']) bits.push(`Updated: <b>${esc(kv['Updated'])}</b>`);
  av.innerHTML = bits.join('');
  // 📍 Map button — same map engine as the location line (Longdo/Leaflet)
  if (d.lat) {
    const mb = document.createElement('button');
    mb.className = 'loc mini-map-btn';
    mb.innerHTML = '📍 Map';
    mb.addEventListener('click', ev => { ev.stopPropagation(); openMap(d); });
    av.appendChild(mb);
  }
  if (propUrl) av.insertAdjacentHTML('beforeend', ` &nbsp;<a class="open-project" href="${esc(propUrl)}" target="_blank" rel="noopener">View on FazWaz ↗</a>`);
  // badge on image
  if (kv['Updated']) {
    el.querySelector('.badge-updated').textContent = 'UPDATED ' + kv['Updated'].toUpperCase();
    el.querySelector('.badge-updated').classList.remove('hidden');
  }
  // fillCard rebuilt .avail's HTML — re-add the applied line if marked
  syncAppliedLine(el);
  // populate the notes textarea (buildCardShell starts it empty; loadNotes()
  // may have resolved before this card rendered — hydrated guard stops this
  // from clobbering text the user already typed into the field)
  const nta = el.querySelector('.card-notes');
  if (nta) syncNoteTextarea(nta);
}

// chip groups color-coded by type; tooltip = detail text
function tag(text, cls, tip) {
  const s = document.createElement('span');
  s.className = 'tag ' + cls; s.textContent = text;
  if (tip) s.title = tip;
  return s;
}

function buildChips(d) {
  const rows = [];
  const kv = d.basicInfo || {};
  // transport (from POIs) — tooltip = station name
  const pois = d.pois || [];
  if (pois.length) {
    const pick = cat => pois.filter(p => p.category_clean_name === cat)
      .sort((a, b) => (a.distance_value || 9e9) - (b.distance_value || 9e9)).slice(0, 2);
    const row = [];
    for (const [cat, lbl] of [['bts-station','BTS'], ['airport-rail-link-station','ARL'], ['mrt-station','MRT']]) {
      for (const p of pick(cat)) {
        row.push(tag(`${lbl} ${p.distance_text}`, 't-transport', p.name));
      }
    }
    if (row.length) rows.push(row);
  }
  // building details
  const bd = [];
  if (kv['Date Listed'] && d.completed) bd.push(tag('Year Built ' + (d.completed.match(/\d{4}/) || [''])[0], 't-building'));
  if (kv['Floor']) bd.push(tag('Floor ' + kv['Floor'], 't-building'));
  else if (d.floor) bd.push(tag('Floor ' + d.floor, 't-building'));
  if (kv['Property Type']) bd.push(tag(kv['Property Type'], 't-building'));
  if (bd.length) rows.push(bd);
  // views
  if (kv['View(s)']) rows.push(kv['View(s)'].split(',').map(v => tag(v.trim(), 't-views')));
  // furniture
  if (kv['Furniture']) rows.push([tag(kv['Furniture'], 't-furniture')]);
  // pets
  if (kv['Pets']) rows.push([tag('Pets: ' + kv['Pets'], 't-pets')]);
  return rows;
}

// ---------- carousel (scroll-only + drag + lightbox) ----------
function hydrateCarousel(track, card, c) {
  fetch(`./api/listing/${c.unitId}?url=${encodeURIComponent(c.detailUrl || '')}`)
    .then(r => r.json())
    .then(d => {
      if (d.error || !d.gallery || !d.gallery.length) return;
      // reuse the enriched payload (avoid double fetch): fillCard happens in enrich()
      const imgs = d.gallery.slice(0, 30);
      imgs.forEach((g, i) => {
        const im = document.createElement('img');
        im.src = g.url; im.loading = 'lazy'; im.alt = `Photo ${i + 1}`;
        im.dataset.idx = i;
        track.appendChild(im);
      });
      // click→lightbox is DELEGATED to the track: the track's pointer capture
      // (drag-to-scroll) retargets pointerup/click away from the <img>, so
      // per-image listeners never fire. The drag-vs-click guard stays.
      track.addEventListener('click', (e) => {
        if (track.dataset.dragged) return;
        // pointer capture retargets the click to the track — recover the real
        // target from the coordinates
        const im = e.target.closest('img') || document.elementFromPoint(e.clientX, e.clientY)?.closest('img');
        if (!im || !track.contains(im)) return;
        openLightbox(imgs, parseInt(im.dataset.idx, 10));
      });
      // dots
      const dots = card.querySelector('.dots');
      dots.innerHTML = imgs.map(() => '<i></i>').join('');
      const upd = () => {
        const idx = Math.round(track.scrollLeft / track.clientWidth);
        [...dots.children].forEach((dt, j) => dt.classList.toggle('on', j === idx));
      };
      track.addEventListener('scroll', upd, { passive: true });
      upd(); // first dot highlighted by default (scroll event only fires after a swipe)
      const cnt = card.querySelector('.img-count');
      cnt.textContent = imgs.length + ' photos'; cnt.classList.remove('hidden');
      // pointer drag
      let down = false, startX = 0, startScroll = 0, moved = false;
      track.addEventListener('pointerdown', e => {
        down = true; moved = false; startX = e.clientX; startScroll = track.scrollLeft;
        track.setPointerCapture(e.pointerId);
      });
      track.addEventListener('pointermove', e => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 6) { moved = true; track.classList.add('dragging'); }
        track.scrollLeft = startScroll - dx;
      });
      ['pointerup', 'pointercancel'].forEach(ev => track.addEventListener(ev, () => {
        down = false; track.classList.remove('dragging');
        track.dataset.dragged = moved ? '1' : '';
        setTimeout(() => { delete track.dataset.dragged; }, 80);
      }));
    });
}

// ---------- lightbox ----------
let lbImgs = [], lbIdx = 0;
function openLightbox(imgs, i) {
  lbImgs = imgs; lbIdx = i; showLb();
  $('#lightbox').classList.remove('hidden');
}
function showLb() {
  $('#lightboxImg').src = lbImgs[lbIdx].url;
  $('#lightboxCounter').textContent = `${lbIdx + 1} / ${lbImgs.length}`;
  // desktop arrows: disabled at the ends
  const prev = $('#lbPrev'), next = $('#lbNext');
  if (prev) prev.disabled = lbIdx <= 0;
  if (next) next.disabled = lbIdx >= lbImgs.length - 1;
}
// swipe left/right inside the lightbox (same gesture as the carousels);
// a tap on the backdrop or the image itself still closes it
(function lightboxSwipe() {
  const lb = $('#lightbox');
  let startX = null, startY = null, fired = false;
  lb.addEventListener('pointerdown', e => {
    startX = e.clientX; startY = e.clientY; fired = false;
  });
  // decide on BOTH move (responsive) and up (touch keyboards/pointercancel-proof);
  // a swipe that fired suppresses the tap-to-close click that follows
  const trySwipe = (dx, dy) => {
    if (fired || startX == null) return;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      fired = true;
      if (dx < 0 && lbIdx < lbImgs.length - 1) { lbIdx++; showLb(); }
      else if (dx > 0 && lbIdx > 0) { lbIdx--; showLb(); }
    }
  };
  lb.addEventListener('pointermove', e => trySwipe(e.clientX - startX, e.clientY - startY));
  lb.addEventListener('pointerup', e => {
    trySwipe(e.clientX - startX, e.clientY - startY);
    startX = null;
  });
  lb.addEventListener('pointercancel', () => { startX = null; });
  // swipe must NOT close the lightbox: suppress the click that follows a swipe
  lb.addEventListener('click', e => {
    if (fired) { e.stopPropagation(); fired = false; }
  }, true);
})();
// desktop prev/next arrows (stop propagation so they never hit the
// tap-to-close document handler)
$('#lbPrev').addEventListener('click', e => {
  e.stopPropagation();
  if (lbIdx > 0) { lbIdx--; showLb(); }
});
$('#lbNext').addEventListener('click', e => {
  e.stopPropagation();
  if (lbIdx < lbImgs.length - 1) { lbIdx++; showLb(); }
});
document.addEventListener('click', e => {
  if (e.target.id === 'lightbox' || e.target.id === 'lightboxImg') $('#lightbox').classList.add('hidden');
});
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.add('hidden')));
document.addEventListener('keydown', e => {
  if ($('#lightbox').classList.contains('hidden')) return;
  if (e.key === 'Escape') $('#lightbox').classList.add('hidden');
  if (e.key === 'ArrowRight' && lbIdx < lbImgs.length - 1) { lbIdx++; showLb(); }
  if (e.key === 'ArrowLeft' && lbIdx > 0) { lbIdx--; showLb(); }
});

// ---------- per-card data cache (for favourite snapshots) ----------
const cardCache = new Map(); // unitId -> { c, d }

// ---------- favourites ----------
let favIds = new Set();      // unitIds currently saved
// ---------- per-listing notes (persisted server-side in data/notes.json) ----------
// Debounced auto-save as the user types — no save button. Textarea
// re-population is centralized in syncNoteTextarea() because fillCard()
// rebuilds only .avail's innerHTML; the textarea sits outside it and
// buildCardShell starts it empty every time a card re-renders.
let notesMap = new Map();          // unitId -> saved text
const noteTimers = new Map();      // unitId -> pending save timer

async function loadNotes() {
  try {
    const r = await fetch('./api/notes');
    const d = await r.json();
    notesMap = new Map(Object.entries(d || {}).map(([k, v]) => [String(k), v.text || '']));
  } catch { /* notes stay empty */ }
  document.querySelectorAll('.card-notes').forEach(syncNoteTextarea);
}

function syncNoteTextarea(ta) {
  const saved = notesMap.get(String(ta.dataset.unit)) || '';
  // don't clobber what the user is mid-typing in an already-hydrated field
  if (ta.dataset.hydrated !== '1') { ta.value = saved; ta.dataset.hydrated = '1'; }
}

function saveNote(unitId, text, flush) {
  clearTimeout(noteTimers.get(unitId));
  noteTimers.delete(unitId);
  if (flush) doSaveNote(unitId, text);
  else noteTimers.set(unitId, setTimeout(() => { noteTimers.delete(unitId); doSaveNote(unitId, text); }, 600));
}

async function doSaveNote(unitId, text) {
  try {
    const r = await fetch(`./api/notes/${unitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (r.ok) notesMap.set(String(unitId), text);
  } catch { /* retry happens on next keystroke; field keeps local text */ }
}

// one delegated set of listeners — cards are rebuilt constantly
document.addEventListener('input', e => {
  const ta = e.target.closest('.card-notes');
  if (!ta) return;
  ta.dataset.hydrated = '1';
  saveNote(ta.dataset.unit, ta.value);
});
document.addEventListener('focusout', e => {
  const ta = e.target.closest('.card-notes');
  if (!ta) return;
  const unitId = String(ta.dataset.unit);
  // blur with a pending debounce: flush immediately instead of waiting
  if (noteTimers.has(unitId)) saveNote(unitId, ta.value, true);
});

let favsVisible = false;
let appliedVisible = false;

// ---------- applied marks (persisted server-side in data/applied.json) ----------
let appliedIds = new Set();  // unitIds currently marked as applied
let appliedMap = new Map();  // unitId -> appliedAt ISO string

async function loadApplied() {
  try {
    const r = await fetch('./api/applied');
    const d = await r.json();
    appliedIds = new Set((d.ids || []).map(String));
    appliedMap = new Map((d.applied || []).map(x => [String(x.unitId), x.appliedAt]));
  } catch { /* badge stays hidden */ }
  updateAppliedBtns();
}

function syncAppliedBtn(btn) {
  const on = appliedIds.has(btn.dataset.unit);
  btn.classList.toggle('on', on);
  btn.innerHTML = ICONS.check;
  btn.title = on ? 'Marked as applied — click to remove the mark' : 'Mark as applied';
}

function updateAppliedBtns() {
  document.querySelectorAll('.applied-btn').forEach(b => syncAppliedBtn(b));
  // applied-date lines can appear/disappear when the mark changes
  document.querySelectorAll('.card[data-unit]').forEach(el => syncAppliedLine(el));
}

// green "✓ Applied on …" line above the .avail divider, under the red
// "♥ Saved <date>" line when present (favourites view)
function syncAppliedLine(cardEl) {
  if (!cardEl) return;
  const unitId = cardEl.dataset.unit;
  if (!unitId) return;
  const av = cardEl.querySelector('.avail');
  if (!av) return;
  let line = cardEl.querySelector('.applied-line');
  if (appliedIds.has(unitId)) {
    if (line) line.remove();
    const span = document.createElement('span');
    span.className = 'applied-line';
    span.innerHTML = `${ICONS.check} Applied on ${fmtDate(appliedMap.get(unitId))}`;
    av.insertAdjacentElement('beforebegin', span);
  } else if (line) {
    line.remove();
  }
}

async function loadFavs() {
  try {
    const r = await fetch('./api/favourites');
    const d = await r.json();
    favIds = new Set((d.ids || []).map(String));
  } catch { /* badge stays hidden */ }
  updateFavBtns();
}

// light refresh of the counter only (no card sync)
async function loadFavsBadge() {
  try {
    const r = await fetch('./api/favourites');
    const d = await r.json();
    favIds = new Set((d.ids || []).map(String));
  } catch { return; }
  updateFavBtns();
}

// one ♥ badge on the Favs button — shows whichever list the active tab owns:
// Projects tab → saved projects, Properties tab → saved properties
function syncFavsBadge() {
  const n = projectsVisible ? projFavIds.size : favIds.size;
  for (const badge of [$('#favsCount'), $('#mFavsCount')]) {
    if (!badge) continue;
    badge.textContent = n;
    badge.classList.toggle('hidden', !n);
  }
}

function updateFavBtns() {
  // heart buttons on cards
  document.querySelectorAll('.fav-btn').forEach(b => syncFavBtn(b));
  syncFavsBadge();
}

function syncFavBtn(btn) {
  const on = favIds.has(btn.dataset.unit);
  btn.innerHTML = on ? ICONS.heartFill : ICONS.heart;
  btn.classList.toggle('on', on);
  btn.title = on ? 'Remove from favourites' : 'Save as favourite';
}

// snapshot = everything needed to re-render the card offline later
function buildSnapshot(unitId) {
  const cached = cardCache.get(unitId) || {};
  let d = cached.d || null;
  if (!d) {
    try { d = JSON.parse(localStorage.getItem('fw:' + unitId))?.d || null; } catch { /* noop */ }
  }
  return { c: cached.c || null, d };
}

async function toggleFav(unitId) {
  const wasOn = favIds.has(unitId);
  try {
    if (wasOn) {
      const r = await fetch(`./api/favourites/${unitId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      favIds.delete(unitId);
    } else {
      const r = await fetch('./api/favourites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, snapshot: buildSnapshot(unitId) }),
      });
      if (!r.ok) throw new Error('save failed');
      favIds.add(unitId);
    }
  } catch { return; } // leave state unchanged on failure
  updateFavBtns();
  if (favsVisible) {
    syncFavsUrl();
    renderFavsView(true);
  }
}

// delegate clicks on all card heart buttons (property units only — project
// cards use .pfav-btn and are handled by the projects delegate below)
document.addEventListener('click', e => {
  const btn = e.target.closest('.fav-btn');
  if (!btn || btn.classList.contains('pfav-btn')) return;
  e.stopPropagation();
  e.preventDefault();
  toggleFav(btn.dataset.unit);
}, true);

// ---------- applied-mark toggle (with confirm modal on un-mark) ----------
async function toggleApplied(unitId) {
  if (appliedIds.has(unitId)) {
    openAppliedConfirm(unitId);
    return;
  }
  try {
    const r = await fetch('./api/applied', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId }),
    });
    if (!r.ok) throw new Error('mark failed');
    const item = await r.json();
    appliedIds.add(String(item.unitId));
    appliedMap.set(String(item.unitId), item.appliedAt);
  } catch { return; } // leave state unchanged on failure
  updateAppliedBtns();
}

let appliedConfirmId = null;
function openAppliedConfirm(unitId) {
  appliedConfirmId = unitId;
  $('#appliedConfirmModal').classList.remove('hidden');
}
function closeAppliedConfirm() {
  $('#appliedConfirmModal').classList.add('hidden');
  appliedConfirmId = null;
}

// applied check buttons on cards (delegated capture, same pattern as hearts —
// they sit over the drag-vs-click carousel)
document.addEventListener('click', e => {
  const btn = e.target.closest('.applied-btn');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  toggleApplied(btn.dataset.unit);
}, true);

// clicking a card's project title link leaves the feed (in-app project page);
// remember the scroll position so browser-Back can restore it (restoreFeedScroll)
document.addEventListener('click', e => {
  const a = e.target.closest('a.title-link');
  if (!a) return;
  const card = a.closest('.card[data-unit]');
  if (card) captureFeedScroll(card.dataset.unit);
}, true);

// ---------- favourites view ----------
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

async function renderFavsView(useFilters = true) {
  const listEl = $('#favsList');
  listEl.innerHTML = '<div class="status">Loading favourites…</div>';
  let list = [];
  // apply the active filters to favourites too (server filters on stored
  // snapshot data; unfilterable keys like features are treated as no-ops)
  const qs = useFilters ? new URLSearchParams(collectParams()).toString() : '';
  let total = null;
  try {
    const r = await fetch(`./api/favourites${qs ? '?' + qs : ''}`);
    const d = await r.json();
    list = d.favourites || [];
    total = d.total;
    favIds = new Set((d.ids || []).map(String));
  } catch { listEl.innerHTML = '<div class="status">Could not load favourites.</div>'; return; }
  const meta = $('#favsMeta');
  if (meta) {
    meta.innerHTML = qs && total != null && total !== favIds.size
      ? `<b>${total}</b> of <b>${favIds.size}</b> favourites match the filters`
      : `<b>${favIds.size}</b> saved`;
  }
  updateFavBtns();
  listEl.innerHTML = '';
  if (!list.length) {
    listEl.innerHTML = '<div class="status">' + (qs ? 'No favourites match these filters.' : 'No favourites yet.<br>Tap the ♥ on a property card to save it here.') + '</div>';
    return;
  }
  for (const f of list) renderFavCard(listEl, f);
}

function renderFavCard(listEl, f) {
  const s = f.snapshot || {};
  const c = s.c || {};
  const d = s.d || {};
  const el = document.createElement('article');
  el.className = 'card fav-card';
  el.dataset.unit = f.unitId;
  const gallery = (d.gallery || []).slice(0, 30);
  el.innerHTML = `
    <div class="carousel">
      <div class="track" data-unit="${f.unitId}"></div>
      <div class="dots"></div>
      <div class="badge-updated hidden"></div>
      <div class="img-count hidden"></div>
      <button class="applied-btn" data-unit="${f.unitId}" title="Mark as applied" aria-label="Toggle applied mark"></button>
      <button class="fav-btn" data-unit="${f.unitId}" aria-label="Toggle favourite"></button>
    </div>
    <div class="body">
      <h2>${esc(d.project || c.title || 'Property ' + f.unitId)}</h2>
      <div class="loc-line"></div>
      <div class="subtitle">${esc(d.listingTitle ? d.listingTitle.replace(/\s+at\s+.*$/, '') : (c.subtitle || ''))}</div>
      <div class="price">${c.price != null ? fmtB(c.price) : (d.price != null ? fmtB(d.price) : '—')}<small>/mo</small></div>
      <p class="summary">${d.description ? esc(d.description.slice(0, 180) + (d.description.length > 180 ? '…' : '')) : ''}</p>
      <div class="spec-row"></div>
      <div class="chips-wrap"></div>
      <div class="fav-date">♥ Saved ${fmtDate(f.savedAt)}</div>
      <div class="avail"></div>
      <textarea class="card-notes" data-unit="${f.unitId}" rows="2" placeholder="Notes… (saved automatically)" spellcheck="false"></textarea>
    </div>`;
  listEl.appendChild(el);
  syncFavBtn(el.querySelector('.fav-btn'));
  syncAppliedBtn(el.querySelector('.applied-btn'));
  // reuse the normal card fillers against the stored detail payload
  fillCard(el, { ...d, detailUrl: d.detailUrl || c.detailUrl });
  // availability row (fillCard writes it from basicInfo; keep View-on-FazWaz link)
  // carousel from stored gallery — no refetch
  const track = el.querySelector('.track');
  if (gallery.length) {
    gallery.forEach((g, i) => {
      const im = document.createElement('img');
      im.src = g.url; im.loading = 'lazy'; im.alt = `Photo ${i + 1}`;
      im.dataset.idx = i;
      track.appendChild(im);
    });
    track.addEventListener('click', e => {
      const im = e.target.closest('img') || document.elementFromPoint(e.clientX, e.clientY)?.closest('img');
      if (!im || !track.contains(im)) return;
      openLightbox(gallery, parseInt(im.dataset.idx, 10));
    });
    const dots = el.querySelector('.dots');
    dots.innerHTML = gallery.map(() => '<i></i>').join('');
    track.addEventListener('scroll', () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      [...dots.children].forEach((dt, j) => dt.classList.toggle('on', j === idx));
    }, { passive: true });
    const cnt = el.querySelector('.img-count');
    cnt.textContent = gallery.length + ' photos'; cnt.classList.remove('hidden');
  }
  // spec row fallback when detail data is missing
  const sr = el.querySelector('.spec-row');
  if (!sr.innerHTML.trim()) {
    sr.innerHTML = spec(ICONS.bed, d.beds ?? c.beds, '') + spec(ICONS.bath, d.baths ?? '—') +
      spec(ICONS.area, (d.sqm ?? c.sqm) != null ? (d.sqm ?? c.sqm) + ' SqM' : '—') + spec(ICONS.home, d.type ?? '');
  }
}

// URL helpers — favourites live at <base>/favourites (a real path, not a query flag)
const isFavsPath = () => /\/favourites$/.test(location.pathname);
const resultsBase = () => appBase();
const favsUrl = qs => appBase() + 'favourites' + (qs ? '?' + qs : '');
// applied section: <base>/applied (a real path like favourites).
// Invariant: appliedVisible is true ONLY while the URL is <base>/applied —
// every exit (tab click, back) is either a full navigation or hideAppliedView.
const isAppliedPath = () => /\/applied$/.test(location.pathname);
const appliedUrl = () => appBase() + 'applied';

function showFavsView() {
  favsVisible = true;
  $('#results').classList.add('hidden');
  $('#sentinel').classList.add('hidden');
  $('#status').classList.add('hidden');
  $('#favsView').classList.remove('hidden');
  // Properties tab STAYS lit + ♥ lights up (sub-view of the properties side)
  setPropsTabOn();
  window.scrollTo({ top: 0 });
  renderFavsView(true);
}

function hideFavsView() {
  favsVisible = false;
  $('#favsView').classList.add('hidden');
  $('#results').classList.remove('hidden');
  $('#sentinel').classList.remove('hidden');
  history.replaceState(null, '', resultsBase());
  setPropsTabOn();
  // results list empty (e.g. page loaded straight into favourites)
  if (!$('#results').children.length && !state.loading) doSearch(true);
}

// ---------- applied view ----------
// The Applied tab shows full property cards for every unitId in
// data/applied.json. That file stores ONLY {unitId, appliedAt} (no snapshot),
// so cards are fetched live via the normal listing API — a delisted unit
// degrades to "Details unavailable" instead of vanishing with its date.
// Removing the mark here (check pill or confirm modal) drops the card from
// this list, mirroring the favourites view behaviour.
async function renderAppliedView() {
  const listEl = $('#appliedList');
  listEl.innerHTML = '<div class="status">Loading applied properties…</div>';
  let list = [];
  try {
    const r = await fetch('./api/applied');
    const d = await r.json();
    list = d.applied || [];
    appliedIds = new Set((d.ids || []).map(String));
    appliedMap = new Map(list.map(x => [String(x.unitId), x.appliedAt]));
  } catch {
    listEl.innerHTML = '<div class="status">Could not load applied properties.</div>';
    return;
  }
  const meta = $('#appliedMeta');
  if (meta) meta.innerHTML = `<b>${list.length}</b> applied`;
  listEl.innerHTML = '';
  if (!list.length) {
    listEl.innerHTML = '<div class="status">Nothing applied yet.<br>Tap the ✓ on a property card to mark it as applied.</div>';
    return;
  }
  for (const a of list) {
    const c = { unitId: a.unitId };
    const el = buildCardShell(c);
    el.classList.add('fav-card');
    listEl.appendChild(el);
    // same pipeline as the feed (noGuard: properties-side filters are reset on
    // this path, but must never drop an explicitly listed applied property)
    (async () => {
      await enrich(el, c, { noGuard: true });
      // buildCardShell rendered the price from search-card data, which the
      // applied list doesn't have — backfill it from the detail payload
      const d = cardCache.get(String(a.unitId))?.d;
      if (el.isConnected && d && d.price != null) {
        el.querySelector('.price').innerHTML = fmtB(d.price) + '<small>/mo</small>';
      }
    })();
    hydrateCarousel(el.querySelector('.track'), el, c);
    syncAppliedLine(el);
  }
}

function showAppliedView() {
  appliedVisible = true;
  $('#results').classList.add('hidden');
  $('#sentinel').classList.add('hidden');
  $('#status').classList.add('hidden');
  $('#appliedView').classList.remove('hidden');
  // Applied is a sub-view of the properties side — Properties tab stays lit,
  // ✓ Applied lights up (same contract as ♥ Favourites)
  setPropsTabOn();
  window.scrollTo({ top: 0 });
  renderAppliedView();
}

function hideAppliedView() {
  appliedVisible = false;
  $('#appliedView').classList.add('hidden');
  $('#results').classList.remove('hidden');
  $('#sentinel').classList.remove('hidden');
  history.replaceState(null, '', resultsBase());
  setPropsTabOn();
  // results list empty (e.g. page loaded straight into /applied)
  if (!$('#results').children.length && !state.loading) doSearch(true);
}

// keep the current filters in the URL while favourites are open
function syncFavsUrl() {
  history.replaceState(null, '', favsUrl(new URLSearchParams(collectParams()).toString()));
}

// ---------- project information view ----------
const isProjPath = () => /\/project$/.test(location.pathname);
// shared app base: strip whichever section path suffix is active.
// ALWAYS returns a TRAILING-SLASH base ('/fazwaz-rentals/'): every relative
// fetch in app.js is './api/…', which resolves against the "directory" of the
// current URL — without the slash, './api/search' on /fazwaz-rentals resolves
// to /api/search (outside the app → HTML 404 → "Unexpected token '<'").
const appBase = () => {
  const p = location.pathname.replace(/\/(projects|favourites|project|applied)$/, '');
  return p.endsWith('/') ? p : p + '/';
};
function projectPageUrl(fwProjectUrl) {
  return appBase() + 'project?url=' + encodeURIComponent(fwProjectUrl);
}
// full rentals listing for a project: /project?url=…&list=1 (real URL so the
// browser Back button works). Carries the project page's query through (unit
// deep links are dropped) so a refresh reopens the same list.
function projectListUrl(fwProjectUrl, sp) {
  const q = new URLSearchParams(sp || {});
  q.set('url', fwProjectUrl);
  q.set('list', '1');
  return appBase() + 'project?' + q.toString();
}
let projVisible = false;

function showProjView() {
  projVisible = true;
  $('#results').classList.add('hidden');
  $('#favsView').classList.add('hidden');
  $('#projectsView').classList.add('hidden');
  $('#sentinel').classList.add('hidden');
  $('#status').classList.add('hidden');
  $('#projView').classList.remove('hidden');
  // (a) hide the main filter bar on project detail pages — it drives the
  // properties list, which is not visible here, so it only confuses.
  // Back-to-results restores it.
  $('#filterbar').classList.add('hidden');
  window.scrollTo({ top: 0 });
}

function hideProjView() {
  projVisible = false;
  $('#projView').classList.add('hidden');
  $('#filterbar').classList.remove('hidden');
  if (projectsVisible) {
    $('#sentinel').classList.remove('hidden');
    showProjectsChrome(true);
    return;
  }
  $('#results').classList.remove('hidden');
  $('#sentinel').classList.remove('hidden');
  history.replaceState(null, '', resultsBase());
  if (!$('#results').children.length && !state.loading) doSearch(true);
}

// ---------- in-app unit card on the project page ----------
// Clicking an Available-Rentals row shows the SAME full property card as the
// home feed (buildCardShell + enrich + hydrateCarousel) in place of the
// project content; ?unit=<id> in the URL survives a refresh.
// put the viewport back on the card/row the user came from (project-page
// rentals list + unit card). Falls back to plain top when we have no memo
// (e.g. the card was removed meanwhile).
function restorePfListScroll(pos) {
  if (!pos) { window.scrollTo({ top: 0 }); return; }
  const target = pos.top != null
    ? $('#pfListBody .card[data-unit="' + CSS.escape(String(pos.unitId)) + '"]')
    : null;
  if (target) {
    // anchor on the card's CURRENT document offset (list may have re-rendered);
    // keep the card at the same viewport height it had when clicked
    const docTop = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, docTop - Math.max(0, pos.top)), behavior: 'instant' });
  } else {
    // card not found (re-sort, etc.) — restore the remembered window scroll
    window.scrollTo({ top: Math.max(0, pos.y || 0), behavior: 'instant' });
  }
}

function closeUnitCard(returnPos = null) {
  const wrap = $('#pfUnitView');
  if (!wrap || wrap.classList.contains('hidden')) return;
  wrap.classList.add('hidden');
  wrap.innerHTML = '';
  $('#projBody').classList.remove('hidden');
  $('#projBackBtn') && ($('#projBackBtn').classList.remove('hidden'));
  const sp = new URLSearchParams(location.search);
  if (sp.has('unit')) {
    sp.delete('unit');
    history.replaceState(null, '', appBase() + 'project' + (sp.toString() ? '?' + sp.toString() : ''));
  }
  if (returnPos) {
    // back to the project body — anchor on the rentals row that was clicked
    const row = $('.pf-unit[data-unit-id="' + CSS.escape(String(returnPos.unitId)) + '"]');
    if (row) {
      const docTop = row.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, docTop - Math.max(0, returnPos.top)), behavior: 'instant' });
      return;
    }
  }
  window.scrollTo({ top: 0 });
}

function openUnitCard(u) {
  // remember the clicked rentals row so the back button returns to it
  const row = $('.pf-unit[data-unit-id="' + CSS.escape(String(u.unitId)) + '"]');
  const returnPos = row
    ? { unitId: String(u.unitId), top: Math.round(row.getBoundingClientRect().top), y: window.scrollY }
    : null;
  closeUnitCard();
  const wrap = $('#pfUnitView');
  wrap.innerHTML = `
    <div class="favs-head">
      <button class="btn btn-ghost" id="pfUnitBack">← Back to all rentals</button>
    </div>
    <div class="pf-unit-card"></div>`;
  const card = buildCardShell({ unitId: u.unitId, price: u.price, beds: u.beds, sqm: u.sqm });
  wrap.querySelector('.pf-unit-card').appendChild(card);
  $('#projBody').classList.add('hidden');
  $('#projBackBtn') && ($('#projBackBtn').classList.add('hidden'));
  wrap.classList.remove('hidden');
  window.scrollTo({ top: 0 });
  $('#pfUnitBack').addEventListener('click', () => closeUnitCard(returnPos));
  const c = { unitId: u.unitId, detailUrl: u.url || '' };
  enrich(card, c, { noGuard: true });
  hydrateCarousel(card.querySelector('.track'), card, c);
  const sp = new URLSearchParams(location.search);
  sp.set('unit', u.unitId);
  history.replaceState(null, '', appBase() + 'project?' + sp.toString());
}

// ---------- full Available-Rentals listing page (per project) ----------
// Opened from the project page's "Available Rentals" heading. Real URL
// /project?url=…&list=1 (browser Back returns to the project page). Cards are
// the SAME home-feed pipeline (buildCardShell + enrich + hydrateCarousel),
// appended 30 at a time; clicking one opens the single-card view whose back
// button returns to this list.
let pfListOpen = false;

function closePfList() {
  pfListOpen = false;
  const wrap = $('#pfListView');
  wrap.classList.add('hidden');
  $('#pfListBody').innerHTML = '';
  $('#projBody').classList.remove('hidden');
  $('#projBackBtn') && ($('#projBackBtn').classList.remove('hidden'));
  window.scrollTo({ top: 0 });
}

function openPfUnitCard(u) {
  const wrap = $('#pfUnitView');
  // remember where the clicked card sat so "← Back to all rentals" can put
  // the user back on it instead of the top of the list
  let returnPos = null;
  const clicked = pfListOpen
    ? $('#pfListBody .card[data-unit="' + CSS.escape(String(u.unitId)) + '"]')
    : $('.pf-unit[data-unit-id="' + CSS.escape(String(u.unitId)) + '"]');
  if (clicked) returnPos = { unitId: String(u.unitId), top: Math.round(clicked.getBoundingClientRect().top), y: window.scrollY };
  if (pfListOpen) {
    // stacked on the full listing: hide the list, show the card on top
    $('#pfListView').classList.add('hidden');
  } else {
    closeUnitCard();
  }
  wrap.innerHTML = `
    <div class="favs-head">
      <button class="btn btn-ghost" id="pfUnitBack">← Back to all rentals</button>
    </div>
    <div class="pf-unit-card"></div>`;
  const card = buildCardShell({ unitId: u.unitId, price: u.price, beds: u.beds, sqm: u.sqm });
  wrap.querySelector('.pf-unit-card').appendChild(card);
  wrap.classList.remove('hidden');
  window.scrollTo({ top: 0 });
  $('#pfUnitBack').addEventListener('click', () => {
    if (pfListOpen) {
      // back to the rentals LISTING (not the project page)
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      $('#pfListView').classList.remove('hidden');
      const sp = new URLSearchParams(location.search);
      if (sp.has('unit')) {
        sp.delete('unit');
        history.replaceState(null, '', appBase() + 'project?' + sp.toString());
      }
      restorePfListScroll(returnPos);
    } else closeUnitCard(returnPos);
  });
  const c = { unitId: u.unitId, detailUrl: u.url || '' };
  enrich(card, c, { noGuard: true });
  hydrateCarousel(card.querySelector('.track'), card, c);
  const sp = new URLSearchParams(location.search);
  sp.set('unit', u.unitId);
  history.replaceState(null, '', appBase() + 'project?' + sp.toString());
}

async function renderProjectRentals(p, units, sortUnitsFn, wantUnit) {
  pfListOpen = true;
  $('#projBody').classList.add('hidden');
  $('#projBackBtn') && ($('#projBackBtn').classList.add('hidden'));
  const wrap = $('#pfListView');
  $('#pfListTitle').textContent = (p.name || 'Project') + ' — Available Rentals';
  const host = $('#pfListBody');
  host.innerHTML = '';
  wrap.classList.remove('hidden');
  window.scrollTo({ top: 0 });
  let current = [];
  let token = 0;
  const renderBatch = list => {
    for (const u of list) {
      const c = { unitId: u.unitId, detailUrl: u.url || '' };
      const el = buildCardShell({ unitId: u.unitId, price: u.price, beds: u.beds, sqm: u.sqm });
      host.appendChild(el);
      enrich(el, c, { noGuard: true });
      hydrateCarousel(el.querySelector('.track'), el, c);
    }
  };
  // first 30 immediately, then pace the rest in batches of 30
  const fullRender = mode => {
    const my = ++token;
    host.innerHTML = '';
    current = sortUnitsFn(units, mode);
    renderBatch(current.slice(0, 30));
    let shown = Math.min(30, current.length);
    (async () => {
      while (shown < current.length) {
        await new Promise(r => setTimeout(r, 350));
        if (my !== token || !pfListOpen) return; // re-sorted or backed out
        renderBatch(current.slice(shown, shown + 30));
        shown += 30;
      }
    })();
  };
  fullRender('sqm|desc');
  $('#pfListSort').onchange = () => fullRender($('#pfListSort').value);
  // click a card -> the single-card detail view, back button returns here
  host.onclick = e => {
    const el = e.target.closest('.card');
    if (!el) return;
    const u = current.find(x => String(x.unitId) === String(el.dataset.unit));
    if (u) openPfUnitCard(u);
  };
  $('#pfListBack').onclick = () => {
    if (history.length > 1) history.back();
    else {
      closePfList();
      const sp = new URLSearchParams(location.search);
      sp.delete('list'); sp.delete('unit');
      history.replaceState(null, '', appBase() + 'project?' + sp.toString());
    }
  };
  if (wantUnit) {
    const u = units.find(x => String(x.unitId) === String(wantUnit));
    if (u) openPfUnitCard(u);
  }
}

async function renderProject(fwUrl) {
  showProjView();
  // full listing mode (?list=1): the project page body stays hidden while the
  // per-project rentals list is shown instead
  const listMode = new URLSearchParams(location.search).get('list') === '1';
  if (listMode) $('#projBody').classList.add('hidden');
  // drop any unit card left open by a previous render (retry path)
  const uv = $('#pfUnitView');
  if (uv) { uv.classList.add('hidden'); uv.innerHTML = ''; }
  $('#projBackBtn') && ($('#projBackBtn').classList.remove('hidden'));
  const body = $('#projBody');
  body.innerHTML = '<div class="status">Loading project…</div>';
  let p;
  try {
    const r = await fetch('./api/project?url=' + encodeURIComponent(fwUrl));
    p = await r.json();
    if (p.error) throw new Error(p.detail || p.error);
  } catch (e) {
    body.innerHTML = '<div class="status">Could not load project: ' + esc(e.message) + '<br><button class="btn btn-primary" id="projRetryBtn" style="margin-top:12px">Retry</button></div>';
    body.querySelector('#projRetryBtn').addEventListener('click', () => renderProject(fwUrl));
    return;
  }
  const facts = p.facts || {};
  const factItems = Object.entries(facts).map(([k, v]) =>
    `<div class="pf-fact"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('');
  const gallery = p.gallery || [];
  const hero = gallery.length ? gallery : (p.hero ? [{ url: p.hero }] : []);
  const amenities = p.amenities || [];
  const reviews = p.reviews || [];

  body.innerHTML = `
    <div class="pf-hero">
      <div class="carousel pf-carousel">
        <div class="track pf-track"></div>
        <div class="dots"></div>
        <div class="img-count ${hero.length > 1 ? '' : 'hidden'}"></div>
      </div>
    </div>
    <div class="pf-head">
      <div>
        <h2 class="pf-title">${esc(p.name || 'Project')}</h2>
        <div class="pf-sub">${esc(p.address || '')}</div>
        <div class="pf-meta">
          ${p.rating != null ? `<span class="pf-rating">★ ${p.rating}</span><span class="pf-reviews-n">${p.reviewCount || 0} reviews</span>` : ''}
          ${p.developer ? `<span class="pf-dev">by ${esc(p.developer)}</span>` : ''}
          <a class="open-project" href="${esc(p.url || fwUrl)}" target="_blank" rel="noopener">View on FazWaz ↗</a>
        </div>
      </div>
      <button class="btn btn-ghost pf-map-btn">📍 Show on map</button>
    </div>
    ${factItems ? `<div class="pf-facts">${factItems}</div>` : ''}
    ${p.description ? `<div class="pf-section"><h3>About</h3><p class="pf-desc">${esc(p.description)}</p></div>` : ''}
    ${amenities.length ? `<div class="pf-section"><h3>Amenities</h3><div class="chips pf-amenities">${amenities.map(a => `<span class="tag t-amenity">${esc(a)}</span>`).join('')}</div></div>` : ''}
    ${p.lat ? `<div class="pf-section"><h3>Location</h3><div class="pf-transport">Loading transport…</div></div>` : ''}
    ${reviews.length ? `<div class="pf-section"><h3>Reviews</h3><div class="pf-reviews">${reviews.map(rv => `
      <div class="pf-review">
        <div class="pf-review-head"><b>${esc(rv.author || 'Resident')}</b>
          <span class="pf-review-stars">${'★'.repeat(rv.rating || 0)}${'☆'.repeat(Math.max(0, 5 - (rv.rating || 0)))}</span>
          <span class="pf-review-date">${esc(rv.date || '')}</span></div>
        <p>${esc(rv.text || '')}</p>
      </div>`).join('')}</div></div>` : ''}
    <div class="pf-section pf-rent-section"><h3><button class="pf-rent-link" id="pfRentLink" title="See all rentals for this project">Available Rentals</button> <span class="pf-count-badge hidden" id="pfRentCount"></span>
      <span class="pf-sort-box" id="pfSortBox">
        <label>Sort</label>
        <select id="pfUnitSort">
          <option value="sqm|desc" selected>Size (large → small)</option>
          <option value="sqm|asc">Size (small → large)</option>
          <option value="price|asc">Price (low → high)</option>
          <option value="price|desc">Price (high → low)</option>
          <option value="avail|asc">Available (soonest first)</option>
          <option value="avail|desc">Available (latest first)</option>
        </select>
      </span>
    </h3>
      <div class="pf-units"><div class="status">Loading rental units…</div></div>
    </div>`;

  // hero carousel: scroll-only + lightbox (same pattern as card carousels)
  const track = body.querySelector('.pf-track');
  hero.forEach((g, i) => {
    const im = document.createElement('img');
    im.src = g.url; im.loading = 'lazy'; im.alt = `Photo ${i + 1}`;
    im.dataset.idx = i;
    track.appendChild(im);
  });
  // delegated click — the hero track has no drag capture, but keep the pattern
  const heroLb = hero.map(x => ({ url: x.full || x.url }));
  track.addEventListener('click', e => {
    const im = e.target.closest('img');
    if (!im) return;
    openLightbox(heroLb, parseInt(im.dataset.idx, 10));
  });
  const dots = body.querySelector('.pf-carousel .dots');
  if (hero.length > 1) {
    dots.innerHTML = hero.map(() => '<i></i>').join('');
    track.addEventListener('scroll', () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      [...dots.children].forEach((dt, j) => dt.classList.toggle('on', j === idx));
    }, { passive: true });
    body.querySelector('.pf-carousel .img-count').textContent = hero.length + ' photos';
  }
  // map button
  body.querySelector('.pf-map-btn').addEventListener('click', () => openMap(p));
  // "Available Rentals" heading -> full project rentals listing page
  // (real navigation so browser Back returns to the project page)
  body.querySelector('#pfRentLink').addEventListener('click', () => {
    location.assign(projectListUrl(fwUrl, new URLSearchParams(location.search)));
  });

  // transport chips from the project location-matrix (top 2 per transit type)
  if (p.projectId && p.lat) {
    try {
      const r = await fetch(`./api/project/${p.projectId}/pois`);
      const pd = await r.json();
      const pois = pd.pois || [];
      const host = body.querySelector('.pf-transport');
      if (host) {
        const bits = [];
        for (const [cat, lbl] of [['bts-station', 'BTS'], ['mrt-station', 'MRT'], ['airport-rail-link-station', 'ARL']]) {
          for (const q of pois.filter(x => x.category_clean_name === cat)
            .sort((a, b) => (a.distance_value || 9e9) - (b.distance_value || 9e9)).slice(0, 2)) {
            bits.push(`<span class="tag t-transport" title="${esc(q.name)}">${lbl} ${esc(q.distance_text)} · ${esc(q.duration_text)}</span>`);
          }
        }
        host.innerHTML = bits.join('') || 'No transit data.';
      }
    } catch { /* transport row stays as-is */ }
  }

  // rental units — client-side sortable (sqm default desc). Clicking a unit
  // opens the SAME in-app property card used on the home page (enrich +
  // hydrateCarousel pipeline) instead of linking out to fazwaz.com.
  const renderUnits = (host, units) => {
    host.innerHTML = units.map(u => `
      <button class="pf-unit" type="button" data-unit-id="${esc(u.unitId)}" data-unit-url="${esc(u.url || '')}">
        <img src="${esc(u.img || '')}" loading="lazy" alt="">
        <div class="pf-unit-body">
          <div class="pf-unit-price">${fmtB(u.price)}<small>/mo</small></div>
          <div class="pf-unit-specs">${esc(u.beds || '—')} bed · ${esc(u.baths || '—')} bath · ${esc(u.sqm || '—')}</div>
          <div class="pf-unit-meta">${u.priceSqm ? '฿' + u.priceSqm.toLocaleString('en-US') + '/SqM · ' : ''}${esc(u.availableFrom ? 'Available: ' + (u.availableFrom === 'now' ? 'Now' : u.availableFrom) : (u.updated || ''))}</div>
        </div>
      </button>`).join('');
  };
  const sqmOf = u => {
    const m = String(u.sqm || '').match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };
  const availDays = u => {
    if (!u.availableFrom) return null;
    if (u.availableFrom === 'now') return 0;
    const t = Date.parse(u.availableFrom);
    return isNaN(t) ? null : t / 86400000; // relative day number keeps order
  };
  const sortUnits = (units, mode) => {
    const [key, dir] = String(mode).split('|');
    const mul = dir === 'asc' ? 1 : -1;
    const val = u => {
      if (key === 'price') return u.price;
      if (key === 'avail') return availDays(u);
      return sqmOf(u);
    };
    return units.slice().sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;  // unknown values sink regardless of direction
      if (vb == null) return -1;
      return (va - vb) * mul;
    });
  };
  if (!p.projectId) {
    body.querySelector('.pf-units').innerHTML = '<div class="status">Project id not found — no unit data.</div>';
    $('#pfSortBox') && ($('#pfSortBox').style.display = 'none');
    const rl = $('#pfRentLink');
    if (rl) { rl.disabled = true; rl.style.cursor = 'default'; }
    return;
  }
  let unitData = null;
  const applyUnitSort = () => {
    if (!unitData) return;
    const host = body.querySelector('.pf-units');
    if (!unitData.units.length) {
      host.innerHTML = '<div class="status">No rental units listed for this project.</div>';
      return;
    }
    renderUnits(host, sortUnits(unitData.units, $('#pfUnitSort').value));
  };
  $('#pfUnitSort').addEventListener('change', applyUnitSort);
  // click an Available-Rentals row -> in-app property card (same as home feed)
  body.querySelector('.pf-units').addEventListener('click', e => {
    const row = e.target.closest('.pf-unit');
    if (!row) return;
    const u = ((unitData && unitData.units) || []).find(x => String(x.unitId) === String(row.dataset.unitId));
    if (u) openUnitCard(u);
  });
  try {
    const r = await fetch(`./api/project/${p.projectId}/units`);
    const ud = await r.json();
    if (ud.error) throw new Error(ud.detail || ud.error);
    unitData = ud;
    const badge = body.querySelector('#pfRentCount');
    if (badge) { badge.textContent = ud.total; badge.classList.remove('hidden'); }
    applyUnitSort();
    const spL = new URLSearchParams(location.search);
    // full listing mode: render the per-project rentals LIST (home-feed cards)
    if (listMode) {
      renderProjectRentals(p, ud.units, sortUnits, spL.get('unit'));
      return;
    }
    // deep link: /project?url=…&unit=<id> reopens the clicked unit's card
    const wantUnit = spL.get('unit');
    if (wantUnit) {
      const u = ud.units.find(x => String(x.unitId) === String(wantUnit));
      if (u) openUnitCard(u);
    }
  } catch (e) {
    const msg = '<div class="status">Could not load rental units: ' + esc(e.message) + '<br><button class="btn btn-ghost" id="pfUnitsRetryBtn" style="margin-top:8px">Retry</button></div>';
    if (listMode) { $('#pfListBody').innerHTML = msg; }
    else body.querySelector('.pf-units').innerHTML = msg;
    body.querySelector('#pfUnitsRetryBtn')?.addEventListener('click', async () => {
      const retryMsg = '<div class="status">Loading rental units…</div>';
      if (listMode) $('#pfListBody').innerHTML = retryMsg;
      else body.querySelector('.pf-units').innerHTML = retryMsg;
      // re-run just the units section
      try {
        const r = await fetch(`./api/project/${p.projectId}/units`);
        const ud = await r.json();
        if (ud.error) throw new Error(ud.detail || ud.error);
        unitData = ud;
        const badge = body.querySelector('#pfRentCount');
        if (badge) { badge.textContent = ud.total; badge.classList.remove('hidden'); }
        applyUnitSort();
        if (listMode) renderProjectRentals(p, ud.units, sortUnits, null);
      } catch (e2) {
        const fail = '<div class="status">Still failing: ' + esc(e2.message) + '</div>';
        if (listMode) $('#pfListBody').innerHTML = fail;
        else body.querySelector('.pf-units').innerHTML = fail;
      }
    });
  }
}

$('#projBackBtn').addEventListener('click', () => {
  if (projectsVisible) {
    // arrived from the Projects section — return there (history.back() would
    // leave the app; the projects page was a full page load)
    hideProjView();
    return;
  }
  if (history.length > 1) history.back();
  else hideProjView();
});


// ---------- projects section (building properties) ----------
const isProjectsPath = () => /\/projects$/.test(location.pathname);
const projectsBase = () => appBase();
const projectsUrl = qs => appBase() + 'projects' + (qs ? '?' + qs : '');
let projectsVisible = false;

// amenity chips: the common ids surfaced by project pages' JSON-LD
// (verified across Vtara/Oka Haus/Park Origin pages). Matching is on the
// amenity NAME from the project's own amenityFeature list.
const PROJ_AMENITIES = [
  { id: 'communal-pool', label: 'Communal Pool', re: /communal pool|kids pool|swimming pool/i },
  { id: 'communal-gym', label: 'Communal Gym', re: /(^|\b)gym|fitness/i },
  { id: 'co-working', label: 'Co-Working Space', re: /co.?working|meeting room/i },
  { id: 'parking', label: 'Car Parking', re: /car parking|parking/i },
  { id: 'security', label: '24H Security', re: /24h security|security|cctv|key card/i },
  { id: 'sauna', label: 'Sauna / Onsen', re: /sauna|onsen|steam/i },
  { id: 'garden', label: 'Communal Garden', re: /garden/i },
  { id: 'kids', label: 'Kids Area', re: /kids|children/i },
  { id: 'shuttle', label: 'Shuttle Bus', re: /shuttle/i },
  { id: 'bbq', label: 'BBQ Area', re: /bbq|barbecue/i },
  { id: 'laundry', label: 'Laundry Service', re: /laundry|dry cleaning/i },
  { id: 'shop', label: 'Shops / Restaurant', re: /market|shop|restaurant|retail|cafe/i },
  { id: 'pets', label: 'Pet Friendly', re: /pet(s| area| friendly)/i },
  { id: 'ev', label: 'EV Charger', re: /ev charger|charging station/i },
];
let projFavIds = new Set();
let projLoading = false;
let projHasMore = true;
let projPage = 0;
let projSearchTimer = null;
// in-memory card data for snapshots (projectId -> directory card)
const projCardCache = new Map();

function syncProjFavBtns() {
  document.querySelectorAll('.pfav-btn').forEach(b => syncProjFavBtn(b));
  syncFavsBadge();
}
function syncProjFavBtn(btn) {
  const on = projFavIds.has(btn.dataset.project);
  btn.innerHTML = on ? ICONS.heartFill : ICONS.heart;
  btn.classList.toggle('on', on);
  btn.title = on ? 'Remove from saved projects' : 'Save this project';
}
function projSnapshot(projectId) {
  return { card: projCardCache.get(projectId) || null };
}
async function toggleProjFav(projectId) {
  const wasOn = projFavIds.has(projectId);
  try {
    if (wasOn) {
      const r = await fetch(`./api/project-favourites/${projectId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      projFavIds.delete(projectId);
    } else {
      const r = await fetch('./api/project-favourites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, snapshot: projSnapshot(projectId) }),
      });
      if (!r.ok) throw new Error('save failed');
      projFavIds.add(projectId);
    }
  } catch { return; }
  syncProjFavBtns();
  if (projectsVisible && $('#projSearchInput').dataset.mode === 'favs') renderProjFavsList();
}

// one project card (directory data + optional enriched page data)
function projCardHtml(p) {
  const url = projectPageUrl(p.url);
  const foot = [];
  if (p.units != null) foot.push(`<div class="pjc-foot-item"><b>${Number(p.units).toLocaleString()}</b><small>units</small></div>`);
  if (p.completed) foot.push(`<div class="pjc-foot-item"><b>${esc(p.completed)}</b><small>completed</small></div>`);
  if (p.transit && p.transit.label) foot.push(`<div class="pjc-foot-item"><b>${esc(p.transit.distance)}</b><small>${esc(p.transit.label)}</small></div>`);
  const tags = [];
  const am = p.amenities || [];
  for (const a of PROJ_AMENITIES) {
    if (am.some(x => a.re.test(x))) tags.push(`<span class="tag t-amenity">${esc(a.label)}</span>`);
  }
  return `
    <article class="card pjc" data-project="${esc(p.projectId)}">
      <div class="carousel pjc-carousel">
        <div class="track"></div>
        <div class="img-count hidden"></div>
        <button class="fav-btn pfav-btn" data-project="${esc(p.projectId)}" aria-label="Toggle saved project"></button>
      </div>
      <div class="body">
        <h2><a class="title-link" href="${esc(url)}">${esc(p.name || 'Project ' + p.projectId)}</a></h2>
        <div class="loc-line"><span class="loc">${ICONS.pin}<span>${esc(p.address || '')}</span></span></div>
        <div class="pjc-prices">
          ${p.rentPrice ? `<span class="pjc-price"><small>Monthly Rentals</small>${esc(p.rentPrice)}</span>` : ''}
          ${p.salesPrice ? `<span class="pjc-price pjc-price-sales"><small>Sales Prices</small>${esc(p.salesPrice)}</span>` : ''}
        </div>
        ${tags.length ? `<div class="chip-row pjc-tags">${tags.slice(0, 8).join('')}</div>` : ''}
        <div class="pjc-foot">${foot.join('')}</div>
        ${p.url ? `<div class="avail"><a class="pjc-details" href="${esc(url)}">View Details</a><a class="open-project" href="${esc(p.url)}" target="_blank" rel="noopener">View on FazWaz ↗</a></div>` : ''}
      </div>
    </article>`;
}

function mountProjCard(p) {
  const host = document.createElement('div');
  host.innerHTML = projCardHtml(p).trim();
  const el = host.firstElementChild;
  el.dataset.pjdata = JSON.stringify(p);
  projCardCache.set(p.projectId, p);
  syncProjFavBtn(el.querySelector('.pfav-btn'));
  // NOTE: no direct click listener here — the document-level .pfav-btn
  // delegate in wireProjects() handles the toggle. A direct listener PLUS
  // the delegate double-fired (instant unsave).
  // photo carousel from the card thumb (+ enriched gallery when available).
  // gallery entries carry {url: display variant, full: largest for lightbox}
  const track = el.querySelector('.track');
  const all = (p.gallery && p.gallery.length ? p.gallery : (p.img ? [{ url: p.img }] : []));
  const imgs = all.slice(0, 8); // card carousel: keep it light — detail page has the rest
  imgs.forEach((g, i) => {
    const im = document.createElement('img');
    im.src = g.url; im.loading = 'lazy'; im.alt = `Photo ${i + 1}`;
    im.dataset.idx = i;
    track.appendChild(im);
  });
  // delegated click (pointer capture on the track retargets img clicks — see units)
  const lbImgs = imgs.map(x => ({ url: x.full || x.url }));
  track.addEventListener('click', e => {
    if (track.dataset.dragged) return;
    const im = e.target.closest('img') || document.elementFromPoint(e.clientX, e.clientY)?.closest('img');
    if (!im || !track.contains(im)) return;
    openLightbox(lbImgs, parseInt(im.dataset.idx, 10));
  });
  const cnt = el.querySelector('.img-count');
  if (imgs.length > 1) {
    cnt.textContent = all.length > imgs.length ? imgs.length + '+' : imgs.length;
    cnt.textContent += ' photos';
    cnt.classList.remove('hidden');
  }
  return el;
}

// filter chips (desktop row + mobile sheet share the same state)
function buildProjAmenChips() {
  const row = $('#projAmenChips');
  row.innerHTML = '';
  for (const a of PROJ_AMENITIES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = a.label;
    b.dataset.pamen = a.id;
    b.addEventListener('click', () => {
      b.classList.toggle('on');
      $('#projSearchInput').dataset.amenDirty = '1';
      applyProjAmenUI();
    });
    row.appendChild(b);
  }
}
function projAmenSel() {
  return [...document.querySelectorAll('#projAmenChips .chip.on')].map(b => b.dataset.pamen);
}
// apply current chip state to the visible list
function applyProjAmenUI() {
  if ($('#projSearchInput').dataset.mode === 'favs') renderProjFavsList();
  else if ($('#projSearchInput').dataset.mode === 'search') applyProjAmenFilterToHost('#projSearchResults');
  else filterLoadedCards();
  syncProjSheetChips();
}
// toggle corpus/search cards in one host against the selected amenity chips
function applyProjAmenFilterToHost(hostSel) {
  let shown = 0, total = 0;
  document.querySelectorAll(`${hostSel} .pjc`).forEach(el => {
    total++;
    let p = null;
    try { p = JSON.parse(el.dataset.pjdata); } catch { }
    const ok = projCardMatches(p || {});
    el.classList.toggle('hidden', !ok);
    if (ok) shown++;
  });
  const sel = projAmenSel();
  const box = $('#projCountBox');
  if (sel.length) box.innerHTML = `<b>${shown}</b> of <b>${total}</b> listed project${total === 1 ? '' : 's'} match`;
}
function syncProjSheetChips() {
  const on = new Set(projAmenSel());
  document.querySelectorAll('#projSheetBody .chip').forEach(b => b.classList.toggle('on', on.has(b.dataset.pamen)));
}
function buildProjSheet() {
  const body = $('#projSheetBody');
  body.innerHTML = '';
  const w = document.createElement('div');
  w.className = 'mf-group';
  w.innerHTML = '<label>Project Features</label>';
  const rowEl = document.createElement('div');
  rowEl.className = 'chips';
  for (const a of PROJ_AMENITIES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = a.label;
    b.dataset.pamen = a.id;
    b.addEventListener('click', () => {
      b.classList.toggle('on');
      // mirror into the desktop row
      const twin = document.querySelector(`#projAmenChips .chip[data-pamen="${a.id}"]`);
      if (twin) twin.classList.toggle('on', b.classList.contains('on'));
      $('#projSearchInput').dataset.amenDirty = '1';
      applyProjAmenUI();
    });
    rowEl.appendChild(b);
  }
  w.appendChild(rowEl);
  body.appendChild(w);
  const open = () => {
    syncProjSheetChips();
    $('#projSheetBackdrop').classList.remove('hidden');
    $('#projSheet').classList.add('open');
    $('#projSheet').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    $('#projSheetBackdrop').classList.add('hidden');
    $('#projSheet').classList.remove('open');
    $('#projSheet').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  $('#projFiltersBtn').addEventListener('click', open);
  $('#projSheetClose').addEventListener('click', close);
  $('#projSheetBackdrop').addEventListener('click', close);
  $('#projSheetApply').addEventListener('click', () => { close(); applyProjAmenUI(); });
  $('#projSheetReset').addEventListener('click', () => {
    document.querySelectorAll('.chip[data-pamen]').forEach(b => b.classList.remove('on'));
    applyProjAmenUI();
  });
  let sy = null;
  const hr = $('.sheet-handle-row', $('#projSheet'));
  hr.addEventListener('pointerdown', e => { sy = e.clientY; });
  hr.addEventListener('pointermove', e => {
    if (sy == null) return;
    const dy = Math.max(0, e.clientY - sy);
    $('#projSheet').style.transform = `translateY(${dy}px)`;
  });
  hr.addEventListener('pointerup', e => {
    if (sy == null) return;
    const dy = e.clientY - sy; sy = null;
    $('#projSheet').style.transform = '';
    if (dy > 90) close();
  });
}

// card passes the currently selected amenity chips?
function projCardMatches(p) {
  const sel = projAmenSel();
  if (!sel.length) return true;
  const am = p.amenities || [];
  return sel.every(id => {
    const a = PROJ_AMENITIES.find(x => x.id === id);
    return a && am.some(x => a.re.test(x));
  });
}
function filterLoadedCards() {
  let shown = 0;
  document.querySelectorAll('#projectsList .pjc').forEach(el => {
    let p = null;
    try { p = JSON.parse(el.dataset.pjdata); } catch { }
    const ok = projCardMatches(p || {});
    el.classList.toggle('hidden', !ok);
    if (ok) shown++;
  });
  const box = $('#projCountBox');
  const sel = projAmenSel();
  if (sel.length) box.innerHTML = `<b>${shown}</b> project${shown === 1 ? '' : 's'} match the selected features`;
}

// corpus feed
async function loadProjectsPage(reset = false) {
  if (projLoading || (!projHasMore && !reset)) return;
  projLoading = true;
  const list = $('#projectsList');
  if (reset) { projPage = 0; projHasMore = true; list.innerHTML = ''; }
  const status = $('#status');
  status.classList.remove('hidden');
  status.textContent = 'Loading projects…';
  try {
    projPage += 1;
    const r = await fetch(`./api/projects?region=${encodeURIComponent(state.region)}&page=${projPage}`);
    const d = await r.json();
    if (d.error) throw new Error(d.detail || d.error);
    projHasMore = !!d.hasMore;
    for (const p of d.cards) list.appendChild(mountProjCard(p));
    filterLoadedCards();
    syncProjFavBtns();
    if (projPage === 1) syncProjFavsUrl();
    hydrateProjCards([...list.querySelectorAll('.pjc')]);
  } catch (e) {
    status.textContent = 'Could not load projects: ' + esc(e.message);
  } finally {
    projLoading = false;
    if (!projLoading && status.textContent.startsWith('Loading')) setStatus('');
  }
}

// batch-hydrate corpus cards with project-page data (amenities, facts, geo,
// photo gallery) — one POST, cards updated in place as data arrives.
// Overlapping calls QUEUE (renderProjFavsList can fire while the feed's batch
// is still in flight) instead of being silently dropped by the busy flag.
let projHydrating = false;
let projHydrateAgain = false;
async function hydrateProjCards(els) {
  if (projHydrating) { projHydrateAgain = true; return; }
  const need = els
    .filter(el => !el.dataset.hydrated)
    .map(el => { try { return JSON.parse(el.dataset.pjdata); } catch { return null; } })
    .filter(p => p && p.url);
  if (!need.length) return;
  projHydrating = true;
  try {
    const r = await fetch('./api/projects/enrich', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: need.map(p => p.url).slice(0, 40) }),
    });
    const d = await r.json();
    const byUrl = d.projects || {};
    for (const el of els) {
      if (el.dataset.hydrated) continue;
      let p = null;
      try { p = JSON.parse(el.dataset.pjdata); } catch { continue; }
      const full = byUrl[p.url];
      if (!full) { el.dataset.hydrated = '1'; continue; }
      const merged = { ...p, ...full, projectId: p.projectId, url: p.url };
      const fresh = mountProjCard(merged);
      fresh.dataset.hydrated = '1';
      // keep the "♥ Saved <date>" line when replacing a favourites card
      const meta = el.querySelector('.fav-date');
      if (meta) fresh.querySelector('.body').appendChild(meta);
      el.replaceWith(fresh);
    }
    syncProjFavBtns();
    filterLoadedCards();
  } catch { /* cards stay as directory data */ }
  finally {
    projHydrating = false;
    // a call arrived while we were busy — run one more pass over whatever is
    // on the page (it re-reads the DOM, skipping already-hydrated cards)
    if (projHydrateAgain) {
      projHydrateAgain = false;
      setTimeout(() => {
        const host = $('#projSearchResults').classList.contains('hidden')
          ? $('#projectsList') : $('#projSearchResults');
        hydrateProjCards([...host.querySelectorAll('.pjc')]);
      }, 50);
    }
  }
}

// name search (upstream autocomplete)
async function runProjSearch(q) {
  const host = $('#projSearchResults');
  if (!q || q.trim().length < 2) {
    host.innerHTML = '';
    host.classList.add('hidden');
    $('#projSearchInput').dataset.mode = '';
    syncFavsBtnOn();
    $('#projectsList').classList.remove('hidden');
    filterLoadedCards();
    syncProjFavsUrl();
    return;
  }
  $('#projSearchInput').dataset.mode = 'search';
  syncFavsBtnOn();
  $('#projectsList').classList.add('hidden');
  host.classList.remove('hidden');
  host.innerHTML = '<div class="status">Searching projects…</div>';
  try {
    const r = await fetch('./api/projects/search?q=' + encodeURIComponent(q.trim()));
    const d = await r.json();
    if (d.error) throw new Error(d.detail || d.error);
    if (!d.results.length) {
      host.innerHTML = '<div class="status">No projects found for “' + esc(q.trim()) + '”.</div>';
      return;
    }
    host.innerHTML = '';
    for (const s of d.results) {
      host.appendChild(mountProjCard({
        projectId: s.id,
        url: s.url,
        name: s.name,
        address: s.address,
        img: null,
      }));
    }
    syncProjFavBtns();
    // hydrate the matches with project-page data (amenities, facts, photos)
    // so the feature filter applies to them too
    const urls = d.results.map(s => s.url).filter(Boolean);
    if (urls.length) {
      try {
        const er = await fetch('./api/projects/enrich', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls }),
        });
        const ed = await er.json();
        for (const s of d.results) {
          const p = ed.projects && ed.projects[s.url];
          if (!p) continue;
          const merged = { ...p, projectId: s.id, url: s.url };
          const el = host.querySelector(`.pjc[data-project="${s.id}"]`);
          if (el) el.replaceWith(mountProjCard(merged));
        }
        syncProjFavBtns();
      } catch { /* cards stay as name+address matches */ }
    }
    host.insertAdjacentHTML('beforeend', '<div class="status proj-search-hint">Showing top name matches — open one for full details, photos and rental units.</div>');
    applyProjAmenFilterToHost('#projSearchResults');
  } catch (e) {
    host.innerHTML = '<div class="status">Search failed: ' + esc(e.message) + '</div>';
  }
  syncProjFavsUrl();
}

// saved projects list
async function renderProjFavsList() {
  const host = $('#projSearchResults');
  $('#projSearchInput').dataset.mode = 'favs';
  syncFavsBtnOn();
  $('#projectsList').classList.add('hidden');
  host.classList.remove('hidden');
  host.innerHTML = '<div class="status">Loading saved projects…</div>';
  let all = [];
  try {
    const r = await fetch('./api/project-favourites');
    const d = await r.json();
    projFavIds = new Set((d.ids || []).map(String));
    all = d.favourites || [];
  } catch { /* render empty below */ }
  const sel = projAmenSel();
  const list = all.filter(f => {
    if (!sel.length) return true;
    const am = (f.snapshot && f.snapshot.card && f.snapshot.card.amenities) || [];
    return sel.every(id => {
      const a = PROJ_AMENITIES.find(x => x.id === id);
      return a && am.some(x => a.re.test(x));
    });
  });
  syncProjFavBtns();
  host.innerHTML = '';
  if (!all.length) {
    host.innerHTML = '<div class="status">No saved projects yet.<br>Tap the ♥ on a project card to save it here.</div>';
    return;
  }
  if (!list.length) {
    host.innerHTML = '<div class="status">No saved projects match the selected features.</div>';
    return;
  }
  for (const f of list) {
    const card = (f.snapshot && f.snapshot.card) || {};
    const el = mountProjCard({
      projectId: f.projectId,
      url: card.url || null,
      name: card.name || 'Project ' + f.projectId,
      address: card.address || null,
      img: card.img || null,
      rentPrice: card.rentPrice, salesPrice: card.salesPrice,
      units: card.units, completed: card.completed, transit: card.transit,
    });
    const meta = document.createElement('div');
    meta.className = 'fav-date';
    meta.textContent = '♥ Saved ' + fmtDate(f.savedAt);
    el.querySelector('.body').appendChild(meta);
    host.appendChild(el);
  }
  // same enrichment as the main feed: replaces the thin snapshot cards with
  // hydrated ones (gallery, prices, amenity tags, units/completed/transit);
  // hydrateProjCards preserves the ♥ Saved <date> line on replacement
  hydrateProjCards([...host.querySelectorAll('.pjc')]);
  const box = $('#projCountBox');
  box.innerHTML = sel.length
    ? `<b>${list.length}</b> of <b>${all.length}</b> saved projects match`
    : `<b>${all.length}</b> saved project${all.length === 1 ? '' : 's'}`;
}

// chrome switching between sections — Properties/Projects behave as tabs
// (Properties is the default; the active tab is marked .on in the navbar)
function setPropsTabOn() {
  // Properties tab stays lit on /favourites AND /applied — both are sub-views
  // of the Properties side (only the Projects context unlights it)
  const on = !projectsVisible && !projVisible && !isProjectsPath() && !isProjPath();
  for (const b of [$('#propsBtn'), $('#mPropsBtn')]) {
    if (b) b.classList.toggle('on', on);
  }
  syncFavsBtnOn();
  syncAppliedBtnOn();
}
// ♥ Favourites button lights up when a favourites list is ACTIVELY shown:
// the properties favourites view, or the saved-projects list on the Projects tab.
// Clicking it again (handleFavsClick) toggles the list back off.
function syncFavsBtnOn() {
  const projSavedOpen = projectsVisible && $('#projSearchInput').dataset.mode === 'favs';
  const on = favsVisible || isFavsPath() || projSavedOpen;
  for (const b of [$('#favsBtn'), $('#mFavsBtn')]) {
    if (b) b.classList.toggle('on', on);
  }
}
// ✓ Applied button lights up while the applied list is shown; clicking it
// again (handleAppliedClick) toggles the list back off.
function syncAppliedBtnOn() {
  const on = appliedVisible || isAppliedPath();
  for (const b of [$('#appliedBtn'), $('#mAppliedBtn')]) {
    if (b) b.classList.toggle('on', on);
  }
}
function showProjectsChrome(fromDetails = false) {
  projectsVisible = true;
  projVisible = false;
  $('#results').classList.add('hidden');
  $('#favsView').classList.add('hidden');
  $('#projView').classList.add('hidden');
  $('#projectsView').classList.remove('hidden');
  $('#filterbar').classList.remove('hidden');
  // sentinel stays VISIBLE here: projIo watches it for the projects feed;
  // the UNITS observer is gated by !projectsVisible instead
  // projects tab: hide the UNITS controls, show the projects controls
  $('#coreFilters').classList.add('hidden');
  $('#moreFilters').classList.add('hidden');
  document.querySelector('.result-line').classList.add('hidden');
  $('#projFilters').classList.remove('hidden');
  $('#propsBtn').classList.remove('on');
  $('#mPropsBtn').classList.remove('on');
  // ♥ lights only if the saved-projects list is (still) open
  syncFavsBtnOn();
  $('#projectsBtn').classList.add('on');
  $('#mProjectsBtn').classList.add('on');
  syncFavsBadge();
  window.scrollTo({ top: 0 });
  if (!fromDetails) {
    if (!$('#projectsList').children.length) loadProjectsPage(true);
    else filterLoadedCards();
  }
  syncProjFavsUrl();
}
function hideProjectsChrome() {
  projectsVisible = false;
  $('#projectsView').classList.add('hidden');
  $('#projectsBtn').classList.remove('on');
  $('#mProjectsBtn').classList.remove('on');
  $('#projFilters').classList.add('hidden');
  $('#coreFilters').classList.remove('hidden');
  document.querySelector('.result-line').classList.remove('hidden');
  $('#results').classList.remove('hidden');
  $('#sentinel').classList.remove('hidden');
  history.replaceState(null, '', appBase());
  setPropsTabOn();
  syncFavsBadge();
  // back to the properties view: re-run if it was never searched
  if (!$('#results').children.length && !state.loading) doSearch(true);
}
function syncProjFavsUrl() {
  if (!projectsVisible) return;
  const p = new URLSearchParams();
  const mode = $('#projSearchInput').dataset.mode;
  if (mode === 'favs') p.set('saved', '1');
  if (mode === 'search') p.set('q', $('#projSearchInput').value.trim());
  const sel = projAmenSel();
  if (sel.length) p.set('features', sel.join(','));
  const qs = p.toString();
  const cur = location.search || '';
  if (qs !== cur.replace(/^\?/, '')) history.replaceState(null, '', projectsUrl(qs));
}

// project-favourites badge
async function loadProjFavs() {
  try {
    const r = await fetch('./api/project-favourites');
    const d = await r.json();
    projFavIds = new Set((d.ids || []).map(String));
  } catch { return; }
  syncProjFavBtns();
}

// wire static listeners (init block calls this after the DOM is ready)
function wireProjects() {
  buildProjAmenChips();
  buildProjSheet();
  const input = $('#projSearchInput');
  input.addEventListener('input', () => {
    clearTimeout(projSearchTimer);
    projSearchTimer = setTimeout(() => runProjSearch(input.value), 350);
  });
  $('#projSearchBtn').addEventListener('click', () => runProjSearch(input.value));
  $('#projSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(projSearchTimer); runProjSearch(input.value); }
  });
  $('#projResetBtn').addEventListener('click', () => {
    input.value = '';
    document.querySelectorAll('.chip[data-pamen]').forEach(b => b.classList.remove('on'));
    input.dataset.mode = '';
    syncFavsBtnOn();
    $('#projSearchResults').innerHTML = '';
    $('#projSearchResults').classList.add('hidden');
    $('#projectsList').classList.remove('hidden');
    filterLoadedCards();
    syncProjFavsUrl();
  });
  // heart delegation (search results mount dynamically)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.pfav-btn');
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    toggleProjFav(btn.dataset.project);
  }, true);
}

// deep link: /projects?saved=1 | ?q=vtara | ?features=communal-pool,parking
// params are captured by the caller BEFORE the URL gets rewritten
function restoreProjects(usp = new URLSearchParams(location.search)) {
  $('#projSearchInput').dataset.mode = '';
  const feats = (usp.get('features') || '').split(',').filter(Boolean);
  for (const id of feats) {
    const b = document.querySelector(`#projAmenChips .chip[data-pamen="${id}"]`);
    if (b) b.classList.add('on');
  }
  if (usp.get('saved') === '1') {
    renderProjFavsList();
  } else if ((usp.get('q') || '').trim().length >= 2) {
    $('#projSearchInput').value = usp.get('q');
    runProjSearch(usp.get('q'));
  } else {
    loadProjectsPage(true);
  }
}


// ---------- map modal (Longdo when key available, Leaflet+OSM fallback — JobThai pattern) ----------
let mapObj = null, longdoKey = null, longdoReady = null;

async function loadLongdoKey() {
  if (longdoKey !== null) return longdoKey;
  try {
    const r = await fetch('./api/longdo-key');
    if (r.ok) longdoKey = (await r.json()).key || null;
  } catch { longdoKey = null; }
  return longdoKey;
}
function loadLongdoScript(key) {
  return new Promise(resolve => {
    if (window.longdo && window.longdo.Map) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://api.longdo.com/map3/?key=' + encodeURIComponent(key);
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}
function clearOverlays() {
  try { if (mapObj.Overlays.clear) { mapObj.Overlays.clear(); return; } } catch { }
  try { (mapObj.Overlays.list() || []).forEach(o => mapObj.Overlays.remove(o)); } catch { }
}

// remove a previously drawn district layer (engine-specific)
function clearDistrictLayer() {
  try {
    if (mapObj._districtSource && mapObj.Renderer) {
      const R = mapObj.Renderer;
      if (R.getLayer(mapObj._districtSource)) R.removeLayer(mapObj._districtSource);
      if (R.getLayer(mapObj._districtSource + '-fill')) R.removeLayer(mapObj._districtSource + '-fill');
      if (R.getSource(mapObj._districtSource)) R.removeSource(mapObj._districtSource);
      mapObj._districtSource = null;
    }
  } catch { }
  try {
    if (mapObj._districtLeaflet && mapObj.removeLayer) {
      mapObj.removeLayer(mapObj._districtLeaflet);
      mapObj._districtLeaflet = null;
    }
  } catch { }
}

// draw a GeoJSON district boundary and fit the view to it (engine-specific)
function drawDistrict(polygon) {
  const srcId = 'fw-district-' + Date.now();
  let mnLat = 90, mxLat = -90, mnLon = 180, mxLon = -180;
  const walk = c => {
    if (Array.isArray(c[0])) c.forEach(walk);
    else {
      if (c[1] < mnLat) mnLat = c[1]; if (c[1] > mxLat) mxLat = c[1];
      if (c[0] < mnLon) mnLon = c[0]; if (c[0] > mxLon) mxLon = c[0];
    }
  };
  walk(polygon.coordinates);
  if (mapObj.Renderer) { // Longdo v3 (MapLibre underneath)
    // outline via the renderer (may silently fail on raster layers — camera
    // must NOT depend on it: Renderer.fitBounds proved unreliable on STANDARD)
    try {
      const R = mapObj.Renderer;
      R.addSource(srcId, { type: 'geojson', data: polygon });
      R.addLayer({ id: srcId + '-fill', type: 'fill', source: srcId, paint: { 'fill-color': '#006CE3', 'fill-opacity': .12 } });
      R.addLayer({ id: srcId, type: 'line', source: srcId, paint: { 'line-color': '#006CE3', 'line-width': 2, 'line-opacity': .8 } });
      mapObj._districtSource = srcId;
    } catch { }
    // camera: compute zoom that fits the bbox and set it through longdo's own
    // APIs (proven to work after 'ready') + a MapLibre jumpTo as backstop
    const cLat = (mnLat + mxLat) / 2, cLon = (mnLon + mxLon) / 2;
    const el = document.getElementById('mapEl');
    const w = Math.max((el ? el.clientWidth : 800) - 90, 200);
    const h = Math.max((el ? el.clientHeight : 500) - 90, 200);
    const cosL = Math.cos(cLat * Math.PI / 180);
    const zX = Math.log2(360 * w / (512 * Math.max(mxLon - mnLon, 1e-5)));
    const zY = Math.log2(360 * h * cosL / (512 * Math.max(mxLat - mnLat, 1e-5)));
    const z = Math.max(9, Math.min(15, Math.min(zX, zY)));
    try { mapObj.location({ lat: cLat, lon: cLon }, true); } catch { }
    try { mapObj.zoom(z, true); } catch { }
    try { mapObj.Renderer.jumpTo({ center: [cLon, cLat], zoom: z }); } catch { }
    return true;
  }
  if (window.L && mapObj instanceof L.Map) { // Leaflet fallback
    const layer = L.geoJSON(polygon, {
      style: { color: '#006CE3', weight: 2, opacity: .8, fillOpacity: .12 },
    }).addTo(mapObj);
    mapObj._districtLeaflet = layer;
    mapObj.fitBounds(layer.getBounds(), { padding: [40, 40] });
    return true;
  }
  return false;
}

// fetch the district polygon for a location string (cached server-side 30d)
async function fetchDistrict(q) {
  try {
    const r = await fetch('./api/district?q=' + encodeURIComponent(q));
    if (!r.ok) return null;
    const d = await r.json();
    return d.polygon ? d : null;
  } catch { return null; }
}

async function openMap(d) {
  $('#mapModal').classList.remove('hidden');
  $('#mapHead').innerHTML = `<h3 style="margin:0">${esc(d.project || d.name || 'Location')}</h3>
    <div class="sub">${esc(d.location || d.address || '')}</div>`;
  const key = await loadLongdoKey();
  if (key) {
    await loadLongdoScript(key);
    if (window.longdo && window.longdo.Map) {
      try {
        if (!(mapObj instanceof longdo.Map)) mapObj = null;
        if (!mapObj) {
          mapObj = new longdo.Map({
            placeholder: document.getElementById('mapEl'),
            layer: longdo.Layers.STANDARD, // แผนที่ (default Longdo street layer)
            ui: longdo.UiComponent.MobileWithFullLayerSelector,
          });
          // location()/Overlays.add() are silently ignored before the map is
          // ready (map then stays at Longdo's default center — Sathorn).
          // Wait for the 'ready' event, with a 3s timeout so a missed event
          // can't hang the modal.
          longdoReady = new Promise(resolve => {
            let done = false;
            const fin = () => { if (!done) { done = true; resolve(); } };
            try { mapObj.Event.bind('ready', fin); } catch { }
            setTimeout(fin, 3000);
          });
          await longdoReady;
          try { mapObj.Ui.Crosshair.visible(false); } catch { } // v3 red center cross reads as a misplaced pin
        }
        clearOverlays();
        // zoom out to show the whole district: draw its boundary and fit the
        // view to it (fall back to the pin-centered view when no boundary)
        clearDistrictLayer();
        const dist = d.location ? await fetchDistrict(d.location) : null;
        if (d.lat) {
          const pin = '<div style="width:24px;height:24px;background:var(--blue);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>';
          mapObj.Overlays.add(new longdo.Marker({ lat: +d.lat, lon: +d.lng },
            { icon: { html: pin, offset: { x: 0, y: -12 } }, title: d.project || 'Property' }));
        }
        if (dist && drawDistrict(dist.polygon)) {
          // view fitted to the district by drawDistrict
        } else if (d.lat) {
          try { mapObj.location({ lat: +d.lat, lon: +d.lng }, true); } catch { }
          try { mapObj.zoom(16, true); } catch { }
          try { mapObj.Renderer.jumpTo({ center: [+d.lng, +d.lat], zoom: 16 }); } catch { }
        } else {
          try { mapObj.location({ lat: 13.75, lon: 100.5 }, true); } catch { }
          try { mapObj.Renderer.jumpTo({ center: [100.5, 13.75], zoom: 11 }); } catch { }
        }
        return;
      } catch (e) {
        mapObj = null; // fall through to Leaflet
      }
    }
  }
  // Leaflet+OSM fallback
  if (!mapObj || typeof mapObj.setView !== 'function') mapObj = null;
  if (!mapObj) {
    mapObj = L.map('mapEl', { scrollWheelZoom: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(mapObj);
  }
  setTimeout(() => mapObj.invalidateSize(), 80);
  mapObj.setView([d.lat || 13.75, d.lng || 100.5], d.lat ? 16 : 12);
  if (d.lat) {
    mapObj.eachLayer(l => { if (l instanceof L.Marker) mapObj.removeLayer(l); });
    L.marker([d.lat, d.lng]).addTo(mapObj).bindPopup(esc(d.project || 'Property')).openPopup();
  }
  clearDistrictLayer();
  const dist = d.location ? await fetchDistrict(d.location) : null;
  if (dist) drawDistrict(dist.polygon);
}
$('#mapModal').addEventListener('click', e => {
  if (e.target.id === 'mapModal') $('#mapModal').classList.add('hidden');
});

// ---------- infinite scroll (30/page via pagination param) ----------
const io = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !state.loading && state.total != null
      && !projectsVisible && !projVisible && !favsVisible) {
    const shown = document.querySelectorAll('.card').length;
    if (shown < Math.min(state.total, 25 * 30)) {
      state.page += 1;
      doSearch(false);
    }
  }
}, { rootMargin: '600px' });
io.observe($('#sentinel'));

// projects corpus: infinite scroll for the projects list
const projIo = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && projectsVisible && !projLoading && projHasMore
      && !$('#projSearchInput').dataset.mode) {
    loadProjectsPage(false);
  }
}, { rootMargin: '600px' });
projIo.observe($('#sentinel'));


// ---------- mobile: bottom sheet + scroll collapse ----------
const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

function buildSheet() {
  // clone the desktop more-filters groups into the sheet body once,
  // then render mobile-first controls (price, beds, type) into it too
  const body = $('#sheetBody');
  const mkGroup = (label) => {
    const w = document.createElement('div'); w.className = 'mf-group';
    const l = document.createElement('label'); l.textContent = label;
    w.appendChild(l); body.appendChild(w); return w;
  };
  // price
  const pw = mkGroup('Price (฿/mo)');
  pw.insertAdjacentHTML('beforeend', `<div class="minmax">
    <input type="number" placeholder="Min" id="mPriceMin" inputmode="numeric">
    <span>–</span><input type="number" placeholder="Max" id="mPriceMax" inputmode="numeric"></div>`);
  // beds
  const bw = mkGroup('Beds'); const brow = document.createElement('div'); brow.className = 'chips';
  BEDS.forEach(b => {
    const btn = document.createElement('button'); btn.className = 'chip';
    btn.textContent = b === 'Studio' ? 'Studio' : b + '+';
    btn.dataset.key = 'beds'; btn.dataset.id = b;
    btn.addEventListener('click', () => {
      const arr = state.multi.beds; const i = arr.indexOf(b);
      i >= 0 ? arr.splice(i, 1) : arr.push(b);
      btn.classList.toggle('on'); scheduleCount();
    });
    brow.appendChild(btn);
  });
  bw.appendChild(brow);
  // type
  const tw = mkGroup('Property Type'); const trow = document.createElement('div'); trow.className = 'chips';
  TYPES.forEach(t => {
    const btn = document.createElement('button'); btn.className = 'chip';
    btn.textContent = t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    btn.dataset.key = 'type'; btn.dataset.id = t;
    btn.addEventListener('click', () => {
      const arr = state.multi.type; const i = arr.indexOf(t);
      i >= 0 ? arr.splice(i, 1) : arr.push(t);
      btn.classList.toggle('on'); scheduleCount();
    });
    trow.appendChild(btn);
  });
  tw.appendChild(trow);
  // the advanced groups — reuse the same FILTERS config
  const groups = [
    ['projectFeatures', 'Property Features'], ['projectAmenities', 'Project Amenities'],
    ['views', 'Views'], ['near_by', 'Nearby'], ['pets', 'Pets'], ['furniture', 'Furniture'],
    ['source', 'Listing Source'],
  ];
  for (const [key, label] of groups) {
    const w = mkGroup(label);
    const row = document.createElement('div'); row.className = 'chips';
    FILTERS[key].forEach(it => {
      const b = document.createElement('button'); b.className = 'chip'; b.textContent = it.label;
      b.dataset.key = key; b.dataset.id = it.id;
      b.addEventListener('click', () => {
        const arr = state.multi[key]; const i = arr.indexOf(it.id);
        i >= 0 ? arr.splice(i, 1) : arr.push(it.id);
        b.classList.toggle('on'); scheduleCount();
      });
      row.appendChild(b);
    });
    w.appendChild(row);
  }
  // video toggle
  const vw = mkGroup('Video Tour');
  vw.insertAdjacentHTML('beforeend', `<div class="chips"><button class="chip" id="mVideoChip">Only with Video Tours</button></div>`);
  $('#mVideoChip').addEventListener('click', e => {
    state.onlyVideo = !state.onlyVideo; e.target.classList.toggle('on'); scheduleCount();
  });
  // numeric ranges
  for (const r of RANGES) {
    const w = mkGroup(r.label);
    w.insertAdjacentHTML('beforeend', `<div class="minmax">
      <input type="number" placeholder="Min" data-mrange="${r.key}" data-idx="0" inputmode="numeric">
      <span>–</span><input type="number" placeholder="Max" data-mrange="${r.key}" data-idx="1" inputmode="numeric"></div>`);
  }
  body.querySelectorAll('input[data-mrange]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.ranges[inp.dataset.mrange][+inp.dataset.idx] = inp.value;
      scheduleCount();
    });
  });
  // sheet price inputs mirror state
  $('#mPriceMin').addEventListener('change', e => { state.ranges.monthly_price[0] = e.target.value; scheduleCount(); });
  $('#mPriceMax').addEventListener('change', e => { state.ranges.monthly_price[1] = e.target.value; scheduleCount(); });
  // full-width save-search button at the bottom of the scrollable body, above Apply
  const sv = document.createElement('div');
  sv.className = 'save-search-row';
  sv.innerHTML = `<button class="btn btn-ghost save-search-btn" id="sheetSaveBtn">💾 Save this search</button>`;
  body.appendChild(sv);

  // open / close
  const openSheet = () => {
    // mirror current filter values into sheet inputs + chips
    $('#mPriceMin').value = state.ranges.monthly_price[0];
    $('#mPriceMax').value = state.ranges.monthly_price[1];
    body.querySelectorAll('input[data-mrange]').forEach(inp => {
      inp.value = state.ranges[inp.dataset.mrange][+inp.dataset.idx] || '';
    });
    syncSheetChips();
    $('#sheetBackdrop').classList.remove('hidden');
    $('#filterSheet').classList.add('open');
    $('#filterSheet').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const closeSheet = () => {
    $('#sheetBackdrop').classList.add('hidden');
    $('#filterSheet').classList.remove('open');
    $('#filterSheet').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  $('#mFiltersBtn').addEventListener('click', openSheet);
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', closeSheet);
  $('#sheetApply').addEventListener('click', () => { closeSheet(); doSearch(true); });
  $('#sheetReset').addEventListener('click', () => location.search = '');
  $('#sheetSaveBtn').addEventListener('click', () => { closeSheet(); openSaveModal(); });
  // drag handle to dismiss
  let sy = null;
  const handleRow = $('.sheet-handle-row');
  handleRow.addEventListener('pointerdown', e => { sy = e.clientY; });
  handleRow.addEventListener('pointermove', e => {
    if (sy == null) return;
    const dy = Math.max(0, e.clientY - sy);
    $('#filterSheet').style.transform = `translateY(${dy}px)`;
  });
  handleRow.addEventListener('pointerup', e => {
    if (sy == null) return;
    const dy = e.clientY - sy; sy = null;
    $('#filterSheet').style.transform = '';
    if (dy > 90) closeSheet();
  });
}

// keep sheet chip states in sync when opened
function syncSheetChips() {
  const body = $('#sheetBody');
  // chips in the sheet don't carry data-key; rebuild their .on state from state.multi by text matching
  const keyById = {};
  for (const [key, items] of Object.entries(FILTERS)) for (const it of items) keyById[key + ':' + it.id] = it.label;
  const chips = body.querySelectorAll('.chip');
  chips.forEach(chip => {
    // find which group this chip belongs to by walking up to .mf-group and its label
    const g = chip.closest('.mf-group');
    const label = g ? g.querySelector('label')?.textContent : '';
    const map = { 'Property Features': 'projectFeatures', 'Project Amenities': 'projectAmenities', 'Views': 'views', 'Nearby': 'near_by', 'Pets': 'pets', 'Furniture': 'furniture', 'Listing Source': 'source', 'Beds': 'beds', 'Property Type': 'type' };
    const key = map[label];
    if (!key) {
      if (chip.id === 'mVideoChip') chip.classList.toggle('on', state.onlyVideo);
      return;
    }
    // find item id by label
    let id = null;
    if (key === 'beds') { id = chip.textContent === 'Studio' ? 'Studio' : chip.textContent.replace('+', ''); }
    else if (key === 'type') { id = chip.textContent.toLowerCase().replace(/\s+/g, '-'); }
    else { const it = (FILTERS[key] || []).find(x => x.label === chip.textContent); id = it ? it.id : null; }
    chip.classList.toggle('on', id != null && state.multi[key].includes(id));
  });
}

// mobile: count slot mirrors desktop count box
const countObserver = new MutationObserver(() => {
  $('#mCountSlot').innerHTML = $('#countBox').innerHTML;
});
countObserver.observe($('#countBox'), { childList: true, subtree: true });

// ---------- merged (OR) chips: double-tap a chip to merge it with others ----------
// A merged chip lives in state.multi[key] as a '+'-joined id string
// (e.g. '6082+6081'), rendered as one chip "Balcony ∨ Terrace".
// NOTE: MERGE/orModalKey are declared here because wireMerged() runs in the
// init block below, before the OR-modal section is evaluated.
const MERGE = { lastTap: null };
let orModalKey = null;

function mergeLabel(key, ids) {
  const pool = key === 'beds' ? BEDS.map(b => ({ id: b, label: b === 'Studio' ? 'Studio' : b + '+' }))
    : key === 'type' ? TYPES.map(t => ({ id: t, label: t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))
    : FILTERS[key] || [];
  return ids.map(id => (pool.find(x => x.id === id) || { label: id }).label).join(' ∨ ');
}

// render merged chips for every group into both the desktop panel and the sheet
function syncMergedChips() {
  for (const key of Object.keys(state.multi)) {
    const groups = (state.multi[key] || []).filter(v => v.includes('+'));
    for (const hostSel of ['#moreFilters', '#sheetBody']) {
      const host = document.querySelector(hostSel);
      if (!host) continue;
      let wrap = host.querySelector(`.merged-chips[data-mkey="${key}"]`);
      if (groups.length && !wrap) {
        // insert right after the group whose label maps to this key
        const labelMap = { projectFeatures: 'Property Features', projectAmenities: 'Project Amenities', views: 'Views', near_by: 'Nearby', pets: 'Pets', furniture: 'Furniture', source: 'Listing Source', beds: 'Beds', type: 'Property Type' };
        const group = [...host.querySelectorAll('.mf-group')].find(g => g.querySelector('label')?.textContent === labelMap[key]);
        if (!group) continue;
        wrap = document.createElement('div');
        wrap.className = 'mf-group merged-chips';
        wrap.dataset.mkey = key;
        wrap.innerHTML = '<label>Merged (any of)</label><div class="chips"></div>';
        group.after(wrap);
      }
      if (!wrap) continue;
      const row = wrap.querySelector('.chips');
      row.replaceChildren();
      for (const g of groups) {
        const ids = g.split('+');
        const chip = document.createElement('button');
        chip.className = 'chip chip-merged on';
        chip.textContent = mergeLabel(key, ids);
        chip.title = 'Tap to edit members';
        chip.addEventListener('click', () => openOrModal(key, ids)); // edit members
        const x = document.createElement('span');
        x.className = 'chip-merged-x';
        x.textContent = '✕';
        x.title = 'Remove merged filter';
        x.addEventListener('click', e => {
          e.stopPropagation();
          const arr = state.multi[key];
          const i = arr.indexOf(g);
          if (i >= 0) { arr.splice(i, 1); syncMergedChips(); scheduleCount(); }
        });
        chip.appendChild(x);
        row.appendChild(chip);
      }
      if (!groups.length) wrap.remove();
    }
  }
}

// long-press helper removed — double-tap replaced it everywhere (mobile-unreliable)

// ---------- OR modal: pick members for the OR group seeded with `seed` ----------
// (orModalKey is declared in the merged-chips section above)
function openOrModal(key, seed) {
  orModalKey = key;
  $('#orModalTitle').textContent = 'Merge filters (match ANY)';
  $('#orModalSub').textContent = `Pick the filters to combine for: ${groupLabel(key)}`;
  const row = $('#orModalChips');
  row.replaceChildren();
  const pool = key === 'beds' ? BEDS.map(b => ({ id: b, label: b === 'Studio' ? 'Studio' : b + '+' }))
    : key === 'type' ? TYPES.map(t => ({ id: t, label: t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))
    : FILTERS[key] || [];
  for (const it of pool) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = it.label; b.dataset.id = it.id;
    b.classList.toggle('on', seed.includes(it.id));
    b.addEventListener('click', () => b.classList.toggle('on'));
    row.appendChild(b);
  }
  $('#orModal').classList.remove('hidden');
}
function closeOrModal() { $('#orModal').classList.add('hidden'); orModalKey = null; }

function groupLabel(key) {
  return { projectFeatures: 'Property Features', projectAmenities: 'Project Amenities', views: 'Views', near_by: 'Nearby (distance)', pets: 'Pets', furniture: 'Furniture', source: 'Listing Source', beds: 'Beds', type: 'Property Type' }[key] || key;
}

function confirmOr() {
  const ids = [...document.querySelectorAll('#orModalChips .chip.on')].map(b => b.dataset.id);
  const key = orModalKey;
  if (!key || ids.length < 2) return; // need at least 2 for an OR to mean anything — keep modal open
  closeOrModal();
  const merged = ids.join('+');
  const arr = state.multi[key];
  // replace any existing merged chip that shares members, and remove members from plain selections
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].includes('+') || ids.includes(arr[i])) arr.splice(i, 1);
  }
  arr.push(merged);
  // member chips are inside the merge now — turn the base chips off so the
  // merged chip is the single source of truth for this group
  document.querySelectorAll(`.chip[data-key="${key}"]`).forEach(b => {
    if (ids.includes(b.dataset.id)) b.classList.remove('on');
  });
  syncMergedChips();
  scheduleCount();
}

// wire OR modal + double-tap on all selectable chips.
// (Long-press was tried first: on mobile it's unreliable — slow toggle taps
// fired the modal, and synthesized holds trigger context menus. Double-tap
// is deterministic: tap = toggle as before, tap-tap on the same chip = merge.)
function wireMerged() {
  $('#orConfirmBtn').addEventListener('click', confirmOr);
  $('#orCancelBtn').addEventListener('click', closeOrModal);
  $('#orModal').addEventListener('click', e => { if (e.target.id === 'orModal') closeOrModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#orModal').classList.contains('hidden')) closeOrModal();
  });
  MERGE.lastTap = null;
  document.addEventListener('click', e => {
    const chip = e.target.closest('.chip[data-key]');
    if (!chip || !document.body.contains(chip)) return;
    const now = Date.now();
    const key = chip.dataset.key, id = chip.dataset.id;
    const prev = MERGE.lastTap;
    MERGE.lastTap = { key: key, id: id, chip: chip, t: now };
    if (prev && prev.key === key && prev.id === id && prev.chip.isConnected && (now - prev.t) < 350) {
      // double-tap on the same chip -> merge modal, seeded with it.
      // The first tap already toggled the chip (its own listener ran) —
      // revert that toggle so the merge modal is the only state change.
      MERGE.lastTap = null;
      e.stopImmediatePropagation();
      e.preventDefault();
      const arr = state.multi[key] || [];
      const wasOn = chip.classList.contains('on');
      if (wasOn && !arr.find(v => v.includes('+') && v.split('+').includes(id))) {
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
        chip.classList.remove('on');
      } else if (!wasOn && !arr.includes(id) && !arr.find(v => v.includes('+') && v.split('+').includes(id))) {
        arr.push(id);
        chip.classList.add('on');
      }
      scheduleCount();
      const sel = arr;
      const existing = sel.find(v => v.includes('+') && v.split('+').includes(id));
      openOrModal(key, existing ? existing.split('+') : [id]);
    }
  }, true);
}


let savedSearches = [];

const currentSearchSnapshot = () => ({
  region: state.region,
  order: state.order,
  params: collectParams(),
});

async function loadSaved() {
  try {
    const r = await fetch('./api/saved');
    savedSearches = await r.json();
  } catch { savedSearches = []; }
  renderSavedDd();
  renderSavedSheet();
  // app opened with a bare URL: start on the default saved search's view,
  // or the plain defaults when none is set
  if (pendingDefaultSearch) {
    pendingDefaultSearch = false;
    const def = savedSearches.find(x => x.isDefault);
    if (def) applySearchToState(def.search);
    else doSearch(true);
  }
}

// put a saved search's filters into state + UI and run it
function applySearchToState(s) {
  state.region = s.region || '/thailand/bangkok';
  $('#region').value = state.region;
  state.order = s.order || 'created_at|desc';
  $('#orderBy').value = state.order;
  state.multi = { type: [], beds: [], projectFeatures: [], projectAmenities: [], views: [], near_by: [], pets: [], furniture: [], source: [] };
  state.ranges = { monthly_price: ['', ''], living_area: ['', ''], floors: ['', ''], storeys: ['', ''], land_plot: ['', ''], year_built: ['', ''] };
  state.onlyVideo = false;
  const p = s.params || {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'onlyVideoTourExists') state.onlyVideo = true;
    else if (state.multi[k]) state.multi[k] = parseMultiValue(k, v);
    else if (state.ranges[k]) {
      const [min, max] = String(v).split(',');
      state.ranges[k] = [min === 'null' ? '' : min, max === 'null' ? '' : max];
    }
  }
  syncMergedChips();
  syncAllChips();
  doSearch(true);
  // keep URL in sync with the applied search
  updateUrl();
}

// sync every chip on the page (desktop panel + mobile sheet) from state
function syncAllChips() {
  syncMergedChips();
  document.querySelectorAll('.chip[data-key]').forEach(b => {
    b.classList.toggle('on', (state.multi[b.dataset.key] || []).includes(b.dataset.id));
  });
  const vc = $('#videoChip'), mvc = $('#mVideoChip');
  if (vc) vc.classList.toggle('on', state.onlyVideo);
  if (mvc) mvc.classList.toggle('on', state.onlyVideo);
  $('#priceMin').value = state.ranges.monthly_price[0];
  $('#priceMax').value = state.ranges.monthly_price[1];
  $('#mPriceMin').value = state.ranges.monthly_price[0];
  $('#mPriceMax').value = state.ranges.monthly_price[1];
  document.querySelectorAll('input[data-range], input[data-mrange]').forEach(inp => {
    inp.value = state.ranges[inp.dataset.range || inp.dataset.mrange][+inp.dataset.idx] || '';
  });
  scheduleCount();
}

// reset state to defaults without changing the URL or re-searching
function resetFilterState() {
  state.region = '/thailand/bangkok';
  $('#region').value = state.region;
  state.order = 'created_at|desc';
  $('#orderBy').value = state.order;
  state.multi = { type: [], beds: [], projectFeatures: [], projectAmenities: [], views: [], near_by: [], pets: [], furniture: [], source: [] };
  state.ranges = { monthly_price: ['', ''], living_area: ['', ''], floors: ['', ''], storeys: ['', ''], land_plot: ['', ''], year_built: ['', ''] };
  state.onlyVideo = false;
}

// ---------- save modal (shared by desktop + mobile) ----------
let saveModalOpen = false;
function openSaveModal() {
  $('#saveTitleInput').value = '';
  $('#saveModal').classList.remove('hidden');
  saveModalOpen = true;
  setTimeout(() => $('#saveTitleInput').focus(), 50);
}
function closeSaveModal() {
  $('#saveModal').classList.add('hidden');
  saveModalOpen = false;
}
async function confirmSave() {
  const title = $('#saveTitleInput').value.trim();
  if (!title) { $('#saveTitleInput').focus(); return; }
  const body = { title, search: currentSearchSnapshot() };
  try {
    const r = await fetch('./api/saved', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const item = await r.json();
    if (item.id) {
      savedSearches.push(item);
      renderSavedDd();
      renderSavedSheet();
    }
  } catch { /* network error — still close the modal */ }
  closeSaveModal();
}

// ---------- desktop: dropdown next to Reset ----------
function renderSavedDd() {
  const list = $('#savedDdList');
  if (!savedSearches.length) {
    list.innerHTML = '<div class="saved-empty">No saved searches yet</div>';
    return;
  }
  list.innerHTML = '';
  for (const s of savedSearches) {
    const row = document.createElement('div');
    row.className = 'saved-row';
    row.innerHTML = `<button class="saved-run"><span class="saved-id">${esc(s.id)}</span>${esc(s.title)}</button>`;
    row.querySelector('.saved-run').addEventListener('click', () => {
      hideSavedDd();
      applySearchToState(s.search);
    });
    const def = document.createElement('button');
    def.className = 'saved-default' + (s.isDefault ? ' on' : '');
    def.textContent = s.isDefault ? '★' : '☆';
    def.title = s.isDefault ? 'Default view — click to unset' : 'Set as default view on app open';
    def.addEventListener('click', async e => {
      e.stopPropagation();
      await toggleDefaultSearch(s, def);
    });
    row.appendChild(def);
    const edit = document.createElement('button');
    edit.className = 'saved-edit'; edit.textContent = '✏️'; edit.title = 'Rename';
    edit.addEventListener('click', e => {
      e.stopPropagation();
      openRenameEditor(row, s, () => { hideSavedDd(); renderSavedSheet(); });
    });
    row.appendChild(edit);
    list.appendChild(row);
  }
}

function positionSavedDd(anchor) {
  const dd = $('#savedDropdown');
  const r = anchor.getBoundingClientRect();
  dd.style.top = r.bottom + 6 + 'px';
  // dropdown width varies with content — measure it (must be visible) and clamp
  const w = dd.offsetWidth || 300;
  dd.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
}
function showSavedDd(anchor) {
  const dd = $('#savedDropdown');
  dd.classList.remove('hidden'); // visible first so offsetWidth can be measured
  positionSavedDd(anchor);
}
function hideSavedDd() { $('#savedDropdown').classList.add('hidden'); }

// set/unset the default saved search (exactly one; server enforces exclusivity)
async function toggleDefaultSearch(s, btn) {
  const on = !s.isDefault;
  btn.disabled = true;
  try {
    const r = await fetch(`./api/saved/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: on }),
    });
    if (!r.ok) throw new Error('patch failed');
    savedSearches.forEach(x => { if (on) x.isDefault = (x.id === s.id); else if (x.id === s.id) delete x.isDefault; });
  } catch { /* keep old state on failure */ }
  btn.disabled = false;
  renderSavedDd();
  renderSavedSheet();
}

// inline rename: swap the title for an input + save/commit on Enter or blur
function openRenameEditor(row, s, onRenamed) {
  const runBtn = row.querySelector('.saved-run');
  if (row.querySelector('.rename-input')) return;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'rename-input'; inp.value = s.title; inp.maxLength = 80;
  runBtn.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = async () => {
    const t = inp.value.trim();
    if (t && t !== s.title) {
      try {
        await fetch(`./api/saved/${s.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: t }),
        });
        s.title = t;
      } catch { /* keep old title on failure */ }
    }
    onRenamed && onRenamed();
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { onRenamed && onRenamed(); }
  });
  inp.addEventListener('blur', () => commit());
  inp.addEventListener('click', e => e.stopPropagation());
}

// ---------- mobile: saved searches sheet ----------
function renderSavedSheet() {
  const body = $('#savedSheetBody');
  if (!savedSearches.length) {
    body.innerHTML = '<div class="saved-empty">No saved searches yet.<br>Open ⚙ Filters, set your filters, then tap 💾 Save this search.</div>';
    return;
  }
  body.innerHTML = '';
  for (const s of savedSearches) {
    const row = document.createElement('div');
    row.className = 'saved-row';
    row.innerHTML = `<button class="saved-run"><span class="saved-id">${esc(s.id)}</span>${esc(s.title)}</button>`;
    row.querySelector('.saved-run').addEventListener('click', () => {
      closeSavedSheet();
      applySearchToState(s.search);
    });
    const def = document.createElement('button');
    def.className = 'saved-default' + (s.isDefault ? ' on' : '');
    def.textContent = s.isDefault ? '★' : '☆';
    def.title = s.isDefault ? 'Default view — tap to unset' : 'Set as default view on app open';
    def.addEventListener('click', async e => {
      e.stopPropagation();
      await toggleDefaultSearch(s, def);
    });
    row.appendChild(def);
    const edit = document.createElement('button');
    edit.className = 'saved-edit'; edit.textContent = '✏️'; edit.title = 'Rename';
    edit.addEventListener('click', e => {
      e.stopPropagation();
      openRenameEditor(row, s, () => renderSavedSheet());
    });
    row.appendChild(edit);
    body.appendChild(row);
  }
}

function openSavedSheet() {
  renderSavedSheet();
  $('#savedBackdrop').classList.remove('hidden');
  $('#savedSheet').classList.add('open');
  $('#savedSheet').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeSavedSheet() {
  $('#savedBackdrop').classList.add('hidden');
  $('#savedSheet').classList.remove('open');
  $('#savedSheet').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function wireSaved() {
  // save buttons (desktop panel + mobile sheet; sheet button wired in buildSheet)
  $('#saveSearchBtn').addEventListener('click', openSaveModal);
  // modal
  $('#saveCancelBtn').addEventListener('click', closeSaveModal);
  $('#saveConfirmBtn').addEventListener('click', confirmSave);
  $('#saveTitleInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmSave(); });
  $('#saveModal').addEventListener('click', e => { if (e.target.id === 'saveModal') closeSaveModal(); });
  // applied un-mark confirmation modal
  $('#appliedConfirmOk').addEventListener('click', async () => {
    const id = appliedConfirmId;
    closeAppliedConfirm();
    if (!id) return;
    try {
      const r = await fetch(`./api/applied/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('unmark failed');
      appliedIds.delete(String(id));
    } catch { return; }
    updateAppliedBtns();
    // un-marking from the Applied tab removes the card from the list
    if (appliedVisible || isAppliedPath()) renderAppliedView();
  });
  $('#appliedConfirmCancel').addEventListener('click', closeAppliedConfirm);
  $('#appliedConfirmModal').addEventListener('click', e => { if (e.target.id === 'appliedConfirmModal') closeAppliedConfirm(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#appliedConfirmModal').classList.contains('hidden')) closeAppliedConfirm();
  });
  // desktop dropdown
  const savedAnchor = $('#savedBtn');
  savedAnchor.addEventListener('click', e => {
    e.stopPropagation();
    $('#savedDropdown').classList.contains('hidden') ? showSavedDd(savedAnchor) : hideSavedDd();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#savedDropdown') && !e.target.closest('#savedBtn')) hideSavedDd();
  });
  window.addEventListener('resize', hideSavedDd);
  // mobile sheet
  $('#mSavedBtn').addEventListener('click', openSavedSheet);
  $('#savedSheetClose').addEventListener('click', closeSavedSheet);
  $('#savedBackdrop').addEventListener('click', closeSavedSheet);
  // favourites buttons (desktop navbar + mobile bar) + back button.
  // Tab-aware: on the Projects tab the ♥ button shows/opens the SAVED
  // PROJECTS list (/projects?saved=1); on the Properties tab the normal
  // favourites view (/favourites).
  $('#favsBtn').addEventListener('click', e => {
    e.stopPropagation();
    handleFavsClick();
  });
  $('#mFavsBtn').addEventListener('click', e => {
    e.stopPropagation();
    handleFavsClick();
  });
  $('#favsBackBtn').addEventListener('click', hideFavsView);
  // ✓ Applied tab (desktop navbar + mobile bar) + back button
  $('#appliedBtn').addEventListener('click', e => {
    e.stopPropagation();
    handleAppliedClick();
  });
  $('#mAppliedBtn').addEventListener('click', e => {
    e.stopPropagation();
    handleAppliedClick();
  });
  $('#appliedBackBtn').addEventListener('click', () => location.assign(appBase()));
}

function handleFavsClick() {
  if (projectsVisible || isProjectsPath() || projVisible || isProjPath()) {
    // Projects context (tab or project detail page): if the saved list is
    // already open, toggle back to the feed
    if (isProjectsPath() && $('#projSearchInput').dataset.mode === 'favs') {
      $('#projSearchInput').value = '';
      runProjSearch('');
    } else {
      location.assign(projectsUrl('saved=1'));
    }
    return;
  }
  if (appliedVisible || isAppliedPath()) {
    // /applied is open: exit to the base (full reload keeps state clean)
    location.assign(appBase());
    return;
  }
  if (isFavsPath()) {
    // already on /favourites: back to results
    hideFavsView();
    updateUrl();
  } else {
    // clicking Favourites always resets all filters (full reload = clean state)
    location.assign(favsUrl(''));
  }
}

// ✓ Applied tab: full navigation to <base>/applied (same pattern as the
// Projects tab); clicking it again while open returns to the clean base
function handleAppliedClick() {
  if (appliedVisible || isAppliedPath()) {
    location.assign(appBase());
    return;
  }
  location.assign(appliedUrl());
}


// mobile: measure frozen header+bar+sortline, stack them flush, and offset the results list
(function mobileOffsets() {
  if (!isMobile()) return;
  const apply = () => {
    const top = document.querySelector('.topbar');
    const bar = document.querySelector('.filterbar');
    const line = document.querySelector('.result-line');
    if (!top || !bar || !line) return;
    const topH = top.offsetHeight;
    // bar sits flush under the header (no hardcoded 54px gap)
    bar.style.top = topH + 'px';
    // .result-line lives INSIDE .filterbar — its height is already in
    // bar.offsetHeight; adding it again double-counts and leaves a blank
    // white strip below the frozen bar (and above Back-to-results on the
    // project/favourites pages). Only count it if it ever moves out of the bar.
    const extra = bar.contains(line) ? 0 : line.offsetHeight;
    const total = topH + bar.offsetHeight + extra;
    // single offset on the body — do NOT also pad .results (that double-counts)
    document.body.style.paddingTop = total + 'px';
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('load', apply);
  setTimeout(apply, 400);
  setTimeout(apply, 1200);
  // section switches change the frozen-bar composition (projects bar is taller)
  window.addEventListener('click', e => {
    if (e.target.closest('#projectsBtn, #mProjectsBtn, #propsBtn, #mPropsBtn, #appliedBtn, #mAppliedBtn, #appliedBackBtn, #projBackBtn')) setTimeout(apply, 350);
  });
})();

// mobile bar: keep the ACTIVE tab scrolled into view (the bar swipes
// horizontally now, so a tab can sit off-screen after a section switch)
(function scrollActiveTabIntoView() {
  const scrollNow = () => {
    const bar = document.getElementById('mobileBar');
    if (!bar) return;
    const active = bar.querySelector('.btn.on') || bar.querySelector('.btn:not(.hidden)');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };
  // after restore + after section switches (the 350ms chrome-settle timer)
  setTimeout(scrollNow, 500);
  window.addEventListener('click', e => {
    if (e.target.closest('#projectsBtn, #mProjectsBtn, #propsBtn, #mPropsBtn, #appliedBtn, #mAppliedBtn, #appliedBackBtn, #projBackBtn, #favsBtn, #mFavsBtn')) setTimeout(scrollNow, 450);
  });
  window.addEventListener('load', scrollNow);
})();

// restore from URL on load
let pendingDefaultSearch = false;
(function restore() {
  const usp = new URLSearchParams(location.search);
  // /project path: render the project page from ?url=<fazwaz project url>
  if (isProjPath()) {
    resetFilterState();
    const fwUrl = usp.get('url');
    if (fwUrl) renderProject(fwUrl);
    else $('#projBody').innerHTML = '<div class="status">No project url given.</div>';
    return;
  }
  // /projects path: the projects (building properties) section.
  // Pass the params captured BEFORE showProjectsChrome() — it rewrites the
  // URL (strips the query), so restoreProjects must not re-read location.
  if (isProjectsPath()) {
    resetFilterState();
    showProjectsChrome();
    restoreProjects(usp);
    return;
  }
  // properties view: mark the default tab active
  setPropsTabOn();
  // /applied path: show the applied list (filters are not applicable here)
  if (isAppliedPath()) {
    resetFilterState();
    showAppliedView();
    return;
  }
  // /favourites path: filters were reset by the button that navigated here —
  // reset state anyway (deep links may carry filter params) and show favourites
  if (isFavsPath()) {
    resetFilterState();
    showFavsView();
    return;
  }
  // bare URL (no filters/page/sort): start from the default saved search if one
  // is set (applied in loadSaved, after buildSheet() — applySearchToState needs
  // the sheet inputs); otherwise plain defaults
  if (![...usp.keys()].length) {
    pendingDefaultSearch = true;
    return;
  }
  for (const [k, v] of usp.entries()) {
    if (k === 'favs') continue;
    if (k === 'page') state.page = +v || 1;
    else if (k === 'order') { state.order = v; $('#orderBy').value = v; }
    else if (k === 'onlyVideoTourExists') { state.onlyVideo = true; $('#videoChip')?.classList.add('on'); }
    else if (state.multi[k]) {
      state.multi[k] = parseMultiValue(k, v);
      document.querySelectorAll(`.chip[data-key="${k}"]`).forEach(b => {
        if (state.multi[k].includes(b.dataset.id)) b.classList.add('on');
      });
      syncMergedChips();
    } else if (state.ranges[k]) {
      const [min, max] = v.split(',');
      state.ranges[k] = [min === 'null' ? '' : min, max === 'null' ? '' : max];
      if (k === 'monthly_price') { $('#priceMin').value = state.ranges[k][0]; $('#priceMax').value = state.ranges[k][1]; }
    }
  }
  doSearch(true);
})();

// ---------- wire up ----------
buildFilters();
buildSheet();
wireSaved();
wireMerged();
wireProjects();
loadSaved();
loadFavs();
loadProjFavs();
loadApplied();
loadNotes();
$('#propsBtn').addEventListener('click', e => {
  e.stopPropagation();
  // Properties tab: if the page is on /projects|/favourites|/applied (full page
  // load), navigate to the clean base; otherwise restore the units view in place
  if (isProjectsPath() || isFavsPath() || isAppliedPath()) {
    location.assign(appBase());
  } else if (projectsVisible) {
    hideProjectsChrome();
  } else if (favsVisible) {
    hideFavsView();
    updateUrl();
  } else if (appliedVisible) {
    hideAppliedView();
    updateUrl();
  } else if (projVisible) {
    hideProjView();
  }
});
$('#mPropsBtn').addEventListener('click', e => {
  e.stopPropagation();
  if (isProjectsPath() || isFavsPath() || isAppliedPath()) location.assign(appBase());
  else if (projectsVisible) hideProjectsChrome();
  else if (favsVisible) { hideFavsView(); updateUrl(); }
  else if (appliedVisible) { hideAppliedView(); updateUrl(); }
  else if (projVisible) hideProjView();
});
$('#projectsBtn').addEventListener('click', e => {
  e.stopPropagation();
  // Projects section is a real path — full navigation keeps state clean
  location.assign(projectsUrl(''));
});
$('#mProjectsBtn').addEventListener('click', e => {
  e.stopPropagation();
  location.assign(projectsUrl(''));
});
$('#searchBtn').addEventListener('click', () => doSearch(true));
$('#resetBtn').addEventListener('click', () => location.search = '');
$('#moreFiltersBtn').addEventListener('click', () => {
  const mf = $('#moreFilters');
  mf.classList.toggle('hidden');
  $('#moreFiltersBtn').textContent = mf.classList.contains('hidden') ? 'More Filters ▾' : 'Less Filters ▴';
});
$('#orderBy').addEventListener('change', e => { state.order = e.target.value; doSearch(true); });
$('#region').addEventListener('change', e => { state.region = e.target.value; doSearch(true); });