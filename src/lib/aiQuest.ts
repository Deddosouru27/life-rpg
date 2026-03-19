import Anthropic from '@anthropic-ai/sdk'
import type { QuestType, QuestDifficulty } from './types'

export interface AIQuestResult {
  title: string
  description: string
  type: QuestType
  difficulty: QuestDifficulty
}

const SYSTEM_PROMPT =
  "Ты — игровой мастер RPG. Пользователь описывает реальную задачу или цель, ты превращаешь её в квест. " +
  "Отвечай ТОЛЬКО валидным JSON без markdown и пояснений: " +
  "{\"title\": string, \"description\": string, \"type\": \"Daily\"|\"Side\"|\"Main\"|\"Boss\", \"difficulty\": \"Easy\"|\"Medium\"|\"Hard\"|\"Legendary\"}. " +
  "Daily — повседневные привычки, Side — разовые задачи, Main — важные цели, Boss — большие вызовы. " +
  "Easy — простые действия, Legendary — огромные достижения."

export async function generateAIQuest(userGoal: string): Promise<AIQuestResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('API ключ не настроен. Добавь VITE_ANTHROPIC_API_KEY в файл .env')
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userGoal }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const parsed = JSON.parse(text) as AIQuestResult

  const validTypes: QuestType[] = ['Daily', 'Side', 'Main', 'Boss']
  const validDiffs: QuestDifficulty[] = ['Easy', 'Medium', 'Hard', 'Legendary']
  if (!validTypes.includes(parsed.type)) parsed.type = 'Side'
  if (!validDiffs.includes(parsed.difficulty)) parsed.difficulty = 'Medium'

  return parsed
}
