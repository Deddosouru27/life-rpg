/**
 * Каталог косметики и расходников.
 *
 * Суммарная стоимость косметики — около 162 000 золота, что при 70% выполнения
 * составляет примерно семь лет дохода. Каталог невозможно скупить: на любом
 * балансе остаётся желанная покупка вне бюджета (см. GAME_DESIGN.md §3).
 */

import { CONSUMABLES } from '@/game/balance';
import type { CatalogItem, ConsumableId } from '@/game/types';

/**
 * Иконка косметики выводится из её вида, а не задаётся поштучно.
 * Пять видов — пять иконок: набор остаётся связным, а не превращается
 * в зоопарк из двадцати четырёх разных значков.
 */
const COSMETIC_ICON: Record<NonNullable<CatalogItem['cosmeticKind']>, string> = {
  theme: 'book',
  frame: 'award',
  title: 'scroll',
  sound: 'audio',
  location: 'map',
};

function cosmetic(
  id: string,
  name: string,
  lore: string,
  tier: number,
  price: number,
  kind: CatalogItem['cosmeticKind'],
  extra: Partial<CatalogItem> = {},
): CatalogItem {
  return {
    id,
    name,
    lore,
    icon: kind ? COSMETIC_ICON[kind] : 'sparkles',
    category: 'cosmetic',
    price,
    tier,
    cosmeticKind: kind,
    consumableId: null,
    requiredRank: null,
    locationId: 'town',
    unlocksLocationId: null,
    seasonal: false,
    ...extra,
  };
}

// ─────────────────────────────────────────── Ступень I — 1 200

const TIER_I: CatalogItem[] = [
  cosmetic('theme-ash', 'Пепельный переплёт', 'Тёмный, как остывший очаг. Ничего лишнего.', 1, 1200, 'theme'),
  cosmetic('theme-moss', 'Мшистый фолиант', 'Зелень, что проросла сквозь камень старой башни.', 1, 1200, 'theme'),
  cosmetic('frame-iron', 'Железный обод', 'Простая рамка кузнечной работы. Держит крепко.', 1, 1200, 'frame'),
  cosmetic('title-walker', 'Титул: Пешеход', 'Тот, кто идёт своими ногами и не просит подвезти.', 1, 1200, 'title'),
  cosmetic('sound-quill', 'Звук: Перо и пергамент', 'Тихий скрип, знакомый каждому писцу.', 1, 1200, 'sound'),
  cosmetic('theme-dust', 'Пыльный свиток', 'Выцветший от солнца. Носится годами.', 1, 1200, 'theme'),
];

// ─────────────────────────────────────────── Ступень II — 3 000

const TIER_II: CatalogItem[] = [
  cosmetic('theme-wine', 'Винный сафьян', 'Переплёт цвета густого вина. Дорогая кожа, дешёвый повод.', 2, 3000, 'theme'),
  cosmetic('theme-ink', 'Чернильная ночь', 'Настолько тёмный, что золото на нём горит.', 2, 3000, 'theme'),
  cosmetic('frame-bronze', 'Бронзовый венец', 'Литой обод с чеканкой. Заметен издалека.', 2, 3000, 'frame'),
  cosmetic('title-steadfast', 'Титул: Стойкий', 'Тот, кого не сдвинули ни лень, ни погода.', 2, 3000, 'title'),
  cosmetic('sound-coins', 'Звук: Звон монет', 'Самый приятный звук на любой ярмарке.', 2, 3000, 'sound'),
  cosmetic('sound-forge', 'Звук: Кузница', 'Молот по наковальне на каждое закрытое дело.', 2, 3000, 'sound'),
];

// ─────────────────────────────────────────── Ступень III — 6 500, ранг C

const TIER_III: CatalogItem[] = [
  cosmetic('theme-emerald', 'Изумрудный кодекс', 'Переплёт, за который в гавани дают корабль.', 3, 6500, 'theme', { requiredRank: 'C' }),
  cosmetic('theme-obsidian', 'Обсидиановый том', 'Чёрное стекло вулкана. Режет взгляд.', 3, 6500, 'theme', { requiredRank: 'C' }),
  cosmetic('frame-silver', 'Серебряный обод', 'Тонкая работа. Серебро не темнеет, если его носят.', 3, 6500, 'frame', { requiredRank: 'C' }),
  cosmetic('frame-runic', 'Рунический обод', 'Резьба, которую никто в городе не может прочесть.', 3, 6500, 'frame', { requiredRank: 'C' }),
  cosmetic('title-relentless', 'Титул: Неумолимый', 'Тот, кого проще пропустить, чем остановить.', 3, 6500, 'title', { requiredRank: 'C' }),
  cosmetic('sound-choir', 'Звук: Хор в соборе', 'Низкий гул, от которого дрожат витражи.', 3, 6500, 'sound', { requiredRank: 'C' }),
];

// ─────────────────────────────────────────── Ступень IV — 12 000, ранг B

const TIER_IV: CatalogItem[] = [
  cosmetic('loc-harbor', 'Грамота: Соляная гавань', 'Пропуск в порт и к торговцу, что ходит за море.', 4, 12000, 'location', {
    requiredRank: 'B',
    unlocksLocationId: 'harbor',
  }),
  cosmetic('loc-highlands', 'Грамота: Заоблачный перевал', 'Право пройти горной тропой. Дорого и не всем.', 4, 12000, 'location', {
    requiredRank: 'B',
    unlocksLocationId: 'highlands',
  }),
  cosmetic('frame-gold', 'Золотой обод', 'Настоящее золото, а не позолота. Разница видна.', 4, 12000, 'frame', { requiredRank: 'B' }),
  cosmetic('theme-royal', 'Королевский переплёт', 'Такие делают на заказ и ждут по полгода.', 4, 12000, 'theme', { requiredRank: 'B' }),
];

// ─────────────────────────────────────────── Ступень V — 25 000, ранг S

const TIER_V: CatalogItem[] = [
  cosmetic('frame-eternal', 'Вечный обод', 'Говорят, его ковали до основания города.', 5, 25000, 'frame', { requiredRank: 'S' }),
  cosmetic('theme-legend', 'Переплёт Легенды', 'В городе таких три. Два из них — в склепах.', 5, 25000, 'theme', { requiredRank: 'S' }),
];

export const COSMETICS: readonly CatalogItem[] = [
  ...TIER_I,
  ...TIER_II,
  ...TIER_III,
  ...TIER_IV,
  ...TIER_V,
];

/** Суммарная стоимость каталога — проверяется тестом экономики. */
export const COSMETICS_TOTAL_PRICE = COSMETICS.reduce((sum, c) => sum + c.price, 0);

// ─────────────────────────────────────────── Расходники как товары витрины

export const CONSUMABLE_ITEMS: readonly CatalogItem[] = (
  Object.keys(CONSUMABLES) as ConsumableId[]
).map((id) => {
  const cfg = CONSUMABLES[id];
  return {
    id: `consumable-${id}`,
    name: cfg.name,
    lore: cfg.lore,
    icon: cfg.icon,
    category: 'consumable' as const,
    price: cfg.price,
    tier: 0,
    cosmeticKind: null,
    consumableId: id,
    requiredRank: null,
    locationId: 'town',
    unlocksLocationId: null,
    seasonal: false,
  };
});

export const CATALOG: readonly CatalogItem[] = [...COSMETICS, ...CONSUMABLE_ITEMS];

export const CATALOG_BY_ID: ReadonlyMap<string, CatalogItem> = new Map(
  CATALOG.map((i) => [i.id, i]),
);

/** Косметика, выдаваемая только наградами сезонной шкалы. */
export const SEASONAL_COSMETICS: readonly CatalogItem[] = [
  cosmetic('season-frame-1', 'Сезонный обод I', 'Знак того, кто был здесь в тот сезон.', 3, 0, 'frame', { seasonal: true }),
  cosmetic('season-title-1', 'Титул: Летописец Сезона', 'Выдаётся только на исходе сезона. Больше нигде.', 3, 0, 'title', { seasonal: true }),
];

/** Награда за ступень сезонной шкалы. */
export interface SeasonTierReward {
  tier: number;
  gold: number;
  consumable: ConsumableId | null;
  cosmeticId: string | null;
}

/** 30 ступеней сезона. Суммарно около 6 000 золота за сезон. */
export const SEASON_REWARDS: readonly SeasonTierReward[] = Array.from(
  { length: 30 },
  (_, i): SeasonTierReward => {
    const tier = i + 1;
    const gold = tier % 5 === 0 ? 500 : 120;
    const consumable: ConsumableId | null =
      tier % 10 === 0 ? 'doubleXpScroll' : tier % 6 === 0 ? 'streakFreeze' : null;
    const cosmeticId = tier === 15 ? 'season-frame-1' : tier === 30 ? 'season-title-1' : null;
    return { tier, gold, consumable, cosmeticId };
  },
);
