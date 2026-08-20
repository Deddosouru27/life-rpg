/** Все квесты: открытые, просроченные, закрытые. */

import { useMemo, useState } from 'react';
import { daysBetween } from '@/game';
import type { Quest } from '@/game/types';
import { useGame } from '@/state/useGame';
import { Button, Card, Chip, EmptyState, ScreenTitle, SectionLabel } from '../primitives';
import { QuestCard } from '../QuestCard';
import { QuestEditorSheet } from '../sheets/QuestEditorSheet';

type Tab = 'open' | 'done';

export function QuestsScreen(): JSX.Element {
  const { quests, today } = useGame();
  const [tab, setTab] = useState<Tab>('open');
  const [editor, setEditor] = useState<Quest | 'new' | null>(null);

  const { overdue, open, done } = useMemo(() => {
    const overdueList: Quest[] = [];
    const openList: Quest[] = [];
    const doneList: Quest[] = [];
    for (const quest of quests) {
      if (quest.done) {
        doneList.push(quest);
        continue;
      }
      if (quest.dueDay && daysBetween(quest.dueDay, today) > 0) overdueList.push(quest);
      else openList.push(quest);
    }
    return { overdue: overdueList, open: openList, done: doneList };
  }, [quests, today]);

  return (
    <div style={{ paddingInline: 'var(--pad-screen)', paddingTop: 'var(--space-6)' }}>
      <ScreenTitle
        subtitle="Разовые дела и награда за них"
        action={
          <Button variant="primary" icon="plus" onClick={() => setEditor('new')}>
            Квест
          </Button>
        }
      >
        Квесты
      </ScreenTitle>

      <div className="mt-6 flex gap-2">
        <Chip active={tab === 'open'} onClick={() => setTab('open')}>
          Открытые · {open.length + overdue.length}
        </Chip>
        <Chip active={tab === 'done'} onClick={() => setTab('done')}>
          Завершённые · {done.length}
        </Chip>
      </div>

      {tab === 'open' ? (
        <>
          {overdue.length > 0 ? (
            <section style={{ marginTop: 'var(--gap-section)' }}>
              <SectionLabel>Просроченные</SectionLabel>
              <ul className="space-y-2">
                {overdue.map((q) => (
                  <li key={q.id}>
                    <QuestCard quest={q} onEdit={() => setEditor(q)} />
                  </li>
                ))}
              </ul>
              <p className="t-caption mt-3">
                Просрочка стоила здоровья один раз. Квест никуда не делся — закрой его, когда сможешь.
              </p>
            </section>
          ) : null}

          <section style={{ marginTop: 'var(--gap-section)' }}>
            <SectionLabel>В работе</SectionLabel>
            {open.length === 0 ? (
              <Card>
                <EmptyState
                  icon="navQuests"
                  title="Доска объявлений пуста"
                  hint="Квест — разовое дело, которое давно висит: разобрать шкаф, дойти до врача, дописать письмо. Запиши одно — то, о котором вспоминаешь чаще всего."
                  action={
                    <Button variant="primary" icon="plus" onClick={() => setEditor('new')}>
                      Записать первый квест
                    </Button>
                  }
                />
              </Card>
            ) : (
              <ul className="space-y-2">
                {open.map((q) => (
                  <li key={q.id}>
                    <QuestCard quest={q} onEdit={() => setEditor(q)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section style={{ marginTop: 'var(--gap-section)' }}>
          <SectionLabel>Завершённые</SectionLabel>
          {done.length === 0 ? (
            <Card>
              <EmptyState
                icon="scroll"
                title="Здесь будет летопись"
                hint="Закрытые квесты остаются тут навсегда. Через полгода этот список — лучшее доказательство, что год не прошёл впустую."
              />
            </Card>
          ) : (
            <ul className="space-y-2">
              {done.map((q) => (
                <li key={q.id}>
                  <QuestCard quest={q} onEdit={() => setEditor(q)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <QuestEditorSheet target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
