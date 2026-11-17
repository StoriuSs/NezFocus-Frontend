import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Search, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PresenceDot } from '@/components/ui/presence-dot'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn, folded } from '@/lib/utils'
import { nameOf } from '../lib/people'
import type { TaskBoardPlace, TaskCandidate } from '../types'
import { AvatarStack } from './AvatarStack'

/**
 * "Người được giao" (C-25 `multi`, S-TASK-03 `assignee-picker`): the field
 * shows the people picked (avatars and "An, Bình"; from 3 people "3
 * người"), its Popover a search ("Tìm thành viên", accents ignored, by the
 * server) over the members who view the channel (D-192): "Tôi (An)" always
 * first, then by name; a Checkbox on each. ↑ ↓ move, Space or Enter ticks
 * and keeps it open; Esc or a click outside closes, keeping the ticks.
 */
export function AssigneePicker({
    id,
    selected,
    onChange,
    known,
    remember,
    me,
    candidates,
    invalid,
    describedBy,
    disabled
}: {
    id?: string
    selected: readonly string[]
    onChange: (next: string[]) => void
    /** Everyone already named (the task's people, the profile): the field names them before any search. */
    known: ReadonlyMap<string, TaskCandidate>
    /** Someone just ticked: the form names them from then on. */
    remember: (person: TaskCandidate) => void
    me: TaskCandidate | undefined
    candidates: TaskBoardPlace['candidates']
    invalid?: boolean
    describedBy?: string
    disabled?: boolean
}) {
    const { t } = useTranslation('tasks')
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const words = useDebouncedValue(query.trim(), 250)
    const listId = useId()
    const result = useQuery({ ...candidates(words), enabled: open })
    const deleted = t('people.deleted')

    const people = useMemo(() => {
        const others = (result.data ?? []).filter((person) => person.id !== me?.id)
        const mine = me && (!words || folded(`${me.displayName ?? ''} ${me.username ?? ''}`).includes(folded(words)))
        return mine ? [me, ...others] : others
    }, [result.data, me, words])

    const picked = selected.map((personId) => known.get(personId)).filter((person) => person !== undefined)
    const ordered = [
        ...picked.filter((person) => person.id === me?.id),
        ...picked.filter((person) => person.id !== me?.id)
    ]
    const label =
        selected.length === 0
            ? t('form.unassigned')
            : selected.length >= 3
              ? t('form.people', { count: selected.length })
              : ordered.map((person) => nameOf(person, deleted)).join(', ')

    const toggle = (person: TaskCandidate) => {
        remember(person)
        onChange(
            selected.includes(person.id)
                ? selected.filter((personId) => personId !== person.id)
                : [...selected, person.id]
        )
    }
    const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            setActive((index) => Math.min(Math.max(index + step, 0), Math.max(people.length - 1, 0)))
        } else if (event.key === 'Enter' || (event.key === ' ' && query === '')) {
            const person = people[active]
            if (!person) return
            event.preventDefault()
            toggle(person)
        }
    }
    const optionId = (index: number) => `${listId}-${index}`

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (!next) setQuery('')
                setActive(0)
            }}
        >
            <PopoverTrigger asChild>
                <button
                    id={id}
                    type='button'
                    disabled={disabled}
                    data-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    className={cn(
                        'flex h-10 w-full items-center gap-2 rounded-input border border-border-input bg-surface-1 px-3 text-left text-body-sm transition-colors duration-micro hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        'data-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-2',
                        open && 'border-primary'
                    )}
                >
                    <User className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                    {ordered.length > 0 ? <AvatarStack people={ordered} me={me?.id} size={24} /> : null}
                    <span
                        className={cn(
                            'flex-1 truncate',
                            selected.length === 0 ? 'text-text-tertiary' : 'text-text-primary'
                        )}
                    >
                        {label}
                    </span>
                    <ChevronDown className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent className='flex w-[var(--radix-popover-trigger-width)] flex-col gap-1 p-2'>
                <div className='relative'>
                    <Search
                        className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                        aria-hidden='true'
                    />
                    <Input
                        role='combobox'
                        aria-expanded='true'
                        aria-controls={listId}
                        aria-activedescendant={people[active] ? optionId(active) : undefined}
                        aria-label={t('assignee.search')}
                        placeholder={t('assignee.search')}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value)
                            setActive(0)
                        }}
                        onKeyDown={keyDown}
                        className='h-9 pl-9'
                    />
                </div>
                <ul
                    id={listId}
                    role='listbox'
                    aria-multiselectable='true'
                    aria-label={t('form.assignees')}
                    aria-busy={result.isFetching || undefined}
                    className='max-h-[320px] overflow-y-auto'
                >
                    {people.map((person, index) => {
                        const on = selected.includes(person.id)
                        const name = nameOf(person, deleted)
                        return (
                            <li
                                key={person.id}
                                id={optionId(index)}
                                role='option'
                                aria-selected={on}
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => toggle(person)}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return
                                    event.preventDefault()
                                    toggle(person)
                                }}
                                onPointerEnter={() => setActive(index)}
                                className={cn(
                                    'flex cursor-pointer items-center gap-3 rounded-input px-2 py-1.5',
                                    index === active && 'bg-surface-2'
                                )}
                            >
                                <span className='relative shrink-0'>
                                    <Avatar className='size-8'>
                                        <AvatarImage
                                            src={person.avatarUrl ?? undefined}
                                            alt=''
                                            className='object-cover'
                                        />
                                        <AvatarFallback
                                            className={cn(
                                                'text-label font-semibold',
                                                person.id === me?.id
                                                    ? 'bg-primary text-on-primary'
                                                    : 'bg-surface-3 text-text-primary'
                                            )}
                                        >
                                            <AvatarInitial name={person.displayName ?? person.username} />
                                        </AvatarFallback>
                                    </Avatar>
                                    {person.presence ? (
                                        <PresenceDot
                                            presence={person.presence}
                                            cutout={index === active ? 'ring-surface-2' : 'ring-surface-1'}
                                            className='absolute -bottom-0.5 -right-0.5'
                                        />
                                    ) : null}
                                </span>
                                <span className='grid min-w-0 flex-1'>
                                    <span className='truncate text-body-sm text-text-primary'>
                                        {person.id === me?.id ? t('assignee.me', { name }) : name}
                                    </span>
                                    {person.username ? (
                                        <span className='truncate text-label text-text-tertiary'>
                                            {person.username}
                                        </span>
                                    ) : null}
                                </span>
                                {/* The tick as C-24 draws it; the row's aria-selected says it. */}
                                <span
                                    aria-hidden='true'
                                    className={cn(
                                        'flex size-[18px] shrink-0 items-center justify-center rounded-badge border-2',
                                        on ? 'border-primary bg-primary text-on-primary' : 'border-border-input bg-bg'
                                    )}
                                >
                                    {on ? <Check className='size-3.5' strokeWidth={3} /> : null}
                                </span>
                            </li>
                        )
                    })}
                </ul>
                {result.isPending ? (
                    <p role='status' className='px-2 py-1.5 text-label text-text-tertiary'>
                        {t('assignee.loading')}
                    </p>
                ) : result.isError ? (
                    <p role='alert' className='px-2 py-1.5 text-label text-danger'>
                        {t('assignee.loadError')}
                    </p>
                ) : people.length === 0 ? (
                    <p className='px-2 py-1.5 text-label text-text-tertiary'>{t('assignee.none')}</p>
                ) : null}
                <p className='border-t px-2 pt-2 text-label text-text-secondary'>
                    {t('assignee.picked', { count: selected.length })}
                </p>
            </PopoverContent>
        </Popover>
    )
}
