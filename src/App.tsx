import { useEffect, useRef, useState } from 'react';
import { GameProvider, useGame } from '@/state/useGame';
import { TopBar } from '@/ui/TopBar';
import { Overlays } from '@/ui/Overlays';
import { CharacterScreen } from '@/ui/screens/CharacterScreen';
import { HabitsScreen } from '@/ui/screens/HabitsScreen';
import { QuestsScreen } from '@/ui/screens/QuestsScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { ShopScreen } from '@/ui/screens/ShopScreen';
import { TodayScreen } from '@/ui/screens/TodayScreen';
import { unlockAudio } from '@/ui/feedback';
import { Onboarding } from '@/ui/Onboarding';
import { Icon } from '@/ui/icons';
import type { IconName } from '@/ui/icons';

type Tab = 'today' | 'habits' | 'quests' | 'shop' | 'character' | 'settings';

/** Навигация — ровно 5 пунктов (правило bottom-nav-limit). Настройки живут в шапке. */
const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'today', icon: 'navToday', label: 'Сегодня' },
  { id: 'habits', icon: 'navHabits', label: 'Фолиант' },
  { id: 'quests', icon: 'navQuests', label: 'Квесты' },
  { id: 'shop', icon: 'navShop', label: 'Лавка' },
  { id: 'character', icon: 'navHero', label: 'Герой' },
];

export default function App(): JSX.Element {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}

function Shell(): JSX.Element {
  const { settings, track } = useGame();
  const [tab, setTab] = useState<Tab>('today');

  /*
    Длительность просмотра экрана пишется на ВЫХОДЕ с него, а не на входе:
    на входе она ещё неизвестна. Последний экран сессии фиксируется по
    `pagehide` — на iOS это единственное надёжное событие ухода: `unload`
    там не срабатывает при сворачивании в фон.
  */
  const enteredAt = useRef(Date.now());
  const currentTab = useRef<Tab>(tab);

  useEffect(() => {
    const previous = currentTab.current;
    if (previous !== tab) {
      track('screenView', previous, Date.now() - enteredAt.current);
      enteredAt.current = Date.now();
      currentTab.current = tab;
    }
  }, [tab, track]);

  useEffect(() => {
    const flush = (): void => {
      track('screenView', currentTab.current, Date.now() - enteredAt.current);
      enteredAt.current = Date.now();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, [track]);

  // Аудио на iOS разблокируется только внутри пользовательского жеста.
  useEffect(() => {
    const unlock = (): void => unlockAudio();
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  if (!settings.onboarded) return <Onboarding />;

  return (
    <>
      <TopBar onOpenSettings={() => setTab('settings')} />

      <main
        className="mx-auto"
        style={{
          maxWidth: 'var(--content-max)',
          // Контент не прячется под фиксированными панелями.
          paddingTop: 'calc(var(--header-height) + var(--safe-top))',
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + var(--space-6))',
        }}
      >
        {tab === 'today' ? <TodayScreen onOpenHabits={() => setTab('habits')} /> : null}
        {tab === 'habits' ? <HabitsScreen /> : null}
        {tab === 'quests' ? <QuestsScreen /> : null}
        {tab === 'shop' ? <ShopScreen /> : null}
        {tab === 'character' ? <CharacterScreen /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </main>

      <nav className="app-nav grain" aria-label="Основная навигация">
        <div className="mx-auto flex w-full" style={{ maxWidth: 'var(--content-max)' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="nav-item"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <Icon name={t.icon} size="md" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <Overlays />
    </>
  );
}
