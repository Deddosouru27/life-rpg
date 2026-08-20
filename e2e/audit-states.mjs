/**
 * АУДИТ СОСТОЯНИЙ, которые обычный прогон не покрывает.
 *
 * Закрывает три оговорки предыдущего отчёта:
 *
 *  1. Контраст на ступенях HP `worn`, `wounded`, `exhausted`. Значения этих
 *     ступеней подобраны расчётом и записаны в комментариях `tokens.css`;
 *     до сих пор их никто не проверял. Расчёт мог быть неверен.
 *
 *  2. Доля акцента на ПУСТЫХ состояниях. Пустой экран содержит крупную
 *     кнопку `btn-primary` с золотой заливкой, и на почти пустом фоне её
 *     доля выше, чем на наполненном.
 *
 *  3. Доля акцента и контраст при ОТКРЫТОМ модальном листе.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import {
  auditLayout,
  collectTextPairs,
  hpStageOf,
  measureAccentShare,
  passOnboarding,
  pushLedger,
  readCharacter,
  withRatios,
} from './lib/audit.mjs';

const URL = process.env.APP_URL ?? 'http://127.0.0.1:3000/';
const SHOTS = 'e2e/shots';
const VIEWPORT = { width: 390, height: 844 };

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  [${cond ? 'OK  ' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const reportContrast = (label, pairs) => {
  const rated = withRatios(pairs);
  const failing = rated.filter((p) => !p.pass).sort((a, b) => a.ratio - b.ratio);
  const min = rated.length ? Math.min(...rated.map((p) => p.ratio)) : 0;
  console.log(`  контраст ${label}: минимум ${min}:1 из ${rated.length} пар, провалов ${failing.length}`);
  for (const f of failing.slice(0, 8)) {
    console.log(`    FAIL ${f.ratio}:1 (нужно ${f.need}) ${f.size}px «${f.sample}» .${f.cls}`);
  }
  return { min, failing, rated };
};

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
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });

  // ══════════ 1. ПУСТЫЕ СОСТОЯНИЯ ══════════
  // Меряем СРАЗУ после онбординга: привычки есть, но истории, квестов,
  // наград и косметики ещё нет — это и есть первый день пользователя.
  console.log('\n═══ ПУСТЫЕ СОСТОЯНИЯ (свежий сейв) ═══');
  await passOnboarding(page);

  for (const [tab, slug] of [
    ['Сегодня', 'today'],
    ['Фолиант', 'habits'],
    ['Квесты', 'quests'],
    ['Лавка', 'shop'],
    ['Герой', 'character'],
  ]) {
    await page.getByRole('button', { name: new RegExp(tab) }).click();
    await page.waitForTimeout(700);

    const view = measureAccentShare(await page.screenshot());
    const full = measureAccentShare(
      await page.screenshot({ path: `${SHOTS}/empty-${slug}.png`, fullPage: true }),
    );
    const c = reportContrast(`«${tab}» пустой`, await collectTextPairs(page));
    const layout = await auditLayout(page);

    const vPct = Math.round(view.share * 1000) / 10;
    const fPct = Math.round(full.share * 1000) / 10;
    console.log(`  акцент «${tab}» пустой: ${vPct}% вьюпорта, ${fPct}% страницы`);
    check(`«${tab}» пустой: акцент ≤10%`, view.share <= 0.1 && full.share <= 0.1, `${vPct}% / ${fPct}%`);
    check(`«${tab}» пустой: контраст AA`, c.failing.length === 0, `минимум ${c.min}:1`);
    check(`«${tab}» пустой: зоны ≥44px`, layout.small.length === 0, layout.small.slice(0, 2).join('; '));
  }

  // ══════════ 2. МОДАЛЬНЫЙ ЛИСТ ══════════
  console.log('\n═══ ОТКРЫТЫЙ МОДАЛЬНЫЙ ЛИСТ ═══');
  for (const [tab, opener, slug] of [
    ['Сегодня', /^привычка$/, 'habit-sheet'],
    ['Сегодня', /^квест$/, 'quest-sheet'],
  ]) {
    await page.getByRole('button', { name: new RegExp(tab) }).click();
    await page.waitForTimeout(600);
    const btn = page.getByRole('button', { name: opener }).first();
    if (!(await btn.count())) {
      check(`лист «${slug}» открывается`, false, 'кнопка не найдена');
      continue;
    }
    await btn.click();
    await page.waitForTimeout(700);

    const view = measureAccentShare(await page.screenshot({ path: `${SHOTS}/sheet-${slug}.png` }));
    const c = reportContrast(`лист ${slug}`, await collectTextPairs(page, '[role=dialog] *'));
    const vPct = Math.round(view.share * 1000) / 10;
    console.log(`  акцент лист ${slug}: ${vPct}% вьюпорта`);
    check(`лист ${slug}: акцент ≤10%`, view.share <= 0.1, `${vPct}%`);
    check(`лист ${slug}: контраст AA`, c.failing.length === 0, `минимум ${c.min}:1`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ══════════ 3. СТУПЕНИ HP ══════════
  // Ступени: healthy ≥70, worn 40–69, wounded 1–39, exhausted 0.
  console.log('\n═══ СТУПЕНИ СОСТОЯНИЯ HP ═══');
  // Целевое HP каждой ступени. Дельта считается ОТ ТЕКУЩЕГО значения:
  // записи журнала складываются, и фиксированные дельты уводили wounded
  // сразу в exhausted.
  const stages = [
    ['worn', 55],
    ['wounded', 25],
    ['exhausted', 0],
  ];

  for (const [expected, targetHp] of stages) {
    const before = await readCharacter(page);
    await pushLedger(page, {
      kind: 'cron',
      refId: `audit-hp-${expected}`,
      hp: targetHp - before.hp,
    });
    const character = await readCharacter(page);
    const stage = await hpStageOf(page);
    check(
      `ступень ${expected} достигнута`,
      stage === expected && character.hp === targetHp,
      `hp=${character.hp}, стадия=${stage}`,
    );

    let worst = { min: 99, tab: '' };
    for (const [tab, slug] of [
      ['Сегодня', 'today'],
      ['Лавка', 'shop'],
      ['Герой', 'character'],
    ]) {
      await page.getByRole('button', { name: new RegExp(tab) }).click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/hp-${expected}-${slug}.png`, fullPage: true });
      const c = reportContrast(`${expected} · ${tab}`, await collectTextPairs(page));
      check(
        `${expected} · ${tab}: контраст AA`,
        c.failing.length === 0,
        `минимум ${c.min}:1`,
      );
      if (c.min < worst.min) worst = { min: c.min, tab };

      const view = measureAccentShare(await page.screenshot());
      const vPct = Math.round(view.share * 1000) / 10;
      check(`${expected} · ${tab}: акцент ≤10%`, view.share <= 0.1, `${vPct}%`);
    }
    console.log(`  ХУДШИЙ КОНТРАСТ на ступени ${expected}: ${worst.min}:1 (${worst.tab})`);
  }

  console.log(`\nОшибки страницы: ${consoleErrors.length}`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('  ', e.slice(0, 140)));
  console.log(`\n=== Провалено проверок: ${failures} ===`);
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
