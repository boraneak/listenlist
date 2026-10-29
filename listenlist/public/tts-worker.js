/* ListenList voice worker.
 *
 * Runs the Piper text-to-speech model fully on the device. Unlike a one-shot call per sentence,
 * this worker loads the model and the phonemizer ONCE and then synthesizes sentence groups in a loop,
 * which is where most of the speed-up comes from. With cross-origin isolation it also uses several threads.
 *
 * Messages in : { type: 'init', modelUrl, configUrl, threads }  |  { type: 'run', texts: string[] }
 * Messages out: { type: 'ready', threads } | { type: 'chunk', i, samples, sampleRate } | { type: 'done' } | { type: 'error', stage, message }
 */
const VENDOR = '/vendor/';
const CACHE = 'listenlist-voices-v1';

let session = null;
let config = null;
let phonemizer = null;
let phonemeBuffer = [];

try {
  importScripts(VENDOR + 'ort.wasm.min.js', VENDOR + 'piper_phonemize.js');
} catch (err) {
  postMessage({ type: 'error', stage: 'load', message: 'Could not load the voice engine: ' + (err && err.message) });
}

async function readCached(url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (!hit) throw new Error('Voice file is missing from this device. Please create the audio again.');
  return hit;
}

async function init({ modelUrl, configUrl, threads }) {
  const ort = self.ort;
  ort.env.wasm.wasmPaths = self.location.origin + VENDOR;
  ort.env.wasm.numThreads = threads;
  ort.env.wasm.proxy = false;

  config = JSON.parse(await (await readCached(configUrl)).text());
  const model = new Uint8Array(await (await readCached(modelUrl)).arrayBuffer());
  session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  phonemizer = await self.createPiperPhonemize({
    print: (line) => {
      try {
        phonemeBuffer.push(JSON.parse(line).phoneme_ids);
      } catch (e) {
        /* ignore non-JSON log lines */
      }
    },
    printErr: () => {},
    locateFile: (file) => self.location.origin + VENDOR + file,
  });
  postMessage({ type: 'ready', threads });
}

function phonemize(text) {
  phonemeBuffer = [];
  phonemizer.callMain([
    '-l', config.espeak.voice,
    '--input', JSON.stringify([{ text }]),
    '--espeak_data', '/espeak-ng-data',
  ]);
  return phonemeBuffer[0] || [];
}

async function synth(ids) {
  const ort = self.ort;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([
      config.inference.noise_scale,
      config.inference.length_scale,
      config.inference.noise_w,
    ]), [3]),
  };
  if (config.speaker_id_map && Object.keys(config.speaker_id_map).length) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
  }
  const out = (await session.run(feeds)).output.data; // Float32Array
  const pcm = new Int16Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    pcm[i] = s >= 1 ? 32767 : s <= -1 ? -32768 : (s * 32768) | 0;
  }
  return pcm;
}

async function run({ texts }) {
  const sampleRate = config.audio.sample_rate;
  for (let i = 0; i < texts.length; i++) {
    const ids = phonemize(texts[i]);
    const samples = ids.length ? await synth(ids) : new Int16Array(0);
    postMessage({ type: 'chunk', i, samples, sampleRate }, [samples.buffer]);
  }
  postMessage({ type: 'done' });
}

onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') await init(msg);
    else if (msg.type === 'run') await run(msg);
  } catch (err) {
    postMessage({ type: 'error', stage: msg.type, message: String((err && err.message) || err) });
  }
};
