/**
 * Детерминированный ГПСЧ. Движок никогда не вызывает Math.random напрямую —
 * это позволяет тестировать вероятностные механики (криты, находки) точно.
 */

export interface Rng {
  /** Число в [0, 1). */
  next(): number;
  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number;
  /** true с вероятностью p. */
  chance(p: number): boolean;
  /** Случайный элемент непустого массива, либо undefined. */
  pick<T>(items: readonly T[]): T | undefined;
}

/** mulberry32 — быстрый, качественный для игровых нужд, 32 бита состояния. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T,>(items: readonly T[]): T | undefined =>
      items.length === 0 ? undefined : items[Math.floor(next() * items.length)],
  };
}

/** ГПСЧ, засеянный текущим временем. Используется в рантайме, не в тестах. */
export function createRuntimeRng(): Rng {
  return createRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
}

/** Стабильный 32-битный хеш строки — для сидов, привязанных к дню/сущности. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
