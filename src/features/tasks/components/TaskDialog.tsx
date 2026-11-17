import { useCallback, useId, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/tasks'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
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
import { Textarea } from '@/components/ui/textarea'
import { getApiErrorMessage } from '@/lib/api-error'
import { useCreateTask, useEditTask } from '../api/useTaskWrites'
import { dueText, type DayWords } from '../lib/due-text'
import { nameOf } from '../lib/people'
import { taskFailure } from '../lib/task-errors'
import { shortTitle } from '../lib/task-toasts'
import type { Task, TaskBoardPlace, TaskCandidate, UpdateTaskRequest } from '../types'
import { AssigneePicker } from './AssigneePicker'
import { DuePicker } from './DuePicker'

export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 2000

/** A due date not after now: refused when set or changed (D-96). */
const isGone = (at: Date) => at.getTime() <= Date.now()

const schema = z.object({
    title: z.string(),
    description: z.string(),
    dueAt: z.date().nullable(),
    assigneeIds: z.array(z.string())
})
type Values = z.infer<typeof schema>

/**
 * "Thêm việc" / "Sửa việc" (S-TASK-03): title (required, at most 200),
 * description (at most 2000), due date (C-43) and the people on it (C-25
 * `multi`; nobody at first, Q12). Checked on the button (C-01): an empty
 * title, a due date gone by, the latter only when it changes (D-96, R6).
 * Enter in the title or Ctrl Enter anywhere saves. What the API refuses
 * shows above the buttons, never in a Toast; the one added closes the
 * dialog with "Đã thêm "…"". Cancel or Esc close at once; a click outside
 * does not once something is typed (C-14).
 */
export function TaskDialog({
    place,
    task,
    me,
    now,
    timeZone,
    words,
    onClose
}: {
    place: TaskBoardPlace
    /** The task to edit; none to add one. */
    task?: Task
    me: TaskCandidate | undefined
    now: Date
    timeZone: string | undefined
    words: DayWords
    onClose: () => void
}) {
    const { t, i18n } = useTranslation('tasks')
    const create = useCreateTask(place.channelId)
    const edit = useEditTask()
    const [failure, setFailure] = useState<string | null>(null)
    const initial = useMemo<Values>(
        () => ({
            title: task?.title ?? '',
            description: task?.description ?? '',
            dueAt: task?.dueAt ? new Date(task.dueAt) : null,
            assigneeIds: task?.assignees.map((person) => person.id) ?? []
        }),
        [task]
    )
    const {
        control,
        register,
        handleSubmit,
        setError,
        clearErrors,
        setFocus,
        formState: { errors, isSubmitting: saving, isDirty }
    } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial, reValidateMode: 'onSubmit' })
    const [title, description, dueAt] = useWatch({ control, name: ['title', 'description', 'dueAt'] })
    const submitId = useId()
    const [seen, setSeen] = useState<ReadonlyMap<string, TaskCandidate>>(new Map())
    // Everyone named so far, to say who a refusal is about: the task's people, oneself, those picked.
    const known = useMemo(() => {
        const people = new Map<string, TaskCandidate>(seen)
        for (const person of task?.assignees ?? []) people.set(person.id, person)
        if (me) people.set(me.id, me)
        return people
    }, [task, me, seen])

    const dueChanged = (dueAt?.getTime() ?? null) !== (initial.dueAt?.getTime() ?? null)

    const send = handleSubmit(async (values) => {
        const trimmed = values.title.trim()
        let bad = false
        if (!trimmed) {
            setError('title', { message: t('form.titleRequired') })
            bad = true
        }
        if (values.dueAt && dueChanged && isGone(values.dueAt)) {
            setError('dueAt', { message: t('form.pastDue') })
            bad = true
        }
        if (bad) {
            setFocus(trimmed ? 'dueAt' : 'title')
            return
        }
        setFailure(null)
        try {
            if (!task) {
                const made = await create.mutateAsync({
                    title: trimmed,
                    description: values.description.trim() || null,
                    dueAt: values.dueAt?.toISOString() ?? null,
                    assigneeIds: values.assigneeIds
                })
                toast(t('toast.added', { title: shortTitle(made.title) }))
            } else {
                const changes: UpdateTaskRequest = {}
                if (trimmed !== task.title) changes.title = trimmed
                if (values.description.trim() !== task.description) changes.description = values.description.trim()
                if (dueChanged) changes.dueAt = values.dueAt?.toISOString() ?? null
                const before = initial.assigneeIds
                await edit.mutateAsync({
                    taskId: task.id,
                    changes,
                    add: values.assigneeIds.filter((id) => !before.includes(id)),
                    remove: before.filter((id) => !values.assigneeIds.includes(id))
                })
            }
            onClose()
        } catch (error) {
            const problem = taskFailure(error)
            if (problem.kind === 'past-due') {
                setError('dueAt', { message: t('form.pastDue') }, { shouldFocus: true })
                return
            }
            // The task deleted, or its board turned off, while being edited (05 › Edge case).
            if (task && (problem.kind === 'gone' || problem.kind === 'board-off')) {
                onClose()
                toast(t('toast.gone'))
                return
            }
            const names = (ids: string[]) =>
                ids.map((id) => (known.get(id) ? nameOf(known.get(id)!, t('people.deleted')) : id)).join(', ')
            setFailure(
                problem.kind === 'assignees'
                    ? t('form.invalidAssignee', { names: names(problem.userIds) })
                    : problem.kind === 'full'
                      ? t('form.full')
                      : problem.kind === 'board-off'
                        ? t('form.boardOff')
                        : problem.kind === 'forbidden'
                          ? t('form.forbidden')
                          : problem.kind === 'offline'
                            ? t('form.offline')
                            : getApiErrorMessage(error)
            )
            // FormMessage: focus on the main button (S-TASK-03 › Bàn phím).
            document.getElementById(submitId)?.focus()
        }
    })
    // Ctrl Enter in any field saves (Q12); Enter in the title does, as a form's first field.
    // On the form once it is in the page (the dialog draws it after its first render).
    const form = useCallback((element: HTMLFormElement | null) => {
        if (!element) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
            event.preventDefault()
            element.requestSubmit()
        }
        element.addEventListener('keydown', onKey)
        return () => element.removeEventListener('keydown', onKey)
    }, [])
    const counter = (length: number, max: number) => (
        <span className='text-label text-text-tertiary' aria-hidden='true'>
            {length}/{max}
        </span>
    )

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent
                className='sm:max-w-[520px]'
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    setFocus('title')
                }}
                onInteractOutside={(event) => (isDirty || saving) && event.preventDefault()}
                onEscapeKeyDown={(event) => saving && event.preventDefault()}
            >
                <form ref={form} onSubmit={(event) => void send(event)} className='grid gap-5' noValidate>
                    <DialogHeader>
                        <DialogTitle>{t(task ? 'form.editTitle' : 'form.createTitle')}</DialogTitle>
                        <DialogDescription className='text-label text-text-secondary'>
                            # {place.channelName} · {place.serverName}
                        </DialogDescription>
                    </DialogHeader>

                    <FormField
                        label={t('form.title')}
                        error={errors.title?.message}
                        action={counter(title.length, TITLE_MAX)}
                    >
                        {(field) => (
                            <Input
                                {...field}
                                {...register('title', { onChange: () => clearErrors('title') })}
                                maxLength={TITLE_MAX}
                                placeholder={t('form.titlePlaceholder')}
                                readOnly={saving}
                            />
                        )}
                    </FormField>
                    <FormField label={t('form.description')} action={counter(description.length, DESCRIPTION_MAX)}>
                        {(field) => (
                            <Textarea
                                {...field}
                                {...register('description')}
                                maxLength={DESCRIPTION_MAX}
                                readOnly={saving}
                            />
                        )}
                    </FormField>
                    <Controller
                        control={control}
                        name='dueAt'
                        render={({ field: due }) => (
                            <FormField label={t('form.due')} error={errors.dueAt?.message}>
                                {(field) => (
                                    <DuePicker
                                        id={field.id}
                                        buttonRef={due.ref}
                                        invalid={field['aria-invalid']}
                                        describedBy={field['aria-describedby']}
                                        value={due.value}
                                        onChange={(next) => {
                                            due.onChange(next)
                                            clearErrors('dueAt')
                                        }}
                                        text={
                                            due.value ? dueText(due.value, now, timeZone, i18n.language, words) : null
                                        }
                                        now={now}
                                        timeZone={timeZone}
                                        disabled={saving}
                                    />
                                )}
                            </FormField>
                        )}
                    />
                    <Controller
                        control={control}
                        name='assigneeIds'
                        render={({ field: people }) => (
                            <FormField label={t('form.assignees')}>
                                {(field) => (
                                    <AssigneePicker
                                        id={field.id}
                                        describedBy={field['aria-describedby']}
                                        selected={people.value}
                                        onChange={people.onChange}
                                        known={known}
                                        remember={(person) =>
                                            setSeen((before) => new Map(before).set(person.id, person))
                                        }
                                        me={me}
                                        candidates={place.candidates}
                                        disabled={saving}
                                    />
                                )}
                            </FormField>
                        )}
                    />

                    {failure ? <FormMessage tone='danger'>{failure}</FormMessage> : null}
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={saving} onClick={onClose}>
                            {t('form.cancel')}
                        </Button>
                        <Button id={submitId} type='submit' disabled={saving}>
                            {saving ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t(task ? 'form.save' : 'form.create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
