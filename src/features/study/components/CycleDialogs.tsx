import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/study'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { notifyMutationError } from '@/lib/query-client'
import { useChangeCycle, useStartSession } from '../api/useSessionCommands'
import { sessionCycle } from '../lib/phases'
import { sessionRefusal } from '../lib/session-errors'
import {
    chosenCycle,
    cycleChoiceOf,
    cycleFieldOfProblem,
    cycleFormOf,
    cycleOnlySchema,
    type CycleField,
    type CycleOnlyValues,
    type StudyCycle
} from '../lib/study-cycle'
import { useStudyStore } from '../study.store'
import type { AnySession } from '../types'
import { CycleFields } from './CycleFields'

/**
 * A cycle form in a dialog (C-14 `form`, 520), React Hook Form + zod
 * (`cycleOnlySchema`): the cycle fields, checked when sent, the focus on the
 * first field out of range. Esc is Cancel; a click outside closes it only
 * while nothing was changed; neither while it is being sent. Opened again,
 * it starts from `initial` (nothing kept). The choice made takes the focus.
 */
function CycleDialog({
    title,
    description,
    note,
    submit,
    initial,
    roomCycle,
    pending,
    onSubmit,
    onClose,
    refusedField
}: {
    title: string
    description: string
    note?: string
    submit: string
    initial: StudyCycle
    roomCycle: StudyCycle
    pending: boolean
    onSubmit: (cycle: StudyCycle) => void
    onClose: () => void
    /** A field the server refused (`study_cycle`). */
    refusedField: CycleField | null
}) {
    const { t } = useTranslation('study')
    const {
        control,
        handleSubmit,
        setError,
        clearErrors,
        formState: { isDirty }
    } = useForm<CycleOnlyValues>({
        resolver: zodResolver(cycleOnlySchema),
        // Checked when sent; a field changed only loses its error (C-01).
        reValidateMode: 'onSubmit',
        defaultValues: { cycle: cycleFormOf(initial) }
    })
    const choice = useWatch({ control, name: 'cycle.choice' })
    useEffect(() => {
        if (refusedField) setError(`cycle.${refusedField}`, { message: refusedField }, { shouldFocus: true })
    }, [refusedField, setError])

    const send = handleSubmit(({ cycle }) => {
        const chosen = chosenCycle(cycle)
        if (chosen && !pending) onSubmit(chosen)
    })

    return (
        <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
            <DialogContent
                className='sm:max-w-[520px]'
                onInteractOutside={(event) => {
                    if (isDirty || pending) event.preventDefault()
                }}
                onEscapeKeyDown={(event) => {
                    if (pending) event.preventDefault()
                }}
                onOpenAutoFocus={(event) => {
                    // The choice made takes the focus (S-ROOM-03 › Tương tác).
                    const chosen = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
                        '[role="radio"][aria-checked="true"]'
                    )
                    if (chosen) {
                        event.preventDefault()
                        chosen.focus()
                    }
                }}
            >
                <form onSubmit={(event) => void send(event)} noValidate className='grid gap-5'>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
                    <CycleFields
                        control={control}
                        clearErrors={clearErrors}
                        label={t('cycle.label')}
                        labelHidden
                        hint={choice === cycleChoiceOf(roomCycle) ? t('cycle.roomDefault') : null}
                    />
                    {note ? <p className='text-body-sm text-text-secondary'>{note}</p> : null}
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={pending} onClick={onClose}>
                            {t('start.cancel')}
                        </Button>
                        <Button type='submit' aria-busy={pending || undefined}>
                            {pending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {submit}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Starting a session with a cycle of one's choice (07 S-ROOM-03): the
 * room's own chosen first. Someone else started one first (`conflict`): the
 * dialog closes as the room has a session, and the hook says who.
 */
export function StartSessionDialog({
    channelId,
    roomCycle,
    people,
    roomNow,
    onClose
}: {
    channelId: string
    roomCycle: StudyCycle
    /** Everyone in the room, oneself in (07 › luật 3). */
    people: number
    /** The room's session now, and who hosts it (the start refused, S-ROOM-03 `conflict`). */
    roomNow: () => { hostName: string | null } | null
    onClose: () => void
}) {
    const { t } = useTranslation('study')
    const start = useStartSession(channelId, roomNow)
    return (
        <CycleDialog
            title={t('start.title')}
            description={people > 1 ? t('start.description', { count: people }) : t('start.descriptionAlone')}
            submit={t('start.submit')}
            initial={roomCycle}
            roomCycle={roomCycle}
            pending={start.isPending}
            refusedField={null}
            onClose={onClose}
            onSubmit={(cycle) => start.mutate(cycle, { onSuccess: onClose })}
        />
    )
}

/**
 * A new cycle while paused (07 S-ROOM-04 `paused-edit-config`): the
 * session's own chosen first; the phase starts again with its new length,
 * still paused (D-50). Someone resumes meanwhile: it closes unsaved, saying
 * who ("Bình đã tiếp tục phiên học").
 */
export function ChangeCycleDialog({
    channelId,
    session,
    roomCycle,
    nameOf,
    onClose
}: {
    channelId: string
    session: AnySession
    roomCycle: StudyCycle
    nameOf: (userId: string) => string
    onClose: () => void
}) {
    const { t } = useTranslation('study')
    const change = useChangeCycle(session)
    const [refusedField, setRefusedField] = useState<CycleField | null>(null)
    const [initial] = useState(() => sessionCycle(session))
    const resumedBy = useResumedBy(channelId, session)
    useEffect(() => {
        if (resumedBy === undefined) return
        onClose()
        toast(t('news.resumed', { name: resumedBy ? nameOf(resumedBy) : t('news.someone') }))
    }, [resumedBy, nameOf, onClose, t])
    return (
        <CycleDialog
            title={t('change.title')}
            description={t('change.note', { phase: t(`phase.${session.phase}`) })}
            submit={t('change.save')}
            initial={initial}
            roomCycle={roomCycle}
            pending={change.isPending}
            refusedField={refusedField}
            onClose={onClose}
            onSubmit={(cycle) =>
                change.mutate(cycle, {
                    onSuccess: onClose,
                    onError: (error) => {
                        const { rule, problem } = sessionRefusal(error)
                        // Resumed meanwhile: closed by its news.
                        if (rule === 'not_paused') return
                        const field = rule === 'study_cycle' ? cycleFieldOfProblem(problem) : null
                        if (field) setRefusedField(field)
                        else notifyMutationError(error)
                    }
                })
            }
        />
    )
}

/** Who resumed the session once it runs again (undefined while paused; null: no one heard). */
function useResumedBy(channelId: string, session: AnySession): string | null | undefined {
    const news = useStudyStore((state) => state.news[channelId])
    if (session.status === 'paused') return undefined
    return news?.id === session.id && news.action === 'resume' ? news.actorId : null
}
