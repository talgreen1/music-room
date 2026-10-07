// A deterministic 42-second portrait film with an original Web Audio soundtrack.
// All artwork and music are generated locally. No remote assets or uploads.
import { createSoundtrack, SOUNDTRACK_BPM } from './soundtrack.js';
const canvas = document.querySelector('#film');
const ctx = canvas.getContext('2d');
const play = document.querySelector('#play');
const restart = document.querySelector('#restart');
const timeline = document.querySelector('#timeline');
const timeLabel = document.querySelector('#time');
const download = document.querySelector('#download');
const status = document.querySelector('#status');
const sound = document.querySelector('#sound');
const goHome = document.querySelector('#go-home');
const DURATION = 42;
const C = { bg: '#101d19', ink: '#edf5eb', muted: '#a6bbac', lime: '#b6e491', teal: '#60d5bf', orange: '#efb280', paper: '#f7f4e9', dark: '#173027' };
const scenes = [
  { start: 0, end: 3.5, kind: 'brand' },
  { start: 3.5, end: 5.8, kind: 'question' },
  { start: 5.8, end: 11, kind: 'before' },
  { start: 11, end: 13, kind: 'solution' },
  { start: 13, end: 18, kind: 'create' },
  { start: 18, end: 23, kind: 'join' },
  { start: 23, end: 25.5, kind: 'select' },
  { start: 25.5, end: 33.5, kind: 'sync' },
  { start: 33.5, end: 38.5, kind: 'upload' },
  { start: 38.5, end: 42, kind: 'end' },
];
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const mix = (a, b, t) => a + (b - a) * t;
function box(x, y, w, h, radius, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function text(value, x, y, size = 24, color = C.ink, align = 'center', weight = 400) {
  ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.fillStyle = color; ctx.fillText(value, x, y); ctx.restore();
}
function pill(value, x, y, width, color = C.lime) {
  box(x - width / 2, y - 20, width, 40, 20, C.dark);
  text(value, x, y, 18, color, 'center', 700);
}
function line(x1, y1, x2, y2, color, width = 3) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function check(x, y, color = C.lime) {
  ctx.lineCap = 'round'; line(x - 9, y, x - 2, y + 7, color, 4); line(x - 2, y + 7, x + 12, y - 9, color, 4);
}
function music(x, y, color = C.lime) {
  line(x, y - 16, x, y + 17, color, 4); line(x, y - 16, x + 19, y - 21, color, 4);
  ctx.beginPath(); ctx.ellipse(x - 7, y + 17, 9, 6, -.3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function background(t) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 720, 1280);
  const glow = ctx.createRadialGradient(360, 620, 40, 360, 620, 750);
  glow.addColorStop(0, '#214837'); glow.addColorStop(1, C.bg);
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 720, 1280);
  ctx.save(); ctx.globalAlpha = .08;
  for (let i = 0; i < 22; i++) {
    const x = (i * 177 + 30) % 720, y = (i * 97 + 40 + t * (i % 2 ? 14 : -12) + 1280) % 1280;
    music(x, y, C.lime);
  }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = .13; ctx.strokeStyle = C.lime; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(360, 465, 280 + Math.sin(t * Math.PI * SOUNDTRACK_BPM / 60) * 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
function caption(scene, local, delay = .6, until = Infinity) {
  const entry = ease((local - delay) / .35) * ease((until - local) / .25);
  ctx.save(); ctx.globalAlpha *= entry; ctx.translate(0, 18 * (1 - entry));
  scene.title.forEach((value, i) => text(value, 360, 962 + i * 64, 55, C.ink, 'center', 700));
  ctx.restore();
}
function paper(x, y, w, h, scroll, zoom = 1, pan = 0) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = C.paper; ctx.fillRect(x, y, w, h);
  ctx.translate(x + w + pan, y); ctx.scale(zoom, zoom); ctx.translate(-w, 0);
  const top = 30 - scroll;
  text('שיר לדוגמה', w / 2, top, 18, '#263c32', 'center', 700);
  const lyrics = ['ביחד מתחילים לנגן', 'צליל קטן ממלא את החדר', 'כל אחד מצטרף בזמן', 'ונשארים באותו הקצב', 'עוד תיבה ועוד צליל', 'ממשיכים עכשיו יחד'];
  for (let i = 0; i < 14; i++) {
    const row = top + 47 + i * 43;
    text(i === 4 || i === 10 ? 'פזמון' : ['Am    F    C    G', 'Dm    G    C'][i % 2], w - 12, row, 15, i === 4 || i === 10 ? '#845e32' : '#528260', 'right', 700);
    text(lyrics[i % lyrics.length], w - 12, row + 19, 12, '#38453d', 'right');
  }
  ctx.restore();
}
function phone(x, y, { role = 'נגן', scroll = 0, zoom = 1, pan = 0, badge = '', color = C.lime, mode = 'song', reveal = 1 } = {}) {
  const w = 190, h = 328;
  ctx.save(); ctx.globalAlpha *= reveal; ctx.translate(x, y + 20 * (1 - reveal));
  box(-8, 9, w + 16, h + 10, 31, '#0003');
  box(0, 0, w, h, 26, '#0c1713', '#52695a');
  box(65, 9, 60, 6, 3, '#52695a');
  text(role, w / 2, 40, 17, color, 'center', 700);
  if (mode === 'song') {
    paper(10, 64, w - 20, h - 101, scroll, zoom, pan);
    text('↑    ‹    1 / 12    ›', w / 2, h - 20, 14, C.muted);
  } else if (mode === 'find') {
    // Ordinary phone file browsing, before anyone has a shared room.
    box(10, 65, 170, 34, 8, '#26372e'); text('חיפוש קובץ…', 95, 82, 14, C.muted);
    ctx.save(); ctx.beginPath(); ctx.rect(10, 109, 170, 183); ctx.clip();
    ['חוברת שירים', 'רשימת קבצים', 'שירים חדשים', 'שיר לדוגמה', 'שירים לשבת'].forEach((name, i) => {
      const row = 130 + i * 47 - scroll;
      box(16, row - 18, 158, 38, 6, i === 3 ? '#4a3c2d' : '#1d3028');
      text(name, 165, row, 13, i === 3 ? C.orange : C.ink, 'right');
    });
    ctx.restore(); text('קבצים בטלפון', 95, 309, 13, C.muted);
  } else if (mode === 'create') {
    music(w / 2, 103);
    text('Music Room', w / 2, 148, 20, C.ink, 'center', 700);
    box(18, 180, 154, 44, 12, C.lime); text('יצירת חדר', w / 2, 202, 19, '#16311e', 'center', 700);
    text('או הצטרפות לחדר', w / 2, 261, 15, C.muted);
  } else if (mode === 'join') {
    text('קוד החדר', w / 2, 114, 19);
    box(20, 143, 150, 50, 10, '#253d30'); text('482193', w / 2, 168, 28, C.lime, 'center', 700);
    box(20, 215, 150, 44, 12, C.lime); text('הצטרפות', w / 2, 237, 19, '#16311e', 'center', 700);
  } else if (mode === 'library') {
    text('בחירת שיר', 95, 91, 19, C.ink, 'center', 700);
    ['שיר לדוגמה', 'שירים לשבת', 'חוברת שירים'].forEach((name, i) => {
      box(16, 124 + i * 52, 158, 42, 9, i === 0 ? C.lime : '#26372e');
      text(name, 95, 145 + i * 52, 15, i === 0 ? C.dark : C.ink, 'center', 700);
    });
  } else if (mode === 'waiting') {
    music(95, 173, C.muted);
  }
  if (badge) pill(badge, w / 2, h + 27, 200, color);
  ctx.restore();
}
function tap(x, y, amount) {
  if (amount <= 0 || amount >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - amount;
  ctx.beginPath(); ctx.arc(x, y, 12 + amount * 35, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = C.lime; ctx.stroke(); ctx.restore();
}
function flow(x1, x2, y, phase) {
  line(x1, y, x2, y, '#4c7160', 2);
  for (let i = 0; i < 3; i++) {
    const p = (phase * .8 + i / 3) % 1;
    ctx.beginPath(); ctx.arc(mix(x1, x2, p), y, 4, 0, Math.PI * 2); ctx.fillStyle = C.teal; ctx.fill();
  }
}
function drawScene(index, local) {
  const kind = scenes[index].kind;
  const pulse = Math.sin(local * Math.PI * SOUNDTRACK_BPM / 60);
  const positions = [{ x: 255, y: 85 }, { x: 95, y: 515 }, { x: 415, y: 515 }];
  function mobile(index, options, delay = 0) {
    const { x, y } = positions[index];
    ctx.save(); ctx.translate(x, y + Math.sin(local * 2.3 + delay) * 4);
    ctx.scale(1.1, 1.1); phone(0, 0, { ...options, reveal: ease((local - delay) / .4) }); ctx.restore();
  }
  function connections() {
    flow(360, 200, 489, local * 2); flow(360, 520, 489, local * 2);
    line(360, 455, 360, 489, C.teal, 2);
    line(200, 489, 200, 515, C.teal, 2); line(520, 489, 520, 515, C.teal, 2);
  }
  if (kind === 'solution') {
    ctx.save(); ctx.translate(360, 425); ctx.scale(4 + pulse * .1, 4 + pulse * .1); music(0, 0); ctx.restore();
    text('הפתרון: Music Room!', 360, 650, 55, C.ink, 'center', 700);
  } else if (kind === 'brand') {
    ctx.save(); ctx.translate(360, 425); ctx.scale(4 + pulse * .1, 4 + pulse * .1); music(0, 0); ctx.restore();
    text('Music Room', 360, 650, 82, C.ink, 'center', 700);
    ctx.save(); ctx.globalAlpha *= ease((local - .9) / .5);
    text('אתר שיתופי לנגנים', 360, 770, 46, C.lime, 'center', 700); ctx.restore();
  } else if (kind === 'question') {
    const entry = ease(local / .3);
    ctx.save(); ctx.translate(0, 24 * (1 - entry));
    text('אז מה בעצם', 360, 550, 76, C.ink, 'center', 700);
    text('הבעיה?', 360, 660, 86, C.orange, 'center', 700); ctx.restore();
  } else if (kind === 'before') {
    // Everyone finds their own copy, then scrolls at a different pace.
    // No connecting lines: these phones are deliberately independent.
    positions.forEach((_, i) => {
      const opensAt = 1.3 + i * .7;
      const browsing = local < opensAt;
      const scroll = browsing ? ease(local / opensAt) * 85 :
        (Math.sin((local - opensAt) * (1.4 + i * .45) + i) + 1) * (45 + i * 45);
      mobile(i, { role: `נגן ${i + 1}`, mode: browsing ? 'find' : 'song', scroll, color: C.orange }, i * .18);
      const { x, y } = positions[i];
      tap(x + 110, y + 220, (local - opensAt + .4) / .5);
    });
    caption({ title: ['בלי חדר משותף,', 'כל אחד גולל לבד.'] }, local, 1.1);
  } else if (kind === 'create') {
    ctx.save(); ctx.translate(190, 185 + pulse * 3); ctx.scale(1.8, 1.8);
    phone(0, 0, { role: 'המוביל', mode: local < 1.8 ? 'create' : 'join', reveal: ease(local / .4) });
    tap(95, 202, (local - 1.1) / .7); ctx.restore();
    caption({ title: ['המוביל יוצר חדר.'] }, local, 1.9);
  } else if (kind === 'join') {
    mobile(0, { role: 'המוביל', mode: 'song' });
    mobile(1, { role: 'נגן', mode: local < 1.5 ? 'join' : 'song' }, .35);
    mobile(2, { role: 'נגן', mode: local < 1.9 ? 'join' : 'song' }, .65);
    connections();
    caption({ title: ['מצטרפים לחדר', 'בקישור או בקוד.'] }, local, 2.1);
  } else if (kind === 'select') {
    mobile(0, { role: 'המוביל', mode: local < 1.1 ? 'library' : 'song' });
    mobile(1, { role: 'נגן', mode: local < 1.4 ? 'waiting' : 'song' });
    mobile(2, { role: 'נגן', mode: local < 1.55 ? 'waiting' : 'song' });
    connections();
    tap(360, 245, (local - .55) / .6);
    caption({ title: ['המוביל בוחר שיר', 'מתוך רשימת שירים', 'מוכנה מראש.'] }, local, .3);
  } else if (kind === 'upload') {
    // File choices are illustrated above; their explanation stays below.
    const entry = ease(local / .4);
    ctx.save(); ctx.globalAlpha *= entry;
    box(95, 170, 210, 285, 22, C.paper); text('PDF', 200, 247, 40, '#335643', 'center', 700);
    for (let i = 0; i < 5; i++) line(130, 300 + i * 23, 270, 300 + i * 23, '#aebca5', 5);
    [0, 1, 2].forEach(i => {
      box(425 + i * 9, 175 + i * 44, 145, 190, 14, C.paper, '#637c68');
      box(442 + i * 9, 202 + i * 44, 110, 63, 9, '#aec79c');
      music(495 + i * 9, 234 + i * 44, '#46694c');
    });
    const merge = ease((local - 1.1) / .8);
    line(360, 475, 360, 555, C.teal, 4); line(345, 540, 360, 555, C.teal, 4); line(375, 540, 360, 555, C.teal, 4);
    ctx.globalAlpha *= merge;
    box(195, 590, 330, 270, 22, C.dark, '#719663');
    paper(210, 605, 300, 240, 0);
    check(555, 815); ctx.restore();
    caption({ title: ['אפשר גם להוסיף שיר', 'מהדפדפן, אם הוא לא קיים.'] }, local, .6, 2.8);
    caption({ title: ['כל השירים זמינים', 'גם לפעמים הבאות.'] }, local, 2.9);
  } else if (kind === 'sync') {
    // Demonstrate the change first. Followers receive it slightly later so the
    // direction of control is visible; captions appear only after they catch up.
    positions.forEach((_, i) => {
      const delay = i === 0 ? 0 : .22 + i * .1;
      const scroll = mix(0, 180, ease((local - .5 - delay) / 1.1));
      const zoom = mix(1, 1.5, ease((local - 4.1 - delay) / .85));
      const pan = mix(0, 45, ease((local - 4.1 - delay) / .85));
      mobile(i, { role: i === 0 ? 'המוביל' : 'נגן', scroll, zoom, pan, color: i === 0 ? C.lime : C.teal }, i * .15);
    });
    connections();
    tap(360, 320 - ease((local - .5) / 1.1) * 100, (local - .5) / 1.1);
    tap(345, 290, (local - 4.1) / .85); tap(375, 330, (local - 4.1) / .85);
    caption({ title: ['המוביל גולל.', 'כולם איתו.'] }, local, 2.1, 4.1);
    caption({ title: ['גם הזום והתזוזה', 'מגיעים לכולם.'] }, local, 5.45);
  } else {
    ctx.save(); ctx.translate(360, 370); ctx.scale(5 + pulse * .2, 5 + pulse * .2); music(0, 0); ctx.restore();
    text('Music Room', 360, 575, 68, C.ink, 'center', 700);
    caption({ title: ['פחות להתעסק.', 'יותר לנגן.'] }, local, .5);
    ctx.save(); ctx.globalAlpha = ease((local - 2) / .4);
    box(55, 715, 610, 84, 22, C.lime); text('talgreen-music-room.web.app', 360, 757, 33, '#15311e', 'center', 700); ctx.restore();
  }
}
function render(t) {
  t = clamp(t, 0, DURATION);
  const index = Math.max(0, scenes.findIndex(scene => t < scene.end));
  const i = t === DURATION ? scenes.length - 1 : index;
  const scene = scenes[i], local = t - scene.start;
  background(t);
  ctx.save();
  ctx.globalAlpha = ease(local / .22) * (i === scenes.length - 1 ? 1 : ease((scene.end - t) / .22));
  drawScene(i, local); ctx.restore();
  // Story progress stays inside the video, independently of playback controls.
  scenes.forEach((scene, j) => {
    const x = (720 - (scenes.length * 60 - 12)) / 2 + j * 60;
    box(x, 1240, 48, 5, 2, '#385144');
    const progress = clamp((t - scene.start) / (scene.end - scene.start));
    if (progress) box(x, 1240, 48 * progress, 5, 2, C.lime);
  });
}
let position = 0;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let previous;
let exporting = false;
let audioContext, soundtrackPromise, previewSource;
let musicEnabled = false;
async function prepareAudio() {
  audioContext ??= new AudioContext();
  await audioContext.resume();
  soundtrackPromise ??= createSoundtrack(DURATION);
  return soundtrackPromise;
}
function stopPreviewMusic() { previewSource?.stop(); previewSource = undefined; }
async function syncPreviewMusic() {
  stopPreviewMusic();
  if (!musicEnabled || !playing || exporting || position >= DURATION) return;
  try {
    const buffer = await prepareAudio();
    if (!musicEnabled || !playing || exporting || position >= DURATION) return;
    stopPreviewMusic();
    previewSource = audioContext.createBufferSource(); previewSource.buffer = buffer;
    previewSource.connect(audioContext.destination); previewSource.start(0, position);
  } catch { musicEnabled = false; sound.textContent = 'הפעלת מוזיקה ♫'; status.textContent = 'לא ניתן לנגן מוזיקה בדפדפן הזה.'; }
}
function ui() {
  goHome.hidden = position < DURATION || exporting;
  timeline.value = String(position);
  timeLabel.textContent = `0:${String(Math.floor(position)).padStart(2, '0')} / 0:${DURATION}`;
  play.textContent = playing ? 'השהיה' : 'ניגון ▶';
}
function tick(now) {
  if (previous !== undefined && playing) position = Math.min(DURATION, position + (now - previous) / 1000);
  previous = now;
  if (position === DURATION) { playing = false; stopPreviewMusic(); }
  render(position); ui(); requestAnimationFrame(tick);
}
play.onclick = () => { if (position === DURATION) position = 0; playing = !playing; syncPreviewMusic(); };
restart.onclick = () => { position = 0; playing = true; previous = undefined; syncPreviewMusic(); };
timeline.oninput = () => { position = Number(timeline.value); previous = undefined; syncPreviewMusic(); };
sound.onclick = async () => {
  musicEnabled = !musicEnabled;
  sound.textContent = musicEnabled ? 'השתקת מוזיקה ♫' : 'הפעלת מוזיקה ♫';
  if (musicEnabled) { position = 0; playing = true; previous = undefined; }
  await syncPreviewMusic();
};
document.addEventListener('visibilitychange', () => { if (document.hidden && !exporting) { playing = false; stopPreviewMusic(); } previous = undefined; });
download.onclick = async () => {
  if (!canvas.captureStream || !window.MediaRecorder) { status.textContent = 'הדפדפן אינו תומך בייצוא וידאו. אפשר לפתוח את הקישור ב־Chrome או Edge במחשב.'; return; }
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) { status.textContent = 'אין פורמט ייצוא נתמך בדפדפן הזה.'; return; }
  exporting = true; [play, restart, timeline, download, sound].forEach(el => el.disabled = true);
  const savedPosition = position, savedPlaying = playing;
  let stream, recorder, timer, visibilityAbort, musicSource, audioDestination;
  try {
    stopPreviewMusic(); playing = false;
    status.textContent = 'מכין את מוזיקת הרקע…';
    const buffer = await prepareAudio();
    position = 0; playing = false; render(0);
    stream = canvas.captureStream(30);
    audioDestination = audioContext.createMediaStreamDestination();
    audioDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    musicSource = audioContext.createBufferSource(); musicSource.buffer = buffer;
    musicSource.connect(audioDestination); musicSource.connect(audioContext.destination);
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    const blob = await new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('Recording failed'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      visibilityAbort = () => { if (document.hidden) { recorder.stop(); reject(new Error('Hidden tab')); } };
      document.addEventListener('visibilitychange', visibilityAbort);
      recorder.start(); musicSource.start(); previous = undefined; playing = true;
      status.textContent = `מייצא וידאו עם מוזיקה… יש להשאיר את הלשונית פעילה למשך ${DURATION} שניות.`;
      timer = setInterval(() => { if (position >= DURATION && recorder.state === 'recording') recorder.stop(); }, 100);
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `music-room-hebrew-vertical.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = 'הווידאו מוכן. ההורדה התחילה.';
  } catch {
    status.textContent = 'הייצוא הופסק. יש להשאיר את הלשונית פעילה ולנסות שוב.';
  } finally {
    clearInterval(timer); if (visibilityAbort) document.removeEventListener('visibilitychange', visibilityAbort);
    musicSource?.stop(); musicSource?.disconnect(); audioDestination?.disconnect();
    if (recorder?.state === 'recording') recorder.stop(); stream?.getTracks().forEach(track => track.stop());
    exporting = false; position = savedPosition; playing = savedPlaying; previous = undefined;
    [play, restart, timeline, download, sound].forEach(el => el.disabled = false);
    syncPreviewMusic();
  }
};
requestAnimationFrame(tick);
