export interface Rank {
  name: string
  minLevel: number
  maxLevel: number | null
  color: string
  barColor: string
  borderColor: string
  stripColor: string
  icon: string
}

export const RANKS: Rank[] = [
  {
    name: 'Новобранец',
    minLevel: 1,
    maxLevel: 4,
    color: 'text-blue-400',
    barColor: 'bg-blue-500',
    borderColor: 'border-blue-500',
    stripColor: '#3b82f6',
    icon: '◆',
  },
  {
    name: 'Искатель',
    minLevel: 5,
    maxLevel: 9,
    color: 'text-emerald-400',
    barColor: 'bg-emerald-500',
    borderColor: 'border-emerald-500',
    stripColor: '#10b981',
    icon: '◆',
  },
  {
    name: 'Воин',
    minLevel: 10,
    maxLevel: 19,
    color: 'text-violet-400',
    barColor: 'bg-violet-500',
    borderColor: 'border-violet-500',
    stripColor: '#8b5cf6',
    icon: '◆',
  },
  {
    name: 'Ветеран',
    minLevel: 20,
    maxLevel: 29,
    color: 'text-purple-400',
    barColor: 'bg-purple-500',
    borderColor: 'border-purple-500',
    stripColor: '#a855f7',
    icon: '◆',
  },
  {
    name: 'Элита',
    minLevel: 30,
    maxLevel: 49,
    color: 'text-orange-400',
    barColor: 'bg-orange-500',
    borderColor: 'border-orange-500',
    stripColor: '#f97316',
    icon: '◆',
  },
  {
    name: 'Легенда',
    minLevel: 50,
    maxLevel: null,
    color: 'text-yellow-400',
    barColor: 'bg-yellow-400',
    borderColor: 'border-yellow-400',
    stripColor: '#facc15',
    icon: '◆',
  },
]

export function getRank(level: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (level >= RANKS[i].minLevel) return RANKS[i]
  }
  return RANKS[0]
}
