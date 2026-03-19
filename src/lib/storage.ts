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
  lastDailyReset: 0,
  currentStreak: 0,
}

export function getCharacter(): Character {
  const raw = localStorage.getItem(KEYS.character)
  if (!raw) return DEFAULT_CHARACTER
  const parsed = JSON.parse(raw) as Character
  // миграция: заполняем отсутствующие поля для существующих пользователей
  return {
    ...DEFAULT_CHARACTER,
    ...parsed,
  }
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