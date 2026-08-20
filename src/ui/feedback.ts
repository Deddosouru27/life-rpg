/**
 * Тактильная и звуковая отдача. Звуки синтезируются через WebAudio —
 * никаких внешних файлов, приложение остаётся полностью офлайн.
 */

import type { GameEvent, Settings } from '@/game/types';

let audioContext: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

/** Разблокировка звука по первому касанию — требование iOS. */
export function unlockAudio(): void {
  const ac = ctx();
  if (ac && ac.state === 'suspended') void ac.resume();
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
  /** Частота в конце — для скольжения вверх или вниз. */
  endFreq?: number;
}

function tone({ freq, duration, type = 'sine', volume = 0.14, delay = 0, endFreq }: ToneOptions): void {
  const ac = ctx();
  if (!ac) return;
  const start = ac.currentTime + delay;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Звон монет: несколько высоких призвуков с разбросом. */
export function playCoins(): void {
  tone({ freq: 1180, duration: 0.14, type: 'triangle', volume: 0.1 });
  tone({ freq: 1560, duration: 0.13, type: 'triangle', volume: 0.08, delay: 0.05 });
  tone({ freq: 2050, duration: 0.16, type: 'triangle', volume: 0.06, delay: 0.1 });
  tone({ freq: 1380, duration: 0.2, type: 'sine', volume: 0.05, delay: 0.15 });
}

export function playTick(): void {
  tone({ freq: 620, duration: 0.09, type: 'triangle', volume: 0.08, endFreq: 900 });
}

export function playCrit(): void {
  tone({ freq: 440, duration: 0.1, type: 'square', volume: 0.07 });
  tone({ freq: 660, duration: 0.12, type: 'square', volume: 0.07, delay: 0.07 });
  tone({ freq: 990, duration: 0.28, type: 'triangle', volume: 0.1, delay: 0.14 });
}

export function playLevelUp(): void {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => tone({ freq, duration: 0.42, type: 'triangle', volume: 0.11, delay: i * 0.11 }));
  tone({ freq: 130, duration: 0.9, type: 'sine', volume: 0.08, delay: 0.1 });
}

export function playDamage(): void {
  tone({ freq: 200, duration: 0.26, type: 'sawtooth', volume: 0.09, endFreq: 70 });
}

export function playAchievement(): void {
  tone({ freq: 784, duration: 0.3, type: 'triangle', volume: 0.1 });
  tone({ freq: 1047, duration: 0.45, type: 'triangle', volume: 0.1, delay: 0.13 });
}

// ─────────────────────────────────────────── Вибрация

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Вибрация не поддерживается — молча пропускаем.
  }
}

/** Переводит события движка в звук и вибрацию. */
export function fireFeedback(events: readonly GameEvent[], settings: Settings | null): void {
  if (!settings) return;
  const sound = settings.soundEnabled;
  const haptics = settings.hapticsEnabled;

  for (const event of events) {
    switch (event.type) {
      case 'reward':
        if (event.reward.crit) {
          if (sound) playCrit();
          if (haptics) vibrate([14, 40, 22]);
        } else {
          if (sound) playTick();
          if (haptics) vibrate(12);
        }
        break;
      case 'levelUp':
        if (sound) playLevelUp();
        if (haptics) vibrate([24, 60, 24, 60, 44]);
        break;
      case 'attributeLevelUp':
        if (sound) tone({ freq: 880, duration: 0.24, type: 'triangle', volume: 0.09 });
        if (haptics) vibrate([12, 30, 12]);
        break;
      case 'achievement':
      case 'streakMilestone':
      case 'seasonTier':
        if (sound) playAchievement();
        if (haptics) vibrate([18, 45, 18]);
        break;
      case 'purchase':
        if (sound) playCoins();
        if (haptics) vibrate([10, 26, 14]);
        break;
      case 'hpChanged':
        if (event.to < event.from) {
          if (sound) playDamage();
          if (haptics) vibrate([30, 20, 30]);
        }
        break;
      case 'exhausted':
        if (sound) tone({ freq: 110, duration: 1.1, type: 'sine', volume: 0.1, endFreq: 55 });
        if (haptics) vibrate([60, 40, 60, 40, 90]);
        break;
      default:
        break;
    }
  }
}
