export type QuestType = 'Daily' | 'Side' | 'Main' | 'Boss'
export type QuestDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Legendary'
export type QuestStatus = 'active' | 'completed' | 'failed'

export interface Quest {
  id: string
  title: string
  description: string
  type: QuestType
  difficulty: QuestDifficulty
  status: QuestStatus
  xpReward: number
  goldReward: number
  createdAt: number
  completedAt?: number
}

export interface Character {
  name: string
  level: number
  xp: number
  xpToNextLevel: number
  gold: number
  stats: {
    strength: number
    intellect: number
    endurance: number
    discipline: number
  }
}