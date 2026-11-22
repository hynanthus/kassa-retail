import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enTranslation from './locales/en.json'
import kkTranslation from './locales/kk.json'
import ruTranslation from './locales/ru.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      kk: { translation: kkTranslation },
      ru: { translation: ruTranslation },
    },
    fallbackLng: 'ru',
    defaultNS: 'translation',
    lng: 'ru',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
