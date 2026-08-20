/**
 * Расчёт наград за одно действие: базовый XP, множители, крит, редкая находка.
 * Чистые функции: состояние крит-счётчика передаётся внутрь и возвращается наружу.
 * См. docs/GAME_DESIGN.md §2.2, §3.
 */

import {
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  CRIT_PITY_THRESHOLD,
  EXHAUSTION_GOLD_MULTIPLIER,
  GOLD_RATIO,
  RARE_FIND_CHANCE,
  RARE_FIND_CONSUMABLE_SHARE,
  RARE_FIND_GOLD_MAX,
  RARE_FIND_GOLD_MIN,
  XP_BY_DIFFICULTY,
  XP_BY_QUEST_DIFFICULTY,
} from './balance';
import { hpStage, prestigeGoldMultiplier, prestigeXpMultiplier, streakMultiplier } from './progression';
import type { Rng } from './rng';
import type {
  AttributeId,
  ConsumableId,
  Difficulty,
  QuestDifficulty,
  RareFind,
  RewardBreakdown,
} from './types';

export function baseXpForHabit(difficulty: Difficulty): number {
  return XP_BY_DIFFICULTY[difficulty];
}

export function baseXpForQuest(difficulty: QuestDifficulty): number {
  return XP_BY_QUEST_DIFFICULTY[difficulty];
}

export function goldForXp(xp: number): number {
  return Math.round(xp * GOLD_RATIO);
}

/** Контекст персонажа, влияющий на награду. */
export interface RewardContext {
  hp: number;
  streak: number;
  prestigeSeals: number;
  critDrought: number;
  doubleXpActive: boolean;
}

export interface RewardOutcome {
  reward: RewardBreakdown;
  /** Новое значение счётчика pity-таймера. */
  critDrought: number;
}

const RARE_FIND_POOL: readonly ConsumableId[] = [
  'streakFreeze',
  'healthElixir',
  'indulgence',
] as const;

/**
 * Полный расчёт награды за одно завершённое действие.
 *
 * Порядок: база → множитель стрика → крит → удвоение свитком → перерождение → истощение (только золото).
 * Истощение бьёт только по золоту и отключает случайные бонусы — XP не трогает никогда.
 */
export function computeReward(
  baseXp: number,
  attribute: AttributeId,
  ctx: RewardContext,
  rng: Rng,
): RewardOutcome {
  const stage = hpStage(ctx.hp);
  const exhausted = stage === 'exhausted';

  const mult = streakMultiplier(ctx.streak);

  // Крит: обычный шанс либо гарантия по pity-таймеру. При истощении криты выключены.
  const pityReady = ctx.critDrought >= CRIT_PITY_THRESHOLD;
  const crit = !exhausted && (pityReady || rng.chance(CRIT_CHANCE));
  const critDrought = crit ? 0 : ctx.critDrought + 1;

  let xp = baseXp * mult;
  if (crit) xp *= CRIT_MULTIPLIER;
  if (ctx.doubleXpActive) xp *= 2;
  xp *= prestigeXpMultiplier(ctx.prestigeSeals);
  xp = Math.round(xp);

  let gold = goldForXp(baseXp) * mult;
  if (crit) gold *= CRIT_MULTIPLIER;
  gold *= prestigeGoldMultiplier(ctx.prestigeSeals);
  if (exhausted) gold *= EXHAUSTION_GOLD_MULTIPLIER;
  gold = Math.round(gold);

  const rareFind = !exhausted && rng.chance(RARE_FIND_CHANCE) ? rollRareFind(rng) : null;

  return {
    reward: { xp, gold, attribute, crit, rareFind, streakMultiplier: mult },
    critDrought,
  };
}

function rollRareFind(rng: Rng): RareFind {
  if (rng.chance(RARE_FIND_CONSUMABLE_SHARE)) {
    const id = rng.pick(RARE_FIND_POOL) ?? 'healthElixir';
    return { kind: 'consumable', consumableId: id };
  }
  return { kind: 'gold', amount: rng.int(RARE_FIND_GOLD_MIN, RARE_FIND_GOLD_MAX) };
}

/** Урезает награду до остатка дневного лимита. */
export function clampToSoftCap(xp: number, alreadyGained: number, cap: number): number {
  if (alreadyGained >= cap) return 0;
  return Math.min(xp, cap - alreadyGained);
}

/**
 * Базовый XP за одну отметку привычки-счётчика.
 *
 * ПРАВИЛО: один день одной привычки стоит ровно один базовый XP этой
 * привычки, сколько бы отметок в него ни входило. «8 стаканов воды»
 * (лёгкая, 8 XP) даёт по 1 XP за стакан — восемь стаканов дают восемь.
 * Раньше давало 8 за каждый стакан, то есть 64 за день, и цель счётчика
 * работала как множитель награды. Именно это делало счётчик фермой.
 *
 * Распределение точно суммируется в base: остатки округления не теряются
 * и не удваиваются. Отметки, на которые базового XP не хватает (цель
 * больше базового XP, например 50 отжиманий при 25 XP), дают 0 XP и
 * только двигают прогресс — и это правильный сигнал: дробить одно дело
 * на пятьдесят нажатий не должно быть выгоднее, чем отметить его один раз.
 *
 * @param unitIndex номер отметки с нуля.
 */
export function counterUnitBaseXp(base: number, target: number, unitIndex: number): number {
  const t = Math.max(1, target);
  const i = Math.max(0, Math.min(t - 1, unitIndex));
  return Math.round((base * (i + 1)) / t) - Math.round((base * i) / t);
}

/** Базовый XP за одну отметку любой привычки, с учётом правила счётчика. */
export function unitBaseXp(
  kind: 'binary' | 'counter' | 'negative',
  difficulty: Difficulty,
  target: number,
  unitIndex: number,
): number {
  const base = baseXpForHabit(difficulty);
  if (kind !== 'counter') return base;
  return counterUnitBaseXp(base, target, unitIndex);
}
