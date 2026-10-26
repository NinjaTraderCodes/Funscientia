import { asset } from '../assetUrl';
import { I18n, t, type Key } from '../i18n/i18n';
import { GameState } from '../state/GameState';
import { BOOK_NOTES } from '../state/discoveries';

/**
 * The explorer's certificate at the end of the Kingdom of Digestion: the child's name and avatar,
 * each mission's best stars, the notes found, the three Guardians as seals. Drawn on a canvas, so
 * the same picture is shown and downloaded (in the current language).
 */
const W = 1600;
const H = 1130;
const MISSIONS: readonly { game: string; title: Key }[] = [
  { game: 'mouth', title: 'chapter.mouthMission' },
  { game: 'stomach', title: 'chapter.stomachMission' },
  { game: 'small-intestine', title: 'chapter.smallIntestineMission' },
  { game: 'revision', title: 'chapter.revision' },
];
const AVATAR_ART = { walid: 'avatars/boy.webp', nesma: 'avatars/girl.webp', fox: 'avatars/fox.webp' } as const;

const load = (path: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => resolve(null);
  im.src = asset(path);
});

export async function drawCertificate(): Promise<HTMLCanvasElement> {
  const hero = GameState.hero ?? 'walid';
  const [logo, avatar, star, ...seals] = await Promise.all([
    load('hero/logo.webp'), load(AVATAR_ART[hero]), load('mouth/ui_star.webp'),
    load('portraits/tooth_happy.webp'), load('portraits/stomach_happy.webp'), load('portraits/intestine_happy.webp'),
  ]);
  const display = I18n.rtl ? "'Baloo Bhaijaan 2', Tahoma, sans-serif" : 'Georgia, serif';
  const body = I18n.rtl ? "'Baloo Bhaijaan 2', Tahoma, sans-serif" : "'Trebuchet MS', 'Segoe UI', sans-serif";
  await document.fonts?.ready;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.direction = I18n.rtl ? 'rtl' : 'ltr';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // parchment, a navy band and a double gold frame
  const paper = g.createLinearGradient(0, 0, W, H);
  paper.addColorStop(0, '#fffaf0');
  paper.addColorStop(1, '#f3e2bd');
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  const frame = (inset: number, width: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, 46 - inset / 3);
    g.stroke();
  };
  frame(22, 16, '#d9a63a');
  frame(46, 4, '#1f4f97');
  frame(58, 2, '#e8c46a');
  for (const [x, y] of [[90, 90], [W - 90, 90], [90, H - 90], [W - 90, H - 90]]) {
    g.fillStyle = '#e0ae45';
    g.font = `40px ${display}`;
    g.fillText('★', x, y);
  }

  if (logo) {
    const lw = 360;
    g.drawImage(logo, W / 2 - lw / 2, 82, lw, (lw * logo.height) / logo.width);
  }
  const title = (text: string, y: number, size: number, color: string, font = display, weight = 'bold') => {
    g.font = `${weight} ${size}px ${font}`;
    g.fillStyle = color;
    g.fillText(text, W / 2, y, W - 360);
  };
  title(t('cert.title'), 300, 76, '#1b3864');
  title(t('cert.certifies'), 380, 34, '#6a4d1d', body, 'normal');
  // the name, in gold, on a navy ribbon
  g.fillStyle = '#163d74';
  g.beginPath();
  g.roundRect(W / 2 - 430, 420, 860, 120, 60);
  g.fill();
  g.strokeStyle = '#eec463';
  g.lineWidth = 5;
  g.stroke();
  title(GameState.nameOf(hero), 482, 74, '#ffe08a');
  title(t(hero === 'nesma' ? 'cert.exploredF' : 'cert.explored'), 600, 34, '#2b2314', body, 'normal');

  // the avatar, the missions' stars, the three Guardians as seals (mirrored in Arabic: it reads from the right)
  const X = (x: number) => (I18n.rtl ? W - x : x);
  const ring = (x: number, y: number, r: number, im: HTMLImageElement | null) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#fff3d6';
    g.fill();
    if (im) {
      g.save();
      g.clip();
      g.drawImage(im, x - r, y - r, 2 * r, 2 * r);
      g.restore();
    }
    g.strokeStyle = '#d9a63a';
    g.lineWidth = r > 100 ? 8 : 7;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(X(250), 760, 120, avatar);
  MISSIONS.forEach((m, i) => {
    const y = 680 + i * 58;
    const best = GameState.result(m.game)?.stars ?? 0;
    g.font = `bold 30px ${body}`;
    g.fillStyle = '#1b3864';
    g.textAlign = I18n.rtl ? 'left' : 'right';
    g.fillText(t(m.title), X(850), y, 430);
    g.textAlign = 'center';
    for (let k = 0; k < 3 && star; k++) {
      g.globalAlpha = k < best ? 1 : 0.22;
      g.drawImage(star, X(890 + k * 56 + 24) - 24, y - 24, 48, 48);
    }
    g.globalAlpha = 1;
  });
  const found = BOOK_NOTES.filter((id) => GameState.discoveries.includes(id)).length;
  title(t('cert.notes', { n: found, total: BOOK_NOTES.length }), 940, 32, '#6a4d1d', body, 'bold');
  seals.forEach((im, i) => ring(X(1210 + i * 120), 760 + (i === 1 ? -40 : 30), 62, im));
  g.font = `bold 24px ${body}`;
  g.fillStyle = '#6a4d1d';
  g.fillText(t('cert.guardians'), X(1330), 880);

  const date = new Date().toLocaleDateString(I18n.lang === 'ar' ? 'ar-DZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  title(date, 1010, 26, '#8a6c36', body, 'normal');
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
