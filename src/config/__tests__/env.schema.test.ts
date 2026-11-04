import { describe, it, expect } from 'vitest'
import { describeEnvProblems, envSchema } from '../env.schema'

describe('env schema', () => {
    // A Docker build with an unset build arg passes an empty string, which
    // used to fall back to localhost defaults and ship. A trailing slash breaks
    // every link built from the address.
    it('refuses a missing API address, and drops a trailing slash from one given', () => {
        expect(describeEnvProblems({ VITE_API_URL: undefined })).toContain('VITE_API_URL')
        expect(describeEnvProblems({ VITE_API_URL: '' })).toContain('VITE_API_URL')
        expect(envSchema.parse({ VITE_API_URL: 'https://api.example.com/api/v1/' }).VITE_API_URL).toBe(
            'https://api.example.com/api/v1'
        )
    })
})
