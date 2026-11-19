import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx-js-style'
import type { DialogState } from '../components/dialogs/Dialog'
import { ApiError } from '../config/api'
import { DataTable } from '../components/tables/DataTable'
import { SettingsIcon } from '../components/SettingsIcon'
import { projectService, type CreateDemandRequest as DemandRequest, type Option, type SapDemandDeleteKey, type WorkPackageDemandDetailsResponse } from '../services/projectService'
import type { SelectedWorkPackage } from './ProjectWorkspace'
import './ProjectWorkspace.css'

type RevenueRateDraft = { amount: string; currency: string }
type CreateDemandRequest = DemandRequest & { revenueRateDraft?: RevenueRateDraft }

type DemandType = CreateDemandRequest['type']
type ExchangeRateValue = { rate: number; quotation: 'direct' | 'indirect' }
const RevenueExchangeRates = createContext<{ projectCurrency: string; rates: Record<string, ExchangeRateValue> }>({ projectCurrency: '', rates: {} })
type WorkspaceSaveRequest = { register: (save: () => Promise<boolean | void>) => void }
type WorkspaceDirtyRequest = { register: (check: () => boolean) => void }
const blank = (type: DemandType, workPackage?: SelectedWorkPackage | null): CreateDemandRequest => ({ projectId: workPackage?.projectId || '', workPackageId: workPackage?.id || '', workPackageName: workPackage?.name || '', workPackageType: workPackage?.type || '', type, resourceId: '', effort: '', skills: '', deliveryServiceOrg: '', expenseRevenue: '', billingControlCategory: workPackage?.type === 'service' ? 'Non-Billable' : 'Billable', workitem: '', expenseCost: '', currency: workPackage?.currency || '' })
const labels: Record<DemandType, string> = { team: 'Team', additional: 'Additional Resources', expense: 'Expenses' }
type DetailColumn = { key: string; label: string; optionLabel?: string }

function useDetailColumns(columns: DetailColumn[]) {
  const signature = columns.map(column => column.key).join('|')
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => columns.map(column => column.key))
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() => columns.map(column => column.key))
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [draftVisible, setDraftVisible] = useState<string[]>([])
  const [draftOrder, setDraftOrder] = useState<string[]>([])
  useEffect(() => {
    const keys = signature ? signature.split('|') : []
    setVisibleKeys(keys)
    setOrderedKeys(keys)
  }, [signature])
  const orderedColumns = orderedKeys.map(key => columns.find(column => column.key === key)).filter((column): column is DetailColumn => Boolean(column))
  const shownColumns = orderedColumns.filter(column => visibleKeys.includes(column.key))
  const openSettings = () => { setDraftVisible([...visibleKeys]); setDraftOrder([...orderedKeys]); setSearch(''); setModalOpen(true) }
  const closeSettings = (save: boolean) => {
    if (save) { setVisibleKeys(draftVisible); setOrderedKeys(draftOrder) }
    setModalOpen(false)
  }
  const toggleDraft = (key: string) => setDraftVisible(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])
  const moveDraft = (from: string, to: string) => setDraftOrder(current => { const next = [...current]; const fromIndex = next.indexOf(from); const toIndex = next.indexOf(to); if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current; next.splice(fromIndex, 1); next.splice(toIndex, 0, from); return next })
  const searched = draftOrder.map(key => columns.find(column => column.key === key)).filter((column): column is DetailColumn => column !== undefined && (column.optionLabel || column.label).toLowerCase().includes(search.trim().toLowerCase()))
  const settingsButton = <button type="button" className="billing-column-settings detail-column-settings app-settings-button" onClick={openSettings} aria-label={`Select and reorder ${columns.length ? 'table' : 'detail'} fields`} title="Table settings"><SettingsIcon /></button>
  const settingsDialog = modalOpen && typeof document !== 'undefined' && createPortal(<div className="column-modal-backdrop" role="presentation" onMouseDown={() => closeSettings(false)}><div className="column-modal billing-column-modal demand-column-modal" role="dialog" aria-modal="true" aria-label="Choose and order table columns" onMouseDown={event => event.stopPropagation()}><div className="column-modal-header"><h2>Columns</h2><button className="column-reset" type="button" onClick={() => { setDraftVisible(columns.map(column => column.key)); setDraftOrder(columns.map(column => column.key)); setSearch('') }}>Reset</button></div><div className="column-search"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search columns" autoFocus /><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></div><label className="column-select-all"><input type="checkbox" checked={draftVisible.length === columns.length} onChange={event => setDraftVisible(event.target.checked ? columns.map(column => column.key) : [])} /><strong>Select All</strong><span>Columns ({draftVisible.length}/{columns.length})</span></label><div className="column-list">{searched.map(column => <div className={`column-choice${draftVisible.includes(column.key) ? ' selected' : ''}`} key={column.key} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', column.key); event.dataTransfer.effectAllowed = 'move' }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); moveDraft(event.dataTransfer.getData('text/plain'), column.key) }}><label><input type="checkbox" checked={draftVisible.includes(column.key)} onChange={() => toggleDraft(column.key)} /><span>{column.optionLabel || column.label}</span></label></div>)}{!searched.length && <div className="column-empty">No matching columns</div>}</div><div className="column-modal-actions"><button className="primary" type="button" onClick={() => closeSettings(true)}>OK</button><button className="text-button" type="button" onClick={() => closeSettings(false)}>Cancel</button></div></div></div>, document.body)
  return { shownColumns, settingsButton, settingsDialog }
}
const roleNames: Record<string, string> = {
  T001: 'Resource-Time',
  T002: 'Sr Tech Architect',
  T003: 'Technical Architect',
  T004: 'Java FS Sr Developer',
  T005: 'Java Full Stack Lead',
  T006: 'Java Full Stack Dev',
  T007: 'App Architect',
  T008: 'Sr App Architect',
  T009: 'Slowflake Architect',
  T010: 'BigData Sr Developer',
  T011: 'BigData Lead Dev',
  T013: 'Technical Director',
}
const roleNameFor = (item: CreateDemandRequest) => {
  const code = String(item.roleName || item.resourceId || '').trim().toUpperCase()
  return roleNames[code] || item.roleName || item.resourceId || 'Resource-Time'
}

type StaffedResource = { id: string; name: string; effort: string; allocation?: string; billing?: string; assignmentPeriod?: string }

function teamGroupKey(item: CreateDemandRequest) {
  const localCreateId = item.resourceDemandId?.split('|').find(id => id.startsWith('pending-create-') || id.startsWith('saved-local-')) || ''
  return JSON.stringify([
    item.roleName || item.resourceId,
    item.deliveryServiceOrg || item.deliveryServiceOrgName,
    item.workitem || '',
    item.billingControlCategory?.toLowerCase().includes('non') ? 'Non-Billable' : 'Billable',
    localCreateId,
  ])
}

function groupTeamRows(items: CreateDemandRequest[]) {
  const groups = new Map<string, CreateDemandRequest>()
  for (const item of items) {
    const key = teamGroupKey(item)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...item, staffedResources: [...(item.staffedResources || [])] })
      continue
    }

    const effort = numeric(existing.effort) + numeric(item.effort)
    const cost = numeric(existing.expenseCost) + numeric(item.expenseCost)
    const revenue = numeric(existing.expenseRevenue) + numeric(item.expenseRevenue)
    const savedCostPerHour = numeric(existing.costPerHour) > 0 ? existing.costPerHour : item.costPerHour
    const savedRevenuePerHour = numeric(existing.revenuePerHour) > 0 ? existing.revenuePerHour : item.revenuePerHour
    const fallbackStaffedEffort = numeric(existing.staffedEffort) + numeric(item.staffedEffort)
    const resources = [...(existing.staffedResources || [])]
    for (const resource of item.staffedResources || []) {
      if (!resources.some(current => (current.id && current.id === resource.id) || (!current.id && current.name === resource.name))) resources.push(resource)
    }

    groups.set(key, {
      ...existing,
      resourceDemandId: [existing.resourceDemandId, item.resourceDemandId].filter(Boolean).join('|') || undefined,
      sapDeleteKeys: [...(existing.sapDeleteKeys || []), ...(item.sapDeleteKeys || [])],
      effort: String(effort),
      expenseCost: String(cost),
      expenseRevenue: String(revenue),
      costPerHour: savedCostPerHour,
      revenuePerHour: effort ? String(revenue / effort) : savedRevenuePerHour,
      staffedEffort: String(resources.length ? resources.reduce((total, resource) => total + numeric(resource.effort), 0) : fallbackStaffedEffort),
      staffedResources: resources,
    })
  }
  return [...groups.values()]
}

function allocateWholeEffort(total: number, members: CreateDemandRequest[]) {
  const wholeTotal = Math.round(total)
  const existingTotal = members.reduce((sum, member) => sum + Math.max(0, numeric(member.effort)), 0)
  const shares = members.map(member => existingTotal > 0
    ? Math.max(0, numeric(member.effort)) / existingTotal
    : 1 / Math.max(members.length, 1))
  const exact = shares.map(share => wholeTotal * share)
  const allocated = exact.map(Math.floor)
  let remainder = wholeTotal - allocated.reduce((sum, value) => sum + value, 0)
  const priority = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let index = 0; index < remainder; index += 1) allocated[priority[index % priority.length].index] += 1
  return allocated
}

function allocatePositiveWholeEffort(total: number, members: CreateDemandRequest[]) {
  const wholeTotal = Math.round(total)
  if (!members.length || wholeTotal < members.length) return undefined
  const remainder = wholeTotal - members.length
  const existingTotal = members.reduce((sum, member) => sum + Math.max(0, numeric(member.effort)), 0)
  const shares = members.map(member => existingTotal > 0
    ? Math.max(0, numeric(member.effort)) / existingTotal
    : 1 / members.length)
  const exact = shares.map(share => remainder * share)
  const allocated = exact.map(value => 1 + Math.floor(value))
  let left = wholeTotal - allocated.reduce((sum, value) => sum + value, 0)
  const priority = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let index = 0; index < left; index += 1) allocated[priority[index % priority.length].index] += 1
  return allocated
}

function groupAdditionalRows(items: CreateDemandRequest[]) {
  const groups = new Map<string, CreateDemandRequest>()
  for (const item of items) {
    const key = JSON.stringify([
      item.resourceId || item.roleName,
      item.deliveryServiceOrg || item.deliveryServiceOrgName,
      item.workitem || '',
      item.billingControlCategory?.toLowerCase().includes('non') ? 'Non-Billable' : 'Billable',
      item.currency,
    ])
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...item })
      continue
    }
    groups.set(key, {
      ...existing,
      resourceDemandId: [existing.resourceDemandId, item.resourceDemandId].filter(Boolean).join('|') || undefined,
      sapDeleteKeys: [...(existing.sapDeleteKeys || []), ...(item.sapDeleteKeys || [])],
      effort: String(numeric(existing.effort) + numeric(item.effort)),
      expenseCost: String(numeric(existing.expenseCost) + numeric(item.expenseCost)),
      expenseRevenue: String(numeric(existing.expenseRevenue) + numeric(item.expenseRevenue)),
    })
  }
  return [...groups.values()]
}

function groupExpenseRows(items: CreateDemandRequest[]) {
  const groups = new Map<string, CreateDemandRequest>()
  for (const item of items) {
    const localCreateId = item.resourceDemandId?.split('|').find(id => id.startsWith('pending-create-') || id.startsWith('saved-local-')) || ''
    const key = JSON.stringify([
      item.resourceId || item.roleName,
      item.deliveryServiceOrg,
      item.billingControlCategory?.toLowerCase().includes('non') ? 'Non-Billable' : 'Billable',
      item.currency,
      localCreateId,
    ])
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...item })
      continue
    }

    groups.set(key, {
      ...existing,
      resourceDemandId: [existing.resourceDemandId, item.resourceDemandId].filter(Boolean).join('|') || undefined,
      sapDeleteKeys: [...(existing.sapDeleteKeys || []), ...(item.sapDeleteKeys || [])],
      expenseCost: String(numeric(existing.expenseCost) + numeric(item.expenseCost)),
      expenseRevenue: String(numeric(existing.expenseRevenue) + numeric(item.expenseRevenue)),
    })
  }
  return [...groups.values()]
}

function EditableCell({ editable, value, onChange, type = 'text', step = 'any' }: { editable: boolean; value: string; onChange: (value: string) => void; type?: 'text' | 'number'; step?: number | 'any' }) {
  const displayValue = type === 'number' && value !== '' && Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 100) / 100) : value
  return editable ? <input className="team-cell-input" type={type} step={type === 'number' ? step : undefined} value={displayValue} onChange={event => onChange(event.target.value)} /> : <>{displayValue ? type === 'number' ? formatNumber(Number(displayValue)) : displayValue : '-'}</>
}

function DemandRevenueInput({ item, label, onChange }: { item: CreateDemandRequest; label: string; onChange: (rate: RevenueRateDraft | undefined) => void }) {
  const { projectCurrency, rates } = useContext(RevenueExchangeRates)
  const amount = (item.type === 'expense' ? item.expenseRevenue : item.revenuePerHour) || '0'
  const displayed = convertedMoney(numeric(amount), item.revenueCurrency || item.currency, projectCurrency, rates, projectCurrency)
  const displayedAmount = String(Math.round(displayed.amount * 100) / 100)
  const draft = item.revenueRateDraft
  const displayedDraft = draft && convertedMoney(numeric(draft.amount), draft.currency, projectCurrency, rates, projectCurrency)
  const currency = displayedDraft?.currency || displayed.currency
  const draftAmount = draft && displayedDraft && draft.currency !== displayedDraft.currency && draft.amount !== ''
    ? String(Math.round(displayedDraft.amount * 100) / 100)
    : draft?.amount
  return <span className="expense-money-edit">
    <input
      aria-label={label}
      className="team-cell-input demand-money-input"
      type="number"
      min="0"
      step="any"
      value={draftAmount ?? displayedAmount}
      onChange={event => {
        const value = event.target.value
        onChange(value !== '' && Number(value) === Number(displayedAmount) && currency === displayed.currency ? undefined : { amount: value, currency })
      }}
    />
    <span className="expense-money-currency">{currency}</span>
  </span>
}

function WorkItemPicker({ editable, value, options, onChange }: { editable: boolean; value: string; options: WorkPackageDemandDetailsResponse['workItems']; onChange: (value: string) => void }) {
  const choices = [...new Map(options.filter(item => item.workItem && item.workItem !== 'USR1').map(item => [item.workItem, item])).values()]
  const selected = choices.find(item => item.workItem === value)
  if (!editable) return <>{selected?.workItemName?.trim() || '-'}</>
  return <SearchableTableDropdown
    value={value}
    options={[
      { value: '', label: 'Select work item' },
      ...choices.map(item => ({
        value: item.workItem,
        label: item.workItemName?.trim() ? `${item.workItem} - ${item.workItemName.trim()}` : item.workItem,
      })),
    ]}
    placeholder="Select work item"
    searchPlaceholder="Search work items..."
    emptyMessage="No work items found"
    onChange={onChange}
  />
}

function calculatedMargin(cost?: string, revenue?: string) {
  const costAmount = numeric(cost)
  const revenueAmount = numeric(revenue)
  if (revenueAmount <= 0) return 0
  return ((revenueAmount - costAmount) / revenueAmount) * 100
}

function SearchableTableDropdown({ value, options, placeholder, searchPlaceholder, emptyMessage, onChange, panelWidth }: { value: string; options: Array<{ value: string; label: string }>; placeholder: string; searchPlaceholder: string; emptyMessage: string; onChange: (value: string) => void; panelWidth?: number }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const selected = options.find(option => option.value === value)
  const query = search.trim().toLowerCase()
  const filteredOptions = options.filter(option => !query || option.value.toLowerCase().includes(query) || option.label.toLowerCase().includes(query))

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const positionPanel = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, panelWidth || 220), window.innerWidth - 16)
      const left = Math.min(rect.left, window.innerWidth - width - 8)
      const availableBelow = window.innerHeight - rect.bottom
      const opensUpward = availableBelow < 280 && rect.top > availableBelow
      setPanelStyle({
        position: 'fixed',
        width,
        left: Math.max(8, left),
        top: opensUpward ? undefined : rect.bottom + 4,
        bottom: opensUpward ? window.innerHeight - rect.top + 4 : undefined,
      })
    }
    positionPanel()
    searchInputRef.current?.focus({ preventScroll: true })
    window.addEventListener('resize', positionPanel)
    window.addEventListener('scroll', positionPanel, true)
    return () => {
      window.removeEventListener('resize', positionPanel)
      window.removeEventListener('scroll', positionPanel, true)
    }
  }, [open, panelWidth])

  return <>
    <div className={`role-search-dropdown${open ? ' open' : ''}`} ref={rootRef}>
      <button type="button" className="role-search-trigger" onClick={() => { setOpen(current => !current); setSearch('') }} aria-haspopup="listbox" aria-expanded={open}>
        <span>{selected?.label || placeholder}</span><span className="role-search-trigger-arrow" aria-hidden="true" />
      </button>
    </div>
    {open && createPortal(<div className="role-search-panel" role="listbox" ref={panelRef} style={panelStyle}>
      <input ref={searchInputRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
      <div className="role-search-options">
        {filteredOptions.map(option => <button key={option.value} type="button" className={option.value === value ? 'active' : ''} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>)}
        {!filteredOptions.length && <span className="role-search-empty">{emptyMessage}</span>}
      </div>
    </div>, document.body)}
  </>
}

function RoleSelect({ editable, item, options, onChange }: { editable: boolean; item: CreateDemandRequest; options: Option[]; onChange: (code: string) => void }) {
  const rawValue = String(item.roleName || item.resourceId || '').trim()
  const availableOptions = options.length ? options : Object.entries(roleNames).map(([code, name]) => ({ code, name }))
  const selected = availableOptions.find(option => option.code === rawValue || option.name.toLowerCase() === rawValue.toLowerCase())
  if (!editable) return <>{selected?.name || roleNameFor(item)}</>
  return <SearchableTableDropdown value={selected?.code || rawValue} onChange={onChange} placeholder="Select role" searchPlaceholder="Search roles..." emptyMessage="No matching roles" options={availableOptions.map(option => ({ value: option.code, label: option.name }))} />
}

function DeliveryOrganizationSelect({ editable, value, options, onChange }: { editable: boolean; value: string; options: Array<{ code: string; name: string }>; onChange: (value: string) => void }) {
  const selected = options.find(option => option.code === value)
  if (!editable) return <>{selected?.name || value || '-'}</>
  return <SearchableTableDropdown value={value} onChange={onChange} placeholder="Select organization" searchPlaceholder="Search organizations..." emptyMessage="No matching organizations" panelWidth={230} options={options.map(option => ({ value: option.code, label: option.name || option.code }))} />
}

export function WorkPackageDetail({ selectedWorkPackage, onBack, onMessage, editingMode = false, assignedWorkItemsDraft }: { selectedWorkPackage: SelectedWorkPackage | null; onBack: () => void; onMessage: (state: DialogState) => void; editingMode?: boolean; assignedWorkItemsDraft?: WorkPackageDemandDetailsResponse['workItems'] }) {
  const [openType, setOpenType] = useState<DemandType | null>(null)
  const [bulkType, setBulkType] = useState<DemandType | null>(null)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [items, setItems] = useState<Record<DemandType, CreateDemandRequest[]>>({ team: [], additional: [], expense: [] })
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false)
  const [exchangeRates, setExchangeRates] = useState<Record<string, ExchangeRateValue>>({})
  const [loading, setLoading] = useState(Boolean(selectedWorkPackage))
  const [loadError, setLoadError] = useState('')
  const [expensesAvailable, setExpensesAvailable] = useState(true)
  const [serviceDetails, setServiceDetails] = useState<WorkPackageDemandDetailsResponse['serviceDetails']>(null)
  const [serviceUnits, setServiceUnits] = useState<Option[]>([])
  const [serviceUnitId, setServiceUnitId] = useState(selectedWorkPackage?.unitId || '')
  const [originalServiceUnitId, setOriginalServiceUnitId] = useState(selectedWorkPackage?.unitId || '')
  const [serviceQuantity, setServiceQuantity] = useState(String(selectedWorkPackage?.unitQuantity || ''))
  const [originalServiceQuantity, setOriginalServiceQuantity] = useState(String(selectedWorkPackage?.unitQuantity || ''))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [description, setDescription] = useState(selectedWorkPackage?.description || '')
  const [originalDescription, setOriginalDescription] = useState(selectedWorkPackage?.description || '')
  const [editSnapshot, setEditSnapshot] = useState<Record<DemandType, CreateDemandRequest[]> | null>(null)
  const [deliveryOrganizations, setDeliveryOrganizations] = useState<Array<{ code: string; name: string }>>([])
  const [teamRoles, setTeamRoles] = useState<Option[]>([])
  const [additionalResourceTypes, setAdditionalResourceTypes] = useState<Option[]>([])
  const [expenseTypes, setExpenseTypes] = useState<Option[]>([])
  const [workItems, setWorkItems] = useState<WorkPackageDemandDetailsResponse['workItems']>([])
  const visibleWorkItems = assignedWorkItemsDraft ?? workItems
  const loadedWorkPackageId = useRef<string | null>(null)
  const exchangeRateRequestKey = useRef('')
  const draftWorkItemsByPackage = useRef(new Map<string, WorkPackageDemandDetailsResponse['workItems']>())
  const [draftWorkPackage, setDraftWorkPackage] = useState<SelectedWorkPackage | null>(null)
  const editingRef = useRef(editing)
  const startEditingRef = useRef<() => void>(() => undefined)
  const discardEditingRef = useRef<() => void>(() => undefined)
  const saveEditingRef = useRef<() => Promise<boolean>>(async () => false)
  editingRef.current = editing
  const projectCurrency = currencyCode(selectedWorkPackage?.currency)
  const sourceCurrencies = [...new Set([
    ...items.team.flatMap(item => [item.costCurrency || item.currency, item.revenueCurrency || item.currency]),
    ...items.additional.flatMap(item => [item.costCurrency || item.currency, item.revenueCurrency || item.currency]),
    ...items.expense.flatMap(item => [item.costCurrency || item.currency, item.revenueCurrency || item.currency]),
    serviceDetails?.currency,
  ].map(currencyCode).filter((code): code is string => Boolean(code) && code !== projectCurrency))].sort()
  const exchangeRateRequestKeyValue = `${projectCurrency}|${sourceCurrencies.join(',')}`
  useEffect(() => {
    if (!projectCurrency || exchangeRateRequestKey.current === exchangeRateRequestKeyValue) return
    exchangeRateRequestKey.current = exchangeRateRequestKeyValue
    activeProjectCurrency = projectCurrency
    let cancelled = false
    if (!sourceCurrencies.length) {
      setExchangeRates({})
      setExchangeRatesLoading(false)
      activeExchangeRates = {}
      return
    }
    setExchangeRatesLoading(true)
    projectService.getCurrencyExchangeRates(projectCurrency, sourceCurrencies)
      .then(result => {
        if (cancelled) return
        const rates = Object.fromEntries(result.rates.map(rate => [currencyCode(rate.sourceCurrency), { rate: Number(rate.exchangeRate), quotation: rate.quotation }]))
        activeExchangeRates = rates
        setExchangeRates(rates)
      })
      .catch(error => {
        if (cancelled) return
        console.warn('SAP currency exchange-rate lookup failed', error)
        activeExchangeRates = {}
        setExchangeRates({})
      })
      .finally(() => { if (!cancelled) setExchangeRatesLoading(false) })
    return () => { cancelled = true }
  }, [exchangeRateRequestKeyValue, projectCurrency])
  const created = async (item: CreateDemandRequest) => {
    const rowId = `pending-create-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let prepared = item.type === 'team' ? withDefaultBillingCategory(item) : item
    if ((prepared.type === 'team' || prepared.type === 'additional') && prepared.resourceId && prepared.deliveryServiceOrg && selectedWorkPackage) {
      const costLookup = projectService.getDemandCostRate({
        projectId: selectedWorkPackage.projectId,
        workPackageId: selectedWorkPackage.id,
        wbsElementExternalID: selectedWorkPackage.wbsElementExternalID,
        workItem: prepared.workitem,
        activityType: prepared.resourceId,
        deliveryServiceOrg: prepared.deliveryServiceOrg,
        companyCode: selectedWorkPackage.companyCode,
      })
      const revenueLookup = prepared.type === 'team' && !isBillable(prepared)
        ? Promise.resolve(null)
        : projectService.recalculateDemandRevenueRates({
          projectId: selectedWorkPackage.projectId,
          customer: selectedWorkPackage.customerCode || '',
          salesOrganization: '1000',
          rows: [{ type: prepared.type, material: prepared.resourceId, deliveryServiceOrg: prepared.deliveryServiceOrg || '', workItem: prepared.workitem || '', workPackage: selectedWorkPackage.id }],
        })
      const [costResult, revenueResult] = await Promise.allSettled([costLookup, revenueLookup])
      if (costResult.status === 'fulfilled' && costResult.value?.costPerHour != null) {
        const costRate = costResult.value
        prepared = { ...prepared, costPerHour: String(costRate.costPerHour), costCurrency: costRate.currency || prepared.costCurrency || prepared.currency, expenseCost: String(Number(costRate.costPerHour) * Number(prepared.effort || 0)) }
      } else if (costResult.status === 'rejected') {
        console.warn('Demand cost rate lookup failed', costResult.reason)
      }
      if (prepared.type === 'team' && !isBillable(prepared)) {
        prepared = { ...prepared, revenuePerHour: '0', revenueCurrency: prepared.revenueCurrency || prepared.currency, expenseRevenue: '0' }
      } else if (revenueResult.status === 'fulfilled' && revenueResult.value) {
        const revenueRate = revenueResult.value.rates[0]
        if (revenueRate) {
          const revenuePerHour = String(revenueRate.rate)
          prepared = { ...prepared, revenuePerHour, revenueCurrency: revenueRate.currency || prepared.revenueCurrency || prepared.currency, expenseRevenue: String(revenueRate.rate * numeric(prepared.effort)) }
        }
      } else if (revenueResult.status === 'rejected') {
        console.warn('Demand revenue rate lookup failed', revenueResult.reason)
      }
    }
    const savedItem = withDefaultBillingCategory({ ...prepared, resourceDemandId: rowId })
    setItems(current => {
      const next = [...current[item.type], savedItem]
      return { ...current, [item.type]: next }
    })
  }
  const updateDemand = (type: DemandType, index: number, item: CreateDemandRequest) => setItems(current => {
    const next = current[type].map((existing, itemIndex) => itemIndex === index ? item : existing)
    return { ...current, [type]: next }
  })
	const replaceDemands = (type: DemandType, nextItems: CreateDemandRequest[]) => {
		if ((type !== 'team' && type !== 'additional') || !selectedWorkPackage) {
			setItems(current => ({ ...current, [type]: nextItems }))
			return
		}
		const previousItems = items[type]
		const changed = nextItems.flatMap((item, index) => {
			const previous = previousItems[index]
			if (!previous || (previous.resourceId === item.resourceId && previous.deliveryServiceOrg === item.deliveryServiceOrg && previous.workitem === item.workitem)) return []
			return [{ item, index }]
		})
		const changedIndexes = new Set(changed.map(({ index }) => index))
		const refreshedItems = nextItems.map((item, index) => changedIndexes.has(index)
			? { ...item, costPerHour: '', costCurrency: '', expenseCost: '0' }
			: item)
		setItems(current => ({ ...current, [type]: refreshedItems }))
		void Promise.all(changed.map(async ({ item, index }) => {
			const activityType = String(item.resourceId || '').trim()
			const deliveryServiceOrg = String(item.deliveryServiceOrg || '').trim()
			const companyCode = String(selectedWorkPackage.companyCode || '').trim()
			if (!activityType || !deliveryServiceOrg) return
			try {
				const [costResult, revenueResult] = await Promise.allSettled([
					projectService.getDemandCostRate({
						projectId: selectedWorkPackage.projectId,
						workPackageId: selectedWorkPackage.id,
						wbsElementExternalID: selectedWorkPackage.wbsElementExternalID,
						workItem: item.workitem,
						activityType,
						deliveryServiceOrg,
						companyCode,
					}),
					type === 'team' && !isBillable(item)
						? Promise.resolve(null)
						: projectService.recalculateDemandRevenueRates({
							projectId: selectedWorkPackage.projectId,
							customer: selectedWorkPackage.customerCode || '',
							salesOrganization: '1000',
							rows: [{ type, material: activityType, deliveryServiceOrg, workItem: item.workitem || '', workPackage: selectedWorkPackage.id }],
						}),
				])
				setItems(current => {
					const currentItem = current[type][index]
					if (!currentItem || currentItem.resourceId !== item.resourceId || currentItem.deliveryServiceOrg !== item.deliveryServiceOrg || currentItem.workitem !== item.workitem) return current
					const sectionItems = [...current[type]]
					let refreshedItem = currentItem
					if (costResult.status === 'fulfilled') {
						const rate = costResult.value
						refreshedItem = rate?.costPerHour == null
							? { ...refreshedItem, costPerHour: '', costCurrency: '', expenseCost: '0' }
							: { ...refreshedItem, costPerHour: String(rate.costPerHour), costCurrency: rate.currency || refreshedItem.costCurrency || refreshedItem.currency, expenseCost: String(Number(rate.costPerHour) * numeric(refreshedItem.effort)) }
					}
					if (type === 'team' && !isBillable(item)) {
						refreshedItem = { ...refreshedItem, revenuePerHour: '0', expenseRevenue: '0' }
					} else if (revenueResult.status === 'fulfilled') {
						const rate = revenueResult.value?.rates[0]
						if (rate) refreshedItem = { ...refreshedItem, revenuePerHour: String(rate.rate), revenueCurrency: rate.currency || refreshedItem.revenueCurrency || refreshedItem.currency, expenseRevenue: String(rate.rate * numeric(refreshedItem.effort)) }
					}
					sectionItems[index] = refreshedItem
					return { ...current, [type]: sectionItems }
				})
			} catch (error) {
				console.warn('SAP demand cost-rate refresh failed', error)
			}
		}))
	}
  useEffect(() => {
    projectService.getMasterData().then(data => { setDeliveryOrganizations(data.orgIds || []); setTeamRoles(data.teamRoles || []); setAdditionalResourceTypes(data.additionalResourceTypes || []); setExpenseTypes(data.expenseTypes || []); setServiceUnits(data.serviceUnits || []) }).catch(() => { setDeliveryOrganizations([]); setTeamRoles([]); setAdditionalResourceTypes([]); setExpenseTypes([]); setServiceUnits([]) })
  }, [])
  useEffect(() => {
    if (!selectedWorkPackage) return
    if (loadedWorkPackageId.current === selectedWorkPackage.id) return
    loadedWorkPackageId.current = null
    setEditing(false)
    setEditSnapshot(null)
    setDescription(selectedWorkPackage.description || '')
    setOriginalDescription(selectedWorkPackage.description || '')
    let cancelled = false
    setLoading(true)
    setLoadError('')
    setServiceDetails(null)
    setWorkItems([])
    Promise.all([
      projectService.getWorkPackageDemandDetails(selectedWorkPackage),
      projectService.getWorkspace(selectedWorkPackage.projectId).catch(() => null),
    ])
      .then(([data, workspace]) => {
        if (cancelled) return
        const currentWorkPackage = workspace?.workPackages.find(item => item.id === selectedWorkPackage.id)
        const currentDescription = currentWorkPackage?.description ?? selectedWorkPackage.description ?? ''
        setDescription(currentDescription)
        setOriginalDescription(currentDescription)
        setItems({
          team: data.team.filter(item => item.type === 'team').map(item => withDefaultBillingCategory({ ...item, currency: selectedWorkPackage.currency, costCurrency: item.costCurrency || item.currency || selectedWorkPackage.currency, revenueCurrency: item.revenueCurrency || item.currency || selectedWorkPackage.currency, staffedResources: item.staffedResources?.map(resource => ({ ...resource, assignmentPeriod: `${selectedWorkPackage.startDate || '-'} - ${selectedWorkPackage.endDate || '-'}` })) })),
          additional: data.team.filter(item => item.type === 'additional').map(item => withDefaultBillingCategory({ ...item, currency: selectedWorkPackage.currency, costCurrency: item.costCurrency || item.currency || selectedWorkPackage.currency, revenueCurrency: item.revenueCurrency || item.currency || selectedWorkPackage.currency })),
          expense: data.team.filter(item => item.type === 'expense').map(item => withDefaultBillingCategory({ ...item, currency: selectedWorkPackage.currency, costCurrency: item.costCurrency || item.currency || selectedWorkPackage.currency, revenueCurrency: item.revenueCurrency || item.currency || selectedWorkPackage.currency })),
        })
        setExpensesAvailable(data.expensesAvailable)
        setServiceDetails(data.serviceDetails ?? null)
        const loadedServiceUnitId = currentWorkPackage?.unitId || selectedWorkPackage.unitId || ''
        const loadedServiceQuantity = String(currentWorkPackage?.unitQuantity ?? selectedWorkPackage.unitQuantity ?? data.serviceDetails?.quantity ?? '')
        setServiceUnitId(loadedServiceUnitId)
        setOriginalServiceUnitId(loadedServiceUnitId)
        setServiceQuantity(loadedServiceQuantity)
        setOriginalServiceQuantity(loadedServiceQuantity)
        setWorkItems(draftWorkItemsByPackage.current.get(selectedWorkPackage.id) || data.workItems || [])
        loadedWorkPackageId.current = selectedWorkPackage.id
        setDraftWorkPackage({ ...selectedWorkPackage, description: currentDescription })
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof ApiError ? error.message : 'Unable to load this work package data from SAP.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [editingMode, selectedWorkPackage?.projectId, selectedWorkPackage?.id, selectedWorkPackage?.name, selectedWorkPackage?.description, selectedWorkPackage?.currency])
  useEffect(() => {
    const onAssignedWorkItemsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ workPackageId?: string; workItems?: WorkPackageDemandDetailsResponse['workItems'] }>).detail
      if (detail?.workPackageId && Array.isArray(detail.workItems)) {
        draftWorkItemsByPackage.current.set(detail.workPackageId, detail.workItems)
      }
      if (detail?.workPackageId === selectedWorkPackage?.id && Array.isArray(detail.workItems)) {
        setWorkItems(detail.workItems)
      }
    }
    window.addEventListener('work-package-work-items-draft-changed', onAssignedWorkItemsChange)
    return () => window.removeEventListener('work-package-work-items-draft-changed', onAssignedWorkItemsChange)
  }, [selectedWorkPackage?.id])
  useEffect(() => {
    if (!editingMode && editingRef.current) { discardEditingRef.current(); return }
    if (editingMode && !editingRef.current && selectedWorkPackage && !loading && loadedWorkPackageId.current === selectedWorkPackage.id) startEditingRef.current()
  }, [editingMode, loading, selectedWorkPackage?.id])
  useEffect(() => {
    const onSave = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceSaveRequest>).detail
      if (editingRef.current) detail?.register(async () => await saveEditingRef.current())
    }
    window.addEventListener('workspace-save-request', onSave)
    return () => window.removeEventListener('workspace-save-request', onSave)
  }, [])
  useEffect(() => {
    const onDirtyCheck = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceDirtyRequest>).detail
      detail?.register(() => Boolean(editSnapshot && (
        description !== originalDescription ||
        serviceUnitId !== originalServiceUnitId || serviceQuantity !== originalServiceQuantity ||
        (['team', 'additional', 'expense'] as DemandType[]).some(type => JSON.stringify(items[type]) !== JSON.stringify(editSnapshot[type]))
      )))
    }
    window.addEventListener('workspace-dirty-request', onDirtyCheck)
    return () => window.removeEventListener('workspace-dirty-request', onDirtyCheck)
  }, [description, editSnapshot, items, originalDescription, serviceQuantity, originalServiceQuantity, serviceUnitId, originalServiceUnitId])
  if (!selectedWorkPackage) return <><div className="breadcrumb">Project Management / Work Package Detail</div><div className="card empty"><strong>Select a work package first</strong><span>Open a project, then select a work-package row to manage its roles, resources, and expenses.</span><button className="secondary" type="button" onClick={onBack}>Go to Project Workspace</button></div></>
  const summaryTeamItems = groupTeamRows(items.team)
  const allItems = [...summaryTeamItems, ...items.additional, ...items.expense]
  const summaryItems = allItems.filter(item => item.summaryContribution !== false)
  const billableItems = summaryItems.filter(isBillable)
  const plannedEffort = summaryTeamItems.filter(item => item.summaryContribution !== false).reduce((total, item) => total + numeric(item.effort), 0)
  const currency = selectedWorkPackage.currency
  const costTotals = demandCurrencyTotals(summaryItems, item => convertedMoney(plannedDemandCost(item), item.costCurrency || item.currency || currency, currency).amount, item => convertedMoney(plannedDemandCost(item), item.costCurrency || item.currency || currency, currency).currency, currency)
  const revenueTotals = selectedWorkPackage.type === 'service'
    ? (serviceDetails?.revenue != null ? [convertedMoney(numeric(serviceDetails.revenue), serviceDetails.currency || currency, currency)] : [])
    : demandCurrencyTotals(billableItems, item => convertedMoney(numeric(item.expenseRevenue), item.revenueCurrency || item.currency || currency, currency).amount, item => convertedMoney(numeric(item.expenseRevenue), item.revenueCurrency || item.currency || currency, currency).currency, currency)
  const margin = costTotals.length === 1 && revenueTotals.length === 1 && costTotals[0].currency === revenueTotals[0].currency
    ? calculatedMargin(String(costTotals[0].amount), String(revenueTotals[0].amount))
    : null
  const projectStage = selectedWorkPackage.projectStage || ''
  const executionStage = /execution/i.test(projectStage)
  const serviceAndQuantityEditable = /in\s+progress|contract\s+preparation/i.test(projectStage)
  const quantityEditable = executionStage || serviceAndQuantityEditable
  const startEditing = () => { setEditSnapshot({ team: items.team.map(item => ({ ...item })), additional: items.additional.map(item => ({ ...item })), expense: items.expense.map(item => ({ ...item })) }); setOriginalDescription(description); setOriginalServiceUnitId(serviceUnitId); setOriginalServiceQuantity(serviceQuantity); setEditing(true) }
  const discardEditing = () => { if (editSnapshot) setItems(editSnapshot); setDescription(originalDescription); setServiceUnitId(originalServiceUnitId); setServiceQuantity(originalServiceQuantity); setEditSnapshot(null); setEditing(false) }
  const cancelEditing = () => window.dispatchEvent(new Event('workspace-cancel-click'))
  const finishSuccessfulSave = () => { setOriginalDescription(description); setOriginalServiceUnitId(serviceUnitId); setOriginalServiceQuantity(serviceQuantity) }
  const deleteDemandRows = (type: DemandType, selectedRows: CreateDemandRequest[]) => {
    if (!selectedRows.length) return
    const keyMap = new Map<string, SapDemandDeleteKey>()
    for (const row of selectedRows) {
      for (const key of row.sapDeleteKeys || []) keyMap.set(JSON.stringify(key), key)
    }
    const keys = [...keyMap.values()]
    const selectedKeySignatures = new Set(keys.map(key => JSON.stringify(key)))
    const selectedIds = new Set(selectedRows.flatMap(row => (row.resourceDemandId || '').split('|').filter(Boolean)))
    const removeSelected = () => {
      const isSelected = (item: CreateDemandRequest) => {
        const ids = (item.resourceDemandId || '').split('|').filter(Boolean)
        return ids.some(id => selectedIds.has(id)) || (item.sapDeleteKeys || []).some(key => selectedKeySignatures.has(JSON.stringify(key)))
      }
      setItems(current => ({ ...current, [type]: current[type].filter(item => !isSelected(item)) }))
      setEditSnapshot(current => current ? ({ ...current, [type]: current[type].filter(item => !isSelected(item)) }) : current)
    }
    const executeDelete = async () => {
      setDeleting(true)
      try {
        if (keys.length) await projectService.deleteDemands(type, keys)
        removeSelected()
        onMessage({ type: 'success', title: 'Demand rows deleted', message: keys.length ? `${keys.length} SAP demand record${keys.length === 1 ? '' : 's'} deleted successfully.` : 'The selected unsaved demand rows were removed.' })
      } catch (error) {
        const details = error instanceof ApiError && typeof error.details === 'object' && error.details ? error.details as { deletedKeys?: unknown[] } : null
        const partialCount = details?.deletedKeys?.length || 0
        onMessage({ type: partialCount ? 'warning' : 'error', title: partialCount ? 'Some demand rows were deleted' : 'Demand deletion failed', message: partialCount ? `${partialCount} of ${keys.length} SAP demand records were deleted. Reload this work package before making further changes.` : apiErrorMessage(error) })
      } finally {
        setDeleting(false)
      }
    }
    onMessage({
      type: 'warning',
      title: 'Confirm deletion',
      message: `Delete ${selectedRows.length} row${selectedRows.length === 1 ? '' : 's'} from ${type === 'team' ? 'Team Role' : type === 'additional' ? 'Additional Resources' : 'Expenses'}?`,
      confirmLabel: 'Delete',
      onConfirm: () => { void executeDelete() },
    })
  }
  const recalculate = async () => {
    const workPackage = selectedWorkPackage || draftWorkPackage
    if (!workPackage || recalculating) return
    const rowRefs = (['team', 'additional', 'expense'] as DemandType[]).flatMap(type =>
      items[type].map((item, index) => ({ type, index, item })),
    )
    if (!rowRefs.length) {
      const message = 'This work package has no demand line items.'
      onMessage({ type: 'info', title: 'Nothing to recalculate', message })
      return
    }
    setRecalculating(true)
    try {
      const [revenueResult, costResultsResult] = await Promise.allSettled([
        projectService.recalculateDemandRevenueRates({
          projectId: workPackage.projectId,
          customer: workPackage.customerCode || '',
          salesOrganization: '1000',
          rows: rowRefs.map(({ type, item }) => ({
            type,
            material: item.resourceId || '',
            deliveryServiceOrg: item.deliveryServiceOrg || '',
            workItem: item.workitem || '',
            workPackage: workPackage.id,
            billable: type !== 'team' || isBillable(item),
          })),
        }),
        Promise.allSettled(rowRefs.map(({ type, item }) => (type === 'team' || type === 'additional') && item.resourceId && item.deliveryServiceOrg
        ? projectService.getDemandCostRate({
            projectId: workPackage.projectId,
            workPackageId: workPackage.id,
            wbsElementExternalID: workPackage.wbsElementExternalID,
            workItem: item.workitem,
            activityType: item.resourceId || '',
            deliveryServiceOrg: item.deliveryServiceOrg || '',
            companyCode: workPackage.companyCode,
          })
        : Promise.resolve(null))),
      ])
      const costResults = costResultsResult.status === 'fulfilled' ? costResultsResult.value : []
      setItems(current => {
        const next: Record<DemandType, CreateDemandRequest[]> = {
          team: current.team.map(item => ({ ...item })),
          additional: current.additional.map(item => ({ ...item })),
          expense: current.expense.map(item => ({ ...item })),
        }
        rowRefs.forEach(({ type, index }, rateIndex) => {
          const item = next[type][index]
          if (!item) return
          const costResult = costResults[rateIndex]
			let refreshedItem = item
			if ((type === 'team' || type === 'additional') && costResult?.status === 'fulfilled') {
            const costRate = costResult.value
				refreshedItem = costRate?.costPerHour == null
              ? { ...refreshedItem, costPerHour: '', costCurrency: '', expenseCost: '0' }
              : {
                  ...refreshedItem,
                  costPerHour: String(costRate.costPerHour),
                  costCurrency: costRate.currency || refreshedItem.costCurrency || refreshedItem.currency,
                  expenseCost: String(Number(costRate.costPerHour) * numeric(item.effort)),
                }
          }
			const rate = revenueResult.status === 'fulfilled' ? revenueResult.value.rates[rateIndex] : null
          if (type === 'team' && !isBillable(item)) {
            next.team[index] = { ...refreshedItem, revenuePerHour: '0', expenseRevenue: '0' }
            return
          }
          // The backend normalizes additional-resource `rate` to the SAP price
          // per activity unit. Keep the draft calculation on that one canonical
          // value so the amount shown before Save matches the persisted SAP amount.
          next[type][index] = rate
            ? withDemandRevenue(refreshedItem, String(rate.rate), rate.currency || refreshedItem.revenueCurrency || refreshedItem.currency)
            : refreshedItem
        })
        return next
      })
      const messages: NonNullable<DialogState['messages']> = []
      const missingCostRates = new Set<string>()
      const failedCostLookups = new Set<string>()
      rowRefs.forEach(({ type, item }, index) => {
        const result = costResults[index]
        const name = type === 'team' ? roleNameFor(item) : item.roleName || item.resourceId || labels[type]
        if (result?.status === 'rejected') failedCostLookups.add(name)
        if (result?.status === 'fulfilled' && result.value && result.value.costPerHour == null) missingCostRates.add(name)
      })
      const matchedRate = costResults.some(result => result.status === 'fulfilled' && result.value?.costPerHour != null)
        || (revenueResult.status === 'fulfilled' && revenueResult.value.rates.some(Boolean))
      if (matchedRate) messages.push({ type: 'success', text: 'Cost and revenue recalculation completed.' })
      if (revenueResult.status === 'rejected') {
        messages.push({ type: 'error', text: `Revenue rates could not be retrieved. ${apiErrorMessage(revenueResult.reason)}` })
      }
      for (const name of missingCostRates) messages.push({ type: 'warning', text: `No cost rate found for ${name}.` })
      for (const name of failedCostLookups) messages.push({ type: 'warning', text: `Could not retrieve the cost rate for ${name}.` })
      if (!messages.length) messages.push({ type: 'warning', text: 'No matching pricing rates were found.' })
      onMessage({ type: 'info', title: 'Recalculation results', message: '', messages })
    } catch (error) {
      const message = error instanceof Error ? error.message : apiErrorMessage(error)
      onMessage({ type: 'error', title: 'Demand rate recalculation failed', message })
    } finally {
      setRecalculating(false)
    }
  }
  const saveEditing = async (): Promise<boolean> => {
    const workPackage = selectedWorkPackage || draftWorkPackage
    if (!editSnapshot || !workPackage) return false
    const editableFields: Array<keyof CreateDemandRequest> = ['resourceId', 'roleName', 'deliveryServiceOrg', 'workitem', 'effort', 'skills', 'expenseRevenue', 'expenseCost', 'billingControlCategory']
    const originalFor = (item: CreateDemandRequest, type: DemandType) => {
      if (item.resourceDemandId?.split('|').some(id => id.startsWith('pending-create-'))) return undefined
      return editSnapshot[type].find(original =>
        item.resourceDemandId ? original.resourceDemandId === item.resourceDemandId : !original.resourceDemandId && original.resourceId === item.resourceId && original.deliveryServiceOrg === item.deliveryServiceOrg && original.workitem === item.workitem,
      )
    }
    const rateChanges = new Map<string, Parameters<typeof projectService.saveDemandRevenueRate>[0]>()
    const demandTypes: DemandType[] = ['team', 'additional', 'expense']
    for (const type of demandTypes) {
      for (const item of items[type]) {
        const original = originalFor(item, type)
        if (item.revenueRateDraft !== undefined) {
          // An existing demand always uses its pre-edit pricing combination.
          const source = original || item
          const draft = item.revenueRateDraft
          const projectCurrency = currencyCode(workPackage.currency) || draft.currency
          const convertedDraft = convertedMoney(numeric(draft.amount), draft.currency, projectCurrency)
          if (convertedDraft.currency !== projectCurrency) {
            throw new Error(`The exchange rate for ${draft.currency} to ${projectCurrency} is unavailable.`)
          }
          const change = {
            material: source.resourceId?.trim() || '',
            deliveryServiceOrg: source.deliveryServiceOrg?.trim() || '',
            customer: workPackage.customerCode?.trim() || '',
            workPackage: workPackage.id,
            rate: draft.currency === projectCurrency || !/^\d+(?:\.\d+)?$/.test(draft.amount)
              ? draft.amount
              : String(Math.round(convertedDraft.amount * 100) / 100),
            currency: projectCurrency,
            unit: source.unitOfMeasure || (type === 'team' ? 'H' : undefined),
          }
          const key = JSON.stringify([change.material, change.deliveryServiceOrg])
          const previous = rateChanges.get(key)
          const message = !change.material || !change.deliveryServiceOrg || !change.customer
            ? 'A material, delivery service organization, and customer are required to save a revenue rate.'
            : !/^\d+(?:\.\d+)?$/.test(change.rate) || !Number.isFinite(Number(change.rate)) || !/^[A-Z]{3}$/.test(change.currency)
              ? 'Enter a non-negative revenue rate and a valid currency.'
              : previous && (Number(previous.rate) !== Number(change.rate) || previous.currency !== change.currency)
                ? 'Enter one revenue rate for rows with the same material and delivery service organization.'
                : ''
          if (message) throw new Error(message)
          rateChanges.set(key, change)
        }
      }
    }
    const applySavedRate = (item: CreateDemandRequest): CreateDemandRequest => {
      const key = JSON.stringify([item.resourceId?.trim() || '', item.deliveryServiceOrg?.trim() || ''])
      const rate = rateChanges.get(key)
      const demand = item.revenueRateDraft ? { ...item, revenueRateDraft: undefined } : item
      if (!rate || (demand.type === 'team' && !isBillable(demand))) return demand
      return withDemandRevenue(demand, rate.rate, rate.currency)
    }
    const recalculatedItems = {
      team: items.team.map(applySavedRate),
      additional: items.additional.map(applySavedRate),
      expense: items.expense.map(applySavedRate),
    }
    const creates: Array<{ type: DemandType; item: CreateDemandRequest; draft?: RevenueRateDraft }> = []
    const updates = new Map<string, { type: DemandType; original: CreateDemandRequest; entries: Array<{ item: CreateDemandRequest; fields: Partial<CreateDemandRequest> }> }>()
    for (const type of demandTypes) {
      for (const [index, item] of recalculatedItems[type].entries()) {
        const original = originalFor(items[type][index], type)
        if (!original) {
          creates.push({ type, item, draft: items[type][index].revenueRateDraft })
          continue
        }
        const fields = Object.fromEntries(editableFields.filter(field => item[field] !== original[field]).map(field => [field, item[field]])) as Partial<CreateDemandRequest>
        const key = JSON.stringify([type, original.projectId, original.workPackageId, original.workPackageName, original.resourceId || original.roleName, original.workitem, original.deliveryServiceOrg])
        const group = updates.get(key) || { type, original, entries: [] }
        group.entries.push({ item, fields })
        updates.set(key, group)
      }
    }
    const updateGroups = [...updates.values()].filter(group => group.entries.some(entry => Object.keys(entry.fields).length)).map(group => {
      const changedFields = new Set<keyof CreateDemandRequest>(group.entries.flatMap(entry => Object.keys(entry.fields) as Array<keyof CreateDemandRequest>))
      const targetResourceId = String(group.entries[0]?.item.resourceId || group.entries[0]?.item.roleName || '').trim().toUpperCase()
      if (group.type === 'team' && targetResourceId === 'T002') changedFields.add('effort')
      const fields: Partial<CreateDemandRequest> = {}
      for (const field of changedFields) {
        if (field === 'effort' || field === 'expenseRevenue' || field === 'expenseCost') {
          Object.assign(fields, { [field]: String(group.entries.reduce((total, entry) => total + numeric(entry.item[field]), 0)) })
        } else {
          const changedEntry = group.entries.find(entry => Object.hasOwn(entry.fields, field))
          if (changedEntry) Object.assign(fields, { [field]: changedEntry.item[field] })
        }
      }
      return { ...group, fields, targetResourceId }
    })
    const invalidTeamEffort = creates.some(({ type, item }) => type === 'team' && item.resourceId?.trim().toUpperCase() === 'T002' && (!Number.isInteger(numeric(item.effort)) || numeric(item.effort) <= 0))
      || updateGroups.some(group => group.type === 'team' && group.targetResourceId === 'T002' && (!Number.isInteger(numeric(group.fields.effort)) || numeric(group.fields.effort) <= 0))
    if (invalidTeamEffort) {
      onMessage({ type: 'error', title: 'Valid effort required', message: 'Sr Tech Architect (T002) requires planned effort of at least 1 whole hour. Enter a positive whole number in Effort (Planned), then save again.' })
      return false
    }
    let updatedCount = 0
    let createdCount = 0
    setSaving(true)
    try {
      // Pricing must be saved before SAP receives any recalculated demand amounts.
      for (const change of rateChanges.values()) await projectService.saveDemandRevenueRate(change)
      const descriptionChanged = description !== originalDescription
      const serviceUnitChanged = serviceAndQuantityEditable && serviceUnitId !== originalServiceUnitId
      const serviceQuantityChanged = quantityEditable && serviceQuantity !== originalServiceQuantity
      if (descriptionChanged || serviceUnitChanged || serviceQuantityChanged) await projectService.updateWorkPackage(workPackage.projectId, workPackage.id, {
        workPackageName: workPackage.name,
        ...(descriptionChanged ? { description } : {}),
        ...(serviceUnitChanged ? { unitId: serviceUnitId } : {}),
        ...(serviceQuantityChanged ? { unitQuantity: serviceQuantity } : {}),
      })
      for (const { type, item, draft: revenueRateDraft } of creates) {
        await projectService.createDemand({ ...item, resourceDemandId: undefined, projectId: workPackage.projectId, workPackageId: workPackage.id, workPackageName: workPackage.name, workPackageType: workPackage.type })
        createdCount += 1
        const savedItem = {
          ...item,
          resourceDemandId: item.resourceDemandId?.replace('pending-create-', 'saved-local-'),
          sapDeleteKeys: [{
            projectId: workPackage.projectId,
            workPackageId: workPackage.id,
            workPackageName: workPackage.name,
            resType: type === 'team' ? '0ACT' : type === 'additional' ? '0ADL' : '0EXP',
            resourceId: item.resourceId || item.roleName || '',
            workitem: item.workitem || '',
            deliveryServiceOrg: item.deliveryServiceOrg || '',
          }],
        }
        setItems(current => ({ ...current, [type]: current[type].map(existing => existing.resourceDemandId === item.resourceDemandId ? { ...savedItem, revenueRateDraft } : existing) }))
        setEditSnapshot(current => current ? { ...current, [type]: [...current[type], savedItem] } : current)
      }
      for (const group of updateGroups) {
        await projectService.updateDemand({ type: group.type, original: group.original, fields: group.fields })
        updatedCount += 1
      }
      if (!updatedCount && !createdCount && !rateChanges.size && !descriptionChanged && !serviceUnitChanged && !serviceQuantityChanged) {
        return false
      }
      try {
        await new Promise(resolve => window.setTimeout(resolve, 1500))
        const refreshed = await projectService.getWorkPackageDemandDetails(workPackage)
        const refreshedItems: Record<DemandType, CreateDemandRequest[]> = {
          team: refreshed.team.filter(item => item.type === 'team').map(item => withDefaultBillingCategory({ ...item, currency: workPackage.currency, costCurrency: item.costCurrency || item.currency || workPackage.currency, revenueCurrency: item.revenueCurrency || item.currency || workPackage.currency, staffedResources: item.staffedResources?.map(resource => ({ ...resource, assignmentPeriod: `${workPackage.startDate || '-'} - ${workPackage.endDate || '-'}` })) })),
          additional: refreshed.team.filter(item => item.type === 'additional').map(item => withDefaultBillingCategory({ ...item, currency: workPackage.currency, costCurrency: item.costCurrency || item.currency || workPackage.currency, revenueCurrency: item.revenueCurrency || item.currency || workPackage.currency })),
          expense: refreshed.team.filter(item => item.type === 'expense').map(item => withDefaultBillingCategory({ ...item, currency: workPackage.currency, costCurrency: item.costCurrency || item.currency || workPackage.currency, revenueCurrency: item.revenueCurrency || item.currency || workPackage.currency })),
        }
        refreshedItems.team = retainRateCurrencies(refreshedItems.team, recalculatedItems.team)
        refreshedItems.additional = retainRateCurrencies(refreshedItems.additional, recalculatedItems.additional)
        refreshedItems.expense = retainRateCurrencies(refreshedItems.expense, recalculatedItems.expense)
        setItems(refreshedItems)
        setEditSnapshot({ team: refreshedItems.team.map(item => ({ ...item })), additional: refreshedItems.additional.map(item => ({ ...item })), expense: refreshedItems.expense.map(item => ({ ...item })) })
        setExpensesAvailable(refreshed.expensesAvailable)
        setServiceDetails(refreshed.serviceDetails ?? null)
        setWorkItems(refreshed.workItems || [])
      } catch {
        if (rateChanges.size) {
          setItems(current => ({
            team: current.team.map(applySavedRate),
            additional: current.additional.map(applySavedRate),
            expense: current.expense.map(applySavedRate),
          }))
          setEditSnapshot(null)
          setEditing(false)
        }
      }
      finishSuccessfulSave()
      const rolesWithoutCostRates = items.team
        .filter(item => !Number.isFinite(numeric(item.costPerHour)) || numeric(item.costPerHour) <= 0)
        .map(roleNameFor)
      if (rolesWithoutCostRates.length) {
        // The workspace save coordinator shows its success notice after this
        // callback returns, so queue the rate warning to appear immediately
        // after that notice is set.
        window.setTimeout(() => onMessage({
          type: 'warning',
          title: 'Cost rate missing',
          message: `There are no cost rates for ${[...new Set(rolesWithoutCostRates)].join(', ')}.`,
        }), 0)
      }
      return true
    } catch (error) {
      onMessage({ type: 'error', title: 'Work package update failed', message: apiErrorMessage(error) })
      throw error
    } finally {
      setSaving(false)
    }
  }
  startEditingRef.current = startEditing
  discardEditingRef.current = discardEditing
  saveEditingRef.current = saveEditing
  const selectedService = serviceUnits.find(unit => unit.code === serviceUnitId)
  const serviceName = selectedService?.name || serviceDetails?.service || serviceUnitId || '-'
  return <><div className="breadcrumb">Project Management / Work Package Detail</div><div className="work-package-summary"><div className="work-package-summary-title"><h1>{selectedWorkPackage.name || 'Work Package Details'} <span>({selectedWorkPackage.id})</span></h1><strong className={margin != null && margin < 0 ? 'negative' : ''}>{margin == null ? 'N/A' : formatPercent(margin)} <small>Margin (Planned)</small></strong></div><div className="work-package-summary-metrics"><span>Duration: <b>{selectedWorkPackage.startDate || '-'} - {selectedWorkPackage.endDate || '-'}</b></span><span>Effort (Planned): <b>{formatNumber(plannedEffort)} h</b></span><span>Cost (Planned): <b>{formatCurrencyTotals(costTotals, currency)}</b></span><span>Revenue (Planned): <b>{formatCurrencyTotals(revenueTotals, currency)}</b></span></div><div className="work-package-project-stage">Project Stage: <b>{selectedWorkPackage.projectStage || '-'}</b></div></div>{exchangeRatesLoading && <div className="sap-detail-loading" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Loading currency rates from SAP...</span></div>}<div className="work-package-detail-navigation"><span>{selectedWorkPackage.type === 'resource' ? 'Resource Based (Time)' : 'Service Based (Unit)'}</span></div>{loadError && <div className="card work-package-load-error">{loadError}</div>}<section className="card work-package-information"><div className="card-header"><h2>Information</h2></div><div className="work-package-information-fields"><div className="work-package-description-field"><label htmlFor="work-package-description">Description:</label>{editing ? <textarea id="work-package-description" value={description} maxLength={100000} onChange={event => setDescription(event.target.value)} /> : <div id="work-package-description" className="work-package-description-value">{description || '-'}</div>}{editing && <small>{100000 - description.length} characters remaining</small>}</div><div className="work-package-bulk-action"><button className="secondary" type="button" onClick={() => setBulkMenuOpen(open => !open)}>Bulk upload</button>{bulkMenuOpen && <div className="work-package-bulk-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setBulkType('team'); setBulkMenuOpen(false) }}>Team</button><button type="button" role="menuitem" onClick={() => { setBulkType('additional'); setBulkMenuOpen(false) }}>Additional Resources</button><button type="button" role="menuitem" onClick={() => { setBulkType('expense'); setBulkMenuOpen(false) }}>Expenses</button></div>}</div></div></section>{selectedWorkPackage.type === 'service' && <section className="card service-details-section"><div className="card-header"><h2>Service Details</h2></div><div className="service-details-grid"><div><span>Service:</span>{editing && serviceAndQuantityEditable ? <select aria-label="Service" value={serviceUnitId} onChange={event => setServiceUnitId(event.target.value)} disabled={loading || saving}><option value="">Select service</option>{serviceUnitId && !serviceUnits.some(unit => unit.code === serviceUnitId) && <option value={serviceUnitId}>{serviceName}</option>}{serviceUnits.map(unit => <option key={unit.code} value={unit.code}>{unit.name}</option>)}</select> : <strong>{loading ? 'Loading...' : serviceName}</strong>}</div><div><span>Quantity:</span>{editing && quantityEditable ? <><input aria-label="Quantity" type="number" min="0" step="any" value={serviceQuantity} onChange={event => setServiceQuantity(event.target.value)} disabled={loading || saving} /><small>{serviceDetails?.unit || ''}</small></> : <strong>{loading ? 'Loading...' : (serviceQuantity || serviceDetails?.quantity || '-')} <small>{serviceDetails?.unit || ''}</small></strong>}</div><div><span>Revenue:</span><strong>{loading ? 'Loading...' : serviceDetails?.revenue != null ? formatPlannedConvertedMoney(numeric(serviceDetails.revenue), serviceDetails.currency || currency, currency) : '-'}</strong></div></div></section>}<RevenueExchangeRates.Provider value={{ projectCurrency, rates: exchangeRates }}><DemandSection type="team" items={items.team} loading={loading} editing={editing || editingMode} executionMode={executionStage} deliveryOrganizations={deliveryOrganizations} teamRoles={teamRoles} additionalResourceTypes={additionalResourceTypes} expenseTypes={expenseTypes} workItems={visibleWorkItems} onItemsChange={nextItems => replaceDemands('team', nextItems)} onItemChange={(index, item) => updateDemand('team', index, item)} onCreate={() => setOpenType('team')} onDelete={deleteDemandRows} deleting={deleting} /><DemandSection type="additional" items={items.additional} loading={loading} editing={editing || editingMode} executionMode={executionStage} deliveryOrganizations={deliveryOrganizations} teamRoles={teamRoles} additionalResourceTypes={additionalResourceTypes} expenseTypes={expenseTypes} workItems={visibleWorkItems} onItemsChange={nextItems => replaceDemands('additional', nextItems)} onItemChange={(index, item) => updateDemand('additional', index, item)} onCreate={() => setOpenType('additional')} onDelete={deleteDemandRows} deleting={deleting} /><DemandSection type="expense" items={items.expense} loading={loading} editing={editing || editingMode} executionMode={executionStage} deliveryOrganizations={deliveryOrganizations} teamRoles={teamRoles} additionalResourceTypes={additionalResourceTypes} expenseTypes={expenseTypes} workItems={visibleWorkItems} unavailable={!expensesAvailable} onItemsChange={nextItems => replaceDemands('expense', nextItems)} onItemChange={(index, item) => updateDemand('expense', index, item)} onCreate={() => setOpenType('expense')} onDelete={deleteDemandRows} deleting={deleting} /></RevenueExchangeRates.Provider><div className={`project-bottom-actions work-package-bottom-actions${saving ? ' is-saving' : ''}`}>
    {!editing ? <button className="primary" type="button" onClick={() => window.dispatchEvent(new Event('workspace-edit-click'))}>Edit</button> : <><button className="primary demand-recalculate-button" type="button" onClick={recalculate} disabled={saving || recalculating}>{recalculating ? 'Recalculating...' : 'Recalculate'}</button><button className="primary" type="button" onClick={() => window.dispatchEvent(new Event('workspace-save-click'))} disabled={saving || recalculating}>{saving ? 'Saving...' : 'Save'}</button><button className="secondary" type="button" onClick={cancelEditing} disabled={saving || recalculating}>Cancel</button></>}</div>{openType && <DemandModal type={openType} workPackage={selectedWorkPackage} workItems={workItems} deliveryOrganizations={deliveryOrganizations} teamRoles={teamRoles} additionalResourceTypes={additionalResourceTypes} expenseTypes={expenseTypes} onClose={() => setOpenType(null)} onCreated={created} onMessage={onMessage} />}{bulkType && <DemandBulkModal type={bulkType} onClose={() => setBulkType(null)} onMessage={onMessage} onCreated={created} />}</>
}

function DemandSection({ type, items, loading, editing, executionMode, deliveryOrganizations, teamRoles, additionalResourceTypes, expenseTypes, workItems, unavailable = false, deleting, onItemsChange, onItemChange, onCreate, onDelete }: { type: DemandType; items: CreateDemandRequest[]; loading: boolean; editing: boolean; executionMode: boolean; deliveryOrganizations: Array<{ code: string; name: string }>; teamRoles: Option[]; additionalResourceTypes: Option[]; expenseTypes: Option[]; workItems: WorkPackageDemandDetailsResponse['workItems']; unavailable?: boolean; deleting: boolean; onItemsChange: (items: CreateDemandRequest[]) => void; onItemChange: (index: number, item: CreateDemandRequest) => void; onCreate: () => void; onDelete: (type: DemandType, items: CreateDemandRequest[]) => void }) {
  const columns: DetailColumn[] = type === 'additional' ? [{key:'type',label:'Type'},{key:'deliveryOrganization',label:'Delivery Organization'},{key:'workItem',label:'Work Item'},{key:'effort',label:'Quantity'},{key:'unit',label:'Unit of Measure'},{key:'costPerUnit',label:'Cost / Unit'},{key:'revenuePerUnit',label:'Revenue / Unit'},{key:'cost',label:'Cost (Planned)'},{key:'revenue',label:'Revenue (Planned)'},{key:'margin',label:'Margin'},{key:'billing',label:'Billing Control Category'},{key:'action',label:'',optionLabel:'Remove row'}] : [{key:'expenseType',label:'Expense Type'},{key:'cost',label:'Cost'},{key:'revenue',label:'Revenue'},{key:'margin',label:'Margin'},{key:'billing',label:'Billing Control Category'},{key:'action',label:'',optionLabel:'Remove row'}]
  const { shownColumns, settingsButton, settingsDialog } = useDetailColumns(columns)
  const actionColumn = columns.find(column => column.key === 'action')!
  const renderedColumns = editing ? [...shownColumns.filter(column => column.key !== 'action'), actionColumn] : shownColumns.filter(column => column.key !== 'action')
  const headers = renderedColumns.map(column => column.label)
  const numericColumns = new Set(type === 'additional' ? ['effort', 'costPerUnit', 'revenuePerUnit', 'cost', 'revenue', 'margin'] : ['cost', 'revenue', 'margin'])
  const sectionWidths: Record<string, string> = type === 'additional'
    ? { type: 'auto', deliveryOrganization: 'auto', workItem: '132px', effort: '70px', unit: '77px', costPerUnit: '88px', revenuePerUnit: '120px', cost: 'auto', revenue: 'auto', margin: '80px', billing: '138px', action: '32px' }
    : { expenseType: 'auto', cost: 'auto', revenue: 'auto', margin: '80px', billing: '138px', action: '32px' }
  const emptyMessage = loading ? 'Loading data from SAP...' : unavailable ? 'SAP DemandSet read is not implemented for this tenant (HTTP 501).' : `${labels[type]} have not been planned yet.`
  if (type === 'team') return <GroupedTeamSection items={items} loading={loading} editing={editing} deleting={deleting} executionMode={executionMode} deliveryOrganizations={deliveryOrganizations} teamRoles={teamRoles} workItems={workItems} emptyMessage={emptyMessage} onItemsChange={onItemsChange} onCreate={onCreate} onDelete={selected => onDelete(type, selected)} />
  const displayItems = type === 'additional' ? groupAdditionalRows(items) : type === 'expense' ? groupExpenseRows(items) : items
  const changeDisplayedItem = (index: number, updatedItem: CreateDemandRequest) => {
    if (type !== 'additional' && type !== 'expense') {
      onItemChange(index, updatedItem)
      return
    }

    const groupedItem = displayItems[index]
    const memberIds = new Set((groupedItem.resourceDemandId || '').split('|').filter(Boolean))
    const sameGroup = (item: CreateDemandRequest) => type === 'additional'
      ? item.resourceId === groupedItem.resourceId && item.deliveryServiceOrg === groupedItem.deliveryServiceOrg && (item.workitem || '') === (groupedItem.workitem || '') && item.billingControlCategory === groupedItem.billingControlCategory && item.currency === groupedItem.currency
      : item.resourceId === groupedItem.resourceId && item.deliveryServiceOrg === groupedItem.deliveryServiceOrg && item.billingControlCategory === groupedItem.billingControlCategory && item.currency === groupedItem.currency
    const members = items.filter(item => memberIds.size
      ? Boolean(item.resourceDemandId && memberIds.has(item.resourceDemandId))
      : sameGroup(item))
    if (!members.length) return

    const quantityChanged = type === 'additional' && numeric(updatedItem.effort) !== numeric(groupedItem.effort)
    const amountFields = type === 'expense' ? ['expenseCost', 'expenseRevenue'] as const : []
    const oldAmounts = Object.fromEntries(amountFields.map(field => [field, numeric(groupedItem[field])]))
    let allocatedEffort = 0
    const updatedItems = items.map(item => {
      if (!members.includes(item)) return item
      let effort = item.effort
      if (quantityChanged) {
        const memberIndex = members.indexOf(item)
        const oldTotal = members.reduce((total, member) => total + numeric(member.effort), 0)
        const isLast = memberIndex === members.length - 1
        const share = oldTotal > 0 ? numeric(item.effort) / oldTotal : 1 / members.length
        const nextEffort = isLast
          ? numeric(updatedItem.effort) - allocatedEffort
          : numeric(updatedItem.effort) * share
        effort = String(Number(nextEffort.toFixed(6)))
        allocatedEffort += numeric(effort)
      }
      const nextItem = {
        ...item,
        resourceId: updatedItem.resourceId,
        roleName: updatedItem.roleName,
        deliveryServiceOrg: updatedItem.deliveryServiceOrg,
        deliveryServiceOrgName: updatedItem.deliveryServiceOrgName,
        workitem: updatedItem.workitem,
        billingControlCategory: updatedItem.billingControlCategory,
        effort,
        revenueRateDraft: updatedItem.revenueRateDraft,
      }
      if (quantityChanged) {
        nextItem.expenseCost = String(numeric(item.costPerHour) * numeric(effort))
        nextItem.expenseRevenue = String(numeric(item.revenuePerHour) * numeric(effort))
      }
      for (const field of amountFields) {
        if (updatedItem[field] === groupedItem[field]) continue
        const oldTotal = oldAmounts[field]
        const share = oldTotal !== 0 ? numeric(item[field]) / oldTotal : 1 / members.length
        nextItem[field] = String(numeric(updatedItem[field]) * share)
      }
      return nextItem
    })
    onItemsChange(updatedItems)
  }
  const addLabel = type === 'additional' ? 'Add Additional Resource' : 'Add Expense'
  return <section className={`card sap-detail-section${editing ? ' editing' : ''} ${type}-demand-section`}><div className="card-header"><h2>{labels[type]}</h2><div className="detail-section-header-actions"><div className="work-package-actions">{editing && <button className="primary" type="button" onClick={onCreate}>{addLabel}</button>}</div>{settingsButton}</div></div><div className="sap-detail-table"><DataTable headers={headers} headerClassNames={renderedColumns.map(column => `${numericColumns.has(column.key) ? 'demand-numeric-heading ' : ''}demand-heading-${column.key}`)} columnWidths={renderedColumns.map(column => sectionWidths[column.key] || '8%')}>{displayItems.length && !loading ? displayItems.map((item, index) => {
    const billingCell = <BillingCategorySelect value={item.billingControlCategory} editing={editing && !executionMode} onChange={value => changeDisplayedItem(index, { ...item, billingControlCategory: value })} />
    const actionCell = editing && <button className="demand-row-remove" type="button" onClick={() => onDelete(type, [item])} aria-label={`Delete ${labels[type]} row ${index + 1}`}>&times;</button>
    const moneyCell = (field: 'expenseCost' | 'expenseRevenue') => {
      if (editing && type === 'expense' && field === 'expenseRevenue' && item.deliveryServiceOrg) {
        return <DemandRevenueInput item={item} label="Expense revenue" onChange={rate => changeDisplayedItem(index, { ...item, revenueRateDraft: rate })} />
      }
      const sourceCurrency = field === 'expenseCost' ? item.costCurrency || item.currency : item.revenueCurrency || item.currency
      const targetCurrency = item.currency || sourceCurrency || ''
      const display = convertedMoney(numeric(item[field]), sourceCurrency || targetCurrency, targetCurrency)
      const displayedAmount = display.amount
      return editing && type === 'expense' && field === 'expenseCost'
      ? <span className="expense-money-edit"><input
          className="team-cell-input demand-money-input"
          type="text"
          inputMode="decimal"
          aria-label="Expense cost"
          value={item[field] ? String(displayedAmount) : ''}
          onChange={event => {
            const entered = Number(event.target.value.replace(/[^0-9.-]/g, ''))
            const nativeValue = Number.isFinite(entered) ? convertAmount(entered, targetCurrency, sourceCurrency || targetCurrency) : 0
            changeDisplayedItem(index, { ...item, [field]: event.target.value === '' ? '' : String(nativeValue) })
          }}
        /><span className="expense-money-currency">{display.currency}</span></span>
      : formatPlannedMoney(String(displayedAmount), display.currency)
    }
    const deliveryCell = type === 'additional' ? <DeliveryOrganizationSelect editable={editing && !executionMode} value={item.deliveryServiceOrg || ''} options={deliveryOrganizations} onChange={value => { const option = deliveryOrganizations.find(candidate => candidate.code === value); changeDisplayedItem(index, { ...item, deliveryServiceOrg: value, deliveryServiceOrgName: option?.name || value }) }} /> : null
    const additionalTypeName = additionalResourceTypes.find(option => option.code === item.resourceId)?.name || item.roleName || item.resourceId || '-'
    const expenseTypeName = expenseTypes.find(option => option.code === item.resourceId)?.name || item.roleName || item.resourceId || '-'
    const additionalTypeCell = editing && !executionMode ? <SearchableTableDropdown value={item.resourceId || ''} options={additionalResourceTypes.map(option => ({ value: option.code, label: `${option.code} - ${option.name}` }))} placeholder="Select type" searchPlaceholder="Search types..." emptyMessage="No resource types found" onChange={value => { const option = additionalResourceTypes.find(candidate => candidate.code === value); changeDisplayedItem(index, { ...item, resourceId: value, roleName: option?.name || value }) }} /> : additionalTypeName
    const expenseTypeCell = editing ? <SearchableTableDropdown value={item.resourceId || ''} options={expenseTypes.map(option => ({ value: option.code, label: `${option.code} - ${option.name}` }))} placeholder="Select expense type" searchPlaceholder="Search expense types..." emptyMessage="No expense types found" onChange={value => { const option = expenseTypes.find(candidate => candidate.code === value); changeDisplayedItem(index, { ...item, resourceId: value, roleName: option?.name || value }) }} /> : expenseTypeName
    const convertedCost = convertedMoney(numeric(item.expenseCost), item.costCurrency || item.currency, item.currency)
    const convertedRevenue = convertedMoney(numeric(item.expenseRevenue), item.revenueCurrency || item.currency, item.currency)
    const convertedMargin = formatRowMargin(String(convertedCost.amount), String(convertedRevenue.amount), convertedCost.currency, convertedRevenue.currency)
    const cellMap: Record<string, ReactNode> = type === 'additional' ? { type:additionalTypeCell, deliveryOrganization:deliveryCell, workItem:<WorkItemPicker editable={editing} value={item.workitem || ''} options={workItems} onChange={value => changeDisplayedItem(index, { ...item, workitem: value })} />, effort:editing ? <EditableCell editable value={item.effort || ''} type="number" onChange={value => changeDisplayedItem(index, { ...item, effort: value })} /> : item.effort || '-', unit:item.unitOfMeasure || 'Activity unit', costPerUnit:formatConvertedMoney(numeric(item.costPerHour), item.costCurrency || item.currency, item.currency), revenuePerUnit:editing && item.deliveryServiceOrg ? <DemandRevenueInput item={item} label="Revenue per unit" onChange={rate => changeDisplayedItem(index, { ...item, revenueRateDraft: rate })} /> : formatConvertedMoney(numeric(item.revenuePerHour), item.revenueCurrency || item.currency, item.currency), cost:moneyCell('expenseCost'), revenue:moneyCell('expenseRevenue'), margin:convertedMargin, billing:billingCell, action:actionCell } : { expenseType:expenseTypeCell, cost:moneyCell('expenseCost'), revenue:moneyCell('expenseRevenue'), margin:convertedMargin, billing:billingCell, action:actionCell }
    return <tr key={`${type}-${item.resourceDemandId || 'row'}-${index}`}>{renderedColumns.map(column => <td key={column.key} className={`demand-cell-${column.key}`}>{cellMap[column.key]}</td>)}</tr>
  }) : <tr><td className="sap-empty-row-cell" colSpan={Math.max(headers.length,1)}>{loading ? <span className="sap-detail-loading" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Loading data from SAP...</span></span> : emptyMessage}</td></tr>}</DataTable></div>{settingsDialog}</section>
}

function GroupedTeamSection({ items, loading, editing, deleting, executionMode, deliveryOrganizations, teamRoles, workItems, emptyMessage, onItemsChange, onCreate, onDelete }: { items: CreateDemandRequest[]; loading: boolean; editing: boolean; deleting: boolean; executionMode: boolean; deliveryOrganizations: Array<{ code: string; name: string }>; teamRoles: Option[]; workItems: WorkPackageDemandDetailsResponse['workItems']; emptyMessage: string; onItemsChange: (items: CreateDemandRequest[]) => void; onCreate: () => void; onDelete: (items: CreateDemandRequest[]) => void }) {
  const [selectedResources, setSelectedResources] = useState<StaffedResource[] | null>(null)
  const groups = groupTeamRows(items).map(item => {
    const memberIds = new Set((item.resourceDemandId || '').split('|').filter(Boolean))
    const members = items.filter(member => memberIds.size
      ? Boolean(member.resourceDemandId && memberIds.has(member.resourceDemandId))
      : teamGroupKey(member) === teamGroupKey(item))
    return { item, members, resources: item.staffedResources || [] }
  })
  const columns: DetailColumn[] = [{key:'role',label:'Role'},{key:'deliveryOrganization',label:'Delivery Organization'},{key:'workItem',label:'Work Item'},{key:'skills',label:'Skills'},{key:'effort',label:'Effort (Planned)'},{key:'staffedResource',label:'Staffed Resource'},{key:'staffedEffort',label:'Effort (Staffed)'},{key:'costPerHour',label:'Cost / Hr'},{key:'revenuePerHour',label:'Revenue/Hr'},{key:'cost',label:'Cost (Planned)'},{key:'revenue',label:'Revenue (Planned)'},{key:'margin',label:'Margin'},{key:'billing',label:'Billing Control Category'},{key:'action',label:'',optionLabel:'Remove row'}]
  const { shownColumns, settingsButton, settingsDialog } = useDetailColumns(columns)
  const actionColumn = columns.find(column => column.key === 'action')!
  const renderedColumns = editing ? [...shownColumns.filter(column => column.key !== 'action'), actionColumn] : shownColumns.filter(column => column.key !== 'action')
  const headers = renderedColumns.map(column => column.label)
  const teamWidths: Record<string, string> = {
    role: 'auto', deliveryOrganization: 'auto', workItem: '132px', skills: '96px', effort: '100px', staffedResource: '108px', staffedEffort: '94px',
    costPerHour: '90px', revenuePerHour: '120px', cost: 'auto', revenue: 'auto', margin: '80px', billing: '138px', action: '32px',
  }
  const numericColumns = new Set(['effort', 'staffedEffort', 'costPerHour', 'revenuePerHour', 'cost', 'revenue', 'margin'])
  return <>
    <section className={`card sap-detail-section team-demand-section${editing ? ' editing' : ''}`}>
      <div className="card-header"><h2>Team</h2><div className="detail-section-header-actions"><div className="work-package-actions">{editing && <button className="primary" type="button" onClick={onCreate}>Add Team Role</button>}</div>{settingsButton}</div></div>
      <div className="sap-detail-table"><DataTable headers={headers} headerClassNames={renderedColumns.map(column => `${numericColumns.has(column.key) ? 'demand-numeric-heading ' : ''}demand-heading-${column.key}`)} columnWidths={renderedColumns.map(column => teamWidths[column.key] || '7%')}>
        {groups.length && !loading ? groups.map(({ item, members, resources }, groupIndex) => {
          const assigned = resources.length > 0
          const editAll = editing && !assigned && !executionMode
          const change = (fields: Partial<CreateDemandRequest>) => {
            const targetResourceId = String(fields.resourceId ?? item.resourceId ?? '').trim().toUpperCase()
            const needsValidWholeEffort = targetResourceId === 'T002'
              && members.some(member => !Number.isInteger(numeric(member.effort)) || numeric(member.effort) <= 0)
            const targetEffort = fields.effort ?? (needsValidWholeEffort ? String(Math.round(numeric(item.effort))) : undefined)
            const effortChanged = targetEffort != null && (needsValidWholeEffort || numeric(targetEffort) !== numeric(item.effort))
            if (effortChanged && targetResourceId === 'T002' && !Number.isInteger(numeric(targetEffort))) return
            const wholeEfforts = effortChanged && targetResourceId === 'T002'
              ? allocatePositiveWholeEffort(numeric(targetEffort), members) || allocateWholeEffort(numeric(targetEffort), members)
              : undefined
            let allocatedEffort = 0
            const updatedItems = items.map(current => {
              if (!members.includes(current)) return current
              const memberIndex = members.indexOf(current)
              const oldEffort = numeric(item.effort)
              const share = oldEffort > 0 ? numeric(current.effort) / oldEffort : 1 / Math.max(members.length, 1)
              const memberEffort = effortChanged
                ? wholeEfforts
                  ? wholeEfforts[memberIndex]
                  : memberIndex === members.length - 1 ? numeric(targetEffort) - allocatedEffort : numeric(targetEffort) * share
                : numeric(current.effort)
              if (effortChanged) allocatedEffort += memberEffort
              const next = { ...current, ...fields }
              if (effortChanged) {
                next.effort = String(Number(memberEffort.toFixed(6)))
                next.expenseCost = String(numeric(item.costPerHour) * memberEffort)
                next.expenseRevenue = String(numeric(item.revenuePerHour) * memberEffort)
              } else {
                if (fields.expenseCost != null && members.length > 1) next.expenseCost = String(numeric(fields.expenseCost) * (numeric(item.expenseCost) ? numeric(current.expenseCost) / numeric(item.expenseCost) : 1 / members.length))
                if (fields.expenseRevenue != null && members.length > 1) next.expenseRevenue = String(numeric(fields.expenseRevenue) * (numeric(item.expenseRevenue) ? numeric(current.expenseRevenue) / numeric(item.expenseRevenue) : 1 / members.length))
              }
              return next
            })
            onItemsChange(updatedItems)
          }
          const staffedResource = resources.length === 1 ? <span>{resources[0].name}</span> : resources.length > 1 ? <button type="button" className="staffed-resource-count" onClick={() => setSelectedResources(resources)} title="View staffed resources"><span>{resources.length}</span></button> : <span className="sap-value-link">{editing ? 'Not Staffed' : 'Unassigned'}</span>
          const cells: Record<string, ReactNode> = {
            role: <RoleSelect editable={editAll} item={item} options={teamRoles} onChange={code => change({ roleName: teamRoles.find(option => option.code === code)?.name || code, resourceId: code })} />,
            deliveryOrganization: <DeliveryOrganizationSelect editable={editAll} value={item.deliveryServiceOrg || ''} options={deliveryOrganizations} onChange={value => { const option = deliveryOrganizations.find(option => option.code === value); const above = groups[groupIndex - 1]?.item; const costPerHour = above?.costPerHour || item.costPerHour || ''; const revenuePerHour = above?.revenuePerHour || item.revenuePerHour || ''; change({ deliveryServiceOrg: value, deliveryServiceOrgName: option?.name || value, costPerHour, revenuePerHour, expenseCost: String(numeric(costPerHour) * numeric(item.effort)), expenseRevenue: String(numeric(revenuePerHour) * numeric(item.effort)) }) }} />,
            workItem: <WorkItemPicker editable={editing && !executionMode} value={item.workitem || ''} options={workItems} onChange={value => change({ workitem: value })} />,
            skills: editAll ? <EditableCell editable value={item.skills || ''} onChange={value => change({ skills: value })} /> : item.skills || <span className="sap-value-link">Unassigned</span>,
            effort: editing ? <span className="team-effort-edit"><EditableCell editable type="number" step={item.resourceId?.trim().toUpperCase() === 'T002' ? 1 : 'any'} value={item.effort || ''} onChange={value => change({ effort: value })} /><span>h</span></span> : <>{item.effort ? `${formatNumber(numeric(item.effort))} h` : '-'}</>,
            staffedResource,
            staffedEffort: <>{formatNumber(resources.length ? resources.reduce((total, resource) => total + numeric(resource.effort), 0) : 0)} h</>,
            costPerHour: formatConvertedMoney(numeric(item.costPerHour || '0'), item.costCurrency || item.currency, item.currency),
            revenuePerHour: editing && isBillable(item) && item.deliveryServiceOrg ? <DemandRevenueInput item={item} label="Revenue per hour" onChange={rate => onItemsChange(items.map(member => members.includes(member) ? { ...member, revenueRateDraft: rate } : member))} /> : formatConvertedMoney(numeric(item.revenuePerHour || '0'), item.revenueCurrency || item.currency, item.currency),
            cost: formatPlannedConvertedMoney(plannedDemandCost(item), item.costCurrency || item.currency, item.currency),
            revenue: formatPlannedConvertedMoney(numeric(item.expenseRevenue || '0'), item.revenueCurrency || item.currency, item.currency),
            margin: (() => { const cost = convertedMoney(numeric(item.expenseCost), item.costCurrency || item.currency, item.currency); const revenue = convertedMoney(numeric(item.expenseRevenue), item.revenueCurrency || item.currency, item.currency); return formatRowMargin(String(cost.amount), String(revenue.amount), cost.currency, revenue.currency) })(),
            billing: <BillingCategorySelect value={item.billingControlCategory} editing={editAll} onChange={value => change({ billingControlCategory: value })} />,
            action: editing && <button className="demand-row-remove" type="button" onClick={() => onDelete([item])} disabled={deleting} aria-label={`Delete team row ${groupIndex + 1}`}>&times;</button>,
          }
          return <tr key={`team-group-${item.resourceDemandId || items.indexOf(item)}`}>{renderedColumns.map(column => <td key={column.key} className={`demand-cell-${column.key}`}>{cells[column.key]}</td>)}</tr>
        }) : <tr><td colSpan={Math.max(headers.length, 1)} className="work-package-empty">{loading ? <span className="sap-detail-loading" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Loading data from SAP...</span></span> : emptyMessage}</td></tr>}
      </DataTable></div>
      {settingsDialog}
    </section>
    {selectedResources && <StaffedResourcesModal resources={selectedResources} onClose={() => setSelectedResources(null)} />}
  </>
}

function StaffedResourcesModal({ resources, onClose }: { resources: StaffedResource[]; onClose: () => void }) {
  return <div className="work-package-modal-backdrop" role="presentation"><div className="work-package-modal staffed-resources-modal" role="dialog" aria-modal="true" aria-labelledby="staffed-resources-title"><div className="staffed-resources-header"><div><h2 id="staffed-resources-title">Staffed Resources <span>· {resources.length} resource(s)</span></h2><p>Assigned resources for this team role</p></div><button className="staffed-resources-close" type="button" onClick={onClose} aria-label="Close staffed resources">×</button></div><div className="staffed-resources-table-wrap"><table className="staffed-resources-table"><thead><tr><th>#</th><th>RESOURCE</th><th>DESIGNATION</th><th>ALLOCATION</th><th>PLANNED EFFORT</th><th>BILLING</th><th>ASSIGNMENT PERIOD</th></tr></thead><tbody>{resources.map((resource, index) => <tr key={`${resource.id || resource.name}-${index}`}><td>{index + 1}</td><td><div className="staffed-resource-name"><span className="staffed-resource-avatar">{resource.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{resource.name}</strong>{resource.id && <small>{resource.id}</small>}</span></div></td><td>Team Resource</td><td><span className={`staffed-allocation ${resource.allocation === '50%' ? 'shared' : ''}`}>{resource.allocation || '-'}</span></td><td>{resource.effort ? `${formatNumber(numeric(resource.effort))} h` : '-'}</td><td><span className="staffed-billing">{resource.billing || 'Billable'}</span></td><td>{resource.assignmentPeriod || '-'}</td></tr>)}</tbody></table></div><div className="staffed-resources-footer"><button className="primary" type="button" onClick={onClose}>Close</button></div></div></div>
}

function BillingCategorySelect({ value, editing, onChange }: { value?: string; editing: boolean; onChange: (value: string) => void }) {
  const category = value?.toLowerCase().includes('non') ? 'Non-Billable' : 'Billable'
  return <select className="billing-category-select" value={category} data-editing={editing} disabled={!editing} onChange={event => onChange(event.target.value)} aria-label="Billing Category"><option value="Billable">Billable</option><option value="Non-Billable">Non-Billable</option></select>
}

function withDefaultBillingCategory(item: CreateDemandRequest): CreateDemandRequest {
  return { ...item, billingControlCategory: item.billingControlCategory?.trim() || 'Billable' }
}

function isBillable(item: CreateDemandRequest) {
  return !item.billingControlCategory?.toLowerCase().includes('non')
}

let activeExchangeRates: Record<string, ExchangeRateValue> = {}
let activeProjectCurrency = ''
function currencyCode(currency?: string) {
  const normalized = String(currency || '').trim().toUpperCase()
  const supported = normalized.match(/\b(USD|INR)\b/)
  return supported?.[1] || normalized.split(' - ').at(-1)?.trim() || normalized
}
function convertAmount(amount: number, fromCurrency?: string, toCurrency?: string, rates = activeExchangeRates, projectCurrency = activeProjectCurrency) {
  const from = currencyCode(fromCurrency)
  const to = currencyCode(toCurrency)
  if (!Number.isFinite(amount) || !from || !to || from === to) return amount
  if (to === projectCurrency) {
    const targetRate = rates[from]
    if (targetRate?.rate > 0) return targetRate.quotation === 'indirect' ? amount / targetRate.rate : amount * targetRate.rate
  }
  if (from === projectCurrency) {
    const targetRate = rates[to]
    if (targetRate?.rate > 0) return targetRate.quotation === 'indirect' ? amount * targetRate.rate : amount / targetRate.rate
  }
  return amount
}

function convertedMoney(amount: number, fromCurrency?: string, toCurrency?: string, rates = activeExchangeRates, projectCurrency = activeProjectCurrency) {
  const from = currencyCode(fromCurrency)
  const to = currencyCode(toCurrency)
  const rate = rates[from]
  const converted = from === to || (to === projectCurrency && Number.isFinite(rate?.rate) && rate.rate > 0)
  return { amount: convertAmount(amount, from, to, rates, projectCurrency), currency: converted ? to : from || to }
}

function formatMoney(value?: string, currency?: string) {
  if (value == null || value === '') return '-'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return `${value} ${currency || ''}`.trim()
  const code = currencyCode(currency)
  return `${amount.toLocaleString(code === 'INR' ? 'en-IN' : undefined, { maximumFractionDigits: 2 })} ${code}`.trim()
}
function formatConvertedMoney(amount: number, fromCurrency?: string, toCurrency?: string) {
  const value = convertedMoney(amount, fromCurrency, toCurrency)
  return formatMoney(String(value.amount), value.currency)
}
function formatPlannedMoney(value?: string, currency?: string) {
  if (value == null || value === '') return '-'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return `${value} ${currency || ''}`.trim()
  const code = currencyCode(currency)
  const roundedAmount = Math.round(amount)
  return `${roundedAmount.toLocaleString(code === 'INR' ? 'en-IN' : undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`.trim()
}
function formatPlannedConvertedMoney(amount: number, fromCurrency?: string, toCurrency?: string) {
  const value = convertedMoney(amount, fromCurrency, toCurrency)
  return formatPlannedMoney(String(value.amount), value.currency)
}
function numeric(value?: string | number | null) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function demandCurrencyTotals(items: CreateDemandRequest[], amount: (item: CreateDemandRequest) => number, currency: (item: CreateDemandRequest) => string | undefined, fallbackCurrency?: string) {
  const totals = new Map<string, number>()
  for (const item of items) {
    const code = currency(item) || fallbackCurrency || ''
    totals.set(code, (totals.get(code) || 0) + amount(item))
  }
  return [...totals].map(([currencyCode, total]) => ({ currency: currencyCode, amount: total }))
}
function retainRateCurrencies(refreshed: CreateDemandRequest[], current: CreateDemandRequest[]) {
  const signature = (item: CreateDemandRequest) => [item.type, item.resourceId, item.deliveryServiceOrg, item.workitem, item.effort].join('|')
  const available = new Map<string, CreateDemandRequest[]>()
  for (const item of current) {
    const key = signature(item)
    available.set(key, [...(available.get(key) || []), item])
  }
  return refreshed.map(item => {
    const candidates = available.get(signature(item)) || []
    const previousIndex = candidates.findIndex(candidate => candidate.resourceDemandId === item.resourceDemandId)
    const previous = previousIndex >= 0 ? candidates.splice(previousIndex, 1)[0] : candidates.shift()
    return {
      ...item,
      // The post-save demand reload is authoritative. Keeping the recalculation
      // draft currency here can make the freshly loaded SAP amount get converted
      // a second time (for example, INR interpreted as USD).
      costCurrency: item.costCurrency || previous?.costCurrency,
      revenueCurrency: item.revenueCurrency || previous?.revenueCurrency,
    }
  })
}
function withDemandRevenue(item: CreateDemandRequest, rate: string, currency?: string): CreateDemandRequest {
  const quantity = numeric(item.effort) || (item.type === 'expense' ? 1 : 0)
  return {
    ...item,
    revenuePerHour: rate,
    revenueCurrency: currency,
    expenseRevenue: String(numeric(rate) * quantity),
  }
}
function plannedDemandCost(item: CreateDemandRequest) { const savedCost = numeric(item.expenseCost); return savedCost !== 0 || item.type !== 'team' ? savedCost : numeric(item.costPerHour) * numeric(item.effort) }
function formatCurrencyTotals(totals: Array<{ currency: string; amount: number }>, fallbackCurrency?: string) { return totals.length ? totals.map(total => formatPlannedMoney(String(total.amount), total.currency)).join(' + ') : formatPlannedMoney('0', fallbackCurrency) }
function formatNumber(value: number) { return value.toLocaleString(undefined, { maximumFractionDigits: 3 }) }
function formatPercent(value: number) { return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%` }
function formatRowMargin(cost?: string, revenue?: string, costCurrency?: string, revenueCurrency?: string) { const currenciesDiffer = costCurrency && revenueCurrency && costCurrency !== revenueCurrency; const value = currenciesDiffer ? 'N/A' : numeric(revenue) > 0 ? formatPercent(calculatedMargin(cost, revenue)) : 'N/A'; return <span className="sap-row-margin">{value}</span> }
function DemandModal({ type, workPackage, workItems, deliveryOrganizations, teamRoles, additionalResourceTypes, expenseTypes, onClose, onCreated, onMessage }: { type: DemandType; workPackage: SelectedWorkPackage | null; workItems: WorkPackageDemandDetailsResponse['workItems']; deliveryOrganizations: Array<{ code: string; name: string }>; teamRoles: Option[]; additionalResourceTypes: Option[]; expenseTypes: Option[]; onClose: () => void; onCreated: (item: CreateDemandRequest) => Promise<void>; onMessage: (state: DialogState) => void }) {
  const [form, setForm] = useState(blank(type, workPackage)); const set = <K extends keyof CreateDemandRequest>(key: K, value: CreateDemandRequest[K]) => setForm(current => ({ ...current, [key]: value }))
  const [working, setWorking] = useState(false)
  const availableTeamRoles = teamRoles.length ? teamRoles : Object.entries(roleNames).map(([code, name]) => ({ code, name }))
  const setRole = (code: string) => setForm(current => ({ ...current, resourceId: code, roleName: availableTeamRoles.find(role => role.code === code)?.name || code }))
  const setAdditionalResourceType = (code: string) => setForm(current => ({ ...current, resourceId: code, roleName: additionalResourceTypes.find(resourceType => resourceType.code === code)?.name || code }))
  const setExpenseType = (code: string) => setForm(current => ({ ...current, resourceId: code, roleName: expenseTypes.find(expenseType => expenseType.code === code)?.name || code }))
  const save = async () => {
    if (working) return
    if (type === 'team' && (!form.resourceId || !form.deliveryServiceOrg || !Number(form.effort) || Number(form.effort) <= 0)) {
      onMessage({ type: 'error', title: 'Required information missing', message: 'Select a Role and Delivery Organization, then enter Effort greater than zero.' })
      return
    }
    if (type === 'additional' && (!form.resourceId.trim() || !form.deliveryServiceOrg || !Number(form.effort) || Number(form.effort) <= 0)) {
      onMessage({ type: 'error', title: 'Required information missing', message: 'Enter a Type, select a Delivery Organization, and enter Quantity greater than zero.' })
      return
    }
    if (type === 'expense' && (!form.resourceId.trim() || !Number(form.expenseCost) || Number(form.expenseCost) <= 0)) {
      onMessage({ type: 'error', title: 'Required information missing', message: 'Enter an Expense Type and Cost greater than zero.' })
      return
    }
    const submission = type === 'team' ? { ...form, expenseRevenue: form.expenseRevenue || '0', billingControlCategory: form.billingControlCategory || 'Billable' } : form
    setWorking(true)
    try {
      await onCreated(submission)
      onClose()
    } catch (error) {
      onMessage({ type: 'error', title: 'Unable to add demand', message: error instanceof Error ? error.message : 'Unable to load the demand rates from SAP.' })
    } finally {
      setWorking(false)
    }
  }
  const organizationOptions = deliveryOrganizations.map(option => ({ value: option.code, label: option.name || option.code }))
  const workItemPicker = <div className="field"><label>Work Item</label><WorkItemPicker editable value={form.workitem || ''} options={workItems} onChange={value => set('workitem', value)} /></div>
  const organizationPicker = <div className="field"><label>Delivery Organization <span className="required">*</span></label><SearchableTableDropdown value={form.deliveryServiceOrg || ''} options={organizationOptions} placeholder="Select delivery organization" searchPlaceholder="Search organizations..." emptyMessage="No organizations found" onChange={value => { const org = deliveryOrganizations.find(option => option.code === value); setForm(current => ({ ...current, deliveryServiceOrg: value, deliveryServiceOrgName: org?.name || value })) }} /></div>
  return <div className={`work-package-modal-backdrop demand-entry-backdrop${type === 'team' ? ' team-demand-backdrop' : ''}`}><div className={`work-package-modal demand-entry-modal${type === 'team' ? ' team-demand-modal' : type === 'additional' ? ' additional-demand-modal' : ' expense-demand-modal'}`} role="dialog" aria-modal="true" aria-labelledby="demand-modal-title"><div className="work-package-modal-header"><div><p className="work-package-step">Work package detail</p><h2 id="demand-modal-title">{type === 'team' ? 'Add Role' : type === 'additional' ? 'Add a Resource' : 'Add an Expense'}</h2></div><button className="text-button" type="button" onClick={onClose}>Close</button></div><div className={`work-package-form-grid${type === 'team' ? ' team-demand-form-grid' : ''}`}>
    {type === 'team' && <><div className="field"><label>Role <span className="required">*</span></label><SearchableTableDropdown value={form.resourceId} options={availableTeamRoles.map(role => ({ value: role.code, label: `${role.code} - ${role.name}` }))} placeholder="Select role" searchPlaceholder="Search roles..." emptyMessage="No roles found" onChange={setRole} /></div>{organizationPicker}{workItemPicker}<Input label="Effort" type="number" value={form.effort || ''} onChange={v => set('effort', v)} />
    </>}
    {type === 'additional' && <><div className="field"><label>Type <span className="required">*</span></label><SearchableTableDropdown value={form.resourceId} options={additionalResourceTypes.map(resourceType => ({ value: resourceType.code, label: `${resourceType.code} - ${resourceType.name}` }))} placeholder="Select type" searchPlaceholder="Search types..." emptyMessage="No resource types found" onChange={setAdditionalResourceType} /></div><div className="field"><label>Delivery Organization <span className="required">*</span></label><SearchableTableDropdown value={form.deliveryServiceOrg || ''} options={organizationOptions} placeholder="Select delivery organization" searchPlaceholder="Search organizations..." emptyMessage="No organizations found" onChange={value => { const org = deliveryOrganizations.find(option => option.code === value); setForm(current => ({ ...current, deliveryServiceOrg: value, deliveryServiceOrgName: org?.name || value })) }} /></div>{workItemPicker}<Input label="Quantity" type="number" value={form.effort || ''} onChange={v => set('effort', v)} /></>}
    {type === 'expense' && <><div className="field"><label>Expense Type <span className="required">*</span></label><SearchableTableDropdown value={form.resourceId} options={expenseTypes.map(expenseType => ({ value: expenseType.code, label: `${expenseType.code} - ${expenseType.name}` }))} placeholder="Select expense type" searchPlaceholder="Search expense types..." emptyMessage="No expense types found" onChange={setExpenseType} /></div><Input label="Cost" type="number" value={form.expenseCost || ''} onChange={v => set('expenseCost', v)} /><Input label="Revenue" type="number" value={form.expenseRevenue || ''} onChange={v => set('expenseRevenue', v)} /><div className="field"><label>Billing Control Category <span className="required">*</span></label><select value={form.billingControlCategory || 'Billable'} onChange={event => set('billingControlCategory', event.target.value)}><option value="Billable">Billable</option><option value="Non-Billable">Non-Billable</option></select></div></>}
    </div><div className="form-actions">{working && <div className="sap-detail-loading" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Fetching demand rates from SAP...</span></div>}<button className="secondary" type="button" onClick={onClose} disabled={working}>Cancel</button><button className="primary" type="button" onClick={save} disabled={working}>{working ? 'Adding...' : 'Add'}</button></div></div></div>
}

function DemandBulkModal({ type, onClose, onMessage, onCreated }: { type: DemandType; onClose: () => void; onMessage: (state: DialogState) => void; onCreated: (item: CreateDemandRequest) => void }) {
  const [rows, setRows] = useState<CreateDemandRequest[]>([]); const [results, setResults] = useState(''); const [working, setWorking] = useState(false)
  const headers = ['ProjectID', 'WorkPackageID', 'WorkPackageName', 'ResourceId', 'Effort', 'Skills', 'DelvryServOrg', 'ExpenseRevenue', 'BillingControlCategory', 'Workitem', 'ExpenseCost']
  const template = () => { const row = type === 'team' ? ['6304499','6304499.1.2','Project Manager Advisory','T002','100','Hive, Hadoop','IN101','1','NON_BILL','',''] : type === 'additional' ? ['6304499','6304499.1.2','Project Manager Advisory','P001','100','','IN101','','','Z001',''] : ['6304499','6304499.1.2','Project Manager Advisory','E002','','','','','','','1000']; const sheet = XLSX.utils.aoa_to_sheet([headers, row]); sheet['!cols'] = headers.map(() => ({ wch: 20 })); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, labels[type]); XLSX.writeFile(book, `${type}-demand-sample-template.xlsx`) }
  const upload = async (file?: File) => { if (!file) return; const book = XLSX.read(await file.arrayBuffer(), { type: 'array' }); const values = XLSX.utils.sheet_to_json<Array<string | number>>(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' }); setRows(values.slice(1).filter(r => r.some(v => String(v).trim())).map(v => ({ projectId: String(v[0]), workPackageId: String(v[1]), workPackageName: String(v[2]), type, resourceId: String(v[3]), effort: String(v[4]), skills: String(v[5]), deliveryServiceOrg: String(v[6]), expenseRevenue: String(v[7]), billingControlCategory: String(v[8]), workitem: String(v[9]), expenseCost: String(v[10]) }))) }
  const create = () => { setWorking(true); const output = ['Serial,Project ID,Work Package ID,Resource ID,Status,Reason']; rows.forEach((row, index) => { onCreated(row); output.push(`${index + 1},${row.projectId},${row.workPackageId},${row.resourceId},Pending Save,`) }); setResults(output.join('\n')); setWorking(false); onMessage({ type: 'info', title: 'Rows added', message: `${rows.length} row(s) were added to the work package. Select Save to create them in SAP.` }) }
  if (results) return <div className="work-package-modal-backdrop"><div className="work-package-modal bulk-upload-modal"><h2>Rows added</h2><p className="bulk-upload-note">Rows are waiting to be saved. Select Save on the work package screen to create them in SAP.</p><div className="form-actions"><button className="secondary" onClick={onClose}>Done</button><button className="primary" onClick={() => downloadCsv(`${type}-demand-results.csv`, results)}>Download results</button></div></div></div>
  return <div className="work-package-modal-backdrop"><div className="work-package-modal bulk-upload-modal"><div className="work-package-modal-header"><div><p className="work-package-step">Bulk {labels[type]} upload</p><h2>Upload {labels[type]}</h2></div><button className="text-button" onClick={onClose}>Close</button></div><div className="bulk-upload-actions"><label className="primary">Upload Excel File<input type="file" accept=".xlsx,.xls" onChange={e => upload(e.target.files?.[0])} /></label><button className="text-button" onClick={template}>Download Sample Excel Template</button></div>{rows.length > 0 && <><p className="bulk-upload-count">{rows.length} row(s) ready to add.</p><div className="bulk-preview"><DataTable headers={['#','Project ID','Work Package ID','Resource ID']}>{rows.map((r,i)=><tr key={i}><td>{i+1}</td><td>{r.projectId}</td><td>{r.workPackageId}</td><td>{r.resourceId}</td></tr>)}</DataTable></div></>}<div className="form-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!rows.length || working} onClick={create}>{working ? 'Adding...' : 'Add rows'}</button></div></div></div>
}
function apiErrorMessage(error: unknown) { if (!(error instanceof ApiError)) return 'Unable to create demand in SAP.'; const details = error.details as { errors?: Record<string, string> } | null; const validationMessages = Object.values(details?.errors || {}); return validationMessages.length ? validationMessages.join(' ') : error.message }
function Input({ label, value, onChange, type = 'text', required = true }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <div className="field"><label>{label} {required && <span className="required">*</span>}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} /></div> }
function downloadCsv(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }




