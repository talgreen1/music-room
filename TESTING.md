# Testing Music Room

Reviewed against the implemented features and Git history through PR #20 on
2026-10-09. Every feature below has a test or an explicit acceptance procedure.
This is a coverage map, not a claim that every browser/device scenario is automated.

## Repeatable local checks

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run test
npm.cmd run test:integration
npm.cmd run build
```

`test` runs Vitest unit/regression tests. `test:integration` creates its own Vite
server on a random loopback port, a generated Settings password and a temporary
directory containing only test data. It runs seven HTTP/PDF checks
sequentially, closes the server and removes that directory. It needs no running
development server, credentials or cloud project and does not use your saved
`.local-data/`. Do not set external backend environment overrides for this suite.

GitHub Actions runs these commands on pull requests and pushes to `main` using
Node 24. The workflow does not deploy or use cloud credentials. Its first hosted
run still needs verification after the branch is pushed.

## Feature coverage

Paths in the Unit column are under `src/`; Integration paths are under `scripts/`.

| Feature | Unit/regression coverage | Integration / acceptance coverage |
| --- | --- | --- |
| Create/join, room code collisions, expiry and Master ownership | `model.test.ts`, `local-rooms.test.ts`, `rooms-ownership.test.ts` (snapshot recovery, identity/creator-marker checks, expiry and controller separation), `main-recovery.test.ts` (viewer/control recovery, unchanged sequence, obsolete source completion and live follow state) | `test-local-server.mjs`; `test-cloud-rooms.mjs`; two-browser join/recovery checklist |
| Smooth editor scrolling / own acknowledgement suppression | `rooms-control.test.ts`, `shared-control.test.ts` | Local writer-marker round trip; updated `test-cloud-control.mjs` pending rules deployment; latency/device checklist below |
| Controller pinch protection, fixed anchor and final-write completion | `controller-pinch.test.ts`, `main-pinch.test.ts`, `gestures.test.ts`, `viewer-control.test.ts`, `viewer-pinch-cancel.test.ts`, `sync.test.ts`; `rooms-control.test.ts`/`sync-diagnostics.test.ts` cover contention messages and opt-in bounded diagnostics | iPhone/two-controller acceptance below; simulated geometry/events do not prove native WebKit behavior |
| Automatic opt-in diagnostic reports and Settings viewer | `diagnostic-upload.test.ts`, `diagnostic-report.test.ts`, `diagnostic-store.test.ts`, `diagnostic-dialog.test.ts`, `rooms-diagnostics.test.ts`, `settings-diagnostics.test.ts` cover opt-in, bounds, one in-flight send, retries, lifecycle, separate Settings context, persistence/expiry, whitelisting and dialog close/delete behavior | `test-settings.mjs` checks actual local upload/read/delete authorization and schema limits; `test-cloud-diagnostics.mjs` must run after new rules deploy; phone acceptance below |
| Pinch geometry tracing | `pinch-diagnostics.test.ts`, `viewer-control.test.ts`, `sync-diagnostics.test.ts`, `diagnostic-report.test.ts` cover immediate/delayed measurements, cancellation, sampling, privacy and request size | `test-settings.mjs` checks geometry persistence/validation; expanded actual-cloud and iPad/iPhone acceptance below remain pending |
| Live position updates, throttling, stale-source/sequence rejection | `sync.test.ts`, `model.test.ts`, `local-rooms.test.ts` | Local SSE/reconnect check; cloud live subscriptions; network recovery checklist |
| Default synced Follower lock and explicit private browsing | `gestures.test.ts` covers drag/pinch, rechecking mid-gesture and controller/loading behavior; `follower-sync.test.ts` covers persistent manual opt-out | Locked-Follower browser checks below |
| Pinch, two-axis drag, trackpad zoom and dragging over PDF links | `gestures.test.ts`, `model.test.ts`, `viewer-control.test.ts` (atomic received zoom/scroll) | Local/cloud normalized position checks; Android/iPhone gesture checklist |
| Internal links, named destinations and RTL alignment | `pdf-links.test.ts`, gesture tap suppression | Real supplied-PDF destination tests; browser RTL/zoom checklist |
| PDF rendering and mobile compatibility | Actual PDF/link/search regressions | `test-pdf-compat.mjs` renders ink on actual pages with newer built-ins initially missing; phone memory/rotation checks |
| Compact previous/next navigation, zoom buttons, boundaries and follower permissions | `viewer-toolbar.test.ts`, `model.test.ts` | Toolbar phone acceptance below; actual rendering/sync requires device checks |
| Optional Master/controller vertical scrollbar, default-hidden menu preference and hidden Follower controls | `scrollbar.test.ts`, `vertical-scrollbar.test.ts` cover pointer/keyboard handling, visibility, cleanup, loading/role transitions and fresh-room reset | Vertical scrollbar acceptance below |
| PDF size/header and original descriptor validation | `songbook.test.ts` | `test-settings.mjs`, `test-file-library.mjs`; PDF-only replacement dialog checklist |
| Shared room control, pending/approval/password grants, release and permissions | `shared-control.test.ts`, `control-dialog.test.ts`, `rooms-control.test.ts`, `viewer-control.test.ts`, `follower-sync.test.ts`, scrollbar held-move regression | `test-shared-control.mjs`; rules-first `test-cloud-control.mjs`; shared-control checklist below |
| Settings password, expiry, rate limiting and administrator authorization | `admin-auth.test.ts` | `test-settings.mjs`, `test-cloud-control.mjs`, `test-cloud-github-storage.mjs`; focus/lock/in-room checklist |
| Persistent PDFs/images, default choice and original PDF replacement | `song-library.test.ts`, `songbook.test.ts`, `local-rooms.test.ts` | Settings/library checks verify new defaults and unchanged existing rooms; replacement browser checklist |
| Screenshot overlap, stationary bars, uncertain joins and manifest limits | `stitch.test.ts` | Actual JPEG upload/download checks; stitch/crop visual checklist |
| Follower imports, upload-only sessions and Master selection | `local-rooms.test.ts`, `song-library.test.ts` | `test-follower-uploads.mjs`; cloud files/sheets checks; menu/notice checklist |
| Room upload attribution, reused codes and keep/delete-files lifecycle | `song-library.test.ts` | `test-room-files.mjs`, cloud PDF checks; room deletion dialog cancellation checklist |
| Global/local search, names, Hebrew/niqqud, text, index links and deduplication | `search.test.ts` exercises the actual supplied PDF; `search-dialog.test.ts` checks bold match-first headings and destination selection | Search dialog scope, keyboard dismissal, heading layout and room switching checklist |
| Sharing and clipboard fallback | `clipboard.test.ts` verifies URL, modal focus, fallback and failure | Native phone share/cancel, QR scan and actual OS clipboard checklist |
| Compact menus, separate upload pickers and library auto-refresh | Permissions covered by store/integration tests | Role/menu, picker and two-client library checklist |
| Thumbnail-default library, list toggle, selection permissions and preview cleanup | `song-dialog.test.ts`, `library-thumbnails.test.ts` | Real PDF/image appearance and phone scrolling acceptance below; isolated DOM/render mocks do not prove actual canvas layout |
| Home explainer link and Hebrew portrait animation | `explainer.test.ts` tests the shipped player with controlled clock/audio | Home/back navigation and visual/music checklist |
| Autoplay, reduced motion, pause/seek/stop, mute/volume and late audio races | `explainer.test.ts` | Actual browser audio, mobile autoplay and visibility checklist |
| Production configuration and hosting | Type check, `deployment-config.test.ts` and regular build in CI | Deployment build rejects missing Firebase settings, emulator mode and missing/invalid GitHub Worker origins; release HTTP and cloud checks |
| GitHub-only uploads/deletion, required configuration and legacy URL retention | `github-storage.test.ts`, `file-upload.test.ts`, `cloud-storage.test.ts` | `storage-worker/storage.test.ts` runs the real Worker runtime with isolated Firebase/GitHub upstreams; actual-service and phone checks below |

## Cloud checks

Cloud checks are deliberately outside CI. They need ignored deployment environment
configuration, Firebase anonymous/Settings authentication and deployed database rules.
Run relevant checks sequentially in a controlled session:

```powershell
node --use-system-ca scripts/test-cloud-rooms.mjs
node --use-system-ca scripts/test-cloud-control.mjs
node --use-system-ca scripts/test-cloud-diagnostics.mjs
node --use-system-ca scripts/test-cloud-github-storage.mjs
```

These perform real operations. The GitHub storage check removes its own files, room and anonymous identities without changing the global default. The older room smoke check leaves an expiring test room. Review each script cleanup before use. Expected permission-denied responses assert forbidden writes. Local tests do not establish production Firebase/Worker permissions or real-network latency. Retired Supabase scripts and setup policies are no longer supported.

## Browser and physical-phone acceptance

### iPhone pinch with multiple controllers

These checks have not yet been run on real devices for this change. The supplied
recording shows document jumps and an already-visible `maxretry` message; it does
not establish the exact iPhone-specific cause. Regression tests exercise remote
updates during a pinch, final-write completion/failure, stale completions, source/
role/reconnect overrides, and a stable anchor despite simulated stale scroll pixels.

- [ ] Record build, iPhone model/iOS version, browser/version and network. Use an iPhone and an independent second controller; keep the second device idle first, then intentionally edit from it during a pinch. Compare Safari and Chrome on iPhone with Android/desktop.
- [ ] Pinch in/out at first/middle/last PDF pages, over links, at zoom limits and on image sheets. Keep one finger down after the other lifts, continue dragging and then release. The iPhone must retain the local anchor without jumping to a remote page; another viewer must continue receiving live zoom/position. Once the final write completes, new other-controller edits must apply normally. Zoom buttons and ordinary pan must still work.
- [ ] Introduce network delay and verify delayed ordinary updates do not move the local viewer during a pinch/final write. Repeat with overlapping pinches and quick successive gestures. A transaction failure must show a readable message, release protection and not create an unlimited retry loop. Do not treat simultaneous gestures as exclusive room ownership.
- [ ] During a pinch, switch the shared file or select an atomic search destination from the other controller, revoke this device's control, and reconnect its network. Each must interrupt the old gesture and resynchronize immediately, with no stale final write from that gesture changing the new source. A synced read-only Follower remains locked; explicit private browsing stays private.
- [ ] Add `&syncDebug=1` to the room URL and reload, reproduce the pinch, wait at least five seconds with the tab open and network available, then load the room code in **Settings → Sync debug reports** from another device. Verify the correct coarse platform/browser and gesture/error events appear without a Mac or console. Repeat on iPhone Safari/Chrome and local development. Ordinary tabs must send no debug reports; remove the flag/reload to stop. Optional local console history stays capped at 50 events without room codes/credentials/file URLs/song text. Server report paths intentionally associate the room code and anonymous uploader/session.

### Server diagnostic acceptance and release

- [ ] Expanded pinch geometry trace (not yet run on physical iPad/iPhone): deploy updated report rules, run `scripts/test-cloud-diagnostics.mjs`, then deploy Hosting. Reload a two-controller room with `syncDebug=1`, record the screen while pinching on middle/late pages and at document edges, leave it online for five seconds, and inspect the room's Settings reports. Compare `targetTop`/`actualTop` and `targetLeft`/`actualLeft` immediately (`pinch-layout`) and two frames later (`pinch-frame`), alongside anchor/observed pages and dimensions. Account for normal boundary clamping; distinguish a wrong initial target from a later browser movement. Confirm ordinary tabs produce no tracing, new gestures/source changes do not produce obsolete frame comparisons, and no more than 12 geometry events appear per snapshot. This instrumentation does not itself verify a fix.

Geometry coverage: `pinch-diagnostics.test.ts` covers opt-in, delayed movement, sampling, final capture and cancellation; `viewer-control.test.ts` checks requested versus actual geometry from the viewer; `diagnostic-report.test.ts` and `sync-diagnostics.test.ts` cover whitelist/range validation, copied values, bounded history and the HTTP size limit. `test-settings.mjs` round-trips detailed snapshots through isolated local storage. Updated cloud checks exercise valid geometry and denied extra/missing/non-numeric/out-of-range fields; these actual-service checks passed on 2026-10-26 after rules deployment, with all disposable reports, room and identities cleaned up.

Geometry-extension verification (2026-10-26): type checking, 177 unit tests across 42 files, all seven isolated integration checks (including geometry validation/persistence), production/deployment builds and whitespace checks passed. The build retains its existing large-chunk warning. Updated Database rules passed Firebase syntax validation and actual cloud authorization/schema checks before Hosting deployment. Live JS/CSS matched deployment output, including the new trace markers. Source commit: `5b0344d` on `feat/automatic-debug-reports`; no push, PR or merge requested for this release. Physical iOS measurements remain pending.

- [x] Deploy the new Database rules, then run `node --use-system-ca scripts/test-cloud-diagnostics.mjs` before Hosting. It checks anonymous/other-UID/expired-room/schema/oversize/rapid/nested-update denial, permitted own reports without room-control grants, musician read/delete denial and Settings read/delete. Passed on 2026-10-25; all test reports, room and temporary identities were cleaned. The existing cloud room-control regression also passed, followed by Hosting and exact live-bundle verification.
- [ ] On iPhone, collect and read reports through Settings without developer tools. Check session separation on reload, late loading after room expiry, manual deletion and reload-to-restart behavior. Network failures/backgrounding must not interrupt music-room controls; delivery is best-effort rather than guaranteed after closure.
- [ ] Verify report expiry after 24 hours and cleanup on loading that code in Settings. There is no automatic scheduled purge of never-requested room codes. Verify reports can be read only by Settings, and locking/closing Settings prevents late report responses from appearing. No report data may include passwords/tokens, URLs, full user agent or song text.

Local tests do not prove Firebase permission enforcement. A Java runtime/emulator
is not available in this workspace; the actual-service check above verified the
deployed rules before the dependent frontend was published on 2026-10-25.

Search result headings: `search-dialog.test.ts` verifies bold matched text before
file/page details, Hebrew text direction, filename/title matches, safe text rendering
and unchanged destination selection. Confirm on a phone that long Hebrew song titles
remain readable above the secondary file/page line; this visual check is pending.

### File chooser thumbnails

- [ ] On desktop, Android and iPhone, open Select file/song: thumbnails are the default, the original book is included, and PDF first pages/image first tiles are recognizable with readable titles.
- [ ] Switch to List and back; neither changes the shared song. Refresh/new uploads retain the current mode. Close/reopen restores the thumbnail default.
- [ ] Select a thumbnail as Master/controller and confirm both devices switch. As a Follower, selection opens a private preview and never changes the room.
- [ ] Scroll a long library, close during PDF loading, switch views rapidly and rotate the phone. Confirm no stale previews, clipping or growing canvas/worker usage. Network errors leave names selectable.

These visual/physical-device checks have not yet been run. Automated DOM tests cover
toggle/default behavior, refresh/polling, selection permissions, close races and cleanup.
Renderer tests cover bounded first-page geometry, lazy loading, two-job concurrency,
offscreen release, load cancellation, error fallback and late completion suppression.

### GitHub storage migration checks

`storage-worker/storage.test.ts` bundles the production Worker and runs it in
Miniflare/workerd. Only upstream Firebase/GitHub HTTP responses are isolated. It
checks signed versus forged/expired/wrong-project identities, own namespaces,
active-room and Settings upload permissions, stream length/header validation,
immutable conflicts, exact public bytes, secret-free CDN requests and deletion
retention. `src/github-storage.test.ts` verifies required origin configuration, request scope,
returned URL validation and rejecting mixed/unrelated deletion paths. These tests
do not establish live GitHub/Cloudflare availability or production Database rules. `file-upload.test.ts` and `cloud-storage.test.ts` verify GitHub-only PDF/Settings/room screenshot routing, no requests on missing configuration, local upload preservation, successful/failed deletion, active-room retention and refusal to clean up non-GitHub records.

After deploying the Worker and Database rules, configure its allowed origin with
`scripts/configure-github-storage.mjs`, then run:

```powershell
node --use-system-ca scripts/test-cloud-github-storage.mjs
```

This check creates its own room, anonymous identities and PDF/JPEG assets, verifies
Master/Follower/Settings imports and permissions, and removes its fixtures in a
finally block. It does not change the global default or existing rooms. Review any
cleanup failure before release. The migration tool is separate and intentionally
changes catalog/default/original descriptors only with `--apply`; its default mode
backs up bytes/metadata under ignored `.local-data/github-migration/`. Run migration
in a maintenance session without concurrent file/default edits. Verify SHA-256
and the saved `metadata.json`/`uploaded.json`/`changes.json` before retiring Supabase.

- [x] Live Worker/rules: actual-service storage check passes, including the full songbook PDF, and its disposable files, room and identities are cleaned (2026-10-16).
- [x] Migration: user-supplied local original backed up and copied hashes match; default preserved; zero visible catalog files required migration. Existing room descriptors remain unchanged (2026-10-16).
- [ ] Android/iPhone: Master, Follower and Settings upload PDF/images; a large PDF succeeds within Free Worker limits; stitching and private previews still work.
- [ ] Follower import leaves the shared view unchanged; Master/controller selection appears on both phones and files remain available in new rooms.
- [ ] Settings replaces original, changes default, deletes unused files and defers deletion of files still in active rooms; search reads migrated PDFs.
- [ ] GitHub-only release (not yet run): test Master/Follower/Settings PDF and screenshot imports, original replacement, default and active-room retention, deletion, search/previews and cross-device sync on desktop/Android/iPhone. Inspect network requests: new imports/deletions use only the Worker. A cloud upload without a Worker origin must fail without trying another provider; a deployment build must reject a blank/invalid origin. Existing historical URLs may still request their original host for viewing.

Actual-service upload/permission/full-PDF checks and the supplied-original migration
passed on 2026-10-16. The deployed original returned HTTP 206 with exactly 1,024
requested bytes and CORS enabled. The cloud control regression also passed after
the rules update. The final successful cloud run cleaned its disposable files,
room and identities; earlier network-interrupted runs left no catalog files, but
may have left temporary anonymous authentication identities. The previous Supabase
host was unavailable, so old hosted bytes could not be compared with the user's
replacement. Existing rooms were not mutated; their previous host must be available
to render old URLs. Physical-phone/UI acceptance has not yet been run. Isolated
Worker tests, pure migration-plan regressions in `storage-worker/migration.test.ts`
and local integration are evidence only for their covered paths. Migration-plan
tests cover default mapping, original versioning, image geometry/order, preserved
attribution and rejecting incomplete or foreign-provider copies.

### General phone acceptance

Use a Master and Follower with independent tab identities. Test Android and iPhone
where available. Use the deployed HTTPS app for native sharing; LAN HTTP can be
used for the other development flows. These are procedures to execute, not completed
results. Record date, browser/device, build and any failures when checking them off.

- [ ] Home: create a room, join by code/link, reject missing/expired codes; verify larger room code and Master/Follower labels.
- [ ] Master recovery (not yet run on real browsers/phones): retain the original Master tab, interrupt/reconnect its network and background/restore the phone, and verify Master labeling, navigation, document gestures and updates reaching a Follower. Refresh the original tab and verify ownership returns. A separate browser identity or a tab without the creator marker must remain a Follower unless explicitly granted control. For a deliberately injected null snapshot followed by the same valid snapshot, verify the unavailable screen closes, the viewer reloads at the shared position and Master controls return; an obsolete pending PDF load must not reopen the viewer while unavailable. Expired/deleted rooms must remain unavailable. Automated snapshot injection and DOM tests cover this recovery path; they do not establish the cause of the reported production incident or prove real-device networking.
- [ ] Menus: Add file/song is first; Master has Select file/song, Settings and RTL; Follower has View files/songs and Settings. No search menu item or Home/Follower search button.
- [ ] Vertical scrollbar (not yet run): on desktop, Android and iPhone, confirm **Show vertical scrollbar** follows RTL for Masters/controllers and starts unchecked, with no vertical or horizontal track on room entry. Enable it, drag/tap the vertical track and check keyboard controls, PDF/image navigation and synchronization to another device. Disable it and confirm ordinary two-axis dragging still works. Switching files retains the choice and disables the track while loading. Releasing control hides both toggle and track; reacquiring control restores the local choice. Read-only Followers never see the toggle/track, including while privately browsing. Reopening a room resets the choice. Rotate the device and check layout; showing/hiding must preserve the reading position.
- [ ] Master/controller viewport: the first-page arrow precedes previous/next page buttons, with no page number/input. Check it returns to the top of page 1 without changing zoom, including when already scrolled within page 1. Repeated presses work from the current viewer position on first/middle/final pages; boundary buttons disable. Compact minus / percentage / plus controls zoom PDFs and images, update after pinching and synchronize to other participants. Synced Followers have disabled zoom buttons and no page navigation; uncheck Master sync for private zoom, then recheck to restore shared zoom. Rotate portrait/landscape and check reachability at 320px widths. This updated toolbar device check has not yet been run.
- [ ] Sync: scroll, drag both axes and pinch on Master; Follower follows. Join late, disconnect/reconnect and background/restore a phone; it returns to the latest shared source/position.
- [ ] Follower browsing: Master sync starts checked. Touch drag/pinch, wheel/trackpad, keyboard scrolling and PDF links cannot move a synced read-only Follower or uncheck sync. Uncheck manually; drag/zoom/link navigation works privately and stays unsynced after more than three seconds. Recheck to snap to the latest shared position and relock. Incoming page/zoom/scroll updates still work while locked.
- [ ] PDF links: tap a song index at normal/high zoom; preserve zoom and align right with RTL on, left with RTL off. Pinch starting on links must not navigate accidentally or zoom browser chrome.
- [ ] Upload pickers: cancel, reselect the same file, choose PDF/images separately; reject invalid/oversized PDF. Optional name and original filenames persist.
- [ ] Stitching: upload overlapping captures, review uncertain joins, reorder/crop/update preview. Check no missing lines or repeated stationary browser bars; view at high zoom on both phones.
- [ ] Contributions: Follower uploads without changing the shared view. Master and another Follower see it in the auto-refreshing library. Master selects it for everyone; success notice disappears after five seconds. Follower previews remain private.
- [ ] Settings: password field starts focused; wrong password fails; Lock prevents further administrator actions. Open from a room, import/preview, then close without losing page/zoom/connection.
- [ ] Defaults/original: replace original PDF, verify new title/version, existing rooms unchanged and selected default unchanged. Make it default and create a new room. Other uploaded defaults work; current-default deletion stays disabled.
- [ ] Cleanup: per-room upload count includes Followers; previews work. Cancel deletion leaves room/files intact. Keep preserves files for future rooms. Delete hides only that room's uploads and preserves default/other active copies. Test all-room dialog on disposable rooms.
- [ ] Search: All files is first/default; Current file limits results. Enter dismisses phone keyboard. Search readable Hebrew text and renamed files; image-only content is not OCR searched. Open results at the correct page; no duplicate index/song-page result. Stop/close cancels extraction.
- [ ] Sharing: scan QR and join; share opens the native sheet and cancel is silent. Copy then paste into another app to verify the OS clipboard, including supported fallback behavior. Unsupported sharing displays a useful explanation.
- [ ] Explainer: home link/back link work. Portrait layout and Hebrew captions fit; leader phone is above Followers. Muted autoplay runs, reduced motion pauses. Play/Pause, Stop, seeking, volume/mute and tab hiding work; unmute does not restart. Closing CTA returns home.

## Latest local evidence

2026-10-09: all **79 unit tests**, TypeScript check and the **six isolated local
HTTP/PDF checks** passed. Player unit tests mock DOM/audio and exclude canvas
artwork; clipboard tests mock browser APIs and do not prove OS clipboard writes.
Visual layouts, native dialogs, audio output, real phone gestures and extended
network recovery retain the acceptance checks above. Previous live-cloud release
evidence is recorded in the README and detailed plan; cloud checks were not rerun
for this test-only work.

## Shared-control acceptance (not yet run on browsers/phones)

- [ ] Create a room in one browser and join in two other browsers/phones. The owner's role stays Master; Control room is the last Follower toolbar item.
- [ ] Check Control room; verify Ask for approval appears above the password form and remains reachable with the mobile keyboard open; verify initial focus is on Ask for approval and the keyboard stays closed until tapping the password. Close/Cancel without action: checkbox resets and permissions stay read-only.
- [ ] Ask for approval: dialog closes, checked box shows pending, private browsing remains available and does not move other participants. Owner sees Requests count.
- [ ] Owner denies: pending disappears. Request again and approve: Follower becomes Controller and gets shared file selection/navigation. A second Follower stays read-only.
- [ ] Try incorrect Settings password, then the correct one. Success grants only room control and signs Settings out; opening Settings again still requires a password.
- [ ] Owner and controller alternate file changes, link jumps, pinches, horizontal/vertical drags and fast scrollbar drags. Both see the latest change, other following devices follow, and no idle updates/oscillation continue.
- [ ] Hold a drag/pinch/scrollbar while receiving server echoes. Further movement still updates every viewer. Exercise competing controllers and source switches; no old-source movement leaks into the new file.
- [ ] Uncheck pending to cancel; uncheck approved to release. Master sync returns checked and locks the read-only view. Uncheck it to browse privately. Re-enable using approval/password again.
- [ ] Disconnect/reconnect, navigate away during password login or PDF load, expire/delete the room. No obsolete grants/writes/UI callbacks, stale local replay or Settings session remains. Local refresh needs a new grant; cloud refresh retains the same UID grant.

Evidence for this change: 97 unit/regression tests and seven isolated local integration scripts passed; type checking and build are recorded in the implementation report. Actual Firebase control rules checks passed against production on 2026-10-10, including concurrent transactions starting with empty client caches. Real touch/UI acceptance has not yet run. `test-cloud-control.mjs` is outside CI and must run after rules deployment before publishing the dependent frontend. It tests self-grant denial, pending requests, owner denial/approval, administrator grants, concurrent sequences, source reset, revocation, stale writes and Settings/owner permission isolation. It removes its own rooms and does not modify global default/catalog/storage.

## Synced Follower interaction lock (2026-10-10)

- [ ] On Android/iPhone and desktop, verify a newly joined read-only Follower cannot drag/scroll/pinch while Master sync is checked, but follows all owner/controller page/zoom/scroll changes.
- [ ] Uncheck Master sync, browse via touch, wheel/keyboard and PDF links, and wait beyond three seconds. Sync stays off and no other viewer moves.
- [ ] Recheck: return to the latest room position and relock. Repeat while holding a gesture; no further gesture movement affects the locked view.
- [ ] Grant control: shared drag/zoom works. Release control: Master sync is checked and interaction locked again. Masters remain interactive throughout.

These browser/device procedures have not yet been run. No backend rules or Storage policies change in this feature.

## Smooth shared-control scrolling regression (2026-10-14)

Automated coverage: `rooms-control.test.ts` simulates delayed own acknowledgements after the local view has moved ahead, verifies distinct browser identities and continued other-controller/legacy/follower updates. `shared-control.test.ts` and `test-shared-control.mjs` verify marker round trips, invalid-marker rejection, unchanged authorization and clearing on source resets. `test-cloud-control.mjs` now checks the optional marker against actual Firebase rules; the updated rules were deployed and this actual-service check passed on 2026-10-14.

- [ ] Android/iPhone and desktop: continuously drag/scroll/pinch as Master, with a synced Follower and an approved controller. Verify no backward snaps when own writes return; compare under network latency.
- [ ] Alternate controller/Master drags, wheel/keyboard scroll and fast-scrollbar movements. Verify the other editors and synced Followers still move together, including separate browser tabs sharing an anonymous UID.
- [ ] Jump pages, select/reset the same file, switch files, release control and reconnect. Destinations and shared positions must still apply on the initiating device; older clients/records without a marker remain supported.

These device/browser checks remain unrun. Updated Database rules were deployed before Hosting; the actual cloud check verified acceptance of valid markers, rejection of malformed markers and existing shared-control permissions on 2026-10-14. Local checks alone do not establish cloud acceptance.

## Follower zoom/scroll coherence (2026-10-14)

The supplied six-second recording was inspected at sampled timestamps; it shows zoom changes followed by movement through blank/unrelated document regions before settling. The viewer previously resized pages immediately but interpolated from scroll pixels belonging to the old scale. Zoom changes now apply both scroll axes and scale atomically; unchanged-zoom pans retain interpolation.

`viewer-control.test.ts` covers page-2 zoom-out/zoom-in coordinates, horizontal/RTL alignment, interruption of a pending pan animation, remote tagging and preservation of same-zoom interpolation. This is a coordinate regression, not proof of real canvas rendering or phone smoothness. No backend rules change.

- [ ] Repeat the recorded zoom-out/in sequence with a synced Follower: no intermediate blank/adjacent-page drift; both axes and page remain aligned with the Master.
- [ ] Test rapid pinch-in/out near page boundaries, RTL right edge, portrait/landscape and slower network, including an approved controller viewing another editor's zoom.
- [ ] Confirm ordinary same-zoom scrolling still eases and final positions match. Check canvas/text remains visible during repeated zoom gestures on Android/iPhone.

These post-fix browser/device checks have not yet been run; the original recording was inspected, not reproduced in a live browser.

## Control dialog approval-first layout

`control-dialog.test.ts` checks the rendered approval-before-password order, primary/secondary action emphasis, approval-button focus with no password autofocus and requesting approval without entering a password. It uses a minimal mocked DOM and does not establish phone keyboard/layout visibility. Verify the green approval button is reachable with the Android/iPhone keyboard open, the compact password/unlock row fits without clipping, and focusing the password field does not trigger browser-page zoom (input font stays 16px); this physical-device check has not yet been run.
