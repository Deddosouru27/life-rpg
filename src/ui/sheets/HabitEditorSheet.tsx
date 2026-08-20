/** Создание и правка привычки: атрибут, иконка, тип, сложность, частота. */

import { useEffect, useMemo, useState } from 'react';
import {
  ATTRIBUTE_ICONS,
  ATTRIBUTE_LABELS,
  COUNTER_TARGET_MAX,
  COUNTER_TARGET_MIN,
  DIFFICULTY_LABELS,
  HP_LOSS_BY_NEGATIVE,
  XP_BY_DIFFICULTY,
} from '@/game/balance';
import { goldForXp } from '@/game/rewards';
import { ATTRIBUTE_IDS } from '@/game/types';
import type { AttributeId, Difficulty, Frequency, Habit, HabitKind } from '@/game/types';
import { HABIT_ICONS } from '@/data/habitPresets';
import { useGame } from '@/state/useGame';
import { Icon } from '../icons';
import type { IconName } from '../icons';
import { Button, Chip, ConfirmRow, Field, Sheet } from '../primitives';

const KIND_LABELS: Record<HabitKind, string> = {
  binary: 'Да / нет',
  counter: 'Счётчик',
  negative: 'Срыв',
};

const KIND_HINTS: Record<HabitKind, string> = {
  binary: 'Одна отметка за день закрывает привычку.',
  counter: 'Нужно набрать N отметок за день. Награда идёт за каждую.',
  negative: 'Отмечаешь, когда сорвался. Награды нет, есть урон по здоровью.',
};

const WEEKDAYS = [
  { value: 1, label: 'пн' },
  { value: 2, label: 'вт' },
  { value: 3, label: 'ср' },
  { value: 4, label: 'чт' },
  { value: 5, label: 'пт' },
  { value: 6, label: 'сб' },
  { value: 0, label: 'вс' },
];

type FreqKind = Frequency['kind'];

const DEFAULT_ICON = 'attrDiscipline';

export function HabitEditorSheet({
  target,
  onClose,
}: {
  target: Habit | 'new' | null;
  onClose: () => void;
}): JSX.Element {
  const { addHabit, updateHabit, removeHabit } = useGame();
  const editing = target !== null && target !== 'new' ? target : null;

  const [title, setTitle] = useState('');
  const [lore, setLore] = useState('');
  const [icon, setIcon] = useState<string>(DEFAULT_ICON);
  const [attribute, setAttribute] = useState<AttributeId>('discipline');
  const [kind, setKind] = useState<HabitKind>('binary');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [freqKind, setFreqKind] = useState<FreqKind>('daily');
  const [times, setTimes] = useState(3);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [targetCount, setTargetCount] = useState(8);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (target === null) return;
    setConfirmDelete(false);
    if (target === 'new') {
      setTitle('');
      setLore('');
      setIcon(DEFAULT_ICON);
      setAttribute('discipline');
      setKind('binary');
      setDifficulty('normal');
      setFreqKind('daily');
      setTimes(3);
      setDays([1, 3, 5]);
      setTargetCount(8);
      return;
    }
    setTitle(target.title);
    setLore(target.lore);
    setIcon(target.icon);
    setAttribute(target.attribute);
    setKind(target.kind);
    setDifficulty(target.difficulty);
    setFreqKind(target.frequency.kind);
    if (target.frequency.kind === 'timesPerWeek') setTimes(target.frequency.times);
    if (target.frequency.kind === 'specificDays') setDays(target.frequency.days);
    setTargetCount(target.target);
  }, [target]);

  const frequency = useMemo((): Frequency => {
    if (freqKind === 'timesPerWeek')
      return { kind: 'timesPerWeek', times: Math.max(1, Math.min(7, times)) };
    if (freqKind === 'specificDays') return { kind: 'specificDays', days: days.length ? days : [1] };
    return { kind: 'daily' };
  }, [freqKind, times, days]);

  const xp = XP_BY_DIFFICULTY[difficulty];
  const canSave = title.trim().length > 0;

  const submit = async (): Promise<void> => {
    if (!canSave) return;
    const draft = {
      title,
      lore,
      icon,
      attribute,
      kind,
      difficulty,
      frequency,
      // Клампится и здесь: путь редактирования не проходит через buildHabit,
      // и без этого target=999 возвращался бы через правку существующей привычки.
      target:
        kind === 'counter'
          ? Math.min(COUNTER_TARGET_MAX, Math.max(COUNTER_TARGET_MIN, Math.round(targetCount)))
          : 1,
    };
    if (editing) await updateHabit({ ...editing, ...draft });
    else await addHabit(draft);
    onClose();
  };

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={editing ? 'Правка привычки' : 'Новая привычка'}
    >
      <div className="space-y-6">
        <Field label="Название">
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: холодный душ"
            maxLength={60}
          />
        </Field>

        <Field label="Описание в стиле мира" hint="Необязательно">
          <textarea
            className="field resize-none"
            rows={2}
            value={lore}
            onChange={(e) => setLore(e.target.value)}
            placeholder="Каждое утро — маленький бой с собственным «не хочу»."
            maxLength={200}
          />
        </Field>

        <div>
          <p className="t-label mb-2">Атрибут</p>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTE_IDS.map((id) => (
              <Chip
                key={id}
                active={attribute === id}
                onClick={() => setAttribute(id)}
                icon={ATTRIBUTE_ICONS[id]}
              >
                {ATTRIBUTE_LABELS[id]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="t-label mb-2">Иконка</p>
          {/* 6 колонок, а не 7: на 390px семь колонок дают ячейку 42px — ниже тач-минимума. */}
          <div
            className="grid grid-cols-6 gap-2 overflow-y-auto rounded-sm p-2"
            style={{ maxHeight: 'var(--picker-max-h)', background: 'var(--bg-sunken)' }}
          >
            {HABIT_ICONS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setIcon(name)}
                className="pressable grid aspect-square place-items-center rounded-sm"
                style={{
                  minHeight: 'var(--tap-min)',
                  background: icon === name ? 'var(--accent)' : 'transparent',
                  color: icon === name ? 'var(--ink-950)' : 'var(--fg-muted)',
                }}
                aria-label={`Иконка ${name}`}
                aria-pressed={icon === name}
              >
                <Icon name={name as IconName} size="md" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="t-label mb-2">Тип</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABELS) as HabitKind[]).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {KIND_LABELS[k]}
              </Chip>
            ))}
          </div>
          <p className="t-caption mt-2">{KIND_HINTS[kind]}</p>
        </div>

        {kind === 'counter' ? (
          <Field label="Сколько раз за день">
            <input
              className="field t-num"
              type="number"
              inputMode="numeric"
              min={2}
              max={50}
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
            />
          </Field>
        ) : null}

        <div>
          <p className="t-label mb-2">Сложность</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                {DIFFICULTY_LABELS[d]}
              </Chip>
            ))}
          </div>
          <p className="t-caption mt-2" style={{ color: 'var(--accent-bright)' }}>
            {kind === 'negative'
              ? `Срыв стоит ${HP_LOSS_BY_NEGATIVE[difficulty]} здоровья`
              : `+${xp} XP и ${goldForXp(xp)} золота за отметку`}
          </p>
        </div>

        {kind !== 'negative' ? (
          <div>
            <p className="t-label mb-2">Частота</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={freqKind === 'daily'} onClick={() => setFreqKind('daily')}>
                Каждый день
              </Chip>
              <Chip active={freqKind === 'timesPerWeek'} onClick={() => setFreqKind('timesPerWeek')}>
                N раз в неделю
              </Chip>
              <Chip active={freqKind === 'specificDays'} onClick={() => setFreqKind('specificDays')}>
                По дням
              </Chip>
            </div>

            {freqKind === 'timesPerWeek' ? (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <Chip key={n} active={times === n} onClick={() => setTimes(n)}>
                      {n}
                    </Chip>
                  ))}
                </div>
                <p className="t-caption mt-2">
                  Не штрафует в начале недели. Становится обязательной, только когда дней осталось
                  ровно столько, сколько недобрано.
                </p>
              </div>
            ) : null}

            {freqKind === 'specificDays' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <Chip
                    key={d.value}
                    active={days.includes(d.value)}
                    onClick={() =>
                      setDays((prev) =>
                        prev.includes(d.value)
                          ? prev.filter((x) => x !== d.value)
                          : [...prev, d.value],
                      )
                    }
                  >
                    {d.label}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {editing ? 'Сохранить' : 'Добавить'}
          </Button>
          {editing ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
              Убрать
            </Button>
          ) : null}
        </div>

        {editing && confirmDelete ? (
          <ConfirmRow
            question={`Убрать «${editing.title}» из фолианта? История останется, но привычка исчезнет из списков.`}
            confirmLabel="Убрать"
            onConfirm={() => {
              void removeHabit(editing).then(onClose);
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : null}
      </div>
    </Sheet>
  );
}
