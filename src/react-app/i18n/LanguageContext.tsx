import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { SupportedLanguage, TranslationKey, translations } from './translations';

type LanguageContextValue = {
  language: SupportedLanguage;
  isAutomatic: boolean;
  t: (key: TranslationKey) => string;
  setLanguage: (language: SupportedLanguage) => void;
  setAutomaticLanguage: () => Promise<void>;
};

const LANGUAGE_AUTO_STORAGE_KEY = 'airtrust:language:auto';
const LANGUAGE_MANUAL_STORAGE_KEY = 'airtrust:language:manual';
const LANGUAGE_AUTO_CHECKED_AT_KEY = 'airtrust:language:checkedAt';
const LOCALE_API_TTL_MS = 24 * 60 * 60 * 1000; // 24h — country doesn't change between sessions
const warnedMissingKeys = new Set<string>();

function readStoredLanguage(key: string): SupportedLanguage | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(key);
  if (stored === 'pt-BR' || stored === 'en-US') return stored;
  return null;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'pt-BR',
  isAutomatic: true,
  t: (key) => translations['pt-BR'][key] || key,
  setLanguage: () => undefined,
  setAutomaticLanguage: async () => undefined,
});

async function detectLanguageByCountry(): Promise<SupportedLanguage> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/public/locale`, {
      method: 'GET',
      credentials: 'include',
    });

    if (response.ok) {
      const json = (await response.json()) as {
        success?: boolean;
        data?: { country?: string; language?: string };
      };

      const country = String(json?.data?.country || '').toUpperCase();
      if (country === 'BR') return 'pt-BR';
      return 'en-US';
    }
  } catch {
    // fallback abaixo
  }

  const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'pt-BR';
  return browserLocale.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage synchronously — eliminates Flash of Wrong Language (FOWO)
  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    const manual = readStoredLanguage(LANGUAGE_MANUAL_STORAGE_KEY);
    if (manual) return manual;
    const auto = readStoredLanguage(LANGUAGE_AUTO_STORAGE_KEY);
    if (auto) return auto;
    return 'pt-BR';
  });
  const [isAutomatic, setIsAutomatic] = useState<boolean>(() => {
    const manual = readStoredLanguage(LANGUAGE_MANUAL_STORAGE_KEY);
    return !manual;
  });

  const setManualLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    setIsAutomatic(false);
    setLanguage(nextLanguage);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_MANUAL_STORAGE_KEY, nextLanguage);
    }
  }, []);

  const setAutomaticLanguage = useCallback(async () => {
    setIsAutomatic(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LANGUAGE_MANUAL_STORAGE_KEY);
    }

    const detected = await detectLanguageByCountry();
    setLanguage(detected);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_AUTO_STORAGE_KEY, detected);
    }
    document.documentElement.lang = detected;
  }, []);

  useEffect(() => {
    let mounted = true;

    const manual = readStoredLanguage(LANGUAGE_MANUAL_STORAGE_KEY);
    if (manual) {
      setIsAutomatic(false);
      setLanguage(manual);
      return () => { mounted = false; };
    }

    setIsAutomatic(true);

    // Only re-check the server if the cached locale is older than 24h.
    // CF-IPCountry doesn't change session-to-session; daily is more than sufficient.
    const cachedAuto = readStoredLanguage(LANGUAGE_AUTO_STORAGE_KEY);
    const checkedAt = typeof window !== 'undefined'
      ? Number(localStorage.getItem(LANGUAGE_AUTO_CHECKED_AT_KEY) || 0)
      : 0;
    const isFresh = cachedAuto && (Date.now() - checkedAt < LOCALE_API_TTL_MS);

    if (isFresh) {
      setLanguage(cachedAuto);
      document.documentElement.lang = cachedAuto;
      return () => { mounted = false; };
    }

    detectLanguageByCountry().then((detected) => {
      if (!mounted) return;
      setLanguage(detected);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LANGUAGE_AUTO_STORAGE_KEY, detected);
        localStorage.setItem(LANGUAGE_AUTO_CHECKED_AT_KEY, String(Date.now()));
      }
      document.documentElement.lang = detected;
    });

    return () => { mounted = false; };
  }, []);

  // Keep <html lang> in sync with the active language (runs on first render too)
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    return {
      language,
      isAutomatic,
      t: (key: TranslationKey) => {
        const translated = translations[language][key] || translations['pt-BR'][key];
        if (!translated) {
          const warnKey = `${language}:${key}`;
          if (!warnedMissingKeys.has(warnKey)) {
            warnedMissingKeys.add(warnKey);
            console.warn(`[i18n] Missing translation for key "${key}" in language "${language}"`);
          }
          return key;
        }
        return translated;
      },
      setLanguage: setManualLanguage,
      setAutomaticLanguage,
    };
  }, [isAutomatic, language, setAutomaticLanguage, setManualLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export { LanguageContext };
