/**
 * Лист персонажа — главный экран ощущения «я персонаж игры».
 *
 * ИЕРАРХИЯ (один центр внимания):
 *   герой   — печать ранга, имя, уровень, пять атрибутов. Всё в первом экране.
 *   второй  — предметные счётчики: из чего вырос уровень.
 *   третий  — график, сумка, сезон, достижения, летопись, перерождение.
 *
 * Что было не так до переделки: экран был 4186px — пять прокруток, из
 * которых больше половины занимала простыня из 24 достижений, разложенных
 * карточками по одной в строку. Центра внимания не было: 24 одинаковые
 * карточки перевешивают что угодно просто площадью. Достижения свёрнуты в
 * счётчик с раскрытием, всё редко используемое убрано под раскрытие тоже.
 */

import { useMemo, useState } from 'react';
import {
  ACHIEVEMENTS,
  attrLevelProgress,
  attrXpToNextLevel,
  canPrestige,
  computeTallies,
  daysInSystem,
  hasWeeklyMovement,
  hpStage,
  levelForNextRank,
  levelProgress,
  plural,
  rankForLevel,
  seasonTierProgress,
  seasonXpToNextTier,
  weeklyAttributeTotals,
  xpToNextLevel,
} from '@/game';
import {
  ATTRIBUTE_ICONS,
  ATTRIBUTE_LABELS,
  CONSUMABLES,
  HP_STAGE_LABELS,
  MAX_HP,
  PRESTIGE_XP_BONUS,
  RANK_TITLES,
  SEASON_TIERS,
  SEASON_UNLOCK_LEVEL,
} from '@/game/balance';
import { ATTRIBUTE_IDS } from '@/game/types';
import type { ConsumableId } from '@/game/types';
import { useGame } from '@/state/useGame';
import { AttributeChart } from '../AttributeChart';
import { Icon } from '../icons';
import {
  Button,
  Card,
  ConfirmRow,
  Disclosure,
  EmptyState,
  Gauge,
  RankSigil,
  SectionLabel,
  StatRow,
} from '../primitives';

const CHART_WEEKS = 12;

export function CharacterScreen(): JSX.Element {
  const {
    character,
    habits,
    logs,
    ledger,
    setCharacterName,
    useElixir,
    useScroll,
    doPrestige,
    today,
  } = useGame();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(character.name);
  const [confirmPrestige, setConfirmPrestige] = useState(false);

  const rank = rankForLevel(character.level);
  const nextRankLevel = levelForNextRank(character.level);
  const stage = hpStage(character.hp);
  const need = xpToNextLevel(character.level);

  const unlocked = useMemo(
    () => new Set(character.unlockedAchievements),
    [character.unlockedAchievements],
  );
  const tallies = useMemo(() => computeTallies(habits, logs, today), [habits, logs, today]);
  const tracked = tallies.filter((t) => t.tracked);
  const days = useMemo(() => daysInSystem(ledger, today), [ledger, today]);
  const chart = useMemo(
    () => weeklyAttributeTotals(ledger, today, CHART_WEEKS),
    [ledger, today],
  );

  return (
    <div style={{ paddingInline: 'var(--pad-screen)', paddingTop: 'var(--space-6)' }}>
      {/* ══ ГЕРОЙ ЭКРАНА: кто ты и насколько вырос ══ */}
      <section className="flex flex-col items-center">
        <RankSigil rank={rank} size="lg" />

        {editingName ? (
          <div className="flex w-full gap-2" style={{ marginTop: 'var(--space-5)' }}>
            <input
              className="field flex-1 text-center"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={24}
              autoFocus
              aria-label="Имя героя"
            />
            <Button
              variant="primary"
              onClick={() => {
                void setCharacterName(nameDraft);
                setEditingName(false);
              }}
            >
              Готово
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(character.name);
              setEditingName(true);
            }}
            className="tap pressable"
            style={{ marginTop: 'var(--space-5)' }}
            aria-label="Изменить имя героя"
          >
            <span className="t-display">{character.name}</span>
          </button>
        )}

        <p className="t-label" style={{ marginTop: 'var(--space-2)' }}>
          {RANK_TITLES[rank]} · ранг {rank}
          {character.prestigeSeals > 0 ? ` · перерождений ${character.prestigeSeals}` : ''}
        </p>

        {/*
          Уровень — единственное число-герой на экране. Раньше он был строкой
          «Уровень 3» тем же кеглем, что и подписи вокруг, и терялся.
        */}
        <div className="flex w-full items-end justify-between" style={{ marginTop: 'var(--space-8)' }}>
          <div>
            <p className="t-label">Уровень</p>
            <p className="t-hero" style={{ marginTop: 'var(--space-1)' }}>
              {character.level}
            </p>
          </div>
          <p className="t-caption" style={{ paddingBottom: 'var(--space-2)' }}>
            {Number.isFinite(need) ? `${character.xp} / ${need} XP` : 'Максимум'}
          </p>
        </div>
        <div className="w-full" style={{ marginTop: 'var(--space-3)' }}>
          <Gauge value={levelProgress(character.level, character.xp)} />
        </div>

        <div className="w-full" style={{ marginTop: 'var(--space-5)' }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 'var(--space-2)' }}>
            <span
              className="t-caption"
              style={{ color: stage === 'healthy' ? 'var(--fg-muted)' : 'var(--danger-text)' }}
            >
              Здоровье · {HP_STAGE_LABELS[stage]}
            </span>
            <span className="t-caption">
              {character.hp} / {MAX_HP}
            </span>
          </div>
          <Gauge value={character.hp / MAX_HP} variant={stage === 'healthy' ? 'health' : 'danger'} />
        </div>

        {nextRankLevel !== null ? (
          <p className="t-caption text-center" style={{ marginTop: 'var(--space-5)' }}>
            До ранга {rankForLevel(nextRankLevel)} осталось {nextRankLevel - character.level}{' '}
            {plural(nextRankLevel - character.level, 'уровень', 'уровня', 'уровней')}
          </p>
        ) : null}
      </section>

      {/* ══ АТРИБУТЫ — часть героя экрана, а не отдельный раздел ══ */}
      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Атрибуты</SectionLabel>
        <Card style={{ paddingInline: 'var(--space-4)', paddingBlock: 'var(--space-1)' }}>
          {ATTRIBUTE_IDS.map((id, i) => {
            const attr = character.attributes[id];
            const attrNeed = attrXpToNextLevel(attr.level);
            return (
              <div
                key={id}
                style={{
                  paddingBlock: 'var(--space-4)',
                  ...(i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : {}),
                }}
              >
                <div
                  className="flex items-center justify-between gap-3"
                  style={{ marginBottom: 'var(--space-2)' }}
                >
                  <span
                    className="inline-flex items-center gap-2"
                    style={{ color: 'var(--fg-secondary)' }}
                  >
                    <Icon name={ATTRIBUTE_ICONS[id]} size="sm" />
                    <span className="t-label" style={{ color: 'var(--fg-secondary)' }}>
                      {ATTRIBUTE_LABELS[id]}
                    </span>
                  </span>
                  <span className="t-num">{attr.level}</span>
                </div>
                <Gauge value={attrLevelProgress(attr.level, attr.xp)} />
                <p className="t-caption text-right" style={{ marginTop: 'var(--space-1)' }}>
                  {Number.isFinite(attrNeed) ? `${attr.xp} / ${attrNeed}` : 'Максимум'}
                </p>
              </div>
            );
          })}
        </Card>
      </section>

      {/* ══ ВТОРОЙ УРОВЕНЬ: из чего вырос этот уровень ══ */}
      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Сделано на самом деле</SectionLabel>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-5)' }}>
            <Tally label="Дней в системе" value={days} />
            <Tally label="Лучшая серия дней" value={character.bestGlobalStreak} />
            <Tally label="Квестов закрыто" value={character.stats.questsCompleted} />
            <Tally label="Идеальных дней" value={character.stats.perfectDays} />
            {tracked.map((t) => (
              <Tally key={t.id} label={t.label} value={t.value} />
            ))}
          </div>

          {tracked.length < 3 ? (
            <p className="t-caption" style={{ marginTop: 'var(--space-5)' }}>
              Предметные счётчики появляются, когда включаешь привычки из фолианта:
              тренировки, чтение, намаз, воздержание. Свои привычки сюда не попадают —
              приложение не угадывает, что они значат.
            </p>
          ) : null}
        </Card>
      </section>

      {/* ══ ТРЕТИЙ УРОВЕНЬ: всё редкое — под раскрытием ══ */}
      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Летопись</SectionLabel>

        <Disclosure
          title="Рост по неделям"
          summary={`${CHART_WEEKS} недель`}
          defaultOpen={hasWeeklyMovement(chart)}
        >
          {hasWeeklyMovement(chart) ? (
            <AttributeChart points={chart} />
          ) : (
            <p className="t-caption">
              Кривая появится, когда наберётся хотя бы две недели отметок.
            </p>
          )}
        </Disclosure>

        <Disclosure
          title="Достижения"
          summary={`${unlocked.size} / ${ACHIEVEMENTS.length}`}
        >
          <ul style={{ display: 'grid', gap: 'var(--gap-row)' }}>
            {ACHIEVEMENTS.map((a) => {
              const got = unlocked.has(a.id);
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3"
                  style={{ opacity: got ? 1 : 0.55 }}
                >
                  <span
                    className="grid shrink-0 place-items-center rounded-sm"
                    style={{
                      width: 'var(--slot-sm)',
                      height: 'var(--slot-sm)',
                      background: 'var(--bg-sunken)',
                      color: got ? 'var(--accent)' : 'var(--fg-muted)',
                    }}
                  >
                    <Icon name={got ? a.icon : 'lock'} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{a.name}</span>
                    <span className="t-caption block">{got ? a.lore : a.requirement}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Disclosure>

        <Disclosure title="Сумка" summary={`${inventoryCount(character.consumables)} шт.`}>
          <ul style={{ display: 'grid', gap: 'var(--gap-row)' }}>
            {(Object.keys(CONSUMABLES) as ConsumableId[]).map((id) => {
              const cfg = CONSUMABLES[id];
              const stock = character.consumables[id];
              const usable =
                (id === 'healthElixir' && stock.owned > 0 && character.hp < MAX_HP) ||
                (id === 'doubleXpScroll' && stock.owned > 0 && character.doubleXpDay !== today);
              return (
                <li key={id} className="flex items-center gap-3">
                  <span
                    className="grid shrink-0 place-items-center rounded-sm"
                    style={{
                      width: 'var(--slot-sm)',
                      height: 'var(--slot-sm)',
                      background: 'var(--bg-sunken)',
                      color: 'var(--fg-muted)',
                    }}
                  >
                    <Icon name={cfg.icon} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{cfg.name}</span>
                    <span className="t-caption block truncate">{cfg.lore}</span>
                  </span>
                  {usable ? (
                    <Button
                      variant="ghost"
                      onClick={() => void (id === 'healthElixir' ? useElixir() : useScroll())}
                    >
                      Применить
                    </Button>
                  ) : (
                    <span
                      className="t-num shrink-0"
                      style={{ color: stock.owned > 0 ? 'var(--accent-bright)' : 'var(--fg-muted)' }}
                    >
                      {stock.owned}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {character.doubleXpDay === today ? (
            <p
              className="t-caption text-center"
              style={{ marginTop: 'var(--space-3)', color: 'var(--accent-bright)' }}
            >
              Свиток развёрнут — весь опыт сегодня удваивается
            </p>
          ) : null}
        </Disclosure>

        <Disclosure
          title="Сезон"
          summary={
            character.season
              ? `${character.season.tier} / ${SEASON_TIERS}`
              : `с ${SEASON_UNLOCK_LEVEL}-го уровня`
          }
        >
          {character.season ? (
            <>
              <div className="flex items-baseline justify-between" style={{ marginBottom: 'var(--space-2)' }}>
                <span className="t-title">Сезон {character.season.index}</span>
                <span className="t-num">
                  {character.season.tier} / {SEASON_TIERS}
                </span>
              </div>
              <Gauge
                value={seasonTierProgress(character.season.tier, character.season.xp)}
                variant="season"
              />
              <p className="t-caption text-right" style={{ marginTop: 'var(--space-2)' }}>
                {Number.isFinite(seasonXpToNextTier(character.season.tier))
                  ? `${character.season.xp} / ${seasonXpToNextTier(character.season.tier)}`
                  : 'Шкала пройдена целиком'}
              </p>
              <p className="t-caption" style={{ marginTop: 'var(--space-3)' }}>
                Сезон длится 90 дней. Начат {character.season.startDay}.
              </p>
            </>
          ) : (
            <EmptyState
              icon="award"
              title={`Откроется на ${SEASON_UNLOCK_LEVEL}-м уровне`}
              hint="Когда глобальный уровень начнёт расти медленно, сезоны вернут короткую петлю прогресса: 30 ступеней за 90 дней, с наградами, которых потом не будет."
            />
          )}
        </Disclosure>

        {character.seasonHistory.length > 0 ? (
          <Disclosure title="Прошедшие сезоны" summary={`${character.seasonHistory.length}`}>
            <ul style={{ display: 'grid', gap: 'var(--gap-row)' }}>
              {character.seasonHistory.map((r) => (
                <li key={`${r.index}-${r.endDay}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="t-title">Сезон {r.index}</span>
                    <span className="t-num">ступень {r.tierReached}</span>
                  </div>
                  <p className="t-caption" style={{ marginTop: 'var(--space-1)' }}>
                    {r.startDay} — {r.endDay} · лучшая серия {r.bestStreak} · сильнейший атрибут{' '}
                    {ATTRIBUTE_LABELS[r.topAttribute]}
                  </p>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        <Disclosure title="Всего за путь" summary="цифры">
          <StatRow label="Выполнено дел" value={character.stats.totalCompletions.toLocaleString('ru-RU')} />
          <StatRow label="Критических наград" value={character.stats.totalCrits.toLocaleString('ru-RU')} />
          <StatRow label="Заработано золота" value={character.stats.totalGoldEarned.toLocaleString('ru-RU')} />
          <StatRow label="Потрачено золота" value={character.stats.totalGoldSpent.toLocaleString('ru-RU')} />
        </Disclosure>
      </section>

      {/* ══ Перерождение — только на вершине ══ */}
      {canPrestige(character.level) ? (
        <section style={{ marginTop: 'var(--gap-section)' }}>
          <SectionLabel>Перерождение</SectionLabel>
          <Card tone="accent" style={{ padding: 'var(--space-4)' }}>
            <p className="t-sm">
              Ты достиг вершины. Перерождение обнулит глобальный уровень, но{' '}
              <strong style={{ color: 'var(--accent-bright)' }}>сохранит всё остальное</strong>:
              атрибуты, золото, косметику, стрики, историю. За каждую Печать — навсегда +
              {Math.round(PRESTIGE_XP_BONUS * 100)}% опыта и золота.
            </p>
            <Button
              variant="primary"
              full
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => setConfirmPrestige(true)}
            >
              Переродиться
            </Button>
            {confirmPrestige ? (
              <ConfirmRow
                question="Точно? Глобальный уровень станет первым. Всё остальное останется твоим."
                confirmLabel="Да, переродиться"
                onConfirm={() => {
                  void doPrestige();
                  setConfirmPrestige(false);
                }}
                onCancel={() => setConfirmPrestige(false)}
              />
            ) : null}
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function inventoryCount(consumables: Record<ConsumableId, { owned: number }>): number {
  return (Object.keys(consumables) as ConsumableId[]).reduce(
    (sum, id) => sum + consumables[id].owned,
    0,
  );
}

/**
 * Предметный счётчик: число крупно, подпись мелко.
 *
 * Обратный порядок («Тренировок проведено: 46») читается как строка отчёта.
 * Число впереди читается как достижение — а это ровно то, ради чего блок есть.
 */
function Tally({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div>
      <p className="t-num" style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--text-h1-lh)' }}>
        {value.toLocaleString('ru-RU')}
      </p>
      <p className="t-caption" style={{ marginTop: 'var(--space-1)' }}>
        {label}
      </p>
    </div>
  );
}
