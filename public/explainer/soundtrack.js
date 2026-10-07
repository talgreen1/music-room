// Original instrumental cue: soft plucks, warm pads, bass and a light beat.
// Composed procedurally, without sampled or third-party music. 116 BPM, A minor.
export async function createSoundtrack(duration) {
  const rate = 44100;
  const audio = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  const master = audio.createGain(); master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(.8, .7);
  master.gain.setValueAtTime(.8, duration - 1.4);
  master.gain.linearRampToValueAtTime(0, duration);
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -16; compressor.ratio.value = 3;
  master.connect(compressor); compressor.connect(audio.destination);
  const beat = 60 / 116;
  const hz = midi => 440 * 2 ** ((midi - 69) / 12);
  function note(midi, when, length, volume, type = 'triangle', pan = 0) {
    if (when >= duration) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain(), panner = audio.createStereoPanner();
    oscillator.type = type; oscillator.frequency.value = hz(midi); panner.pan.value = pan;
    gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(volume, when + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, when + length);
    oscillator.connect(gain); gain.connect(panner); panner.connect(master);
    oscillator.start(when); oscillator.stop(when + length + .02);
  }
  // One locally generated noise buffer, seeded so every export has the same cue.
  const noise = audio.createBuffer(1, rate * .16, rate), samples = noise.getChannelData(0);
  let seed = 1701;
  for (let i = 0; i < samples.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; samples[i] = seed / 2147483648 - 1; }
  function shaker(when, volume) {
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = noise; filter.type = 'highpass'; filter.frequency.value = 7500;
    gain.gain.setValueAtTime(volume, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .07);
    source.connect(filter); filter.connect(gain); gain.connect(master); source.start(when); source.stop(when + .08);
  }
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const melody = [0, 2, 1, 2, 0, 1, 2, 1];
  for (let step = 0; step * beat / 2 < duration; step++) {
    const when = step * beat / 2, chord = chords[Math.floor(step / 16) % 4];
    note(chord[melody[step % 8]] + 12, when, .42, step % 2 ? .055 : .085, 'triangle', step % 2 ? .3 : -.3);
    if (step % 4 === 0) note(chord[0] - 12, when, .6, .16, 'sine');
    if (when >= 3.5) {
      shaker(when, step % 2 ? .035 : .07);
      if (step % 4 === 0) {
        const kick = audio.createOscillator(), gain = audio.createGain();
        kick.frequency.setValueAtTime(115, when); kick.frequency.exponentialRampToValueAtTime(45, when + .16);
        gain.gain.setValueAtTime(.19, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .22);
        kick.connect(gain); gain.connect(master); kick.start(when); kick.stop(when + .25);
      }
    }
    if (step % 16 === 0) chord.forEach((midi, i) => note(midi, when, beat * 7.8, .04, 'sine', (i - 1) * .5));
  }
  return audio.startRendering();
}
