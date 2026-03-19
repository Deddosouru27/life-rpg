import type { Character, Quest, Achievement } from './types'
import { getAchievements, saveAchievements, addLogEntry, getCharacter, saveCharacter, getQuests, saveQuests } from './storage'

export function calcXpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.4, level - 1))
}

export function applyQuestReward(character: Character, quest: Quest): {
  character: Character
  leveledUp: boolean
  newLevel: number
  newAchievements: Achievement[]
} {
  const multiplier = quest.type === 'Daily' ? streakXpMultiplier(character.currentStreak) : 1
  const bonusXp = Math.round(quest.xpReward * multiplier)
  const newXp = character.xp + bonusXp
  let newLevel = character.level
  let remainingXp = newXp
  let xpToNext = character.xpToNextLevel
  let leveledUp = false

  while (remainingXp >= xpToNext) {
    remainingXp -= xpToNext
    newLevel += 1
    xpToNext = calcXpToNextLevel(newLevel)
    leveledUp = true
  }

  const statBoosts = calcStatBoosts(quest)
  const newChar: Character = {
    ...character,
    xp: remainingXp,
    level: newLevel,
    xpToNextLevel: xpToNext,
    gold: character.gold + quest.goldReward,
    stats: {
      strength: Math.min(10, character.stats.strength + statBoosts.strength),
      intellect: Math.min(10, character.stats.intellect + statBoosts.intellect),
      endurance: Math.min(10, character.stats.endurance + statBoosts.endurance),
      discipline: Math.min(10, character.stats.discipline + statBoosts.discipline),
    }
  }

  // Лог квеста
  const xpMsg = multiplier > 1
    ? `+${bonusXp} XP (🔥×${multiplier.toFixed(1)})`
    : `+${bonusXp} XP`
  addLogEntry({ message: `Квест выполнен: «${quest.title}» ${xpMsg}, +${quest.goldReward} золота`, type: 'quest' })

  if (leveledUp) {
    addLogEntry({ message: `Достигнут уровень ${newLevel}!`, type: 'levelup' })
  }

  // Проверяем достижения
  const newAchievements = checkAchievements(character, newChar, leveledUp, newLevel)

  return { character: newChar, leveledUp, newLevel, newAchievements }
}

function calcStatBoosts(quest: Quest): Character['stats'] {
  const boosts = { strength: 0, intellect: 0, endurance: 0, discipline: 0 }
  const d = quest.difficulty
  const bump = d === 'Easy' ? 0.1 : d === 'Medium' ? 0.2 : d === 'Hard' ? 0.3 : 0.5

  switch (quest.type) {
    case 'Daily': boosts.discipline += bump; break
    case 'Side': boosts.intellect += bump; break
    case 'Main': boosts.strength += bump; boosts.discipline += bump; break
    case 'Boss':
      boosts.strength += bump; boosts.intellect += bump
      boosts.endurance += bump; boosts.discipline += bump
      break
  }
  return boosts
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'lvl5',   title: 'Путник',       description: 'Достигни 5 уровня',       icon: '🌟' },
  { id: 'lvl10',  title: 'Воин',         description: 'Достигни 10 уровня',      icon: '⚔️' },
  { id: 'lvl25',  title: 'Ветеран',      description: 'Достигни 25 уровня',      icon: '🏆' },
  { id: 'lvl50',  title: 'Легенда',      description: 'Достигни 50 уровня',      icon: '👑' },
  { id: 'str5',   title: 'Силач',        description: 'Прокачай Силу до 5',      icon: '💪' },
  { id: 'int5',   title: 'Мудрец',       description: 'Прокачай Интеллект до 5', icon: '📚' },
  { id: 'end5',   title: 'Марафонец',    description: 'Прокачай Выносливость до 5', icon: '🏃' },
  { id: 'dis5',   title: 'Монах',        description: 'Прокачай Дисциплину до 5', icon: '🧘' },
  { id: 'str10',  title: 'Берсерк',      description: 'Прокачай Силу до максимума', icon: '🔥' },
  { id: 'int10',  title: 'Архимаг',      description: 'Прокачай Интеллект до максимума', icon: '✨' },
  { id: 'end10',  title: 'Железный',     description: 'Прокачай Выносливость до максимума', icon: '🛡️' },
  { id: 'dis10',  title: 'Мастер',       description: 'Прокачай Дисциплину до максимума', icon: '🎯' },
]

function checkAchievements(oldChar: Character, newChar: Character, leveledUp: boolean, newLevel: number): Achievement[] {
  const existing = getAchievements()
  const unlockedIds = new Set(existing.filter(a => a.unlockedAt).map(a => a.id))
  const newlyUnlocked: Achievement[] = []

  const check = (id: string, condition: boolean) => {
    if (condition && !unlockedIds.has(id)) {
      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === id)
      if (achievement) {
        newlyUnlocked.push({ ...achievement, unlockedAt: Date.now() })
        addLogEntry({ message: `Достижение разблокировано: ${achievement.icon} «${achievement.title}»`, type: 'achievement' })
      }
    }
  }

  check('lvl5',  leveledUp && newLevel >= 5)
  check('lvl10', leveledUp && newLevel >= 10)
  check('lvl25', leveledUp && newLevel >= 25)
  check('lvl50', leveledUp && newLevel >= 50)
  check('str5',  newChar.stats.strength >= 5  && oldChar.stats.strength < 5)
  check('int5',  newChar.stats.intellect >= 5  && oldChar.stats.intellect < 5)
  check('end5',  newChar.stats.endurance >= 5  && oldChar.stats.endurance < 5)
  check('dis5',  newChar.stats.discipline >= 5 && oldChar.stats.discipline < 5)
  check('str10', newChar.stats.strength >= 10  && oldChar.stats.strength < 10)
  check('int10', newChar.stats.intellect >= 10  && oldChar.stats.intellect < 10)
  check('end10', newChar.stats.endurance >= 10  && oldChar.stats.endurance < 10)
  check('dis10', newChar.stats.discipline >= 10 && oldChar.stats.discipline < 10)

  if (newlyUnlocked.length > 0) {
    const merged = [...existing.filter(a => !newlyUnlocked.find(n => n.id === a.id)), ...newlyUnlocked]
    const allWithLocked = ALL_ACHIEVEMENTS.map(a => merged.find(m => m.id === a.id) ?? a)
    saveAchievements(allWithLocked)
  } else if (existing.length === 0) {
    saveAchievements(ALL_ACHIEVEMENTS)
  }

  return newlyUnlocked
}

export function calcQuestRewards(difficulty: Quest['difficulty']): { xp: number; gold: number } {
  const table = {
    Easy:      { xp: 20,  gold: 10  },
    Medium:    { xp: 50,  gold: 25  },
    Hard:      { xp: 100, gold: 50  },
    Legendary: { xp: 250, gold: 150 },
  }
  return table[difficulty]
}

function todayMidnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Вызывается при старте приложения. Сбрасывает Daily квесты, проверяет пропуск дня. */
export function checkAndResetDailyQuests(): void {
  const today = todayMidnight()
  const char = getCharacter()
  if (char.lastDailyReset >= today) return // уже сбрасывали сегодня

  const quests = getQuests()
  const lastReset = char.lastDailyReset
  const yesterday = today - 86_400_000

  // Был ли выполнен хотя бы один Daily квест со времени последнего сброса
  const completedSinceLastReset = quests.some(
    q => q.type === 'Daily' && q.status === 'completed' && q.completedAt !== undefined
      && q.completedAt >= lastReset
  )

  // Пропущен ли целый день (lastReset старше вчерашнего полуночи)
  const missedDay = lastReset > 0 && lastReset < yesterday

  let newStreak = char.currentStreak
  // Streak инкрементируется в момент выполнения квеста (в QuestsScreen).
  // Здесь только обнуляем если пропущен день или не было выполнений вчера.
  if (lastReset > 0 && (missedDay || !completedSinceLastReset)) {
    newStreak = 0
    addLogEntry({ message: '💤 Daily квесты сброшены. Streak обнулён.', type: 'stat' })
  } else {
    addLogEntry({ message: '🔄 Daily квесты обновлены!', type: 'stat' })
  }

  // Сбрасываем выполненные Daily квесты обратно в active
  const resetQuests = quests.map(q =>
    q.type === 'Daily' && q.status === 'completed'
      ? { ...q, status: 'active' as const, completedAt: undefined }
      : q
  )

  saveQuests(resetQuests)
  saveCharacter({ ...char, lastDailyReset: today, currentStreak: newStreak })
  window.dispatchEvent(new Event('storage-update'))
}

/** Вызывается при выполнении первого Daily квеста за день — инкрементирует streak. */
export function incrementStreakIfFirstToday(char: Character, completedQuests: Quest[]): Character {
  const today = todayMidnight()
  const alreadyCompletedToday = completedQuests.some(
    q => q.type === 'Daily' && q.completedAt !== undefined && q.completedAt >= today
  )
  if (alreadyCompletedToday) return char // уже инкрементировали сегодня
  const newStreak = char.currentStreak + 1
  addLogEntry({ message: `🔥 Streak: ${newStreak} ${newStreak === 1 ? 'день' : 'дней'} подряд!`, type: 'stat' })
  return { ...char, currentStreak: newStreak }
}

/** Бонусный множитель XP за streak (только для Daily квестов). */
export function streakXpMultiplier(streak: number): number {
  return 1 + Math.min(Math.floor(streak / 5) * 0.1, 0.5)
}