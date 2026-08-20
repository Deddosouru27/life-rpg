/**
 * Игровые действия верхнего уровня: отметить привычку, откатить, завершить квест.
 *
 * АРХИТЕКТУРНОЕ ПРАВИЛО (CLAUDE.md, правило честности данных):
 * ни одна функция здесь не изменяет XP, золото, уровень, HP или атрибуты
 * персонажа напрямую. Она возвращает ЗАПИСИ ЖУРНАЛА, которые нужно добавить
 * или удалить, а состояние персонажа получается пересчётом всего журнала
 * функцией `projectCharacter`.
 *
 * Отсюда следует, что «отметил → откатил» возвращает состояние побайтово
 * не потому, что мы аккуратно вычли ту же сумму, а потому, что удалённой
 * записи больше нет в исходных данных — вычитать нечего.
 */

import {
  DAILY_BASE_XP_CAP,
  DAILY_GOLD_CAP,
  HP_LOSS_BY_NEGATIVE,
  XP_BY_DIFFICULTY,
} from './balance';
import { isDoubleXpActive } from './character';
import { checkAchievements } from './achievements';
import { markActive } from './dayEngine';
import {
  applyLedgerPatch,
  baseXpSpentOnDay,
  goldEarnedOnDay,
  habitEntriesFor,
  habitEntry,
  negativeEntry,
  projectCharacter,
  questEntry,
} from './ledger';
import { diffEvents, hpEvents } from './events';
import { baseXpForHabit, baseXpForQuest, clampToSoftCap, computeReward, unitBaseXp } from './rewards';
import type { RewardContext } from './rewards';
import type { Rng } from './rng';
import { effectiveTarget, isDayCompleted, logKey } from './scheduling';
import type { LogIndex } from './scheduling';
import type {
  Character,
  DayKey,
  GameEvent,
  Habit,
  HabitLog,
  LedgerEntry,
  Quest,
} from './types';

export interface ActionContext {
  character: Character;
  habits: readonly Habit[];
  logIndex: LogIndex;
  /** Полный журнал начислений — источник правды по экономике. */
  ledger: readonly LedgerEntry[];
  day: DayKey;
  rng: Rng;
  now: number;
}

/** Патч журнала: что добавить, что удалить. */
export interface LedgerPatch {
  added: LedgerEntry[];
  removedIds: string[];
}

export interface HabitToggleResult {
  /** Персонаж, пересчитанный из журнала с применённым патчем. */
  character: Character;
  habit: Habit;
  log: HabitLog;
  patch: LedgerPatch;
  events: GameEvent[];
  /** Изменение XP за это действие — для всплывающих цифр и записи дня. */
  xpGained: number;
  goldGained: number;
}

/**
 * Сумма базового XP всех активных привычек за идеальный день.
 *
 * Счётчик входит как ОДНА привычка (base), а не как base × target:
 * день одной привычки стоит один базовый XP этой привычки. Раньше здесь
 * было `× effectiveTarget(h)`, и это делало дневной потолок функцией
 * от чисел, которые игрок назначает сам.
 *
 * Функция осталась для UI (показать «идеальный день стоит N XP») —
 * дневным потолком она больше не управляет, потолок абсолютный.
 */
export function activeHabitsBaseXp(habits: readonly Habit[]): number {
  return habits
    .filter((h) => h.active && !h.deleted && h.kind !== 'negative')
    .reduce((sum, h) => sum + XP_BY_DIFFICULTY[h.difficulty], 0);
}

function rewardContext(character: Character, streak: number, day: DayKey): RewardContext {
  return {
    hp: character.hp,
    streak,
    prestigeSeals: character.prestigeSeals,
    critDrought: character.critDrought,
    doubleXpActive: isDoubleXpActive(character, day),
  };
}

function emptyLog(habitId: string, day: DayKey, now: number): HabitLog {
  return {
    id: logKey(habitId, day),
    habitId,
    day,
    count: 0,
    completed: false,
    grants: [],
    updatedAt: now,
  };
}

const noPatch = (): LedgerPatch => ({ added: [], removedIds: [] });

function unchanged(ctx: ActionContext, habit: Habit, log: HabitLog): HabitToggleResult {
  return {
    character: ctx.character,
    habit,
    log,
    patch: noPatch(),
    events: [],
    xpGained: 0,
    goldGained: 0,
  };
}

/** Пересчитывает персонажа с учётом патча — единственный путь к новым числам. */
function project(ctx: ActionContext, patch: LedgerPatch, base: Character): Character {
  const next = applyLedgerPatch(ctx.ledger, patch.added, patch.removedIds);
  return projectCharacter(base, next);
}

/**
 * Отмечает одну единицу выполнения привычки.
 *
 * - binary: 0 → 1, награда выдаётся.
 * - counter: +1, награда — доля базового XP по правилу счётчика.
 * - negative: +1 срыв, XP не выдаётся, записывается урон по HP.
 */
export function tickHabit(ctx: ActionContext, habit: Habit): HabitToggleResult {
  const { day, now } = ctx;
  const existing = ctx.logIndex.get(logKey(habit.id, day)) ?? emptyLog(habit.id, day, now);
  const target = effectiveTarget(habit);

  if (habit.kind === 'negative') return tickNegative(ctx, habit, existing);

  if (existing.count >= target) return unchanged(ctx, habit, existing);

  const seq = existing.count;
  const nextCount = seq + 1;

  // Абсолютный дневной потолок базового XP: не зависит ни от числа привычек,
  // ни от их целей. Множители применяются сверх него.
  const spent = baseXpSpentOnDay(ctx.ledger, day);
  const wanted = unitBaseXp(habit.kind, habit.difficulty, target, seq);
  const base = clampToSoftCap(wanted, spent, DAILY_BASE_XP_CAP);

  const events: GameEvent[] = [];
  let patch = noPatch();
  let xpGained = 0;
  let goldGained = 0;
  let critDrought = ctx.character.critDrought;

  if (base > 0) {
    const outcome = computeReward(
      base,
      habit.attribute,
      rewardContext(ctx.character, habit.currentStreak, day),
      ctx.rng,
    );
    critDrought = outcome.critDrought;

    // Дневной потолок золота — второй независимый предохранитель.
    // Редкая находка в 400 золота при дневном доходе 60 иначе стоила бы
    // недели дисциплины, полученной одним нажатием.
    const goldSoFar = goldEarnedOnDay(ctx.ledger, day);
    const rawGold =
      outcome.reward.gold +
      (outcome.reward.rareFind?.kind === 'gold' ? outcome.reward.rareFind.amount : 0);
    const allowedGold = Math.max(0, Math.min(rawGold, DAILY_GOLD_CAP - goldSoFar));

    const entry = habitEntry(habit.id, day, seq, outcome.reward, base, now);
    const capped: LedgerEntry = { ...entry, gold: allowedGold };
    patch = { added: [capped], removedIds: [] };

    events.push({ type: 'reward', reward: outcome.reward });
    xpGained = capped.xp;
    goldGained = capped.gold;
  }

  const log: HabitLog = {
    ...existing,
    count: nextCount,
    completed: nextCount >= target,
    grants: [],
    updatedAt: now,
  };

  let character = project(ctx, patch, {
    ...markActive(ctx.character, day, now),
    critDrought,
  });

  const before = ctx.character;
  events.push(...diffEvents(before, character));

  const achievements = checkAchievements(character);
  character = achievements.state;
  events.push(...achievements.events);

  return { character, habit, log, patch, events, xpGained, goldGained };
}

function tickNegative(ctx: ActionContext, habit: Habit, existing: HabitLog): HabitToggleResult {
  const { day, now } = ctx;
  const seq = existing.count;
  const log: HabitLog = {
    ...existing,
    count: seq + 1,
    completed: false,
    grants: [],
    updatedAt: now,
  };

  const damage = HP_LOSS_BY_NEGATIVE[habit.difficulty];
  const patch: LedgerPatch = {
    added: [negativeEntry(habit.id, day, seq, damage, now)],
    removedIds: [],
  };

  const character = project(ctx, patch, markActive(ctx.character, day, now));

  return {
    character,
    habit: { ...habit, currentStreak: 0, updatedAt: now },
    log,
    patch,
    events: hpEvents(ctx.character, character),
    xpGained: 0,
    goldGained: 0,
  };
}

/**
 * Снимает одну отметку — УДАЛЯЕТ соответствующую запись журнала.
 *
 * Отзывать награду арифметически не нужно и не нужно её помнить: после
 * удаления записи её просто нет в исходных данных, и пересчёт даёт ровно
 * то состояние, которое было до отметки. Это работает одинаково для крита,
 * редкой находки, множителя стрика и урона по HP от негативной привычки —
 * последнее старая реализация не возвращала вообще.
 */
export function untickHabit(ctx: ActionContext, habit: Habit): HabitToggleResult {
  const { day, now } = ctx;
  const existing = ctx.logIndex.get(logKey(habit.id, day));
  if (!existing || existing.count === 0) {
    return unchanged(ctx, habit, existing ?? emptyLog(habit.id, day, now));
  }

  const nextCount = existing.count - 1;
  const mine = habitEntriesFor(ctx.ledger, habit.id, day);
  const last = mine.find((e) => e.seq === nextCount);
  const patch: LedgerPatch = { added: [], removedIds: last ? [last.id] : [] };

  const character = project(ctx, patch, ctx.character);

  const log: HabitLog = {
    ...existing,
    count: nextCount,
    completed: habit.kind === 'negative' ? false : nextCount >= effectiveTarget(habit),
    grants: [],
    updatedAt: now,
  };

  return {
    character,
    habit,
    log,
    patch,
    events: [],
    xpGained: last ? -last.xp : 0,
    goldGained: last ? -last.gold : 0,
  };
}

/** Полностью закрыть привычку на день одним нажатием (счётчик — сразу до цели). */
export function completeHabitFully(ctx: ActionContext, habit: Habit): HabitToggleResult {
  let log = ctx.logIndex.get(logKey(habit.id, ctx.day)) ?? emptyLog(habit.id, ctx.day, ctx.now);
  let ledger: readonly LedgerEntry[] = ctx.ledger;
  let character = ctx.character;
  const added: LedgerEntry[] = [];
  const events: GameEvent[] = [];
  let xpGained = 0;
  let goldGained = 0;

  const target = effectiveTarget(habit);
  for (let guard = 0; guard <= target && !isDayCompleted(habit, log); guard++) {
    const index = new Map(ctx.logIndex);
    index.set(log.id, log);
    const step = tickHabit({ ...ctx, character, logIndex: index, ledger }, habit);
    if (step.log.count === log.count) break;

    log = step.log;
    character = step.character;
    added.push(...step.patch.added);
    ledger = applyLedgerPatch(ledger, step.patch.added, step.patch.removedIds);
    events.push(...step.events);
    xpGained += step.xpGained;
    goldGained += step.goldGained;
  }

  return {
    character,
    habit,
    log,
    patch: { added, removedIds: [] },
    events,
    xpGained,
    goldGained,
  };
}

/** Полностью откатить привычку на день — снять все отметки за день. */
export function untickHabitFully(ctx: ActionContext, habit: Habit): HabitToggleResult {
  const { day, now } = ctx;
  const existing = ctx.logIndex.get(logKey(habit.id, day));
  if (!existing || existing.count === 0) {
    return unchanged(ctx, habit, existing ?? emptyLog(habit.id, day, now));
  }

  const mine = habitEntriesFor(ctx.ledger, habit.id, day);
  const patch: LedgerPatch = { added: [], removedIds: mine.map((e) => e.id) };
  const character = project(ctx, patch, ctx.character);

  const log: HabitLog = { ...existing, count: 0, completed: false, grants: [], updatedAt: now };

  return {
    character,
    habit,
    log,
    patch,
    events: [],
    xpGained: -mine.reduce((s, e) => s + e.xp, 0),
    goldGained: -mine.reduce((s, e) => s + e.gold, 0),
  };
}

// ─────────────────────────────────────────── Квесты

export interface QuestCompleteResult {
  character: Character;
  quest: Quest;
  patch: LedgerPatch;
  events: GameEvent[];
  xpGained: number;
  goldGained: number;
}

/** Завершает квест. Повторное завершение ничего не делает. */
export function completeQuest(ctx: ActionContext, quest: Quest): QuestCompleteResult {
  if (quest.done) {
    return { character: ctx.character, quest, patch: noPatch(), events: [], xpGained: 0, goldGained: 0 };
  }

  const { day, now } = ctx;
  const spent = baseXpSpentOnDay(ctx.ledger, day);
  const base = clampToSoftCap(baseXpForQuest(quest.difficulty), spent, DAILY_BASE_XP_CAP);

  const events: GameEvent[] = [];
  let patch = noPatch();
  let xpGained = 0;
  let goldGained = 0;
  let critDrought = ctx.character.critDrought;

  if (base > 0) {
    const outcome = computeReward(
      base,
      quest.attribute,
      rewardContext(ctx.character, ctx.character.globalStreak, day),
      ctx.rng,
    );
    critDrought = outcome.critDrought;

    const goldSoFar = goldEarnedOnDay(ctx.ledger, day);
    const rawGold =
      outcome.reward.gold +
      (outcome.reward.rareFind?.kind === 'gold' ? outcome.reward.rareFind.amount : 0);
    const allowedGold = Math.max(0, Math.min(rawGold, DAILY_GOLD_CAP - goldSoFar));

    const entry = questEntry(quest.id, day, outcome.reward, base, now);
    const capped: LedgerEntry = {
      ...entry,
      gold: allowedGold,
      unlocksLocationId: quest.unlocksLocationId,
    };
    patch = { added: [capped], removedIds: [] };
    events.push({ type: 'reward', reward: outcome.reward });
    xpGained = capped.xp;
    goldGained = capped.gold;
  } else if (quest.unlocksLocationId) {
    // Награда упёрлась в дневной потолок, но открытие локации — не награда,
    // а продвижение по сюжету: его терять нельзя.
    const entry = questEntry(
      quest.id,
      day,
      { xp: 0, gold: 0, attribute: quest.attribute, crit: false, rareFind: null, streakMultiplier: 1 },
      0,
      now,
    );
    patch = { added: [{ ...entry, unlocksLocationId: quest.unlocksLocationId }], removedIds: [] };
  }

  let character = project(ctx, patch, {
    ...markActive(ctx.character, day, now),
    critDrought,
  });
  events.push(...diffEvents(ctx.character, character));

  const achievements = checkAchievements(character);
  character = achievements.state;
  events.push(...achievements.events);

  return {
    character,
    quest: { ...quest, done: true, completedAt: now, grant: null, updatedAt: now },
    patch,
    events,
    xpGained,
    goldGained,
  };
}

/** Открывает квест заново — удаляет его запись из журнала. */
export function reopenQuest(
  ctx: ActionContext,
  quest: Quest,
): { character: Character; quest: Quest; patch: LedgerPatch } {
  if (!quest.done) return { character: ctx.character, quest, patch: noPatch() };

  const mine = ctx.ledger.filter((e) => e.kind === 'quest' && e.refId === quest.id);
  const patch: LedgerPatch = { added: [], removedIds: mine.map((e) => e.id) };
  const character = project(ctx, patch, ctx.character);

  return {
    character,
    quest: { ...quest, done: false, completedAt: null, grant: null, updatedAt: ctx.now },
    patch,
  };
}

/** Базовый XP привычки — реэкспорт для UI, чтобы не тянуть balance напрямую. */
export { baseXpForHabit };
