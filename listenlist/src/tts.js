// On-device text-to-speech (Piper voices running in the browser via ONNX/WASM).
// The voice model downloads once (~60MB), is stored on the device, and every
// list is turned into one audio file that plays offline afterwards.
// The heavy lifting happens in /tts-worker.js (model loaded once, several threads when available).

const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const voice = (id, label, hint, path) => ({ id, label, hint, modelUrl: `${HF}/${path}/${id}.onnx`, configUrl: `${HF}/${path}/${id}.onnx.json` });

export const VOICES = [
  voice('en_US-hfc_female-medium', 'Female · Natural', 'Best quality', 'en/en_US/hfc_female/medium'),
  voice('en_US-hfc_male-medium', 'Male · Natural', 'Best quality', 'en/en_US/hfc_male/medium'),
  voice('en_GB-alba-medium', 'Female · British', 'Best quality', 'en/en_GB/alba/medium'),
  voice('en_US-amy-low', 'Female · Fast', 'Faster, lighter', 'en/en_US/amy/low'),
  voice('en_US-ryan-low', 'Male · Fast', 'Faster, lighter', 'en/en_US/ryan/low'),
];
export const DEFAULT_VOICE = VOICES[0].id;
export const MAX_WORDS = 5000;

const CHUNK_CHARS = 260; // sentences are grouped up to this size per synthesis call
const MAX_PIECE = 300; // a single very long sentence gets split below this
const VOICE_CACHE = 'listenlist-voices-v1';
const APPROX_MODEL_BYTES = 63e6;

/* ---------- text helpers ---------- */

export function countWords(text) {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

export function isWithinWordLimit(text, max = MAX_WORDS) {
  return countWords(text) <= max;
}

export function hashOf(text, voice) {
  let h1 = 0xdeadbeef ^ voice.length;
  let h2 = 0x41c6ce57;
  const s = voice + '|' + text;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function speakable(raw) {
  return raw
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_#>`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split an overly long sentence into smaller pieces at commas/spaces. */
function splitLong(start, raw) {
  const out = [];
  let from = 0;
  while (raw.length - from > MAX_PIECE) {
    const window = raw.slice(from, from + MAX_PIECE);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
    if (cut < MAX_PIECE * 0.4) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = MAX_PIECE;
    out.push({ start: start + from, raw: raw.slice(from, from + cut + 1).trimEnd() });
    from += cut + 1;
  }
  if (from < raw.length) out.push({ start: start + from, raw: raw.slice(from) });
  return out;
}

/** Break the text into speakable sentences (with offsets), grouped into chunks. */
export function planChunks(text) {
  const chunks = [];
  const paraRe = /[^\n]+/g;
  let pm;
  while ((pm = paraRe.exec(text))) {
    const para = pm[0];
    const base = pm.index;
    const sentRe = /(?:[^.!?…]|[.!?…](?=[^\s"'”’)\]]))+(?:[.!?…]+["'”’)\]]*|$)/g;
    let sm;
    let current = null;
    const flush = (paraEnd) => {
      if (current) {
        current.paraEnd = paraEnd;
        chunks.push(current);
        current = null;
      }
    };
    while ((sm = sentRe.exec(para))) {
      const lead = sm[0].length - sm[0].trimStart().length;
      const raw = sm[0].trim();
      if (!/[\p{L}\p{N}]/u.test(raw)) continue;
      const pieces = raw.length > MAX_PIECE ? splitLong(base + sm.index + lead, raw) : [{ start: base + sm.index + lead, raw }];
      for (const p of pieces) {
        const spoken = speakable(p.raw);
        if (!spoken || !/[\p{L}\p{N}]/u.test(spoken)) continue;
        const sent = { start: p.start, end: p.start + p.raw.length, spoken };
        if (current && current.spoken.length + 1 + spoken.length > CHUNK_CHARS) flush(false);
        if (!current) current = { spoken: '', sents: [], paraEnd: false };
        current.spoken += (current.spoken ? ' ' : '') + spoken;
        current.sents.push(sent);
      }
    }
    flush(true);
  }
  return chunks;
}

/* ---------- WAV ---------- */

function wavHeader(sampleRate, numSamples) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o, str) => [...str].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  h.setUint32(4, 36 + numSamples * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  h.setUint32(16, 16, true);
  h.setUint16(20, 1, true);
  h.setUint16(22, 1, true);
  h.setUint32(24, sampleRate, true);
  h.setUint32(28, sampleRate * 2, true);
  h.setUint16(32, 2, true);
  h.setUint16(34, 16, true);
  w(36, 'data');
  h.setUint32(40, numSamples * 2, true);
  return h.buffer;
}

/* ---------- voice files (stored on the device in Cache Storage) ---------- */

async function hasVoice(v) {
  const cache = await caches.open(VOICE_CACHE);
  return !!(await cache.match(v.modelUrl)) && !!(await cache.match(v.configUrl));
}

/** Older versions kept voices in the browser's private file system; reuse them instead of downloading again. */
async function importLegacyVoice(v) {
  try {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('piper');
    const read = async (url) => (await (await dir.getFileHandle(url.split('/').at(-1))).getFile());
    const [model, conf] = [await read(v.modelUrl), await read(v.configUrl)];
    const cache = await caches.open(VOICE_CACHE);
    await cache.put(v.configUrl, new Response(conf));
    await cache.put(v.modelUrl, new Response(model));
    return true;
  } catch {
    return false;
  }
}

function abortError() {
  return new DOMException('The operation was cancelled.', 'AbortError');
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

async function downloadVoice(v, onStatus, signal) {
  const cache = await caches.open(VOICE_CACHE);
  throwIfAborted(signal);
  const confRes = await fetch(v.configUrl, { signal });
  if (!confRes.ok) throw new Error('Could not download the voice (' + confRes.status + ')');
  await cache.put(v.configUrl, confRes);

  throwIfAborted(signal);
  const res = await fetch(v.modelUrl, { signal });
  if (!res.ok || !res.body) throw new Error('Could not download the voice (' + res.status + ')');
  const total = Number(res.headers.get('Content-Length')) || APPROX_MODEL_BYTES;
  const reader = res.body.getReader();
  const parts = [];
  let loaded = 0;
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onStatus({ phase: 'model', percent: Math.min(99, Math.round((loaded / total) * 100)) });
    }
  } finally {
    reader.releaseLock();
  }
  throwIfAborted(signal);
  await cache.put(v.modelUrl, new Response(new Blob(parts), { headers: { 'Content-Type': 'application/octet-stream' } }));
}

export async function voiceIsOnDevice(voiceId) {
  try {
    const v = VOICES.find((x) => x.id === voiceId);
    return !!v && (await hasVoice(v));
  } catch {
    return false;
  }
}

/* ---------- worker ---------- */

function startWorker(v, threads, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker('/tts-worker.js');
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
    };
    const fail = (message) => {
      cleanup();
      worker.terminate();
      reject(new Error(message));
    };
    const onAbort = () => {
      cleanup();
      worker.terminate();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onerror = (e) => fail(e.message || 'The voice engine failed to start.');
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        cleanup();
        resolve(worker);
      } else if (e.data.type === 'error') fail(e.data.message);
    };
    worker.postMessage({ type: 'init', modelUrl: v.modelUrl, configUrl: v.configUrl, threads });
  });
}

function pickThreads() {
  if (!self.crossOriginIsolated) return 1;
  let flag = false;
  try {
    flag = localStorage.getItem('noThreads') === '1';
  } catch {}
  if (flag) return 1;
  return Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
}

async function openWorker(v, signal) {
  const threads = pickThreads();
  try {
    return await startWorker(v, threads, signal);
  } catch (err) {
    if (signal?.aborted || threads === 1) throw err;
    // Multi-threading may not be available on this device: try a single thread, and only if that works remember it.
    let worker;
    try {
      worker = await startWorker(v, 1, signal);
    } catch {
      throw signal?.aborted ? abortError() : err;
    }
    try {
      localStorage.setItem('noThreads', '1');
    } catch {}
    return worker;
  }
}

/* ---------- generation ---------- */

/**
 * Turn text into a single WAV file plus sentence timestamps ("cues").
 * onStatus({ phase: 'model'|'engine'|'audio', percent, done, total, etaSec })
 */
export async function generateAudio({ text, voiceId, onStatus, signal }) {
  if (!isWithinWordLimit(text)) throw new Error(`The limit is ${MAX_WORDS.toLocaleString()} words. Shorten the text to create audio; your full draft is preserved.`);
  const chunks = planChunks(text);
  if (!chunks.length) throw new Error('There is no readable text in this list yet.');
  const v = VOICES.find((x) => x.id === voiceId) || VOICES[0];

  // 1) make sure the voice is on this device
  if (!(await hasVoice(v)) && !(await importLegacyVoice(v))) {
    await downloadVoice(v, onStatus, signal);
  }
  throwIfAborted(signal);

  // 2) start the engine once
  onStatus({ phase: 'engine', percent: 0 });
  const worker = await openWorker(v, signal);

  // 3) synthesize all chunks in the worker, receiving audio as it is produced
  const parts = [];
  const cues = [];
  let sampleRate = 22050;
  let totalSamples = 0;
  let charsDone = 0;
  const totalChars = chunks.reduce((n, c) => n + c.spoken.length, 0);
  const t0 = performance.now();

  try {
    throwIfAborted(signal);
    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      const end = (fn, arg) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(arg);
      };
      const onAbort = () => end(reject, abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) return onAbort();
      worker.onerror = (e) => end(reject, new Error(e.message || 'The voice engine stopped unexpectedly.'));
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'error') return end(reject, new Error(m.message));
        if (m.type === 'done') return end(resolve);
        if (m.type !== 'chunk') return;

        const c = chunks[m.i];
        sampleRate = m.sampleRate;
        const pause = new Int16Array(Math.round(sampleRate * (c.paraEnd ? 0.7 : 0.25)));
        parts.push(m.samples, pause);

        // spread this chunk's duration over its sentences by length
        const chunkStart = totalSamples / sampleRate;
        const chunkDur = (m.samples.length + pause.length) / sampleRate;
        const weight = c.sents.reduce((n, s) => n + s.spoken.length, 0);
        let acc = 0;
        for (const s of c.sents) {
          const a = acc / weight;
          acc += s.spoken.length;
          cues.push({ s: s.start, e: s.end, t0: chunkStart + a * chunkDur, t1: chunkStart + (acc / weight) * chunkDur });
        }
        totalSamples += m.samples.length + pause.length;

        charsDone += c.spoken.length;
        const elapsed = (performance.now() - t0) / 1000;
        const etaSec = charsDone > 300 ? Math.round((elapsed / charsDone) * (totalChars - charsDone)) : null;
        onStatus({ phase: 'audio', percent: Math.round((charsDone / totalChars) * 100), done: m.i + 1, total: chunks.length, etaSec });
      };
      worker.postMessage({ type: 'run', texts: chunks.map((c) => c.spoken) });
    });
  } finally {
    worker.terminate(); // frees the model memory (important on phones)
  }

  const blob = new Blob([wavHeader(sampleRate, totalSamples), ...parts], { type: 'audio/wav' });
  return { blob, cues, duration: totalSamples / sampleRate };
}
