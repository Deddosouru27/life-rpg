/**
 * Главный экран.
 *
 * Иерархия (DESIGN_SYSTEM.md §5):
 *   герой  — кольцо прогресса дня
 *   второй — список дел на сегодня
 *   третий — стрик, подсказки, квесты
 */

import { useMemo, useState } from 'react';
import {
  buildLogIndex,
  effectiveTarget,
  getLog,
  isDayCompleted,
  plural,
  streakMultiplier,
} from '@/game';
import { GLOBAL_STREAK_THRESHOLD, XP_BY_DIFFICULTY, XP_BY_QUEST_DIFFICULTY } from '@/game/balance';
import type { Habit, Quest } from '@/game/types';
import { useGame, useTodaySchedule } from '@/state/useGame';
import { Icon } from '../icons';
import {
  Button,
  Card,
  cx,
  EmptyState,
  OrnateRule,
  ProgressRing,
  SectionLabel,
} from '../primitives';
import { HabitEditorSheet } from '../sheets/HabitEditorSheet';
import { QuestEditorSheet } from '../sheets/QuestEditorSheet';
import { QuestCard } from '../QuestCard';

const THRESHOLD_PCT = Math.round(GLOBAL_STREAK_THRESHOLD * 100);

/**
 * `onOpenHabits` приходит сверху: пустое состояние обязано вести к следующему
 * шагу, а переключение вкладки живёт в оболочке приложения. Экран,
 * рассказывающий о фолианте и не умеющий его открыть, — тупик.
 */
export function TodayScreen({ onOpenHabits }: { onOpenHabits: () => void }): JSX.Element {
  const { character, habits, logs, quests, today, tickHabit, untickHabit, untickHabitAll, completeHabit } =
    useGame();
  const schedule = useTodaySchedule();
  const [habitEditor, setHabitEditor] = useState<Habit | 'new' | null>(null);
  const [questEditor, setQuestEditor] = useState<Quest | 'new' | null>(null);

  const index = useMemo(() => buildLogIndex(logs), [logs]);
  const openQuests = useMemo(() => quests.filter((q) => !q.done).slice(0, 20), [quests]);

  const pct = Math.round(schedule.completionRate * 100);
  const counted = pct >= THRESHOLD_PCT;

  return (
    <div style={{ paddingInline: 'var(--pad-screen)', paddingTop: 'var(--space-6)' }}>
      {/* ── Герой экрана ── */}
      <section className="flex flex-col items-center pb-2 pt-2">
        {/*
          Дата здесь была второй на экране: она же стоит в заголовке недели
          ниже. Дублирующая дата не сообщает ничего нового и отбирает место
          у единственного главного элемента — кольца дня.
        */}
        <div className="mt-2">
          <ProgressRing value={schedule.completionRate} ticks={schedule.dueCount}>
            <p
              className="t-num leading-none"
              style={{
                fontSize: 'var(--text-hero)',
                lineHeight: 'var(--text-hero-lh)',
                color: 'var(--fg-primary)',
              }}
            >
              {schedule.dueCount === 0 ? '—' : `${pct}%`}
            </p>
            <p className="t-caption mt-2">
              {schedule.dueCount === 0
                ? 'день свободен'
                : `${schedule.doneCount} из ${schedule.dueCount}`}
            </p>
          </ProgressRing>
        </div>

        <p
          className="t-sm mt-5 text-center"
          style={{ color: counted ? 'var(--success)' : 'var(--fg-muted)' }}
        >
          {/*
            Слово «цепь» — внутренний жаргон: игрок читал его и не понимал,
            что это стрик. Формулировка теперь объясняет само правило.
          */}
          {schedule.dueCount === 0
            ? 'На сегодня ничего не назначено'
            : counted
              ? 'День зачтён — серия дней продолжается'
              : `День зачтётся, когда выполнишь ${THRESHOLD_PCT}% дел`}
        </p>

        {character.globalStreak > 0 ? (
          <p className="t-caption mt-2 inline-flex items-center gap-2">
            <Icon name="navToday" size="sm" />
            {character.globalStreak}{' '}
            {plural(character.globalStreak, 'день', 'дня', 'дней')} подряд
          </p>
        ) : null}
      </section>

      {/* ── Второй уровень ── */}
      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel
          action={
            <button
              type="button"
              className="link-action pressable t-label"
              style={{ color: 'var(--accent-bright)' }}
              onClick={() => setHabitEditor('new')}
            >
              <Icon name="plus" size="sm" />
              привычка
            </button>
          }
        >
          На сегодня
        </SectionLabel>

        {schedule.scheduled.length === 0 ? (
          <Card>
            <EmptyState
              icon="scroll"
              title="На сегодня ничего не назначено"
              hint="Пустой день не провал — его нельзя завалить. Но и роста не будет: опыт даёт только отметка о сделанном. Загляни в фолиант и включи хотя бы одну привычку."
              action={
                <Button variant="primary" icon="navHabits" onClick={onOpenHabits}>
                  Открыть фолиант
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="space-y-2">
            {schedule.scheduled.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                count={getLog(index, habit.id, today)?.count ?? 0}
                done={isDayCompleted(habit, getLog(index, habit.id, today))}
                required={schedule.required.some((h) => h.id === habit.id)}
                onTick={() => void tickHabit(habit)}
                onUntick={() => void untickHabit(habit)}
                onUntickAll={() => void untickHabitAll(habit)}
                onComplete={() => void completeHabit(habit)}
                onEdit={() => setHabitEditor(habit)}
              />
            ))}
          </ul>
        )}
      </section>

      <OrnateRule />

      {/* ── Третий уровень ── */}
      <section>
        <SectionLabel
          action={
            <button
              type="button"
              className="link-action pressable t-label"
              style={{ color: 'var(--accent-bright)' }}
              onClick={() => setQuestEditor('new')}
            >
              <Icon name="plus" size="sm" />
              квест
            </button>
          }
        >
          Открытые квесты
        </SectionLabel>

        {openQuests.length === 0 ? (
          <Card>
            <EmptyState
              icon="navQuests"
              title="Ни одного квеста"
              hint="Квест — разовое дело, а не привычка. Награда больше, но и берётся один раз."
              action={
                <Button icon="plus" onClick={() => setQuestEditor('new')}>
                  Записать квест
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="space-y-2">
            {openQuests.map((quest) => (
              <li key={quest.id}>
                <QuestCard quest={quest} onEdit={() => setQuestEditor(quest)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {habits.length > 0 ? (
        <p className="t-caption mt-10 px-2 text-center">
          Пропуск стоит здоровья, но никогда — опыта, уровня или золота.
          Один плохой день не обесценивает месяц.
        </p>
      ) : null}

      <HabitEditorSheet target={habitEditor} onClose={() => setHabitEditor(null)} />
      <QuestEditorSheet target={questEditor} onClose={() => setQuestEditor(null)} />
    </div>
  );
}

function HabitRow({
  habit,
  count,
  done,
  required,
  onTick,
  onUntick,
  onUntickAll,
  onComplete,
  onEdit,
}: {
  habit: Habit;
  count: number;
  done: boolean;
  required: boolean;
  onTick: () => void;
  onUntick: () => void;
  onUntickAll: () => void;
  onComplete: () => void;
  onEdit: () => void;
}): JSX.Element {
  const target = effectiveTarget(habit);
  const isCounter = habit.kind === 'counter';
  const isNegative = habit.kind === 'negative';
  const mult = streakMultiplier(habit.currentStreak);
  const baseXp = XP_BY_DIFFICULTY[habit.difficulty];

  /*
    Состояние читается МАТЕРИАЛОМ, а не только цветом.
    Невыполненное — приподнятая панель с фаской; выполненное — вдавленная
    в лист, с золотой засечкой слева. Шесть одинаковых прямоугольников
    различались раньше только зачёркиванием, и список читался как таблица.
  */
  return (
    <li
      className={cx(
        'flex items-stretch overflow-hidden',
        done && !isNegative ? 'surface-done' : 'surface',
      )}
      style={
        done && !isNegative
          ? { boxShadow: 'var(--shadow-inset), inset 3px 0 0 var(--accent-deep)' }
          : undefined
      }
    >
      <button
        type="button"
        onClick={onEdit}
        className="pressable flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-2 text-left"
        aria-label={`Изменить привычку «${habit.title}»`}
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-sm"
          style={{
            background: 'var(--bg-sunken)',
            color: done && !isNegative ? 'var(--accent)' : 'var(--fg-muted)',
          }}
        >
          <Icon name={habit.icon} size="md" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cx('t-title truncate', done && !isNegative && 'line-through')}>
              {habit.title}
            </span>
            {!required && !isNegative ? (
              <span className="t-label shrink-0">гибкая</span>
            ) : null}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {isNegative ? (
              <span className="t-caption" style={{ color: 'var(--danger-text)' }}>
                срывов сегодня: {count}
              </span>
            ) : (
              <>
                <span className="t-caption">+{Math.round(baseXp * mult)} XP</span>
                {isCounter ? (
                  <span className="t-caption">
                    {count} / {target}
                  </span>
                ) : null}
                {habit.currentStreak > 0 ? (
                  <span className="t-caption inline-flex items-center gap-1">
                    <Icon name="navToday" size="sm" />
                    {habit.currentStreak}
                    {mult > 1 ? ` ×${mult.toFixed(1)}` : ''}
                  </span>
                ) : null}
              </>
            )}
          </span>
        </span>
      </button>

      {isNegative ? (
        <button
          type="button"
          onClick={onTick}
          className="pressable w-20 shrink-0 t-label"
          style={{
            borderLeft: '1px solid var(--border-subtle)',
            color: 'var(--danger-text)',
          }}
        >
          отметить
          <br />
          срыв
        </button>
      ) : (
        <div className="flex shrink-0 items-stretch">
          {isCounter && count > 0 ? (
            <button
              type="button"
              onClick={onUntick}
              className="pressable"
              style={{
                // 44px — минимальная зона нажатия. Раньше стояло `w-11`,
                // но после замены шкалы Tailwind этот класс перестал
                // компилироваться, и кнопка схлопывалась до 21px.
                width: 'var(--tap-min)',
                borderLeft: '1px solid var(--border-subtle)',
                color: 'var(--fg-muted)',
              }}
              aria-label="Убавить на один"
            >
              <Icon name="minus" size="md" />
            </button>
          ) : null}
          {/*
            Выполненное состояние — золотая ГАЛОЧКА, а не золотая заливка.
            Заливка на каждой закрытой строке съедала до трети экрана золотом
            и ломала бюджет акцента: он должен отмечать действие, а не покой.

            Для счётчика закрытая строка снимается ЦЕЛИКОМ (`onUntickAll`).
            Раньше та же кнопка убирала одну единицу из восьми: строка
            переставала быть зачёркнутой, галочка исчезала, а семь отметок и
            начисленный за них опыт оставались. Полный откат счётчика был
            физически недостижим — сценарий приёмки №1 из CLAUDE.md на этом
            и падал.
          */}
          <button
            type="button"
            onClick={done ? onUntickAll : onTick}
            onDoubleClick={isCounter && !done ? onComplete : undefined}
            className="pressable grid w-16 place-items-center"
            style={{
              borderLeft: '1px solid var(--border-subtle)',
              color: done ? 'var(--accent)' : 'var(--fg-muted)',
            }}
            aria-label={
              done
                ? isCounter
                  ? 'Снять отметку и сбросить счётчик'
                  : 'Снять отметку'
                : 'Отметить выполнение'
            }
          >
            <Icon name={done ? 'check' : isCounter ? 'plus' : 'check'} size="lg" strokeWidth={done ? 2.5 : 1.5} />
          </button>
        </div>
      )}
    </li>
  );
}

/** Награда за квест — для подписи в карточке. */
export function questRewardLabel(quest: Quest): string {
  const xp = XP_BY_QUEST_DIFFICULTY[quest.difficulty];
  const steps = quest.steps.filter((s) => s.done).length;
  const total = quest.steps.length;
  const stepPart = total > 0 ? ` · ${steps}/${total} ${plural(total, 'шаг', 'шага', 'шагов')}` : '';
  return `+${xp} XP${stepPart}`;
}
