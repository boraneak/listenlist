# ListenList

Paste text (up to 5,000 words) into a list, press **Listen**, and it is read aloud by a free
on-device voice. The audio is saved on your phone, plays offline, and can be exported as a file.

- No server, no accounts, no API keys. Everything stays on the device.
- Voice: Piper models running in the browser (`@diffusionstudio/vits-web`). The ~60 MB voice downloads once.
- Lock-screen controls, speed control, sentence highlighting, installable PWA.

## Run locally
    npm install
    npm run dev

## Deploy to Vercel (free Hobby plan)
1. Push this folder to a GitHub repo.
2. vercel.com -> Add New -> Project -> import the repo. Vite is detected automatically
   (build: `npm run build`, output: `dist`). Click Deploy.
   Or from a terminal: `npx vercel --prod`.

## On iPhone
Open the Vercel URL in Safari -> Share -> Add to Home Screen. Open it from the Home Screen icon.
