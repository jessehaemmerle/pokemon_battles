import { createContext, useContext, useMemo, useState } from 'react';

const RES = {
  de: {
    battle: 'Battle',
    replay_viewer: 'Replay Viewer',
    online_battle: 'Online-Battle',
    bot_battle: 'Bot-Battle',
    clear: 'Leeren',
    add: 'Hinzufügen',
    forfeit: 'Aufgabe',
    rematch: 'Rematch',
    back: 'Zurück',
    switch_pokemon: 'Pokémon wechseln',
    new_match: 'Neues Match',
    to_selection: 'Zur Auswahl',
  },
  en: {
    battle: 'Battle',
    replay_viewer: 'Replay Viewer',
    online_battle: 'Online battle',
    bot_battle: 'Bot battle',
    clear: 'Clear',
    add: 'Add',
    forfeit: 'Forfeit',
    rematch: 'Rematch',
    back: 'Back',
    switch_pokemon: 'Switch Pokémon',
    new_match: 'New match',
    to_selection: 'Back to selection',
  }
};

const I18nCtx = createContext({ t:(k)=>k, lang:'de', setLang:()=>{} });

export function I18nProvider({ children, defaultLang='de' }){
  const [lang, setLang] = useState(defaultLang);
  const value = useMemo(()=>({ 
    lang, setLang, 
    t:(k)=> (RES[lang] && RES[lang][k]) || k 
  }), [lang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n(){ return useContext(I18nCtx); }
