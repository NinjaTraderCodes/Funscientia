import Phaser from 'phaser';
import './styles.css';
import { IntroPlayer } from './intro/IntroPlayer';
import { Sound } from './audio/Sound';
import { BootScene, GAME_EVENTS } from './scenes/BootScene';
import { ChapterScene } from './scenes/ChapterScene';
import { OverlookScene } from './scenes/OverlookScene';
import { WorldScene } from './scenes/WorldScene';

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
  scene: [BootScene, OverlookScene, ChapterScene, WorldScene],
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

// Allow starting once the whole intro is downloaded (so it never pauses to
// buffer) and the game's first scene is ready; both load at the same time.
Promise.all([intro.ready, gameReady]).then(() => intro.enableStart());

const note = document.getElementById('load-note') as HTMLElement;
// one progress figure for both downloads (the intro video is most of the bytes)
const loading = { game: 0, intro: 0 };
const showLoading = () => {
  if (loading.game >= 1 && loading.intro >= 1) return;
  note.textContent = `Preparing the adventure… ${Math.round((loading.game * 0.2 + loading.intro * 0.8) * 100)}%`;
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
const FOLLOW_HINT = 'Follow the golden star to the Digestive Kingdom!';
let onOverlook = true;
game.events.once(GAME_EVENTS.openingDone, () => {
  showHint(touch
    ? 'Tap the ground to walk — your friends will follow!'
    : 'Click the ground or use the arrow keys to walk — your friends will follow!');
});
game.events.once(GAME_EVENTS.firstMove, () => {
  // second hint: point the way once they know how to walk
  window.setTimeout(() => {
    hint.classList.remove('show');
    window.setTimeout(() => onOverlook && showHint(FOLLOW_HINT), 600);
  }, 2500);
});
game.events.on(GAME_EVENTS.leaving, () => {
  onOverlook = false;
  hint.classList.remove('show');
  window.setTimeout(() => (hud.hidden = true), 500);
});
game.events.on(GAME_EVENTS.resumed, () => {
  onOverlook = true;
  showHint(FOLLOW_HINT);
});

// sound on/off (remembered); the HUD is pointer-transparent except this button
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement;
const introVideo = document.getElementById('intro') as HTMLVideoElement;
const showMute = () => {
  muteBtn.textContent = Sound.muted ? '🔇' : '🔊';
  introVideo.muted = Sound.muted;
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
