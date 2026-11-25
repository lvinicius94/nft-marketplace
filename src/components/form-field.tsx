import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './ui/input'
import { Label } from './ui/primitives'

interface FieldProps {
  id: string
  label?: string
  /** Visually hidden label (layout shows only placeholders). */
  srLabel?: boolean
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string; required?: boolean }) => React.ReactNode
}

/** Label + control + error message, wired with aria-invalid / aria-describedby. */
export function Field({ id, label, srLabel, required, error, hint, className, children }: FieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('grid gap-2', className)}>
      {label && (
        <Label htmlFor={id} className={cn(srLabel && 'sr-only')}>
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-accent-strong">
              *
            </span>
          )}
        </Label>
      )}
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy, required })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} className="pr-10" {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-cream"
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
      >
        {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'

/** Turns API field errors (e.g. "buyer.email") into a flat map for a form. */
export function fieldErrors(fields: Record<string, string> | undefined, prefix = ''): Record<string, string> {
  if (!fields) return {}
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k, v]))
}
