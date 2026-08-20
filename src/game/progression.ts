/**
 * Кривые опыта, уровни, ранги, HP-ступени, сезонная шкала.
 * Всё — чистые функции над числами. См. docs/GAME_DESIGN.md §1, §2, §5.5.
 */

import {
  ATTR_XP_BASE,
  ATTR_XP_EXPONENT,
  HP_STAGE_THRESHOLDS,
  MAX_ATTR_LEVEL,
  MAX_LEVEL,
  PRESTIGE_GOLD_BONUS,
  PRESTIGE_XP_BONUS,
  RANK_THRESHOLDS,
  SEASON_TIERS,
  SEASON_XP_BASE,
  SEASON_XP_STEP,
  STREAK_BONUS_PER_WEEK,
  STREAK_DAYS_PER_STEP,
  STREAK_MULTIPLIER_CAP,
  XP_BASE,
  XP_EXPONENT,
} from './balance';
import { RANK_ORDER } from './types';
import type { HpStage, Rank } from './types';

// ─────────────────────────────────────────── Глобальный уровень

/** XP, необходимый для перехода с уровня L на L+1. */
export function xpToNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return Number.POSITIVE_INFINITY;
  return Math.round(XP_BASE * Math.pow(Math.max(1, level), XP_EXPONENT));
}

/** Совокупный XP, необходимый чтобы достичь уровня L с нуля. */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < Math.min(level, MAX_LEVEL); i++) total += xpToNextLevel(i);
  return total;
}

export interface LevelUpOutcome {
  level: number;
  xp: number;
  levelsGained: number;
}

/** Применяет XP к уровню, обрабатывая цепочку повышений. */
export function applyXp(level: number, xp: number, gained: number): LevelUpOutcome {
  let lvl = level;
  let cur = xp + Math.max(0, gained);
  let gainedLevels = 0;
  while (lvl < MAX_LEVEL) {
    const need = xpToNextLevel(lvl);
    if (cur < need) break;
    cur -= need;
    lvl += 1;
    gainedLevels += 1;
  }
  if (lvl >= MAX_LEVEL) {
    lvl = MAX_LEVEL;
    cur = 0;
  }
  return { level: lvl, xp: cur, levelsGained: gainedLevels };
}

/**
 * Снимает XP, откатывая уровни назад. Обратная операция к applyXp.
 *
 * Нужна только для отмены собственной отметки игрока — то есть для исправления
 * ошибки ввода. Система провалов её не использует: пропуск дня, истощение и
 * возвращение опыт не трогают (GAME_DESIGN.md §4).
 */
export function revokeXp(level: number, xp: number, amount: number): LevelUpOutcome {
  let lvl = level;
  let cur = xp - Math.max(0, amount);
  let lost = 0;
  while (cur < 0 && lvl > 1) {
    lvl -= 1;
    cur += xpToNextLevel(lvl);
    lost += 1;
  }
  // Ниже первого уровня и нулевого опыта опускаться некуда.
  if (cur < 0) cur = 0;
  return { level: lvl, xp: cur, levelsGained: -lost };
}

/** Снимает XP атрибута, откатывая его уровни назад. */
export function revokeAttrXp(level: number, xp: number, amount: number): LevelUpOutcome {
  let lvl = level;
  let cur = xp - Math.max(0, amount);
  let lost = 0;
  while (cur < 0 && lvl > 1) {
    lvl -= 1;
    cur += attrXpToNextLevel(lvl);
    lost += 1;
  }
  if (cur < 0) cur = 0;
  return { level: lvl, xp: cur, levelsGained: -lost };
}

/**
 * Уровень и остаток XP по СОВОКУПНОМУ заработанному XP.
 *
 * Это и есть та «чистая функция от записей», которую требует CLAUDE.md:
 * сумма XP по журналу начислений однозначно задаёт уровень, независимо от
 * порядка суммирования и от того, сколько раз пересчёт запускался.
 * Пара applyXp/revokeXp остаётся для арифметики внутри дня, но правдой
 * является именно эта функция.
 */
export function levelForTotalXp(total: number): { level: number; xp: number } {
  let lvl = 1;
  let left = Math.max(0, Math.round(total));
  while (lvl < MAX_LEVEL) {
    const need = xpToNextLevel(lvl);
    if (left < need) break;
    left -= need;
    lvl += 1;
  }
  if (lvl >= MAX_LEVEL) return { level: MAX_LEVEL, xp: 0 };
  return { level: lvl, xp: left };
}

/** То же для шкалы атрибута. */
export function attrLevelForTotalXp(total: number): { level: number; xp: number } {
  let lvl = 1;
  let left = Math.max(0, Math.round(total));
  while (lvl < MAX_ATTR_LEVEL) {
    const need = attrXpToNextLevel(lvl);
    if (left < need) break;
    left -= need;
    lvl += 1;
  }
  if (lvl >= MAX_ATTR_LEVEL) return { level: MAX_ATTR_LEVEL, xp: 0 };
  return { level: lvl, xp: left };
}

/** То же для сезонной шкалы. */
export function seasonTierForTotalXp(total: number): { tier: number; xp: number } {
  let t = 0;
  let left = Math.max(0, Math.round(total));
  while (t < SEASON_TIERS) {
    const need = seasonXpToNextTier(t);
    if (left < need) break;
    left -= need;
    t += 1;
  }
  if (t >= SEASON_TIERS) return { tier: SEASON_TIERS, xp: 0 };
  return { tier: t, xp: left };
}

/** Доля до следующего уровня, 0..1. */
export function levelProgress(level: number, xp: number): number {
  const need = xpToNextLevel(level);
  if (!Number.isFinite(need)) return 1;
  return Math.min(1, Math.max(0, xp / need));
}

// ─────────────────────────────────────────── Атрибуты

export function attrXpToNextLevel(level: number): number {
  if (level >= MAX_ATTR_LEVEL) return Number.POSITIVE_INFINITY;
  return Math.round(ATTR_XP_BASE * Math.pow(Math.max(1, level), ATTR_XP_EXPONENT));
}

export function applyAttrXp(level: number, xp: number, gained: number): LevelUpOutcome {
  let lvl = level;
  let cur = xp + Math.max(0, gained);
  let gainedLevels = 0;
  while (lvl < MAX_ATTR_LEVEL) {
    const need = attrXpToNextLevel(lvl);
    if (cur < need) break;
    cur -= need;
    lvl += 1;
    gainedLevels += 1;
  }
  if (lvl >= MAX_ATTR_LEVEL) {
    lvl = MAX_ATTR_LEVEL;
    cur = 0;
  }
  return { level: lvl, xp: cur, levelsGained: gainedLevels };
}

export function attrLevelProgress(level: number, xp: number): number {
  const need = attrXpToNextLevel(level);
  if (!Number.isFinite(need)) return 1;
  return Math.min(1, Math.max(0, xp / need));
}

// ─────────────────────────────────────────── Ранги

/** Ранг по глобальному уровню. */
export function rankForLevel(level: number): Rank {
  let result: Rank = 'E';
  for (const rank of RANK_ORDER) {
    if (level >= RANK_THRESHOLDS[rank]) result = rank;
  }
  return result;
}

/** Следующий ранг, либо null если достигнут максимум. */
export function nextRank(rank: Rank): Rank | null {
  const i = RANK_ORDER.indexOf(rank);
  return i >= 0 && i < RANK_ORDER.length - 1 ? (RANK_ORDER[i + 1] ?? null) : null;
}

/** Уровень, с которого начинается следующий ранг, либо null. */
export function levelForNextRank(level: number): number | null {
  const nr = nextRank(rankForLevel(level));
  return nr === null ? null : RANK_THRESHOLDS[nr];
}

/** Числовой индекс ранга — для сравнения «не ниже чем». */
export function rankIndex(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

export function rankAtLeast(rank: Rank, required: Rank): boolean {
  return rankIndex(rank) >= rankIndex(required);
}

// ─────────────────────────────────────────── HP

/** Ступень состояния по текущему HP. */
export function hpStage(hp: number): HpStage {
  if (hp >= HP_STAGE_THRESHOLDS.healthy) return 'healthy';
  if (hp >= HP_STAGE_THRESHOLDS.worn) return 'worn';
  if (hp >= HP_STAGE_THRESHOLDS.wounded) return 'wounded';
  return 'exhausted';
}

// ─────────────────────────────────────────── Стрики

/** Множитель наград от длины стрика: +10% за каждые 7 дней, потолок ×1.5. */
export function streakMultiplier(streak: number): number {
  const steps = Math.floor(Math.max(0, streak) / STREAK_DAYS_PER_STEP);
  return Math.min(STREAK_MULTIPLIER_CAP, 1 + steps * STREAK_BONUS_PER_WEEK);
}

// ─────────────────────────────────────────── Перерождение

export function prestigeXpMultiplier(seals: number): number {
  return 1 + Math.max(0, seals) * PRESTIGE_XP_BONUS;
}

export function prestigeGoldMultiplier(seals: number): number {
  return 1 + Math.max(0, seals) * PRESTIGE_GOLD_BONUS;
}

export function canPrestige(level: number): boolean {
  return level >= MAX_LEVEL;
}

// ─────────────────────────────────────────── Сезонная шкала

/** XP, нужный для перехода со ступени t на t+1. */
export function seasonXpToNextTier(tier: number): number {
  if (tier >= SEASON_TIERS) return Number.POSITIVE_INFINITY;
  return SEASON_XP_BASE + SEASON_XP_STEP * Math.max(1, tier);
}

export function applySeasonXp(tier: number, xp: number, gained: number): LevelUpOutcome {
  let t = tier;
  let cur = xp + Math.max(0, gained);
  let gainedTiers = 0;
  while (t < SEASON_TIERS) {
    const need = seasonXpToNextTier(t);
    if (cur < need) break;
    cur -= need;
    t += 1;
    gainedTiers += 1;
  }
  if (t >= SEASON_TIERS) {
    t = SEASON_TIERS;
    cur = 0;
  }
  return { level: t, xp: cur, levelsGained: gainedTiers };
}

export function seasonTierProgress(tier: number, xp: number): number {
  const need = seasonXpToNextTier(tier);
  if (!Number.isFinite(need)) return 1;
  return Math.min(1, Math.max(0, xp / need));
}
