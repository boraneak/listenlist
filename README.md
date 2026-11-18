# ListenList

ListenList turns text into speech in your browser. Choose one of the included English voices, create a WAV, listen with playback controls, and save the audio file.

- Speech is synthesized locally in a Web Worker with Piper, ONNX Runtime Web, and WebAssembly.
- Lists and generated audio are stored in this browser on this device. The app code does not upload the text; voice model files are downloaded from Hugging Face when needed.
- Optional title suggestions, section organization, reading notes, and comprehension questions use Chrome's built-in on-device AI when available. They do not use Firebase or send the text to a cloud model. This requires a supported desktop Chrome browser and compatible hardware; Chrome may download its model the first time. The tools are unavailable in browsers without the built-in model.
- Five English voices are available. Each selected voice may require its own first-time model download of about 60 MB.
- Text over 5,000 whitespace-separated words stays in the draft but cannot be generated until shortened.

## Requirements and limitations

Use a modern browser with Web Workers, WebAssembly, IndexedDB, Cache Storage, and audio playback. This repository does not maintain a verified browser/device compatibility matrix. Installation, clipboard access, file sharing, background playback, and lock-screen controls vary by browser and operating system.

The app uses cross-origin isolation headers to enable multi-threaded inference where supported. Without that capability, it falls back to one thread. Deployments other than Vercel must send both `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; see [vite.config.js](listenlist/vite.config.js) and [vercel.json](listenlist/vercel.json).

## Local development

```sh
cd listenlist
npm ci
npm run dev
```

Open the local URL printed by Vite. The development server does not register the production service worker. It serves the app and engine locally, but the selected voice model still needs to be downloaded from Hugging Face the first time.

## Build and checks

```sh
cd listenlist
npm test
npm run build
npm run preview
```

`npm test` runs the focused text-processing tests with Node's built-in test runner. `npm run build` copies the engine files from `node_modules` to ignored `public/vendor/`, then creates the production site in `dist/`. `npm run preview` serves that build locally, including the production service worker. There are no configured lint or type-check scripts.

## Deploy to Vercel

1. Import this repository into Vercel.
2. Set **Root Directory** to `listenlist`.
3. Use `npm run build` as the build command and `dist` as the output directory.

The included [vercel.json](listenlist/vercel.json) supplies the isolation headers and cache settings. Other static hosts need equivalent headers and must serve the built `dist/` directory over HTTPS (localhost is also a secure context for local testing).

## Local data and offline behavior

- Drafts and list metadata are stored in IndexedDB. Generated WAV files are stored there too; voice model/config files use Cache Storage.
- The production service worker precaches the app shell and static assets during installation, then caches same-origin resources when requested. A new service-worker version waits for tabs using the previous version to close; there is no in-app update prompt.
- A voice model is not bundled with the app. Its first download requires an internet connection. Each voice is downloaded separately.
- For offline speech generation, the selected voice and the app's local engine resources must already be cached. Completing a generation while online requests those resources. Existing generated audio can be played offline when the app shell and stored audio are still available.
- Browser storage is private to the site and may be cleared or evicted by the browser or device. Export WAV files you need to keep; there is no cloud backup or cross-device sync.
- The service worker is only registered in production, not during `npm run dev`. Offline and background behavior has not been verified on every browser or device.

## Playback and export

Generated audio is a WAV file containing mono, 16-bit PCM samples at the voice model's sample rate. The reader provides play/pause, seeking, 15-second skips, playback speed, and approximate sentence highlighting. Export uses the browser's file-sharing UI when supported, otherwise a `.wav` download. MP3 export is not provided.

## Licenses

ListenList's own code is under the [MIT License](LICENSE). Third-party assets retain their own licenses; the app's MIT license does not relicense them.

- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) is MIT-licensed.
- [piper-wasm](https://github.com/diffusionstudio/piper-wasm) is MIT-licensed and includes/builds on [espeak-ng](https://github.com/espeak-ng/espeak-ng), which is GPL-3.0. The build copies these engine files into the production site; review and include the applicable upstream notices and license materials when distributing the site.
- Piper voice model weights are fetched from the [diffusionstudio/piper-voices repository](https://huggingface.co/diffusionstudio/piper-voices). The individual voice/model terms can differ; review the model card and license for the selected voice before redistributing weights or using generated audio in a way that requires additional rights.
