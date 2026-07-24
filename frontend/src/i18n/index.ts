import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import th from './locales/th.json'

export const SUPPORTED_LANGUAGES = ['th', 'en'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// Persisted under this key so a staff member's choice survives reloads.
export const LANGUAGE_STORAGE_KEY = 'bbh-lang'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      th: { translation: th },
      en: { translation: en },
    },
    // Thai is the default for a Thai hospital; English is opt-in via the toggle.
    fallbackLng: 'th',
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    detection: {
      // Only remember an explicit choice — never auto-switch from the browser
      // locale, so first load is always Thai until the user flips the toggle.
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    interpolation: {
      escapeValue: false, // React already escapes.
    },
  })

// Keep <html lang> in sync for accessibility / correct font shaping.
const applyHtmlLang = (lng: string) => {
  document.documentElement.lang = lng
}
applyHtmlLang(i18n.resolvedLanguage ?? 'th')
i18n.on('languageChanged', applyHtmlLang)

export default i18n
