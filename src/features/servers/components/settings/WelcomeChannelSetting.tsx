import '@/i18n/servers'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, type SelectOption } from '@/components/ui/select'
import { useChooseWelcomeChannel } from '../../api/useServerSettings'
import { welcomeChoices, type WelcomeChoice } from '../../lib/settings-sections'
import type { Server } from '../../types'

const NONE = 'none'
const lock = <Lock className='size-3 shrink-0 text-text-tertiary' aria-hidden='true' />

/**
 * "Welcome channel" (S-SET-01, D-83, 04 Q14): "Send none" first, then the
 * text channels in list order with their category at the right; a private
 * one has a `lock` and may be chosen, with a line saying who sees the
 * greeting. Choosing saves at once (04 › Lưu thay đổi), shown before the
 * answer; a refusal puts the old one back with "Could not save" + "Try again".
 */
export function WelcomeChannelSetting({ server }: { server: Server }) {
    const { t } = useTranslation('servers')
    const update = useChooseWelcomeChannel()
    const id = useId()
    const choices = welcomeChoices(server)
    const chosen = choices.find(
        (choice): choice is Exclude<WelcomeChoice, { kind: 'none' }> =>
            choice.kind !== 'none' && choice.id === server.welcomeChannelId
    )

    const option = (choice: WelcomeChoice): SelectOption => {
        switch (choice.kind) {
            case 'none':
                return {
                    value: NONE,
                    label: t('settings.overview.welcome.none'),
                    description: t('settings.overview.welcome.noneDescription')
                }
            case 'hidden':
                return { value: choice.id, label: t('settings.overview.welcome.hidden'), icon: lock }
            case 'channel':
                return {
                    value: choice.id,
                    label: `# ${choice.name}`,
                    icon: choice.isPrivate ? lock : undefined,
                    trailing: choice.categoryName ?? undefined
                }
        }
    }

    function choose(value: string) {
        const next = value === NONE ? null : value
        if (next !== (server.welcomeChannelId ?? null)) update.mutate({ serverId: server.id, welcomeChannelId: next })
    }

    const hint = !chosen
        ? t('settings.overview.welcome.hintNone')
        : chosen.kind === 'hidden'
          ? t('settings.overview.welcome.hintHidden')
          : chosen.kind === 'channel' && chosen.isPrivate
            ? t('settings.overview.welcome.hintPrivate', { name: chosen.name })
            : t('settings.overview.welcome.hint')

    return (
        <div className='grid max-w-[400px] gap-1'>
            <Label htmlFor={id} className='text-label text-text-secondary'>
                {t('settings.overview.welcome.label')}
            </Label>
            <Select
                id={id}
                aria-describedby={`${id}-hint`}
                value={chosen ? chosen.id : NONE}
                onValueChange={choose}
                options={choices.map(option)}
            />
            <p id={`${id}-hint`} className='text-label text-text-tertiary'>
                {hint}
            </p>
        </div>
    )
}
