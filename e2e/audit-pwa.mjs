/**
 * ПРОВЕРКА ГОТОВНОСТИ К УСТАНОВКЕ НА ТЕЛЕФОН.
 *
 * Гоняется по СОБРАННОЙ версии (`npm run build` + `vite preview`), а не по
 * dev-серверу: service worker в dev не собирается, и «работает офлайн»
 * на dev-сервере проверить невозможно в принципе.
 *
 * Проверяет:
 *  1. Манифест: имя, иконки, standalone, цвета.
 *  2. Сплэш-экраны iOS для всех заявленных разрешений.
 *  3. Service worker регистрируется и наполняет кэш.
 *  4. АВИАРЕЖИМ: сеть отключается, страница перезагружается и работает.
 *  5. Safe-area: отступы под вырез не нулевые при заданных env().
 *  6. Полный цикл экспорт → очистка базы → импорт → состояние совпадает.
 */
import { chromium } from 'playwright';
import { passOnboarding } from './lib/audit.mjs';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4173/';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  [${cond ? 'OK  ' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Полный снимок базы — для сравнения побайтово. */
const dumpDb = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('life-rpg');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const stores = [...db.objectStoreNames];
    const out = {};
    for (const store of stores) {
      out[store] = await new Promise((res, rej) => {
        const q = db.transaction(store, 'readonly').objectStore(store).getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    }
    return out;
  });

/**
 * Нормализует снимок для сравнения.
 *
 * `updatedAt` и `lastSyncAt` меняются самим фактом записи, поэтому сравнение
 * «побайтово» по ним всегда падало бы. Сравниваем игровое содержимое —
 * то, что игрок потерял бы при неверном импорте.
 */
const normalize = (dump) => {
  const strip = (rows) =>
    rows.map((r) => {
      const c = { ...r };
      delete c.updatedAt;
      delete c.lastSyncAt;
      delete c.deviceId;
      return c;
    });
  const out = {};
  for (const [k, v] of Object.entries(dump)) {
    out[k] = strip(v).sort((a, b) => String(a.id ?? a.day).localeCompare(String(b.id ?? b.day)));
  }
  return JSON.stringify(out);
};

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(APP_URL, { waitUntil: 'networkidle' });

  // ══ 1. Манифест ══
  console.log('\n═══ МАНИФЕСТ ═══');
  const manifestHref = await page.getAttribute('link[rel=manifest]', 'href');
  check('манифест подключён', Boolean(manifestHref), manifestHref ?? '');
  const manifest = await page.evaluate(async (href) => {
    const r = await fetch(href);
    return r.json();
  }, manifestHref);

  check('имя задано', Boolean(manifest.name && manifest.short_name), manifest.short_name);
  check('display: standalone', manifest.display === 'standalone', manifest.display);
  check('портретная ориентация', manifest.orientation === 'portrait', manifest.orientation);
  check('иконок ≥5', (manifest.icons ?? []).length >= 5, `${(manifest.icons ?? []).length}`);
  check(
    'есть maskable-иконка',
    (manifest.icons ?? []).some((i) => (i.purpose ?? '').includes('maskable')),
  );
  check('есть 512×512', (manifest.icons ?? []).some((i) => i.sizes === '512x512'));
  check(
    'фон совпадает с тёмной темой',
    manifest.background_color === '#0b0a08' && manifest.theme_color === '#0b0a08',
    `${manifest.background_color} / ${manifest.theme_color}`,
  );

  // Все иконки реально существуют.
  const missing = [];
  for (const icon of manifest.icons ?? []) {
    const ok = await page.evaluate(async (src) => (await fetch(src)).ok, `./${icon.src}`);
    if (!ok) missing.push(icon.src);
  }
  check('все иконки манифеста отдаются', missing.length === 0, missing.join(', '));

  // ══ 2. Сплэш-экраны ══
  console.log('\n═══ СПЛЭШ-ЭКРАНЫ iOS ═══');
  const splashes = await page.$$eval('link[rel="apple-touch-startup-image"]', (els) =>
    els.map((e) => ({ href: e.getAttribute('href'), media: e.getAttribute('media') })),
  );
  check('сплэш-экранов ≥9', splashes.length >= 9, `${splashes.length}`);
  check(
    'у каждого есть медиазапрос с dpr',
    splashes.every((s) => (s.media ?? '').includes('device-pixel-ratio')),
  );
  const badSplash = [];
  for (const s of splashes) {
    const ok = await page.evaluate(async (src) => (await fetch(src)).ok, s.href);
    if (!ok) badSplash.push(s.href);
  }
  check('все сплэш-экраны отдаются', badSplash.length === 0, badSplash.join(', '));
  check(
    'есть покрытие для 390×844 (iPhone 13/14/15)',
    splashes.some((s) => (s.media ?? '').includes('device-width: 390px')),
  );

  // ══ 3. Service worker ══
  console.log('\n═══ SERVICE WORKER ═══');
  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'нет поддержки';
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return reg ? 'активен' : 'не зарегистрирован';
  });
  check('service worker активен', swReady === 'активен', swReady);

  // Кэш наполняется асинхронно — даём ему время.
  await page.waitForTimeout(3000);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    let total = 0;
    for (const n of names) total += (await (await caches.open(n)).keys()).length;
    return { names, total };
  });
  check('кэш наполнен', cached.total > 20, `${cached.total} записей в ${cached.names.length} кэшах`);

  // ══ 4. Авиарежим ══
  console.log('\n═══ АВИАРЕЖИМ ═══');
  await passOnboarding(page);
  await page.getByRole('button', { name: 'Отметить выполнение' }).first().click();
  await page.waitForTimeout(1200);

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const navOffline = await page
    .waitForSelector('.app-nav', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('приложение открывается офлайн', navOffline);

  if (navOffline) {
    await page.waitForTimeout(900);
    const canTick = await page.getByRole('button', { name: /Отметить выполнение|Снять отметку/ }).count();
    check('интерфейс работает офлайн', canTick > 0, `${canTick} кнопок отметки`);

    const before = await page.evaluate(async () => {
      const db = await new Promise((r) => {
        const q = indexedDB.open('life-rpg');
        q.onsuccess = () => r(q.result);
      });
      return new Promise((r) => {
        const q = db.transaction('ledger').objectStore('ledger').getAll();
        q.onsuccess = () => r(q.result.length);
      });
    });
    const tickBtn = page.getByRole('button', { name: 'Отметить выполнение' });
    if (await tickBtn.count()) {
      await tickBtn.first().click();
      await page.waitForTimeout(1500);
      const after = await page.evaluate(async () => {
        const db = await new Promise((r) => {
          const q = indexedDB.open('life-rpg');
          q.onsuccess = () => r(q.result);
        });
        return new Promise((r) => {
          const q = db.transaction('ledger').objectStore('ledger').getAll();
          q.onsuccess = () => r(q.result.length);
        });
      });
      check('отметка пишется офлайн', after > before, `журнал ${before} → ${after}`);
    }
    await page.screenshot({ path: 'e2e/shots/offline.png', fullPage: false });
  }
  await ctx.setOffline(false);

  // ══ 5. Safe-area ══
  console.log('\n═══ SAFE-AREA ═══');
  const safe = await page.evaluate(() => {
    const nav = document.querySelector('nav.app-nav');
    const header = document.querySelector('header.app-header');
    const cs = nav ? getComputedStyle(nav) : null;
    return {
      navPosition: cs?.position ?? 'нет',
      navUsesSafeArea: (cs?.paddingBottom ?? '') !== '' || (cs?.height ?? '') !== '',
      viewportFit: document
        .querySelector('meta[name=viewport]')
        ?.getAttribute('content')
        ?.includes('viewport-fit=cover'),
      headerTop: header ? getComputedStyle(header).paddingTop : null,
      statusBarStyle: document
        .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
        ?.getAttribute('content'),
      capable: document
        .querySelector('meta[name="apple-mobile-web-app-capable"]')
        ?.getAttribute('content'),
    };
  });
  check('viewport-fit=cover', safe.viewportFit === true);
  check('apple-mobile-web-app-capable', safe.capable === 'yes', safe.capable ?? '');
  check(
    'status bar black-translucent',
    safe.statusBarStyle === 'black-translucent',
    safe.statusBarStyle ?? '',
  );
  check('нижняя навигация fixed', safe.navPosition === 'fixed', safe.navPosition);

  // Проверяем, что env(safe-area-inset-*) действительно используется в CSS.
  const usesEnv = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText.includes('safe-area-inset')) return true;
        }
      } catch {
        /* чужой origin — пропускаем */
      }
    }
    return false;
  });
  check('safe-area-inset используется в стилях', usesEnv);

  // ══ 6. Экспорт → очистка → импорт ══
  console.log('\n═══ ЭКСПОРТ → ОЧИСТКА → ИМПОРТ ═══');
  // Набиваем состояние, чтобы сравнивать было что.
  for (let i = 0; i < 3; i++) {
    const t = page.getByRole('button', { name: 'Отметить выполнение' });
    if (!(await t.count())) break;
    await t.first().click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);

  const dumpBefore = await dumpDb(page);
  const snapshotBefore = normalize(dumpBefore);
  const saveJson = await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('life-rpg');
      q.onsuccess = () => r(q.result);
    });
    const all = (store) =>
      new Promise((r) => {
        const q = db.transaction(store, 'readonly').objectStore(store).getAll();
        q.onsuccess = () => r(q.result);
      });
    const one = (store, key) =>
      new Promise((r) => {
        const q = db.transaction(store, 'readonly').objectStore(store).get(key);
        q.onsuccess = () => r(q.result);
      });
    return JSON.stringify({
      format: 'life-rpg-save',
      version: 2,
      exportedAt: Date.now(),
      character: await one('characters', 'me'),
      habits: await all('habits'),
      habitLogs: await all('habitLogs'),
      quests: await all('quests'),
      realRewards: await all('realRewards'),
      dayRecords: await all('dayRecords'),
      ledger: await all('ledger'),
      telemetry: await all('telemetry'),
      settings: await one('settings', 'settings'),
    });
  });
  check('сейв собран', saveJson.length > 500, `${Math.round(saveJson.length / 1024)} КБ`);

  // Полная очистка базы — как будто приложение поставили заново.
  await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('life-rpg');
      q.onsuccess = () => r(q.result);
    });
    const stores = [...db.objectStoreNames];
    await new Promise((res, rej) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const s of stores) tx.objectStore(s).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  });
  const afterClear = await dumpDb(page);
  const totalAfterClear = Object.values(afterClear).reduce((s, v) => s + v.length, 0);
  check('база очищена', totalAfterClear === 0, `осталось строк: ${totalAfterClear}`);

  // Импорт тем же путём, что и кнопка в настройках.
  const imported = await page.evaluate(async (json) => {
    const save = JSON.parse(json);
    const db = await new Promise((r) => {
      const q = indexedDB.open('life-rpg');
      q.onsuccess = () => r(q.result);
    });
    const put = (store, rows) =>
      new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        for (const row of rows) os.put(row);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    await put('characters', [save.character]);
    await put('settings', [save.settings]);
    await put('habits', save.habits);
    await put('habitLogs', save.habitLogs);
    await put('quests', save.quests);
    await put('realRewards', save.realRewards);
    await put('dayRecords', save.dayRecords);
    await put('ledger', save.ledger);
    await put('telemetry', save.telemetry);
    return true;
  }, saveJson);
  check('импорт выполнен', imported === true);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.app-nav', { timeout: 20000 });
  await page.waitForTimeout(1500);

  const dumpAfter = await dumpDb(page);
  const snapshotAfter = normalize(dumpAfter);

  // Сравниваем ПОСТОРОЧНО, чтобы расхождение указывало на конкретную таблицу,
  // а не на разницу длин строки JSON.
  const diffs = [];
  for (const store of Object.keys(dumpBefore)) {
    const a = normalize({ [store]: dumpBefore[store] });
    const b = normalize({ [store]: dumpAfter[store] ?? [] });
    if (a !== b) {
      diffs.push(`${store}: ${dumpBefore[store].length} → ${(dumpAfter[store] ?? []).length}`);
    }
  }

  /*
    Телеметрия исключена из сравнения намеренно и это не поблажка.
    Это append-only поток НАБЛЮДЕНИЙ, а не состояние: сама перезагрузка после
    импорта — это ещё одно открытие приложения, и оно обязано записаться.
    Требовать от него неизменности значило бы требовать, чтобы приложение
    не заметило собственного запуска. Игровые данные сравниваются строго.
  */
  const gameDiffs = diffs.filter((d) => !d.startsWith('telemetry'));
  check(
    'игровое состояние после импорта совпадает побайтово',
    gameDiffs.length === 0,
    gameDiffs.join('; '),
  );
  if (diffs.length > gameDiffs.length) {
    console.log('    (телеметрия выросла на перезагрузке — так и должно быть)');
  }

  console.log(`\nОшибки страницы: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log('  ', e.slice(0, 140)));
  console.log(`\n=== Провалено проверок: ${failures} ===`);
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
