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

- [x] **MR-027 - Search extracted songbook text.** As a musician, I can find a phrase or song name when the PDF supports it.
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

## Embedded PDF links

- [x] **MR-044 - Open embedded internal PDF links.** As a Master or independently browsing Follower, I can tap an index entry to navigate to its song in the loaded PDF.
  - Acceptance: clickable regions match PDF annotations through zoom; resolve named destinations, page references, and destination vertical coordinates; Master navigation synchronizes; following Followers cannot navigate independently; independent Follower navigation does not change the room.
  - Evidence: implemented on `feat/pdf-internal-links`. Twenty tests pass, including actual index link resolution in the supplied songbook and missing/invalid destination handling. Separate-origin local browser views verified Master index navigation to page 12 at 100% and 120% zoom, matching Follower page/zoom, independent Follower navigation to page 5, and Return to Master. Type checking and production build pass. Physical-phone tap testing remains a manual follow-up.

- [x] **MR-045 - Pinch and drag over PDF links.** As a musician, I can start gestures anywhere on the index, including on linked text, while ordinary taps still navigate.
  - Acceptance: one-pointer taps and slight finger movement remain clickable; dragging from a link pans the PDF; two fingers on links zoom it; gestures do not accidentally open links; the next tap and keyboard activation still work.
  - Evidence: delayed pointer capture for link taps, 8 CSS pixel drag threshold, immediate two-pointer capture, and gesture click suppression. Twenty-three tests and type checking pass, covering both-finger link starts, implicit touch capture transfer, drag versus tap, click suppression, and subsequent tap/keyboard activation. Physical-phone confirmation remains a manual follow-up.

- [x] **MR-046 - Align PDF link navigation for RTL songbooks.** As a Master, I have an RTL orientation checkbox checked by default, and linked songs open at the right edge while retaining zoom.
  - Acceptance: the checkbox is visible only for the Master in the bottom toolbar alongside page/zoom controls; checked links align to the right edge, unchecked links align left; changing orientation aligns the current view; Followers receive the resulting shared horizontal position.
  - Evidence: separate-origin local browser checks at 200% zoom opened page 12 at the maximum horizontal scroll on both Master and Follower. Unchecking RTL and navigating again retained 200% zoom and aligned both views at horizontal scroll 0. The checkbox was hidden for the Follower. All 23 tests, type checking, and build pass. Physical-phone confirmation remains a manual follow-up.

## Fast navigation

- [x] **MR-047 - Scroll quickly and return to page 1.** As a musician, I can drag a persistent vertical scrollbar or tap the first toolbar button to return to the index.
  - Acceptance: scrollbar works with touch/mouse and reflects the current position; keyboard scrolling is available; the first toolbar button jumps to physical PDF page 1 without changing zoom; Master changes synchronize; following Followers cannot use these controls until browsing independently.
  - Evidence: implemented on `feat/fast-scroll-and-first-page`. All 27 tests, type checking, and build pass, including full-range dragging, locking/cancellation, keyboard navigation, and scrollbar geometry. Local separate-origin browser views verified track navigation to page 73, matching Follower state with disabled controls, End navigation to page 145, and the first toolbar button returning to page 1. User confirmed the changes work on 2026-10-03. The guarded deployment build and actual PDF rendering compatibility check passed; frontend deployed to https://talgreen-music-room.web.app. Specific iPhone/rotation coverage remains tracked separately.

Release evidence for MR-044 through MR-046: user confirmed the final link, gesture, RTL alignment, and bottom-toolbar changes work on 2026-10-03. All 23 tests and the guarded deployment build passed; actual PDF pages 1/73 rendered successfully with newer built-ins initially absent. Frontend deployed to https://talgreen-music-room.web.app. Specific iPhone/rotation coverage remains tracked separately.

## Compact controls and Follower sync

- [x] **MR-048 - Maximize viewer space and simplify Follower syncing.** As a musician, I see smaller header/toolbar controls; Followers have Master sync as the first toolbar element and can browse without first changing modes.
  - Acceptance: Follower navigation/sharing, vertical scrollbar, and old follow buttons are removed; interaction unchecks sync and returns to the latest Master state three seconds after interaction ends; further activity restarts the delay; manual opt-out persists until checked; cleanup prevents stale returns; Followers never publish room state.
  - Evidence: implemented on `feat/compact-view-and-auto-sync`. All 32 tests, type checking, and build pass, including timer restart, overlapping/held gestures, manual opt-out, immediate manual resume, and disposal. Separate-origin browser views verified temporary scrollbar browsing returning to the Master's newly selected page 37, manual opt-out remaining on page 73 after the Master moved to page 50, and rechecking immediately restoring page 50. Follower toolbar has no visible navigation buttons and starts with Master sync. Header/toolbar measured 45/41 pixels in the browser preview. Physical-phone gesture testing remains a manual follow-up.

## Settings and free PDF uploads

- [x] **MR-049 - Add password-protected Settings and room management.** As a maintainer, I can open Settings from home, list rooms, delete a specific room, and delete all rooms after confirmation.
  - Evidence: server-side password/session verification, login throttling, token-redacted room listing, targeted deletion and listener notification tested locally; bulk deletion tested against an isolated store. Separate Firebase admin identity and UID allowlist protect cloud operations. Production musician permission checks still pass after updating the rules.
- [x] **MR-050 - Upload and view replacement PDFs locally.** As a maintainer, I can select a PDF file, upload it, view the default, and have new rooms use it while existing rooms retain their PDF.
  - Evidence: integration check uploads/downloads the actual supplied PDF byte-for-byte, rejects invalid/unauthorized uploads, verifies new/existing room descriptors and restores the original default. Files and metadata persist on disk; size and header validation covered by unit tests.
- [x] **MR-051 - Connect free hosted PDF uploads.** As a maintainer, I can use the same Settings upload flow with Firebase authentication and Supabase Free Storage.
  - Acceptance: configure the bucket and Firebase integration, verify admin upload/public PDF rendering and denied musician uploads, and confirm the live default update flow. No billing upgrade or embedded service-role key.
  - Evidence: Supabase Free project and bucket configured, Firebase integration active, administrator UID allowlisted; real PDF upload/download passed with denied musician uploads and overwrite. Cloud room listing, targeted deletion, default metadata update/readback and existing musician synchronization checks passed. Uploaded PDF rendered visibly in the app through a disposable cloud room; original default restored and preview room deleted. Chrome Settings login/list/form checked. All 37 tests, type checking and deployment build pass; administrator password absent from browser bundles. Automated file selection is limited by the browser extension file-access setting; physical-phone selection remains a manual release check.
- [ ] **MR-052 - Release Settings.** As a musician/maintainer, I can use the tested Settings release on the live app.
  - Acceptance: user tests pass, release branch committed/pushed/merged and Hosting deployed; physical-phone file selection checked.
  - Progress: Hosting deployed on 2026-10-04. Live home Settings button and login with the updated password verified; room list and PDF upload controls load successfully. Source publication is tracked in [PR #7](https://github.com/talgreen1/music-room/pull/7). Physical-phone file selection remains a manual release check.

Release evidence for MR-048: user confirmed the final compact controls, Follower sync, and Master-only scrollbar changes work on 2026-10-03. All 32 tests and the guarded deployment build passed, as did rendering actual PDF pages with newer built-ins initially absent. Frontend deployed to https://talgreen-music-room.web.app. Specific iPhone/rotation coverage remains tracked separately.

## Screenshot sharing

The user-approved solution replaces live website casting with browser-side automatic screenshot stitching. The Master chooses transposition on the original website, captures overlapping screenshots, reviews the stitched preview and shares it. Followers use the existing synchronized viewer. See [WEBSITE_CASTING_DESIGN.md](WEBSITE_CASTING_DESIGN.md) for architecture, limits and verification.

- [x] **SS-001 - Import and order screenshots.** Master-only dialog, PNG/JPEG/WebP validation, image bounds, ordering and crop adjustment.
- [x] **SS-002 - Automatically stitch and preview.** Textured overlap matching, stationary bars, conservative ambiguous fallback, bounded JPEG tiles and continuous preview.
- [x] **SS-003 - Share source atomically.** Local authenticated uploads, cloud upload client and manifest; source-tagged positions reject stale writes and Follower source changes.
- [x] **SS-004 - Synchronize screenshot zoom and pan.** Reuse gestures and three-second Follower browsing pause; separate-origin browser checks of image loading, synchronized zoom and compact role-specific controls.
- [x] **SS-005 - Return to the room PDF.** Keep pinned PDF metadata; Master can switch the group back to page 1.
- [ ] **SS-006 - Test real phone captures.** Android/iPhone upload, seams, large images, pinch/pan and reconnect.
- [x] **SS-007 - Configure cloud and release.** Applied screenshot Storage SQL and deployed validated Firebase rules before Hosting publication on 2026-10-05. Real-cloud checks verified uploads/downloads, denied Follower writes, stale-source rejection and reconnect to the latest source/position.

- [x] **SS-008 - Optional song names and permanent library.** Empty names fall back to the first screenshot filename; save before sharing; local catalog persists across restarts and cloud catalog is independent of rooms.
- [x] **SS-009 - Master chooses PDF or saved song.** Compact Songs button and source chooser; reuse from any room without uploads; deleted entries cannot be selected.
- [x] **SS-010 - Settings song list, preview and deletion.** Zoom/pan preview, confirmed administrator deletion, active-copy retention, deferred tile cleanup on refresh or room deletion.
- [x] **SS-011 - Local library lifecycle verification.** Persistence, concurrency, duplicate/corrupt-catalog protection, cross-room reuse, authorization, deleted-selection denial and active-reference cleanup checks pass.
- [x] **SS-012 - Cloud saved-library verification and release.** Catalog rules and administrator Storage cleanup policies deployed. `scripts/test-cloud-sheets.mjs` verified shared selection, deleted-selection denial, ongoing active-room position writes, actual JPEG uploads and administrator deletion. Disposable test records and files were cleaned up.

- [x] **SS-013 - Add songs directly from Settings.** Unlocked administrator imports screenshots with the same optional name/stitch/crop preview, saves to the shared library without a room, and sees the song list refresh. Local HTTP checks deny anonymous imports, reject invalid/duplicate data, confirm no room is created and verify a later Master can select the saved song.
- [x] **SS-014 - Verify room-free Settings imports in the cloud.** Live-cloud check confirmed Settings can upload/register without room metadata, Followers cannot create library entries without an owned room, and another Master can select the administrator's song. Published to Firebase Hosting after checks passed.

Release evidence (2026-10-05): user approved local testing. All 52 unit tests, type checking, PDF rendering compatibility and cloud screenshot/PDF room smoke checks passed. The screenshot test covers real JPEG download, immutability, foreign upload rejection, bounded tiles, source changes, reconnect, deletion and cleanup. Physical-device coverage in SS-006 remains open.

- [x] **SS-015 - Open administrator Settings from an active room.** Compact Settings gear opens a password-protected dialog without routing away, destroying the viewer or leaving the room. Nested song imports/previews work; closing Settings locks its separate administrator session and retains the room's view. Local browser verified page 37 and 110% zoom preserved after opening Settings and its Add song dialog.
- [x] **SS-016 - Use new Settings songs in existing rooms.** Song chooser loads the current shared catalog on each open and includes Refresh songs for already-open choosers. HTTP integration creates two rooms before a Settings import, verifies neither room changes during import and confirms both Masters can then select the new song. 52 unit tests, type checking and build pass.

SS-015/SS-016 release (2026-10-05): user approved testing. All 52 tests, type checking, updated Settings integration and guarded production build passed. Deployed to Firebase Hosting; existing cloud library and permissions required no changes.

- [x] **MR-053 - Simplify the Master toolbar with a hamburger menu.** Upper-bar menu contains Select file/song (existing library), Add file/song (existing screenshot importer), Settings and the default-checked RTL checkbox. Lower bar keeps page navigation with an upward arrow to page 1; no Master zoom buttons/percentage, RTL or import/library buttons. Pinch/drag gestures retain their existing implementation. Followers retain their previous controls. Browser checks verified each menu action, RTL checkbox state, dismissal, page navigation and the distinct-origin Follower view; 52 tests, type checking and build pass. Physical-phone pinch testing remains a manual check.

- [x] **MR-054 - Focus Settings login and make page jumps reliable.** Settings focuses the password input immediately from home and the in-room menu. Completed viewer jumps retain their requested reading anchor when browser rounding or the document end prevents exact top alignment; user scrolling resumes geometric tracking. Regression tests cover subpixel boundaries, last-page clamping, cross-viewport coordinates and scrolling away. At a 390×844 viewport, one Next tap reaches page 145 and one Previous tap returns to 144; Settings password focus verified. 54 tests pass.

MR-053/MR-054 release (2026-10-05): user approved phone testing. All 54 tests, type checking and guarded production build passed. Master menu actions, password focus, repeated single-tap navigation, final-page Follower sync and manual scroll tracking verified locally. Published to Firebase Hosting; no backend schema changes required.


## Unified file library

- [x] **FL-001 - Upload PDFs or screenshots from either entry point.** As Master or Settings administrator, I can name an upload optionally, choose one PDF or one/more images, and save it in the shared library. PDFs retain their original pages; images retain automatic stitching and crop preview.
- [x] **FL-002 - Select any saved file in a room.** As Master, I can choose a PDF or image song for everyone. PDF navigation/links, zoom and two-axis synchronization remain available, with source IDs rejecting stale positions.
- [x] **FL-003 - Administrator sets the default.** As Settings administrator, I can preview any file and choose what new rooms open. Existing rooms retain their source. The original songbook remains available as fallback.
- [x] **FL-004 - Administrator-only deletion and default protection.** Masters cannot delete or change the global default. Delete is disabled for the current default; backend checks enforce choosing another first. Deleted PDFs/images remain available to active rooms and are cleaned up after their references are released.
- [x] **FL-005 - Preserve the existing library.** Image-only local catalogs migrate atomically to a versioned files/default document. Cloud records keep their original IDs and image manifest shape. Catalog/default survive local restarts.
- [ ] **FL-006 - Physical-phone acceptance.** Verify one PDF and multiple screenshots from Master/Settings, optional name, default selection, PDF navigation/links, pinch/pan and Follower sync on Android/iPhone.
- [x] **FL-007 - Cloud configuration and release.** Apply `supabase/files.sql` for the shared PDF bucket; deploy/validate database rules, verify Master/Settings PDF uploads, unauthorized default/deletion rejection and current-default protection, then publish Hosting and complete the user-requested GitHub release.

Local evidence: persistence/migration, default protection, active PDF cleanup and source-switch regression tests added. `scripts/test-file-library.mjs` verifies both upload roles, exact PDF downloads, shared selection, PDF/image defaults, unchanged active rooms, denied unauthorized operations, stale-source positions and cleanup. All 57 unit tests, type checking and deployment build pass. Browser checks at 390 x 844 confirm PDF preview/default controls, new-room PDF navigation and page-37 synchronization with a separate-origin Follower, and switching both clients between image songs and an uploaded PDF. Automated file selection is blocked by the browser extension file-access setting; actual phone upload remains FL-006. The user approved local testing for release.

Release evidence (2026-10-05): applied shared PDF Storage SQL, deployed syntax-validated Firebase rules, and published Hosting. `scripts/test-cloud-files.mjs` verified actual Master/Settings PDF uploads/downloads, immutability, PDF room creation/switching, synchronized positions, denied unauthorized default/deletion changes, default protection and active tombstones; restored the original default and removed disposable files/rooms. Existing cloud screenshot-library checks also passed. All 57 unit tests, type checking and deployment build passed. Source is published through the unified-file-library release PR.

## Global and current-file song search (2026-10-06)

- [x] **SS-001 - Global file search.** Search Home, Settings and the Master menu across the original songbook and live shared library. Titles and original upload names match even when the display title differs; existing records remain valid.
- [x] **SS-002 - Readable PDF text.** Extract with PDF.js, support Hebrew/English, case/accent/niqqud normalization and safe literal queries. No OCR: image-only pages and screenshot songs match names only.
- [x] **SS-003 - Current-file search.** All files is first and selected by default in every search dialog; Current file limits room search to the open manifest. Enter/Search dismisses the keyboard. Scope/query changes cancel stale work and clear stale results.
- [x] **SS-004 - Open relevant results.** Show all matching blocks with file/page/snippet, resolve internal index links to their song destinations, and open Home/Settings previews at the target page. Master file switches and destination updates are atomic; Followers cannot change the room.
- [x] **SS-005 - Responsive search and cancellation.** Search PDFs sequentially, show progress and immediate name matches, Stop/close cancels work, and unreadable PDFs do not prevent searching other files. Cache completed indexes locally for 24 hours, capped at 20 PDFs; no paid backend.
- [x] **SS-006 - Automated/local verification.** 63 tests pass, including actual Hebrew index extraction/destination resolution, original-name matching, cancellation and Master-only atomic source/page selection. Local HTTP integration verifies names, target coordinates, invalid-target rejection, SSE/reconnection and authorization. Browser checks confirm Hebrew page-5 opening and a separate-origin Follower receiving page 5; global screenshot-name results open the selected file.
- [ ] **SS-007 - Physical-phone acceptance.** Verify search keyboard/layout, large-book first-search progress/cancellation, text matches in another readable PDF, local/global results, Master sync and private Follower preview on Android/iPhone.
- [ ] **SS-008 - Cloud rules and release.** Deploy updated optional fileNames rules, verify upload/catalog/room compatibility and existing permissions, then publish Hosting and complete the GitHub CLI release when requested.

Deployment evidence (2026-10-06): Firebase CLI validated and released the updated database rules and published Hosting at https://talgreen-music-room.web.app. All 63 tests and the deployment build passed. The cloud file regression verified original-name metadata in catalog/room manifests, rejected empty names and more than 20 names, preserved Master/Follower/default/deletion authorization, and restored the default/cleaned disposable files. Live browser search confirmed All files first/selected, Enter removed input focus, and Hebrew results resolved to song page 5. GitHub commit/PR/merge remains pending a release request.

## Future backlog: not part of version 1

## Separate upload pickers (2026-10-07)

- [x] **UP-001 - Split PDF and screenshot selection.** Master and Settings reuse separate Choose PDF (single application/pdf or .pdf) and Choose screenshots (multiple PNG/JPEG/WebP) inputs. Neither requests camera capture. Optional naming, PDF validation, stitching and library saving remain shared. Cancelling preserves the current selection; choosing the same file again works. Type checking and build pass.
- [x] **UP-002 - Phone chooser acceptance and deployment.** User confirmed the split pickers work. Deployment build passed and Firebase Hosting published on 2026-10-07; source release proceeds through the separate-upload-pickers PR. Screenshot selection may still offer Camera because the browser owns that chooser.

## Persistent room uploads and Settings cleanup (2026-10-07)

- [x] **RF-001 - Permanent reusable uploads.** Completed Master/Settings uploads remain in the shared catalog and Storage for future rooms. Room expiry and deletion with keep-files do not remove them. Existing upload/default permissions are preserved.
- [x] **RF-002 - Settings file management.** List available PDFs/image songs, preview/delete them, and display upload room/date. Only Settings manages the global default; current-default deletion remains protected.
- [x] **RF-003 - Per-room uploads.** Expand Uploaded files for each room and preview its uploads from any participant. Existing-file selection is not an upload; origin/lifetime checks protect older files when codes are reused.
- [x] **RF-004 - Explicit deletion policy.** Single-room and all-room deletion offer keep-files, delete-files and cancel. Keep is first; delete targets only those rooms' uploads and retains the global default and files displayed in other active rooms.
- [x] **RF-005 - Local verification.** 65 tests, type checking/build and disposable HTTP integration pass. Checks cover future-room reuse, attribution, unrelated files/default retention, rejected unauthenticated/invalid operations, and deferred byte cleanup. Browser verified origin/date list, upload-count details, keep/delete/cancel dialog and cancellation leaving the room intact.
- [ ] **RF-006 - Phone/cloud acceptance and release.** Verify room upload previews and both choices on a phone; verify cloud multi-path deletion/default protection with disposable fixtures, then deploy and release when requested.

Release evidence (2026-10-07): all 65 tests and deployment build pass. Cloud regression verified keep-files removal, atomic room/file tombstoning, protected-default rejection without partial room removal, and unauthorized rejection. Restored the default and removed disposable rooms/files. Hosting published; source release proceeds through the room-file-retention PR. Physical-phone acceptance remains pending.

## Sharing controls (2026-10-07)

- [x] **SH-001 - Compact sharing icons.** Replace the room-header Share text with the standard share SVG. The invitation dialog provides separate share and copy icons with accessible names; copy writes the room URL and confirms success.
- [x] **SH-002 - Native share action.** Invoke the browser's native share sheet from a button press, with the room title and URL. Cancellation is silent; unsupported browsers retain copy/QR with an explanation. Build and local dialog/copy verification pass.
- [x] **SH-003 - Phone acceptance and deployment.** User confirmed sharing/copy works on HTTPS. The final Hosting build also removes Search songs from Home while retaining room/Settings search; 63 tests and deployment build passed. GitHub release proceeds through the share-icons PR.

Hosting deployed on 2026-10-07. Live HTTPS checks confirm separate share/copy icons, enabled native share and copy success feedback. Copy now uses a synchronous selected field inside the modal, with the secure clipboard API as fallback, after the user reported no copied URL. Actual copy/paste and native share-sheet acceptance require phone verification: browser automation uses a separate virtual clipboard and cannot verify the operating-system clipboard. GitHub release remains pending.

- [ ] **F-001 - Add a built-in song index.** As a musician, I can choose a song name to navigate to its page. Acceptance when scoped: versioned mapping agrees with the current PDF, including index-page offsets.
- [ ] **F-002 - Add favorites.** As a musician, I can save favorite songs locally. Acceptance when scoped: favorites use stable source/song IDs and handle PDF version changes.
- [ ] **F-003 - Add recent rooms.** As a participant, I can reopen a recent room. Acceptance when scoped: expiry/missing-room handling and no leaked Master credentials.
- [ ] **F-004 - Add external chord sources.** As a musician, I can open permitted chord content. Acceptance when scoped: embedding restrictions, authentication, subscriptions, and permissions are respected; unsupported sites have a clear fallback.
- [ ] **F-005 - Add a browser-like source view.** As a Master, I can select supported external content. Acceptance when scoped: source-specific navigation and sync boundaries are explicit; do not assume arbitrary iframe access.
- [ ] **F-006 - Add WebRTC screen sharing.** As a Master, I can explicitly share a supported screen source. Acceptance when scoped: browser capture support, user consent, signaling, bandwidth, and separate media lifecycle verified.
- [ ] **F-007 - Add transposition for structured chords.** As a musician, I can change a supported song's key. Acceptance when scoped: structured chord source and correct chord/key behavior; do not claim transposition of arbitrary PDF images.
- [x] **F-008 - Scope admin PDF management.** Promoted to MR-049 through MR-052 above; remaining cloud and release work stays unchecked there.
- [ ] **F-009 - Add stronger invitations and abuse controls if needed.** As an organizer, I can open the service to a broader audience. Acceptance when scoped: defined threat model, stronger join authorization, room-creation limits, and verified enforcement beyond client UI.

## Follower file contributions (2026-10-08)

- [x] **FU-001 - Follower upload flow.** Followers open a hamburger menu and Add file/song, choose a PDF or screenshots, optionally name it, and save to the room library without changing the displayed source. Reuse existing validation and automatic stitching.
- [x] **FU-002 - Shared availability and private previews.** Completed contributions appear in the persistent shared library for all participants and future rooms. Open library dialogs refresh automatically. Followers use View files/songs to preview privately; only the Master changes the shared source and position.
- [x] **FU-003 - Enforce role permissions.** Local joins issue room-scoped upload-only tokens invalidated by expiry/deletion/reuse. Firebase catalog rules allow authenticated participants' own uploads associated with an active room. File metadata remains immutable; default management and deletion remain Settings-only. Existing UID-scoped Storage upload policies apply to Followers.
- [x] **FU-004 - Include all contributors in room cleanup.** Settings room upload counts/previews and keep/delete-files policy include Follower uploads within the originating room lifetime. Preserve the default and files used in other active rooms.
- [x] **FU-005 - Verify locally.** 67 unit tests, type checking, build and disposable local HTTP integration pass. Integration covers PDF/image uploads, file availability, rejected privileged writes, Master selection, future-room retention and delete-files cleanup. Browser checks confirm the Follower menu and upload controls/explanation. Cloud regression scripts now exercise actual Follower contributions.
- [ ] **FU-006 - Phone/cloud acceptance and release.** Test Follower uploads and Master selection on phones. On release, deploy the accompanying database rules, run cloud PDF/image regression checks, publish Hosting and complete the GitHub CLI release when requested.
- [x] **FU-007 - Replace the original songbook in Settings.** Add a PDF-only replacement dialog to the original file row. Reuse upload size/header validation and immutable storage URLs, update the administrator-only songbook descriptor with a new version, preserve existing rooms and the selected default. Type checking and build pass; phone/cloud acceptance remains part of FU-006.

Release evidence (2026-10-08): user confirmed Follower uploads locally. All 67 tests and the deployment build pass. Firebase database rules and Hosting are published. Cloud PDF/image regressions verify actual Follower uploads, exact downloads, Master source selection, denied privileged writes, persistent file/default protection and cleanup. Disposable records/files were removed and the prior default restored. The Follower upload notice now hides after five seconds. Original-PDF replacement uses the existing administrator-only descriptor endpoint; physical-phone replacement acceptance remains pending.

## Verification approach

Use focused automated tests for coordinate math, throttling/coalescing, stale-message handling, and recovery state transitions. Use Firebase emulator tests for the authorization boundary and concurrent room creation. Use browser tests for the create/join/view/follow flows, and manual physical-device tests for scrolling, memory, orientation, and mobile background behavior.

Do not treat a successful build or local BroadcastChannel demo as proof of cross-device reliability. Completion evidence should state what was tested and its limits. Any newly discovered defect gets a story or remains an explicit blocker to the relevant gate.
