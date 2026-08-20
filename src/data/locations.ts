/**
 * Локации. Стартовая доступна всегда, остальные открываются цепочками квестов
 * или покупкой в лавке. При низком HP путешествия закрыты — см. GAME_DESIGN.md §4.
 */

import type { GameLocation } from '@/game/types';

export const LOCATIONS: readonly GameLocation[] = [
  {
    id: 'town',
    name: 'Городская площадь',
    lore: 'Пыльная брусчатка, крики зазывал и запах свежего хлеба. Отсюда начинается всё.',
    icon: 'town',
    isStarting: true,
    minHpStage: 'exhausted',
  },
  {
    id: 'harbor',
    name: 'Соляная гавань',
    lore: 'Корабли приходят с юга с грузом, которого не найти на площади. И с ценами под стать.',
    icon: 'harbor',
    isStarting: false,
    minHpStage: 'worn',
  },
  {
    id: 'highlands',
    name: 'Заоблачный перевал',
    lore: 'Здесь торгуют те, кто поднялся выше остальных. Воздух разрежен, товар редок.',
    icon: 'highlands',
    isStarting: false,
    minHpStage: 'worn',
  },
  {
    id: 'archive',
    name: 'Забытый архив',
    lore: 'Подземелье под старой библиотекой. Хранитель принимает только тех, кто дошёл сам.',
    icon: 'lock',
    isStarting: false,
    minHpStage: 'healthy',
  },
] as const;

export const LOCATIONS_BY_ID: ReadonlyMap<string, GameLocation> = new Map(
  LOCATIONS.map((l) => [l.id, l]),
);

export const STARTING_LOCATION_ID = 'town';
