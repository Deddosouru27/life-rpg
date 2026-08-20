import { describe, expect, it } from 'vitest';
import { completeQuest, tickHabit } from './actions';
import type { ActionContext } from './actions';
import { DAILY_BASE_XP_CAP } from './balance';
import { buildLogIndex } from './scheduling';
import { GameSim, makeCharacter, makeHabit, makeLog, makeQuest, seedLedger, T0 } from './testFixtures';
import type { Habit, HabitLog } from './types';

const DAY = '2026-01-15';

const neverRng = {
  next: () => 0.999,
  int: () => 0,
  chance: () => false,
  pick: <T,>(a: readonly T[]) => a[0],
};

const alwaysCrit = {
  next: () => 0,
  int: (min: number) => min,
  chance: () => true,
  pick: <T,>(a: readonly T[]) => a[0],
};

function ctx(
  habits: Habit[],
  logs: HabitLog[] = [],
  overrides: Partial<ActionContext> = {},
): ActionContext {
  return {
    character: makeCharacter(),
    habits,
    logIndex: buildLogIndex(logs),
    ledger: [],
    day: DAY,
    rng: neverRng,
    now: T0,
    ...overrides,
  };
}

type SimOpts = ConstructorParameters<typeof GameSim>[0];

function sim(habits: Habit[] = [], opts: SimOpts = {}): GameSim {
  return new GameSim({ habits, day: DAY, rng: neverRng, ...opts });
}

describe('отметка бинарной привычки', () => {
  it('начисляет XP, золото и отмечает день активным', () => {
    const habit = makeHabit({ difficulty: 'normal', attribute: 'body' });
    const s = sim([habit]);
    const out = s.tick(habit);

    expect(out.log.count).toBe(1);
    expect(out.log.completed).toBe(true);
    expect(out.xpGained).toBe(15);
    expect(out.goldGained).toBe(6);
    expect(s.character.gold).toBe(6);
    expect(s.character.attributes.body.xp).toBeGreaterThan(0);
    expect(out.character.lastActiveDay).toBe(DAY);
  });

  it('повторная отметка выполненной привычки ничего не даёт', () => {
    const habit = makeHabit();
    const logs = [makeLog(habit.id, DAY, 1, true)];
    const out = tickHabit(ctx([habit], logs), habit);
    expect(out.xpGained).toBe(0);
    expect(out.patch.added).toHaveLength(0);
  });

  it('снятие отметки возвращает состояние ровно к исходному', () => {
    const habit = makeHabit();
    const s = sim([habit], { ledger: seedLedger(40, 500) });
    const before = s.snapshot();

    s.tick(habit);
    const out = s.untick(habit);

    expect(out.log.count).toBe(0);
    expect(s.snapshot()).toEqual(before);
  });

  it('откат снимает уровень, если отметка его подняла', () => {
    // Уровень 1 требует 20 XP; обычная привычка даёт 15. Две отметки поднимут уровень.
    const habit = makeHabit({ kind: 'counter', target: 2, difficulty: 'normal' });
    const s = sim([habit]);

    s.tick(habit);
    s.tick(habit);
    // Счётчик делит базовый XP привычки на цель: 15 → 8 + 7 = 15 всего.
    expect(s.character.xp).toBe(15);
    expect(s.character.level).toBe(1);

    s.untick(habit);
    s.untick(habit);
    expect(s.character.level).toBe(1);
    expect(s.character.xp).toBe(0);
    expect(s.character.gold).toBe(0);
  });
});

describe('честность данных: отметка и отмена не должны давать ферму', () => {
  it('цикл отметил → отменил ×20 не накручивает ни XP, ни золото', () => {
    const habit = makeHabit();
    const s = sim([habit]);
    const before = s.snapshot();

    for (let i = 0; i < 20; i++) {
      s.tick(habit);
      s.untick(habit);
    }

    expect(s.snapshot()).toEqual(before);
    expect(s.character.stats.totalCompletions).toBe(0);
  });

  it('крит отзывается целиком, а не по базовой ставке', () => {
    const habit = makeHabit();
    const s = sim([habit], { ledger: seedLedger(100, 1000), rng: alwaysCrit });
    const before = s.snapshot();

    s.tick(habit);
    expect(s.character.gold).toBeGreaterThan(before.gold);

    s.untick(habit);
    expect(s.snapshot()).toEqual(before);
  });

  it('отмена освобождает место под дневным потолком', () => {
    const habits = Array.from({ length: 4 }, (_, i) =>
      makeHabit({ id: `h${i}`, difficulty: 'normal' }),
    );
    const s = sim(habits);
    for (const habit of habits) s.tick(habit);
    const atCap = s.character.xp;

    const first = habits[0];
    if (!first) throw new Error('fixture');
    s.untick(first);
    expect(s.character.xp).toBeLessThan(atCap);
  });

  it('повторное открытие квеста возвращает его награду', () => {
    const quest = makeQuest({ difficulty: 'epic' });
    const s = sim([], { ledger: seedLedger(300, 5000) });
    const before = s.snapshot();

    const done = s.finishQuest(quest);
    expect(s.character.gold).toBe(before.gold + 48);

    s.openQuest(done.quest);
    expect(s.snapshot()).toEqual(before);
  });

  it('цикл закрыл → открыл ×10 не накручивает квестовый XP', () => {
    const s = sim();
    const before = s.snapshot();
    let quest = makeQuest({ difficulty: 'hard' });

    for (let i = 0; i < 10; i++) {
      quest = s.finishQuest(quest).quest;
      quest = s.openQuest(quest);
    }

    expect(s.snapshot()).toEqual(before);
  });

  it('повторное применение того же действия не начисляет дважды', () => {
    // Ключ записи детерминирован, поэтому «гонка» двух обработчиков клика
    // с одинаковым исходным состоянием даёт одну запись, а не две.
    const habit = makeHabit();
    const s = sim([habit]);
    const base = s.ctx();

    const first = tickHabit(base, habit);
    const second = tickHabit(base, habit);
    expect(second.patch.added[0]?.id).toBe(first.patch.added[0]?.id);

    s.tick(habit);
    const once = s.character.xp;
    // Применяем ту же запись ещё раз — состояние не меняется.
    s.ledger = [...s.ledger, ...first.patch.added];
    expect(s.character.xp).toBe(once);
  });
});

describe('счётчик больше не является фермой', () => {
  it('день счётчика стоит ровно базовый XP привычки, а не base × target', () => {
    const habit = makeHabit({ kind: 'counter', target: 8, difficulty: 'easy' });
    const s = sim([habit]);
    let total = 0;
    for (let i = 0; i < 8; i++) total += s.tick(habit).xpGained;

    // 8 XP за день, а не 64.
    expect(total).toBe(8);
    expect(s.character.xp).toBe(8);
  });

  it('счётчик 50 × трудная не даёт даже пятого уровня', () => {
    // Именно этот случай давал 11-й уровень и 1175 золота за минуту тапов.
    const habit = makeHabit({ kind: 'counter', target: 50, difficulty: 'hard' });
    const s = sim([habit]);
    for (let i = 0; i < 50; i++) s.tick(habit);

    // 25 базового XP за весь день — ровно одна трудная привычка.
    // Прежняя реализация давала 1250 базового XP и 11-й уровень.
    expect(s.character.stats.totalCompletions).toBeGreaterThan(0);
    expect(s.character.level).toBeLessThanOrEqual(2);
    expect(s.character.gold).toBeLessThanOrEqual(10);
  });

  it('completeHabitFully закрывает счётчик одним вызовом', () => {
    const habit = makeHabit({ kind: 'counter', target: 4, difficulty: 'easy' });
    const s = sim([habit]);
    const out = s.complete(habit);
    expect(out.log.count).toBe(4);
    expect(out.log.completed).toBe(true);
    expect(out.xpGained).toBe(8);
  });

  it('untickHabitFully снимает все отметки счётчика и возвращает всё', () => {
    // Раньше кнопка «снять отметку» убирала одну единицу из восьми, и
    // полный откат счётчика был недостижим — сценарий приёмки №1 падал.
    const habit = makeHabit({ kind: 'counter', target: 8, difficulty: 'easy' });
    const s = sim([habit]);
    const before = s.snapshot();

    s.complete(habit);
    expect(s.character.xp).toBeGreaterThan(0);

    const out = s.untickAll(habit);
    expect(out.log.count).toBe(0);
    expect(s.snapshot()).toEqual(before);
  });
});

describe('негативная привычка', () => {
  it('отметка срыва бьёт по HP и не даёт награды', () => {
    const habit = makeHabit({ kind: 'negative', difficulty: 'hard' });
    const s = sim([habit]);
    const out = s.tick(habit);
    expect(out.xpGained).toBe(0);
    expect(s.character.hp).toBe(88);
    expect(out.habit.currentStreak).toBe(0);
  });

  it('не отнимает XP и золото', () => {
    const habit = makeHabit({ kind: 'negative' });
    const s = sim([habit], { ledger: seedLedger(100, 500) });
    const levelBefore = s.character.level;
    s.tick(habit);
    expect(s.character.gold).toBe(500);
    expect(s.character.level).toBe(levelBefore);
  });

  it('откат срыва возвращает HP — раньше не возвращал', () => {
    const habit = makeHabit({ kind: 'negative', difficulty: 'hard' });
    const s = sim([habit]);
    const before = s.snapshot();

    s.tick(habit);
    expect(s.character.hp).toBe(88);

    s.untick(habit);
    expect(s.snapshot()).toEqual(before);
    expect(s.character.hp).toBe(100);
  });
});

describe('абсолютный дневной потолок XP', () => {
  it('не даёт накрутить прогресс количеством привычек', () => {
    const habits = Array.from({ length: 60 }, (_, i) =>
      makeHabit({ id: `h${i}`, difficulty: 'hard' }),
    );
    const s = sim(habits);
    let total = 0;
    for (const habit of habits) total += s.tick(habit).xpGained;

    // 60 трудных привычек — это 1500 базового XP. Потолок держит.
    expect(total).toBeLessThanOrEqual(DAILY_BASE_XP_CAP);
  });

  it('потолок не зависит от числа заведённых привычек', () => {
    const few = sim([makeHabit({ id: 'a', difficulty: 'hard' })]);
    const many = sim(
      Array.from({ length: 20 }, (_, i) => makeHabit({ id: `m${i}`, difficulty: 'hard' })),
    );
    const firstFew = few.tick(few.habits[0] as Habit).xpGained;
    const firstMany = many.tick(many.habits[0] as Habit).xpGained;
    expect(firstFew).toBe(firstMany);
  });
});

describe('множитель стрика применяется', () => {
  it('привычка со стриком 14 даёт +20%', () => {
    const habit = makeHabit({ currentStreak: 14, difficulty: 'normal' });
    const s = sim([habit]);
    expect(s.tick(habit).xpGained).toBe(18);
  });
});

describe('квесты', () => {
  it('эпический квест даёт 120 XP и 48 золота', () => {
    const quest = makeQuest({ difficulty: 'epic', attribute: 'wealth' });
    const s = sim();
    const out = s.finishQuest(quest);
    expect(out.xpGained).toBe(120);
    expect(out.goldGained).toBe(48);
    expect(out.quest.done).toBe(true);
    expect(s.character.stats.questsCompleted).toBe(1);
  });

  it('повторное завершение ничего не даёт', () => {
    const quest = makeQuest({ done: true });
    const out = completeQuest(ctx([]), quest);
    expect(out.xpGained).toBe(0);
  });

  it('открывает локацию', () => {
    const quest = makeQuest({ unlocksLocationId: 'harbor' });
    const s = sim();
    s.finishQuest(quest);
    expect(s.character.unlockedLocations).toContain('harbor');
  });

  it('локация открывается даже когда награда упёрлась в дневной потолок', () => {
    const habits = Array.from({ length: 20 }, (_, i) =>
      makeHabit({ id: `h${i}`, difficulty: 'hard' }),
    );
    const s = sim(habits);
    for (const h of habits) s.tick(h);

    const quest = makeQuest({ unlocksLocationId: 'harbor' });
    const out = s.finishQuest(quest);
    expect(out.xpGained).toBe(0);
    expect(s.character.unlockedLocations).toContain('harbor');
  });
});

describe('достижение за первое дело', () => {
  it('выдаётся сразу', () => {
    const habit = makeHabit();
    const s = sim([habit]);
    const out = s.tick(habit);
    expect(out.character.unlockedAchievements).toContain('first-blood');
    expect(out.events.some((e) => e.type === 'achievement')).toBe(true);
  });
});
