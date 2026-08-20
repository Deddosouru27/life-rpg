/**
 * Экспорт и импорт сейва в JSON. Полный снимок базы, читаемый человеком.
 * Импорт валидирует форму данных — битый файл не должен убить сейв.
 */

import { clearAll, db, defaultSettings } from './database';
import { MAX_HP } from '@/game/balance';
import { ledgerId } from '@/game/ledger';
import { formatDayKey } from '@/game/time';
import type {
  Character,
  DayKey,
  DayRecord,
  Habit,
  HabitLog,
  LedgerEntry,
  Quest,
  RealReward,
  RewardGrant,
  SaveFile,
  Settings,
  TelemetryEvent,
} from '@/game/types';

export const SAVE_FORMAT = 'life-rpg-save';
/** 2 — журнал начислений и телеметрия. Формат 1 читается и миграется. */
export const SAVE_VERSION = 2;

export async function buildSaveFile(): Promise<SaveFile> {
  const [character, habits, habitLogs, quests, realRewards, dayRecords, ledger, telemetry, settings] =
    await Promise.all([
      db.characters.get('me'),
      db.habits.toArray(),
      db.habitLogs.toArray(),
      db.quests.toArray(),
      db.realRewards.toArray(),
      db.dayRecords.toArray(),
      db.ledger.toArray(),
      db.telemetry.toArray(),
      db.settings.get('settings'),
    ]);

  if (!character) throw new Error('Персонаж не найден — сейв пуст.');

  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    exportedAt: Date.now(),
    character,
    habits,
    habitLogs,
    quests,
    realRewards,
    dayRecords,
    ledger,
    telemetry,
    settings: settings ?? defaultSettings(Date.now()),
  };
}

/**
 * Отдельная выгрузка телеметрии.
 *
 * Она же входит в обычный экспорт сейва, но там лежит рядом с игровыми
 * данными и весит вместе с ними. Для калибровки нужен именно поток
 * наблюдений — его удобнее отдать одним файлом, не таская сейв целиком.
 */
export async function downloadTelemetry(): Promise<void> {
  const [telemetry, character] = await Promise.all([
    db.telemetry.toArray(),
    db.characters.get('me'),
  ]);
  const payload = {
    format: 'life-rpg-telemetry',
    version: 1,
    exportedAt: Date.now(),
    /** Контекст, без которого ряд наблюдений не интерпретируется. */
    context: {
      level: character?.level ?? null,
      daysPlayed: character?.stats.daysPlayed ?? null,
      bestGlobalStreak: character?.bestGlobalStreak ?? null,
    },
    events: telemetry.sort((a, b) => a.at - b.at),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `life-rpg-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function saveFileName(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `life-rpg-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/** Скачивает сейв как файл. Работает офлайн — Blob создаётся локально. */
export async function downloadSave(): Promise<void> {
  const save = await buildSaveFile();
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = saveFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────── Валидация

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArrayOfRecords(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.every(isRecord);
}

function migrateLogs(logs: HabitLog[]): HabitLog[] {
  return logs.map((log) => (Array.isArray(log.grants) ? log : { ...log, grants: [] }));
}

function migrateQuests(quests: Quest[]): Quest[] {
  return quests.map((quest) => (quest.grant !== undefined ? quest : { ...quest, grant: null }));
}

/**
 * Восстанавливает журнал из сейва формата 1, где начисления лежали внутри
 * логов и квестов. Без этого импорт старого сейва обнулил бы уровень и
 * золото: экономика теперь свёртка журнала, а журнала в старом файле нет.
 *
 * Разница между записанным золотом персонажа и суммой по восстановленным
 * записям сводится одной балансирующей записью. Происхождение этой разницы
 * (вехи стрика, покупки) в формате 1 не сохранялось и восстановлению не
 * подлежит — но терять золото молча нельзя.
 */
function ledgerFromLegacy(
  character: Character,
  logs: HabitLog[],
  quests: Quest[],
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  const push = (
    kind: 'habit' | 'quest',
    refId: string,
    day: DayKey,
    seq: number,
    g: RewardGrant,
    createdAt: number,
    unlocksLocationId: string | null,
  ): void => {
    entries.push({
      id: ledgerId(kind, refId, day, seq),
      kind,
      day,
      refId,
      seq,
      xp: g.xp ?? 0,
      baseXp: g.xp ?? 0,
      gold: (g.gold ?? 0) + (g.rareFind?.kind === 'gold' ? g.rareFind.amount : 0),
      attribute: g.attribute ?? null,
      hp: 0,
      crit: Boolean(g.crit),
      consumable:
        g.rareFind?.kind === 'consumable' ? { id: g.rareFind.consumableId, delta: 1 } : null,
      cosmeticId: null,
      unlocksLocationId,
      createdAt,
    });
  };

  for (const log of logs) {
    (Array.isArray(log.grants) ? log.grants : []).forEach((g, seq) => {
      push('habit', log.habitId, log.day, seq, g, log.updatedAt ?? Date.now(), null);
    });
  }

  for (const quest of quests) {
    if (!quest.done || !quest.grant) continue;
    const day = formatDayKey(new Date(quest.completedAt ?? Date.now()));
    push('quest', quest.id, day, 0, quest.grant, quest.completedAt ?? Date.now(), quest.unlocksLocationId ?? null);
  }

  const day = character.lastActiveDay ?? formatDayKey(new Date());
  const goldDiff = Math.round((character.gold ?? 0) - entries.reduce((s, e) => s + e.gold, 0));
  if (goldDiff !== 0) {
    entries.push({
      id: ledgerId('milestone', 'legacy-import', day, 0),
      kind: 'milestone',
      day,
      refId: 'legacy-import',
      seq: 0,
      xp: 0,
      baseXp: 0,
      gold: goldDiff,
      attribute: null,
      hp: 0,
      crit: false,
      consumable: null,
      cosmeticId: null,
      unlocksLocationId: null,
      createdAt: Date.now(),
    });
  }

  const hpDiff = Math.round((character.hp ?? MAX_HP) - MAX_HP);
  if (hpDiff !== 0) {
    entries.push({
      id: ledgerId('cron', 'legacy-import-hp', day, 0),
      kind: 'cron',
      day,
      refId: 'legacy-import-hp',
      seq: 0,
      xp: 0,
      baseXp: 0,
      gold: 0,
      attribute: null,
      hp: hpDiff,
      crit: false,
      consumable: null,
      cosmeticId: null,
      unlocksLocationId: null,
      createdAt: Date.now(),
    });
  }

  return entries;
}

export interface ParseResult {
  ok: boolean;
  save: SaveFile | null;
  error: string | null;
}

/** Разбирает и проверяет JSON сейва. Не пишет в базу. */
export function parseSaveFile(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, save: null, error: 'Файл не является корректным JSON.' };
  }

  if (!isRecord(raw)) {
    return { ok: false, save: null, error: 'Ожидался объект сейва.' };
  }
  if (raw.format !== SAVE_FORMAT) {
    return { ok: false, save: null, error: 'Это не сейв Life RPG.' };
  }
  if (typeof raw.version !== 'number' || raw.version > SAVE_VERSION) {
    return { ok: false, save: null, error: 'Версия сейва новее, чем понимает это приложение.' };
  }
  if (!isRecord(raw.character) || raw.character.id !== 'me') {
    return { ok: false, save: null, error: 'В сейве нет персонажа.' };
  }
  for (const key of ['habits', 'habitLogs', 'quests', 'realRewards', 'dayRecords'] as const) {
    if (!isArrayOfRecords(raw[key])) {
      return { ok: false, save: null, error: `Повреждён раздел «${key}».` };
    }
  }
  if (!isRecord(raw.settings)) {
    return { ok: false, save: null, error: 'Повреждены настройки.' };
  }

  const character = raw.character as unknown as Character;
  if (typeof character.level !== 'number' || typeof character.gold !== 'number') {
    return { ok: false, save: null, error: 'Данные персонажа повреждены.' };
  }

  const habitLogs = migrateLogs(raw.habitLogs as unknown as HabitLog[]);
  const quests = migrateQuests(raw.quests as unknown as Quest[]);
  const ledger = isArrayOfRecords(raw.ledger)
    ? (raw.ledger as unknown as LedgerEntry[])
    : ledgerFromLegacy({ ...character, xpOffset: character.xpOffset ?? 0 }, habitLogs, quests);

  return {
    ok: true,
    error: null,
    save: {
      format: SAVE_FORMAT,
      version: raw.version,
      exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : Date.now(),
      character: { ...character, xpOffset: character.xpOffset ?? 0 },
      habits: raw.habits as unknown as Habit[],
      habitLogs,
      quests,
      realRewards: raw.realRewards as unknown as RealReward[],
      dayRecords: raw.dayRecords as unknown as DayRecord[],
      ledger,
      telemetry: isArrayOfRecords(raw.telemetry)
        ? (raw.telemetry as unknown as TelemetryEvent[])
        : [],
      settings: raw.settings as unknown as Settings,
    },
  };
}

/** Полностью заменяет содержимое базы данными из сейва. */
export async function restoreSaveFile(save: SaveFile): Promise<void> {
  await clearAll();
  await db.transaction(
    'rw',
    [
      db.characters,
      db.habits,
      db.habitLogs,
      db.quests,
      db.realRewards,
      db.dayRecords,
      db.ledger,
      db.telemetry,
      db.settings,
    ],
    async () => {
      await db.characters.put(save.character);
      await db.settings.put(save.settings);
      if (save.habits.length) await db.habits.bulkPut(save.habits);
      if (save.habitLogs.length) await db.habitLogs.bulkPut(save.habitLogs);
      if (save.quests.length) await db.quests.bulkPut(save.quests);
      if (save.realRewards.length) await db.realRewards.bulkPut(save.realRewards);
      if (save.dayRecords.length) await db.dayRecords.bulkPut(save.dayRecords);
      if (save.ledger.length) await db.ledger.bulkPut(save.ledger);
      if (save.telemetry.length) await db.telemetry.bulkPut(save.telemetry);
    },
  );
}

/** Читает выбранный пользователем файл и восстанавливает сейв. */
export async function importSaveFromFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  const parsed = parseSaveFile(text);
  if (parsed.ok && parsed.save) await restoreSaveFile(parsed.save);
  return parsed;
}
