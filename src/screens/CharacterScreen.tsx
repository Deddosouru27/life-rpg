import { useState, useEffect } from 'react'
import type { Character } from '../lib/types'
import { getCharacter } from '../lib/storage'
import { getRank, RANKS } from '../lib/ranks'

export default function CharacterScreen() {
  const [char, setChar] = useState<Character>(getCharacter())
  const [showRanksModal, setShowRanksModal] = useState(false)

  useEffect(() => {
    const onStorage = () => setChar(getCharacter())
    window.addEventListener('storage-update', onStorage)
    return () => window.removeEventListener('storage-update', onStorage)
  }, [])

  const rank = getRank(char.level)
  const xpPercent = Math.floor((char.xp / char.xpToNextLevel) * 100)

  return (
    <div className="p-4 space-y-6">
      {/* Шапка персонажа */}
      <div className="text-center pt-6">
        <div className="text-6xl mb-2">⚔️</div>
        <h1 className="text-2xl font-bold text-yellow-400">{char.name}</h1>
        <button
          onClick={() => setShowRanksModal(true)}
          className={`mt-1 text-sm font-semibold ${rank.color} hover:opacity-80 transition-opacity`}
        >
          {rank.icon} {rank.name} · Ур. {char.level}
        </button>
      </div>

      {/* XP бар */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Опыт</span>
          <span className={rank.color}>{char.xp} / {char.xpToNextLevel} XP</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-3">
          <div
            className={`${rank.barColor} h-3 rounded-full transition-all duration-500`}
            style={{ width: `${xpPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-right">{xpPercent}% до следующего уровня</p>
      </div>

      {/* Золото */}
      <div className="bg-gray-900 rounded-xl p-4 flex justify-between items-center">
        <span className="text-gray-400">Золото</span>
        <span className="text-yellow-400 font-bold text-lg">💰 {char.gold}</span>
      </div>

      {/* Статы */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <h2 className="text-gray-300 font-semibold mb-2">Характеристики</h2>
        {Object.entries(char.stats).map(([key, val]) => (
          <div key={key} className="flex justify-between items-center">
            <span className="text-gray-400 capitalize">{statLabel(key)}</span>
            <div className="flex gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-2 rounded-sm ${i < val ? rank.barColor : 'bg-gray-700'}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Модалка рангов */}
      {showRanksModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center p-4"
          onClick={() => setShowRanksModal(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-white font-bold text-lg">Система рангов</h2>
              <button
                onClick={() => setShowRanksModal(false)}
                className="text-gray-500 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {RANKS.map((r) => {
                const isCurrent = r.name === rank.name
                const isUnlocked = char.level >= r.minLevel
                const levelRange = r.maxLevel
                  ? `${r.minLevel}–${r.maxLevel} уровень`
                  : `${r.minLevel}+ уровень`

                return (
                  <div
                    key={r.name}
                    className={`rounded-xl p-3 flex items-center gap-3 border ${
                      isCurrent
                        ? `${r.borderColor} bg-gray-800`
                        : 'border-gray-800 bg-gray-800/50'
                    } ${!isUnlocked ? 'opacity-40' : ''}`}
                  >
                    <span className="text-2xl">{r.icon}</span>
                    <div className="flex-1">
                      <div className={`font-semibold ${isUnlocked ? r.color : 'text-gray-500'}`}>
                        {r.name}
                      </div>
                      <div className="text-xs text-gray-500">{levelRange}</div>
                    </div>
                    {isCurrent && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.barColor} text-gray-900`}>
                        Текущий
                      </span>
                    )}
                    {!isCurrent && isUnlocked && (
                      <span className="text-gray-500 text-lg">✓</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Прогресс до следующего ранга */}
            {rank.maxLevel && (
              <div className="pt-2 border-t border-gray-800">
                <p className="text-xs text-gray-500 text-center">
                  До следующего ранга: {rank.maxLevel + 1 - char.level} ур.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
