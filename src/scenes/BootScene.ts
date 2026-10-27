import Phaser from 'phaser';
import type { CharacterManifest, WorldLayout } from '../data/types';
import { asset } from '../assetUrl';

export const GAME_EVENTS = {
  progress: 'boot:progress',
  overlookReady: 'overlook:ready',
  /** The intro video reaches its last shot: the game shows the overlook from here (payload: seconds of soundtrack left). */
  introCut: 'intro:cut',
  introDone: 'intro:done',
  /** Skip pressed: frame the end of the intro's last shot right away (the pull-back comes next). */
  introSkip: 'intro:skip',
  openingDone: 'opening:done',
  /** The profile badge was tapped: the scene opens the avatar editor if it is a good moment. */
  editProfile: 'profile:edit',
  /** The Discovery Book opened (payload: a promise that resolves when it closes): the scene waits. */
  bookOpen: 'book:open',
  /** The avatar or name changed (the badge shows the new one). */
  profileChanged: 'profile:changed',
  firstMove: 'party:first-move',
  leaving: 'overlook:leaving',
  resumed: 'overlook:resumed',
} as const;

/** Loads the layout manifests, then every texture they reference. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.json('world', asset('world/overlook.json'));
    this.load.json('characters', asset('characters/characters.json'));
  }

  create(): void {
    const world = this.cache.json.get('world') as WorldLayout;
    const manifest = this.cache.json.get('characters') as CharacterManifest;

    for (const layer of Object.values(world.layers)) {
      this.load.image(layer.image, asset(`${layer.image}.webp`));
    }
    for (const [name, def] of Object.entries(manifest.characters)) {
      this.load.atlas(name, asset(`${def.atlas}.webp`), asset(`${def.atlas}.json`));
    }
    this.load.on('progress', (p: number) => this.game.events.emit(GAME_EVENTS.progress, p));
    this.load.once('complete', () => this.scene.start('Overlook'));
    this.load.start();
  }
}
