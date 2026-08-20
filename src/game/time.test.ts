import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKeyOf,
  daysBetween,
  daysInRange,
  formatDayKey,
  monthKeyOf,
  plural,
  startOfWeek,
  weekDays,
  weekdayOf,
} from './time';

describe('ключи дней', () => {
  it('форматирует локальную дату', () => {
    expect(formatDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('месяц вырезается из ключа дня', () => {
    expect(monthKeyOf('2026-03-17')).toBe('2026-03');
  });
});

describe('час перехода суток', () => {
  it('отметка в 01:30 при rollover=4 относится ко вчерашнему дню', () => {
    expect(dayKeyOf(new Date(2026, 0, 15, 1, 30), 4)).toBe('2026-01-14');
  });

  it('отметка в 05:00 относится к сегодняшнему', () => {
    expect(dayKeyOf(new Date(2026, 0, 15, 5, 0), 4)).toBe('2026-01-15');
  });

  it('при rollover=0 сутки совпадают с астрономическими', () => {
    expect(dayKeyOf(new Date(2026, 0, 15, 1, 30), 0)).toBe('2026-01-15');
  });
});

describe('арифметика дней', () => {
  it('складывает и вычитает через границы месяца', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('считает разницу', () => {
    expect(daysBetween('2026-01-01', '2026-01-15')).toBe(14);
    expect(daysBetween('2026-01-15', '2026-01-01')).toBe(-14);
    expect(daysBetween('2026-01-15', '2026-01-15')).toBe(0);
  });

  it('переживает переход на летнее время', () => {
    // В большинстве зон перевод происходит в конце марта.
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });

  it('строит диапазон включительно', () => {
    expect(daysInRange('2026-01-01', '2026-01-03')).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(daysInRange('2026-01-03', '2026-01-01')).toEqual([]);
  });
});

describe('недели', () => {
  it('неделя начинается с понедельника', () => {
    // 2026-01-18 — воскресенье.
    expect(weekdayOf('2026-01-18')).toBe(0);
    expect(startOfWeek('2026-01-18')).toBe('2026-01-12');
    expect(startOfWeek('2026-01-12')).toBe('2026-01-12');
  });

  it('даёт 7 дней подряд', () => {
    const days = weekDays('2026-01-15');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-01-12');
    expect(days[6]).toBe('2026-01-18');
  });
});

describe('склонение', () => {
  it('работает по русским правилам', () => {
    expect(plural(1, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(2, 'день', 'дня', 'дней')).toBe('дня');
    expect(plural(5, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(11, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(21, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(114, 'день', 'дня', 'дней')).toBe('дней');
  });
});
