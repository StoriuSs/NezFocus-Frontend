import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type KeyboardEvent,
    type RefObject,
    type SyntheticEvent
} from 'react'
import { useMentionSuggestions } from '../api/useMentionSuggestions'
import { applyEdit, insertMention, shownText, typedMention, type ComposerNames } from '../lib/mention-text'
import { startsAWord } from '../lib/mentions'
import type { MentionPerson, MentionRole, MentionSource } from '../types'

/** One row of the suggestions (C-12 › MentionSuggest): what it puts in the text, and how it shows. */
export type SuggestRow =
    | { kind: 'member'; key: string; token: string; shown: string; person: MentionPerson }
    | { kind: 'role'; key: string; token: string; shown: string; role: MentionRole }
    | { kind: 'everyone'; key: string; token: string; shown: string }
    | { kind: 'channel'; key: string; token: string; shown: string; name: string }

/** What the suggestions list draws, and what it does. */
export interface SuggestState {
    /** On screen: an @ or # being typed, not closed with Esc, and something to show (rows, or "No results"). */
    shown: boolean
    rows: SuggestRow[]
    active: number
    listId: string
    optionId: (index: number) => string
    pick: (index: number) => void
    hover: (index: number) => void
}

/**
 * A text box that writes mentions (C-12, REQ-MSG-03): it shows the names of
 * the mentions picked and holds their tokens (`mention-text.ts`), and after
 * an @ or # being typed suggests people (never oneself), roles one may
 * mention, @everyone (MENTION_EVERYONE only, last) or channels, whose name
 * or a word of it starts with what follows. ↑ / ↓ choose, Enter or Tab
 * picks, Esc closes until that word is done; a click picks too, the cursor
 * staying in the box. Presence comes with L7: people go by name until then.
 *
 * The box is a combobox (WAI-ARIA 1.2; owner, 14/11/2026): `aria-expanded`
 * while the list is on screen, which it names (`aria-controls`) with the row
 * chosen (`aria-activedescendant`). While nothing is on screen (the people
 * read the first time) the keys are the box's own: Enter sends, Esc stops a
 * reply or an edit.
 */
export function useMentionBox({
    box,
    text,
    names,
    onChange,
    source,
    me,
    mentionEveryone
}: {
    box: RefObject<HTMLTextAreaElement | null>
    /** As it will be sent, mentions as tokens. */
    text: string
    names: ComposerNames
    onChange: (text: string, names: ComposerNames) => void
    source: MentionSource
    me: string | undefined
    mentionEveryone: boolean
}) {
    /** Where the cursor is, while the box has it and nothing is selected. */
    const [caret, setCaret] = useState<number | null>(null)
    /** The word closed with Esc: where its @ or # is. */
    const [closed, setClosed] = useState<number | null>(null)
    const [choice, setChoice] = useState({ list: '', index: 0 })
    /** Where a pick puts the cursor, and how many picks so far: the box may show the same words after one. */
    const moveTo = useRef<number | null>(null)
    const [picks, setPicks] = useState(0)
    const listId = useId()

    const typed = caret === null ? null : typedMention(text, names, caret)
    const open = typed !== null && typed.start !== closed
    useEffect(() => {
        if (closed !== null && typed?.start !== closed) setClosed(null)
    }, [closed, typed?.start])

    const query = typed?.query ?? ''
    const suggested = useMentionSuggestions(source, query, open && typed.trigger === '@')

    const rows = useMemo<SuggestRow[]>(() => {
        if (!open) return []
        if (typed.trigger === '#') {
            return source.channels
                .filter((channel) => startsAWord(channel.name, query))
                .map((channel) => ({
                    kind: 'channel',
                    key: channel.id,
                    token: `<#${channel.id}>`,
                    shown: `#${channel.name}`,
                    name: channel.name
                }))
        }
        const found: SuggestRow[] = (suggested.people ?? [])
            .filter(
                (person) =>
                    person.id !== me &&
                    (startsAWord(person.displayName ?? '', query) || startsAWord(person.username ?? '', query))
            )
            .map((person) => ({
                kind: 'member',
                key: person.id,
                token: `<@${person.id}>`,
                shown: `@${person.displayName ?? person.username ?? ''}`,
                person
            }))
        for (const role of suggested.roles ?? []) {
            if (startsAWord(role.name, query))
                found.push({ kind: 'role', key: role.id, token: `<@&${role.id}>`, shown: `@${role.name}`, role })
        }
        if (mentionEveryone && startsAWord('everyone', query))
            found.push({ kind: 'everyone', key: 'everyone', token: '@everyone', shown: '@everyone' })
        return found
    }, [open, typed?.trigger, query, source.channels, suggested.people, suggested.roles, me, mentionEveryone])

    // Nothing on screen while the people are read the first time and nothing else matches.
    const shown = open && !(suggested.loading && rows.length === 0)
    const list = typed ? `${typed.start}:${query}` : ''
    const active = choice.list === list ? Math.min(choice.index, Math.max(rows.length - 1, 0)) : 0
    const optionId = useCallback((index: number) => `${listId}-${index}`, [listId])

    // The cursor where a pick left it, once the box shows the new text.
    const value = shownText(text, names)
    useLayoutEffect(() => {
        const at = moveTo.current
        const field = box.current
        if (at === null || !field) return
        moveTo.current = null
        field.setSelectionRange(at, at)
        setCaret(at)
    }, [value, picks, box])

    const pick = (index: number) => {
        const row = rows[index]
        if (!row || !typed || caret === null) return
        const next = insertMention(text, names, typed, caret, row.token, row.shown)
        moveTo.current = next.caret
        setPicks((count) => count + 1)
        onChange(next.markup, next.names)
        box.current?.focus()
    }

    /** Where the cursor is now; none while text is selected (nothing is being typed then). */
    const readCaret = (field: HTMLTextAreaElement) =>
        setCaret(field.selectionStart === field.selectionEnd ? field.selectionStart : null)

    return {
        /** What the box shows. */
        value,
        change: (event: ChangeEvent<HTMLTextAreaElement>) => {
            const field = event.target
            onChange(applyEdit(text, names, field.value, field.selectionStart), names)
            readCaret(field)
        },
        select: (event: SyntheticEvent<HTMLTextAreaElement>) => readCaret(event.currentTarget),
        /** The box lost the focus: nothing is being typed there any more. */
        leave: () => setCaret(null),
        /** Whether the key went to the suggestions: the box does nothing more with it then. */
        keyDown: (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
            if (!shown || !typed || event.nativeEvent.isComposing) return false
            if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setClosed(typed.start)
                return true
            }
            if (rows.length === 0) return false
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const step = event.key === 'ArrowDown' ? 1 : -1
                setChoice({ list, index: (active + step + rows.length) % rows.length })
                return true
            }
            if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
                event.preventDefault()
                pick(active)
                return true
            }
            return false
        },
        /** For the box: a combobox, the list it controls while on screen, and the row chosen. */
        aria: {
            role: 'combobox' as const,
            'aria-autocomplete': 'list' as const,
            'aria-expanded': shown,
            'aria-controls': shown ? listId : undefined,
            'aria-activedescendant': shown && rows.length > 0 ? optionId(active) : undefined
        },
        suggest: {
            shown,
            rows,
            active,
            listId,
            optionId,
            pick,
            hover: (index: number) => setChoice({ list, index })
        } satisfies SuggestState
    }
}
