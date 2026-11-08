import 'i18next'
import type { resources } from './index'
import type { settingsResources } from './settings'

/**
 * Types t() against the English catalogue: a key that doesn't exist is a
 * compile error instead of a raw key rendered on screen. Vietnamese must have
 * the same keys (checked by src/i18n/__tests__/catalogues.test.ts).
 * `settings` is added by its pages when they load (src/i18n/settings.ts).
 */
declare module 'i18next' {
    interface CustomTypeOptions {
        // Every namespace, so 'api:KEY' and 'pages:KEY' are typed too.
        defaultNS: ['common', 'pages', 'api', 'auth', 'users', 'settings']
        resources: (typeof resources)['en'] & { settings: (typeof settingsResources)['en'] }
    }
}
