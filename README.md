# ListenList

Create a list, paste your text (up to 5,000 words) and press **Listen**. The text is read aloud by a free
on-device voice. Your audio is saved on this device so it plays offline, and you can export it as a file.

- No server, no account, no API keys. Everything stays on your device.
- Mobile-first. On a PC the app is shown in a phone-sized frame.
- Voice: [Piper](https://github.com/rhasspy/piper) models running in the browser (ONNX Runtime + WebAssembly).
  The voice (~60 MB) downloads once the first time you press Listen.
- Lock-screen controls, playback speed, sentence highlighting, installable PWA.

## Project layout

```
README.md          <- you are here
listenlist/        <- the app (Vite). Set this as the Root Directory in Vercel.
  src/             <- UI, storage and audio logic
  public/          <- icons, manifest, service worker, voice worker
  scripts/         <- copies the voice-engine files into public/vendor at build time
```

## Run locally

```bash
cd listenlist
npm install
npm run dev
```

## Deploy to Vercel (free Hobby plan)

1. Import this GitHub repo at vercel.com/new.
2. Set **Root Directory** to `listenlist`. Vite is detected automatically (build `npm run build`, output `dist`).
3. Deploy. Every push to `master` redeploys.

`listenlist/vercel.json` sends the `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers that let
the voice engine use several CPU threads. Without them it still works, just on one thread.

## Use on iPhone

Open the Vercel link in Safari, tap Share, then **Add to Home Screen**, and open ListenList from the Home Screen icon.

## How the voice is made faster

- The voice model and phonemizer are loaded **once** per list, not once per sentence.
- Sentences are generated on a background worker with several threads when the browser allows it.
- The engine files are served from the app itself (no CDN), so they are cached for offline use.
- "Fast" voices (marked *Faster, lighter*) trade some quality for speed.
