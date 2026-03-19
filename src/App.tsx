import { useState, useEffect } from 'react'
import { getCharacter } from './lib/storage'
import { checkAndResetDailyQuests } from './lib/gameLogic'
import CharacterScreen from './screens/CharacterScreen'
import QuestsScreen from './screens/QuestsScreen'
import LogScreen from './screens/LogScreen'
import LevelUpScreen from './screens/LevelUpScreen'
import OnboardingScreen from './screens/OnboardingScreen'

type Screen = 'character' | 'quests' | 'log'

const NAV_ITEMS: { id: Screen; label: string; icon: string }[] = [
  { id: 'character', label: 'Герой', icon: '⚔️' },
  { id: 'quests',    label: 'Квесты', icon: '📜' },
  { id: 'log',       label: 'История', icon: '📖' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('character')
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [isFirstLaunch, setIsFirstLaunch] = useState(() => {
    const char = getCharacter()
    return char.name === 'Герой'
  })

  useEffect(() => {
    checkAndResetDailyQuests()
  }, [])

  if (isFirstLaunch) {
    return <OnboardingScreen onComplete={() => setIsFirstLaunch(false)} />
  }

  return (
    <div
      className="h-full text-gray-100 flex flex-col max-w-md mx-auto"
      style={{ backgroundColor: '#0a0a0f' }}
    >
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
      >
        {screen === 'character' && <CharacterScreen />}
        {screen === 'quests' && <QuestsScreen onLevelUp={setLevelUp} />}
        {screen === 'log' && <LogScreen />}
      </div>

      {/* Навигация */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex border-t"
        style={{
          backgroundColor: '#0d0d14',
          borderColor: 'rgba(255,255,255,0.05)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = screen === item.id
          return (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className="relative flex-1 flex flex-col items-center pt-3 pb-4 transition-colors"
            >
              {/* Индикатор активной вкладки */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-500"
                />
              )}
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span
                className={`text-xs font-bold tracking-wider transition-colors ${
                  isActive ? 'text-blue-400' : 'text-gray-600'
                }`}
              >
                {item.label.toUpperCase()}
              </span>
            </button>
          )
        })}
      </nav>

      {levelUp !== null && (
        <LevelUpScreen level={levelUp} onClose={() => setLevelUp(null)} />
      )}
    </div>
  )
}
