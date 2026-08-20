/**
 * Генерирует иконки PWA без внешних зависимостей: пишет минимальные PNG
 * вручную (zlib из node:zlib), рисуя восковую печать на тёмном фоне.
 *
 * Запуск: node scripts/generateIcons.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
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

function png(width, pixels, heightArg) {
  const height = heightArg ?? width;
  const size = width;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // глубина
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (size * 4 + 1)] = 0; // фильтр none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Рисует золотую печать с монограммой на тёмном фоне. */
function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const sealR = size * (maskable ? 0.3 : 0.38);

  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);

      // Фон: тёмный переплёт с мягким золотым свечением сверху.
      const glow = Math.max(0, 1 - Math.hypot(dx, dy + size * 0.25) / (size * 0.8));
      let r = 13 + glow * 34;
      let g = 11 + glow * 26;
      let b = 8 + glow * 10;
      let a = 255;

      // Внешнее золотое кольцо.
      const ringOuter = sealR * 1.22;
      const ringInner = sealR * 1.1;
      if (d <= ringOuter && d >= ringInner) {
        const t = (d - ringInner) / (ringOuter - ringInner);
        r = 212 + (1 - t) * 40;
        g = 164 + (1 - t) * 55;
        b = 65 + (1 - t) * 55;
      }

      // Восковая печать с бликом сверху слева.
      if (d <= sealR) {
        const shade = Math.max(0, 1 - Math.hypot(dx + sealR * 0.3, dy + sealR * 0.35) / (sealR * 1.5));
        r = 118 + shade * 110;
        g = 42 + shade * 55;
        b = 30 + shade * 40;

        // Монограмма: вертикальная черта с перекладиной — стилизованный меч.
        const bladeW = sealR * 0.11;
        const inBlade = Math.abs(dx) < bladeW && dy > -sealR * 0.62 && dy < sealR * 0.6;
        const inGuard = Math.abs(dy - sealR * 0.1) < bladeW * 0.85 && Math.abs(dx) < sealR * 0.4;
        const inPommel = Math.hypot(dx, dy - sealR * 0.62) < sealR * 0.11;
        if (inBlade || inGuard || inPommel) {
          r = 246;
          g = 223;
          b = 160;
        }
      }

      set(x, y, Math.round(r), Math.round(g), Math.round(b), a);
    }
  }
  return px;
}

/*
  Полный набор размеров.

  192 и 512 — обязательный минимум манифеста. 180 — apple-touch-icon для
  iOS. 152/167 — iPad (не целевое устройство, но стоят копейки и снимают
  размытие, если приложение однажды откроют там). 96/48/32 — ярлыки и
  вкладки. Maskable-вариант отдельным файлом: у него безопасная зона
  меньше, и обычная иконка в маске обрезалась бы по печати.
*/
const targets = [
  { file: 'icon-32.png', size: 32, maskable: false },
  { file: 'icon-48.png', size: 48, maskable: false },
  { file: 'icon-96.png', size: 96, maskable: false },
  { file: 'icon-120.png', size: 120, maskable: false },
  { file: 'icon-152.png', size: 152, maskable: false },
  { file: 'icon-167.png', size: 167, maskable: false },
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-384.png', size: 384, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const t of targets) {
  writeFileSync(resolve(outDir, t.file), png(t.size, draw(t.size, t.maskable)));
  console.log(`✓ public/icons/${t.file} (${t.size}×${t.size})`);
}

/**
 * СПЛЭШ-ЭКРАНЫ iOS.
 *
 * Safari показывает белый экран между тапом по ярлыку и первым кадром,
 * если для точного разрешения устройства нет `apple-touch-startup-image`.
 * Белая вспышка в тёмном приложении заметна и выглядит поломкой, поэтому
 * набор перекрывает все актуальные размеры iPhone: при несовпадении
 * медиазапроса iOS просто ничего не покажет и вернётся к белому.
 *
 * Размеры — физические пиксели портретной ориентации.
 */
const splashes = [
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 }, // 15/14 Pro Max, 16 Plus
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 }, // 15/14 Pro, 16
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3 }, // 13/12 Pro Max
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 }, // 13/12/14
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 }, // X/XS/11 Pro
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3 }, // XS Max/11 Pro Max
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 },  // XR/11
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 },  // SE 2/3, 8
  { w: 640, h: 1136, dw: 320, dh: 568, dpr: 2 },  // SE 1
];

/** Тот же герб по центру тёмного полотна произвольных пропорций. */
function drawSplash(width, height) {
  const px = Buffer.alloc(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const sealR = Math.min(width, height) * 0.16;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);

      const glow = Math.max(0, 1 - Math.hypot(dx, dy + height * 0.12) / (Math.min(width, height) * 0.9));
      let r = 11 + glow * 30;
      let g = 10 + glow * 23;
      let b = 8 + glow * 9;

      const ringOuter = sealR * 1.22;
      const ringInner = sealR * 1.1;
      if (d <= ringOuter && d >= ringInner) {
        const t = (d - ringInner) / (ringOuter - ringInner);
        r = 212 + (1 - t) * 40;
        g = 164 + (1 - t) * 55;
        b = 65 + (1 - t) * 55;
      }

      if (d <= sealR) {
        const shade = Math.max(0, 1 - Math.hypot(dx + sealR * 0.3, dy + sealR * 0.35) / (sealR * 1.5));
        r = 118 + shade * 110;
        g = 42 + shade * 55;
        b = 30 + shade * 40;

        const bladeW = sealR * 0.11;
        const inBlade = Math.abs(dx) < bladeW && dy > -sealR * 0.62 && dy < sealR * 0.6;
        const inGuard = Math.abs(dy - sealR * 0.1) < bladeW * 0.85 && Math.abs(dx) < sealR * 0.4;
        const inPommel = Math.hypot(dx, dy - sealR * 0.62) < sealR * 0.11;
        if (inBlade || inGuard || inPommel) {
          r = 246;
          g = 223;
          b = 160;
        }
      }

      const i = (y * width + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = 255;
    }
  }
  return px;
}

const splashDir = resolve(root, 'public/splash');
mkdirSync(splashDir, { recursive: true });

const links = [];
for (const s of splashes) {
  const file = `splash-${s.w}x${s.h}.png`;
  writeFileSync(resolve(splashDir, file), png(s.w, drawSplash(s.w, s.h), s.h));
  links.push(
    `    <link rel="apple-touch-startup-image" href="./splash/${file}" ` +
      `media="(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and ` +
      `(-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)" />`,
  );
  console.log(`✓ public/splash/${file}`);
}

const NL = String.fromCharCode(10);
writeFileSync(resolve(root, 'scripts/splash-links.html'), links.join(NL) + NL);
console.log(NL + 'Теги для index.html записаны в scripts/splash-links.html');

// Favicon как SVG — маленький и чёткий на любом масштабе.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0d0b08"/>
  <circle cx="32" cy="32" r="25" fill="none" stroke="#d4a441" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="21" fill="#a03a29"/>
  <path d="M32 17v30M23 34h18M32 15.5a2.4 2.4 0 1 1 0 .01" stroke="#f6dfa0" stroke-width="3.4" stroke-linecap="round" fill="none"/>
</svg>
`;
writeFileSync(resolve(root, 'public/favicon.svg'), favicon);
console.log('✓ public/favicon.svg');
