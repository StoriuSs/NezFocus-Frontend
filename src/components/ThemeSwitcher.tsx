import { Sun, Moon, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTheme, Theme } from '@/hooks/useTheme'

const themeOptions: { value: Theme; icon: typeof Sun; labelKey: 'theme.light' | 'theme.dark' | 'theme.system' }[] = [
    { value: 'light', icon: Sun, labelKey: 'theme.light' },
    { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
    { value: 'system', icon: Monitor, labelKey: 'theme.system' }
]
const SYSTEM_OPTION = themeOptions[2]!

export function ThemeSwitcher() {
    const { theme, setTheme } = useTheme()
    const { t } = useTranslation()

    const currentOption = themeOptions.find((opt) => opt.value === theme) ?? SYSTEM_OPTION
    const CurrentIcon = currentOption.icon

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' className='h-9 w-9'>
                    <CurrentIcon className='h-4 w-4' />
                    <span className='sr-only'>{t('theme.toggle')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
                {themeOptions.map(({ value, icon: Icon, labelKey }) => (
                    <DropdownMenuItem
                        key={value}
                        onClick={() => setTheme(value)}
                        className={theme === value ? 'bg-accent' : ''}
                    >
                        <Icon className='mr-2 h-4 w-4' />
                        {t(labelKey)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
