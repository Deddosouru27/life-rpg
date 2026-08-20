/**
 * Все игровые типы. Единственный источник истины по форме данных.
 * Ничего из этого файла не зависит от React, Dexie или браузера.
 */

// ─────────────────────────────────────────── Базовые

/** Дата в локальном календаре игрока, формат YYYY-MM-DD. */
export type DayKey = string;

/** Месяц в формате YYYY-MM. Используется для месячных лимитов расходников. */
export type MonthKey = string;

export type AttributeId = 'discipline' | 'body' | 'spirit' | 'wealth' | 'mind';

export const ATTRIBUTE_IDS: readonly AttributeId[] = [
  'discipline',
  'body',
  'spirit',
  'wealth',
  'mind',
] as const;

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';

export const RANK_ORDER: readonly Rank[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'] as const;

export type Difficulty = 'easy' | 'normal' | 'hard';

export type QuestDifficulty = 'trivial' | 'normal' | 'hard' | 'epic';

export type HabitKind = 'binary' | 'counter' | 'negative';

/** Ступень состояния здоровья — управляет визуальной деградацией и доступом к контенту. */
export type HpStage = 'healthy' | 'worn' | 'wounded' | 'exhausted';

// ─────────────────────────────────────────── Частота

export type Frequency =
  | { kind: 'daily' }
  /** N раз в неделю, конкретные дни не важны. */
  | { kind: 'timesPerWeek'; times: number }
  /** Конкретные дни недели: 0 = воскресенье … 6 = суббота. */
  | { kind: 'specificDays'; days: number[] };

// ─────────────────────────────────────────── Привычки

export interface Habit {
  id: string;
  title: string;
  /** Описание в стиле мира. */
  lore: string;
  icon: string;
  attribute: AttributeId;
  kind: HabitKind;
  difficulty: Difficulty;
  frequency: Frequency;
  /** Целевое число для kind === 'counter'. Для остальных всегда 1. */
  target: number;
  /** Выключенная привычка не назначается и не штрафует. */
  active: boolean;
  /** id пресета из каталога, если привычка создана из него. */
  presetId: string | null;
  currentStreak: number;
  bestStreak: number;
  /** Последний день, за который стрик был засчитан. */
  lastCompletedDay: DayKey | null;
  createdAt: number;
  updatedAt: number;
  /** Пометка мягкого удаления — нужна для last-write-wins синхронизации. */
  deleted: boolean;
}

/**
 * УСТАРЕЛО. Осталось только для чтения сейвов формата 1, где начисления
 * лежали внутри лога привычки. Начиная с формата 2 источник правды —
 * `LedgerEntry`, и миграция БД переносит эти записи в журнал.
 */
export interface RewardGrant {
  xp: number;
  gold: number;
  attribute: AttributeId;
  crit: boolean;
  rareFind: RareFind | null;
}

// ─────────────────────────────────────────── Журнал начислений (ledger)

/**
 * Что породило запись журнала. Нужен, чтобы отзыв снимал ровно свои записи
 * и чтобы телеметрия знала, откуда пришло каждое число.
 */
export type LedgerKind =
  | 'habit'
  | 'quest'
  | 'cron'
  | 'purchaseCosmetic'
  | 'purchaseConsumable'
  | 'purchaseReal'
  | 'useConsumable'
  | 'milestone'
  | 'seasonReward';

/**
 * ЕДИНСТВЕННЫЙ источник правды по экономике.
 *
 * Уровень, XP, золото, HP, атрибуты, инвентарь и купленное — ЧИСТАЯ ФУНКЦИЯ
 * от множества этих записей (см. `foldLedger` в `ledger.ts`). Никакая часть
 * кода не имеет права инкрементировать эти величины мутацией: она может
 * только добавить или удалить запись журнала.
 *
 * `id` детерминирован (см. `ledgerId`). Это даёт две гарантии:
 *  - повторное применение того же действия перезаписывает запись, а не
 *    добавляет вторую — двойной тап физически не может начислить дважды;
 *  - отзыв — это удаление по известному id, а не попытка «вычесть обратно».
 */
export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /** Игровой день, к которому запись относится. */
  day: DayKey;
  /** id привычки / квеста / товара — то, что породило запись. */
  refId: string;
  /** Порядковый номер внутри refId (отметка счётчика, повторная покупка). */
  seq: number;
  xp: number;
  /**
   * Базовый XP до множителей. Нужен для абсолютного дневного потолка:
   * потолок считается по базе, множители применяются сверх него.
   */
  baseXp: number;
  /** Отрицательное значение = трата. */
  gold: number;
  /** В какой атрибут идёт XP. null — общий XP без атрибута. */
  attribute: AttributeId | null;
  /** Дельта HP. Складывается по порядку с зажимом в [0, MAX_HP]. */
  hp: number;
  crit: boolean;
  /** Изменение инвентаря расходников. */
  consumable: { id: ConsumableId; delta: number } | null;
  /** id косметики, которая переходит в собственность. */
  cosmeticId: string | null;
  /** id локации, которая открывается. */
  unlocksLocationId: string | null;
  createdAt: number;
}

/** Запись выполнения привычки за конкретный день. */
export interface HabitLog {
  /** `${habitId}|${day}` */
  id: string;
  habitId: string;
  day: DayKey;
  /** Сколько раз отмечено. Для binary — 0 или 1. Для negative — число срывов. */
  count: number;
  /** Засчитан ли день как выполненный (по правилам вида привычки). */
  completed: boolean;
  /** УСТАРЕЛО: начисления живут в журнале. Поле сохранено пустым для миграции. */
  grants: RewardGrant[];
  updatedAt: number;
}

// ─────────────────────────────────────────── Квесты

export interface QuestStep {
  id: string;
  title: string;
  done: boolean;
}

export interface Quest {
  id: string;
  title: string;
  lore: string;
  attribute: AttributeId;
  difficulty: QuestDifficulty;
  /** DayKey дедлайна либо null. */
  dueDay: DayKey | null;
  steps: QuestStep[];
  done: boolean;
  completedAt: number | null;
  /** УСТАРЕЛО: начисление живёт в журнале. Сохранено для миграции сейвов. */
  grant: RewardGrant | null;
  /** Уже начислен ли штраф за просрочку — чтобы не начислять повторно. */
  overduePenaltyApplied: boolean;
  /** id локации, которую открывает завершение квеста. */
  unlocksLocationId: string | null;
  /** id квеста, который должен быть завершён до появления этого. */
  requiresQuestId: string | null;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

// ─────────────────────────────────────────── Магазин

export type ShopCategory = 'real' | 'cosmetic' | 'consumable';

export type CosmeticKind = 'theme' | 'frame' | 'title' | 'sound' | 'location';

export type RealRewardTier = 'small' | 'medium' | 'large';

export type ConsumableId = 'streakFreeze' | 'healthElixir' | 'doubleXpScroll' | 'indulgence';

/** Товар из статического каталога (косметика и расходники). */
export interface CatalogItem {
  id: string;
  name: string;
  lore: string;
  icon: string;
  category: 'cosmetic' | 'consumable';
  price: number;
  /** Ступень каталога косметики I–V. Для расходников — 0. */
  tier: number;
  cosmeticKind: CosmeticKind | null;
  consumableId: ConsumableId | null;
  /** Минимальный ранг для показа в витрине. */
  requiredRank: Rank | null;
  /** id локации, в лавке которой продаётся товар. */
  locationId: string;
  /** Для cosmeticKind === 'location' — какую локацию открывает покупка. */
  unlocksLocationId: string | null;
  /** Сезонный эксклюзив: выдаётся только наградой сезонной шкалы. */
  seasonal: boolean;
}

/** Реальная награда, которую игрок создаёт сам. */
export interface RealReward {
  id: string;
  name: string;
  note: string;
  icon: string;
  price: number;
  tier: RealRewardTier;
  /** Сколько раз уже выкуплена. Реальные награды можно покупать повторно. */
  purchasedCount: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

// ─────────────────────────────────────────── Торговец и локации

export interface GameLocation {
  id: string;
  name: string;
  lore: string;
  icon: string;
  /** Стартовая локация доступна всегда. */
  isStarting: boolean;
  /** Минимальная ступень HP, при которой локация доступна. */
  minHpStage: HpStage;
}

export type MerchantLineKey =
  | 'greeting'
  | 'purchase'
  | 'poor'
  | 'farewell'
  | 'browse'
  | 'wounded'
  | 'exhausted'
  | 'comeback'
  | 'milestone';

/** Условия, при которых реплика уместна. Пустые поля = «без ограничения». */
export interface MerchantLine {
  text: string;
  /** Реплика доступна только на этих рангах. */
  ranks?: Rank[];
  /** Минимальная длина глобального стрика. */
  minStreak?: number;
  /** Максимальная длина глобального стрика. */
  maxStreak?: number;
  /** Реплика доступна только на этих ступенях HP. */
  hpStages?: HpStage[];
}

export interface Merchant {
  id: string;
  name: string;
  title: string;
  icon: string;
  locationId: string;
  /** Короткое описание характера — для экрана лавки. */
  personality: string;
  lines: Record<MerchantLineKey, MerchantLine[]>;
}

// ─────────────────────────────────────────── Персонаж

export interface AttributeState {
  level: number;
  xp: number;
}

export interface ConsumableStock {
  /** Сколько сейчас в инвентаре. */
  owned: number;
  /** Сколько куплено в текущем месяце (для лимита и роста цены). */
  purchasedThisMonth: number;
  /** Месяц, к которому относится счётчик. */
  month: MonthKey;
}

export interface SeasonState {
  /** Порядковый номер сезона, с 1. */
  index: number;
  startDay: DayKey;
  xp: number;
  tier: number;
  /** id уже выданных сезонных наград. */
  claimedTiers: number[];
}

export interface SeasonRecord {
  index: number;
  startDay: DayKey;
  endDay: DayKey;
  tierReached: number;
  bestStreak: number;
  completionRate: number;
  topAttribute: AttributeId;
  crits: number;
}

export interface Character {
  /** Всегда 'me' — сейв на одного игрока. */
  id: 'me';
  name: string;
  /**
   * ПРОИЗВОДНЫЕ ПОЛЯ. Всё, что ниже до `attributes` включительно, а также
   * `consumables`, `ownedCosmetics`, `unlockedLocations` и экономическая
   * часть `stats`, вычисляется функцией `projectCharacter` из журнала
   * начислений. Присваивать их напрямую запрещено: любое присваивание будет
   * стёрто следующим пересчётом. Менять экономику можно только записью
   * в журнал.
   */
  level: number;
  xp: number;
  gold: number;
  hp: number;
  attributes: Record<AttributeId, AttributeState>;
  /**
   * Сколько совокупного XP не учитывается в текущем цикле перерождения.
   * Единственный способ обнулить уровень, не переписывая историю.
   */
  xpOffset: number;
  globalStreak: number;
  bestGlobalStreak: number;
  /** Последний день, обработанный вечерним cron. */
  lastProcessedDay: DayKey | null;
  /** Последний день, в который игрок хоть что-то отметил. */
  lastActiveDay: DayKey | null;
  consumables: Record<ConsumableId, ConsumableStock>;
  /** Бесплатные автозаморозки, доступные в этом месяце. */
  freeFreezesLeft: number;
  freeFreezesPerMonth: number;
  freeFreezeMonth: MonthKey;
  /** Выполнений подряд без крита — для pity-таймера. */
  critDrought: number;
  ownedCosmetics: string[];
  unlockedLocations: string[];
  equippedTheme: string | null;
  equippedFrame: string | null;
  equippedTitle: string | null;
  prestigeSeals: number;
  /** Активен ли свиток двойного XP и на какой день. */
  doubleXpDay: DayKey | null;
  season: SeasonState | null;
  seasonHistory: SeasonRecord[];
  unlockedAchievements: string[];
  /** Накопительная статистика для достижений. */
  stats: CharacterStats;
  updatedAt: number;
}

export interface CharacterStats {
  totalCompletions: number;
  totalCrits: number;
  totalGoldEarned: number;
  totalGoldSpent: number;
  perfectDays: number;
  perfectDayStreak: number;
  bestPerfectDayStreak: number;
  questsCompleted: number;
  daysPlayed: number;
}

// ─────────────────────────────────────────── История дней

export interface DayRecord {
  /** DayKey. */
  day: DayKey;
  dueCount: number;
  doneCount: number;
  /** doneCount / dueCount, либо 1 если dueCount === 0. */
  completionRate: number;
  perfect: boolean;
  /** Засчитан ли день для глобального стрика. */
  counted: boolean;
  xpGained: number;
  goldGained: number;
  hpDelta: number;
  /** Использована ли заморозка в этот день. */
  freezeUsed: boolean;
  updatedAt: number;
}

// ─────────────────────────────────────────── Телеметрия

/**
 * Что записываем локально для будущей перекалибровки симуляции.
 * Внешних данных об удержании habit-трекеров по типу механики не существует
 * (см. docs/RESEARCH.md §0.1), поэтому калибровать модель можно только
 * на собственных данных.
 */
export type TelemetryKind =
  | 'appOpen'
  | 'habitTick'
  | 'habitUntick'
  | 'habitComplete'
  | 'habitCreated'
  | 'habitDeleted'
  | 'habitDeactivated'
  | 'habitActivated'
  | 'questCreated'
  | 'questCompleted'
  | 'questReopened'
  | 'purchase'
  | 'purchaseBlocked'
  | 'realRewardCreated'
  /** Товар показан игроку в витрине и не куплен в этот заход. */
  | 'itemViewed'
  /** Привычка назначалась и не отмечалась ABANDON_DAYS дней подряд. */
  | 'habitStalled'
  /**
   * Уход с экрана. `value` — сколько миллисекунд на нём пробыли.
   * Пишется на ВЫХОДЕ, а не на входе: длительность иначе неизвестна.
   */
  | 'screenView';

export interface TelemetryEvent {
  id: string;
  at: number;
  day: DayKey;
  kind: TelemetryKind;
  /** id сущности, к которой относится событие. */
  refId: string | null;
  /** Числовая величина: цена покупки, номер отметки, длина сессии. */
  value: number | null;
  /** Свободная пометка: имя экрана, причина блокировки покупки. */
  meta: string | null;
}

/**
 * «Брошенная привычка» — вычисляется, а не записывается: привычка активна,
 * назначалась, но не отмечалась ABANDON_DAYS дней подряд. Чистая функция
 * от логов, поэтому в телеметрию попадает уже как вывод.
 */
export interface AbandonedHabit {
  habitId: string;
  title: string;
  /** Сколько дней назначалась и не выполнялась. */
  missedDays: number;
  lastCompletedDay: DayKey | null;
}

// ─────────────────────────────────────────── Достижения

export type AchievementCheck = (c: Character) => boolean;

export interface Achievement {
  id: string;
  name: string;
  lore: string;
  icon: string;
  /** Человекочитаемое условие для UI. */
  requirement: string;
  check: AchievementCheck;
}

// ─────────────────────────────────────────── Результаты игровых операций

/** Что начислилось за одно действие. Используется UI для всплывающих цифр. */
export interface RewardBreakdown {
  xp: number;
  gold: number;
  attribute: AttributeId;
  crit: boolean;
  rareFind: RareFind | null;
  streakMultiplier: number;
}

export type RareFind =
  | { kind: 'gold'; amount: number }
  | { kind: 'consumable'; consumableId: ConsumableId };

/** Событие, которое UI должен показать игроку (тост, экран, звук). */
export type GameEvent =
  | { type: 'reward'; reward: RewardBreakdown }
  | { type: 'levelUp'; level: number; rank: Rank; rankChanged: boolean }
  | { type: 'attributeLevelUp'; attribute: AttributeId; level: number }
  | { type: 'hpChanged'; from: number; to: number; stage: HpStage; stageChanged: boolean }
  | { type: 'streakMilestone'; days: number; goldReward: number; title: string | null }
  | { type: 'achievement'; achievementId: string }
  | { type: 'seasonTier'; tier: number }
  | { type: 'seasonEnded'; record: SeasonRecord }
  | { type: 'comeback'; daysAway: number; streakKept: number }
  | { type: 'freezeUsed'; day: DayKey; free: boolean }
  | { type: 'purchase'; itemName: string; price: number }
  | { type: 'exhausted' }
  | { type: 'recovered' };

/** Итог применения чистой игровой операции: новое состояние + события. */
export interface EngineResult<T> {
  state: T;
  events: GameEvent[];
}

// ─────────────────────────────────────────── Настройки

export interface Settings {
  id: 'settings';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** Час, после которого сутки считаются новыми (0–6). Позволяет ложиться в 2 ночи. */
  dayRolloverHour: number;
  /** Автоматически тратить заморозку при пропуске. */
  autoUseFreeze: boolean;
  syncEnabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Идентификатор устройства — для конфликтов синхронизации. */
  deviceId: string;
  lastSyncAt: number | null;
  onboarded: boolean;
  updatedAt: number;
}

// ─────────────────────────────────────────── Сейв

export interface SaveFile {
  format: 'life-rpg-save';
  version: number;
  exportedAt: number;
  character: Character;
  habits: Habit[];
  habitLogs: HabitLog[];
  quests: Quest[];
  realRewards: RealReward[];
  dayRecords: DayRecord[];
  /** Журнал начислений — без него сейв не восстанавливает экономику. */
  ledger: LedgerEntry[];
  /** Телеметрия едет вместе с сейвом: она нужна для перекалибровки модели. */
  telemetry: TelemetryEvent[];
  settings: Settings;
}
