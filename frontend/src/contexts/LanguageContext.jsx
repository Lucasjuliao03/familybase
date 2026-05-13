import { createContext, useContext, useState, useCallback } from 'react';
import pt from '../i18n/pt.json';
import en from '../i18n/en.json';

const dictionaries = { pt, en };
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('fb_lang') || 'pt');

  const t = useCallback((key) => {
    return dictionaries[lang]?.[key] || dictionaries['pt']?.[key] || key;
  }, [lang]);

  const switchLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem('fb_lang', newLang);
  };

  return (
    <LanguageContext.Provider value={{ lang, t, switchLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
