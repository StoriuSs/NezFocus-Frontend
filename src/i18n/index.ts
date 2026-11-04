import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { siteConfig } from '@/config/site'

// Import translation files
import enCommon from './locales/en/common.json'
import enPages from './locales/en/pages.json'
import enApi from './locales/en/api.json'
import enAuth from './locales/en/auth.json'
import enUsers from './locales/en/users.json'
import viCommon from './locales/vi/common.json'
import viPages from './locales/vi/pages.json'
import viApi from './locales/vi/api.json'
import viAuth from './locales/vi/auth.json'
import viUsers from './locales/vi/users.json'

export const defaultNS = 'common'
export const resources = {
    en: {
        common: enCommon,
        pages: enPages,
        api: enApi,
        auth: enAuth,
        users: enUsers
    },
    vi: {
        common: viCommon,
        pages: viPages,
        api: viApi,
        auth: viAuth,
        users: viUsers
    }
} as const

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        defaultNS,
        fallbackLng: 'en',
        supportedLngs: ['en', 'vi'],

        interpolation: {
            escapeValue: false, // React already escapes
            // `{{appName}}` in any string is the product name (src/config/site.ts).
            defaultVariables: { appName: siteConfig.name }
        },

        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage']
        }
    })

// Screen readers, hyphenation and the browser's translate prompt read
// <html lang>; it stayed "en" after switching to Vietnamese.
const syncDocumentLanguage = (language: string) => {
    if (typeof document !== 'undefined') document.documentElement.lang = language
}
syncDocumentLanguage(i18n.resolvedLanguage ?? 'en')
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
