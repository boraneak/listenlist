// On-device text-to-speech (Piper voices running in the browser via ONNX/WASM).
// The voice model downloads once (~60MB), is stored on the device, and every
// list is turned into one audio file that plays offline afterwards.

export const VOICES = [
  { id: 'en_US-hfc_female-medium', label: 'Female · natural' },
  { id: 'en_US-hfc_male-medium', label: 'Male · natural' },
  { id: 'en_GB-alba-medium', label: 'Female · British' },
  { id: 'en_US-amy-low', label: 'Female · compact file' },
];
export const DEFAULT_VOICE = VOICES[0].id;
export const MAX_WORDS = 5000;

const CHUNK_CHARS = 240; // sentences are grouped up to this size per synthesis call
const MAX_PIECE = 280; // a single very long sentence gets split below this

let vitsPromise;
const loadVits = () => (vitsPromise ||= import('@diffusionstudio/vits-web'));

/* ---------- text helpers ---------- */

export function countWords(text) {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

/** Cut text to the first MAX_WORDS words. Returns the (possibly shortened) text. */
export function clampWords(text, max = MAX_WORDS) {
  const re = /\S+/g;
  let n = 0;
  let m;
  while ((m = re.exec(text))) {
    if (++n > max) return text.slice(0, m.index).trimEnd();
  }
  return text;
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

/* ---------- WAV helpers ---------- */

function readWav(buf) {
  const v = new DataView(buf);
  const sampleRate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  let pos = 12;
  while (pos + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(pos), v.getUint8(pos + 1), v.getUint8(pos + 2), v.getUint8(pos + 3));
    const size = v.getUint32(pos + 4, true);
    if (id === 'data') {
      const len = Math.min(size, v.byteLength - (pos + 8));
      if (bits !== 16) throw new Error('Unexpected audio format');
      const samples = new Int16Array(len >> 1);
      for (let i = 0; i < samples.length; i++) samples[i] = v.getInt16(pos + 8 + i * 2, true);
      return { sampleRate, samples };
    }
    pos += 8 + size + (size & 1);
  }
  throw new Error('Could not read audio');
}

function wavHeader(sampleRate, numSamples) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
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

/* ---------- generation ---------- */

/**
 * Turn text into a single WAV file plus sentence timestamps ("cues").
 * onStatus({ phase: 'model'|'audio', percent, done, total, etaSec })
 */
export async function generateAudio({ text, voiceId, onStatus, isCancelled }) {
  const chunks = planChunks(text);
  if (!chunks.length) throw new Error('There is no readable text in this list yet.');

  const vits = await loadVits();

  // 1) make sure the voice model is on this device
  const stored = await vits.stored().catch(() => []);
  if (!stored.includes(voiceId)) {
    const seen = new Map();
    await vits.download(voiceId, (p) => {
      seen.set(p.url, p);
      let loaded = 0;
      let total = 0;
      seen.forEach((x) => {
        loaded += x.loaded;
        total += x.total;
      });
      onStatus({ phase: 'model', percent: total ? Math.round((loaded / total) * 100) : 0 });
    });
  }
  if (isCancelled()) throw new Error('cancelled');

  // 2) synthesize chunk by chunk
  const parts = [];
  const cues = [];
  let sampleRate = 0;
  let totalSamples = 0;
  let charsDone = 0;
  const totalChars = chunks.reduce((n, c) => n + c.spoken.length, 0);
  const t0 = performance.now();

  for (let i = 0; i < chunks.length; i++) {
    if (isCancelled()) throw new Error('cancelled');
    const c = chunks[i];
    let wav;
    try {
      wav = await vits.predict({ text: c.spoken, voiceId });
    } catch (err) {
      if (isCancelled()) throw new Error('cancelled');
      wav = await vits.predict({ text: c.spoken, voiceId }); // one retry
    }
    const { sampleRate: sr, samples } = readWav(await wav.arrayBuffer());
    sampleRate ||= sr;

    const pause = new Int16Array(Math.round(sampleRate * (c.paraEnd ? 0.7 : 0.25)));
    parts.push(samples, pause);

    // spread the chunk's duration over its sentences by length
    const chunkStart = totalSamples / sampleRate;
    const chunkDur = (samples.length + pause.length) / sampleRate;
    const weight = c.sents.reduce((n, s) => n + s.spoken.length, 0);
    let acc = 0;
    for (const s of c.sents) {
      const a = acc / weight;
      acc += s.spoken.length;
      cues.push({ s: s.start, e: s.end, t0: chunkStart + a * chunkDur, t1: chunkStart + (acc / weight) * chunkDur });
    }
    totalSamples += samples.length + pause.length;

    charsDone += c.spoken.length;
    const elapsed = (performance.now() - t0) / 1000;
    const etaSec = charsDone > 300 ? Math.round((elapsed / charsDone) * (totalChars - charsDone)) : null;
    onStatus({ phase: 'audio', percent: Math.round((charsDone / totalChars) * 100), done: i + 1, total: chunks.length, etaSec });
  }

  const blob = new Blob([wavHeader(sampleRate, totalSamples), ...parts], { type: 'audio/wav' });
  return { blob, cues, duration: totalSamples / sampleRate };
}
