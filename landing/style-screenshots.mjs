import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('landing/screenshots');
const outDir = path.join(root, 'styled');

const files = (await fs.readdir(root))
  .filter((f) => f.endsWith('.png'))
  .filter((f) => !f.startsWith('.'));

const BORDER = 28;      // white border thickness
const CANVAS_MARGIN = 56; // outer spacing around frame
const SHADOW_BLUR = 24;
const SHADOW_OFFSET_X = 0;
const SHADOW_OFFSET_Y = 16;
const SHADOW_OPACITY = 0.3;

await fs.mkdir(outDir, { recursive: true });

for (const file of files) {
  const inputPath = path.join(root, file);

  const bordered = await sharp(inputPath)
    .extend({
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
      background: '#ffffff',
    })
    .png()
    .toBuffer();

  const meta = await sharp(bordered).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const shadow = await sharp(bordered)
    .flatten({ background: '#000000' })
    .ensureAlpha(SHADOW_OPACITY)
    .blur(SHADOW_BLUR)
    .png()
    .toBuffer();

  const canvasW = width + CANVAS_MARGIN * 2;
  const canvasH = height + CANVAS_MARGIN * 2;

  const outPath = path.join(outDir, file.replace('.png', '-styled.png'));

  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: shadow,
        left: CANVAS_MARGIN + SHADOW_OFFSET_X,
        top: CANVAS_MARGIN + SHADOW_OFFSET_Y,
      },
      {
        input: bordered,
        left: CANVAS_MARGIN,
        top: CANVAS_MARGIN,
      },
    ])
    .png()
    .toFile(outPath);

  console.log(`Styled: ${outPath}`);
}

console.log('All screenshots styled with white border + shadow.');
