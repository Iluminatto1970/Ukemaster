# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands
- **Install dependencies**: `npm install`
- **Run development server**: `npm run dev`
- **Build for production**: `npm run build`
- **Start built server**: `npm start`
- **Run lint / type‑check**: `npm run lint`
- **Run a single test** (if a test framework is added later): `npm test -- <test‑file>`
- **Clean artifacts**: `npm run clean`
- **Fetch external HTML via API** (used by the app): `curl -X POST http://localhost:3000/api/fetch-url -H "Content-Type: application/json" -d '{"url":"https://example.com"}'`

## High‑Level Architecture
- **Frontend**: React 19 SPA built with Vite. Entry point `src/main.tsx` renders `<App/>`. UI components live under `src/components/` (e.g., `Header`, `Sidebar`, `Dashboard`, `SongViewer`). Utility functions under `src/utils/` handle audio processing, chord calculations, SEO, and AdSense integration. State is managed with React `useState` / `useEffect`; persistence via `localStorage`.
- **Backend**: Minimal Express server (`server.ts`) on port 3000. Provides two endpoints:
  - `POST /api/fetch-url` – proxy to fetch arbitrary external URLs (used for chord/song lookup). No authentication, potential SSRF risk.
  - `GET /api/health` – health check.
  In development the server runs Vite middleware for hot‑reloading; in production it serves static files from `dist`.
- **Build System**: Vite handles bundling, Tailwind CSS integration via `@tailwindcss/vite`. TypeScript configuration in `tsconfig.json`; linting via `tsc --noEmit` (script `lint`).
- **Configuration**: Environment variables loaded via `dotenv` (e.g., AdSense client ID). Vite alias `@` points to the project root.
- **Data**: Static data (`src/data/chords.ts`, `src/data/defaultSongs.ts`) provides chord definitions and a starter song list. No database; all mutable data lives in client‑side storage.
- **AdSense**: Managed by `src/utils/adsense.ts`; configuration injected at runtime.

## Suggested Practices for Future Work
- When adding new server routes, validate input and whitelist allowed external domains for the fetch proxy.
- Consider moving authentication to a proper backend service and storing tokens in HttpOnly cookies.
- Split large components into lazy‑loaded chunks to improve initial load time.
- Use React Context or a state‑management library for shared state beyond simple `useState`.
- Keep `package-lock.json` in version control to ensure reproducible builds.
- Run `npm run lint` before committing to catch type errors.
