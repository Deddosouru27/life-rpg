/**
 * График роста атрибутов по неделям.
 *
 * Никакой библиотеки: пять линий на 12 точках — это меньше кода, чем импорт
 * charting-движка, и полностью в токенах системы. Чужая библиотека принесла
 * бы свои цвета, свои шрифты и свой tooltip — то есть ровно то, от чего
 * дизайн-система защищает.
 *
 * Кривая НАКОПИТЕЛЬНАЯ, а не понедельный прирост. Прирост показывает
 * «сколько я сделал на прошлой неделе» — это отчётность. Накопление
 * показывает «сколько я прошёл» — это путь. На экране героя нужен путь.
 */

import { useId, useMemo } from 'react';
import type { WeekPoint } from '@/game';
import { ATTRIBUTE_LABELS } from '@/game/balance';
import { ATTRIBUTE_IDS } from '@/game/types';
import type { AttributeId } from '@/game/types';

/** Цвет линии атрибута. Только токены — произвольных значений здесь нет. */
const LINE_COLOR: Record<AttributeId, string> = {
  discipline: 'var(--fg-secondary)',
  body: 'var(--danger)',
  spirit: 'var(--accent-bright)',
  wealth: 'var(--accent)',
  mind: 'var(--success)',
};

const W = 320;
const H = 120;
const PAD_X = 4;
const PAD_Y = 8;

export function AttributeChart({ points }: { points: readonly WeekPoint[] }): JSX.Element {
  const gradientId = useId();

  const { paths, max, span } = useMemo(() => {
    const highest = Math.max(
      1,
      ...points.flatMap((p) => ATTRIBUTE_IDS.map((id) => p.totals[id])),
    );
    const stepX = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;

    const built = ATTRIBUTE_IDS.map((id) => {
      const d = points
        .map((p, i) => {
          const x = PAD_X + stepX * i;
          const y = H - PAD_Y - (p.totals[id] / highest) * (H - PAD_Y * 2);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
      return { id, d, last: points[points.length - 1]?.totals[id] ?? 0 };
    });

    return { paths: built, max: highest, span: points.length };
  }, [points]);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Рост атрибутов за ${span} недель. Наибольшее накопленное значение — ${max} опыта.`}
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--border-subtle)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Три опорные линии вместо сетки: сетка на 12 точках — это шум. */}
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={H - PAD_Y - f * (H - PAD_Y * 2)}
            y2={H - PAD_Y - f * (H - PAD_Y * 2)}
            stroke="var(--border-subtle)"
            strokeWidth="1"
          />
        ))}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H - PAD_Y}
          y2={H - PAD_Y}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />

        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill="none"
            stroke={LINE_COLOR[p.id]}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/*
        Легенда обязательна: пять линий различаются только цветом, а полагаться
        на один лишь цвет нельзя — рядом стоит число, поэтому линия читается
        и без различения оттенков.
      */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {paths.map((p) => (
          <li key={p.id} className="inline-flex items-center gap-2">
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 12,
                height: 2,
                background: LINE_COLOR[p.id],
              }}
            />
            <span className="t-label">{ATTRIBUTE_LABELS[p.id]}</span>
            <span className="t-num" style={{ fontSize: 'var(--text-caption)' }}>
              {p.last}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
