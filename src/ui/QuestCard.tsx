/** Карточка квеста: сложность, дедлайн, подзадачи, кнопка закрытия. */

import { daysBetween, formatDayHuman, plural } from '@/game';
import { QUEST_DIFFICULTY_LABELS, XP_BY_QUEST_DIFFICULTY } from '@/game/balance';
import { goldForXp } from '@/game/rewards';
import type { Quest } from '@/game/types';
import { useGame } from '@/state/useGame';
import { Icon } from './icons';
import { AttributeTag, cx } from './primitives';

/**
 * Сложность различается весом подписи, а не цветом: пять цветов сложности
 * плюс пять атрибутов превратили бы список в радугу.
 * Золото достаётся только эпическому — единственному, что стоит выделить.
 */
const DIFFICULTY_STYLE: Record<Quest['difficulty'], { color: string; weight: number }> = {
  trivial: { color: 'var(--fg-muted)', weight: 400 },
  normal: { color: 'var(--fg-muted)', weight: 400 },
  hard: { color: 'var(--fg-secondary)', weight: 600 },
  epic: { color: 'var(--accent-bright)', weight: 600 },
};

export function QuestCard({ quest, onEdit }: { quest: Quest; onEdit: () => void }): JSX.Element {
  const { today, completeQuest, reopenQuest, toggleQuestStep } = useGame();

  const xp = XP_BY_QUEST_DIFFICULTY[quest.difficulty];
  const gold = goldForXp(xp);
  const overdueDays = quest.dueDay ? daysBetween(quest.dueDay, today) : null;
  const overdue = overdueDays !== null && overdueDays > 0 && !quest.done;
  const dueToday = overdueDays === 0 && !quest.done;
  const doneSteps = quest.steps.filter((s) => s.done).length;
  const difficulty = DIFFICULTY_STYLE[quest.difficulty];

  return (
    <div className={cx('surface overflow-hidden', quest.done && 'opacity-55')}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onEdit}
          className="pressable min-w-0 flex-1 p-3 text-left"
          aria-label={`Изменить квест «${quest.title}»`}
        >
          <span className={cx('t-title block truncate', quest.done && 'line-through')}>
            {quest.title}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <AttributeTag attribute={quest.attribute} />
            <span
              className="t-label"
              style={{ color: difficulty.color, fontWeight: difficulty.weight }}
            >
              {QUEST_DIFFICULTY_LABELS[quest.difficulty]}
            </span>
            <span className="t-caption">
              +{xp} XP · {gold} зол.
            </span>
            {quest.steps.length > 0 ? (
              <span className="t-caption">
                {doneSteps} / {quest.steps.length}
              </span>
            ) : null}
          </span>

          {quest.dueDay ? (
            <span
              className="t-caption mt-2 block"
              style={{
                color: overdue
                  ? 'var(--danger-text)'
                  : dueToday
                    ? 'var(--accent-bright)'
                    : 'var(--fg-muted)',
              }}
            >
              {overdue
                ? `Просрочен на ${overdueDays} ${plural(overdueDays, 'день', 'дня', 'дней')}`
                : dueToday
                  ? 'Срок истекает сегодня'
                  : `Срок: ${formatDayHuman(quest.dueDay)}`}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => void (quest.done ? reopenQuest(quest) : completeQuest(quest))}
          className="pressable grid w-16 shrink-0 place-items-center"
          style={{
            borderLeft: '1px solid var(--border-subtle)',
            background: quest.done ? 'var(--accent)' : 'transparent',
            color: quest.done ? 'var(--ink-950)' : 'var(--fg-muted)',
          }}
          aria-label={quest.done ? 'Открыть квест заново' : 'Завершить квест'}
        >
          <Icon name="check" size="lg" />
        </button>
      </div>

      {quest.steps.length > 0 && !quest.done ? (
        <ul className="px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {quest.steps.map((step) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => void toggleQuestStep(quest, step.id)}
                className="pressable flex w-full items-center gap-3 py-2 text-left"
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-sm border"
                  style={{
                    borderColor: step.done ? 'var(--accent-deep)' : 'var(--border-strong)',
                    background: step.done ? 'var(--accent)' : 'transparent',
                    color: step.done ? 'var(--ink-950)' : 'transparent',
                  }}
                >
                  <Icon name="check" size="sm" />
                </span>
                <span
                  className={cx('t-sm min-w-0 flex-1 truncate', step.done && 'line-through')}
                  style={{ color: step.done ? 'var(--fg-muted)' : 'var(--fg-secondary)' }}
                >
                  {step.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
