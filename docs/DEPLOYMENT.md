# Deploying to Vercel

ARcane is a static Vite application. The root-level `vercel.json` sets the framework, runs `npm ci`, builds with `npm run build`, and publishes `dist/`.

## First deployment

1. Import the GitHub repository into Vercel and keep the project root as `.`.
2. Use the `main` branch for production. Vercel reads the build settings from `vercel.json`; no environment variables or server functions are required.
3. Deploy. The install step runs the `postinstall` hook, which stages the MediaPipe WASM files and downloads the hand-landmarker model. Vite copies those runtime files, the creature models, and the gnome illustrations into `dist/`.

The camera requires a secure context, so test the deployed HTTPS URL and grant camera permission. For a local production check, run `npm run build && npm run preview`.

Blender `.blend` sources and autosave backups are excluded from Vercel CLI uploads by `.vercelignore`; they are not needed to run the site.
