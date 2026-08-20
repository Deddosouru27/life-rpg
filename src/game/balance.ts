/**
 * ЕДИНСТВЕННЫЙ ФАЙЛ БАЛАНСА.
 *
 * Все числа игры живут здесь. Крути их, не трогая код.
 * Каждое значение соответствует docs/GAME_DESIGN.md — при изменении обнови документ.
 */

import type {
  ConsumableId,
  Difficulty,
  HpStage,
  QuestDifficulty,
  Rank,
  RealRewardTier,
} from './types';

// ══════════════════════════════════════════ ПРОГРЕССИЯ

/** xpToNextLevel(L) = XP_BASE * L ^ XP_EXPONENT */
export const XP_BASE = 20;
export const XP_EXPONENT = 1.15;
export const MAX_LEVEL = 100;

/** attrXpToNextLevel(A) = ATTR_XP_BASE * A ^ ATTR_XP_EXPONENT */
export const ATTR_XP_BASE = 12;
export const ATTR_XP_EXPONENT = 1.1;
export const MAX_ATTR_LEVEL = 100;

/** Минимальный глобальный уровень для каждого ранга. */
export const RANK_THRESHOLDS: Record<Rank, number> = {
  E: 1,
  D: 10,
  C: 20,
  B: 35,
  A: 50,
  S: 70,
  SS: 90,
};

export const RANK_TITLES: Record<Rank, string> = {
  E: 'Безымянный',
  D: 'Странник',
  C: 'Наёмник',
  B: 'Витязь',
  A: 'Магистр',
  S: 'Владыка',
  SS: 'Легенда',
};

// ══════════════════════════════════════════ НАГРАДЫ

export const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 8,
  normal: 15,
  hard: 25,
};

export const XP_BY_QUEST_DIFFICULTY: Record<QuestDifficulty, number> = {
  trivial: 5,
  normal: 15,
  hard: 40,
  epic: 120,
};

/** Золото = round(xp * GOLD_RATIO). */
export const GOLD_RATIO = 0.4;

export const PERFECT_DAY_XP = 50;
export const PERFECT_DAY_GOLD = 30;

/**
 * АБСОЛЮТНЫЙ потолок базового XP за сутки — из привычек и квестов вместе.
 *
 * Раньше потолок был относительным: 1.5 × сумма базового XP активных
 * привычек, причём счётчик входил в сумму целиком (base × target). Это не
 * потолок, а самодекларация: игрок, заведя «отжимания, 50 раз, трудная»,
 * поднимал себе потолок до 1875 XP и брал 11-й уровень за минуту тапов
 * (замер на движке; разбор — docs/GAME_DESIGN.md, П1). Кран, ограниченный числом,
 * которое задаёт сам игрок, — не ограниченный кран.
 *
 * Теперь потолок абсолютный и не зависит ни от числа привычек, ни от их
 * целей. Множители (стрик, крит, свиток, печати) применяются СВЕРХ потолка,
 * поэтому крит остаётся заметным, а максимум суток остаётся конечным и
 * известным заранее.
 *
 * ОТКУДА ЧИСЛО. Выведено замером на движке от честного профиля (8 привычек ≈
 * 109 базового XP за идеальный день), а НЕ найдено оптимизацией. Численная
 * оптимизация баланса отложена до накопления реальной телеметрии: калибровать
 * модель по литературе невозможно (docs/RESEARCH.md §0.1), а по выдуманным
 * персонам — значит подгонять числа под собственные допущения.
 */
export const DAILY_BASE_XP_CAP = 150;

/** Абсолютный потолок золота за сутки, включая редкие находки. */
export const DAILY_GOLD_CAP = 220;

// ══════════════════════════════════════════ VARIABLE RATIO

export const CRIT_CHANCE = 0.08;
export const CRIT_MULTIPLIER = 3;
/** Гарантированный крит после стольких выполнений подряд без крита. */
export const CRIT_PITY_THRESHOLD = 25;

export const RARE_FIND_CHANCE = 0.015;
export const RARE_FIND_GOLD_MIN = 100;
export const RARE_FIND_GOLD_MAX = 400;
/** Максимальная цель счётчика. Валидируется в движке, а не только в поле ввода. */
export const COUNTER_TARGET_MAX = 50;
export const COUNTER_TARGET_MIN = 2;
/** Доля редких находок, отдающая расходник вместо золота. */
export const RARE_FIND_CONSUMABLE_SHARE = 0.3;

// ══════════════════════════════════════════ СТРИКИ

/** +10% к наградам за каждые 7 дней стрика. */
export const STREAK_BONUS_PER_WEEK = 0.1;
export const STREAK_DAYS_PER_STEP = 7;
export const STREAK_MULTIPLIER_CAP = 1.5;

/** Доля выполненных привычек, при которой день засчитывается в глобальный стрик. */
export const GLOBAL_STREAK_THRESHOLD = 0.6;

export interface StreakMilestone {
  days: number;
  gold: number;
  /** Прибавляет ли веха постоянную бесплатную автозаморозку. */
  freeFreeze: boolean;
  title: string | null;
  frame: string | null;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { days: 7, gold: 200, freeFreeze: false, title: null, frame: null },
  { days: 30, gold: 0, freeFreeze: true, title: 'Упорный', frame: null },
  { days: 60, gold: 0, freeFreeze: true, title: null, frame: null },
  { days: 90, gold: 0, freeFreeze: true, title: 'Несгибаемый', frame: 'frame-oak' },
  { days: 180, gold: 0, freeFreeze: true, title: 'Железный', frame: null },
  { days: 365, gold: 5000, freeFreeze: false, title: 'Хранитель Года', frame: 'frame-year' },
] as const;

// ══════════════════════════════════════════ HP И ПРОВАЛЫ

export const MAX_HP = 100;
export const HP_LOSS_PER_MISS = 4;
/** Максимальная потеря HP за одни сутки. Полностью проваленный день не убивает. */
export const HP_LOSS_DAILY_CAP = 20;
/** Потеря HP за отмеченный срыв негативной привычки, по сложности. */
export const HP_LOSS_BY_NEGATIVE: Record<Difficulty, number> = {
  easy: 4,
  normal: 8,
  hard: 12,
};
export const HP_LOSS_QUEST_OVERDUE = 6;

export const HP_REGEN_HALF_DAY = 8;
export const HP_REGEN_PERFECT_DAY = 15;
/** Доля выполнения, начиная с которой идёт регенерация. */
export const HP_REGEN_THRESHOLD = 0.5;

/** Порог выхода из истощения. */
export const EXHAUSTION_EXIT_HP = 25;
export const EXHAUSTION_GOLD_MULTIPLIER = 0.5;

/** Нижняя граница HP для каждой ступени состояния. */
export const HP_STAGE_THRESHOLDS: Record<HpStage, number> = {
  healthy: 70,
  worn: 40,
  wounded: 1,
  exhausted: 0,
};

/** Насыщенность интерфейса на каждой ступени — визуальная деградация. */
export const HP_STAGE_SATURATION: Record<HpStage, number> = {
  healthy: 1,
  worn: 0.85,
  wounded: 0.6,
  exhausted: 0.25,
};

export const HP_STAGE_LABELS: Record<HpStage, string> = {
  healthy: 'Полон сил',
  worn: 'Потрёпан',
  wounded: 'Изранен',
  exhausted: 'Истощён',
};

/** Максимальная ступень каталога косметики, видимая на каждой ступени HP. */
export const HP_STAGE_MAX_COSMETIC_TIER: Record<HpStage, number> = {
  healthy: 5,
  worn: 5,
  wounded: 3,
  exhausted: 2,
};

/** Доступны ли нестартовые локации на этой ступени HP. */
export const HP_STAGE_ALLOWS_TRAVEL: Record<HpStage, boolean> = {
  healthy: true,
  worn: true,
  wounded: false,
  exhausted: false,
};

// ══════════════════════════════════════════ ВОЗВРАЩЕНИЕ

/** Отсутствие от стольких дней включает мягкое правило возвращения. */
export const COMEBACK_DAYS_THRESHOLD = 3;
export const COMEBACK_HP = 50;
/** Какая доля стрика сохраняется при возвращении. */
export const COMEBACK_STREAK_RATIO = 0.5;
/** Сколько пропущенных дней максимум обрабатывает cron до включения правила возвращения. */
export const MAX_CATCHUP_DAYS = 2;

// ══════════════════════════════════════════ РАСХОДНИКИ

export interface ConsumableConfig {
  id: ConsumableId;
  name: string;
  lore: string;
  icon: string;
  price: number;
  maxOwned: number;
  maxPerMonth: number;
  /** Цена умножается на это за каждую покупку в текущем месяце. */
  priceGrowth: number;
}

export const CONSUMABLES: Record<ConsumableId, ConsumableConfig> = {
  streakFreeze: {
    id: 'streakFreeze',
    name: 'Печать Стужи',
    lore: 'Заморозит цепь твоих дней. Пропуск не разорвёт её — лёд помнит форму.',
    icon: 'cold',
    price: 350,
    maxOwned: 2,
    maxPerMonth: 4,
    priceGrowth: 1.4,
  },
  healthElixir: {
    id: 'healthElixir',
    name: 'Эликсир Жизни',
    lore: 'Багровое варево. Возвращает сорок мер сил тому, кто загнал себя.',
    icon: 'droplet',
    price: 250,
    maxOwned: 3,
    maxPerMonth: 6,
    priceGrowth: 1.3,
  },
  doubleXpScroll: {
    id: 'doubleXpScroll',
    name: 'Свиток Двойного Пути',
    lore: 'Развернёшь на рассвете — и всё, что сделаешь до заката, зачтётся вдвойне.',
    icon: 'scroll',
    price: 600,
    maxOwned: 1,
    maxPerMonth: 2,
    priceGrowth: 1.6,
  },
  indulgence: {
    id: 'indulgence',
    name: 'Индульгенция',
    lore: 'Клочок пергамента с чужой печатью. Отменяет один вчерашний грех.',
    icon: 'peace',
    price: 500,
    maxOwned: 2,
    maxPerMonth: 3,
    priceGrowth: 1.5,
  },
};

export const CONSUMABLE_EFFECT_HP = 40;

/** Каждые сколько дней глобального стрика прибавляется бесплатная автозаморозка. */
export const FREE_FREEZE_PER_STREAK_MILESTONE = 30;
export const FREE_FREEZE_CAP = 4;
export const FREE_FREEZE_START = 0;

// ══════════════════════════════════════════ РЕАЛЬНЫЕ НАГРАДЫ

/** Золото ≈ реальная стоимость в тенге / REAL_REWARD_TENGE_RATE. */
export const REAL_REWARD_TENGE_RATE = 10;

export const REAL_REWARD_TIERS: Record<RealRewardTier, { min: number; max: number; label: string; hint: string }> = {
  small: { min: 300, max: 800, label: 'Мелкая', hint: '3–6 дней' },
  medium: { min: 2000, max: 4000, label: 'Средняя', hint: '2–4 недели' },
  large: { min: 10000, max: Number.POSITIVE_INFINITY, label: 'Крупная', hint: '2–3 месяца и больше' },
};

/** Сколько последних дней берётся для расчёта «≈ N дней при твоём темпе». */
export const PACE_WINDOW_DAYS = 14;
/** Минимум завершённых дней, при котором расчёту темпа можно верить. */
export const PACE_MIN_DAYS = 3;
/** Резервный дневной доход, пока истории мало. Соответствует 70% выполнения. */
export const FALLBACK_DAILY_GOLD = 63;

// ══════════════════════════════════════════ КВЕСТЫ

export const QUEST_DIFFICULTY_LABELS: Record<QuestDifficulty, string> = {
  trivial: 'Тривиальный',
  normal: 'Обычный',
  hard: 'Трудный',
  epic: 'Эпический',
};

// ══════════════════════════════════════════ ЭНДГЕЙМ

export const SEASON_LENGTH_DAYS = 90;
export const SEASON_UNLOCK_LEVEL = 50;
export const SEASON_TIERS = 30;
/** seasonXpToNext(t) = SEASON_XP_BASE + SEASON_XP_STEP * t */
export const SEASON_XP_BASE = 300;
export const SEASON_XP_STEP = 60;

export const PRESTIGE_LEVEL = 100;
export const PRESTIGE_XP_BONUS = 0.03;
export const PRESTIGE_GOLD_BONUS = 0.03;

// ══════════════════════════════════════════ ПРОЧЕЕ

/** Час, после которого начинаются новые игровые сутки (по умолчанию 4 утра). */
export const DEFAULT_DAY_ROLLOVER_HOUR = 4;

/** Сколько назначенных и не выполненных дней подряд считать привычку брошенной. */
export const ABANDON_DAYS = 7;

export const ATTRIBUTE_LABELS = {
  discipline: 'ДИСЦИПЛИНА',
  body: 'ТЕЛО',
  spirit: 'ДУХ',
  wealth: 'БОГАТСТВО',
  mind: 'РАЗУМ',
} as const;

export const ATTRIBUTE_ICONS = {
  discipline: 'attrDiscipline',
  body: 'attrBody',
  spirit: 'attrSpirit',
  wealth: 'attrWealth',
  mind: 'book',
} as const;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Лёгкая',
  normal: 'Обычная',
  hard: 'Трудная',
};
