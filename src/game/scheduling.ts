/**
 * Какие привычки назначены на день и какие из них обязательны.
 *
 * Различаем два понятия:
 *  - SCHEDULED — привычка показывается в списке на сегодня.
 *  - REQUIRED  — пропуск штрафуется и учитывается в проценте выполнения дня.
 *
 * Для `timesPerWeek` они расходятся: привычка «3 раза в неделю» показывается
 * все дни, пока цель недели не закрыта, но обязательной становится только
 * тогда, когда оставшихся дней недели ровно столько же, сколько недобрано.
 * Это убирает ложные провалы у гибких привычек.
 */

import type { DayKey, Habit, HabitLog } from './types';
import { DEFAULT_DAY_ROLLOVER_HOUR } from './balance';
import { addDays, dayKeyOf, daysBetween, startOfWeek, weekdayOf } from './time';

/** Индекс логов: `${habitId}|${day}` → лог. */
export type LogIndex = ReadonlyMap<string, HabitLog>;

export function logKey(habitId: string, day: DayKey): string {
  return `${habitId}|${day}`;
}

export function buildLogIndex(logs: readonly HabitLog[]): LogIndex {
  const map = new Map<string, HabitLog>();
  for (const log of logs) map.set(log.id, log);
  return map;
}

export function getLog(index: LogIndex, habitId: string, day: DayKey): HabitLog | undefined {
  return index.get(logKey(habitId, day));
}

/** Считает завершённые дни привычки в неделе, к которой относится `day`, до `day` включительно. */
export function completionsThisWeek(habit: Habit, day: DayKey, index: LogIndex): number {
  const start = startOfWeek(day);
  const passed = daysBetween(start, day);
  let count = 0;
  for (let i = 0; i <= passed; i++) {
    const log = getLog(index, habit.id, addDays(start, i));
    if (log?.completed) count += 1;
  }
  return count;
}

/** Показывается ли привычка в списке на этот день. */
export function isScheduled(habit: Habit, day: DayKey, index: LogIndex): boolean {
  if (!habit.active || habit.deleted) return false;
  // Негативные привычки — всегда под рукой: срыв может случиться в любой день.
  if (habit.kind === 'negative') return true;
  switch (habit.frequency.kind) {
    case 'daily':
      return true;
    case 'specificDays':
      return habit.frequency.days.includes(weekdayOf(day));
    case 'timesPerWeek': {
      const done = completionsThisWeek(habit, day, index);
      const log = getLog(index, habit.id, day);
      // Уже отмеченную сегодня привычку не прячем.
      if (log?.completed) return true;
      return done < habit.frequency.times;
    }
  }
}

/**
 * Существовала ли привычка в этот день.
 *
 * До дня заведения привычка не могла быть ни выполнена, ни пропущена.
 * Без этой проверки календарь только что созданной привычки закрашивался
 * тридцатью красными днями: правило частоты формально «назначало» её на
 * все прошедшие дни. Человек, впервые открывший приложение, видел месяц
 * провалов — ровно ту спираль вины, против которой построена вся система
 * (GAME_DESIGN.md §4).
 */
export function existsOnDay(
  habit: Habit,
  day: DayKey,
  rolloverHour = DEFAULT_DAY_ROLLOVER_HOUR,
): boolean {
  // Сравнивать надо ИГРОВОЙ день с ИГРОВЫМ, а не с календарным.
  // Первая версия брала календарную дату `createdAt`, и между полуночью и
  // часом смены суток привычка, заведённая только что, считалась «ещё не
  // существующей»: игровой день — вчерашний, календарный — уже сегодняшний.
  // Все привычки разом выпадали из назначенных, и кольцо дня показывало 0 из 0.
  return day >= dayKeyOf(new Date(habit.createdAt), rolloverHour);
}

/** Штрафуется ли пропуск этой привычки в этот день. */
export function isRequired(habit: Habit, day: DayKey, index: LogIndex): boolean {
  if (!habit.active || habit.deleted) return false;
  if (!existsOnDay(habit, day)) return false;
  // Негативная привычка не может быть «пропущена» — её нельзя не выполнить.
  if (habit.kind === 'negative') return false;
  switch (habit.frequency.kind) {
    case 'daily':
      return true;
    case 'specificDays':
      return habit.frequency.days.includes(weekdayOf(day));
    case 'timesPerWeek': {
      const target = habit.frequency.times;
      const done = completionsThisWeek(habit, day, index);
      if (done >= target) return false;
      const remainingIncludingToday = 7 - daysBetween(startOfWeek(day), day);
      const needed = target - done;
      return remainingIncludingToday <= needed;
    }
  }
}

/** Считается ли день выполненным для этой привычки по её логу. */
export function isDayCompleted(habit: Habit, log: HabitLog | undefined): boolean {
  if (habit.kind === 'negative') return !log || log.count === 0;
  const count = log?.count ?? 0;
  return count >= effectiveTarget(habit);
}

/** Целевое число отметок за день. */
export function effectiveTarget(habit: Habit): number {
  return habit.kind === 'counter' ? Math.max(1, habit.target) : 1;
}

export interface DaySchedule {
  day: DayKey;
  scheduled: Habit[];
  required: Habit[];
  /** Обязательные привычки, выполненные за этот день. */
  requiredDone: Habit[];
  dueCount: number;
  doneCount: number;
  /** doneCount / dueCount; 1, если обязательных нет (нельзя провалить пустой день). */
  completionRate: number;
  perfect: boolean;
}

/** Полная картина дня: что назначено, что обязательно, что сделано. */
export function buildDaySchedule(
  habits: readonly Habit[],
  day: DayKey,
  index: LogIndex,
): DaySchedule {
  const scheduled: Habit[] = [];
  const required: Habit[] = [];
  const requiredDone: Habit[] = [];

  for (const habit of habits) {
    if (isScheduled(habit, day, index)) scheduled.push(habit);
    if (isRequired(habit, day, index)) {
      required.push(habit);
      if (isDayCompleted(habit, getLog(index, habit.id, day))) requiredDone.push(habit);
    }
  }

  const dueCount = required.length;
  const doneCount = requiredDone.length;
  const completionRate = dueCount === 0 ? 1 : doneCount / dueCount;

  return {
    day,
    scheduled,
    required,
    requiredDone,
    dueCount,
    doneCount,
    completionRate,
    perfect: dueCount > 0 && doneCount === dueCount,
  };
}
