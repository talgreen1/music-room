import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the shipped player's event handlers with a deterministic clock/audio.
// Canvas artwork is excluded here; visual correctness requires browser inspection.
function player(reduced = false, soundtrack: Promise<unknown> = Promise.resolve({})) {
  const elements = new Map<string, any>();
  for (const id of ['film', 'play', 'stop', 'timeline', 'time', 'volume', 'status', 'sound', 'go-home']) {
    elements.set('#' + id, { value: id === 'volume' ? '0.7' : '0', textContent: '', hidden: false, setAttribute: vi.fn(), getContext: () => ({}) });
  }
  let frame: (now: number) => void = () => {}, visibility: () => void = () => {};
  const sources: any[] = [], gains: any[] = [];
  const document = { hidden: false, querySelector: (id: string) => elements.get(id), addEventListener: (_: string, fn: () => void) => { visibility = fn; } };
  class AudioContext {
    currentTime = 0; destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    createBufferSource() { const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: undefined }; sources.push(source); return source; }
    createGain() { const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn() } }; gains.push(gain); return gain; }
  }
  const source = readFileSync('public/explainer/explainer.js', 'utf8').replace(/^import .*;\r?\n/m, '');
  runInNewContext(source + '\nrender = () => {};', { document, AudioContext, SOUNDTRACK_BPM: 140, createSoundtrack: () => soundtrack, matchMedia: () => ({ matches: reduced }), requestAnimationFrame: (fn: (now: number) => void) => { frame = fn; } });
  return { get: (id: string) => elements.get('#' + id), frame: (now: number) => frame(now), hide: () => { document.hidden = true; visibility(); }, sources, gains };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
describe('Hebrew animation player', () => {
  it('autoplays muted and honors reduced motion', () => {
    const p = player(); p.frame(0); p.frame(2000);
    expect(p.get('timeline').value).toBe('2'); expect(p.get('sound').textContent).toBe('🔇'); expect(p.sources).toHaveLength(0);
    const r = player(true); r.frame(0); r.frame(2000); expect(r.get('timeline').value).toBe('0');
  });
  it('pauses, seeks, resumes, stops at zero and pauses when hidden', () => {
    const p = player(); p.frame(0); p.frame(2000); p.get('play').onclick(); p.frame(4000);
    expect(p.get('timeline').value).toBe('2');
    p.get('timeline').value = '10'; p.get('timeline').oninput(); p.frame(5000); expect(p.get('timeline').value).toBe('10');
    p.get('play').onclick(); p.frame(6000); p.frame(7000); expect(p.get('timeline').value).toBe('11');
    p.hide(); p.frame(8000); expect(p.get('timeline').value).toBe('11');
    p.get('stop').onclick(); expect(p.get('timeline').value).toBe('0');
  });
  it('unmutes and changes volume without restarting or creating duplicate audio', async () => {
    const p = player(); p.frame(0); p.frame(3000); p.get('sound').onclick(); await settle();
    expect(p.sources).toHaveLength(1); expect(p.sources[0].start).toHaveBeenCalledWith(0, 3);
    p.get('volume').value = '0.3'; p.get('volume').oninput();
    expect(p.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(.3, 0);
    p.get('sound').onclick(); expect(p.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
    p.get('sound').onclick(); expect(p.sources).toHaveLength(1); expect(p.get('timeline').value).toBe('3');
  });
  it('does not start late audio after Stop while the soundtrack is preparing', async () => {
    let resolve!: (value: unknown) => void;
    const p = player(false, new Promise(done => { resolve = done; }));
    p.get('sound').onclick(); await settle(); p.get('stop').onclick(); resolve({}); await settle();
    expect(p.sources).toHaveLength(0); expect(p.get('timeline').value).toBe('0');
  });
  it('finishes at 42 seconds, exposes the closing home link, and hides it on replay', () => {
    const p = player(); p.frame(0); p.frame(43000);
    expect(p.get('timeline').value).toBe('42'); expect(p.get('go-home').hidden).toBe(false);
    p.get('play').onclick(); expect(p.get('timeline').value).toBe('0'); expect(p.get('go-home').hidden).toBe(true);
  });
});
