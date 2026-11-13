import 'i18next'
import type { resources } from './index'
import type { settingsResources } from './settings'
import type { deletionResources } from './deletion'
import type { serversResources } from './servers'
import type { messagingResources } from './messaging'

/**
 * Types t() against the English catalogue: a key that doesn't exist is a
 * compile error instead of a raw key rendered on screen. Vietnamese must have
 * the same keys (checked by src/i18n/__tests__/catalogues.test.ts).
 * `settings`, `deletion`, `servers` and `messaging` are added by their pages
 * when they load (src/i18n/settings.ts, deletion.ts, servers.ts, messaging.ts).
 */
declare module 'i18next' {
    interface CustomTypeOptions {
        // Every namespace, so 'api:KEY' and 'pages:KEY' are typed too.
        defaultNS: ['common', 'pages', 'api', 'auth', 'users', 'settings', 'deletion', 'servers', 'messaging']
        resources: (typeof resources)['en'] & {
            settings: (typeof settingsResources)['en']
            deletion: (typeof deletionResources)['en']
            servers: (typeof serversResources)['en']
            messaging: (typeof messagingResources)['en']
        }
    }
}
