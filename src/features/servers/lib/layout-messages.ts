import '@/i18n/servers'
import type { TFunction } from 'i18next'
import { getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'
import { clashingChannel, nameProblem, storedName, type ChannelType } from './channel-layout'
import { layoutRule } from './layout-error'
import type { Server } from '../types'

/** What the name is of: a text channel, a room, or a category. */
export type NameKind = ChannelType | 'category'

type T = TFunction<'servers'>

const categoryLabel = (server: Pick<Server, 'categories'>, categoryId: string | null) =>
    server.categories.find((c) => c.id === categoryId)?.name.toLocaleUpperCase('vi') ?? ''

/** "THÔNG TIN đã có kênh #tai-lieu", "Trên cùng danh sách đã có phòng …", "Server đã có danh mục …" (S-SRV-05). */
export function takenMessage(t: T, server: Server, kind: NameKind, categoryId: string | null, name: string): string {
    if (kind === 'category') return t('layoutError.takenCategory', { name: name.toLocaleUpperCase('vi') })
    const suffix = kind === 'text' ? 'Text' : 'Voice'
    return categoryId === null
        ? t(`layoutError.takenTop${suffix}`, { name })
        : t(`layoutError.taken${suffix}`, { category: categoryLabel(server, categoryId), name })
}

/**
 * The name's problem as the field shows it, checked before any request:
 * its length, nothing left of a text channel's name, or a clash in the group
 * among the channels one can see (the backend checks the rest).
 */
export function nameError(
    t: T,
    server: Server,
    kind: NameKind,
    typed: string,
    categoryId: string | null,
    exceptId?: string
): string | null {
    const problem = nameProblem(kind, typed)
    if (problem === 'noLetterOrDigit') return t('layoutError.noLetterOrDigit')
    if (problem)
        return t(
            kind === 'text'
                ? 'layoutError.lengthText'
                : kind === 'voice'
                  ? 'layoutError.lengthVoice'
                  : 'layoutError.lengthCategory'
        )

    const name = storedName(kind, typed)
    if (kind === 'category') {
        const clash = server.categories.find(
            (c) => c.id !== exceptId && c.name.normalize('NFC').toLowerCase() === name.toLowerCase()
        )
        return clash ? takenMessage(t, server, kind, null, clash.name) : null
    }
    const clash = clashingChannel(server, categoryId, kind, name, exceptId)
    return clash ? takenMessage(t, server, kind, categoryId, clash.name) : null
}

/** Where a refused change shows its reason. */
export interface LayoutFailure {
    /** Under the name field. */
    field?: string
    /** Above the buttons: `neutral` for the limit, `danger` otherwise. */
    form?: { tone: 'neutral' | 'danger'; text: string; icon?: 'wifi-off' }
    /** The server, channel or category is no longer there: close and say so. */
    gone?: boolean
}

export function describeFailure(
    t: T,
    error: unknown,
    context: { server: Server; kind: NameKind; categoryId: string | null; typed: string; creating: boolean }
): LayoutFailure {
    const type = getApiErrorType(error)
    if (type === NETWORK_ERROR) {
        const text = t(context.creating ? 'layoutError.createOffline' : 'layoutError.saveOffline')
        return { form: { tone: 'danger', text, icon: 'wifi-off' } }
    }
    if (type === 'NOT_FOUND_ERROR') return { gone: true }
    if (type === 'FORBIDDEN_ERROR') return { form: { tone: 'danger', text: t('layoutError.forbidden') } }

    const broken = layoutRule(error)
    if (broken?.rule === 'limit') return { form: { tone: 'neutral', text: t('layoutError.limit') } }
    if (broken?.rule === 'name_taken') {
        const name = storedName(context.kind, context.typed)
        return { field: takenMessage(t, context.server, context.kind, context.categoryId, name) }
    }
    if (broken?.rule === 'name_invalid') {
        return {
            field:
                nameError(t, context.server, context.kind, context.typed, context.categoryId) ??
                t('layoutError.lengthText')
        }
    }
    const text = t(context.creating ? 'layoutError.createFailed' : 'layoutError.saveFailed')
    return { form: { tone: 'danger', text } }
}
