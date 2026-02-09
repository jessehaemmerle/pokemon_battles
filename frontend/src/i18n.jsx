import React, { createContext, useContext, useMemo, useState } from 'react';

const translations = {
  de: {
    battle: 'Kampf',
    replay: 'Replay',
    randomBattle: 'Random Battle',
    teamBuilder: 'Team Builder',
    onlineBattle: 'Online-Battle',
    botBattle: 'Bot-Battle',
    start: 'Start',
    theme: 'Theme'
  },
  en: {
    battle: 'Battle',
    replay: 'Replay',
    randomBattle: 'Random Battle',
    teamBuilder: 'Team Builder',
    onlineBattle: 'Online Battle',
    botBattle: 'Bot Battle',
    start: 'Start',
    theme: 'Theme'
  }
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState('de');
  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key) => translations[locale][key] || key
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
