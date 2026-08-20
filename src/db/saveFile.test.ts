import { describe, expect, it } from 'vitest';
import { parseSaveFile, SAVE_FORMAT, SAVE_VERSION } from './saveFile';
import { makeCharacter, makeHabit, makeSettings, T0 } from '@/game/testFixtures';

function validSave(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    exportedAt: T0,
    character: makeCharacter({ level: 12, gold: 3400 }),
    habits: [makeHabit()],
    habitLogs: [],
    quests: [],
    realRewards: [],
    dayRecords: [],
    settings: makeSettings(),
    ...overrides,
  });
}

describe('разбор сейва', () => {
  it('принимает корректный файл', () => {
    const result = parseSaveFile(validSave());
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.save?.character.level).toBe(12);
    expect(result.save?.habits).toHaveLength(1);
  });

  it('отвергает не-JSON', () => {
    const result = parseSaveFile('это не json {{{');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('JSON');
  });

  it('отвергает чужой формат', () => {
    const result = parseSaveFile(JSON.stringify({ format: 'habitica-export', version: 1 }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('не сейв Life RPG');
  });

  it('отвергает версию из будущего', () => {
    const result = parseSaveFile(validSave({ version: SAVE_VERSION + 5 }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('новее');
  });

  it('отвергает сейв без персонажа', () => {
    const result = parseSaveFile(validSave({ character: null }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('персонажа');
  });

  it('отвергает повреждённого персонажа', () => {
    const result = parseSaveFile(validSave({ character: { id: 'me', level: 'много' } }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('повреждены');
  });

  it('называет повреждённый раздел', () => {
    const result = parseSaveFile(validSave({ quests: 'не массив' }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('quests');
  });

  it('отвергает сейв без настроек', () => {
    const result = parseSaveFile(validSave({ settings: [] }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('настройки');
  });

  it('битый файл не возвращает объект сейва — нечего записывать в базу', () => {
    for (const bad of ['{}', 'null', '[]', '"строка"', validSave({ habits: 42 })]) {
      expect(parseSaveFile(bad).save).toBeNull();
    }
  });

  it('переживает полный круг: сериализация → разбор', () => {
    const parsed = parseSaveFile(validSave());
    const again = parseSaveFile(JSON.stringify(parsed.save));
    expect(again.ok).toBe(true);
    expect(again.save?.character.gold).toBe(3400);
  });
});
