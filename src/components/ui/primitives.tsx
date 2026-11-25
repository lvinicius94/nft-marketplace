/**
 * shadcn/ui-style wrappers over Radix primitives, restyled with the Kurio tokens.
 */
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as SliderPrimitive from '@radix-ui/react-slider'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- Label ----------
export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  ({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn('text-sm text-cream', className)} {...props} />,
)
Label.displayName = 'Label'

// ---------- Skeleton ----------
/** Shimmer placeholder; animation is disabled under prefers-reduced-motion (see styles.css). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton rounded-[4px]', className)} {...props} />
}

// ---------- Dialog ----------
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />,
)
DialogTitle.displayName = 'DialogTitle'
export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted', className)} {...props} />,
)
DialogDescription.displayName = 'DialogDescription'

/** Radix traps focus inside and restores it on close; Escape and the close button dismiss it. */
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean; side?: 'center' | 'left' | 'bottom' }
>(({ className, children, hideClose, side = 'center', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 bg-surface text-cream shadow-2xl focus:outline-none',
        side === 'center' && 'left-1/2 top-1/2 max-h-[92dvh] w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-b-8 border-accent',
        side === 'left' && 'inset-y-0 left-0 w-[88%] max-w-sm overflow-y-auto border-r border-line',
        side === 'bottom' && 'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line',
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded p-1 text-accent-strong hover:bg-surface-2" aria-label="Fechar">
          <X className="size-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = 'DialogContent'

// ---------- Tabs ----------
export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => <TabsPrimitive.List ref={ref} className={cn('flex gap-6 border-b border-line', className)} {...props} />,
)
TabsList.displayName = 'TabsList'
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        '-mb-px border-b-2 border-transparent pb-2 text-sm font-semibold text-cream data-[state=active]:border-accent-strong data-[state=active]:text-accent-strong md:text-base',
        className,
      )}
      {...props}
    />
  ),
)
TabsTrigger.displayName = 'TabsTrigger'

// ---------- Slider ----------
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabels?: string[] }
>(({ className, thumbLabels = [], ...props }, ref) => (
  <SliderPrimitive.Root ref={ref} className={cn('relative flex h-5 w-full touch-none select-none items-center', className)} {...props}>
    <SliderPrimitive.Track className="relative h-1 w-full grow rounded-full bg-accent/40">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
    </SliderPrimitive.Track>
    {(props.value ?? props.defaultValue ?? []).map((_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        aria-label={thumbLabels[i]}
        className="block size-4 rounded-full border-2 border-ink bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
      />
    ))}
  </SliderPrimitive.Root>
))
Slider.displayName = 'Slider'

// ---------- Radio ----------
export const RadioGroup = React.forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Root>, React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>>(
  ({ className, ...props }, ref) => <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-3', className)} {...props} />,
)
RadioGroup.displayName = 'RadioGroup'
export const RadioGroupItem = React.forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Item>, React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn('grid size-4 shrink-0 place-items-center rounded-full border-2 border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong disabled:opacity-50', className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-accent" />
    </RadioGroupPrimitive.Item>
  ),
)
RadioGroupItem.displayName = 'RadioGroupItem'

// ---------- Checkbox ----------
export const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn('grid size-4 shrink-0 place-items-center rounded-full border-2 border-accent data-[state=checked]:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong', className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3 text-ink" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  ),
)
Checkbox.displayName = 'Checkbox'
