import '@/i18n/servers'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FormField } from '@/components/form/FormField'
import { SaveBar } from '@/components/settings/SaveBar'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useUpdateServer } from '../../api/useServerSettings'
import { layoutRule } from '../../lib/layout-error'
import { isServerName, normaliseServerName, SERVER_NAME_MAX_LENGTH, serverNameLength } from '../../lib/server-name'
import type { Server } from '../../types'

/**
 * "Server name" on Overview (S-SET-01): edited in place with the save bar
 * (C-27). Only a typed name is a draft; until then the field shows the name
 * as the list has it, so a rename made elsewhere shows up, and one being
 * typed is never wiped. Enter saves, Esc discards. Leaving with a draft asks
 * first (`discard-confirm`, as S-ME-02); closing the tab, the browser asks.
 *
 * `children` go under the field and above the save bar: settings saved on
 * their own that the page lists after the name.
 */
export function ServerNameForm({ server, children }: { server: Server; children?: ReactNode }) {
    const { t } = useTranslation('servers')
    const update = useUpdateServer(server.id)
    const input = useRef<HTMLInputElement>(null)
    const [draft, setDraft] = useState<string | null>(null)
    const [invalid, setInvalid] = useState(false)
    const value = draft ?? server.name
    const dirty = draft !== null && draft !== server.name

    useEffect(() => {
        if (!dirty) return
        const ask = (event: BeforeUnloadEvent) => event.preventDefault()
        window.addEventListener('beforeunload', ask)
        return () => window.removeEventListener('beforeunload', ask)
    }, [dirty])

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname
    )

    function discard() {
        setDraft(null)
        setInvalid(false)
    }

    function refuse() {
        setInvalid(true)
        input.current?.focus()
    }

    function save(event: FormEvent) {
        event.preventDefault()
        if (!dirty || update.isPending) return
        if (!isServerName(value)) return refuse()
        update.mutate(
            { name: normaliseServerName(value) },
            {
                onSuccess: () => {
                    setDraft(null)
                    toast.success(t('settings.overview.saved'))
                },
                onError: (error) => {
                    if (layoutRule(error)?.rule === 'name_invalid') refuse()
                    else toast.error(t('settings.overview.failed'))
                }
            }
        )
    }

    const length = serverNameLength(value)

    return (
        <form onSubmit={save} className='flex flex-1 flex-col gap-8' noValidate>
            <div className='max-w-[400px]'>
                <FormField
                    label={t('settings.overview.name.label')}
                    error={invalid ? t('settings.overview.name.invalid') : undefined}
                    action={
                        <span
                            className={cn(
                                'font-numeric tabular-nums',
                                length >= SERVER_NAME_MAX_LENGTH ? 'text-text-secondary' : 'text-text-tertiary'
                            )}
                        >
                            {length}/{SERVER_NAME_MAX_LENGTH}
                        </span>
                    }
                >
                    {(field) => (
                        <Input
                            ref={input}
                            {...field}
                            value={value}
                            readOnly={update.isPending}
                            autoComplete='off'
                            onChange={(event) => {
                                // Typing stops at the limit, counted as the API counts.
                                setDraft([...event.target.value].slice(0, SERVER_NAME_MAX_LENGTH).join(''))
                                setInvalid(false)
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape' && dirty) {
                                    event.preventDefault()
                                    discard()
                                }
                            }}
                        />
                    )}
                </FormField>
            </div>
            {children}
            {dirty ? <SaveBar saving={update.isPending} onDiscard={discard} /> : null}
            <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
                <DialogContent className='sm:max-w-dialog'>
                    <DialogHeader>
                        <DialogTitle>{t('settings.overview.discard.title')}</DialogTitle>
                        <DialogDescription>{t('settings.overview.discard.description')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type='button' variant='text' onClick={() => blocker.reset?.()}>
                            {t('settings.overview.discard.stay')}
                        </Button>
                        <Button
                            type='button'
                            variant='destructive'
                            onClick={() => {
                                discard()
                                blocker.proceed?.()
                            }}
                        >
                            {t('settings.overview.discard.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </form>
    )
}
