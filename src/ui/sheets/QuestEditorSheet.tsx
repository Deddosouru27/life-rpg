/** Создание и правка квеста: сложность, дедлайн, подзадачи. */

import { useEffect, useState } from 'react';
import {
  ATTRIBUTE_ICONS,
  ATTRIBUTE_LABELS,
  HP_LOSS_QUEST_OVERDUE,
  QUEST_DIFFICULTY_LABELS,
  XP_BY_QUEST_DIFFICULTY,
} from '@/game/balance';
import { goldForXp } from '@/game/rewards';
import { ATTRIBUTE_IDS } from '@/game/types';
import type { AttributeId, Quest, QuestDifficulty, QuestStep } from '@/game/types';
import { newId } from '@/db/database';
import { useGame } from '@/state/useGame';
import { Button, Chip, ConfirmRow, Field, IconButton, Sheet } from '../primitives';

export function QuestEditorSheet({
  target,
  onClose,
}: {
  target: Quest | 'new' | null;
  onClose: () => void;
}): JSX.Element {
  const { addQuest, updateQuest, removeQuest } = useGame();
  const editing = target !== null && target !== 'new' ? target : null;

  const [title, setTitle] = useState('');
  const [lore, setLore] = useState('');
  const [attribute, setAttribute] = useState<AttributeId>('discipline');
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('normal');
  const [dueDay, setDueDay] = useState('');
  const [steps, setSteps] = useState<QuestStep[]>([]);
  const [stepDraft, setStepDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (target === null) return;
    setConfirmDelete(false);
    setStepDraft('');
    if (target === 'new') {
      setTitle('');
      setLore('');
      setAttribute('discipline');
      setDifficulty('normal');
      setDueDay('');
      setSteps([]);
      return;
    }
    setTitle(target.title);
    setLore(target.lore);
    setAttribute(target.attribute);
    setDifficulty(target.difficulty);
    setDueDay(target.dueDay ?? '');
    setSteps(target.steps);
  }, [target]);

  const xp = XP_BY_QUEST_DIFFICULTY[difficulty];
  const canSave = title.trim().length > 0;

  const addStep = (): void => {
    const value = stepDraft.trim();
    if (!value) return;
    setSteps((prev) => [...prev, { id: newId(), title: value, done: false }]);
    setStepDraft('');
  };

  const submit = async (): Promise<void> => {
    if (!canSave) return;
    if (editing) {
      await updateQuest({
        ...editing,
        title: title.trim(),
        lore: lore.trim(),
        attribute,
        difficulty,
        dueDay: dueDay || null,
        steps,
        // Сменили дедлайн — даём шанс закрыть без повторного штрафа.
        overduePenaltyApplied:
          dueDay !== (editing.dueDay ?? '') ? false : editing.overduePenaltyApplied,
      });
    } else {
      await addQuest({
        title,
        lore,
        attribute,
        difficulty,
        dueDay: dueDay || null,
        steps: steps.map((s) => s.title),
      });
    }
    onClose();
  };

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={editing ? 'Правка квеста' : 'Новый квест'}
    >
      <div className="space-y-6">
        <Field label="Название">
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: разобрать кладовую"
            maxLength={80}
          />
        </Field>

        <Field label="Заметка" hint="Необязательно">
          <textarea
            className="field resize-none"
            rows={2}
            value={lore}
            onChange={(e) => setLore(e.target.value)}
            maxLength={300}
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
          <p className="t-label mb-2">Сложность</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(QUEST_DIFFICULTY_LABELS) as QuestDifficulty[]).map((d) => (
              <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                {QUEST_DIFFICULTY_LABELS[d]}
              </Chip>
            ))}
          </div>
          <p className="t-caption mt-2" style={{ color: 'var(--accent-bright)' }}>
            +{xp} XP и {goldForXp(xp)} золота
          </p>
        </div>

        <Field
          label="Дедлайн"
          hint={`Необязательно. Просроченный квест стоит ${HP_LOSS_QUEST_OVERDUE} здоровья один раз и остаётся доступным — он не пропадает.`}
        >
          <input
            className="field"
            type="date"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </Field>

        <div>
          <p className="t-label mb-2">Подзадачи</p>
          {steps.length > 0 ? (
            <ul className="mb-3 space-y-2">
              {steps.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-sm py-1 pl-3"
                  style={{ background: 'var(--bg-sunken)' }}
                >
                  <span className="t-sm min-w-0 flex-1 truncate">{s.title}</span>
                  <IconButton
                    icon="close"
                    label={`Убрать подзадачу «${s.title}»`}
                    onClick={() => setSteps((prev) => prev.filter((x) => x.id !== s.id))}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addStep();
                }
              }}
              placeholder="Шаг квеста"
              maxLength={80}
              aria-label="Новая подзадача"
            />
            <Button variant="secondary" icon="plus" onClick={addStep}>
              Шаг
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {editing ? 'Сохранить' : 'Записать квест'}
          </Button>
          {editing ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
              Убрать
            </Button>
          ) : null}
        </div>

        {editing && confirmDelete ? (
          <ConfirmRow
            question={`Вычеркнуть квест «${editing.title}»?`}
            confirmLabel="Вычеркнуть"
            onConfirm={() => {
              void removeQuest(editing).then(onClose);
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : null}
      </div>
    </Sheet>
  );
}
