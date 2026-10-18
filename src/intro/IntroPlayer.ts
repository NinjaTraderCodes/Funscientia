const SEEN_KEY = 'funscientia.introSeen';

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
 * Plays the intro video full-screen and hands over to the game at its last
 * frame. The game scene renders behind the video, framed like that last
 * frame, so fading the video out reveals an identical picture.
 */
export class IntroPlayer {
  private readonly video = document.getElementById('intro') as HTMLVideoElement;
  private readonly startScreen = document.getElementById('start-screen') as HTMLElement;
  private readonly startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  private readonly skipBtn = document.getElementById('skip-btn') as HTMLButtonElement;
  private finished = false;

  constructor(
    private readonly gameReady: Promise<void>,
    private readonly onHandover: () => void,
  ) {
    this.startBtn.addEventListener('click', () => this.start(), { once: true });
    this.skipBtn.addEventListener('click', () => this.finish(true));
    this.video.addEventListener('ended', () => this.finish(false));
    this.video.addEventListener('error', () => this.finish(false));
  }

  enableStart(): void {
    this.startBtn.disabled = false;
    this.startBtn.textContent = 'Start the adventure';
    (document.getElementById('load-note') as HTMLElement).textContent = '';
  }

  private async start(): Promise<void> {
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

  private async finish(skipped: boolean): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.skipBtn.hidden = true;
    safeSet(SEEN_KEY, '1');

    if (skipped && Number.isFinite(this.video.duration)) {
      // jump to the last frame so the handover still matches the game's first frame
      this.video.pause();
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        this.video.addEventListener('seeked', done, { once: true });
        window.setTimeout(done, 700);
        this.video.currentTime = Math.max(0, this.video.duration - 0.05);
      });
    }

    await this.gameReady;
    this.onHandover();
    this.video.classList.add('fade-out');
    window.setTimeout(() => {
      this.video.pause();
      this.video.hidden = true;
      this.startScreen.hidden = true;
    }, 500);
  }
}
