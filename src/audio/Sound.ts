import { asset } from '../assetUrl';

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
  private noise!: AudioBuffer;
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
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    // one second of white noise, reused by every footstep
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Start (or fade back in) the looping music bed. */
  async music(volume = 0.32, fadeSec = 2.5): Promise<void> {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
    this.musicGain.gain.linearRampToValueAtTime(volume, t + fadeSec);
    if (this.musicStarted) return;
    this.musicStarted = true;
    try {
      const data = await (await fetch(asset('audio/theme.m4a'))).arrayBuffer();
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
    src.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = (light ? 1500 : 650) * (0.85 + Math.random() * 0.3);
    band.Q.value = light ? 1.2 : 0.9;
    const g = this.ctx.createGain();
    const peak = (light ? 0.1 : 0.18) * (0.3 + 0.7 * loudness) * (0.8 + Math.random() * 0.4);
    const len = light ? 0.05 : 0.09;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    src.connect(band).connect(g).connect(this.sfxGain);
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
