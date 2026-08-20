/**
 * Локальная телеметрия.
 *
 * Зачем она нужна именно здесь: внешних данных об удержании habit-трекеров
 * в разрезе механик не существует (docs/RESEARCH.md §0.1 — единственное
 * найденное измерение относится к другому предмету и даёт медиану 5.5 дня).
 * Значит балансную модель нельзя откалибровать по литературе — только по
 * собственному поведению. Численная оптимизация баланса отложена именно до
 * того момента, когда этих записей наберётся достаточно: подбирать числа
 * по выдуманным персонам — значит измерять свои допущения, а не поведение.
 *
 * Ничего не уходит наружу: события пишутся в IndexedDB и уезжают вместе
 * с файлом сейва.
 */

import { ABANDON_DAYS } from './balance';
import { buildLogIndex, isDayCompleted, isRequired } from './scheduling';
import { addDays } from './time';
import type {
  AbandonedHabit,
  DayKey,
  Habit,
  HabitLog,
  TelemetryEvent,
  TelemetryKind,
} from './types';

/**
 * Ключ события. Содержит время, поэтому события не сливаются: телеметрия —
 * это поток наблюдений, а не состояние, и повторы в ней информативны.
 */
export function telemetryEvent(
  kind: TelemetryKind,
  day: DayKey,
  at: number,
  refId: string | null = null,
  value: number | null = null,
  meta: string | null = null,
): TelemetryEvent {
  return {
    id: `${at.toString(36)}-${kind}-${refId ?? ''}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    day,
    kind,
    refId,
    value,
    meta,
  };
}

// ─────────────────────────────────────────── Производные показатели

/**
 * Брошенные привычки: назначались ABANDON_DAYS дней подряд и ни разу не были
 * выполнены. Не записываются событием, а вычисляются из логов — иначе пришлось
 * бы угадывать момент «бросил», которого в данных не существует.
 */
export function abandonedHabits(
  habits: readonly Habit[],
  logs: readonly HabitLog[],
  today: DayKey,
): AbandonedHabit[] {
  const index = buildLogIndex(logs);
  const out: AbandonedHabit[] = [];

  for (const habit of habits) {
    if (!habit.active || habit.deleted || habit.kind === 'negative') continue;

    let missed = 0;
    for (let i = 1; i <= ABANDON_DAYS * 3; i++) {
      const day = addDays(today, -i);
      if (!isRequired(habit, day, index)) continue;
      if (isDayCompleted(habit, index.get(`${habit.id}|${day}`))) break;
      missed += 1;
      if (missed >= ABANDON_DAYS) break;
    }

    if (missed >= ABANDON_DAYS) {
      out.push({
        habitId: habit.id,
        title: habit.title,
        missedDays: missed,
        lastCompletedDay: habit.lastCompletedDay,
      });
    }
  }

  return out;
}

/**
 * Сколько раз в день игрок открывал приложение — прямая метрика «есть ли
 * повод зайти». Симуляция считает её теоретически, телеметрия — фактически.
 */
export function opensPerDay(events: readonly TelemetryEvent[]): Record<DayKey, number> {
  const out: Record<DayKey, number> = {};
  for (const e of events) {
    if (e.kind !== 'appOpen') continue;
    out[e.day] = (out[e.day] ?? 0) + 1;
  }
  return out;
}

/** Средняя частота заходов за последние N дней с данными. */
export function averageOpensPerDay(events: readonly TelemetryEvent[], days = 14): number {
  const byDay = opensPerDay(events);
  const keys = Object.keys(byDay).sort().slice(-days);
  if (keys.length === 0) return 0;
  const sum = keys.reduce((s, k) => s + (byDay[k] ?? 0), 0);
  return sum / keys.length;
}

/**
 * Дни БЕЗ единого открытия приложения между первым и последним днём истории.
 *
 * Отдельного события «не открыл» не существует и не может существовать:
 * приложение в этот день не запускалось. Поэтому пропуски выводятся из
 * разрывов в ряду открытий — это единственный честный способ их получить.
 */
export function daysWithoutOpening(events: readonly TelemetryEvent[]): DayKey[] {
  const days = Object.keys(opensPerDay(events)).sort();
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];

  const present = new Set(days);
  const out: DayKey[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (!present.has(day)) out.push(day);
  }
  return out;
}

/** Сколько времени провели на каждом экране, в миллисекундах. */
export function timeByScreen(events: readonly TelemetryEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (e.kind !== 'screenView' || !e.refId || e.value === null) continue;
    // Отбрасываем аномально длинные интервалы: вкладка могла провисеть
    // открытой сутки, и это не «время использования».
    if (e.value > 30 * 60_000) continue;
    out[e.refId] = (out[e.refId] ?? 0) + e.value;
  }
  return out;
}

/** Товары, которые показывали, но ни разу не купили. */
export function viewedNotBought(events: readonly TelemetryEvent[]): string[] {
  const bought = new Set(
    events.filter((e) => e.kind === 'purchase' && e.refId).map((e) => e.refId as string),
  );
  const viewed = new Set(
    events.filter((e) => e.kind === 'itemViewed' && e.refId).map((e) => e.refId as string),
  );
  return [...viewed].filter((id) => !bought.has(id));
}

/** Сводка телеметрии для экрана настроек — чтобы данные были видны, а не только выгружаемы. */
export interface TelemetrySummary {
  totalEvents: number;
  daysTracked: number;
  opensLast14: number;
  averageOpensPerDay: number;
  missedDays: number;
  ticks: number;
  unticks: number;
  purchases: number;
  blockedPurchases: number;
  viewedNotBought: number;
  stalledSignals: number;
  minutesInApp: number;
}

export function summarizeTelemetry(events: readonly TelemetryEvent[]): TelemetrySummary {
  const count = (kind: TelemetryKind): number => events.filter((e) => e.kind === kind).length;
  const byDay = opensPerDay(events);
  const last14 = Object.keys(byDay).sort().slice(-14);
  const totalMs = Object.values(timeByScreen(events)).reduce((s, v) => s + v, 0);
  return {
    totalEvents: events.length,
    daysTracked: Object.keys(byDay).length,
    opensLast14: last14.reduce((s, k) => s + (byDay[k] ?? 0), 0),
    averageOpensPerDay: averageOpensPerDay(events),
    missedDays: daysWithoutOpening(events).length,
    ticks: count('habitTick') + count('habitComplete'),
    unticks: count('habitUntick'),
    purchases: count('purchase'),
    blockedPurchases: count('purchaseBlocked'),
    viewedNotBought: viewedNotBought(events).length,
    stalledSignals: count('habitStalled'),
    minutesInApp: Math.round(totalMs / 60_000),
  };
}
