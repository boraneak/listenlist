import './style.css';
import * as db from './db.js';
import { VOICES, DEFAULT_VOICE, MAX_WORDS, countWords, clampWords, hashOf, generateAudio } from './tts.js';

/* ---------- icons & logo ---------- */
const svg = (d, size = 24, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  back: svg('<path d="M15 5l-7 7 7 7"/>', 26),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 22, 'stroke-width="2.6"'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>', 22, 'stroke-width="2"'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 20),
  chev: svg('<path d="M9 5l7 7-7 7"/>', 20),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 20),
  paste: svg('<rect x="6" y="5" width="12" height="16" rx="2.5"/><path d="M9 5V4a1 1 0 011-1h4a1 1 0 011 1v1M9.5 11h5M9.5 15h5"/>', 20),
  doc: svg('<path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>', 24, 'stroke-width="2"'),
  headphones: svg('<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>', 24),
  play: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z"/></svg>',
  pause: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>',
  back15: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 108-8H8M8 1L5 4l3 3"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>',
  fwd15: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-8-8h4M16 1l3 3-3 3"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>',
  save: svg('<path d="M12 3v12M7 10l5 5 5-5M5 20h14"/>', 24),
};

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lgA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A4C"/><stop offset="1" stop-color="#D9480F"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#lgA)"/><path d="M17.5 17v10l9-5z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><rect x="33" y="19" width="17" height="6" rx="3" fill="#fff"/><circle cx="22" cy="34" r="3.5" fill="#fff" fill-opacity=".78"/><rect x="33" y="31" width="17" height="6" rx="3" fill="#fff" fill-opacity=".78"/><circle cx="22" cy="46" r="3.5" fill="#fff" fill-opacity=".55"/><rect x="33" y="43" width="11" height="6" rx="3" fill="#fff" fill-opacity=".55"/></svg>`;

const EMPTY_ART = `<svg class="art" viewBox="0 0 148 148" fill="none" aria-hidden="true">
  <circle cx="74" cy="74" r="66" fill="var(--accent-soft)"/>
  <rect x="34" y="30" width="62" height="78" rx="12" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
  <rect x="46" y="46" width="38" height="7" rx="3.5" fill="var(--accent)"/>
  <rect x="46" y="62" width="38" height="6" rx="3" fill="var(--line)"/>
  <rect x="46" y="76" width="30" height="6" rx="3" fill="var(--line)"/>
  <rect x="46" y="90" width="22" height="6" rx="3" fill="var(--line)"/>
  <circle cx="102" cy="98" r="24" fill="url(#ea)"/>
  <path d="M95 86v24l20-12z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
  <defs><linearGradient id="ea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A4C"/><stop offset="1" stop-color="#D9480F"/></linearGradient></defs>
</svg>`;

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const fmtTime = (t) => {
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};
const fmtMin = (sec) => (sec < 60 ? Math.round(sec) + ' sec' : Math.round(sec / 60) + ' min');
const fmtMB = (b) => (b / 1048576 < 10 ? (b / 1048576).toFixed(1) : Math.round(b / 1048576)) + ' MB';
const store = {
  get: (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const app = $('#app');

function toast(msg, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  app.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** Bottom sheet dialog (replaces the browser's alert/confirm). */
function openSheet(html) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  app.appendChild(ov);
  return { el: ov, close: () => ov.remove() };
}
function confirmSheet({ title, text, action }) {
  return new Promise((resolve) => {
    const s = openSheet(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="cta" style="padding:0"><button class="btn secondary" id="no" style="flex:1">Cancel</button><button class="btn" id="yes">${esc(action)}</button></div>`);
    $('#no', s.el).onclick = () => (s.close(), resolve(false));
    $('#yes', s.el).onclick = () => (s.close(), resolve(true));
  });
}
function errorSheet(title, text, retry) {
  const s = openSheet(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
    <div class="cta" style="padding:0"><button class="btn secondary" id="no" style="flex:1">Close</button>${retry ? '<button class="btn" id="again">Try again</button>' : ''}</div>`);
  $('#no', s.el).onclick = () => s.close();
  if (retry) $('#again', s.el).onclick = () => (s.close(), retry());
}

/* ---------- state ---------- */
let lists = [];
let cur = null; // list being edited / read
let curAudio = null; // { blob, cues, duration, hash } for cur
let mode = 'write'; // 'write' | 'read'
let audioUrl = null;
let query = '';
const audio = new Audio();
audio.preload = 'auto';
let saveTimer = null;
let activeCue = -1;
let dragging = false;
let speed = Number(store.get('speed', 1)) || 1;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const audioStatus = (l) => {
  if (!l.audio) return 'none';
  return l.audio.hash === hashOf(l.text, l.voice) ? 'ready' : 'stale';
};
const voiceOf = (id) => VOICES.find((v) => v.id === id) || VOICES[0];

/* ---------- home ---------- */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => navigator.standalone || (matchMedia && matchMedia('(display-mode: standalone)').matches);

function renderHome() {
  stopPlayback();
  cur = null;
  app.innerHTML = `
    <section class="screen" id="home">
      <div class="bar"><div class="brand">${LOGO}<span>Listen<i>List</i></span></div></div>
      <div class="scroll" id="scroll"></div>
      <button class="fab" id="new">${I.plus} New list</button>
    </section>`;
  $('#new').onclick = newList;
  renderHomeBody();
}

function renderHomeBody() {
  const box = $('#scroll');
  if (!box) return;
  const sorted = [...lists].sort((a, b) => b.updatedAt - a.updatedAt);
  $('#new')?.classList.toggle('hidden', !sorted.length);

  if (!sorted.length) {
    box.innerHTML = `<div class="empty">${EMPTY_ART}
      <h2>No lists yet</h2>
      <p>Create a list, paste your text (up to ${MAX_WORDS.toLocaleString()} words) and press Listen. Your audio is saved on this device so it plays offline.</p>
      <button class="btn" id="first">${I.plus} Create your first list</button></div>`;
    $('#first').onclick = newList;
    return;
  }

  const showTip = isIOS && !isStandalone() && store.get('tipDismissed', '0') !== '1';
  const showSearch = sorted.length >= 6;
  box.innerHTML = `
    ${showTip ? `<div class="tip" id="tip"><span><b>Tip:</b> tap Share, then <b>Add to Home Screen</b> to use ListenList like an app.</span><button class="icon-btn" id="tipx" aria-label="Dismiss">${I.close}</button></div>` : ''}
    ${showSearch ? `<label class="search">${I.search}<input id="q" type="search" placeholder="Search your lists" value="${esc(query)}" autocomplete="off" /></label>` : ''}
    <div class="section"><span id="secLabel"></span></div>
    <div id="items"></div>
    <div class="foot" id="foot"></div>`;

  if (showTip) $('#tipx').onclick = () => (store.set('tipDismissed', '1'), $('#tip').remove());
  if (showSearch) {
    $('#q').oninput = (e) => {
      query = e.target.value;
      fillItems(sorted);
    };
  } else query = '';
  fillItems(sorted);

  const bytes = lists.reduce((n, l) => n + (l.audio ? l.audio.size || 0 : 0), 0);
  $('#foot').textContent = bytes ? `Stored on this device · ${fmtMB(bytes)} of audio` : 'Stored on this device';
}

function fillItems(sorted) {
  const q = query.trim().toLowerCase();
  const rows = q ? sorted.filter((l) => (l.title + ' ' + l.text).toLowerCase().includes(q)) : sorted;
  $('#secLabel').textContent = q ? `${rows.length} found` : `Your lists · ${sorted.length}`;
  $('#items').innerHTML = rows.length ? rows.map(itemHtml).join('') : `<div class="foot" style="padding:24px 0">No lists match “${esc(query)}”.</div>`;
  app.querySelectorAll('.item').forEach((c) => (c.onclick = () => openList(c.dataset.id)));
}

function itemHtml(l) {
  const words = countWords(l.text);
  const st = audioStatus(l);
  const snippet = l.text.replace(/\s+/g, ' ').trim().slice(0, 90);
  const tag =
    st === 'ready'
      ? `<span class="tag ready">▶ ${fmtMin(l.audio.duration)}</span>`
      : st === 'stale'
        ? `<span class="tag">Audio outdated</span>`
        : `<span class="tag">Text only</span>`;
  return `<button class="item" data-id="${l.id}">
    <span class="avatar ${st === 'ready' ? 'ready' : ''}">${st === 'ready' ? I.headphones : I.doc}</span>
    <span class="body">
      <div class="t">${esc(l.title || 'Untitled')}</div>
      <div class="snip">${snippet ? esc(snippet) : 'Empty list'}</div>
      <div class="s"><span>${words.toLocaleString()} words</span>${tag}</div>
    </span>
    <span class="chev">${I.chev}</span>
  </button>`;
}

async function newList() {
  const saved = store.get('voice', DEFAULT_VOICE);
  const l = { id: uid(), title: '', text: '', voice: VOICES.some((v) => v.id === saved) ? saved : DEFAULT_VOICE, updatedAt: Date.now(), audio: null };
  lists.push(l);
  await db.putList(l);
  openList(l.id, true);
}

/* ---------- editor / reader ---------- */
async function openList(id, isNew = false) {
  cur = lists.find((l) => l.id === id);
  if (!cur) return renderHome();
  curAudio = null;
  if (cur.audio) curAudio = (await db.getAudio(id)) || null;
  if (!curAudio) cur.audio = null;
  mode = audioStatus(cur) === 'ready' && !isNew ? 'read' : 'write';
  renderEditor();
  if (isNew && mode === 'write') $('#title').focus();
}

function renderEditor() {
  stopPlayback();
  if (mode === 'read') return renderReader();
  const st = audioStatus(cur);
  app.innerHTML = `
    <section class="screen" id="editor">
      <div class="bar">
        <button class="icon-btn" id="back" aria-label="Back to lists">${I.back}</button>
        <input class="title-input" id="title" placeholder="List name" value="${esc(cur.title)}" maxlength="80" enterkeyhint="done" />
        <button class="icon-btn danger" id="del" aria-label="Delete list">${I.trash}</button>
      </div>
      <div class="editor-body">
        <textarea class="text" id="text" placeholder="Paste or type your text here…" autocapitalize="sentences" spellcheck="true"></textarea>
        <button class="paste hidden" id="paste">${I.paste} Paste from clipboard</button>
      </div>
      <div class="note" id="note"></div>
      <div class="panel">
        <div class="meter" id="meter"><i></i></div>
        <div class="meta">
          <span class="count" id="count"></span>
          <label class="voice"><span>Voice</span>
            <select id="voice" aria-label="Voice">${VOICES.map((v) => `<option value="${v.id}" ${v.id === cur.voice ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          </label>
        </div>
      </div>
      <div class="cta">
        ${st === 'ready' ? `<button class="btn secondary" id="regen">Re-create</button>` : ''}
        <button class="btn" id="listen">${I.headphones}<span id="listenLabel"></span></button>
      </div>
    </section>`;
  const ta = $('#text');
  ta.value = cur.text;
  updateEditorMeta();

  $('#back').onclick = () => finishEditing();
  $('#del').onclick = async () => {
    const ok = await confirmSheet({ title: 'Delete this list?', text: `“${cur.title || 'Untitled'}” and its audio will be removed from this device.`, action: 'Delete' });
    if (!ok) return;
    await db.deleteList(cur.id);
    lists = lists.filter((l) => l.id !== cur.id);
    renderHome();
  };
  $('#title').oninput = (e) => {
    cur.title = e.target.value;
    scheduleSave();
  };
  $('#title').onkeydown = (e) => {
    if (e.key === 'Enter') ta.focus();
  };
  ta.oninput = () => {
    const clamped = clampWords(ta.value);
    if (clamped !== ta.value) {
      ta.value = clamped;
      toast(`Limit is ${MAX_WORDS.toLocaleString()} words — the rest was trimmed.`, 3600);
    }
    cur.text = ta.value;
    updateEditorMeta();
    scheduleSave();
  };
  $('#paste').onclick = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast('The clipboard is empty.');
      ta.value = clampWords((ta.value ? ta.value + '\n\n' : '') + t.trim());
      ta.dispatchEvent(new Event('input'));
    } catch {
      toast('Could not read the clipboard. Tap and hold in the text area, then choose Paste.', 4200);
      ta.focus();
    }
  };
  $('#voice').onchange = (e) => {
    cur.voice = e.target.value;
    store.set('voice', cur.voice);
    updateEditorMeta();
    scheduleSave();
  };
  $('#listen').onclick = onListen;
  if ($('#regen')) $('#regen').onclick = () => startGeneration();
}

function updateEditorMeta() {
  const words = countWords(cur.text);
  const c = $('#count');
  c.textContent = `${words.toLocaleString()} / ${MAX_WORDS.toLocaleString()} words`;
  c.classList.toggle('full', words >= MAX_WORDS);
  const m = $('#meter');
  m.classList.toggle('full', words >= MAX_WORDS);
  $('i', m).style.width = Math.min(100, (words / MAX_WORDS) * 100) + '%';
  const st = audioStatus(cur);
  $('#listenLabel').textContent = st === 'ready' ? 'Play' : 'Listen';
  $('#listen').disabled = !words;
  $('#paste').classList.toggle('hidden', words > 0 || !(navigator.clipboard && navigator.clipboard.readText));
  $('#note').textContent = st === 'stale' ? 'Text or voice changed — the audio will be re-created when you press Listen.' : '';
}

function scheduleSave() {
  cur.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.putList(cur), 350);
}

async function finishEditing() {
  clearTimeout(saveTimer);
  if (cur) {
    if (!cur.title.trim()) cur.title = cur.text.trim().split(/\s+/).slice(0, 5).join(' ') || 'Untitled';
    if (!cur.text.trim() && !cur.audio) {
      // discard completely empty lists
      await db.deleteList(cur.id);
      lists = lists.filter((l) => l.id !== cur.id);
    } else {
      await db.putList(cur);
    }
  }
  renderHome();
}

function onListen() {
  clearTimeout(saveTimer);
  db.putList(cur);
  if (audioStatus(cur) === 'ready') {
    mode = 'read';
    renderEditor();
    togglePlay(true);
  } else {
    startGeneration();
  }
}

/* ---------- generation ---------- */
async function startGeneration() {
  if (!countWords(cur.text)) return;
  clearTimeout(saveTimer);
  await db.putList(cur);
  const sheet = openSheet(`
    <h2 id="gTitle">Getting ready…</h2>
    <p id="gSub">Keep this screen open while the audio is created on your device. Nothing is uploaded.</p>
    <div class="bar-track"><div class="bar-fill" id="gFill"></div></div>
    <div class="prog-meta"><span id="gLeft"></span><span id="gRight"></span></div>
    <button class="btn secondary" id="gCancel" style="width:100%">Cancel</button>`);
  const ov = sheet.el;
  let cancelled = false;
  $('#gCancel', ov).onclick = () => {
    cancelled = true;
    $('#gTitle', ov).textContent = 'Stopping…';
  };

  let wake = null;
  try {
    wake = await navigator.wakeLock?.request('screen');
  } catch {}

  const voice = cur.voice;
  const text = cur.text;
  const started = performance.now();
  try {
    const res = await generateAudio({
      text,
      voiceId: voice,
      isCancelled: () => cancelled,
      onStatus: (s) => {
        const fill = $('#gFill', ov);
        if (!fill) return;
        fill.classList.toggle('indeterminate', s.phase === 'engine');
        if (s.phase !== 'engine') fill.style.width = s.percent + '%';
        if (s.phase === 'model') {
          $('#gTitle', ov).textContent = 'Downloading the voice (first time only)';
          $('#gSub', ov).textContent = 'About 60 MB. It is saved on this device, so you will not need to download it again.';
          $('#gLeft', ov).textContent = s.percent + '%';
          $('#gRight', ov).textContent = '';
        } else if (s.phase === 'engine') {
          $('#gTitle', ov).textContent = 'Starting the voice engine…';
          $('#gSub', ov).textContent = 'Almost there.';
          $('#gLeft', ov).textContent = '';
          $('#gRight', ov).textContent = '';
        } else {
          $('#gTitle', ov).textContent = 'Creating your audio';
          $('#gSub', ov).textContent = 'Keep this screen open. Everything happens on your device — nothing is uploaded.';
          $('#gLeft', ov).textContent = `${s.percent}% · part ${s.done} of ${s.total}`;
          $('#gRight', ov).textContent = s.etaSec != null ? `about ${fmtMin(s.etaSec)} left` : 'estimating…';
        }
      },
    });
    const hash = hashOf(text, voice);
    curAudio = { id: cur.id, blob: res.blob, cues: res.cues, duration: res.duration, hash };
    await db.putAudio(curAudio);
    cur.audio = { hash, duration: res.duration, size: res.blob.size };
    cur.updatedAt = Date.now();
    await db.putList(cur);
    navigator.storage?.persist?.();
    sheet.close();
    mode = 'read';
    renderEditor();
    toast(`Audio ready · made in ${fmtTime((performance.now() - started) / 1000)}`);
    togglePlay(true);
  } catch (err) {
    sheet.close();
    if (String(err && err.message) !== 'cancelled') {
      errorSheet(
        navigator.onLine ? 'Could not create the audio' : 'You are offline',
        navigator.onLine
          ? (err && err.message ? err.message : 'Something went wrong.') + ' Try again, or pick another voice.'
          : 'The first time you create audio you need internet to download the voice. After that it works offline.',
        () => startGeneration()
      );
    }
  } finally {
    try {
      wake?.release();
    } catch {}
  }
}

/* ---------- reader + player ---------- */
function renderReader() {
  const cues = curAudio.cues;
  // build highlighted text
  let html = '';
  let pos = 0;
  cues.forEach((c, i) => {
    html += esc(cur.text.slice(pos, c.s)) + `<span class="s" data-i="${i}">${esc(cur.text.slice(c.s, c.e))}</span>`;
    pos = c.e;
  });
  html += esc(cur.text.slice(pos));

  app.innerHTML = `
    <section class="screen" id="reader-screen">
      <div class="bar">
        <button class="icon-btn" id="back" aria-label="Back to lists">${I.back}</button>
        <div class="title-text">${esc(cur.title || 'Untitled')}</div>
        <button class="text-btn" id="edit">Edit</button>
      </div>
      <div class="reader" id="reader">${html}</div>
      <div class="player">
        <div class="seek"><span id="tNow">0:00</span><input type="range" id="seek" min="0" max="${curAudio.duration}" step="0.1" value="0" aria-label="Position" /><span id="tTotal">${fmtTime(curAudio.duration)}</span></div>
        <div class="controls">
          <button class="chip" id="speed" aria-label="Playback speed"></button>
          <button class="icon-btn" id="b15" aria-label="Back 15 seconds">${I.back15}</button>
          <button class="play" id="play" aria-label="Play">${I.play}</button>
          <button class="icon-btn" id="f15" aria-label="Forward 15 seconds">${I.fwd15}</button>
          <button class="icon-btn" id="save" aria-label="Save audio file">${I.save}</button>
        </div>
      </div>
    </section>`;

  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(curAudio.blob);
  audio.src = audioUrl;
  audio.playbackRate = speed;
  activeCue = -1;
  updateSpeedLabel();

  $('#back').onclick = () => renderHome();
  $('#edit').onclick = () => {
    mode = 'write';
    renderEditor();
  };
  $('#play').onclick = () => togglePlay();
  $('#b15').onclick = () => seekBy(-15);
  $('#f15').onclick = () => seekBy(15);
  $('#speed').onclick = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] || 1;
    store.set('speed', String(speed));
    audio.playbackRate = speed;
    updateSpeedLabel();
  };
  $('#save').onclick = saveAudioFile;
  const seek = $('#seek');
  seek.oninput = () => {
    dragging = true;
    $('#tNow').textContent = fmtTime(seek.value);
  };
  seek.onchange = () => {
    audio.currentTime = Number(seek.value);
    dragging = false;
  };
  $('#reader').onclick = (e) => {
    const s = e.target.closest('.s');
    if (!s) return;
    audio.currentTime = cues[Number(s.dataset.i)].t0 + 0.01;
    if (audio.paused) togglePlay(true);
  };
  setupMediaSession();
}

function updateSpeedLabel() {
  const b = $('#speed');
  if (b) b.textContent = speed + '×';
}

function setPlayIcon() {
  const b = $('#play');
  if (b) {
    b.innerHTML = audio.paused ? I.play : I.pause;
    b.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  }
}

function togglePlay(forcePlay) {
  if (!curAudio || mode !== 'read') return;
  if (forcePlay === true || audio.paused) {
    audio.playbackRate = speed;
    audio.play().catch(() => {}); // iOS may block autoplay; the Play button still works
  } else {
    audio.pause();
  }
}

function seekBy(d) {
  audio.currentTime = Math.min(Math.max(0, audio.currentTime + d), curAudio ? curAudio.duration : audio.duration || 0);
}

function stopPlayback() {
  audio.pause();
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
    } catch {}
  }
}

function highlight(t) {
  if (!curAudio) return;
  const cues = curAudio.cues;
  let lo = 0;
  let hi = cues.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].t0 <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx === activeCue) return;
  const reader = $('#reader');
  if (!reader) return;
  const prev = reader.querySelector('.s.on');
  if (prev) prev.classList.remove('on');
  activeCue = idx;
  const el = idx >= 0 ? reader.querySelector(`.s[data-i="${idx}"]`) : null;
  if (el) {
    el.classList.add('on');
    if (!audio.paused || !dragging) {
      const r = el.getBoundingClientRect();
      const rr = reader.getBoundingClientRect();
      if (r.top < rr.top + 20 || r.bottom > rr.bottom - 20) {
        reader.scrollTo({ top: reader.scrollTop + (r.top - rr.top) - rr.height * 0.3, behavior: 'smooth' });
      }
    }
  }
}

audio.addEventListener('timeupdate', () => {
  if (!curAudio || mode !== 'read') return;
  const t = audio.currentTime;
  if (!dragging) {
    const seek = $('#seek');
    if (seek) seek.value = t;
    const now = $('#tNow');
    if (now) now.textContent = fmtTime(t);
  }
  highlight(t);
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(audio.duration)) {
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(t, audio.duration) });
    } catch {}
  }
});
audio.addEventListener('play', () => {
  setPlayIcon();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
audio.addEventListener('pause', () => {
  setPlayIcon();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('ended', () => {
  setPlayIcon();
  audio.currentTime = 0;
});

// PC shortcuts while listening: Space = play/pause, ← / → = 15 seconds
document.addEventListener('keydown', (e) => {
  if (mode !== 'read' || !cur || !curAudio || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName) && e.key === ' ') return;
  if (['TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowLeft') seekBy(-15);
  else if (e.key === 'ArrowRight') seekBy(15);
});

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: cur.title || 'Untitled',
    artist: 'ListenList',
    album: 'My lists',
    artwork: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
  const set = (a, fn) => {
    try {
      navigator.mediaSession.setActionHandler(a, fn);
    } catch {}
  };
  set('play', () => togglePlay(true));
  set('pause', () => audio.pause());
  set('seekbackward', (d) => seekBy(-(d && d.seekOffset ? d.seekOffset : 15)));
  set('seekforward', (d) => seekBy(d && d.seekOffset ? d.seekOffset : 15));
  set('seekto', (d) => {
    if (d && typeof d.seekTime === 'number') audio.currentTime = d.seekTime;
  });
  set('previoustrack', () => seekBy(-15));
  set('nexttrack', () => seekBy(15));
}

async function saveAudioFile() {
  const name = (cur.title || 'listenlist').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'listenlist';
  const file = new File([curAudio.blob], name + '.wav', { type: 'audio/wav' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: cur.title || 'ListenList' });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = audioUrl;
  a.download = name + '.wav';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(`Saved · ${fmtMB(curAudio.blob.size)}`);
}

/* ---------- boot ---------- */
(async function boot() {
  try {
    lists = (await db.getAllLists()) || [];
  } catch {
    lists = [];
    toast('Storage is unavailable in this browser mode (private browsing?).', 5000);
  }
  renderHome();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();
