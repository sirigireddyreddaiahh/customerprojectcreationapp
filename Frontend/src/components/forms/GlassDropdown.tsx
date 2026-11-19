import { useEffect, useMemo, useRef, useState } from 'react'

export type GlassDropdownOption = { value: string; label: string }

type GlassDropdownProps = {
  value: string
  options: GlassDropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  searchable?: boolean
  selectedLabel?: string
}

export function GlassDropdown({ value, options, onChange, placeholder = 'Select', searchPlaceholder = 'Search...', disabled, searchable = true, selectedLabel }: GlassDropdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [openUpwards, setOpenUpwards] = useState(false)
  const [search, setSearch] = useState('')
  const selected = useMemo(() => options.find(option => option.value === value) || null, [options, value])
  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return options
    const query = search.trim().toLowerCase()
    return options.filter(option => option.label.toLowerCase().includes(query))
  }, [options, search, searchable])

  useEffect(() => {
    if (!open) return
    const onDocumentClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open])
  useEffect(() => { if (!open) setSearch('') }, [open])

  const toggleMenu = () => {
    if (disabled) return
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setOpenUpwards(spaceBelow < 310 && rect.top > spaceBelow)
    }
    setOpen(current => !current)
  }

  return <div className={`glass-dropdown ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} ref={rootRef}>
    <button type="button" className="glass-dropdown-trigger" onClick={toggleMenu} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}>
      <span className={`glass-dropdown-trigger-label ${selected || selectedLabel ? '' : 'placeholder'}`}>{selected?.label || selectedLabel || placeholder}</span>
      <span className="glass-dropdown-trigger-caret" aria-hidden="true">⌄</span>
    </button>
    {open && <div className={`glass-dropdown-panel ${openUpwards ? 'open-upwards' : ''}`} role="listbox">
      {searchable && <div className="glass-dropdown-search-wrap"><input className="glass-dropdown-search" placeholder={searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} /></div>}
      <div className="glass-dropdown-list">
        {filtered.map(option => {
          const isActive = option.value === value
          return <button key={`${option.value}-${option.label}`} type="button" className={`glass-dropdown-option ${isActive ? 'active' : ''}`} onClick={() => { onChange(option.value); setOpen(false) }}>
            <span className="glass-dropdown-option-label">{option.label}</span>
            <span className="glass-dropdown-option-check" aria-hidden="true">{isActive ? '✓' : ''}</span>
          </button>
        })}
        {!filtered.length && <div className="glass-dropdown-empty">No matching options</div>}
      </div>
    </div>}
  </div>
}
