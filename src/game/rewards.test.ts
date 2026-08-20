import { describe, expect, it } from 'vitest';
import { CRIT_MULTIPLIER, CRIT_PITY_THRESHOLD, EXHAUSTION_GOLD_MULTIPLIER } from './balance';
import { clampToSoftCap, computeReward, goldForXp } from './rewards';
import type { RewardContext } from './rewards';
import { createRng } from './rng';

function ctx(overrides: Partial<RewardContext> = {}): RewardContext {
  return { hp: 100, streak: 0, prestigeSeals: 0, critDrought: 0, doubleXpActive: false, ...overrides };
}

/** ГПСЧ, который никогда не срабатывает на шансах — детерминированный «без крита». */
const neverRng = { next: () => 0.999, int: () => 0, chance: () => false, pick: <T,>(a: readonly T[]) => a[0] };
/** ГПСЧ, который всегда срабатывает. */
const alwaysRng = { next: () => 0, int: (min: number) => min, chance: () => true, pick: <T,>(a: readonly T[]) => a[0] };

describe('базовые формулы', () => {
  it('золото = 40% от XP', () => {
    expect(goldForXp(15)).toBe(6);
    expect(goldForXp(25)).toBe(10);
    expect(goldForXp(8)).toBe(3);
  });
});

describe('computeReward', () => {
  it('без множителей выдаёт базу', () => {
    const out = computeReward(15, 'body', ctx(), neverRng);
    expect(out.reward.xp).toBe(15);
    expect(out.reward.gold).toBe(6);
    expect(out.reward.crit).toBe(false);
  });

  it('применяет множитель стрика', () => {
    const out = computeReward(15, 'body', ctx({ streak: 14 }), neverRng);
    expect(out.reward.streakMultiplier).toBeCloseTo(1.2);
    expect(out.reward.xp).toBe(18);
  });

  it('крит умножает награду', () => {
    const out = computeReward(15, 'body', ctx(), alwaysRng);
    expect(out.reward.crit).toBe(true);
    expect(out.reward.xp).toBe(15 * CRIT_MULTIPLIER);
  });

  it('pity-таймер гарантирует крит после порога', () => {
    const out = computeReward(15, 'body', ctx({ critDrought: CRIT_PITY_THRESHOLD }), neverRng);
    expect(out.reward.crit).toBe(true);
    expect(out.critDrought).toBe(0);
  });

  it('счётчик засухи растёт, когда крита нет', () => {
    expect(computeReward(15, 'body', ctx({ critDrought: 4 }), neverRng).critDrought).toBe(5);
  });

  it('свиток двойного XP удваивает только XP, не золото', () => {
    const plain = computeReward(15, 'body', ctx(), neverRng).reward;
    const doubled = computeReward(15, 'body', ctx({ doubleXpActive: true }), neverRng).reward;
    expect(doubled.xp).toBe(plain.xp * 2);
    expect(doubled.gold).toBe(plain.gold);
  });

  it('печати перерождения дают +3% за каждую', () => {
    const out = computeReward(100, 'body', ctx({ prestigeSeals: 2 }), neverRng);
    expect(out.reward.xp).toBe(106);
  });

  describe('истощение', () => {
    it('режет золото вдвое, но НЕ трогает XP', () => {
      const out = computeReward(100, 'body', ctx({ hp: 0 }), neverRng);
      expect(out.reward.xp).toBe(100);
      expect(out.reward.gold).toBe(Math.round(40 * EXHAUSTION_GOLD_MULTIPLIER));
    });

    it('отключает криты даже при гарантированном ГПСЧ', () => {
      expect(computeReward(15, 'body', ctx({ hp: 0 }), alwaysRng).reward.crit).toBe(false);
    });

    it('отключает редкие находки', () => {
      expect(computeReward(15, 'body', ctx({ hp: 0 }), alwaysRng).reward.rareFind).toBeNull();
    });
  });

  it('редкая находка выпадает и имеет корректную форму', () => {
    const out = computeReward(15, 'body', ctx(), alwaysRng);
    expect(out.reward.rareFind).not.toBeNull();
    expect(['gold', 'consumable']).toContain(out.reward.rareFind?.kind);
  });

  it('на длинной серии частота критов близка к 8%', () => {
    const rng = createRng(12345);
    let crits = 0;
    let drought = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const out = computeReward(15, 'body', ctx({ critDrought: drought }), rng);
      drought = out.critDrought;
      if (out.reward.crit) crits += 1;
    }
    const rate = crits / N;
    // Чуть выше 8% из-за pity-таймера — это ожидаемо.
    expect(rate).toBeGreaterThan(0.07);
    expect(rate).toBeLessThan(0.1);
  });

  it('pity гарантирует, что засуха никогда не превышает порог', () => {
    const rng = createRng(999);
    let drought = 0;
    let max = 0;
    for (let i = 0; i < 5000; i++) {
      const out = computeReward(15, 'body', ctx({ critDrought: drought }), rng);
      drought = out.critDrought;
      max = Math.max(max, drought);
    }
    expect(max).toBeLessThanOrEqual(CRIT_PITY_THRESHOLD);
  });
});

describe('мягкий потолок дневного XP', () => {
  it('пропускает награду, пока лимит не выбран', () => {
    expect(clampToSoftCap(15, 0, 100)).toBe(15);
  });

  it('урезает награду до остатка', () => {
    expect(clampToSoftCap(15, 95, 100)).toBe(5);
  });

  it('обнуляет награду после исчерпания', () => {
    expect(clampToSoftCap(15, 100, 100)).toBe(0);
    expect(clampToSoftCap(15, 150, 100)).toBe(0);
  });
});
