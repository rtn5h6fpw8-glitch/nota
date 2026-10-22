'use strict';

/* ======================= helpers ======================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = (v) => (Array.isArray(v) ? v[0] : v) || '';
const fmt = (s) => {
  if (!isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
};
const parseLen = (v) => {
  if (v == null || v === '') return 0;
  if (String(v).includes(':')) return String(v).split(':').reduce((a, n) => a * 60 + (+n || 0), 0);
  return +v || 0;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

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

const memo = new Map();
function cached(key, fn) {
  if (!memo.has(key)) memo.set(key, fn().catch((e) => { memo.delete(key); throw e; }));
  return memo.get(key);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function hue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function placeholder(title) {
  const h = hue(title);
  const letter = esc((String(title).trim()[0] || '♪').toUpperCase());
  return `<div class="ph" style="background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 50) % 360} 65% 38%))">${letter}</div>`;
}
function artHTML(src, title) {
  return placeholder(title) + (src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '');
}

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15c0 .8.9 1.3 1.6.8l11.5-7.5c.6-.4.6-1.3 0-1.7L8.6 3.7C7.9 3.2 7 3.7 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4.2" height="16" rx="1.2"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.2"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5 3.9 12.6A5 5 0 0 1 12 6.3a5 5 0 0 1 8.1 6.3zm0-2.8 6.6-6.5A3 3 0 0 0 13.5 8L12 9.6 10.5 8a3 3 0 0 0-5.1 3.2z"/></svg>',
  heartOn: '<svg viewBox="0 0 24 24"><path d="M12 20.5 3.9 12.6A5 5 0 0 1 12 6.3a5 5 0 0 1 8.1 6.3z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4V8h-2.6l-7 8H4v-2h2.6l7-8H17zm0 10l4 4-4 4v-3h-3.4l-2.3-2.6 1.3-1.5 1.9 2.1H17zM4 6h3.4l2.3 2.6-1.3 1.5L6.6 8H4z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M4 7h11v2H4zm0 4h11v2H4zm0 4h7v2H4zm13-2 5 3-5 3z"/></svg>',
  queue: '<svg viewBox="0 0 24 24"><path d="M4 6h14v2H4zm0 5h14v2H4zm0 5h9v2H4zm13 0v-3h2v3h3v2h-3v3h-2v-3h-3v-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M3 5h12v2H3zm0 4h12v2H3zm0 4h8v2H3zm14-8h4v2h-2v9.5a2.5 2.5 0 1 1-2-2.45z"/></svg>',
  album: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6.3 6.3a8 8 0 0 0 0 11.4l1.4-1.4a6 6 0 0 1 0-8.6zm11.4 0-1.4 1.4a6 6 0 0 1 0 8.6l1.4 1.4a8 8 0 0 0 0-11.4z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 2h8l5 5v15H6zm7 1.5V8h4.5zM10 12v5.3a2 2 0 1 0 1.5 1.9V14h3v-2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M10.3 2h3.4l.5 2.6 1.7.9 2.4-1.2 2.4 2.4-1.2 2.4.9 1.7 2.6.5v3.4l-2.6.5-.9 1.7 1.2 2.4-2.4 2.4-2.4-1.2-1.7.9-.5 2.6h-3.4l-.5-2.6-1.7-.9-2.4 1.2-2.4-2.4 1.2-2.4-.9-1.7L2 13.7v-3.4l2.6-.5.9-1.7-1.2-2.4 2.4-2.4 2.4 1.2 1.7-.9zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 4.6 14 3.2 5.2 12l8.8 8.8 1.4-1.4L8 12z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>',
  yt: '<svg viewBox="0 0 24 24"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.6 1.6 2.8 2.8z"/></svg>',
};

/* ======================= library state ======================= */
const lib = {
  liked: store.get('liked', []),
  playlists: store.get('playlists', []),
  recent: store.get('recent', []),
  stations: store.get('stations', []),
  settings: store.get('settings', { jamendo: '' }),
  save(k) { store.set(k, this[k]); },
  isLiked(id) { return this.liked.some((t) => t.id === id); },
  toggleLike(t) {
    if (this.isLiked(t.id)) { this.liked = this.liked.filter((x) => x.id !== t.id); toast('Убрано из избранного'); }
    else { this.liked.unshift(slim(t)); toast('Добавлено в избранное'); }
    this.save('liked'); refreshLikes();
  },
  isSaved(id) { return this.stations.some((s) => s.id === id); },
  toggleStation(t) {
    if (this.isSaved(t.id)) { this.stations = this.stations.filter((x) => x.id !== t.id); toast('Станция удалена'); }
    else { this.stations.unshift(slim(t)); toast('Станция сохранена'); }
    this.save('stations');
  },
  pushRecent(t) {
    this.recent = [slim(t), ...this.recent.filter((x) => x.id !== t.id)].slice(0, 40);
    this.save('recent');
  },
};
function slim(t) {
  const { id, src, title, artist, album, albumId, art, url, duration, live, ytId, localKey } = t;
  return { id, src, title, artist, album, albumId, art, url, duration, live, ytId, localKey };
}

/* ---------- local files (IndexedDB) ---------- */
const files = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open('nota', 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'key' });
      req.onsuccess = () => { this.db = req.result; res(this.db); };
      req.onerror = () => rej(req.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const r = fn(t.objectStore('files'));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  },
  all() { return this.tx('readonly', (s) => s.getAll()); },
  get(key) { return this.tx('readonly', (s) => s.get(key)); },
  put(rec) { return this.tx('readwrite', (s) => s.put(rec)); },
  del(key) { return this.tx('readwrite', (s) => s.delete(key)); },
  toTrack(r) {
    return { id: 'local:' + r.key, src: 'local', title: r.title, artist: r.artist || 'Мои файлы', album: 'Мои файлы', art: '', localKey: r.key, duration: r.duration || 0 };
  },
  async add(list) {
    let n = 0;
    for (const f of list) {
      if (!f.type.startsWith('audio') && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(f.name)) continue;
      const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
      const parts = base.split(/\s+[-–—]\s+/);
      const rec = { key: uid(), name: f.name, title: parts.length > 1 ? parts.slice(1).join(' - ') : base, artist: parts.length > 1 ? parts[0] : '', blob: f, added: Date.now() };
      await this.put(rec); n++;
    }
    return n;
  },
};

/* ======================= sources ======================= */
const MUSIC_COLLECTIONS = 'collection:(etree OR audio_music OR 78rpm OR netlabels OR georgeblood OR opensource_audio)';
const archive = {
  async search(q, { rows = 30, sort = 'downloads desc' } = {}) {
    const p = new URLSearchParams({ q, rows, output: 'json' });
    ['identifier', 'title', 'creator', 'year'].forEach((f) => p.append('fl[]', f));
    if (sort) p.append('sort[]', sort);
    const d = await getJSON('https://archive.org/advancedsearch.php?' + p);
    return d.response.docs.map((x) => ({
      kind: 'album', id: x.identifier, title: first(x.title) || x.identifier, artist: first(x.creator), year: first(x.year),
      art: `https://archive.org/services/img/${encodeURIComponent(x.identifier)}`,
    }));
  },
  find(text, rows) {
    const clean = text.replace(/[()":\[\]{}^~*?\\/]/g, ' ').trim();
    return this.search(`(${clean}) AND mediatype:audio AND ${MUSIC_COLLECTIONS}`, { rows });
  },
  async album(id) {
    const d = await getJSON('https://archive.org/metadata/' + encodeURIComponent(id), 20000);
    if (!d || !d.metadata) throw new Error('not found');
    const m = d.metadata;
    const order = ['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', 'Ogg Vorbis'];
    const fmtOk = order.find((f) => d.files.some((x) => x.format === f));
    const art = `https://archive.org/services/img/${encodeURIComponent(id)}`;
    const albumTitle = first(m.title) || id;
    const albumArtist = first(m.creator) || first(m.artist) || 'Internet Archive';
    const tracks = (fmtOk ? d.files.filter((x) => x.format === fmtOk) : [])
      .map((x) => ({
        id: `ia:${id}/${x.name}`, src: 'archive', albumId: id,
        title: first(x.title) || x.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
        artist: first(x.artist) || first(x.creator) || albumArtist, album: albumTitle, art,
        url: `https://archive.org/download/${encodeURIComponent(id)}/${x.name.split('/').map(encodeURIComponent).join('/')}`,
        duration: parseLen(x.length), n: parseInt(first(x.track), 10) || 0, name: x.name,
      }))
      .sort((a, b) => (a.n && b.n ? a.n - b.n : 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const desc = String(first(m.description) || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return { id, title: albumTitle, artist: albumArtist, year: first(m.date || m.year).slice(0, 4), art, desc, tracks };
  },
};

const jamendo = {
  get on() { return !!lib.settings.jamendo; },
  async tracks(params) {
    const p = new URLSearchParams({ client_id: lib.settings.jamendo, format: 'json', limit: 30, audioformat: 'mp32', imagesize: 300, ...params });
    const d = await getJSON('https://api.jamendo.com/v3.0/tracks/?' + p);
    if (d.headers && d.headers.status !== 'success') throw new Error(d.headers.error_message || 'Jamendo error');
    return d.results.map((x) => ({
      id: 'jm:' + x.id, src: 'jamendo', title: x.name, artist: x.artist_name, album: x.album_name,
      art: x.image || x.album_image, url: x.audio, duration: +x.duration || 0,
    }));
  },
};

const RADIO_HOSTS = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
const radio = {
  async q(path) {
    let err;
    for (const h of RADIO_HOSTS) {
      try { return await getJSON(h + path, 12000); } catch (e) { err = e; }
    }
    throw err;
  },
  map(list) {
    const seen = new Set();
    return list
      .filter((s) => s.url_resolved && !s.hls && (!s.codec || /mp3|aac|ogg|opus/i.test(s.codec)))
      .filter((s) => { const k = s.name.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((s) => ({
        id: 'radio:' + s.stationuuid, src: 'radio', live: true, uuid: s.stationuuid,
        title: s.name.trim(), artist: [s.country, s.tags.split(',').filter(Boolean).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
        art: s.favicon && s.favicon.startsWith('https://') ? s.favicon : '',
        url: s.url_resolved.replace(/^http:\/\//i, 'https://'), httpUrl: s.url_resolved,
      }));
  },
  async search({ name = '', tag = '', country = '', limit = 60 } = {}) {
    const p = new URLSearchParams({ order: 'clickcount', reverse: 'true', hidebroken: 'true', limit });
    if (name) p.set('name', name);
    if (tag) p.set('tag', tag);
    if (country) p.set('countrycode', country);
    return this.map(await this.q('/json/stations/search?' + p));
  },
  click(uuid) { if (uuid) this.q('/json/url/' + uuid).catch(() => {}); },
};

const yt = {
  parse(s) {
    const m = String(s).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/);
    return m && m[1];
  },
  async track(id) {
    let title = 'Видео YouTube', artist = 'YouTube';
    try {
      const d = await getJSON('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), 8000);
      title = d.title || title; artist = d.author_name || artist;
    } catch {}
    return { id: 'yt:' + id, src: 'youtube', ytId: id, title, artist, art: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  },
};

/* ======================= player ======================= */
const audio = $('#audio');
const P = {
  queue: store.get('queue', []),
  idx: store.get('idx', -1),
  shuffle: store.get('shuffle', false),
  repeat: store.get('repeat', 'off'),
  errors: 0,
  ytState: -1,
  get cur() { return this.queue[this.idx]; },
  persist() { store.set('queue', this.queue.map(slim)); store.set('idx', this.idx); },

  setQueue(list, i = 0) {
    let q = list.map((t) => ({ ...t }));
    if (this.shuffle) {
      const pick = q.splice(i, 1)[0];
      q = [pick, ...shuffled(q)];
      i = 0;
    }
    this.queue = q;
    this.play(i);
  },
  playNext(t) {
    if (!this.cur) return this.setQueue([t]);
    this.queue.splice(this.idx + 1, 0, { ...t }); this.persist(); renderQueue(); toast('Сыграет следующим');
  },
  addToQueue(t) {
    if (!this.cur) return this.setQueue([t]);
    this.queue.push({ ...t }); this.persist(); renderQueue(); toast('Добавлено в очередь');
  },

  async play(i) {
    const t = this.queue[i];
    if (!t) return;
    this.idx = i;
    this.persist();
    lib.pushRecent(t);
    stopYT();
    if (t.src === 'youtube') {
      audio.pause(); audio.removeAttribute('src'); audio.load();
      startYT(t.ytId);
      renderNow();
      return;
    }
    let url = t.url;
    if (t.src === 'local') {
      const rec = await files.get(t.localKey).catch(() => null);
      if (!rec) { toast('Файл не найден на этом устройстве'); return this.skipAfterError(); }
      if (audio.dataset.blobUrl) URL.revokeObjectURL(audio.dataset.blobUrl);
      url = URL.createObjectURL(rec.blob);
      audio.dataset.blobUrl = url;
    }
    if (t.src === 'radio') radio.click(t.uuid);
    audio.src = url;
    renderNow();
    try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') renderPlayState(); }
  },
  toggle() {
    const t = this.cur;
    if (!t) return;
    if (t.src === 'youtube') {
      if (!ytFrame) startYT(t.ytId); else ytCmd(this.ytState === 1 ? 'pauseVideo' : 'playVideo');
      return;
    }
    if (!audio.src) return this.play(this.idx);
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  },
  next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.repeat === 'one') return this.play(this.idx);
    if (this.idx + 1 < this.queue.length) return this.play(this.idx + 1);
    if (this.repeat === 'all' || !auto) return this.play(0);
    audio.pause(); renderPlayState();
  },
  prev() {
    if (this.cur && this.cur.src !== 'youtube' && audio.currentTime > 3) { audio.currentTime = 0; return; }
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
    return t.src === 'youtube' ? this.ytState === 1 || this.ytState === 3 : !audio.paused;
  },
};
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

audio.addEventListener('play', renderPlayState);
audio.addEventListener('pause', renderPlayState);
audio.addEventListener('playing', () => { P.errors = 0; renderPlayState(); });
audio.addEventListener('ended', () => P.next(true));
audio.addEventListener('timeupdate', renderTime);
audio.addEventListener('durationchange', renderTime);
audio.addEventListener('error', () => {
  const t = P.cur;
  if (!t || !audio.getAttribute('src')) return;
  if (t.src === 'radio') {
    toast('Станция сейчас не отвечает. Выберите другую.');
    renderPlayState();
    return;
  }
  toast('Не удалось воспроизвести трек');
  P.skipAfterError();
});

/* ---------- YouTube (official embedded player, video stays visible) ---------- */
let ytFrame = null;
const ytBox = document.createElement('div');
ytBox.id = 'ytBox';
ytBox.style.cssText = 'position:fixed;overflow:hidden;border-radius:6px;background:#000;display:none;';
document.body.appendChild(ytBox);
function startYT(id) {
  P.ytState = -1;
  ytBox.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&enablejsapi=1&rel=0&origin=${encodeURIComponent(location.origin)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="YouTube" style="width:100%;height:100%;border:0"></iframe>`;
  ytFrame = ytBox.firstChild;
  ytFrame.addEventListener('load', () => ytPost({ event: 'listening', id: 1, channel: 'widget' }));
  ytBox.style.display = 'block';
  placeYT();
}
function stopYT() { if (ytFrame) { ytBox.innerHTML = ''; ytFrame = null; } ytBox.style.display = 'none'; P.ytState = -1; }
function ytPost(o) { try { ytFrame && ytFrame.contentWindow.postMessage(JSON.stringify(o), '*'); } catch {} }
function ytCmd(func, args = []) { ytPost({ event: 'command', func, args }); }
window.addEventListener('message', (e) => {
  if (!ytFrame || e.source !== ytFrame.contentWindow) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  const st = d && d.info && typeof d.info === 'object' ? d.info.playerState : d && d.event === 'onStateChange' ? d.info : undefined;
  if (typeof st === 'number' && st !== P.ytState) {
    P.ytState = st;
    renderPlayState();
    if (st === 0) P.next(true);
  }
});
function placeYT() {
  if (!ytFrame) return;
  const playerOpen = !$('#player').hidden;
  const target = playerOpen ? $('#stage') : $('#miniArt');
  const r = target.getBoundingClientRect();
  if (!r.width) { ytBox.style.display = 'none'; return; }
  Object.assign(ytBox.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: playerOpen ? 45 : 21, borderRadius: playerOpen ? '12px' : '6px' });
}
window.addEventListener('resize', placeYT);
$('#player').addEventListener('scroll', placeYT, { passive: true });

/* ---------- Media Session (lock screen, headphones, car) ---------- */
function setSession(t) {
  if (!('mediaSession' in navigator) || !t) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist || '', album: t.album || '',
      artwork: t.art ? [{ src: t.art, sizes: '512x512' }] : [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  } catch {}
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const h = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
  h('play', () => P.toggle());
  h('pause', () => P.toggle());
  h('nexttrack', () => P.next());
  h('previoustrack', () => P.prev());
  h('seekto', (d) => { if (P.cur && !P.cur.live && d.seekTime != null) audio.currentTime = d.seekTime; });
}

/* ---------- player UI ---------- */
function renderNow() {
  const t = P.cur;
  $('#mini').hidden = !t;
  if (!t) return;
  $('#miniTitle').textContent = t.title;
  $('#miniArtist').textContent = t.artist || '';
  const art = t.art || 'icon-512.png';
  $('#miniArt').src = art;
  $('#bigArt').src = art;
  $('#bigTitle').textContent = t.title;
  $('#bigArtist').textContent = [t.artist, t.album && t.album !== t.title ? t.album : ''].filter(Boolean).join(' — ');
  $('#playerBg').style.backgroundImage = t.art ? `url("${t.art.replace(/"/g, '%22')}")` : `linear-gradient(135deg,hsl(${hue(t.title)} 60% 40%),#111)`;
  $('#stage').classList.toggle('video', t.src === 'youtube');
  $('#bigArt').hidden = t.src === 'youtube';
  const live = !!t.live, video = t.src === 'youtube';
  $('#seek').disabled = live || video;
  $('#tLive').hidden = !live;
  $('#tCur').style.visibility = $('#tDur').style.visibility = live ? 'hidden' : '';
  $('#seekWrap').hidden = video;
  $('#bigMore').hidden = false;
  refreshLikes();
  setSession(t);
  renderPlayState();
  renderTime();
  renderQueue();
  markPlaying();
  requestAnimationFrame(placeYT);
}
function renderPlayState() {
  const on = P.playing;
  $('#play').innerHTML = on ? I.pause : I.play;
  $('#play').setAttribute('aria-label', on ? 'Пауза' : 'Играть');
  $('#miniPlay').innerHTML = on ? I.pause : I.play;
  $('#miniPlay').setAttribute('aria-label', on ? 'Пауза' : 'Играть');
  $('#stage').classList.toggle('paused', !on && !(P.cur && P.cur.src === 'youtube'));
  if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = on ? 'playing' : 'paused'; } catch {}
  $('#shuffle').classList.toggle('on', P.shuffle);
  $('#repeat').classList.toggle('on', P.repeat !== 'off');
  $('#repeat').classList.toggle('one', P.repeat === 'one');
  requestAnimationFrame(placeYT);
}
let seeking = false;
function renderTime() {
  const t = P.cur;
  if (!t || t.live) { $('#miniBar').style.width = t && t.live && P.playing ? '100%' : '0'; return; }
  const d = isFinite(audio.duration) ? audio.duration : t.duration || 0;
  const c = audio.currentTime || 0;
  const p = d ? (c / d) * 100 : 0;
  $('#miniBar').style.width = p + '%';
  if (!seeking) { $('#seek').value = Math.round(p * 10); $('#seek').style.setProperty('--p', p + '%'); }
  $('#tCur').textContent = fmt(c);
  $('#tDur').textContent = '-' + fmt(Math.max(0, d - c));
}
function refreshLikes() {
  const t = P.cur;
  if (!t) return;
  const radioT = t.src === 'radio';
  const on = radioT ? lib.isSaved(t.id) : lib.isLiked(t.id);
  $('#bigLike').innerHTML = on ? I.heartOn : I.heart;
  $('#bigLike').classList.toggle('on', on);
  $('#bigLike').setAttribute('aria-label', radioT ? (on ? 'Удалить станцию' : 'Сохранить станцию') : on ? 'Убрать из избранного' : 'В избранное');
}
function renderQueue() {
  const rest = P.queue.slice(P.idx + 1);
  ctxLists.queue = rest;
  $('#queue').innerHTML = rest.length ? rest.map((t, i) => trackItem(t, i, 'queue', { qOffset: P.idx + 1 })).join('') : '<li class="note" style="color:rgba(255,255,255,.6)">Очередь пуста</li>';
  $('#clearQueue').hidden = !rest.length;
}
function markPlaying() {
  const id = P.cur && P.cur.id;
  document.querySelectorAll('#view .item[data-id]').forEach((el) => el.classList.toggle('playing', el.dataset.id === id));
}

$('#play').onclick = () => P.toggle();
$('#miniPlay').onclick = () => P.toggle();
$('#next').onclick = () => P.next();
$('#miniNext').onclick = () => P.next();
$('#prev').onclick = () => P.prev();
$('#shuffle').onclick = () => {
  P.shuffle = !P.shuffle; store.set('shuffle', P.shuffle);
  if (P.shuffle && P.cur) { P.queue = [...P.queue.slice(0, P.idx + 1), ...shuffled(P.queue.slice(P.idx + 1))]; P.persist(); renderQueue(); }
  renderPlayState(); toast(P.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено');
};
$('#repeat').onclick = () => {
  P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat]; store.set('repeat', P.repeat);
  renderPlayState(); toast({ off: 'Повтор выключен', all: 'Повтор очереди', one: 'Повтор трека' }[P.repeat]);
};
$('#clearQueue').onclick = () => { P.queue = P.queue.slice(0, P.idx + 1); P.persist(); renderQueue(); };
const seek = $('#seek');
seek.addEventListener('input', () => { seeking = true; seek.style.setProperty('--p', seek.value / 10 + '%'); const d = audio.duration; if (isFinite(d)) $('#tCur').textContent = fmt((seek.value / 1000) * d); });
seek.addEventListener('change', () => { const d = audio.duration; if (isFinite(d)) audio.currentTime = (seek.value / 1000) * d; seeking = false; });
$('#bigLike').onclick = () => { const t = P.cur; if (!t) return; t.src === 'radio' ? lib.toggleStation(t) : lib.toggleLike(t); refreshLikes(); };
$('#bigMore').onclick = () => P.cur && trackSheet(P.cur, {});

function openPlayer() {
  if (!P.cur) return;
  $('#player').hidden = false;
  document.body.style.overflow = 'hidden';
  renderQueue();
  requestAnimationFrame(placeYT);
  setTimeout(placeYT, 350);
}
function closePlayer() {
  $('#player').hidden = true;
  document.body.style.overflow = '';
  requestAnimationFrame(placeYT);
}
$('#miniOpen').onclick = openPlayer;
$('#playerClose').onclick = closePlayer;
let touchY = null;
$('#player').addEventListener('touchstart', (e) => { touchY = $('#player').scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
$('#player').addEventListener('touchend', (e) => { if (touchY != null && e.changedTouches[0].clientY - touchY > 120) closePlayer(); touchY = null; });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); P.toggle(); }
  if (e.key === 'Escape') { if (!$('#sheet').hidden) closeSheet(); else closePlayer(); }
});

/* ======================= sheets ======================= */
function openSheet(title, html) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  const f = $('#sheetBody input'); if (f) setTimeout(() => f.focus(), 50);
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; }
$('#sheetCancel').onclick = closeSheet;
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
function actions(list) {
  sheetActs = list;
  return list.map((a, i) => `<button class="act${a.danger ? ' danger' : ''}" data-act="${i}">${a.icon || ''}<span>${esc(a.label)}</span></button>`).join('');
}
let sheetActs = [];
$('#sheetBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = sheetActs[+b.dataset.act];
  closeSheet();
  a && a.fn();
});

function trackSheet(t, { playlistId, qIndex, fileView } = {}) {
  const list = [];
  if (qIndex == null) {
    list.push({ label: 'Сыграть следующим', icon: I.next, fn: () => P.playNext(t) });
    list.push({ label: 'В конец очереди', icon: I.queue, fn: () => P.addToQueue(t) });
  } else {
    list.push({ label: 'Убрать из очереди', icon: I.trash, fn: () => { P.queue.splice(qIndex, 1); P.persist(); renderQueue(); } });
  }
  if (t.src === 'radio') {
    list.push({ label: lib.isSaved(t.id) ? 'Удалить из моих станций' : 'Сохранить станцию', icon: I.radio, fn: () => { lib.toggleStation(t); refreshLikes(); if (location.hash.startsWith('#library')) route(); } });
  } else {
    list.push({ label: lib.isLiked(t.id) ? 'Убрать из избранного' : 'В избранное', icon: lib.isLiked(t.id) ? I.heartOn : I.heart, fn: () => { lib.toggleLike(t); if (location.hash === '#library/liked') route(); } });
    list.push({ label: 'Добавить в плейлист…', icon: I.list, fn: () => playlistPicker(t) });
  }
  if (t.albumId) list.push({ label: 'Открыть альбом', icon: I.album, fn: () => { closePlayer(); location.hash = '#album/' + encodeURIComponent(t.albumId); } });
  if (t.src === 'youtube') list.push({ label: 'Открыть на YouTube', icon: I.yt, fn: () => window.open('https://www.youtube.com/watch?v=' + t.ytId, '_blank', 'noopener') });
  if (playlistId) list.push({ label: 'Удалить из плейлиста', icon: I.trash, danger: true, fn: () => { const pl = lib.playlists.find((p) => p.id === playlistId); if (pl) { pl.tracks = pl.tracks.filter((x) => x.id !== t.id); lib.save('playlists'); route(); } } });
  if (fileView) list.push({ label: 'Удалить файл с устройства', icon: I.trash, danger: true, fn: async () => { await files.del(t.localKey); toast('Файл удалён'); route(); } });
  openSheet(t.title, actions(list));
}
function playlistPicker(t) {
  const list = lib.playlists.map((p) => ({ label: p.name, icon: I.list, fn: () => addToPlaylist(p.id, t) }));
  list.unshift({ label: 'Новый плейлист…', icon: I.plus, fn: () => newPlaylist(t) });
  openSheet('Добавить в плейлист', actions(list));
}
function addToPlaylist(id, t) {
  const pl = lib.playlists.find((p) => p.id === id);
  if (!pl) return;
  if (pl.tracks.some((x) => x.id === t.id)) return toast('Уже есть в «' + pl.name + '»');
  pl.tracks.push(slim(t)); lib.save('playlists'); toast('Добавлено в «' + pl.name + '»');
}
function newPlaylist(t, rename) {
  openSheet(rename ? 'Переименовать плейлист' : 'Новый плейлист', `<form id="plForm"><input class="text" id="plName" maxlength="60" placeholder="Название" value="${esc(rename ? rename.name : '')}" required><button class="btn primary" type="submit">${rename ? 'Сохранить' : 'Создать'}</button></form>`);
  $('#plForm').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#plName').value.trim();
    if (!name) return;
    if (rename) { rename.name = name; lib.save('playlists'); closeSheet(); route(); return; }
    const pl = { id: uid(), name, tracks: t ? [slim(t)] : [], created: Date.now() };
    lib.playlists.unshift(pl); lib.save('playlists'); closeSheet();
    toast(t ? 'Добавлено в «' + name + '»' : 'Плейлист создан');
    if (!t) location.hash = '#playlist/' + pl.id;
  };
}

/* ======================= rendering pieces ======================= */
const ctxLists = {};
let ctxSeq = 0;
function regList(list) { const k = 'l' + ++ctxSeq; ctxLists[k] = list; return k; }

function trackItem(t, i, key, o = {}) {
  const numbered = o.numbered;
  const lead = numbered ? `<span class="num">${t.n || i + 1}</span>` : `<span class="thumb">${artHTML(t.art, t.title)}</span>`;
  const sub = o.sub ?? [t.live ? '<span class="badge live">Эфир</span>' : t.src === 'youtube' ? '<span class="badge">YouTube</span>' : '', esc(t.artist || '')].join('');
  const tail = o.noDur || t.live ? '' : t.duration ? fmt(t.duration) : '';
  const extra = o.qOffset != null ? ` data-q="${o.qOffset + i}"` : '';
  return `<li class="item${numbered ? ' numbered' : ''}" data-id="${esc(t.id)}">
    <button class="main-hit" data-play="${key}" data-i="${i}"${extra} aria-label="Играть ${esc(t.title)}">${lead}<span class="meta"><b>${esc(t.title)}</b><small>${sub}</small></span></button>
    <span class="tail">${tail}<button class="icon-btn dots" data-more="${key}" data-i="${i}"${extra} aria-label="Действия">${I.more}</button></span>
  </li>`;
}
function trackList(list, o = {}) {
  if (!list.length) return '';
  const key = o.key || regList(list);
  return `<ul class="list">${list.map((t, i) => trackItem(t, i, key, o)).join('')}</ul>`;
}
function albumCard(a) {
  return `<a class="card" href="#album/${encodeURIComponent(a.id)}"><div class="art">${artHTML(a.art, a.title)}</div><b>${esc(a.title)}</b><small>${esc(a.artist || a.year || '')}</small></a>`;
}
function trackCard(t, key, i, round) {
  return `<button class="card" data-play="${key}" data-i="${i}"><div class="art${round ? ' round' : ''}">${artHTML(t.art, t.title)}</div><b>${esc(t.title)}</b><small>${esc(t.artist || '')}</small></button>`;
}
function shelf(title, inner, more) {
  return `<section class="shelf"><div class="shelf-head"><h2>${esc(title)}</h2>${more ? `<a class="link" href="${more}">Все</a>` : ''}</div>${inner}</section>`;
}
const spinner = '<div class="spinner" role="status" aria-label="Загрузка"></div>';
function errBox(msg) { return `<p class="err">${esc(msg)}</p>`; }

/* lazy shelf: renders a placeholder, fills it when data arrives */
function lazy(id, promise, render, fail = 'Не удалось загрузить. Проверьте интернет и обновите страницу.') {
  promise.then((data) => { const el = document.getElementById(id); if (el) { el.innerHTML = render(data); markPlaying(); } })
    .catch(() => { const el = document.getElementById(id); if (el) el.innerHTML = errBox(fail); });
  return `<div id="${id}">${spinner}</div>`;
}

/* global delegation for list clicks */
document.addEventListener('click', (e) => {
  const pl = e.target.closest('[data-play]');
  if (pl) {
    const list = ctxLists[pl.dataset.play];
    if (!list) return;
    if (pl.dataset.q != null) { P.play(+pl.dataset.q); return; }
    P.setQueue(list, +pl.dataset.i);
    return;
  }
  const mo = e.target.closest('[data-more]');
  if (mo) {
    const list = ctxLists[mo.dataset.more];
    const t = list && list[+mo.dataset.i];
    if (!t) return;
    trackSheet(t, { playlistId: mo.closest('[data-playlist]')?.dataset.playlist, qIndex: mo.dataset.q != null ? +mo.dataset.q : undefined, fileView: !!mo.closest('[data-files]') });
  }
});

/* ======================= views ======================= */
const view = $('#view');
const GENRES = [
  ['Поп', 'pop', 330], ['Рок', 'rock', 10], ['Джаз', 'jazz', 35], ['Электроника', 'electronic', 265],
  ['Хип-хоп', 'hip hop', 290], ['Классика', 'classical', 200], ['Чилаут', 'chillout', 170], ['Метал', 'metal', 0],
  ['Блюз', 'blues', 220], ['Регги', 'reggae', 120], ['Фолк', 'folk', 45], ['Эмбиент', 'ambient', 185],
];

const views = {
  home() {
    const recent = lib.recent.slice(0, 15);
    const rk = regList(recent);
    let html = `<h1 class="large-title">Слушать</h1>`;
    if (recent.length) html += shelf('Недавно играло', `<div class="row">${recent.map((t, i) => trackCard(t, rk, i, t.src === 'radio')).join('')}</div>`);
    html += shelf('Популярное радио', lazy('h-radio', cached('radio-top', () => radio.search({ country: 'RU', limit: 40 })), (l) => { const k = regList(l); return `<div class="row">${l.slice(0, 20).map((t, i) => trackCard(t, k, i, true)).join('')}</div>`; }), '#radio');
    if (jamendo.on) html += shelf('Jamendo: хиты недели', lazy('h-jm', cached('jm-top', () => jamendo.tracks({ order: 'popularity_week' })), (l) => `<div class="grid-list">${trackList(l.slice(0, 12))}</div>`));
    html += shelf('Популярные альбомы', lazy('h-net', cached('ia-net', () => archive.search('mediatype:audio AND collection:netlabels', { rows: 20 })), (l) => `<div class="row">${l.map(albumCard).join('')}</div>`));
    html += shelf('Живые концерты', lazy('h-live', cached('ia-etree', () => archive.search('mediatype:audio AND collection:etree', { rows: 20 })), (l) => `<div class="row">${l.map(albumCard).join('')}</div>`));
    html += shelf('Ретро: пластинки 78 об/мин', lazy('h-78', cached('ia-78', () => archive.search('mediatype:audio AND collection:(78rpm OR georgeblood)', { rows: 20 })), (l) => `<div class="row">${l.map(albumCard).join('')}</div>`));
    html += shelf('Свежее у независимых музыкантов', lazy('h-new', cached('ia-new', () => archive.search('mediatype:audio AND collection:audio_music', { rows: 20, sort: 'publicdate desc' })), (l) => `<div class="row">${l.map(albumCard).join('')}</div>`));
    view.innerHTML = html;
  },

  search(arg) {
    const q0 = arg ? decodeURIComponent(arg) : (sessionStorage.getItem('nota:q') || '');
    view.innerHTML = `<h1 class="large-title">Поиск</h1>
      <div class="search-box"><label class="field">${I.search}<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Артисты, альбомы, радио, ссылка YouTube" value="${esc(q0)}"></label></div>
      <div id="results"></div>`;
    const input = $('#q');
    const run = debounce(() => doSearch(input.value.trim()), 450);
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); doSearch(input.value.trim()); } });
    doSearch(q0);
  },

  radio(arg) {
    const sel = store.get('radioSel', { country: 'RU', tag: '' });
    if (arg) { const [c, t] = decodeURIComponent(arg).split('|'); sel.country = c || ''; sel.tag = t || ''; }
    const countries = [['RU', 'Россия'], ['UA', 'Украина'], ['BY', 'Беларусь'], ['KZ', 'Казахстан'], ['', 'Весь мир'], ['US', 'США'], ['GB', 'Великобритания'], ['DE', 'Германия'], ['FR', 'Франция'], ['IT', 'Италия'], ['TR', 'Турция']];
    const tags = [['', 'Все жанры'], ['pop', 'Поп'], ['rock', 'Рок'], ['dance', 'Танцевальное'], ['hiphop', 'Хип-хоп'], ['jazz', 'Джаз'], ['classical', 'Классика'], ['chillout', 'Чилаут'], ['electronic', 'Электроника'], ['retro', 'Ретро'], ['news', 'Новости'], ['kids', 'Детское']];
    const saved = lib.stations;
    const sk = regList(saved);
    view.innerHTML = `<h1 class="large-title">Радио</h1>
      ${saved.length ? shelf('Мои станции', `<div class="row">${saved.map((t, i) => trackCard(t, sk, i, true)).join('')}</div>`) : ''}
      <section class="shelf"><div class="shelf-head"><h2>Станции</h2></div>
      <div class="chips" role="group" aria-label="Страна">${countries.map(([c, n]) => `<button class="chip${sel.country === c ? ' on' : ''}" data-country="${c}">${n}</button>`).join('')}</div>
      <div class="chips" role="group" aria-label="Жанр">${tags.map(([t, n]) => `<button class="chip${sel.tag === t ? ' on' : ''}" data-tag="${t}">${n}</button>`).join('')}</div>
      ${lazy('r-list', cached(`radio:${sel.country}|${sel.tag}`, () => radio.search({ country: sel.country, tag: sel.tag, limit: 80 })), (l) => l.length ? trackList(l) : '<p class="empty"><b>Ничего не нашлось</b>Попробуйте другой жанр или страну.</p>')}
      </section>
      <p class="note">Каталог станций: Radio Browser, около 50 000 станций. Некоторые станции работают только по старому протоколу http и в браузере могут не открыться.</p>`;
    view.querySelectorAll('[data-country]').forEach((b) => b.onclick = () => { sel.country = b.dataset.country; store.set('radioSel', sel); views.radio(); });
    view.querySelectorAll('[data-tag]').forEach((b) => b.onclick = () => { sel.tag = b.dataset.tag; store.set('radioSel', sel); views.radio(); });
  },

  async library(arg) {
    if (arg === 'liked') {
      const l = lib.liked;
      view.innerHTML = backLink('#library') + `<div class="title-row"><h1 class="large-title">Избранное</h1></div>` +
        (l.length ? playButtons(regList(l)) + trackList(l) : `<div class="empty"><b>Здесь пока пусто</b>Нажмите на сердечко в плеере или «…» у трека, чтобы добавить его сюда.</div>`);
      return;
    }
    if (arg === 'stations') {
      const l = lib.stations;
      view.innerHTML = backLink('#library') + `<h1 class="large-title">Мои станции</h1>` +
        (l.length ? trackList(l) : `<div class="empty"><b>Нет сохранённых станций</b>Откройте «Радио» и сохраните станции через «…».<br><a class="btn" href="#radio">Открыть радио</a></div>`);
      return;
    }
    if (arg === 'files') {
      view.innerHTML = backLink('#library') + `<div class="title-row"><h1 class="large-title">Мои файлы</h1></div>${spinner}`;
      let recs = [];
      try { recs = (await files.all()).sort((a, b) => b.added - a.added); } catch {}
      if (location.hash !== '#library/files') return;
      const l = recs.map(files.toTrack);
      const k = regList(l);
      view.innerHTML = backLink('#library') + `<div class="title-row"><h1 class="large-title">Мои файлы</h1></div>
        <div class="btn-row"><button class="btn primary" id="addFiles">${I.plus}Добавить файлы</button>${l.length ? `<button class="btn" data-play="${k}" data-i="0">${I.play}Слушать</button>` : ''}</div>
        <div data-files>${l.length ? trackList(l, { key: k }) : `<div class="empty"><b>Добавьте свою музыку</b>MP3, M4A, FLAC, OGG, WAV. Файлы хранятся только на этом устройстве, в браузере.</div>`}</div>`;
      $('#addFiles').onclick = () => $('#filePick').click();
      return;
    }
    const pls = lib.playlists;
    view.innerHTML = `<div class="title-row"><h1 class="large-title">Медиатека</h1></div>
      <ul class="nav-list">
        <li><a href="#library/liked">${I.heartOn}<span>Избранное</span><span class="count">${lib.liked.length}</span></a></li>
        <li><a href="#library/stations">${I.radio}<span>Мои станции</span><span class="count">${lib.stations.length}</span></a></li>
        <li><a href="#library/files">${I.file}<span>Мои файлы</span></a></li>
        <li><button id="newPl">${I.plus}<span>Новый плейлист</span></button></li>
        <li><a href="#settings">${I.gear}<span>Источники и настройки</span></a></li>
      </ul>
      ${pls.length ? shelf('Плейлисты', `<div class="grid">${pls.map(playlistCard).join('')}</div>`) : ''}
      ${lib.recent.length ? shelf('Недавно играло', trackList(lib.recent.slice(0, 20))) : ''}`;
    $('#newPl').onclick = () => newPlaylist();
  },

  playlist(id) {
    const pl = lib.playlists.find((p) => p.id === id);
    if (!pl) { view.innerHTML = backLink('#library') + `<div class="empty"><b>Плейлист не найден</b></div>`; return; }
    const k = regList(pl.tracks);
    view.innerHTML = backLink('#library') + `
      <div class="hero"><div class="art">${mosaic(pl.tracks, pl.name)}</div>
      <div><h1>${esc(pl.name)}</h1><p class="info">${pl.tracks.length} ${plural(pl.tracks.length, 'трек', 'трека', 'треков')}</p></div></div>
      ${pl.tracks.length ? playButtons(k) : ''}
      <div data-playlist="${esc(pl.id)}">${pl.tracks.length ? trackList(pl.tracks, { key: k }) : `<div class="empty"><b>Плейлист пуст</b>Добавляйте треки через «…» → «Добавить в плейлист».</div>`}</div>
      <div class="btn-row"><button class="btn" id="plRename">${I.edit}Переименовать</button><button class="btn" id="plDelete" style="color:#e5383b">${I.trash}Удалить</button></div>`;
    $('#plRename').onclick = () => newPlaylist(null, pl);
    $('#plDelete').onclick = () => openSheet('Удалить «' + pl.name + '»?', actions([{ label: 'Удалить плейлист', icon: I.trash, danger: true, fn: () => { lib.playlists = lib.playlists.filter((p) => p.id !== pl.id); lib.save('playlists'); location.hash = '#library'; } }]));
  },

  album(id) {
    id = decodeURIComponent(id || '');
    view.innerHTML = backLink() + spinner;
    cached('album:' + id, () => archive.album(id)).then((a) => {
      if (location.hash.slice(7) && decodeURIComponent(location.hash.slice(7)) !== id) return;
      const k = regList(a.tracks);
      const total = a.tracks.reduce((s, t) => s + (t.duration || 0), 0);
      view.innerHTML = backLink() + `
        <div class="hero"><div class="art">${artHTML(a.art, a.title)}</div>
        <div><h1>${esc(a.title)}</h1><div class="who">${esc(a.artist)}</div>
        <p class="info">${[a.year, a.tracks.length + ' ' + plural(a.tracks.length, 'трек', 'трека', 'треков'), total ? fmt(total) : ''].filter(Boolean).join(' · ')}</p></div></div>
        ${a.tracks.length ? playButtons(k) + trackList(a.tracks, { key: k, numbered: true }) : `<div class="empty"><b>В этой записи нет аудиофайлов MP3</b>Попробуйте другую запись.</div>`}
        ${a.desc ? `<p class="desc">${esc(a.desc)}</p>` : ''}
        <p class="note" style="margin-top:16px">Источник: <a class="link" href="https://archive.org/details/${encodeURIComponent(a.id)}" target="_blank" rel="noopener">Internet Archive</a></p>`;
      markPlaying();
    }).catch(() => { view.innerHTML = backLink() + errBox('Не удалось открыть запись. Проверьте интернет и попробуйте ещё раз.'); });
  },

  settings() {
    view.innerHTML = backLink('#library') + `<h1 class="large-title">Источники</h1>
      <div class="panel"><h3>Internet Archive</h3><p class="note">Альбомы, независимые лейблы, живые концерты и старые пластинки. Подключено, ключ не нужен.</p></div>
      <div class="panel"><h3>Radio Browser</h3><p class="note">Около 50 000 интернет-радиостанций со всего мира. Подключено, ключ не нужен.</p></div>
      <div class="panel"><h3>YouTube</h3><p class="note">Вставьте ссылку на видео в поиск. Видео играет в официальном плеере YouTube и остаётся на экране.</p></div>
      <form class="panel" id="jmForm"><h3>Jamendo</h3>
        <p class="note">Около 600 000 треков независимых музыкантов. Нужен бесплатный ключ: зарегистрируйтесь на <a class="link" href="https://devportal.jamendo.com/" target="_blank" rel="noopener">devportal.jamendo.com</a>, создайте приложение и вставьте сюда его Client ID.</p>
        <input class="text" id="jmKey" placeholder="Client ID" autocomplete="off" value="${esc(lib.settings.jamendo)}">
        <button class="btn primary" type="submit">Сохранить</button></form>
      <div class="panel"><h3>Данные</h3><p class="note">Избранное, плейлисты и файлы хранятся только в этом браузере на этом устройстве.</p>
        <button class="btn" id="wipe" style="color:#e5383b">Стереть историю прослушивания</button></div>`;
    $('#jmForm').onsubmit = async (e) => {
      e.preventDefault();
      const key = $('#jmKey').value.trim();
      lib.settings.jamendo = key; lib.save('settings');
      memo.forEach((_, k) => { if (k.startsWith('jm')) memo.delete(k); });
      if (!key) return toast('Jamendo отключён');
      try { await jamendo.tracks({ limit: 1 }); toast('Jamendo подключён'); } catch { toast('Ключ не подошёл. Проверьте Client ID.'); }
    };
    $('#wipe').onclick = () => { lib.recent = []; lib.save('recent'); toast('История стёрта'); };
  },
};

function backLink(href) {
  return `<a class="back" href="${href || '#'}" ${href ? '' : 'onclick="history.back();return false"'}>${I.back}Назад</a>`;
}
function playButtons(k) {
  return `<div class="btn-row"><button class="btn primary" data-play="${k}" data-i="0">${I.play}Слушать</button><button class="btn" data-shuffle="${k}">${I.shuffle}Вперемешку</button></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-shuffle]');
  if (!b) return;
  const l = ctxLists[b.dataset.shuffle];
  if (l && l.length) P.setQueue(shuffled(l), 0);
});
function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
function mosaic(tracks, name) {
  const arts = [...new Set(tracks.map((t) => t.art).filter(Boolean))].slice(0, 4);
  if (arts.length < 4) return arts[0] ? `<img src="${esc(arts[0])}" alt="" referrerpolicy="no-referrer">` : placeholder(name);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;width:100%;height:100%">${arts.map((a) => `<img src="${esc(a)}" alt="" style="aspect-ratio:1;object-fit:cover" referrerpolicy="no-referrer">`).join('')}</div>`;
}
function playlistCard(p) {
  return `<a class="card" href="#playlist/${p.id}"><div class="art">${mosaic(p.tracks, p.name)}</div><b>${esc(p.name)}</b><small>${p.tracks.length} ${plural(p.tracks.length, 'трек', 'трека', 'треков')}</small></a>`;
}

let searchSeq = 0;
async function doSearch(q) {
  try { sessionStorage.setItem('nota:q', q); } catch {}
  const out = $('#results');
  if (!out) return;
  const seq = ++searchSeq;
  if (!q) {
    out.innerHTML = shelf('Жанры', `<div class="genres">${GENRES.map(([n, en, h]) => `<button class="genre" data-genre="${esc(en)}" style="background:linear-gradient(135deg,hsl(${h} 72% 52%),hsl(${(h + 40) % 360} 70% 36%))">${n}</button>`).join('')}</div>`);
    out.querySelectorAll('[data-genre]').forEach((b) => b.onclick = () => { $('#q').value = b.dataset.genre; doSearch(b.dataset.genre); });
    return;
  }
  const ytId = yt.parse(q);
  if (ytId) {
    out.innerHTML = spinner;
    const t = await yt.track(ytId);
    if (seq !== searchSeq) return;
    const k = regList([t]);
    out.innerHTML = shelf('Видео YouTube', trackList([t], { key: k })) + `<div class="btn-row"><button class="btn primary" data-play="${k}" data-i="0">${I.play}Смотреть</button><button class="btn" id="ytSave">${I.heart}В избранное</button></div>`;
    $('#ytSave').onclick = () => lib.toggleLike(t);
    return;
  }
  let html = shelf('Альбомы и записи', lazy('s-ia', archive.find(q, 30), (l) => l.length ? `<div class="grid">${l.map(albumCard).join('')}</div>` : '<p class="note">Ничего не найдено в Internet Archive.</p>'));
  if (jamendo.on) html += shelf('Треки Jamendo', lazy('s-jm', jamendo.tracks({ search: q, order: 'relevance' }), (l) => l.length ? trackList(l) : '<p class="note">Ничего не найдено на Jamendo.</p>'));
  html += shelf('Радиостанции', lazy('s-radio', Promise.all([radio.search({ name: q, limit: 15 }), radio.search({ tag: q.toLowerCase(), limit: 15 })]).then(([a, b]) => { const s = new Set(); return [...a, ...b].filter((t) => !s.has(t.id) && s.add(t.id)).slice(0, 20); }), (l) => l.length ? trackList(l) : '<p class="note">Станций не найдено.</p>'));
  if (!jamendo.on) html += `<p class="note">Хотите больше треков? Подключите Jamendo в разделе <a class="link" href="#settings">Источники</a>.</p>`;
  if (seq === searchSeq) out.innerHTML = html;
}

/* ======================= router ======================= */
function route() {
  const h = location.hash.slice(1) || 'home';
  const [name, ...rest] = h.split('/');
  const arg = rest.join('/');
  const fn = views[name] || views.home;
  const tab = { album: 'search', playlist: 'library', settings: 'library' }[name] || (views[name] ? name : 'home');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  for (const k in ctxLists) if (k !== 'queue') delete ctxLists[k];
  fn(arg);
  window.scrollTo(0, 0);
  markPlaying();
}
window.addEventListener('hashchange', route);

$('#filePick').addEventListener('change', async (e) => {
  const list = [...e.target.files];
  e.target.value = '';
  if (!list.length) return;
  try {
    const n = await files.add(list);
    toast(n ? `Добавлено файлов: ${n}` : 'Это не аудиофайлы');
  } catch { toast('Не удалось сохранить файлы. Возможно, закончилось место.'); }
  if (location.hash === '#library/files') route();
});

/* ======================= boot ======================= */
route();
if (P.cur) { renderNow(); }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
