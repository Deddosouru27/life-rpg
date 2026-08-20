/**
 * IndexedDB через Dexie — ЕДИНСТВЕННЫЙ источник правды.
 * Приложение полностью работает офлайн. Supabase — опциональная надстройка.
 */

import Dexie from 'dexie';
import type { Table } from 'dexie';
import { DEFAULT_DAY_ROLLOVER_HOUR, MAX_HP } from '@/game/balance';
import { createCharacter } from '@/game/character';
import { ledgerId } from '@/game/ledger';
import { dayKeyOf, formatDayKey } from '@/game/time';
import type {
  Character,
  DayRecord,
  Habit,
  HabitLog,
  LedgerEntry,
  Quest,
  RealReward,
  Settings,
  TelemetryEvent,
} from '@/game/types';

export class LifeRpgDatabase extends Dexie {
  characters!: Table<Character, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  quests!: Table<Quest, string>;
  realRewards!: Table<RealReward, string>;
  dayRecords!: Table<DayRecord, string>;
  ledger!: Table<LedgerEntry, string>;
  telemetry!: Table<TelemetryEvent, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'life-rpg') {
    super(name);
    this.version(1).stores({
      characters: 'id, updatedAt',
      habits: 'id, attribute, active, updatedAt, deleted',
      habitLogs: 'id, habitId, day, [habitId+day], updatedAt',
      quests: 'id, done, dueDay, updatedAt, deleted',
      realRewards: 'id, tier, archived, updatedAt, deleted',
      dayRecords: 'day, updatedAt',
      settings: 'id, updatedAt',
    });

    // Версия 2: журнал начислений становится источником правды по экономике,
    // плюс локальная телеметрия.
    this.version(2)
      .stores({
        ledger: 'id, kind, day, refId, [kind+refId], createdAt',
        telemetry: 'id, kind, day, at',
      })
      .upgrade(async (tx) => {
        // Переносим начисления из логов и квестов в журнал, чтобы уровень,
        // золото и HP после миграции пересчитались в те же значения, а не
        // обнулились. Терять чужой прогресс молча недопустимо.
        const entries: LedgerEntry[] = [];

        const logs = await tx.table<HabitLog>('habitLogs').toArray();
        for (const log of logs) {
          const grants = Array.isArray(log.grants) ? log.grants : [];
          grants.forEach((g, seq) => {
            entries.push({
              id: ledgerId('habit', log.habitId, log.day, seq),
              kind: 'habit',
              day: log.day,
              refId: log.habitId,
              seq,
              xp: g.xp ?? 0,
              baseXp: g.xp ?? 0,
              gold: (g.gold ?? 0) + (g.rareFind?.kind === 'gold' ? g.rareFind.amount : 0),
              attribute: g.attribute ?? null,
              hp: 0,
              crit: Boolean(g.crit),
              consumable:
                g.rareFind?.kind === 'consumable'
                  ? { id: g.rareFind.consumableId, delta: 1 }
                  : null,
              cosmeticId: null,
              unlocksLocationId: null,
              createdAt: log.updatedAt ?? Date.now(),
            });
          });
        }

        const quests = await tx.table<Quest>('quests').toArray();
        for (const quest of quests) {
          const g = quest.grant;
          if (!g || !quest.done) continue;
          const day = formatDayKey(new Date(quest.completedAt ?? Date.now()));
          entries.push({
            id: ledgerId('quest', quest.id, day, 0),
            kind: 'quest',
            day,
            refId: quest.id,
            seq: 0,
            xp: g.xp ?? 0,
            baseXp: g.xp ?? 0,
            gold: (g.gold ?? 0) + (g.rareFind?.kind === 'gold' ? g.rareFind.amount : 0),
            attribute: g.attribute ?? null,
            hp: 0,
            crit: Boolean(g.crit),
            consumable:
              g.rareFind?.kind === 'consumable'
                ? { id: g.rareFind.consumableId, delta: 1 }
                : null,
            cosmeticId: null,
            unlocksLocationId: quest.unlocksLocationId ?? null,
            createdAt: quest.completedAt ?? Date.now(),
          });
        }

        // Разница между записанным золотом персонажа и суммой по журналу —
        // это то, что старая версия начислила вне логов (вехи, покупки).
        // Сводим её одной балансирующей записью: молча терять золото нельзя,
        // а восстановить его происхождение из данных формата 1 невозможно.
        const characters = await tx.table<Character>('characters').toArray();
        const me = characters[0];
        if (me) {
          const ledgerGold = entries.reduce((s, e) => s + e.gold, 0);
          const diff = Math.round((me.gold ?? 0) - ledgerGold);
          const day = me.lastActiveDay ?? formatDayKey(new Date());
          if (diff !== 0) {
            entries.push({
              id: ledgerId('milestone', 'migration-v2', day, 0),
              kind: 'milestone',
              day,
              refId: 'migration-v2',
              seq: 0,
              xp: 0,
              baseXp: 0,
              gold: diff,
              attribute: null,
              hp: 0,
              crit: false,
              consumable: null,
              cosmeticId: null,
              unlocksLocationId: null,
              createdAt: Date.now(),
            });
          }
          const hpDiff = Math.round((me.hp ?? MAX_HP) - MAX_HP);
          if (hpDiff !== 0) {
            entries.push({
              id: ledgerId('cron', 'migration-v2-hp', day, 0),
              kind: 'cron',
              day,
              refId: 'migration-v2-hp',
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
          await tx.table<Character>('characters').put({ ...me, xpOffset: me.xpOffset ?? 0 });
        }

        if (entries.length > 0) await tx.table<LedgerEntry>('ledger').bulkPut(entries);
      });
  }
}

export const db = new LifeRpgDatabase();

export const CHARACTER_ID = 'me';
export const SETTINGS_ID = 'settings';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const newId = randomId;

export function defaultSettings(now: number): Settings {
  return {
    id: SETTINGS_ID,
    soundEnabled: true,
    hapticsEnabled: true,
    dayRolloverHour: DEFAULT_DAY_ROLLOVER_HOUR,
    autoUseFreeze: true,
    syncEnabled: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
    deviceId: randomId(),
    lastSyncAt: null,
    onboarded: false,
    updatedAt: now,
  };
}

/** Создаёт персонажа и настройки при первом запуске. Идемпотентна. */
export async function ensureSeeded(): Promise<{ character: Character; settings: Settings }> {
  const now = Date.now();

  let settings = await db.settings.get(SETTINGS_ID);
  if (!settings) {
    settings = defaultSettings(now);
    await db.settings.put(settings);
  }

  let character = await db.characters.get(CHARACTER_ID);
  if (!character) {
    const today = dayKeyOf(new Date(now), settings.dayRolloverHour);
    character = createCharacter('Странник', today, now);
    await db.characters.put(character);
  }

  return { character, settings };
}

/** Полностью очищает базу — используется при импорте сейва. */
export async function clearAll(): Promise<void> {
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
      await Promise.all([
        db.characters.clear(),
        db.habits.clear(),
        db.habitLogs.clear(),
        db.quests.clear(),
        db.realRewards.clear(),
        db.dayRecords.clear(),
        db.ledger.clear(),
        db.telemetry.clear(),
        db.settings.clear(),
      ]);
    },
  );
}
