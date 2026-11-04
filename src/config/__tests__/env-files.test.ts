// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { envSchema } from '../env.schema'

// A new VITE_* variable has to be added in several places, and each one
// forgotten fails somewhere else: a missing Dockerfile ARG or CI build arg
// builds a production image without the value; a setting compose does not pass
// leaves the container without it. These tests name the place that was missed.

const root = resolve(__dirname, '../../..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')

const KEY = '[A-Za-z_][A-Za-z0-9_]*'
const schemaKeys = Object.keys(envSchema.shape)
const requiredKeys = schemaKeys.filter(
    (key) => !envSchema.shape[key as keyof typeof envSchema.shape].safeParse(undefined).success
)

/** The first capture group of every match. */
const captures = (content: string, pattern: RegExp) =>
    [...content.matchAll(pattern)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))

describe('configuration stays in sync', () => {
    // What the build itself needs. The addresses are NOT among them: the
    // container writes them into /config.js at start, so one image runs
    // anywhere (nginx/40-runtime-config.sh).
    const buildValues = ['VITE_SENTRY_RELEASE', 'SENTRY_ORG', 'SENTRY_PROJECT']

    // CI's build arguments are written by hand: one missing from them
    // published an image built without it, and nothing failed.
    it('declares each build value as an ARG in the build stage, and CI passes each one to the image build', () => {
        // An ARG in another stage, or before the first FROM, never reaches the build.
        const stage = /^FROM\s+\S+\s+AS\s+build\s*$([\s\S]*?)(?=^FROM\s)/im.exec(read('Dockerfile'))?.[1] ?? ''
        expect(stage).toContain('pnpm run build')
        const args = captures(stage, new RegExp(`^ARG\\s+(${KEY})`, 'gm'))
        expect(buildValues.filter((key) => !args.includes(key))).toEqual([])

        const jobs = (
            parseYaml(read('.github/workflows/ci.yml')) as {
                jobs: Record<string, { steps?: { with?: { 'build-args'?: string } }[] }>
            }
        ).jobs
        const steps = jobs.image?.steps ?? []
        const buildArgs = steps.map((step) => step.with?.['build-args']).find((value) => value !== undefined) ?? ''
        const passed = captures(buildArgs, new RegExp(`^(${KEY})=`, 'gm'))
        expect(buildValues.filter((key) => !passed.includes(key))).toEqual([])
    })

    it('passes every runtime setting to the container, which checks exactly the schema settings at start', () => {
        const environment = (
            parseYaml(read('docker-compose.prod.yaml')) as {
                services: { app: { environment: Record<string, string> } }
            }
        ).services.app.environment
        expect([...schemaKeys, 'CSP_IMG_SRC'].filter((key) => environment[key] === undefined)).toEqual([])
        // `${NAME:?…}`: compose stops with the message rather than starting a
        // container that would refuse to serve anyway.
        for (const key of requiredKeys) expect(environment[key]).toMatch(new RegExp(`^\\\${${key}:\\?`))

        const checked = captures(read('nginx/40-runtime-config.sh'), new RegExp(`checked (${KEY}) `, 'g'))
        expect([...new Set(checked)].sort()).toEqual([...schemaKeys].sort())
    })
})
