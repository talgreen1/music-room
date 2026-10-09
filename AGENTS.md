# Music Room contributor instructions

These instructions apply to the whole repository. Follow the user's explicit
instructions when they override this guide. Read relevant code before editing;
use [README.md](README.md) for current behavior, [HIGH_LEVEL_DESIGN.md](HIGH_LEVEL_DESIGN.md)
for architecture, [DETAILED_PLAN.md](DETAILED_PLAN.md) for stories, and
[TESTING.md](TESTING.md) for coverage and acceptance procedures.

## Required for every new feature or behavior change

1. **Add or update meaningful tests.** Cover the new behavior, relevant edge cases
   and affected permissions. Add unit tests for logic and integration tests for
   backend/storage flows. For browser or physical-device behavior that cannot be
   proved by those tests, add an explicit acceptance procedure in `TESTING.md` and
   state whether it has actually been run. Bug fixes need regression coverage.
2. **Update `README.md` in the same change.** Describe the final user-facing behavior,
   controls, configuration/deployment changes and material limitations. Remove
   stale instructions; do not merely append contradictory release notes.
3. Keep the coverage map in `TESTING.md` current. Add/update checkbox stories in
   `DETAILED_PLAN.md` for substantial features, and architecture documents when
   responsibilities, data shapes or source/backend boundaries change.
4. Run appropriate checks and report their results and limits. Do not claim a
   feature is fully verified from a build alone, mocked browser APIs, or local
   authorization tests when production permissions changed.

## Product and permissions

- Mobile browser app for musicians; Android/iPhone users need no native app or
  musician account. Keep the dark UI compact and prioritize document view space.
- Room creators are **Masters**; joiners are **Followers**. Only the Master may
  change the shared source, page, zoom or scroll position. Enforce this in the
  backend, not just by hiding controls.
- Followers may upload PDFs/images from an active room and preview library files
  privately. Uploading must not change the shared view. Files persist for everyone
  and future rooms; the Master chooses which file to display.
- Follower interaction pauses Master sync for three seconds after interaction ends.
  Further interaction restarts the delay. Manual opt-out persists until explicitly
  checked again. Do not return while a drag/pinch is still held.
- Only the separately authenticated Settings administrator may manage the global
  default, delete files/rooms or replace the original songbook. Never expose the
  administrator session/token to the room's musician identity.
- Room deletion offers keep files, delete originating files, or cancel. Include
  all contributors within the originating room lifetime, protect the current
  default, and retain bytes needed by other active rooms. Deleted library entries
  must not be selectable in new rooms.
- Original PDF replacement uses a new immutable URL/version. Existing rooms retain
  their descriptor; replacement does not change a different selected default.
- Do not bypass website authentication/paywalls or promise live arbitrary website
  casting. Chord website support currently uses static, stitched screenshots.
  Transposition is chosen on the source website before capture; images cannot be
  interactively transposed. Search reads names and readable PDF text, without OCR.

## Architecture and implementation

- Vite + TypeScript; DOM-based UI in `src/main.ts`, no framework required. Keep
  responsibilities modular rather than growing the coordinator unnecessarily.
- `src/rooms.ts` owns backend/identity operations; `model.ts` validates room/position
  data; `sync.ts` throttles/coalesces publishing; `follower-sync.ts` owns follow state.
- `viewer.ts` renders PDFs using matching PDF.js legacy viewer/worker bundles and
  image sheets as nearby JPEG tiles. `gestures.ts`, `scrollbar.ts` and `pdf-links.ts`
  handle document interaction. Preserve internal links, RTL alignment and gestures
  starting over links without accidental navigation or browser-page zoom.
- Synchronize normalized page/vertical offset, horizontal travel, zoom, source ID
  and monotonically increasing sequence. Publish roughly 15 updates/second with
  at most one write in flight. Reject stale updates and source mismatches; source
  switches and destination positions are atomic.
- Each browser downloads/renders its source independently. Room traffic contains
  manifests/coordinates, never PDF frames or screen video. Render only nearby
  pages/tiles; preserve bounded canvas and upload limits.
- `sheet-dialog.ts`, `file-upload.ts`, screenshot/stitch modules and `song-dialog.ts`
  share import/preview/library behavior across roles. Keep separate PDF/image
  pickers, optional naming and original filename metadata. Do not request camera
  capture. Library choosers auto-refresh while open and must clean up on close.
- `search.ts`, `pdf-search.ts` and `search-dialog.ts` own text extraction, local
  cache, matching and scope. All files is first/default; submitting dismisses the
  phone keyboard. Deduplicate redundant index/song-page matches while preserving
  distinct occurrences. Search is exposed in the Master header and Settings.
- Clean up timers, listeners, subscriptions, workers, object URLs and dialogs on
  navigation/close. Guard async callbacks against obsolete room/source revisions.
- `public/explainer/` is a standalone 42-second Hebrew portrait canvas animation
  with locally synthesized music. Preserve muted autoplay/reduced-motion handling,
  simple playback/audio controls, home/back links and captions below illustrations.
  Keep duration/timeline/storyboard notes aligned when changing it.

## Backends, persistence and secrets

- Production: Firebase Hosting, anonymous Firebase Authentication and Realtime
  Database; Supabase public `room-pdfs`/`room-sheets` buckets store uploads.
  Legacy `songbooks` URLs must continue working. Avoid introducing paid services
  or requiring a credit card without an explicit user decision.
- `database.rules.json` is the cloud authorization/schema boundary. Storage SQL
  policies in `supabase/` scope immutable inserts to the uploader UID and deletion
  to Settings. Local join tokens grant upload-only access; cloud catalog creation
  requires an authenticated uploader's own namespace plus an active room code.
  Do not claim stronger invitation/membership authorization than implemented.
- `server/local-rooms.ts` is Vite-only HTTP/SSE middleware; `server/song-library.ts`
  persists catalog/default/files with serialized atomic writes. Rooms are in memory
  and reset on server restart. Preserve catalog migration compatibility.
- `.local-data/` contains the user's durable local library. Never clear it to run
  tests or fix a server issue. `.idea/` and other unrelated user files are not part
  of a feature commit.
- Read example environment files for configuration, not private values. Never
  print/commit passwords, tokens, service-account or Supabase service-role keys.
  `VITE_*` values are public bundle configuration; server-only
  `MUSIC_ADMIN_PASSWORD` must never have that prefix. Settings PINs use the shared
  credential conversion; its public prefix does not strengthen a short PIN.

## Development and verification

From the repository root, use Node 24 (minimum 22.12) and npm. In PowerShell use
`.cmd` wrappers; other platforms use `npm`/`firebase` directly.

```powershell
npm.cmd run dev
npm.cmd run check
npm.cmd run test
npm.cmd run test:integration
npm.cmd run build
```

- Development defaults to the shared local backend on port 5173 when Firebase
  configuration is absent. Phones use the computer's current LAN URL printed by
  Vite, not phone `localhost`. Do not hardcode a changing LAN IP in documentation.
- `test:integration` starts its own isolated loopback server with generated
  credentials and temporary storage, runs six local HTTP/PDF checks and cleans up.
  It must never target cloud services or use the user's `.local-data/`.
- GitHub Actions runs type checking, unit tests, isolated integration and build.
  Prefer regression assertions about observable behavior over implementation mirrors.
- Cloud checks in `scripts/test-cloud-*.mjs` use actual services and are outside CI.
  Run relevant checks after permission/Storage changes, sequentially in a controlled
  session. Review their cleanup: some legacy checks retain a test room/PDF and the
  PDF library check temporarily changes/restores the global default.
- Native share sheets, OS clipboard, layout, audio output, real touch gestures,
  memory/orientation and network recovery need the browser/phone checks in
  `TESTING.md`. Record evidence; unchecked procedures are not passed tests.

## Git and release workflow

- Check Git status before changes. Use a feature/fix/docs branch; preserve unrelated
  work and stage explicit task files. Do not commit local data, env files or secrets.
- **Use Git and `gh` CLI for GitHub work, never Chrome/browser automation.**
- Deployment, commit, push, PR creation and merge are separate actions. When the
  user explicitly requests the whole release sequence, complete it without extra
  confirmation beyond required tool permissions. Do not deploy/merge merely because
  implementation is ready.
- For PR descriptions, lead with final behavior and validation; use a body file
  with real newlines. Match the full verified HEAD commit when merging, verify the
  merged state, delete the completed feature branch and return local checkout to
  current `main`. Report the PR link and deployment outcome accurately.
- Current production project: `talgreen-music-room`;
  live site: https://talgreen-music-room.web.app.
- `firebase.json` runs `build:deploy` before Hosting. This mode requires complete
  cloud Firebase settings and rejects emulator mode. Ordinary build/preview without
  Firebase is a same-browser demo, not cross-device production.
- If changing database/auth schema or Storage policies, apply required policies and
  deploy rules first, verify permissions, then publish the dependent frontend.
  Frontend-only changes normally require Hosting only. Do not deploy unrelated rules.

```powershell
# When needed for Windows certificate trust:
$env:NODE_OPTIONS='--use-system-ca'
# Only when rules changed:
firebase.cmd deploy --only database --project talgreen-music-room
# Publish the frontend after appropriate checks:
firebase.cmd deploy --only hosting --project talgreen-music-room
```

Verify the live page/bundle after deployment. Be explicit about failures, remaining
manual checks, and whether a change is local, committed, pushed, deployed or merged.
