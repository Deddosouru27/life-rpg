/**
 * Семь сценариев приёмки из CLAUDE.md, мобильный вьюпорт 390×844.
 *
 * Скрипт не заменяет просмотр глазами — он делает снимки каждого экрана и
 * проверяет ЧИСЛА, которые глазами не проверить: что откат вернул состояние
 * побайтово. Снимки лежат в e2e/shots/.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.APP_URL ?? 'http://127.0.0.1:3000/';
const SHOTS = 'e2e/shots';

let failures = 0;
const check = (name, cond, detail = '') => {
  const mark = cond ? 'OK  ' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Ждёт, пока приложение допишет журнал: readState читает отдельным соединением. */
const settle = async (page, ms = 1400) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};

const readState = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('life-rpg');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const one = (store, key) =>
      new Promise((res, rej) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).get(key);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    const all = (store) =>
      new Promise((res, rej) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).getAll();
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    const c = await one('characters', 'me');
    const ledger = await all('ledger');
    const telemetry = await all('telemetry');
    return {
      level: c.level,
      xp: c.xp,
      gold: c.gold,
      hp: c.hp,
      attributes: c.attributes,
      completions: c.stats.totalCompletions,
      ledgerSize: ledger.length,
      telemetrySize: telemetry.length,
    };
  });

/**
 * Читает состояние, пока оно не перестанет меняться.
 *
 * Фиксированного ожидания недостаточно: цепочка «патч журнала → запись
 * персонажа → reload» асинхронна, а readState открывает СВОЁ соединение с
 * IndexedDB и видит промежуточные состояния. Из-за этого базовый снимок
 * оказывался снят до того, как долетели покупки, и сравнение «побайтово»
 * падало на разнице, которой в приложении не было.
 */
const readStable = async (page, tries = 12) => {
  let prev = await readState(page);
  for (let i = 0; i < tries; i++) {
    await page.waitForTimeout(400);
    const next = await readState(page);
    if (JSON.stringify({ ...prev, telemetrySize: 0 }) === JSON.stringify({ ...next, telemetrySize: 0 })) {
      return next;
    }
    prev = next;
  }
  return prev;
};

/** Ждёт, пока указанное поле изменится, либо сдаётся. */
const waitForChange = async (page, field, from, tries = 15) => {
  for (let i = 0; i < tries; i++) {
    const st = await readState(page);
    if (st[field] !== from) return st;
    await page.waitForTimeout(400);
  }
  return readState(page);
};

const same = (a, b) =>
  a.level === b.level &&
  a.xp === b.xp &&
  a.gold === b.gold &&
  a.hp === b.hp &&
  a.completions === b.completions &&
  JSON.stringify(a.attributes) === JSON.stringify(b.attributes);

/** Закрывает любой открытый лист — иначе он перехватывает клики по навигации. */
const closeAnySheet = async (page) => {
  for (let i = 0; i < 3; i++) {
    if ((await page.locator('[role=dialog]').count()) === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  const backdrop = page.locator('[role=dialog]').locator('xpath=..');
  await backdrop.click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(300);
};

/** Переход на вкладку: сначала закрываем лист, иначе он перехватит клик. */
const goTab = async (page, name) => {
  await closeAnySheet(page);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForTimeout(650);
};

/**
 * Начисляет золото ЧЕРЕЗ ЖУРНАЛ — единственный законный способ.
 * Нужно, чтобы проверить покупку при достатке золота: честным путём
 * 3000 золота копятся полтора месяца.
 */
const grantGold = async (page, amount) => {
  await page.evaluate(async (gold) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('life-rpg');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const day = new Date().toISOString().slice(0, 10);
    await new Promise((res, rej) => {
      const tx = db.transaction('ledger', 'readwrite');
      tx.objectStore('ledger').put({
        id: `milestone|e2e-grant|${day}|0`,
        kind: 'milestone',
        day,
        refId: 'e2e-grant',
        seq: 0,
        xp: 0,
        baseXp: 0,
        gold,
        attribute: null,
        hp: 0,
        crit: false,
        consumable: null,
        cosmeticId: null,
        unlocksLocationId: null,
        createdAt: Date.now(),
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }, amount);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.app-nav', { timeout: 20000 });
  await page.waitForTimeout(1000);
};

const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

/** Собирает весь видимый текст экрана — для чтения надписей глазами. */
const visibleText = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('main *, header *, nav *'))
      .filter((el) => el.children.length === 0 && el.textContent.trim())
      .map((el) => el.textContent.trim())
      .filter((t, i, a) => a.indexOf(t) === i),
  );

/** Проверяет, что все интерактивные зоны не меньше 44px и нет горизонтального скролла. */
const auditLayout = (page) =>
  page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('button, a, input, [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // `.link-action` расширяет зону нажатия псевдоэлементом ::after до
      // 44px — собственный бокс кнопки при этом остаётся маленьким.
      // Мерить надо фактическую область касания.
      let h = r.height;
      let w = r.width;
      if (el.classList.contains('link-action')) {
        const after = getComputedStyle(el, '::after');
        h = Math.max(h, parseFloat(after.height) || 0);
        w = Math.max(w, parseFloat(after.width) || 0);
      }
      if (h < 44 || w < 44) {
        small.push(`${el.tagName}.${el.className.toString().slice(0, 30)} ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return {
      small,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      navFixed: getComputedStyle(document.querySelector('nav.app-nav') ?? document.body).position,
    };
  });

const main = async () => {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: 'networkidle' });

  // ── Онбординг: пробуждение → привычки → награды → правила Системы
  await page.getByLabel('Имя героя').fill('Артур');
  await page.getByRole('button', { name: /^Дальше/ }).first().click();
  await page.waitForTimeout(500);
  await shot(page, '00-onboarding-habits');
  await page.getByRole('button', { name: /^Дальше/ }).first().click();
  await page.waitForTimeout(500);
  await shot(page, '00b-onboarding-rewards');
  await page.getByRole('button', { name: /^Дальше/ }).first().click();
  await page.waitForTimeout(500);
  await shot(page, '00c-onboarding-system');
  await page.getByRole('button', { name: /Принять/ }).click();
  await page.waitForSelector('.app-nav', { timeout: 25000 });
  await page.waitForTimeout(900);
  await shot(page, '01-today-empty');

  // ═══ СЦЕНАРИЙ 1: отметить → откатить → отметить → откатить
  console.log('\nСЦЕНАРИЙ 1 — отметить / откатить, состояние возвращается');
  const s1before = await readStable(page);
  console.log('  исходное:', JSON.stringify(s1before));

  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.getByRole('button', { name: 'Отметить выполнение' }).first().click();
    await page.waitForTimeout(500);
    const marked = await readState(page);
    check(`цикл ${cycle}: отметка начислила XP`, marked.xp > s1before.xp || marked.level > s1before.level);

    await page
      .getByRole('button', { name: /^Снять отметку/ })
      .first()
      .click();
    await page.waitForTimeout(500);
    const rolled = await readStable(page);
    check(
      `цикл ${cycle}: откат вернул состояние побайтово`,
      same(rolled, s1before),
      `${JSON.stringify(rolled)} vs ${JSON.stringify(s1before)}`,
    );
  }

  // Счётчик: полный откат
  const counterRow = page.locator('li', { hasText: 'Вода' }).first();
  if (await counterRow.count()) {
    const cBefore = await readStable(page);
    // Забиваем счётчик до цели.
    for (let i = 0; i < 12; i++) {
      const plus = counterRow.getByRole('button', { name: 'Отметить выполнение' });
      if (!(await plus.count())) break;
      await plus.click();
      await page.waitForTimeout(260);
    }
    const cFull = await readState(page);
    check('счётчик закрыт и начислил XP', cFull.xp !== cBefore.xp || cFull.level !== cBefore.level);
    await counterRow.getByRole('button', { name: /Снять отметку/ }).click();
    await page.waitForTimeout(600);
    const cUndone = await readStable(page);
    check('счётчик откатился ЦЕЛИКОМ', same(cUndone, cBefore), JSON.stringify(cUndone));
  } else {
    check('счётчик найден на экране', false, 'привычка «Вода» не найдена');
  }

  // ═══ СЦЕНАРИЙ 2: отметить все привычки дня
  console.log('\nСЦЕНАРИЙ 2 — все привычки дня, начисление и бонус');
  const s2before = await readState(page);
  let guard = 0;
  while ((await page.getByRole('button', { name: 'Отметить выполнение' }).count()) > 0 && guard < 40) {
    guard++;
    await page.getByRole('button', { name: 'Отметить выполнение' }).first().click();
    await page.waitForTimeout(280);
  }
  await page.waitForTimeout(600);
  const s2after = await readState(page);
  console.log('  после всех отметок:', JSON.stringify(s2after));
  check('XP начислен', s2after.xp !== s2before.xp || s2after.level > s2before.level);
  check('золото начислено', s2after.gold > s2before.gold);
  check('журнал вырос', s2after.ledgerSize > s2before.ledgerSize);
  const ring = await page.locator('main').getByText('100%').count();
  check('кольцо дня показывает 100%', ring > 0);
  await shot(page, '02-today-all-done');

  // ═══ СЦЕНАРИЙ 3: покупка при достаточном и недостаточном золоте
  console.log('\nСЦЕНАРИЙ 3 — покупка при достатке и недостатке золота');
  await goTab(page, 'Лавка');
  await shot(page, '03-shop');
  const shopText = (await visibleText(page)).join(' | ');
  check('в лавке видно предложение', shopText.length > 50);

  // На свежем сейве витрина реальных наград пуста: игрок ещё ничего не завёл.
  // Проверяем, что предложен стартовый набор, и берём его.
  const starter = page.getByRole('button', { name: /Взять набор/ });
  check('на пустой витрине предложен стартовый набор наград', (await starter.count()) > 0);
  if (await starter.count()) {
    await starter.click();
    await page.waitForTimeout(2500);
    await shot(page, '03a-shop-starter-added');
  }

  // Богатеем записью журнала: честным путём 3000 золота копятся полтора месяца.
  await grantGold(page, 3000);
  const granted = await readState(page);
  check('золото начислено записью журнала', granted.gold >= 3000, `золото: ${granted.gold}`);
  await goTab(page, 'Лавка');
  await shot(page, '03b-shop-rich');

  const beforeBuy = await readStable(page);
  const buyButtons = page.locator('main button').filter({ hasText: /купить/i });
  const buyCount = await buyButtons.count();
  check('есть хотя бы одна кнопка покупки', buyCount > 0, `найдено ${buyCount}`);

  // Список перерисовывается после покупки, поэтому кнопку ищем заново
  // на каждой попытке: nth(i) от прошлого рендера уже не существует.
  let boughtOk = false;
  for (let i = 0; i < 6 && !boughtOk; i++) {
    const enabled = page.locator('main button:not(:disabled)').filter({ hasText: /^купить$/i });
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
    const afterBuy = await waitForChange(page, 'gold', beforeBuy.gold);
    if (afterBuy.gold < beforeBuy.gold) {
      boughtOk = true;
      check('покупка при достатке списала золото', true, `${beforeBuy.gold} → ${afterBuy.gold}`);
    }
  }
  if (!boughtOk) check('покупка при достатке золота', false, 'ни одна покупка не прошла');

  const expensive = page
    .locator('main button:disabled')
    .filter({ hasText: /Ещё|золота|ранг|лимит|сумка|Уже твоё/i });
  check(
    'дорогой товар недоступен, а не покупается в минус',
    (await expensive.count()) > 0,
    `заблокировано: ${await expensive.count()}`,
  );
  const stateAfterBlocked = await readState(page);
  check('золото не ушло в минус', stateAfterBlocked.gold >= 0);

  // ═══ СЦЕНАРИЙ 7 (часть): все пять экранов
  console.log('\nСЦЕНАРИЙ 7 — пять экранов навигации, вёрстка и надписи');
  for (const [tab, file] of [
    ['Сегодня', '04-today'],
    ['Фолиант', '05-habits'],
    ['Квесты', '06-quests'],
    ['Лавка', '07-shop'],
    ['Герой', '08-character'],
  ]) {
    await goTab(page, tab);
    await shot(page, file);
    const audit = await auditLayout(page);
    check(`${tab}: нижняя навигация fixed`, audit.navFixed === 'fixed', audit.navFixed);
    check(`${tab}: нет горизонтального скролла`, !audit.hScroll);
    check(
      `${tab}: все зоны нажатия ≥44px`,
      audit.small.length === 0,
      audit.small.slice(0, 4).join('; '),
    );
    const text = await visibleText(page);
    console.log(`  ${tab}: ${text.length} надписей`);
  }

  // ═══ СЦЕНАРИЙ 4: своя привычка → выполнить → удалить
  console.log('\nСЦЕНАРИЙ 4 — своя привычка: создать, выполнить, удалить');
  // Создаём с экрана «Сегодня»: там ссылка добавления подписана ровно
  // «привычка». На «Фолианте» шаблон /привычк/i попадал в «Изменить привычку
  // «Вода»» — и сценарий не создавал новую, а переименовывал существующую.
  await goTab(page, 'Сегодня');
  const addHabit = page.getByRole('button', { name: /^привычка$/ }).first();
  await addHabit.click();
  await page.waitForTimeout(500);
  const sheet = page.locator('[role=dialog]');
  check('лист создания привычки открылся', (await sheet.count()) > 0);
  await sheet.locator('input.field[type=text], input.field:not([type])').first().fill('Пробный подход');
  await shot(page, '09-habit-editor');
  const saveBtn = sheet.getByRole('button', { name: /Сохранить|Добавить|Создать|Записать|Готово/ }).first();
  await saveBtn.click();
  await page.waitForTimeout(900);
  check('лист закрылся после сохранения', (await page.locator('[role=dialog]').count()) === 0);
  await closeAnySheet(page);
  const created = await page.locator('main', { hasText: 'Пробный подход' }).count();
  check('привычка создана и видна', created > 0);
  await shot(page, '09b-habits-after-create');

  await goTab(page, 'Сегодня');
  const beforeNew = await readStable(page);
  await settle(page, 800);
  const tick = page.getByRole('button', { name: 'Отметить выполнение' }).first();
  if (await tick.count()) {
    await tick.click();
    await page.waitForTimeout(600);
    const afterNew = await waitForChange(page, 'completions', beforeNew.completions);
    check('своя привычка выполнена и начислила', afterNew.completions > beforeNew.completions);
  } else {
    await shot(page, '09c-today-missing-new-habit');
    const labels = await page
      .locator('main button')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20)));
    console.log('   кнопки на Сегодня:', labels.join(' | '));
    const rows = await page.locator('main li').allTextContents();
    check('своя привычка отмечаема', false, `строк на Сегодня: ${rows.length}`);
    console.log('   строки:', rows.map((r) => r.replace(/\s+/g, ' ').slice(0, 40)).join(' / '));
  }

  await goTab(page, 'Фолиант');
  const editBtn = page
    .getByRole('button', { name: 'Изменить привычку «Пробный подход»' })
    .first();
  check('привычку можно открыть на правку', (await editBtn.count()) > 0);
  await editBtn.click();
  await page.waitForTimeout(700);
  const del = page.locator('[role=dialog]').getByRole('button', { name: /Удалить|Убрать/ }).first();
  if (await del.count()) {
    await del.click();
    await page.waitForTimeout(600);
    // ConfirmRow: подтверждение подписано «Убрать», отмена — «Отмена».
    const confirm = page.locator('[role=dialog]').getByRole('button', { name: 'Убрать' }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(1000);
    await closeAnySheet(page);
    const gone = await page
      .getByRole('button', { name: /Изменить привычку «Пробный подход»/ })
      .count();
    check('привычка удалена', gone === 0, `осталось вхождений: ${gone}`);
  } else {
    check('кнопка удаления привычки есть', false);
  }
  await closeAnySheet(page);

  // ═══ СЦЕНАРИЙ 5: квест → выполнить → откатить
  console.log('\nСЦЕНАРИЙ 5 — квест: создать, выполнить, откатить');
  // Как и с привычкой, создаём с «Сегодня»: там ссылка подписана «квест».
  await goTab(page, 'Сегодня');
  const addQuest = page.getByRole('button', { name: /^квест$/ }).first();
  await addQuest.click();
  await page.waitForTimeout(500);
  const qSheet = page.locator('[role=dialog]');
  await qSheet.locator('input.field[type=text], input.field:not([type])').first().fill('Пробное дело');
  await shot(page, '10-quest-editor');
  await qSheet.getByRole('button', { name: /Сохранить|Добавить|Создать|Записать|Готово/ }).first().click();
  await page.waitForTimeout(900);
  await closeAnySheet(page);

  await goTab(page, 'Квесты');
  const qBefore = await readStable(page);
  const qRow = page.locator('li, div').filter({ hasText: 'Пробное дело' }).last();
  const doneBtn = qRow.getByRole('button', { name: 'Завершить квест' }).first();
  if (await doneBtn.count()) {
    await doneBtn.click();
    const qDone = await waitForChange(page, 'completions', qBefore.completions);
    check('квест выполнен и начислил', qDone.completions > qBefore.completions);

    // Завершённый квест уезжает во вкладку «Завершённые» — там же и откат.
    const doneTab = page.getByRole('button', { name: /Завершённые/ }).first();
    if (await doneTab.count()) {
      await doneTab.click();
      await page.waitForTimeout(600);
    }
    const reopen = page.getByRole('button', { name: 'Открыть квест заново' }).first();
    if (await reopen.count()) {
      await reopen.click();
      const qBack = await readStable(page);
      check(
        'откат квеста вернул состояние побайтово',
        same(qBack, qBefore),
        `после: ${JSON.stringify(qBack)} / до: ${JSON.stringify(qBefore)}`,
      );
    } else {
      check('кнопка откатa квеста есть', false);
    }
  } else {
    check('кнопка завершения квеста есть', false);
  }
  await shot(page, '11-quests');

  // ═══ СЦЕНАРИЙ 6: перезагрузка
  console.log('\nСЦЕНАРИЙ 6 — перезагрузка, состояние сохранилось');
  const beforeReload = await readStable(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.app-nav', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const afterReload = await readState(page);
  check('состояние после перезагрузки совпадает', same(afterReload, beforeReload),
    `${JSON.stringify(afterReload)} vs ${JSON.stringify(beforeReload)}`);
  check('телеметрия пишет открытия', afterReload.telemetrySize > beforeReload.telemetrySize,
    `${beforeReload.telemetrySize} → ${afterReload.telemetrySize}`);

  // ── Экран повышения уровня (фикс №3): непрозрачный фон, печать не обрезана
  console.log('\nЭкран повышения уровня');
  await goTab(page, 'Сегодня');
  const lvlBefore = await readState(page);
  let sawOverlay = false;
  for (let i = 0; i < 25; i++) {
    const t = page.getByRole('button', { name: 'Отметить выполнение' });
    if (!(await t.count())) break;
    await t.first().click();
    await page.waitForTimeout(400);
    const seal = page.locator('.wax-seal');
    if (await seal.count()) {
      sawOverlay = true;
      const box = await seal.boundingBox();
      const vp = page.viewportSize();
      check('печать полностью в кадре', box && box.y >= 0 && box.y + box.height <= vp.height,
        box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : 'нет бокса');
      await shot(page, '12-level-up');
      break;
    }
  }
  if (!sawOverlay) console.log('  (повышение уровня не выпало в этом прогоне)');

  console.log(`\nОшибки в консоли: ${consoleErrors.length}`);
  consoleErrors.slice(0, 8).forEach((e) => console.log('  ', e.slice(0, 160)));

  console.log(`\n=== Провалено проверок: ${failures} ===`);
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
