import { describe, expect, it } from 'vitest';
import {
  COMEBACK_HP,
  HP_LOSS_DAILY_CAP,
  HP_REGEN_PERFECT_DAY,
  MAX_HP,
} from './balance';
import { runDailyCron } from './dayEngine';
import type { CronInput } from './dayEngine';
import { applyLedgerPatch } from './ledger';
import { cumulativeXpForLevel } from './progression';
// Собственный хелпер здесь был бы ловушкой: toISOString переводит локальную
// полночь в UTC и сдвигает дату на сутки в положительных часовых поясах.
import { addDays as addDay } from './time';
import { makeCharacter, makeHabit, makeLog, makeQuest, seedLedger, T0 } from './testFixtures';
import type { Character, GameEvent, Habit, HabitLog, LedgerEntry } from './types';

const YESTERDAY = '2026-01-14';
const TODAY = '2026-01-15';

function run(overrides: Partial<CronInput>): ReturnType<typeof runDailyCron> {
  return runDailyCron({
    character: makeCharacter(),
    habits: [],
    logs: [],
    quests: [],
    ledger: [],
    today: TODAY,
    autoUseFreeze: false,
    now: T0,
    ...overrides,
  });
}

function has(events: GameEvent[], type: GameEvent['type']): boolean {
  return events.some((e) => e.type === type);
}

describe('первый запуск', () => {
  it('ничего не начисляет и не штрафует', () => {
    const out = run({ habits: [makeHabit()] });
    expect(out.character.hp).toBe(MAX_HP);
    expect(out.character.globalStreak).toBe(0);
    expect(out.dayRecords).toHaveLength(0);
    expect(out.character.lastProcessedDay).toBe(YESTERDAY);
  });
});

describe('идемпотентность', () => {
  it('повторный запуск в тот же день ничего не меняет', () => {
    const character = makeCharacter({ lastProcessedDay: YESTERDAY });
    const ledger = seedLedger(0, 0, { hp: 80 });
    const first = run({ character, habits: [makeHabit()], ledger });
    const second = run({
      character: first.character,
      habits: [makeHabit()],
      ledger: applyLedgerPatch(ledger, first.ledgerAdded, []),
    });
    expect(second.character.hp).toBe(first.character.hp);
    expect(second.character.globalStreak).toBe(first.character.globalStreak);
    expect(second.dayRecords).toHaveLength(0);
  });
});

describe('обработка завершённого дня', () => {
  const habits: Habit[] = [
    makeHabit({ id: 'a' }),
    makeHabit({ id: 'b' }),
    makeHabit({ id: 'c' }),
  ];
  const base: Character = makeCharacter({ lastProcessedDay: '2026-01-13', lastActiveDay: YESTERDAY });

  it('идеальный день продлевает стрик и восстанавливает HP', () => {
    const logs: HabitLog[] = habits.map((h) => makeLog(h.id, YESTERDAY, 1, true));
    const out = run({ character: base, habits, logs, ledger: seedLedger(0, 0, { hp: 60 }) });

    expect(out.character.globalStreak).toBe(1);
    expect(out.character.hp).toBe(60 + HP_REGEN_PERFECT_DAY);
    expect(out.dayRecords[0]?.perfect).toBe(true);
    expect(out.character.stats.perfectDays).toBe(1);
  });

  it('день с 2 из 3 (67%) засчитывается в стрик — порог 60%', () => {
    const logs = [makeLog('a', YESTERDAY, 1, true), makeLog('b', YESTERDAY, 1, true)];
    const out = run({ character: base, habits, logs });
    expect(out.character.globalStreak).toBe(1);
    expect(out.dayRecords[0]?.counted).toBe(true);
  });

  it('день с 1 из 3 (33%) рвёт стрик', () => {
    const logs = [makeLog('a', YESTERDAY, 1, true)];
    const out = run({ character: { ...base, globalStreak: 12 }, habits, logs });
    expect(out.character.globalStreak).toBe(0);
    expect(out.dayRecords[0]?.counted).toBe(false);
  });

  it('пропуск бьёт по HP на 4 за привычку', () => {
    const logs = [makeLog('a', YESTERDAY, 1, true), makeLog('b', YESTERDAY, 1, true)];
    const out = run({ character: base, habits, logs });
    // 1 пропуск (−4), выполнение 67% ≥ 50% → регенерация +8. Чистая дельта +4,
    // но HP уже полное, поэтому фактическое изменение — ноль.
    expect(out.character.hp).toBe(MAX_HP);
    expect(out.dayRecords[0]?.hpDelta).toBe(0);
  });

  it('чистая дельта суток применяется один раз, а не двумя зажимами', () => {
    // При HP = 2 раздельные записи «−4, потом +8» упали бы в ноль и выдали
    // ложное истощение. Чистая дельта +4 даёт 6.
    const logs = [makeLog('a', YESTERDAY, 1, true), makeLog('b', YESTERDAY, 1, true)];
    const out = run({ character: base, habits, logs, ledger: seedLedger(0, 0, { hp: 2 }) });
    expect(out.character.hp).toBe(6);
    expect(out.events.some((e) => e.type === 'exhausted')).toBe(false);
  });

  it('стрик привычки растёт при выполнении и рвётся при пропуске', () => {
    const withStreak = habits.map((h) => makeHabit({ id: h.id, currentStreak: 5, bestStreak: 5 }));
    const logs = [makeLog('a', YESTERDAY, 1, true)];
    const out = run({ character: base, habits: withStreak, logs });

    const a = out.habits.find((h) => h.id === 'a');
    const b = out.habits.find((h) => h.id === 'b');
    expect(a?.currentStreak).toBe(6);
    expect(a?.bestStreak).toBe(6);
    expect(b?.currentStreak).toBe(0);
  });
});

describe('потолок урона за сутки — главная защита от спирали вины', () => {
  it('полностью проваленный день стоит не больше 20 HP', () => {
    const habits = Array.from({ length: 20 }, (_, i) => makeHabit({ id: `h${i}` }));
    const out = run({
      character: makeCharacter({ lastProcessedDay: '2026-01-13', lastActiveDay: YESTERDAY }),
      habits,
    });
    expect(MAX_HP - out.character.hp).toBe(HP_LOSS_DAILY_CAP);
  });

  it('XP, уровень и золото не отнимаются никогда', () => {
    const habits = Array.from({ length: 20 }, (_, i) => makeHabit({ id: `h${i}` }));
    const character = makeCharacter({
      lastProcessedDay: '2026-01-13',
      lastActiveDay: YESTERDAY,
    });
    // 13 444 XP — это ровно 30-й уровень по кривой.
    const ledger = seedLedger(13_444 + 500, 4000);
    const out = run({ character, habits, ledger });
    expect(out.character.level).toBe(30);
    expect(out.character.xp).toBe(500);
    expect(out.character.gold).toBe(4000);
  });

  it('доводит до истощения не быстрее чем за 5 полностью проваленных дней', () => {
    const habits = Array.from({ length: 20 }, (_, i) => makeHabit({ id: `h${i}` }));
    let character = makeCharacter({ lastActiveDay: '2026-01-01' });
    let ledger: LedgerEntry[] = [];
    let day = '2026-01-02';

    // Каждый день: cron обрабатывает РОВНО один прошедший день (вчера),
    // поэтому lastProcessedDay должен отставать на два дня. Игрок при этом
    // считается активным вчера, иначе включится правило возвращения.
    for (let i = 0; i < 5; i++) {
      character = {
        ...character,
        lastProcessedDay: addDay(day, -2),
        lastActiveDay: addDay(day, -1),
      };
      const out = runDailyCron({
        character,
        habits,
        logs: [],
        quests: [],
        ledger,
        today: day,
        autoUseFreeze: false,
        now: T0,
      });
      character = out.character;
      ledger = applyLedgerPatch(ledger, out.ledgerAdded, []);
      day = addDay(day, 1);
    }

    expect(character.hp).toBe(0);
  });
});


describe('правило возвращения', () => {
  it('после долгого отсутствия не начисляет ретроактивный урон', () => {
    const character = makeCharacter({
      lastProcessedDay: '2026-01-01',
      lastActiveDay: '2026-01-01',
      globalStreak: 90,
    });
    const out = run({
      character,
      habits: [makeHabit()],
      ledger: seedLedger(0, 0, { hp: 30 }),
      today: '2026-01-20',
    });

    expect(out.character.hp).toBe(COMEBACK_HP);
    expect(has(out.events, 'comeback')).toBe(true);
    expect(out.dayRecords).toHaveLength(0);
  });

  it('банкует половину глобального стрика — месяц не обнуляется', () => {
    const character = makeCharacter({
      lastProcessedDay: '2026-01-01',
      lastActiveDay: '2026-01-01',
      globalStreak: 90,
    });
    const out = run({ character, habits: [makeHabit()], today: '2026-01-20' });
    expect(out.character.globalStreak).toBe(45);
  });

  it('банкует половину стриков отдельных привычек', () => {
    const habit = makeHabit({ currentStreak: 31, bestStreak: 31 });
    const character = makeCharacter({ lastProcessedDay: '2026-01-01', lastActiveDay: '2026-01-01' });
    const out = run({ character, habits: [habit], today: '2026-01-20' });
    expect(out.habits[0]?.currentStreak).toBe(15);
    expect(out.habits[0]?.bestStreak).toBe(31);
  });

  it('не понижает HP, если он был выше порога возвращения', () => {
    const character = makeCharacter({
      lastProcessedDay: '2026-01-01',
      lastActiveDay: '2026-01-01',
    });
    const out = run({
      character,
      habits: [makeHabit()],
      ledger: seedLedger(0, 0, { hp: 95 }),
      today: '2026-01-20',
    });
    expect(out.character.hp).toBe(95);
  });
});

describe('заморозка стрика', () => {
  it('бесплатная автозаморозка спасает стрик и тратится', () => {
    const character = makeCharacter({
      lastProcessedDay: '2026-01-13',
      lastActiveDay: YESTERDAY,
      globalStreak: 40,
      freeFreezesPerMonth: 2,
      freeFreezesLeft: 2,
    });
    const habit = makeHabit({ currentStreak: 40 });
    const out = run({ character, habits: [habit], autoUseFreeze: true });

    expect(out.character.globalStreak).toBe(40);
    expect(out.character.freeFreezesLeft).toBe(1);
    expect(has(out.events, 'freezeUsed')).toBe(true);
  });

  it('без заморозок стрик рвётся', () => {
    const character = makeCharacter({
      lastProcessedDay: '2026-01-13',
      lastActiveDay: YESTERDAY,
      globalStreak: 40,
    });
    const out = run({ character, habits: [makeHabit({ currentStreak: 40 })], autoUseFreeze: true });
    expect(out.character.globalStreak).toBe(0);
  });
});

describe('вехи стрика', () => {
  it('на 7 днях выдаёт 200 золота', () => {
    const character = makeCharacter({
      lastProcessedDay: '2026-01-13',
      lastActiveDay: YESTERDAY,
      globalStreak: 6,
    });
    const habit = makeHabit();
    const out = run({ character, habits: [habit], logs: [makeLog(habit.id, YESTERDAY, 1, true)] });

    expect(out.character.globalStreak).toBe(7);
    // 200 за веху + 30 за идеальный день (бонус, которого раньше не начислялось).
    expect(out.character.gold).toBe(230);
    expect(has(out.events, 'streakMilestone')).toBe(true);
  });

  it('на 30 днях выдаёт постоянную бесплатную автозаморозку', () => {
    const character = makeCharacter({
      lastProcessedDay: '2026-01-13',
      lastActiveDay: YESTERDAY,
      globalStreak: 29,
    });
    const habit = makeHabit();
    const out = run({ character, habits: [habit], logs: [makeLog(habit.id, YESTERDAY, 1, true)] });

    expect(out.character.freeFreezesPerMonth).toBe(1);
    expect(out.character.freeFreezesLeft).toBe(1);
  });
});

describe('просроченные квесты', () => {
  it('штрафуют по HP ровно один раз', () => {
    const quest = makeQuest({ dueDay: '2026-01-10' });
    const character = makeCharacter({ lastProcessedDay: YESTERDAY });

    const first = run({ character, quests: [quest] });
    expect(first.character.hp).toBe(MAX_HP - 6);
    expect(first.quests[0]?.overduePenaltyApplied).toBe(true);

    const second = run({
      character: first.character,
      quests: first.quests,
      ledger: applyLedgerPatch([], first.ledgerAdded, []),
    });
    expect(second.character.hp).toBe(first.character.hp);
  });

  it('не штрафуют квест без дедлайна', () => {
    const out = run({ character: makeCharacter({ lastProcessedDay: YESTERDAY }), quests: [makeQuest()] });
    expect(out.character.hp).toBe(MAX_HP);
  });
});

describe('достижения', () => {
  it('выдаются, когда условие выполнено', () => {
    const character = makeCharacter({ lastProcessedDay: YESTERDAY, bestGlobalStreak: 400 });
    const out = run({ character });
    expect(out.character.unlockedAchievements).toContain('keeper-of-year');
    expect(out.character.unlockedAchievements).toContain('week-one');
  });

  it('не выдаются повторно', () => {
    const character = makeCharacter({ lastProcessedDay: YESTERDAY, bestGlobalStreak: 400 });
    const first = run({ character });
    const second = run({ character: first.character });
    expect(second.events.filter((e) => e.type === 'achievement')).toHaveLength(0);
  });
});

describe('сезоны', () => {
  it('не открываются до 50-го уровня', () => {
    // 39 121 XP — 49-й уровень; сезон открывается только с 50-го.
    const out = run({
      character: makeCharacter({ lastProcessedDay: YESTERDAY }),
      ledger: seedLedger(cumulativeXpForLevel(49), 0),
    });
    expect(out.character.level).toBe(49);
    expect(out.character.season).toBeNull();
  });

  it('открываются на 50-м уровне', () => {
    const out = run({
      character: makeCharacter({ lastProcessedDay: YESTERDAY }),
      ledger: seedLedger(cumulativeXpForLevel(50), 0),
    });
    expect(out.character.level).toBe(50);
    expect(out.character.season?.index).toBe(1);
    expect(out.character.season?.startDay).toBe(TODAY);
  });

  it('закрываются через 90 дней и открывают следующий', () => {
    const character = makeCharacter({
      lastProcessedDay: YESTERDAY,
      season: { index: 1, startDay: '2025-10-01', xp: 100, tier: 12, claimedTiers: [] },
    });
    const out = run({ character, ledger: seedLedger(cumulativeXpForLevel(60), 0) });
    expect(out.character.seasonHistory).toHaveLength(1);
    expect(out.character.season?.index).toBe(2);
    expect(has(out.events, 'seasonEnded')).toBe(true);
  });
});
