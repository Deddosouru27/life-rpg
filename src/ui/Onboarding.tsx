/**
 * ПЕРВЫЙ ЗАПУСК.
 *
 * Точка, где бросают: свежий сейв — это пустое приложение, в котором нечего
 * отмечать и не за чем возвращаться. Онбординг обязан за три шага довести до
 * состояния «есть что отметить сегодня и есть за чем копить».
 *
 *   Шаг 1 — привычки. Разумный набор уже отмечен: можно просто согласиться.
 *   Шаг 2 — одна радость дня и одна цель месяца. Без них лавка пуста,
 *           а золото ничего не значит.
 *   Шаг 3 — приветствие Системы. Правила в пять предложений, не мануалом.
 *
 * Всё пропускается и всё вызывается заново из настроек, поэтому ни один шаг
 * не имеет права быть обязательным.
 */

import { useState } from 'react';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS, REAL_REWARD_TENGE_RATE } from '@/game/balance';
import { goldFromTenge, tierForPrice } from '@/game/economy';
import { ATTRIBUTE_IDS } from '@/game/types';
import { HABIT_PRESETS_BY_ATTRIBUTE } from '@/data/habitPresets';
import type { HabitPreset } from '@/data/habitPresets';
import { templateById } from '@/data/realRewardTemplates';
import type { RealRewardTemplate } from '@/data/realRewardTemplates';
import { useGame } from '@/state/useGame';
import { Icon } from './icons';
import { Button, Card, Chip } from './primitives';

/**
 * Стартовый набор: шесть привычек, по одной на атрибут, все лёгкие.
 * Ранние победы важнее амбиций — на первой неделе решает не сложность,
 * а то, что список вообще закрывается.
 */
const SUGGESTED_IDS = [
  'disc-make-bed',
  'body-water',
  'mind-reading',
  'spirit-gratitude',
  'wealth-track-expenses',
  'disc-plan-day',
];

/** Примеры для шага 2 — тап подставляет название и цену. */
const DAY_EXAMPLES = ['tpl-sweet', 'tpl-game-hour', 'tpl-scroll-hour', 'tpl-coffee'];
const MONTH_EXAMPLES = ['tpl-sneakers', 'tpl-headphones', 'tpl-phone', 'tpl-trip'];

type Step = 'wake' | 'habits' | 'rewards' | 'system';

export function Onboarding(): JSX.Element {
  const { settings, saveSettings, setCharacterName, addHabit, addRealReward } = useGame();
  const [step, setStep] = useState<Step>('wake');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>(SUGGESTED_IDS);
  const [busy, setBusy] = useState(false);

  const [dayName, setDayName] = useState('');
  const [dayTenge, setDayTenge] = useState('');
  const [monthName, setMonthName] = useState('');
  const [monthTenge, setMonthTenge] = useState('');

  const allPresets = ATTRIBUTE_IDS.flatMap((a) => HABIT_PRESETS_BY_ATTRIBUTE[a]);

  const createHabits = async (): Promise<void> => {
    for (const id of picked) {
      const preset = allPresets.find((p) => p.id === id);
      if (!preset) continue;
      await addHabit({
        title: preset.title,
        lore: preset.lore,
        icon: preset.icon,
        attribute: preset.attribute,
        kind: preset.kind,
        difficulty: preset.difficulty,
        frequency: preset.frequency,
        target: preset.target,
        presetId: preset.id,
      });
    }
  };

  const createRewards = async (): Promise<void> => {
    const drafts = [
      { title: dayName, tenge: dayTenge, fallback: 200 },
      { title: monthName, tenge: monthTenge, fallback: 5000 },
    ];
    for (const d of drafts) {
      const title = d.title.trim();
      if (!title) continue;
      const parsed = Number(d.tenge.replace(/\s/g, ''));
      const price = Number.isFinite(parsed) && parsed > 0 ? goldFromTenge(parsed) : d.fallback;
      await addRealReward({
        name: title,
        note: '',
        icon: 'parcel',
        price,
        tier: tierForPrice(price),
      });
    }
  };

  /** Единственная точка завершения. Пропуск приходит сюда же. */
  const complete = async (withRewards: boolean): Promise<void> => {
    setBusy(true);
    try {
      await setCharacterName(name);
      await createHabits();
      if (withRewards) await createRewards();
      await saveSettings({ ...settings, onboarded: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mx-auto flex min-h-dvh flex-col"
      style={{
        maxWidth: 'var(--content-max)',
        paddingInline: 'var(--pad-screen)',
        paddingTop: 'calc(var(--safe-top) + var(--space-8))',
        paddingBottom: 'calc(var(--safe-bottom) + var(--space-6))',
      }}
    >
      {step === 'wake' ? (
        <StepWake
          name={name}
          onName={setName}
          onNext={() => setStep('habits')}
          onSkip={() => void complete(false)}
          busy={busy}
        />
      ) : null}

      {step === 'habits' ? (
        <StepHabits
          picked={picked}
          onToggle={(id) =>
            setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
          onBack={() => setStep('wake')}
          onNext={() => setStep('rewards')}
          onSkip={() => void complete(false)}
          busy={busy}
        />
      ) : null}

      {step === 'rewards' ? (
        <StepRewards
          dayName={dayName}
          dayTenge={dayTenge}
          monthName={monthName}
          monthTenge={monthTenge}
          onDayName={setDayName}
          onDayTenge={setDayTenge}
          onMonthName={setMonthName}
          onMonthTenge={setMonthTenge}
          onBack={() => setStep('habits')}
          onNext={() => setStep('system')}
          busy={busy}
        />
      ) : null}

      {step === 'system' ? (
        <StepSystem name={name} busy={busy} onAccept={() => void complete(true)} />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────── Пробуждение

function StepWake({
  name,
  onName,
  onNext,
  onSkip,
  busy,
}: {
  name: string;
  onName: (v: string) => void;
  onNext: () => void;
  onSkip: () => void;
  busy: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="t-label">Система пробуждена</p>
      <h1 className="t-display" style={{ marginTop: 'var(--space-4)' }}>
        Ты получил доступ
      </h1>
      <p className="t-body" style={{ marginTop: 'var(--space-6)' }}>
        Отныне то, что ты делаешь в жизни, засчитывается. Не намерения — только
        сделанное.
      </p>

      <label
        className="t-label block"
        htmlFor="hero-name"
        style={{ marginTop: 'var(--space-10)', marginBottom: 'var(--space-2)' }}
      >
        Как к тебе обращаться
      </label>
      <input
        id="hero-name"
        className="field"
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="Странник"
        maxLength={24}
        autoFocus
        aria-label="Имя героя"
      />
      <p className="t-caption" style={{ marginTop: 'var(--space-2)' }}>
        Так к тебе будут обращаться торговцы. Можно сменить в любой момент.
      </p>

      <Button variant="primary" full style={{ marginTop: 'var(--space-10)' }} onClick={onNext}>
        Дальше
      </Button>
      <button
        type="button"
        className="link-action pressable t-label mx-auto"
        style={{ marginTop: 'var(--space-5)' }}
        onClick={onSkip}
        disabled={busy}
      >
        пропустить настройку
      </button>
    </div>
  );
}

// ─────────────────────────────────────────── Шаг 1: привычки

function StepHabits({
  picked,
  onToggle,
  onBack,
  onNext,
  onSkip,
  busy,
}: {
  picked: string[];
  onToggle: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  busy: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-1 flex-col" style={{ paddingBlock: 'var(--space-4)' }}>
      <p className="t-label">Шаг 1 из 3</p>
      <h2 className="t-display" style={{ marginTop: 'var(--space-3)' }}>
        С чего начнёшь
      </h2>
      <p className="t-caption" style={{ marginTop: 'var(--space-3)' }}>
        Шесть лёгких привычек уже отмечены — можно просто согласиться. Меняй как
        хочешь, ничего не залочено.
      </p>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ marginTop: 'var(--space-6)', paddingBottom: 'var(--space-4)' }}
      >
        {ATTRIBUTE_IDS.map((attr) => (
          <div key={attr} style={{ marginBottom: 'var(--space-6)' }}>
            <p
              className="flex items-center gap-2"
              style={{ color: 'var(--fg-secondary)', marginBottom: 'var(--space-3)' }}
            >
              <Icon name={ATTRIBUTE_ICONS[attr]} size="sm" />
              <span className="t-label" style={{ color: 'var(--fg-secondary)' }}>
                {ATTRIBUTE_LABELS[attr]}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {HABIT_PRESETS_BY_ATTRIBUTE[attr].slice(0, 8).map((p: HabitPreset) => (
                <Chip
                  key={p.id}
                  active={picked.includes(p.id)}
                  icon={p.icon as never}
                  onClick={() => onToggle(p.id)}
                >
                  {p.title}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2" style={{ paddingTop: 'var(--space-2)' }}>
        <Button variant="ghost" onClick={onBack} disabled={busy} className="flex-1">
          Назад
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          disabled={busy || picked.length === 0}
          className="flex-[2]"
        >
          Дальше · {picked.length}
        </Button>
      </div>
      <button
        type="button"
        className="link-action pressable t-label mx-auto"
        style={{ marginTop: 'var(--space-4)' }}
        onClick={onSkip}
        disabled={busy}
      >
        пропустить остальное
      </button>
    </div>
  );
}

// ─────────────────────────────────────────── Шаг 2: награды

function StepRewards({
  dayName,
  dayTenge,
  monthName,
  monthTenge,
  onDayName,
  onDayTenge,
  onMonthName,
  onMonthTenge,
  onBack,
  onNext,
  busy,
}: {
  dayName: string;
  dayTenge: string;
  monthName: string;
  monthTenge: string;
  onDayName: (v: string) => void;
  onDayTenge: (v: string) => void;
  onMonthName: (v: string) => void;
  onMonthTenge: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-1 flex-col" style={{ paddingBlock: 'var(--space-4)' }}>
      <p className="t-label">Шаг 2 из 3</p>
      <h2 className="t-display" style={{ marginTop: 'var(--space-3)' }}>
        За что копить
      </h2>
      <p className="t-caption" style={{ marginTop: 'var(--space-3)' }}>
        Золото покупает разрешение на то, в чём ты себя ограничиваешь. Без цели
        оно ничего не значит — назови одну ближнюю и одну дальнюю.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ marginTop: 'var(--space-6)' }}>
        <RewardField
          label="Радость дня"
          hint="Один продуктивный день — одна такая покупка"
          examples={DAY_EXAMPLES}
          name={dayName}
          tenge={dayTenge}
          onName={onDayName}
          onTenge={onDayTenge}
          placeholder="Сладкое"
        />

        <div style={{ marginTop: 'var(--space-8)' }}>
          <RewardField
            label="Цель месяца"
            hint="Далёкая вершина. Всегда чуть выше баланса — так и задумано"
            examples={MONTH_EXAMPLES}
            name={monthName}
            tenge={monthTenge}
            onName={onMonthName}
            onTenge={onMonthTenge}
            placeholder="Кроссовки"
          />
        </div>

        <Card style={{ padding: 'var(--space-4)', marginTop: 'var(--space-8)' }}>
          <p className="t-label">Как назначать цену</p>
          <p className="t-sm" style={{ marginTop: 'var(--space-2)' }}>
            Золото ≈ тенге ÷ {REAL_REWARD_TENGE_RATE}. Кофе за 1 800 ₸ — это 180
            золота, около трёх честных дней. Если у награды нет денежной цены
            (час игры, утро без будильника), оцени её в днях дисциплины.
          </p>
        </Card>
      </div>

      <div className="flex gap-2" style={{ paddingTop: 'var(--space-4)' }}>
        <Button variant="ghost" onClick={onBack} disabled={busy} className="flex-1">
          Назад
        </Button>
        <Button variant="primary" onClick={onNext} disabled={busy} className="flex-[2]">
          Дальше
        </Button>
      </div>
      <p className="t-caption text-center" style={{ marginTop: 'var(--space-3)' }}>
        Можно оставить пустым — в лавке есть готовый набор.
      </p>
    </div>
  );
}

function RewardField({
  label,
  hint,
  examples,
  name,
  tenge,
  onName,
  onTenge,
  placeholder,
}: {
  label: string;
  hint: string;
  examples: readonly string[];
  name: string;
  tenge: string;
  onName: (v: string) => void;
  onTenge: (v: string) => void;
  placeholder: string;
}): JSX.Element {
  const items = examples
    .map(templateById)
    .filter((t): t is RealRewardTemplate => t !== undefined);

  const parsed = Number(tenge.replace(/\s/g, ''));
  const gold = Number.isFinite(parsed) && parsed > 0 ? goldFromTenge(parsed) : null;

  return (
    <div>
      <p className="t-label">{label}</p>
      <p className="t-caption" style={{ marginTop: 'var(--space-1)' }}>
        {hint}
      </p>

      <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--space-3)' }}>
        {items.map((t) => (
          <Chip
            key={t.id}
            active={name === t.name}
            onClick={() => {
              onName(t.name);
              onTenge(t.tenge === null ? '' : String(t.tenge));
            }}
          >
            {t.name}
          </Chip>
        ))}
      </div>

      <input
        className="field"
        style={{ marginTop: 'var(--space-3)' }}
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder={placeholder}
        maxLength={40}
        aria-label={`${label}: название`}
      />
      <div className="flex items-center gap-3" style={{ marginTop: 'var(--space-2)' }}>
        <input
          className="field t-num flex-1"
          type="number"
          inputMode="numeric"
          value={tenge}
          onChange={(e) => onTenge(e.target.value)}
          placeholder="цена в тенге"
          aria-label={`${label}: цена в тенге`}
        />
        <span className="t-caption shrink-0" style={{ minWidth: '104px' }}>
          {gold === null ? 'цена по усилию' : `${gold.toLocaleString('ru-RU')} золота`}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────── Шаг 3: Система

function StepSystem({
  name,
  busy,
  onAccept,
}: {
  name: string;
  busy: boolean;
  onAccept: () => void;
}): JSX.Element {
  const hero = name.trim() || 'Странник';
  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="t-label">Шаг 3 из 3</p>

      <Card
        tone="raised"
        className="filigree"
        style={{ padding: 'var(--space-6)', marginTop: 'var(--space-5)' }}
      >
        <p className="t-label" style={{ color: 'var(--accent-bright)' }}>
          Уведомление Системы
        </p>

        <h2 className="t-h1" style={{ marginTop: 'var(--space-4)' }}>
          {hero}, условия просты
        </h2>

        {/*
          Пять предложений — это правила, а не мануал. Каждое отвечает на
          вопрос, который иначе пришлось бы искать в справке.
        */}
        <div style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
          <p className="t-body">
            Каждое выполненное дело даёт опыт и золото. За намерение не
            начисляется ничего — только за отметку о сделанном.
          </p>
          <p className="t-body">
            Пропуск стоит здоровья, но никогда не отнимает опыт, уровень или
            золото. Один плохой день не обесценивает месяц.
          </p>
          <p className="t-body">
            День засчитывается в серию при выполнении 60% назначенного.
            Идеальным быть не обязательно.
          </p>
          <p className="t-body">
            Золото тратится на то, в чём ты себя ограничиваешь. Купленная
            слабость — не срыв, а оплаченное разрешение.
          </p>
          <p className="t-body">
            Отменить свою отметку можно всегда: она вернёт ровно то, что дала.
            Система не считает того, чего не было.
          </p>
        </div>
      </Card>

      <Button
        variant="primary"
        full
        style={{ marginTop: 'var(--space-8)' }}
        onClick={onAccept}
        disabled={busy}
      >
        {busy ? 'Открываем фолиант…' : 'Принять'}
      </Button>
    </div>
  );
}
