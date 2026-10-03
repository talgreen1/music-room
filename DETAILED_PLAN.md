# Music Room: detailed implementation plan

Updated: 2026-10-03. Architecture: [HIGH_LEVEL_DESIGN.md](HIGH_LEVEL_DESIGN.md).

## Tracking rules

Each story has a stable ID and a checkbox. Check a story only when its acceptance criteria have been demonstrated, not when code has merely been written. Record the relevant test result or manual evidence under the story when completing it. Keep IDs stable when adding or reordering stories.

Statuses: unchecked = not accepted; checked = accepted. Use a `Progress:` note for partial work or blockers. Future stories remain unchecked until explicitly brought into scope.

Current state: deployed at https://talgreen-music-room.web.app using Firebase Hosting, anonymous Authentication, and Realtime Database in Europe. Ten automated tests, type-checking, and the deployment build pass. Live Firebase SDK clients with distinct UIDs verified atomic creation/collisions, follower reads, live updates, denied unauthorized writes, and schema restrictions. Chrome on separate hosting origins verified Master creation, Follower joining, the supplied PDF, and synchronized page 37. Extended recovery, full rules edge-case coverage, emulator tests, and physical Android/iPhone checks remain outstanding. Only stories whose full criteria are satisfied are checked below.

Local development update: shared in-memory backend added to Vite so separate browsers and LAN devices can join without Firebase. Position reads use Server-Sent Events; a private creator token protects writes. Rooms reset on server restart. Ten automated tests now include backend collision, authorization, shared-state, subscription cleanup, and expiry checks. Firebase release gates remain separate.

Live backend evidence: `node scripts/test-local-server.mjs` passed independent HTTP-client join, public-read token exclusion, denied Follower write, streamed Master position, and reconnect snapshot. Browser UI joined a shared room as Follower across localhost/127.0.0.1 origins with separate browser storage. Old browser-only room codes must be recreated; local-server restarts clear development rooms.

## Stage 0: design and foundation

- [x] **MR-001 - Document the high-level design.** As a project owner, I can understand the architecture and tradeoffs before implementation.
  - Acceptance: cover user roles, PDF hosting/versioning, coordinate model, realtime flow, security, reconnection, mobile UX, performance, and future boundaries.
  - Evidence: `HIGH_LEVEL_DESIGN.md` created with these sections.

- [x] **MR-002 - Create a trackable delivery plan.** As a project owner, I can see the remaining work and mark accepted stories complete.
  - Acceptance: stable story IDs, a checkbox for every story, acceptance criteria, staged delivery, and explicit release gates.
  - Evidence: this document; implementation stories are not marked complete on the basis of the scaffold.

- [ ] **MR-003 - Inspect the actual songbook.** As a musician, I can use the supplied PDF without surprises.
  - Acceptance: record page count, mixed page dimensions, encryption status, representative rendering, text extraction, Hebrew text order, and existing index/bookmarks.
  - Verify first, middle, and final pages. Preserve the original and do not add OCR implicitly.
  - Progress: PDF.js found 145 pages, sampled dimensions 595.4 × 841.8 points, extractable Hebrew index on pages 1–2, footer-only text on sampled song pages 73/145, and no outline bookmarks. Complete dimensions/text coverage and representative visual review remain outstanding.

- [x] **MR-004 - Establish a runnable frontend.** As a developer, I can start, type-check, and build the app reproducibly.
  - Acceptance: TypeScript/Vite app entry point works; dependency installation completes; lockfile exists; dev, check, build, and meaningful test scripts work.
  - Commit no credentials. Document required runtime versions and ignore local settings/build artifacts.
  - Evidence: dependency installation and lockfile completed; `check`, six unit tests, and production build pass; Vite served the home and room views in Chrome. README documents Node and all commands. Windows sandbox subprocess restrictions required running tests/build outside the sandbox.

- [x] **MR-005 - Configure the published songbook.** As a maintainer, I can replace the book through configuration rather than session uploads.
  - Acceptance: create a versioned publishing copy of the provided PDF, wire its URL/title/version to a configuration module, and verify it loads over HTTP.
  - Preserve the root original. Avoid a hardcoded demonstration file that is absent from the repository.
  - Evidence: `public/songbooks/songbook-2026-10.pdf` loads in PDF.js through Vite, with title/version environment overrides and a pinned room descriptor. Root original preserved.

- [x] **MR-006 - Configure Firebase development services.** As a developer, I can test room synchronization safely before release.
  - Acceptance: enable anonymous authentication and Realtime Database, document local/emulator settings, and provide example configuration without secrets.
  - Configuration errors produce a clear setup message. A local demo, if included, is explicitly labeled and never mistaken for cross-device operation.
  - Evidence: dedicated `talgreen-music-room` project configured with anonymous authentication and European Realtime Database; deployment and local example settings, guarded production build, and setup instructions included. Live SDK smoke test passed. Java/emulator execution remains unverified; cloud verification used distinct anonymous clients instead.

**Gate:** runnable project, verified source PDF, documented backend configuration. Dependencies: MR-003 through MR-006 before evaluating the core flow.

## Stage 1: smallest functional two-device version

- [ ] **MR-007 - Obtain an invisible device identity.** As a participant, I can enter without creating an account.
  - Acceptance: anonymous Firebase sign-in completes without a login screen; identity survives a normal same-browser reload; auth errors offer retry.
  - Use server-issued identity for ownership. Do not trust a role stored only in local storage.

- [ ] **MR-008 - Create a room atomically.** As a Master, I can create a room and receive a short code.
  - Acceptance: six-digit code, collision-safe transaction/retry, initial position, creator UID, immutable PDF descriptor, and 24-hour expiry.
  - Concurrent creators do not overwrite one another; failed creation does not navigate into a nonexistent room.
  - Progress: six-digit creation works in browser demo; Firebase transaction implementation awaits collision/concurrency checks with real backend or emulators.

- [ ] **MR-009 - Join an existing room.** As a Follower, I can enter a room code and see its songbook.
  - Acceptance: validate six digits, subscribe to that room, load its pinned PDF descriptor, and default to following.
  - Missing/expired room, denied access, and temporary connection failure are distinguishable. Joining does not change ownership.

- [ ] **MR-010 - Render the supplied PDF locally.** As a participant, I can read the songbook on my own phone.
  - Acceptance: PDF.js worker loads correctly in dev and production; both devices render the same file; vertical scrolling works; loading/error states are visible.
  - PDF bytes come from hosting, never the room synchronization stream.
  - Progress: supplied book renders in two Chrome tabs without captured console errors. Physical phones and production browser rendering remain to be checked.

- [ ] **MR-011 - Define consistent reading coordinates.** As a Follower, I align to the Master's page even when our screens differ.
  - Acceptance: one-based page and normalized page-relative offset round-trip correctly across widths and mixed page sizes; clamp first/last-page boundaries.
  - Tests cover page gaps, landscape geometry changes, and finite numeric validation.
  - Progress: automated tests cover mixed page sizes across widths, page gaps, beginning clamp, and nonfinite input. Browser tabs aligned at page 50 with offset 0.424328. Landscape/final-page cases remain outstanding.

- [ ] **MR-012 - Publish Master scrolling efficiently.** As a Master, my scrolling automatically updates the room.
  - Acceptance: at most 15 scrolling writes/second; trailing update after stopping; immediate page-jump update; unchanged state suppressed.
  - Coalesce slow-network writes; do not accumulate a backlog. Include sequence and server timestamp.
  - Progress: coalescing/throttle/final-position/cleanup tests pass; tab scrolling and immediate jumps work. Backend traffic frequency and reconnect ordering await integration measurement.

- [ ] **MR-013 - Apply shared positions on Followers.** As a Follower, I follow the Master almost immediately.
  - Acceptance: requestAnimationFrame interpolation targets the newest state; large jumps/initial join snap; stale sequences are ignored.
  - No follower-generated room writes or feedback loops. Dispose of animation/subscriptions when leaving.

- [ ] **MR-014 - Handle state arriving before PDF readiness.** As a late joiner, I land at the current Master position after loading.
  - Acceptance: retain the newest position while loading; apply after page geometry is ready; updates during loading are not lost.
  - Test joining while the Master moves to a distant page.

- [ ] **MR-015 - Enforce ownership in database rules.** As a Master, other participants cannot alter my room.
  - Acceptance: authenticated creator can create/write position; Followers can read an active specific room but cannot write position, change ownership/PDF/lifetime, or delete it.
  - Deny root/list reads and invalid schemas; reject expired-room access and invalid timestamps/ranges/extra fields.
  - Prove permissions using emulator clients with distinct UIDs, including a direct follower SDK write attempt.
  - Progress: `database.rules.json` implements ownership/schema/lifetime checks. Rules are draft until emulator authorization tests pass.
  - Cloud progress: Firebase accepted and deployed the rules. `scripts/test-cloud-rooms.mjs` passed direct SDK checks with distinct UIDs: Master-only position writes; denied Follower ownership changes/deletion; denied enumeration/root reads; immutable PDF; invalid ranges/timestamps/extra fields/stale sequence rejection. Emulator coverage, expired-room access, and remaining metadata/schema cases are still pending, so this story remains unchecked.

- [ ] **MR-016 - Demonstrate the core flow on two phones.** As a musician, I can rely on the basic shared songbook experience.
  - Acceptance: Android Chrome and iPhone Safari create/join through Firebase, open the supplied book, and follow continuous scroll plus distant page jumps.
  - Record device/browser versions, network conditions, observed latency, and failures. A same-browser-tab demonstration is insufficient.

**Gate:** MR-007 through MR-016 accepted. Do not prioritize extra controls or visual polish before this core proof.

## Stage 2: recovery and lifecycle reliability

- [ ] **MR-017 - Report connection state accurately.** As a participant, I know whether live synchronization is available.
  - Acceptance: Connected/Reconnecting/Offline reflect Firebase connection and browser events; state remains visible without obstructing the PDF.
  - A connected follower is not presented as proof that the Master is online.

- [ ] **MR-018 - Recover Followers after network loss.** As a Follower, I resume at the current Master position when my connection returns.
  - Acceptance: loaded PDF remains readable offline; following mode snaps to latest server state on reconnect; independent browsing is preserved when follow is off.
  - Verify network off/on and app background/foreground, with the Master moving while the Follower is away.

- [ ] **MR-019 - Recover the Master without replaying stale updates.** As a Master, my current location becomes authoritative after reconnect.
  - Acceptance: pause publication offline, coalesce to latest local position, and publish it once connectivity returns; sequence remains monotonic across reload/reconnect.
  - Old queued positions cannot visibly drag Followers backward.

- [ ] **MR-020 - Restore sessions and clean up navigation.** As a participant, refreshing or leaving behaves predictably.
  - Acceptance: preserve room route; restore authorized Master role on creator reload; shared URLs confer only follower entry.
  - Leave cancels timers, animations, listeners, and render tasks. Switching rooms does not leak old updates into the new room.

- [ ] **MR-021 - Enforce room lifetime and explain Master departure.** As a participant, I understand why a room is unavailable or no longer moving.
  - Acceptance: 24-hour expiry enforced with server-time validation; expiry during a session gives a clear exit/create path; no silent takeover.
  - Document that Master closure retains the last position and loss of creator identity requires a new room. Document manual removal of expired records.

- [ ] **MR-022 - Provide actionable failure recovery.** As a participant, I can retry failures without losing my place unnecessarily.
  - Acceptance: retry paths for auth, room subscription, and PDF failure; distinct messages for missing configuration, missing room, and expiry.
  - Prevent duplicate submissions. No unhandled promise rejections or inaccessible error messages in exercised flows.
  - Progress: room/PDF/auth/subscription failure screens now offer Try again and Back to home, replace the stale joining label, hide unavailable viewer controls, and explain the local demo's browser/profile/origin scope. Chrome reproduced a valid room at localhost becoming unavailable at 127.0.0.1; retry/home/fresh creation were checked. Firebase error distinctions and reconnect recovery remain outstanding.

**Gate:** airplane-mode, reload, late join, leave/rejoin, background/foreground, and expiry scenarios pass. Depends on Stage 1.

## Stage 3: musician controls

- [ ] **MR-023 - Toggle Follow Master.** As a Follower, I can browse independently without moving the group.
  - Acceptance: prominent on/off state; following prevents conflicting local vertical navigation; off mode allows local scroll/navigation/search.
  - Continue storing latest remote position while off; do not publish local position.
  - Progress: local Chrome test kept the Follower on page 12 while the Master moved to page 50; follow-mode page controls are disabled. Independent-gesture/realtime backend checks remain outstanding.

- [ ] **MR-024 - Return to Master.** As a Follower, I can rejoin the shared reading position in one tap.
  - Acceptance: snap immediately to newest retained position, restore practical shared zoom, and enable following.
  - Works after browsing far away and after a reconnect. Disable or explain the action until a valid shared position exists.
  - Progress: local Chrome Return to Master restored page 50 and following mode. Reconnect and pre-load availability behavior still need checks.

- [ ] **MR-025 - Navigate physical PDF pages.** As a musician, I can jump to a page quickly.
  - Acceptance: page counter, previous/next, and numeric jump with valid range; use physical PDF page numbering consistently.
  - Master navigation publishes immediately; Follower navigation requires browsing mode. Final-page counter remains correct when scrolling is clamped.

- [ ] **MR-026 - Zoom for readability.** As a musician, I can adjust the score to my device.
  - Acceptance: clear fit-to-width zoom controls and bounds; preserve reading anchor during changes; retest portrait/landscape.
  - Master zoom means a relative fit-width multiplier. If shared zoom harms mobile usability, document and test a local-zoom fallback before release.

- [ ] **MR-027 - Search extracted songbook text.** As a musician, I can find a phrase or song name when the PDF supports it.
  - Acceptance: test actual Hebrew and other extracted text; incremental indexing, busy state, cancellation, empty results, and page jump.
  - Escape displayed text. Unsupported extraction produces an explanation; no OCR claim. Follower searches operate in browsing mode.

- [ ] **MR-028 - Share by link and QR code.** As a Master, I can invite the group quickly.
  - Acceptance: link contains room code only; copy feedback and QR use the correct deployed origin; handle unavailable clipboard/share APIs.
  - Opening on another phone enters as a Follower. Display room code as a fallback.
  - Progress: Chrome share dialog renders room-only URL and QR canvas; physical phone scan and clipboard fallback remain unchecked.

- [ ] **MR-029 - Expand the viewing area.** As a musician, I can give more space to the score.
  - Acceptance: fullscreen where supported; graceful expanded-layout fallback elsewhere; controls and exit remain reachable.
  - Verify browser limitations on iPhone rather than assuming native fullscreen support.

**Gate:** Master and Follower controls behave correctly in both follow modes. Depends on core reliability; PDF search also depends on MR-003.

## Stage 4: mobile design and performance

- [ ] **MR-030 - Build the dark mobile interface.** As a musician holding an instrument, I can operate the app easily.
  - Acceptance: simple home actions, obvious role/code/status, PDF-first room layout, quiet dark styling, and minimal menus.
  - Master explicitly sees "You are the Master"; Followers can identify following/browsing state.

- [ ] **MR-031 - Make touch and keyboard interaction accessible.** As a participant, I can use the app comfortably with different input needs.
  - Acceptance: minimum 48 CSS px touch targets, spacing, visible focus, labels, usable contrast, dialog focus behavior, and clear validation.
  - Support numeric code entry, safe-area insets, screen-reader announcements for meaningful status changes, and one-hand access to core controls.

- [ ] **MR-032 - Handle orientation and browser viewport changes.** As a phone user, I keep my place when rotating or browser chrome changes.
  - Acceptance: portrait/landscape, mobile dynamic viewport height, keyboard opening, and narrow screens do not hide essential controls.
  - Recompute geometry and reapply anchor without publishing spurious Master movement.

- [ ] **MR-033 - Bound PDF rendering work and memory.** As a participant with a large songbook, my phone remains responsive.
  - Acceptance: lazy visible/nearby rendering, stable placeholders, bounded concurrent tasks, cancellation, distant-canvas eviction, and capped raster sizes.
  - Avoid serial full-book work before the first readable page. Measure startup, sustained scrolling, and distant-page jumps with the supplied PDF.
  - Progress: an initial lazy canvas viewer exists; startup strategy, error paths, concurrency, and memory remain unverified.

- [ ] **MR-034 - Verify delivery and caching.** As a returning participant, I do not download the book unnecessarily.
  - Acceptance: correct versioned caching; production worker asset resolution; external CORS/range behavior if external hosting is selected.
  - Verify PDF requests and database traffic separately. PDF transfer never occurs through realtime updates.

- [ ] **MR-035 - Measure realtime behavior under load.** As a group, we receive smooth updates without excessive backend traffic.
  - Acceptance: test representative small group (initial test assumption: 1 Master + 5 Followers); record latency and update frequency during slow and fast scrolling.
  - Include throttled network and mixed screen sizes. Confirm near-15 Hz cap, final settled alignment, and no accumulating write backlog.

**Gate:** mobile browser checks pass; measurements show acceptable performance for the actual book. Depends on earlier stages.

## Stage 5: deployment and handoff

- [x] **MR-036 - Deploy the static frontend.** As a group organizer, I can share an HTTPS URL that works on phones.
  - Acceptance: chosen static host builds and serves `dist`; configure environment settings; PDF/worker URLs and direct room links work.
  - First prepare a reviewable build and deployment configuration. Publish when deployment is authorized; do not infer cloud/account access from local coding work.
  - Evidence: user requested deployment; Firebase Hosting selected for initial deployment using existing CLI access. HTTPS app and PDF are live at https://talgreen-music-room.web.app. Production browser created room 339077; separate firebaseapp.com origin joined as Follower and followed page 37 with no captured errors. Hosting predeploy rebuilds and refuses incomplete cloud settings/emulator mode. Cloudflare remains a documented alternative; no Cloudflare deployment was performed.

- [x] **MR-037 - Apply and verify production Firebase configuration.** As an organizer, I can use shared rooms securely outside development.
  - Acceptance: correct database region/URL, anonymous auth settings, required domain configuration, and deployed tested rules; no public-write test rules.
  - Run a production two-identity smoke test after deployment, with authorization for external changes.
  - Evidence: anonymous auth enabled via CLI; default RTDB created in `europe-west1`; ownership/schema rules deployed. Both Firebase Hosting origins work with distinct browser storage. Live two-identity SDK smoke test passed after configuration and again after frontend deployment. No billing upgrade or unrestricted write rules were used.

- [ ] **MR-038 - Document setup and monthly PDF replacement.** As a maintainer, I can run and update the app without reading all its code.
  - Acceptance: README covers install/run/check/build, Firebase setup, rules, deployment, demo limitations, and troubleshooting.
  - Replacement procedure: add new versioned PDF, update descriptor, deploy, verify new rooms, retain versions used by active rooms, then remove obsolete versions.
  - Progress: README includes local server/debugging, tab demo, LAN testing, Firebase/emulators, checks, deployment, replacement, and limitations. Cloud/emulator setup instructions await integration verification.

- [ ] **MR-039 - Review operating cost and lifecycle housekeeping.** As an organizer, I understand free-tier use and maintenance.
  - Acceptance: verify current hosting/database/auth limits against official docs; document measured traffic assumptions, usage monitoring, and manual expired-room cleanup.
  - No blanket zero-cost guarantee, unrequested billing upgrades, or paid services. Revisit abuse protection before broad public exposure.

- [ ] **MR-040 - Accept the first release.** As the project owner, I have evidence the app meets its priorities.
  - Acceptance: all required version-1 stories pass, CI/local checks are clean, final Android/iPhone session passes, and known limitations are recorded.
  - Include PDF version, browser/device matrix, core flow, follow controls, reconnect, rules tests, and performance observations in release notes.

**Gate:** deployed app and operational guide are usable by the group; no unresolved critical room, synchronization, or authorization defects.

## Local debugging addendum

- [x] **MR-041 - Share local rooms across browsers without cloud setup.** As a developer, I can create a room in one browser and join it as a Follower from another client using the same development server.
  - Acceptance: `npm run dev` provides shared room creation/reads and live position updates; only the private creator token authorizes writes; shared links contain no token; expiry/reset behavior and LAN usage are documented.
  - Evidence: four backend unit tests and the live-server integration script pass. Browser UI across separate localhost/127.0.0.1 origins displayed Master/Follower roles and synchronized to page 37. Physical phone and production Firebase verification remain separate stories.

## PDF pinch and pan addendum

- [ ] **MR-042 - Zoom the PDF with pinch gestures and synchronize two-axis dragging.** As a Master, I can pinch the document and drag horizontally/vertically while Followers see the same shared zoom and reading position.
  - Acceptance: PDF gestures do not zoom the whole browser; zoom anchors under the fingers; touch/mouse dragging supports both axes; shared state and both backends validate horizontal pan; Followers follow zoom/pan and Return to Master restores both axes. Existing rooms without horizontal state remain readable. Verify Android/iPhone pinch and rotation before accepting the story.
  - Progress: implemented on `feat/pdf-pinch-and-pan`; PDF zoom range is 75%–400%. Sixteen unit tests pass, including two-pointer pinch/midpoint handling, cancel-to-single-pointer drag, Follower locking, horizontal coordinate conversion, and local backend validation. Local HTTP/SSE integration verifies horizontal pan and zoom in live updates and reconnect snapshots. Separate-origin Chrome views verified 250% zoom, diagonal drag, independent browsing, and Return to Master restoring both axes. A 390-pixel Follower and resize to 800 pixels retained the Master's normalized horizontal position and page 37. User confirmed the phone test passed on 2026-10-03. Updated production rules are deployed; the live two-identity SDK check passed at 300% zoom and horizontal 0.7 while rejecting Follower writes and invalid zoom/pan values. Type-check and deployment build pass. Specific iPhone and physical-device rotation checks remain outstanding, so the full story remains unchecked.

## Mobile PDF rendering follow-up

- [x] **MR-043 - Render the songbook on browsers missing newer JavaScript APIs.** As a musician, I can see PDF content on my phone rather than only white page placeholders.
  - Acceptance: use matching compatibility viewer/worker bundles, verify actual index/song page rendering, show actionable per-page errors, and confirm the affected phone displays its PDF after refresh.
  - Evidence: switched to PDF.js compatibility bundles and added Retry page recovery covering asynchronous and synchronous rendering failures. `scripts/test-pdf-compat.mjs` removes newer built-ins before importing PDF.js and renders pages 1/73 with verified ink pixels. LAN browser rendering succeeds; user confirmed the affected phone test passed on 2026-10-03.

## Future backlog: not part of version 1

- [ ] **F-001 - Add a built-in song index.** As a musician, I can choose a song name to navigate to its page. Acceptance when scoped: versioned mapping agrees with the current PDF, including index-page offsets.
- [ ] **F-002 - Add favorites.** As a musician, I can save favorite songs locally. Acceptance when scoped: favorites use stable source/song IDs and handle PDF version changes.
- [ ] **F-003 - Add recent rooms.** As a participant, I can reopen a recent room. Acceptance when scoped: expiry/missing-room handling and no leaked Master credentials.
- [ ] **F-004 - Add external chord sources.** As a musician, I can open permitted chord content. Acceptance when scoped: embedding restrictions, authentication, subscriptions, and permissions are respected; unsupported sites have a clear fallback.
- [ ] **F-005 - Add a browser-like source view.** As a Master, I can select supported external content. Acceptance when scoped: source-specific navigation and sync boundaries are explicit; do not assume arbitrary iframe access.
- [ ] **F-006 - Add WebRTC screen sharing.** As a Master, I can explicitly share a supported screen source. Acceptance when scoped: browser capture support, user consent, signaling, bandwidth, and separate media lifecycle verified.
- [ ] **F-007 - Add transposition for structured chords.** As a musician, I can change a supported song's key. Acceptance when scoped: structured chord source and correct chord/key behavior; do not claim transposition of arbitrary PDF images.
- [ ] **F-008 - Add admin PDF management if needed.** As a maintainer, I can publish a book through an authorized admin flow. Acceptance when scoped: admin-only access, versioning, validation, and active-room compatibility.
- [ ] **F-009 - Add stronger invitations and abuse controls if needed.** As an organizer, I can open the service to a broader audience. Acceptance when scoped: defined threat model, stronger join authorization, room-creation limits, and verified enforcement beyond client UI.

## Verification approach

Use focused automated tests for coordinate math, throttling/coalescing, stale-message handling, and recovery state transitions. Use Firebase emulator tests for the authorization boundary and concurrent room creation. Use browser tests for the create/join/view/follow flows, and manual physical-device tests for scrolling, memory, orientation, and mobile background behavior.

Do not treat a successful build or local BroadcastChannel demo as proof of cross-device reliability. Completion evidence should state what was tested and its limits. Any newly discovered defect gets a story or remains an explicit blocker to the relevant gate.
