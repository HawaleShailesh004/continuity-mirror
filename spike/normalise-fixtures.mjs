// One-off: persona baselines → public/mock/personas (JPEG, long side 1024, EXIF stripped, same as the server).
import sharp from 'sharp';
import { root, assets } from './lib.mjs';
import { join } from 'node:path';
for (const [src, id] of [['persona-a-meera', 'meera'], ['persona-b-amara', 'amara'], ['persona-c-daniel', 'daniel'], ['persona-d-grace', 'grace']]) {
  const info = await sharp(assets(`${src}.jpg`)).rotate().resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 90 }).toFile(join(root, 'public/mock/personas', `${id}.jpg`));
  console.log(id, info.width, info.height, info.size);
}
