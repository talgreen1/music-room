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
directory containing only test data. It runs the six existing HTTP/PDF checks
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
| Create/join, room code collisions, expiry and Master ownership | `model.test.ts`, `local-rooms.test.ts` | `test-local-server.mjs`; `test-cloud-rooms.mjs`; two-browser join checklist |
| Live position updates, throttling, stale-source/sequence rejection | `sync.test.ts`, `model.test.ts`, `local-rooms.test.ts` | Local SSE/reconnect check; cloud live subscriptions; network recovery checklist |
| Follower three-second return and persistent manual opt-out | `follower-sync.test.ts` | Touch/held-drag and multiple-update browser checks |
| Pinch, two-axis drag, trackpad zoom and dragging over PDF links | `gestures.test.ts`, `model.test.ts` | Local/cloud normalized position checks; Android/iPhone gesture checklist |
| Internal links, named destinations and RTL alignment | `pdf-links.test.ts`, gesture tap suppression | Real supplied-PDF destination tests; browser RTL/zoom checklist |
| PDF rendering and mobile compatibility | Actual PDF/link/search regressions | `test-pdf-compat.mjs` renders ink on actual pages with newer built-ins initially missing; phone memory/rotation checks |
| Page navigation, first-page action and final-page anchoring | `model.test.ts` | Page-button browser checklist |
| Master vertical scrollbar, keyboard handling and hidden Follower scrollbar | `scrollbar.test.ts` | Role/layout checklist |
| PDF size/header and original descriptor validation | `songbook.test.ts` | `test-settings.mjs`, `test-file-library.mjs`; PDF-only replacement dialog checklist |
| Settings password, expiry, rate limiting and administrator authorization | `admin-auth.test.ts` | `test-settings.mjs`, `test-cloud-settings.mjs`; focus/lock/in-room checklist |
| Persistent PDFs/images, default choice and original PDF replacement | `song-library.test.ts`, `songbook.test.ts`, `local-rooms.test.ts` | Settings/library checks verify new defaults and unchanged existing rooms; replacement browser checklist |
| Screenshot overlap, stationary bars, uncertain joins and manifest limits | `stitch.test.ts` | Actual JPEG upload/download checks; stitch/crop visual checklist |
| Follower imports, upload-only sessions and Master selection | `local-rooms.test.ts`, `song-library.test.ts` | `test-follower-uploads.mjs`; cloud files/sheets checks; menu/notice checklist |
| Room upload attribution, reused codes and keep/delete-files lifecycle | `song-library.test.ts` | `test-room-files.mjs`, cloud PDF checks; room deletion dialog cancellation checklist |
| Global/local search, names, Hebrew/niqqud, text, index links and deduplication | `search.test.ts` exercises the actual supplied PDF | Search dialog scope, keyboard dismissal and room switching checklist |
| Sharing and clipboard fallback | `clipboard.test.ts` verifies URL, modal focus, fallback and failure | Native phone share/cancel, QR scan and actual OS clipboard checklist |
| Compact menus, separate upload pickers and library auto-refresh | Permissions covered by store/integration tests | Role/menu, picker and two-client library checklist |
| Home explainer link and Hebrew portrait animation | `explainer.test.ts` tests the shipped player with controlled clock/audio | Home/back navigation and visual/music checklist |
| Autoplay, reduced motion, pause/seek/stop, mute/volume and late audio races | `explainer.test.ts` | Actual browser audio, mobile autoplay and visibility checklist |
| Production configuration and hosting | Type check and regular build in CI | Deployment build rejects missing Firebase/emulator configuration; release HTTP and cloud checks |

## Cloud checks

Cloud checks are deliberately outside CI. They need ignored deployment environment
configuration, Firebase anonymous/Settings authentication, deployed database rules
and configured Supabase policies. Run them sequentially in a controlled session:

```powershell
node --use-system-ca scripts/test-cloud-rooms.mjs
node --use-system-ca scripts/test-cloud-settings.mjs
node --use-system-ca scripts/test-cloud-files.mjs
node --use-system-ca scripts/test-cloud-sheets.mjs
```

These perform real operations. Files/sheets checks remove their disposable records
and bytes; the PDF check temporarily changes and restores the global default.
The older room smoke check leaves an expiring test room, and the older Settings
check leaves a versioned verification PDF. See their cleanup code before use.
Expected permission-denied warnings are assertions that forbidden writes failed.
Local tests cannot prove Firebase/Supabase authorization or real-network latency.

## Browser and physical-phone acceptance

Use a Master and Follower with independent tab identities. Test Android and iPhone
where available. Use the deployed HTTPS app for native sharing; LAN HTTP can be
used for the other development flows. These are procedures to execute, not completed
results. Record date, browser/device, build and any failures when checking them off.

- [ ] Home: create a room, join by code/link, reject missing/expired codes; verify larger room code and Master/Follower labels.
- [ ] Menus: Add file/song is first; Master has Select file/song, Settings and RTL; Follower has View files/songs and Settings. No search menu item or Home/Follower search button.
- [ ] Master viewport: first-page arrow, previous/next and page input work on the first, middle and final PDF pages; only Master has the vertical scrollbar. Rotate portrait/landscape and check reachable controls.
- [ ] Sync: scroll, drag both axes and pinch on Master; Follower follows. Join late, disconnect/reconnect and background/restore a phone; it returns to the latest shared source/position.
- [ ] Follower browsing: drag/pinch/link click pauses sync; return occurs three seconds after interaction ends, never during a held drag. More activity restarts the delay. Manual opt-out persists until checked again.
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
