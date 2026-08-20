/**
 * Работа с игровыми сутками. Чистые функции, ноль зависимостей.
 *
 * Игровые сутки не совпадают с астрономическими: переход происходит
 * в `rolloverHour` (по умолчанию 4 утра), чтобы отметка в 01:30 ночи
 * относилась ко вчерашнему дню, а не к сегодняшнему.
 */

import type { DayKey, MonthKey } from './types';

const MS_PER_DAY = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Форматирует локальную дату в YYYY-MM-DD. */
export function formatDayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Разбирает YYYY-MM-DD в локальную полночь. */
export function parseDayKey(day: DayKey): Date {
  const parts = day.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Игровой день для момента времени с учётом часа перехода суток. */
export function dayKeyOf(at: Date, rolloverHour: number): DayKey {
  const shifted = new Date(at.getTime() - rolloverHour * 3_600_000);
  return formatDayKey(shifted);
}

export function monthKeyOf(day: DayKey): MonthKey {
  return day.slice(0, 7);
}

export function addDays(day: DayKey, delta: number): DayKey {
  const d = parseDayKey(day);
  d.setDate(d.getDate() + delta);
  return formatDayKey(d);
}

/** Количество полных суток между двумя днями (b − a). */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((parseDayKey(b).getTime() - parseDayKey(a).getTime()) / MS_PER_DAY);
}

/** День недели: 0 = воскресенье … 6 = суббота. */
export function weekdayOf(day: DayKey): number {
  return parseDayKey(day).getDay();
}

/** Понедельник недели, к которой относится день. */
export function startOfWeek(day: DayKey): DayKey {
  const wd = weekdayOf(day);
  // Смещение до понедельника: воскресенье (0) отстоит на 6 дней назад.
  const offset = wd === 0 ? 6 : wd - 1;
  return addDays(day, -offset);
}

/** Все дни недели, начиная с понедельника. */
export function weekDays(day: DayKey): DayKey[] {
  const start = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Список дней в диапазоне [from, to] включительно. */
export function daysInRange(from: DayKey, to: DayKey): DayKey[] {
  const n = daysBetween(from, to);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

const RU_MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const RU_WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function formatDayHuman(day: DayKey): string {
  const d = parseDayKey(day);
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()] ?? ''}`;
}

export function weekdayShort(day: DayKey): string {
  return RU_WEEKDAYS_SHORT[weekdayOf(day)] ?? '';
}

/** Склонение русского существительного по числу: (1, 'день','дня','дней'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
