// Turn the frames captured by tools/record_demo.mjs into a shareable MP4
// (H.264, 30 fps constant, faststart; sized for messengers like Telegram).
// Usage: node tools/encode_demo.mjs [inDir] [out.mp4] [crf]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const dir = process.argv[2] || '.tools/work/demo';
const out = process.argv[3] || 'funscientia_demo.mp4';
const crf = process.argv[4] || '23';
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));

// concat list with each frame's real on-screen duration (screencast frames arrive irregularly)
const lines = ['ffconcat version 1.0'];
for (let i = 0; i < index.length; i++) {
  const next = index[i + 1]?.t ?? index[i].t + 1 / 30;
  lines.push(`file '${resolve(dir, 'frames', index[i].file).replace(/\\/g, '/')}'`);
  lines.push(`duration ${Math.max(0.001, next - index[i].t).toFixed(4)}`);
}
lines.push(`file '${resolve(dir, 'frames', index.at(-1).file).replace(/\\/g, '/')}'`);
const list = join(dir, 'frames.ffconcat');
writeFileSync(list, lines.join('\n'));

execFileSync('ffmpeg', [
  '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high', '-tune', 'animation',
  '-movflags', '+faststart', out,
], { stdio: 'inherit' });
console.log('wrote', out);
