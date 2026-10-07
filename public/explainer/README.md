# Hebrew explainer

Open `http://localhost:5173/explainer/index.html` after `npm run dev`.
This is a standalone page; it does not connect to room services or access uploaded files.

The 40-second film uses a 720 × 1280 portrait canvas. The leader appears above two
Followers. All text, artwork and animation are rendered locally in JavaScript.

Storyboard:

- 0–3.5s: Music Room appears, followed by “אתר שיתופי לנגנים” in the same scene.
- 3.5–5.8s: a large “אז מה בעצם הבעייה?” introduces the problem.
- 5.8–11s: three independent phones browse for a song, then scroll out of sync.
- 11–16s: the leader creates a room.
- 16–21s: musicians join using a link or room code.
- 21–23.5s: the leader selects a saved song; it appears on both Followers' phones.
- 23.5–31.5s: leader drags, then Followers catch up, then the scroll caption appears;
  the same demonstration-first sequence introduces synchronized zoom and pan.
- 31.5–36.5s: upload a PDF/screenshots for future use.
- 36.5–40s: benefits and website address.

Explanatory captions use only short bold text below the illustrations, without
secondary explanatory lines. Phone UI labels remain
inside the phones. In the sync scene, the short illustrative delay makes the
leader-to-Followers direction visible; it is not a measured network latency.

Click **הפעלת מוזיקה** to preview with music; browser autoplay restrictions require
a user gesture. The original instrumental soundtrack is synthesized by
`soundtrack.js` using Web Audio, without licensed songs, samples or network calls.
Playback controls support pause, restart and seeking; reduced-motion preferences
start playback paused.

Click **הורדת וידאו** to record the complete animation **with music**, even if preview
music is muted. Keep the tab foregrounded for the recording. Chrome/Edge export
WebM (VP9/VP8 + Opus); MP4 is a fallback where the browser supports it. Moving to
another tab cancels the export to avoid missing animation frames. No microphone,
camera, screen-capture permission, paid service or cloud rendering is required.

Edit scene times/copy/artwork in `explainer.js`; adjust `DURATION`, the HTML timeline,
time labels and notes together if changing the film length. The files in this
directory are copied unchanged by Vite builds. Deployment URL:
`https://talgreen-music-room.web.app/explainer/index.html` (after deployment).
