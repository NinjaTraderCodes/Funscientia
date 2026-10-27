import { asset } from '../assetUrl';
import { I18n, t, type Key } from '../i18n/i18n';
import { GameState } from '../state/GameState';
import { BOOK_NOTES } from '../state/discoveries';

/**
 * The explorer's certificate at the end of the Kingdom of Digestion, on Dounia's design (its words painted
 * out: certificate/plate.webp): the child's name, each mission's best stars, the notes found, the date, and
 * the child's avatar in the medal. Drawn on a canvas in the current language, so the picture shown, the
 * large view and the download are the same.
 */
const PW = 1536; // the plate's layout, in pixels of its master (drawn larger)
const PH = 1024;
const OUT_W = 2048;
const S = OUT_W / PW;
const MISSIONS: readonly { game: string; title: Key }[] = [
  { game: 'mouth', title: 'chapter.mouthMission' },
  { game: 'stomach', title: 'chapter.stomachMission' },
  { game: 'small-intestine', title: 'chapter.smallIntestineMission' },
  { game: 'revision', title: 'chapter.revision' },
];
const ROW_Y = [605, 665, 725, 785]; // the rows (their icons are part of the picture)
const AVATAR_ART = { walid: 'avatars/boy.webp', nesma: 'avatars/girl.webp', fox: 'avatars/fox.webp' } as const;

const load = (path: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => resolve(null);
  im.src = asset(path);
});

export async function drawCertificate(): Promise<HTMLCanvasElement> {
  const hero = GameState.hero ?? 'walid';
  const [plate, avatar, star] = await Promise.all([load('certificate/plate.webp'), load(AVATAR_ART[hero]), load('mouth/ui_star.webp')]);
  const ar = I18n.rtl;
  const serif = ar ? "'Baloo Bhaijaan 2', Tahoma, sans-serif" : 'Georgia, serif';
  await document.fonts?.ready;

  const c = document.createElement('canvas');
  c.width = OUT_W;
  c.height = Math.round(PH * S);
  const g = c.getContext('2d')!;
  g.scale(S, S);
  if (plate) g.drawImage(plate, 0, 0, PW, PH);
  g.direction = ar ? 'rtl' : 'ltr';
  g.textBaseline = 'middle';
  const text = (s: string, x: number, y: number, size: number, color: string, opts: { weight?: string; style?: string; align?: CanvasTextAlign; max?: number; shadow?: string } = {}) => {
    g.font = `${opts.style ?? ''} ${opts.weight ?? 'bold'} ${size}px ${serif}`;
    g.textAlign = opts.align ?? 'center';
    g.fillStyle = color;
    if (opts.shadow) {
      g.shadowColor = opts.shadow;
      g.shadowOffsetY = 2;
      g.shadowBlur = 0;
    }
    g.fillText(s, x, y, opts.max);
    g.shadowColor = 'transparent';
  };

  text(t('cert.title'), 775, 300, ar ? 76 : 70, '#173a6e', { max: 820, shadow: '#e8c46a' });
  text(t('cert.certifies'), 775, 368, 28, '#4a3412', { weight: 'normal', max: 470 });
  // the name, in gold on the navy ribbon
  text(GameState.nameOf(hero), 775, 460, ar ? 66 : 62, '#ffd977', { max: 500, shadow: '#6b440c' });
  // the sentence on two lines, as on Dounia's design (it would run into the mascot's star as one)
  const said = t(hero === 'nesma' ? 'cert.exploredF' : 'cert.explored');
  const comma = Math.max(said.indexOf(', '), said.indexOf('، '));
  const lines = comma > 0 ? [said.slice(0, comma + 1), said.slice(comma + 2)] : [said];
  lines.forEach((line, i) => text(line, 775, lines.length > 1 ? 531 + i * 29 : 546, 24, '#4a3412', { weight: 'normal', style: ar ? '' : 'italic', max: 640 }));

  // each mission's best stars (the icons are on the left; Arabic reads the row from the right)
  MISSIONS.forEach((m, i) => {
    const y = ROW_Y[i];
    const best = GameState.result(m.game)?.stars ?? 0;
    const name = t(m.title);
    text(name, ar ? 1045 : 590, y, name.length > 22 ? 22 : 26, '#2b2314', { weight: ar ? 'bold' : 'normal', align: ar ? 'right' : 'left', max: 295 });
    for (let k = 0; k < 3 && star; k++) {
      const x = ar ? 600 + k * 44 : 1012 - (2 - k) * 44;
      g.globalAlpha = k < best ? 1 : 0.25;
      g.drawImage(star, x - 18, y - 18, 36, 36);
    }
    g.globalAlpha = 1;
  });
  const found = BOOK_NOTES.filter((id) => GameState.discoveries.includes(id)).length;
  text(t('cert.notes', { n: found, total: BOOK_NOTES.length }), 775, 893, 27, '#2b2314', { max: 380 });
  const date = new Date().toLocaleDateString(I18n.lang === 'ar' ? 'ar-DZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  text(date, 775, 940, 21, '#6a4d1d', { weight: 'normal' });

  // the child's avatar in the medal
  if (avatar) {
    g.save();
    g.beginPath();
    g.arc(1240, 765, 62, 0, Math.PI * 2);
    g.clip();
    g.drawImage(avatar, 1240 - 62, 765 - 62, 124, 124);
    g.restore();
  }
  return c;
}

/** Offer the certificate as a picture to save (or share) on this device. */
export function downloadCertificate(c: HTMLCanvasElement): void {
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Funscientia-certificate.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

/** The certificate in a large window, with Download and Close. Resolves when it is closed. */
export async function viewCertificate(drawn?: HTMLCanvasElement): Promise<void> {
  const c = drawn ?? (await drawCertificate());
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'cert-view';
    el.dir = I18n.rtl ? 'rtl' : 'ltr';
    el.innerHTML = `<div class="cert-view-card" role="dialog" aria-modal="true" aria-label="${t('cert.title')}">
      <img src="${c.toDataURL('image/png')}" alt="${t('cert.title')}" />
      <div class="cert-view-actions"><button type="button" class="avatar-continue" data-act="download">${t('fin.download')}</button>
      <button type="button" class="c3-secondary" data-act="close">${t('review.close')}</button></div></div>`;
    document.getElementById('app')!.appendChild(el);
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      el.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.code === 'Escape') close();
    };
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'download') downloadCertificate(c);
      else if (act === 'close' || e.target === el) close();
    });
    window.addEventListener('keydown', onKey, true);
    el.querySelector<HTMLButtonElement>('[data-act=download]')?.focus();
  });
}
