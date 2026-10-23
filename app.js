'use strict';

const APP_VERSION = '32 · 23.10.2026';

/* ======================= helpers ======================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = (v) => (Array.isArray(v) ? v[0] : v) || '';
const fmt = (s) => {
  if (!isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
};
const fmtLong = (s) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
};
const fmtCount = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' млн' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + ' тыс.' : String(n || 0);
const parseLen = (v) => {
  if (v == null || v === '') return 0;
  if (String(v).includes(':')) return String(v).split(':').reduce((a, n) => a * 60 + (+n || 0), 0);
  return +v || 0;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const tracksWord = (n) => `${n} ${plural(n, 'трек', 'трека', 'треков')}`;
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch {}
const countryName = (code, fallback) => { try { return (code && regionNames && regionNames.of(code.toUpperCase())) || fallback || code; } catch { return fallback || code; } };

const store = {
  get(k, d) { try { const v = localStorage.getItem('nota:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nota:' + k, JSON.stringify(v)); } catch {} },
};

async function getJSON(url, ms = 15000) {
  try { return await getJSONOnce(url, ms); } catch { return getJSONOnce(url, ms); }
}
async function getJSONOnce(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
/* Cache: answers are kept in memory and in localStorage, so screens open instantly
   from the last known data while a fresh copy loads in the background. */
/* a small queue: at most n requests of one kind at the same time */
function limiter(n) {
  let active = 0;
  const waiting = [];
  const next = () => { if (active >= n || !waiting.length) return; active++; const [fn, res, rej] = waiting.shift(); fn().then(res, rej).finally(() => { active--; next(); }); };
  return (fn) => new Promise((res, rej) => { waiting.push([fn, res, rej]); next(); });
}
const slow = limiter(2);
const memo = new Map();
const CACHE_FRESH = 15 * 60 * 1000;
const disk = {
  get(k) { try { const v = localStorage.getItem('nota:c:' + k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, d) { (window.requestIdleCallback || setTimeout)(() => this.write(k, d)); },
  write(k, d) {
    const v = JSON.stringify({ t: Date.now(), d });
    try { localStorage.setItem('nota:c:' + k, v); } catch {
      try { Object.keys(localStorage).filter((x) => x.startsWith('nota:c:')).forEach((x) => localStorage.removeItem(x)); localStorage.setItem('nota:c:' + k, v); } catch {}
    }
  },
};
const ready = (d) => { const p = Promise.resolve(d); p.v = d; return p; };
function cached(key, fn, fresh = CACHE_FRESH) {
  if (memo.has(key)) return memo.get(key);
  const keep = !key.startsWith('s-');
  const hit = keep ? disk.get(key) : null;
  const load = () => fn().then((d) => { if (keep) disk.set(key, d); return d; });
  let p;
  if (hit) {
    p = ready(hit.d);
    if (Date.now() - hit.t > fresh) load().then((d) => memo.set(key, ready(d))).catch(() => {});
  } else {
    p = load().then((d) => { p.v = d; return d; }, (e) => { memo.delete(key); throw e; });
  }
  memo.set(key, p);
  return p;
}
/* map a promise, keeping its instant value when it already has one */
function mapP(p, fn) { if (p.v !== undefined) return ready(fn(p.v)); const q = p.then(fn); q.then((d) => { q.v = d; }, () => {}); return q; }
function allP(list) { return list.every((p) => p.v !== undefined) ? ready(list.map((p) => p.v)) : Promise.all(list); }
function whenReady(p, ok, fail) { if (p.v !== undefined) ok(p.v); else p.then(ok, fail); }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ======================= icons ======================= */
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.6v14.8c0 .9 1 1.4 1.7.9l11.2-7.4c.6-.4.6-1.4 0-1.8L8.7 3.7C8 3.2 7 3.7 7 4.6z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="5.5" y="4" width="4.6" height="16" rx="1.3"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.3"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.3 4.2 12.8A5 5 0 0 1 12 6.4a5 5 0 0 1 7.8 6.4zm0-2.6 6.3-6.2a3 3 0 0 0-4.7-3.8L12 9.4l-1.6-1.7a3 3 0 0 0-4.7 3.8z"/></svg>',
  heartOn: '<svg viewBox="0 0 24 24"><path d="M12 20.3 4.2 12.8A5 5 0 0 1 12 6.4a5 5 0 0 1 7.8 6.4z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M16.6 3.6 20.5 7.5l-3.9 3.9V8.6h-2.2l-7.1 8.1H3.5v-2h2.9l7.1-8.1h3.1zm0 9.4 3.9 3.9-3.9 3.9v-2.8h-3.1l-2.4-2.7 1.4-1.6 1.9 2.2h2.2zM3.5 6.3h3.8l2.5 2.8-1.4 1.6-2-2.4H3.5z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M3 6h12v2H3zm0 5h12v2H3zm0 5h8v2H3zm14-2.5 5 3.5-5 3.5z"/></svg>',
  queue: '<svg viewBox="0 0 24 24"><path d="M3 6h12v2H3zm0 5h12v2H3zm0 5h8v2H3zm15-3v-3h2v3h3v2h-3v3h-2v-3h-3v-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M3 5h12v2H3zm0 4h12v2H3zm0 4h8v2H3zm14-8h4v2h-2v9.5a2.5 2.5 0 1 1-2-2.45z"/></svg>',
  album: '<svg viewBox="0 0 24 24"><path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 6.3a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zm0 2.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
  person: '<svg viewBox="0 0 24 24"><path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 10.5c4.7 0 8.5 2.4 8.5 5.3V21h-17v-2.2c0-2.9 3.8-5.3 8.5-5.3z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><path d="M12 9.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM7 6.2l1.4 1.4a6.2 6.2 0 0 0 0 8.8L7 17.8a8.2 8.2 0 0 1 0-11.6zm10 0a8.2 8.2 0 0 1 0 11.6l-1.4-1.4a6.2 6.2 0 0 0 0-8.8z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 2h8l5 5v15H6zm7 1.5V8h4.5zM10 12v5.3a2 2 0 1 0 1.5 1.9V14h3v-2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M10.3 2h3.4l.5 2.6 1.7.9 2.4-1.2 2.4 2.4-1.2 2.4.9 1.7 2.6.5v3.4l-2.6.5-.9 1.7 1.2 2.4-2.4 2.4-2.4-1.2-1.7.9-.5 2.6h-3.4l-.5-2.6-1.7-.9-2.4 1.2-2.4-2.4 1.2-2.4-.9-1.7L2 13.7v-3.4l2.6-.5.9-1.7-1.2-2.4 2.4-2.4 2.4 1.2 1.7-.9zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 4.6 14 3.2 5.2 12l8.8 8.8 1.4-1.4L8 12z"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M8.6 4.6 10 3.2l8.8 8.8L10 20.8l-1.4-1.4L16 12z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.8 4.8-1.5 1.5-4.8-4.8A7.5 7.5 0 1 1 10.5 3zm0 2.1a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 0 0 0-10.8z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M5.6 4.2 12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.6 1.6 2.8 2.8z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2l2 2.2h6.8A2.5 2.5 0 0 1 21 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M19 3v12.5a3.5 3.5 0 1 1-2-3.2V7.2l-8 1.9v8.4a3.5 3.5 0 1 1-2-3.2V5.5z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm-1.4 2.1A7.5 7.5 0 0 0 4.6 11h3.2c.1-2.3.9-4.6 2.8-6.4zm2.8 0c1.9 1.8 2.7 4.1 2.8 6.4h3.2a7.5 7.5 0 0 0-6-6.4zM12 5.2C10.6 6.8 9.9 8.8 9.8 11h4.4c-.1-2.2-.8-4.2-2.2-5.8zM4.6 13a7.5 7.5 0 0 0 6 6.4c-1.9-1.8-2.7-4.1-2.8-6.4zm5.2 0c.1 2.2.8 4.2 2.2 5.8 1.4-1.6 2.1-3.6 2.2-5.8zm6.4 0c-.1 2.3-.9 4.6-2.8 6.4a7.5 7.5 0 0 0 6-6.4z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M12 1.8 14.6 4l3.4-.2.8 3.3 2.9 1.8-1.3 3.1 1.3 3.1-2.9 1.8-.8 3.3-3.4-.2L12 22.2 9.4 20l-3.4.2-.8-3.3-2.9-1.8L3.6 12l-1.3-3.1 2.9-1.8.8-3.3 3.4.2zm-1.2 13.1L7.9 12l-1.3 1.3 4.2 4.2 7-7-1.3-1.3z"/></svg>',
  follow: '<svg viewBox="0 0 24 24"><path d="M10 3a4.3 4.3 0 1 1 0 8.6A4.3 4.3 0 0 1 10 3zm0 10c4.4 0 8 2.2 8 5V20H2v-2c0-2.8 3.6-5 8-5zm9-6V4.5h2V7h2.5v2H21v2.5h-2V9h-2.5V7z"/></svg>',
  following: '<svg viewBox="0 0 24 24"><path d="M10 3a4.3 4.3 0 1 1 0 8.6A4.3 4.3 0 0 1 10 3zm0 10c4.4 0 8 2.2 8 5V20H2v-2c0-2.8 3.6-5 8-5zm7.7-3.4-2.6-2.6 1.3-1.3 1.3 1.3 3.3-3.3 1.3 1.3z"/></svg>',
};

/* Audius artwork lives on many servers; when one fails, try the next */
const AU_MIRRORS = ['https://audius-creator-9.theblueprint.xyz', 'https://val004.open-audio-validator.com', 'https://audius.zeogrid.com', 'https://v.monophonic.digital', 'https://cn3.mainnet.audiusindex.org'];
window.noteImgErr = (el) => {
  const u = el.currentSrc || el.src;
  const n = +(el.dataset.retry || 0);
  if (/\/content\//.test(u) && n < AU_MIRRORS.length) {
    el.dataset.retry = n + 1;
    el.removeAttribute('srcset');
    el.src = AU_MIRRORS[n] + new URL(u).pathname;
    return;
  }
  el.remove();
};
/* artwork with a neutral placeholder underneath */
const ph = `<div class="ph">${I.note}</div>`;
const phPerson = `<div class="ph">${I.person}</div>`;
/* big: a sharper copy the browser picks on high-density screens */
function img(src, person, big, sizes = '(min-width: 600px) 180px, 38vw') {
  if (!src) return person ? phPerson : ph;
  const set = big && big !== src ? ` srcset="${esc(src)} 480w, ${esc(big)} 1000w" sizes="${sizes}"` : '';
  return (person ? phPerson : ph) + `<img src="${esc(src)}"${set} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('in')" onerror="noteImgErr(this)">`;
}
/* Internet Archive only offers small thumbnails in lists: show them as a sleeve on a blurred backdrop */
function sleeve(src) {
  if (!src) return ph;
  return ph + `<img class="sleeve-bg" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"><img class="sleeve" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="if(this.naturalWidth>this.naturalHeight*2.2){this.previousElementSibling.remove();this.remove()}else this.classList.add('in')" onerror="this.remove()">`;
}

/* ======================= library ======================= */
const lib = {
  liked: store.get('liked', []).filter((t) => t.src !== 'youtube'),
  playlists: store.get('playlists', []),
  recent: store.get('recent', []).filter((t) => t.src !== 'youtube'),
  stations: store.get('stations', []),
  artists: store.get('artists', []),
  searches: store.get('searches', []),
  settings: store.get('settings', { jamendo: '' }),
  hidden: (() => {
    const h = store.get('hidden', null) || { albums: [], tracks: [], artists: [] };
    /* album the owner asked to remove (cover not suitable for the app) */
    if (!h.seeded) {
      h.seeded = true;
      h.albums.push('VRK9xMQ');
      h.tracks.push(...['ryaoRKN', 'Qbdo8p1', '2GR5MNZ', '0dJ8K1M', 'RNq4Zyw', 'laVB0l6', 'ljqm78N', 'YavJyBp', 'NolA7Mx', 'Wg5q12Z', 'ByvQybY', '805wG39'].map((x) => 'au:' + x));
      store.set('hidden', h);
    }
    /* second album the owner asked to remove, together with its artist */
    if (!h.seeded2) {
      h.seeded2 = true;
      h.albums.push('GxBPpPb');
      h.artists.push('6pgPWZ');
      h.tracks.push(...['ZrE1WwQ', 'BKExAXx', 'R0w6mBG', 'ZPPWXKv', 'Jp6q840', 'Jmb0x6'].map((x) => 'au:' + x));
      store.set('hidden', h);
    }
    return h;
  })(),
  save(k) { store.set(k, this[k]); },
  isHidden(x) {
    if (!x) return false;
    const h = this.hidden;
    if ((x.kind === 'au-album' || x.kind === 'dz-album' || x.kind === 'ia-album') && h.albums.includes(String(x.id))) return true;
    if (x.kind === 'artist' && h.artists.includes(x.id)) return true;
    if (x.kind === 'au-album' && x.artistId && h.artists.includes(x.artistId)) return true;
    if (!x.kind && (h.tracks.includes(x.id) || (x.artistId && h.artists.includes(x.artistId)) || (x.alId && h.albums.includes(x.alId)))) return true;
    return false;
  },
  hide(kind, ids) { for (const id of ids) if (!this.hidden[kind].includes(id)) this.hidden[kind].push(id); this.save('hidden'); },
  isLiked(id) { return this.liked.some((t) => t.id === id); },
  toggleLike(t) {
    if (this.isLiked(t.id)) { this.liked = this.liked.filter((x) => x.id !== t.id); toast('Удалено из избранного'); }
    else { this.liked.unshift(slim(t)); toast('Добавлено в избранное'); }
    this.save('liked'); refreshLike();
  },
  isSaved(id) { return this.stations.some((s) => s.id === id); },
  toggleStation(t) {
    if (this.isSaved(t.id)) { this.stations = this.stations.filter((x) => x.id !== t.id); toast('Станция удалена'); }
    else { this.stations.unshift(slim(t)); toast('Станция сохранена'); }
    this.save('stations'); refreshLike();
    if (/^#(radio|library\/stations)/.test(location.hash)) { const y = scrollY; route(); scrollTo(0, y); }
  },
  isFollowing(id) { return this.artists.some((a) => a.id === id); },
  toggleArtist(a) {
    if (this.isFollowing(a.id)) { this.artists = this.artists.filter((x) => x.id !== a.id); toast('Вы отписались'); }
    else { this.artists.unshift({ id: a.id, name: a.name, avatar: a.avatar }); toast('Артист добавлен в медиатеку'); }
    this.save('artists');
  },
  pushRecent(t) { this.recent = [slim(t), ...this.recent.filter((x) => x.id !== t.id)].slice(0, 40); this.save('recent'); },
  pushSearch(q) { this.searches = [q, ...this.searches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8); this.save('searches'); },
};
function slim(t) {
  const { id, src, title, artist, artistId, album, albumId, alId, thumb, art, artBig, url, duration, live, localKey, coverKey, uuid, dzId, dzArtist, dzAlbum, preview, at, link } = t;
  return { id, src, title, artist, artistId, album, albumId, alId, thumb, art, artBig, url, duration, live, localKey, coverKey, uuid, dzId, dzArtist, dzAlbum, preview, at, link };
}

/* ---------- own music (IndexedDB): files, tags and album covers ---------- */
function synchsafe(b, o) { return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f); }
function decodeText(enc, bytes) {
  let label = 'utf-8';
  if (enc === 0) label = 'latin1';
  else if (enc === 1) label = bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-16le';
  else if (enc === 2) label = 'utf-16be';
  try { return new TextDecoder(label).decode(bytes).replace(/^﻿/, '').replace(/\0+/g, ' ').trim(); } catch { return ''; }
}
function id3Picture(d, v22) {
  const enc = d[0];
  let j, mime;
  if (v22) { mime = 'image/' + String.fromCharCode(d[1], d[2], d[3]).toLowerCase().replace('jpg', 'jpeg'); j = 4; }
  else { const e = d.indexOf(0, 1); mime = decodeText(0, d.subarray(1, e)); j = e + 1; }
  j += 1;
  if (enc === 1 || enc === 2) { while (j + 1 < d.length && !(d[j] === 0 && d[j + 1] === 0)) j += 2; j += 2; }
  else { while (j < d.length && d[j] !== 0) j++; j++; }
  if (!/^image\//.test(mime)) mime = 'image/jpeg';
  return j < d.length ? new Blob([d.slice(j)], { type: mime }) : null;
}
async function readTags(file) {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return readFlac(file);
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
  return readId3(file, head);
}
/* FLAC: Vorbis comments, embedded picture and cue sheet (text or binary) */
async function readFlac(file) {
  const buf = new Uint8Array(await file.slice(0, Math.min(file.size, 24e6)).arrayBuffer());
  const dv = new DataView(buf.buffer);
  const out = {};
  let i = 4, rate = 44100, last = false;
  const keys = { TITLE: 'title', ARTIST: 'artist', ALBUMARTIST: 'albumArtist', 'ALBUM ARTIST': 'albumArtist', ALBUM: 'album', TRACKNUMBER: 'track', DATE: 'year', CUESHEET: 'cue' };
  const utf8 = new TextDecoder('utf-8');
  while (!last && i + 4 <= buf.length) {
    const type = buf[i] & 0x7f; last = !!(buf[i] & 0x80);
    const len = (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3];
    const b = i + 4;
    if (b + len > buf.length) break;
    if (type === 0) {
      rate = (buf[b + 10] << 12) | (buf[b + 11] << 4) | (buf[b + 12] >> 4);
      const total = (buf[b + 13] & 0x0f) * 2 ** 32 + dv.getUint32(b + 14);
      if (rate) out.duration = total / rate;
    } else if (type === 4) {
      let j = b + 4 + dv.getUint32(b, true);
      const count = dv.getUint32(j, true); j += 4;
      for (let c = 0; c < count && j < b + len; c++) {
        const l = dv.getUint32(j, true); j += 4;
        const kv = utf8.decode(buf.subarray(j, j + l)); j += l;
        const eq = kv.indexOf('=');
        const k = keys[kv.slice(0, eq).toUpperCase()];
        if (k && !out[k]) out[k] = kv.slice(eq + 1).trim();
      }
    } else if (type === 6 && !out.picture) {
      let j = b + 4;
      const ml = dv.getUint32(j); j += 4;
      const mime = utf8.decode(buf.subarray(j, j + ml)); j += ml;
      j += 4 + dv.getUint32(j) + 16;
      const dl = dv.getUint32(j); j += 4;
      out.picture = new Blob([buf.slice(j, j + dl)], { type: /^image\//.test(mime) ? mime : 'image/jpeg' });
    } else if (type === 5) {
      const n = buf[b + 395];
      let j = b + 396;
      const marks = [];
      for (let t = 0; t < n && j + 36 <= b + len; t++) {
        const off = dv.getUint32(j) * 2 ** 32 + dv.getUint32(j + 4);
        const num = buf[j + 8];
        const np = buf[j + 35];
        let k = j + 36, idx1 = 0;
        for (let x = 0; x < np; x++) { const io = dv.getUint32(k) * 2 ** 32 + dv.getUint32(k + 4); if (buf[k + 8] === 1) idx1 = io; k += 12; }
        if (num >= 1 && num <= 99) marks.push({ n: num, start: (off + idx1) / rate });
        j = k;
      }
      if (marks.length > 1) out.marks = marks;
    }
    i = b + len;
  }
  return out;
}
/* cue sheet text: album performer/title and tracks with their start time */
function parseCue(text) {
  const out = { performer: '', title: '', file: '', tracks: [] };
  let cur = null;
  const val = (l) => { const m = l.match(/^\s*\S+\s+(?:"(.*)"|(.*))\s*$/); return m ? (m[1] ?? m[2] ?? '').trim() : ''; };
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim().split(/\s+/)[0].toUpperCase();
    if (w === 'FILE' && !out.file) out.file = (line.match(/"(.*)"/) || [])[1] || line.trim().split(/\s+/)[1] || '';
    else if (w === 'TRACK') { cur = { n: parseInt(line.trim().split(/\s+/)[1], 10) || out.tracks.length + 1, title: '', performer: '', start: 0 }; out.tracks.push(cur); }
    else if (w === 'TITLE') { if (cur) cur.title = val(line); else out.title = val(line); }
    else if (w === 'PERFORMER') { if (cur) cur.performer = val(line); else out.performer = val(line); }
    else if (w === 'INDEX' && cur) {
      const p = line.trim().split(/\s+/);
      if (p[1] === '01') { const [m, sec, f] = p[2].split(':').map(Number); cur.start = m * 60 + sec + (f || 0) / 75; }
    }
  }
  return out;
}
async function readText(f) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const u = new TextDecoder('utf-8').decode(bytes);
  if (!u.includes('\ufffd')) return u.replace(/^\ufeff/, '');
  try { return new TextDecoder('windows-1251').decode(bytes); } catch { return u; }
}

/* reads ID3v2 tags (title, artist, album, track, cover) from the start of an MP3 */
async function readId3(file, head) {
  const ver = head[3];
  const size = synchsafe(head, 6);
  const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 12e6)).arrayBuffer());
  const dv = new DataView(buf.buffer);
  const out = {};
  let i = 0;
  if (head[5] & 0x40 && ver > 2) i = ver === 4 ? synchsafe(buf, 0) : dv.getUint32(0) + 4;
  const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
  const keys = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TPE2: 'albumArtist', TP2: 'albumArtist', TALB: 'album', TAL: 'album', TRCK: 'track', TRK: 'track', TYER: 'year', TYE: 'year', TDRC: 'year' };
  while (i + hdr <= buf.length) {
    const id = String.fromCharCode(...buf.subarray(i, i + idLen));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const sz = ver === 2 ? (buf[i + 3] << 16) | (buf[i + 4] << 8) | buf[i + 5] : ver === 4 ? synchsafe(buf, i + 4) : dv.getUint32(i + 4);
    if (!sz || i + hdr + sz > buf.length) break;
    const data = buf.subarray(i + hdr, i + hdr + sz);
    i += hdr + sz;
    if (keys[id]) out[keys[id]] = decodeText(data[0], data.subarray(1));
    else if ((id === 'APIC' || id === 'PIC') && !out.picture) out.picture = id3Picture(data, ver === 2);
  }
  return out;
}

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|alac|aiff?)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const files = {
  db: null,
  covers: new Map(),
  coversLoaded: false,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open('nota', 2); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('covers')) db.createObjectStore('covers', { keyPath: 'key' });
      };
      req.onsuccess = () => { this.db = req.result; res(this.db); };
      req.onerror = () => rej(req.error);
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  },
  all() { return this.tx('files', 'readonly', (s) => s.getAll()); },
  get(key) { return this.tx('files', 'readonly', (s) => s.get(key)); },
  put(rec) { return this.tx('files', 'readwrite', (s) => s.put(rec)); },
  del(key) { return this.tx('files', 'readwrite', (s) => s.delete(key)); },
  async loadCovers() {
    if (this.coversLoaded) return;
    try {
      const list = await this.tx('covers', 'readonly', (s) => s.getAll());
      for (const c of list) if (!this.covers.has(c.key)) this.covers.set(c.key, URL.createObjectURL(c.blob));
    } catch {}
    this.coversLoaded = true;
  },
  async putCover(key, blob) {
    if (!blob || this.covers.has(key)) return;
    await this.tx('covers', 'readwrite', (s) => s.put({ key, blob }));
    this.covers.set(key, URL.createObjectURL(blob));
  },
  toTrack(r) {
    return {
      id: 'local:' + r.key, src: 'local', title: r.title, artist: r.artist || 'Неизвестный артист', album: r.album || '', albumArtist: r.albumArtist || r.artist || 'Неизвестный артист',
      n: r.n || 0, localKey: r.key, coverKey: r.coverKey || '', art: this.covers.get(r.coverKey) || '',
      start: r.start, end: r.end, duration: r.end ? r.end - (r.start || 0) : 0,
    };
  },
  async tracks() {
    await this.loadCovers();
    let recs = [];
    try { recs = await this.all(); } catch {}
    /* newest import first; inside an import, by album and track number */
    const batch = (r) => r.batch || r.added || 0;
    return recs.filter((r) => !r.hidden)
      .sort((a, b) => batch(b) - batch(a) || String(a.album || '').localeCompare(String(b.album || '')) || (a.n || 0) - (b.n || 0) || (a.added || 0) - (b.added || 0))
      .map((r) => this.toTrack(r));
  },
  /* imports files or a whole folder: tags first, then the folder layout Artist/Album/track */
  async add(list) {
    const batch = Date.now();
    const dirCover = new Map();
    for (const f of list) {
      if (!IMAGE_EXT.test(f.name)) continue;
      const dir = (f.webkitRelativePath || '').split('/').slice(0, -1).join('/');
      const pref = /cover|folder|front/i.test(f.name);
      if (!dirCover.has(dir) || pref) dirCover.set(dir, f);
    }
    /* cue sheets, matched to their audio file by name */
    const cues = new Map();
    for (const f of list) {
      if (!/\.cue$/i.test(f.name)) continue;
      try {
        const c = parseCue(await readText(f));
        const dir = (f.webkitRelativePath || '').split('/').slice(0, -1).join('/');
        const keyOf = (name) => dir + '/' + name.replace(/\.[^.]+$/, '').toLowerCase();
        if (c.tracks.length > 1) { cues.set(keyOf(c.file || f.name), c); cues.set(keyOf(f.name), c); }
      } catch {}
    }
    let existing = [];
    try { existing = await this.all(); } catch {}
    const seen = new Set(existing.map((r) => r.name + '|' + r.size));
    const audioFiles = list.filter((f) => f.type.startsWith('audio') || AUDIO_EXT.test(f.name));
    let n = 0;
    for (const f of audioFiles) {
      if (seen.has(f.name + '|' + f.size)) continue;
      let tags = {};
      try { tags = await readTags(f); } catch {}
      const parts = (f.webkitRelativePath || f.name).split('/');
      const dir = parts.slice(0, -1).join('/');
      const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
      const noNum = base.replace(/^\d{1,3}[\s.\-_)]+/, '');
      const dash = noNum.split(/\s+[-–—]\s+/);
      const pathArtist = parts.length >= 3 ? parts[parts.length - 3] : '';
      const pathAlbum = parts.length >= 2 ? parts[parts.length - 2] : '';
      const artist = tags.artist || (dash.length > 1 ? dash[0] : '') || tags.albumArtist || pathArtist;
      const albumArtist = tags.albumArtist || tags.artist || pathArtist || artist || 'Неизвестный артист';
      const album = tags.album || pathAlbum;
      const title = tags.title || (dash.length > 1 ? dash.slice(1).join(' - ') : noNum) || base;
      const num = parseInt(tags.track, 10) || parseInt((base.match(/^(\d{1,3})/) || [])[1], 10) || 0;
      const coverKey = (albumArtist + '|' + (album || dir)).toLowerCase();
      if (!this.covers.has(coverKey)) {
        const pic = tags.picture || dirCover.get(dir);
        if (pic) { try { await this.putCover(coverKey, pic); } catch {} }
      }
      const cue = cues.get(dir + '/' + f.name.replace(/\.[^.]+$/, '').toLowerCase()) || (tags.cue ? parseCue(tags.cue) : null);
      const marks = cue && cue.tracks.length > 1 ? cue.tracks : tags.marks;
      if (marks && marks.length > 1) {
        /* one long file with many songs: stored once, each song points at its own stretch of it */
        const parent = uid();
        const cArtist = (cue && cue.performer) || albumArtist;
        const cAlbum = (cue && cue.title) || album || base;
        const cKey = (cArtist + '|' + cAlbum).toLowerCase();
        const various = /^(various|va\b|v\.a\.|сборник|разные)/i.test(cArtist);
        if (!this.covers.has(cKey)) { const pic = tags.picture || dirCover.get(dir); if (pic) { try { await this.putCover(cKey, pic); } catch {} } }
        await this.put({ key: parent, hidden: true, name: f.name, size: f.size, title: cAlbum, blob: f, added: 0, batch });
        for (let m = 0; m < marks.length; m++) {
          const tr = marks[m];
          const end = m + 1 < marks.length ? marks[m + 1].start : tags.duration || null;
          await this.put({
            /* in a various-artists compilation every song goes to its own performer's folder */
            key: uid(), parent, title: tr.title || `Трек ${tr.n}`, artist: tr.performer || cArtist, albumArtist: various && tr.performer ? tr.performer : cArtist, album: cAlbum,
            n: tr.n || m + 1, start: tr.start, end, coverKey: cKey, added: Date.now() + n + m / 1000, batch,
          });
        }
        n += marks.length;
      } else {
        await this.put({ key: uid(), name: f.name, size: f.size, title, artist, albumArtist, album, n: num, year: tags.year || '', coverKey, blob: f, added: Date.now() + n, batch });
        n++;
      }
      seen.add(f.name + '|' + f.size);
      if (n % 15 === 0) toast(`Импорт: ${n} из ${audioFiles.length}`);
    }
    return n;
  },
};
/* group own tracks into artist folders and albums */
function groupMine(tracks) {
  const artists = new Map();
  for (const t of tracks) {
    const a = t.albumArtist;
    if (!artists.has(a)) artists.set(a, { name: a, albums: new Map(), tracks: [] });
    const g = artists.get(a);
    g.tracks.push(t);
    const al = t.album || 'Без альбома';
    if (!g.albums.has(al)) g.albums.set(al, { title: al, artist: a, tracks: [], art: '' });
    const A = g.albums.get(al);
    A.tracks.push(t);
    if (!A.art && t.art) A.art = t.art;
  }
  for (const g of artists.values()) for (const A of g.albums.values()) A.tracks.sort((x, y) => (x.n || 0) - (y.n || 0) || x.title.localeCompare(y.title));
  return [...artists.values()].sort((x, y) => x.name.localeCompare(y.name, 'ru'));
}

/* ======================= sources ======================= */
/* Audius: open catalog of independent artists from around the world */
const AU = 'https://api.audius.co/v1';
const audius = {
  async get(path, params = {}) {
    const p = new URLSearchParams({ app_name: 'nota', ...params });
    const d = await getJSON(`${AU}/${path}?${p}`);
    return d.data;
  },
  art(a, big) { return a ? (big ? a['1000x1000'] || a['480x480'] : a['480x480'] || a['1000x1000']) || a['150x150'] || '' : ''; },
  track(x) {
    return {
      id: 'au:' + x.id, src: 'audius', title: x.title, artist: x.user ? x.user.name : '', artistId: x.user ? x.user.id : '',
      thumb: x.artwork ? x.artwork['150x150'] || '' : '', art: this.art(x.artwork), artBig: this.art(x.artwork, true),
      by: x.user ? { id: x.user.id, name: x.user.name, avatar: x.user.profile_picture ? x.user.profile_picture['480x480'] || x.user.profile_picture['150x150'] : '', avatarBig: x.user.profile_picture ? x.user.profile_picture['1000x1000'] || '' : '', followers: x.user.follower_count || 0 } : null, url: `${AU}/tracks/${x.id}/stream?app_name=nota`, duration: x.duration || 0, genre: x.genre, plays: x.play_count,
    };
  },
  tracks(list) { return (list || []).filter((x) => x && x.is_streamable !== false && !x.is_stream_gated && !x.is_delete).map((x) => this.track(x)); },
  user(u) {
    return {
      kind: 'artist', id: u.id, name: u.name, handle: u.handle, verified: !!u.is_verified,
      avatar: u.profile_picture ? u.profile_picture['480x480'] || u.profile_picture['1000x1000'] || u.profile_picture['150x150'] : '',
      avatarBig: u.profile_picture ? u.profile_picture['1000x1000'] || '' : '',
      cover: u.cover_photo ? u.cover_photo['2000x'] || u.cover_photo['640x'] : '',
      followers: u.follower_count || 0, trackCount: u.track_count || 0, albumCount: u.album_count || 0, bio: u.bio || '', location: u.location || '',
    };
  },
  list(p) {
    return {
      kind: 'au-album', id: p.id, title: p.playlist_name, artist: p.user ? p.user.name : '', artistId: p.user ? p.user.id : '',
      art: this.art(p.artwork), artBig: this.art(p.artwork, true), isAlbum: !!p.is_album, count: p.track_count || 0, desc: p.description || '', date: p.release_date || p.created_at || '',
    };
  },
  trending({ genre = '', time = 'week', limit = 50, offset = 0 } = {}) {
    const p = { time, limit }; if (genre) p.genre = genre; if (offset) p.offset = offset;
    return this.get('tracks/trending', p).then((d) => this.tracks(d));
  },
  trendingLists(type, time = 'week', limit = 20) { return this.get('playlists/trending', { type, time, limit }).then((d) => d.map((p) => this.list(p))); },
  search(kind, q, limit = 20) {
    return this.get(`${kind}/search`, { query: q, limit }).then((d) => kind === 'tracks' ? this.tracks(d) : kind === 'users' ? d.map((u) => this.user(u)) : d.map((p) => this.list(p)));
  },
  artist(id) { return this.get(`users/${id}`).then((u) => this.user(Array.isArray(u) ? u[0] : u)); },
  artistTracks(id, limit = 50) { return this.get(`users/${id}/tracks`, { limit, sort: 'plays' }).then((d) => this.tracks(d)); },
  artistLists(id, kind) { return this.get(`users/${id}/${kind}`, { limit: 30 }).then((d) => (d || []).map((p) => this.list(p))).catch(() => []); },
  async album(id) {
    const [meta, tr] = await Promise.all([this.get(`playlists/${id}`), this.get(`playlists/${id}/tracks`)]);
    const m = this.list(Array.isArray(meta) ? meta[0] : meta);
    m.tracks = this.tracks(tr).map((t) => ({ ...t, album: m.title, alId: m.id }));
    return m;
  },
};

/* Internet Archive: netlabels, live concerts, 78rpm records */
const MUSIC_COLLECTIONS = 'collection:(etree OR audio_music OR 78rpm OR netlabels OR georgeblood OR opensource_audio)';
const archive = {
  cover(id) { return `https://archive.org/services/img/${encodeURIComponent(id)}`; },
  async search(q, { rows = 30, sort = 'downloads desc' } = {}) {
    const p = new URLSearchParams({ q, rows, output: 'json' });
    ['identifier', 'title', 'creator', 'year'].forEach((f) => p.append('fl[]', f));
    if (sort) p.append('sort[]', sort);
    const d = await getJSON('https://archive.org/advancedsearch.php?' + p);
    return d.response.docs.map((x) => ({ kind: 'ia-album', id: x.identifier, title: first(x.title) || x.identifier, artist: first(x.creator), year: first(x.year), art: this.cover(x.identifier) }));
  },
  clean(t) { return t.replace(/[()":\[\]{}^~*?\\/]/g, ' ').trim(); },
  find(text, rows) { return this.search(`(${this.clean(text)}) AND mediatype:(audio OR etree) AND ${MUSIC_COLLECTIONS}`, { rows }); },
  byCreator(name) { return this.search(`creator:("${this.clean(name)}") AND mediatype:(audio OR etree)`, { rows: 60 }); },
  async album(id) {
    const d = await getJSON('https://archive.org/metadata/' + encodeURIComponent(id), 20000);
    if (!d || !d.metadata) throw new Error('not found');
    const m = d.metadata;
    const fmtOk = ['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', 'Ogg Vorbis'].find((f) => d.files.some((x) => x.format === f));
    const pics = d.files.filter((x) => /^(JPEG|PNG|JPEG Thumb)$/.test(x.format) && !/thumb|_spectrogram|\.gif$/i.test(x.name) && x.format !== 'JPEG Thumb')
      .sort((a, b) => (+b.size || 0) - (+a.size || 0));
    const coverFile = pics.find((x) => /cover|front|folder/i.test(x.name)) || pics[0];
    const art = coverFile ? `https://archive.org/download/${encodeURIComponent(id)}/${coverFile.name.split('/').map(encodeURIComponent).join('/')}` : this.cover(id);
    const title = first(m.title) || id;
    const artist = first(m.creator) || first(m.artist) || '';
    const tracks = (fmtOk ? d.files.filter((x) => x.format === fmtOk) : [])
      .map((x) => ({
        id: `ia:${id}/${x.name}`, src: 'archive', albumId: id, album: title, art,
        title: first(x.title) || x.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
        artist: first(x.artist) || first(x.creator) || artist || 'Internet Archive',
        url: `https://archive.org/download/${encodeURIComponent(id)}/${x.name.split('/').map(encodeURIComponent).join('/')}`,
        duration: parseLen(x.length), n: parseInt(first(x.track), 10) || 0, name: x.name,
      }))
      .sort((a, b) => (a.n && b.n ? a.n - b.n : 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const desc = String(first(m.description) || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return { id, title, artist, year: String(first(m.date || m.year)).slice(0, 4).replace(/^0+$/, ''), art, desc, tracks };
  },
};

const jamendo = {
  get on() { return !!lib.settings.jamendo; },
  async tracks(params) {
    const p = new URLSearchParams({ client_id: lib.settings.jamendo, format: 'json', limit: 30, audioformat: 'mp32', imagesize: 300, ...params });
    const d = await getJSON('https://api.jamendo.com/v3.0/tracks/?' + p);
    if (d.headers && d.headers.status !== 'success') throw new Error(d.headers.error_message || 'Jamendo');
    return d.results.map((x) => ({ id: 'jm:' + x.id, src: 'jamendo', title: x.name, artist: x.artist_name, album: x.album_name, art: x.image || x.album_image, url: x.audio, duration: +x.duration || 0 }));
  },
};

const RADIO_HOSTS = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
const radio = {
  async q(path) {
    let err;
    for (const h of RADIO_HOSTS) { try { return await getJSON(h + path, 12000); } catch (e) { err = e; } }
    throw err;
  },
  map(list) {
    const seen = new Set();
    return list
      .filter((s) => s.url_resolved && !s.hls && (!s.codec || /mp3|aac|ogg|opus/i.test(s.codec)))
      .filter((s) => { const k = s.name.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((s) => ({
        id: 'radio:' + s.stationuuid, src: 'radio', live: true, uuid: s.stationuuid, title: s.name.trim(),
        artist: [countryName(s.countrycode, s.country), s.tags.split(',').filter(Boolean).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
        art: s.favicon && s.favicon.startsWith('https://') ? s.favicon : '', url: s.url_resolved.replace(/^http:\/\//i, 'https://'),
      }));
  },
  async search({ name = '', tag = '', country = '', limit = 60 } = {}) {
    const p = new URLSearchParams({ order: 'clickcount', reverse: 'true', hidebroken: 'true', limit });
    if (name) p.set('name', name);
    if (tag) p.set('tag', tag);
    if (country) p.set('countrycode', country);
    return this.map(await this.q('/json/stations/search?' + p));
  },
  async countries() {
    const d = await this.q('/json/countries?order=stationcount&reverse=true&hidebroken=true');
    return d.filter((c) => c.iso_3166_1 && c.stationcount >= 15).map((c) => ({ code: c.iso_3166_1, name: countryName(c.iso_3166_1, c.name), count: c.stationcount }));
  },
  click(uuid) { if (uuid) this.q('/json/url/' + uuid).catch(() => {}); },
};

/* Deezer: official catalog of label artists. Pages, covers and official 30-second previews only. */
let jsonpSeq = 0;
function jsonp(url, ms = 10000) {
  return new Promise((res, rej) => {
    const cb = '__dz' + ++jsonpSeq;
    const el = document.createElement('script');
    const done = () => { delete window[cb]; el.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { done(); rej(new Error('timeout')); }, ms);
    window[cb] = (d) => { done(); d && d.error ? rej(new Error(d.error.message || 'deezer')) : res(d); };
    el.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb;
    el.onerror = () => { done(); rej(new Error('network')); };
    document.head.appendChild(el);
  });
}
const DZ = 'https://api.deezer.com';
const deezer = {
  get(path) { return jsonp(`${DZ}/${path}`); },
  track(x, al) {
    const a = x.album || al || {};
    return {
      id: 'dz:' + x.id, src: 'deezer', dzId: x.id, preview: true, title: x.title_short || x.title, artist: x.artist ? x.artist.name : '', dzArtist: x.artist ? x.artist.id : '',
      album: a.title || '', dzAlbum: a.id || '', thumb: a.cover_medium || '', art: a.cover_big || a.cover_medium || '', artBig: a.cover_xl || '',
      url: x.preview, at: Date.now(), duration: 30, link: x.link || '',
    };
  },
  tracks(list, al) { return (list || []).filter((x) => x && x.preview && x.readable !== false).map((x) => this.track(x, al)); },
  artist(a) { return { kind: 'dz-artist', id: a.id, name: a.name, avatar: a.picture_big || a.picture_medium || '', avatarBig: a.picture_xl || '', fans: a.nb_fan || 0, albums: a.nb_album || 0 }; },
  album(a) { return { kind: 'dz-album', id: a.id, title: a.title, artist: a.artist ? a.artist.name : '', dzArtist: a.artist ? a.artist.id : '', art: a.cover_big || a.cover_medium || '', artBig: a.cover_xl || '', year: String(a.release_date || '').slice(0, 4), type: a.record_type || '' }; },
  searchArtists(q, n = 12) { return this.get(`search/artist?q=${encodeURIComponent(q)}&limit=${n}`).then((d) => d.data.map((a) => this.artist(a))); },
  searchTracks(q, n = 20) { return this.get(`search/track?q=${encodeURIComponent(q)}&limit=${n}`).then((d) => this.tracks(d.data)); },
  searchAlbums(q, n = 20) { return this.get(`search/album?q=${encodeURIComponent(q)}&limit=${n}`).then((d) => d.data.map((a) => this.album(a))); },
  chart(genre = 0, n = 50) { return this.get(`chart/${genre}/tracks?limit=${n}`).then((d) => this.tracks(d.data)); },
  async artistPage(id) {
    const [a, top, albums, related] = await Promise.all([
      this.get(`artist/${id}`), this.get(`artist/${id}/top?limit=20`), this.get(`artist/${id}/albums?limit=100`).catch(() => ({ data: [] })), this.get(`artist/${id}/related?limit=14`).catch(() => ({ data: [] })),
    ]);
    const seen = new Set();
    const alb = albums.data.map((x) => this.album({ ...x, artist: a })).filter((x) => { const k = x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return { ...this.artist(a), top: this.tracks(top.data), albums: alb.filter((x) => x.type !== 'single'), singles: alb.filter((x) => x.type === 'single'), related: related.data.map((r) => this.artist(r)) };
  },
  async albumPage(id) {
    const a = await this.get(`album/${id}`);
    const al = this.album(a);
    al.tracks = this.tracks(a.tracks && a.tracks.data, a).map((t, i) => ({ ...t, n: i + 1 }));
    al.label = a.label || '';
    al.total = a.duration || 0;
    return al;
  },
  /* preview links expire after 15 minutes: get a fresh one right before playing */
  async fresh(t) {
    if (t.url && Date.now() - (t.at || 0) < 10 * 60e3) return t.url;
    const x = await this.get(`track/${t.dzId}`);
    t.url = x.preview; t.at = Date.now();
    return t.url;
  },
};

/* ======================= player ======================= */
const audio = $('#audio');
audio.preload = 'auto';
/* a song that is one stretch of a longer file (cue sheet): start and end in seconds */
let seg = null;
audio.volume = store.get('volume', 1);
const P = {
  queue: store.get('queue', []).filter((t) => t.src !== 'youtube'),
  idx: store.get('idx', -1),
  /* drop hidden songs from a saved queue, keeping the current song when it stays */
  clean() {
    const cur = this.queue[this.idx];
    this.queue = this.queue.filter((t) => !lib.isHidden(t));
    this.idx = cur ? this.queue.indexOf(cur) : -1;
  },
  shuffle: store.get('shuffle', false),
  repeat: store.get('repeat', 'off'),
  errors: 0,
  get cur() { return this.queue[this.idx]; },
  persist() { store.set('queue', this.queue.map(slim)); store.set('idx', this.idx); },
  resume: store.get('pos', null),
  setQueue(list, i = 0) {
    const pick = list[i];
    list = list.filter((t) => !lib.isHidden(t));
    i = Math.max(0, list.indexOf(pick));
    if (!list.length) return;
    let q = list.map((t) => ({ ...t }));
    if (this.shuffle && q.length > 1) { const pick = q.splice(i, 1)[0]; q = [pick, ...shuffled(q)]; i = 0; }
    this.queue = q;
    this.play(i);
  },
  playNext(t) { if (!this.cur) return this.setQueue([t]); this.queue.splice(this.idx + 1, 0, { ...t }); this.persist(); renderQueue(); toast('Сыграет следующим'); },
  addToQueue(t) { if (!this.cur) return this.setQueue([t]); this.queue.push({ ...t }); this.persist(); renderQueue(); toast('Добавлено в очередь'); },
  async play(i) {
    const t = this.queue[i];
    if (!t) return;
    this.idx = i;
    this.persist();
    lib.pushRecent(t);
    let url = t.url;
    seg = null;
    if (t.src === 'local') {
      const rec = await files.get(t.localKey).catch(() => null);
      const base = rec && rec.parent ? await files.get(rec.parent).catch(() => null) : rec;
      if (!rec || !base) { toast('Файл не найден на этом устройстве'); return this.skipAfterError(); }
      if (rec.parent) seg = { start: rec.start || 0, end: rec.end || 0 };
      if (audio.dataset.blobKey === base.key && audio.getAttribute('src')) {
        /* same long file: just jump to the song */
        renderNow();
        if (seg) audio.currentTime = seg.start;
        audio.play().catch(() => {});
        return;
      }
      if (audio.dataset.blobUrl) URL.revokeObjectURL(audio.dataset.blobUrl);
      url = URL.createObjectURL(base.blob);
      audio.dataset.blobUrl = url;
      audio.dataset.blobKey = base.key;
      if (seg) { const s0 = seg.start; audio.addEventListener('loadedmetadata', () => { audio.currentTime = s0; }, { once: true }); }
    } else delete audio.dataset.blobKey;
    if (t.src === 'radio') radio.click(t.uuid);
    if (t.src === 'deezer') {
      try { url = await deezer.fresh(t); } catch { toast('Превью недоступно'); return this.skipAfterError(); }
      if (this.queue[this.idx] !== t) return;
    }
    audio.src = url;
    renderNow();
    try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') renderPlayState(); }
  },
  toggle() {
    const t = this.cur;
    if (!t) return;
    if (!audio.getAttribute('src')) {
      /* first play after the app was reopened: continue where the song was left */
      const r = this.resume;
      this.resume = null;
      if (r && this.cur && r.id === this.cur.id && r.t > 3) audio.addEventListener('loadedmetadata', () => { audio.currentTime = segStart() + r.t; }, { once: true });
      return this.play(this.idx);
    }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  },
  next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.repeat === 'one') return this.play(this.idx);
    if (this.idx + 1 < this.queue.length) return this.play(this.idx + 1);
    if (this.repeat === 'all' || !auto) return this.play(0);
    audio.pause(); renderPlayState();
  },
  prev(force) {
    if (force) return this.play(this.idx > 0 ? this.idx - 1 : this.queue.length - 1);
    if (seg && audio.currentTime - seg.start > 3) { audio.currentTime = seg.start; return; }
    if (this.cur && audio.currentTime > 3) { audio.currentTime = 0; return; }
    this.play(this.idx > 0 ? this.idx - 1 : this.queue.length - 1);
  },
  skipAfterError() {
    this.errors++;
    if (this.errors >= 3 || this.queue.length < 2 || (this.cur && this.cur.live)) { this.errors = 0; renderPlayState(); return; }
    setTimeout(() => this.next(true), 900);
  },
  get playing() {
    const t = this.cur;
    if (!t) return false;
    return !audio.paused;
  },
};
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

audio.addEventListener('play', () => { renderPlayState(); startTick(); });
audio.addEventListener('pause', () => { setBuffering(false); renderPlayState(); renderTime(); syncPosition(); });
audio.addEventListener('playing', () => { P.errors = 0; setBuffering(false); renderPlayState(); preloadNext(); startTick(); syncPosition(); });
audio.addEventListener('waiting', () => setBuffering(true));
audio.addEventListener('stalled', () => { if (!audio.paused) setBuffering(true); });
audio.addEventListener('canplay', () => setBuffering(false));
audio.addEventListener('seeked', () => { pendingSeek = null; renderTime(); syncPosition(); });
audio.addEventListener('ratechange', syncPosition);
/* the progress bar moves every frame while music plays, not four times a second */
let rafId = 0;
/* the big seek bar moves every frame only while the full player is open;
   everywhere else four updates a second are enough and keep scrolling smooth */
function tick() {
  rafId = 0;
  if (audio.paused || $('#player').hidden) return;
  if (seg && seg.end && audio.currentTime >= seg.end - 0.12) { P.next(true); return; }
  renderTime();
  rafId = requestAnimationFrame(tick);
}
function startTick() { if (!rafId && !document.hidden && !$('#player').hidden) rafId = requestAnimationFrame(tick); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderTime(); startTick(); } });
function setBuffering(on) {
  $('#play').classList.toggle('buffering', on);
  $('#miniPlay').classList.toggle('buffering', on);
}
/* lock screen and Control Center show the real position and can scrub */
function syncPosition() {
  try {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const d = seekDur();
    if (!d || !isFinite(d) || (P.cur && P.cur.live)) { navigator.mediaSession.setPositionState(); return; }
    navigator.mediaSession.setPositionState({ duration: d, position: Math.min(d, Math.max(0, audio.currentTime - segStart())), playbackRate: audio.playbackRate || 1 });
  } catch {}
}
/* warm up the next track so it starts without a pause */
const nextAudio = new Audio();
nextAudio.preload = 'auto';
nextAudio.muted = true;
function preloadNext() {
  const n = P.queue[P.idx + 1];
  if (!n || n.live || n.src === 'local' || nextAudio.dataset.id === n.id) return;
  nextAudio.dataset.id = n.id;
  if (n.src === 'deezer') { deezer.fresh(n).then((u) => { if (nextAudio.dataset.id === n.id) nextAudio.src = u; }).catch(() => {}); return; }
  if (n.url) nextAudio.src = n.url;
}
audio.addEventListener('ended', () => { if (P.idx + 1 >= P.queue.length && P.repeat === 'off') showMiniLyric(''); P.next(true); });
let lastPosSave = 0;
function savePos() { if (P.cur && !P.cur.live && audio.getAttribute('src')) store.set('pos', { id: P.cur.id, t: Math.max(0, audio.currentTime - segStart()) }); }
audio.addEventListener('timeupdate', () => { if (Date.now() - lastPosSave > 5000) { lastPosSave = Date.now(); savePos(); } });
window.addEventListener('pagehide', savePos);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePos(); });
/* backup for when frames are paused (screen locked): songs inside one long file still end on time */
audio.addEventListener('timeupdate', () => {
  if (seg && seg.end && audio.currentTime >= seg.end - 0.15) { P.next(true); return; }
  if (document.hidden) syncPosition(); else if (!rafId) { renderTime(); startTick(); }
});
audio.addEventListener('durationchange', () => { renderTime(); syncPosition(); });
audio.addEventListener('error', () => {
  const t = P.cur;
  if (!t || !audio.getAttribute('src')) return;
  if (t.src === 'radio') { toast('Станция сейчас не отвечает'); renderPlayState(); return; }
  toast('Трек недоступен, включаю следующий');
  P.skipAfterError();
});

/* ---------- lyrics: time-synced lines from the open LRCLIB database ---------- */
function parseLrc(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const body = line.replace(/\[[^\]]*\]/g, '');
    const tagged = [...body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)/g)].map((w) => ({ s: +w[1] * 60 + +w[2], w: w[3].trim() })).filter((w) => w.w);
    const words = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    for (const m of stamps) out.push(tagged.length ? { t: +m[1] * 60 + +m[2], text: words, w: tagged } : { t: +m[1] * 60 + +m[2], text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}
const cleanTitle = (x) => String(x).replace(/\s*[([](feat|ft|with|prod|prod\.)[^)\]]*[)\]]/gi, '').replace(/\s+-\s+.*(remaster|edit|version|mix).*$/i, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
const firstArtist = (x) => String(x || '').split(/,|\s(?:feat\.?|ft\.?|&|x|and)\s/i)[0].trim();
function fetchLyrics(t) {
  return cached('lyr4:' + t.id, async () => {
    /* candidates: the track's own artist/title, and "Artist - Title" written inside the title */
    const cands = [{ a: firstArtist(t.artist), t: cleanTitle(t.title) }];
    const m = String(t.title).match(/^(.+?)\s[-–]\s(.+)$/);
    if (m) cands.unshift({ a: firstArtist(m[1]), t: cleanTitle(m[2]) });
    const dur = t.preview ? 0 : t.duration || 0;
    const good = (d) => d && (d.syncedLyrics || d.plainLyrics);
    /* a real "not found" is remembered; a busy or unreachable server is not, so the next play tries again */
    const notFound = (e) => { if (/HTTP 404/.test(String(e && e.message))) return null; throw e; };
    for (const c of cands) {
      if (!c.a || !c.t) continue;
      const d = await getJSONOnce('https://lrclib.net/api/get?' + new URLSearchParams({ artist_name: c.a, track_name: c.t }), 9000).catch(notFound);
      if (good(d)) return pack(d);
    }
    for (const c of cands) {
      const l = (await getJSONOnce('https://lrclib.net/api/search?' + new URLSearchParams({ q: `${c.a} ${c.t}`.trim() }), 9000).catch(notFound)) || [];
      const an = norm(c.a), tn = norm(c.t);
      const hits = (l || []).filter((x) => good(x) && norm(x.trackName).includes(tn) && (!an || norm(x.artistName).includes(an) || an.includes(norm(x.artistName))));
      const best = hits.find((x) => x.syncedLyrics && (!dur || Math.abs(x.duration - dur) < 4)) || hits.find((x) => x.syncedLyrics) || hits[0];
      if (best) return pack(best);
    }
    return { none: true };
  }, 30 * 24 * 3600e3);
  function pack(d) { return { synced: d.syncedLyrics ? parseLrc(d.syncedLyrics) : null, plain: d.plainLyrics || '', inst: !!d.instrumental }; }
}
const lyr = { weekAlbum: null, open: store.get('lyricsOpen', false), data: null, lines: null, idx: -2, forId: '', words: {}, activeEl: null };
function loadLyrics(t) {
  lyr.data = null; lyr.lines = null; lyr.idx = -2; lyr.forId = t ? t.id : ''; lyr.words = {}; lyr.activeEl = null;
  $('#player').classList.remove('has-sub');
  $('#lyricsBtn').classList.toggle('none', !t || !!t.live);
  showMiniLyric('');
  if (!t || t.live) { if (lyr.open) drawLyrics(); return; }
  if (lyr.open) drawLyrics();
  whenReady(fetchLyrics(t), (d) => {
    if (!P.cur || P.cur.id !== lyr.forId) return;
    lyr.data = d;
    lyr.lines = d.synced && d.synced.length && !t.preview ? d.synced : null;
    $('#lyricsBtn').classList.toggle('none', !!d.none);
    $('#player').classList.toggle('has-sub', !!lyr.lines);
    if (lyr.open) drawLyrics();
    syncLyrics(true);
  }, () => { if (lyr.open) drawLyrics(); });
}
function lineWords(i) {
  const lines = lyr.lines, line = lines[i];
  if (!line || !line.text) return [];
  if (lyr.words[i]) return lyr.words[i];
  const toks = line.text.split(' ').filter(Boolean);
  let out;
  if (line.w && line.w.length) {
    out = line.w.map((w, k) => ({ w: w.w, s: w.s, e: k + 1 < line.w.length ? line.w[k + 1].s : Math.min(lines[i + 1] ? lines[i + 1].t : w.s + 1.5, w.s + 1.5) }));
  } else {
    const next = lines[i + 1] ? lines[i + 1].t : line.t + 6;
    const end = Math.min(next - 0.1, line.t + Math.max(1.4, line.text.length * 0.085));
    const total = toks.reduce((n, w) => n + w.length + 1.5, 0);
    let at = line.t;
    out = toks.map((w) => { const d = ((w.length + 1.5) / total) * (end - line.t); const r = { w, s: at, e: at + d }; at += d; return r; });
  }
  return (lyr.words[i] = out);
}
const wordSpans = (ws) => ws.map((x) => `<span class="w">${esc(x.w)}</span>`).join(' ');
/* fill each word of the current line as it is sung */
function paintWords(el, ws, c) {
  if (!el) return;
  const spans = el.querySelectorAll('.w');
  for (let k = 0; k < spans.length && k < ws.length; k++) {
    const p = Math.min(1, Math.max(0, (c - ws[k].s) / Math.max(0.05, ws[k].e - ws[k].s)));
    const q = Math.round(p * 50) / 50;
    if (spans[k]._p !== q) { spans[k]._p = q; spans[k].style.setProperty('--p', q); }
  }
}
function drawLyrics() {
  const box = $('#lyrics'), inner = $('#lyrInner'), t = P.cur, d = lyr.data;
  inner.style.transition = 'none'; inner.style.transform = '';
  requestAnimationFrame(() => { inner.style.transition = ''; });
  box.classList.remove('plain');
  if (!t) return;
  if (t.live) { inner.innerHTML = '<p class="lyr-state">У радиоэфира нет текста песни</p>'; return; }
  if (!d) { inner.innerHTML = '<p class="lyr-state"><span class="spin"></span>Ищу текст песни…</p>'; return; }
  if (d.inst) { inner.innerHTML = '<p class="lyr-state">Эта песня без слов</p>'; return; }
  if (d.none || (!d.synced && !d.plain)) { inner.innerHTML = `<p class="lyr-state">Текста этой песни нет в базе текстов.<br><br>Тексты есть у большинства известных песен. У независимых артистов и электронной музыки их обычно нет.</p>`; return; }
  if (lyr.lines) {
    inner.innerHTML = lyr.lines.map((l, i) => `<button class="lyr-line${l.text ? '' : ' gap'}" data-lt="${l.t}">${l.text ? wordSpans(lineWords(i)) : '<span class="dots"><i></i><i></i><i></i></span>'}</button>`).join('') + '<span class="lyr-src">Текст: LRCLIB</span>';
  } else {
    box.classList.add('plain');
    const text = d.plain || (d.synced || []).map((l) => l.text).join('\n');
    inner.innerHTML = (t.preview ? '<p class="lyr-note">Это превью 30 секунд, поэтому текст идёт без подсветки. Синхронно подсвечиваются песни, которые играют целиком.</p>' : '') + text.split('\n').map((x) => `<p class="lyr-line">${esc(x) || '&nbsp;'}</p>`).join('') + '<span class="lyr-src">Текст: LRCLIB</span>';
  }
  lyr.idx = -2;
  syncLyrics(true);
}
function showMiniLyric(text, i) {
  const bl = $('#bigLyric');
  bl.innerHTML = text ? wordSpans(i != null && lyr.lines ? lineWords(i) : text.split(' ').map((w) => ({ w }))) : '';
  bl.classList.toggle('on', !!text);
  const ml = $('#miniLyric'), ma = $('#miniArtist');
  if (!text) { if (!ml.hidden) { ml.hidden = true; ma.hidden = false; } return; }
  ml.hidden = false; ma.hidden = true;
  ml.textContent = text;
  ml.style.animation = 'none'; void ml.offsetWidth; ml.style.animation = '';
}
function syncLyrics(force) {
  const lines = lyr.lines;
  if (!lines || !P.cur) return;
  const now = pendingSeek != null ? pendingSeek : audio.currentTime - segStart();
  const c = now + 0.3;
  let i = -1;
  for (let k = 0; k < lines.length && lines[k].t <= c; k++) i = k;
  if (i !== lyr.idx || force) {
    lyr.idx = i;
    showMiniLyric(i >= 0 ? lines[i].text : '', i);
    if (lyr.open) moveLyrics(i);
  }
  /* word by word, every frame while the player is open */
  if (i >= 0 && lines[i].text) {
    const ws = lineWords(i);
    paintWords($('#bigLyric'), ws, now + 0.05);
    if (lyr.open) paintWords(lyr.activeEl, ws, now + 0.05);
  }
}
function moveLyrics(i) {
  const els = $('#lyrInner').querySelectorAll('.lyr-line');
  els.forEach((el, k) => { el.classList.toggle('on', k === i); el.classList.toggle('near', Math.abs(k - i) === 1); el.classList.toggle('past', k < i); });
  const el = els[Math.max(0, i)];
  lyr.activeEl = i >= 0 ? els[i] : null;
  if (el) $('#lyrInner').style.transform = `translate3d(0,${Math.min(0, $('#lyrics').clientHeight * 0.3 - el.offsetTop)}px,0)`;
}
function setLyricsOpen(on) {
  lyr.open = on; store.set('lyricsOpen', on);
  $('#player').classList.toggle('lyrics-on', on);
  $('#lyrics').hidden = !on;
  $('#lyricsBtn').classList.toggle('on', on);
  if (on) drawLyrics();
}
$('#lyricsBtn').onclick = () => setLyricsOpen(!lyr.open);
$('#lyrInner').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lt]');
  if (!b) return;
  seekTo(+b.dataset.lt);
  if (audio.paused) audio.play().catch(() => {});
});

/* ---------- lock screen / headphones ---------- */
function setSession(t) {
  if (!('mediaSession' in navigator) || !t) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist || '', album: t.album || '',
      artwork: [{ src: t.art || new URL('icon-512.png', location.href).href, sizes: '512x512' }],
    });
  } catch {}
}
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
  h('play', () => P.toggle());
  h('pause', () => P.toggle());
  h('nexttrack', () => P.next());
  h('previoustrack', () => P.prev());
  h('seekto', (d) => { if (P.cur && !P.cur.live && d.seekTime != null) seekTo(d.seekTime); });
  h('seekforward', (d) => { if (P.cur && !P.cur.live) seekTo(audio.currentTime - segStart() + (d.seekOffset || 10)); });
  h('seekbackward', (d) => { if (P.cur && !P.cur.live) seekTo(audio.currentTime - segStart() - (d.seekOffset || 10)); });
}

/* ---------- player UI ---------- */
let shownId = '';
/* a title wider than the player scrolls slowly; it is measured only while the player is on screen */
function fitTitle() {
  const bt = $('#bigTitle'), sp = bt.firstChild;
  if (!sp || $('#player').hidden) return;
  bt.classList.remove('marquee');
  if (sp.scrollWidth > bt.clientWidth + 4) { bt.style.setProperty('--shift', `${bt.clientWidth - sp.scrollWidth - 24}px`); bt.classList.add('marquee'); }
}
function renderNow() {
  const t = P.cur;
  const mini = $('#mini');
  if (t && mini.hidden) { mini.classList.remove('show'); void mini.offsetWidth; mini.classList.add('show'); }
  mini.hidden = !t;
  if (!t) return;
  if (t.id !== shownId || !$('#nowCard')) refreshNowCard();
  if (t.id !== shownId) {
    shownId = t.id;
    for (const el of [$('#bigArt'), $('.mini-text'), $('.now-text')]) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
    loadLyrics(t);
  }
  const art = (t.coverKey && files.covers.get(t.coverKey)) || t.art || 'icon-512.png';
  const big = t.artBig || art;
  $('#miniTitle').textContent = t.title;
  $('#miniArtist').textContent = t.artist || '';
  $('#miniArt').src = art;
  $('#bigArt').src = big;
  $('#stage').classList.toggle('logo', !!t.live);
  const bt = $('#bigTitle');
  bt.innerHTML = `<span>${esc(t.title)}</span>`;
  bt.classList.remove('marquee');
  requestAnimationFrame(fitTitle);
  $('#bigArtist').textContent = t.artist || '';
  $('#bigArtist').disabled = !t.artistId && !t.albumId && !t.dzArtist;
  $('#playerBg').style.backgroundImage = `url("${art.replace(/"/g, '%22')}")`;

  $('#seek').classList.toggle('disabled', !!t.live);
  $('#tLive').hidden = !t.live;
  $('#tCur').style.visibility = $('#tDur').style.visibility = t.live ? 'hidden' : '';
  refreshLike();
  setSession(t);
  renderPlayState();
  lastSec = lastLeft = -1;
  pendingSeek = null;
  renderTime();
  renderQueue();
  markPlaying();
}
function renderPlayState() {
  const on = P.playing;
  const nc = $('#nowCard');
  if (nc) { const e = nc.querySelector('.nc-eyebrow'); if (e) e.textContent = on ? 'СЕЙЧАС ИГРАЕТ' : 'НА ПАУЗЕ'; const d = nc.querySelector('.nc-dots i'); if (d) d.classList.toggle('on', on); }
  document.body.classList.toggle('is-playing', on);
  for (const b of [$('#play'), $('#miniPlay')]) {
    if (b.dataset.on === String(on)) continue;
    b.dataset.on = String(on);
    b.innerHTML = on ? I.pause : I.play;
    b.firstChild.classList.add('flip');
    b.setAttribute('aria-label', on ? 'Пауза' : 'Играть');
  }
  $('#stage').classList.toggle('paused', !on);
  document.body.classList.toggle('is-paused', !on);
  try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused'; } catch {}
  $('#shuffle').classList.toggle('on', P.shuffle);
  $('#repeat').classList.toggle('on', P.repeat !== 'off');
  $('#repeat').classList.toggle('one', P.repeat === 'one');
}
let seekRatio = null;
let pendingSeek = null;
const segStart = () => (seg ? seg.start : 0);
/* jump to a position inside the current song (seconds from its start) */
function seekTo(sec) {
  const d = seekDur();
  if (!d) return;
  const x = Math.min(d - 0.05, Math.max(0, sec));
  pendingSeek = x;
  audio.currentTime = segStart() + x;
  renderTime();
  syncPosition();
}
const seekDur = () => {
  const full = isFinite(audio.duration) && audio.duration ? audio.duration : 0;
  if (seg) return (seg.end || full) - seg.start;
  return full || (P.cur && P.cur.duration) || 0;
};
const seekFill = $('#seekFill'), miniBar = $('#miniBar'), tCur = $('#tCur'), tDur = $('#tDur');
let lastSec = -1, lastLeft = -1, lastClock = -1;
/* HH:MM:SS for the Pulse bar */
const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
function setSeek(r) {
  seekFill.style.transform = `scaleX(${r})`;
}
function renderTime() {
  const t = P.cur;
  if (!t || t.live) { miniBar.style.transform = 'scaleX(0)'; return; }
  const d = seekDur();
  const c = pendingSeek != null ? pendingSeek : Math.max(0, (audio.currentTime || 0) - segStart());
  const r = d ? Math.min(1, c / d) : 0;
  miniBar.style.transform = `scaleX(${r})`;
  const nl = $('#nowLine');
  if (nl) nl.style.transform = `scaleX(${r})`;
  const sec0 = Math.floor(c);
  if (sec0 !== lastClock) { lastClock = sec0; $('#miniClock').textContent = clock(c); }
  syncLyrics(false);
  if (seekRatio != null) return;
  setSeek(r);
  const sec = Math.floor(c), left = Math.floor(Math.max(0, d - c));
  if (sec !== lastSec || left !== lastLeft) {
    lastSec = sec; lastLeft = left;
    tCur.textContent = fmt(c);
    tDur.textContent = '−' + fmt(Math.max(0, d - c));
    $('#seek').setAttribute('aria-valuenow', Math.round(r * 100));
  }
}
function refreshLike() {
  const t = P.cur;
  if (!t) return;
  const st = t.src === 'radio';
  const on = st ? lib.isSaved(t.id) : lib.isLiked(t.id);
  const b = $('#bigLike');
  b.innerHTML = on ? I.heartOn : I.heart;
  b.classList.toggle('on', on);
  b.setAttribute('aria-label', st ? (on ? 'Удалить станцию' : 'Сохранить станцию') : on ? 'Удалить из избранного' : 'В избранное');
}
function renderQueue() {
  const rest = P.queue.slice(P.idx + 1);
  ctx.queue = rest;
  $('#queue').innerHTML = rest.length ? rest.map((t, i) => row(t, i, 'queue', { q: P.idx + 1 + i })).join('') : '<li class="empty-q">В очереди ничего нет</li>';
  $('#clearQueue').hidden = !rest.length;
}
function markPlaying() {
  const id = P.cur && P.cur.id;
  $$('#view .row[data-id]').forEach((el) => el.classList.toggle('playing', el.dataset.id === id));
}

const pop = (el) => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
$('#play').onclick = (e) => { pop(e.currentTarget); P.toggle(); };
$('#miniPlay').onclick = (e) => { pop(e.currentTarget); P.toggle(); };
$('#next').onclick = () => P.next();
$('#miniNext').onclick = () => P.next();
$('#prev').onclick = () => P.prev();
$('#shuffle').onclick = () => {
  P.shuffle = !P.shuffle; store.set('shuffle', P.shuffle);
  if (P.shuffle && P.cur) { P.queue = [...P.queue.slice(0, P.idx + 1), ...shuffled(P.queue.slice(P.idx + 1))]; P.persist(); renderQueue(); }
  renderPlayState();
};
$('#repeat').onclick = () => {
  P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat]; store.set('repeat', P.repeat);
  renderPlayState(); toast({ off: 'Повтор выключен', all: 'Повтор всей очереди', one: 'Повтор одного трека' }[P.repeat]);
};
$('#clearQueue').onclick = () => { P.queue = P.queue.slice(0, P.idx + 1); P.persist(); renderQueue(); };
/* seek bar: follows the finger instantly, jumps the audio once on release */
const seekEl = $('#seek');
const bubble = $('#seekBubble');
let seekRect = null;
function seekAt(e) {
  const r = seekRect || (seekRect = seekEl.getBoundingClientRect());
  seekRatio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const d = seekDur();
  setSeek(seekRatio);
  tCur.textContent = fmt(seekRatio * d);
  tDur.textContent = '−' + fmt(Math.max(0, d - seekRatio * d));
  bubble.textContent = fmt(seekRatio * d);
  bubble.style.transform = `translateX(${Math.min(r.width - 28, Math.max(28, seekRatio * r.width))}px) translateX(-50%)`;
  lastSec = lastLeft = -1;
}
seekEl.addEventListener('pointerdown', (e) => {
  seekRect = seekEl.getBoundingClientRect();
  if (seekEl.classList.contains('disabled') || !seekDur()) return;
  e.preventDefault();
  try { seekEl.setPointerCapture(e.pointerId); } catch {}
  seekEl.classList.add('active');
  seekAt(e);
});
seekEl.addEventListener('pointermove', (e) => { if (seekRatio != null) seekAt(e); });
const seekEnd = () => {
  if (seekRatio == null) return;
  const x = seekRatio * seekDur();
  seekRatio = null;
  seekEl.classList.remove('active');
  seekTo(x);
};
seekEl.addEventListener('pointerup', seekEnd);
seekEl.addEventListener('pointercancel', seekEnd);
seekEl.addEventListener('lostpointercapture', seekEnd);
seekEl.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  seekTo(audio.currentTime - segStart() + (e.key === 'ArrowRight' ? 5 : -5));
});
const vol = $('#volume');
vol.value = Math.round(audio.volume * 100); vol.style.setProperty('--p', vol.value + '%');
vol.addEventListener('input', () => { audio.volume = vol.value / 100; vol.style.setProperty('--p', vol.value + '%'); store.set('volume', audio.volume); });
$('#bigLike').onclick = (e) => {
  const t = P.cur, b = e.currentTarget;
  if (!t) return;
  t.src === 'radio' ? lib.toggleStation(t) : lib.toggleLike(t);
  b.classList.remove('burst');
  if (b.classList.contains('on')) { void b.offsetWidth; b.classList.add('burst'); }
};
$('#bigMore').onclick = () => P.cur && trackSheet(P.cur, {});
$('#bigArtist').onclick = () => {
  const t = P.cur;
  if (!t) return;
  if (t.dzArtist) { closePlayer(); go('#dz/' + t.dzArtist); }
  else if (t.artistId) { closePlayer(); go('#artist/' + t.artistId); }
  else if (t.albumId) { closePlayer(); go('#album/' + encodeURIComponent(t.albumId)); }
};

const playerEl = $('#player');
function openPlayer() {
  if (!P.cur) return;
  playerEl.style.transition = ''; playerEl.style.transform = '';
  playerEl.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(fitTitle);
  startTick();
}
function hidePlayer() {
  playerEl.hidden = true;
  playerEl.style.transition = ''; playerEl.style.transform = '';
  document.documentElement.style.overflow = '';
}
function closePlayer(animate = true) {
  if (playerEl.hidden) return;
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return hidePlayer();
  const ease = 'transform .42s cubic-bezier(.32,.72,0,1)';
  playerEl.style.transition = ease;
  playerEl.style.transform = 'translate3d(0,100%,0)';
  let done = false;
  const fin = () => { if (!done) { done = true; hidePlayer(); } };
  playerEl.addEventListener('transitionend', fin, { once: true });
  setTimeout(fin, 420);
}
function swipeable(el, onSwipe) {
  let x0 = 0, y0 = 0, on = false, moved = false;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; on = true; moved = false; el.style.transition = 'none'; }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!on) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (!moved && Math.abs(dy) > Math.abs(dx)) { on = false; return; }
    if (Math.abs(dx) > 8) moved = true;
    if (moved) el.style.transform = `translate3d(${dx * 0.6}px,0,0)`;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!on) return;
    on = false;
    const dx = e.changedTouches[0].clientX - x0;
    el.style.transition = 'transform .28s cubic-bezier(.25,.8,.3,1)';
    if (moved && Math.abs(dx) > 60) {
      el.style.transform = `translate3d(${dx > 0 ? 40 : -40}px,0,0)`;
      setTimeout(() => { el.style.transform = ''; }, 140);
      onSwipe(dx < 0 ? 1 : -1);
      el.dataset.swiped = '1';
      setTimeout(() => { delete el.dataset.swiped; }, 350);
    } else el.style.transform = '';
  });
}
swipeable($('#stage'), (dir) => (dir > 0 ? P.next() : P.prev(true)));
swipeable($('#mini'), (dir) => (dir > 0 ? P.next() : P.prev(true)));
$('#miniOpen').onclick = () => { if (!$('#mini').dataset.swiped) openPlayer(); };
$('#playerClose').onclick = () => closePlayer();
let drag = null;
playerEl.addEventListener('touchstart', (e) => {
  drag = playerEl.scrollTop <= 0 && !e.target.closest('input, .seekbar') ? { x0: e.touches[0].clientX, y0: e.touches[0].clientY, t0: performance.now(), dy: 0 } : null;
}, { passive: true });
playerEl.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const dy = e.touches[0].clientY - drag.y0;
  if (!drag.dy && Math.abs(e.touches[0].clientX - drag.x0) > Math.abs(dy)) { drag = null; return; }
  if (!drag.dy && dy < -6) { drag = null; return; }
  if (!drag.dy && dy <= 0) return;
  e.preventDefault();
  drag.dy = Math.max(0, dy);
  const tf = `translate3d(0,${drag.dy}px,0)`;
  playerEl.style.transition = 'none'; playerEl.style.transform = tf;
}, { passive: false });
playerEl.addEventListener('touchend', () => {
  if (!drag) return;
  const { dy, t0 } = drag;
  drag = null;
  const v = dy / Math.max(1, performance.now() - t0);
  if (dy > 140 || (dy > 30 && v > 0.5)) return closePlayer();
  const back = 'transform .45s cubic-bezier(.32,.72,0,1)';
  playerEl.style.transition = back; playerEl.style.transform = '';
});
/* no pinch zoom (double-tap zoom is turned off in CSS, so quick double taps on buttons still work) */
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input:not([type=range]), textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); P.toggle(); }
  if (e.key === 'Escape') { if (!$('#sheet').hidden) closeSheet(); else closePlayer(); }
});

/* ======================= sheets ======================= */
let sheetActs = [];
function openSheet(head, body) {
  $('#sheetHead').innerHTML = head;
  $('#sheetBody').innerHTML = body;
  $('#sheet').hidden = false;
  const f = $('#sheetBody input'); if (f) setTimeout(() => f.focus(), 60);
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; }
$('#sheetCancel').onclick = closeSheet;
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
function acts(list) {
  sheetActs = list;
  return list.map((a, i) => `<button class="act${a.danger ? ' danger' : ''}" data-act="${i}"><span>${esc(a.label)}</span>${a.icon || ''}</button>`).join('');
}
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = sheetActs[+b.dataset.act];
  closeSheet();
  if (a) a.fn();
});
const sheetTitle = (t) => `<span class="thumb${t.live ? ' round logo' : ''}">${img(t.thumb || t.art)}</span><h3>${esc(t.title)}<small>${esc(t.artist || '')}</small></h3>`;

function trackSheet(t, { playlistId, q, fileView } = {}) {
  const l = [];
  if (q == null) {
    l.push({ label: 'Сыграть следующим', icon: I.next, fn: () => P.playNext(t) });
    l.push({ label: 'В конец очереди', icon: I.queue, fn: () => P.addToQueue(t) });
  } else {
    l.push({ label: 'Убрать из очереди', icon: I.trash, fn: () => { P.queue.splice(q, 1); P.persist(); renderQueue(); } });
  }
  if (t.src === 'radio') {
    l.push({ label: lib.isSaved(t.id) ? 'Удалить из моих станций' : 'Сохранить станцию', icon: lib.isSaved(t.id) ? I.heartOn : I.heart, fn: () => { lib.toggleStation(t); if (location.hash.startsWith('#library')) route(); } });
  } else {
    l.push({ label: lib.isLiked(t.id) ? 'Удалить из избранного' : 'В избранное', icon: lib.isLiked(t.id) ? I.heartOn : I.heart, fn: () => { lib.toggleLike(t); if (location.hash === '#library/liked') route(); } });
    l.push({ label: 'Добавить в плейлист', icon: I.list, fn: () => playlistPicker(t) });
  }
  if (t.artistId) l.push({ label: 'Перейти к артисту', icon: I.person, fn: () => { closePlayer(); go('#artist/' + t.artistId); } });
  if (t.alId) l.push({ label: 'Перейти к альбому', icon: I.album, fn: () => { closePlayer(); go('#al/' + t.alId); } });
  if (t.albumId) l.push({ label: 'Перейти к альбому', icon: I.album, fn: () => { closePlayer(); go('#album/' + encodeURIComponent(t.albumId)); } });
  if (t.src === 'local') l.push({ label: 'Открыть папку артиста', icon: I.folder, fn: () => { closePlayer(); go('#mine-artist/' + encodeURIComponent(t.albumArtist || t.artist)); } });
  if (t.dzArtist) l.push({ label: 'Перейти к артисту', icon: I.person, fn: () => { closePlayer(); go('#dz/' + t.dzArtist); } });
  if (t.dzAlbum) l.push({ label: 'Перейти к альбому', icon: I.album, fn: () => { closePlayer(); go('#dza/' + t.dzAlbum); } });
  if (t.src === 'audius' || t.src === 'deezer') l.push({ label: 'Скрыть трек', icon: I.trash, fn: () => { lib.hide('tracks', [t.id]); toast('Трек скрыт'); $$(`#view .row[data-id="${CSS.escape(t.id)}"]`).forEach((r) => r.remove()); } });
  if (playlistId) l.push({ label: 'Удалить из плейлиста', icon: I.trash, danger: true, fn: () => { const p = lib.playlists.find((x) => x.id === playlistId); if (p) { p.tracks = p.tracks.filter((x) => x.id !== t.id); lib.save('playlists'); route(); } } });
  if (fileView) l.push({ label: 'Удалить файл', icon: I.trash, danger: true, fn: async () => { await files.del(t.localKey); toast('Файл удалён'); route(); } });
  openSheet(sheetTitle(t), acts(l));
}
function playlistPicker(t) {
  const l = lib.playlists.map((p) => ({ label: p.name, icon: I.list, fn: () => addToPlaylist(p.id, t) }));
  l.unshift({ label: 'Новый плейлист', icon: I.plus, fn: () => playlistForm(t) });
  openSheet('<h3>Добавить в плейлист</h3>', acts(l));
}
function addToPlaylist(id, t) {
  const p = lib.playlists.find((x) => x.id === id);
  if (!p) return;
  if (p.tracks.some((x) => x.id === t.id)) return toast(`Уже есть в «${p.name}»`);
  p.tracks.push(slim(t)); lib.save('playlists'); toast(`Добавлено в «${p.name}»`);
}
function playlistForm(t, rename) {
  openSheet(`<h3>${rename ? 'Переименовать' : 'Новый плейлист'}</h3>`, `<form id="plForm"><input class="text" id="plName" maxlength="60" placeholder="Название" value="${esc(rename ? rename.name : '')}" required><button class="btn solid" type="submit">${rename ? 'Сохранить' : 'Создать'}</button></form>`);
  $('#plForm').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#plName').value.trim();
    if (!name) return;
    if (rename) { rename.name = name; lib.save('playlists'); closeSheet(); route(); return; }
    const p = { id: uid(), name, tracks: t ? [slim(t)] : [], created: Date.now() };
    lib.playlists.unshift(p); lib.save('playlists'); closeSheet();
    toast(t ? `Добавлено в «${name}»` : 'Плейлист создан');
    if (!t) go('#playlist/' + p.id);
  };
}

/* ======================= building blocks ======================= */
const ctx = {};
let ctxSeq = 0;
const reg = (list) => { const k = 'l' + ++ctxSeq; ctx[k] = list; return k; };

function row(t, i, key, o = {}) {
  if (lib.isHidden(t)) return '';
  const lead = o.numbered
    ? `<span class="num"><span class="n">${o.n ? o.n(t, i) : i + 1}</span><span class="eq"><i></i><i></i><i></i></span></span>`
    : `<span class="thumb${t.live ? ' round logo' : ''}">${img(t.thumb || t.art)}</span>`;
  const sub = o.sub ? o.sub(t) : (t.live ? '<span class="tag live">Эфир</span>' : t.preview ? '<span class="tag">30 с</span>' : '') + esc(t.artist || '');
  const dur = !o.noDur && !t.live && t.duration ? fmt(t.duration) : '';
  const q = o.q != null ? ` data-q="${o.q}"` : '';
  return `<li class="row" data-id="${esc(t.id)}"><button class="hit" data-play="${key}" data-i="${i}"${q}>${lead}<span class="meta"><b>${esc(t.title)}</b>${sub ? `<small>${sub}</small>` : ''}</span></button><span class="tail">${o.showDur ? dur : ''}<button class="dots" data-more="${key}" data-i="${i}"${q} aria-label="Действия">${I.more}</button></span></li>`;
}
function rows(list, o = {}) {
  if (!list.length) return '';
  const k = o.key || reg(list);
  return `<ul class="list${o.numbered ? ' numbered' : ''}${o.cls ? ' ' + o.cls : ''}">${list.map((t, i) => row(t, i, k, o)).join('')}</ul>`;
}
const hrefOf = (a) => a.kind === 'dz-artist' ? `#dz/${a.id}` : a.kind === 'dz-album' ? `#dza/${a.id}` : a.kind === 'artist' ? `#artist/${a.id}` : a.kind === 'au-album' ? `#al/${a.id}` : `#album/${encodeURIComponent(a.id)}`;
function card(a) {
  if (lib.isHidden(a)) return '';
  const round = a.kind === 'artist' || a.kind === 'dz-artist';
  const t2 = a.kind === 'dz-artist' ? (a.fans ? fmtCount(a.fans) + ' поклонников' : 'Артист') : round ? (a.followers ? fmtCount(a.followers) + ' подписчиков' : 'Артист') : a.kind === 'dz-album' ? [a.year, a.artist].filter(Boolean).join(' · ') : a.artist || a.year || '';
  return `<a class="card${round ? ' center' : ''}" href="${hrefOf(a)}"><div class="art${round ? ' round' : ''}">${a.kind === 'ia-album' ? sleeve(a.art) : round ? img(a.avatar, true, a.avatarBig, '(min-width: 600px) 140px, 30vw') : img(a.art, false, a.artBig)}</div><span class="t1">${esc(round ? a.name : a.title)}</span><span class="t2">${esc(t2)}</span></a>`;
}
function playCard(t, k, i) {
  if (lib.isHidden(t)) return '';
  return `<button class="card${t.live ? ' center' : ''}" data-play="${k}" data-i="${i}"><div class="art${t.live ? ' round logo' : ''}">${t.live ? img(t.art) : img(t.art, false, t.artBig)}</div><span class="t1">${esc(t.title)}</span><span class="t2">${esc(t.artist || '')}</span></button>`;
}
/* the big card at the top of Home: the album of the week over its own blurred cover */
/* "Сейчас играет": the big card on Home; before anything plays it shows the album of the week */
function nowCard() {
  const t = P.cur;
  if (!t) {
    const a = lyr.weekAlbum;
    if (!a) return '';
    return `<a class="now-card" href="${hrefOf(a)}">
      <span class="nc-cover">${img(a.art, false, a.artBig, '(min-width: 600px) 520px, 92vw')}</span>
      <span class="nc-dots"><i></i><i></i><i></i></span>
      <span class="nc-strip"><span class="nc-eyebrow mono">АЛЬБОМ НЕДЕЛИ</span><b>${esc(a.title)}</b><small>${esc(a.artist || '')}</small></span>
    </a>`;
  }
  const art = (t.coverKey && files.covers.get(t.coverKey)) || t.art || '';
  return `<button class="now-card is-now" id="nowCard" aria-label="Открыть плеер">
    <span class="nc-cover">${img(art, false, t.artBig)}</span>
    <span class="nc-dots"><i class="${P.playing ? 'on' : ''}"></i><i class="${lib.isLiked(t.id) ? 'gold' : ''}"></i><i class="${lyr.lines ? 'on' : ''}"></i></span>
    <span class="nc-strip"><span class="nc-eyebrow mono">${P.playing ? 'СЕЙЧАС ИГРАЕТ' : 'НА ПАУЗЕ'}</span><b>${esc(t.title)}</b><small>${esc([t.artist, t.album].filter(Boolean).join(' · '))}</small>
      <span class="nc-line"><i id="nowLine"></i></span></span>
  </button>`;
}
function refreshNowCard() {
  const slot = $('#nowSlot');
  if (slot) slot.innerHTML = nowCard();
}
document.addEventListener('click', (e) => { if (e.target.closest('#nowCard')) openPlayer(); });
function genreChips() {
  return `<div class="chips-row">${GENRES.slice(0, 12).map(([g, n]) => `<a class="chip" href="#genre/${encodeURIComponent(g)}">${esc(n)}</a>`).join('')}</div>`;
}
function heroCard(a) {
  return `<a class="hero-card" href="${hrefOf(a)}">
    <span class="hc-bg"><img src="${esc(a.art)}" alt="" referrerpolicy="no-referrer" onerror="noteImgErr(this)"></span>
    <span class="hc-art">${img(a.art, false, a.artBig, '(min-width: 600px) 220px, 46vw')}</span>
    <span class="hc-text"><span class="hc-eyebrow">Альбом недели</span><b>${esc(a.title)}</b><small>${esc(a.artist || '')}</small><span class="hc-play">${I.play}Слушать</span></span>
  </a>`;
}
function feature(a, eyebrow) {
  if (lib.isHidden(a)) return '';
  return `<a class="feature" href="${hrefOf(a)}"><div><div class="eyebrow">${esc(eyebrow)}</div><div class="ft">${esc(a.title)}</div><div class="fs">${esc(a.artist || '')}</div></div><div class="art">${img(a.art, false, a.artBig, '(min-width: 600px) 380px, 92vw')}</div></a>`;
}
function section(title, inner, href) {
  const h = href ? `<a href="${href}">${esc(title)}${I.chev}</a>` : esc(title);
  return `<section class="section"><div class="sec-head"><h2>${h}</h2></div>${inner}</section>`;
}
function rowShelf(list) {
  const k = reg(list);
  return `<ul class="list shelf rows4">${list.map((t, i) => row(t, i, k)).join('')}</ul>`;
}
const shelf = (items, cls = '') => `<div class="shelf ${cls}">${items}</div>`;
const skCard = (round) => `<div class="card"><div class="art sk${round ? ' round' : ''}"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`;
const skShelf = (n = 6, cls = '', round) => shelf(Array.from({ length: n }, () => skCard(round)).join(''), cls);
const skRows = (n = 6) => `<ul class="list">${Array.from({ length: n }, () => `<li class="row"><span class="hit"><span class="thumb sk"></span><span class="meta"><span class="sk sk-line" style="display:block;width:60%;margin:0"></span><span class="sk sk-line short" style="display:block;width:35%"></span></span></span></li>`).join('')}</ul>`;
const skGrid = (n = 8) => `<div class="grid">${Array.from({ length: n }, () => skCard()).join('')}</div>`;

let lazySeq = 0;
function lazy(promise, render, skel = skShelf()) {
  if (promise.v !== undefined) return render(promise.v) || '';
  const id = 'z' + ++lazySeq;
  promise.then((d) => { const el = document.getElementById(id); if (el) { el.outerHTML = render(d) || ''; markPlaying(); } })
    .catch(() => { const el = document.getElementById(id); if (el) el.outerHTML = `<p class="err">Не удалось загрузить.<button class="text-btn" data-retry>Повторить</button></p>`; });
  return `<div id="${id}">${skel}</div>`;
}
const backBtn = (href) => `<div class="topbar"><a class="back" href="${href || '#'}" ${href ? '' : 'data-back'}>${I.back}Назад</a></div>`;
const playActions = (k, label = 'Слушать') => `<div class="actions"><button class="btn solid" data-play="${k}" data-i="0">${I.play}${label}</button><button class="btn" data-shuffle="${k}">${I.shuffle}Перемешать</button></div>`;
function go(h) { if (location.hash === h) route(); else location.hash = h; }

document.addEventListener('click', (e) => {
  const el = e.target;
  const pl = el.closest('[data-play]');
  if (pl) {
    const list = ctx[pl.dataset.play];
    if (!list) return;
    if (pl.dataset.q != null) return P.play(+pl.dataset.q);
    return P.setQueue(list, +pl.dataset.i);
  }
  const mo = el.closest('[data-more]');
  if (mo) {
    const list = ctx[mo.dataset.more];
    const t = list && list[+mo.dataset.i];
    if (t) trackSheet(t, { playlistId: mo.closest('[data-playlist]')?.dataset.playlist, q: mo.dataset.q != null ? +mo.dataset.q : undefined, fileView: !!mo.closest('[data-files]') });
    return;
  }
  const sh = el.closest('[data-shuffle]');
  if (sh) { const l = ctx[sh.dataset.shuffle]; if (l && l.length) P.setQueue(shuffled(l), 0); return; }
  if (el.closest('[data-retry]')) { memo.clear(); route(); return; }
  if (el.closest('[data-back]')) { e.preventDefault(); history.length > 1 ? history.back() : go('#home'); }
});

/* ======================= catalog presets ======================= */
const GENRES = [
  ['Electronic', 'Электроника'], ['Hip-Hop/Rap', 'Хип-хоп'], ['Pop', 'Поп'], ['Rock', 'Рок'], ['Alternative', 'Альтернатива'],
  ['R&B/Soul', 'R&B и соул'], ['Lo-Fi', 'Lo-fi'], ['House', 'Хаус'], ['Techno', 'Техно'], ['Drum & Bass', 'Драм-н-бейс'],
  ['Dubstep', 'Дабстеп'], ['Trap', 'Трэп'], ['Latin', 'Латина'], ['Afro Beat', 'Афробит'], ['Jazz', 'Джаз'], ['Ambient', 'Эмбиент'],
  ['Classical', 'Классика'], ['Metal', 'Метал'], ['Folk', 'Фолк'], ['World', 'Музыка мира'], ['Reggae', 'Регги'], ['Soundtrack', 'Саундтреки'],
  ['Funk', 'Фанк'], ['Experimental', 'Эксперимент'],
];
const genreName = (g) => (GENRES.find((x) => x[0] === g) || [g, g])[1];
const ARCHIVE_SETS = [
  ['etree', 'Живые концерты', 'mediatype:etree AND collection:etree'],
  ['78rpm', 'Пластинки 78 об/мин', 'mediatype:audio AND collection:(78rpm OR georgeblood)'],
  ['netlabels', 'Независимые лейблы', 'mediatype:audio AND collection:netlabels'],
  ['fresh', 'Новое в архиве', 'mediatype:audio AND collection:audio_music'],
];
const RADIO_COUNTRIES = ['RU', 'UA', 'BY', 'KZ', 'US', 'GB', 'DE', 'FR', 'IT', 'ES', 'TR', 'BR', 'JP', 'KR', 'IN'];
const RADIO_TAGS = [['', 'Все'], ['pop', 'Поп'], ['rock', 'Рок'], ['dance', 'Танцевальное'], ['hiphop', 'Хип-хоп'], ['jazz', 'Джаз'], ['classical', 'Классика'], ['chillout', 'Чилаут'], ['electronic', 'Электроника'], ['retro', 'Ретро'], ['news', 'Новости']];

const trendingWeek = () => cached('au-trend-week', () => audius.trending({ limit: 60 }));
function artistsOf(tracks, n = 14) {
  const seen = new Set(), out = [];
  for (const t of tracks) {
    if (!t.by || seen.has(t.by.id) || lib.hidden.artists.includes(t.by.id)) continue;
    seen.add(t.by.id);
    out.push({ kind: 'artist', id: t.by.id, name: t.by.name, avatar: t.by.avatar, avatarBig: t.by.avatarBig, followers: t.by.followers });
    if (out.length >= n) break;
  }
  return out;
}

/* every rapper from the rap and trap charts, each with an own folder (artist page) */
const RAP_SOURCES = [
  ['Hip-Hop/Rap', 'week', 0], ['Hip-Hop/Rap', 'month', 0], ['Hip-Hop/Rap', 'allTime', 0], ['Hip-Hop/Rap', 'allTime', 100], ['Hip-Hop/Rap', 'allTime', 200],
  ['Trap', 'week', 0], ['Trap', 'month', 0], ['Trap', 'allTime', 0], ['Trap', 'allTime', 100],
];
const ruCollator = new Intl.Collator('ru', { sensitivity: 'base' });
let sortedRappers = null;
const rapIndex = () => cached('rap-index', async () => {
  const lists = await Promise.all(RAP_SOURCES.map(([genre, time, offset]) => slow(() => audius.trending({ genre, time, limit: 100, offset })).catch(() => [])));
  const all = artistsOf(lists.flat(), 5000);
  if (!all.length) throw new Error('empty');
  return all.sort((a, b) => b.followers - a.followers);
}, 24 * 3600e3);
const norm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
function matchArtists(list, q, key = 'name') {
  const n = norm(q);
  if (!n) return [];
  return list.map((a) => { const v = norm(a[key]); const i = v.indexOf(n); return { a, r: i === 0 ? 0 : i > 0 ? 1 : -1 }; })
    .filter((x) => x.r >= 0).sort((x, y) => x.r - y.r).map((x) => x.a);
}
function folderRow(a) {
  return `<li class="row"><a class="hit" href="#artist/${a.id}"><span class="thumb round">${img(a.avatar, true)}</span><span class="meta"><b>${esc(a.name)}</b><small>${a.followers ? fmtCount(a.followers) + ' подписчиков' : 'Артист'}</small></span></a><span class="tail chev-tail"></span></li>`;
}

/* ======================= views ======================= */
const view = $('#view');
const views = {
  home() {
    const recent = lib.recent.slice(0, 12);
    const rk = reg(recent);
    const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    let h = `<p class="page-eyebrow">${esc(today)}</p><h1 class="page-title">Главная</h1>`;
    h += lazy(cached('au-albums', () => audius.trendingLists('album')), (l) => {
      const list = l.filter((a) => !lib.isHidden(a));
      if (!list.length) return '';
      lyr.weekAlbum = list[0];
      return `<div id="nowSlot">${nowCard()}</div>` + genreChips() + (list.length > 1 ? section('Альбомы недели', shelf(list.slice(1, 12).map(card).join(''), 'shotgun')) : '');
    }, `<div class="now-card loading"><span class="typing">Note загружает музыку</span></div>`);
    if (recent.length) h += section('Недавно играло', shelf(recent.map((t, i) => playCard(t, rk, i)).join('')));
    h += section('Мировой чарт · превью', lazy(cached('dz-chart:0', () => deezer.chart(0, 40), 6 * 3600e3), (l) => rowShelf(l.slice(0, 20)), skRows(4)));
    h += section('Хиты недели', lazy(trendingWeek(), (l) => rowShelf(l.slice(0, 20)), skRows(4)), '#chart/week');
    h += section('Артисты недели', lazy(mapP(trendingWeek(), (t) => artistsOf(t, 14)), (l) => shelf(l.map(card).join(''), 'small'), skShelf(5, 'small', true)));
    h += section('Андеграунд-рэп', lazy(cached('au-pl:rage', () => audius.search('playlists', 'rage', 16)), (l) => shelf(l.map(card).join(''))), '#underground');
    h += section('Радио в России', lazy(cached('radio:RU|', () => radio.search({ country: 'RU', limit: 80 })), (l) => rowShelf(l.slice(0, 16)), skRows(4)), '#radio');
    h += section('Популярные плейлисты', lazy(cached('au-playlists', () => audius.trendingLists('playlist')), (l) => shelf(l.map(card).join(''))));
    for (const [key, name, q] of ARCHIVE_SETS.slice(0, 2)) h += section(name, lazy(cached('ia2:' + key, () => archive.search(q, { rows: 20 })), (l) => shelf(l.map(card).join(''))), '#archive/' + key);
    view.innerHTML = h;
  },

  browse() {
    let h = `<h1 class="page-title">Обзор</h1><p class="page-sub">Музыка независимых артистов со всего мира</p>`;
    h += `<a class="feature" href="#underground" style="margin-top:22px"><div><div class="eyebrow">Подборка</div><div class="ft">Андеграунд-рэп</div><div class="fs">Рейдж, плагг, фонк, дрилл и трэп</div></div><div class="art" data-underground-art>${img('')}</div></a>`;
    h += section('Официальные чарты', lazy(cached('dz-chart:116', () => deezer.chart(116, 40), 6 * 3600e3), (l) => `<p class="note" style="margin:-4px 0 8px">Хип-хоп, мир · превью по 30 секунд</p>` + rowShelf(l.slice(0, 20)), skRows(4)));
    h += section('Рэперы', `<ul class="menu"><li><a href="#rappers">${I.folder}<span>Папки рэперов A–Z</span>${I.chev.replace('<svg', '<svg class="chev"')}</a></li></ul>`);
    h += section('Чарты', `<ul class="menu">
      <li><a href="#chart/week">${I.note}<span>Топ-100 недели</span>${I.chev.replace('<svg', '<svg class="chev"')}</a></li>
      <li><a href="#chart/month">${I.note}<span>Топ-100 месяца</span>${I.chev.replace('<svg', '<svg class="chev"')}</a></li>
      <li><a href="#chart/allTime">${I.note}<span>Топ-100 за всё время</span>${I.chev.replace('<svg', '<svg class="chev"')}</a></li></ul>`);
    h += section('Жанры', `<div class="tiles">${GENRES.map(([g, n]) => `<a class="tile" href="#genre/${encodeURIComponent(g)}" data-genre-art="${esc(g)}"><span>${esc(n)}</span></a>`).join('')}</div>`);
    h += section('Радио со всего мира', `<ul class="menu"><li><a href="#countries">${I.globe}<span>Все страны</span>${I.chev.replace('<svg', '<svg class="chev"')}</a></li></ul>`);
    h += section('Из архивов', `<div class="tiles">${ARCHIVE_SETS.map(([k, n]) => `<a class="tile" href="#archive/${k}" data-archive-art="${k}"><span>${esc(n)}</span></a>`).join('')}</div>`);
    view.innerHTML = h;
    fillTileArt();
    whenReady(cached('au-genre:Hip-Hop/Rap:week', () => audius.trending({ genre: 'Hip-Hop/Rap', time: 'week', limit: 60 })), (l) => {
      const el = $('[data-underground-art]'); const t = l.find((x) => x.artBig);
      if (el && t) el.insertAdjacentHTML('beforeend', `<img src="${esc(t.artBig)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`);
    }, () => {});
  },

  chart(time = 'week') {
    const names = { week: 'Топ-100 недели', month: 'Топ-100 месяца', allTime: 'Топ-100 за всё время' };
    if (!names[time]) time = 'week';
    view.innerHTML = backBtn('#browse') + `<h1 class="page-title">${names[time]}</h1>` +
      lazy(cached('au-chart:' + time, () => audius.trending({ time, limit: 100 })), (l) => { const k = reg(l); return playActions(k) + rows(l, { key: k, showDur: true }); }, skRows(10));
  },

  genre(g) {
    g = decodeURIComponent(g || '');
    const time = store.get('genreTime', 'week');
    view.innerHTML = backBtn('#browse') + `<h1 class="page-title">${esc(genreName(g))}</h1>
      <div class="seg">${[['week', 'Неделя'], ['month', 'Месяц'], ['allTime', 'Всё время']].map(([v, n]) => `<button class="${v === time ? 'on' : ''}" data-time="${v}">${n}</button>`).join('')}</div>` +
      lazy(cached(`au-genre:${g}:${time}`, () => audius.trending({ genre: g, time, limit: 60 })), (l) => {
        if (!l.length) return '<div class="empty"><b>Пока пусто</b>В этом жанре нет треков за выбранный период.</div>';
        const k = reg(l);
        return playActions(k) + section('Лучшие треки', rows(l.slice(0, 40), { key: k, showDur: true })) +
          section('Артисты', shelf(artistsOf(l, 12).map(card).join(''), 'small'));
      }, skRows(10));
    $$('[data-time]', view).forEach((b) => b.onclick = () => { store.set('genreTime', b.dataset.time); views.genre(g); });
  },

  archive(key) {
    const set = ARCHIVE_SETS.find((s) => s[0] === key) || ARCHIVE_SETS[0];
    view.innerHTML = backBtn('#browse') + `<h1 class="page-title">${esc(set[1])}</h1><p class="page-sub">Internet Archive</p>` +
      lazy(cached('ia-all2:' + set[0], () => archive.search(set[2], { rows: 60, sort: set[0] === 'fresh' ? 'publicdate desc' : 'downloads desc' })), (l) => `<div class="grid">${l.map(card).join('')}</div>`, skGrid());
  },

  artist(id) {
    view.innerHTML = `<div class="artist-head"><a class="back" href="#" data-back>${I.back}</a></div>` + skRows(5);
    whenReady(allP([cached('au-user:' + id, () => audius.artist(id)), cached('au-utracks:' + id, () => audius.artistTracks(id))]), ([a, tracks]) => {
      if (location.hash !== '#artist/' + id) return;
      const k = reg(tracks);
      const following = lib.isFollowing(a.id);
      const coverImg = a.cover ? `<img class="cover" src="${esc(a.cover)}" alt="" referrerpolicy="no-referrer">` : a.avatar ? `<img class="cover blur" src="${esc(a.avatar)}" alt="" referrerpolicy="no-referrer">` : '';
      let h = `<div class="artist-head">${coverImg}<a class="back" href="#" data-back>${I.back}</a>
        <div class="who"><div class="avatar">${img(a.avatar, true)}</div><div><h1>${esc(a.name)}${a.verified ? I.check.replace('<svg', '<svg class="verified"') : ''}</h1>
        <p>${[a.followers ? fmtCount(a.followers) + ' подписчиков' : '', a.location].filter(Boolean).map(esc).join(' · ')}</p></div></div></div>`;
      h += tracks.length ? `<div class="actions"><button class="btn solid" data-play="${k}" data-i="0">${I.play}Слушать</button><button class="btn" id="followBtn">${following ? I.following + 'В медиатеке' : I.follow + 'Подписаться'}</button></div>` : '';
      h += tracks.length ? section('Популярные треки', rows(tracks.slice(0, 5), { key: k, showDur: true })) : '<div class="empty"><b>Треков пока нет</b></div>';
      h += lazy(cached('au-ualbums:' + id, () => audius.artistLists(id, 'albums')), (l) => l.length ? section('Альбомы', shelf(l.map(card).join(''))) : '', '');
      if (tracks.length > 5) h += section('Все треки', rows(tracks.slice(5), { key: reg(tracks.slice(5)), showDur: true }));
      h += lazy(cached('au-ulists:' + id, () => audius.artistLists(id, 'playlists')), (l) => l.length ? section('Плейлисты', shelf(l.map(card).join(''))) : '', '');
      if (a.bio) h += section('Об артисте', `<p class="desc" style="margin-top:0;-webkit-line-clamp:8">${esc(a.bio)}</p>`);
      view.innerHTML = h;
      const fb = $('#followBtn');
      if (fb) fb.onclick = () => { lib.toggleArtist(a); const on = lib.isFollowing(a.id); fb.innerHTML = on ? I.following + 'В медиатеке' : I.follow + 'Подписаться'; };
      markPlaying();
    }, () => { view.innerHTML = backBtn() + `<p class="err">Не удалось открыть артиста.<button class="text-btn" data-retry>Повторить</button></p>`; });
  },

  al(id) {
    view.innerHTML = backBtn() + `<div class="hero"><div class="art sk"></div></div>` + skRows(6);
    whenReady(cached('au-al:' + id, () => audius.album(id)), (a) => {
      if (location.hash !== '#al/' + id) return;
      const k = reg(a.tracks);
      const total = a.tracks.reduce((s, t) => s + (t.duration || 0), 0);
      const year = String(a.date).slice(0, 4);
      view.innerHTML = backBtn() + `<div class="hero"><div class="art">${img(a.artBig || a.art)}</div><div>
        <h1>${esc(a.title)}</h1>${a.artistId ? `<a class="by" href="#artist/${a.artistId}">${esc(a.artist)}</a>` : `<div class="by">${esc(a.artist)}</div>`}
        <div class="info">${[a.isAlbum ? 'Альбом' : 'Плейлист', year].filter(Boolean).join(' · ')}</div></div></div>` +
        (a.tracks.length ? playActions(k) + rows(a.tracks, { key: k, numbered: a.isAlbum, showDur: true, sub: a.isAlbum ? () => '' : null }) : '<div class="empty"><b>Нет доступных треков</b></div>') +
        `<div class="actions"><button class="btn" id="hideAlbum" style="grid-column:1/-1;color:var(--fg-2)">${I.trash}Скрыть этот ${a.isAlbum ? 'альбом' : 'плейлист'}</button></div>` +
        `<p class="foot">${tracksWord(a.tracks.length)}${total ? ', ' + fmtLong(total) : ''}</p>` + (a.desc ? `<p class="desc">${esc(a.desc)}</p>` : '');
      const hb = $('#hideAlbum');
      if (hb) hb.onclick = () => { lib.hide('albums', [a.id]); lib.hide('tracks', a.tracks.map((x) => x.id)); toast('Скрыто. Вернуть можно в «Источниках»'); history.length > 1 ? history.back() : go('#home'); };
      markPlaying();
    }, () => { view.innerHTML = backBtn() + `<p class="err">Не удалось открыть альбом.<button class="text-btn" data-retry>Повторить</button></p>`; });
  },

  album(id) {
    id = decodeURIComponent(id || '');
    view.innerHTML = backBtn() + `<div class="hero"><div class="art sk"></div></div>` + skRows(6);
    whenReady(cached('ia-album:' + id, () => archive.album(id)), (a) => {
      if (decodeURIComponent(location.hash.slice(7)) !== id) return;
      const k = reg(a.tracks);
      const total = a.tracks.reduce((s, t) => s + (t.duration || 0), 0);
      view.innerHTML = backBtn() + `<div class="hero"><div class="art">${img(a.artBig || a.art)}</div><div>
        <h1>${esc(a.title)}</h1>${a.artist ? `<a class="by" href="#ia-artist/${encodeURIComponent(a.artist)}">${esc(a.artist)}</a>` : ''}
        <div class="info">${['Internet Archive', a.year].filter(Boolean).join(' · ')}</div></div></div>` +
        (a.tracks.length ? playActions(k) + rows(a.tracks, { key: k, numbered: true, showDur: true, n: (t, i) => t.n || i + 1, sub: (t) => t.artist && t.artist !== a.artist ? esc(t.artist) : '' }) : '<div class="empty"><b>В этой записи нет аудио</b>Попробуйте другую.</div>') +
        `<p class="foot">${tracksWord(a.tracks.length)}${total ? ', ' + fmtLong(total) : ''}<br><a class="text-btn" href="https://archive.org/details/${encodeURIComponent(a.id)}" target="_blank" rel="noopener">Страница в Internet Archive</a></p>` +
        (a.desc ? `<p class="desc">${esc(a.desc)}</p>` : '');
      markPlaying();
    }, () => { view.innerHTML = backBtn() + `<p class="err">Не удалось открыть запись.<button class="text-btn" data-retry>Повторить</button></p>`; });
  },

  'ia-artist'(name) {
    name = decodeURIComponent(name || '');
    view.innerHTML = backBtn() + `<h1 class="page-title">${esc(name)}</h1><p class="page-sub">Записи в Internet Archive</p>` +
      lazy(cached('ia-creator2:' + name, () => archive.byCreator(name)), (l) => l.length ? `<div class="grid">${l.map(card).join('')}</div>` : '<div class="empty"><b>Ничего не нашлось</b></div>', skGrid());
  },

  radio() {
    const sel = store.get('radioSel', { country: 'RU', tag: '' });
    const saved = lib.stations;
    const sk = reg(saved);
    const countries = [...new Set([sel.country, ...RADIO_COUNTRIES])].filter((c) => c !== undefined);
    view.innerHTML = `<h1 class="page-title">Радио</h1>` +
      (saved.length ? section('Мои станции', shelf(saved.map((t, i) => playCard(t, sk, i)).join(''), 'small')) : '') +
      `<section class="section"><div class="sec-head"><h2>Станции</h2><a href="#countries">Все страны${I.chev}</a></div>
      <div class="seg">${['', ...countries].map((c) => `<button class="${sel.country === c ? 'on' : ''}" data-country="${c}">${c ? esc(countryName(c)) : 'Весь мир'}</button>`).join('')}</div>
      <div class="seg">${RADIO_TAGS.map(([t, n]) => `<button class="${sel.tag === t ? 'on' : ''}" data-tag="${t}">${n}</button>`).join('')}</div>
      ${lazy(cached(`radio:${sel.country}|${sel.tag}`, () => radio.search({ country: sel.country, tag: sel.tag, limit: 80 })), (l) => l.length ? rows(l) : '<div class="empty"><b>Станций не нашлось</b>Выберите другой жанр или страну.</div>', skRows(8))}</section>
      <p class="note">Каталог Radio Browser: около 50 000 станций. Некоторые станции вещают по старому протоколу и в браузере могут не открыться.</p>`;
    $$('[data-country]', view).forEach((b) => b.onclick = () => { sel.country = b.dataset.country; store.set('radioSel', sel); views.radio(); });
    $$('[data-tag]', view).forEach((b) => b.onclick = () => { sel.tag = b.dataset.tag; store.set('radioSel', sel); views.radio(); });
  },

  countries() {
    view.innerHTML = backBtn('#radio') + `<h1 class="page-title">Радио мира</h1>` +
      lazy(cached('radio-countries', () => radio.countries()), (l) => `<ul class="menu">${l.map((c) => `<li><a href="#country/${c.code}" style="color:var(--fg)"><span>${esc(c.name)}</span><span class="cnt">${c.count}</span>${I.chev.replace('<svg', '<svg class="chev"')}</a></li>`).join('')}</ul>`, skRows(12));
  },

  country(code) {
    code = (code || '').toUpperCase();
    view.innerHTML = backBtn('#countries') + `<h1 class="page-title">${esc(countryName(code))}</h1>` +
      lazy(cached(`radio:${code}|`, () => radio.search({ country: code, limit: 120 })), (l) => l.length ? rows(l) : '<div class="empty"><b>Станций не нашлось</b></div>', skRows(10));
  },

  async library(arg) {
    if (arg === 'liked') {
      const l = lib.liked;
      const k = reg(l);
      view.innerHTML = backBtn('#library') + `<h1 class="page-title">Избранное</h1>` +
        (l.length ? playActions(k) + rows(l, { key: k }) : `<div class="empty"><b>Пока пусто</b>Нажмите на сердечко в плеере, чтобы сохранить трек здесь.</div>`);
      return;
    }
    if (arg === 'artists') {
      const l = lib.artists;
      view.innerHTML = backBtn('#library') + `<h1 class="page-title">Артисты</h1>` +
        (l.length ? `<div class="grid">${l.map((a) => card({ kind: 'artist', id: a.id, name: a.name, avatar: a.avatar })).join('')}</div>` : `<div class="empty"><b>Нет артистов</b>Откройте страницу артиста и нажмите «Подписаться».<br><a class="btn slim" href="#browse">Перейти в обзор</a></div>`);
      return;
    }
    if (arg === 'stations') {
      const l = lib.stations;
      view.innerHTML = backBtn('#library') + `<h1 class="page-title">Мои станции</h1>` +
        (l.length ? rows(l) : `<div class="empty"><b>Нет сохранённых станций</b>Сохраняйте станции через «…» или сердечко в плеере.<br><a class="btn slim" href="#radio">Открыть радио</a></div>`);
      return;
    }
    if (arg === 'files') { location.replace('#mine'); return; }
    const chev = I.chev.replace('<svg', '<svg class="chev"');
    view.innerHTML = `<h1 class="page-title">Медиатека</h1>
      <ul class="menu">
        <li><a href="#library/liked">${I.heartOn}<span>Избранное</span><span class="cnt">${lib.liked.length || ''}</span>${chev}</a></li>
        <li><a href="#library/artists">${I.person}<span>Артисты</span><span class="cnt">${lib.artists.length || ''}</span>${chev}</a></li>
        <li><a href="#library/stations">${I.radio}<span>Мои станции</span><span class="cnt">${lib.stations.length || ''}</span>${chev}</a></li>
        <li><a href="#mine">${I.folder}<span>Моя музыка</span>${chev}</a></li>
        <li><a href="#settings">${I.gear}<span>Источники</span>${chev}</a></li>
      </ul>` +
      section('Плейлисты', `<div class="grid"><button class="card" id="newPl"><div class="art"><div class="ph" style="color:var(--accent)">${I.plus}</div></div><span class="t1">Новый плейлист</span><span class="t2">&nbsp;</span></button>${lib.playlists.map(playlistCard).join('')}</div>`) +
      (lib.recent.length ? section('Недавно играло', rows(lib.recent.slice(0, 20))) : '');
    $('#newPl').onclick = () => playlistForm();
  },

  async mine() {
    const tab = store.get('mineTab', 'artists');
    view.innerHTML = backBtn('#library') + `<h1 class="page-title">Моя музыка</h1>` + skRows(4);
    const tracks = await files.tracks();
    if (location.hash !== '#mine') return;
    const groups = groupMine(tracks);
    const albums = groups.flatMap((g) => [...g.albums.values()]);
    const k = reg(tracks);
    let body = '';
    if (!tracks.length) body = `<div class="empty"><b>Добавьте свою музыку</b>Выберите папку с музыкой: приложение само разложит треки по артистам и альбомам, возьмёт названия и обложки из файлов. Музыка хранится только на этом устройстве.</div>`;
    else if (tab === 'artists') body = `<div class="grid">${groups.map(folderCard).join('')}</div>`;
    else if (tab === 'albums') body = `<div class="grid">${albums.map(mineAlbumCard).join('')}</div>`;
    else body = `<div data-files>${rows(tracks, { key: k })}</div>`;
    view.innerHTML = backBtn('#library') + `<h1 class="page-title">Моя музыка</h1>
      <p class="page-sub">${tracksWord(tracks.length)}${groups.length ? ` · ${groups.length} ${plural(groups.length, 'артист', 'артиста', 'артистов')}` : ''}</p>
      <div class="actions"><button class="btn solid" id="addFolder">${I.folder}Папка</button><button class="btn" id="addFiles">${I.plus}Файлы</button></div>
      ${tracks.length ? `<div class="seg">${[['artists', 'Артисты'], ['albums', 'Альбомы'], ['tracks', 'Треки']].map(([v, n]) => `<button class="${v === tab ? 'on' : ''}" data-mtab="${v}">${n}</button>`).join('')}<button data-shuffle="${k}">${I.shuffle.replace('<svg', '<svg width="15" height="15" style="vertical-align:-2px;margin-right:4px"')}Перемешать всё</button></div>` : ''}
      <div style="margin-top:14px">${body}</div>`;
    $('#addFolder').onclick = () => $('#folderPick').click();
    $('#addFiles').onclick = () => $('#filePick').click();
    $$('[data-mtab]', view).forEach((b) => b.onclick = () => { store.set('mineTab', b.dataset.mtab); views.mine(); });
  },

  async 'mine-artist'(name) {
    name = decodeURIComponent(name || '');
    view.innerHTML = backBtn('#mine') + skRows(4);
    const g = groupMine(await files.tracks()).find((x) => x.name === name);
    if (!g) { view.innerHTML = backBtn('#mine') + '<div class="empty"><b>Папка пуста</b></div>'; return; }
    const albums = [...g.albums.values()];
    const all = albums.flatMap((a) => a.tracks);
    const k = reg(all);
    view.innerHTML = backBtn('#mine') + `<h1 class="page-title">${esc(g.name)}</h1><p class="page-sub">${albums.length} ${plural(albums.length, 'альбом', 'альбома', 'альбомов')} · ${tracksWord(all.length)}</p>` +
      playActions(k) +
      (albums.length > 1 || albums[0].title !== 'Без альбома' ? section('Альбомы', shelf(albums.map(mineAlbumCard).join(''))) : '') +
      section('Все треки', `<div data-files>${rows(all, { key: k })}</div>`);
  },

  async 'mine-album'(arg) {
    const [artist, title] = arg.split('/').map(decodeURIComponent);
    view.innerHTML = backBtn() + skRows(4);
    const g = groupMine(await files.tracks()).find((x) => x.name === artist);
    const a = g && g.albums.get(title);
    if (!a) { view.innerHTML = backBtn('#mine') + '<div class="empty"><b>Альбом не найден</b></div>'; return; }
    const k = reg(a.tracks);
    view.innerHTML = backBtn() + `<div class="hero"><div class="art">${img(a.art)}</div><div><h1>${esc(a.title)}</h1><a class="by" href="#mine-artist/${encodeURIComponent(a.artist)}">${esc(a.artist)}</a><div class="info">Моя музыка</div></div></div>` +
      playActions(k) + `<div data-files>${rows(a.tracks, { key: k, numbered: true, n: (t, i) => t.n || i + 1, sub: (t) => t.artist !== a.artist ? esc(t.artist) : '' })}</div>` +
      `<p class="foot">${tracksWord(a.tracks.length)}</p>`;
  },

  underground() {
    const lists = [['rage', 'Рейдж'], ['plugg', 'Плагг'], ['underground rap', 'Андеграунд'], ['phonk', 'Фонк'], ['drill', 'Дрилл'], ['emo rap', 'Эмо-рэп']];
    let h = backBtn('#browse') + `<h1 class="page-title">Андеграунд-рэп</h1><p class="page-sub">Независимые рэперы, которые сами выкладывают свою музыку</p>
      <ul class="menu"><li><a href="#rappers">${I.folder}<span>Все рэперы: папки A–Z</span>${I.chev.replace('<svg', '<svg class="chev"')}</a></li></ul>`;
    h += lazy(cached('au-genre:Hip-Hop/Rap:week', () => audius.trending({ genre: 'Hip-Hop/Rap', time: 'week', limit: 60 })), (l) => { const k = reg(l); return playActions(k) + section('Хип-хоп: хиты недели', rows(l.slice(0, 10), { key: k, showDur: true }), '#genre/' + encodeURIComponent('Hip-Hop/Rap')) + section('Рэперы недели', shelf(artistsOf(l, 14).map(card).join(''), 'small')); }, skRows(6));
    h += section('Трэп', lazy(cached('au-genre:Trap:week', () => audius.trending({ genre: 'Trap', time: 'week', limit: 60 })), (l) => rowShelf(l.slice(0, 16)), skRows(4)), '#genre/Trap');
    for (const [q, n] of lists) h += section(n, lazy(cached('au-pl:' + q, () => audius.search('playlists', q, 16)), (l) => l.length ? shelf(l.map(card).join('')) : '<p class="note">Пока пусто</p>'));
    view.innerHTML = h;
  },

  rappers() {
    view.innerHTML = backBtn('#browse') + `<h1 class="page-title">Рэперы</h1>
      <div class="search-bar"><label class="field">${I.search}<input id="rq" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Найти рэпера"></label></div>
      <div id="rapList">${skRows(10)}</div>`;
    whenReady(rapIndex(), (list) => {
      const out = $('#rapList');
      if (!out) return;
      let drawJob = 0;
      const draw = (q) => {
        drawJob++;
        const l = q ? matchArtists(list, q) : (sortedRappers ||= list.slice().sort((a, b) => ruCollator.compare(a.name, b.name)));
        if (!l.length) { out.innerHTML = '<div class="empty"><b>Не нашлось</b>Попробуйте общий поиск: там больше артистов.</div>'; return; }
        if (q) { out.innerHTML = `<ul class="list">${l.map(folderRow).join('')}</ul>`; return; }
        const groups = new Map();
        for (const a of l) { const ch = (a.name.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')[0] || '#').toUpperCase(); const k = /[A-ZА-ЯЁ]/.test(ch) ? ch : '#'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
        const parts = [...groups].sort((x, y) => (x[0] === '#') - (y[0] === '#') || (/[A-Z]/.test(y[0]) - /[A-Z]/.test(x[0])) || x[0].localeCompare(y[0])).map(([k, g]) => `<section class="section" style="margin-top:18px"><div class="sec-head"><h2>${esc(k)}</h2></div><ul class="list">${g.map(folderRow).join('')}</ul></section>`);
        out.innerHTML = `<p class="page-sub">${list.length} ${plural(list.length, 'папка', 'папки', 'папок')}</p>` + parts.slice(0, 3).join('');
        /* the rest of the alphabet is added in small steps so the first screen shows at once */
        const job = ++drawJob;
        let i = 3;
        const more = () => { if (job !== drawJob || !out.isConnected || i >= parts.length) return; out.insertAdjacentHTML('beforeend', parts.slice(i, i + 3).join('')); i += 3; setTimeout(more, 16); };
        setTimeout(more, 60);
      };
      draw('');
      $('#rq').addEventListener('input', debounce((e) => draw(e.target.value.trim()), 150));
    }, () => { const out = $('#rapList'); if (out) out.innerHTML = `<p class="err">Не удалось загрузить.<button class="text-btn" data-retry>Повторить</button></p>`; });
  },

  dz(id) {
    view.innerHTML = `<div class="artist-head"><a class="back" href="#" data-back>${I.back}</a></div>` + skRows(5);
    whenReady(cached('dz-artist:' + id, () => deezer.artistPage(id), 12 * 3600e3), (a) => {
      if (location.hash !== '#dz/' + id) return;
      const k = reg(a.top);
      let h = `<div class="artist-head"><img class="cover" src="${esc(a.avatarBig || a.avatar)}" alt="" referrerpolicy="no-referrer"><a class="back" href="#" data-back>${I.back}</a>
        <div class="who"><div><h1>${esc(a.name)}</h1><p>${a.fans ? fmtCount(a.fans) + ' поклонников · ' : ''}официальный каталог</p></div></div></div>`;
      h += a.top.length ? `<div class="actions"><button class="btn solid" data-play="${k}" data-i="0">${I.play}Слушать</button><button class="btn" data-shuffle="${k}">${I.shuffle}Перемешать</button></div>` : '';
      if (a.top.length) h += section('Популярные треки', rows(a.top.slice(0, 10), { key: k }));
      if (a.albums.length) h += section('Альбомы', shelf(a.albums.map(card).join('')));
      if (a.singles.length) h += section('Синглы и EP', shelf(a.singles.map(card).join('')));
      if (a.related.length) h += section('Похожие артисты', shelf(a.related.map(card).join(''), 'small'));
      view.innerHTML = h;
      markPlaying();
    }, () => { view.innerHTML = backBtn() + `<p class="err">Не удалось открыть артиста.<button class="text-btn" data-retry>Повторить</button></p>`; });
  },

  dza(id) {
    view.innerHTML = backBtn() + `<div class="hero"><div class="art sk"></div></div>` + skRows(6);
    whenReady(cached('dz-album:' + id, () => deezer.albumPage(id), 12 * 3600e3), (a) => {
      if (location.hash !== '#dza/' + id) return;
      const k = reg(a.tracks);
      view.innerHTML = backBtn() + `<div class="hero"><div class="art">${img(a.artBig || a.art)}</div><div>
        <h1>${esc(a.title)}</h1><a class="by" href="#dz/${a.dzArtist}">${esc(a.artist)}</a>
        <div class="info">${[{ album: 'Альбом', single: 'Сингл', ep: 'EP', compile: 'Сборник' }[a.type] || 'Альбом', a.year].filter(Boolean).join(' · ')}</div></div></div>` +
        (a.tracks.length ? `<div class="actions"><button class="btn solid" data-play="${k}" data-i="0">${I.play}Слушать</button><button class="btn" data-shuffle="${k}">${I.shuffle}Перемешать</button></div>` + rows(a.tracks, { key: k, numbered: true, sub: () => '' }) : '<div class="empty"><b>Превью недоступны</b></div>') +
        `<p class="foot">${tracksWord(a.tracks.length)}${a.total ? ', ' + fmtLong(a.total) : ''}${a.label ? '<br>' + esc(a.label) : ''}<br>Официальные превью по 30 секунд, данные Deezer</p>`;
      markPlaying();
    }, () => { view.innerHTML = backBtn() + `<p class="err">Не удалось открыть альбом.<button class="text-btn" data-retry>Повторить</button></p>`; });
  },

  playlist(id) {
    const p = lib.playlists.find((x) => x.id === id);
    if (!p) { view.innerHTML = backBtn('#library') + `<div class="empty"><b>Плейлист не найден</b></div>`; return; }
    const k = reg(p.tracks);
    const total = p.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    view.innerHTML = backBtn('#library') + `<div class="hero"><div class="art">${mosaic(p.tracks)}</div><div><h1>${esc(p.name)}</h1><div class="info">Мой плейлист</div></div></div>` +
      (p.tracks.length ? playActions(k) : '') +
      `<div data-playlist="${esc(p.id)}">${p.tracks.length ? rows(p.tracks, { key: k, showDur: true }) : `<div class="empty"><b>Плейлист пуст</b>Добавляйте треки через «…» → «Добавить в плейлист».</div>`}</div>` +
      `<p class="foot">${tracksWord(p.tracks.length)}${total ? ', ' + fmtLong(total) : ''}</p>
      <div class="actions"><button class="btn" id="plRename">${I.edit}Переименовать</button><button class="btn" id="plDelete" style="color:#e5383b">${I.trash}Удалить</button></div>`;
    $('#plRename').onclick = () => playlistForm(null, p);
    $('#plDelete').onclick = () => openSheet(`<h3>Удалить «${esc(p.name)}»?</h3>`, acts([{ label: 'Удалить плейлист', icon: I.trash, danger: true, fn: () => { lib.playlists = lib.playlists.filter((x) => x.id !== p.id); lib.save('playlists'); go('#library'); } }]));
  },

  search() {
    const q0 = (() => { try { return sessionStorage.getItem('nota:q') || ''; } catch { return ''; } })();
    const tab0 = store.get('searchTab', 'all');
    view.innerHTML = `<h1 class="page-title">Поиск</h1>
      <div class="search-bar"><label class="field">${I.search}<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Артисты, треки, альбомы, радио" value="${esc(q0)}"><button class="clear" id="qClear" aria-label="Очистить" ${q0 ? '' : 'hidden'}>${I.x}</button></label></div>
      <div class="seg" id="sTabs">${[['all', 'Всё'], ['artists', 'Артисты'], ['tracks', 'Треки'], ['albums', 'Альбомы'], ['radio', 'Радио']].map(([v, n]) => `<button data-stab="${v}" class="${v === tab0 ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="results"></div>`;
    const input = $('#q');
    const run = debounce(() => doSearch(input.value.trim()), 280);
    input.addEventListener('input', () => { $('#qClear').hidden = !input.value; run(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); doSearch(input.value.trim(), true); } });
    $('#qClear').onclick = (e) => { e.preventDefault(); input.value = ''; $('#qClear').hidden = true; doSearch(''); input.focus(); };
    $$('[data-stab]').forEach((b) => b.onclick = () => { store.set('searchTab', b.dataset.stab); $$('[data-stab]').forEach((x) => x.classList.toggle('on', x === b)); doSearch(input.value.trim()); });
    doSearch(q0);
  },

  settings() {
    view.innerHTML = backBtn('#library') + `<h1 class="page-title">Источники</h1><p class="page-sub">Только бесплатная и легальная музыка</p>
      <div class="group"><h3>Audius</h3><p class="note">Миллионы треков независимых артистов со всего мира: страницы артистов, альбомы, чарты по жанрам.</p><span class="state"><i></i>Подключено</span></div>
      <div class="group"><h3>Оформление</h3><div class="skins">${[['muse', 'Muse'], ['noir', 'Ночь'], ['classic', 'Классика'], ['aurora', 'Аврора']].map(([k, n]) => `<button class="skin${document.documentElement.dataset.skin === k ? ' on' : ''}" data-skin="${k}"><i></i>${n}</button>`).join('')}</div></div>
      <div class="group"><h3>Deezer</h3><p class="note">Страницы известных артистов, альбомы, чарты и официальные превью по 30 секунд.</p><span class="state"><i></i>Подключено</span></div>
      <div class="group"><h3>LRCLIB</h3><p class="note">Синхронные тексты песен.</p><span class="state"><i></i>Подключено</span></div>
      <div class="group"><h3>Internet Archive</h3><p class="note">Независимые лейблы, живые концерты, старые пластинки.</p><span class="state"><i></i>Подключено</span></div>
      <div class="group"><h3>Radio Browser</h3><p class="note">Около 50 000 интернет-радиостанций из 200 стран.</p><span class="state"><i></i>Подключено</span></div>
      <form class="group" id="jmForm"><h3>Jamendo</h3>
        <p class="note">Ещё около 600 000 треков. Нужен бесплатный ключ: зарегистрируйтесь на <a class="text-btn" href="https://devportal.jamendo.com/" target="_blank" rel="noopener">devportal.jamendo.com</a>, создайте приложение и вставьте его Client ID.</p>
        <input class="text" id="jmKey" placeholder="Client ID" autocomplete="off" value="${esc(lib.settings.jamendo)}">
        <button class="btn solid" type="submit">Сохранить</button></form>
      <div class="group"><h3>Скрытое</h3><p class="note">Альбомы: ${lib.hidden.albums.length}, треки: ${lib.hidden.tracks.length}. Скрытое не показывается нигде в приложении.</p><button class="btn" id="unhide">Показать всё скрытое</button></div>
      <div class="group"><h3>Данные</h3><p class="note">Избранное, плейлисты и файлы хранятся только в этом браузере.</p><button class="btn" id="wipe">Очистить историю</button></div>`;
    view.insertAdjacentHTML('beforeend', `<p class="note" style="margin:22px 0 0;text-align:center">Note · версия ${APP_VERSION}</p>`);
    $$('[data-skin]', view).forEach((b) => b.onclick = () => { setSkin(b.dataset.skin); $$('[data-skin]', view).forEach((x) => x.classList.toggle('on', x === b)); });
    $('#jmForm').onsubmit = async (e) => {
      e.preventDefault();
      const key = $('#jmKey').value.trim();
      lib.settings.jamendo = key; lib.save('settings');
      if (!key) return toast('Jamendo отключён');
      try { await jamendo.tracks({ limit: 1 }); toast('Jamendo подключён'); } catch { toast('Ключ не подошёл'); }
    };
    $('#unhide').onclick = () => { lib.hidden = { albums: [], tracks: [], artists: [], seeded: true }; lib.save('hidden'); toast('Скрытое снова видно'); route(); };
    $('#wipe').onclick = () => { lib.recent = []; lib.searches = []; lib.save('recent'); lib.save('searches'); toast('История очищена'); };
  },
};

/* app look: Ночь (dark), Классика (light), Аврора (violet glow) */
function setSkin(k) {
  document.documentElement.dataset.skin = k;
  store.set('skin', k);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = { muse: '#000000', noir: '#050506', classic: '#ffffff', aurora: '#0a0714' }[k] || '#000000';
}
function mosaic(tracks) {
  const arts = [...new Set(tracks.map((t) => t.art).filter(Boolean))].slice(0, 4);
  if (arts.length < 4) return img(arts[0]);
  return `<div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr">${arts.map((a) => `<img src="${esc(a)}" alt="" style="position:static;width:100%;height:100%;object-fit:cover" referrerpolicy="no-referrer">`).join('')}</div>`;
}
function folderCard(g) {
  const arts = [...g.albums.values()].map((a) => a.art).filter(Boolean).slice(0, 4);
  const pic = arts.length >= 4 ? `<div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr">${arts.map((a) => `<img src="${a}" alt="" style="position:static;width:100%;height:100%;object-fit:cover">`).join('')}</div>` : arts[0] ? `<img src="${arts[0]}" alt="">` : `<div class="ph">${I.folder}</div>`;
  return `<a class="card" href="#mine-artist/${encodeURIComponent(g.name)}"><div class="art">${pic}</div><span class="t1">${esc(g.name)}</span><span class="t2">${g.albums.size} ${plural(g.albums.size, 'альбом', 'альбома', 'альбомов')} · ${tracksWord(g.tracks.length)}</span></a>`;
}
function mineAlbumCard(a) {
  return `<a class="card" href="#mine-album/${encodeURIComponent(a.artist)}/${encodeURIComponent(a.title)}"><div class="art">${img(a.art)}</div><span class="t1">${esc(a.title)}</span><span class="t2">${esc(a.artist)}</span></a>`;
}
function playlistCard(p) {
  return `<a class="card" href="#playlist/${p.id}"><div class="art">${mosaic(p.tracks)}</div><span class="t1">${esc(p.name)}</span><span class="t2">${tracksWord(p.tracks.length)}</span></a>`;
}
function fillTileArt() {
  $$('[data-genre-art]').forEach((el) => {
    const g = el.dataset.genreArt;
    cached('au-tile:' + g, () => slow(() => audius.trending({ genre: g, time: 'week', limit: 3 })), 24 * 3600e3).then((l) => {
      const t = l.find((x) => x.art);
      if (t && el.isConnected) el.insertAdjacentHTML('afterbegin', `<img src="${esc(t.art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="noteImgErr(this)">`);
    }).catch(() => {});
  });
  $$('[data-archive-art]').forEach((el) => {
    const s = ARCHIVE_SETS.find((x) => x[0] === el.dataset.archiveArt);
    cached('ia2:' + s[0], () => archive.search(s[2], { rows: 20 })).then((l) => {
      if (l[0] && el.isConnected) el.insertAdjacentHTML('afterbegin', `<img src="${esc(l[0].art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`);
    }).catch(() => {});
  });
}

let searchSeq = 0;
document.addEventListener('click', (e) => { if (e.target.closest('#results .hit, #results .card, #results .top-hit, #results [data-play]')) { const q = ($('#q') || {}).value; if (q && q.trim()) lib.pushSearch(q.trim()); } }, true);
async function doSearch(q, commit) {
  try { sessionStorage.setItem('nota:q', q); } catch {}
  const out = $('#results');
  if (!out) return;
  const seq = ++searchSeq;
  const tab = store.get('searchTab', 'all');
  $('#sTabs').hidden = !q;
  if (!q) {
    out.innerHTML = (lib.searches.length ? section('Недавние запросы', `<ul class="menu">${lib.searches.map((s) => `<li><button data-recent="${esc(s)}" style="color:var(--fg)">${I.search}<span>${esc(s)}</span></button></li>`).join('')}</ul>`) : '') +
      section('Жанры', `<div class="tiles">${GENRES.slice(0, 12).map(([g, n]) => `<a class="tile" href="#genre/${encodeURIComponent(g)}" data-genre-art="${esc(g)}"><span>${esc(n)}</span></a>`).join('')}</div>`);
    $$('[data-recent]', out).forEach((b) => b.onclick = () => { $('#q').value = b.dataset.recent; $('#qClear').hidden = false; doSearch(b.dataset.recent, true); });
    fillTileArt();
    return;
  }
  if (commit) lib.pushSearch(q);
  const all = tab === 'all';
  const n = norm(q);
  /* starts with the query > contains it > anything else; popularity decides inside each group */
  const score = (name) => { const v = norm(name); return v.startsWith(n) ? 1 : v.includes(n) ? 2 : 3; };
  const byMatch = (l, key, pop) => l.slice().sort((x, y) => score(x[key]) - score(y[key]) || (y[pop] || 0) - (x[pop] || 0));
  const grid = (l) => all ? shelf(l.map(card).join('')) : `<div class="grid">${l.map(card).join('')}</div>`;
  /* each tab asks only for what it shows; the size of the answer is part of the cache key */
  const lim = (x, y) => (all ? x : y);
  const want = (...tabs) => all || tabs.includes(tab);
  const dzArtists = want('artists') ? cached(`s-dza:${lim(10, 30)}:` + q, () => deezer.searchArtists(q, lim(10, 30)), 12 * 3600e3) : null;
  const dzTracks = want('tracks') ? cached(`s-dzt:${lim(10, 40)}:` + q, () => deezer.searchTracks(q, lim(10, 40)), 12 * 3600e3) : null;
  const auUsers = want('artists') ? cached('s-u:' + q, () => slow(() => audius.search('users', q, 30))) : null;
  const auTracks = want('tracks') ? cached(`s-t:${lim(20, 60)}:` + q, () => slow(() => audius.search('tracks', q, lim(20, 60)))) : null;
  const waits = [];
  const track = (p) => { if (p) waits.push(p); return p; };
  [dzArtists, dzTracks, auUsers, auTracks].forEach(track);
  let h = '';
  if (all || tab === 'artists') {
    const mine = matchArtists(groupMine(await files.tracks()), q);
    if (seq !== searchSeq) return;
    if (mine.length) h += section('Мои папки', `<ul class="list">${mine.slice(0, all ? 4 : 50).map((g) => `<li class="row"><a class="hit" href="#mine-artist/${encodeURIComponent(g.name)}"><span class="thumb">${[...g.albums.values()].find((x) => x.art) ? `<img src="${[...g.albums.values()].find((x) => x.art).art}" alt="">` : `<div class="ph">${I.folder}</div>`}</span><span class="meta"><b>${esc(g.name)}</b><small>Моя музыка · ${tracksWord(g.tracks.length)}</small></span></a><span class="tail chev-tail"></span></li>`).join('')}</ul>`);
    h += lazy(mapP(dzArtists, (l) => byMatch(l, 'name', 'fans').filter((a) => score(a.name) < 3 || a.fans > 50000)), (l) => {
      if (!l.length) return '';
      const top = l[0];
      const best = all && score(top.name) <= 1 ? `<a class="top-hit" href="#dz/${top.id}"><span class="thumb round">${img(top.avatar, true, top.avatarBig, '96px')}</span><span><b>${esc(top.name)}</b><small>Артист · ${fmtCount(top.fans)} поклонников</small></span></a>` : '';
      const rest = (best ? l.slice(1) : l).filter((x) => x.fans >= 5000);
      return (best ? section('Лучший результат', best) : '') + (rest.length ? section('Артисты', all ? shelf(rest.map(card).join(''), 'small') : `<div class="grid">${rest.map(card).join('')}</div>`) : '');
    }, skShelf(4, 'small', true));
    h += lazy(track(mapP(rapIndex(), (l) => matchArtists(l, q))), (l) => l.length ? section('Папки рэперов', `<ul class="list">${l.slice(0, all ? 4 : 60).map(folderRow).join('')}</ul>`, all && l.length > 4 ? '#rappers' : '') : '', '');
  }
  if (all || tab === 'tracks') {
    h += lazy(dzTracks, (l) => l.length ? section('Треки · превью', rows(all ? l.slice(0, 5) : l)) : '', skRows(all ? 4 : 10));
    h += lazy(auTracks, (l) => l.length ? section('Полные треки независимых артистов', rows(all ? l.slice(0, 5) : l, { showDur: true })) : (all ? '' : ''), all ? '' : skRows(6));
    if (jamendo.on) h += lazy(track(cached('s-jm:' + q, () => jamendo.tracks({ search: q, order: 'relevance' }))), (l) => l.length ? section('Jamendo', rows(all ? l.slice(0, 5) : l, { showDur: true })) : '', '');
  }
  if (all || tab === 'albums') {
    h += lazy(track(cached('s-dzal:' + q, () => deezer.searchAlbums(q, 24), 12 * 3600e3)), (l) => l.length ? section('Альбомы', grid(l)) : '', all ? skShelf(4) : skGrid(4));
    h += lazy(track(cached('s-p:' + q, () => slow(() => audius.search('playlists', q, 24)))), (l) => l.length ? section('Плейлисты', grid(byMatch(l, 'title', 'count'))) : '', '');
    h += lazy(track(cached('s-ia2:' + q, () => archive.find(q, 30))), (l) => l.length ? section('Internet Archive', grid(l)) : '', '');
  }
  if (all || tab === 'artists') h += lazy(mapP(auUsers, (l) => byMatch(l, 'name', 'followers').filter((a) => score(a.name) < 3).slice(0, all ? 12 : 40)), (l) => l.length ? section('Независимые артисты', all ? shelf(l.map(card).join(''), 'small') : `<div class="grid">${l.map(card).join('')}</div>`) : '', '');
  if (all || tab === 'radio') h += lazy(track(cached('s-r:' + q, () => Promise.all([radio.search({ name: q, limit: 20 }), radio.search({ tag: q.toLowerCase(), limit: 20 })]).then(([a, b]) => { const s2 = new Set(); return [...a, ...b].filter((t) => !s2.has(t.id) && s2.add(t.id)); }))), (l) => l.length ? section('Радиостанции', rows(all ? l.slice(0, 4) : l)) : (all ? '' : '<div class="empty"><b>Станций не нашлось</b></div>'), all ? '' : skRows(8));
  if (seq !== searchSeq) return;
  out.innerHTML = h;
  out.querySelectorAll('.err').forEach((e) => e.remove());
  /* once every source has answered: one clear message instead of an empty page or a pile of errors */
  Promise.allSettled(waits).then((res) => {
    if (seq !== searchSeq || !out.isConnected) return;
    out.querySelectorAll('.err').forEach((e) => e.remove());
    if (out.querySelector('.row, .card, .top-hit')) return;
    out.innerHTML = res.length && res.every((r) => r.status === 'rejected')
      ? '<div class="empty"><b>Нет связи</b>Проверьте интернет и попробуйте ещё раз.<br><button class="btn slim" data-retry>Повторить</button></div>'
      : '<div class="empty"><b>Ничего не нашлось</b>Проверьте написание или попробуйте другой запрос.</div>';
  });
}

/* start loading a page's data the moment a finger touches its link */
function prefetch(h) {
  const [name, ...rest] = h.slice(1).split('/');
  const arg = rest.join('/');
  if (name === 'al') cached('au-al:' + arg, () => audius.album(arg)).catch(() => {});
  else if (name === 'artist') { cached('au-user:' + arg, () => audius.artist(arg)).catch(() => {}); cached('au-utracks:' + arg, () => audius.artistTracks(arg)).catch(() => {}); }
  else if (name === 'dz') cached('dz-artist:' + arg, () => deezer.artistPage(arg), 12 * 3600e3).catch(() => {});
  else if (name === 'dza') cached('dz-album:' + arg, () => deezer.albumPage(arg), 12 * 3600e3).catch(() => {});
  else if (name === 'album') { const id = decodeURIComponent(arg); cached('ia-album:' + id, () => archive.album(id)).catch(() => {}); }
}
document.addEventListener('pointerdown', (e) => { const a = e.target.closest('a[href^="#"]'); if (a) prefetch(a.getAttribute('href')); }, { passive: true });

/* scroll velocity: secondary text fades back while the list flies by */
let lastY = 0, lastT = 0, fastTimer;
window.addEventListener('scroll', () => {
  const now = performance.now(), v = Math.abs(scrollY - lastY) / Math.max(1, now - lastT);
  lastY = scrollY; lastT = now;
  if (v > 2.2) { document.body.classList.add('fast'); clearTimeout(fastTimer); fastTimer = setTimeout(() => document.body.classList.remove('fast'), 180); }
}, { passive: true });
/* desktop only: a soft glowing cursor dot and a background that follows the mouse a little */
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !navigator.maxTouchPoints && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  document.body.appendChild(dot);
  let mx = 0, my = 0, pending = false;
  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      document.documentElement.style.setProperty('--mx', (mx / innerWidth - 0.5).toFixed(3));
      document.documentElement.style.setProperty('--my', (my / innerHeight - 0.5).toFixed(3));
    });
  }, { passive: true });
  /* 3D tilt for the big card */
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.now-card');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -6}deg`);
    c.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`);
  }, { passive: true });
  document.addEventListener('pointerout', (e) => { const c = e.target.closest && e.target.closest('.now-card'); if (c) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); } });
}

/* compact title bar: appears once the big page title scrolls away */
let titleObs = null;
function watchTitle() {
  if (titleObs) titleObs.disconnect();
  document.body.classList.remove('scrolled');
  const pick = () => view.querySelector('.page-title, .artist-head h1, .hero h1');
  if (view.querySelector('.search-bar')) return;
  const attach = () => {
    const el = pick();
    if (!el || !('IntersectionObserver' in window)) return false;
    $('#topnavTitle').textContent = el.textContent;
    titleObs = new IntersectionObserver(([e]) => document.body.classList.toggle('scrolled', !e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-50px 0px 0px 0px' });
    titleObs.observe(el);
    return true;
  };
  if (!attach()) setTimeout(attach, 600);
}

/* ======================= router ======================= */
function route() {
  const h = location.hash.slice(1) || 'home';
  const [name, ...rest] = h.split('/');
  const arg = rest.join('/');
  const fn = views[name] || views.home;
  const tab = { dz: null, dza: null, rappers: 'browse', chart: 'browse', genre: 'browse', archive: 'browse', underground: 'browse', mine: 'library', 'mine-artist': 'library', 'mine-album': 'library', countries: 'radio', country: 'radio', playlist: 'library', settings: 'library', artist: null, al: null, album: null, 'ia-artist': null }[name];
  const active = tab === undefined ? (views[name] ? name : 'home') : tab;
  if (active !== null) $$('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === active));
  for (const k in ctx) if (k !== 'queue') delete ctx[k];
  fn(arg);
  window.scrollTo(0, 0);
  watchTitle();
  markPlaying();
}
window.addEventListener('hashchange', route);
/* when the screen settles, quietly load the first albums and artists it links to */
let idleTimer;
function prefetchVisible() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const links = [...new Set($$('#view a[href^="#al/"], #view a[href^="#artist/"], #view a[href^="#album/"], #view a[href^="#dz/"], #view a[href^="#dza/"]').map((a) => a.getAttribute('href')))].slice(0, 8);
    links.forEach((h, i) => setTimeout(() => prefetch(h), i * 250));
  }, 2500);
}
new MutationObserver(prefetchVisible).observe(view, { childList: true, subtree: true });

async function importPicked(e) {
  const list = [...e.target.files];
  e.target.value = '';
  if (!list.length) return;
  toast('Импорт музыки…');
  try { const n = await files.add(list); toast(n ? `Добавлено треков: ${n}` : 'Новых аудиофайлов не найдено'); } catch { toast('Не удалось сохранить: возможно, мало места'); }
  if (location.hash.startsWith('#mine')) route(); else go('#mine');
}
$('#filePick').addEventListener('change', importPicked);
$('#folderPick').addEventListener('change', importPicked);

/* ======================= boot ======================= */
/* first launch: a snapshot shipped with the app fills the screens at once; fresh data replaces it in the background */
async function seedCache() {
  if (disk.get('au-trend-week')) return;
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 2000);
    const seed = await (await fetch('seed.json', { signal: ctl.signal })).json();
    for (const [k, d] of Object.entries(seed.data || {})) if (!disk.get(k)) { try { localStorage.setItem('nota:c:' + k, JSON.stringify({ t: 0, d })); } catch {} }
  } catch {}
}
await seedCache();
P.clean();
route();
setLyricsOpen(lyr.open);
if (P.cur) renderNow(); else renderPlayState();
setTimeout(() => (window.requestIdleCallback || setTimeout)(() => rapIndex().catch(() => {})), 4000);
files.loadCovers().then(() => { if (P.cur && P.cur.src === 'local') renderNow(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const had = !!navigator.serviceWorker.controller;
  let reloaded = false;
  /* a new version is picked up without cutting off a song: reload only when nothing is playing */
  const reloadSoon = () => { if (reloaded) return; if (audio.paused) { reloaded = true; savePos(); location.reload(); } else audio.addEventListener('pause', reloadSoon, { once: true }); };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) reloadSoon(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    /* look for a new version every time the app comes back to the screen */
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
