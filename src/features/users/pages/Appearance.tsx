import { useTranslation } from 'react-i18next'
import '@/i18n/settings'
import { ShellPage } from '@/components/shell/ShellPage'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import { SegmentedControl, type Segment } from '@/components/ui/segmented-control'
import { LANGUAGE_NAMES } from '@/components/LanguageToggle'
import { useUpdateSettings } from '@/features/users/api/useUpdateSettings'
import { SettingsLoader } from '@/features/users/components/SettingsLoader'
import { TimeZoneSetting } from '@/features/users/components/TimeZoneSetting'
import type { UserSettings } from '@/features/users/types'

type Theme = UserSettings['theme']
type Language = UserSettings['language']

/** In the spec's order: System · Dark · Light (S-ME-04). */
const THEMES: readonly Theme[] = ['system', 'dark', 'light']

/**
 * Appearance & language (S-ME-04, REQ-AUTH-08): theme and language apply at
 * once, in every tab, and are kept by the account (D-37); the time zone asks
 * first and changes once a day.
 */
export default function Appearance() {
    const { t } = useTranslation()
    return (
        <ShellPage title={t('shell.settings.appearance')}>
            <SettingsLoader>{(settings) => <AppearanceContent settings={settings} />}</SettingsLoader>
        </ShellPage>
    )
}

function AppearanceContent({ settings }: { settings: UserSettings }) {
    const { t } = useTranslation('settings')
    const update = useUpdateSettings()

    const themes: Segment<Theme>[] = THEMES.map((theme) => ({ value: theme, label: t(`appearance.themes.${theme}`) }))
    // Each language by its own name, whatever is on screen (D-64).
    const languages: Segment<Language>[] = LANGUAGE_NAMES.map(({ code, name }) => ({
        value: code,
        label: name,
        lang: code
    }))

    return (
        <div className='max-w-settings space-y-8 p-6 lg:p-8'>
            <SettingsGroup id='theme' title={t('appearance.theme')}>
                <div className='space-y-2 py-2'>
                    <SegmentedControl
                        aria-labelledby='theme'
                        value={settings.theme}
                        segments={themes}
                        onValueChange={(theme) => update.mutate({ theme })}
                    />
                    <p className='text-label text-text-tertiary'>{t('appearance.systemHint')}</p>
                </div>
            </SettingsGroup>

            <SettingsGroup id='language' title={t('appearance.language')}>
                <div className='py-2'>
                    <SegmentedControl
                        aria-labelledby='language'
                        value={settings.language}
                        segments={languages}
                        onValueChange={(language) => update.mutate({ language })}
                    />
                </div>
            </SettingsGroup>

            <TimeZoneSetting settings={settings} />
        </div>
    )
}
