import type { Character, Quest } from './types'

export function calcXpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.4, level - 1))
}

export function applyQuestReward(character: Character, quest: Quest): { character: Character; leveledUp: boolean; newLevel: number } {
  const newXp = character.xp + quest.xpReward
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

  return {
    leveledUp,
    newLevel,
    character: {
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
    },
  }
}

function calcStatBoosts(quest: Quest): Character['stats'] {
  const boosts = { strength: 0, intellect: 0, endurance: 0, discipline: 0 }
  const d = quest.difficulty
  const bump = d === 'Easy' ? 0.1 : d === 'Medium' ? 0.2 : d === 'Hard' ? 0.3 : 0.5

  switch (quest.type) {
    case 'Daily':
      boosts.discipline += bump
      break
    case 'Side':
      boosts.intellect += bump
      break
    case 'Main':
      boosts.strength += bump
      boosts.discipline += bump
      break
    case 'Boss':
      boosts.strength += bump
      boosts.intellect += bump
      boosts.endurance += bump
      boosts.discipline += bump
      break
  }
  return boosts
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