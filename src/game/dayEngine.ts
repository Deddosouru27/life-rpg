/**
 * Вечерний cron — единственное место, где начисляются штрафы и обновляются стрики.
 * Запускается при первом открытии приложения после смены игровых суток.
 *
 * Гарантии, зафиксированные в docs/GAME_DESIGN.md §4:
 *  - XP, уровни, золото и купленное НИКОГДА не отнимаются.
 *  - Потеря HP за сутки ограничена HP_LOSS_DAILY_CAP.
 *  - Отсутствие ≥ COMEBACK_DAYS_THRESHOLD дней не наказывается ретроактивно вообще.
 *
 * Как и все действия игрока, cron не изменяет HP и золото напрямую: он
 * добавляет записи в журнал начислений, а состояние получается пересчётом.
 * Ключ записи cron содержит день и причину, поэтому повторный запуск за тот
 * же день перезапишет ту же запись вместо второго штрафа — идемпотентность
 * стала свойством данных, а не дисциплины кода.
 */

import {
  COMEBACK_DAYS_THRESHOLD,
  COMEBACK_HP,
  COMEBACK_STREAK_RATIO,
  GLOBAL_STREAK_THRESHOLD,
  HP_LOSS_DAILY_CAP,
  HP_LOSS_PER_MISS,
  HP_LOSS_QUEST_OVERDUE,
  HP_REGEN_HALF_DAY,
  HP_REGEN_PERFECT_DAY,
  HP_REGEN_THRESHOLD,
  MAX_CATCHUP_DAYS,
  PERFECT_DAY_GOLD,
  PERFECT_DAY_XP,
  SEASON_LENGTH_DAYS,
  SEASON_UNLOCK_LEVEL,
  STREAK_MILESTONES,
} from './balance';
import { grantPermanentFreeFreeze, rolloverMonth, tryConsumeFreeze } from './character';
import { checkAchievements } from './achievements';
import { diffEvents } from './events';
import {
  applyLedgerPatch,
  cronEntry,
  milestoneEntry,
  projectCharacter,
} from './ledger';
import { addDays, daysBetween, daysInRange, monthKeyOf } from './time';
import { buildDaySchedule, buildLogIndex, getLog, isDayCompleted } from './scheduling';
import type { LogIndex } from './scheduling';
import { ATTRIBUTE_IDS } from './types';
import type {
  AttributeId,
  Character,
  DayKey,
  DayRecord,
  GameEvent,
  Habit,
  HabitLog,
  LedgerEntry,
  Quest,
  SeasonRecord,
} from './types';

export interface CronInput {
  character: Character;
  habits: readonly Habit[];
  logs: readonly HabitLog[];
  quests: readonly Quest[];
  /** Журнал начислений — источник правды по HP, золоту и инвентарю. */
  ledger: readonly LedgerEntry[];
  /** Текущий игровой день. Он ещё не завершён и не обрабатывается. */
  today: DayKey;
  autoUseFreeze: boolean;
  now: number;
}

export interface CronOutput {
  character: Character;
  /** Записи по обработанным дням — их нужно сохранить в БД. */
  dayRecords: DayRecord[];
  /** Обновлённые привычки (стрики). Только изменившиеся. */
  habits: Habit[];
  /** Обновлённые квесты (штраф за просрочку). Только изменившиеся. */
  quests: Quest[];
  /** Новые записи журнала: штрафы, регенерация, бонусы, вехи. */
  ledgerAdded: LedgerEntry[];
  events: GameEvent[];
}

/** Изменяемый контекст прогона — чтобы не тащить восемь параметров через все функции. */
interface CronRun {
  character: Character;
  ledger: readonly LedgerEntry[];
  added: LedgerEntry[];
  events: GameEvent[];
  habitPatches: Map<string, Habit>;
  questPatches: Map<string, Quest>;
  dayRecords: DayRecord[];
}

/** Кладёт записи в журнал и пересчитывает персонажа. Единственный путь к новым числам. */
function commit(run: CronRun, entries: readonly LedgerEntry[]): void {
  if (entries.length === 0) return;
  run.added.push(...entries);
  run.ledger = applyLedgerPatch(run.ledger, entries, []);
  run.character = projectCharacter(run.character, run.ledger);
}

/**
 * Обрабатывает все завершённые дни между последним обработанным и сегодняшним.
 * Идемпотентна: повторный вызов в тот же день ничего не делает.
 */
export function runDailyCron(input: CronInput): CronOutput {
  const { habits, logs, today, now } = input;
  const before = projectCharacter(input.character, input.ledger);

  const run: CronRun = {
    character: rolloverMonth(before, today),
    ledger: input.ledger,
    added: [],
    events: [],
    habitPatches: new Map(),
    questPatches: new Map(),
    dayRecords: [],
  };

  const index = buildLogIndex(logs);

  // Первый запуск: просто отмечаем точку отсчёта, ничего не начисляем.
  if (run.character.lastProcessedDay === null) {
    run.character = { ...run.character, lastProcessedDay: addDays(today, -1), updatedAt: now };
  }

  const lastProcessed = run.character.lastProcessedDay ?? addDays(today, -1);
  const firstUnprocessed = addDays(lastProcessed, 1);
  const lastToProcess = addDays(today, -1);
  const pending = daysBetween(firstUnprocessed, lastToProcess) + 1;

  if (pending <= 0) {
    // Сутки не сменились. Обрабатываем только просроченные квесты и сезон.
    finalize(run, input, now);
    return output(run, before);
  }

  const daysAway =
    run.character.lastActiveDay === null
      ? pending
      : daysBetween(run.character.lastActiveDay, today);

  if (pending > MAX_CATCHUP_DAYS && daysAway >= COMEBACK_DAYS_THRESHOLD) {
    applyComeback(run, habits, today, lastToProcess, daysAway, now);
    finalize(run, input, now);
    return output(run, before);
  }

  // Обычная обработка: не более MAX_CATCHUP_DAYS дней подряд.
  const toProcess = daysInRange(firstUnprocessed, lastToProcess).slice(-MAX_CATCHUP_DAYS);
  for (const day of toProcess) {
    processSingleDay(run, habits, index, day, input.autoUseFreeze, now);
  }

  run.character = { ...run.character, lastProcessedDay: lastToProcess, updatedAt: now };
  finalize(run, input, now);
  return output(run, before);
}

function output(run: CronRun, before: Character): CronOutput {
  return {
    character: run.character,
    dayRecords: run.dayRecords,
    habits: [...run.habitPatches.values()],
    quests: [...run.questPatches.values()],
    ledgerAdded: run.added,
    events: [...run.events, ...diffEvents(before, run.character)],
  };
}

/**
 * ПРАВИЛО ВОЗВРАЩЕНИЯ — главный амортизатор.
 * Ретроактивных штрафов нет вообще, HP поднимается до пола, стрики банкуются.
 */
function applyComeback(
  run: CronRun,
  habits: readonly Habit[],
  today: DayKey,
  lastToProcess: DayKey,
  daysAway: number,
  now: number,
): void {
  const keptStreak = Math.floor(run.character.globalStreak * COMEBACK_STREAK_RATIO);
  run.events.push({ type: 'comeback', daysAway, streakKept: keptStreak });

  for (const habit of habits) {
    if (habit.deleted) continue;
    const banked = Math.floor(habit.currentStreak * COMEBACK_STREAK_RATIO);
    if (banked !== habit.currentStreak) {
      run.habitPatches.set(habit.id, { ...habit, currentStreak: banked, updatedAt: now });
    }
  }

  run.character = {
    ...run.character,
    globalStreak: keptStreak,
    lastProcessedDay: lastToProcess,
    updatedAt: now,
  };

  // HP поднимается записью-дельтой, а не присваиванием: история не переписывается.
  const lift = Math.max(0, COMEBACK_HP - run.character.hp);
  if (lift > 0) commit(run, [cronEntry(today, 'comeback', { hp: lift }, now)]);
}

function processSingleDay(
  run: CronRun,
  habits: readonly Habit[],
  index: LogIndex,
  day: DayKey,
  autoUseFreeze: boolean,
  now: number,
): void {
  run.character = rolloverMonth(run.character, day);

  const schedule = buildDaySchedule(habits, day, index);
  let hpLoss = 0;
  let freezeUsedToday = false;
  let freezeSeq = 0;

  // 1. Стрики отдельных привычек и урон за пропуск.
  for (const habit of schedule.required) {
    const current = run.habitPatches.get(habit.id) ?? habit;
    const done = isDayCompleted(current, getLog(index, current.id, day));

    if (done) {
      const streak = current.currentStreak + 1;
      run.habitPatches.set(current.id, {
        ...current,
        currentStreak: streak,
        bestStreak: Math.max(current.bestStreak, streak),
        lastCompletedDay: day,
        updatedAt: now,
      });
      continue;
    }

    if (autoUseFreeze && current.currentStreak > 0) {
      const attempt = tryConsumeFreeze(run.character, day, freezeSeq, now);
      if (attempt.used) {
        run.character = attempt.character;
        if (attempt.entry) {
          commit(run, [attempt.entry]);
          freezeSeq += 1;
        }
        freezeUsedToday = true;
        run.events.push({ type: 'freezeUsed', day, free: attempt.free });
        continue;
      }
    }

    if (current.currentStreak !== 0) {
      run.habitPatches.set(current.id, { ...current, currentStreak: 0, updatedAt: now });
    }
    hpLoss += HP_LOSS_PER_MISS;
  }

  hpLoss = Math.min(hpLoss, HP_LOSS_DAILY_CAP);

  // 2. Глобальный стрик.
  const counted = schedule.completionRate >= GLOBAL_STREAK_THRESHOLD;
  if (counted) {
    const streak = run.character.globalStreak + 1;
    run.character = {
      ...run.character,
      globalStreak: streak,
      bestGlobalStreak: Math.max(run.character.bestGlobalStreak, streak),
    };
    applyStreakMilestone(run, streak, day, now);
  } else if (run.character.globalStreak > 0 && !freezeUsedToday) {
    if (autoUseFreeze) {
      const attempt = tryConsumeFreeze(run.character, day, freezeSeq, now);
      if (attempt.used) {
        run.character = attempt.character;
        if (attempt.entry) commit(run, [attempt.entry]);
        freezeUsedToday = true;
        run.events.push({ type: 'freezeUsed', day, free: attempt.free });
      } else {
        run.character = { ...run.character, globalStreak: 0 };
      }
    } else {
      run.character = { ...run.character, globalStreak: 0 };
    }
  }

  // 3. Бонус идеального дня. Раньше он был описан в дизайне, но не начислялся.
  const entries: LedgerEntry[] = [];
  if (schedule.perfect) {
    entries.push(
      cronEntry(day, 'perfect', { xp: PERFECT_DAY_XP, gold: PERFECT_DAY_GOLD }, now),
    );
  }

  // 4. Урон и регенерация — ОДНОЙ записью с чистой дельтой.
  //
  // Двумя записями было бы нагляднее, но неверно: HP зажимается на каждой
  // записи, и при HP = 2 «−20, потом +8» упало бы в ноль, выдав ложные
  // события истощения и восстановления за один день. Сутки должны двигать
  // HP один раз.
  let hpGain = 0;
  if (schedule.perfect) hpGain = HP_REGEN_PERFECT_DAY;
  else if (schedule.completionRate >= HP_REGEN_THRESHOLD) hpGain = HP_REGEN_HALF_DAY;

  const netHp = hpGain - hpLoss;
  if (netHp !== 0) entries.push(cronEntry(day, 'hp', { hp: netHp }, now));

  const hpBefore = run.character.hp;
  commit(run, entries);
  const hpDelta = run.character.hp - hpBefore;

  // 5. Статистика идеальных дней.
  const perfectStreak = schedule.perfect ? run.character.stats.perfectDayStreak + 1 : 0;
  run.character = {
    ...run.character,
    stats: {
      ...run.character.stats,
      perfectDays: run.character.stats.perfectDays + (schedule.perfect ? 1 : 0),
      perfectDayStreak: perfectStreak,
      bestPerfectDayStreak: Math.max(run.character.stats.bestPerfectDayStreak, perfectStreak),
      daysPlayed: run.character.stats.daysPlayed + 1,
    },
    updatedAt: now,
  };

  run.dayRecords.push({
    day,
    dueCount: schedule.dueCount,
    doneCount: schedule.doneCount,
    completionRate: schedule.completionRate,
    perfect: schedule.perfect,
    counted,
    // XP и золото дня складываются из журнала — здесь только то, что дал cron.
    xpGained: schedule.perfect ? PERFECT_DAY_XP : 0,
    goldGained: schedule.perfect ? PERFECT_DAY_GOLD : 0,
    hpDelta,
    freezeUsed: freezeUsedToday,
    updatedAt: now,
  });
}

function applyStreakMilestone(run: CronRun, streak: number, day: DayKey, now: number): void {
  const milestone = STREAK_MILESTONES.find((m) => m.days === streak);
  if (!milestone) return;

  if (milestone.freeFreeze) run.character = grantPermanentFreeFreeze(run.character);
  if (milestone.gold > 0 || milestone.frame) {
    commit(run, [milestoneEntry(streak, day, milestone.gold, milestone.frame, now)]);
  }

  run.events.push({
    type: 'streakMilestone',
    days: streak,
    goldReward: milestone.gold,
    title: milestone.title,
  });
}

/** Общие шаги, выполняемые независимо от того, сменились ли сутки. */
function finalize(run: CronRun, cron: CronInput, now: number): void {
  applyOverdueQuests(run, cron, now);
  advanceSeason(run, cron.today);
  const achievements = checkAchievements(run.character);
  if (achievements.events.length > 0) run.events.push(...achievements.events);
  run.character = achievements.state;
}

function applyOverdueQuests(run: CronRun, cron: CronInput, now: number): void {
  let totalLoss = 0;

  for (const quest of cron.quests) {
    if (quest.deleted || quest.done || quest.overduePenaltyApplied) continue;
    if (quest.dueDay === null) continue;
    if (daysBetween(quest.dueDay, cron.today) <= 0) continue;
    run.questPatches.set(quest.id, { ...quest, overduePenaltyApplied: true, updatedAt: now });
    totalLoss += HP_LOSS_QUEST_OVERDUE;
  }

  if (totalLoss > 0) {
    const capped = Math.min(totalLoss, HP_LOSS_DAILY_CAP);
    commit(run, [cronEntry(cron.today, 'overdue', { hp: -capped }, now)]);
  }
}

/** Открывает первый сезон и закрывает истёкший. */
function advanceSeason(run: CronRun, today: DayKey): void {
  const character = run.character;
  if (character.level < SEASON_UNLOCK_LEVEL) return;

  if (character.season === null) {
    run.character = {
      ...character,
      season: {
        index: character.seasonHistory.length + 1,
        startDay: today,
        xp: 0,
        tier: 0,
        claimedTiers: [],
      },
    };
    return;
  }

  const elapsed = daysBetween(character.season.startDay, today);
  if (elapsed < SEASON_LENGTH_DAYS) return;

  const record = buildSeasonRecord(character, today);
  run.events.push({ type: 'seasonEnded', record });

  run.character = {
    ...character,
    seasonHistory: [...character.seasonHistory, record],
    season: {
      index: character.season.index + 1,
      startDay: today,
      xp: 0,
      tier: 0,
      claimedTiers: [],
    },
  };
}

function buildSeasonRecord(character: Character, endDay: DayKey): SeasonRecord {
  const season = character.season;
  let top: AttributeId = 'discipline';
  let topLevel = -1;
  for (const id of ATTRIBUTE_IDS) {
    const lvl = character.attributes[id].level;
    if (lvl > topLevel) {
      topLevel = lvl;
      top = id;
    }
  }
  return {
    index: season?.index ?? 1,
    startDay: season?.startDay ?? endDay,
    endDay,
    tierReached: season?.tier ?? 0,
    bestStreak: character.bestGlobalStreak,
    completionRate: 0,
    topAttribute: top,
    crits: character.stats.totalCrits,
  };
}

/** Помечает день как активный — вызывается при любой отметке игрока. */
export function markActive(character: Character, day: DayKey, now: number): Character {
  if (character.lastActiveDay === day) return character;
  const rolled = rolloverMonth(character, day);
  return { ...rolled, lastActiveDay: day, updatedAt: now };
}

/** Текущий месяц персонажа — вспомогательное для UI. */
export function currentMonth(day: DayKey): string {
  return monthKeyOf(day);
}
