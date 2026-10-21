import { Sound } from '../audio/Sound';
import { asset } from '../assetUrl';
const SEEN_KEY = 'funscientia.introSeen';

/**
 * Where the intro's last shot (the overlook) starts. From here the game itself
 * shows the overlook in full quality while the video's soundtrack plays on
 * (keep in sync with CUT_AT in tools/pipeline/build_intro.py).
 */
export const INTRO_CUT_AT = 74.8;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — not important */
  }
}

async function enterFullscreen(el: HTMLElement): Promise<void> {
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
    // lock is only available in fullscreen on some Android browsers; ignore failures
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape').catch(() => undefined);
  } catch {
    /* iPhone Safari has no element fullscreen; the game still works */
  }
}

/**
 * Plays the intro video full-screen. At its last shot (INTRO_CUT_AT) the
 * picture cuts to the game's overlook, which renders behind the video, while
 * the soundtrack carries on; when the music ends, the game takes over.
 */
export class IntroPlayer {
  private readonly video = document.getElementById('intro') as HTMLVideoElement;
  private readonly startScreen = document.getElementById('start-screen') as HTMLElement;
  private readonly startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  private readonly skipBtn = document.getElementById('skip-btn') as HTMLButtonElement;
  private finished = false;
  private cut = false;
  /** Resolves once the whole intro is downloaded, so it plays through without pausing to buffer. */
  readonly ready: Promise<void>;
  /** Download progress of the intro, 0..1. */
  onProgress: (share: number) => void = () => undefined;

  constructor(
    private readonly gameReady: Promise<void>,
    private readonly onCut: (secondsLeft: number) => void,
    private readonly onHandover: () => void,
  ) {
    // full HD where the screen can show it, 720p otherwise (half the download)
    const px = Math.max(screen.width, screen.height) * Math.min(window.devicePixelRatio || 1, 2);
    this.ready = this.preload(asset(px >= 1500 ? 'intro/intro_1080.mp4' : 'intro/intro_720.mp4'));
    this.video.addEventListener('timeupdate', () => {
      if (this.video.currentTime >= INTRO_CUT_AT) void this.cutToGame();
    });
    this.startBtn.addEventListener('click', () => this.start(), { once: true });
    this.skipBtn.addEventListener('click', () => this.skip());
    this.video.addEventListener('ended', () => this.finish(false));
    this.video.addEventListener('error', () => this.finish(false));
  }

  /**
   * Download the whole video during the loading screen (with progress) and play
   * it from memory; if that fails, fall back to streaming it.
   */
  private async preload(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) this.onProgress(Math.min(1, got / total));
      }
      this.video.src = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'video/mp4' }));
    } catch (e) {
      console.warn('intro download failed, streaming it instead', e);
      this.video.src = url;
    }
    this.onProgress(1);
    this.video.load();
    await new Promise<void>((resolve) => {
      if (this.video.readyState >= 3) return resolve();
      this.video.addEventListener('canplay', () => resolve(), { once: true });
      window.setTimeout(resolve, 8000);
    });
  }

  enableStart(): void {
    this.startBtn.disabled = false;
    this.startBtn.textContent = 'Start the adventure';
    (document.getElementById('load-note') as HTMLElement).textContent = '';
  }

  private async start(): Promise<void> {
    Sound.unlock(); // browsers allow audio only after a tap or click
    void Sound.prepare('wow'); // the kids' "wow" on the overlook
    void enterFullscreen(document.getElementById('app') as HTMLElement);
    this.startScreen.classList.add('hidden');
    this.video.hidden = false;
    try {
      await this.video.play();
    } catch {
      try {
        this.video.muted = true;
        await this.video.play();
      } catch {
        this.finish(false);
        return;
      }
    }
    const delay = safeGet(SEEN_KEY) ? 0 : 1500;
    window.setTimeout(() => {
      if (!this.finished) this.skipBtn.hidden = false;
    }, delay);
  }

  /** Skip to the intro's last shot (the overlook closing in); pressed again there, skip that too. */
  private skip(): void {
    if (!this.cut && Number.isFinite(this.video.duration) && this.video.currentTime < INTRO_CUT_AT) {
      this.video.currentTime = INTRO_CUT_AT;
      void this.cutToGame();
      return;
    }
    void this.finish(true);
  }

  /** The overlook shot: show the game, keep the video playing for its soundtrack. */
  private async cutToGame(): Promise<void> {
    if (this.cut || this.finished) return;
    this.cut = true;
    await this.gameReady;
    const left = Number.isFinite(this.video.duration) ? Math.max(0, this.video.duration - this.video.currentTime) : 8;
    this.onCut(left);
    this.video.classList.add('cut-away');
  }

  private async finish(skipped: boolean): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.skipBtn.hidden = true;
    safeSet(SEEN_KEY, '1');
    if (skipped) this.video.pause();

    await this.gameReady;
    this.onHandover();
    void Sound.music(); // the soundtrack carries on from the video into the game
    this.video.classList.add('fade-out');
    window.setTimeout(() => {
      this.video.pause();
      this.video.hidden = true;
      this.startScreen.hidden = true;
      // free the downloaded video (tens of MB) once it is done with
      const src = this.video.src;
      if (src.startsWith('blob:')) {
        this.video.removeAttribute('src');
        this.video.load();
        URL.revokeObjectURL(src);
      }
    }, 500);
  }
}
