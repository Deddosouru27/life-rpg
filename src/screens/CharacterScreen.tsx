import { useState, useEffect } from 'react'
import type { Character } from '../lib/types'
import { getCharacter } from '../lib/storage'
import { getRank, RANKS } from '../lib/ranks'
import { streakXpMultiplier } from '../lib/gameLogic'

export default function CharacterScreen() {
  const [char, setChar] = useState<Character>(getCharacter())
  const [showRanksModal, setShowRanksModal] = useState(false)
  const [showStreakModal, setShowStreakModal] = useState(false)

  useEffect(() => {
    const onStorage = () => setChar(getCharacter())
    window.addEventListener('storage-update', onStorage)
    return () => window.removeEventListener('storage-update', onStorage)
  }, [])

  const rank = getRank(char.level)
  const xpPercent = Math.floor((char.xp / char.xpToNextLevel) * 100)

  return (
    <div className="p-4 space-y-4" style={{ backgroundColor: '#0a0a0f', minHeight: '100%' }}>
      {/* Шапка */}
      <div className="text-center pt-8 pb-2">
        <div className="text-5xl mb-4">⚔️</div>
        <h1 className="text-4xl font-extrabold tracking-wider text-white mb-1">
          {char.name}
        </h1>
        <button
          onClick={() => setShowRanksModal(true)}
          className={`text-sm font-bold tracking-widest uppercase ${rank.color} hover:opacity-70 transition-opacity`}
        >
          ◆ {rank.name} · УР. {char.level}
        </button>
        {char.currentStreak > 0 && (
          <button
            onClick={() => setShowStreakModal(true)}
            className="mt-2 text-sm font-bold text-orange-400 tracking-wide hover:opacity-70 transition-opacity"
          >
            🔥 {char.currentStreak} {streakLabel(char.currentStreak)}
          </button>
        )}
      </div>

      {/* XP бар */}
      <div className="rounded-xl p-4 space-y-2 border border-white/5" style={{ backgroundColor: '#111118' }}>
        <div className="flex justify-between text-xs font-semibold tracking-wider uppercase">
          <span className="text-gray-500">Опыт</span>
          <span className={rank.color}>{char.xp} / {char.xpToNextLevel} XP</span>
        </div>
        <div className="w-full rounded-full h-2.5" style={{ backgroundColor: '#0a0a0f' }}>
          <div
            className={`${rank.barColor} h-2.5 rounded-full animate-xp-pulse`}
            style={{ width: `${xpPercent}%`, transition: 'width 0.6s ease' }}
          />
        </div>
        <p className="text-xs text-gray-600 text-right">{xpPercent}% до следующего уровня</p>
      </div>

      {/* Золото */}
      <div className="rounded-xl p-4 flex justify-between items-center border border-white/5" style={{ backgroundColor: '#111118' }}>
        <span className="text-gray-500 text-sm font-semibold tracking-wider uppercase">Золото</span>
        <span className="text-yellow-400 font-extrabold text-lg">💰 {char.gold}</span>
      </div>

      {/* Статы */}
      <div className="rounded-xl p-4 space-y-3 border border-white/5" style={{ backgroundColor: '#111118' }}>
        <h2 className="text-gray-500 text-xs font-bold tracking-widest uppercase mb-3">Характеристики</h2>
        {Object.entries(char.stats).map(([key, val]) => (
          <div key={key} className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">{statLabel(key)}</span>
            <div className="flex gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-1.5 rounded-sm ${i < val ? rank.barColor : ''}`}
                  style={i >= val ? { backgroundColor: '#1f1f2e' } : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Модалка рангов */}
      {showRanksModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setShowRanksModal(false)}
        >
          <div
            className="rounded-2xl w-full max-w-md p-6 space-y-4 border border-white/5"
            style={{ backgroundColor: '#111118' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-white font-extrabold tracking-wider uppercase text-sm">
                Система рангов
              </h2>
              <button onClick={() => setShowRanksModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>

            <div className="space-y-2">
              {RANKS.map((r) => {
                const isCurrent = r.name === rank.name
                const isUnlocked = char.level >= r.minLevel
                const levelRange = r.maxLevel
                  ? `${r.minLevel}–${r.maxLevel} ур.`
                  : `${r.minLevel}+ ур.`

                return (
                  <div
                    key={r.name}
                    className={`rounded-xl p-3 flex items-center gap-3 border transition-all ${
                      isCurrent ? `border-current ${r.color}` : 'border-white/5'
                    } ${!isUnlocked ? 'opacity-30' : ''}`}
                    style={{ backgroundColor: isCurrent ? '#1a1a2e' : '#0d0d14' }}
                  >
                    <div
                      className="w-1.5 h-8 rounded-full"
                      style={{ backgroundColor: isUnlocked ? r.stripColor : '#333' }}
                    />
                    <div className="flex-1">
                      <div className={`font-bold text-sm ${isUnlocked ? r.color : 'text-gray-600'}`}>
                        ◆ {r.name}
                      </div>
                      <div className="text-xs text-gray-600">{levelRange}</div>
                    </div>
                    {isCurrent && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.barColor} text-black`}>
                        ТЕКУЩИЙ
                      </span>
                    )}
                    {!isCurrent && isUnlocked && (
                      <span className="text-gray-600 text-sm">✓</span>
                    )}
                  </div>
                )
              })}
            </div>

            {rank.maxLevel && (
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs text-gray-600 text-center tracking-wide">
                  До следующего ранга: {rank.maxLevel + 1 - char.level} уровней
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модалка стрика */}
      {showStreakModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setShowStreakModal(false)}
        >
          <div
            className="rounded-2xl w-full max-w-md p-6 space-y-4 border border-white/5"
            style={{ backgroundColor: '#111118' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-white font-extrabold tracking-wider uppercase text-sm">
                🔥 Серия дней
              </h2>
              <button onClick={() => setShowStreakModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>

            <div className="text-center py-2">
              <p className="text-6xl font-extrabold text-orange-400" style={{ textShadow: '0 0 40px #f97316' }}>
                {char.currentStreak}
              </p>
              <p className="text-gray-500 text-sm mt-1 tracking-wide">
                {streakLabel(char.currentStreak)}
              </p>
            </div>

            <p className="text-gray-400 text-xs leading-relaxed text-center">
              Выполняй хотя бы 1 Daily квест каждый день чтобы поддерживать серию.
              Пропустишь день — серия сгорит.
            </p>

            <div className="rounded-xl p-3 border border-orange-500/20 space-y-1" style={{ backgroundColor: '#1a1008' }}>
              <p className="text-orange-400 text-xs font-bold tracking-wider uppercase">Бонус к XP за Daily</p>
              {[5, 10, 15, 20, 25].map(days => {
                const mult = streakXpMultiplier(days)
                const isActive = char.currentStreak >= days
                return (
                  <div key={days} className={`flex justify-between text-xs ${isActive ? 'text-orange-300' : 'text-gray-600'}`}>
                    <span>{days}+ дней подряд</span>
                    <span className="font-bold">×{mult.toFixed(1)} XP {isActive ? '✓' : ''}</span>
                  </div>
                )
              })}
              <p className="text-gray-600 text-xs pt-1">Максимум: ×1.5 при 25+ днях</p>
            </div>

            <button
              onClick={() => setShowStreakModal(false)}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white py-2 rounded-lg font-bold text-sm tracking-wide transition-colors"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function streakLabel(days: number): string {
  if (days % 10 === 1 && days % 100 !== 11) return 'день подряд'
  if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) return 'дня подряд'
  return 'дней подряд'
}

function statLabel(key: string): string {
  const labels: Record<string, string> = {
    strength: '⚔️ Сила',
    intellect: '📚 Интеллект',
    endurance: '🏃 Выносливость',
    discipline: '🧘 Дисциплина',
  }
  return labels[key] ?? key
}
