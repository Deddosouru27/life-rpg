/**
 * ИЗОЛИРОВАННЫЙ модуль синхронизации с Supabase.
 *
 * Правила:
 *  - Выключен по умолчанию, включается флагом `settings.syncEnabled`.
 *  - IndexedDB остаётся единственным источником правды. Синк только зеркалит.
 *  - Разрешение конфликтов — last-write-wins по `updated_at`.
 *  - Ни один другой модуль приложения не импортирует Supabase.
 *
 * Ожидаемая схема в Supabase (одна строка на сейв, RLS по user_id):
 *   life_rpg_state(user_id uuid, kind text, payload jsonb, updated_at bigint)
 * Храним весь сейв одной строкой — простейшая схема, которой достаточно для
 * одного игрока и которая не требует миграций при изменении полей.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from './database';
import { buildSaveFile, restoreSaveFile } from './saveFile';
import type { SaveFile, Settings } from '@/game/types';

const TABLE = 'life_rpg_state';
const ROW_KIND = 'save';

export interface SyncResult {
  ok: boolean;
  /** Какое направление победило по last-write-wins. */
  direction: 'push' | 'pull' | 'noop';
  message: string;
  syncedAt: number | null;
}

let client: SupabaseClient | null = null;
let clientKey = '';

/**
 * Клиент грузится динамически: пока синхронизация выключена, код Supabase
 * вообще не попадает в загруженный бандл. Офлайн-игра не платит за облако.
 */
async function getClient(settings: Settings): Promise<SupabaseClient | null> {
  if (!settings.syncEnabled) return null;
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) return null;

  const key = `${settings.supabaseUrl}|${settings.supabaseAnonKey}`;
  if (client && clientKey === key) return client;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    clientKey = key;
    return client;
  } catch {
    return null;
  }
}

/** Самая свежая отметка времени во всём локальном сейве. */
export async function localUpdatedAt(): Promise<number> {
  const [character, habits, logs, quests, rewards, days] = await Promise.all([
    db.characters.get('me'),
    db.habits.orderBy('updatedAt').last(),
    db.habitLogs.orderBy('updatedAt').last(),
    db.quests.orderBy('updatedAt').last(),
    db.realRewards.orderBy('updatedAt').last(),
    db.dayRecords.orderBy('updatedAt').last(),
  ]);
  return Math.max(
    character?.updatedAt ?? 0,
    habits?.updatedAt ?? 0,
    logs?.updatedAt ?? 0,
    quests?.updatedAt ?? 0,
    rewards?.updatedAt ?? 0,
    days?.updatedAt ?? 0,
  );
}

interface RemoteRow {
  user_id: string;
  kind: string;
  payload: SaveFile;
  updated_at: number;
}

async function fetchRemote(supabase: SupabaseClient, userId: string): Promise<RemoteRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id, kind, payload, updated_at')
    .eq('user_id', userId)
    .eq('kind', ROW_KIND)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RemoteRow | null) ?? null;
}

async function pushRemote(
  supabase: SupabaseClient,
  userId: string,
  save: SaveFile,
  updatedAt: number,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: userId, kind: ROW_KIND, payload: save, updated_at: updatedAt },
      { onConflict: 'user_id,kind' },
    );
  if (error) throw new Error(error.message);
}

/**
 * Одна синхронизация. Сравнивает локальную и удалённую отметку времени
 * и целиком перезаписывает более старую сторону.
 */
export async function syncOnce(settings: Settings): Promise<SyncResult> {
  if (!settings.syncEnabled) {
    return { ok: false, direction: 'noop', message: 'Синхронизация выключена.', syncedAt: null };
  }

  const supabase = await getClient(settings);
  if (!supabase) {
    return {
      ok: false,
      direction: 'noop',
      message: 'Не заданы адрес проекта Supabase и anon-ключ.',
      syncedAt: null,
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, direction: 'noop', message: 'Нет сети. Игра работает офлайн.', syncedAt: null };
  }

  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      return {
        ok: false,
        direction: 'noop',
        message: 'Нужно войти в Supabase, чтобы синхронизировать сейв.',
        syncedAt: null,
      };
    }

    const local = await localUpdatedAt();
    const remote = await fetchRemote(supabase, userId);
    const now = Date.now();

    if (!remote) {
      await pushRemote(supabase, userId, await buildSaveFile(), local || now);
      return { ok: true, direction: 'push', message: 'Сейв отправлен в облако.', syncedAt: now };
    }

    // Last-write-wins по updated_at.
    if (remote.updated_at > local) {
      await restoreSaveFile(remote.payload);
      return { ok: true, direction: 'pull', message: 'Загружен более свежий сейв из облака.', syncedAt: now };
    }

    if (local > remote.updated_at) {
      await pushRemote(supabase, userId, await buildSaveFile(), local);
      return { ok: true, direction: 'push', message: 'Локальный сейв отправлен в облако.', syncedAt: now };
    }

    return { ok: true, direction: 'noop', message: 'Всё уже синхронизировано.', syncedAt: now };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Неизвестная ошибка синхронизации.';
    return { ok: false, direction: 'noop', message, syncedAt: null };
  }
}

/** Вход по ссылке на почту — единственный поддерживаемый способ аутентификации. */
export async function signInWithEmail(settings: Settings, email: string): Promise<string> {
  const supabase = await getClient(settings);
  if (!supabase) return 'Сначала заполните адрес проекта и anon-ключ.';
  const { error } = await supabase.auth.signInWithOtp({ email });
  return error ? error.message : 'Ссылка для входа отправлена на почту.';
}

export async function signOut(settings: Settings): Promise<void> {
  const supabase = await getClient(settings);
  if (supabase) await supabase.auth.signOut();
}

export async function currentUserEmail(settings: Settings): Promise<string | null> {
  const supabase = await getClient(settings);
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** SQL для создания таблицы — показывается в настройках, чтобы не искать в документации. */
export const SUPABASE_SCHEMA_SQL = `create table if not exists life_rpg_state (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  kind       text    not null,
  payload    jsonb   not null,
  updated_at bigint  not null,
  primary key (user_id, kind)
);

alter table life_rpg_state enable row level security;

create policy "own rows" on life_rpg_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;
