/**
 * Общие измерители для аудитов. Держатся отдельно, потому что ими пользуются
 * три скрипта, и расхождение в методике замера обесценило бы сравнение чисел.
 */
import { PNG } from 'pngjs';

// ─────────────────────────────────────────── Контраст WCAG 2.1

export const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const contrast = (fg, bg) => {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/**
 * Собирает пары «текст на фоне» со страницы с композитингом полупрозрачных
 * слоёв вверх по дереву. Без композитинга rgba-фон карточки считался бы
 * отсутствующим, и коэффициент врал бы в свою пользу.
 *
 * `scope` позволяет мерить только внутри модального листа.
 */
export const collectTextPairs = (page, scope = 'main *, header *, nav *') =>
  page.evaluate((sel) => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };

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
    for (const el of document.querySelectorAll(sel)) {
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
      const fgc = [
        Math.round(fg.r * fg.a + bg[0] * (1 - fg.a)),
        Math.round(fg.g * fg.a + bg[1] * (1 - fg.a)),
        Math.round(fg.b * fg.a + bg[2] * (1 - fg.a)),
      ];

      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);

      const key = `${fgc.join()}|${bg.join()}|${Math.round(size)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        sample: text.slice(0, 30),
        fg: fgc,
        bg,
        size: Math.round(size * 10) / 10,
        weight,
        large,
        cls: el.className.toString().slice(0, 30),
      });
    }
    return out;
  }, scope);

/** Добавляет коэффициент, порог и вердикт к каждой паре. */
export const withRatios = (pairs) =>
  pairs
    .map((p) => ({ ...p, ratio: Math.round(contrast(p.fg, p.bg) * 100) / 100 }))
    .map((p) => ({ ...p, need: p.large ? 3.0 : 4.5 }))
    .map((p) => ({ ...p, pass: p.ratio >= p.need }));

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

/** Золотой сектор по токенам: gilt-700 #8a6d18 … gilt-300 #e8ce86. */
export const isAccent = (r, g, b) => {
  const [h, s, l] = rgbToHsl(r, g, b);
  return h >= 33 && h <= 56 && s >= 0.28 && l >= 0.18 && l <= 0.85;
};

export const measureAccentShare = (buffer) => {
  const png = PNG.sync.read(buffer);
  let accent = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (isAccent(png.data[i], png.data[i + 1], png.data[i + 2])) accent++;
  }
  return { share: accent / (png.width * png.height), width: png.width, height: png.height };
};

// ─────────────────────────────────────────── Раскладка

export const auditLayout = (page) =>
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
        small.push(
          `${el.tagName}.${el.className.toString().slice(0, 24)} ${Math.round(w)}×${Math.round(h)}`,
        );
      }
    }
    return {
      small,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      navPosition: getComputedStyle(document.querySelector('nav.app-nav') ?? document.body).position,
      docHeight: document.documentElement.scrollHeight,
    };
  });

// ─────────────────────────────────────────── Управление состоянием

/**
 * Пишет запись в журнал напрямую и перезагружает страницу.
 *
 * Это единственный законный способ изменить экономику: приложение выводит
 * уровень, золото, HP и инвентарь свёрткой журнала, и запись сюда —
 * ровно то, что делает движок.
 */
export const pushLedger = async (page, patch) => {
  await page.evaluate(async (p) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('life-rpg');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const day = new Date().toISOString().slice(0, 10);
    await new Promise((res, rej) => {
      const tx = db.transaction('ledger', 'readwrite');
      tx.objectStore('ledger').put({
        id: `${p.kind ?? 'milestone'}|${p.refId}|${day}|0`,
        kind: p.kind ?? 'milestone',
        day,
        refId: p.refId,
        seq: 0,
        xp: p.xp ?? 0,
        baseXp: 0,
        gold: p.gold ?? 0,
        attribute: null,
        hp: p.hp ?? 0,
        crit: false,
        consumable: null,
        cosmeticId: null,
        unlocksLocationId: null,
        createdAt: Date.now(),
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }, patch);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.app-nav', { timeout: 20000 });
  await page.waitForTimeout(900);
};

export const readCharacter = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('life-rpg');
      r.onsuccess = () => res(r.result);
    });
    return new Promise((res) => {
      const q = db.transaction('characters').objectStore('characters').get('me');
      q.onsuccess = () => res(q.result);
    });
  });

export const hpStageOf = (page) =>
  page.evaluate(() => document.documentElement.dataset.hpStage ?? 'unknown');

/**
 * Проходит онбординг до основного интерфейса.
 *
 * Четыре экрана: пробуждение (имя) → привычки → награды → правила Системы.
 * Кнопка «Дальше» одна и та же на первых трёх, поэтому шаги отсчитываются,
 * а не ищутся по подписи.
 */
export const passOnboarding = async (page, name = 'Артур') => {
  const nameField = page.getByLabel('Имя героя');
  await nameField.waitFor({ timeout: 20000 });
  await nameField.fill(name);

  for (let i = 0; i < 3; i++) {
    const next = page.getByRole('button', { name: /^Дальше/ }).first();
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(500);
  }

  const accept = page.getByRole('button', { name: /Принять/ });
  if (await accept.count()) await accept.first().click();

  await page.waitForSelector('.app-nav', { timeout: 25000 });
  await page.waitForTimeout(900);
};
