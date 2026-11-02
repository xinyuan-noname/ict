// 生成像素头像框：96×96、24×24 网格（每格 4×4）、≤16 色、PNG。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SIZE = 96;
const GRID = 24;
const CELL = SIZE / GRID;

const FRAMES = [
  { id: 'frame_pixel_cyan', name: '青岚光环', price: 0, palette: ['#0b3d4d', '#25d0e0', '#a8f7ff'], shape: 'ring' },
  { id: 'frame_pixel_sakura', name: '樱瓣', price: 100, palette: ['#5a1f3d', '#ff8fc7', '#ffd6e8'], shape: 'petal' },
  { id: 'frame_pixel_circuit', name: '电路', price: 300, palette: ['#06281f', '#27e08a', '#b8ffe0'], shape: 'circuit' },
  { id: 'frame_pixel_dawn', name: '晨曦门扉', price: 500, palette: ['#4a2606', '#ffb03a', '#ffe6a8'], shape: 'arch' },
  { id: 'frame_pixel_starnest', name: '星巢', price: 800, palette: ['#0a1233', '#5b7cff', '#dbe4ff'], shape: 'stars' },
  { id: 'frame_pixel_cat', name: '猫爪', price: 1200, palette: ['#2b2030', '#f7a6c8', '#fff0f6'], shape: 'cat' }
];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function hexToRgba(hex, alpha = 255) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

// 返回 24×24 的调色板索引（-1 表示透明）。
function paint(frame) {
  const cells = Array.from({ length: GRID }, () => Array(GRID).fill(-1));
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < GRID && y < GRID) cells[y][x] = c;
  };
  const onRing = (x, y) => {
    const dx = x - 11.5;
    const dy = y - 11.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    return d > 8.4 && d < 11.2;
  };
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!onRing(x, y)) continue;
      const edge = x < 2 || y < 2 || x > 21 || y > 21;
      set(x, y, edge ? 2 : 1);
    }
  }
  switch (frame.shape) {
    case 'petal':
      for (const [cx, cy] of [[5, 5], [18, 5], [5, 18], [18, 18]]) set(cx, cy, 2);
      for (const [cx, cy] of [[4, 6], [6, 4], [17, 6], [19, 4], [4, 17], [6, 19], [17, 19], [19, 17]]) set(cx, cy, 1);
      break;
    case 'circuit':
      for (let i = 3; i < 9; i++) set(i, 2, 2);
      for (let i = 15; i < 21; i++) set(i, 21, 2);
      for (let i = 3; i < 9; i++) set(21, i, 1);
      for (let i = 15; i < 21; i++) set(2, i, 1);
      break;
    case 'arch':
      for (let y = 3; y < 9; y++) {
        set(11, y, 2);
        set(12, y, 2);
      }
      for (let x = 7; x < 17; x++) set(x, 2, 2);
      break;
    case 'stars':
      for (const [x, y] of [[4, 4], [19, 5], [6, 19], [17, 18], [11, 2], [2, 11], [21, 12]]) set(x, y, 2);
      break;
    case 'cat':
      for (const [x, y] of [[4, 0], [5, 0], [4, 1], [19, 0], [20, 0], [19, 1]]) set(x, y, 2);
      for (const [x, y] of [[9, 20], [10, 20], [13, 20], [14, 20], [9, 21], [14, 21], [11, 22], [12, 22]]) set(x, y, 1);
      break;
    default:
      break;
  }
  return cells;
}

function render(frame) {
  const cells = paint(frame);
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const palette = frame.palette.map((h) => hexToRgba(h));
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const idx = cells[cy][cx];
      if (idx < 0) continue;
      const [r, g, b, a] = palette[idx];
      for (let py = 0; py < CELL; py++) {
        for (let px = 0; px < CELL; px++) {
          const off = ((cy * CELL + py) * SIZE + (cx * CELL + px)) * 4;
          rgba[off] = r;
          rgba[off + 1] = g;
          rgba[off + 2] = b;
          rgba[off + 3] = a;
        }
      }
    }
  }
  return rgba;
}

function upscale(rgba, factor) {
  const out = Buffer.alloc(SIZE * factor * SIZE * factor * 4);
  for (let y = 0; y < SIZE * factor; y++) {
    for (let x = 0; x < SIZE * factor; x++) {
      const src = ((Math.floor(y / factor) * SIZE) + Math.floor(x / factor)) * 4;
      const dst = (y * SIZE * factor + x) * 4;
      rgba.copy(out, dst, src, src + 4);
    }
  }
  return out;
}

const outDir = join(process.cwd(), 'server', 'assets', 'frames');
mkdirSync(outDir, { recursive: true });

const catalog = [];
for (const frame of FRAMES) {
  const base = render(frame);
  for (const factor of [1, 2, 3]) {
    const data = factor === 1 ? base : upscale(base, factor);
    writeFileSync(join(outDir, `${frame.id}-${factor}x.png`), encodePNG(SIZE * factor, SIZE * factor, data));
  }
  catalog.push({
    frameId: frame.id,
    name: frame.name,
    price: frame.price,
    status: 'on_sale',
    assetPrefix: `/assets/frames/${frame.id}`,
    pixelSpec: { canvas: SIZE, grid: GRID, paletteMax: 16 },
    colors: frame.palette.length
  });
}

mkdirSync(join(process.cwd(), 'server', 'conf'), { recursive: true });
writeFileSync(join(process.cwd(), 'server', 'conf', 'frames.json'), JSON.stringify({ catalogVersion: 'catalog-v1', frames: catalog }, null, 2));
console.log(`generated ${FRAMES.length} frames (${FRAMES.length * 3} PNG) -> server/assets/frames`);