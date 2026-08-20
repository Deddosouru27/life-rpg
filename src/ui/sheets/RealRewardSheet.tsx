/**
 * Форма реальной награды. Показывает курс «тенге → золото» и срок накопления,
 * чтобы цена была осмысленной, а не произвольной.
 *
 * Значок выбирается из ТОЙ ЖЕ библиотеки SVG, что и везде. Раньше здесь был
 * набор эмодзи под предлогом «это данные игрока, а не интерфейс». Предлог
 * не выдерживает проверки: сам выбор — интерфейс, и он показывал пятнадцать
 * эмодзи рядом с обводочными иконками остального приложения. Два набора
 * значков в одном экране — самый заметный признак несобранного продукта.
 *
 * Награды, помеченные эмодзи в старых сейвах, продолжают показываться как
 * пользовательский глиф: отбирать у человека его пометку мы не станем.
 */

import { useEffect, useState } from 'react';
import { daysToAfford, goldFromTenge, plural, tierForPrice } from '@/game';
import { REAL_REWARD_TENGE_RATE, REAL_REWARD_TIERS } from '@/game/balance';
import type { RealReward, RealRewardTier } from '@/game/types';
import { useGame } from '@/state/useGame';
import { Icon } from '../icons';
import type { IconName } from '../icons';
import { Button, ConfirmRow, Chip, Field, Sheet } from '../primitives';

/** Значки наград — имена из библиотеки иконок (src/ui/icons.tsx). */
const REWARD_ICONS: readonly IconName[] = [
  'parcel',
  'candy',
  'droplet',
  'junkfood',
  'tv',
  'audio',
  'book',
  'chess',
  'run',
  'dumbbell',
  'weather',
  'nature',
  'map',
  'craft',
  'code',
  'clock',
  'laundry',
  'peace',
] as const;

const DEFAULT_REWARD_ICON: IconName = 'parcel';

export function RealRewardSheet({
  target,
  onClose,
  pace,
}: {
  target: RealReward | 'new' | null;
  onClose: () => void;
  pace: number;
}): JSX.Element {
  const { character, addRealReward, updateRealReward, removeRealReward } = useGame();
  const editing = target !== null && target !== 'new' ? target : null;

  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [icon, setIcon] = useState<string>(DEFAULT_REWARD_ICON);
  const [price, setPrice] = useState(500);
  const [tenge, setTenge] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (target === null) return;
    setConfirmDelete(false);
    setTenge('');
    if (target === 'new') {
      setName('');
      setNote('');
      setIcon(DEFAULT_REWARD_ICON);
      setPrice(500);
      return;
    }
    setName(target.name);
    setNote(target.note);
    setIcon(target.icon);
    setPrice(target.price);
  }, [target]);

  const tier: RealRewardTier = tierForPrice(price);
  const days = daysToAfford(price, character.gold, pace);
  const canSave = name.trim().length > 0 && price > 0;

  const submit = async (): Promise<void> => {
    if (!canSave) return;
    if (editing) {
      await updateRealReward({
        ...editing,
        name: name.trim(),
        note: note.trim(),
        icon,
        price,
        tier,
      });
    } else {
      await addRealReward({ name, note, icon, price, tier });
    }
    onClose();
  };

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={editing ? 'Правка награды' : 'Новая реальная награда'}
    >
      <div className="space-y-6">
        <Field label="Что ты хочешь получить">
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Новые кроссовки"
            maxLength={60}
          />
        </Field>

        <div>
          <p className="t-label mb-2">Значок</p>
          <div
            className="grid grid-cols-6 gap-2 rounded-sm p-2"
            style={{ background: 'var(--bg-sunken)' }}
          >
            {REWARD_ICONS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setIcon(name)}
                className="pressable grid aspect-square place-items-center rounded-sm"
                style={{
                  minHeight: 'var(--tap-min)',
                  background: icon === name ? 'var(--accent-glow)' : 'transparent',
                  outline: `1px solid ${
                    icon === name ? 'var(--border-accent)' : 'var(--border-subtle)'
                  }`,
                  color: icon === name ? 'var(--accent-bright)' : 'var(--fg-muted)',
                }}
                aria-label={`Значок ${name}`}
                aria-pressed={icon === name}
              >
                <Icon name={name} size="md" />
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Реальная цена в тенге"
          hint={`Курс: тенге ÷ ${REAL_REWARD_TENGE_RATE}. Так первая мелкая награда достижима уже на пятый день.`}
        >
          <input
            className="field t-num"
            inputMode="numeric"
            value={tenge}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '');
              setTenge(value);
              if (value) setPrice(goldFromTenge(Number(value)));
            }}
            placeholder="32000"
          />
        </Field>

        <div>
          <Field label="Цена в золоте">
            <input
              className="field t-num"
              type="number"
              inputMode="numeric"
              min={1}
              value={price}
              onChange={(e) => setPrice(Math.max(1, Number(e.target.value)))}
            />
          </Field>

          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(REAL_REWARD_TIERS) as RealRewardTier[]).map((t) => (
              <Chip key={t} active={tier === t} onClick={() => setPrice(REAL_REWARD_TIERS[t].min)}>
                {REAL_REWARD_TIERS[t].label} · {REAL_REWARD_TIERS[t].hint}
              </Chip>
            ))}
          </div>

          <p className="t-sm mt-3" style={{ color: 'var(--accent-bright)' }}>
            {price <= character.gold
              ? 'По карману прямо сейчас.'
              : `≈ ${days} ${plural(days, 'день', 'дня', 'дней')} при твоём темпе — ${Math.round(pace)} золота в день.`}
          </p>
        </div>

        <Field label="Заметка" hint="Необязательно">
          <textarea
            className="field resize-none"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {editing ? 'Сохранить' : 'Выставить на полку'}
          </Button>
          {editing ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
              Убрать
            </Button>
          ) : null}
        </div>

        {editing && confirmDelete ? (
          <ConfirmRow
            question={`Убрать «${editing.name}» с полки?`}
            confirmLabel="Убрать"
            onConfirm={() => {
              void removeRealReward(editing).then(onClose);
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : null}
      </div>
    </Sheet>
  );
}
