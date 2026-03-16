import type { Character, Quest, Achievement, LogEntry } from './types'

const KEYS = {
  character: 'life-rpg:character',
  quests: 'life-rpg:quests',
  achievements: 'life-rpg:achievements',
  log: 'life-rpg:log',
}

export const DEFAULT_CHARACTER: Character = {
  name: 'Герой',
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  gold: 0,
  stats: { strength: 1, intellect: 1, endurance: 1, discipline: 1 },
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

export function getAchievements(): Achievement[] {
  const raw = localStorage.getItem(KEYS.achievements)
  return raw ? JSON.parse(raw) : []
}

export function saveAchievements(achievements: Achievement[]): void {
  localStorage.setItem(KEYS.achievements, JSON.stringify(achievements))
}

export function getLog(): LogEntry[] {
  const raw = localStorage.getItem(KEYS.log)
  return raw ? JSON.parse(raw) : []
}

export function addLogEntry(entry: Omit<LogEntry, 'id' | 'createdAt'>): void {
  const log = getLog()
  const newEntry: LogEntry = { ...entry, id: Date.now().toString(), createdAt: Date.now() }
  localStorage.setItem(KEYS.log, JSON.stringify([newEntry, ...log].slice(0, 100)))
}