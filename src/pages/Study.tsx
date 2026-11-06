import { useTranslation } from 'react-i18next'
import { ShellPage } from '@/components/shell/ShellPage'

/**
 * The Study page, the app's home after sign-in (D-124). Its content (rooms
 * studying now, studying alone, the streak) arrives in M5; in M0 it is the
 * AppShell with an empty content area (docs/notes/M0-plan.md, L4).
 */
export default function Study() {
    const { t } = useTranslation()
    return <ShellPage title={t('shell.study.title')} />
}
