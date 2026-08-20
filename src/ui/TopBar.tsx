/**
 * Верхняя панель. Ровно две сущности: золото и здоровье (когда оно не полное).
 *
 * Первая версия втискивала сюда имя, титул, ранг, уровень, XP-полосу с числами,
 * HP-полосу с числами, золото и стрик — восемь сущностей в 56 пикселях.
 * Всё остальное переехало на экран героя: он в одном тапе (урок Elden Ring).
 */

import { hpStage } from '@/game';
import { HP_STAGE_LABELS, MAX_HP } from '@/game/balance';
import { useGame } from '@/state/useGame';
import { Icon } from './icons';
import { GoldAmount, IconButton } from './primitives';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const { character } = useGame();
  const stage = hpStage(character.hp);
  const wounded = stage !== 'healthy';

  return (
    <header className="app-header grain">
      <div
        className="mx-auto flex items-center gap-4 px-4"
        style={{ maxWidth: 'var(--content-max)', height: 'var(--header-height)' }}
      >
        {/*
          Обе величины подписаны словами.
          Раньше золото было безымянной монеткой, а здоровье — числом «100 / 100»
          без подписи: человек, открывший приложение впервые, не мог понять,
          что это. Иконка без подписи — не иконка, а ребус.
        */}
        <span className="inline-flex items-baseline gap-2">
          <GoldAmount amount={character.gold} />
          <span className="t-label">золота</span>
        </span>

        {wounded ? (
          <span
            className="inline-flex items-baseline gap-2 t-num"
            style={{ color: 'var(--danger-text)' }}
          >
            <Icon name="heart" size="sm" />
            {character.hp}
            <span className="t-label" style={{ color: 'var(--danger-text)' }}>
              {HP_STAGE_LABELS[stage]}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-baseline gap-2 t-num">
            {character.hp}
            <span className="t-label">сил из {MAX_HP}</span>
          </span>
        )}

        <div className="flex-1" />

        <IconButton icon="settings" label="Открыть свиток настроек" onClick={onOpenSettings} />
      </div>
    </header>
  );
}
