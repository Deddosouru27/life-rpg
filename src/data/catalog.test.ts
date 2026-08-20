import { describe, expect, it } from 'vitest';
import { CATALOG, COSMETICS, COSMETICS_TOTAL_PRICE, SEASON_REWARDS } from './catalog';
import { HABIT_PRESETS, HABIT_PRESETS_BY_ATTRIBUTE } from './habitPresets';
import { GODRIC, MERCHANTS, pickGreeting, pickLine } from './merchants';
import { LOCATIONS } from './locations';
import { ATTRIBUTE_IDS } from '@/game/types';
import type { Rank } from '@/game/types';

describe('каталог привычек', () => {
  it('содержит не менее 60 пресетов', () => {
    expect(HABIT_PRESETS.length).toBeGreaterThanOrEqual(60);
  });

  it('покрывает все пять атрибутов минимум по 10 штук', () => {
    for (const id of ATTRIBUTE_IDS) {
      expect(HABIT_PRESETS_BY_ATTRIBUTE[id].length).toBeGreaterThanOrEqual(10);
    }
  });

  it('идентификаторы уникальны', () => {
    expect(new Set(HABIT_PRESETS.map((p) => p.id)).size).toBe(HABIT_PRESETS.length);
  });

  it('у каждого пресета есть иконка и описание в стиле мира', () => {
    for (const p of HABIT_PRESETS) {
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.lore.length).toBeGreaterThan(15);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });

  it('счётчики имеют цель больше единицы, остальные — ровно единицу', () => {
    for (const p of HABIT_PRESETS) {
      if (p.kind === 'counter') expect(p.target).toBeGreaterThan(1);
      else expect(p.target).toBe(1);
    }
  });

  it('содержит все три типа привычек', () => {
    const kinds = new Set(HABIT_PRESETS.map((p) => p.kind));
    expect(kinds).toEqual(new Set(['binary', 'counter', 'negative']));
  });

  it('содержит все три вида частоты', () => {
    const kinds = new Set(HABIT_PRESETS.map((p) => p.frequency.kind));
    expect(kinds).toEqual(new Set(['daily', 'timesPerWeek', 'specificDays']));
  });
});

describe('каталог товаров', () => {
  it('идентификаторы уникальны', () => {
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
  });

  it('косметика стоит суммарно около семи лет дохода — скупить невозможно', () => {
    // 23 000 золота в год при 70% выполнения.
    const yearsToBuyAll = COSMETICS_TOTAL_PRICE / 23_000;
    expect(yearsToBuyAll).toBeGreaterThan(5);
  });

  it('цены растут по ступеням', () => {
    for (let tier = 1; tier < 5; tier++) {
      const cur = COSMETICS.filter((c) => c.tier === tier).map((c) => c.price);
      const next = COSMETICS.filter((c) => c.tier === tier + 1).map((c) => c.price);
      expect(Math.max(...cur)).toBeLessThan(Math.min(...next));
    }
  });

  it('поздние ступени требуют ранга — их нельзя выкупить ранним накоплением', () => {
    for (const item of COSMETICS.filter((c) => c.tier >= 3)) {
      expect(item.requiredRank).not.toBeNull();
    }
  });

  it('локации открываются только покупкой грамоты соответствующей ступени', () => {
    const unlockers = COSMETICS.filter((c) => c.unlocksLocationId !== null);
    expect(unlockers.length).toBeGreaterThan(0);
    for (const u of unlockers) expect(u.tier).toBeGreaterThanOrEqual(4);
  });
});

describe('сезонные награды', () => {
  it('покрывают все 30 ступеней', () => {
    expect(SEASON_REWARDS).toHaveLength(30);
    expect(SEASON_REWARDS.map((r) => r.tier)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('дают около 6 000 золота за сезон', () => {
    const total = SEASON_REWARDS.reduce((s, r) => s + r.gold, 0);
    expect(total).toBeGreaterThan(4000);
    expect(total).toBeLessThan(8000);
  });
});

describe('локации', () => {
  it('ровно одна стартовая', () => {
    expect(LOCATIONS.filter((l) => l.isStarting)).toHaveLength(1);
  });

  it('у каждой локации есть торговец', () => {
    for (const loc of LOCATIONS) {
      const merchant = MERCHANTS.find((m) => m.locationId === loc.id);
      if (loc.id === 'archive') continue; // Архив зарезервирован под будущий контент.
      expect(merchant).toBeDefined();
    }
  });
});

describe('торговец Годрик', () => {
  const RANKS: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];

  it('имеет не менее 10 приветственных реплик', () => {
    expect(GODRIC.lines.greeting.length).toBeGreaterThanOrEqual(10);
  });

  it('имеет реплики всех обязательных видов', () => {
    for (const key of ['greeting', 'purchase', 'poor', 'farewell'] as const) {
      expect(GODRIC.lines[key].length).toBeGreaterThan(0);
    }
  });

  it('находит приветствие для любого ранга', () => {
    for (const rank of RANKS) {
      const line = pickGreeting(GODRIC, { rank, streak: 0, hpStage: 'healthy' }, 0.5);
      expect(line.length).toBeGreaterThan(5);
      expect(line).not.toBe('…');
    }
  });

  it('на ранге E говорит снисходительно, на S — почтительно', () => {
    const low = pickGreeting(GODRIC, { rank: 'E', streak: 0, hpStage: 'healthy' }, 0);
    const high = pickGreeting(GODRIC, { rank: 'S', streak: 0, hpStage: 'healthy' }, 0);
    expect(low).not.toBe(high);
    expect(high.toLowerCase()).toMatch(/владык|простите|выбирайте/);
  });

  it('реагирует на длинный стрик отдельной репликой', () => {
    const short = pickGreeting(GODRIC, { rank: 'E', streak: 0, hpStage: 'healthy' }, 0);
    const long = pickGreeting(GODRIC, { rank: 'E', streak: 8, hpStage: 'healthy' }, 0);
    expect(short).not.toBe(long);
  });

  it('при ранении переключается на обеспокоенный тон', () => {
    const line = pickGreeting(GODRIC, { rank: 'A', streak: 40, hpStage: 'wounded' }, 0.1);
    expect(GODRIC.lines.wounded.some((l) => l.text === line)).toBe(true);
  });

  it('при истощении отказывается продавать роскошь', () => {
    const line = pickGreeting(GODRIC, { rank: 'S', streak: 100, hpStage: 'exhausted' }, 0.4);
    expect(GODRIC.lines.exhausted.some((l) => l.text === line)).toBe(true);
  });

  it('выбор реплики детерминирован по значению броска', () => {
    const ctx = { rank: 'C' as Rank, streak: 5, hpStage: 'healthy' as const };
    expect(pickLine(GODRIC, 'purchase', ctx, 0.3)).toBe(pickLine(GODRIC, 'purchase', ctx, 0.3));
  });
});

describe('остальные торговцы', () => {
  it('используют тот же формат и имеют все виды реплик', () => {
    for (const merchant of MERCHANTS) {
      for (const key of ['greeting', 'browse', 'purchase', 'poor', 'farewell', 'wounded', 'exhausted', 'comeback', 'milestone'] as const) {
        expect(merchant.lines[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('привязаны к существующим локациям', () => {
    const ids = new Set(LOCATIONS.map((l) => l.id));
    for (const m of MERCHANTS) expect(ids.has(m.locationId)).toBe(true);
  });
});
