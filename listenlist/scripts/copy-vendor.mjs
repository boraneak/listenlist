// Copies the voice-engine files (ONNX runtime + phonemizer) out of node_modules into public/vendor,
// so the app serves them from its own origin (no CDN, works offline, enables multi-threading).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/vendor');
mkdirSync(out, { recursive: true });

const files = [
  ['node_modules/onnxruntime-web/dist/ort.wasm.min.js', 'ort.wasm.min.js'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm', 'ort-wasm-simd.wasm'],
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js', 'piper_phonemize.js'],
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm', 'piper_phonemize.wasm'],
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data', 'piper_phonemize.data'],
];
for (const [from, to] of files) {
  const src = resolve(root, from);
  if (!existsSync(src)) throw new Error('Missing ' + from + ' — run npm install first');
  cpSync(src, resolve(out, to));
}
console.log('voice engine files copied to public/vendor');
