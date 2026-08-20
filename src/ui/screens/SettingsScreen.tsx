/** Свиток: звук, сутки, заморозки, экспорт и импорт сейва, синхронизация. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadSave, downloadTelemetry, importSaveFromFile } from '@/db/saveFile';
import { summarizeTelemetry } from '@/game';
import {
  currentUserEmail,
  signInWithEmail,
  signOut,
  SUPABASE_SCHEMA_SQL,
  syncOnce,
} from '@/db/syncEngine';
import { useGame } from '@/state/useGame';
import { Button, Card, ConfirmRow, Field, ScreenTitle, SectionLabel, StatRow } from '../primitives';

export function SettingsScreen(): JSX.Element {
  const { settings, saveSettings, reload, character, dayRecords, habits, telemetry } = useGame();
  const tel = useMemo(() => summarizeTelemetry(telemetry), [telemetry]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmImport, setConfirmImport] = useState<File | null>(null);
  const [email, setEmail] = useState('');
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    if (!settings.syncEnabled) {
      setSignedInAs(null);
      return;
    }
    void currentUserEmail(settings).then(setSignedInAs);
  }, [settings]);

  const patch = (next: Partial<typeof settings>): void => {
    void saveSettings({ ...settings, ...next });
  };

  const handleTelemetryExport = async (): Promise<void> => {
    setBusy(true);
    try {
      await downloadTelemetry();
      setMessage('Телеметрия выгружена отдельным файлом.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Не удалось выгрузить телеметрию.');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    setBusy(true);
    try {
      await downloadSave();
      setMessage('Сейв выгружен в файл.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Не удалось выгрузить сейв.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      const result = await importSaveFromFile(file);
      if (result.ok) {
        await reload();
        setMessage('Сейв загружен. Фолиант переписан.');
      } else {
        setMessage(result.error ?? 'Файл не подошёл.');
      }
    } finally {
      setBusy(false);
      setConfirmImport(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleSync = async (): Promise<void> => {
    setBusy(true);
    const result = await syncOnce(settings);
    if (result.ok && result.syncedAt) {
      await saveSettings({ ...settings, lastSyncAt: result.syncedAt });
      await reload();
    }
    setMessage(result.message);
    setBusy(false);
  };

  return (
    <div style={{ paddingInline: 'var(--pad-screen)', paddingTop: 'var(--space-6)' }}>
      <ScreenTitle subtitle="Настройки и сейв">Свиток</ScreenTitle>

      {message ? (
        <Card tone="accent" className="mt-6 p-4">
          <p className="t-sm" style={{ color: 'var(--fg-primary)' }}>
            {message}
          </p>
          <button
            type="button"
            className="link-action pressable t-label mt-3 underline"
            onClick={() => setMessage(null)}
          >
            скрыть
          </button>
        </Card>
      ) : null}

      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Ощущения</SectionLabel>
        <Card className="px-4 py-1">
          <Toggle
            label="Звук"
            hint="Звон монет, критические удары, фанфары уровня. Синтезируются на лету — интернет не нужен."
            value={settings.soundEnabled}
            onChange={(v) => patch({ soundEnabled: v })}
          />
          <Toggle
            label="Вибрация"
            hint="Короткий отклик на каждую отметку."
            value={settings.hapticsEnabled}
            onChange={(v) => patch({ hapticsEnabled: v })}
            divided
          />
        </Card>
      </section>

      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Правила игры</SectionLabel>
        <Card className="space-y-5 p-4">
          <Field
            label="Час начала новых суток"
            hint="При значении 4 отметка в час ночи относится ко вчерашнему дню. Полуночникам это спасает стрик."
          >
            <input
              className="field t-num"
              type="number"
              inputMode="numeric"
              min={0}
              max={6}
              value={settings.dayRolloverHour}
              onChange={(e) =>
                patch({ dayRolloverHour: Math.max(0, Math.min(6, Number(e.target.value))) })
              }
            />
          </Field>

          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <Toggle
              label="Тратить заморозки автоматически"
              hint="При пропуске сначала уходит бесплатная автозаморозка, потом купленная Печать Стужи."
              value={settings.autoUseFreeze}
              onChange={(v) => patch({ autoUseFreeze: v })}
            />
          </div>

          <div
            className="rounded-sm p-3"
            style={{ background: 'var(--bg-sunken)' }}
          >
            <p className="t-num">
              {character.freeFreezesPerMonth} бесплатных в месяц · осталось {character.freeFreezesLeft}
            </p>
            <p className="t-caption mt-2">
              Каждые 30 дней глобального стрика прибавляют одну навсегда. Чем дольше идёшь, тем
              прочнее подушка.
            </p>
          </div>
        </Card>
      </section>

      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Сейв</SectionLabel>
        <Card className="p-4">
          <p className="t-sm">
            Всё хранится на устройстве: {habits.length} привычек, {dayRecords.length} записанных дней.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              icon="download"
              className="flex-1"
              disabled={busy}
              onClick={() => void handleExport()}
            >
              Экспорт
            </Button>
            <Button
              variant="secondary"
              icon="upload"
              className="flex-1"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              Импорт
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setConfirmImport(file);
            }}
          />
        </Card>
      </section>

      {/* ── Телеметрия ── */}
      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Телеметрия</SectionLabel>
        <Card className="p-4">
          <p className="t-sm">
            Пишется только на этом устройстве и никуда не отправляется. Нужна,
            чтобы через пару недель откалибровать баланс по фактическому
            поведению, а не по догадкам.
          </p>

          <div className="mt-4" style={{ display: 'grid', gap: 'var(--space-1)' }}>
            <StatRow label="Событий записано" value={String(tel.totalEvents)} />
            <StatRow label="Дней с открытиями" value={String(tel.daysTracked)} />
            <StatRow label="Открытий за 14 дней" value={String(tel.opensLast14)} />
            <StatRow
              label="Заходов в день"
              value={tel.averageOpensPerDay.toFixed(1)}
            />
            <StatRow label="Дней без единого захода" value={String(tel.missedDays)} />
            <StatRow label="Минут в приложении" value={String(tel.minutesInApp)} />
            <StatRow label="Отметок / откатов" value={`${tel.ticks} / ${tel.unticks}`} />
            <StatRow
              label="Покупок / отказов"
              value={`${tel.purchases} / ${tel.blockedPurchases}`}
            />
            <StatRow label="Смотрел, но не купил" value={String(tel.viewedNotBought)} />
            <StatRow label="Сигналов «привычка буксует»" value={String(tel.stalledSignals)} />
          </div>

          <Button
            variant="secondary"
            icon="download"
            full
            className="mt-4"
            disabled={busy}
            onClick={() => void handleTelemetryExport()}
          >
            Выгрузить телеметрию
          </Button>
          <p className="t-caption mt-2">
            Телеметрия входит и в обычный экспорт сейва — эта кнопка выгружает
            только её, отдельным файлом.
          </p>
        </Card>
      </section>

      {/* ── Знакомство ── */}
      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Знакомство</SectionLabel>
        <Card className="p-4">
          <p className="t-sm">
            Пройти первый запуск заново: подбор привычек, награды и правила
            Системы. Ничего из накопленного не теряется — привычки только
            добавятся к уже заведённым.
          </p>
          <Button
            variant="secondary"
            full
            className="mt-4"
            disabled={busy}
            onClick={() => void saveSettings({ ...settings, onboarded: false })}
          >
            Показать знакомство заново
          </Button>
        </Card>
      </section>

      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Загрузка сейва</SectionLabel>
        <Card className="p-4">
          {confirmImport ? (
            <ConfirmRow
              question={`Загрузить «${confirmImport.name}»? Текущий фолиант будет полностью заменён. Сделай экспорт, если не уверен.`}
              confirmLabel="Заменить"
              onConfirm={() => void handleImport(confirmImport)}
              onCancel={() => {
                setConfirmImport(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
            />
          ) : null}
        </Card>
      </section>

      <section style={{ marginTop: 'var(--gap-section)' }}>
        <SectionLabel>Синхронизация</SectionLabel>
        <Card className="p-4">
          <Toggle
            label="Включить Supabase"
            hint="Необязательно. Игра полностью работает без неё. При конфликте побеждает сейв, который изменялся позже."
            value={settings.syncEnabled}
            onChange={(v) => patch({ syncEnabled: v })}
          />

          {settings.syncEnabled ? (
            <div className="mt-5 space-y-4">
              <Field label="Адрес проекта">
                <input
                  className="field"
                  value={settings.supabaseUrl}
                  onChange={(e) => patch({ supabaseUrl: e.target.value.trim() })}
                  placeholder="https://xxxx.supabase.co"
                  autoComplete="off"
                />
              </Field>

              <Field label="Публичный anon-ключ">
                <input
                  className="field"
                  value={settings.supabaseAnonKey}
                  onChange={(e) => patch({ supabaseAnonKey: e.target.value.trim() })}
                  placeholder="eyJhbGci…"
                  autoComplete="off"
                />
              </Field>

              {signedInAs ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="t-sm min-w-0 flex-1 truncate">Вход: {signedInAs}</p>
                  <Button
                    variant="ghost"
                    onClick={() => void signOut(settings).then(() => setSignedInAs(null))}
                  >
                    Выйти
                  </Button>
                </div>
              ) : (
                <Field label="Вход по ссылке на почту">
                  <div className="flex gap-2">
                    <input
                      className="field flex-1"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                    <Button
                      variant="secondary"
                      disabled={!email.includes('@')}
                      onClick={() => void signInWithEmail(settings, email).then(setMessage)}
                    >
                      Войти
                    </Button>
                  </div>
                </Field>
              )}

              <Button variant="primary" full disabled={busy} onClick={() => void handleSync()}>
                Синхронизировать сейчас
              </Button>

              {settings.lastSyncAt ? (
                <p className="t-caption text-center">
                  Последняя синхронизация: {new Date(settings.lastSyncAt).toLocaleString('ru-RU')}
                </p>
              ) : null}

              <button
                type="button"
                className="link-action pressable t-label w-full justify-center underline"
                onClick={() => setShowSql((v) => !v)}
              >
                {showSql ? 'скрыть' : 'показать'} SQL для таблицы
              </button>
              {showSql ? (
                <pre
                  className="overflow-x-auto rounded-sm p-3"
                  style={{
                    background: 'var(--bg-sunken)',
                    fontFamily: 'var(--font-num)',
                    fontSize: '11px',
                    lineHeight: '18px',
                    color: 'var(--fg-muted)',
                  }}
                >
                  {SUPABASE_SCHEMA_SQL}
                </pre>
              ) : null}
            </div>
          ) : null}
        </Card>
      </section>

      <p className="t-caption mt-10 px-2 text-center">
        Life RPG — твоя жизнь как игровой процесс.
        <br />
        Прогресс не отнимается никогда: только здоровье и краски мира.
      </p>
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
  divided,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  divided?: boolean;
}): JSX.Element {
  return (
    <div
      className="flex items-start gap-4 py-4"
      style={divided ? { borderTop: '1px solid var(--border-subtle)' } : undefined}
    >
      <div className="min-w-0 flex-1">
        <p className="t-title">{label}</p>
        <p className="t-caption mt-1">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        /* Кнопка 52×44 — полноразмерная тач-цель; сам тумблер 28px внутри неё. */
        className="relative grid shrink-0 place-items-center"
        style={{ width: 'var(--toggle-w)', height: 'var(--tap-min)' }}
      >
        <span
          className="relative block w-12 rounded-full border transition-colors"
          style={{
            height: 'var(--toggle-track-h)',
            background: value ? 'var(--accent)' : 'var(--bg-sunken)',
            borderColor: value ? 'var(--accent-deep)' : 'var(--border-strong)',
          }}
        >
          <span
            className="absolute rounded-full transition-all"
            style={{
              top: 'var(--space-1)',
              height: 'var(--toggle-knob)',
              width: 'var(--toggle-knob)',
              background: value ? 'var(--ink-950)' : 'var(--fg-muted)',
              // Ход тумблера: ширина дорожки минус кнопка минус два поля.
              left: value
                ? 'calc(100% - var(--toggle-knob) - var(--space-1))'
                : 'var(--space-1)',
            }}
          />
        </span>
      </button>
    </div>
  );
}
