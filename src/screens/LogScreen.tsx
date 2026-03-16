import { getLog, getAchievements } from '../lib/storage'
import type { LogEntry } from '../lib/types'
import { useState } from 'react'

export default function LogScreen() {
  const [tab, setTab] = useState<'log' | 'achievements'>('log')
  const log = getLog()
  const achievements = getAchievements()

  const typeIcon: Record<LogEntry['type'], string> = {
    quest: '📜',
    levelup: '⭐',
    achievement: '🏆',
    stat: '💪',
  }

  const typeColor: Record<LogEntry['type'], string> = {
    quest: 'text-gray-300',
    levelup: 'text-yellow-400',
    achievement: 'text-orange-400',
    stat: 'text-blue-400',
  }

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts
    const m = Math.floor(diff / 60000)
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(diff / 86400000)
    if (m < 1) return 'только что'
    if (m < 60) return `${m} мин назад`
    if (h < 24) return `${h} ч назад`
    return `${d} д назад`
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-yellow-400 pt-4">📖 История</h1>

      {/* Табы */}
      <div className="flex bg-gray-900 rounded-xl p-1">
        <button
          onClick={() => setTab('log')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'log' ? 'bg-gray-700 text-yellow-400' : 'text-gray-500'}`}
        >
          Журнал
        </button>
        <button
          onClick={() => setTab('achievements')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'achievements' ? 'bg-gray-700 text-yellow-400' : 'text-gray-500'}`}
        >
          Достижения
        </button>
      </div>

      {/* Журнал */}
      {tab === 'log' && (
        <div className="space-y-2">
          {log.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              <div className="text-4xl mb-2">📭</div>
              <p>Журнал пуст — выполни первый квест</p>
            </div>
          )}
          {log.map(entry => (
            <div key={entry.id} className="bg-gray-900 rounded-xl p-3 flex gap-3 items-start">
              <span className="text-lg">{typeIcon[entry.type]}</span>
              <div className="flex-1">
                <p className={`text-sm ${typeColor[entry.type]}`}>{entry.message}</p>
                <p className="text-xs text-gray-600 mt-1">{timeAgo(entry.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Достижения */}
      {tab === 'achievements' && (
        <div className="grid grid-cols-2 gap-3">
          {achievements.map(a => (
            <div
              key={a.id}
              className={`bg-gray-900 rounded-xl p-4 space-y-2 ${!a.unlockedAt ? 'opacity-40' : ''}`}
            >
              <div className="text-3xl">{a.icon}</div>
              <div>
                <p className={`font-semibold text-sm ${a.unlockedAt ? 'text-yellow-400' : 'text-gray-400'}`}>{a.title}</p>
                <p className="text-xs text-gray-500">{a.description}</p>
              </div>
              {a.unlockedAt && (
                <p className="text-xs text-green-500">✓ Получено</p>
              )}
            </div>
          ))}
          {achievements.length === 0 && (
            <div className="col-span-2 text-center py-12 text-gray-600">
              <div className="text-4xl mb-2">🏆</div>
              <p>Выполняй квесты чтобы открыть достижения</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}