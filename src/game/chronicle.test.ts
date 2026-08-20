import { describe, expect, it } from 'vitest';
import {
  computeTallies,
  daysInSystem,
  hasWeeklyMovement,
  stalledHabits,
  weeklyAttributeTotals,
} from './chronicle';
import { makeHabit, makeLog, seedLedger, T0 } from './testFixtures';
import { addDays } from './time';
import type { Habit, HabitLog, LedgerEntry } from './types';

const TODAY = '2026-03-15';

/** createdAt задаём через дату, чтобы «чистые дни» считались от неё. */
const at = (day: string): number => new Date(`${day}T09:00:00`).getTime();

describe('предметные счётчики', () => {
  it('не показывают счётчик, если привычка не заведена', () => {
    const tallies = computeTallies([], [], TODAY);
    expect(tallies.every((t) => !t.tracked)).toBe(true);
    expect(tallies.every((t) => t.value === 0)).toBe(true);
  });

  it('считают тренировки по всем связанным пресетам', () => {
    const run = makeHabit({ id: 'r', presetId: 'body-run', kind: 'binary' });
    const gym = makeHabit({ id: 'g', presetId: 'body-training', kind: 'binary' });
    const logs: HabitLog[] = [
      makeLog('r', '2026-03-10', 1, true),
      makeLog('r', '2026-03-12', 1, true),
      makeLog('g', '2026-03-13', 1, true),
      // Незакрытый день не считается.
      makeLog('g', '2026-03-14', 0, false),
    ];
    const training = computeTallies([run, gym], logs, TODAY).find((t) => t.id === 'training');
    expect(training?.tracked).toBe(true);
    expect(training?.value).toBe(3);
  });

  it('считают чистые дни негативной привычки от дня заведения', () => {
    const start = '2026-03-10';
    const habit = makeHabit({
      id: 'sugar',
      presetId: 'body-no-sugar',
      kind: 'negative',
      createdAt: at(start),
    });
    // 10..15 марта — шесть дней. Срыв отмечен один раз, 12-го.
    const logs = [makeLog('sugar', '2026-03-12', 1, false)];
    const tally = computeTallies([habit], logs, TODAY).find((t) => t.id === 'no-sugar');
    expect(tally?.value).toBe(5);
  });

  it('счётчик воздержания работает на добавленном пресете', () => {
    const habit = makeHabit({
      id: 'p',
      presetId: 'spirit-no-porn',
      kind: 'negative',
      createdAt: at('2026-03-13'),
    });
    const tally = computeTallies([habit], [], TODAY).find((t) => t.id === 'no-porn');
    expect(tally?.tracked).toBe(true);
    expect(tally?.value).toBe(3);
  });

  it('переименование привычки не ломает счётчик — связь по presetId', () => {
    const habit = makeHabit({
      id: 'r',
      presetId: 'body-run',
      title: 'Утренний забег вдоль реки',
    });
    const logs = [makeLog('r', '2026-03-11', 1, true)];
    const training = computeTallies([habit], logs, TODAY).find((t) => t.id === 'training');
    expect(training?.value).toBe(1);
  });

  it('удалённые привычки не учитываются', () => {
    const habit = makeHabit({ id: 'r', presetId: 'body-run', deleted: true });
    const logs = [makeLog('r', '2026-03-11', 1, true)];
    const training = computeTallies([habit], logs, TODAY).find((t) => t.id === 'training');
    expect(training?.tracked).toBe(false);
  });
});

describe('дней в системе', () => {
  it('пустой журнал — первый день', () => {
    expect(daysInSystem([], TODAY)).toBe(1);
  });

  it('считается от самой ранней записи включительно', () => {
    const ledger = seedLedger(10, 10, { day: '2026-03-01' });
    expect(daysInSystem(ledger, TODAY)).toBe(15);
  });
});

describe('график роста атрибутов', () => {
  const entry = (day: string, attribute: 'body' | 'mind', xp: number): LedgerEntry => ({
    id: `habit|h|${day}|${xp}`,
    kind: 'habit',
    day,
    refId: 'h',
    seq: 0,
    xp,
    baseXp: xp,
    gold: 0,
    attribute,
    hp: 0,
    crit: false,
    consumable: null,
    cosmeticId: null,
    unlocksLocationId: null,
    createdAt: T0,
  });

  it('возвращает запрошенное число точек', () => {
    const points = weeklyAttributeTotals([], TODAY, 12);
    expect(points).toHaveLength(12);
  });

  it('значения накопительные и не убывают', () => {
    const ledger = [
      entry('2026-03-02', 'body', 10),
      entry('2026-03-09', 'body', 15),
      entry('2026-03-10', 'mind', 5),
    ];
    const points = weeklyAttributeTotals(ledger, TODAY, 4);
    const body = points.map((p) => p.totals.body);
    for (let i = 1; i < body.length; i++) {
      expect(body[i]).toBeGreaterThanOrEqual(body[i - 1] as number);
    }
    expect(body[body.length - 1]).toBe(25);
    expect(points[points.length - 1]?.totals.mind).toBe(5);
  });

  it('заработанное до окна графика входит в стартовый уровень', () => {
    const ledger = [entry('2025-01-01', 'body', 500)];
    const points = weeklyAttributeTotals(ledger, TODAY, 4);
    expect(points[0]?.totals.body).toBe(500);
    expect(points[points.length - 1]?.totals.body).toBe(500);
  });

  it('одна неделя с данными — кривую не рисуем', () => {
    // Вертикальный скачок у правого края читается как сбой отрисовки,
    // а не как рост.
    expect(hasWeeklyMovement(weeklyAttributeTotals([], TODAY, 6))).toBe(false);
    const single = [entry(addDays(TODAY, -3), 'body', 20)];
    expect(hasWeeklyMovement(weeklyAttributeTotals(single, TODAY, 6))).toBe(false);
  });

  it('две недели с приростом — кривую рисуем', () => {
    const ledger = [
      entry(addDays(TODAY, -3), 'body', 20),
      entry(addDays(TODAY, -10), 'body', 15),
    ];
    expect(hasWeeklyMovement(weeklyAttributeTotals(ledger, TODAY, 6))).toBe(true);
  });
});

describe('забуксовавшие привычки', () => {
  it('привычка, назначенная и не выполненная неделю, помечается', () => {
    const habit: Habit = makeHabit({ id: 'x', frequency: { kind: 'daily' } });
    expect(stalledHabits([habit], [], TODAY).map((h) => h.id)).toEqual(['x']);
  });

  it('недавнее выполнение снимает пометку', () => {
    const habit: Habit = makeHabit({ id: 'x', frequency: { kind: 'daily' } });
    const logs = [makeLog('x', addDays(TODAY, -2), 1, true)];
    expect(stalledHabits([habit], logs, TODAY)).toHaveLength(0);
  });

  it('негативные привычки не буксуют — их нельзя «не выполнить»', () => {
    const habit = makeHabit({ id: 'n', kind: 'negative' });
    expect(stalledHabits([habit], [], TODAY)).toHaveLength(0);
  });
});
