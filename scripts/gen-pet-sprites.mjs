// 生成 2.5D 等距像素精灵：3 品种 × 4 方向 × 4 帧（96×96，≤16 色）。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SIZE = 96, GRID = 24, CELL = 4;
const SPECIES = [
  { id: 'cat', palette: ['#2b2030', '#f7a6c8', '#fff0f6'], ear: 'point' },
  { id: 'dog', palette: ['#3d2a16', '#d9a066', '#ffe3c2'], ear: 'drop' },
  { id: 'parrot', palette: ['#0f3b2e', '#2fbf71', '#ffe066'], ear: 'beak' }
];

function crc32(buf) {
  const t = crc32.t ?? (crc32.t = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })());
  let crc = 0xffffffff;
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// 24×24 网格：身体 + 头部 + 品种特征 + 方向偏移 + 帧摆动。
function paint(spec, dir, frame) {
  const cells = Array.from({ length: GRID }, () => Array(GRID).fill(-1));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < GRID && y < GRID) cells[y][x] = c; };
  const bob = frame % 4 === 2 ? 1 : 0;
  const cx = dir === 'left' ? 10 : dir === 'right' ? 14 : 12;
  // 身体
  for (let y = 12 + bob; y < 21; y++) {
    for (let x = cx - 5; x <= cx + 5; x++) {
      const d = Math.abs(x - cx) + Math.abs(y - (16 + bob));
      if (d <= 6) set(x, y, 1);
    }
  }
  // 头
  for (let y = 6 + bob; y < 13 + bob; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) set(x, y, 2);
  }
  // 品种特征
  if (spec.ear === 'point') {
    set(cx - 4, 5 + bob, 1); set(cx - 3, 5 + bob, 1);
    set(cx + 4, 5 + bob, 1); set(cx + 3, 5 + bob, 1);
  } else if (spec.ear === 'drop') {
    set(cx - 5, 8 + bob, 1); set(cx - 5, 9 + bob, 1);
    set(cx + 5, 8 + bob, 1); set(cx + 5, 9 + bob, 1);
  } else {
    set(cx, 5 + bob, 2); set(cx + 1, 5 + bob, 2); set(cx, 6 + bob, 2);
  }
  // 眼睛（方向）
  const eyeShift = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  set(cx - 2 + eyeShift, 9 + bob, 0);
  set(cx + 2 + eyeShift, 9 + bob, 0);
  // 尾巴
  if (dir !== 'front') {
    const tx = dir === 'left' ? cx + 7 : cx - 7;
    for (let y = 14; y < 18; y++) set(tx, y, 1);
  }
  return cells;
}

function render(cells, palette) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const colors = palette.map(hex);
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) {
    const idx = cells[cy][cx];
    if (idx < 0) continue;
    const [r, g, b, a] = colors[idx];
    for (let py = 0; py < CELL; py++) for (let px = 0; px < CELL; px++) {
      const off = ((cy * CELL + py) * SIZE + (cx * CELL + px)) * 4;
      rgba[off] = r; rgba[off + 1] = g; rgba[off + 2] = b; rgba[off + 3] = a;
    }
  }
  return rgba;
}

const outDir = join(process.cwd(), 'server', 'assets', 'pets');
mkdirSync(outDir, { recursive: true });
let count = 0;
for (const spec of SPECIES) {
  for (const dir of ['front', 'back', 'left', 'right']) {
    for (let frame = 0; frame < 4; frame++) {
      const file = join(outDir, `${spec.id}-${dir}-${frame}.png`);
      writeFileSync(file, png(SIZE, SIZE, render(paint(spec, dir, frame), spec.palette)));
      count++;
    }
  }
}
mkdirSync(join(process.cwd(), 'server', 'conf'), { recursive: true });
writeFileSync(join(process.cwd(), 'server', 'conf', 'pets.json'), JSON.stringify({
  canvas: SIZE, grid: GRID, fps: 8,
  species: SPECIES.map((s) => ({ id: s.id, frames: ['front', 'back', 'left', 'right'].flatMap((d) => [0, 1, 2, 3].map((f) => `/assets/pets/${s.id}-${d}-${f}.png`)) }))
}, null, 2));
console.log(`generated ${count} pet frames -> server/assets/pets`);