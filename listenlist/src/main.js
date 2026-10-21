import './style.css';
import * as db from './db.js';
import { VOICES, DEFAULT_VOICE, MAX_WORDS, countWords, clampWords, hashOf, generateAudio } from './tts.js';

/* ---------- icons ---------- */
const I = {
  back: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
  play: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z"/></svg>',
  pause: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>',
  back15: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 108-8H8M8 1L5 4l3 3"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>',
  fwd15: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-8-8h4M16 1l3 3-3 3"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>',
  save: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>',
  headphones: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>',
};

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

function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  app.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------- state ---------- */
const app = $('#app');
let lists = [];
let cur = null; // list being edited / read
let curAudio = null; // { blob, cues, duration, hash } for cur
let mode = 'write'; // 'write' | 'read'
let audioUrl = null;
const audio = new Audio();
audio.preload = 'auto';
let saveTimer = null;
let activeCue = -1;
let dragging = false;
let speed = Number(localStorage.getItem('speed')) || 1;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const audioStatus = (l) => {
  if (!l.audio) return 'none';
  return l.audio.hash === hashOf(l.text, l.voice) ? 'ready' : 'stale';
};

/* ---------- home ---------- */
function renderHome() {
  stopPlayback();
  cur = null;
  const sorted = [...lists].sort((a, b) => b.updatedAt - a.updatedAt);
  app.innerHTML = `
    <section class="screen" id="home">
      <div class="bar"><h1>ListenList</h1></div>
      <div class="list">
        ${
          sorted.length
            ? sorted.map(cardHtml).join('')
            : `<div class="empty"><b>No lists yet</b>Create a list, paste your text (up to ${MAX_WORDS.toLocaleString()} words) and press Listen. Your audio is saved on this phone so it plays offline.</div>`
        }
      </div>
      <button class="fab" id="new">${I.plus} New list</button>
    </section>`;
  $('#new').onclick = newList;
  app.querySelectorAll('.card').forEach((c) => (c.onclick = () => openList(c.dataset.id)));
}

function cardHtml(l) {
  const words = countWords(l.text);
  const st = audioStatus(l);
  const pill =
    st === 'ready'
      ? `<span class="pill ready"><i class="dot"></i>Audio ready · ${fmtMin(l.audio.duration)}</span>`
      : st === 'stale'
        ? `<span class="pill stale"><i class="dot"></i>Audio outdated</span>`
        : `<span class="pill stale">Text only</span>`;
  return `<button class="card" data-id="${l.id}">
    <div class="t">${esc(l.title || 'Untitled')}</div>
    <div class="s"><span>${words.toLocaleString()} words</span>${pill}</div>
  </button>`;
}

async function newList() {
  const l = { id: uid(), title: '', text: '', voice: localStorage.getItem('voice') || DEFAULT_VOICE, updatedAt: Date.now(), audio: null };
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
  if (isNew) $('#title').focus();
}

function renderEditor() {
  stopPlayback();
  if (mode === 'read') return renderReader();
  const words = countWords(cur.text);
  const st = audioStatus(cur);
  app.innerHTML = `
    <section class="screen" id="editor">
      <div class="bar">
        <button class="icon-btn" id="back" aria-label="Back to lists">${I.back}</button>
        <input class="title-input" id="title" placeholder="List name" value="${esc(cur.title)}" maxlength="80" enterkeyhint="done" />
        <button class="icon-btn" id="del" aria-label="Delete list">${I.trash}</button>
      </div>
      <div class="editor-body">
        <textarea class="text" id="text" placeholder="Paste or type your text here…" autocapitalize="sentences" spellcheck="true"></textarea>
        <div class="note" id="note"></div>
        <div class="meta">
          <span class="count" id="count"></span>
          <select id="voice" aria-label="Voice">${VOICES.map((v) => `<option value="${v.id}" ${v.id === cur.voice ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        </div>
      </div>
      <div class="cta">
        ${st === 'ready' ? `<button class="btn secondary" id="regen">Re-create</button>` : ''}
        <button class="btn" id="listen" ${words ? '' : 'disabled'}>${I.headphones}<span id="listenLabel"></span></button>
      </div>
    </section>`;
  const ta = $('#text');
  ta.value = cur.text;
  updateEditorMeta();

  $('#back').onclick = () => finishEditing();
  $('#del').onclick = async () => {
    if (!confirm(`Delete “${cur.title || 'Untitled'}” and its audio?`)) return;
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
  $('#voice').onchange = (e) => {
    cur.voice = e.target.value;
    localStorage.setItem('voice', cur.voice);
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
  const st = audioStatus(cur);
  $('#listenLabel').textContent = st === 'ready' ? 'Play' : 'Listen';
  $('#listen').disabled = !words;
  $('#note').textContent =
    st === 'stale' ? 'Text or voice changed — the audio will be re-created when you press Listen.' : '';
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
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <h2 id="gTitle">Getting ready…</h2>
    <p id="gSub">Keep this screen open while the audio is created on your phone. Nothing is uploaded.</p>
    <div class="bar-track"><div class="bar-fill" id="gFill"></div></div>
    <div class="prog-meta"><span id="gLeft"></span><span id="gRight"></span></div>
    <button class="btn secondary" id="gCancel" style="width:100%">Cancel</button>
  </div>`;
  app.appendChild(ov);
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
  try {
    const res = await generateAudio({
      text,
      voiceId: voice,
      isCancelled: () => cancelled,
      onStatus: (s) => {
        $('#gFill', ov).style.width = s.percent + '%';
        if (s.phase === 'model') {
          $('#gTitle', ov).textContent = 'Downloading the voice (first time only)';
          $('#gSub', ov).textContent = 'About 60 MB. It is saved on your phone, so you will not need to download it again.';
          $('#gLeft', ov).textContent = s.percent + '%';
          $('#gRight', ov).textContent = '';
        } else {
          $('#gTitle', ov).textContent = 'Creating your audio';
          $('#gSub', ov).textContent = 'Keep this screen open. Nothing is uploaded — it all happens on your phone.';
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
    ov.remove();
    mode = 'read';
    renderEditor();
    toast('Audio ready — saved on this phone');
    togglePlay(true);
  } catch (err) {
    ov.remove();
    if (String(err && err.message) !== 'cancelled') {
      const offline = !navigator.onLine;
      alert(
        offline
          ? 'You are offline. The first time you create audio you need internet to download the voice. After that it works offline.'
          : 'Could not create the audio: ' + (err && err.message ? err.message : 'unknown error') + '\nTry again, or pick another voice.'
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
          <button class="chip" id="speed" aria-label="Speed"></button>
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
    localStorage.setItem('speed', String(speed));
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
