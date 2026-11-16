import type { SpellEffect } from '../config/spells.ts';
import type { GameEvent } from '../world/events.ts';
import type { HandSide } from '../tracking/types.ts';
import { loadJSON, saveJSON } from '../storage.ts';

const STORAGE_KEY = 'arcane.audio.v1';

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  attack?: number;
  decay: number;
  gain: number;
  when?: number;
  pan?: number;
  detune?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  reverb?: number;
  vibrato?: { rate: number; depth: number };
}

interface NoiseOptions {
  decay: number;
  gain: number;
  attack?: number;
  when?: number;
  pan?: number;
  brown?: boolean;
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  reverb?: number;
  tremolo?: { rate: number; depth: number };
}

/**
 * Every sound in ARcane is synthesised here with WebAudio: no downloads, works offline. A forest
 * ambience bed, spell sounds, creature voices and charge feedback, mixed through a compressor
 * and a generated reverb. Silent and inert until the first user gesture unlocks audio.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambience!: GainNode;
  private reverbSend!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private volumeValue: number;
  private mutedValue: boolean;
  private charges: Partial<Record<HandSide, { osc: OscillatorNode; gain: GainNode; shimmer: OscillatorNode; full: boolean }>> = {};
  private bow: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; ready: boolean } | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private scheduler = 0;
  private nextCricket = 0;
  private nextOwl = 0;
  private nextWhisper = 0;
  private listeners = new Set<() => void>();

  constructor() {
    const saved = loadJSON<{ volume?: number; muted?: boolean }>(STORAGE_KEY);
    this.volumeValue = typeof saved?.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 0.7;
    this.mutedValue = saved?.muted === true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
  }

  get volume(): number { return this.volumeValue; }
  get muted(): boolean { return this.mutedValue; }
  get unlocked(): boolean { return this.ctx !== null; }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setVolume(volume: number): void {
    this.volumeValue = Math.max(0, Math.min(1, volume));
    this.applyLevel();
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    this.applyLevel();
  }

  toggleMuted(): void { this.setMuted(!this.mutedValue); }

  /** Must run inside a user gesture (browsers keep audio locked until then). */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const ctx = this.ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(compressor).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0;
    this.ambience.connect(this.master);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(2.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(reverb).connect(this.master);
    this.white = this.noiseBuffer(false);
    this.brown = this.noiseBuffer(true);
    this.applyLevel();
    this.startAmbience();
    void ctx.resume();
  }

  /** React to a world event. */
  handle(event: GameEvent): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (event.type) {
      case 'cast': this.spellCast(event.effect, event.pan, event.detail); break;
      case 'spell-impact': this.spellImpact(event.effect, event.pan); break;
      case 'cast-refused': this.tone({ type: 'sine', freq: 360, freqEnd: 240, decay: 0.16, gain: 0.05, pan: event.pan }); break;
      case 'player-hurt': this.hurt(); break;
      case 'player-blocked': this.blocked(); break;
      case 'enemy-windup': this.windup(event.kind, event.pan); break;
      case 'enemy-strike': this.noise({ filter: 'bandpass', freq: 900, freqEnd: 240, q: 1.2, decay: 0.32, attack: 0.03, gain: 0.22, pan: event.pan }); break;
      case 'enemy-hit': this.enemyHit(event.pan); break;
      case 'enemy-death': this.death(event.pan); break;
      case 'projectile': this.tone({ type: 'sine', freq: 620, freqEnd: 980, decay: 1.6, attack: 0.25, gain: 0.05, pan: event.pan, vibrato: { rate: 7, depth: 18 }, reverb: 0.6 }); break;
      case 'encounter': this.sting(event.mode); break;
    }
  }

  /** Continuous hold feedback: a soft tone that rises as a sign charges, with a tick when full. */
  setCharge(side: HandSide, progress: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    let voice = this.charges[side];
    if (progress <= 0.001) {
      if (voice) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.04);
        const v = voice;
        window.setTimeout(() => { try { v.osc.stop(); v.shimmer.stop(); } catch { /* already stopped */ } }, 300);
        delete this.charges[side];
      }
      return;
    }
    if (!voice) {
      const osc = this.ctx.createOscillator();
      const shimmer = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();
      osc.type = 'sine';
      shimmer.type = 'triangle';
      gain.gain.value = 0;
      panner.pan.value = side === 'left' ? -0.35 : 0.35;
      osc.connect(gain);
      shimmer.connect(gain);
      gain.connect(panner).connect(this.sfx);
      osc.start();
      shimmer.start();
      voice = { osc, gain, shimmer, full: false };
      this.charges[side] = voice;
    }
    const freq = 196 + progress * 196;
    voice.osc.frequency.setTargetAtTime(freq, now, 0.03);
    voice.shimmer.frequency.setTargetAtTime(freq * 2.01, now, 0.03);
    voice.gain.gain.setTargetAtTime(0.012 + progress * 0.035, now, 0.05);
    if (progress >= 0.999 && !voice.full) {
      voice.full = true;
      this.tone({ type: 'sine', freq: 1568, decay: 0.12, gain: 0.05, pan: side === 'left' ? -0.35 : 0.35 });
    } else if (progress < 0.95) {
      voice.full = false;
    }
  }

  /** Bow string creak tracks the draw; `null` ends it. */
  setBowDraw(progress: number | null, pan = 0): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (progress === null) {
      if (this.bow) {
        const b = this.bow;
        b.gain.gain.setTargetAtTime(0, now, 0.03);
        window.setTimeout(() => { try { b.src.stop(); } catch { /* stopped */ } }, 250);
        this.bow = null;
      }
      return;
    }
    if (!this.bow) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.white;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 9;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(filter).connect(gain).connect(panner).connect(this.sfx);
      src.start();
      this.bow = { src, filter, gain, ready: false };
    }
    this.bow.filter.frequency.setTargetAtTime(260 + progress * 900, now, 0.05);
    this.bow.gain.gain.setTargetAtTime(0.05 + progress * 0.12, now, 0.05);
    if (progress >= 0.44 && !this.bow.ready) {
      this.bow.ready = true;
      this.tone({ type: 'triangle', freq: 880, decay: 0.09, gain: 0.05, pan });
    }
  }

  /* ─────────────────────────────── spells ─────────────────────────────── */

  private spellCast(effect: SpellEffect, pan: number, detail?: string): void {
    switch (effect) {
      case 'arrow': {
        const power = Math.min(1, (Number(detail?.match(/(\d+)%/)?.[1]) || 65) / 100);
        this.tone({ type: 'triangle', freq: 210, freqEnd: 120, decay: 0.32, gain: 0.32, pan });
        this.tone({ type: 'sine', freq: 1400, freqEnd: 700, decay: 0.06, gain: 0.12, pan });
        this.noise({ filter: 'bandpass', freq: 900, freqEnd: 3200, q: 1.4, attack: 0.02, decay: 0.32, gain: 0.18 + power * 0.14, pan });
        break;
      }
      case 'lightning':
        // Static gathering in the air for the instant before the strike.
        this.noise({ filter: 'bandpass', freq: 1200, freqEnd: 6000, q: 1.4, attack: 0.12, decay: 0.04, gain: 0.07, pan, tremolo: { rate: 60, depth: 0.9 } });
        break;
      case 'frost':
        this.noise({ filter: 'highpass', freq: 4000, freqEnd: 7000, attack: 0.05, decay: 0.3, gain: 0.07, pan });
        break;
      case 'wind': {
        const from = detail === 'left' ? 0.8 : -0.8;
        this.noise({ filter: 'bandpass', freq: 320, freqEnd: 1500, q: 0.9, attack: 0.18, decay: 1, gain: 0.42, pan: from, reverb: 0.4 });
        this.noise({ filter: 'bandpass', freq: 700, freqEnd: 420, q: 2.4, attack: 0.3, decay: 0.9, gain: 0.18, pan: -from * 0.6, when: 0.2 });
        break;
      }
      case 'healing':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ type: 'sine', freq: f, decay: 2.2, attack: 0.02, gain: 0.07, when: i * 0.07, detune: (i - 1.5) * 4, pan: pan * 0.5, reverb: 1 }));
        for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: 2093 * (1 + i * 0.25), decay: 0.4, gain: 0.02, when: 0.25 + i * 0.06, pan: (Math.random() - 0.5), reverb: 1 });
        break;
      case 'summon':
        this.noise({ filter: 'lowpass', freq: 160, brown: true, attack: 0.15, decay: 1.4, gain: 0.5, pan });
        [392, 493.88, 587.33, 783.99].forEach((f, i) => this.tone({ type: 'triangle', freq: f, decay: 0.5, gain: 0.07, when: 0.25 + i * 0.09, pan, reverb: 0.8 }));
        break;
      case 'shield':
        this.tone({ type: 'sawtooth', freq: 110, attack: 0.25, decay: 1.4, gain: 0.08, filter: { type: 'lowpass', freq: 900, q: 6 }, pan: pan * 0.4, reverb: 0.6 });
        this.tone({ type: 'sine', freq: 220, attack: 0.2, decay: 1.4, gain: 0.08, pan: pan * 0.4 });
        this.tone({ type: 'sine', freq: 1318.5, decay: 1.6, gain: 0.05, when: 0.18, reverb: 1 });
        this.tone({ type: 'sine', freq: 1975.5, decay: 1.4, gain: 0.035, when: 0.2, reverb: 1 });
        break;
    }
  }

  private spellImpact(effect: SpellEffect, pan: number): void {
    switch (effect) {
      case 'arrow':
        this.tone({ type: 'sine', freq: 150, freqEnd: 48, decay: 0.22, gain: 0.45, pan });
        this.noise({ filter: 'lowpass', freq: 1800, decay: 0.12, gain: 0.25, pan });
        this.noise({ filter: 'highpass', freq: 5000, decay: 0.18, gain: 0.06, pan, when: 0.02 });
        break;
      case 'lightning':
        this.thunderclap(pan);
        break;
      case 'frost':
        for (let i = 0; i < 7; i++) this.tone({ type: 'sine', freq: 1800 + Math.random() * 2600, decay: 0.7 + Math.random() * 0.5, gain: 0.035, when: i * 0.025, pan: pan + (Math.random() - 0.5) * 0.4, reverb: 0.8 });
        for (let i = 0; i < 4; i++) this.noise({ filter: 'bandpass', freq: 2600 + i * 500, q: 3, decay: 0.07, gain: 0.16, when: i * 0.05, pan });
        this.noise({ filter: 'lowpass', freq: 500, decay: 0.25, gain: 0.25, pan });
        break;
      case 'wind':
        this.noise({ filter: 'lowpass', freq: 700, decay: 0.4, gain: 0.25, pan });
        break;
      case 'summon':
        this.tone({ type: 'sine', freq: 80, freqEnd: 40, decay: 0.6, gain: 0.35, pan });
        break;
      default:
        break;
    }
  }

  /**
   * A close lightning strike: a saturated double crack, a burst of electrical crackle, a sub boom
   * felt more than heard, then thunder rolling away in several uneven swells.
   */
  private thunderclap(pan: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const out = this.output(pan, 0.35);
    // 1. The crack: broadband, clipped, and doubled a few milliseconds apart like a real return stroke.
    for (const [delay, level] of [[0, 1], [0.028, 0.75], [0.07, 0.4]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 300;
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.drive();
      const gain = ctx.createGain();
      const t = now + delay;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.9 * level, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + delay);
      src.connect(high).connect(shaper).connect(gain).connect(out);
      src.start(t, Math.random());
      src.stop(t + 0.35);
    }
    // 2. Crackle: dozens of tiny sparks, dense at first and thinning out, spread across the stereo field.
    for (let i = 0; i < 46; i++) {
      const when = 0.01 + Math.pow(Math.random(), 1.8) * 0.6;
      this.noise({ filter: 'bandpass', freq: 1800 + Math.random() * 5200, q: 2.5, attack: 0.001, decay: 0.004 + Math.random() * 0.012, gain: 0.12 + Math.random() * 0.22 * (1 - when), when, pan: pan + (Math.random() - 0.5) * 0.9, reverb: 0.25 });
    }
    // 3. The boom you feel in your chest.
    this.tone({ type: 'sine', freq: 62, freqEnd: 28, attack: 0.004, decay: 0.75, gain: 0.7, pan: pan * 0.5 });
    this.noise({ filter: 'lowpass', freq: 160, brown: true, attack: 0.01, decay: 0.45, gain: 0.6, pan: pan * 0.5 });
    // 4. Rolling thunder: two decorrelated layers (left/right) with uneven swells that drift lower.
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.Q.value = 0.7;
      low.frequency.setValueAtTime(420, now + 0.15);
      low.frequency.exponentialRampToValueAtTime(85, now + 4.8);
      const body = ctx.createBiquadFilter();
      body.type = 'lowshelf';
      body.frequency.value = 120;
      body.gain.value = 8;
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan * 0.4 + side * 0.55));
      gain.gain.setValueAtTime(0.0001, now);
      let t = now + 0.12 + Math.random() * 0.05;
      gain.gain.exponentialRampToValueAtTime(0.0001, t);
      let level = 1.05;
      // Each roll: a quick swell and a slower sag, a little later, quieter and longer than the last.
      for (let roll = 0; roll < 5; roll++) {
        const rise = 0.08 + roll * 0.06 + Math.random() * 0.08;
        const fall = 0.3 + roll * 0.22 + Math.random() * 0.3;
        gain.gain.exponentialRampToValueAtTime(level * (0.75 + Math.random() * 0.35), t + rise);
        gain.gain.exponentialRampToValueAtTime(level * (0.2 + Math.random() * 0.15), t + rise + fall);
        t += rise + fall;
        level *= 0.62;
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      src.connect(low).connect(body).connect(gain).connect(panner);
      panner.connect(this.sfx);
      const send = ctx.createGain();
      send.gain.value = 0.9;
      panner.connect(send).connect(this.reverbSend);
      src.start(now, Math.random() * 1.5);
      src.stop(t + 1.3);
    }
  }

  private driveCurve: Float32Array<ArrayBuffer> | null = null;

  /** Soft-clipping curve that gives the crack its torn, saturated edge. */
  private drive(): Float32Array<ArrayBuffer> {
    if (!this.driveCurve) {
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 7) * 0.9;
      }
      this.driveCurve = curve;
    }
    return this.driveCurve;
  }

  /* ─────────────────────────────── creatures ─────────────────────────────── */

  private windup(kind: string, pan: number): void {
    switch (kind) {
      case 'goblin':
        this.tone({ type: 'sawtooth', freq: 150, freqEnd: 210, attack: 0.08, decay: 0.7, gain: 0.07, filter: { type: 'bandpass', freq: 950, q: 4 }, pan, vibrato: { rate: 22, depth: 30 } });
        break;
      case 'root':
        this.tone({ type: 'sawtooth', freq: 58, freqEnd: 74, attack: 0.3, decay: 1.4, gain: 0.12, filter: { type: 'bandpass', freq: 320, q: 6 }, pan, vibrato: { rate: 5, depth: 6 } });
        this.noise({ filter: 'bandpass', freq: 520, q: 9, attack: 0.2, decay: 1.2, gain: 0.08, pan, tremolo: { rate: 11, depth: 0.8 } });
        break;
      case 'hollow':
        this.tone({ type: 'sawtooth', freq: 74, freqEnd: 55, attack: 0.4, decay: 1.6, gain: 0.12, filter: { type: 'bandpass', freq: 420, q: 5 }, pan, reverb: 0.8, vibrato: { rate: 3.5, depth: 4 } });
        this.tone({ type: 'sine', freq: 111, freqEnd: 82, attack: 0.4, decay: 1.6, gain: 0.05, pan, reverb: 0.8 });
        break;
      default:
        this.noise({ filter: 'bandpass', freq: 2400, freqEnd: 1600, q: 3, attack: 0.3, decay: 1.2, gain: 0.08, pan, reverb: 0.9, tremolo: { rate: 7, depth: 0.7 } });
        break;
    }
  }

  private enemyHit(pan: number): void {
    this.noise({ filter: 'bandpass', freq: 700, q: 1.5, decay: 0.12, gain: 0.25, pan });
    this.tone({ type: 'sine', freq: 120, freqEnd: 60, decay: 0.16, gain: 0.25, pan });
  }

  private death(pan: number): void {
    this.noise({ filter: 'bandpass', freq: 300, freqEnd: 2600, q: 2, attack: 0.9, decay: 0.35, gain: 0.16, pan, reverb: 1 });
    this.tone({ type: 'sine', freq: 330, freqEnd: 70, attack: 0.1, decay: 1.7, gain: 0.07, pan, reverb: 1, vibrato: { rate: 5, depth: 9 } });
    this.tone({ type: 'sine', freq: 1244.5, decay: 1.6, gain: 0.025, when: 1, pan, reverb: 1 });
  }

  private hurt(): void {
    this.tone({ type: 'sine', freq: 95, freqEnd: 38, decay: 0.4, gain: 0.55 });
    this.noise({ filter: 'lowpass', freq: 650, decay: 0.22, gain: 0.35 });
  }

  private blocked(): void {
    [880, 1318.5, 2217].forEach((f, i) => this.tone({ type: 'sine', freq: f, decay: 0.7, gain: 0.07 - i * 0.015, reverb: 0.8 }));
    this.noise({ filter: 'highpass', freq: 3500, decay: 0.1, gain: 0.18 });
  }

  private sting(mode: 'active' | 'won' | 'lost'): void {
    if (mode === 'active') {
      this.tone({ type: 'sine', freq: 55, attack: 0.8, decay: 2.6, gain: 0.2, reverb: 0.6 });
      this.tone({ type: 'sine', freq: 82.4, attack: 0.9, decay: 2.6, gain: 0.12, reverb: 0.6, detune: 8 });
      this.tone({ type: 'triangle', freq: 233.1, attack: 1.2, decay: 2.2, gain: 0.04, reverb: 1 });
    } else if (mode === 'won') {
      [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => this.tone({ type: 'sine', freq: f, decay: 2.4, gain: 0.06, when: i * 0.12, reverb: 1 }));
    } else {
      [220, 207.65, 196, 174.6].forEach((f, i) => this.tone({ type: 'triangle', freq: f, decay: 1.4, gain: 0.07, when: i * 0.3, reverb: 1 }));
    }
  }

  /* ─────────────────────────────── ambience ─────────────────────────────── */

  private startAmbience(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    // Wind through the canopy: looped brown noise with a slowly wandering low-pass.
    const wind = ctx.createBufferSource();
    wind.buffer = this.brown;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.32;
    wind.connect(this.windFilter).connect(windGain).connect(this.ambience);
    wind.start();
    // A low, barely-there drone that keeps the wood uneasy.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.028;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    droneGain.connect(droneFilter).connect(this.ambience);
    for (const [f, type] of [[55, 'sine'], [55.6, 'sine'], [82.7, 'triangle'], [110.3, 'sine']] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.connect(droneGain);
      osc.start();
    }
    this.ambience.gain.cancelScheduledValues(now);
    this.ambience.gain.setValueAtTime(0, now);
    this.ambience.gain.linearRampToValueAtTime(0.85, now + 4);
    this.nextCricket = now + 1;
    this.nextOwl = now + 12 + Math.random() * 20;
    this.nextWhisper = now + 25 + Math.random() * 25;
    this.scheduler = window.setInterval(() => this.scheduleAmbience(), 250);
  }

  private scheduleAmbience(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.windFilter) {
      this.windFilter.frequency.setTargetAtTime(280 + Math.random() * 700, now, 2.5);
    }
    while (this.nextCricket < now + 0.5) {
      const when = Math.max(0, this.nextCricket - now);
      const pan = Math.random() * 1.6 - 0.8;
      const pitch = 4100 + Math.random() * 600;
      const pulses = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pulses; i++) this.tone({ type: 'sine', freq: pitch, decay: 0.022, attack: 0.004, gain: 0.006, when: when + i * 0.045, pan, toAmbience: true });
      this.nextCricket += 0.35 + Math.random() * 1.4;
    }
    if (now > this.nextOwl) {
      const pan = Math.random() * 1.4 - 0.7;
      this.tone({ type: 'sine', freq: 392, freqEnd: 350, attack: 0.06, decay: 0.45, gain: 0.03, pan, reverb: 1, toAmbience: true });
      this.tone({ type: 'sine', freq: 370, freqEnd: 330, attack: 0.08, decay: 0.75, gain: 0.03, when: 0.6, pan, reverb: 1, toAmbience: true });
      this.nextOwl = now + 25 + Math.random() * 35;
    }
    if (now > this.nextWhisper) {
      const pan = Math.random() < 0.5 ? -0.9 : 0.9;
      this.noise({ filter: 'bandpass', freq: 1700, freqEnd: 1100, q: 6, attack: 0.6, decay: 1.6, gain: 0.025, pan, reverb: 1, tremolo: { rate: 9, depth: 0.9 }, toAmbience: true });
      this.nextWhisper = now + 30 + Math.random() * 40;
    }
  }

  /* ─────────────────────────────── synthesis ─────────────────────────────── */

  private output(pan: number, reverb: number, ambient = false): AudioNode {
    const ctx = this.ctx!;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(ambient ? this.ambience : this.sfx);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      panner.connect(send).connect(this.reverbSend);
    }
    return panner;
  }

  private tone(o: ToneOptions & { toAmbience?: boolean }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const start = ctx.currentTime + (o.when ?? 0);
    const attack = o.attack ?? 0.005;
    const end = start + attack + o.decay;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, start);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), end);
    if (o.detune) osc.detune.value = o.detune;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    let node: AudioNode = osc;
    if (o.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = o.filter.type;
      filter.frequency.value = o.filter.freq;
      filter.Q.value = o.filter.q ?? 1;
      node.connect(filter);
      node = filter;
    }
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vibrato.rate;
      depth.gain.value = o.vibrato.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(end + 0.05);
    }
    node.connect(gain).connect(this.output(o.pan ?? 0, o.reverb ?? 0.15, o.toAmbience));
    osc.start(start);
    osc.stop(end + 0.05);
  }

  private noise(o: NoiseOptions & { toAmbience?: boolean }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const start = ctx.currentTime + (o.when ?? 0);
    const attack = o.attack ?? 0.004;
    const end = start + attack + o.decay;
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brown : this.white;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.frequency.setValueAtTime(o.freq, start);
    if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), end);
    filter.Q.value = o.q ?? 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    let node: AudioNode = gain;
    if (o.tremolo) {
      const trem = ctx.createGain();
      trem.gain.value = 1 - o.tremolo.depth / 2;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.tremolo.rate;
      depth.gain.value = o.tremolo.depth / 2;
      lfo.connect(depth).connect(trem.gain);
      lfo.start(start);
      lfo.stop(end + 0.05);
      gain.connect(trem);
      node = trem;
    }
    src.connect(filter).connect(gain);
    node.connect(this.output(o.pan ?? 0, o.reverb ?? 0.15, o.toAmbience));
    src.start(start, Math.random() * 1.5);
    src.stop(end + 0.05);
  }

  private noiseBuffer(brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // Dense early reflections, then a long dark forest tail.
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.02 ? 0.4 : 1);
      }
    }
    return buffer;
  }

  private applyLevel(): void {
    saveJSON(STORAGE_KEY, { volume: this.volumeValue, muted: this.mutedValue });
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.mutedValue ? 0 : this.volumeValue * this.volumeValue, now, 0.08);
    }
    this.listeners.forEach((fn) => fn());
  }

  dispose(): void {
    window.clearInterval(this.scheduler);
    void this.ctx?.close();
    this.ctx = null;
  }
}
