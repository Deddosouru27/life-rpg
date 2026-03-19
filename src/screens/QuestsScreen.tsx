import { useState } from 'react'
import type { Quest, QuestType, QuestDifficulty } from '../lib/types'
import { getQuests, saveQuests, getCharacter, saveCharacter } from '../lib/storage'
import { applyQuestReward, calcQuestRewards, incrementStreakIfFirstToday } from '../lib/gameLogic'
import { generateAIQuest } from '../lib/aiQuest'

interface Props {
  onLevelUp?: (level: number) => void
}

export default function QuestsScreen({ onLevelUp }: Props) {
  const [quests, setQuests] = useState<Quest[]>(getQuests())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'Daily' as QuestType,
    difficulty: 'Medium' as QuestDifficulty,
  })
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiInput, setAIInput] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState('')

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
    let char = getCharacter()

    // Streak: инкрементируем при первом Daily за сегодня
    if (quest.type === 'Daily') {
      const completedQuests = quests.filter(q => q.status === 'completed')
      char = incrementStreakIfFirstToday(char, completedQuests)
      saveCharacter(char)
    }

    const result = applyQuestReward(char, quest)
    saveCharacter(result.character)
    updateQuests(quests.map(q =>
      q.id === quest.id ? { ...q, status: 'completed', completedAt: Date.now() } : q
    ))
    if (result.leveledUp && onLevelUp) {
      onLevelUp(result.newLevel)
    }
  }

  const generateQuest = async () => {
    if (!aiInput.trim()) return
    setAILoading(true)
    setAIError('')
    try {
      const result = await generateAIQuest(aiInput.trim())
      const rewards = calcQuestRewards(result.difficulty)
      const newQuest: Quest = {
        id: Date.now().toString(),
        title: result.title,
        description: result.description,
        type: result.type,
        difficulty: result.difficulty,
        status: 'active',
        xpReward: rewards.xp,
        goldReward: rewards.gold,
        createdAt: Date.now(),
      }
      updateQuests([newQuest, ...quests])
      setAIInput('')
      setShowAIModal(false)
    } catch (e) {
      setAIError(e instanceof Error ? e.message : 'Ошибка генерации')
    } finally {
      setAILoading(false)
    }
  }

  const activeQuests = quests.filter(q => q.status === 'active')
  const completedQuests = quests.filter(q => q.status === 'completed')

  return (
    <div className="p-4 space-y-4" style={{ backgroundColor: '#0a0a0f', minHeight: '100%' }}>
      {/* Заголовок */}
      <div className="flex justify-between items-center pt-4">
        <h1 className="text-xl font-extrabold tracking-wider text-white">КВЕСТЫ</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAIModal(true); setShowForm(false) }}
            className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-lg font-bold text-sm tracking-wide transition-colors"
          >
            ✨ AI
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowAIModal(false) }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm tracking-wide transition-colors"
          >
            + Добавить
          </button>
        </div>
      </div>

      {/* AI Модалка */}
      {showAIModal && (
        <div className="rounded-xl p-4 space-y-3 border border-violet-500/30" style={{ backgroundColor: '#16161f' }}>
          <div className="flex justify-between items-center">
            <h2 className="text-violet-400 font-bold text-sm tracking-wider">✨ AI-ГЕНЕРАЦИЯ</h2>
            <button onClick={() => setShowAIModal(false)} className="text-gray-500 hover:text-white">✕</button>
          </div>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 resize-none border border-white/5 focus:outline-none focus:border-violet-500/50"
            style={{ backgroundColor: '#0a0a0f' }}
            placeholder="Опиши цель или задачу... (например: «хочу начать бегать»)"
            rows={3}
            value={aiInput}
            onChange={e => setAIInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) generateQuest() }}
          />
          {aiError && <p className="text-red-400 text-xs">{aiError}</p>}
          <button
            onClick={generateQuest}
            disabled={aiLoading || !aiInput.trim()}
            className="w-full bg-violet-600 disabled:opacity-40 hover:bg-violet-500 text-white py-2 rounded-lg font-bold text-sm tracking-wide transition-colors"
          >
            {aiLoading ? '⏳ Формирую квест...' : '✨ Сгенерировать'}
          </button>
        </div>
      )}

      {/* Форма добавления */}
      {showForm && (
        <div className="rounded-xl p-4 space-y-3 border border-white/5" style={{ backgroundColor: '#16161f' }}>
          <input
            className="w-full rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 border border-white/5 focus:outline-none focus:border-blue-500/50"
            style={{ backgroundColor: '#0a0a0f' }}
            placeholder="Название квеста"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="w-full rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 border border-white/5 focus:outline-none focus:border-blue-500/50"
            style={{ backgroundColor: '#0a0a0f' }}
            placeholder="Описание (необязательно)"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded-lg px-3 py-2 text-sm text-gray-100 border border-white/5"
              style={{ backgroundColor: '#0a0a0f' }}
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as QuestType })}
            >
              <option value="Daily">🔄 Daily</option>
              <option value="Side">Side Quest</option>
              <option value="Main">Main Quest</option>
              <option value="Boss">⚡ Boss</option>
            </select>
            <select
              className="rounded-lg px-3 py-2 text-sm text-gray-100 border border-white/5"
              style={{ backgroundColor: '#0a0a0f' }}
              value={form.difficulty}
              onChange={e => setForm({ ...form, difficulty: e.target.value as QuestDifficulty })}
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
              <option value="Legendary">Legendary</option>
            </select>
          </div>
          <div className="text-xs text-gray-600">
            Награда: {calcQuestRewards(form.difficulty).xp} XP · {calcQuestRewards(form.difficulty).gold} золота
          </div>
          <button
            onClick={addQuest}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-bold text-sm tracking-wide transition-colors"
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

      {activeQuests.length === 0 && !showForm && !showAIModal && (
        <div className="text-center py-16 text-gray-700">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-sm tracking-wide">НЕТ АКТИВНЫХ КВЕСТОВ</p>
        </div>
      )}

      {/* Выполненные */}
      {completedQuests.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-gray-600 text-xs font-bold tracking-widest uppercase pt-2">Выполнено</h2>
          {completedQuests.map(quest => (
            <QuestCard key={quest.id} quest={quest} />
          ))}
        </div>
      )}
    </div>
  )
}

const TYPE_STRIP: Record<QuestType, string> = {
  Daily: '#3b82f6',
  Side: '#10b981',
  Main: '#eab308',
  Boss: '#ef4444',
}

const TYPE_LABEL: Record<QuestType, string> = {
  Daily: '🔄 Daily',
  Side: 'Side Quest',
  Main: 'Main Quest',
  Boss: '⚡ Boss',
}

const TYPE_TEXT: Record<QuestType, string> = {
  Daily: 'text-blue-400',
  Side: 'text-emerald-400',
  Main: 'text-yellow-400',
  Boss: 'text-red-400',
}

const DIFF_TEXT: Record<QuestDifficulty, string> = {
  Easy: 'text-emerald-500',
  Medium: 'text-blue-400',
  Hard: 'text-orange-400',
  Legendary: 'text-red-400',
}

function QuestCard({ quest, onComplete }: { quest: Quest; onComplete?: (q: Quest) => void }) {
  const isBoss = quest.type === 'Boss' && quest.status === 'active'
  const isDone = quest.status === 'completed'

  return (
    <div
      className={`relative rounded-xl overflow-hidden ${isDone ? 'opacity-40' : ''} ${isBoss ? 'ring-1 ring-red-500/40' : ''}`}
      style={{ backgroundColor: '#111118' }}
    >
      {/* Цветная полоска слева */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: TYPE_STRIP[quest.type] }}
      />

      <div className="p-4 pl-5">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex gap-2 text-xs mb-1">
              <span className={`font-semibold ${TYPE_TEXT[quest.type]}`}>
                {TYPE_LABEL[quest.type]}
              </span>
              <span className={DIFF_TEXT[quest.difficulty]}>{quest.difficulty}</span>
            </div>
            <p className="font-bold text-gray-100 tracking-wide">{quest.title}</p>
            {quest.description && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{quest.description}</p>
            )}
          </div>

          {quest.status === 'active' && onComplete && (
            <button
              onClick={() => onComplete(quest)}
              className="ml-3 shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-colors"
            >
              ✓ Готово
            </button>
          )}
          {isDone && (
            <span className="ml-3 text-emerald-500 text-xs font-bold">✓</span>
          )}
        </div>

        <div className="text-xs text-gray-600 mt-2">
          +{quest.xpReward} XP · +{quest.goldReward} зол.
        </div>
      </div>
    </div>
  )
}
