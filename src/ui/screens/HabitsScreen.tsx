/**
 * Фолиант привычек: свои и каталог пресетов.
 * Ничего не залочено — включай и выключай в один тап.
 */

import { useMemo, useState } from 'react';
import { addDays, buildLogIndex, daysInRange, getLog, isDayCompleted, isRequired } from '@/game';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS, DIFFICULTY_LABELS } from '@/game/balance';
import { ATTRIBUTE_IDS } from '@/game/types';
import type { AttributeId, Habit } from '@/game/types';
import { HABIT_PRESETS_BY_ATTRIBUTE } from '@/data/habitPresets';
import type { HabitPreset } from '@/data/habitPresets';
import { useGame } from '@/state/useGame';
import { Icon } from '../icons';
import { Button, Card, Chip, cx, EmptyState, ScreenTitle, SectionLabel } from '../primitives';
import { HabitEditorSheet } from '../sheets/HabitEditorSheet';

type Tab = 'mine' | 'catalog';

export function HabitsScreen(): JSX.Element {
  const { habits, logs, today, addHabit, toggleHabitActive } = useGame();
  const [tab, setTab] = useState<Tab>(habits.length === 0 ? 'catalog' : 'mine');
  const [filter, setFilter] = useState<AttributeId | 'all'>('all');
  const [editor, setEditor] = useState<Habit | 'new' | null>(null);

  const index = useMemo(() => buildLogIndex(logs), [logs]);
  const takenPresets = useMemo(
    () => new Set(habits.map((h) => h.presetId).filter((id): id is string => id !== null)),
    [habits],
  );

  const visibleHabits = useMemo(
    () => (filter === 'all' ? habits : habits.filter((h) => h.attribute === filter)),
    [habits, filter],
  );

  const presets = useMemo(() => {
    const attrs = filter === 'all' ? ATTRIBUTE_IDS : [filter];
    return attrs.flatMap((a) => HABIT_PRESETS_BY_ATTRIBUTE[a]);
  }, [filter]);

  const last30 = useMemo(() => daysInRange(addDays(today, -29), today), [today]);

  return (
    <div style={{ paddingInline: 'var(--pad-screen)', paddingTop: 'var(--space-6)' }}>
      <ScreenTitle
        subtitle="Всё, что повторяется"
        action={
          <Button variant="primary" icon="plus" onClick={() => setEditor('new')}>
            Своя
          </Button>
        }
      >
        Фолиант
      </ScreenTitle>

      <div className="mt-6 flex gap-2">
        <Chip active={tab === 'mine'} onClick={() => setTab('mine')}>
          Мои · {habits.length}
        </Chip>
        <Chip active={tab === 'catalog'} onClick={() => setTab('catalog')}>
          Каталог
        </Chip>
      </div>

      {/* Фильтр по атрибутам. Различаются иконкой, не цветом. */}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          Все
        </Chip>
        {ATTRIBUTE_IDS.map((id) => (
          <div key={id} className="shrink-0">
            <Chip active={filter === id} onClick={() => setFilter(id)} icon={ATTRIBUTE_ICONS[id]}>
              {ATTRIBUTE_LABELS[id]}
            </Chip>
          </div>
        ))}
      </div>

      <section style={{ marginTop: 'var(--gap-section)' }}>
        {tab === 'mine' ? (
          visibleHabits.length === 0 ? (
            <Card>
              <EmptyState
                icon="navHabits"
                title="Фолиант чист"
                hint="Ни одной привычки — значит, и отмечать сегодня нечего. В каталоге 73 готовых по пяти атрибутам: возьми три-четыре, которые точно закроешь."
                action={
                  <Button variant="primary" onClick={() => setTab('catalog')}>
                    Открыть каталог
                  </Button>
                }
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {visibleHabits.map((habit) => (
                <li key={habit.id}>
                  <MyHabitRow
                    habit={habit}
                    days={last30}
                    cellState={(day) => {
                      const log = getLog(index, habit.id, day);
                      if (isDayCompleted(habit, log) && (log || habit.kind === 'negative')) return 'done';
                      if (isRequired(habit, day, index) && day < today) return 'missed';
                      return 'off';
                    }}
                    onToggle={() => void toggleHabitActive(habit)}
                    onEdit={() => setEditor(habit)}
                  />
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <SectionLabel>Готовые привычки · {presets.length}</SectionLabel>
            <ul className="space-y-2">
              {presets.map((preset) => (
                <li key={preset.id}>
                  <PresetRow
                    preset={preset}
                    taken={takenPresets.has(preset.id)}
                    onAdd={() =>
                      void addHabit({
                        title: preset.title,
                        lore: preset.lore,
                        icon: preset.icon,
                        attribute: preset.attribute,
                        kind: preset.kind,
                        difficulty: preset.difficulty,
                        frequency: preset.frequency,
                        target: preset.target,
                        presetId: preset.id,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <HabitEditorSheet target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}

function MyHabitRow({
  habit,
  days,
  cellState,
  onToggle,
  onEdit,
}: {
  habit: Habit;
  days: string[];
  cellState: (day: string) => 'done' | 'missed' | 'off';
  onToggle: () => void;
  onEdit: () => void;
}): JSX.Element {
  return (
    <div className={cx('surface p-3', !habit.active && 'opacity-45')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Изменить привычку «${habit.title}»`}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm"
            style={{ background: 'var(--bg-sunken)', color: 'var(--fg-muted)' }}
          >
            <Icon name={habit.icon} size="md" />
          </span>
          <span className="min-w-0">
            <span className="t-title block truncate">{habit.title}</span>
            <span className="t-caption mt-1 block truncate">
              {ATTRIBUTE_LABELS[habit.attribute]} · {DIFFICULTY_LABELS[habit.difficulty]}
              {habit.currentStreak > 0 ? ` · ${habit.currentStreak} подряд` : ''}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onToggle}
          className="tap pressable shrink-0 rounded-sm border px-3 t-label"
          style={{
            borderColor: habit.active ? 'var(--border-accent)' : 'var(--border-subtle)',
            color: habit.active ? 'var(--accent-bright)' : 'var(--fg-muted)',
          }}
          aria-label={habit.active ? 'Выключить привычку' : 'Включить привычку'}
        >
          {habit.active ? 'вкл' : 'выкл'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(30,minmax(0,1fr))]"
        style={{ gap: 'var(--grid-gutter)' }}>
        {days.map((day) => (
          <span key={day} className="day-dot" data-state={cellState(day)} title={day} />
        ))}
      </div>
      <p className="t-caption mt-2 text-right">
        30 дней · рекорд {habit.bestStreak}
      </p>
    </div>
  );
}

function PresetRow({
  preset,
  taken,
  onAdd,
}: {
  preset: HabitPreset;
  taken: boolean;
  onAdd: () => void;
}): JSX.Element {
  return (
    <div className="surface flex items-stretch overflow-hidden">
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm"
            style={{ background: 'var(--bg-sunken)', color: 'var(--fg-muted)' }}
          >
            <Icon name={preset.icon} size="md" />
          </span>
          <div className="min-w-0">
            <p className="t-title truncate">{preset.title}</p>
            <p className="t-caption">
              {ATTRIBUTE_LABELS[preset.attribute]} · {DIFFICULTY_LABELS[preset.difficulty]}
            </p>
          </div>
        </div>
        <p className="t-sm mt-2 italic" style={{ color: 'var(--fg-muted)' }}>
          {preset.lore}
        </p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={taken}
        className="pressable grid shrink-0 place-items-center"
        style={{
          width: 'var(--slot-lg)',
          borderLeft: '1px solid var(--border-subtle)',
          color: taken ? 'var(--fg-muted)' : 'var(--accent-bright)',
        }}
        aria-label={taken ? `«${preset.title}» уже в фолианте` : `Добавить «${preset.title}»`}
      >
        <Icon name={taken ? 'check' : 'plus'} size="lg" />
      </button>
    </div>
  );
}
