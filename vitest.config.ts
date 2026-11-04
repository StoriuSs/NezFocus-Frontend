/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        // Valid VITE_* values, so src/config/env.ts accepts the test environment.
        env: {
            VITE_API_URL: 'http://api.test/api/v1'
        },
        include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
        // Half the cores, as the API's Jest does. The default (all but one)
        // ran twelve jsdom workers on a 12-thread laptop, ~1.6 GB at peak,
        // beside Docker and the editor; half takes a few seconds longer.
        maxWorkers: '50%',
        css: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', '**/main.tsx']
        }
    }
})
