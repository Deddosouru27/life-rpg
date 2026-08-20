/**
 * Тактильная отдача: всплывающие цифры награды, полноэкранный level up,
 * тосты вех и достижений. Всё питается событиями движка.
 */

import { useEffect, useMemo, useState } from 'react';
import { ACHIEVEMENTS_BY_ID, plural } from '@/game';
import { ATTRIBUTE_LABELS, HP_STAGE_LABELS, RANK_TITLES } from '@/game/balance';
import type { GameEvent } from '@/game/types';
import { useGame } from '@/state/useGame';
import { Icon } from './icons';
import type { IconName } from './icons';
import { RankSigil } from './primitives';

interface FloatItem {
  key: number;
  text: string;
  color: string;
  size: string;
  top: number;
}

interface ToastItem {
  key: number;
  icon: IconName;
  title: string;
  body: string;
}

let counter = 0;

export function Overlays(): JSX.Element {
  const { events, consumeEvents } = useGame();
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [levelUp, setLevelUp] = useState<Extract<GameEvent, { type: 'levelUp' }> | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (events.length === 0) return;

    const nextFloats: FloatItem[] = [];
    const nextToasts: ToastItem[] = [];
    let nextLevelUp: typeof levelUp = null;

    for (const event of events) {
      switch (event.type) {
        case 'reward': {
          const { xp, gold, crit, rareFind } = event.reward;
          if (xp > 0) {
            nextFloats.push({
              key: counter++,
              text: crit ? `КРИТ · +${xp} XP` : `+${xp} XP`,
              color: crit ? 'var(--accent-bright)' : 'var(--fg-primary)',
              size: crit ? '30px' : '22px',
              top: 42,
            });
          }
          if (gold > 0) {
            nextFloats.push({
              key: counter++,
              text: `+${gold} золота`,
              color: 'var(--accent)',
              size: '17px',
              top: 50,
            });
          }
          if (rareFind) {
            nextToasts.push({
              key: counter++,
              icon: 'parcel',
              title: 'Редкая находка',
              body:
                rareFind.kind === 'gold'
                  ? `Ты нашёл кошель: ${rareFind.amount} золота.`
                  : 'В придорожном сундуке лежал расходник.',
            });
          }
          break;
        }
        case 'levelUp':
          nextLevelUp = event;
          break;
        case 'attributeLevelUp':
          nextFloats.push({
            key: counter++,
            text: `${ATTRIBUTE_LABELS[event.attribute]} · ${event.level}`,
            color: 'var(--fg-secondary)',
            size: '15px',
            top: 58,
          });
          break;
        case 'achievement': {
          const a = ACHIEVEMENTS_BY_ID.get(event.achievementId);
          if (a) {
            nextToasts.push({
              key: counter++,
              icon: a.icon as IconName,
              title: a.name,
              body: a.lore,
            });
          }
          break;
        }
        case 'streakMilestone':
          nextToasts.push({
            key: counter++,
            icon: 'navToday',
            title: `${event.days} ${plural(event.days, 'день', 'дня', 'дней')} подряд`,
            body: [
              event.title ? `Титул: ${event.title}.` : '',
              event.goldReward > 0 ? `Награда: ${event.goldReward} золота.` : '',
              'Цепь не разорвана.',
            ]
              .filter(Boolean)
              .join(' '),
          });
          break;
        case 'seasonTier':
          nextToasts.push({
            key: counter++,
            icon: 'award',
            title: `Ступень сезона ${event.tier}`,
            body: 'Награда добавлена в сундук.',
          });
          break;
        case 'seasonEnded':
          nextToasts.push({
            key: counter++,
            icon: 'scroll',
            title: `Сезон ${event.record.index} завершён`,
            body: `Достигнута ступень ${event.record.tierReached}. Летопись пополнена.`,
          });
          break;
        case 'comeback':
          nextToasts.push({
            key: counter++,
            icon: 'nature',
            title: 'Возвращение',
            body: `Тебя не было ${event.daysAway} ${plural(event.daysAway, 'день', 'дня', 'дней')}. Штрафов нет. Цепь сохранена наполовину: ${event.streakKept}.`,
          });
          break;
        case 'freezeUsed':
          nextToasts.push({
            key: counter++,
            icon: 'cold',
            title: 'Печать Стужи сработала',
            body: event.free
              ? 'Использована бесплатная заморозка. Цепь цела.'
              : 'Заморозка потрачена. Цепь цела.',
          });
          break;
        case 'exhausted':
          nextToasts.push({
            key: counter++,
            icon: 'heart',
            title: 'Истощение',
            body: 'Золото приходит вдвое медленнее, удача отвернулась. Ничего не потеряно — восстановись, и краски вернутся.',
          });
          break;
        case 'recovered':
          nextToasts.push({
            key: counter++,
            icon: 'nature',
            title: 'Силы вернулись',
            body: 'Краски мира снова на месте.',
          });
          break;
        case 'hpChanged':
          if (event.stageChanged && event.to < event.from) {
            nextFloats.push({
              key: counter++,
              text: HP_STAGE_LABELS[event.stage],
              color: 'var(--danger-text)',
              size: '16px',
              top: 64,
            });
          }
          break;
        default:
          break;
      }
    }

    if (nextFloats.length) setFloats((prev) => [...prev, ...nextFloats]);
    if (nextToasts.length) setToasts((prev) => [...prev, ...nextToasts].slice(-3));
    if (nextLevelUp) setLevelUp(nextLevelUp);
    consumeEvents();
  }, [events, consumeEvents]);

  useEffect(() => {
    if (floats.length === 0) return;
    const timer = window.setTimeout(() => setFloats([]), 1200);
    return () => window.clearTimeout(timer);
  }, [floats]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((prev) => prev.slice(1)), 4200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  return (
    <>
      {floats.map((f, i) => (
        <span
          key={f.key}
          className="float-num anim-float"
          style={{
            top: `${f.top}dvh`,
            color: f.color,
            fontSize: f.size,
            animationDelay: `${i * 90}ms`,
          }}
        >
          {f.text}
        </span>
      ))}

      <div
        className="pointer-events-none fixed inset-x-0 z-[55] mx-auto flex flex-col items-center gap-2 px-4"
        style={{ top: 'calc(var(--safe-top) + var(--header-height) + 8px)', maxWidth: 'var(--content-max)' }}
      >
        {toasts.map((t) => (
          <div
            key={t.key}
            className="surface-raised anim-seal pointer-events-auto flex w-full items-start gap-3 p-3"
            style={{ boxShadow: 'var(--shadow-lift)' }}
            role="status"
          >
            <span className="mt-1 shrink-0" style={{ color: 'var(--accent)' }}>
              <Icon name={t.icon} size="md" />
            </span>
            <div className="min-w-0">
              <p className="t-title">{t.title}</p>
              <p className="t-caption mt-1">{t.body}</p>
            </div>
          </div>
        ))}
      </div>

      {levelUp ? <LevelUpScreen event={levelUp} onClose={() => setLevelUp(null)} /> : null}
    </>
  );
}

/** Полноэкранное повышение уровня — единственное место с восковой печатью. */
function LevelUpScreen({
  event,
  onClose,
}: {
  event: Extract<GameEvent, { type: 'levelUp' }>;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 5200);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const rays = useMemo(() => Array.from({ length: 12 }, (_, i) => (i * 360) / 12), []);

  return (
    <div
      className="fixed inset-0 z-[70] overflow-hidden"
      onClick={onClose}
      role="presentation"
      aria-label={`Уровень ${event.level}`}
    >
      {/*
        Непрозрачная подложка отдельным слоем.
        Раньше фон был единственным слоем из rgba с альфой .97/.99 — сквозь
        него просматривался интерфейс под оверлеем. Экран повышения уровня
        обязан быть непрозрачным: он перекрывает всё приложение.
      */}
      <div className="absolute inset-0" style={{ background: 'var(--bg-base)' }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 38%, rgba(56,42,16,.95), rgba(6,5,3,1) 70%)',
        }}
      />

      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-20">
        {rays.map((deg) => (
          <span
            key={deg}
            className="absolute h-[140dvh] w-px"
            style={{
              transform: `rotate(${deg}deg)`,
              background:
                'linear-gradient(180deg, transparent, rgba(232,206,134,.7), transparent)',
            }}
          />
        ))}
      </div>

      {/*
        Прокручиваемый контейнер с отступами под вырезы.
        Печать и текст ранга вместе выше 844 px на некоторых состояниях, а
        `place-items-center` внутри `overflow-hidden` обрезал их сверху и
        снизу без возможности доскроллить.
      */}
      <div
        className="relative flex h-full flex-col items-center justify-center overflow-y-auto px-8 text-center"
        style={{
          paddingTop: 'calc(var(--safe-top) + var(--space-8))',
          paddingBottom: 'calc(var(--safe-bottom) + var(--space-8))',
        }}
      >
        {/*
          Анимация «оттиска» применяется ТОЛЬКО к печати. Раньше она стояла на
          всём блоке, и стартовый scale(2.2) растягивал заголовок и текст за
          границы экрана, где их срезал overflow-hidden.
        */}
        <div className="wax-seal anim-seal shrink-0">
          <div>
            <p className="t-label" style={{ color: 'rgba(240,234,221,.75)' }}>
              Уровень
            </p>
            <p
              className="leading-none"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-display)',
                fontWeight: 600,
                color: 'var(--bone-100)',
              }}
            >
              {event.level}
            </p>
          </div>
        </div>

        <h1 className="t-display mt-8" style={{ color: 'var(--accent-bright)' }}>
          {event.rankChanged ? 'Новый ранг' : 'Возвышение'}
        </h1>

        {event.rankChanged ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <RankSigil rank={event.rank} size="lg" />
            <p className="t-h2">{RANK_TITLES[event.rank]}</p>
            <p className="t-sm mx-auto mt-1 max-w-xs">
              Торговцы заговорят с тобой иначе. Открылись новые полки.
            </p>
          </div>
        ) : (
          <p className="t-sm mx-auto mt-4 max-w-xs">
            Ты стал сильнее. Ровно настолько, насколько заслужил сегодня.
          </p>
        )}

        <p className="t-label mt-10">Коснись, чтобы продолжить</p>
      </div>
    </div>
  );
}
