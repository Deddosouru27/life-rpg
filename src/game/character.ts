/**
 * Чистые операции над персонажем: создание, начисление наград, изменение HP,
 * расходники, перерождение. Ни одна функция не мутирует вход — все возвращают копию.
 */

import {
  CONSUMABLE_EFFECT_HP,
  FREE_FREEZE_CAP,
  FREE_FREEZE_START,
  MAX_HP,
} from './balance';
import { useConsumableEntry } from './ledger';
import { cumulativeXpForLevel } from './progression';
import { monthKeyOf } from './time';
import { ATTRIBUTE_IDS } from './types';
import type {
  AttributeId,
  AttributeState,
  Character,
  CharacterStats,
  ConsumableId,
  ConsumableStock,
  DayKey,
  LedgerEntry,
} from './types';

// ─────────────────────────────────────────── Создание

function emptyAttributes(): Record<AttributeId, AttributeState> {
  const out = {} as Record<AttributeId, AttributeState>;
  for (const id of ATTRIBUTE_IDS) out[id] = { level: 1, xp: 0 };
  return out;
}

function emptyConsumables(month: string): Record<ConsumableId, ConsumableStock> {
  const zero = (): ConsumableStock => ({ owned: 0, purchasedThisMonth: 0, month });
  return {
    streakFreeze: zero(),
    healthElixir: zero(),
    doubleXpScroll: zero(),
    indulgence: zero(),
  };
}

export function emptyStats(): CharacterStats {
  return {
    totalCompletions: 0,
    totalCrits: 0,
    totalGoldEarned: 0,
    totalGoldSpent: 0,
    perfectDays: 0,
    perfectDayStreak: 0,
    bestPerfectDayStreak: 0,
    questsCompleted: 0,
    daysPlayed: 0,
  };
}

export function createCharacter(name: string, today: DayKey, now: number): Character {
  const month = monthKeyOf(today);
  return {
    id: 'me',
    name: name.trim() || 'Странник',
    level: 1,
    xp: 0,
    gold: 0,
    hp: MAX_HP,
    attributes: emptyAttributes(),
    xpOffset: 0,
    globalStreak: 0,
    bestGlobalStreak: 0,
    lastProcessedDay: null,
    lastActiveDay: null,
    consumables: emptyConsumables(month),
    freeFreezesLeft: FREE_FREEZE_START,
    freeFreezesPerMonth: FREE_FREEZE_START,
    freeFreezeMonth: month,
    critDrought: 0,
    ownedCosmetics: [],
    unlockedLocations: ['town'],
    equippedTheme: null,
    equippedFrame: null,
    equippedTitle: null,
    prestigeSeals: 0,
    doubleXpDay: null,
    season: null,
    seasonHistory: [],
    unlockedAchievements: [],
    stats: emptyStats(),
    updatedAt: now,
  };
}

// ─────────────────────────────────────────── Расходники
//
// Инвентарь расходников — тоже свёртка журнала (см. ledger.ts). Функции ниже
// только ОТВЕЧАЮТ НА ВОПРОС, можно ли действие; сами они инвентарь не меняют.

/** Есть ли расходник в наличии. */
export function hasConsumable(character: Character, id: ConsumableId): boolean {
  return character.consumables[id].owned > 0;
}

/** Сбрасывает месячные счётчики покупок и бесплатные заморозки при смене месяца. */
export function rolloverMonth(character: Character, day: DayKey): Character {
  const month = monthKeyOf(day);
  let next = character;

  if (character.freeFreezeMonth !== month) {
    next = {
      ...next,
      freeFreezeMonth: month,
      freeFreezesLeft: next.freeFreezesPerMonth,
    };
  }

  let changed = false;
  const consumables = { ...next.consumables };
  for (const key of Object.keys(consumables) as ConsumableId[]) {
    const stock = consumables[key];
    if (stock.month !== month) {
      consumables[key] = { ...stock, month, purchasedThisMonth: 0 };
      changed = true;
    }
  }
  if (changed) next = { ...next, consumables };

  return next;
}

/**
 * Пытается погасить пропуск заморозкой.
 *
 * Бесплатные автозаморозки — месячное довольствие, а не имущество: они живут
 * на персонаже. Купленная заморозка — имущество, поэтому её списание идёт
 * записью в журнал, и вызывающий обязан эту запись сохранить.
 */
export function tryConsumeFreeze(
  character: Character,
  day: DayKey,
  seq: number,
  now: number,
): { character: Character; used: boolean; free: boolean; entry: LedgerEntry | null } {
  if (character.freeFreezesLeft > 0) {
    return {
      character: { ...character, freeFreezesLeft: character.freeFreezesLeft - 1 },
      used: true,
      free: true,
      entry: null,
    };
  }
  if (character.consumables.streakFreeze.owned > 0) {
    return {
      character,
      used: true,
      free: false,
      entry: useConsumableEntry('streakFreeze', day, seq, 0, now),
    };
  }
  return { character, used: false, free: false, entry: null };
}

/** Использовать эликсир жизни — возвращает запись журнала, а не новое HP. */
export function useHealthElixir(
  character: Character,
  day: DayKey,
  seq: number,
  now: number,
): LedgerEntry | null {
  if (!hasConsumable(character, 'healthElixir')) return null;
  return useConsumableEntry('healthElixir', day, seq, CONSUMABLE_EFFECT_HP, now);
}

/** Развернуть свиток двойного XP на указанный день. */
export function useDoubleXpScroll(
  character: Character,
  day: DayKey,
  seq: number,
  now: number,
): { character: Character; entry: LedgerEntry } | null {
  if (character.doubleXpDay === day) return null;
  if (!hasConsumable(character, 'doubleXpScroll')) return null;
  return {
    character: { ...character, doubleXpDay: day, updatedAt: now },
    entry: useConsumableEntry('doubleXpScroll', day, seq, 0, now),
  };
}

export function isDoubleXpActive(character: Character, day: DayKey): boolean {
  return character.doubleXpDay === day;
}

/** Прибавляет постоянную бесплатную автозаморозку (награда за веху стрика). */
export function grantPermanentFreeFreeze(character: Character): Character {
  const perMonth = Math.min(FREE_FREEZE_CAP, character.freeFreezesPerMonth + 1);
  const delta = perMonth - character.freeFreezesPerMonth;
  return {
    ...character,
    freeFreezesPerMonth: perMonth,
    freeFreezesLeft: character.freeFreezesLeft + delta,
  };
}

// ─────────────────────────────────────────── Перерождение

/**
 * Перерождение обнуляет глобальный уровень. Поскольку уровень — свёртка
 * журнала, обнулить его мутацией нельзя: пересчёт вернул бы прежнее значение.
 * Вместо этого фиксируется точка отсчёта `xpOffset`: сколько совокупного XP
 * не учитывается в текущем цикле. История при этом не переписывается —
 * журнал остаётся полным, и `totalXp` по-прежнему честно показывает всё
 * заработанное за всё время.
 */
export function prestige(character: Character, today: DayKey, now: number): Character {
  return {
    ...character,
    xpOffset: character.xpOffset + cumulativeXpForLevel(character.level) + character.xp,
    prestigeSeals: character.prestigeSeals + 1,
    lastProcessedDay: today,
    updatedAt: now,
  };
}
