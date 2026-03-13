import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'screenshots');

const files = [
  '01-hero.png',
  '02-features.png',
  '03-how-it-works.png',
  '04-friend-system.png',
  '05-footer.png',
].map((f) => path.join(dir, f));

const images = await Promise.all(files.map((f) => sharp(f).metadata()));
const width = Math.max(...images.map((m) => m.width || 0));
const gap = 32;
const padding = 40;

const totalHeight =
  padding * 2 +
  images.reduce((acc, m) => acc + (m.height || 0), 0) +
  gap * (images.length - 1);

const composites = [];
let top = padding;

for (let i = 0; i < files.length; i++) {
  composites.push({
    input: files[i],
    left: Math.round((width - (images[i].width || 0)) / 2),
    top,
  });
  top += (images[i].height || 0) + gap;
}

const canvas = sharp({
  create: {
    width: width + padding * 2,
    height: totalHeight,
    channels: 4,
    background: '#f4f4f4',
  },
})
  .composite(composites);

await canvas.png({ compressionLevel: 9 }).toFile(path.join(dir, 'thumbnail-long.png'));
await canvas.jpeg({ quality: 88 }).toFile(path.join(dir, 'thumbnail-long.jpg'));

console.log('✅ Generated: landing/screenshots/thumbnail-long.png');
console.log('✅ Generated: landing/screenshots/thumbnail-long.jpg');
