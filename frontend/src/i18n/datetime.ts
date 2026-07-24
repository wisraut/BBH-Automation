import i18n from './index'

// BCP-47 locale for date/time formatting, tracking the active UI language.
// - Thai uses th-TH with the Gregorian calendar (`-u-ca-gregory`) so years
//   read as 2024, matching the Gregorian year the calendar headers already
//   show — avoids a ~543-year Buddhist/Gregorian mismatch on the same page.
//   Month/weekday names still render in Thai.
// - English uses en-GB so the day-before-month ordering matches the Thai
//   layout the UI was designed around (e.g. "5 Jan" like "5 ม.ค.").
// Read at render time; components that format dates already subscribe to
// language changes via useTranslation, so they re-render on toggle.
export function dateLocale(): string {
  const lng = i18n.resolvedLanguage ?? i18n.language ?? 'th'
  return lng.startsWith('en') ? 'en-GB' : 'th-TH-u-ca-gregory'
}
