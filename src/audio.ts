/**
 * Procedural sound (no audio files): a quiet pad for the dusk, and a chime for each catch. Chimes climb a
 * pentatonic scale as the combo grows, so a good run sounds like a little tune. Everything goes through one master
 * gain and a gentle compressor, so loud moments can't clip.
 *
 * Level target: p90 about -29 dBFS while playing (measure with `npm run loud`).
 */
const PENTA = [0, 2, 4, 7, 9];

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private pad: GainNode | null = null;
  muted = false;

  /** Call from a click or key press (browsers block audio until then). Safe to call again. */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const ctx = this.ctx;
    this.master = new GainNode(ctx, { gain: this.muted ? 0 : 0.6 });
    this.master.connect(new DynamicsCompressorNode(ctx, { threshold: -16, ratio: 4 })).connect(ctx.destination);
    this.verb = new ConvolverNode(ctx, { buffer: this.impulse(2.6) });
    this.verb.connect(new GainNode(ctx, { gain: 0.35 })).connect(this.master);
    this.startPad();
  }

  private impulse(secs: number) {
    const ctx = this.ctx!, n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }

  private startPad() {
    const ctx = this.ctx!;
    this.pad = new GainNode(ctx, { gain: 0 });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700, Q: 0.4 });
    this.pad.connect(lp).connect(this.master);
    lp.connect(this.verb);
    // a soft open fifth, slightly detuned so it breathes
    for (const [f, d] of [[110, -4], [110, 5], [165, 0], [220, 3]]) {
      const o = new OscillatorNode(ctx, { type: 'triangle', frequency: f, detune: d });
      o.connect(new GainNode(ctx, { gain: 0.05 })).connect(this.pad);
      o.start();
    }
    this.pad.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5);
  }

  /** A catch. `combo` 1, 2, 3… climbs the scale; gold rings an octave up with a second voice. */
  chime(combo: number, gold: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const step = Math.min(combo - 1, 9);
    const semis = PENTA[step % 5] + 12 * Math.floor(step / 5) + (gold ? 12 : 0);
    const freq = 440 * Math.pow(2, (semis + 3) / 12);
    for (const [mult, amp] of gold ? [[1, 1], [1.5, 0.5]] : [[1, 1]]) {
      const g = new GainNode(ctx, { gain: 0 });
      g.connect(this.master); g.connect(this.verb);
      for (const [m2, a2, type] of [[1, 1, 'sine'], [2, 0.18, 'triangle']] as const) {
        const o = new OscillatorNode(ctx, { type, frequency: freq * mult * m2 });
        o.connect(new GainNode(ctx, { gain: a2 })).connect(g);
        o.start(t); o.stop(t + 2.2);
      }
      g.gain.linearRampToValueAtTime(0.1 * amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    }
  }

  /** Opening the hand: a shimmer rising through a major seventh. */
  unleash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = [0, 4, 7, 11, 14];
    notes.forEach((semis, i) => {
      const at = t + i * 0.045;
      const g = new GainNode(ctx, { gain: 0 });
      g.connect(this.master); g.connect(this.verb);
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: 523.25 * Math.pow(2, semis / 12) });
      o.connect(g); o.start(at); o.stop(at + 2.2);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.055, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.8);
    });
  }

  /** Closing the fist: a low settling note that falls. */
  form() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = new GainNode(ctx, { gain: 0 });
    g.connect(this.master); g.connect(this.verb);
    const o = new OscillatorNode(ctx, { type: 'sine', frequency: 165 });
    o.frequency.exponentialRampToValueAtTime(82, t + 0.55);
    o.connect(g); o.start(t); o.stop(t + 1.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  }

  /** The round is over: a low settling note. */
  end() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = new OscillatorNode(ctx, { type: 'sine', frequency: 220 });
    const g = new GainNode(ctx, { gain: 0 });
    o.connect(g); g.connect(this.master); g.connect(this.verb);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    o.start(t); o.stop(t + 3.1);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }
}
