/**
 * Лавка.
 *
 * Иерархия: герой — реплика торговца; второй — витрина; третий — категории и баланс.
 * Торговец узнаёт ранг и стрик, меняет тон, при низком HP убирает роскошь с полок.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  consumableBlock,
  consumablePrice,
  cosmeticBlock,
  dailyGoldPace,
  daysToAfford,
  hpStage,
  isCosmeticVisible,
  isLocationAccessible,
  isRealRewardVisible,
  pickAspiration,
  plural,
  rankForLevel,
} from '@/game';
import { CONSUMABLES, REAL_REWARD_TIERS } from '@/game/balance';
import type { CatalogItem, ConsumableId, RealReward, RealRewardTier } from '@/game/types';
import { COSMETICS } from '@/data/catalog';
import { LOCATIONS } from '@/data/locations';
import { MERCHANTS_BY_LOCATION, pickGreeting, pickLine } from '@/data/merchants';
import {
  HORIZON_LABELS,
  STARTER_TEMPLATE_IDS,
  templateById,
  templateTier,
} from '@/data/realRewardTemplates';
import type { RealRewardTemplate } from '@/data/realRewardTemplates';
import { useGame } from '@/state/useGame';
import { Icon } from '../icons';
import type { IconName } from '../icons';
import {
  Button,
  Card,
  Chip,
  cx,
  EmptyState,
  GoldAmount,
  ScreenTitle,
  SectionLabel,
} from '../primitives';
import { RealRewardSheet } from '../sheets/RealRewardSheet';

type Tab = 'real' | 'cosmetic' | 'consumable';

/**
 * Пометка награды выбрана игроком, а не взята из библиотеки.
 *
 * Каталог-шаблон использует имена иконок (`candy`, `run`, `book`), свои
 * награды игрок волен пометить чем угодно, включая эмодзи, — это его данные,
 * и запрет на эмодзи в интерфейсе на них не распространяется. Отличаем по
 * тому, что имя иконки состоит из латиницы.
 */
function isUserGlyph(icon: string): boolean {
  return !/^[a-zA-Z]+$/.test(icon);
}

const BLOCK_LABELS: Record<string, string> = {
  notEnoughGold: 'Мало золота',
  inventoryFull: 'Сумка полна',
  monthlyLimit: 'Лимит месяца',
  alreadyOwned: 'Уже твоё',
  rankTooLow: 'Нужен ранг',
  hidden: 'Недоступно',
};

export function ShopScreen(): JSX.Element {
  const {
    character,
    realRewards,
    dayRecords,
    today,
    buyCosmetic,
    buyConsumable,
    buyRealReward,
    equipCosmetic,
    track,
  } = useGame();

  const [tab, setTab] = useState<Tab>('real');
  const [locationId, setLocationId] = useState('town');
  const [rewardEditor, setRewardEditor] = useState<RealReward | 'new' | null>(null);
  const [merchantSays, setMerchantSays] = useState('');

  const rank = rankForLevel(character.level);
  const stage = hpStage(character.hp);
  const merchant = MERCHANTS_BY_LOCATION.get(locationId) ?? MERCHANTS_BY_LOCATION.get('town');

  const lineCtx = useMemo(
    () => ({ rank, streak: character.globalStreak, hpStage: stage }),
    [rank, character.globalStreak, stage],
  );

  useEffect(() => {
    if (!merchant) return;
    setMerchantSays(pickGreeting(merchant, lineCtx, Math.random()));
  }, [merchant, lineCtx]);

  const pace = useMemo(() => dailyGoldPace(dayRecords, today), [dayRecords, today]);

  const visibleRewards = useMemo(
    () => realRewards.filter((r) => isRealRewardVisible(character, r)),
    [realRewards, character],
  );

  const visibleCosmetics = useMemo(
    () => COSMETICS.filter((c) => c.locationId === locationId && isCosmeticVisible(character, c)),
    [character, locationId],
  );

  /*
    «Просмотр товара без покупки» — это разница между показанным и купленным.
    Событие покупки уже пишется, поэтому здесь фиксируется только показ:
    один раз на открытие вкладки, а не на каждый рендер, иначе телеметрия
    заполнится дублями от перерисовок React.
  */
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const key = `${tab}|${locationId}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    const ids =
      tab === 'real'
        ? visibleRewards.map((r) => r.id)
        : tab === 'cosmetic'
          ? visibleCosmetics.map((c) => c.id)
          : (Object.keys(CONSUMABLES) as ConsumableId[]);
    for (const id of ids) track('itemViewed', id, null, tab);
  }, [tab, locationId, visibleRewards, visibleCosmetics, track]);

  const aspiration = useMemo(() => {
    const candidates = [
      ...visibleRewards.map((r) => ({ name: r.name, icon: r.icon, price: r.price })),
      ...visibleCosmetics.map((c) => ({ name: c.name, icon: c.icon, price: c.price })),
    ];
    return pickAspiration(character.gold, pace, candidates);
  }, [visibleRewards, visibleCosmetics, character.gold, pace]);

  const openLocations = useMemo(
    () =>
      LOCATIONS.filter((l) => isLocationAccessible(character, l) && MERCHANTS_BY_LOCATION.has(l.id)),
    [character],
  );

  const speak = (key: 'purchase' | 'poor' | 'browse' | 'farewell'): void => {
    if (merchant) setMerchantSays(pickLine(merchant, key, lineCtx, Math.random()));
  };

  const tryBuy = async (fn: () => Promise<boolean>, blocked: boolean): Promise<void> => {
    if (blocked) {
      speak('poor');
      return;
    }
    const ok = await fn();
    speak(ok ? 'purchase' : 'poor');
  };

  return (
    <div style={{ paddingInline: 'var(--pad-screen)', paddingTop: 'var(--space-6)' }}>
      <ScreenTitle subtitle={merchant ? merchant.title : 'Торговые ряды'}>Лавка</ScreenTitle>

      {/* ── Герой экрана: торговец ── */}
      {merchant ? (
        <Card tone="raised" className="filigree mt-6 p-5">
          <div className="flex items-center gap-3">
            <span
              className="grid shrink-0 place-items-center rounded-full"
              style={{
                width: 'var(--slot-md)',
                height: 'var(--slot-md)',
                background: 'var(--bg-sunken)',
                color: 'var(--fg-secondary)',
              }}
            >
              <Icon name={merchant.icon} size="md" />
            </span>
            <div className="min-w-0">
              <p className="t-title truncate">{merchant.name}</p>
              <p className="t-caption">{merchant.title}</p>
            </div>
          </div>

          <p className="t-body mt-4 italic" style={{ color: 'var(--fg-primary)' }}>
            «{merchantSays}»
          </p>

          {/* Баланс не дублируем: он постоянно виден в шапке. */}
          <div
            className="mt-5 flex justify-end pt-4"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <button
              type="button"
              className="link-action pressable t-label underline"
              onClick={() => speak('browse')}
            >
              заговорить
            </button>
          </div>
        </Card>
      ) : null}

      {/* ── Желанная покупка ── */}
      {aspiration ? (
        <Card tone="accent" className="mt-3 flex items-center gap-3 p-3">
          <span style={{ color: 'var(--accent)' }}>
            <Icon name={aspiration.icon} size="md" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-sm truncate" style={{ color: 'var(--fg-primary)' }}>
              {aspiration.name}
            </p>
            <p className="t-caption mt-1">
              Ещё {aspiration.missing.toLocaleString('ru-RU')} золота — примерно {aspiration.days}{' '}
              {plural(aspiration.days, 'день', 'дня', 'дней')} твоего темпа
            </p>
          </div>
        </Card>
      ) : null}

      {/* ── Локации ── */}
      {openLocations.length > 1 ? (
        <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4">
          {openLocations.map((l) => (
            <div key={l.id} className="shrink-0">
              <Chip
                active={locationId === l.id}
                onClick={() => setLocationId(l.id)}
                icon={l.icon as IconName}
              >
                {l.name}
              </Chip>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Категории ── */}
      <div className="mt-6 flex gap-2">
        <Chip active={tab === 'real'} onClick={() => setTab('real')}>
          Награды
        </Chip>
        <Chip active={tab === 'cosmetic'} onClick={() => setTab('cosmetic')}>
          Косметика
        </Chip>
        <Chip active={tab === 'consumable'} onClick={() => setTab('consumable')}>
          Расходники
        </Chip>
      </div>

      {tab === 'real' ? (
        <section style={{ marginTop: 'var(--gap-section)' }}>
          <SectionLabel
            action={
              <button
                type="button"
                className="link-action pressable t-label"
                style={{ color: 'var(--accent-bright)' }}
                onClick={() => setRewardEditor('new')}
              >
                <Icon name="plus" size="sm" />
                награда
              </button>
            }
          >
            Реальные награды
          </SectionLabel>

          {visibleRewards.length === 0 ? (
            /*
              Пустая витрина — это мёртвая экономика: главный сток игры не
              работает, и копить не за чем. Раньше здесь была только кнопка
              «назначить награду», то есть работа перед первой наградой.
              Теперь предлагается готовый набор в один тап, а вписать своё
              по-прежнему можно.
            */
            <StarterRewards onAddOwn={() => setRewardEditor('new')} />
          ) : (
            <ul className="space-y-2">
              {visibleRewards.map((reward) => {
                const blocked = character.gold < reward.price;
                const days = daysToAfford(reward.price, character.gold, pace);
                return (
                  <li key={reward.id}>
                    <ShelfRow
                      icon={reward.icon}
                      userGlyph={isUserGlyph(reward.icon)}
                      name={reward.name}
                      lore={
                        reward.note ||
                        `${REAL_REWARD_TIERS[reward.tier].label} награда${reward.purchasedCount > 0 ? ` · выкуплено ${reward.purchasedCount}` : ''}`
                      }
                      price={reward.price}
                      blockedLabel={
                        blocked ? `Ещё ${days} ${plural(days, 'день', 'дня', 'дней')}` : null
                      }
                      onBuy={() => void tryBuy(() => buyRealReward(reward), blocked)}
                      onEdit={() => setRewardEditor(reward)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'cosmetic' ? (
        <section style={{ marginTop: 'var(--gap-section)' }}>
          <SectionLabel>Косметика</SectionLabel>
          {visibleCosmetics.length === 0 ? (
            <Card>
              <EmptyState
                icon="lock"
                title="Полки полупусты"
                hint={
                  stage === 'exhausted' || stage === 'wounded'
                    ? 'Торговец убрал дорогой товар — не время для роскоши. Восстанови здоровье, и полки вернутся.'
                    : 'Ассортимент этой лавки пока закрыт.'
                }
              />
            </Card>
          ) : (
            <ul className="space-y-2">
              {visibleCosmetics.map((item) => (
                <li key={item.id}>
                  <CosmeticRow
                    item={item}
                    owned={character.ownedCosmetics.includes(item.id)}
                    equipped={
                      character.equippedTheme === item.id ||
                      character.equippedFrame === item.id ||
                      character.equippedTitle === item.id
                    }
                    block={cosmeticBlock(character, item)}
                    onBuy={() =>
                      void tryBuy(() => buyCosmetic(item), cosmeticBlock(character, item) !== null)
                    }
                    onEquip={() => void equipCosmetic(item)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'consumable' ? (
        <section style={{ marginTop: 'var(--gap-section)' }}>
          <SectionLabel>Расходники</SectionLabel>
          <p className="t-caption mb-4">
            Ограничены жёстко: лимит в сумке, лимит покупок за месяц и растущая цена внутри месяца.
            Без этого экономика сломается.
          </p>
          <ul className="space-y-2">
            {(Object.keys(CONSUMABLES) as ConsumableId[]).map((id) => {
              const cfg = CONSUMABLES[id];
              const stock = character.consumables[id];
              const price = consumablePrice(character, id);
              const block = consumableBlock(character, id);
              return (
                <li key={id}>
                  <ShelfRow
                    icon={cfg.icon}
                    name={cfg.name}
                    lore={`${cfg.lore} · в сумке ${stock.owned}/${cfg.maxOwned} · за месяц ${stock.purchasedThisMonth}/${cfg.maxPerMonth}`}
                    price={price}
                    blockedLabel={block ? (BLOCK_LABELS[block] ?? null) : null}
                    onBuy={() => void tryBuy(() => buyConsumable(id), block !== null)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <RealRewardSheet target={rewardEditor} onClose={() => setRewardEditor(null)} pace={pace} />
    </div>
  );
}

/**
 * Стартовый набор реальных наград.
 *
 * Показывается, пока игрок не завёл ни одной своей. Задача одна: чтобы на
 * первом же открытии лавки существовала конкретная цель чуть выше баланса —
 * иначе золото не значит ничего.
 */
function StarterRewards({ onAddOwn }: { onAddOwn: () => void }): JSX.Element {
  const { addRealReward } = useGame();
  const [busy, setBusy] = useState(false);

  const starters = STARTER_TEMPLATE_IDS.map(templateById).filter(
    (t): t is RealRewardTemplate => t !== undefined,
  );

  const addAll = async (): Promise<void> => {
    setBusy(true);
    try {
      for (const t of starters) {
        await addRealReward({
          name: t.name,
          note: t.note,
          icon: t.icon,
          price: t.price,
          tier: templateTier(t),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <p className="t-h2">За что копить</p>
      <p className="t-sm mt-2" style={{ color: 'var(--fg-secondary)' }}>
        Золото покупает разрешение на то, в чём ты себя ограничиваешь. Вот
        готовый набор — цены можно менять, позиции удалять, свои добавлять.
      </p>
      <p className="t-caption mt-2">
        Курс: цена в тенге, делённая на десять. Награды без денежной цены
        оценены в днях дисциплины.
      </p>

      <ul className="mt-5 space-y-2">
        {starters.map((t) => (
          <li key={t.id} className="flex items-center gap-3">
            <span
              className="grid shrink-0 place-items-center rounded-sm"
              style={{
                width: 'var(--slot-sm)',
                height: 'var(--slot-sm)',
                background: 'var(--bg-sunken)',
              }}
            >
              <span className="user-glyph">{t.icon}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-title block truncate">{t.name}</span>
              <span className="t-caption">{HORIZON_LABELS[t.horizon]}</span>
            </span>
            <GoldAmount amount={t.price} />
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-2">
        <Button variant="primary" full disabled={busy} onClick={() => void addAll()}>
          {busy ? 'Раскладываем на полки…' : `Взять набор · ${starters.length}`}
        </Button>
        <Button variant="ghost" full icon="plus" onClick={onAddOwn}>
          Вписать свою
        </Button>
      </div>
    </Card>
  );
}

function ShelfRow({
  icon,
  userGlyph,
  name,
  lore,
  price,
  blockedLabel,
  onBuy,
  onEdit,
}: {
  icon: string;
  /** Иконка выбрана игроком (эмодзи) — рендерится в отдельном контейнере. */
  userGlyph?: boolean;
  name: string;
  lore: string;
  price: number;
  blockedLabel: string | null;
  onBuy: () => void;
  onEdit?: () => void;
}): JSX.Element {
  return (
    <div className={cx('surface flex items-stretch overflow-hidden', blockedLabel && 'opacity-70')}>
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className="pressable min-w-0 flex-1 p-3 text-left disabled:cursor-default disabled:opacity-100"
        aria-label={onEdit ? `Изменить «${name}»` : undefined}
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm"
            style={{ background: 'var(--bg-sunken)', color: 'var(--fg-muted)' }}
          >
            {userGlyph ? (
              <span className="user-glyph">{icon}</span>
            ) : (
              <Icon name={icon} size="md" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-title truncate">{name}</p>
            <GoldAmount amount={price} muted={blockedLabel !== null} />
          </div>
        </div>
        <p className="t-caption mt-2">{lore}</p>
      </button>

      {/*
        Недоступная покупка ОТКЛЮЧЕНА, а не просто подписана причиной.
        Раньше кнопка оставалась нажимаемой: движок отказ обрабатывал, но
        для человека это выглядело как «нажал и ничего не произошло».
      */}
      {/*
        Кнопка покупки — ЗОЛОТАЯ НАДПИСЬ НА ТЁМНОМ, а не золотая плита.

        Сплошная заливка выглядела решительно на одной карточке и разрушала
        экран на пяти: в лавке со стартовым набором золото занимало 9.4%
        площади страницы (замер `e2e/audit-design.mjs`) — почти весь бюджет
        акцента уходил на повторяющийся элемент, который ничего не выделяет,
        потому что выделены все. Так же устроены витрины в Diablo IV и BG3:
        действие обозначено гравированной рамкой и капителью, а не плашкой.

        Аффорданс держится тремя признаками, которых достаточно: отдельная
        колонка, светящаяся рамка и глагол.
      */}
      <button
        type="button"
        onClick={onBuy}
        disabled={blockedLabel !== null}
        className="pressable grid w-20 shrink-0 place-items-center px-2 t-label text-center disabled:cursor-not-allowed"
        style={{
          borderLeft: `1px solid ${blockedLabel ? 'var(--border-subtle)' : 'var(--border-accent)'}`,
          background: blockedLabel ? 'transparent' : 'var(--accent-glow)',
          color: blockedLabel ? 'var(--fg-muted)' : 'var(--accent-bright)',
        }}
        aria-label={blockedLabel ? `Купить «${name}» нельзя: ${blockedLabel}` : `Купить «${name}»`}
      >
        {blockedLabel ?? 'купить'}
      </button>
    </div>
  );
}

function CosmeticRow({
  item,
  owned,
  equipped,
  block,
  onBuy,
  onEquip,
}: {
  item: CatalogItem;
  owned: boolean;
  equipped: boolean;
  block: string | null;
  onBuy: () => void;
  onEquip: () => void;
}): JSX.Element {
  return (
    <div className="surface flex items-stretch overflow-hidden">
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm"
            style={{
              background: 'var(--bg-sunken)',
              color: owned ? 'var(--accent)' : 'var(--fg-muted)',
            }}
          >
            <Icon name={item.icon} size="md" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-title truncate">{item.name}</p>
            {owned ? (
              <p className="t-label" style={{ color: 'var(--accent-bright)' }}>
                в собственности
              </p>
            ) : (
              <GoldAmount amount={item.price} muted={block !== null} />
            )}
          </div>
        </div>
        <p className="t-caption mt-2">{item.lore}</p>
      </div>

      {owned && item.cosmeticKind !== 'location' ? (
        <button
          type="button"
          onClick={onEquip}
          className="pressable grid w-[5.5rem] shrink-0 place-items-center px-2 t-label"
          style={{
            borderLeft: '1px solid var(--border-subtle)',
            background: equipped ? 'var(--accent)' : 'transparent',
            color: equipped ? 'var(--ink-950)' : 'var(--fg-secondary)',
          }}
        >
          {equipped ? 'надето' : 'надеть'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onBuy}
          disabled={owned}
          className="pressable grid w-[5.5rem] shrink-0 place-items-center px-2 t-label text-center"
          style={{
            borderLeft: '1px solid var(--border-subtle)',
            background: block ? 'transparent' : 'var(--accent)',
            color: block ? 'var(--fg-muted)' : 'var(--ink-950)',
          }}
        >
          {owned ? 'куплено' : block ? (BLOCK_LABELS[block] ?? 'нельзя') : 'купить'}
        </button>
      )}
    </div>
  );
}

/** Подсказка по тиру — используется формой создания награды. */
export function tierHint(tier: RealRewardTier): string {
  const t = REAL_REWARD_TIERS[tier];
  const max = Number.isFinite(t.max) ? t.max.toLocaleString('ru-RU') : '∞';
  return `${t.min.toLocaleString('ru-RU')} – ${max} · ${t.hint}`;
}
