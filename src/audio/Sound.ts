import { asset } from '../assetUrl';
import { Settings } from '../state/Settings';

const MUTE_KEY = 'funscientia.muted';

/**
 * Game audio on the Web Audio API: a looping music bed and synthesised
 * footsteps (no sample files needed, tiny, and every step sounds a bit
 * different). Browsers only allow sound after a user gesture, so `unlock()`
 * is called from the Start button.
 */
class SoundSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  /** the player's levels (Settings), after the game's own fades */
  private musicLevel!: GainNode;
  private sfxLevel!: GainNode;
  private noise1s!: AudioBuffer;
  private musicStarted = false;
  private lastStep = 0;
  muted = (() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  })();

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.musicLevel = this.ctx.createGain();
    this.musicLevel.connect(this.master);
    this.sfxLevel = this.ctx.createGain();
    this.sfxLevel.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.musicLevel);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.sfxLevel);
    const levels = () => {
      this.musicLevel.gain.value = Settings.music;
      this.sfxLevel.gain.value = Settings.sfx;
    };
    levels();
    Settings.onChange(levels);
    // one second of white noise, reused by every footstep
    this.noise1s = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise1s.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Start (or fade back in) the looping background sound. */
  async music(volume = 0.32, fadeSec = 2.5): Promise<void> {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
    this.musicGain.gain.linearRampToValueAtTime(volume, t + fadeSec);
    if (this.musicStarted) return;
    this.musicStarted = true;
    try {
      // the overlook's birds and magical shimmer (tools/pipeline/make_ambience.py)
      const data = await (await fetch(asset('audio/ambience.m4a'))).arrayBuffer();
      const buf = await this.ctx.decodeAudioData(data);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true; // the file is crossfaded end-to-start, so the loop is seamless
      src.connect(this.musicGain);
      src.start();
    } catch (e) {
      console.warn('music unavailable', e);
    }
  }

  private readonly samples = new Map<string, Promise<AudioBuffer | null>>();

  /** Load a recorded sound ahead of time, so it plays exactly on cue. */
  prepare(name: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    let buf = this.samples.get(name);
    if (!buf) {
      buf = fetch(asset(`audio/${name}.m4a`))
        .then((r) => r.arrayBuffer())
        .then((d) => ctx.decodeAudioData(d))
        .catch((e) => {
          console.warn(`sound ${name} unavailable`, e);
          return null;
        });
      this.samples.set(name, buf);
    }
    return buf;
  }

  /** Play a recorded sound once (public/assets/audio/<name>.m4a), e.g. a voice like the kids' "wow". */
  sample(name: string, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    void this.prepare(name).then((b) => {
      if (!b) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(this.sfxGain);
      src.start();
    });
  }

  /** Lower the music (e.g. while a video plays or during dialogue). */
  duck(volume: number, fadeSec = 0.6): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
    this.musicGain.gain.linearRampToValueAtTime(volume, t + fadeSec);
  }

  /**
   * One footstep: a short band-passed noise burst. `light` makes it a paw-step
   * (higher, shorter); `loudness` 0..1 follows distance from the camera.
   */
  step(light: boolean, loudness: number): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStep < 0.045) return; // the trio's steps must not pile up into a rumble
    this.lastStep = now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise1s;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = (light ? 1500 : 650) * (0.85 + Math.random() * 0.3);
    band.Q.value = light ? 1.2 : 0.9;
    const g = this.ctx.createGain();
    // nearer (bigger on screen) is a little louder, but steps stay clearly audible when the trio is small
    const peak = (light ? 0.07 : 0.13) * (0.75 + 0.25 * loudness) * (0.8 + Math.random() * 0.4);
    const len = light ? 0.05 : 0.09;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    src.connect(band).connect(g).connect(this.sfxGain);
    src.start(now, Math.random() * 0.8, len + 0.02);
    if (this.surface === 'gravel') this.crunch(now, light, peak);
  }

  /** What the ground is made of where the trio walks: gravel adds a crisp crunch to each step. */
  surface: 'stone' | 'gravel' = 'stone';

  /** The gritty top of a step on gravel: a short, bright burst (it carries over a waterfall's rush). */
  private crunch(now: number, light: boolean, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise1s;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = (light ? 3800 : 2600) * (0.85 + Math.random() * 0.3);
    hp.Q.value = 0.8;
    const g = ctx.createGain();
    const len = light ? 0.035 : 0.06;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak * 0.55, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    src.connect(hp).connect(g).connect(this.sfxGain);
    src.start(now, Math.random() * 0.8, len + 0.02);
  }

  /** A soft two-note chime (waypoints, discoveries). */
  chime(): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const [f, dt] of [[880, 0], [1320, 0.09]] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + dt);
      g.gain.linearRampToValueAtTime(0.08, now + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.6);
      o.connect(g).connect(this.sfxGain);
      o.start(now + dt);
      o.stop(now + dt + 0.65);
    }
  }

  /** A pitched blip that slides from one note to another (pops, whooshes, gloops...). */
  tone(from: number, to: number, seconds: number, volume = 0.08, type: OscillatorType = 'sine', delay = 0): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  /** A burst of filtered noise (crunches, crumbles, sprays). */
  noise(seconds: number, freq: number, q = 1, volume = 0.15, delay = 0): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise1s;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(band).connect(g).connect(this.sfxGain);
    src.start(t, Math.random() * 0.5, seconds + 0.05);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }
}

export const Sound = new SoundSystem();
