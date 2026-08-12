# Project Analysis Report

## Architecture
- React SPA compiled by Vite → UI.
- Express server (port 3000) proxies external URLs, serves built assets.
- No DB; data lives in client‑side JSON (`defaultSongs.ts`, `chords.ts`).
- LocalStorage persists songs, playlists, user, AdSense config.
- Utility modules (`audio.ts`, `chordUtils.ts`, `pitchDetector.ts`) expose pure functions.
- Component tree: `App` → `Header`/`Sidebar` + dynamic view (`Dashboard`, `SongList`, `SongViewer`, `PlaylistManager`, `ChordDictionary`, `Tuner`, `StrummingGuide`).
- AdSense handled via `adsense.ts` (config, script injection).

## Data Flow
- UI → React `useState` (songs, playlists, UI flags).
- Effects sync each slice to LocalStorage (`LOCAL_STORAGE_*_KEY`).
- `handleSaveSong` merges/imports incoming songs into state, writes back via effect.
- Auth modal stores user in state & LocalStorage; no server‑side verification.
- `server.ts` provides `/api/fetch-url` → fetch external HTML (CORS‑bypass).
- Components import utils/types; utils are pure, no side effects.

## Security
- Auth data only client‑side → vulnerable to tampering.
- `/api/fetch-url` fetches arbitrary URLs → potential SSRF, no origin whitelist, no rate limiting.
- AdSense config sanitizes publisher ID but no validation of other fields.
- No CSP or HTTP‑only cookies; XSS risk from unescaped user‑provided content (song titles, descriptions).
- LocalStorage accessible to any script on page.

## Performance
- All data loaded into memory at start (full song list).
- No code‑splitting → every component bundle shipped initially.
- `useEffect` writes to LocalStorage on every state change (songs, playlists, user, repertoire).
- Audio context created lazily but not reused across components → multiple `AudioContext` instances if `getAudioContext` called from different modules before singleton set.
- Search (`searchQuery`) triggers state update on each keystroke, re‑renders full list.

## Recommendations
- **State**: introduce Context/Redux for global slices; debounce `searchQuery` to reduce renders.
- **Auth**: move auth to server‑side, issue JWT, store token in HttpOnly cookie.
- **API**: whitelist domains for `/api/fetch-url`, add rate limiting, validate URL scheme.
- **Security**: sanitize all user‑generated strings before injection into DOM; CSP header via server.
- **Performance**: lazy‑load heavy components (`Dashboard`, `SongViewer`, `PlaylistManager`); memoize song list rows (`React.memo`).
- **Config**: centralize environment variables (`VITE_ADSENSE_CLIENT_ID`, API base) in `.env`; expose via Vite alias.
- **Audio**: ensure single `AudioContext` instance (export singleton) to avoid resource spikes.
- **Testing**: add unit tests for utils (`chordUtils`, `audio`, `pitchDetector`); integration tests for server endpoints.
- **Code hygiene**: remove duplicate imports, enforce consistent alias (`@`), enforce lint rules for circular import detection.
