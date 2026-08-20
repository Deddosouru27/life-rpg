/**
 * Состояние приложения. Здесь НЕТ игровых вычислений — только вызовы движка,
 * сохранение результата в Dexie и раздача данных в UI.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  buildDaySchedule,
  buildLogIndex,
  createRuntimeRng,
  dayKeyOf,
  hpStage,
  runDailyCron,
  stalledHabits,
  hpEvents,
  projectCharacter,
  telemetryEvent,
  tickHabit as engineTickHabit,
  untickHabit as engineUntickHabit,
  untickHabitFully as engineUntickHabitFully,
  completeHabitFully as engineCompleteHabitFully,
  completeQuest as engineCompleteQuest,
  reopenQuest as engineReopenQuest,
  buyConsumable as engineBuyConsumable,
  buyCosmetic as engineBuyCosmetic,
  buyRealReward as engineBuyRealReward,
  useHealthElixir as engineUseElixir,
  useDoubleXpScroll as engineUseScroll,
  prestige as enginePrestige,
} from '@/game';
import type { LedgerPatch } from '@/game/actions';
import { CONSUMABLES } from '@/game/balance';
import type {
  CatalogItem,
  Character,
  ConsumableId,
  DayKey,
  DayRecord,
  GameEvent,
  Habit,
  HabitLog,
  LedgerEntry,
  Quest,
  RealReward,
  Settings,
  TelemetryEvent,
  TelemetryKind,
} from '@/game/types';
import { ensureSeeded } from '@/db/database';
import * as repo from '@/db/repository';
import { fireFeedback } from '@/ui/feedback';

export interface GameState {
  ready: boolean;
  character: Character;
  settings: Settings;
  habits: Habit[];
  logs: HabitLog[];
  quests: Quest[];
  realRewards: RealReward[];
  dayRecords: DayRecord[];
  /** Журнал начислений — источник правды по экономике. */
  ledger: LedgerEntry[];
  telemetry: TelemetryEvent[];
  today: DayKey;
  /** События последнего действия — потребляются оверлеями. */
  events: GameEvent[];
  consumeEvents: () => void;
}

export interface GameActions {
  tickHabit: (habit: Habit) => Promise<void>;
  untickHabit: (habit: Habit) => Promise<void>;
  untickHabitAll: (habit: Habit) => Promise<void>;
  completeHabit: (habit: Habit) => Promise<void>;
  addHabit: (draft: repo.HabitDraft) => Promise<void>;
  updateHabit: (habit: Habit) => Promise<void>;
  removeHabit: (habit: Habit) => Promise<void>;
  toggleHabitActive: (habit: Habit) => Promise<void>;

  addQuest: (draft: repo.QuestDraft) => Promise<void>;
  updateQuest: (quest: Quest) => Promise<void>;
  completeQuest: (quest: Quest) => Promise<void>;
  reopenQuest: (quest: Quest) => Promise<void>;
  removeQuest: (quest: Quest) => Promise<void>;
  toggleQuestStep: (quest: Quest, stepId: string) => Promise<void>;

  addRealReward: (draft: repo.RealRewardDraft) => Promise<void>;
  updateRealReward: (reward: RealReward) => Promise<void>;
  removeRealReward: (reward: RealReward) => Promise<void>;
  buyRealReward: (reward: RealReward) => Promise<boolean>;
  buyCosmetic: (item: CatalogItem) => Promise<boolean>;
  buyConsumable: (id: ConsumableId) => Promise<boolean>;
  equipCosmetic: (item: CatalogItem) => Promise<void>;

  useElixir: () => Promise<boolean>;
  useScroll: () => Promise<boolean>;
  doPrestige: () => Promise<void>;

  /** Записать событие телеметрии. Экраны пишут свои сигналы сами. */
  track: (
    kind: TelemetryKind,
    refId?: string | null,
    value?: number | null,
    meta?: string | null,
  ) => void;

  saveSettings: (settings: Settings) => Promise<void>;
  setCharacterName: (name: string) => Promise<void>;
  reload: () => Promise<void>;
}

const GameContext = createContext<(GameState & GameActions) | null>(null);

export function GameProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [realRewards, setRealRewards] = useState<RealReward[]>([]);
  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);

  const rng = useRef(createRuntimeRng());

  const rolloverHour = settings?.dayRolloverHour ?? 4;
  const [today, setToday] = useState<DayKey>(() => dayKeyOf(new Date(), 4));

  const reload = useCallback(async () => {
    const [c, s, h, l, q, r, d, led, tel] = await Promise.all([
      repo.loadCharacter(),
      repo.loadSettings(),
      repo.loadHabits(),
      repo.loadAllLogs(),
      repo.loadQuests(),
      repo.loadRealRewards(),
      repo.loadDayRecords(),
      repo.loadLedger(),
      repo.loadTelemetry(),
    ]);
    // Экономика персонажа ВСЕГДА пересчитывается из журнала при чтении.
    // Что бы ни лежало в записи персонажа, правдой является журнал: это
    // делает состояние на экране невосприимчивым к гонкам обработчиков
    // и к частично применённым записям.
    if (c) {
      const projected = projectCharacter(c, led);
      setCharacter(projected);

      // Запись персонажа — кэш проекции, и кэш обязан совпадать с правдой.
      // Покупки пишут только журнал, поэтому без этой синхронизации в
      // `characters` оставалось прежнее золото: на экране верно, в БД — нет.
      // Расхождение безобидно ровно до первого чтения в обход проекции
      // (экспорт сейва, синхронизация), поэтому сводим его сразу.
      if (
        projected.gold !== c.gold ||
        projected.level !== c.level ||
        projected.xp !== c.xp ||
        projected.hp !== c.hp
      ) {
        await repo.saveCharacter(projected);
      }
    }
    if (s) setSettings(s);
    setHabits(h);
    setLogs(l);
    setQuests(q);
    setRealRewards(r);
    setDayRecords(d);
    setLedger(led);
    setTelemetry(tel);
  }, []);

  // ── Загрузка и вечерний cron при старте.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seeded = await ensureSeeded();
      if (cancelled) return;

      const day = dayKeyOf(new Date(), seeded.settings.dayRolloverHour);
      const [allHabits, allLogs, allQuests, allLedger] = await Promise.all([
        repo.loadHabits(),
        repo.loadAllLogs(),
        repo.loadQuests(),
        repo.loadLedger(),
      ]);

      const cron = runDailyCron({
        character: seeded.character,
        habits: allHabits,
        logs: allLogs,
        quests: allQuests,
        ledger: allLedger,
        today: day,
        autoUseFreeze: seeded.settings.autoUseFreeze,
        now: Date.now(),
      });

      await repo.applyLedgerPatch(cron.ledgerAdded, []);
      await repo.saveCharacter(cron.character);
      await repo.saveHabits(cron.habits);
      await repo.saveQuests(cron.quests);
      await repo.saveDayRecords(cron.dayRecords);
      /*
        Открытие приложения + снимок забуксовавших привычек.

        «Привычка без отметок 3+ дня» вычисляется из логов, а не наступает
        событием: момента «бросил» в данных не существует. Но для калибровки
        нужен ряд наблюдений во времени, поэтому вывод фиксируется РАЗ В ДЕНЬ
        при первом открытии — иначе по экспорту нельзя будет сказать, когда
        именно привычка забуксовала.
      */
      const now = Date.now();
      const telemetryBatch = [telemetryEvent('appOpen', day, now)];
      const already = await repo.loadTelemetry();
      const snapshotToday = already.some((e) => e.kind === 'habitStalled' && e.day === day);
      if (!snapshotToday) {
        for (const habit of stalledHabits(cron.habits.length ? cron.habits : allHabits, allLogs, day)) {
          telemetryBatch.push(
            telemetryEvent('habitStalled', day, now, habit.id, null, habit.title),
          );
        }
      }
      await repo.appendTelemetry(telemetryBatch);

      if (cancelled) return;
      setToday(day);
      await reload();
      setEvents(cron.events.filter((e) => e.type !== 'reward'));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // ── Смена суток, пока приложение открыто.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const day = dayKeyOf(new Date(), rolloverHour);
      setToday((prev) => (prev === day ? prev : day));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [rolloverHour]);

  const consumeEvents = useCallback(() => setEvents([]), []);

  const emit = useCallback(
    (next: GameEvent[]) => {
      if (next.length === 0) return;
      setEvents((prev) => [...prev, ...next]);
      fireFeedback(next, settings);
    },
    [settings],
  );

  const logIndex = useMemo(() => buildLogIndex(logs), [logs]);

  const actionContext = useCallback(() => {
    if (!character) throw new Error('Персонаж не загружен.');
    return { character, habits, logIndex, ledger, day: today, rng: rng.current, now: Date.now() };
  }, [character, habits, ledger, logIndex, today]);

  /** Пишет телеметрию, не блокируя действие: наблюдение не должно ломать игру. */
  const track = useCallback(
    (
      kind: TelemetryKind,
      refId: string | null = null,
      value: number | null = null,
      meta: string | null = null,
    ) => {
      void repo
        .appendTelemetry([telemetryEvent(kind, today, Date.now(), refId, value, meta)])
        .catch((e: unknown) => console.error('Телеметрия не записана:', e));
    },
    [today],
  );

  /**
   * Единственный путь применения игрового действия.
   *
   * Порядок важен: журнал пишется ПЕРВЫМ и в транзакции. Запись персонажа —
   * это кэш проекции, и если процесс упадёт между двумя записями, следующий
   * `reload` всё равно пересчитает персонажа из журнала и получит верное
   * состояние. Обратный порядок оставил бы кэш впереди правды.
   */
  const commit = useCallback(
    async (
      patch: LedgerPatch,
      rest: () => Promise<void>,
      nextCharacter?: Character,
    ): Promise<void> => {
      await repo.applyLedgerPatch(patch.added, patch.removedIds);
      await rest();
      if (nextCharacter) await repo.saveCharacter(nextCharacter);
      await reload();
    },
    [reload],
  );

  // ─────────────────────────── Привычки

  const tickHabit = useCallback(
    async (habit: Habit) => {
      const out = engineTickHabit(actionContext(), habit);
      await commit(
        out.patch,
        async () => {
          await repo.saveLog(out.log);
          await repo.accrueDayTotals(today, out.xpGained, out.goldGained);
          if (habit.kind === 'negative') await repo.saveHabit(out.habit);
        },
        out.character,
      );
      track('habitTick', habit.id, out.xpGained);
      emit(out.events);
    },
    [actionContext, commit, emit, today, track],
  );

  const untickHabit = useCallback(
    async (habit: Habit) => {
      const out = engineUntickHabit(actionContext(), habit);
      await commit(
        out.patch,
        async () => {
          await repo.saveLog(out.log);
          await repo.accrueDayTotals(today, out.xpGained, out.goldGained);
        },
        out.character,
      );
      track('habitUntick', habit.id, out.xpGained);
    },
    [actionContext, commit, today, track],
  );

  const completeHabit = useCallback(
    async (habit: Habit) => {
      const out = engineCompleteHabitFully(actionContext(), habit);
      await commit(
        out.patch,
        async () => {
          await repo.saveLog(out.log);
          await repo.accrueDayTotals(today, out.xpGained, out.goldGained);
        },
        out.character,
      );
      track('habitComplete', habit.id, out.xpGained);
      emit(out.events);
    },
    [actionContext, commit, emit, today, track],
  );

  /** Полный откат привычки за день — снимает все отметки одним действием. */
  const untickHabitAll = useCallback(
    async (habit: Habit) => {
      const out = engineUntickHabitFully(actionContext(), habit);
      await commit(
        out.patch,
        async () => {
          await repo.saveLog(out.log);
          await repo.accrueDayTotals(today, out.xpGained, out.goldGained);
        },
        out.character,
      );
      track('habitUntick', habit.id, out.xpGained, 'all');
    },
    [actionContext, commit, today, track],
  );

  const addHabit = useCallback(
    async (draft: repo.HabitDraft) => {
      const habit = repo.buildHabit(draft);
      await repo.saveHabit(habit);
      await reload();
      track('habitCreated', habit.id, null, draft.presetId ?? 'custom');
    },
    [reload, track],
  );

  const updateHabit = useCallback(
    async (habit: Habit) => {
      await repo.saveHabit(habit);
      await reload();
    },
    [reload],
  );

  const removeHabit = useCallback(
    async (habit: Habit) => {
      await repo.deleteHabit(habit);
      await reload();
      track('habitDeleted', habit.id, null, habit.presetId ?? 'custom');
    },
    [reload, track],
  );

  const toggleHabitActive = useCallback(
    async (habit: Habit) => {
      await repo.saveHabit({ ...habit, active: !habit.active });
      await reload();
      track(habit.active ? 'habitDeactivated' : 'habitActivated', habit.id);
    },
    [reload, track],
  );

  // ─────────────────────────── Квесты

  const addQuest = useCallback(
    async (draft: repo.QuestDraft) => {
      const quest = repo.buildQuest(draft);
      await repo.saveQuest(quest);
      await reload();
      track('questCreated', quest.id, null, draft.difficulty);
    },
    [reload, track],
  );

  const updateQuest = useCallback(
    async (quest: Quest) => {
      await repo.saveQuest(quest);
      await reload();
    },
    [reload],
  );

  const completeQuest = useCallback(
    async (quest: Quest) => {
      const out = engineCompleteQuest(actionContext(), quest);
      await commit(
        out.patch,
        async () => {
          await repo.saveQuest(out.quest);
          await repo.accrueDayTotals(today, out.xpGained, out.goldGained);
        },
        out.character,
      );
      track('questCompleted', quest.id, out.xpGained);
      emit(out.events);
    },
    [actionContext, commit, emit, today, track],
  );

  const reopenQuest = useCallback(
    async (quest: Quest) => {
      // Открытие удаляет запись журнала — иначе закрыть/открыть даёт ферму XP.
      const out = engineReopenQuest(actionContext(), quest);
      await commit(out.patch, async () => repo.saveQuest(out.quest), out.character);
      track('questReopened', quest.id);
    },
    [actionContext, commit, track],
  );

  const removeQuest = useCallback(
    async (quest: Quest) => {
      await repo.deleteQuest(quest);
      await reload();
    },
    [reload],
  );

  const toggleQuestStep = useCallback(
    async (quest: Quest, stepId: string) => {
      const steps = quest.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
      await repo.saveQuest({ ...quest, steps });
      await reload();
    },
    [reload],
  );

  // ─────────────────────────── Магазин

  const addRealReward = useCallback(
    async (draft: repo.RealRewardDraft) => {
      const reward = repo.buildRealReward(draft);
      await repo.saveRealReward(reward);
      await reload();
      track('realRewardCreated', reward.id, reward.price, reward.tier);
    },
    [reload, track],
  );

  const updateRealReward = useCallback(
    async (reward: RealReward) => {
      await repo.saveRealReward(reward);
      await reload();
    },
    [reload],
  );

  const removeRealReward = useCallback(
    async (reward: RealReward) => {
      await repo.deleteRealReward(reward);
      await reload();
    },
    [reload],
  );

  const buyRealReward = useCallback(
    async (reward: RealReward): Promise<boolean> => {
      if (!character) return false;
      const out = engineBuyRealReward(character, reward, today, Date.now());
      if (!out) {
        track('purchaseBlocked', reward.id, reward.price, 'real');
        return false;
      }
      await commit({ added: [out.entry], removedIds: [] }, async () =>
        repo.saveRealReward(out.reward),
      );
      track('purchase', reward.id, reward.price, 'real');
      emit([{ type: 'purchase', itemName: reward.name, price: reward.price }]);
      return true;
    },
    [character, commit, emit, today, track],
  );

  const buyCosmetic = useCallback(
    async (item: CatalogItem): Promise<boolean> => {
      if (!character) return false;
      const entry = engineBuyCosmetic(character, item, today, Date.now());
      if (!entry) {
        track('purchaseBlocked', item.id, item.price, 'cosmetic');
        return false;
      }
      await commit({ added: [entry], removedIds: [] }, async () => undefined);
      track('purchase', item.id, item.price, 'cosmetic');
      emit([{ type: 'purchase', itemName: item.name, price: item.price }]);
      return true;
    },
    [character, commit, emit, today, track],
  );

  const buyConsumable = useCallback(
    async (id: ConsumableId): Promise<boolean> => {
      if (!character) return false;
      const entry = engineBuyConsumable(character, id, today, Date.now());
      if (!entry) {
        track('purchaseBlocked', id, null, 'consumable');
        return false;
      }
      const price = -entry.gold;
      await commit({ added: [entry], removedIds: [] }, async () => undefined);
      track('purchase', id, price, 'consumable');
      emit([{ type: 'purchase', itemName: CONSUMABLES[id].name, price }]);
      return true;
    },
    [character, commit, emit, today, track],
  );

  const equipCosmetic = useCallback(
    async (item: CatalogItem) => {
      if (!character) return;
      const next: Character = { ...character };
      if (item.cosmeticKind === 'theme') next.equippedTheme = next.equippedTheme === item.id ? null : item.id;
      if (item.cosmeticKind === 'frame') next.equippedFrame = next.equippedFrame === item.id ? null : item.id;
      if (item.cosmeticKind === 'title') next.equippedTitle = next.equippedTitle === item.id ? null : item.id;
      await repo.saveCharacter(next);
      await reload();
    },
    [character, reload],
  );

  // ─────────────────────────── Расходники и перерождение

  /** Номер использования расходника за сегодня — нужен для ключа записи журнала. */
  const useSeq = useCallback(
    (id: ConsumableId): number =>
      ledger.filter((e) => e.kind === 'useConsumable' && e.refId === id && e.day === today).length,
    [ledger, today],
  );

  const useElixir = useCallback(async (): Promise<boolean> => {
    if (!character) return false;
    const entry = engineUseElixir(character, today, useSeq('healthElixir'), Date.now());
    if (!entry) return false;
    const before = character;
    await commit({ added: [entry], removedIds: [] }, async () => undefined);
    // События берём из разницы состояний — единственный источник, который
    // не может разойтись с числами на экране.
    const after = projectCharacter(before, [...ledger, entry]);
    emit(hpEvents(before, after));
    return true;
  }, [character, commit, emit, ledger, today, useSeq]);

  const useScroll = useCallback(async (): Promise<boolean> => {
    if (!character) return false;
    const out = engineUseScroll(character, today, useSeq('doubleXpScroll'), Date.now());
    if (!out) return false;
    await commit({ added: [out.entry], removedIds: [] }, async () => undefined, out.character);
    return true;
  }, [character, commit, today, useSeq]);

  const doPrestige = useCallback(async () => {
    if (!character) return;
    await repo.saveCharacter(enginePrestige(character, today, Date.now()));
    await reload();
  }, [character, reload, today]);

  // ─────────────────────────── Настройки

  const saveSettings = useCallback(
    async (next: Settings) => {
      await repo.saveSettings(next);
      await reload();
    },
    [reload],
  );

  const setCharacterName = useCallback(
    async (name: string) => {
      if (!character) return;
      await repo.saveCharacter({ ...character, name: name.trim() || 'Странник' });
      await reload();
    },
    [character, reload],
  );

  const value = useMemo(() => {
    if (!character || !settings) return null;
    return {
      ready,
      character,
      settings,
      habits,
      logs,
      quests,
      realRewards,
      dayRecords,
      ledger,
      telemetry,
      today,
      events,
      consumeEvents,
      tickHabit,
      untickHabit,
      untickHabitAll,
      completeHabit,
      addHabit,
      updateHabit,
      removeHabit,
      toggleHabitActive,
      addQuest,
      updateQuest,
      completeQuest,
      reopenQuest,
      removeQuest,
      toggleQuestStep,
      addRealReward,
      updateRealReward,
      removeRealReward,
      buyRealReward,
      buyCosmetic,
      buyConsumable,
      equipCosmetic,
      useElixir,
      useScroll,
      doPrestige,
      track,
      saveSettings,
      setCharacterName,
      reload,
    };
  }, [
    ready, character, settings, habits, logs, quests, realRewards, dayRecords, ledger, telemetry,
    today, events, consumeEvents, tickHabit, untickHabit, untickHabitAll,
    completeHabit, addHabit, updateHabit, removeHabit,
    toggleHabitActive, addQuest, updateQuest, completeQuest, reopenQuest, removeQuest,
    toggleQuestStep, addRealReward, updateRealReward, removeRealReward, buyRealReward,
    buyCosmetic, buyConsumable, equipCosmetic, useElixir, useScroll, doPrestige,
    track, saveSettings, setCharacterName, reload,
  ]);

  // Ступень HP управляет визуальной деградацией всего интерфейса.
  useEffect(() => {
    if (!character) return;
    document.documentElement.dataset.hpStage = hpStage(character.hp);
  }, [character]);

  if (!value) {
    return <BootScreen />;
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

function BootScreen(): JSX.Element {
  return (
    <div className="grid min-h-dvh place-items-center px-8 text-center">
      <div>
        <p className="t-label">Хроника странника</p>
        <h1 className="t-display mt-2">Life RPG</h1>
        <p className="t-caption mt-4">Открываем фолиант…</p>
      </div>
    </div>
  );
}

export function useGame(): GameState & GameActions {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame использован вне GameProvider.');
  return ctx;
}

/** Расписание на сегодня — вычисляется движком, не компонентом. */
export function useTodaySchedule(): ReturnType<typeof buildDaySchedule> {
  const { habits, logs, today } = useGame();
  return useMemo(() => buildDaySchedule(habits, today, buildLogIndex(logs)), [habits, logs, today]);
}
