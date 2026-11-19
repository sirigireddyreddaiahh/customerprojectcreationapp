import type { ChangeEvent } from 'react'
import { GlassDropdown } from './GlassDropdown'
type FieldProps = { label: string; required?: boolean; value: string; onChange?: (value: string) => void; options?: string[]; type?: string; readOnly?: boolean; error?: string; placeholder?: string }
export function FormField({ label, required, value, onChange, options, type = 'text', readOnly, error, placeholder }: FieldProps) {
  const change = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange?.(event.target.value)
  return <div className="field"><label>{label} {required && <span className="required">*</span>}</label>{options ? <GlassDropdown value={value} onChange={next => onChange?.(next)} options={options.map(option => ({ value: option, label: option }))} placeholder={placeholder || 'Select'} disabled={readOnly} searchable /> : <input type={type} value={value} readOnly={readOnly} placeholder={placeholder} onChange={change} />}{error && <span className="field-error">{error}</span>}</div>
}
