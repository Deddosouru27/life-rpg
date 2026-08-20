/**
 * КАТАЛОГ-ШАБЛОН РЕАЛЬНЫХ НАГРАД.
 *
 * Главный сток экономики: золото покупает РАЗРЕШЕНИЕ на реальное
 * удовольствие, от которого игрок себя ограничивает. Воздержание порождает
 * валюту, валюта конвертируется обратно в жизнь.
 *
 * Зачем шаблон, если игрок вписывает награды сам: на первом запуске витрина
 * реальных наград пуста, потому что игрок ещё ничего не завёл. Пустая витрина
 * = отсутствие цели = мёртвая экономика с первого дня. Проверено руками:
 * на свежем сейве в «Лавке» не было ни одной покупаемой позиции.
 * Шаблон закрывает именно этот разрыв и остаётся именно шаблоном —
 * любую позицию можно изменить, переоценить или выбросить.
 *
 * ПРАВИЛО ЦЕНООБРАЗОВАНИЯ: `цена в золоте ≈ стоимость в тенге / 10`
 * (REAL_REWARD_TENGE_RATE). Курс взят из расчёта дневного дохода, а не из
 * оптимизации: при ~60 золота в день радость дня попадает в 2–6 дней, а
 * цель месяца — в 2–12 месяцев. Численная оптимизация отложена до реальной
 * телеметрии. Для наград без денежной цены (час игры, выходной без
 * будильника) цена назначена по ЭКВИВАЛЕНТУ УСИЛИЯ: во сколько дней
 * дисциплины честно оценить это разрешение.
 *
 * Три горизонта — намеренно, и это ядро мотивации:
 *  - `day`   — радость дня: один продуктивный день ≈ одна покупка.
 *  - `week`  — награда недели: видимая цель на 3–6 недель.
 *  - `month` — цель месяца: всегда выше текущего баланса, всегда впереди.
 */

import { tierForPrice } from '@/game/economy';
import type { RealRewardTier } from '@/game/types';

/** Горизонт достижимости — задаёт, в какой блок витрины попадает награда. */
export type RewardHorizon = 'day' | 'week' | 'month';

export interface RealRewardTemplate {
  id: string;
  name: string;
  /** Что именно разрешает эта покупка. Показывается в витрине как подпись. */
  note: string;
  /**
   * Имя иконки из библиотеки (src/ui/icons.tsx).
   *
   * В каталоге-шаблоне эмодзи запрещены: это контент приложения, а не
   * пользовательский. Свою награду игрок по-прежнему может пометить чем
   * угодно — там это его данные.
   */
  icon: string;
  price: number;
  horizon: RewardHorizon;
  /** Ориентир реальной стоимости в тенге, если она есть. null — цена по усилию. */
  tenge: number | null;
}

const DAY: RealRewardTemplate[] = [
  {
    id: 'tpl-sweet',
    name: 'Сладкое',
    note: 'Одна порция без чувства вины. Ты за неё заплатил.',
    icon: 'candy',
    price: 150,
    horizon: 'day',
    tenge: 1500,
  },
  {
    id: 'tpl-coffee',
    name: 'Кофе навынос',
    note: 'Не растворимый, а тот, за который платят баристе.',
    icon: 'droplet',
    price: 180,
    horizon: 'day',
    tenge: 1800,
  },
  {
    id: 'tpl-game-hour',
    name: 'Час игры',
    note: 'Ровно час. Разрешение куплено, таймер честный.',
    icon: 'tv',
    price: 200,
    horizon: 'day',
    tenge: null,
  },
  {
    id: 'tpl-video',
    name: 'Серия или ролик',
    note: 'Одна серия. Не «ещё одну».',
    icon: 'tv',
    price: 150,
    horizon: 'day',
    tenge: null,
  },
  {
    id: 'tpl-scroll-hour',
    name: 'Час лент',
    note: 'Самая дорогая радость дня — потому что самая липкая.',
    icon: 'phoneAway',
    price: 350,
    horizon: 'day',
    tenge: null,
  },
  {
    id: 'tpl-soda',
    name: 'Газировка',
    note: 'Холодная, из стекла.',
    icon: 'droplet',
    price: 100,
    horizon: 'day',
    tenge: 1000,
  },
  {
    id: 'tpl-snack',
    name: 'Фастфуд',
    note: 'Один заход. Осознанный, а не «так вышло».',
    icon: 'junkfood',
    price: 300,
    horizon: 'day',
    tenge: 3000,
  },
  {
    id: 'tpl-sleep-in',
    name: 'Утро без будильника',
    note: 'Один раз. Проснуться, когда проснёшься.',
    icon: 'bed',
    price: 250,
    horizon: 'day',
    tenge: null,
  },
  {
    id: 'tpl-taxi',
    name: 'Такси вместо автобуса',
    note: 'Когда лень — это решение, а не поражение.',
    icon: 'map',
    price: 250,
    horizon: 'day',
    tenge: 2500,
  },
  {
    id: 'tpl-dessert-out',
    name: 'Десерт в кофейне',
    note: 'Сесть, никуда не спешить, съесть.',
    icon: 'candy',
    price: 300,
    horizon: 'day',
    tenge: 3000,
  },
];

const WEEK: RealRewardTemplate[] = [
  {
    id: 'tpl-delivery',
    name: 'Доставка еды',
    note: 'Ужин, который ты не готовил и не мыл посуду после.',
    icon: 'cart',
    price: 500,
    horizon: 'week',
    tenge: 5000,
  },
  {
    id: 'tpl-cinema',
    name: 'Кино',
    note: 'Большой экран, попкорн, выключенный телефон.',
    icon: 'tv',
    price: 400,
    horizon: 'week',
    tenge: 4000,
  },
  {
    id: 'tpl-book',
    name: 'Книга',
    note: 'Бумажная. Та, которую давно откладывал.',
    icon: 'book',
    price: 600,
    horizon: 'week',
    tenge: 6000,
  },
  {
    id: 'tpl-restaurant',
    name: 'Ужин вне дома',
    note: 'Нормальное место, не фудкорт.',
    icon: 'salad',
    price: 1200,
    horizon: 'week',
    tenge: 12_000,
  },
  {
    id: 'tpl-videogame',
    name: 'Игра в библиотеку',
    note: 'Та, что в списке желаемого дольше всех.',
    icon: 'chess',
    price: 1500,
    horizon: 'week',
    tenge: 15_000,
  },
  {
    id: 'tpl-day-off',
    name: 'Выходной без планов',
    note: 'Целый день ничего не должен. Самое дорогое из недельного.',
    icon: 'weather',
    price: 2000,
    horizon: 'week',
    tenge: null,
  },
  {
    id: 'tpl-massage',
    name: 'Массаж',
    note: 'Час, в котором о теле заботится кто-то другой.',
    icon: 'peace',
    price: 1200,
    horizon: 'week',
    tenge: 12_000,
  },
  {
    id: 'tpl-trip-city',
    name: 'Поездка по городу',
    note: 'Музей, парк, район, где ни разу не был.',
    icon: 'map',
    price: 800,
    horizon: 'week',
    tenge: 8000,
  },
  {
    id: 'tpl-hobby-kit',
    name: 'Расходники для хобби',
    note: 'То, из-за отсутствия чего хобби стоит.',
    icon: 'craft',
    price: 1500,
    horizon: 'week',
    tenge: 15_000,
  },
  {
    id: 'tpl-concert',
    name: 'Концерт или матч',
    note: 'Живой звук, живая толпа.',
    icon: 'audio',
    price: 2500,
    horizon: 'week',
    tenge: 25_000,
  },
];

const MONTH: RealRewardTemplate[] = [
  {
    id: 'tpl-sneakers',
    name: 'Кроссовки',
    note: 'Те самые. Не «нормальные», а те самые.',
    icon: 'run',
    price: 4000,
    horizon: 'month',
    tenge: 40_000,
  },
  {
    id: 'tpl-headphones',
    name: 'Наушники',
    note: 'С шумодавом. Тишина по требованию.',
    icon: 'audio',
    price: 6000,
    horizon: 'month',
    tenge: 60_000,
  },
  {
    id: 'tpl-jacket',
    name: 'Куртка',
    note: 'Одна хорошая вместо трёх случайных.',
    icon: 'laundry',
    price: 5000,
    horizon: 'month',
    tenge: 50_000,
  },
  {
    id: 'tpl-gym-year',
    name: 'Годовой абонемент',
    note: 'Покупается дисциплиной, тратится на дисциплину.',
    icon: 'dumbbell',
    price: 12_000,
    horizon: 'month',
    tenge: 120_000,
  },
  {
    id: 'tpl-phone',
    name: 'Телефон',
    note: 'Крупная цель. Год честной работы над собой.',
    icon: 'phoneAway',
    price: 25_000,
    horizon: 'month',
    tenge: 250_000,
  },
  {
    id: 'tpl-laptop',
    name: 'Ноутбук',
    note: 'Инструмент, а не игрушка. Самая дальняя вершина каталога.',
    icon: 'code',
    price: 45_000,
    horizon: 'month',
    tenge: 450_000,
  },
  {
    id: 'tpl-trip',
    name: 'Поездка',
    note: 'Другой город, другая страна. То, что помнится годами.',
    icon: 'nature',
    price: 30_000,
    horizon: 'month',
    tenge: 300_000,
  },
  {
    id: 'tpl-course',
    name: 'Курс с наставником',
    note: 'Не видеокурс, а человек, который смотрит твою работу.',
    icon: 'school',
    price: 15_000,
    horizon: 'month',
    tenge: 150_000,
  },
  {
    id: 'tpl-chair',
    name: 'Хорошее кресло',
    note: 'Спина — это инфраструктура.',
    icon: 'posture',
    price: 10_000,
    horizon: 'month',
    tenge: 100_000,
  },
  {
    id: 'tpl-watch',
    name: 'Часы',
    note: 'Вещь, которую носят годами и не меняют.',
    icon: 'clock',
    price: 8000,
    horizon: 'month',
    tenge: 80_000,
  },
];

export const REAL_REWARD_TEMPLATES: readonly RealRewardTemplate[] = [
  ...DAY,
  ...WEEK,
  ...MONTH,
] as const;

export const TEMPLATES_BY_HORIZON: Record<RewardHorizon, readonly RealRewardTemplate[]> = {
  day: DAY,
  week: WEEK,
  month: MONTH,
};

export const HORIZON_LABELS: Record<RewardHorizon, string> = {
  day: 'Радости дня',
  week: 'Награды недели',
  month: 'Цели месяца',
};

export const HORIZON_HINTS: Record<RewardHorizon, string> = {
  day: 'Один продуктивный день — одна такая покупка',
  week: 'Копится от нескольких дней до пары недель',
  month: 'Далёкая цель. Всегда чуть выше баланса — так и задумано',
};

/**
 * Стартовый набор, предлагаемый при первом открытии лавки.
 *
 * Шесть позиций, а не тридцать: список из тридцати на пустом сейве —
 * это работа по вычёркиванию, а не подарок (feature fatigue,
 * docs/RESEARCH.md §3). По одной-две из каждого горизонта достаточно,
 * чтобы витрина ожила и правило «всегда есть цель чуть выше баланса»
 * заработало с первого дня.
 */
export const STARTER_TEMPLATE_IDS: readonly string[] = [
  'tpl-sweet',
  'tpl-game-hour',
  'tpl-scroll-hour',
  'tpl-delivery',
  'tpl-day-off',
  'tpl-sneakers',
] as const;

export function templateById(id: string): RealRewardTemplate | undefined {
  return REAL_REWARD_TEMPLATES.find((t) => t.id === id);
}

/** Тир награды по её цене — тот же расчёт, что и для наград, созданных вручную. */
export function templateTier(t: RealRewardTemplate): RealRewardTier {
  return tierForPrice(t.price);
}
