import { describe, expect, it } from 'vitest';
import { CONSUMABLES } from './balance';
import {
  buyConsumable,
  buyCosmetic,
  buyRealReward,
  consumableBlock,
  consumablePrice,
  cosmeticBlock,
  dailyGoldPace,
  daysToAfford,
  goldFromTenge,
  isCosmeticVisible,
  isRealRewardVisible,
  pickAspiration,
  tierForPrice,
} from './economy';
import { applyLedgerPatch, projectCharacter } from './ledger';
import { makeCharacter, makeRealReward, seedLedger, T0 } from './testFixtures';

const DAY = '2026-01-15';
import type { CatalogItem, DayRecord } from './types';

function makeCosmetic(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'theme-ash',
    name: 'Пепельный переплёт',
    lore: 'Тёмный, как остывший очаг.',
    icon: 'sparkles',
    category: 'cosmetic',
    price: 1200,
    tier: 1,
    cosmeticKind: 'theme',
    consumableId: null,
    requiredRank: null,
    locationId: 'town',
    unlocksLocationId: null,
    seasonal: false,
    ...overrides,
  };
}

describe('цены расходников', () => {
  it('первая покупка идёт по базовой цене', () => {
    expect(consumablePrice(makeCharacter(), 'streakFreeze')).toBe(350);
  });

  it('цена растёт внутри месяца — сток для излишка золота', () => {
    const c = makeCharacter({ gold: 100_000 });
    let character = c;
    const prices: number[] = [];
    for (let i = 0; i < 4; i++) {
      prices.push(consumablePrice(character, 'streakFreeze'));
      character = { ...character, consumables: { ...character.consumables, streakFreeze: { ...character.consumables.streakFreeze, purchasedThisMonth: i + 1, owned: 0 } } };
    }
    expect(prices).toEqual([350, 490, 686, 960]);
    // Четыре заморозки в месяц стоят ~40 дней дохода.
    expect(prices.reduce((a, b) => a + b, 0)).toBe(2486);
  });
});

describe('лимиты расходников', () => {
  it('блокирует при переполненном инвентаре', () => {
    const c = makeCharacter({ gold: 10_000 });
    const full = { ...c, consumables: { ...c.consumables, streakFreeze: { owned: CONSUMABLES.streakFreeze.maxOwned, purchasedThisMonth: 0, month: '2026-01' } } };
    expect(consumableBlock(full, 'streakFreeze')).toBe('inventoryFull');
    expect(buyConsumable(full, 'streakFreeze', DAY, T0)).toBeNull();
  });

  it('блокирует при исчерпанном месячном лимите', () => {
    const c = makeCharacter({ gold: 100_000 });
    const capped = { ...c, consumables: { ...c.consumables, streakFreeze: { owned: 0, purchasedThisMonth: CONSUMABLES.streakFreeze.maxPerMonth, month: '2026-01' } } };
    expect(consumableBlock(capped, 'streakFreeze')).toBe('monthlyLimit');
  });

  it('блокирует при нехватке золота', () => {
    expect(consumableBlock(makeCharacter({ gold: 10 }), 'streakFreeze')).toBe('notEnoughGold');
  });

  it('успешная покупка возвращает запись журнала, а не нового персонажа', () => {
    // Покупка не изменяет персонажа: она добавляет запись. Золото, инвентарь
    // и счётчик покупок за месяц получаются пересчётом журнала.
    const seed = seedLedger(0, 1000, { day: DAY });
    const before = projectCharacter(makeCharacter(), seed);
    const entry = buyConsumable(before, 'streakFreeze', DAY, T0);
    if (!entry) throw new Error('покупка должна была пройти');

    expect(entry.gold).toBe(-350);
    const after = projectCharacter(before, applyLedgerPatch(seed, [entry], []));
    expect(after.gold).toBe(650);
    expect(after.consumables.streakFreeze.owned).toBe(1);
    expect(after.consumables.streakFreeze.purchasedThisMonth).toBe(1);
    expect(after.stats.totalGoldSpent).toBe(350);
  });
});

describe('косметика и состояние здоровья', () => {
  it('дорогие ступени скрываются при ранении', () => {
    const wounded = makeCharacter({ hp: 20, gold: 100_000 });
    expect(isCosmeticVisible(wounded, makeCosmetic({ tier: 3 }))).toBe(true);
    expect(isCosmeticVisible(wounded, makeCosmetic({ tier: 4 }))).toBe(false);
  });

  it('при истощении доступны только две первые ступени', () => {
    const exhausted = makeCharacter({ hp: 0, gold: 100_000 });
    expect(isCosmeticVisible(exhausted, makeCosmetic({ tier: 2 }))).toBe(true);
    expect(isCosmeticVisible(exhausted, makeCosmetic({ tier: 3 }))).toBe(false);
  });

  it('скрытая косметика не отбирается — она просто не показывается', () => {
    const exhausted = makeCharacter({ hp: 0, ownedCosmetics: ['theme-ash'] });
    expect(exhausted.ownedCosmetics).toContain('theme-ash');
  });

  it('требование ранга блокирует покупку', () => {
    const low = makeCharacter({ level: 5, gold: 100_000 });
    expect(cosmeticBlock(low, makeCosmetic({ requiredRank: 'S' }))).toBe('rankTooLow');
  });

  it('покупка косметики открывает связанную локацию', () => {
    const c = makeCharacter({ gold: 100_000 });
    const item = makeCosmetic({ id: 'loc-harbor', cosmeticKind: 'location', unlocksLocationId: 'harbor', tier: 4 });
    const entry = buyCosmetic(c, item, DAY, T0);
    if (!entry) throw new Error('покупка должна была пройти');
    const after = projectCharacter(c, [...seedLedger(0, 100_000, { day: DAY }), entry]);
    expect(after.unlockedLocations).toContain('harbor');
    expect(after.ownedCosmetics).toContain('loc-harbor');
  });

  it('нельзя купить дважды', () => {
    const c = makeCharacter({ gold: 100_000, ownedCosmetics: ['theme-ash'] });
    expect(cosmeticBlock(c, makeCosmetic())).toBe('alreadyOwned');
  });
});

describe('реальные награды', () => {
  it('курс — тенге, делённые на 10', () => {
    expect(goldFromTenge(3000)).toBe(300);
    expect(goldFromTenge(32_000)).toBe(3200);
  });

  it('тир определяется ценой', () => {
    expect(tierForPrice(500)).toBe('small');
    expect(tierForPrice(2500)).toBe('medium');
    expect(tierForPrice(15_000)).toBe('large');
  });

  it('мелкая награда достижима за 3-6 дней при типичном темпе', () => {
    expect(daysToAfford(300, 0, 63)).toBe(5);
    expect(daysToAfford(800, 0, 63)).toBeLessThanOrEqual(13);
  });

  it('крупная награда — месяцы', () => {
    expect(daysToAfford(10_000, 0, 63)).toBeGreaterThan(60);
  });

  it('тир large скрывается при истощении', () => {
    const exhausted = makeCharacter({ hp: 0 });
    expect(isRealRewardVisible(exhausted, makeRealReward({ tier: 'large' }))).toBe(false);
    expect(isRealRewardVisible(exhausted, makeRealReward({ tier: 'small' }))).toBe(true);
  });

  it('покупка списывает золото и увеличивает счётчик', () => {
    const seed = seedLedger(0, 9000, { day: DAY });
    const before = projectCharacter(makeCharacter(), seed);
    const out = buyRealReward(before, makeRealReward({ price: 8000 }), DAY, T0);
    if (!out) throw new Error('покупка должна была пройти');
    const after = projectCharacter(before, applyLedgerPatch(seed, [out.entry], []));
    expect(after.gold).toBe(1000);
    expect(out.reward.purchasedCount).toBe(1);
  });

  it('не даёт уйти в минус', () => {
    expect(
      buyRealReward(makeCharacter({ gold: 100 }), makeRealReward({ price: 8000 }), DAY, T0),
    ).toBeNull();
  });

  it('повторная покупка той же награды — отдельная запись журнала', () => {
    // Ключ содержит номер выкупа, иначе вторая покупка перезаписала бы первую
    // и списала золото только один раз.
    const seed = seedLedger(0, 20_000, { day: DAY });
    let character = projectCharacter(makeCharacter(), seed);
    let ledger = seed;
    let reward = makeRealReward({ price: 8000 });

    for (let i = 0; i < 2; i++) {
      const out = buyRealReward(character, reward, DAY, T0);
      if (!out) throw new Error('покупка должна была пройти');
      ledger = applyLedgerPatch(ledger, [out.entry], []);
      reward = out.reward;
      character = projectCharacter(character, ledger);
    }

    expect(character.gold).toBe(4000);
    expect(reward.purchasedCount).toBe(2);
  });
});

describe('темп накопления', () => {
  const records = (values: number[]): DayRecord[] =>
    values.map((gold, i) => ({
      day: `2026-01-${String(i + 1).padStart(2, '0')}`,
      dueCount: 5,
      doneCount: 4,
      completionRate: 0.8,
      perfect: false,
      counted: true,
      xpGained: 0,
      goldGained: gold,
      hpDelta: 0,
      freezeUsed: false,
      updatedAt: T0,
    }));

  it('усредняет последние дни', () => {
    expect(dailyGoldPace(records([60, 70, 80]))).toBeCloseTo(70);
  });

  it('падает на резервное значение при пустой истории', () => {
    expect(dailyGoldPace([])).toBe(63);
  });

  it('не верит одному-двум дням — иначе первый же день занизит темп', () => {
    expect(dailyGoldPace(records([3]))).toBe(63);
    expect(dailyGoldPace(records([3, 5]))).toBe(63);
  });

  it('исключает сегодняшний день — он ещё не закончен', () => {
    const rows = records([60, 70, 80, 3]);
    const todayKey = rows[3]?.day ?? '';
    // Без исключения среднее упало бы до 53.
    expect(dailyGoldPace(rows, todayKey)).toBeCloseTo(70);
  });

  it('первая покупка не выглядит недостижимой на старте', () => {
    const pace = dailyGoldPace(records([3]));
    // Мелкая награда за 300 золота должна читаться как несколько дней, а не год.
    expect(daysToAfford(300, 0, pace)).toBeLessThanOrEqual(6);
  });
});

describe('желанная покупка', () => {
  const shelf = [
    { name: 'Кофе', icon: 'droplet', price: 400 },
    { name: 'Книга', icon: 'book', price: 2500 },
    { name: 'Кроссовки', icon: 'steps', price: 8000 },
  ];

  it('выбирает самый дешёвый товар ДОРОЖЕ баланса', () => {
    expect(pickAspiration(500, 63, shelf)?.name).toBe('Книга');
    expect(pickAspiration(0, 63, shelf)?.name).toBe('Кофе');
    expect(pickAspiration(3000, 63, shelf)?.name).toBe('Кроссовки');
  });

  it('считает недостающее и дни до цели', () => {
    const a = pickAspiration(500, 100, shelf);
    expect(a?.missing).toBe(2000);
    expect(a?.days).toBe(20);
  });

  it('возвращает null, когда всё по карману', () => {
    expect(pickAspiration(99_999, 63, shelf)).toBeNull();
  });
});
