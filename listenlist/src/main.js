import './style.css';
import * as db from './db.js';
import { VOICES, DEFAULT_VOICE, MAX_WORDS, countWords, isWithinWordLimit, voiceIsOnDevice, hashOf, generateAudio } from './tts.js';

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
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.textContent = msg;
  app.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** Bottom sheet dialog (replaces the browser's alert/confirm). */
function openSheet(html) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const dialog = $('.sheet', ov);
  dialog.setAttribute('tabindex', '-1');
  const heading = $('h2', dialog);
  if (heading) {
    if (!heading.id) heading.id = `dialog-title-${++openSheet.nextId}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  } else dialog.setAttribute('aria-label', 'ListenList dialog');
  const previous = document.activeElement;
  let closed = false;
  let onEscape = () => close();
  const focusable = () =>
    [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.getClientRects().length);
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) {
      e.preventDefault();
      dialog.focus();
    } else if (e.shiftKey && document.activeElement === items[0]) {
      e.preventDefault();
      items.at(-1).focus();
    } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
      e.preventDefault();
      items[0].focus();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    ov.remove();
    previous?.focus?.();
  };
  app.appendChild(ov);
  document.addEventListener('keydown', onKeydown);
  (focusable()[0] || dialog).focus();
  return {
    el: ov,
    close,
    set onEscape(fn) {
      onEscape = fn;
    },
  };
}
openSheet.nextId = 0;
function confirmSheet({ title, text, action }) {
  return new Promise((resolve) => {
    const s = openSheet(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="cta" style="padding:0"><button class="btn secondary" id="no" style="flex:1">Cancel</button><button class="btn" id="yes">${esc(action)}</button></div>`);
    const finish = (answer) => {
      s.close();
      resolve(answer);
    };
    s.onEscape = () => finish(false);
    $('#no', s.el).onclick = () => finish(false);
    $('#yes', s.el).onclick = () => finish(true);
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
let generationActive = false;
let storageIssue = null;
let voiceCheck = 0;
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
  releaseAudioUrl();
  cur = null;
  app.innerHTML = `
    <section class="screen" id="home">
      <div class="bar">
        <div class="brand">${LOGO}<span>Listen<i>List</i></span></div>
        <button class="text-btn" id="about">About</button>
      </div>
      <div class="scroll" id="scroll"></div>
      <button class="fab" id="new">${I.plus} New list</button>
    </section>`;
  $('#new').onclick = newList;
  $('#about').onclick = () => {
    const sheet = openSheet(`
      <h2>About ListenList</h2>
      <p>Paste text, choose a voice, and create speech in your browser. ListenList processes your text on this device; it does not upload it.</p>
      <p>Each voice needs an internet connection for its first download (about 60 MB). After that, you can generate speech offline when the app files and voice are still available in browser storage.</p>
      <p>Your lists and generated audio are stored in this browser and may be removed if browser data is cleared or evicted. Export audio you want to keep. Audio downloads as a WAV file.</p>
      <div class="cta" style="padding:0"><button class="btn" id="aboutClose">Close</button></div>`);
    $('#aboutClose', sheet.el).onclick = () => sheet.close();
  };
  renderHomeBody();
}

function renderHomeBody() {
  const box = $('#scroll');
  if (!box) return;
  const sorted = [...lists].sort((a, b) => b.updatedAt - a.updatedAt);
  $('#new')?.classList.toggle('hidden', !sorted.length || !!storageIssue);

  if (storageIssue) {
    box.innerHTML = `<div class="empty">
      <h2>Could not load your lists</h2>
      <p>Your saved lists may still be in this browser. Check local storage access and try again.</p>
      <button class="btn" id="retryStorage">Try again</button></div>`;
    $('#retryStorage').onclick = boot;
    return;
  }

  if (!sorted.length) {
    box.innerHTML = `<div class="empty">${EMPTY_ART}
      <h2>No lists yet</h2>
      <p>Create a list, paste your text (up to ${MAX_WORDS.toLocaleString()} words) and press Listen. Each voice needs an initial download; completed audio is saved on this device.</p>
      <button class="btn" id="first">${I.plus} Create your first list</button></div>`;
    $('#first').onclick = newList;
    return;
  }

  const showTip = isIOS && !isStandalone() && store.get('tipDismissed', '0') !== '1';
  const showSearch = sorted.length >= 6;
  box.innerHTML = `
    ${showTip ? `<div class="tip" id="tip"><span><b>Tip:</b> tap Share, then <b>Add to Home Screen</b> to use ListenList like an app.</span><button class="icon-btn" id="tipx" aria-label="Dismiss">${I.close}</button></div>` : ''}
    ${showSearch ? `<label class="search">${I.search}<input id="q" type="search" aria-label="Search your lists" placeholder="Search your lists" value="${esc(query)}" autocomplete="off" /></label>` : ''}
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
  try {
    await db.putList(l);
  } catch (err) {
    errorSheet('Could not create a list', err?.message || 'Check that this browser allows local storage, then try again.', newList);
    return;
  }
  lists.push(l);
  openList(l.id, true);
}

/* ---------- editor / reader ---------- */
async function openList(id, isNew = false) {
  cur = lists.find((l) => l.id === id);
  if (!cur) return renderHome();
  curAudio = null;
  try {
    if (cur.audio) curAudio = (await db.getAudio(id)) || null;
  } catch (err) {
    errorSheet('Could not open this list', err?.message || 'The saved audio or list could not be read.', () => openList(id, isNew));
    return;
  }
  if (!curAudio) cur.audio = null;
  mode = audioStatus(cur) === 'ready' && !isNew ? 'read' : 'write';
  renderEditor();
  if (isNew && mode === 'write') $('#title').focus();
}

function renderEditor() {
  stopPlayback();
  if (mode !== 'read') releaseAudioUrl();
  if (mode === 'read') return renderReader();
  const st = audioStatus(cur);
  app.innerHTML = `
    <section class="screen" id="editor">
      <div class="bar">
        <button class="icon-btn" id="back" aria-label="Back to lists">${I.back}</button>
        <input class="title-input" id="title" aria-label="List name" placeholder="List name" value="${esc(cur.title)}" maxlength="80" enterkeyhint="done" />
        <button class="icon-btn danger" id="del" aria-label="Delete list">${I.trash}</button>
      </div>
      <div class="editor-body">
        <textarea class="text" id="text" aria-label="Text to read aloud" aria-describedby="count note" placeholder="Paste or type your text here…" autocapitalize="sentences" spellcheck="true"></textarea>
        <button class="paste hidden" id="paste">${I.paste} Paste from clipboard</button>
      </div>
      <div class="note" id="note" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="panel">
        <div class="meter" id="meter"><i></i></div>
        <div class="meta">
          <span class="count" id="count"></span>
          <label class="voice"><span>Voice</span>
            <select id="voice" aria-label="Voice">${VOICES.map((v) => `<option value="${v.id}" ${v.id === cur.voice ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          </label>
        </div>
        <div class="voice-status" id="voiceStatus" role="status" aria-live="polite"></div>
      </div>
      <div class="cta">
        ${st === 'ready' ? `<button class="btn secondary" id="regen">Re-create</button>` : ''}
        <button class="btn" id="listen">${I.headphones}<span id="listenLabel"></span></button>
      </div>
    </section>`;
  const ta = $('#text');
  ta.value = cur.text;
  updateEditorMeta();
  updateVoiceAvailability(cur.voice);

  $('#back').onclick = () => finishEditing();
  $('#del').onclick = async () => {
    const ok = await confirmSheet({ title: 'Delete this list?', text: `“${cur.title || 'Untitled'}” and its audio will be removed from this device.`, action: 'Delete' });
    if (!ok) return;
    try {
      await db.deleteList(cur.id);
      lists = lists.filter((l) => l.id !== cur.id);
      renderHome();
    } catch (err) {
      errorSheet('Could not delete this list', err?.message || 'The list is still available. Please try again.', () => $('#del')?.click());
    }
  };
  $('#title').oninput = (e) => {
    cur.title = e.target.value;
    scheduleSave();
  };
  $('#title').onkeydown = (e) => {
    if (e.key === 'Enter') ta.focus();
  };
  ta.oninput = () => {
    cur.text = ta.value;
    updateEditorMeta();
    scheduleSave();
  };
  $('#paste').onclick = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast('The clipboard is empty.');
      ta.value = (ta.value ? ta.value + '\n\n' : '') + t.trim();
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
    updateVoiceAvailability(cur.voice);
    scheduleSave();
  };
  $('#listen').onclick = onListen;
  if ($('#regen')) $('#regen').onclick = () => startGeneration();
}

function updateEditorMeta() {
  const words = countWords(cur.text);
  const overLimit = !isWithinWordLimit(cur.text);
  const c = $('#count');
  c.textContent = `${words.toLocaleString()} / ${MAX_WORDS.toLocaleString()} words`;
  c.classList.toggle('full', overLimit);
  const m = $('#meter');
  m.classList.toggle('full', overLimit);
  $('i', m).style.width = Math.min(100, (words / MAX_WORDS) * 100) + '%';
  const st = audioStatus(cur);
  $('#listenLabel').textContent = st === 'ready' ? 'Play' : 'Listen';
  $('#listen').disabled = !words || overLimit;
  $('#paste').classList.toggle('hidden', words > 0 || !(navigator.clipboard && navigator.clipboard.readText));
  $('#note').textContent = overLimit
    ? `Your full text stays in this draft. Shorten it to ${MAX_WORDS.toLocaleString()} words or fewer to create audio.`
    : st === 'stale'
      ? 'Text or voice changed — the audio will be re-created when you press Listen.'
      : '';
}

async function updateVoiceAvailability(voiceId) {
  const check = ++voiceCheck;
  const status = $('#voiceStatus');
  if (!status) return;
  status.textContent = 'Checking whether this voice is already on this device…';
  try {
    const available = await voiceIsOnDevice(voiceId);
    if (check !== voiceCheck || !$('#voiceStatus')) return;
    $('#voiceStatus').textContent = available
      ? 'Voice files are stored on this device.'
      : 'First use needs internet to download this voice (about 60 MB). Each voice downloads separately.';
  } catch (err) {
    if (check === voiceCheck && $('#voiceStatus')) {
      $('#voiceStatus').textContent = `Could not check voice storage: ${err?.message || 'try again later.'}`;
    }
  }
}

function scheduleSave() {
  const target = cur;
  if (!target) return;
  target.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    db.putList(target).catch((err) => {
      if (cur === target) {
        errorSheet('Could not save your changes', err?.message || 'Your current edits are still on screen. Check browser storage and retry.', () => scheduleSave());
      }
    });
  }, 150);
}

async function finishEditing() {
  clearTimeout(saveTimer);
  if (cur) {
    if (!cur.title.trim()) cur.title = cur.text.trim().split(/\s+/).slice(0, 5).join(' ') || 'Untitled';
    if (!cur.text.trim() && !cur.audio) {
      try {
        await db.deleteList(cur.id);
      } catch (err) {
        errorSheet('Could not save this list', err?.message || 'The empty list could not be removed.', () => finishEditing());
        return;
      }
      lists = lists.filter((l) => l.id !== cur.id);
    } else {
      try {
        await db.putList(cur);
      } catch (err) {
        errorSheet('Could not save your changes', err?.message || 'Your edits are still on screen. Check browser storage and retry.', () => finishEditing());
        return;
      }
    }
  }
  renderHome();
}

async function onListen() {
  if (!cur || generationActive) return;
  if (!isWithinWordLimit(cur.text)) {
    toast(`Shorten this draft to ${MAX_WORDS.toLocaleString()} words or fewer before creating audio.`, 3600);
    return;
  }
  clearTimeout(saveTimer);
  try {
    await db.putList(cur);
  } catch (err) {
    errorSheet('Could not save your list', err?.message || 'Audio was not started. Check browser storage and try again.', () => onListen());
    return;
  }
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
  if (!cur || generationActive) return;
  if (!countWords(cur.text)) return;
  if (!isWithinWordLimit(cur.text)) {
    toast(`Shorten this draft to ${MAX_WORDS.toLocaleString()} words or fewer before creating audio.`, 3600);
    return;
  }
  generationActive = true;
  const target = cur;
  const controller = new AbortController();
  let sheet = null;
  let wake = null;
  try {
    clearTimeout(saveTimer);
    await db.putList(target);
    sheet = openSheet(`
    <h2 id="gTitle" role="status" aria-live="polite">Getting ready…</h2>
    <p id="gSub" aria-live="polite" aria-atomic="true">Keep this screen open while the audio is created on your device.</p>
    <div class="bar-track"><div class="bar-fill" id="gFill" role="progressbar" aria-label="Voice download and audio generation progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div></div>
    <div class="prog-meta"><span id="gLeft"></span><span id="gRight"></span></div>
    <button class="btn secondary" id="gCancel" style="width:100%">Cancel</button>`);
    const ov = sheet.el;
    const cancelGeneration = () => {
      $('#gTitle', ov).textContent = 'Stopping…';
      $('#gSub', ov).textContent = 'Cancelling the current download or generation…';
      controller.abort();
    };
    $('#gCancel', ov).onclick = cancelGeneration;
    sheet.onEscape = cancelGeneration;

    try {
      wake = await navigator.wakeLock?.request('screen');
    } catch (err) {
      console.warn('Could not keep the screen awake during generation.', err);
    }
    const voice = target.voice;
    const text = target.text;
    const started = performance.now();
    const res = await generateAudio({
      text,
      voiceId: voice,
      signal: controller.signal,
      onStatus: (s) => {
        const fill = $('#gFill', ov);
        if (!fill) return;
        fill.classList.toggle('indeterminate', s.phase === 'engine');
        if (s.phase !== 'engine') {
          fill.style.width = s.percent + '%';
          fill.setAttribute('aria-valuenow', String(s.percent));
          fill.removeAttribute('aria-valuetext');
        } else {
          fill.removeAttribute('aria-valuenow');
          fill.setAttribute('aria-valuetext', 'Starting the voice engine');
        }
        if (s.phase === 'model') {
          $('#gTitle', ov).textContent = 'Downloading the voice';
          $('#gSub', ov).textContent = 'About 60 MB. Saved in browser storage; it may need to be downloaded again if browser data is cleared or evicted.';
          $('#gLeft', ov).textContent = s.percent + '%';
          $('#gRight', ov).textContent = '';
        } else if (s.phase === 'engine') {
          $('#gTitle', ov).textContent = 'Starting the voice engine…';
          $('#gSub', ov).textContent = 'Almost there.';
          $('#gLeft', ov).textContent = '';
          $('#gRight', ov).textContent = '';
        } else {
          $('#gTitle', ov).textContent = 'Creating your audio';
          $('#gSub', ov).textContent = 'Keep this screen open. Speech is generated on this device.';
          $('#gLeft', ov).textContent = `${s.percent}% · part ${s.done} of ${s.total}`;
          $('#gRight', ov).textContent = s.etaSec != null ? `about ${fmtMin(s.etaSec)} left` : 'estimating…';
        }
      },
    });
    if (controller.signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
    $('#gTitle', ov).textContent = 'Saving your audio…';
    $('#gSub', ov).textContent = 'The speech is ready. Saving it to this device.';
    $('#gCancel', ov).disabled = true;
    sheet.onEscape = () => {};
    const hash = hashOf(text, voice);
    const audioRecord = { id: target.id, blob: res.blob, cues: res.cues, duration: res.duration, hash };
    const updatedList = { ...target, audio: { hash, duration: res.duration, size: res.blob.size }, updatedAt: Date.now() };
    await db.putGeneratedAudio(updatedList, audioRecord);
    target.audio = updatedList.audio;
    target.updatedAt = updatedList.updatedAt;
    curAudio = audioRecord;
    try {
      await navigator.storage?.persist?.();
    } catch (err) {
      console.warn('Could not request persistent browser storage.', err);
    }
    sheet.close();
    if (cur === target) {
      mode = 'read';
      renderEditor();
      toast(`Audio ready · made in ${fmtTime((performance.now() - started) / 1000)}`);
      togglePlay(true);
    }
  } catch (err) {
    sheet?.close();
    if (err?.name !== 'AbortError') {
      errorSheet(
        'Could not create or save the audio',
        (err?.message || 'Something went wrong.') + ' Your text remains saved. Check available storage and your connection, then try again or choose another voice.',
        () => startGeneration()
      );
    }
  } finally {
    try {
      wake?.release();
    } catch {}
    generationActive = false;
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

  releaseAudioUrl();
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

function releaseAudioUrl() {
  if (!audioUrl) return;
  URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  audio.removeAttribute('src');
  audio.load();
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
    audio.play().catch((err) => {
      setPlayIcon();
      toast(err?.name === 'NotAllowedError' ? 'Tap Play to start audio.' : `Could not start playback: ${err?.message || 'try again.'}`);
    });
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
  if (prev) {
    prev.classList.remove('on');
    prev.removeAttribute('aria-current');
  }
  activeCue = idx;
  const el = idx >= 0 ? reader.querySelector(`.s[data-i="${idx}"]`) : null;
  if (el) {
    el.classList.add('on');
    el.setAttribute('aria-current', 'location');
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
  try {
    const file = typeof File === 'function' ? new File([curAudio.blob], name + '.wav', { type: 'audio/wav' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: cur.title || 'ListenList' });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = name + '.wav';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`Saved · ${fmtMB(curAudio.blob.size)}`);
  } catch (err) {
    errorSheet('Could not save the audio file', err?.message || 'Try again or use a browser that supports WAV downloads.', () => saveAudioFile());
  }
}

/* ---------- boot ---------- */
async function boot() {
  try {
    lists = (await db.getAllLists()) || [];
    storageIssue = null;
  } catch (err) {
    lists = [];
    storageIssue = err?.message || 'Local storage is unavailable in this browser mode.';
  }
  renderHome();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Could not register the offline app worker.', err);
    });
  }
}

boot();

window.addEventListener('pagehide', () => {
  if (mode !== 'write' || !cur) return;
  clearTimeout(saveTimer);
  db.putList(cur).catch((err) => {
    console.error('Could not save the current draft while leaving the page.', err);
  });
});
