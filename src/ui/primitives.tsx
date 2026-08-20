/**
 * Словарь интерфейса. Только вёрстка — ни одного игрового вычисления.
 * Все значения берутся из токенов (docs/DESIGN_SYSTEM.md §3).
 */

import { useEffect, useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS } from '@/game/balance';
import type { AttributeId, Rank } from '@/game/types';
import { Icon } from './icons';
import type { IconName } from './icons';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ═════════════════════════════════════════════ Заголовок экрана

/**
 * Заголовок экрана с версалом — подпись дизайна (DESIGN_SYSTEM.md §6).
 *
 * Версал, а не буквица в рамке: рамка отделяла первую букву от остального
 * слова, и «Лавка» читалась как «Λ авка» — то есть как опечатка. Версал
 * укрупняет и золотит инициал ВНУТРИ слова, сохраняя его цельным.
 */
export function ScreenTitle({
  children,
  subtitle,
  action,
}: {
  children: string;
  subtitle?: string;
  action?: ReactNode;
}): JSX.Element {
  const initial = children.slice(0, 1);
  const rest = children.slice(1);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="t-display">
          <span className="versal">{initial}</span>
          {rest}
        </h1>
        {subtitle ? <p className="t-caption mt-1">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </div>
  );
}

/** Метка раздела. Без золотой линейки под каждым заголовком — она была шумом. */
export function SectionLabel({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="t-label truncate">{children}</h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ═════════════════════════════════════════════ Поверхности

export function Card({
  children,
  className,
  style,
  tone = 'base',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Только токены спейсинга. Произвольные значения запрещены. */
  style?: CSSProperties;
  tone?: 'base' | 'raised' | 'accent';
  as?: 'div' | 'li' | 'section';
}): JSX.Element {
  const surface =
    tone === 'accent' ? 'surface-accent' : tone === 'raised' ? 'surface-raised' : 'surface';
  return (
    <Tag className={cx(surface, className)} style={style}>
      {children}
    </Tag>
  );
}

// ═════════════════════════════════════════════ Кнопки

export function Button({
  children,
  onClick,
  variant = 'secondary',
  icon,
  className,
  disabled,
  type = 'button',
  full,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cx('btn', `btn-${variant}`, full && 'w-full', className)}
    >
      {icon ? <Icon name={icon} size="sm" /> : null}
      {children}
    </button>
  );
}

/** Иконочная кнопка. Тач-цель всегда 44×44, даже если иконка 20px. */
export function IconButton({
  icon,
  label,
  onClick,
  className,
  size = 'md',
}: {
  icon: IconName;
  /** Обязателен: иконка без ярлыка недоступна для скринридера. */
  label: string;
  onClick: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx('tap pressable rounded-sm text-[color:var(--fg-secondary)]', className)}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

// ═════════════════════════════════════════════ Индикаторы

export function Gauge({
  value,
  variant = 'xp',
  className,
}: {
  value: number;
  variant?: 'xp' | 'health' | 'danger' | 'season';
  className?: string;
}): JSX.Element {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx('gauge', className)} role="presentation">
      <div className={cx('gauge-fill', `gauge-${variant}`)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Кольцо прогресса — герой главного экрана.
 * SVG, а не conic-gradient: нужна анимация и точный контроль толщины.
 */
export function ProgressRing({
  value,
  size = 176,
  ticks = 0,
  children,
}: {
  value: number;
  size?: number;
  /** Число делений по окружности — по одному на назначенное дело. */
  ticks?: number;
  children: ReactNode;
}): JSX.Element {
  const stroke = 9;
  const r = (size - stroke) / 2 - 10;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const gradientId = useId();

  /*
    Кольцо дня — единственный герой экрана, и оно было тонкой золотой дугой
    на пустоте: элемент из любого дашборда. Четыре слоя, которые превращают
    его в циферблат:

      1. внешнее тонкое кольцо-обод — рамка прибора, а не просто край;
      2. вдавленный жёлоб под дугу (тёмный, с внутренней тенью);
      3. деления по числу дел дня — прогресс становится СЧИТАЕМЫМ:
         видно «четыре из шести», не читая подпись;
      4. сама дуга с градиентом и свечением.

    Деления рисуются только когда дел немного: при двадцати они сливаются
    в сплошную линию и превращаются в шум.
  */
  const showTicks = ticks > 0 && ticks <= 12;
  const tickMarks = showTicks
    ? Array.from({ length: ticks }, (_, i) => (i / ticks) * 360)
    : [];

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="var(--accent-bright)" />
            <stop offset="55%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-deep)" />
          </linearGradient>
        </defs>

        {/* Обод прибора. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r + stroke / 2 + 5}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth="1"
        />

        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {/* Жёлоб. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--bg-sunken)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(0,0,0,.55)"
            strokeWidth={stroke - 4}
          />

          {/* Заполненная дуга. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            style={{
              transition: 'stroke-dashoffset 700ms var(--ease-out)',
              filter: clamped > 0 ? 'drop-shadow(0 0 6px rgba(201,162,39,.5))' : 'none',
            }}
          />
        </g>

        {/* Деления — по одному на дело дня. */}
        {tickMarks.map((deg) => (
          <line
            key={deg}
            x1={size / 2}
            y1={size / 2 - r - stroke / 2 - 1}
            x2={size / 2}
            y2={size / 2 - r - stroke / 2 - 4}
            stroke="var(--border-strong)"
            strokeWidth="1"
            transform={`rotate(${deg} ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/**
 * Знак ранга. Золотая заливка только у самой буквы —
 * раньше это был золотой блок, который тянул на себя всё внимание.
 */
export function RankSigil({ rank, size = 'md' }: { rank: Rank; size?: 'sm' | 'md' | 'lg' }): JSX.Element {
  const dims = {
    sm: { box: 'var(--sigil-sm)', text: 'var(--text-caption)' },
    md: { box: 'var(--sigil-md)', text: 'var(--text-title)' },
    lg: { box: 'var(--sigil-lg)', text: 'var(--text-h1)' },
  }[size];

  /*
    ПЕЧАТЬ РАНГА — гербовый щит, а не квадрат с буквой.

    Ранг — единственное качественное изменение статуса в игре (E → SS),
    и он был обозначен прямоугольником со скруглением 2px: слабее, чем
    иконка привычки рядом. Теперь это восьмиугольный картуш со срезанными
    углами, двойной обводкой и свечением — форма, которой на экране больше
    нет ни у чего, поэтому знак опознаётся мгновенно.

    Срез углов — через clip-path, а не картинкой: масштабируется, красится
    токенами и ничего не весит.
  */
  const octagon =
    'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';

  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: dims.box, height: dims.box }}
      aria-label={`Ранг ${rank}`}
    >
      {/* Внешняя грань — золотой контур картуша. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          clipPath: octagon,
          background: 'linear-gradient(160deg, var(--accent) 0%, var(--accent-deep) 55%, #3a2e0d 100%)',
          boxShadow: 'var(--glow-accent)',
        }}
      />
      {/* Внутреннее поле — тёмная эмаль под литерой. */}
      <span
        aria-hidden
        className="absolute"
        style={{
          inset: '2px',
          clipPath: octagon,
          background:
            'radial-gradient(120% 100% at 50% 0%, rgba(240,234,221,.09), transparent 60%), var(--ink-900)',
        }}
      />
      {/* Вес не задаём: Forum одноначертательный, синтетический жир его портит. */}
      <span
        className="relative leading-none"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: dims.text,
          letterSpacing: 'var(--track-display)',
          color: 'var(--accent-bright)',
          textShadow: '0 1px 0 rgba(0,0,0,.8)',
        }}
      >
        {rank}
      </span>
    </span>
  );
}

/** Метка атрибута. Цветом атрибуты не различаются — только иконкой и подписью. */
export function AttributeTag({
  attribute,
  active,
}: {
  attribute: AttributeId;
  active?: boolean;
}): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-2"
      style={{ color: active ? 'var(--accent-bright)' : 'var(--fg-muted)' }}
    >
      <Icon name={ATTRIBUTE_ICONS[attribute]} size="sm" />
      <span className="t-label" style={{ color: 'inherit' }}>
        {ATTRIBUTE_LABELS[attribute]}
      </span>
    </span>
  );
}

export function GoldAmount({
  amount,
  className,
  muted,
}: {
  amount: number;
  className?: string;
  muted?: boolean;
}): JSX.Element {
  return (
    <span
      className={cx('inline-flex items-center gap-2 t-num', className)}
      style={{ color: muted ? 'var(--fg-muted)' : 'var(--accent-bright)' }}
    >
      <Icon name="coin" size="sm" />
      {amount.toLocaleString('ru-RU')}
    </span>
  );
}

/** Строка «подпись → значение» для листов статистики. */
export function StatRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="t-sm" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </span>
      <span className="t-num shrink-0">{value}</span>
    </div>
  );
}

// ═════════════════════════════════════════════ Модальный лист

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={onClose} role="presentation" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2 className="t-h2 min-w-0 flex-1 truncate">{title}</h2>
          <IconButton icon="close" label="Закрыть" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Пустое состояние

/** Пустой экран — приглашение к действию, а не украшение. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: IconName;
  title: string;
  hint: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mb-4 flex justify-center" style={{ color: 'var(--fg-muted)' }}>
        <Icon name={icon} size="lg" />
      </div>
      <p className="t-title">{title}</p>
      <p className="t-sm mx-auto mt-2" style={{ color: 'var(--fg-muted)', maxWidth: 'var(--measure-hint)' }}>
        {hint}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// ═════════════════════════════════════════════ Чип

export function Chip({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: IconName;
}): JSX.Element {
  return (
    <button type="button" className="chip pressable" data-active={active} onClick={onClick}>
      {icon ? <Icon name={icon} size="sm" /> : null}
      {children}
    </button>
  );
}

// ═════════════════════════════════════════════ Подтверждение

export function ConfirmRow({
  question,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <Card className="mt-3 p-4">
      <p className="t-sm mb-4">{question}</p>
      <div className="flex gap-2">
        <Button variant="danger" onClick={onConfirm} className="flex-1">
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} className="flex-1">
          Отмена
        </Button>
      </div>
    </Card>
  );
}

// ═════════════════════════════════════════════ Поле формы

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="t-label mb-2 block">{label}</span>
      {children}
      {hint ? (
        <span className="t-caption mt-2 block" style={{ color: 'var(--fg-muted)' }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

// ═════════════════════════════════════════════ Раскрытие

/**
 * Свёрнутый блок: заголовок, короткая сводка справа, содержимое по нажатию.
 *
 * Нужен там, где содержимое важно, но смотрят его редко — достижения, сумка,
 * история сезонов. Развёрнутая простыня из 24 карточек не информативнее
 * строки «3 / 24», зато отбирает у экрана центр внимания и три прокрутки.
 *
 * Реализовано на кнопке с aria-expanded, а не на <details>: нативный
 * disclosure тянет собственный маркер и собственную типографику, которые
 * пришлось бы гасить, и по-разному ведёт себя при поиске по странице.
 */
/**
 * Разделитель с виньеткой. Ставится там, где меняется смысл раздела.
 *
 * Прямая линия во всю ширину — типографика таблицы. Гаснущая к краям линия
 * с ромбом по центру — типографика книги; приложение называется «Хроника».
 */
export function OrnateRule(): JSX.Element {
  return (
    <div className="rule-ornate" aria-hidden style={{ marginBlock: 'var(--space-8)' }}>
      <span />
    </div>
  );
}

export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="surface" style={{ marginTop: 'var(--gap-row)' }}>
      <button
        type="button"
        className="pressable flex w-full items-center justify-between gap-3"
        style={{ padding: 'var(--space-4)', minHeight: 'var(--tap-min)' }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="t-title">{title}</span>
        <span className="inline-flex shrink-0 items-center gap-2">
          {summary ? <span className="t-caption">{summary}</span> : null}
          <span
            aria-hidden
            style={{
              color: 'var(--fg-muted)',
              display: 'inline-flex',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--dur-base) var(--ease-out)',
            }}
          >
            <Icon name="chevronDown" size="sm" />
          </span>
        </span>
      </button>

      {open ? (
        <div
          id={id}
          style={{
            paddingInline: 'var(--space-4)',
            paddingBottom: 'var(--space-4)',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 'var(--space-4)',
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
