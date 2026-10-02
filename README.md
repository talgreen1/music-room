# Music Room

A mobile browser songbook: one Master controls the reading position and Followers follow or browse independently. The supplied 145-page PDF is included as a versioned static asset.

This is the initial implementation. Local development now has a shared server backend for separate browsers and devices. Real Firebase authorization/reconnection and physical Android/iPhone testing still have acceptance work outstanding in [DETAILED_PLAN.md](DETAILED_PLAN.md). Architecture is in [HIGH_LEVEL_DESIGN.md](HIGH_LEVEL_DESIGN.md).

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

`build` writes `dist/`. `preview` serves that build (normally port 4173). Rebuild after changes when testing production preview.

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

Every room pins its URL/version/title at creation. Active rooms keep the same book even when a newer version is published. External PDF hosts must allow CORS. Search has not been exposed in the initial UI: much of the supplied book appears to have limited extractable song text, and Hebrew search requires further verification.

## Static hosting

Cloudflare Pages settings: build command `npm run build`, output directory `dist`, Node 24, and your frontend environment variables. Serve the versioned PDF files and generated PDF.js worker from the same deployment. Do not enable emulator mode there.

This repository contains no deployed cloud resources or paid infrastructure. Verify current free-tier limits and usage before sharing broadly. A production release still requires two-phone testing and database-rule verification.

## Current controls

- Create/join by six-digit code; share link and QR.
- Master scrolls and navigates; Followers initially follow automatically.
- Switch off Following Master to scroll, change page, or zoom independently.
- Return to Master snaps to the newest shared position and resumes following.
- Page numbers refer to physical PDF pages, not printed songbook numbering.
- While following, independent vertical gestures/page controls are locked to prevent conflicting movement.

Realtime traffic contains only page, normalized offset, relative zoom, sequence, and timestamp. PDF pages render locally and nearby canvases are retained rather than rendering all pages simultaneously.
