import { useEffect, useId, type ReactNode } from 'react'
import { AtSign, Hash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { SuggestRow, SuggestState } from '../hooks/useMentionBox'

/** At most 8 rows, a heading and the padding, then it scrolls (C-12 › MentionSuggest; frame 360 high). */
const MOST_HIGH = 360

type Group = { name: 'members' | 'roles' | 'everyone' | 'channels'; rows: { row: SuggestRow; index: number }[] }

const groupOf = (row: SuggestRow): Group['name'] =>
    row.kind === 'member'
        ? 'members'
        : row.kind === 'role'
          ? 'roles'
          : row.kind === 'everyone'
            ? 'everyone'
            : 'channels'

/**
 * MentionSuggest (C-12, S-CHAT-01 `mention-suggest`, `mention-suggest-role`):
 * a floating list above the box, as wide as it: "MEMBERS" (avatar 24, name,
 * username), "ROLES" (an `at-sign` in a 24 circle, "{N} members"), then
 * @everyone, or "CHANNELS" after #; rows 40, the one chosen on `surface-2`;
 * at most 8 rows, then it scrolls. "No results" when nothing matches;
 * nothing at all while the people are read the first time. The focus stays
 * in the box (`useMentionBox`): a row is picked on a press without taking
 * it, and pressing the list itself (its scroll bar) keeps it there too. The
 * box is the combobox; the panel is no dialog, only the list's frame.
 *
 * `children` is the box, in a `PopoverAnchor`.
 */
export function MentionSuggest({ state, children }: { state: SuggestState; children: ReactNode }) {
    const { t } = useTranslation('messaging')
    const headingId = useId()
    const { shown, rows, active, listId, optionId } = state

    // The row chosen with ↑ / ↓ stays in view.
    useEffect(() => {
        if (shown) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' })
    }, [shown, active, optionId])

    const groups: Group[] = []
    rows.forEach((row, index) => {
        const name = groupOf(row)
        const last = groups.at(-1)
        if (last?.name === name) last.rows.push({ row, index })
        else groups.push({ name, rows: [{ row, index }] })
    })

    return (
        <Popover open={shown}>
            {children}
            <PopoverContent
                role='presentation'
                side='top'
                align='start'
                onMouseDown={(event) => event.preventDefault()}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                // As wide as the box; inline: one-off sizes, not worth classes in the chat's stylesheet.
                style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: MOST_HIGH, padding: 6 }}
                className='overflow-y-auto'
            >
                <div role='listbox' id={listId} aria-label={t('mention.suggestions')}>
                    {groups.map((group) => (
                        <div
                            key={group.name}
                            role='group'
                            {...(group.name === 'everyone'
                                ? { 'aria-label': '@everyone' }
                                : { 'aria-labelledby': `${headingId}-${group.name}` })}
                        >
                            {group.name === 'everyone' ? null : (
                                <div
                                    id={`${headingId}-${group.name}`}
                                    className='flex h-7 items-center px-2 text-label font-semibold uppercase text-text-tertiary'
                                >
                                    {t(`mention.${group.name}`)}
                                </div>
                            )}
                            {group.rows.map(({ row, index }) => (
                                <Option key={row.key} row={row} index={index} state={state} />
                            ))}
                        </div>
                    ))}
                </div>
                {rows.length === 0 ? (
                    <p className='px-2 py-2 text-body-sm text-text-secondary'>{t('mention.none')}</p>
                ) : null}
            </PopoverContent>
        </Popover>
    )
}

function Option({ row, index, state }: { row: SuggestRow; index: number; state: SuggestState }) {
    const { t } = useTranslation('messaging')
    const chosen = index === state.active
    // What the row says: its name, the line after it, and both read aloud.
    const [name, detail]: [string, string | null] =
        row.kind === 'member'
            ? [row.shown.slice(1), row.person.username]
            : row.kind === 'role'
              ? [row.role.name, t('mention.roleMembers', { count: row.role.memberCount })]
              : row.kind === 'everyone'
                ? ['@everyone', t('mention.everyone')]
                : [row.name, null]
    const label = row.kind === 'channel' ? row.shown : detail ? `${name}, ${detail}` : name

    return (
        <div
            id={state.optionId(index)}
            role='option'
            tabIndex={-1}
            aria-selected={chosen}
            aria-label={label}
            // Mouse down, not click: the box keeps the focus, the cursor where the word was typed (as C-25).
            onMouseDown={(event) => {
                event.preventDefault()
                state.pick(index)
            }}
            onMouseMove={() => !chosen && state.hover(index)}
            // Gap 10 as the frame; inline: a one-off size, not worth a class in the chat's stylesheet.
            style={{ gap: 10 }}
            className={cn('flex h-10 cursor-pointer items-center rounded-input px-2', chosen && 'bg-surface-2')}
        >
            {row.kind === 'member' ? (
                <Avatar className='size-6'>
                    <AvatarImage src={row.person.avatarUrl ?? undefined} alt='' className='object-cover' />
                    <AvatarFallback className='bg-surface-3 text-micro font-semibold text-text-primary'>
                        {name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            ) : (
                <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-secondary'>
                    {row.kind === 'channel' ? (
                        <Hash className='size-3.5' aria-hidden='true' />
                    ) : (
                        <AtSign className='size-3.5' aria-hidden='true' />
                    )}
                </span>
            )}
            <span className='truncate text-body-sm font-medium text-text-primary'>{name}</span>
            {detail ? <span className='truncate text-label text-text-tertiary'>{detail}</span> : null}
        </div>
    )
}
