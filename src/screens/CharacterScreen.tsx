import { useState, useEffect } from 'react'
import type { Character } from '../lib/types'
import { getCharacter } from '../lib/storage'

export default function CharacterScreen() {
  const [char, setChar] = useState<Character>(getCharacter())

  useEffect(() => {
    const onStorage = () => setChar(getCharacter())
    window.addEventListener('storage-update', onStorage)
    return () => window.removeEventListener('storage-update', onStorage)
  }, [])

  const xpPercent = Math.floor((char.xp / char.xpToNextLevel) * 100)

  return (
    <div className="p-4 space-y-6">
      {/* Шапка персонажа */}
      <div className="text-center pt-6">
        <div className="text-6xl mb-2">⚔️</div>
        <h1 className="text-2xl font-bold text-yellow-400">{char.name}</h1>
        <p className="text-gray-400 text-sm">Уровень {char.level}</p>
      </div>

      {/* XP бар */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Опыт</span>
          <span className="text-yellow-400">{char.xp} / {char.xpToNextLevel} XP</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-3">
          <div
            className="bg-yellow-400 h-3 rounded-full transition-all duration-500"
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
                  className={`w-4 h-2 rounded-sm ${i < val ? 'bg-yellow-400' : 'bg-gray-700'}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
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