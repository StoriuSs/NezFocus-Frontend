import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FormField } from '@/components/form/FormField'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { layoutRule } from '../../../lib/layout-error'
import { ROLE_NAME_MAX_LENGTH, roleNamed, roleNameProblem } from '../../../lib/roles'
import type { Role } from '../../../types'

/** The name's problem, from the field as typed or from the backend's refusal (Q5). */
export type RoleNameProblem = 'length' | 'reserved' | 'taken'

/** What a refused create or rename says about the name (VALIDATION_ERROR `data.rule`), if anything. */
export function nameProblemOf(error: unknown): RoleNameProblem | null {
    const rule = layoutRule(error)?.rule as string | undefined
    if (rule === 'name_invalid') return 'length'
    if (rule === 'name_reserved') return 'reserved'
    if (rule === 'name_taken') return 'taken'
    return null
}

/** Checks a name before sending it: the same rules the backend applies, "taken" from the list at hand. */
export function checkRoleName(typed: string, roles: Role[], exceptId?: string): RoleNameProblem | null {
    return roleNameProblem(typed) ?? (roleNamed(roles, typed, exceptId) ? 'taken' : null)
}

/** "Role name" with its 0/100 counter (C-22) and the line for a refused name. */
export const RoleNameField = forwardRef<
    HTMLInputElement,
    {
        value: string
        onChange: (value: string) => void
        problem: RoleNameProblem | null
        roles: Role[]
        readOnly?: boolean
        /** Esc in the field: drop the draft (as S-SET-01). */
        onEscape?: () => void
    }
>(function RoleNameField({ value, onChange, problem, roles, readOnly, onEscape }, ref) {
    const { t } = useTranslation('servers')
    const length = [...value.normalize('NFC').trim()].length
    const taken = roleNamed(roles, value)?.name ?? value.trim()
    const error =
        problem === 'taken' ? t('roles.name.taken', { name: taken }) : problem ? t(`roles.name.${problem}`) : undefined
    return (
        <FormField
            label={t('roles.name.label')}
            error={error}
            action={
                <span
                    className={cn(
                        'font-numeric tabular-nums',
                        length >= ROLE_NAME_MAX_LENGTH ? 'text-text-secondary' : 'text-text-tertiary'
                    )}
                >
                    {length}/{ROLE_NAME_MAX_LENGTH}
                </span>
            }
        >
            {(field) => (
                <Input
                    {...field}
                    ref={ref}
                    value={value}
                    readOnly={readOnly}
                    autoComplete='off'
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape' && onEscape) {
                            event.preventDefault()
                            onEscape()
                        }
                    }}
                />
            )}
        </FormField>
    )
})
