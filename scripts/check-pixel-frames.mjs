// 校验像素头像框资源：尺寸、颜色数、文件大小、透明通道。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const dir = process.argv[2] ?? 'server/assets/frames';
const MAX_BYTES = 64 * 1024;
const CANVAS = 96;
const PALETTE_MAX = 16;
let failures = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const buf = readFileSync(join(dir, file));
  const factor = Number(/-(\d)x\.png$/.exec(file)?.[1] ?? 1);
  const expected = CANVAS * factor;

  const signatureOK = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];

  let offset = 8;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buf.slice(offset + 8, offset + 8 + len));
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const colors = new Set();
  let alphaBad = false;
  const stride = width * 4 + 1;
  for (let y = 0; y < height; y++) {
    // 生成脚本只使用 filter 0
    if (raw[y * stride] !== 0) {
      colors.add('unsupported-filter');
      break;
    }
    for (let x = 0; x < width; x++) {
      const off = y * stride + 1 + x * 4;
      const a = raw[off + 3];
      if (a !== 0 && a !== 255) alphaBad = true;
      if (a !== 0) colors.add(`${raw[off]},${raw[off + 1]},${raw[off + 2]}`);
    }
  }

  const problems = [];
  if (!signatureOK) problems.push('bad signature');
  if (width !== expected || height !== expected) problems.push(`size ${width}x${height} != ${expected}`);
  if (bitDepth !== 8 || colorType !== 6) problems.push('must be 8-bit RGBA');
  if (statSync(join(dir, file)).size > MAX_BYTES) problems.push('file too large');
  if (colors.size > PALETTE_MAX) problems.push(`palette ${colors.size} > ${PALETTE_MAX}`);
  if (alphaBad) problems.push('alpha must be 0 or 255');

  if (problems.length) {
    failures += 1;
    console.error(`${file}: ${problems.join('; ')}`);
  }
}

console.log(`pixel frame check finished: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);