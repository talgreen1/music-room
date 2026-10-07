// Original instrumental cue: bright plucks, driving bass and an upbeat drum groove.
// Composed procedurally, without sampled or third-party music. 140 BPM, A minor.
export const SOUNDTRACK_BPM = 140;
export async function createSoundtrack(duration) {
  const rate = 44100;
  const audio = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  const master = audio.createGain(); master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(.8, .3);
  master.gain.setValueAtTime(.8, duration - 1.4);
  master.gain.linearRampToValueAtTime(0, duration);
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -16; compressor.ratio.value = 3;
  master.connect(compressor); compressor.connect(audio.destination);
  const beat = 60 / SOUNDTRACK_BPM;
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
    if (when >= duration) return;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = noise; filter.type = 'highpass'; filter.frequency.value = 7500;
    gain.gain.setValueAtTime(volume, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .07);
    source.connect(filter); filter.connect(gain); gain.connect(master); source.start(when); source.stop(when + .08);
  }
  function clap(when) {
    // Short noise bursts give beats two and four a crisp, layered handclap.
    [0, .012, .025].forEach((offset, i) => {
      if (when + offset >= duration) return;
      const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
      source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = .7;
      gain.gain.setValueAtTime(.075 - i * .012, when + offset);
      gain.gain.exponentialRampToValueAtTime(.0001, when + offset + .1);
      source.connect(filter); filter.connect(gain); gain.connect(master);
      source.start(when + offset); source.stop(when + offset + .12);
    });
  }
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const melody = [0, 2, 1, 2, 0, 1, 2, 1];
  for (let step = 0; step * beat / 2 < duration; step++) {
    const when = step * beat / 2, chord = chords[Math.floor(step / 16) % 4];
    const lead = chord[melody[step % 8]] + 12;
    note(lead, when, .28, step % 2 ? .075 : .105, 'triangle', step % 2 ? .3 : -.3);
    if (step % 4 === 1) note(lead + 12, when, .19, .027, 'sine', .45);
    if (step % 2 === 0) note(chord[0] - 12, when, .24, .17, 'sine');
    if (step % 4 === 3) note(chord[2] - 12, when, .18, .1, 'triangle');
    if (when >= .4) {
      shaker(when, step % 2 ? .06 : .075);
      shaker(when + beat / 4, .022);
      if (step % 4 === 2) clap(when);
      if (step % 2 === 0) {
        const kick = audio.createOscillator(), gain = audio.createGain();
        kick.frequency.setValueAtTime(115, when); kick.frequency.exponentialRampToValueAtTime(45, when + .16);
        gain.gain.setValueAtTime(.24, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .18);
        kick.connect(gain); gain.connect(master); kick.start(when); kick.stop(when + .25);
      }
    }
    if (step % 16 === 0) chord.forEach((midi, i) => note(midi, when, beat * 7.8, .04, 'sine', (i - 1) * .5));
  }
  return audio.startRendering();
}
