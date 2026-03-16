import type { Character, Quest } from './types'

const KEYS = {
  character: 'life-rpg:character',
  quests: 'life-rpg:quests',
}

export const DEFAULT_CHARACTER: Character = {
  name: 'Герой',
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  gold: 0,
  stats: {
    strength: 1,
    intellect: 1,
    endurance: 1,
    discipline: 1,
  },
}

export function getCharacter(): Character {
  const raw = localStorage.getItem(KEYS.character)
  return raw ? JSON.parse(raw) : DEFAULT_CHARACTER
}

export function saveCharacter(character: Character): void {
  localStorage.setItem(KEYS.character, JSON.stringify(character))
}

export function getQuests(): Quest[] {
  const raw = localStorage.getItem(KEYS.quests)
  return raw ? JSON.parse(raw) : []
}

export function saveQuests(quests: Quest[]): void {
  localStorage.setItem(KEYS.quests, JSON.stringify(quests))
}