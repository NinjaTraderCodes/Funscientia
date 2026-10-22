import Phaser from 'phaser';
import './styles.css';
import { IntroPlayer, wantsFullHD } from './intro/IntroPlayer';
import { asset } from './assetUrl';
import { GameState } from './state/GameState';
import { OnlineSave } from './state/OnlineSave';
import { askCode } from './ui/CodePanel';
import { toast } from './ui/Toast';
import { I18n, applyPage, t, type Key } from './i18n/i18n';
import { Sound } from './audio/Sound';
import { BootScene, GAME_EVENTS } from './scenes/BootScene';
import { ChapterScene } from './scenes/ChapterScene';
import { OverlookScene } from './scenes/OverlookScene';
import { WorldScene } from './scenes/WorldScene';
import { MouthScene } from './scenes/MouthScene';
import { StomachScene } from './scenes/StomachScene';

// Render at device resolution (capped at 2x for performance) and let CSS scale
// the canvas back down, so the art stays sharp on phones and retina screens.
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const size = () => ({ w: Math.round(window.innerWidth * dpr), h: Math.round(window.innerHeight * dpr) });

const { w, h } = size();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1533',
  scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / dpr },
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 2 },
  scene: [BootScene, OverlookScene, ChapterScene, WorldScene, MouthScene, StomachScene],
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const s = size();
    game.scale.resize(s.w, s.h);
  }, 60);
});

const gameReady = new Promise<void>((resolve) => game.events.once(GAME_EVENTS.overlookReady, () => resolve()));

const intro = new IntroPlayer(
  gameReady,
  (secondsLeft) => game.events.emit(GAME_EVENTS.introCut, secondsLeft),
  () => game.events.emit(GAME_EVENTS.introDone),
);

// The hero page shows first, with its looping video; the intro starts downloading
// once that video is playing (so the two do not compete), or after a moment anyway.
const hero = document.getElementById('hero-video') as HTMLVideoElement;
hero.src = asset(wantsFullHD() ? 'hero/hero_1080.mp4' : 'hero/hero_720.mp4');
// its sound (the portal's shimmer) plays if the browser allows it; most only allow sound
// after the visitor's first tap or key, so it then starts with that (unless sound is off)
hero.volume = 0.8;
const heroWithSound = () => {
  if (!hero.paused && hero.muted === Sound.muted) return; // already playing as wanted
  hero.muted = Sound.muted; // sound switched off by the visitor: it still plays, silently
  void hero.play().catch(() => {
    hero.muted = true;
    void hero.play().catch(() => undefined); // silent is always allowed; the still frame shows meanwhile
  });
};
heroWithSound();
const onFirstGesture = () => {
  window.removeEventListener('pointerdown', onFirstGesture, true);
  window.removeEventListener('keydown', onFirstGesture, true);
  if (!hero.ended && hero.currentSrc) heroWithSound();
};
window.addEventListener('pointerdown', onFirstGesture, true);
window.addEventListener('keydown', onFirstGesture, true);
hero.addEventListener('playing', () => void intro.beginPreload(), { once: true });
window.setTimeout(() => void intro.beginPreload(), 2500);

const note = document.getElementById('load-note') as HTMLElement;
// one progress figure for both downloads (the intro video is most of the bytes)
const loading = { game: 0, intro: 0 };
const fill = document.getElementById('loading-fill') as HTMLElement;
const showLoading = () => {
  const pct = Math.round((loading.game * 0.2 + loading.intro * 0.8) * 100);
  fill.style.width = `${pct}%`;
  note.textContent = pct < 100 ? t('start.loading', { pct }) : t('start.ready');
};
game.events.on(GAME_EVENTS.progress, (p: number) => {
  loading.game = p;
  showLoading();
});
intro.onProgress = (p) => {
  loading.intro = p;
  showLoading();
};

// HUD hints
const hud = document.getElementById('hud') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const touch = window.matchMedia('(pointer: coarse)').matches;
const showHint = (text: string) => {
  hud.hidden = false;
  hint.textContent = text;
  requestAnimationFrame(() => hint.classList.add('show'));
};
const FOLLOW_HINT = () => t('hint.follow');
let onOverlook = true;
game.events.once(GAME_EVENTS.openingDone, () => {
  showHint(touch
    ? t('hint.walkTouch') : t('hint.walkMouse'));
});
game.events.once(GAME_EVENTS.firstMove, () => {
  // second hint: point the way once they know how to walk
  window.setTimeout(() => {
    hint.classList.remove('show');
    window.setTimeout(() => onOverlook && showHint(FOLLOW_HINT()), 600);
  }, 2500);
});
game.events.on(GAME_EVENTS.leaving, () => {
  onOverlook = false;
  hint.classList.remove('show');
  window.setTimeout(() => (hud.hidden = true), 500);
});
game.events.on(GAME_EVENTS.resumed, () => {
  onOverlook = true;
  showHint(FOLLOW_HINT());
});

// sound on/off (remembered); the HUD is pointer-transparent except this button
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement;
const introVideo = document.getElementById('intro') as HTMLVideoElement;
const showMute = () => {
  muteBtn.textContent = Sound.muted ? '🔇' : '🔊';
  introVideo.muted = Sound.muted;
  hero.muted = Sound.muted;
};
showMute();
muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  Sound.unlock();
  Sound.setMuted(!Sound.muted);
  showMute();
});

// handy while developing: window.game in the console
(window as unknown as { game: Phaser.Game }).game = game;

// the profile badge: the player's avatar and name; tapping it opens the editor (when the scene allows)
const profileBtn = document.getElementById('profile-btn') as HTMLButtonElement;
const SPRITE_IMG = { walid: 'avatars/boy.webp', nesma: 'avatars/girl.webp', fox: 'avatars/fox.webp' } as const;
// only over the game itself: never on the hero page, the loading screen or the intro video
let inGame = false;
const showProfile = () => {
  const hero = GameState.hero;
  profileBtn.hidden = !hero || !inGame;
  if (!hero) return;
  profileBtn.querySelector('img')!.src = asset(SPRITE_IMG[hero]);
  profileBtn.querySelector('span')!.textContent = GameState.nameOf(hero);
};
const enterGame = () => {
  inGame = true;
  showProfile();
};
game.events.once(GAME_EVENTS.introDone, enterGame);

// ---- online saves: a save code, and "Continue with my code" on the hero page ----
OnlineSave.start();
OnlineSave.onCode((code, isNew) => {
  if (isNew) toast(t('save.yourCode'), t('save.keepIt', { code }), 7000);
});
// save what is pending before the page is left (or hidden, on phones)
document.addEventListener('visibilitychange', () => document.hidden && OnlineSave.saveNow());

/** Where a continued adventure picks up: the chapter card, then that place. */
const RESUME: Record<string, { title: Key; subtitle: Key; scene: string; data?: object }> = {
  road: { title: 'chapter.1', subtitle: 'chapter.roadToMouth', scene: 'World', data: { place: 'road' } },
  road2: { title: 'chapter.1', subtitle: 'chapter.roadToMouth', scene: 'World', data: { place: 'road2' } },
  mouth: { title: 'chapter.1', subtitle: 'chapter.mouthMission', scene: 'Mouth' },
  esophagus: { title: 'chapter.2', subtitle: 'chapter.esophagus', scene: 'World', data: { place: 'esophagus' } },
  stomach: { title: 'chapter.2', subtitle: 'chapter.stomachMission', scene: 'Stomach' },
};
const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement;
continueBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const found = await askCode();
  if (!found) return;
  // a starting point (a jury code) stays as it is: the player gets a new code of their own
  if (found.data.template) OnlineSave.forget();
  else OnlineSave.adopt(found.code);
  GameState.restore(found.data);
  await intro.bypass();
  const overlook = game.scene.getScene('Overlook');
  const at = RESUME[GameState.place];
  if (at) {
    overlook.scene.start('Chapter', { title: t(at.title), subtitle: t(at.subtitle), next: { scene: at.scene, data: at.data } });
    enterGame();
  } else {
    overlook.scene.restart({ skipOpening: true }); // on the overlook (it shows the badge itself)
  }
  toast(t('save.welcomeBack'), t('save.continuing', { code: found.code }), 4500);
});
game.events.on(GAME_EVENTS.resumed, enterGame);
game.events.on(GAME_EVENTS.profileChanged, showProfile);
profileBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
profileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  game.events.emit(GAME_EVENTS.editProfile);
});

// English / Arabic: the button shows the other language; everything on screen follows
applyPage();
const langBtn = document.getElementById('lang-btn') as HTMLButtonElement;
const showLang = () => {
  langBtn.textContent = I18n.lang === 'ar' ? 'EN' : 'ع';
};
showLang();
langBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
langBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  I18n.set(I18n.lang === 'ar' ? 'en' : 'ar');
});
I18n.onChange(() => {
  showLang();
  showProfile();
});
