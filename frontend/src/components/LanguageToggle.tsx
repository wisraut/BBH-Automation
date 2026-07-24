import { useTranslation } from 'react-i18next'

import { SUPPORTED_LANGUAGES, type AppLanguage } from '../i18n'

// A two-option segmented control — the accepted pattern for switching between a
// small, fixed set of languages (a dropdown only earns its keep past ~4 options).
// Styled to match the Topbar's hairline buttons + bbh-green active state.
export function LanguageToggle() {
  const { i18n, t } = useTranslation()
  const active = (i18n.resolvedLanguage ?? 'th') as AppLanguage

  return (
    <div
      className="inline-flex items-center rounded-xl border border-bbh-line bg-white p-0.5"
      role="group"
      aria-label={t('language.switchTo')}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const isActive = active === lng
        return (
          <button
            key={lng}
            type="button"
            onClick={() => void i18n.changeLanguage(lng)}
            aria-pressed={isActive}
            className={`rounded-[10px] px-2.5 py-1 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-1 focus-visible:ring-offset-white ${
              isActive
                ? 'bg-bbh-green text-white shadow-sm shadow-bbh-green/20'
                : 'text-bbh-muted hover:text-bbh-green'
            }`}
          >
            {t(`language.${lng}`)}
          </button>
        )
      })}
    </div>
  )
}
