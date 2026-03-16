import { useState } from 'react'
import CharacterScreen from './screens/CharacterScreen'
import QuestsScreen from './screens/QuestsScreen'

type Screen = 'character' | 'quests'

export default function App() {
  const [screen, setScreen] = useState<Screen>('character')

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col max-w-md mx-auto">
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
        {screen === 'character' && <CharacterScreen />}
        {screen === 'quests' && <QuestsScreen />}
      </div>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-gray-900 border-t border-gray-800 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          onClick={() => setScreen('character')}
          className={`flex-1 py-4 text-sm font-medium transition-colors ${
            screen === 'character' ? 'text-yellow-400' : 'text-gray-500'
          }`}
        >
          ⚔️ Персонаж
        </button>
        <button
          onClick={() => setScreen('quests')}
          className={`flex-1 py-4 text-sm font-medium transition-colors ${
            screen === 'quests' ? 'text-yellow-400' : 'text-gray-500'
          }`}
        >
          📜 Квесты
        </button>
      </nav>
    </div>
  )
}