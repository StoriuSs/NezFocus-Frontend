import { useEffect, useRef } from 'react'
import {
    Fit,
    Layout,
    RuntimeLoader,
    useRive,
    useViewModel,
    useViewModelInstance,
    useViewModelInstanceEnum,
    useViewModelInstanceTrigger
} from '@rive-app/react-canvas-lite'
import riveWasm from '@rive-app/canvas-lite/rive.wasm?url'

// The WebAssembly from this site, not from the CDN Rive uses by default: the
// Content-Security-Policy allows scripts and connections to 'self' only.
RuntimeLoader.setWasmUrl(riveWasm)

/**
 * The moods of the mascot's view model (design/nez-mascot/README.md § 1).
 * `public/mascot/runtime.riv` is nez-mascot's `dist/runtime.riv` at commit
 * dd7060b: copy it again, and update this line, when the mascot changes.
 */
export type MascotMood = 'neutral' | 'happy' | 'wink' | 'focus' | 'surprised' | 'sleepy' | 'confused'

interface RiveMascotProps {
    mood: MascotMood
    wave: boolean
    /** Rive has the file and its view model: from here the canvas shows Runtime. */
    onReady: () => void
    className?: string
}

/**
 * Runtime drawn by Rive (canvas-lite: no text, layout, audio or scripting,
 * none of which the mascot uses). Loaded on its own by Mascot.
 *
 * The contract the app reads by name: artboard `Runtime`, state machine
 * `Main` (playing, or data binding does nothing), view model `Mascot` /
 * instance `Default`, enum `mood`, trigger `wave`.
 */
export default function RiveMascot({ mood, wave, onReady, className }: RiveMascotProps) {
    const { rive, RiveComponent } = useRive({
        src: `${import.meta.env.BASE_URL}mascot/runtime.riv`,
        artboard: 'Runtime',
        stateMachines: 'Main',
        autoplay: true,
        layout: new Layout({ fit: Fit.Contain })
    })
    const viewModel = useViewModel(rive, { name: 'Mascot' })
    const instance = useViewModelInstance(viewModel, { name: 'Default', rive })
    const { setValue: setMood } = useViewModelInstanceEnum('mood', instance)
    const { trigger: fireWave } = useViewModelInstanceTrigger('wave', instance)

    useEffect(() => {
        if (instance) setMood(mood)
    }, [instance, mood, setMood])

    // Once per appearance, as soon as the view model is bound.
    const greeted = useRef(false)
    useEffect(() => {
        if (!instance || greeted.current) return
        greeted.current = true
        if (wave) fireWave()
        onReady()
    }, [instance, wave, fireWave, onReady])

    return <RiveComponent className={className} aria-hidden='true' />
}
