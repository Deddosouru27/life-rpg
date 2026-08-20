/**
 * ЖУРНАЛ НАЧИСЛЕНИЙ — ядро честности данных.
 *
 * Правило из CLAUDE.md: «XP, золото, уровень, HP, стрики обязаны быть ЧИСТОЙ
 * ФУНКЦИЕЙ от записей о выполнении в БД. Никогда не инкрементировать состояние
 * мутацией в обработчике клика.»
 *
 * Здесь это правило реализовано буквально. Единственный способ изменить
 * экономику — добавить или удалить запись журнала. Величины персонажа
 * (уровень, XP, золото, HP, атрибуты, инвентарь, купленное) НИКОГДА не
 * инкрементируются: они каждый раз пересчитываются функцией `foldLedger`
 * из полного набора записей.
 *
 * Что это даёт, кроме соответствия правилу:
 *
 *  1. Отмена возвращает состояние побайтово. Не «вычитает награду обратно»
 *     (что невозможно сделать точно для недетерминированной награды), а
 *     удаляет запись и пересчитывает всё заново.
 *  2. Двойной тап не может начислить дважды. Ключ записи детерминирован,
 *     поэтому повторное применение того же действия перезаписывает ту же
 *     запись. Гонка между двумя обработчиками клика перестаёт быть опасной.
 *  3. Порядок записи не влияет на результат для XP, золота и атрибутов —
 *     это суммы. Влияет только на HP, потому что HP зажимается в границах;
 *     поэтому HP складывается в строго определённом порядке.
 */

import { MAX_HP } from './balance';
import {
  attrLevelForTotalXp,
  levelForTotalXp,
  seasonTierForTotalXp,
} from './progression';
import { monthKeyOf } from './time';
import { ATTRIBUTE_IDS } from './types';
import type {
  AttributeId,
  AttributeState,
  Character,
  ConsumableId,
  DayKey,
  LedgerEntry,
  LedgerKind,
  MonthKey,
  RewardBreakdown,
} from './types';

// ─────────────────────────────────────────── Ключи

/**
 * Детерминированный ключ записи.
 *
 * Одинаковое действие обязано дать одинаковый ключ — на этом стоит защита
 * от двойного начисления. Поэтому в ключ входит всё, что отличает одно
 * начисление от другого, и НИЧЕГО из того, что меняется само (никаких
 * Date.now(), никаких случайных id).
 */
export function ledgerId(kind: LedgerKind, refId: string, day: DayKey, seq: number): string {
  return `${kind}|${refId}|${day}|${seq}`;
}

/** Пустая запись — основа для конструкторов. */
function blank(
  kind: LedgerKind,
  refId: string,
  day: DayKey,
  seq: number,
  createdAt: number,
): LedgerEntry {
  return {
    id: ledgerId(kind, refId, day, seq),
    kind,
    day,
    refId,
    seq,
    xp: 0,
    baseXp: 0,
    gold: 0,
    attribute: null,
    hp: 0,
    crit: false,
    consumable: null,
    cosmeticId: null,
    unlocksLocationId: null,
    createdAt,
  };
}

// ─────────────────────────────────────────── Конструкторы записей

/** Начисление за одну отметку привычки. `seq` — номер отметки в этом дне, с нуля. */
export function habitEntry(
  habitId: string,
  day: DayKey,
  seq: number,
  reward: RewardBreakdown,
  baseXp: number,
  createdAt: number,
): LedgerEntry {
  const base = blank('habit', habitId, day, seq, createdAt);
  return {
    ...base,
    xp: reward.xp,
    baseXp,
    gold: reward.gold + (reward.rareFind?.kind === 'gold' ? reward.rareFind.amount : 0),
    attribute: reward.attribute,
    crit: reward.crit,
    consumable:
      reward.rareFind?.kind === 'consumable'
        ? { id: reward.rareFind.consumableId, delta: 1 }
        : null,
  };
}

/** Урон по HP за отмеченный срыв негативной привычки. */
export function negativeEntry(
  habitId: string,
  day: DayKey,
  seq: number,
  hpLoss: number,
  createdAt: number,
): LedgerEntry {
  return { ...blank('habit', habitId, day, seq, createdAt), hp: -Math.abs(hpLoss) };
}

export function questEntry(
  questId: string,
  day: DayKey,
  reward: RewardBreakdown,
  baseXp: number,
  createdAt: number,
): LedgerEntry {
  const base = blank('quest', questId, day, 0, createdAt);
  return {
    ...base,
    xp: reward.xp,
    baseXp,
    gold: reward.gold + (reward.rareFind?.kind === 'gold' ? reward.rareFind.amount : 0),
    attribute: reward.attribute,
    crit: reward.crit,
    consumable:
      reward.rareFind?.kind === 'consumable'
        ? { id: reward.rareFind.consumableId, delta: 1 }
        : null,
  };
}

/**
 * Запись вечернего cron за конкретный день и конкретную причину.
 *
 * Ключ содержит день и причину, поэтому повторный запуск cron за тот же
 * день перезаписывает ту же запись вместо начисления второго штрафа.
 * Идемпотентность cron становится свойством ключа, а не дисциплины кода.
 */
export function cronEntry(
  day: DayKey,
  reason: 'hp' | 'perfect' | 'overdue' | 'comeback',
  patch: Partial<Pick<LedgerEntry, 'xp' | 'gold' | 'hp' | 'attribute'>>,
  createdAt: number,
): LedgerEntry {
  return { ...blank('cron', reason, day, 0, createdAt), ...patch };
}

export function milestoneEntry(
  days: number,
  day: DayKey,
  gold: number,
  cosmeticId: string | null,
  createdAt: number,
): LedgerEntry {
  return { ...blank('milestone', String(days), day, 0, createdAt), gold, cosmeticId };
}

export function cosmeticPurchaseEntry(
  itemId: string,
  day: DayKey,
  price: number,
  unlocksLocationId: string | null,
  createdAt: number,
): LedgerEntry {
  return {
    ...blank('purchaseCosmetic', itemId, day, 0, createdAt),
    gold: -Math.abs(price),
    cosmeticId: itemId,
    unlocksLocationId,
  };
}

/** `seq` — номер покупки этого расходника в календарном месяце, с нуля. */
export function consumablePurchaseEntry(
  id: ConsumableId,
  day: DayKey,
  seq: number,
  price: number,
  createdAt: number,
): LedgerEntry {
  return {
    ...blank('purchaseConsumable', id, day, seq, createdAt),
    gold: -Math.abs(price),
    consumable: { id, delta: 1 },
  };
}

/** `seq` — сколько раз эта реальная награда уже была выкуплена, с нуля. */
export function realPurchaseEntry(
  rewardId: string,
  day: DayKey,
  seq: number,
  price: number,
  createdAt: number,
): LedgerEntry {
  return { ...blank('purchaseReal', rewardId, day, seq, createdAt), gold: -Math.abs(price) };
}

/** Списание расходника. `seq` — номер использования в этом дне. */
export function useConsumableEntry(
  id: ConsumableId,
  day: DayKey,
  seq: number,
  hp: number,
  createdAt: number,
): LedgerEntry {
  return {
    ...blank('useConsumable', id, day, seq, createdAt),
    hp,
    consumable: { id, delta: -1 },
  };
}

export function seasonRewardEntry(
  seasonIndex: number,
  tier: number,
  day: DayKey,
  gold: number,
  cosmeticId: string | null,
  createdAt: number,
): LedgerEntry {
  return {
    ...blank('seasonReward', `${seasonIndex}:${tier}`, day, 0, createdAt),
    gold,
    cosmeticId,
  };
}

// ─────────────────────────────────────────── Свёртка

/** Экономика персонажа, вычисленная из журнала. Ничего больше. */
export interface DerivedEconomy {
  level: number;
  xp: number;
  /** Совокупный заработанный XP — удобно для графиков и достижений. */
  totalXp: number;
  gold: number;
  hp: number;
  attributes: Record<AttributeId, AttributeState>;
  attributeTotals: Record<AttributeId, number>;
  consumablesOwned: Record<ConsumableId, number>;
  /** Покупок расходника в каждом календарном месяце. */
  consumablePurchasesByMonth: Record<ConsumableId, Record<MonthKey, number>>;
  ownedCosmetics: string[];
  unlockedLocations: string[];
  totalCompletions: number;
  totalCrits: number;
  totalGoldEarned: number;
  totalGoldSpent: number;
  questsCompleted: number;
  seasonXpTotal: number;
}

const CONSUMABLE_IDS: readonly ConsumableId[] = [
  'streakFreeze',
  'healthElixir',
  'doubleXpScroll',
  'indulgence',
] as const;

/**
 * Порядок свёртки. Для сумм не важен, для HP важен (зажим в границах),
 * поэтому задан жёстко и не зависит от порядка чтения из БД.
 */
function compareEntries(a: LedgerEntry, b: LedgerEntry): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Полный пересчёт экономики из журнала.
 *
 * `startHp` позволяет правилу возвращения поднять HP до пола, не подделывая
 * историю: cron кладёт в журнал дельту, а не переписывает прошлое.
 */
export function foldLedger(entries: readonly LedgerEntry[]): DerivedEconomy {
  const sorted = [...entries].sort(compareEntries);

  const attributeTotals = {} as Record<AttributeId, number>;
  for (const id of ATTRIBUTE_IDS) attributeTotals[id] = 0;

  const consumablesOwned = {} as Record<ConsumableId, number>;
  const consumablePurchasesByMonth = {} as Record<ConsumableId, Record<MonthKey, number>>;
  for (const id of CONSUMABLE_IDS) {
    consumablesOwned[id] = 0;
    consumablePurchasesByMonth[id] = {};
  }

  let totalXp = 0;
  let gold = 0;
  let hp = MAX_HP;
  let totalCompletions = 0;
  let totalCrits = 0;
  let totalGoldEarned = 0;
  let totalGoldSpent = 0;
  let questsCompleted = 0;
  const ownedCosmetics: string[] = [];
  const unlockedLocations: string[] = ['town'];

  for (const e of sorted) {
    totalXp += e.xp;
    if (e.attribute !== null) attributeTotals[e.attribute] += e.xp;

    gold += e.gold;
    if (e.gold > 0) totalGoldEarned += e.gold;
    else if (e.gold < 0) totalGoldSpent += -e.gold;

    // HP зажимается на каждом шаге — иначе «−200 потом +200» дало бы 100,
    // хотя игрок должен был упасть в истощение и подняться только на 200.
    if (e.hp !== 0) hp = Math.max(0, Math.min(MAX_HP, hp + e.hp));

    if (e.crit) totalCrits += 1;
    if (e.kind === 'habit' && e.xp > 0) totalCompletions += 1;
    if (e.kind === 'quest') {
      totalCompletions += 1;
      questsCompleted += 1;
    }

    if (e.consumable) {
      const cur = consumablesOwned[e.consumable.id];
      consumablesOwned[e.consumable.id] = Math.max(0, cur + e.consumable.delta);
    }
    if (e.kind === 'purchaseConsumable') {
      const month = monthKeyOf(e.day);
      const byMonth = consumablePurchasesByMonth[e.refId as ConsumableId];
      if (byMonth) byMonth[month] = (byMonth[month] ?? 0) + 1;
    }

    if (e.cosmeticId && !ownedCosmetics.includes(e.cosmeticId)) {
      ownedCosmetics.push(e.cosmeticId);
    }
    if (e.unlocksLocationId && !unlockedLocations.includes(e.unlocksLocationId)) {
      unlockedLocations.push(e.unlocksLocationId);
    }
  }

  const lvl = levelForTotalXp(totalXp);
  const attributes = {} as Record<AttributeId, AttributeState>;
  for (const id of ATTRIBUTE_IDS) {
    const a = attrLevelForTotalXp(attributeTotals[id]);
    attributes[id] = { level: a.level, xp: a.xp };
  }

  return {
    level: lvl.level,
    xp: lvl.xp,
    totalXp,
    gold: Math.max(0, gold),
    hp,
    attributes,
    attributeTotals,
    consumablesOwned,
    consumablePurchasesByMonth,
    ownedCosmetics,
    unlockedLocations,
    totalCompletions,
    totalCrits,
    totalGoldEarned,
    totalGoldSpent,
    questsCompleted,
    seasonXpTotal: 0,
  };
}

/**
 * Сезонный XP считается только по записям, попавшим в окно текущего сезона,
 * поэтому считается отдельно — сезон сбрасывается, глобальный прогресс нет.
 */
export function seasonXpInWindow(
  entries: readonly LedgerEntry[],
  startDay: DayKey,
): number {
  let sum = 0;
  for (const e of entries) {
    if (e.day < startDay) continue;
    if (e.kind !== 'habit' && e.kind !== 'quest') continue;
    sum += e.xp;
  }
  return sum;
}

// ─────────────────────────────────────────── Проекция на персонажа

/**
 * Накладывает вычисленную экономику на персонажа.
 *
 * `Character` остаётся материализованным представлением журнала: его
 * экономические поля НИКОГДА не вычисляются инкрементом, только этой
 * функцией. Всё остальное в персонаже (имя, стрики, экипировка, сезон,
 * служебные даты) — собственное состояние, к экономике не относящееся.
 */
export function applyEconomy(character: Character, econ: DerivedEconomy): Character {
  // Перерождение вычитается на этапе проекции, а не из истории: журнал
  // остаётся полным, а текущий цикл начинается с нуля.
  const cycleXp = Math.max(0, econ.totalXp - character.xpOffset);
  const lvl = levelForTotalXp(cycleXp);

  const consumables = { ...character.consumables };
  for (const id of CONSUMABLE_IDS) {
    const month = consumables[id].month;
    consumables[id] = {
      owned: econ.consumablesOwned[id],
      purchasedThisMonth: econ.consumablePurchasesByMonth[id][month] ?? 0,
      month,
    };
  }

  const season = character.season
    ? (() => {
        const s = seasonTierForTotalXp(character.season.xp);
        return { ...character.season, tier: s.tier, xp: s.xp };
      })()
    : null;

  return {
    ...character,
    level: lvl.level,
    xp: lvl.xp,
    gold: econ.gold,
    hp: econ.hp,
    attributes: econ.attributes,
    consumables,
    ownedCosmetics: econ.ownedCosmetics,
    unlockedLocations: econ.unlockedLocations,
    season,
    stats: {
      ...character.stats,
      totalCompletions: econ.totalCompletions,
      totalCrits: econ.totalCrits,
      totalGoldEarned: econ.totalGoldEarned,
      totalGoldSpent: econ.totalGoldSpent,
      questsCompleted: econ.questsCompleted,
    },
  };
}

/**
 * Полный пересчёт персонажа из журнала. Единственная точка, где
 * экономические поля персонажа получают значение.
 */
export function projectCharacter(
  character: Character,
  entries: readonly LedgerEntry[],
): Character {
  const econ = foldLedger(entries);
  const withEcon = applyEconomy(character, econ);
  if (!withEcon.season) return withEcon;
  const seasonXp = seasonXpInWindow(entries, withEcon.season.startDay);
  const s = seasonTierForTotalXp(seasonXp);
  return { ...withEcon, season: { ...withEcon.season, tier: s.tier, xp: seasonXp } };
}

// ─────────────────────────────────────────── Работа с набором записей

/** Все записи, порождённые отметками этой привычки в этот день. */
export function habitEntriesFor(
  entries: readonly LedgerEntry[],
  habitId: string,
  day: DayKey,
): LedgerEntry[] {
  return entries
    .filter((e) => e.kind === 'habit' && e.refId === habitId && e.day === day)
    .sort((a, b) => a.seq - b.seq);
}

/** Сколько отметок этой привычки за день уже записано в журнал. */
export function habitSeqCount(
  entries: readonly LedgerEntry[],
  habitId: string,
  day: DayKey,
): number {
  return habitEntriesFor(entries, habitId, day).length;
}

/**
 * Базовый XP, уже израсходованный за день из абсолютного дневного лимита.
 * Считается по записям журнала, поэтому отмена отметки освобождает лимит
 * вместе с самой записью — без отдельного учёта.
 */
export function baseXpSpentOnDay(entries: readonly LedgerEntry[], day: DayKey): number {
  let sum = 0;
  for (const e of entries) {
    if (e.day !== day) continue;
    if (e.kind !== 'habit' && e.kind !== 'quest') continue;
    sum += e.baseXp;
  }
  return sum;
}

/** Заработанное за день золото — для абсолютного дневного лимита золота. */
export function goldEarnedOnDay(entries: readonly LedgerEntry[], day: DayKey): number {
  let sum = 0;
  for (const e of entries) {
    if (e.day !== day) continue;
    if (e.gold > 0) sum += e.gold;
  }
  return sum;
}

/** Записи журнала за день — для записи дня и телеметрии. */
export function entriesOnDay(entries: readonly LedgerEntry[], day: DayKey): LedgerEntry[] {
  return entries.filter((e) => e.day === day);
}

/** Есть ли уже запись cron за этот день и эту причину — проверка идемпотентности. */
export function hasCronEntry(
  entries: readonly LedgerEntry[],
  day: DayKey,
  reason: string,
): boolean {
  return entries.some((e) => e.kind === 'cron' && e.day === day && e.refId === reason);
}

/** Применяет добавления и удаления к набору записей. Чистая функция. */
export function applyLedgerPatch(
  entries: readonly LedgerEntry[],
  added: readonly LedgerEntry[],
  removedIds: readonly string[],
): LedgerEntry[] {
  const removed = new Set(removedIds);
  const map = new Map<string, LedgerEntry>();
  for (const e of entries) {
    if (removed.has(e.id)) continue;
    map.set(e.id, e);
  }
  // Детерминированный ключ означает, что повтор перезапишет, а не удвоит.
  for (const e of added) map.set(e.id, e);
  return [...map.values()];
}
