/**
 * Магазин: цены, лимиты, покупка, «желанная покупка».
 * См. docs/GAME_DESIGN.md §3.
 *
 * Экономика структурно не инфлирует: фонтан ограничен сутками,
 * все стоки — hard sinks, множителя золота от уровня/ранга нет.
 */

import {
  CONSUMABLES,
  FALLBACK_DAILY_GOLD,
  HP_STAGE_ALLOWS_TRAVEL,
  HP_STAGE_MAX_COSMETIC_TIER,
  PACE_MIN_DAYS,
  PACE_WINDOW_DAYS,
  REAL_REWARD_TENGE_RATE,
  REAL_REWARD_TIERS,
} from './balance';
import {
  consumablePurchaseEntry,
  cosmeticPurchaseEntry,
  realPurchaseEntry,
} from './ledger';
import { hpStage, rankAtLeast, rankForLevel } from './progression';
import type {
  CatalogItem,
  Character,
  ConsumableId,
  DayKey,
  DayRecord,
  GameLocation,
  LedgerEntry,
  RealReward,
  RealRewardTier,
} from './types';

/** Ступень здоровья персонажа — короткий селектор. */
const hpStageOfCharacter = (c: Character): ReturnType<typeof hpStage> => hpStage(c.hp);

// ─────────────────────────────────────────── Цены расходников

/**
 * Текущая цена расходника с учётом уже сделанных покупок в этом месяце.
 * Рост цены внутри месяца — сток, поглощающий излишек золота у самых активных.
 */
export function consumablePrice(character: Character, id: ConsumableId): number {
  const cfg = CONSUMABLES[id];
  const bought = character.consumables[id].purchasedThisMonth;
  return Math.round(cfg.price * Math.pow(cfg.priceGrowth, bought));
}

export type PurchaseBlock =
  | null
  | 'notEnoughGold'
  | 'inventoryFull'
  | 'monthlyLimit'
  | 'alreadyOwned'
  | 'rankTooLow'
  | 'hidden';

/** Почему покупку нельзя совершить. null = можно. */
export function consumableBlock(character: Character, id: ConsumableId): PurchaseBlock {
  const cfg = CONSUMABLES[id];
  const stock = character.consumables[id];
  if (stock.owned >= cfg.maxOwned) return 'inventoryFull';
  if (stock.purchasedThisMonth >= cfg.maxPerMonth) return 'monthlyLimit';
  if (character.gold < consumablePrice(character, id)) return 'notEnoughGold';
  return null;
}

/**
 * Покупка расходника — ЗАПИСЬ В ЖУРНАЛ, а не изменение персонажа.
 * Золото, инвентарь и счётчик покупок за месяц получатся пересчётом.
 */
export function buyConsumable(
  character: Character,
  id: ConsumableId,
  day: DayKey,
  now: number,
): LedgerEntry | null {
  if (consumableBlock(character, id) !== null) return null;
  const price = consumablePrice(character, id);
  const seq = character.consumables[id].purchasedThisMonth;
  return consumablePurchaseEntry(id, day, seq, price, now);
}

// ─────────────────────────────────────────── Косметика

/** Видна ли косметика в витрине при текущем ранге и состоянии здоровья. */
export function isCosmeticVisible(character: Character, item: CatalogItem): boolean {
  if (item.seasonal) return false;
  const stage = hpStageOfCharacter(character);
  if (item.tier > HP_STAGE_MAX_COSMETIC_TIER[stage]) return false;
  if (item.requiredRank && !rankAtLeast(rankForLevel(character.level), item.requiredRank)) {
    return false;
  }
  return true;
}

export function cosmeticBlock(character: Character, item: CatalogItem): PurchaseBlock {
  if (character.ownedCosmetics.includes(item.id)) return 'alreadyOwned';
  if (!isCosmeticVisible(character, item)) {
    if (item.requiredRank && !rankAtLeast(rankForLevel(character.level), item.requiredRank)) {
      return 'rankTooLow';
    }
    return 'hidden';
  }
  if (character.gold < item.price) return 'notEnoughGold';
  return null;
}

export function buyCosmetic(
  character: Character,
  item: CatalogItem,
  day: DayKey,
  now: number,
): LedgerEntry | null {
  if (cosmeticBlock(character, item) !== null) return null;
  return cosmeticPurchaseEntry(item.id, day, item.price, item.unlocksLocationId, now);
}

// ─────────────────────────────────────────── Реальные награды

/** Рекомендованная цена по реальной стоимости в тенге. */
export function goldFromTenge(tenge: number): number {
  return Math.max(1, Math.round(tenge / REAL_REWARD_TENGE_RATE));
}

/** Тир награды по её цене. */
export function tierForPrice(price: number): RealRewardTier {
  if (price >= REAL_REWARD_TIERS.large.min) return 'large';
  if (price >= REAL_REWARD_TIERS.medium.min) return 'medium';
  return 'small';
}

/**
 * Средний дневной доход золота за последние PACE_WINDOW_DAYS дней.
 *
 * `today` исключается: текущий день ещё не закончен, и учитывать его —
 * значит систематически занижать темп (три золота в 9 утра превращаются
 * в «399 дней до покупки»). Пока полных дней меньше PACE_MIN_DAYS,
 * используется резервное значение из баланса.
 */
export function dailyGoldPace(records: readonly DayRecord[], today?: string): number {
  const complete = records.filter((r) => r.day !== today);
  const recent = [...complete].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, PACE_WINDOW_DAYS);
  if (recent.length < PACE_MIN_DAYS) return FALLBACK_DAILY_GOLD;
  const sum = recent.reduce((acc, r) => acc + r.goldGained, 0);
  return Math.max(1, sum / recent.length);
}

/** «≈ N дней при твоём темпе» — сколько ещё копить до этой цены. */
export function daysToAfford(price: number, gold: number, pace: number): number {
  const missing = Math.max(0, price - gold);
  return Math.ceil(missing / Math.max(1, pace));
}

/** Тир large скрывается при истощении — роскошь недоступна на дне. */
export function isRealRewardVisible(character: Character, reward: RealReward): boolean {
  if (reward.archived || reward.deleted) return false;
  if (reward.tier === 'large' && hpStage(character.hp) === 'exhausted') return false;
  return true;
}

export function realRewardBlock(character: Character, reward: RealReward): PurchaseBlock {
  if (!isRealRewardVisible(character, reward)) return 'hidden';
  if (character.gold < reward.price) return 'notEnoughGold';
  return null;
}

export function buyRealReward(
  character: Character,
  reward: RealReward,
  day: DayKey,
  now: number,
): { entry: LedgerEntry; reward: RealReward } | null {
  if (realRewardBlock(character, reward) !== null) return null;
  return {
    entry: realPurchaseEntry(reward.id, day, reward.purchasedCount, reward.price, now),
    reward: { ...reward, purchasedCount: reward.purchasedCount + 1, updatedAt: now },
  };
}

// ─────────────────────────────────────────── Желанная покупка

export interface Aspiration {
  name: string;
  icon: string;
  price: number;
  missing: number;
  days: number;
}

/**
 * Самый дешёвый товар ДОРОЖЕ текущего баланса.
 * Гарантирует, что на любом балансе есть конкретная видимая цель чуть выше него.
 */
export function pickAspiration(
  gold: number,
  pace: number,
  candidates: readonly { name: string; icon: string; price: number }[],
): Aspiration | null {
  let best: { name: string; icon: string; price: number } | null = null;
  for (const c of candidates) {
    if (c.price <= gold) continue;
    if (best === null || c.price < best.price) best = c;
  }
  if (best === null) return null;
  return {
    name: best.name,
    icon: best.icon,
    price: best.price,
    missing: best.price - gold,
    days: daysToAfford(best.price, gold, pace),
  };
}

// ─────────────────────────────────────────── Локации

/** Доступна ли локация: открыта квестом/покупкой И позволяет состояние здоровья. */
export function isLocationAccessible(character: Character, location: GameLocation): boolean {
  if (location.isStarting) return true;
  if (!character.unlockedLocations.includes(location.id)) return false;
  return HP_STAGE_ALLOWS_TRAVEL[hpStageOfCharacter(character)];
}
