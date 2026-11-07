import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

/**
 * Slider (C-35): a 4-high track, `primary` up to the value and `surface-3`
 * after it; a 16 knob in `text-primary` ringed with `surface-1`. The ring of
 * keyboard focus is the usual `primary` one.
 */
const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        className={cn('relative flex h-4 w-full touch-none select-none items-center', className)}
        {...props}
    >
        <SliderPrimitive.Track className='relative h-1 w-full grow overflow-hidden rounded-full bg-surface-3'>
            <SliderPrimitive.Range className='absolute h-full bg-primary' />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className='block size-4 rounded-full border-2 border-surface-1 bg-text-primary transition-colors duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none' />
    </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
