# Screenshot sharing: design and implementation stories

Branch: `feat/website-casting`. Decision updated 2026-10-05.

## Chosen solution

The Master opens a chord website in their usual phone browser, selects the desired key there, and takes overlapping screenshots from top to bottom. Music Room automatically matches adjacent screenshots, removes matched overlap and detected stationary browser bars, and presents a stitched preview. The Master shares the result with the room. Followers download the same static image segments and follow the Master's zoom and horizontal/vertical position.

This works within the existing browser app and free infrastructure. No remote browser, installed app, screen recording or credit card is required. Screenshots capture the selected transposition; changing key later requires uploading new captures. Website controls and links are not interactive in the captured image. Use content you are permitted to share.

## Architecture

- `src/stitch.ts`: bounded RGB sample matching. Low-texture or ambiguous matches retain content and require preview review.
- `src/screenshot-import.ts`: browser image decoding, overlap cropping, common-width scaling and sequential JPEG export. One logical long sheet is split into short tiles to avoid a giant phone canvas.
- `src/sheet-dialog.ts`: multi-file selection, reorder, automatic matching, manual top/bottom crop adjustment, preview and upload status.
- `src/sheets.ts`: strict manifest, URL and upload size validation.
- `src/viewer.ts`: PDF and screenshot modes reuse gesture handling, virtualized rendering and normalized positions. Image tiles have no gaps.
- `src/rooms.ts`: upload segments first; atomically publish the manifest and reset position. Only the Master switches sources. Original room PDF metadata remains pinned.
- Local development: authenticated Master upload routes persist JPEGs under ignored `.local-data/sheets/`; SSE distributes manifests and position updates.
- Cloud: existing Supabase `room-sheets` public download bucket stores immutable JPEGs; Firebase stores the manifest and small position updates. Firebase rules restrict source and position changes to the Master. Storage upload policy verifies Firebase JWT issuer/audience/UID and allows each identity to write only its own namespace. Anonymous identities can create rooms; storage policy itself does not query room roles.

A manifest contains `{id,title,segments:[{url,width,height}]}`. Position adds `sourceId` (`pdf` or sheet ID) to prevent delayed updates for the previous source affecting the new one. Followers joining late load the current manifest and position. Returning to PDF resets to page 1 at 100% zoom.

## Bounds and lifecycle

Accept 1–20 PNG/JPEG/WebP screenshots totaling up to 100 MB, each at most 20 megapixels. Output is at most 1600 pixels wide, 2048 pixels per tile, 40 tiles, 3 MB per tile and 30 MB total. Export and upload run sequentially. Files are re-encoded, stripping original metadata. Matching assumes the same orientation and browser zoom; scrolling screenshots already captured as a single image can be uploaded alone within these bounds.

Capture with substantial overlap (about one third of the visible page), in order. Repeated verses, sticky overlays, ads, changed widths and sparse content can make matches ambiguous. No content is discarded on an uncertain join; preview and crop controls provide correction. Fixed bars are removed only on confident matches.

The old room source remains until all uploads finish and the manifest is published. Failed uploads may leave unused immutable tiles; retry uses a new ID. Saved songs remain in the library across sessions and local server restarts. The optional song name defaults to the first screenshot filename. The Master chooses the pinned PDF or any saved song through Select file/song in the hamburger menu; Add file/song opens the existing screenshot importer. Settings and RTL are in the same menu. Settings lists songs with view/delete actions. Deletion first creates a tombstone that hides the song and prevents new selections. Active rooms keep their current manifest and image URLs. Settings refresh or room deletion collects tombstoned songs with no active references, removes their tiles and then metadata. Failed cleanup remains retryable. Cloud cleanup requires administrator-only Storage SELECT/DELETE policies. Local metadata uses serialized atomic writes to `.local-data/songs.json`; cloud metadata lives under `/songs/<id>` with immutable owner/creation fields.

Public download links should contain only screenshots intended for the group; trim private browser information before sharing.

## Stories and verification

- [x] **SS-001 - Import screenshots on the Master's device.** File limits, decoding, ordering and crop adjustment implemented.
- [x] **SS-002 - Automatically stitch overlapping screenshots.** Matching, stationary-bar detection, conservative fallback and tiled preview implemented; textured overlap/bar/blank/malformed fixtures tested.
- [x] **SS-003 - Share the sheet with the room.** Authenticated local uploads, cloud upload client and atomic manifest/position updates implemented. Local HTTP tests deny Follower writes/uploads and stale source positions.
- [x] **SS-004 - Reuse zoom, pan and Follower sync.** Shared viewer modes and compact Master-only source buttons implemented. Separate-origin local browser views verified image downloads, shared zoom and role-specific controls.
- [x] **SS-005 - Return to the pinned PDF.** Source switch retains original PDF metadata and uses a new position tagged `pdf`.
- [ ] **SS-006 - Verify real phone captures.** Test Android and iPhone imports, crop quality, pinch/pan, memory, background/reconnect and large sheets on physical devices.
- [x] **SS-007 - Configure and verify cloud release.** Applied `supabase/sheets.sql` and deployed validated Firebase rules before Hosting on 2026-10-05. Live-cloud checks passed for real JPEG uploads/downloads, Follower denial, stale-source rejection and reconnect to the latest source/position.

## Previous exploration

Generic live website embedding was investigated and set aside. Cross-origin pages cannot be controlled by an ordinary iframe, phone browsers cannot generally initiate browser-tab screen sharing, and a cloud remote browser did not satisfy the no-credit-card requirement. Screenshot sharing is the user-approved replacement; desktop casting and remote-browser hosting stories are no longer active scope.

## Saved library stories (2026-10-05)

- [x] **SS-008 - Name songs optionally and save every successful import.** Blank names use the first filename; imports save before room publication. Catalog survives local server restarts and cloud records are independent of room expiry.
- [x] **SS-009 - Select the PDF or any saved song.** Master-only Songs chooser; no reupload needed; stale/deleted selections rejected by the backend.
- [x] **SS-010 - Manage songs through Settings.** Song listing, zoom/pan preview and confirmed deletion. Active rooms retain their copy; deferred cleanup reclaims unused tiles on refresh/room deletion.
- [x] **SS-011 - Verify persistence and deletion lifecycle locally.** Focused tests cover restart, concurrent imports, duplicate protection, unreadable-catalog preservation, tombstones and file cleanup. HTTP integration verifies another Master's room reusing a song, unauthorized deletion denial, deleted selection denial and keeping images until the final active reference is released.
- [x] **SS-012 - Verify saved-library cloud release.** Expanded rules and Storage cleanup policies deployed. Disposable live-cloud check verified Master creation, shared selection, Follower denial, administrator tombstoning, ongoing active-room position writes and actual JPEG cleanup before publication.

## Settings imports

The unlocked Settings screen has Add song. It reuses the screenshot importer through a small upload/save destination interface, displays Save song instead of Share with room, and refreshes the catalog after saving. It does not create or switch a room. Local administrator imports use authenticated `/api/admin/images` and `/api/admin/songs` routes. Cloud imports use the separate Settings Firebase identity and its own Storage namespace. The saved record has no `roomCode`; database rules allow this only for an allowlisted administrator. Musician creation still requires their own active room.

- [x] **SS-013 - Import and save songs from Settings without a room.** Same processing bounds and preview as Master imports; optional filename fallback; list refresh. Automated local checks cover authentication, malformed upload rejection, duplicate prevention, no-room creation, persistence and later room selection.
- [x] **SS-014 - Verify cloud Settings imports and release.** Verified administrator creation without room metadata, denied musician creation without an owned active room, real Storage upload and reuse in another room. Released after checks passed.

Release validation: 52 unit tests, type checking, PDF rendering compatibility, local HTTP integration and both cloud smoke scripts passed. `scripts/test-cloud-sheets.mjs` removes its own test records and images. The user approved local testing; comprehensive physical-phone checks remain open in SS-006.

## Settings during a session

- [x] **SS-015 - Open Settings without leaving the room.** Compact header gear opens a password-protected dialog using the separate Settings identity. Room subscriptions, viewer and shared position remain active. Nested Add song and preview dialogs reuse existing components; Back or Escape closes and locks Settings. Verified local browser return to page 37 at 110% zoom.
- [x] **SS-016 - Select newly added songs from any existing room.** Shared catalog is fetched each time Songs opens; Refresh songs reloads an already-open chooser. Importing does not change any room's selected source. Integration checks create two rooms first, verify both snapshots are unchanged by the Settings import, then select the song with each Master's credentials.
