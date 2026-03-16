import type { Character, Quest } from './types'

export function calcXpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.4, level - 1))
}

export function applyQuestReward(character: Character, quest: Quest): Character {
  const newXp = character.xp + quest.xpReward
  let newLevel = character.level
  let remainingXp = newXp
  let xpToNext = character.xpToNextLevel

  while (remainingXp >= xpToNext) {
    remainingXp -= xpToNext
    newLevel += 1
    xpToNext = calcXpToNextLevel(newLevel)
  }

  return {
    ...character,
    xp: remainingXp,
    level: newLevel,
    xpToNextLevel: xpToNext,
    gold: character.gold + quest.goldReward,
  }
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