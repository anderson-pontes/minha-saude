import { cloneElement, useId } from 'react'
import type { ReactElement } from 'react'

export function Field({ label, children, error, hint, required = false }: {
  label: string; children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; 'aria-required'?: boolean }>;
  error?: string | null; hint?: string; required?: boolean;
}) {
  const id = useId()
  return <div className="field">
    <label htmlFor={id} className={required ? 'required-field-label' : undefined}>{label}</label>
    {cloneElement(children, { id, 'aria-required': required || undefined, 'aria-invalid': !!error, 'aria-describedby': error || hint ? `${id}-help` : undefined })}
    {(error || hint) && <span id={`${id}-help`} className={error ? 'field-error' : 'field-hint'}>{error || hint}</span>}
  </div>
}
