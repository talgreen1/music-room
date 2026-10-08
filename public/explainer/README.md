# Hebrew explainer

Open `http://localhost:5173/explainer/index.html` after `npm run dev`.
This is a standalone page; it does not connect to room services or access uploaded files.

The 42-second film uses a 720 × 1280 portrait canvas. The leader appears above two
Followers. All text, artwork and animation are rendered locally in JavaScript.

Storyboard:

- 0–3.5s: Music Room appears, followed by “אתר שיתופי לנגנים” in the same scene.
- 3.5–5.8s: a large “אז מה בעצם הבעיה?” introduces the problem.
- 5.8–11s: three independent phones browse for a song, then scroll out of sync.
- 11–13s: “הפתרון: Music Room!” introduces the solution.
- 13–18s: the leader creates a room.
- 18–23s: musicians join using a link or room code.
- 23–25.5s: the leader selects a song from a prepared list; it appears on both Followers' phones.
- 25.5–33.5s: leader drags, then Followers catch up, then the scroll caption appears;
  the same demonstration-first sequence introduces synchronized zoom and pan.
- 33.5–38.5s: explain that a missing song can be added from the browser, then show
  “כל השירים זמינים גם לפעמים הבאות”.
- 38.5–42s: benefits and website address.

Explanatory captions use only short bold text below the illustrations, without
secondary explanatory lines. Phone UI labels remain
inside the phones. In the sync scene, the short illustrative delay makes the
leader-to-Followers direction visible; it is not a measured network latency.

The player autoplays muted, except when reduced motion is requested. Tap Unmute
to enable the soundtrack without restarting. Play/Pause toggles playback; Stop pauses and resets to
zero. The timeline seeks without changing the playback mode. Volume and mute
control a Web Audio gain node without resetting the animation. Press Play to
control playback; browser audio requires a user gesture.
The soundtrack runs at 140 BPM and is synthesized locally by `soundtrack.js`.

A permanent Back to home link opens `/`. The existing closing-scene home button
still appears when playback ends. The home page links to this animation. Extra
explanatory text and video-export controls have been removed from the player.

Edit scene times/copy/artwork in `explainer.js`. Keep `DURATION` and the HTML
timeline/time label in sync when changing length. Vite copies this directory
unchanged during builds.

Deployment URL: https://talgreen-music-room.web.app/explainer/index.html
