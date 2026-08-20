import { describe, expect, it } from 'vitest';
import {
  applyAttrXp,
  applySeasonXp,
  applyXp,
  attrXpToNextLevel,
  cumulativeXpForLevel,
  hpStage,
  levelForNextRank,
  levelProgress,
  prestigeGoldMultiplier,
  prestigeXpMultiplier,
  rankAtLeast,
  rankForLevel,
  seasonXpToNextTier,
  streakMultiplier,
  xpToNextLevel,
} from './progression';
import { MAX_LEVEL } from './balance';

describe('кривая опыта', () => {
  it('соответствует значениям из GAME_DESIGN.md', () => {
    expect(xpToNextLevel(1)).toBe(20);
    expect(xpToNextLevel(2)).toBe(44);
    expect(xpToNextLevel(3)).toBe(71);
    expect(xpToNextLevel(10)).toBe(283);
    expect(xpToNextLevel(50)).toBe(1798);
    expect(xpToNextLevel(99)).toBe(3945);
    expect(xpToNextLevel(100)).toBe(Number.POSITIVE_INFINITY);
  });

  it('монотонно возрастает', () => {
    for (let l = 1; l < 99; l++) {
      expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
    }
  });

  it('совокупный XP до 100-го уровня примерно 185 000', () => {
    const total = cumulativeXpForLevel(100);
    expect(total).toBeGreaterThan(180_000);
    expect(total).toBeLessThan(190_000);
  });
});

describe('симуляция игрока при 70% выполнения (145 XP/день)', () => {
  const DAILY_XP = 145;

  function levelAfterDays(days: number): number {
    let level = 1;
    let xp = 0;
    for (let d = 0; d < days; d++) {
      const out = applyXp(level, xp, DAILY_XP);
      level = out.level;
      xp = out.xp;
    }
    return level;
  }

  it('день 7 — примерно 9-й уровень, ранг E', () => {
    const lvl = levelAfterDays(7);
    expect(lvl).toBeGreaterThanOrEqual(8);
    expect(lvl).toBeLessThanOrEqual(10);
  });

  it('день 30 — примерно 17-й уровень, ранг D', () => {
    const lvl = levelAfterDays(30);
    expect(lvl).toBeGreaterThanOrEqual(15);
    expect(lvl).toBeLessThanOrEqual(19);
    expect(rankForLevel(lvl)).toBe('D');
  });

  it('день 90 — примерно 29-й уровень, ранг C', () => {
    const lvl = levelAfterDays(90);
    expect(lvl).toBeGreaterThanOrEqual(26);
    expect(lvl).toBeLessThanOrEqual(32);
    expect(rankForLevel(lvl)).toBe('C');
  });

  it('день 365 — примерно 56-й уровень, ранг A', () => {
    const lvl = levelAfterDays(365);
    expect(lvl).toBeGreaterThanOrEqual(52);
    expect(lvl).toBeLessThanOrEqual(60);
    expect(rankForLevel(lvl)).toBe('A');
  });

  it('за год не достигается ранг S — горизонт больше года', () => {
    expect(rankForLevel(levelAfterDays(365))).not.toBe('S');
  });
});

describe('applyXp', () => {
  it('копит XP без повышения, если не хватает', () => {
    expect(applyXp(1, 0, 10)).toEqual({ level: 1, xp: 10, levelsGained: 0 });
  });

  it('повышает уровень и сохраняет остаток', () => {
    expect(applyXp(1, 0, 25)).toEqual({ level: 2, xp: 5, levelsGained: 1 });
  });

  it('обрабатывает цепочку повышений', () => {
    const out = applyXp(1, 0, 1000);
    expect(out.levelsGained).toBeGreaterThan(3);
    expect(out.xp).toBeLessThan(xpToNextLevel(out.level));
  });

  it('не превышает максимальный уровень', () => {
    const out = applyXp(99, 0, 10_000_000);
    expect(out.level).toBe(MAX_LEVEL);
    expect(out.xp).toBe(0);
  });

  it('игнорирует отрицательный XP — прогресс не отнимается', () => {
    expect(applyXp(5, 30, -100)).toEqual({ level: 5, xp: 30, levelsGained: 0 });
  });
});

describe('прогресс уровня', () => {
  it('лежит в [0,1]', () => {
    expect(levelProgress(1, 0)).toBe(0);
    expect(levelProgress(1, 10)).toBeCloseTo(0.5);
    expect(levelProgress(MAX_LEVEL, 0)).toBe(1);
  });
});

describe('атрибуты', () => {
  it('растут быстрее глобального уровня', () => {
    expect(attrXpToNextLevel(1)).toBeLessThan(xpToNextLevel(1));
    expect(attrXpToNextLevel(50)).toBeLessThan(xpToNextLevel(50));
  });

  it('за год равномерной игры (29 XP/день) доходят до 30+', () => {
    let level = 1;
    let xp = 0;
    for (let d = 0; d < 365; d++) {
      const out = applyAttrXp(level, xp, 29);
      level = out.level;
      xp = out.xp;
    }
    expect(level).toBeGreaterThanOrEqual(30);
    expect(level).toBeLessThanOrEqual(45);
  });
});

describe('ранги', () => {
  it('соответствуют порогам', () => {
    expect(rankForLevel(1)).toBe('E');
    expect(rankForLevel(9)).toBe('E');
    expect(rankForLevel(10)).toBe('D');
    expect(rankForLevel(20)).toBe('C');
    expect(rankForLevel(35)).toBe('B');
    expect(rankForLevel(50)).toBe('A');
    expect(rankForLevel(70)).toBe('S');
    expect(rankForLevel(90)).toBe('SS');
    expect(rankForLevel(100)).toBe('SS');
  });

  it('levelForNextRank даёт следующий порог, null на SS', () => {
    expect(levelForNextRank(1)).toBe(10);
    expect(levelForNextRank(69)).toBe(70);
    expect(levelForNextRank(95)).toBeNull();
  });

  it('rankAtLeast сравнивает по порядку', () => {
    expect(rankAtLeast('A', 'C')).toBe(true);
    expect(rankAtLeast('C', 'A')).toBe(false);
    expect(rankAtLeast('S', 'S')).toBe(true);
  });
});

describe('ступени HP', () => {
  it('делят шкалу по порогам из баланса', () => {
    expect(hpStage(100)).toBe('healthy');
    expect(hpStage(70)).toBe('healthy');
    expect(hpStage(69)).toBe('worn');
    expect(hpStage(40)).toBe('worn');
    expect(hpStage(39)).toBe('wounded');
    expect(hpStage(1)).toBe('wounded');
    expect(hpStage(0)).toBe('exhausted');
  });
});

describe('множитель стрика', () => {
  it('растёт ступенями по 7 дней и упирается в потолок 1.5', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(6)).toBe(1);
    expect(streakMultiplier(7)).toBeCloseTo(1.1);
    expect(streakMultiplier(14)).toBeCloseTo(1.2);
    expect(streakMultiplier(35)).toBeCloseTo(1.5);
    expect(streakMultiplier(1000)).toBeCloseTo(1.5);
  });
});

describe('перерождение', () => {
  it('даёт +3% за печать', () => {
    expect(prestigeXpMultiplier(0)).toBe(1);
    expect(prestigeXpMultiplier(2)).toBeCloseTo(1.06);
    expect(prestigeGoldMultiplier(5)).toBeCloseTo(1.15);
  });
});

describe('сезонная шкала', () => {
  it('ступень 1 стоит 360, ступень 30 — 2100', () => {
    expect(seasonXpToNextTier(1)).toBe(360);
    expect(seasonXpToNextTier(29)).toBe(2040);
    expect(seasonXpToNextTier(30)).toBe(Number.POSITIVE_INFINITY);
  });

  it('за сезон игрок проходит большую часть шкалы, но не выбирает её целиком', () => {
    let tier = 0;
    let xp = 0;
    for (let d = 0; d < 90; d++) {
      const out = applySeasonXp(tier, xp, 145);
      tier = out.level;
      xp = out.xp;
    }
    // Намеренно: сезон заканчивается с ощущением «в следующий раз дожму».
    expect(tier).toBeGreaterThanOrEqual(14);
    expect(tier).toBeLessThan(30);
  });
});
