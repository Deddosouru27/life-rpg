/**
 * Легендарные достижения — дальний горизонт эндгейма.
 * Не влияют на экономику и баланс: только титулы, рамки и запись в Летописи.
 * См. docs/GAME_DESIGN.md §5.5.
 */

import { ATTRIBUTE_IDS } from './types';
import type { Achievement, Character, EngineResult, GameEvent } from './types';

function attrCount(c: Character, min: number): number {
  return ATTRIBUTE_IDS.filter((id) => c.attributes[id].level >= min).length;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'keeper-of-year',
    name: 'Хранитель Года',
    lore: 'Триста шестьдесят пять рассветов подряд ты вставал и делал своё дело.',
    icon: 'calendar',
    requirement: 'Глобальный стрик 365 дней',
    check: (c) => c.bestGlobalStreak >= 365,
  },
  {
    id: 'pillar',
    name: 'Столп',
    lore: 'Два года без разрыва. Такие не гнутся.',
    icon: 'bank',
    requirement: 'Глобальный стрик 730 дней',
    check: (c) => c.bestGlobalStreak >= 730,
  },
  {
    id: 'thousand-steps',
    name: 'Тысяча Шагов',
    lore: 'Каждый шаг был мал. Их стало тысяча.',
    icon: 'steps',
    requirement: '1 000 выполненных дел',
    check: (c) => c.stats.totalCompletions >= 1000,
  },
  {
    id: 'ten-thousand',
    name: 'Десять Тысяч',
    lore: 'Мастерство — это то, что осталось, когда счёт перестал иметь значение.',
    icon: 'growth',
    requirement: '10 000 выполненных дел',
    check: (c) => c.stats.totalCompletions >= 10000,
  },
  {
    id: 'perfect-month',
    name: 'Совершенный Месяц',
    lore: 'Тридцать дней без единой прорехи в полотне.',
    icon: 'gem',
    requirement: '30 идеальных дней подряд',
    check: (c) => c.stats.bestPerfectDayStreak >= 30,
  },
  {
    id: 'master-discipline',
    name: 'Мастер Дисциплины',
    lore: 'Воля отточена до предела.',
    icon: 'attrDiscipline',
    requirement: 'ДИСЦИПЛИНА до 100',
    check: (c) => c.attributes.discipline.level >= 100,
  },
  {
    id: 'master-body',
    name: 'Мастер Тела',
    lore: 'Плоть стала бронёй.',
    icon: 'attrBody',
    requirement: 'ТЕЛО до 100',
    check: (c) => c.attributes.body.level >= 100,
  },
  {
    id: 'master-spirit',
    name: 'Мастер Духа',
    lore: 'Свеча внутри горит ровно и не гаснет на ветру.',
    icon: 'attrSpirit',
    requirement: 'ДУХ до 100',
    check: (c) => c.attributes.spirit.level >= 100,
  },
  {
    id: 'master-wealth',
    name: 'Мастер Богатства',
    lore: 'Ты научился делать так, чтобы труд возвращался золотом.',
    icon: 'attrWealth',
    requirement: 'БОГАТСТВО до 100',
    check: (c) => c.attributes.wealth.level >= 100,
  },
  {
    id: 'master-mind',
    name: 'Мастер Разума',
    lore: 'Книги кончились раньше, чем твоё любопытство.',
    icon: 'book',
    requirement: 'РАЗУМ до 100',
    check: (c) => c.attributes.mind.level >= 100,
  },
  {
    id: 'balance',
    name: 'Равновесие',
    lore: 'Ни одна из пяти сторон не оказалась забыта.',
    icon: 'scale',
    requirement: 'Все пять атрибутов ≥ 50',
    check: (c) => attrCount(c, 50) === 5,
  },
  {
    id: 'perfect-balance',
    name: 'Полное Равновесие',
    lore: 'Пять вершин. Все взяты.',
    icon: 'sparkles',
    requirement: 'Все пять атрибутов ≥ 100',
    check: (c) => attrCount(c, 100) === 5,
  },
  {
    id: 'fortune',
    name: 'Фортуна',
    lore: 'Удача любит тех, кто не перестаёт бросать кости.',
    icon: 'chess',
    requirement: '500 критических наград',
    check: (c) => c.stats.totalCrits >= 500,
  },
  {
    id: 'hoarder',
    name: 'Скупец',
    lore: 'Сундук полон. Ключ у тебя.',
    icon: 'gold',
    requirement: 'Заработано 50 000 золота',
    check: (c) => c.stats.totalGoldEarned >= 50000,
  },
  {
    id: 'patron',
    name: 'Меценат',
    lore: 'Золото ничего не стоит, пока лежит.',
    icon: 'parcel',
    requirement: 'Потрачено 200 000 золота',
    check: (c) => c.stats.totalGoldSpent >= 200000,
  },
  {
    id: 'chronicler',
    name: 'Летописец',
    lore: 'Восемь сезонов вписаны твоей рукой.',
    icon: 'scroll',
    requirement: 'Завершено 8 сезонов',
    check: (c) => c.seasonHistory.length >= 8,
  },
  {
    id: 'reborn-1',
    name: 'Возрождённый',
    lore: 'Ты дошёл до вершины и начал заново — по своей воле.',
    icon: 'navToday',
    requirement: '1 Печать Перерождения',
    check: (c) => c.prestigeSeals >= 1,
  },
  {
    id: 'reborn-3',
    name: 'Трижды Возрождённый',
    lore: 'Три круга. Три вершины. Одна воля.',
    icon: 'sparkles',
    requirement: '3 Печати Перерождения',
    check: (c) => c.prestigeSeals >= 3,
  },
  {
    id: 'reborn-5',
    name: 'Вечный',
    lore: 'Ты перестал измерять путь. Ты стал им.',
    icon: 'sparkles',
    requirement: '5 Печатей Перерождения',
    check: (c) => c.prestigeSeals >= 5,
  },
  {
    id: 'first-blood',
    name: 'Первый Шаг',
    lore: 'Дорога в тысячу лиг начинается с одного дела.',
    icon: 'nature',
    requirement: 'Первое выполненное дело',
    check: (c) => c.stats.totalCompletions >= 1,
  },
  {
    id: 'week-one',
    name: 'Неделя Пути',
    lore: 'Семь дней. Самая трудная неделя позади.',
    icon: 'clock',
    requirement: 'Глобальный стрик 7 дней',
    check: (c) => c.bestGlobalStreak >= 7,
  },
  {
    id: 'rank-s',
    name: 'Владыка',
    lore: 'Торговцы кланяются, когда ты входишь в лавку.',
    icon: 'attrWealth',
    requirement: 'Достичь 70-го уровня (ранг S)',
    check: (c) => c.level >= 70,
  },
  {
    id: 'quest-100',
    name: 'Исполнитель',
    lore: 'Сто закрытых свитков в твоей сумке.',
    icon: 'plan',
    requirement: '100 завершённых квестов',
    check: (c) => c.stats.questsCompleted >= 100,
  },
  {
    id: 'collector',
    name: 'Собиратель',
    lore: 'Половина всего, что продают в этих землях, уже твоя.',
    icon: 'sparkles',
    requirement: '12 предметов косметики',
    check: (c) => c.ownedCosmetics.length >= 12,
  },
] as const;

export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Проверяет все достижения и выдаёт новые. Идемпотентна. */
export function checkAchievements(character: Character): EngineResult<Character> {
  const events: GameEvent[] = [];
  const unlocked = [...character.unlockedAchievements];

  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.includes(achievement.id)) continue;
    if (!achievement.check(character)) continue;
    unlocked.push(achievement.id);
    events.push({ type: 'achievement', achievementId: achievement.id });
  }

  if (events.length === 0) return { state: character, events };
  return { state: { ...character, unlockedAchievements: unlocked }, events };
}
