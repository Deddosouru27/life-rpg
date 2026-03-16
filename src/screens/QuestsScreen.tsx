import { useState } from 'react'
import type { Quest, QuestType, QuestDifficulty } from '../lib/types'
import { getQuests, saveQuests, getCharacter, saveCharacter } from '../lib/storage'
import { applyQuestReward, calcQuestRewards } from '../lib/gameLogic'

export default function QuestsScreen() {
  const [quests, setQuests] = useState<Quest[]>(getQuests())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'Daily' as QuestType,
    difficulty: 'Medium' as QuestDifficulty,
  })

  const updateQuests = (updated: Quest[]) => {
    saveQuests(updated)
    setQuests(updated)
    window.dispatchEvent(new Event('storage-update'))
  }

  const addQuest = () => {
    if (!form.title.trim()) return
    const rewards = calcQuestRewards(form.difficulty)
    const newQuest: Quest = {
      id: Date.now().toString(),
      title: form.title,
      description: form.description,
      type: form.type,
      difficulty: form.difficulty,
      status: 'active',
      xpReward: rewards.xp,
      goldReward: rewards.gold,
      createdAt: Date.now(),
    }
    updateQuests([newQuest, ...quests])
    setForm({ title: '', description: '', type: 'Daily', difficulty: 'Medium' })
    setShowForm(false)
  }

  const completeQuest = (quest: Quest) => {
    const char = getCharacter()
    const updated = applyQuestReward(char, quest)
    saveCharacter(updated)
    updateQuests(quests.map(q => q.id === quest.id ? { ...q, status: 'completed', completedAt: Date.now() } : q))
  }

  const activeQuests = quests.filter(q => q.status === 'active')
  const completedQuests = quests.filter(q => q.status === 'completed')

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center pt-4">
        <h1 className="text-xl font-bold text-yellow-400">📜 Квесты</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-yellow-400 text-gray-950 px-4 py-2 rounded-lg font-semibold text-sm"
        >
          + Добавить
        </button>
      </div>

      {/* Форма добавления */}
      {showForm && (
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <input
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
            placeholder="Название квеста"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
            placeholder="Описание (необязательно)"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as QuestType })}
            >
              <option value="Daily">Daily</option>
              <option value="Side">Side Quest</option>
              <option value="Main">Main Quest</option>
              <option value="Boss">Boss</option>
            </select>
            <select
              className="bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100"
              value={form.difficulty}
              onChange={e => setForm({ ...form, difficulty: e.target.value as QuestDifficulty })}
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
              <option value="Legendary">Legendary</option>
            </select>
          </div>
          <div className="text-xs text-gray-500">
            Награда: {calcQuestRewards(form.difficulty).xp} XP · {calcQuestRewards(form.difficulty).gold} золота
          </div>
          <button
            onClick={addQuest}
            className="w-full bg-yellow-400 text-gray-950 py-2 rounded-lg font-semibold text-sm"
          >
            Создать квест
          </button>
        </div>
      )}

      {/* Активные квесты */}
      {activeQuests.length > 0 && (
        <div className="space-y-2">
          {activeQuests.map(quest => (
            <QuestCard key={quest.id} quest={quest} onComplete={completeQuest} />
          ))}
        </div>
      )}

      {activeQuests.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-600">
          <div className="text-4xl mb-2">📭</div>
          <p>Нет активных квестов</p>
        </div>
      )}

      {/* Выполненные */}
      {completedQuests.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-gray-500 text-sm font-medium">Выполнено</h2>
          {completedQuests.map(quest => (
            <QuestCard key={quest.id} quest={quest} />
          ))}
        </div>
      )}
    </div>
  )
}

function QuestCard({ quest, onComplete }: { quest: Quest; onComplete?: (q: Quest) => void }) {
  const typeColors: Record<QuestType, string> = {
    Daily: 'text-blue-400',
    Side: 'text-green-400',
    Main: 'text-yellow-400',
    Boss: 'text-red-400',
  }
  const diffColors: Record<QuestDifficulty, string> = {
    Easy: 'text-green-400',
    Medium: 'text-yellow-400',
    Hard: 'text-orange-400',
    Legendary: 'text-red-400',
  }

  return (
    <div className={`bg-gray-900 rounded-xl p-4 space-y-2 ${quest.status === 'completed' ? 'opacity-50' : ''}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex gap-2 text-xs mb-1">
            <span className={typeColors[quest.type]}>{quest.type}</span>
            <span className={diffColors[quest.difficulty]}>{quest.difficulty}</span>
          </div>
          <p className="font-medium text-gray-100">{quest.title}</p>
          {quest.description && <p className="text-xs text-gray-500 mt-1">{quest.description}</p>}
        </div>
        {quest.status === 'active' && onComplete && (
          <button
            onClick={() => onComplete(quest)}
            className="ml-3 bg-yellow-400 text-gray-950 px-3 py-1 rounded-lg text-xs font-bold"
          >
            ✓ Готово
          </button>
        )}
        {quest.status === 'completed' && (
          <span className="ml-3 text-green-400 text-xs">✓ Выполнено</span>
        )}
      </div>
      <div className="text-xs text-gray-600">
        +{quest.xpReward} XP · +{quest.goldReward} золота
      </div>
    </div>
  )
}