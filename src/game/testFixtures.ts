/** Фабрики тестовых сущностей. Используются только тестами движка. */

import {
  completeHabitFully,
  completeQuest,
  reopenQuest,
  tickHabit,
  untickHabit,
  untickHabitFully,
} from './actions';
import type { ActionContext, HabitToggleResult, QuestCompleteResult } from './actions';
import { MAX_HP } from './balance';
import { createCharacter } from './character';
import { applyLedgerPatch, ledgerId, projectCharacter } from './ledger';
import { createRng } from './rng';
import type { Rng } from './rng';
import type {
  Character,
  ConsumableId,
  Difficulty,
  Frequency,
  Habit,
  HabitKind,
  HabitLog,
  LedgerEntry,
  Quest,
  QuestDifficulty,
  RealReward,
  Settings,
} from './types';
import type { AttributeId, DayKey } from './types';
import { buildLogIndex, logKey } from './scheduling';

export const T0 = 1_700_000_000_000;

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: overrides.id ?? 'h1',
    title: 'Тренировка',
    lore: 'Железо не лжёт.',
    icon: 'attrBody',
    attribute: 'body' as AttributeId,
    kind: 'binary' as HabitKind,
    difficulty: 'normal' as Difficulty,
    frequency: { kind: 'daily' } as Frequency,
    target: 1,
    active: true,
    presetId: null,
    currentStreak: 0,
    bestStreak: 0,
    lastCompletedDay: null,
    createdAt: T0,
    updatedAt: T0,
    deleted: false,
    ...overrides,
  };
}

export function makeLog(
  habitId: string,
  day: DayKey,
  count: number,
  completed: boolean,
  grants: HabitLog['grants'] = [],
): HabitLog {
  return { id: logKey(habitId, day), habitId, day, count, completed, grants, updatedAt: T0 };
}

export function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: overrides.id ?? 'q1',
    title: 'Разобрать кладовую',
    lore: 'Хлам копится быстрее золота.',
    attribute: 'discipline' as AttributeId,
    difficulty: 'normal' as QuestDifficulty,
    dueDay: null,
    steps: [],
    done: false,
    completedAt: null,
    grant: null,
    overduePenaltyApplied: false,
    unlocksLocationId: null,
    requiresQuestId: null,
    createdAt: T0,
    updatedAt: T0,
    deleted: false,
    ...overrides,
  };
}

export function makeRealReward(overrides: Partial<RealReward> = {}): RealReward {
  return {
    id: overrides.id ?? 'r1',
    name: 'Новые кроссовки',
    note: '',
    icon: 'run',
    price: 8000,
    tier: 'medium',
    purchasedCount: 0,
    archived: false,
    createdAt: T0,
    updatedAt: T0,
    deleted: false,
    ...overrides,
  };
}

export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return { ...createCharacter('Тестовый', '2026-01-15', T0), ...overrides };
}

/**
 * Стартовый капитал через журнал.
 *
 * Задать `makeCharacter({ gold: 500 })` больше нельзя: экономика — свёртка
 * журнала, и первый же пересчёт вернёт ноль. Чтобы у теста был баланс, его
 * нужно ЗАРАБОТАТЬ записью — что заодно проверяет, что другого пути нет.
 */
export function seedLedger(
  xp: number,
  gold: number,
  opts: { hp?: number; consumables?: Partial<Record<ConsumableId, number>>; day?: DayKey } = {},
): LedgerEntry[] {
  const day = opts.day ?? '2026-01-01';
  const hpDelta = opts.hp === undefined ? 0 : opts.hp - MAX_HP;
  const entries: LedgerEntry[] = [];

  const base = (refId: string, seq: number): LedgerEntry => ({
    id: ledgerId('milestone', refId, day, seq),
    kind: 'milestone',
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
    createdAt: T0 - 1,
  });

  if (xp !== 0 || gold !== 0) entries.push({ ...base('test-seed', 0), xp, gold });
  if (hpDelta !== 0) entries.push({ ...base('test-seed-hp', 0), hp: hpDelta });

  let seq = 0;
  for (const [id, count] of Object.entries(opts.consumables ?? {})) {
    for (let i = 0; i < (count ?? 0); i++) {
      entries.push({
        ...base('test-seed-item', seq++),
        consumable: { id: id as ConsumableId, delta: 1 },
      });
    }
  }

  return entries;
}

/**
 * Прогон действий с сохранением журнала и логов — как это делает приложение.
 *
 * Тесты движка обязаны ходить тем же путём, что и UI: действие возвращает
 * патч журнала, патч применяется, персонаж пересчитывается. Хелпер убирает
 * ручное протаскивание трёх состояний через каждый цикл.
 */
export class GameSim {
  character: Character;
  ledger: LedgerEntry[];
  logs: HabitLog[];
  quests: Quest[];
  habits: Habit[];
  day: DayKey;
  rng: Rng;
  now: number;

  constructor(opts: {
    habits?: Habit[];
    quests?: Quest[];
    ledger?: LedgerEntry[];
    character?: Character;
    day?: DayKey;
    rng?: Rng;
  } = {}) {
    this.habits = opts.habits ?? [];
    this.quests = opts.quests ?? [];
    this.ledger = opts.ledger ?? [];
    this.logs = [];
    this.day = opts.day ?? '2026-01-15';
    this.rng = opts.rng ?? createRng(1);
    this.now = T0;
    this.character = projectCharacter(opts.character ?? makeCharacter(), this.ledger);
  }

  ctx(): ActionContext {
    return {
      character: this.character,
      habits: this.habits,
      logIndex: buildLogIndex(this.logs),
      ledger: this.ledger,
      day: this.day,
      rng: this.rng,
      now: this.now,
    };
  }

  private absorb(patch: { added: LedgerEntry[]; removedIds: string[] }): void {
    this.ledger = applyLedgerPatch(this.ledger, patch.added, patch.removedIds);
  }

  private putLog(log: HabitLog): void {
    this.logs = [...this.logs.filter((l) => l.id !== log.id), log];
  }

  tick(habit: Habit): HabitToggleResult {
    const out = tickHabit(this.ctx(), habit);
    this.absorb(out.patch);
    this.putLog(out.log);
    this.character = projectCharacter(out.character, this.ledger);
    return out;
  }

  untick(habit: Habit): HabitToggleResult {
    const out = untickHabit(this.ctx(), habit);
    this.absorb(out.patch);
    this.putLog(out.log);
    this.character = projectCharacter(out.character, this.ledger);
    return out;
  }

  complete(habit: Habit): HabitToggleResult {
    const out = completeHabitFully(this.ctx(), habit);
    this.absorb(out.patch);
    this.putLog(out.log);
    this.character = projectCharacter(out.character, this.ledger);
    return out;
  }

  untickAll(habit: Habit): HabitToggleResult {
    const out = untickHabitFully(this.ctx(), habit);
    this.absorb(out.patch);
    this.putLog(out.log);
    this.character = projectCharacter(out.character, this.ledger);
    return out;
  }

  finishQuest(quest: Quest): QuestCompleteResult {
    const out = completeQuest(this.ctx(), quest);
    this.absorb(out.patch);
    this.quests = [...this.quests.filter((q) => q.id !== out.quest.id), out.quest];
    this.character = projectCharacter(out.character, this.ledger);
    return out;
  }

  openQuest(quest: Quest): Quest {
    const out = reopenQuest(this.ctx(), quest);
    this.absorb(out.patch);
    this.quests = [...this.quests.filter((q) => q.id !== out.quest.id), out.quest];
    this.character = projectCharacter(out.character, this.ledger);
    return out.quest;
  }

  /** Снимок сравниваемого состояния — для проверки «вернулось побайтово». */
  snapshot(): {
    level: number;
    xp: number;
    gold: number;
    hp: number;
    attributes: Character['attributes'];
    totalCompletions: number;
  } {
    return {
      level: this.character.level,
      xp: this.character.xp,
      gold: this.character.gold,
      hp: this.character.hp,
      attributes: this.character.attributes,
      totalCompletions: this.character.stats.totalCompletions,
    };
  }
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: 'settings',
    soundEnabled: true,
    hapticsEnabled: true,
    dayRolloverHour: 4,
    autoUseFreeze: true,
    syncEnabled: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
    deviceId: 'test-device',
    lastSyncAt: null,
    onboarded: true,
    updatedAt: T0,
    ...overrides,
  };
}
