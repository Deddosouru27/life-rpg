/**
 * События для UI выводятся из СРАВНЕНИЯ состояний до и после пересчёта.
 *
 * Так сделано потому, что состояние теперь получается свёрткой журнала, а не
 * последовательностью мутаций: внутри свёртки просто нет момента, в который
 * можно было бы «заодно» породить событие. Разница состояний — единственный
 * источник, который не может разойтись с числами на экране.
 */

import { hpStage, rankForLevel } from './progression';
import { ATTRIBUTE_IDS } from './types';
import type { Character, GameEvent } from './types';

/** События смены ступени здоровья. */
export function hpEvents(before: Character, after: Character): GameEvent[] {
  if (after.hp === before.hp) return [];
  const fromStage = hpStage(before.hp);
  const toStage = hpStage(after.hp);
  const events: GameEvent[] = [
    {
      type: 'hpChanged',
      from: before.hp,
      to: after.hp,
      stage: toStage,
      stageChanged: toStage !== fromStage,
    },
  ];
  if (fromStage !== 'exhausted' && toStage === 'exhausted') events.push({ type: 'exhausted' });
  if (fromStage === 'exhausted' && toStage !== 'exhausted') events.push({ type: 'recovered' });
  return events;
}

/** Повышения глобального уровня и уровней атрибутов. */
export function levelEvents(before: Character, after: Character): GameEvent[] {
  const events: GameEvent[] = [];
  if (after.level > before.level) {
    const prevRank = rankForLevel(before.level);
    const newRank = rankForLevel(after.level);
    events.push({
      type: 'levelUp',
      level: after.level,
      rank: newRank,
      rankChanged: newRank !== prevRank,
    });
  }
  for (const id of ATTRIBUTE_IDS) {
    if (after.attributes[id].level > before.attributes[id].level) {
      events.push({ type: 'attributeLevelUp', attribute: id, level: after.attributes[id].level });
    }
  }
  return events;
}

/** Новые ступени сезонной шкалы. */
export function seasonEvents(before: Character, after: Character): GameEvent[] {
  const from = before.season?.tier ?? 0;
  const to = after.season?.tier ?? 0;
  const events: GameEvent[] = [];
  for (let t = from + 1; t <= to; t++) events.push({ type: 'seasonTier', tier: t });
  return events;
}

/** Полный набор событий из разницы состояний. */
export function diffEvents(before: Character, after: Character): GameEvent[] {
  return [...levelEvents(before, after), ...hpEvents(before, after), ...seasonEvents(before, after)];
}
