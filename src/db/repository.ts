/**
 * Репозиторий — единственный слой, который пишет в БД.
 * Игровые вычисления сюда не попадают: он только сохраняет результат движка.
 */

import { CHARACTER_ID, db, newId, SETTINGS_ID } from './database';
import { COUNTER_TARGET_MAX, COUNTER_TARGET_MIN } from '@/game/balance';
import type { HabitPreset } from '@/data/habitPresets';
import type {
  Character,
  DayKey,
  DayRecord,
  Difficulty,
  Frequency,
  Habit,
  HabitKind,
  HabitLog,
  LedgerEntry,
  Quest,
  QuestDifficulty,
  QuestStep,
  RealReward,
  RealRewardTier,
  Settings,
  TelemetryEvent,
} from '@/game/types';
import type { AttributeId } from '@/game/types';

// ─────────────────────────────────────────── Чтение

export async function loadCharacter(): Promise<Character | undefined> {
  return db.characters.get(CHARACTER_ID);
}

export async function loadSettings(): Promise<Settings | undefined> {
  return db.settings.get(SETTINGS_ID);
}

export async function loadHabits(): Promise<Habit[]> {
  const all = await db.habits.toArray();
  return all.filter((h) => !h.deleted).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Записи, созданные до появления стека начислений, не имеют полей
 * `grants` / `grant`. Нормализуем на чтении, чтобы движок никогда
 * не встретил undefined и не упал на `[...log.grants]`.
 */
function withGrants(log: HabitLog): HabitLog {
  return Array.isArray(log.grants) ? log : { ...log, grants: [] };
}

function withGrant(quest: Quest): Quest {
  return quest.grant !== undefined ? quest : { ...quest, grant: null };
}

export async function loadQuests(): Promise<Quest[]> {
  const all = await db.quests.toArray();
  return all
    .filter((q) => !q.deleted)
    .map(withGrant)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadRealRewards(): Promise<RealReward[]> {
  const all = await db.realRewards.toArray();
  return all.filter((r) => !r.deleted).sort((a, b) => a.price - b.price);
}

/** Логи за диапазон дней — для календаря и расписания недели. */
export async function loadLogsBetween(from: DayKey, to: DayKey): Promise<HabitLog[]> {
  const all = await db.habitLogs.where('day').between(from, to, true, true).toArray();
  return all.map(withGrants);
}

export async function loadAllLogs(): Promise<HabitLog[]> {
  const all = await db.habitLogs.toArray();
  return all.map(withGrants);
}

export async function loadDayRecords(): Promise<DayRecord[]> {
  return db.dayRecords.toArray();
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  return db.ledger.toArray();
}

export async function loadTelemetry(): Promise<TelemetryEvent[]> {
  return db.telemetry.toArray();
}

// ─────────────────────────────────────────── Журнал начислений

/**
 * Применяет патч журнала одной транзакцией.
 *
 * Транзакция здесь не роскошь: если добавление записи пройдёт, а удаление
 * нет, экономика разъедется. Ключи детерминированы, поэтому повторный
 * `bulkPut` того же патча идемпотентен.
 */
export async function applyLedgerPatch(
  added: readonly LedgerEntry[],
  removedIds: readonly string[],
): Promise<void> {
  if (added.length === 0 && removedIds.length === 0) return;
  await db.transaction('rw', db.ledger, async () => {
    if (removedIds.length > 0) await db.ledger.bulkDelete([...removedIds]);
    if (added.length > 0) await db.ledger.bulkPut([...added]);
  });
}

export async function appendTelemetry(events: readonly TelemetryEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.telemetry.bulkPut([...events]);
}

// ─────────────────────────────────────────── Запись

export async function saveCharacter(character: Character): Promise<void> {
  await db.characters.put({ ...character, updatedAt: Date.now() });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ ...settings, updatedAt: Date.now() });
}

export async function saveHabit(habit: Habit): Promise<void> {
  await db.habits.put({ ...habit, updatedAt: Date.now() });
}

export async function saveHabits(habits: readonly Habit[]): Promise<void> {
  if (habits.length === 0) return;
  const now = Date.now();
  await db.habits.bulkPut(habits.map((h) => ({ ...h, updatedAt: now })));
}

export async function saveLog(log: HabitLog): Promise<void> {
  await db.habitLogs.put({ ...log, updatedAt: Date.now() });
}

export async function saveQuest(quest: Quest): Promise<void> {
  await db.quests.put({ ...quest, updatedAt: Date.now() });
}

export async function saveQuests(quests: readonly Quest[]): Promise<void> {
  if (quests.length === 0) return;
  const now = Date.now();
  await db.quests.bulkPut(quests.map((q) => ({ ...q, updatedAt: now })));
}

export async function saveRealReward(reward: RealReward): Promise<void> {
  await db.realRewards.put({ ...reward, updatedAt: Date.now() });
}

export async function saveDayRecords(records: readonly DayRecord[]): Promise<void> {
  if (records.length === 0) return;
  await db.dayRecords.bulkPut([...records]);
}

/** Дописывает XP и золото в запись дня — вызывается при каждой отметке. */
export async function accrueDayTotals(
  day: DayKey,
  xp: number,
  gold: number,
): Promise<void> {
  if (xp === 0 && gold === 0) return;
  const existing = await db.dayRecords.get(day);
  const now = Date.now();
  if (existing) {
    await db.dayRecords.put({
      ...existing,
      xpGained: existing.xpGained + xp,
      goldGained: existing.goldGained + gold,
      updatedAt: now,
    });
    return;
  }
  await db.dayRecords.put({
    day,
    dueCount: 0,
    doneCount: 0,
    completionRate: 0,
    perfect: false,
    counted: false,
    xpGained: xp,
    goldGained: gold,
    hpDelta: 0,
    freezeUsed: false,
    updatedAt: now,
  });
}

// ─────────────────────────────────────────── Мягкое удаление

export async function deleteHabit(habit: Habit): Promise<void> {
  await db.habits.put({ ...habit, deleted: true, active: false, updatedAt: Date.now() });
}

export async function deleteQuest(quest: Quest): Promise<void> {
  await db.quests.put({ ...quest, deleted: true, updatedAt: Date.now() });
}

export async function deleteRealReward(reward: RealReward): Promise<void> {
  await db.realRewards.put({ ...reward, deleted: true, updatedAt: Date.now() });
}

// ─────────────────────────────────────────── Создание сущностей

export interface HabitDraft {
  title: string;
  lore: string;
  icon: string;
  attribute: AttributeId;
  kind: HabitKind;
  difficulty: Difficulty;
  frequency: Frequency;
  target: number;
  presetId?: string | null;
}

export function buildHabit(draft: HabitDraft): Habit {
  const now = Date.now();
  return {
    id: newId(),
    title: draft.title.trim(),
    lore: draft.lore.trim(),
    icon: draft.icon,
    attribute: draft.attribute,
    kind: draft.kind,
    difficulty: draft.difficulty,
    frequency: draft.frequency,
    // Цель зажимается в движке, а не только в поле ввода: атрибут max у input
    // — подсказка браузеру, а не проверка. Через него проходило target=999,
    // и счётчик становился фермой опыта.
    target:
      draft.kind === 'counter'
        ? Math.min(COUNTER_TARGET_MAX, Math.max(COUNTER_TARGET_MIN, Math.round(draft.target)))
        : 1,
    active: true,
    presetId: draft.presetId ?? null,
    currentStreak: 0,
    bestStreak: 0,
    lastCompletedDay: null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}

export function habitFromPreset(preset: HabitPreset): Habit {
  return buildHabit({
    title: preset.title,
    lore: preset.lore,
    icon: preset.icon,
    attribute: preset.attribute,
    kind: preset.kind,
    difficulty: preset.difficulty,
    frequency: preset.frequency,
    target: preset.target,
    presetId: preset.id,
  });
}

export interface QuestDraft {
  title: string;
  lore: string;
  attribute: AttributeId;
  difficulty: QuestDifficulty;
  dueDay: DayKey | null;
  steps: string[];
}

export function buildQuest(draft: QuestDraft): Quest {
  const now = Date.now();
  const steps: QuestStep[] = draft.steps
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((title) => ({ id: newId(), title, done: false }));
  return {
    id: newId(),
    title: draft.title.trim(),
    lore: draft.lore.trim(),
    attribute: draft.attribute,
    difficulty: draft.difficulty,
    dueDay: draft.dueDay,
    steps,
    done: false,
    completedAt: null,
    grant: null,
    overduePenaltyApplied: false,
    unlocksLocationId: null,
    requiresQuestId: null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}

export interface RealRewardDraft {
  name: string;
  note: string;
  icon: string;
  price: number;
  tier: RealRewardTier;
}

export function buildRealReward(draft: RealRewardDraft): RealReward {
  const now = Date.now();
  return {
    id: newId(),
    name: draft.name.trim(),
    note: draft.note.trim(),
    icon: draft.icon,
    price: Math.max(1, Math.round(draft.price)),
    tier: draft.tier,
    purchasedCount: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}
