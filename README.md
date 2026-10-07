# Music Room

A mobile browser songbook: one Master controls the reading position and Followers follow or browse independently. Share the supplied 145-page PDF, any uploaded PDF, or automatically stitched screenshots from a reusable file library.

Live app: **https://talgreen-music-room.web.app**. Create a room there and share its link/code with another browser or phone; joining makes that participant a Follower. Local development also has a shared server backend for separate browsers and devices. Cloud authorization and live SDK updates have been verified; physical Android/iPhone and network-loss testing remain outstanding in [DETAILED_PLAN.md](DETAILED_PLAN.md). Architecture is in [HIGH_LEVEL_DESIGN.md](HIGH_LEVEL_DESIGN.md).

## Project structure

```text
music-room/
├── src/
│   ├── main.ts              # Screens, routing, controls, and session coordination
│   ├── rooms.ts             # Room creation, identity, subscriptions, and position writes
│   ├── model.ts             # Room/position types, validation, and scroll coordinates
│   ├── sync.ts              # Throttled Master position publisher
│   ├── follower-sync.ts     # Three-second browsing pause and manual sync preference
│   ├── gestures.ts          # PDF-only pointer drag, pinch, and trackpad zoom
│   ├── scrollbar.ts         # Persistent touch/mouse scrollbar and keyboard scrolling
│   ├── pdf-links.ts         # Internal PDF destination/page coordinate resolution
│   ├── viewer.ts            # PDF and screenshot rendering, zoom, and smooth following
│   ├── stitch.ts            # Screenshot overlap and stationary-bar matching
│   ├── screenshot-import.ts # Image decoding, cropping and bounded JPEG export
│   ├── file-upload.ts       # Shared local/Supabase PDF upload client
│   ├── sheet-dialog.ts      # Import, stitch preview and upload dialog
│   ├── song-dialog.ts       # Saved song chooser and zoom/pan preview
│   ├── song-library.ts      # Saved-song metadata and lifecycle helpers
│   ├── sheets.ts            # PDF/image source manifest and upload validation
│   ├── style.css            # Dark interface and responsive layouts
│   └── *.test.ts            # Model, publisher, and local room store tests
├── server/
│   ├── local-rooms.ts       # Vite development middleware: room API and SSE streams
│   └── song-library.ts      # Persistent local catalog/default and file cleanup
├── scripts/
│   ├── test-file-library.mjs # PDF/image uploads, defaults and permission checks
│   ├── test-local-server.mjs # Integration check against a running development server
│   ├── test-cloud-rooms.mjs  # Integration check with distinct Firebase identities
│   └── test-cloud-sheets.mjs # Disposable cloud upload/library/security checks
├── supabase/
│   ├── storage.sql          # PDF bucket and administrator upload policy
│   ├── files.sql            # Shared PDF bucket and Settings-only cleanup
│   └── sheets.sql           # Screenshot bucket, upload and cleanup policies
├── public/songbooks/        # Versioned PDFs copied into each build
├── index.html               # Browser entry point
├── vite.config.ts           # Development server and deployment configuration guard
├── tsconfig.json            # TypeScript compiler settings
├── package.json             # Dependencies and development/build/test commands
├── package-lock.json        # Locked dependency versions for npm ci
├── firebase.json            # Hosting, anonymous auth, database rules, and emulators
├── database.rules.json      # Server-enforced room permissions and schema validation
├── .firebaserc              # Default Firebase project
├── .env.example             # Example local-development settings
├── .env.deployment.example  # Example settings for a cloud deployment
├── HIGH_LEVEL_DESIGN.md     # Detailed architectural decisions and future boundaries
├── DETAILED_PLAN.md         # Stories, acceptance criteria, and progress checkboxes
└── README.md                # Setup, architecture, and operations guide
```

The original supplied PDF remains at the repository root. Its published copy is `public/songbooks/songbook-2026-10.pdf`. `dist/` is generated build output; `node_modules/` contains installed dependencies. Both directories, local environment files, and debug artifacts are ignored by Git.

## Architecture

The frontend is a TypeScript application built with Vite. PDF.js runs in each participant's browser using a separate worker. The viewer and worker use matching PDF.js compatibility (`legacy`) bundles so rendering does not depend on newer built-ins missing from some mobile browsers. Firebase Hosting serves the frontend, worker, and bundled PDF. Supabase Storage hosts PDF replacements and screenshot tiles. Firebase Authentication supplies invisible anonymous identities for musicians and a separate password account for Settings; Realtime Database stores rooms, the original songbook descriptor, the reusable file catalog and the default file ID.

```mermaid
flowchart LR
    Hosting[Firebase Hosting: app, worker, PDF] --> Master[Master browser]
    Hosting --> Follower[Follower browser]
    Master --> Auth[Anonymous Authentication]
    Follower --> Auth
    Master -->|Small position updates| Database[Realtime Database]
    Database -->|Live room subscription| Follower
```

### Room lifecycle and ownership

Creating a room reserves a six-digit code with a Firebase transaction. The room records its creator's UID, creation time, 24-hour expiry, songbook descriptor, and initial position. New rooms start with the administrator-selected default PDF or image sheet. Joining subscribes to that specific room and loads its selected source. The URL contains only the room code, for example `/?room=123456`.

`RoomService` in `src/rooms.ts` handles the backend operations. The Master UI requires both the creator's authenticated UID and a creator flag in the tab's session storage. Database rules independently enforce that only the creator may write positions. Followers can read active rooms but cannot change ownership, the PDF descriptor, or the room lifetime. Root reads are denied. Room-list reads and room deletion require a separately allowlisted Settings administrator.

Closing the Master tab leaves the last shared position in the room; there is no automatic takeover. Losing the creator's identity/session requires creating another room. Expired Firebase records become inaccessible to participants but remain stored until a maintainer removes them.

### Position synchronization

The room is stored under `rooms/<code>` with this shape:

```json
{
  "masterId": "anonymous-firebase-uid",
  "createdAt": 1791000000000,
  "expiresAt": 1791086400000,
  "pdfUrl": "/songbooks/songbook-2026-10.pdf",
  "pdfVersion": "2026-10",
  "pdfTitle": "Songbook",
  "position": {
    "page": 37,
    "offset": 0.62,
    "zoom": 1.1,
    "horizontal": 0.7,
    "sequence": 42,
    "updatedAt": 1791000001000
  }
}
```

`page` is the one-based physical PDF page. `offset` is the reading position within that page, normalized from 0 to 1, so different screen widths do not depend on identical pixel coordinates. `horizontal` is the fraction of available horizontal scroll travel, also from 0 to 1; older room snapshots without it use 0. `zoom` is relative to the viewer's base page width; its supported range is 0.75–4 (75%–400%). `sequence` orders updates, and `updatedAt` uses server time for cloud writes.

The viewer converts Master scrolling into these coordinates. `PositionPublisher` in `src/sync.ts` throttles ordinary scroll updates to approximately 15 per second, allows only one write in flight, and replaces pending updates with the newest position. Page jumps request an immediate update. Followers interpolate toward the latest target using `requestAnimationFrame`; initial joins and large jumps snap to the target. The UI ignores stale sequences and retains the latest room state while the PDF loads.

Followers start with **Master sync** checked as the first element of their bottom toolbar. Scrolling, dragging, pinching, or opening PDF links temporarily unchecks it. Three seconds after the interaction ends, it checks itself and returns to the latest Master position. Further activity restarts the delay; a held drag never returns mid-gesture. Manually unchecking the checkbox keeps sync off until it is manually checked again, which returns immediately. Incoming updates always retain the Master's latest position. Follower navigation never publishes shared state.

Pinch inside the PDF to zoom around your fingers; drag with one finger or the primary mouse button to pan horizontally and vertically. Desktop trackpad pinch/Ctrl+wheel also changes document zoom. Gestures are handled within the PDF area, with native touch zoom disabled there; the app does not globally disable browser zoom. Existing canvases scale during a gesture and refresh their resolution after zoom settles. Followers can begin browsing directly; the local sync controller pauses automatic movement during their interaction.

Tap or click the songbook's embedded internal links to open the referenced PDF page. Link regions scale with document zoom and use the PDF's destination coordinates, including named destinations and page object references. Navigation preserves the current document zoom and aligns to the right edge by default for the RTL songbook. The Master has an **RTL orientation** checkbox, checked by default; uncheck it for left-edge alignment. Changing the checkbox also aligns the current view. The resulting horizontal position and link navigation synchronize through the existing room position updates. Follower link navigation temporarily pauses Master sync, then restores the shared view after three seconds unless sync was manually unchecked. These links navigate inside the loaded PDF rather than opening another browser page.

The Master's RTL checkbox sits in the hamburger menu in the upper bar, checked by default. The lower bar keeps page navigation and an upward arrow to jump to page 1. Zoom with a pinch on the document; the Master has no zoom buttons or percentage in the lower bar.

Page buttons retain the selected page after a completed jump, including the final pages when a tall viewport prevents their tops from reaching the top edge. Manual scrolling resumes the normal reading-position calculation. Settings opens with the password field focused.

The Master has a persistent vertical scrollbar beside the PDF: drag its thumb or tap its track to move quickly through the songbook. It also supports arrow keys, Page Up/Down, Home, and End when focused. The Master's first toolbar button jumps directly to PDF page 1 while retaining zoom. Followers have no vertical scrollbar and browse by dragging, pinching, mouse wheel, or keyboard; this activity temporarily pauses sync.

Dragging and pinching also work when fingers start over links. A single tap opens the link; moving at least 8 CSS pixels starts a drag, and a second finger starts a pinch immediately. Gestures suppress accidental link activation when fingers lift. Keyboard link activation remains available.

### PDF rendering and backend modes

Each browser downloads the PDF independently. The viewer creates page geometry for navigation, renders canvases near the viewport, and removes canvases that move away. Room traffic contains reading coordinates; it never contains page images or streamed screen content. Each room pins its PDF version so publishing a replacement does not change the book mid-session.

The app selects its backend from the build mode and environment settings:

| Mode | Backend | Scope |
| --- | --- | --- |
| `npm run dev`, no Firebase settings | Vite API with Server-Sent Events | Separate browsers and devices reaching the same development server |
| Complete Firebase settings | Anonymous auth and Realtime Database | Separate browsers/devices over the internet |
| Firebase emulator mode | Local auth/database emulators | Development clients reaching the emulator services |
| Ordinary build without Firebase | Local storage and BroadcastChannel | Tabs in the same browser profile and origin |

The development API lives in `server/local-rooms.ts`. It creates in-memory rooms, supplies a private write token only to the creator, accepts authenticated Master updates, and streams public room snapshots to Followers. It is mounted only by Vite's development server. Static hosting and `npm run preview` do not run this API.

The dedicated `build:deploy` command requires complete cloud Firebase settings and rejects emulator mode. Firebase Hosting runs it automatically before every upload.

## Run locally for debugging

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**. Without Firebase settings, the development server shares rooms across browsers. Create a room in the first browser, then open the same address in another browser and enter its code or follow the shared link. The joining browser becomes a Follower. No Firebase or Java setup is needed for this local flow.

The local server streams position updates using Server-Sent Events. Only the creator receives a private write token, stored in that tab's session. Shared links and room reads never include this token; the server rejects follower writes. Do not duplicate the creator tab, since browsers can copy its session storage.

Local rooms live in server memory and reset when the development server restarts; they also expire after 24 hours. Rooms created before the shared backend was added remain browser-only and cannot be joined through the new backend: create one fresh room after updating. Switching the creator's origin loses access to its tab-scoped Master token; keep the creator tab on its original address. Followers may use localhost, 127.0.0.1, or the server's LAN address as appropriate, since these all reach the same server.

The production build/`preview` has no local API server. Without Firebase it falls back to the old, explicitly labeled browser-only demo, which shares data only between tabs of the same origin/profile. Configure Firebase for deployed internet use. The local dev backend is for trusted development networks, not a production hosting alternative.

Use the browser developer tools for console errors, network requests, and breakpoints in TypeScript source. Vite updates the app as source files change. Refreshing the Master tab restores its creator session.

The dev server binds to the local network. To open it on a phone, use the **Network** URL printed by Vite, with both devices on the same Wi-Fi, and enter the room code. The shared local development backend synchronizes across those devices without Firebase. On a phone, `localhost` refers to the phone itself; use the computer's LAN address instead.

HTTP on a LAN address may lack clipboard/secure-context APIs. Copy the displayed share link manually when needed; localhost and a deployed HTTPS site support more browser capabilities. If a phone cannot reach the server, check the selected network address, Wi-Fi isolation, and your firewall's permission for Node; do not disable the firewall globally.

## Checks and production preview

```powershell
npm.cmd run check
npm.cmd run test
npm.cmd run build
npm.cmd run preview
```

With `npm.cmd run dev` already running, verify the shared backend with:

```powershell
node scripts/test-local-server.mjs
```

This creates a disposable test room and verifies independent joining, Master-only writes, live position streaming, and the reconnect snapshot.

To check the PDF compatibility bundle against the supplied index and a song page with newer JavaScript APIs initially absent:

```powershell
node scripts/test-pdf-compat.mjs
```

This Node rendering check uses PDF.js's optional `@napi-rs/canvas` dependency. Page rendering failures in the app show an error message and **Retry page** button rather than leaving an unexplained blank placeholder.

`build` writes `dist/`. `preview` serves that build (normally port 4173). Rebuild after changes when testing production preview.

To preview the actual cloud configuration, use `npm.cmd run build:deploy` followed by `npm.cmd run preview`. The ordinary `build` command does not load `.env.deployment.local`.

## Connect real Firebase

1. Create/select a Firebase project and enable **Authentication > Sign-in method > Anonymous**. Users still see no account or login screen.
2. Create a **Realtime Database**, choosing a region near the group. Copy its database URL and the Firebase web app configuration.
3. Copy `.env.example` to `.env.local` and set the four `VITE_FIREBASE_*` values. Leave `VITE_USE_FIREBASE_EMULATORS=false`.
4. Apply `database.rules.json` in the Realtime Database Rules editor, or deploy it through the Firebase CLI to your explicitly selected project. Do not use unrestricted test rules. Review and emulator-test rules before production use.
5. Configure Firebase authorized domains for your actual hosting/development origins as appropriate. Restart Vite after editing environment variables.
6. Test from two distinct browser identities/devices. Creator identity plus saved creator session determine the Master UI; database rules independently enforce ownership.

Firebase web configuration is public client configuration, not an admin key. Never add service-account credentials to the frontend or repository. Rules are the authorization boundary.

The initial rules allow anonymous reads of a specific active room (and missing-room reads for collision-safe creation), deny enumeration, and restrict position writes to its creator. Rooms last 24 hours; old records need manual cleanup. Numeric codes are invitations for a trusted small group, not confidential-access tokens.

## Debug with local Firebase emulators

Requires the Firebase CLI and a Java runtime compatible with the installed CLI/database emulator. They are separate prerequisites from Node. The machine used for initial implementation has Firebase CLI available, but Java was not found, so emulator integration has not yet been verified.

Use a demo project ID to keep test data away from production:

```powershell
npm.cmd run emulators
```

In `.env.local`:

```dotenv
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_PROJECT_ID=demo-music-room
VITE_FIREBASE_DATABASE_URL=https://demo-music-room-default-rtdb.firebaseio.com
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-music-room.firebaseapp.com
```

Restart `npm.cmd run dev`. Emulator ports: Authentication 9099, Database 9000, UI 4000. Local rules come from `database.rules.json`.

For testing only on your computer, the default loopback bindings work. To use a phone, add `"host": "0.0.0.0"` under the auth and database entries in `firebase.json`, keep the network restricted to your trusted development LAN, and open the frontend through that machine's LAN address. The app defaults emulator host to the frontend hostname; `VITE_FIREBASE_EMULATOR_HOST` can override it. Emulators have no production protection and should not be exposed to the internet. Remove emulator mode before building a production deployment.

## PDF configuration and monthly updates

The root `חוברת שירים.pdf` is preserved. Its publishing copy is `public/songbooks/songbook-2026-10.pdf`.

Defaults work without PDF environment settings. To publish a replacement:

1. Add a new file under `public/songbooks/` with a new versioned name.
2. Set `VITE_PDF_URL`, `VITE_PDF_VERSION`, and `VITE_PDF_TITLE` in environment configuration.
3. Build/deploy and create a new room to verify it uses the replacement.
4. Retain previous files until rooms using them have expired, then remove obsolete publishing copies.

Every room pins its URL/version/title at creation. Active rooms keep the same book even when a newer version is published. External PDF hosts must allow CORS. Search reads existing PDF text; screenshots and image-only PDF pages are searchable by file name/title only. No OCR is used.

## Song search

Use **Search songs** in Settings or a room to search the original songbook and every available library file. Search always starts with **All files**, the first scope option. In a room, choose **Current file** to limit the search, or use **Search all files** in the Master menu. Enter a song, artist or file name and press Enter or Search; submission dismisses the mobile keyboard to expose results. Results show the file, matching text and destination page. Click a result to open it. Linked PDF index results open their song destination rather than the index page.

Master selections update the room for everyone. A Follower can jump within the current file using the existing three-second browsing pause, or preview another file privately. Home and Settings results open a preview. Manual Master-sync preferences remain unchanged.

`src/search.ts` handles matching and result coordinates; `src/pdf-search.ts` extracts PDF.js text and internal link destinations without rendering canvases; `src/search-dialog.ts` handles scope, progress, cancellation and opening results. Matching ignores case, accents and Hebrew niqqud. New uploads retain original file names even when renamed; older entries use their title and, for PDFs, URL basename.

PDFs are searched sequentially on the device. Names appear immediately; text results appear after each PDF finishes. The first search downloads the PDFs; completed text indexes are cached in IndexedDB for up to 24 hours, capped at 20 PDFs. Storage restrictions fall back to extracting again. Stop or closing the dialog cancels extraction. Search adds no cloud service or server text index.

Before publishing this feature, deploy the updated `database.rules.json` allowing the optional `fileNames` metadata in catalog and room manifests. Existing records remain compatible. Physical-phone search acceptance and cloud-rule verification are tracked in the plan.

## Deployment

The initial deployment uses **Firebase Hosting**, anonymous Authentication, and Realtime Database in `europe-west1`, in the dedicated project `talgreen-music-room`. No billing upgrade was made. Manage usage at https://console.firebase.google.com/project/talgreen-music-room/overview. The PDF is served by Hosting, not Cloud Storage.

### First-time setup on a machine

Install Node.js and the Firebase CLI, then sign in to an account that has access to `talgreen-music-room`:

```powershell
npm.cmd install --global firebase-tools
firebase.cmd login
firebase.cmd login:list
npm.cmd ci
Copy-Item .env.deployment.example .env.deployment.local
```

Skip copying the example if `.env.deployment.local` already exists, to preserve its configured values. Add the public web API key from **Firebase console > Project settings > Your apps > Music Room Web**. The configured production machine already has this ignored local file.

| Setting | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Public client API key from the registered web app |
| `VITE_FIREBASE_AUTH_DOMAIN` | `talgreen-music-room.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | Full European Realtime Database URL from the example file |
| `VITE_FIREBASE_PROJECT_ID` | `talgreen-music-room` |
| `VITE_USE_FIREBASE_EMULATORS` | Must be `false` for deployment |
| `VITE_PDF_URL`, `VITE_PDF_VERSION`, `VITE_PDF_TITLE` | Optional songbook overrides |

Vite embeds `VITE_*` values into the browser bundle at build time; changing these settings requires rebuilding. Keep passwords, service-account keys, and CLI login tokens out of these files. The Firebase CLI uses its own saved sign-in session to administer and deploy the project; browser participants use anonymous authentication. `firebase.cmd logout` removes the CLI's saved access.

Deployment settings do not change `npm run dev`, which continues to use the local shared server unless `.env.local` configures Firebase. On this computer, if Firebase needs the Windows trust store, set `$env:NODE_OPTIONS='--use-system-ca'` before running its commands.

### Publish a frontend update

From the repository root:

```powershell
npm.cmd run check
npm.cmd run test
node --use-system-ca scripts/test-cloud-rooms.mjs
firebase.cmd deploy --only hosting --project talgreen-music-room
```

Hosting automatically runs `build:deploy` before uploading `dist/`. This build refuses incomplete Firebase configuration and emulator mode, so it cannot silently publish the browser-only demo. `firebase.json` configures direct-link rewrites, immutable caching for generated assets, one-day PDF caching, and HTML revalidation. On systems without the `.cmd` wrappers, use `npm` and `firebase`.

After deployment, open the live site, create a fresh room, and join from a separate browser or phone. Check the PDF, connected status, scrolling/page jumps, temporary browsing, automatic return, and manual Master sync opt-out/rechecking. Local development room codes belong to the local server; create a new room on the deployed site for internet use.

### Publish database rules or authentication changes

For intentional changes to `database.rules.json` or the auth provider configuration in `firebase.json`:

```powershell
firebase.cmd deploy --only auth,database --project talgreen-music-room
node --use-system-ca scripts/test-cloud-rooms.mjs
```

Verify the changed permissions before publishing any frontend that depends on them. The tracked configuration enables anonymous authentication for musicians and email/password authentication for the Settings account.

The zoom/pan release requires the updated database rules **before** Hosting: the previous rules reject the new `horizontal` field and zoom values above 200%. These rules are deployed; the field is optional so existing room snapshots and older clients remain readable. For future schema changes, deploy rules first, run the cloud smoke test, and then publish Hosting. The smoke test now exercises horizontal pan and 300% zoom. Refresh each participant's browser after deploying a viewer update.

The cloud smoke test uses two distinct anonymous identities. It checks atomic creation/collision handling, active-room reads, live position updates, late snapshots, denied Follower writes/deletion/ownership changes, denied enumeration, immutable PDF metadata, and rejected malformed positions. Expected `permission_denied` warnings demonstrate the restrictions. Each run leaves one test room that becomes unreadable after 24 hours; remove old records through the Firebase console when needed.

The Spark plan has usage limits; monitor Hosting bandwidth and database usage, especially when many new devices download the 12 MB PDF. See [Firebase pricing](https://firebase.google.com/pricing). Physical two-phone testing and extended recovery checks remain outstanding.

### Alternative: Cloudflare Pages

Cloudflare Pages can host the same frontend while Firebase continues to provide room synchronization:

| Pages setting | Value |
| --- | --- |
| Build command | `npm run build:deploy` |
| Output directory | `dist` |
| Node version | 24 |
| Environment variables | The same cloud Firebase and optional PDF settings listed above |

Serve the versioned PDFs and generated PDF.js worker from the same deployment; add the chosen host to Firebase authorized domains if needed. The Vite development API is not included in Pages. No Cloudflare resources were created for the initial deployment.

## Current controls

### Settings and file uploads

Implementation modules are `src/settings.ts` (screen/forms), `src/admin.ts` (local/Firebase/Storage operations), `src/songbook.ts` (descriptor/upload validation), `server/admin-auth.ts` (local password sessions), and `supabase/storage.sql` (bucket/policy setup). Cloud checks are in `scripts/test-cloud-settings.mjs`; account provisioning is in `scripts/setup-settings-admin.mjs`.

The home screen has a **Settings** button. Unlock it using the configured administrator password to list rooms, delete one room or all rooms (with confirmation), view all saved PDFs/image songs, add a PDF (up to 30 MB) or screenshots, choose the default, and delete uploaded files. Masters can upload and select files in their rooms; only Settings administrators can set the default or delete. Changing the default affects new rooms. Existing rooms keep their selected source; deletion retains active copies until those rooms switch away or expire. Choose another default before deleting the current one. The bundled/original songbook is a permanent fallback and is not deleted from this screen.

Local Settings uses `MUSIC_ADMIN_PASSWORD` in `.env.local` (server-only, never `VITE_`). Uploaded files and the default descriptor persist under ignored `.local-data/`; local rooms remain in memory and disappear on restart. Run `node scripts/test-settings.mjs` against `npm run dev` to check authorization, upload/download, room pinning and targeted deletion. The test restores the default and removes only its own rooms.

Cloud Settings uses a separate, in-memory Firebase email/password session, independent of the musician's anonymous identity. The default account email is `settings@music-room.app`; override it with `VITE_ADMIN_EMAIL`. Only UIDs allowlisted at `/admins/<uid> = true` can list/delete rooms and write `/songbook` and `/defaultFile`, or delete catalog entries. Clients cannot read or write the allowlist. Provision that entry with a trusted Firebase CLI account, never with an embedded administrator key. `node --use-system-ca scripts/test-cloud-settings.mjs` verifies cloud administrator permissions, denied musician operations and actual Supabase PDF upload/download; it removes only its own test room and leaves a versioned verification PDF in the bucket.

Settings accepts the configured password/PIN. For Firebase, `src/settings-password.mjs` converts it to a namespaced credential so short PINs meet Firebase's minimum credential length. The public prefix does not strengthen a short PIN. Provisioning and cloud tests use the same conversion; the PIN itself is not embedded in the frontend. Local sign-in continues to verify the entered PIN on the server.

On the configured development machine, `http://localhost:5173` uses the local server. To test the cloud configuration locally, run `npm run dev -- --mode deployment --port 5174`, then open `http://localhost:5174`. Both ports are available to a phone using the computer's LAN address. Port 5174 uses real cloud rooms and Settings operations. Hosting publication is a separate release step.

Uploaded cloud PDFs go to the **Free Supabase** project `music-room`, bucket `room-pdfs`. The older `songbooks` bucket remains for previously uploaded default PDFs. Firebase Storage is not used and no billing upgrade is required. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.deployment.local`, using only the public publishable key. Keep Supabase secret/service-role keys and database passwords out of the app.

For a fresh installation:

1. Enable Firebase email/password authentication (`firebase deploy --only auth`). Set the server-only Settings password in the local environment, then run `node --use-system-ca scripts/setup-settings-admin.mjs`. This signs into or creates the account without printing credentials. Allowlist its printed UID using the trusted CLI.
2. Create a Free Supabase project. In **Authentication > Sign In / Providers > Third-Party Auth**, add the Firebase project ID.
3. In the Supabase SQL editor, run [supabase/files.sql](supabase/files.sql) and [supabase/sheets.sql](supabase/sheets.sql), adjusting project IDs and the administrator UID for your installation. They create public PDF/JPEG buckets with immutable uploads scoped to each Firebase identity. Only the Settings UID can remove stored files. The original [supabase/storage.sql](supabase/storage.sql) describes the legacy Settings-only PDF bucket; keep it for existing URLs.
4. Set the two public Supabase environment values, deploy database rules, run the cloud checks, then build/deploy Hosting. Settings passwords are entered at runtime and never bundled.

Supabase's Free plan has storage/download limits and projects can pause after inactivity. Existing bundled PDFs continue working independently of Supabase; rooms pinned to an uploaded PDF need the project to be active. Retain previous uploaded PDFs until their rooms expire, then remove obsolete versions through the Supabase dashboard when storage needs clearing. See [Supabase pricing](https://supabase.com/pricing), [Firebase integration](https://supabase.com/docs/guides/auth/third-party/firebase-auth) and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

- Create/join by six-digit code; share link and QR.
- Master scrolls and navigates; Followers initially follow automatically.
- Pinch the PDF to zoom; drag to pan horizontally and vertically. The Master shares zoom and both scroll axes.
- Follower browsing temporarily unchecks Master sync and returns after three seconds of inactivity.
- Manually uncheck Master sync to keep browsing independently; check it to return immediately.
- Page numbers refer to physical PDF pages, not printed songbook numbering.
- Compact Follower controls show Master sync and page/zoom readouts. The Master has page navigation in the lower bar and a hamburger menu for song selection, screenshot imports, Settings and RTL.

Realtime traffic contains only page, normalized vertical offset, normalized horizontal travel, relative zoom, sequence, and timestamp. PDF pages render locally and nearby canvases are retained rather than rendering all pages simultaneously.

## Upload and choose files

Open **Room menu > Add file/song** as Master, or **Settings > Files & songs > Add file/song** as administrator. Choose one PDF, or one or more PNG/JPEG/WebP screenshots. Mixed PDF/image selections and multiple PDFs in one upload are rejected; add PDFs individually. Enter an optional name; an empty name uses the filename. PDFs keep their pages and clickable internal links. Image selections use the existing automatic stitch/crop preview. Both kinds are saved permanently and can be selected from any room. Only the Master switches the room source.

In Settings, **Make default** marks the file for new rooms. **View** previews PDFs and stitched images with zoom/pan. **Delete** is unavailable for the current default until another default is selected. Files already in use stay visible in those rooms; unused deleted files are cleaned up by a Settings refresh or room deletion. The original songbook remains the first picker choice and a fallback default.

Locally, `.local-data/songs.json` now stores `{version:2,defaultId,files}`; old image-only catalogs migrate on the next write. New PDF files live in `.local-data/songbooks/`. Cloud catalog records remain under `/songs/<id>`, with either `pdfUrl` or `segments`. `/defaultFile` stores a file ID, or `pdf` for the original descriptor. The existing `room.sheet` field holds either manifest type; positions carry its ID so stale updates cannot move another file.

With the dev server running, run `node scripts/test-file-library.mjs` for uploads, role permissions, PDF/image defaults, active-room retention and cleanup. It restores the original default and removes its own records/rooms. Phone upload/pinch testing remains a manual check.

Before deploying this feature, apply **supabase/files.sql**, deploy the updated database rules, verify cloud PDF uploads/default permissions, then publish Hosting. New PDF uploads require the new `room-pdfs` bucket; keeping the old bucket avoids breaking existing rooms. These policies/rules and the frontend were deployed on 2026-10-05. Run `node --use-system-ca scripts/test-cloud-files.mjs` to verify PDF uploads, defaults and permissions; it restores the original default and removes its disposable files/rooms.

## Share chord screenshots

In a room, the Master opens **☰ > Add file/song**, selects screenshots from top to bottom, optionally enters a song name, and reviews the automatically stitched preview. Capture at the same browser zoom with about one third of each screen overlapping the next. Set the desired transposition on the website first. Use the arrow buttons to reorder captures; **Auto stitch** recalculates joins. Expand **Adjust crop / Review join** to remove top or bottom pixels, then **Update preview**. **Share with room** uploads and permanently saves the song before switching everyone to it. An empty song name uses the first screenshot filename. **☰ > Select file/song** opens the reusable library, with the pinned PDF listed first; select any saved song to share it without uploading again. Pinch, pan and Master sync work as for the PDF. The **PDF** button returns everyone to the pinned songbook at page 1.

Screenshots are static: website links/transposition controls are not interactive. Changing key requires new screenshots. Uncertain overlap matches are preserved and flagged for review rather than silently removing content.

The stitching modules are `src/stitch.ts`, `src/screenshot-import.ts`, `src/sheet-dialog.ts` and `src/sheets.ts`. `src/song-library.ts` defines saved metadata/filtering, `src/song-dialog.ts` provides selection/preview, and `server/song-library.ts` persists the local catalog using serialized atomic writes. `src/viewer.ts` displays short JPEG tiles without gaps; `src/rooms.ts` publishes their manifest and source-tagged position together. Processing uses bounded canvases instead of allocating one enormous image. Limits: 20 captures / 100 MB input, 20 megapixels per capture, 1600-pixel output width, up to 40 JPEG tiles / 30 MB total. Settings previews reuse the zoom/pan viewer. **Settings > Files & songs > Add file/song** opens the same screenshot importer, with optional name, automatic stitching and crop preview; **Save to library** adds it directly to the library without creating a room or changing any room's current view. Run `node scripts/test-settings.mjs` against the local server to check library registration, cross-room reuse, protected deletion, active-copy retention and tile cleanup.

To add songs during a session, the Master opens **☰ > Settings**, unlocks Settings and chooses **Files & songs > Add file/song**. Followers can still use the Settings gear in their room header. Settings opens over the room; closing it returns to the same page, zoom and position without disconnecting the room. Songs are shared across all rooms. Each Master opens **☰ > Select file/song** to load the current library, or taps **Refresh files** if the chooser is already open. Adding a song does not switch anyone's view until their Master selects it.

### Local testing

Run `npm run dev`, create a room and upload screenshots. Open its link from another browser or a phone on the same Wi-Fi using the network address printed by Vite, for example `http://YOUR-COMPUTER-IP:5173/?room=123456`. Uploaded JPEGs persist in ignored `.local-data/sheets/`; the reusable catalog persists in `.local-data/songs.json` across server restarts. Rooms still reset on server restart. Verify zoom, horizontal/vertical dragging, Follower's three-second return, manual Master sync opt-out, late joining, and returning to PDF. `node scripts/test-local-server.mjs` checks HTTP authorization, sheet switching, stale positions and reconnect snapshots.

### Cloud setup for this extension

Screenshot sharing and the song library are deployed at the live app. For another installation, or changes to these policies:

1. Run [supabase/sheets.sql](supabase/sheets.sql) in the existing project's SQL editor. Adjust the Firebase project ID for other installations. It creates the public `room-sheets` bucket and an insert-only Firebase-token policy scoped to the uploader's UID. Firebase third-party Auth and the two public Supabase environment settings are the same as for Settings PDF uploads.
2. Validate and deploy the updated `database.rules.json` before publishing the frontend. The rules permit only the Master to change the source/position and require matching source IDs. Run `node --use-system-ca scripts/test-cloud-sheets.mjs` to verify real uploads/downloads, Master and room-free Settings imports, Follower denial, reconnect, tombstones and administrator cleanup. It uses `MUSIC_ADMIN_PASSWORD` from the local environment and removes only its own disposable rooms, catalog entries and JPEGs. Do not put that password in a `VITE_*` variable.
3. Run `npm run build:deploy`, then publish Hosting using the existing deployment process. Refresh all devices after release; older frontend clients do not support image sheets.

No extra service or billing upgrade is introduced. Uploaded sheets consume the existing free Storage and download allowances. Saved songs remain available until deleted in **Settings > Files & songs**, which lists every song and offers **View** and **Delete**. Deletion hides the library entry immediately. Active rooms retain their current copy. On Settings refresh or room deletion, unused deleted songs have their tiles and metadata removed; this avoids interrupting active players while reclaiming storage. Cloud tombstones live under `/songs/<id>/deletedAt`; only the Settings administrator can delete/clean up, and room rules prevent selecting tombstoned songs. Apply the SELECT/DELETE administrator policies in `supabase/sheets.sql` as well as its upload policy. Adjust the Firebase project, administrator UID and Supabase public URL in the SQL/rules for other installations. Failed upload attempts can also leave unused files. Saved local files use the same deletion lifecycle; avoid clearing `.local-data/` if you want to retain the library.

Release verified on 2026-10-05: 52 unit tests, type checking, PDF compatibility rendering, local HTTP integration and real-cloud screenshot/PDF room checks passed. Storage SQL and database rules were applied before Firebase Hosting publication. The user approved local testing. Detailed physical Android/iPhone seam, memory and background behavior checks remain tracked in the plan.
