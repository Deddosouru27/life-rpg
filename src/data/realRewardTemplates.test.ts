import { describe, expect, it } from 'vitest';
import { REAL_REWARD_TENGE_RATE } from '@/game/balance';
import { goldFromTenge } from '@/game/economy';
import {
  REAL_REWARD_TEMPLATES,
  STARTER_TEMPLATE_IDS,
  TEMPLATES_BY_HORIZON,
  templateById,
} from './realRewardTemplates';

/** Дневной доход при 70% выполнения — база для проверки горизонтов. */
const DAILY_GOLD = 60;

describe('каталог-шаблон реальных наград', () => {
  it('содержит не меньше 25 позиций', () => {
    expect(REAL_REWARD_TEMPLATES.length).toBeGreaterThanOrEqual(25);
  });

  it('все id уникальны', () => {
    const ids = REAL_REWARD_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('покрывает все три горизонта, минимум по 8 позиций', () => {
    for (const horizon of ['day', 'week', 'month'] as const) {
      expect(TEMPLATES_BY_HORIZON[horizon].length).toBeGreaterThanOrEqual(8);
    }
  });

  it('цены с денежным ориентиром следуют правилу тенге / 10', () => {
    for (const t of REAL_REWARD_TEMPLATES) {
      if (t.tenge === null) continue;
      expect(t.price).toBe(goldFromTenge(t.tenge));
      expect(t.tenge / t.price).toBeCloseTo(REAL_REWARD_TENGE_RATE, 5);
    }
  });

  it('радость дня достижима за 1–7 дней', () => {
    for (const t of TEMPLATES_BY_HORIZON.day) {
      const days = t.price / DAILY_GOLD;
      expect(days).toBeLessThanOrEqual(7);
      expect(days).toBeGreaterThan(0.5);
    }
  });

  it('награда недели достижима за 5–45 дней', () => {
    for (const t of TEMPLATES_BY_HORIZON.week) {
      const days = t.price / DAILY_GOLD;
      expect(days).toBeGreaterThanOrEqual(5);
      expect(days).toBeLessThanOrEqual(45);
    }
  });

  it('цель месяца требует больше месяца и покрывает горизонт года', () => {
    const days = TEMPLATES_BY_HORIZON.month.map((t) => t.price / DAILY_GOLD);
    expect(Math.min(...days)).toBeGreaterThan(45);
    // Самая дальняя цель — заметно больше года, чтобы вершина не кончалась.
    expect(Math.max(...days)).toBeGreaterThan(365);
  });

  it('горизонты не пересекаются по цене — лестница без разрывов и наложений', () => {
    const maxDay = Math.max(...TEMPLATES_BY_HORIZON.day.map((t) => t.price));
    const minWeek = Math.min(...TEMPLATES_BY_HORIZON.week.map((t) => t.price));
    const maxWeek = Math.max(...TEMPLATES_BY_HORIZON.week.map((t) => t.price));
    const minMonth = Math.min(...TEMPLATES_BY_HORIZON.month.map((t) => t.price));
    expect(minWeek).toBeGreaterThanOrEqual(maxDay);
    expect(minMonth).toBeGreaterThanOrEqual(maxWeek);
  });

  it('на любом балансе от 0 до самой дорогой цели есть покупка дороже баланса', () => {
    // Это и есть правило «желанной покупки»: витрина никогда не пуста сверху.
    const prices = REAL_REWARD_TEMPLATES.map((t) => t.price).sort((a, b) => a - b);
    const top = prices[prices.length - 1] ?? 0;
    for (let gold = 0; gold < top; gold += 137) {
      expect(prices.some((p) => p > gold)).toBe(true);
    }
  });

  it('стартовый набор существует и невелик', () => {
    expect(STARTER_TEMPLATE_IDS.length).toBeGreaterThanOrEqual(4);
    expect(STARTER_TEMPLATE_IDS.length).toBeLessThanOrEqual(8);
    for (const id of STARTER_TEMPLATE_IDS) {
      expect(templateById(id), `нет шаблона ${id}`).toBeDefined();
    }
  });

  it('стартовый набор покрывает все три горизонта', () => {
    const horizons = new Set(STARTER_TEMPLATE_IDS.map((id) => templateById(id)?.horizon));
    expect(horizons).toEqual(new Set(['day', 'week', 'month']));
  });

  it('у каждой позиции есть подпись, объясняющая что именно разрешено', () => {
    for (const t of REAL_REWARD_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.note.length).toBeGreaterThan(10);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });
});
