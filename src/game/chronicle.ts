/**
 * ЛЕТОПИСЬ — накопительные числа для экрана героя.
 *
 * Всё здесь — чистые функции от записей в БД (логи привычек и журнал
 * начислений). Ни одно число не хранится отдельно и не инкрементируется:
 * иначе оно разъедется с правдой ровно так же, как разъезжались уровень
 * и золото до перехода на журнал.
 *
 * Почему именно эти счётчики. Уровень и XP — абстракция: «17-й уровень»
 * ничего не говорит о жизни. «46 тренировок» и «83 дня без сахара» —
 * говорят. Это и есть ощущение «я персонаж игры»: не полоска растёт,
 * а видно, из чего она выросла.
 */

import { ABANDON_DAYS } from './balance';
import { buildLogIndex, isDayCompleted, isRequired, isScheduled } from './scheduling';
import { addDays, daysBetween } from './time';
import { ATTRIBUTE_IDS } from './types';
import type { AttributeId, DayKey, Habit, HabitLog, LedgerEntry } from './types';

// ─────────────────────────────────────────── Предметные счётчики

/**
 * Как счётчик находит свои привычки.
 *
 * Ищем по `presetId`, а не по названию: игрок переименовывает привычки, и
 * поиск по строке «Тренировка» развалился бы на первой же правке. Свои
 * привычки, созданные с нуля, в предметные счётчики не попадают — у них
 * нет пресета, и угадывать смысл по названию мы не будем.
 */
export interface TallySpec {
  id: string;
  label: string;
  /** Единица измерения для подписи. */
  unit: 'times' | 'days';
  presetIds: readonly string[];
  /**
   * `positive` — считаем выполненные дни.
   * `clean`    — считаем дни БЕЗ отметки срыва (негативные привычки).
   */
  mode: 'positive' | 'clean';
}

export const TALLY_SPECS: readonly TallySpec[] = [
  {
    id: 'training',
    label: 'Тренировок проведено',
    unit: 'times',
    presetIds: ['body-training', 'body-run', 'body-pushups', 'body-stretch'],
    mode: 'positive',
  },
  {
    id: 'reading',
    label: 'Дней с чтением',
    unit: 'days',
    presetIds: ['mind-reading', 'mind-notes', 'mind-course'],
    mode: 'positive',
  },
  {
    id: 'prayer',
    label: 'Дней с намазом',
    unit: 'days',
    presetIds: ['spirit-fajr', 'spirit-quran'],
    mode: 'positive',
  },
  {
    id: 'no-sugar',
    label: 'Дней без сахара',
    unit: 'days',
    presetIds: ['body-no-sugar'],
    mode: 'clean',
  },
  {
    id: 'no-porn',
    label: 'Дней воздержания',
    unit: 'days',
    presetIds: ['spirit-no-porn'],
    mode: 'clean',
  },
  {
    id: 'no-social',
    label: 'Дней без лент',
    unit: 'days',
    presetIds: ['mind-no-social', 'mind-no-youtube'],
    mode: 'clean',
  },
] as const;

export interface Tally {
  id: string;
  label: string;
  unit: TallySpec['unit'];
  value: number;
  /** Привычка не заведена — счётчик показывать нечего. */
  tracked: boolean;
}

/**
 * Считает предметные счётчики.
 *
 * Для `positive` — число дней, в которые привычка была закрыта.
 * Для `clean` — число дней от заведения привычки до сегодня, в которые
 * срыв НЕ отмечен. Считаем только назначенные дни: привычка «3 раза в
 * неделю» не должна приписывать себе чистые выходные.
 */
export function computeTallies(
  habits: readonly Habit[],
  logs: readonly HabitLog[],
  today: DayKey,
): Tally[] {
  const index = buildLogIndex(logs);
  const byPreset = new Map<string, Habit[]>();
  for (const h of habits) {
    if (h.deleted || !h.presetId) continue;
    const list = byPreset.get(h.presetId) ?? [];
    list.push(h);
    byPreset.set(h.presetId, list);
  }

  return TALLY_SPECS.map((spec) => {
    const matched = spec.presetIds.flatMap((id) => byPreset.get(id) ?? []);
    if (matched.length === 0) {
      return { id: spec.id, label: spec.label, unit: spec.unit, value: 0, tracked: false };
    }

    if (spec.mode === 'positive') {
      let count = 0;
      for (const log of logs) {
        const habit = matched.find((h) => h.id === log.habitId);
        if (!habit) continue;
        if (isDayCompleted(habit, log)) count += 1;
      }
      return { id: spec.id, label: spec.label, unit: spec.unit, value: count, tracked: true };
    }

    // clean: дни без отметки срыва, начиная со дня заведения привычки.
    let clean = 0;
    for (const habit of matched) {
      const start = habit.createdAt;
      const startDay = new Date(start).toISOString().slice(0, 10);
      const span = Math.max(0, daysBetween(startDay, today));
      for (let i = 0; i <= span; i++) {
        const day = addDays(startDay, i);
        if (!isScheduled(habit, day, index)) continue;
        const log = index.get(`${habit.id}|${day}`);
        if (!log || log.count === 0) clean += 1;
      }
    }
    return { id: spec.id, label: spec.label, unit: spec.unit, value: clean, tracked: true };
  });
}

/** Сколько дней прошло с первого дня в системе. */
export function daysInSystem(ledger: readonly LedgerEntry[], today: DayKey): number {
  if (ledger.length === 0) return 1;
  let first = today;
  for (const e of ledger) if (e.day < first) first = e.day;
  return Math.max(1, daysBetween(first, today) + 1);
}

// ─────────────────────────────────────────── График по неделям

export interface WeekPoint {
  /** Понедельник недели. */
  weekStart: DayKey;
  /** Совокупный XP атрибута на конец недели. */
  totals: Record<AttributeId, number>;
}

/**
 * Совокупный XP каждого атрибута по неделям — данные для графика роста.
 *
 * Берётся из журнала начислений, поэтому график показывает ровно то же,
 * что и уровни атрибутов: одна правда, два представления. Возвращаются
 * НАКОПЛЕННЫЕ значения, а не недельные приросты — растущая кривая
 * читается как «мой путь», а столбики недельного прироста читаются как
 * отчётность.
 */
export function weeklyAttributeTotals(
  ledger: readonly LedgerEntry[],
  today: DayKey,
  weeks = 12,
): WeekPoint[] {
  const zero = (): Record<AttributeId, number> => {
    const out = {} as Record<AttributeId, number>;
    for (const id of ATTRIBUTE_IDS) out[id] = 0;
    return out;
  };

  // Начало текущей недели по понедельникам, затем шаг назад по неделям.
  const weekdayMonday0 = (day: DayKey): number => {
    const d = new Date(`${day}T00:00:00`).getDay();
    return (d + 6) % 7;
  };
  const thisWeekStart = addDays(today, -weekdayMonday0(today));
  const starts: DayKey[] = [];
  for (let i = weeks - 1; i >= 0; i--) starts.push(addDays(thisWeekStart, -7 * i));

  const running = zero();
  const firstStart = starts[0] ?? thisWeekStart;

  // Всё, что заработано до окна графика, входит в стартовый уровень кривой.
  for (const e of ledger) {
    if (e.attribute === null || e.xp <= 0) continue;
    if (e.day < firstStart) running[e.attribute] += e.xp;
  }

  const points: WeekPoint[] = [];
  for (const start of starts) {
    const end = addDays(start, 6);
    for (const e of ledger) {
      if (e.attribute === null || e.xp <= 0) continue;
      if (e.day >= start && e.day <= end) running[e.attribute] += e.xp;
    }
    points.push({ weekStart: start, totals: { ...running } });
  }

  return points;
}

/**
 * Стоит ли рисовать кривую.
 *
 * Требуется прирост минимум в ДВУХ разных неделях, а не просто разница между
 * краями окна. Одна неделя с данными даёт вертикальный скачок у правого края
 * — формально верную линию, которая читается как сбой отрисовки. Две точки
 * роста — минимум, на котором кривая означает «направление», а не «событие».
 */
export function hasWeeklyMovement(points: readonly WeekPoint[]): boolean {
  if (points.length < 2) return false;
  let weeksWithGrowth = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (!prev || !cur) continue;
    if (ATTRIBUTE_IDS.some((id) => cur.totals[id] > prev.totals[id])) weeksWithGrowth += 1;
  }
  return weeksWithGrowth >= 2;
}

// ─────────────────────────────────────────── Брошенные привычки

/** Реэкспорт порога: экран героя показывает его в подписи. */
export { ABANDON_DAYS };

/** Привычки, назначенные сегодня и ни разу не выполненные за последнюю неделю. */
export function stalledHabits(
  habits: readonly Habit[],
  logs: readonly HabitLog[],
  today: DayKey,
): Habit[] {
  const index = buildLogIndex(logs);
  return habits.filter((habit) => {
    if (!habit.active || habit.deleted || habit.kind === 'negative') return false;
    let missed = 0;
    for (let i = 1; i <= ABANDON_DAYS * 2; i++) {
      const day = addDays(today, -i);
      if (!isRequired(habit, day, index)) continue;
      if (isDayCompleted(habit, index.get(`${habit.id}|${day}`))) return false;
      missed += 1;
      if (missed >= ABANDON_DAYS) return true;
    }
    return false;
  });
}
