/**
 * ИНСТРУМЕНТАЛЬНЫЙ АУДИТ ДИЗАЙНА. Вьюпорт 390×844.
 *
 * Меряет ровно то, что в прошлый раз было заявлено без чисел:
 *
 *  1. КОНТРАСТ по WCAG 2.1. Для каждого текстового узла берётся вычисленный
 *     цвет и ФАКТИЧЕСКИЙ фон под ним — с композитингом полупрозрачных слоёв
 *     вверх по дереву. Иначе `rgba(240,234,221,.09)` на карточке считался бы
 *     как «нет фона» и цифра врала бы в свою пользу.
 *
 *  2. ДОЛЯ ПЛОЩАДИ АКЦЕНТА — по пикселям скриншота, а не по числу элементов.
 *     Считается доля пикселей, попадающих в золотой сектор HSL. Единственный
 *     способ проверить правило «акцент ≤10% площади» честно: элемент может
 *     быть один, но во весь экран.
 *
 *  3. ЗОНЫ НАЖАТИЯ ≥44px с учётом расширения псевдоэлементом ::after.
 *
 *  4. ВЫСОТА ЭКРАНА в прокрутках — для правила «не больше 3 экранов».
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.APP_URL ?? 'http://127.0.0.1:3000/';
const SHOTS = 'e2e/shots';
const VIEWPORT = { width: 390, height: 844 };

// ─────────────────────────────────────────── Контраст

/** Относительная яркость по WCAG 2.1. */
const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (fg, bg) => {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** Собирает пары «текст на фоне» прямо со страницы. */
const collectTextPairs = (page) =>
  page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };

    /** Композитит фон элемента вниз по предкам до первого непрозрачного. */
    const effectiveBg = (el) => {
      const layers = [];
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 0.999) break;
        }
        node = node.parentElement;
      }
      const root = parse(getComputedStyle(document.documentElement).backgroundColor);
      if (root && root.a > 0) layers.push(root);
      // Снизу вверх: базой считаем самый глубокий непрозрачный слой.
      let out = layers.length ? layers[layers.length - 1] : { r: 0, g: 0, b: 0, a: 1 };
      for (let i = layers.length - 2; i >= 0; i--) {
        const top = layers[i];
        out = {
          r: top.r * top.a + out.r * (1 - top.a),
          g: top.g * top.a + out.g * (1 - top.a),
          b: top.b * top.a + out.b * (1 - top.a),
          a: 1,
        };
      }
      return [Math.round(out.r), Math.round(out.g), Math.round(out.b)];
    };

    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('main *, header *, nav *')) {
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;

      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = effectiveBg(el);
      // Полупрозрачный текст композитим на его же фон.
      const fgc = [
        Math.round(fg.r * fg.a + bg[0] * (1 - fg.a)),
        Math.round(fg.g * fg.a + bg[1] * (1 - fg.a)),
        Math.round(fg.b * fg.a + bg[2] * (1 - fg.a)),
      ];

      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      // WCAG: крупным считается ≥24px, либо ≥18.66px при весе ≥700.
      const large = size >= 24 || (size >= 18.66 && weight >= 700);

      const key = `${fgc.join()}|${bg.join()}|${Math.round(size)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        sample: text.slice(0, 28),
        fg: fgc,
        bg,
        size: Math.round(size * 10) / 10,
        weight,
        large,
        cls: el.className.toString().slice(0, 28),
      });
    }
    return out;
  });

// ─────────────────────────────────────────── Доля акцента

const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
};

/**
 * Пиксель считается «золотым», если попадает в сектор акцента.
 *
 * Границы подобраны по самим токенам: gilt-700 #8a6d18 … gilt-300 #e8ce86.
 * Тёплый фон страницы (радиальные пятна ≤7% альфы) в сектор не попадает —
 * у него насыщенность заметно ниже порога, что проверено на пустом экране.
 */
const isAccent = (r, g, b) => {
  const [h, s, l] = rgbToHsl(r, g, b);
  return h >= 33 && h <= 56 && s >= 0.28 && l >= 0.18 && l <= 0.85;
};

const measureAccentShare = (buffer) => {
  const png = PNG.sync.read(buffer);
  let accent = 0;
  const total = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    if (isAccent(png.data[i], png.data[i + 1], png.data[i + 2])) accent++;
  }
  return { share: accent / total, width: png.width, height: png.height };
};

// ─────────────────────────────────────────── Зоны нажатия и высота

const auditLayout = (page) =>
  page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('button, a, input, [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      let h = r.height;
      let w = r.width;
      const after = getComputedStyle(el, '::after');
      if (after.content !== 'none') {
        h = Math.max(h, parseFloat(after.height) || 0);
        w = Math.max(w, parseFloat(after.width) || 0);
      }
      if (h < 44 || w < 44) {
        small.push(`${el.tagName}.${el.className.toString().slice(0, 24)} ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return {
      small,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      navPosition: getComputedStyle(document.querySelector('nav.app-nav') ?? document.body).position,
      docHeight: document.documentElement.scrollHeight,
    };
  });

// ─────────────────────────────────────────── Прогон

const SCREENS = [
  ['Сегодня', 'today'],
  ['Фолиант', 'habits'],
  ['Квесты', 'quests'],
  ['Лавка', 'shop'],
  ['Герой', 'character'],
];

const main = async () => {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });

  // Онбординг и немного истории, чтобы экраны не были пустыми.
  await page.getByLabel('Имя героя').fill('Артур');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /^Дальше/ }).first().click();
    await page.waitForTimeout(450);
  }
  await page.getByRole('button', { name: /Принять/ }).click();
  await page.waitForSelector('.app-nav', { timeout: 25000 });
  await page.waitForTimeout(900);

  for (let i = 0; i < 4; i++) {
    const t = page.getByRole('button', { name: 'Отметить выполнение' });
    if (!(await t.count())) break;
    await t.first().click();
    await page.waitForTimeout(320);
  }
  // Наполняем лавку и кошелёк, иначе половина экрана — пустое состояние.
  await page.getByRole('button', { name: /Лавка/ }).click();
  await page.waitForTimeout(700);
  const starter = page.getByRole('button', { name: /Взять набор/ });
  if (await starter.count()) {
    await starter.click();
    await page.waitForTimeout(2500);
  }
  await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('life-rpg');
      r.onsuccess = () => res(r.result);
    });
    const day = new Date().toISOString().slice(0, 10);
    await new Promise((res) => {
      const tx = db.transaction('ledger', 'readwrite');
      tx.objectStore('ledger').put({
        id: `milestone|audit|${day}|0`,
        kind: 'milestone',
        day,
        refId: 'audit',
        seq: 0,
        xp: 4200,
        baseXp: 0,
        gold: 2600,
        attribute: null,
        hp: 0,
        crit: false,
        consumable: null,
        cosmeticId: null,
        unlocksLocationId: null,
        createdAt: Date.now(),
      });
      tx.oncomplete = () => res();
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.app-nav', { timeout: 20000 });
  await page.waitForTimeout(1200);

  const report = [];
  let failures = 0;

  for (const [tab, slug] of SCREENS) {
    await page.getByRole('button', { name: new RegExp(tab) }).click();
    await page.waitForTimeout(800);

    // Снимок ровно во вьюпорт — доля площади считается от видимого экрана.
    const viewShot = await page.screenshot();
    const accent = measureAccentShare(viewShot);
    // Доля по всей странице тоже важна: во вьюпорт попадает верх экрана,
    // а заливка может копиться ниже — как ряд золотых кнопок в лавке.
    const fullShot = await page.screenshot({ path: `${SHOTS}/audit-${slug}.png`, fullPage: true });
    const accentFull = measureAccentShare(fullShot);

    const pairs = await collectTextPairs(page);
    const layout = await auditLayout(page);

    const withRatio = pairs
      .map((p) => ({ ...p, ratio: Math.round(contrast(p.fg, p.bg) * 100) / 100 }))
      .map((p) => ({ ...p, need: p.large ? 3.0 : 4.5 }))
      .map((p) => ({ ...p, pass: p.ratio >= p.need }));

    const failing = withRatio.filter((p) => !p.pass).sort((a, b) => a.ratio - b.ratio);
    const minRatio = withRatio.length ? Math.min(...withRatio.map((p) => p.ratio)) : 0;
    const screens = layout.docHeight / VIEWPORT.height;

    const accentPct = Math.round(accent.share * 1000) / 10;
    const accentFullPct = Math.round(accentFull.share * 1000) / 10;
    const ok =
      failing.length === 0 &&
      accent.share <= 0.1 &&
      accentFull.share <= 0.1 &&
      layout.small.length === 0 &&
      !layout.hScroll &&
      layout.navPosition === 'fixed';
    if (!ok) failures++;

    report.push({ tab, slug, pairs: withRatio, failing, minRatio, accentPct, accentFullPct, layout, screens });

    console.log(`\n── ${tab} ──`);
    console.log(`  контраст: минимум ${minRatio}:1, проверено пар ${withRatio.length}, провалов ${failing.length}`);
    for (const f of failing.slice(0, 6)) {
      console.log(
        `    FAIL ${f.ratio}:1 (нужно ${f.need}) ${f.size}px «${f.sample}» .${f.cls}`,
      );
    }
    console.log(
      `  акцент: ${accentPct}% вьюпорта, ${accentFullPct}% всей страницы` +
        `${accent.share <= 0.1 && accentFull.share <= 0.1 ? '' : '  ← ПРЕВЫШЕН'}`,
    );
    console.log(`  высота: ${layout.docHeight}px = ${screens.toFixed(1)} экрана`);
    console.log(`  зоны <44px: ${layout.small.length}${layout.small.length ? ' — ' + layout.small.slice(0, 3).join('; ') : ''}`);
    console.log(`  навигация: ${layout.navPosition}, горизонтальный скролл: ${layout.hScroll ? 'ЕСТЬ' : 'нет'}`);
  }

  writeFileSync('e2e/design-audit.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n=== Экранов с замечаниями: ${failures} из ${SCREENS.length} ===`);
  console.log('Полный отчёт: e2e/design-audit.json');
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
