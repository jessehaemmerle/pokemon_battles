import { createContext, useContext, useMemo, useState } from "react";

// --- Sprach-Ressourcen ---
const RES = {
  en: {
    hello: "Hello",
    battle: "Battle",
    team: "Team",
    replay: "Replay",
  },
  de: {
    hello: "Hallo",
    battle: "Kampf",
    team: "Team",
    replay: "Wiederholung",
  },
};

// --- Context erstellen ---
export const I18nCtx = createContext({
  t: (k) => k,
  lang: "en",
  setLang: () => {},
});

// --- Provider-Komponente ---
export function I18nProvider({ children, initial = "en" }) {
  const [lang, setLang] = useState(initial);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (k) => (RES[lang] && RES[lang][k]) || k,
    }),
    [lang]
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

// --- Hook für Nutzung ---
export function useI18n() {
  return useContext(I18nCtx);
}
