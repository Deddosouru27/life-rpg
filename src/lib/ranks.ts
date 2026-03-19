export interface Rank {
  name: string
  minLevel: number
  maxLevel: number | null
  color: string        // Tailwind text color class
  barColor: string     // Tailwind bg color class (for bars)
  borderColor: string  // Tailwind border color class
  icon: string
}

export const RANKS: Rank[] = [
  {
    name: 'Новобранец',
    minLevel: 1,
    maxLevel: 4,
    color: 'text-gray-400',
    barColor: 'bg-gray-400',
    borderColor: 'border-gray-400',
    icon: '🪨',
  },
  {
    name: 'Искатель',
    minLevel: 5,
    maxLevel: 9,
    color: 'text-green-400',
    barColor: 'bg-green-400',
    borderColor: 'border-green-400',
    icon: '🌿',
  },
  {
    name: 'Воин',
    minLevel: 10,
    maxLevel: 19,
    color: 'text-blue-400',
    barColor: 'bg-blue-400',
    borderColor: 'border-blue-400',
    icon: '⚔️',
  },
  {
    name: 'Ветеран',
    minLevel: 20,
    maxLevel: 29,
    color: 'text-purple-400',
    barColor: 'bg-purple-400',
    borderColor: 'border-purple-400',
    icon: '🛡️',
  },
  {
    name: 'Элита',
    minLevel: 30,
    maxLevel: 49,
    color: 'text-orange-400',
    barColor: 'bg-orange-400',
    borderColor: 'border-orange-400',
    icon: '🔥',
  },
  {
    name: 'Легенда',
    minLevel: 50,
    maxLevel: null,
    color: 'text-yellow-400',
    barColor: 'bg-yellow-400',
    borderColor: 'border-yellow-400',
    icon: '👑',
  },
]

export function getRank(level: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (level >= RANKS[i].minLevel) return RANKS[i]
  }
  return RANKS[0]
}
