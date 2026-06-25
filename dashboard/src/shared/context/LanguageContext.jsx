import React, { createContext, useState, useContext } from 'react';
import { translations } from '../i18n/translations.js';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(localStorage.getItem('lang') || 'en');

  const setLanguage = (lang) => {
    if (lang === 'en' || lang === 'vi') {
      setLanguageState(lang);
      localStorage.setItem('lang', lang);
    }
  };

  const t = (key) => {
    if (!key) return '';
    return translations[language]?.[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
