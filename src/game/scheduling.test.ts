import { describe, expect, it } from 'vitest';
import {
  buildDaySchedule,
  buildLogIndex,
  completionsThisWeek,
  existsOnDay,
  isDayCompleted,
  isRequired,
  isScheduled,
} from './scheduling';
import { makeHabit, makeLog } from './testFixtures';

// 2026-01-12 — понедельник.
const MON = '2026-01-12';
const TUE = '2026-01-13';
const WED = '2026-01-14';
const FRI = '2026-01-16';
const SAT = '2026-01-17';
const SUN = '2026-01-18';

const empty = buildLogIndex([]);

describe('ежедневная привычка', () => {
  const habit = makeHabit({ frequency: { kind: 'daily' } });

  it('назначена и обязательна каждый день', () => {
    expect(isScheduled(habit, MON, empty)).toBe(true);
    expect(isRequired(habit, SUN, empty)).toBe(true);
  });

  it('выключенная не назначается и не штрафует', () => {
    const off = makeHabit({ active: false });
    expect(isScheduled(off, MON, empty)).toBe(false);
    expect(isRequired(off, MON, empty)).toBe(false);
  });
});

describe('привычка по конкретным дням', () => {
  // Понедельник, среда, пятница.
  const habit = makeHabit({ frequency: { kind: 'specificDays', days: [1, 3, 5] } });

  it('назначена только в свои дни', () => {
    expect(isScheduled(habit, MON, empty)).toBe(true);
    expect(isScheduled(habit, TUE, empty)).toBe(false);
    expect(isScheduled(habit, WED, empty)).toBe(true);
    expect(isScheduled(habit, FRI, empty)).toBe(true);
    expect(isScheduled(habit, SAT, empty)).toBe(false);
  });

  it('обязательна ровно в свои дни', () => {
    expect(isRequired(habit, WED, empty)).toBe(true);
    expect(isRequired(habit, TUE, empty)).toBe(false);
  });
});

describe('привычка N раз в неделю', () => {
  const habit = makeHabit({ frequency: { kind: 'timesPerWeek', times: 3 } });

  it('показывается, пока цель недели не закрыта', () => {
    expect(isScheduled(habit, MON, empty)).toBe(true);
  });

  it('НЕ обязательна в начале недели — гибкость без ложных провалов', () => {
    expect(isRequired(habit, MON, empty)).toBe(false);
    expect(isRequired(habit, TUE, empty)).toBe(false);
  });

  it('становится обязательной, когда дней осталось ровно столько, сколько нужно', () => {
    // Пятница: осталось пт, сб, вс = 3 дня, недобрано 3 → обязательна.
    expect(isRequired(habit, FRI, empty)).toBe(true);
  });

  it('перестаёт быть обязательной и назначенной после закрытия цели', () => {
    const index = buildLogIndex([
      makeLog(habit.id, MON, 1, true),
      makeLog(habit.id, TUE, 1, true),
      makeLog(habit.id, WED, 1, true),
    ]);
    expect(completionsThisWeek(habit, FRI, index)).toBe(3);
    expect(isRequired(habit, FRI, index)).toBe(false);
    expect(isScheduled(habit, FRI, index)).toBe(false);
  });

  it('учитывает частичное выполнение при расчёте обязательности', () => {
    const index = buildLogIndex([makeLog(habit.id, MON, 1, true)]);
    // Суббота: осталось сб, вс = 2 дня, недобрано 2 → обязательна.
    expect(isRequired(habit, SAT, index)).toBe(true);
  });
});

describe('негативная привычка', () => {
  const habit = makeHabit({ kind: 'negative', difficulty: 'hard' });

  it('всегда под рукой, но никогда не обязательна', () => {
    expect(isScheduled(habit, MON, empty)).toBe(true);
    expect(isRequired(habit, MON, empty)).toBe(false);
  });

  it('день засчитан, если срыв не отмечен', () => {
    expect(isDayCompleted(habit, undefined)).toBe(true);
    expect(isDayCompleted(habit, makeLog(habit.id, MON, 1, false))).toBe(false);
  });
});

describe('счётчик', () => {
  const habit = makeHabit({ kind: 'counter', target: 8 });

  it('засчитывается только при достижении цели', () => {
    expect(isDayCompleted(habit, makeLog(habit.id, MON, 7, false))).toBe(false);
    expect(isDayCompleted(habit, makeLog(habit.id, MON, 8, true))).toBe(true);
    expect(isDayCompleted(habit, makeLog(habit.id, MON, 9, true))).toBe(true);
  });
});

describe('расписание дня', () => {
  it('считает процент выполнения по обязательным привычкам', () => {
    const a = makeHabit({ id: 'a' });
    const b = makeHabit({ id: 'b' });
    const c = makeHabit({ id: 'c' });
    const index = buildLogIndex([makeLog('a', MON, 1, true), makeLog('b', MON, 1, true)]);
    const schedule = buildDaySchedule([a, b, c], MON, index);

    expect(schedule.dueCount).toBe(3);
    expect(schedule.doneCount).toBe(2);
    expect(schedule.completionRate).toBeCloseTo(2 / 3);
    expect(schedule.perfect).toBe(false);
  });

  it('пустой день нельзя провалить', () => {
    const schedule = buildDaySchedule([], MON, empty);
    expect(schedule.completionRate).toBe(1);
    expect(schedule.perfect).toBe(false);
  });

  it('идеальный день помечается', () => {
    const a = makeHabit({ id: 'a' });
    const index = buildLogIndex([makeLog('a', MON, 1, true)]);
    expect(buildDaySchedule([a], MON, index).perfect).toBe(true);
  });

  it('негативные привычки не входят в знаменатель', () => {
    const good = makeHabit({ id: 'good' });
    const bad = makeHabit({ id: 'bad', kind: 'negative' });
    const schedule = buildDaySchedule([good, bad], MON, empty);
    expect(schedule.dueCount).toBe(1);
    expect(schedule.scheduled).toHaveLength(2);
  });
});

describe('привычка не существует до дня заведения', () => {
  const index = buildLogIndex([]);

  it('не назначается на дни до создания', () => {
    // Календарь только что созданной привычки закрашивался тридцатью
    // красными днями: правило частоты «назначало» её на всё прошлое.
    const habit = makeHabit({
      frequency: { kind: 'daily' },
      createdAt: new Date('2026-01-15T10:00:00').getTime(),
    });
    expect(isRequired(habit, '2026-01-14', index)).toBe(false);
    expect(isRequired(habit, '2026-01-01', index)).toBe(false);
  });

  it('назначается со дня создания включительно', () => {
    const habit = makeHabit({
      frequency: { kind: 'daily' },
      createdAt: new Date('2026-01-15T10:00:00').getTime(),
    });
    expect(isRequired(habit, '2026-01-15', index)).toBe(true);
    expect(isRequired(habit, '2026-01-16', index)).toBe(true);
  });

  it('existsOnDay отвечает тем же', () => {
    const habit = makeHabit({ createdAt: new Date('2026-01-15T10:00:00').getTime() });
    expect(existsOnDay(habit, '2026-01-14')).toBe(false);
    expect(existsOnDay(habit, '2026-01-15')).toBe(true);
  });

  it('привычка, заведённая ночью до смены суток, принадлежит игровому дню', () => {
    // Сутки меняются в 4 утра. Привычка, созданная в 00:30 шестнадцатого,
    // относится к ИГРОВОМУ дню 15-го — иначе она «ещё не существует»
    // в текущем дне, выпадает из назначенных, и кольцо показывает 0 из 0.
    const habit = makeHabit({ createdAt: new Date('2026-01-16T00:30:00').getTime() });
    expect(existsOnDay(habit, '2026-01-15')).toBe(true);
    expect(existsOnDay(habit, '2026-01-14')).toBe(false);
  });

  it('назначается в ту же ночь, когда была заведена', () => {
    const habit = makeHabit({
      frequency: { kind: 'daily' },
      createdAt: new Date('2026-01-16T02:00:00').getTime(),
    });
    expect(isRequired(habit, '2026-01-15', index)).toBe(true);
  });
});
