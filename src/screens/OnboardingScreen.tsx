import { useState } from 'react'
import { saveCharacter, DEFAULT_CHARACTER } from '../lib/storage'

interface Props {
  onComplete: () => void
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [name, setName] = useState('')

  const handleStart = () => {
    if (!name.trim()) return
    saveCharacter({ ...DEFAULT_CHARACTER, name: name.trim() })
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 px-8">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <div className="text-7xl">⚔️</div>
          <h1 className="text-3xl font-bold text-yellow-400">Life RPG</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Твоя жизнь — это игра.<br />Каждое действие прокачивает персонажа.
          </p>
        </div>

        <div className="space-y-4">
          <div className="text-left space-y-2">
            <label className="text-gray-400 text-sm">Имя героя</label>
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 text-lg placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition-colors"
              placeholder="Введи своё имя"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              autoFocus
              maxLength={20}
            />
          </div>

          <button
            onClick={handleStart}
            disabled={!name.trim()}
            className="w-full py-4 rounded-xl font-bold text-lg transition-all"
            style={{
              background: name.trim() ? '#facc15' : '#374151',
              color: name.trim() ? '#0a0a0f' : '#6b7280',
            }}
          >
            Начать игру
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
          <div className="bg-gray-900 rounded-lg p-3">⚔️ Выполняй квесты</div>
          <div className="bg-gray-900 rounded-lg p-3">📈 Получай уровни</div>
          <div className="bg-gray-900 rounded-lg p-3">💪 Качай статы</div>
          <div className="bg-gray-900 rounded-lg p-3">💰 Зарабатывай золото</div>
        </div>
      </div>
    </div>
  )
}