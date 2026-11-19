import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx-js-style'
import type { DialogState } from '../components/dialogs/Dialog'
import { ApiError } from '../config/api'
import { DataTable } from '../components/tables/DataTable'
import { SettingsIcon } from '../components/SettingsIcon'
import { GlassDropdown } from '../components/forms/GlassDropdown'
import { projectService, type ApprovalWorkflow, type BillingContract, type BusinessPartnerOption, type CreateBillingPlanRequest, type CreateWorkPackageRequest, type Option, type ProjectBillingResponse, type ProjectMasterData, type ProjectServicePrice, type ProjectWorkspaceResponse, type WorkPackageDemandDetailsResponse, type WorkforcePerson } from '../services/projectService'
import { createResultWorkbook, createWorkPackageResultWorkbook } from '../utils/workPackageResultWorkbook'
import './ProjectWorkspace.css'

const tabs = [{ label: 'Project Information', icon: 'project', sapIcon: 'sap-icon://project-definition-triangle-2' }, { label: 'Budget', icon: 'budget', sapIcon: 'sap-icon://money-bills' }, { label: 'Billing', icon: 'billing', sapIcon: 'sap-icon://receipt' }, { label: 'Billing Due Dates', icon: 'dates', sapIcon: 'sap-icon://date-time' }]
type WorkPackageFormState = Omit<CreateWorkPackageRequest, 'type'> & { type: '' | CreateWorkPackageRequest['type'] }
type WorkspaceSaveRequest = { register: (save: () => Promise<boolean | void>, validate?: () => string | DialogState | null) => void }
type WorkspaceDirtyRequest = { register: (check: () => boolean) => void }
type WorkPackageCopyOptions = { blockedFunctions: boolean; workItem: boolean; team: boolean; requestedResources: boolean; additionalResources: boolean; expenses: boolean; attachments: boolean }
const defaultWorkPackageCopyOptions: WorkPackageCopyOptions = { blockedFunctions: false, workItem: true, team: true, requestedResources: true, additionalResources: true, expenses: true, attachments: false }
const blankWorkPackage = (): WorkPackageFormState => ({ projectId: '', type: '', workPackageName: '', description: '', startDate: '', endDate: '', unitId: '', unitQuantity: '' })
const numeric = (value?: string | number | null) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
const excelDateValue = (value: string | number | Date) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  if (typeof value === 'number' && value > 0) { const date = XLSX.SSF.parse_date_code(value); return date ? `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : '' }
  const text = String(value || '').trim()
  if (!text) return ''
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const parts = text.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/)
  if (!parts) return ''
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const month = /^\d+$/.test(parts[2]) ? Number(parts[2]) : months.indexOf(parts[2].slice(0, 3).toLowerCase()) + 1
  return month >= 1 && month <= 12 ? `${parts[3]}-${String(month).padStart(2, '0')}-${parts[1].padStart(2, '0')}` : ''
}
type WorkPackageBudgetSummary = { status: 'staffed' | 'partial' | 'unstaffed'; effort: number; staffedEffort: number; cost: number; revenue: number; workItems: WorkPackageDemandDetailsResponse['workItems']; availableWorkItems: NonNullable<WorkPackageDemandDetailsResponse['availableWorkItems']>; serviceDetails: WorkPackageDemandDetailsResponse['serviceDetails'] }

async function fetchWorkPackageBudgetSummary(projectId: string, workPackage: { id: string; name: string; type?: string }): Promise<WorkPackageBudgetSummary> {
  try {
    const details = await projectService.getWorkPackageDemandDetails({ projectId, id: workPackage.id, name: workPackage.name, type: workPackage.type })
    const demands = details.team || []
    const teamRows = demands.filter(item => item.type === 'team')
    // Match the Team table in WorkPackageDetail: repeated demand lines for the
    // same role/org/billing category are displayed as one row, and a person
    // appearing on multiple lines in that group is counted only once.
    const teamGroups = new Map<string, typeof teamRows[number]>()
    for (const item of teamRows) {
      const key = JSON.stringify([
        item.roleName || item.resourceId,
        item.deliveryServiceOrg || item.deliveryServiceOrgName,
        item.billingControlCategory?.toLowerCase().includes('non') ? 'Non-Billable' : 'Billable',
      ])
      const existing = teamGroups.get(key)
      if (!existing) {
        teamGroups.set(key, { ...item, staffedResources: [...(item.staffedResources || [])] })
        continue
      }
      const resources = [...(existing.staffedResources || [])]
      for (const resource of item.staffedResources || []) {
        if (!resources.some(current => (current.id && current.id === resource.id) || (!current.id && current.name === resource.name))) resources.push(resource)
      }
      teamGroups.set(key, {
        ...existing,
        effort: String(numeric(existing.effort) + numeric(item.effort)),
        staffedEffort: String(resources.length
          ? resources.reduce((total, resource) => total + numeric(resource.effort), 0)
          : numeric(existing.staffedEffort) + numeric(item.staffedEffort)),
        staffedResources: resources,
      })
    }
    const groupedTeamRows = [...teamGroups.values()]
    const staffing = groupedTeamRows.map(item => {
      const staffedResources = item.staffedResources || []
      const staffedEffort = staffedResources.length
        ? staffedResources.reduce((total, resource) => total + numeric(resource.effort), 0)
        : numeric(item.staffedEffort)
      const workerName = String(item.staffedResourceName || item.staffedResource || '').trim().toLowerCase()
      const assigned = staffedResources.length > 0 || numeric(item.staffedEffort) > 0 || Boolean(workerName && workerName !== 'unassigned' && workerName !== '-')
      const fullyStaffed = assigned && Math.abs(numeric(item.effort) - staffedEffort) <= 0.01
      return { assigned, fullyStaffed }
    })
    const anyAssigned = staffing.some(item => item.assigned)
    const allFullyStaffed = staffing.length > 0 && staffing.every(item => item.fullyStaffed)
    return {
      status: !anyAssigned ? 'unstaffed' : allFullyStaffed ? 'staffed' : 'partial',
      effort: teamRows.reduce((total, item) => total + numeric(item.effort), 0),
      staffedEffort: groupedTeamRows.reduce((total, item) => total + (item.staffedResources?.length ? item.staffedResources.reduce((rowTotal, resource) => rowTotal + numeric(resource.effort), 0) : numeric(item.staffedEffort)), 0),
      cost: demands.reduce((total, item) => total + numeric(item.expenseCost), 0),
      revenue: ['U', 'SERVICE'].includes(String(workPackage.type || '').toUpperCase())
        ? numeric(details.serviceDetails?.revenue ?? undefined)
        : demands.reduce((total, item) => total + numeric(item.expenseRevenue), 0),
      workItems: details.workItems || [],
      availableWorkItems: details.availableWorkItems || [],
      serviceDetails: details.serviceDetails,
    }
  } catch {
    return { status: 'unstaffed', effort: 0, staffedEffort: 0, cost: 0, revenue: 0, workItems: [], availableWorkItems: [], serviceDetails: null }
  }
}

function WorkspaceTabIcon({ name }: { name: string }) {
  return <span className="workspace-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24">
    {name === 'project' && <><circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v5M12 7.5h.01"/></>}
    {name === 'budget' && <><rect x="3.5" y="6" width="17" height="13" rx="2"/><path d="M3.5 10h17M8 14h3"/><circle cx="16.5" cy="14.5" r="1.5"/></>}
    {name === 'resources' && <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-3.1 2.2-4.7 5.5-4.7s5.1 1.6 5.5 4.7M16 5.5a3 3 0 0 1 0 5.8M17 14c2 .4 3.1 1.9 3.5 4"/></>}
    {name === 'billing' && <><path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"/><path d="M14.5 3.5v5h5M8 12h8M8 16h8"/></>}
    {name === 'dates' && <><rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16M8 13h2M13 13h3M8 16h2"/></>}
    {name === 'attachment' && <path d="m9 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a5 5 0 0 1-7.1-7.1l9.2-9.2"/>}
  </svg></span>
}

const masterName = (options: Array<{ code: string; name: string }>, value: string) => {
  const normalizedValue = value.trim().toLowerCase()
  const option = options.find(item => item.code?.trim().toLowerCase() === normalizedValue || item.name?.trim().toLowerCase() === normalizedValue)
  if (!option) return value
  const code = option.code?.trim() || ''
  const name = option.name?.trim() || ''
  return name && code && name !== code ? `${name} - ${code}` : name || code
}

const masterDisplayName = (options: Array<{ code: string; name: string }>, value: string) => {
  const normalizedValue = value.trim().toLowerCase()
  const option = options.find(item => item.code?.trim().toLowerCase() === normalizedValue || item.name?.trim().toLowerCase() === normalizedValue)
  return option?.name?.trim() || option?.code?.trim() || value
}

const nameAndCode = (name: string, code: string) => {
  const cleanName = name?.trim() || ''
  const cleanCode = code?.trim() || ''
  return cleanName && cleanCode && cleanName !== cleanCode ? `${cleanName} - ${cleanCode}` : cleanName || cleanCode
}

const codeFromDisplayValue = (value: string, options?: Array<{ code: string; name: string }>) => {
  const match = options?.find(option => option.name?.trim().toLowerCase() === value.trim().toLowerCase() || option.code?.trim().toLowerCase() === value.trim().toLowerCase())
  if (match) return match.code
  return value.includes(' - ') ? value.split(' - ').at(-1)?.trim() || value : value
}
const nameFromDisplayValue = (value: string) => value.includes(' - ') ? value.slice(0, value.lastIndexOf(' - ')).trim() : value
const dateInputValue = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  // SAP dates are displayed as `26 Oct 2026`. Parsing that as a local Date and
  // then converting it to ISO moves it to the previous day in UTC+ timezones.
  const displayDate = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (displayDate) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(displayDate[2].toLowerCase()) + 1
    if (month) return `${displayDate[3]}-${String(month).padStart(2, '0')}-${displayDate[1].padStart(2, '0')}`
  }
  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashDate) return `${slashDate[3]}-${slashDate[1].padStart(2, '0')}-${slashDate[2].padStart(2, '0')}`
  // Preserve calendar dates in ISO strings, including timestamps, without
  // applying the browser's local timezone.
  const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)
  if (isoDate) return isoDate[1]
  const sapDate = trimmed.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/)
  const parsed = sapDate ? new Date(Number(sapDate[1])) : new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`
}

const projectStageName = (value: string) => {
  const stages = [
    { code: 'P001', name: 'In Planning' },
    { code: 'P002', name: 'Contract Preparation' },
    { code: 'P003', name: 'In Execution' },
    { code: 'P004', name: 'Completed' },
    { code: 'P005', name: 'Closed' },
  ]
  const normalizedValue = value.trim().toLowerCase()
  const stage = stages.find(item => item.code.toLowerCase() === normalizedValue || item.name.toLowerCase() === normalizedValue)
  return stage?.name || value || '-'
}

const yesNoOptions = [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]
const projectTypeOptions = [
  { value: 'Capex', label: 'Capex Project' },
  { value: 'Fixed-Bid', label: 'Fixed Price / Milestone Based' },
  { value: 'Managed-TM', label: 'Managed Time & Material' },
  { value: 'Overhead', label: 'Overhead Project' },
  { value: 'Periodic', label: 'Recurring Billing (Periodic Billing)' },
  { value: 'TM', label: 'Time & Material' },
]
const sowStatusOptions = ['Available', 'Expired', 'Not Available', 'Renewed'].map(value => ({ value, label: value }))
const projectStageOptions = [
  { value: 'P001', label: 'In Planning' },
  { value: 'P002', label: 'Contract Preparation' },
  { value: 'P003', label: 'In Execution' },
  { value: 'P004', label: 'Completed' },
  { value: 'P005', label: 'Closed' },
]
const yesNoValue = (value: string) => ['YES', 'Y', 'X', 'TRUE', '1'].includes(value.trim().toUpperCase()) ? 'Yes' : 'No'

function withMasterDataNames(workspace: ProjectWorkspaceResponse, masterData: ProjectMasterData, workforce: WorkforcePerson[]): ProjectWorkspaceResponse {
  const project = workspace.project
  const customerCode = project.customerCode.match(/\(([^()]+)\)$/)?.[1] || codeFromDisplayValue(project.customerCode)
  const customerValue = (customerCode || project.customer).trim().toLowerCase()
  const customer = masterData.customers.find(item => item.code?.trim().toLowerCase() === customerValue || item.name?.trim().toLowerCase() === customerValue)
  const managerValue = (project.projectManagerExternalId || project.manager).trim().toLowerCase()
  const manager = workforce.find(item => item.personExternalId?.trim().toLowerCase() === managerValue || item.personFullName?.trim().toLowerCase() === managerValue || item.person?.trim().toLowerCase() === managerValue)
  return {
    ...workspace,
    project: {
      ...project,
      customer: nameAndCode(customer?.name || project.customer, customer?.code || customerCode),
      manager: manager?.personFullName || nameFromDisplayValue(project.manager),
      category: masterName(masterData.projectCategories, project.category),
      contractingCompanyCode: masterName(masterData.companyCodes, project.contractingCompanyCode),
      projectNature: masterName(masterData.projectNatures, project.projectNature),
      billability: masterName(masterData.billability, project.billability),
      costCenter: masterName(masterData.costCenters, project.costCenter),
      profitCenter: masterName(masterData.profitCenters, project.profitCenter),
      buName: masterName(masterData.profitCenterGroups, project.buName),
      orgId: masterDisplayName(masterData.orgIds, project.orgId),
      currency: masterName(masterData.currencies, project.currency),
      customerCode: customer?.code || customerCode,
      customerGroup: masterName(masterData.customerGroups, project.customerGroup),
      projectManagerExternalId: project.projectManagerExternalId || manager?.personExternalId || '',
    },
  }
}

export type SelectedWorkPackage = {
  projectId: string
  projectName?: string
  companyCode?: string
  costCenter?: string
  customerCode?: string
  currency: string
  projectStage?: string
  id: string
  wbsElementExternalID?: string
  name: string
  description?: string
  blockedFunctions?: string
  type: string
  startDate?: string
  endDate?: string
  unitId?: string
  unitQuantity?: string
}

export function ProjectWorkspace({ workspace, initialProjectId = '', initialTab = 'Project Information', approvalMode = false, onApprovalBack, onTabChange, onWorkspaceChange, onOpenWorkPackage, onMessage, onDirtyChange, onBillingDirtyChange }: { workspace: ProjectWorkspaceResponse | null; initialProjectId?: string; initialTab?: string; approvalMode?: boolean; onApprovalBack?: () => void; onTabChange?: (tab: string) => void; onWorkspaceChange: (workspace: ProjectWorkspaceResponse | null) => void; onOpenWorkPackage: (workPackage: SelectedWorkPackage) => void; onMessage: (state: DialogState) => void; onDirtyChange: (dirty: boolean) => void; onBillingDirtyChange: (dirty: boolean) => void }) {
  const [tab, setTabState] = useState(initialTab)
  const [billingDetailOpen, setBillingDetailOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(false)
  const [billingDirty, setBillingDirty] = useState(false)
  const [projectDraft, setProjectDraft] = useState<ProjectWorkspaceResponse['project'] | null>(workspace?.project || null)
  const billingDisabled = projectStageName(String(projectDraft?.stage || projectDraft?.status || '')).trim().toLowerCase() === 'in planning'
  const [responsibilitiesDraft, setResponsibilitiesDraft] = useState<ProjectWorkspaceResponse['responsibilities']>(workspace?.responsibilities || [])
  const [projectMasterData, setProjectMasterData] = useState<ProjectMasterData | null>(null)
  const [workforceOptions, setWorkforceOptions] = useState<WorkforcePerson[]>([])
  const [paymentTermOptions, setPaymentTermOptions] = useState<Array<{ value: string; label: string }>>([])
  const [savingProject, setSavingProject] = useState(false)
  const [workPackageSummaries, setWorkPackageSummaries] = useState<Record<string, WorkPackageBudgetSummary>>({})
  const [soldRevenue, setSoldRevenue] = useState<number | undefined>()
  const [workspaceLoading, setWorkspaceLoading] = useState(Boolean(initialProjectId.trim() && !workspace))
  const [approval, setApproval] = useState<ApprovalWorkflow | null>(null)
  const [approvalWorking, setApprovalWorking] = useState(false)
  useEffect(() => { setProjectDraft(workspace?.project || null); setResponsibilitiesDraft(workspace?.responsibilities || []); setEditingProject(false); setWorkPackageSummaries({}); setSoldRevenue(undefined) }, [workspace?.project.id])
  useEffect(() => { if (billingDisabled && tab === 'Billing') setTabState('Project Information') }, [billingDisabled, tab])
  useEffect(() => {
    const projectId = workspace?.project.id
    if (!projectId) return
    let cancelled = false
    projectService.getBilling(projectId).then(result => {
      const total = result.contracts.reduce((sum, contract) => sum + numeric(contract.plannedRevenue), 0)
      if (!cancelled && total > 0) setSoldRevenue(total)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [workspace?.project.id])
  useEffect(() => {
    const projectId = workspace?.project.id
    const packages = workspace?.workPackages || []
    if (!projectId) return
    let cancelled = false
    Promise.all(packages.map(async workPackage => [workPackage.id, await fetchWorkPackageBudgetSummary(projectId, workPackage)] as const))
      .then(entries => { if (!cancelled) setWorkPackageSummaries(Object.fromEntries(entries)) })
    return () => { cancelled = true }
  }, [workspace?.project.id, workspace?.workPackages])
  useEffect(() => { onTabChange?.(tab) }, [tab, onTabChange])
  useEffect(() => { onDirtyChange(editingProject); return () => onDirtyChange(false) }, [editingProject, onDirtyChange])
  useEffect(() => { onBillingDirtyChange(billingDirty); return () => onBillingDirtyChange(false) }, [billingDirty, onBillingDirtyChange])
  useEffect(() => {
    const editRequest = () => openProjectEdit()
    const saveRequest = (event: Event) => {
      const onComplete = (event as CustomEvent<{ onComplete?: (saved: boolean) => void }>).detail?.onComplete
      void commitAllChanges().then(saved => onComplete?.(saved))
    }
    const cancelRequest = () => cancelProjectChanges()
    window.addEventListener('workspace-edit-click', editRequest)
    window.addEventListener('workspace-save-click', saveRequest)
    window.addEventListener('workspace-cancel-click', cancelRequest)
    return () => {
      window.removeEventListener('workspace-edit-click', editRequest)
      window.removeEventListener('workspace-save-click', saveRequest)
      window.removeEventListener('workspace-cancel-click', cancelRequest)
    }
  })
  useEffect(() => {
    const startBillingEdit = () => { setEditingProject(true); window.dispatchEvent(new CustomEvent('billing-edit-mode', { detail: true })); window.dispatchEvent(new CustomEvent('workspace-edit-mode', { detail: true })) }
    const handleBillingEditMode = (event: Event) => { if (!(event as CustomEvent<boolean>).detail) setEditingProject(false) }
    window.addEventListener('billing-request-edit', startBillingEdit)
    window.addEventListener('billing-edit-mode', handleBillingEditMode)
    return () => { window.removeEventListener('billing-request-edit', startBillingEdit); window.removeEventListener('billing-edit-mode', handleBillingEditMode) }
  }, [])
  const discardBillingDraft = () => {
    window.dispatchEvent(new Event('billing-cancel-edit'))
    window.dispatchEvent(new CustomEvent('billing-edit-mode', { detail: false }))
    window.dispatchEvent(new CustomEvent('workspace-edit-mode', { detail: false }))
    setEditingProject(false)
    setBillingDirty(false)
  }
  const setTab = (nextTab: string) => {
    if (nextTab === tab) return
    if (tab === 'Billing' && billingDirty) {
      onMessage({ type: 'warning', title: 'Warning', message: 'Data has been changed. Do you want to save?', confirmLabel: 'Yes', secondaryLabel: 'No',
        onConfirm: () => { void commitAllChanges().then(saved => { if (saved) setTabState(nextTab) }) },
        onSecondary: () => { discardBillingDraft(); setTabState(nextTab) },
      })
      return
    }
    setTabState(nextTab)
  }
  useEffect(() => {
    const targetProjectId = initialProjectId.trim() || workspace?.project.id || ''
    if (!targetProjectId) { setWorkspaceLoading(false); return }
    let cancelled = false
    setWorkspaceLoading(true)
    Promise.all([projectService.getWorkspace(targetProjectId), projectService.getMasterData().catch(() => null), projectService.getWorkforce().catch(() => null)])
      .then(([nextWorkspace, masterData, workforceData]) => {
        const availableWorkforce = workforceData?.workforce || []
        setProjectMasterData(masterData)
        setWorkforceOptions(availableWorkforce)
        const normalizedWorkspace = masterData ? withMasterDataNames(nextWorkspace, masterData, availableWorkforce) : nextWorkspace
        setProjectDraft(normalizedWorkspace.project)
        setResponsibilitiesDraft(normalizedWorkspace.responsibilities)
        onWorkspaceChange(normalizedWorkspace)
      })
      .catch(error => onMessage({ type: 'error', title: 'Project fetch failed', message: error instanceof ApiError ? error.message : 'Unable to fetch project details from SAP.' }))
      .finally(() => { if (!cancelled) setWorkspaceLoading(false) })
    return () => { cancelled = true }
  }, [initialProjectId, workspace?.project.id])
  useEffect(() => {
    const customerCode = projectDraft?.customerCode?.trim()
    const companyCode = codeFromDisplayValue(projectDraft?.contractingCompanyCode || '', projectMasterData?.companyCodes)
    if (!customerCode || !companyCode) {
      setPaymentTermOptions([])
      return
    }
    let cancelled = false
    projectService.getPaymentTerms({ customerCode, companyCode }).then(result => {
      if (cancelled) return
      const fetched = result.paymentTerms
        ? [{ value: result.paymentTerms, label: result.paymentTermsName ? `${result.paymentTerms} - ${result.paymentTermsName}` : result.paymentTerms }]
        : []
      setPaymentTermOptions(fetched)
    }).catch(() => { if (!cancelled) setPaymentTermOptions([]) })
    return () => { cancelled = true }
  }, [projectDraft?.customerCode, projectDraft?.contractingCompanyCode, projectMasterData?.companyCodes])
  useEffect(() => {
    if (!approvalMode) { setApproval(null); return }
    const projectId = initialProjectId.trim() || workspace?.project.id || ''
    if (!projectId) { setApproval(null); return }
    projectService.getApproval(projectId).then(result => setApproval(result.approval)).catch(error => {
      setApproval(null)
      if (approvalMode) onMessage({ type: 'error', title: 'Approval details failed', message: error instanceof ApiError ? error.message : 'Unable to load approval details.' })
    })
  }, [approvalMode, initialProjectId, workspace?.project.id])
  const changeProjectField = (key: keyof ProjectWorkspaceResponse['project'], value: string) => setProjectDraft(current => {
    if (!current) return current
    if (key === 'customerGroup') return { ...current, customerGroup: value }
    if (key === 'buName') return { ...current, buName: value, profitCenter: '', costCenter: '', orgId: '' }
    if (key === 'profitCenter') return { ...current, profitCenter: value }
    if (key === 'costCenter') {
      const selected = projectMasterData?.costCenters.find(item => item.code === value)
      const mappedOrg = projectMasterData?.orgIds.find(item => item.code === selected?.orgId)
      return { ...current, costCenter: value, orgId: mappedOrg?.name || mappedOrg?.code || selected?.orgId || '' }
    }
    if (key === 'contractingCompanyCode') {
      const company = projectMasterData?.companyCodes.find(item => item.code === value)
      return { ...current, contractingCompanyCode: value, currency: company?.currency || current.currency }
    }
    return { ...current, [key]: value }
  })
  const changeProjectResponsibility = (roleId: string, workerId: string) => {
    const partner = projectMasterData?.businessPartners.find(item => item.id === workerId)
    const person = workforceOptions.find(item => item.person === workerId || item.personExternalId === workerId)
    setResponsibilitiesDraft(current => {
      const existingIndex = current.findIndex(item => item.roleId.trim().toLowerCase() === roleId.trim().toLowerCase())
      if (existingIndex >= 0) return current.map((item, itemIndex) => itemIndex === existingIndex
        ? { ...item, workerId, workerName: partner?.name || person?.personFullName || workerId }
        : item)
      const roleName = STANDARD_PROJECT_RESPONSIBILITY_ROLES.find(role => role.roleId.toLowerCase() === roleId.toLowerCase())?.roleName || roleId
      return [...current, { roleId, roleName, workerId, workerName: partner?.name || person?.personFullName || workerId, email: person?.defaultEmailAddress || '' }]
    })
  }
  const persistProjectChanges = async (): Promise<'saved' | 'unchanged' | 'failed'> => {
    if (!workspace || !projectDraft) return 'failed'
    setSavingProject(true)
    try {
      const normalize = (project: ProjectWorkspaceResponse['project']) => ({
        ...project,
        contractingCompanyCode: codeFromDisplayValue(project.contractingCompanyCode),
        projectNature: codeFromDisplayValue(project.projectNature),
        billability: codeFromDisplayValue(project.billability),
        category: codeFromDisplayValue(project.category),
        costCenter: codeFromDisplayValue(project.costCenter),
        profitCenter: codeFromDisplayValue(project.profitCenter),
        orgId: codeFromDisplayValue(project.orgId, projectMasterData?.orgIds),
        currency: codeFromDisplayValue(project.currency),
        customerGroup: codeFromDisplayValue(project.customerGroup),
        stage: codeFromDisplayValue(project.stage || project.status),
        startDate: dateInputValue(project.startDate),
        endDate: dateInputValue(project.endDate),
        publicProject: project.publicProject,
        useProjectBilling: yesNoValue(project.useProjectBilling),
        restrictTimePosting: yesNoValue(project.restrictTimePosting),
      })
      const current = normalize(projectDraft)
      const original = normalize(workspace.project)
      const editableKeys: Array<keyof typeof current> = [
        'name', 'description', 'stage', 'category', 'typeOfProject', 'currency', 'startDate', 'endDate',
        'projectManagerExternalId', 'customerCode', 'endCustomer', 'paymentTerms', 'profitCenter',
        'publicProject', 'restrictTimePosting', 'billability', 'expenseBookingAllowed',
        'overtimeAllowed', 'projectBillableDailyHours', 'sowStatus', 'contractingCompanyCode', 'customerGroup', 'projectNature',
      ]
      const updatePayload = Object.fromEntries(editableKeys
        .filter(key => String(current[key] ?? '') !== String(original[key] ?? ''))
        .map(key => [key, current[key]])) as Partial<ProjectWorkspaceResponse['project']>
      if (Object.keys(updatePayload).length) await projectService.updateProject(workspace.project.id, updatePayload)
      const originalResponsibilities = new Map(workspace.responsibilities.map(item => [item.roleId.trim().toLowerCase(), item.workerId]))
      const changedResponsibilities = responsibilitiesDraft.filter(item => originalResponsibilities.get(item.roleId.trim().toLowerCase()) !== item.workerId)
      const existingRoleChanges = changedResponsibilities.filter(item => originalResponsibilities.has(item.roleId.trim().toLowerCase()))
      const newRoleAssignments = changedResponsibilities.filter(item => !originalResponsibilities.has(item.roleId.trim().toLowerCase()))
      const roleResults = await Promise.allSettled([
        ...existingRoleChanges.map(item => projectService.updateProjectResponsibility(workspace.project.id, item.roleId, item.workerId)),
        ...(newRoleAssignments.length ? [projectService.retryResponsibilities(workspace.project.id, newRoleAssignments.map(item => ({ projectRoleId: item.roleId, businessPartnerId: item.workerId, businessPartnerName: item.workerName })))] : []),
      ])
      const refreshedWorkspace = await projectService.getWorkspace(workspace.project.id)
      const normalizedWorkspace = projectMasterData
        ? withMasterDataNames(refreshedWorkspace, projectMasterData, workforceOptions)
        : refreshedWorkspace
      onWorkspaceChange(normalizedWorkspace)
      setProjectDraft(normalizedWorkspace.project)
      setResponsibilitiesDraft(normalizedWorkspace.responsibilities)
      const failedRoleNames = existingRoleChanges.filter((_, index) => roleResults[index].status === 'rejected').map(item => item.roleName)
      if (newRoleAssignments.length && roleResults[existingRoleChanges.length]?.status === 'rejected') failedRoleNames.push(...newRoleAssignments.map(item => item.roleName))
      if (failedRoleNames.length) {
        onMessage({ type: 'warning', title: 'Project updated with responsibility errors', message: `Project details were saved, but these responsibility updates failed: ${failedRoleNames.join(', ')}.` })
      } else if (!Object.keys(updatePayload).length && !changedResponsibilities.length) {
        return 'unchanged'
      }
      return failedRoleNames.length === 0 ? 'saved' : 'failed'
    } catch (error) {
      onMessage({ type: 'error', title: 'Project update failed', message: error instanceof ApiError ? error.message : 'Unable to update project details in SAP.' })
      return 'failed'
    } finally {
      setSavingProject(false)
    }
  }
  const commitAllChanges = async () => {
    const childSaves: Array<{ save: () => Promise<boolean | void>; validate?: () => string | DialogState | null }> = []
    const childDirtyChecks: Array<() => boolean> = []
    window.dispatchEvent(new CustomEvent<WorkspaceDirtyRequest>('workspace-dirty-request', { detail: { register: check => childDirtyChecks.push(check) } }))
    const childChangesPending = childDirtyChecks.some(check => check())
    window.dispatchEvent(new CustomEvent<WorkspaceSaveRequest>('workspace-save-request', { detail: { register: (save, validate) => childSaves.push({ save, validate }) } }))
    const validationError = childSaves.map(item => item.validate?.()).find(Boolean)
    if (validationError) {
      onMessage(typeof validationError === 'string'
        ? { type: 'error', title: 'Some changes cannot be saved', message: validationError }
        : validationError)
      return false
    }
    setSavingProject(true)
    let childChangesSaved = false
    for (const item of childSaves) {
      try { if (await item.save() === true) childChangesSaved = true }
      catch (reason) {
        setSavingProject(false)
        onMessage({ type: 'error', title: 'Some changes need attention', message: reason instanceof Error ? reason.message : 'One or more project sections could not be saved. Your edit session is still open.' })
        return false
      }
    }
    const projectSave = await persistProjectChanges()
    if (projectSave === 'failed') return false
    if (projectSave === 'saved' || childChangesSaved || childChangesPending) onMessage({ type: 'success', title: 'Project changes saved', message: 'Your changes were saved to SAP.' })
    else onMessage({ type: 'info', title: 'No changes to save', message: 'No changes were found.' })
    setEditingProject(false)
    window.dispatchEvent(new CustomEvent('billing-edit-mode', { detail: false }))
    window.dispatchEvent(new CustomEvent('workspace-edit-mode', { detail: false }))
    setBillingDirty(false)
    return true
  }
  const saveProjectChanges = () => { void commitAllChanges() }
  const discardProjectChanges = () => { setProjectDraft(workspace?.project || null); setResponsibilitiesDraft(workspace?.responsibilities || []); setEditingProject(false); window.dispatchEvent(new Event('billing-cancel-edit')); window.dispatchEvent(new CustomEvent('billing-edit-mode', { detail: false })); window.dispatchEvent(new CustomEvent('workspace-edit-mode', { detail: false })) }
  const cancelProjectChanges = () => {
    const childChecks: Array<() => boolean> = []
    window.dispatchEvent(new CustomEvent<WorkspaceDirtyRequest>('workspace-dirty-request', { detail: { register: check => childChecks.push(check) } }))
    const projectValues = (project: ProjectWorkspaceResponse['project']) => {
      const normalized = {
        ...project,
        contractingCompanyCode: codeFromDisplayValue(project.contractingCompanyCode),
        projectNature: codeFromDisplayValue(project.projectNature),
        billability: codeFromDisplayValue(project.billability),
        category: codeFromDisplayValue(project.category),
        currency: codeFromDisplayValue(project.currency),
        customerGroup: codeFromDisplayValue(project.customerGroup),
        stage: codeFromDisplayValue(project.stage || project.status),
        startDate: dateInputValue(project.startDate),
        endDate: dateInputValue(project.endDate),
        publicProject: yesNoValue(project.publicProject),
        useProjectBilling: yesNoValue(project.useProjectBilling),
        restrictTimePosting: yesNoValue(project.restrictTimePosting),
      }
      return ['name', 'description', 'stage', 'category', 'typeOfProject', 'currency', 'startDate', 'endDate', 'projectManagerExternalId', 'customerCode', 'endCustomer', 'paymentTerms', 'profitCenter', 'publicProject', 'restrictTimePosting', 'billability', 'expenseBookingAllowed', 'overtimeAllowed', 'projectBillableDailyHours', 'sowStatus', 'contractingCompanyCode', 'customerGroup', 'projectNature']
        .map(key => String(normalized[key as keyof typeof normalized] ?? '')).join('\u0000')
    }
    const projectChanged = Boolean(projectDraft && workspace && projectValues(projectDraft) !== projectValues(workspace.project))
    const responsibilityValues = (items: ProjectWorkspaceResponse['responsibilities']) => items.map(item => `${item.roleId}\u0000${item.workerId}`).sort().join('\u0001')
    const responsibilitiesChanged = Boolean(workspace && responsibilityValues(responsibilitiesDraft) !== responsibilityValues(workspace.responsibilities))
    if (!projectChanged && !responsibilitiesChanged && !childChecks.some(check => check())) {
      discardProjectChanges()
      return
    }
    onMessage({ type: 'warning', title: 'Discard project changes?', message: 'Your unsaved changes will be discarded. Do you want to continue?', confirmLabel: 'Discard', onConfirm: discardProjectChanges })
  }
  const openProjectEdit = () => { setEditingProject(true); window.dispatchEvent(new CustomEvent('billing-edit-mode', { detail: true })); window.dispatchEvent(new CustomEvent('workspace-edit-mode', { detail: true })) }
  const takeApprovalAction = (action: 'approve' | 'reject') => {
    if (!workspace || !approval?.canAct) return
    onMessage({ type: 'warning', title: `${action === 'approve' ? 'Approve' : 'Reject'} project?`, message: `Confirm that you want to ${action} this project at Level ${approval.userLevel}.`, confirmLabel: action === 'approve' ? 'Approve' : 'Reject', onConfirm: () => { setApprovalWorking(true); projectService.actOnApproval(workspace.project.id, action).then(next => { setApproval(next); onMessage({ type: action === 'approve' ? 'success' : 'info', title: action === 'approve' ? 'Project approved' : 'Project rejected', message: `Your Level ${next.userLevel} decision was recorded.` }) }).catch(error => onMessage({ type: 'error', title: 'Approval action failed', message: error instanceof ApiError ? error.message : 'Unable to update approval.' })).finally(() => setApprovalWorking(false)) } })
  }
  const hasWorkPackageTotals = Object.keys(workPackageSummaries).length > 0
  const workPackageTotals = Object.values(workPackageSummaries).reduce((totals, item) => ({ effort: totals.effort + item.effort, cost: totals.cost + item.cost, revenue: totals.revenue + item.revenue }), { effort: 0, cost: 0, revenue: 0 })
    return <div className={billingDetailOpen ? "workspace-billing-item-detail-mode" : ""}><div className="breadcrumb">Project Management / {approvalMode ? 'Approvals / Project Details' : 'Project Workspace'}</div>{workspace && projectDraft && <ProjectDetails data={{ ...workspace, project: projectDraft }} plannedSummary={hasWorkPackageTotals ? workPackageTotals : undefined} soldRevenueOverride={soldRevenue} editing={false} onChange={() => undefined} />}<div className="tabs workspace-tabs" role="tablist" aria-label="Project workspace sections">{tabs.map(({ label, icon }) => {
      const disabled = label === 'Billing' && billingDisabled
      return <button key={label} type="button" className={`tab workspace-tab ${tab === label && !disabled ? 'active' : ''} ${disabled ? 'disabled' : ''}`} onClick={() => { if (!disabled) setTab(label) }} role="tab" aria-selected={tab === label && !disabled} aria-disabled={disabled} disabled={disabled}><WorkspaceTabIcon name={icon} />{label}</button>
    })}</div><div className="workspace-content">{!workspace || !projectDraft ? workspaceLoading ? <div className="card empty workspace-loading-card" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Loading project data from SAP...</span></div> : <div className="card empty">Select a project from <strong>Project Overview</strong> to view its SAP data.</div> : <>{workspace && projectDraft && <div style={{ display: tab === 'Project Information' ? 'contents' : 'none' }}><FullProjectDetails project={projectDraft} masterData={projectMasterData} workforce={workforceOptions} paymentTermOptions={paymentTermOptions} editing={editingProject} onChange={changeProjectField} /><ProjectDescription value={projectDraft.description} editing={editingProject} onChange={value => changeProjectField('description', value)} /><ProjectResponsibilities items={responsibilitiesDraft} editing={editingProject} partners={projectMasterData?.businessPartners || []} onPartnerChange={changeProjectResponsibility} />{approval && <ApprovalHierarchy approval={approval} working={approvalWorking} onAction={takeApprovalAction} onBack={() => onApprovalBack?.()} showActions={approvalMode} />}</div>}<div style={{ display: tab === 'Budget' ? 'contents' : 'none' }}><WorkPackages onOpen={onOpenWorkPackage} onMessage={onMessage} existing={workspace.workPackages} projectId={workspace.project.id} projectCurrency={codeFromDisplayValue(projectDraft.currency)} projectCompanyCode={codeFromDisplayValue(projectDraft.contractingCompanyCode)} projectCostCenter={codeFromDisplayValue(projectDraft.costCenter)} projectContext={{ status: projectDraft.status, stage: projectDraft.stage, startDate: projectDraft.startDate, endDate: projectDraft.endDate, blockedFunctions: projectDraft.blockedFunctions, customerCode: projectDraft.customerCode }} serviceUnits={projectMasterData?.serviceUnits || []} editingMode={editingProject} budgetSummaries={workPackageSummaries} onBudgetSummariesChange={setWorkPackageSummaries} onWorkPackagesChange={workPackages => onWorkspaceChange(workspace ? { ...workspace, workPackages } : null)} /></div><div style={{ display: tab === 'Billing' ? 'contents' : 'none' }}><Billing projectId={workspace.project.id} projectName={projectDraft.name} salesOrganization={codeFromDisplayValue(projectDraft.contractingCompanyCode)} projectCurrency={codeFromDisplayValue(projectDraft.currency)} projectProfitCenter={projectDraft.profitCenter} serviceOptions={[...(projectMasterData?.teamRoles || []), ...(projectMasterData?.additionalResourceTypes || []), ...(projectMasterData?.serviceUnits || [])]} budgetSummaries={workPackageSummaries} onBillingDirtyChange={setBillingDirty} onDetailPageChange={setBillingDetailOpen} /></div><div style={{ display: tab === 'Billing Due Dates' ? 'contents' : 'none' }}><BillingDueDates projectId={workspace.project.id} projectCurrency={codeFromDisplayValue(projectDraft.currency)} active={tab === 'Billing Due Dates' && !billingDetailOpen} editing={editingProject} /></div></>}</div>{workspace && !approvalMode && <div className="project-bottom-actions workspace-global-actions">{editingProject ? <><button className="primary" type="button" disabled={savingProject} onClick={saveProjectChanges}>{savingProject ? 'Saving...' : 'Save'}</button><button className="secondary" type="button" onClick={cancelProjectChanges} disabled={savingProject}>Cancel</button></> : <button className="primary" type="button" onClick={openProjectEdit}>Edit</button>}</div>}</div>
}

function ApprovalHierarchy({ approval, working, onAction, onBack, showActions = true }: { approval: ApprovalWorkflow; working: boolean; onAction: (action: 'approve' | 'reject') => void; onBack: () => void; showActions?: boolean }) {
  const statusLabel = (status: ApprovalWorkflow['levels'][number]['status']) => status === 'pending' ? 'Pending Approval' : status === 'not_started' ? 'Not Started' : status === 'approved' ? 'Approved' : 'Rejected'
  const compactStatus = approval.canAct && !approval.completed
    ? <button className="primary approval-compact-action" type="button" disabled={working} onClick={() => onAction('approve')}>{working ? 'Approving...' : 'Approve'}</button>
    : approval.userState === 'already_approved' || approval.userState === 'fully_approved'
      ? <button className="approval-approved-button approval-compact-action" type="button" disabled>âœ“ Approved</button>
      : approval.userState === 'waiting_on_earlier_level'
        ? <span className="approval-waiting-badge"><b>Previous level pending</b><small>Wait for approval</small></span>
        : approval.rejected
          ? <span className="approval-rejected-badge">Workflow rejected</span>
          : null
  return <section className="card approval-card approval-decision-card">
    <h2>Approval Status Flow</h2>
    <div className="approval-flow-track">{approval.levels.map((level, index) => <article className={`approval-flow-step ${level.status}`} key={`${level.level}-${level.roleId}`}><div className="approval-flow-connector" aria-hidden="true" /><span className="approval-flow-dot" aria-hidden="true">{level.status === 'approved' ? 'âœ“' : level.status === 'rejected' ? 'Ã—' : ''}</span><small>LEVEL {level.level}</small><strong>{level.roleName || level.roleId || '-'}</strong><a>{level.businessPartnerName || level.businessPartnerId || 'Unassigned'}</a><em>{statusLabel(level.status)}</em>{index === approval.userLevel - 1 && <b className="approval-you-badge">You</b>}</article>)}</div>
    <div className="approval-stage-actions">
      <div className="approval-current-stage"><span>Current Stage</span><strong>{approval.userState === 'waiting_on_earlier_level' ? `Waiting on Earlier Level â€” ${approval.currentStage}` : approval.currentStage}</strong></div>
      {showActions ? <div className="project-bottom-actions approval-actions"><button className="secondary" type="button" disabled={working} onClick={onBack}>â† Go Back (decide later)</button>{approval.canAct && !approval.completed ? <><button className="danger" type="button" disabled={working} onClick={() => onAction('reject')}>Reject</button><button className="primary" type="button" disabled={working} onClick={() => onAction('approve')}>Approve</button></> : (approval.userState === 'already_approved' || approval.userState === 'fully_approved') && <button className="approval-approved-button" type="button" disabled>âœ“ Approved</button>}</div> : <div className="approval-compact-control">{compactStatus}</div>}
    </div>
  </section>
}

type ProjectFieldKey = keyof ProjectWorkspaceResponse['project']
type ProjectDetailField = { label: string; key: ProjectFieldKey; value: string; displayValue?: string; options?: Array<{ value: string; label: string }>; type?: string; readOnly?: boolean; onSelect?: (value: string) => void }

function DetailsSection({ title, fields, editing, onChange }: { title: string; fields: ProjectDetailField[]; editing: boolean; onChange: (key: ProjectFieldKey, value: string) => void }) {
  return <section className="card full-project-details workspace-detail-section"><div className="card-header"><h2>{title}</h2></div><div className="form-grid">{fields.map(field => {
    const editable = editing && !field.readOnly
    const selectedValue = field.options ? codeFromDisplayValue(field.value) : field.value
    const dropdownOptions = field.options ? [...field.options] : []
    if (field.key !== 'stage' && selectedValue && !dropdownOptions.some(option => option.value === selectedValue)) dropdownOptions.unshift({ value: selectedValue, label: field.displayValue || field.value })
    return <div className="field" key={field.label}>
      <label>{field.label}</label>
      {editable && field.options ? <GlassDropdown value={selectedValue} selectedLabel={field.key === 'stage' ? field.displayValue || field.value : undefined} options={dropdownOptions} placeholder={`Select ${field.label}`} searchPlaceholder={`Search ${field.label.toLowerCase()}...`} onChange={value => field.onSelect ? field.onSelect(value) : onChange(field.key, value)} /> : editable && field.type === 'textarea' ? <textarea className="project-editable-input" value={field.value} onChange={event => onChange(field.key, event.target.value)} /> : <input type={editable ? field.type || 'text' : 'text'} readOnly={!editable} className={editable ? 'project-editable-input' : ''} value={editable ? (field.type === 'date' ? dateInputValue(field.value) : field.value) : (field.displayValue ?? field.value) || '-'} onChange={event => onChange(field.key, event.target.value)} />}
    </div>
  })}</div></section>
}

function FullProjectDetails({ project, masterData, workforce, paymentTermOptions, editing, onChange }: { project: ProjectWorkspaceResponse['project']; masterData: ProjectMasterData | null; workforce: WorkforcePerson[]; paymentTermOptions: Array<{ value: string; label: string }>; editing: boolean; onChange: (key: ProjectFieldKey, value: string) => void }) {
  const options = (items: Array<{ code: string; name: string }> | undefined) => (items || []).map(item => ({ value: item.code, label: item.name || item.code }))
  const selectedBu = masterData?.profitCenterGroups.find(item => item.code === project.buName || item.name === project.buName)?.name || project.buName
  const sbuOptions = (masterData?.profitCenters || []).filter(item => item.standardHierarchy.trim().toLowerCase() === selectedBu.trim().toLowerCase())
  const projectTypeName = projectTypeOptions.find(item => item.value === project.typeOfProject)?.label || project.typeOfProject
  const paymentTermsName = paymentTermOptions.find(item => item.value === codeFromDisplayValue(project.paymentTerms))?.label || project.paymentTerms
  const configuredStages = [...projectStageOptions, ...(masterData?.projectStages || []).map(item => ({ value: item.code, label: item.name }))]
    .filter((item, index, all) => all.findIndex(candidate => candidate.value === item.value) === index)
  const currentStage = project.stage || project.status
  const normalizedStage = String(currentStage || '').trim().toLowerCase()
  const currentStageName = projectStageName(normalizedStage).trim().toLowerCase()
  const isCompleted = normalizedStage === 'p004' || normalizedStage === 'completed' || currentStageName === 'completed'
  const projectStages = isCompleted
    ? configuredStages.filter(item => item.value === 'P003' || item.value === 'P004' || item.value === 'P005')
    : (() => {
        const currentStageIndex = configuredStages.findIndex(item =>
          item.value.trim().toLowerCase() === normalizedStage || item.label.trim().toLowerCase() === currentStageName
        )
        return currentStageIndex >= 0 && currentStageIndex < configuredStages.length - 1
          ? [configuredStages[currentStageIndex + 1]]
          : []
      })()
  const hoursOptions = Array.from(new Set(['8', '9', '10', '11', '12', project.projectBillableDailyHours].filter(Boolean))).sort((a, b) => Number(a) - Number(b)).map(value => ({ value, label: value }))
  const managerOptions = workforce.map(person => ({ value: person.personExternalId, label: nameAndCode(person.personFullName, person.personExternalId) }))
  if (project.projectManagerExternalId && !managerOptions.some(item => item.value === project.projectManagerExternalId)) managerOptions.push({ value: project.projectManagerExternalId, label: project.manager || project.projectManagerExternalId })
  return <>
    <DetailsSection title="Customer Context" editing={editing} onChange={onChange} fields={[
      { label: 'Customer Group Name', key: 'customerGroup', value: project.customerGroup, displayValue: nameFromDisplayValue(project.customerGroup), options: options(masterData?.customerGroups) },
      { label: 'Customer', key: 'customerCode', value: project.customerCode, displayValue: nameFromDisplayValue(project.customer), readOnly: true },
      { label: 'Customer Code', key: 'customerCode', value: project.customerCode, readOnly: true },
    ]} />
    <DetailsSection title="Organization and Costing" editing={editing} onChange={onChange} fields={[
      { label: 'Contracting Company Code', key: 'contractingCompanyCode', value: project.contractingCompanyCode, displayValue: nameFromDisplayValue(project.contractingCompanyCode), options: options(masterData?.companyCodes) },
      { label: 'BU Name', key: 'buName', value: project.buName, displayValue: nameFromDisplayValue(project.buName), readOnly: true },
      { label: 'Profit Center', key: 'profitCenter', value: project.profitCenter, displayValue: nameFromDisplayValue(project.profitCenter), options: options(sbuOptions) },
      { label: 'Cost Center', key: 'costCenter', value: project.costCenter, displayValue: nameFromDisplayValue(project.costCenter), readOnly: true },
      { label: 'Project Currency', key: 'currency', value: project.currency, options: options(masterData?.currencies) },
    ]} />
    <DetailsSection title="Project Foundation" editing={editing} onChange={onChange} fields={[
      { label: 'Project ID', key: 'id', value: project.id, readOnly: true },
      { label: 'Project Name', key: 'name', value: project.name },
      { label: 'Project Nature', key: 'projectNature', value: project.projectNature, options: options(masterData?.projectNatures) },
      { label: 'Billability', key: 'billability', value: project.billability, options: options(masterData?.billability) },
      { label: 'Project Manager', key: 'projectManagerExternalId', value: project.projectManagerExternalId, displayValue: project.manager, options: managerOptions, readOnly: true },
      { label: 'Project Category', key: 'category', value: project.category, options: options(masterData?.projectCategories) },
      { label: 'Type of Project', key: 'typeOfProject', value: project.typeOfProject, displayValue: projectTypeName, options: projectTypeOptions },
      { label: 'Project Start Date', key: 'startDate', value: project.startDate, type: 'date' },
      { label: 'Project End Date', key: 'endDate', value: project.endDate, type: 'date' },
      { label: 'Stage', key: 'stage', value: currentStage, displayValue: projectStageName(currentStage), options: projectStages },
      { label: 'Expense Booking Allowed', key: 'expenseBookingAllowed', value: project.expenseBookingAllowed, options: yesNoOptions },
      { label: 'Overtime Allowed', key: 'overtimeAllowed', value: project.overtimeAllowed, options: yesNoOptions },
      { label: 'Project Billable Daily Hours', key: 'projectBillableDailyHours', value: project.projectBillableDailyHours, options: hoursOptions },
      { label: 'Payment Terms', key: 'paymentTerms', value: project.paymentTerms, displayValue: paymentTermsName, options: paymentTermOptions },
      { label: 'SOW Status', key: 'sowStatus', value: project.sowStatus, options: sowStatusOptions },
      { label: 'End Customer', key: 'endCustomer', value: project.endCustomer },
      { label: 'Public Project', key: 'publicProject', value: project.publicProject, options: yesNoOptions },
      { label: 'Restrict Unstaffed Posting', key: 'restrictTimePosting', value: yesNoValue(project.restrictTimePosting), options: yesNoOptions },
      { label: 'Use Project Billing (New)', key: 'useProjectBilling', value: yesNoValue(project.useProjectBilling), readOnly: true },
    ]} />
  </>
}

function ProjectDetails({ data, plannedSummary, soldRevenueOverride }: { data: ProjectWorkspaceResponse; plannedSummary?: { effort: number; cost: number; revenue: number }; soldRevenueOverride?: number; editing: boolean; onChange: (key: keyof ProjectWorkspaceResponse['project'], value: string) => void }) {
  const project = data.project
  const sapEffort = Number(project.plannedEffort)
  const sapCost = Number(project.plannedCost)
  const sapRevenue = Number(project.plannedRevenue)
  const sapRevenueSold = Number(project.revenueSold)
  const plannedEffort = plannedSummary?.effort ?? (Number.isFinite(sapEffort) && sapEffort > 0 ? sapEffort : 0)
  const plannedCost = plannedSummary?.cost ?? (Number.isFinite(sapCost) && sapCost > 0 ? sapCost : 0)
  const plannedRevenue = plannedSummary?.revenue ?? (Number.isFinite(sapRevenue) && sapRevenue > 0 ? sapRevenue : 0)
  const revenueSold = soldRevenueOverride ?? (Number.isFinite(sapRevenueSold) && sapRevenueSold > 0 ? sapRevenueSold : 0)
  const sapMarginSold = Number(project.marginSold)
  const marginSold = Number.isFinite(sapMarginSold) && sapMarginSold > 0
    ? (sapMarginSold <= 1 ? sapMarginSold * 100 : sapMarginSold)
    : revenueSold > 0 ? ((revenueSold - plannedCost) / revenueSold) * 100 : 0
  const margin = plannedRevenue > 0 ? ((plannedRevenue - plannedCost) / plannedRevenue) * 100 : 0
  const currency = codeFromDisplayValue(project.currency)
  const summaryGroups = [
    [['Customer', project.customer || project.customerCode || '-'], ['Duration', `${project.startDate || '-'} - ${project.endDate || '-'}`], ['Project Manager', project.manager || project.projectManagerExternalId || '-']],
    [['Effort (Planned)', `${plannedEffort.toLocaleString()} h`], ['Cost (Planned)', compactBudgetMoney(plannedCost, currency)], ['Revenue (Planned)', compactBudgetMoney(plannedRevenue, currency)]],
    [['Revenue (Sold)', compactBudgetMoney(revenueSold, currency)], ['Margin (Sold)', `${marginSold.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`], ['Stage', projectStageName(project.status || project.stage)]],
  ]

  return <div className="sap-project-details">
    <div className="sap-project-header-panel">
      <div className="sap-project-headline-row">
        <h1 className="sap-project-title">{project.name || 'Project Details'} ({project.id || '-'})</h1>
        <div className={`sap-planned-margin ${margin < 0 ? 'negative' : ''}`}><strong title={`${margin.toFixed(2)}%`}>{margin.toFixed(2)}%</strong><span>Margin (Planned)</span></div>
      </div>
      <div className="sap-summary-groups">
        {summaryGroups.map((group, groupIndex) => <div className="sap-summary-group" key={groupIndex}>{group.map(([label, value]) => { const fullValue = label === 'Cost (Planned)' ? billingMoney(plannedCost, currency) : label === 'Revenue (Planned)' ? billingMoney(plannedRevenue, currency) : label === 'Revenue (Sold)' ? billingMoney(revenueSold, currency) : label === 'Margin (Sold)' ? `${marginSold.toFixed(2)}%` : undefined; return <div className="sap-summary-line" key={label}><span>{label}:</span> <strong title={fullValue} className={label === 'Customer' || label === 'Project Manager' ? 'sap-summary-link' : ''}>{value}</strong></div> })}</div>)}
      </div>
    </div>

  </div>
}

function ProjectDescription({ value, editing, onChange }: { value: string; editing: boolean; onChange: (value: string) => void }) {
  return <section className="card project-description-card"><div className="card-header"><h2>Description</h2></div><textarea readOnly={!editing} className={editing ? 'project-editable-input' : ''} value={value} placeholder="Project description" onChange={event => onChange(event.target.value)} /></section>
}

const STANDARD_PROJECT_RESPONSIBILITY_ROLES = [
  { roleId: '0SAP_RL_007', roleName: 'BU Head' },
  { roleId: '0SAP_RL_006', roleName: 'SBU Head' },
  { roleId: '0SAP_RL_005', roleName: 'Delivery Manager' },
  { roleId: 'YP_RL_0001', roleName: 'Project Manager' },
  { roleId: 'ZSAP_RL_003', roleName: 'Project Accountant' },
  { roleId: 'ZSAP_RL_002', roleName: 'Sales Head' },
  { roleId: 'ZSAP_RL_001', roleName: 'PMO' },
]

function ProjectResponsibilities({ items, editing = false, partners = [], onPartnerChange }: { items: ProjectWorkspaceResponse['responsibilities']; editing?: boolean; partners?: BusinessPartnerOption[]; onPartnerChange?: (roleId: string, workerId: string) => void }) {
  const existingByRole = new Map(items.map(item => [item.roleId.trim().toLowerCase(), item]))
  const visibleItems = [
    ...STANDARD_PROJECT_RESPONSIBILITY_ROLES.map(role => existingByRole.get(role.roleId.toLowerCase()) || {
      roleId: role.roleId,
      roleName: role.roleName,
      workerId: '',
      workerName: '',
      email: '',
    }),
    ...items.filter(item => !STANDARD_PROJECT_RESPONSIBILITY_ROLES.some(role => role.roleId.toLowerCase() === item.roleId.trim().toLowerCase())),
  ]
  return <section className="card project-responsibilities"><div className="card-header"><h2>Responsibilities ({visibleItems.length})</h2></div><div className="project-responsibility-fields"><div className="project-responsibility-headings"><span>Role</span><span>Business Partner</span></div>{visibleItems.length ? visibleItems.map((item, index) => {
    const partnerOptions = partners.map(partner => ({ value: partner.id, label: partner.name || partner.id }))
    if (item.workerId && !partnerOptions.some(option => option.value === item.workerId)) partnerOptions.unshift({ value: item.workerId, label: item.workerName || item.workerId })
    const unassigned = !item.workerId
    return <div className={`project-responsibility-row${unassigned ? ' unassigned' : ''}`} key={`${item.roleId}-${index}`}><input readOnly value={item.roleName || item.roleId || '-'} />{editing ? <GlassDropdown value={item.workerId} options={partnerOptions} placeholder="Select Business Partner" searchPlaceholder="Search business partners..." onChange={workerId => onPartnerChange?.(item.roleId, workerId)} /> : <input readOnly value={item.workerName || item.workerId || 'Unassigned'} />}</div>
  }) : <div className="project-responsibility-empty">No additional responsibilities were returned by SAP for this project.</div>}</div></section>
}


type BudgetColumnKey = 'name' | 'description' | 'id' | 'duration' | 'workItem' | 'staffingStatus' | 'type' | 'service' | 'quantity' | 'effort' | 'staffedEffort' | 'cost' | 'revenue' | 'information'
const budgetColumns: Array<{ key: BudgetColumnKey; label: string }> = [
  { key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'id', label: 'ID' }, { key: 'duration', label: 'Duration' }, { key: 'workItem', label: 'Work Item' },
  { key: 'staffingStatus', label: 'Staffing Status' }, { key: 'service', label: 'Service' }, { key: 'type', label: 'Type' }, { key: 'quantity', label: 'Quantity' }, { key: 'effort', label: 'Effort' },
  { key: 'cost', label: 'Cost' }, { key: 'revenue', label: 'Revenue' }, { key: 'staffedEffort', label: 'Effort (Staffed)' }, { key: 'information', label: 'Information' },
]
const defaultBudgetColumns = budgetColumns.filter(column => column.key !== 'type' && column.key !== 'staffedEffort').map(column => column.key)
const budgetColumnWidths: Record<BudgetColumnKey, number> = { name: 10, description: 10, id: 10, duration: 12, workItem: 7, staffingStatus: 10, type: 7, service: 7, quantity: 6, effort: 6, staffedEffort: 6, cost: 12, revenue: 12, information: 3 }
type DemandBulkRow = { sourceRow: number; demandType: string; workPackageId: string; workPackageName: string; workPackageType: string; type: 'team' | 'additional' | 'expense'; resourceId: string; deliveryServiceOrg: string; workItem: string; plannedEffort: string; billingControlCategory: string; quantity: string; expenseCost: string; expenseRevenue: string; status?: string; reason?: string; error?: string }

function WorkPackages({ onOpen, onMessage, existing, projectId, projectCurrency, projectCompanyCode, projectCostCenter, projectContext, serviceUnits, budgetSummaries, onBudgetSummariesChange, onWorkPackagesChange, editingMode }: { onOpen: (workPackage: SelectedWorkPackage) => void; onMessage: (state: DialogState) => void; existing: ProjectWorkspaceResponse['workPackages']; projectId: string; projectCurrency: string; projectCompanyCode: string; projectCostCenter: string; projectContext: Pick<ProjectWorkspaceResponse['project'], 'status' | 'stage' | 'startDate' | 'endDate' | 'blockedFunctions' | 'customerCode'>; serviceUnits: Option[]; budgetSummaries: Record<string, WorkPackageBudgetSummary>; onBudgetSummariesChange: Dispatch<SetStateAction<Record<string, WorkPackageBudgetSummary>>>; onWorkPackagesChange: (items: ProjectWorkspaceResponse['workPackages']) => void; editingMode: boolean }) {
  const [openedWorkItems, setOpenedWorkItems] = useState<WorkPackageDemandDetailsResponse['workItems'] | null>(null)
  const [openedWorkPackageId, setOpenedWorkPackageId] = useState<string | null>(null)
  const [workItemTarget, setWorkItemTarget] = useState<{ id: string; name: string } | null>(null)
  const [workItemDrafts, setWorkItemDrafts] = useState<Record<string, WorkPackageDemandDetailsResponse['workItems']>>({})
  const [workItemSelection, setWorkItemSelection] = useState<string[]>([])
  const [savingWorkItemAssignment, setSavingWorkItemAssignment] = useState(false)
  const [workItemSearch, setWorkItemSearch] = useState('')
  const [workItemPopupPosition, setWorkItemPopupPosition] = useState({ top: 12, left: 12 })
  const [createOpen, setCreateOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [deletingWorkPackage, setDeletingWorkPackage] = useState(false)
  const [selectedCopyId, setSelectedCopyId] = useState('')
  const [copyForm, setCopyForm] = useState({ name: '', description: '', startDate: '', endDate: '' })
  const [copyOptions, setCopyOptions] = useState<WorkPackageCopyOptions>(defaultWorkPackageCopyOptions)
  const [form, setForm] = useState<WorkPackageFormState>(blankWorkPackage)
  const [submitting, setSubmitting] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRows, setBulkRows] = useState<Array<{ source: Array<string | number | Date>; sourceRow: number; name: string; description: string; type: 'resource' | 'service'; startDate: string; endDate: string; workItem: string; service: string; unitId: string; unitQuantity: string; status?: string; reason?: string; error?: string }>>([])
  const bulkWorkbookBuffer = useRef<ArrayBuffer | null>(null)
  const [bulkWorking, setBulkWorking] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(0)
  const [demandBulkOpen, setDemandBulkOpen] = useState(false)
  const [demandBulkRows, setDemandBulkRows] = useState<DemandBulkRow[]>([])
  const [demandBulkWorking, setDemandBulkWorking] = useState(false)
  const [demandBulkProgress, setDemandBulkProgress] = useState(0)
  const demandWorkbookBuffer = useRef<ArrayBuffer | null>(null)
  const [editing, setEditing] = useState(false)
  const [savingEdits, setSavingEdits] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string; startDate: string; endDate: string; unitQuantity: string }>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [visibleColumns, setVisibleColumns] = useState<BudgetColumnKey[]>(() => [...defaultBudgetColumns])
  const [columnOrder, setColumnOrder] = useState<BudgetColumnKey[]>(() => budgetColumns.map(column => column.key))
  const [draggedColumn, setDraggedColumn] = useState<BudgetColumnKey | null>(null)
  const settingsSnapshot = useRef<{ visible: BudgetColumnKey[]; order: BudgetColumnKey[] } | null>(null)
  const [created, setCreated] = useState<Array<{ id: string; name: string; description: string; type: string; startDate: string; endDate: string; unitId: string; unitQuantity: string }>>([])
  const update = <K extends keyof WorkPackageFormState>(key: K, value: WorkPackageFormState[K]) => setForm(current => ({ ...current, [key]: value }))
  const projectStartDate = dateInputValue(projectContext.startDate)
  const projectEndDate = dateInputValue(projectContext.endDate)
  const openCreate = () => { setForm({ ...blankWorkPackage(), projectId, startDate: projectStartDate, endDate: projectEndDate }); setCreateOpen(true) }
  const downloadBulkResult = (rows = bulkRows) => {
    const sourceBuffer = bulkWorkbookBuffer.current
    if (!sourceBuffer) {
      onMessage({ type: 'error', title: 'Result download failed', message: 'The original uploaded workbook is no longer available. Upload the workbook again to download results.' })
      return
    }
    try {
      const out = createWorkPackageResultWorkbook(sourceBuffer, rows)
      const url = URL.createObjectURL(new Blob([Uint8Array.from(out).buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Workpackage_Upload_Results.xlsx'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      onMessage({ type: 'error', title: 'Result download failed', message: error instanceof Error ? error.message : 'Unable to create the result workbook.' })
    }
  }
  const downloadDemandBulkResult = (rows = demandBulkRows) => {
    const source = demandWorkbookBuffer.current
    if (!source) {
      onMessage({ type: 'error', title: 'Result download failed', message: 'Upload the demand workbook again to download its results.' })
      return
    }
    try {
      const output = createResultWorkbook(source, rows, { worksheetName: 'Upload Data', statusColumn: 11, reasonColumn: 12, styleColumn: 10 })
      const url = URL.createObjectURL(new Blob([Uint8Array.from(output).buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Customer_Project_Demand_Upload_Results.xlsx'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      onMessage({ type: 'error', title: 'Result download failed', message: error instanceof Error ? error.message : 'Unable to create the demand result workbook.' })
    }
  }
  const openDemandBulkUpload = () => { setDemandBulkRows([]); setDemandBulkProgress(0); setDemandBulkOpen(true) }
  const parseDemandBulkFile = async (file?: File) => {
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      demandWorkbookBuffer.current = buffer
      const book = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true })
      const sheet = book.Sheets['Upload Data']
      if (!sheet) throw new Error('Use the provided template and keep the sheet named “Upload Data”.')
      const values = XLSX.utils.sheet_to_json<Array<string | number | Date>>(sheet, { header: 1, defval: '' })
      const headers = (values[0] || []).map(value => String(value).trim().toLowerCase().replace(/\s*\*\s*$/, ''))
      const column = (label: string) => headers.indexOf(label.toLowerCase())
      const value = (source: Array<string | number | Date>, label: string) => { const index = column(label); return index < 0 ? '' : String(source[index] ?? '').trim() }
      const hasResults = column('status') >= 0
      const rows = values.slice(1).map((source, index) => ({ source, sourceRow: index + 2 })).filter(({ source }) => source.some((cell, index) => index > 0 && index < 10 && String(cell).trim())).map(({ source, sourceRow }) => {
        const demandType = value(source, 'Demand Type').toLowerCase()
        const type: DemandBulkRow['type'] = demandType === 'role' ? 'team' : demandType === 'additional resource' ? 'additional' : 'expense'
        const workPackageId = value(source, 'Work Package ID')
        const workPackage = all.find(item => item.id.trim().toUpperCase() === workPackageId.trim().toUpperCase())
        const row: DemandBulkRow = {
          sourceRow, demandType: value(source, 'Demand Type'), workPackageId, workPackageName: workPackage?.name || '', workPackageType: workPackage?.type || '', type,
          resourceId: value(source, 'Resource/Service/Expense Type'),
          deliveryServiceOrg: value(source, 'Delivery Organization'), workItem: value(source, 'Work Item'),
          plannedEffort: value(source, 'Effort (Planned)'), billingControlCategory: value(source, 'Billing Control Category'),
          quantity: value(source, 'Quantity'), expenseCost: value(source, 'Cost'), expenseRevenue: value(source, 'Revenue'),
          status: hasResults ? value(source, 'Status') : '', reason: hasResults ? value(source, 'Reason') : '',
        }
        const quantity = Number(row.quantity)
        if (!workPackageId) row.error = 'Work Package ID is required.'
        else if (!workPackage) row.error = `Work Package ID ${workPackageId} does not belong to this project.`
        else if (!['role', 'additional resource', 'expense'].includes(demandType)) row.error = 'Select Role, Additional Resource, or Expense.'
        else if (!row.resourceId) row.error = 'Resource/Service/Expense Type is required.'
        else if (!Number.isFinite(quantity) || quantity <= 0) row.error = 'Quantity must be greater than zero.'
        else if (!row.billingControlCategory) row.error = 'Billing Control Category is required.'
        else if (type === 'team' && (!Number.isFinite(Number(row.plannedEffort)) || Number(row.plannedEffort) <= 0)) row.error = 'Effort (Planned) must be greater than zero for a Role.'
        else if ((type === 'team' || type === 'additional') && !row.deliveryServiceOrg) row.error = 'Delivery Organization is required for this demand type.'
        else if (type === 'expense' && ((row.expenseCost && (!Number.isFinite(Number(row.expenseCost)) || Number(row.expenseCost) < 0)) || (row.expenseRevenue && (!Number.isFinite(Number(row.expenseRevenue)) || Number(row.expenseRevenue) < 0)))) row.error = 'Optional expense Cost and Revenue values must be zero or greater.'
        return row
      })
      if (!rows.length) throw new Error('The Upload Data sheet has no demand rows. Fill in a resource/type and demand data for each row.')
      const selectedRows = hasResults ? rows.filter(row => row.status?.toLowerCase() === 'failed') : rows
      if (!selectedRows.length) throw new Error('This result workbook has no Failed rows to retry.')
      setDemandBulkRows(selectedRows); setDemandBulkProgress(0)
    } catch (error) {
      onMessage({ type: 'error', title: 'Unable to read demand workbook', message: error instanceof Error ? error.message : 'Check the demand upload workbook and try again.' })
    }
  }
  const submitDemandBulk = async () => {
    if (!demandBulkRows.length || demandBulkWorking || demandBulkRows.some(row => row.error)) return
    const rows = demandBulkRows.map(row => ({ ...row, status: '', reason: '' }))
    const batchSize = 50
    setDemandBulkWorking(true); setDemandBulkProgress(0)
    try {
      let processed = 0
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize)
        try {
          const response = await projectService.createDemandsBatch({
            projectId,
            demands: batch.map(row => ({
              workPackageId: row.workPackageId, workPackageName: row.workPackageName, workPackageType: row.workPackageType,
              type: row.type, resourceId: row.resourceId, deliveryServiceOrg: row.deliveryServiceOrg,
              workitem: row.workItem, effort: row.type === 'team' ? row.plannedEffort : row.type === 'additional' ? row.quantity : '',
              billingControlCategory: row.billingControlCategory, expenseCost: row.expenseCost || '0', expenseRevenue: row.expenseRevenue || '0',
            })),
          })
          batch.forEach((row, index) => {
            const outcome = response.results[index]
            row.status = outcome?.status === 'success' ? 'Success' : outcome?.status === 'failed' ? 'Failed' : outcome?.status === 'notAttempted' ? 'Not attempted' : 'Unknown'
            row.reason = outcome?.reason || ''
          })
        } catch (error) {
          const reason = error instanceof ApiError ? error.message : 'SAP did not return a confirmed result for this batch. Verify in SAP before retrying.'
          const unknown = !(error instanceof ApiError) || error.status >= 500
          batch.forEach(row => { row.status = unknown ? 'Unknown' : 'Failed'; row.reason = reason })
          rows.slice(offset + batch.length).forEach(row => { row.status = 'Not attempted'; row.reason = 'This row was not sent because the previous SAP batch could not be verified.' })
          processed = rows.length
          setDemandBulkRows([...rows]); setDemandBulkProgress(100); downloadDemandBulkResult(rows)
          return
        }
        processed += batch.length
        if (batch.some(row => row.status === 'Unknown' || row.status === 'Not attempted')) {
          rows.slice(offset + batch.length).forEach(row => { row.status = 'Not attempted'; row.reason = 'This row was not sent because the previous SAP batch could not be verified.' })
          setDemandBulkRows([...rows]); setDemandBulkProgress(Math.round(processed / rows.length * 100)); downloadDemandBulkResult(rows)
          return
        }
        setDemandBulkRows([...rows]); setDemandBulkProgress(Math.round(processed / rows.length * 100))
      }
      setDemandBulkRows([...rows]); setDemandBulkProgress(100); downloadDemandBulkResult(rows)
    } finally { setDemandBulkWorking(false) }
  }
  const parseBulkFile = async (file?: File) => {
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      bulkWorkbookBuffer.current = buffer
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true, cellNF: true })
      const sheet = workbook.Sheets['Upload Data']
      if (!sheet) throw new Error('Use the provided template and keep the sheet named “Upload Data”.')
      const values = XLSX.utils.sheet_to_json<Array<string | number | Date>>(sheet, { header: 1, defval: '' })
      const headers = (values[0] || []).map(value => String(value).trim().toLowerCase())
      const col = (name: string) => headers.indexOf(name.toLowerCase())
      const pick = (row: Array<string | number | Date>, name: string) => { const index = col(name); return index < 0 ? '' : row[index] || '' }
      const resume = col('status') >= 0
      const typeColumn = headers.indexOf('work package type')
      const rows = values.slice(1).map((source, rowIndex) => ({ source, sourceRow: rowIndex + 2 })).filter(({ source }) => source.some((value, index) => index !== typeColumn && String(value).trim())).map(({ source, sourceRow }) => {
        const rawType = String(pick(source, 'Work Package Type')).trim().toLowerCase()
        const type: 'resource' | 'service' = rawType.includes('service') ? 'service' : 'resource'
        const service = String(pick(source, 'Service')).trim()
        const unit = serviceUnits.find(option => option.code.toLowerCase() === service.toLowerCase() || option.name.toLowerCase() === service.toLowerCase())
        const name = String(pick(source, 'Name')).trim()
        const description = String(pick(source, 'Description')).trim()
        const startDate = excelDateValue(pick(source, 'Duration Start Date'))
        const endDate = excelDateValue(pick(source, 'Duration End Date'))
        const workItem = String(pick(source, 'Work Item')).trim()
        const quantity = String(pick(source, 'Quantity')).trim()
        const status = resume ? String(pick(source, 'Status')).trim() : ''
        const reason = resume ? String(pick(source, 'Reason')).trim() : ''
        let error = ''
        if (!name) error = 'Name is required.'
        else if (!rawType.includes('resource') && !rawType.includes('service')) error = 'Select a valid Work Package Type.'
        else if (!startDate || !endDate) error = 'Start and end dates are required and must be valid.'
        else if (startDate < projectStartDate || endDate > projectEndDate || endDate < startDate) error = 'Dates must be within the project duration and end on or after start.'
        else if (type === 'service' && !unit) error = 'Service must match a valid service unit code or name.'
        else if (type === 'service' && (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) error = 'Quantity must be greater than zero.'
        return { source, sourceRow, name, description, type, startDate, endDate, workItem, service, unitId: unit?.code || '', unitQuantity: quantity, status, reason, error }
      })
      if (!rows.length) throw new Error('The Upload Data sheet has no work package rows.')
      setBulkRows(resume ? rows.filter(row => row.status.toLowerCase() === 'failed') : rows)
      setBulkProgress(0)
    } catch (error) { onMessage({ type: 'error', title: 'Unable to read workbook', message: error instanceof Error ? error.message : 'Check the Excel file and try again.' }) }
  }
  const submitBulk = async () => {
    if (!bulkRows.length || bulkWorking || bulkRows.some(row => row.status)) return
    const invalid = bulkRows.find(row => row.error)
    if (invalid) { onMessage({ type: 'error', title: 'Check the uploaded rows', message: `“${invalid.name || 'Unnamed row'}”: ${invalid.error}` }); return }
    const rows = bulkRows.map(row => ({ ...row }))
    const batchSize = 100
    setBulkWorking(true); setBulkProgress(0)
    try {
      let processed = 0
      const createdPackages: Array<{ id: string; name: string; description: string; type: string; startDate: string; endDate: string; unitId: string; unitQuantity: string }> = []
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const end = Math.min(offset + batchSize, rows.length)
        const batch = rows.slice(offset, end)
        try {
          const result = await projectService.createWorkPackagesBatch({ projectId, workPackages: batch.map(({ name, description, type, startDate, endDate, unitId, unitQuantity }) => ({ workPackageName: name, description, type, startDate, endDate, unitId, unitQuantity })) })
          batch.forEach((row, index) => {
            const outcome = result.results[index]
            row.status = outcome?.status === 'success' ? 'Success' : outcome?.status === 'failed' ? 'Failed' : outcome?.status === 'notAttempted' ? 'Not attempted' : 'Unknown'
            row.reason = outcome?.reason || (row.status === 'Unknown' ? 'SAP did not return a result for this row. Verify in SAP before retrying.' : '')
            if (row.status === 'Success') createdPackages.push({ id: outcome?.workPackageId || '', name: row.name, description: row.description, type: row.type, startDate: row.startDate, endDate: row.endDate, unitId: row.unitId, unitQuantity: row.unitQuantity })
          })
        } catch (error) {
          const message = error instanceof ApiError ? error.message : 'SAP did not return a row result. Verify this batch in SAP before retrying to avoid duplicates.'
          batch.forEach(row => { row.status = 'Unknown'; row.reason = message })
          rows.slice(end).forEach(row => { row.status = 'Not attempted'; row.reason = 'This row was not sent because the previous batch did not return a confirmed result.' })
          processed = rows.length
          setBulkRows([...rows]); setBulkProgress(100)
          setCreated(current => [...current, ...createdPackages])
          downloadBulkResult(rows)
          return
        }
        processed += batch.length
        if (batch.some(row => row.status === 'Unknown' || row.status === 'Not attempted')) {
          rows.slice(end).forEach(row => { row.status = 'Not attempted'; row.reason = 'This row was not sent because the previous batch could not be verified.' })
          setBulkRows([...rows])
          setBulkProgress(Math.round(processed / rows.length * 100))
          setCreated(current => [...current, ...createdPackages])
          downloadBulkResult(rows)
          return
        }
        setBulkRows([...rows])
        setBulkProgress(Math.round(processed / rows.length * 100))
      }
      setCreated(current => [...current, ...createdPackages])
      downloadBulkResult(rows)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'SAP did not return a row result. Verify these entries in SAP before retrying to avoid duplicates.'
      const failed = rows.map(row => row.status ? row : ({ ...row, status: 'Unknown', reason: message }))
      setBulkRows(failed); setBulkProgress(100); downloadBulkResult(failed)
    } finally { setBulkWorking(false) }
  }
  const submit = async () => {
    if (!form.type) { onMessage({ type: 'error', title: 'Work package type required', message: 'Select a work package type before creating the work package.' }); return }
    const startDate = form.startDate
    const endDate = form.endDate || ''
    if (!startDate || !endDate || (projectStartDate && startDate < projectStartDate) || (projectEndDate && startDate > projectEndDate) || (projectStartDate && endDate < projectStartDate) || (projectEndDate && endDate > projectEndDate) || endDate < startDate) {
      onMessage({ type: 'error', title: 'Invalid work package dates', message: 'Choose start and end dates within the project duration, with the end date on or after the start date.' })
      return
    }
    setSubmitting(true)
    try {
      const payload: CreateWorkPackageRequest = { ...form, type: form.type }
      const result = await projectService.createWorkPackage(payload)
      setCreated(current => [...current, { id: result.workPackageId, name: form.workPackageName, description: form.description, type: form.type, startDate: form.startDate, endDate: form.endDate || '', unitId: form.unitId || '', unitQuantity: form.unitQuantity || '' }])
      setDrafts(current => ({ ...current, [result.workPackageId]: { name: form.workPackageName, description: form.description, startDate: form.startDate, endDate: form.endDate || '', unitQuantity: form.unitQuantity || '' } }))
      setCreateOpen(false)
      onMessage({ type: 'success', title: 'Work package created', message: `Work Package ID: ${result.workPackageId}` })
    } catch (error) {
      onMessage({ type: 'error', title: 'Work package creation failed', message: error instanceof ApiError ? error.message : 'Unable to create the work package in SAP.' })
    } finally { setSubmitting(false) }
  }
  // Newly created packages are kept locally until the workspace refresh returns
  // them from SAP. Merge matching IDs so they render once while retaining the
  // values entered in the create form if the refreshed response omits them.
  const packagesById = new Map<string, (typeof existing)[number] | (typeof created)[number]>()
  existing.forEach(item => packagesById.set(item.id.trim().toUpperCase(), { ...item, type: item.type === 'U' ? 'service' : 'resource' }))
  created.forEach(item => {
    const key = item.id.trim().toUpperCase()
    packagesById.set(key, packagesById.has(key) ? { ...packagesById.get(key), ...item } : item)
  })
  const all = [...packagesById.values()]
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' }))
  const selectedCopySource = all.find(item => item.id === selectedCopyId)
  const deleteSelectedWorkPackage = async () => {
    if (!selectedCopySource || deletingWorkPackage) return
    const target = selectedCopySource
    setDeletingWorkPackage(true)
    try {
      await projectService.deleteWorkPackage(projectId, target.id, target.name)
      onWorkPackagesChange(existing.filter(item => item.id !== target.id))
      setCreated(current => current.filter(item => item.id !== target.id))
      onBudgetSummariesChange(current => {
        const next = { ...current }
        delete next[target.id]
        return next
      })
      setDrafts(current => {
        const next = { ...current }
        delete next[target.id]
        return next
      })
      setWorkItemDrafts(current => {
        const next = { ...current }
        delete next[target.id]
        return next
      })
      setSelectedCopyId('')
      onMessage({ type: 'success', title: 'Work package deleted', message: `Work package ${target.id} was deleted.` })
    } catch (error) {
      onMessage({ type: 'error', title: 'Work package deletion failed', message: error instanceof ApiError ? error.message : 'Unable to delete the work package in SAP.' })
    } finally {
      setDeletingWorkPackage(false)
    }
  }
  const confirmDeleteWorkPackage = () => {
    if (!selectedCopySource) return
    onMessage({
      type: 'warning',
      title: 'Delete work package?',
      message: `Delete "${selectedCopySource.name}" (${selectedCopySource.id}) from this project? This action cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => { void deleteSelectedWorkPackage() },
    })
  }
  const openCopy = () => {
    if (!selectedCopySource) return
    setCopyForm({ name: `${selectedCopySource.name}_Copy`, description: selectedCopySource.description || '', startDate: dateInputValue(selectedCopySource.startDate || ''), endDate: dateInputValue(selectedCopySource.endDate || '') })
    setCopyOptions(defaultWorkPackageCopyOptions)
    setCopyOpen(true)
  }
  const copySelectedWorkPackage = async () => {
    if (!selectedCopySource || !copyForm.name.trim() || !copyForm.startDate || !copyForm.endDate) return
    if ((projectStartDate && copyForm.startDate < projectStartDate) || (projectEndDate && copyForm.endDate > projectEndDate) || copyForm.endDate < copyForm.startDate) {
      onMessage({ type: 'error', title: 'Invalid work package dates', message: 'Choose a duration within the project dates, with the end date on or after the start date.' })
      return
    }
    setCopying(true)
    try {
      const sourceDetails = await projectService.getWorkPackageDemandDetails({ projectId, id: selectedCopySource.id, name: selectedCopySource.name, type: selectedCopySource.type })
      const createdPackage = await projectService.createWorkPackage({
        projectId,
        type: selectedCopySource.type === 'service' ? 'service' : 'resource',
        workPackageName: copyForm.name.trim(),
        description: copyForm.description,
        startDate: copyForm.startDate,
        endDate: copyForm.endDate,
        unitId: selectedCopySource.unitId || '',
        unitQuantity: selectedCopySource.unitQuantity || '',
      })
      const failedSections: string[] = []
      if (copyOptions.workItem) {
        for (const workItem of sourceDetails.workItems || []) {
          try { await projectService.createWorkPackageWorkItem({ projectId, workPackageId: createdPackage.workPackageId, workPackageName: copyForm.name.trim(), workItem: workItem.workItem, workItemName: workItem.workItemName }) }
          catch { failedSections.push('Work Item') }
        }
      }
      const demandTypes: Array<{ type: 'team' | 'additional' | 'expense'; enabled: boolean }> = [
        { type: 'team', enabled: copyOptions.team || copyOptions.requestedResources },
        { type: 'additional', enabled: copyOptions.additionalResources },
        { type: 'expense', enabled: copyOptions.expenses },
      ]
      for (const demand of sourceDetails.team || []) {
        const selectedType = demandTypes.find(option => option.type === demand.type)
        if (!selectedType?.enabled) continue
        const requestedWorker = copyOptions.requestedResources ? demand.requestedWorker || '' : ''
        if (!copyOptions.team && demand.type === 'team' && !requestedWorker) continue
        try {
          await projectService.createDemand({
            ...demand,
            projectId,
            workPackageId: createdPackage.workPackageId,
            workPackageName: copyForm.name.trim(),
            workPackageType: selectedCopySource.type,
            copyExisting: true,
            requestedWorker,
            resourceDemandId: undefined,
            staffedResources: [],
            staffedResource: '',
            staffedResourceName: '',
            staffedEffort: '',
          })
        } catch { failedSections.push(demand.type === 'team' ? 'Team / Requested Resources' : demand.type === 'additional' ? 'Additional Resources' : 'Expenses') }
      }
      setCreated(current => [...current, { id: createdPackage.workPackageId, name: copyForm.name.trim(), description: copyForm.description, type: selectedCopySource.type, startDate: copyForm.startDate, endDate: copyForm.endDate, unitId: selectedCopySource.unitId || '', unitQuantity: selectedCopySource.unitQuantity || '' }])
      setDrafts(current => ({ ...current, [createdPackage.workPackageId]: { name: copyForm.name.trim(), description: copyForm.description, startDate: copyForm.startDate, endDate: copyForm.endDate, unitQuantity: selectedCopySource.unitQuantity || '' } }))
      setCopyOpen(false)
      const unsupported = [copyOptions.blockedFunctions ? 'Blocked Functions' : '', copyOptions.attachments ? 'Attachments' : ''].filter(Boolean)
      const incomplete = [...new Set([...failedSections, ...unsupported])]
      onMessage(incomplete.length
        ? { type: 'warning', title: 'Work package copied with omissions', message: `Work package ${createdPackage.workPackageId} was created, but these selected sections were not copied: ${incomplete.join(', ')}.` }
        : { type: 'success', title: 'Work package copied', message: `Work package ${createdPackage.workPackageId} and selected sections were copied.` })
    } catch (error) {
      onMessage({ type: 'error', title: 'Work package copy failed', message: error instanceof ApiError ? error.message : 'Unable to copy the selected work package.' })
    } finally { setCopying(false) }
  }
  useEffect(() => {
    let cancelled = false
    Promise.all(created.map(async workPackage => [workPackage.id, await fetchWorkPackageBudgetSummary(projectId, workPackage)] as const)).then(entries => {
      if (!cancelled && entries.length) onBudgetSummariesChange(current => ({ ...current, ...Object.fromEntries(entries) }))
    })
    return () => { cancelled = true }
  }, [existing, created, projectId, onBudgetSummariesChange])
  const resourcePackages = all.filter(item => item.type === 'resource')
  const servicePackages = all.filter(item => item.type === 'service')
  const orderedColumns = columnOrder.map(key => budgetColumns.find(column => column.key === key)!).filter(Boolean)
  const shownColumns = orderedColumns.filter(column => visibleColumns.includes(column.key))
  // Reserve more space for the two date controls while editing. The default
  // display widths leave the dates too narrow once the selection radio column
  // is added, and can make the remaining columns look uneven.
  const editBudgetColumnWidths: Record<BudgetColumnKey, number> = { ...budgetColumnWidths, duration: 17, staffingStatus: 10, type: 8, cost: 9, revenue: 9 }
  const widthForColumn = (key: BudgetColumnKey) => editing ? editBudgetColumnWidths[key] : budgetColumnWidths[key]
  const totalBudgetColumnWidth = shownColumns.reduce((total, column) => total + widthForColumn(column.key), 0)
  const shownBudgetColumnWidths = shownColumns.map(column => `${(widthForColumn(column.key) / totalBudgetColumnWidth) * 100}%`)
  const tableHeaders = [...(editing ? [''] : []), ...shownColumns.map(column => column.key === 'information' ? '' : column.label)]
  const tableHeaderClasses = [...(editing ? [''] : []), ...shownColumns.map(column => column.key === 'staffingStatus' ? 'budget-staffing-heading' : ['quantity', 'effort', 'staffedEffort', 'cost', 'revenue'].includes(column.key) ? 'budget-numeric-heading' : '')]
  const tableColumnWidths = editing ? ['3%', ...shownBudgetColumnWidths.map(width => `${Number.parseFloat(width) * 0.97}%`)] : shownBudgetColumnWidths
  const beginEdit = () => {
    setDrafts(Object.fromEntries(all.map(item => [item.id, { name: item.name, description: item.description || '', startDate: dateInputValue(item.startDate || ''), endDate: dateInputValue(item.endDate || ''), unitQuantity: item.unitQuantity || '' }])))
    setWorkItemDrafts(Object.fromEntries(all.map(item => [item.id, [...(budgetSummaries[item.id]?.workItems || [])]])))
    setSelectedCopyId('')
    setEditing(true)
  }
  useEffect(() => {
    if (editingMode && !editing) beginEdit()
    else if (!editingMode && editing) cancelEdit()
  }, [editingMode])
  const updateDraft = (item: typeof all[number], key: keyof (typeof drafts)[string], value: string) => setDrafts(current => ({ ...current, [item.id]: { ...(current[item.id] || { name: item.name, description: item.description || '', startDate: dateInputValue(item.startDate || ''), endDate: dateInputValue(item.endDate || ''), unitQuantity: item.unitQuantity || '' }), [key]: value } }))
  const cancelEdit = () => { setEditing(false); setDrafts({}); setWorkItemDrafts({}); setWorkItemTarget(null); setOpenedWorkItems(null); setOpenedWorkPackageId(null); setSelectedCopyId(''); setCopyOpen(false) }
  const validateSaveEdits = () => all.some(item => !drafts[item.id]?.name.trim())
    ? { type: 'error' as const, title: 'Work package name required', message: 'Enter a name for every work package before saving.' }
    : null
  const saveEdits = async (): Promise<boolean> => {
    if (savingEdits) return false
    if (validateSaveEdits()) return false
    const changed = all.filter(item => {
      const draft = drafts[item.id]
      return draft && (draft.name.trim() !== item.name || draft.description !== (item.description || '') || draft.startDate !== dateInputValue(item.startDate || '') || draft.endDate !== dateInputValue(item.endDate || ''))
    })
    const changedWorkItems = all.filter(item => {
      const original = budgetSummaries[item.id]?.workItems || []
      const draft = workItemDrafts[item.id] || original
      return JSON.stringify(original.map(value => value.workItem).sort()) !== JSON.stringify(draft.map(value => value.workItem).sort())
    })
    if (!changed.length && !changedWorkItems.length) {
      return false
    }
    setSavingEdits(true)
    const savedIds: string[] = []
    const failures: unknown[] = []
    try {
      for (const item of changed) {
        const draft = drafts[item.id]
        const original = item
        const payload: { workPackageName: string; name?: string; description?: string; startDate?: string; endDate?: string } = { workPackageName: item.name }
        if (draft.name.trim() !== item.name) payload.name = draft.name.trim()
        if (draft.description !== (original.description || '')) payload.description = draft.description
        if (draft.startDate !== dateInputValue(original.startDate || '')) payload.startDate = draft.startDate
        if (draft.endDate !== dateInputValue(original.endDate || '')) payload.endDate = draft.endDate
        try { await projectService.updateWorkPackage(projectId, item.id, payload); savedIds.push(item.id) }
        catch (error) { failures.push(error) }
      }
      for (const item of changedWorkItems) {
        const original = budgetSummaries[item.id]?.workItems || []
        const next = workItemDrafts[item.id] || original
        const originalCodes = new Set(original.map(value => value.workItem))
        const nextCodes = new Set(next.map(value => value.workItem))
        const workPackageName = drafts[item.id]?.name.trim() || item.name
        for (const value of next.filter(value => !originalCodes.has(value.workItem))) {
          try { await projectService.createWorkPackageWorkItem({ projectId, workPackageId: item.id, workPackageName, workItem: value.workItem, workItemName: value.workItemName }) }
          catch (error) { failures.push(error) }
        }
        for (const value of original.filter(value => !nextCodes.has(value.workItem))) {
          try { await projectService.deleteWorkPackageWorkItem({ projectId, workPackageId: item.id, workPackageName: drafts[item.id]?.name.trim() || item.name, workItem: value.workItem }) }
          catch (error) { failures.push(error) }
        }
      }
      const savedDrafts = Object.fromEntries(savedIds.map(id => [id, drafts[id]]))
      if (savedIds.length) onWorkPackagesChange(existing.map(item => {
        const draft = savedDrafts[item.id]
        return draft ? { ...item, name: draft.name.trim(), description: draft.description, startDate: draft.startDate, endDate: draft.endDate } : item
      }))
      if (savedIds.length) setCreated(current => current.map(item => {
        const draft = savedDrafts[item.id]
        return draft ? { ...item, name: draft.name.trim(), description: draft.description, startDate: draft.startDate, endDate: draft.endDate } : item
      }))
      if (failures.length) {
        const firstError = failures[0]
        onMessage({ type: 'error', title: 'Work package update failed', message: firstError instanceof ApiError ? firstError.message : `${failures.length} work package or work item change${failures.length === 1 ? '' : 's'} could not be saved.` })
        throw firstError
      }
      if (changedWorkItems.length) {
        await new Promise(resolve => window.setTimeout(resolve, 1200))
        const refreshed = await Promise.all(changedWorkItems.map(async item => [item.id, await fetchWorkPackageBudgetSummary(projectId, { ...item, name: drafts[item.id]?.name.trim() || item.name })] as const))
        onBudgetSummariesChange(current => ({ ...current, ...Object.fromEntries(refreshed) }))
      }
      return true
    } catch (error) {
      onMessage({ type: 'error', title: 'Work package update failed', message: error instanceof ApiError ? error.message : 'Unable to update the work package in SAP.' })
      throw error
    } finally { setSavingEdits(false) }
  }
  useEffect(() => {
    const onSave = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceSaveRequest>).detail
      if (editing) detail?.register(async () => await saveEdits(), validateSaveEdits)
    }
    window.addEventListener('workspace-save-request', onSave)
    return () => window.removeEventListener('workspace-save-request', onSave)
  }, [editing, saveEdits])
  useEffect(() => {
    const onDirtyCheck = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceDirtyRequest>).detail
      detail?.register(() => all.some(item => {
        const draft = drafts[item.id]
        return Boolean(draft && (draft.name.trim() !== item.name || draft.description !== (item.description || '') || draft.startDate !== dateInputValue(item.startDate || '') || draft.endDate !== dateInputValue(item.endDate || '')))
      }) || all.some(item => JSON.stringify((budgetSummaries[item.id]?.workItems || []).map(value => value.workItem).sort()) !== JSON.stringify((workItemDrafts[item.id] || budgetSummaries[item.id]?.workItems || []).map(value => value.workItem).sort())))
    }
    window.addEventListener('workspace-dirty-request', onDirtyCheck)
    return () => window.removeEventListener('workspace-dirty-request', onDirtyCheck)
  }, [all, budgetSummaries, drafts, workItemDrafts])
  const searchedColumns = orderedColumns.filter(column => column.label.toLowerCase().includes(columnSearch.trim().toLowerCase()))
  const toggleColumn = (key: BudgetColumnKey) => setVisibleColumns(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])
  const moveColumn = (from: BudgetColumnKey, to: BudgetColumnKey) => setColumnOrder(current => { const next = [...current]; const fromIndex = next.indexOf(from); const toIndex = next.indexOf(to); if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current; next.splice(fromIndex, 1); next.splice(toIndex, 0, from); return next })
  const openSettings = () => { settingsSnapshot.current = { visible: [...visibleColumns], order: [...columnOrder] }; setColumnSearch(''); setSettingsOpen(true) }
  const cancelSettings = () => { if (settingsSnapshot.current) { setVisibleColumns(settingsSnapshot.current.visible); setColumnOrder(settingsSnapshot.current.order) }; setSettingsOpen(false) }
  const resetSettings = () => { setVisibleColumns([...defaultBudgetColumns]); setColumnOrder(budgetColumns.map(column => column.key)); setColumnSearch('') }
  const showAssignedWorkItems = (item: typeof all[number], workItems: WorkPackageDemandDetailsResponse['workItems'], element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    setWorkItemPopupPosition({ top: Math.max(12, Math.min(rect.top - 105, window.innerHeight - 280)), left: Math.max(12, Math.min(rect.left + 45, window.innerWidth - 330)) })
    setOpenedWorkPackageId(item.id)
    setOpenedWorkItems(workItems)
  }
  const openWorkItemEditor = (item: typeof all[number]) => {
    const selected = workItemDrafts[item.id] || budgetSummaries[item.id]?.workItems || []
    setWorkItemSelection(selected.map(value => value.workItem))
    setWorkItemSearch('')
    setWorkItemTarget({ id: item.id, name: drafts[item.id]?.name.trim() || item.name })
    setOpenedWorkItems(null)
  }
  const applyWorkItemSelection = async () => {
    if (!workItemTarget || savingWorkItemAssignment) return
    const item = all.find(value => value.id === workItemTarget.id)
    const summary = budgetSummaries[workItemTarget.id]
    const available = summary?.availableWorkItems || summary?.workItems || []
    const currentlySelected = workItemDrafts[workItemTarget.id] || summary?.workItems || []
    const selected = workItemSelection.map(code => available.find(value => value.workItem === code) || currentlySelected.find(value => value.workItem === code)).filter((value): value is WorkPackageDemandDetailsResponse['workItems'][number] => Boolean(value))
    const assignedItems = selected.map(value => ({ ...value, projectId, workPackageId: workItemTarget.id, workPackageName: drafts[workItemTarget.id]?.name.trim() || item?.name || workItemTarget.name }))
    const originalCodes = new Set((summary?.workItems || []).map(value => value.workItem))
    const nextCodes = new Set(assignedItems.map(value => value.workItem))
    setSavingWorkItemAssignment(true)
    try {
      for (const value of assignedItems.filter(value => !originalCodes.has(value.workItem))) {
        await projectService.createWorkPackageWorkItem({ projectId, workPackageId: workItemTarget.id, workPackageName: value.workPackageName, workItem: value.workItem, workItemName: value.workItemName })
      }
      for (const value of (summary?.workItems || []).filter(value => !nextCodes.has(value.workItem))) {
        await projectService.deleteWorkPackageWorkItem({ projectId, workPackageId: workItemTarget.id, workPackageName: drafts[workItemTarget.id]?.name.trim() || item?.name || workItemTarget.name, workItem: value.workItem })
      }
      // Publish the committed assignment as soon as the SAP mutations finish.
      // The open demand screen listens for this event to refresh its Role
      // section's Work Item choices without requiring a page reload. Keep this
      // ahead of the budget-summary refresh, which can lag behind SAP writes.
      setWorkItemDrafts(current => ({ ...current, [workItemTarget.id]: assignedItems }))
      window.dispatchEvent(new CustomEvent('work-package-work-items-draft-changed', { detail: { workPackageId: workItemTarget.id, workItems: assignedItems } }))
      const refreshed = await fetchWorkPackageBudgetSummary(projectId, { id: workItemTarget.id, name: assignedItems[0]?.workPackageName || item?.name || workItemTarget.name, type: item?.type })
      const committed = { ...refreshed, workItems: assignedItems }
      onBudgetSummariesChange(current => ({ ...current, [workItemTarget.id]: committed }))
      setWorkItemTarget(null)
    } catch (error) {
      onMessage({ type: 'error', title: 'Work item assignment failed', message: error instanceof ApiError ? error.message : 'Unable to save the assigned work items to SAP.' })
    } finally {
      setSavingWorkItemAssignment(false)
    }
  }
  const renderCell = (column: BudgetColumnKey, item: typeof all[number]) => {
    const summary = budgetSummaries[item.id]
    if (column === 'name') return editing ? <input className="work-package-inline-input" aria-label={`Name for ${item.name}`} required value={drafts[item.id]?.name ?? item.name} onClick={event => event.stopPropagation()} onChange={event => updateDraft(item, 'name', event.target.value)} /> : <span className="work-package-link">{item.name}</span>
    if (column === 'description') return editing ? <input className="work-package-inline-input" aria-label={`Description for ${item.name}`} value={drafts[item.id]?.description ?? item.description ?? ''} onClick={event => event.stopPropagation()} onChange={event => updateDraft(item, 'description', event.target.value)} /> : item.description || '-'
    if (column === 'id') return <span className="work-package-id">{item.id}</span>
    if (column === 'duration') return editing ? <div className="work-package-duration-edit" onClick={event => event.stopPropagation()}><input aria-label={`Start date for ${item.name}`} type="date" value={drafts[item.id]?.startDate ?? dateInputValue(item.startDate || '')} onChange={event => updateDraft(item, 'startDate', event.target.value)} /><input aria-label={`End date for ${item.name}`} type="date" value={drafts[item.id]?.endDate ?? dateInputValue(item.endDate || '')} onChange={event => updateDraft(item, 'endDate', event.target.value)} /></div> : <span className="work-package-duration-range">{item.startDate || '-'} - {item.endDate || '-'}</span>
    if (column === 'workItem') {
      const workItems = editing ? workItemDrafts[item.id] || summary?.workItems || [] : summary?.workItems || []
      if (!workItems.length) return editing ? <button type="button" className="budget-work-item-link" onClick={event => { event.stopPropagation(); openWorkItemEditor(item) }}>Select</button> : 'Unassigned'
      return <button type="button" className="budget-work-item-link" onClick={event => { event.stopPropagation(); showAssignedWorkItems(item, workItems, event.currentTarget) }}>Assigned</button>
    }
    if (column === 'staffingStatus') {
      const status = summary?.status || 'unstaffed'
      const label = status === 'staffed' ? 'Staffed' : status === 'partial' ? 'Partially Staffed' : 'Not Staffed'
      return <span className={`budget-staffing-status ${status}`} title={label} aria-label={label}>{status === 'staffed' ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 3 3 6-6" /></svg> : status === 'partial' ? '!' : '?'}</span>
    }
    if (column === 'type') return item.type === 'resource' ? <>Resource Based<br />(Time)</> : <>Service Based<br />(Unit)</>
    if (column === 'service') return item.type === 'service' ? summary?.serviceDetails?.service || '-' : '-'
    if (column === 'quantity') return item.type === 'service' && summary?.serviceDetails?.quantity != null ? `${summary.serviceDetails.quantity}${summary.serviceDetails.unit ? ` ${summary.serviceDetails.unit}` : ''}` : item.type === 'service' ? item.unitQuantity || '-' : '-'
    if (column === 'effort') return <span className="budget-effort">{(summary?.effort || 0).toLocaleString()} h</span>
    if (column === 'staffedEffort') return <span className="budget-effort">{(summary?.staffedEffort || 0).toLocaleString()} h</span>
    if (column === 'cost') return <span title={billingMoney(summary?.cost || 0, projectCurrency)}>{compactBudgetMoney(summary?.cost || 0, projectCurrency)}</span>
    if (column === 'revenue') {
      const serviceRevenue = item.type === 'service' ? summary?.serviceDetails?.revenue : null
      if (item.type === 'service' && serviceRevenue == null) return '-'
      const revenue = item.type === 'service' ? numeric(serviceRevenue) : summary?.revenue || 0
      const revenueCurrency = item.type === 'service' ? summary?.serviceDetails?.currency || projectCurrency : projectCurrency
      return <span title={billingMoney(revenue, revenueCurrency)}>{compactBudgetMoney(revenue, revenueCurrency)}</span>
    }
    if (column === 'information') return <span className="work-package-open" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></span>
    return '-'
  }
  const renderRows = (items: typeof all, label: string) => <><tr className="budget-group-row"><td colSpan={shownColumns.length + (editing ? 1 : 0)}>{label}</td></tr>{items.map(item => <tr key={item.id} className={`work-package-row${selectedCopyId === item.id ? ' budget-row-selected' : ''}`} tabIndex={0} onClick={() => openDetails(item)} onKeyDown={event => onRowKeyDown(event, item)} aria-label={`Open details for work package ${item.name}, ${item.id}`}>{editing && <td className="budget-row-select"><input type="radio" name={`work-package-copy-${projectId}`} checked={selectedCopyId === item.id} onClick={event => event.stopPropagation()} onChange={() => setSelectedCopyId(item.id)} aria-label={`Select ${item.name} to copy`} /></td>}{shownColumns.map(column => <td key={column.key} className={column.key === 'duration' ? 'budget-duration' : column.key === 'information' ? 'work-package-open' : ['quantity', 'effort', 'staffedEffort', 'cost', 'revenue'].includes(column.key) ? `budget-numeric${column.key === 'cost' || column.key === 'revenue' ? ' budget-amount' : ''}` : undefined}>{renderCell(column.key, item)}</td>)}</tr>)}</>
  const renderChoice = (column: { key: BudgetColumnKey; label: string }) => <div className={`column-choice${visibleColumns.includes(column.key) ? ' selected' : ''}${draggedColumn === column.key ? ' dragging' : ''}`} key={column.key} draggable onDragStart={() => setDraggedColumn(column.key)} onDragEnd={() => setDraggedColumn(null)} onDragOver={event => event.preventDefault()} onDrop={() => { if (draggedColumn) moveColumn(draggedColumn, column.key); setDraggedColumn(null) }}><span className="column-drag-handle" aria-hidden="true">â‹®â‹®</span><label><input type="checkbox" checked={visibleColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} /><span>{column.label}</span></label></div>
	const openDetails = (item: { id: string; wbsElementExternalID?: string; name: string; description?: string; type: string; startDate?: string; endDate?: string; unitId?: string; unitQuantity?: string }) => {
    const draft = drafts[item.id]
    onOpen({ ...item, ...(draft ? { name: draft.name, description: draft.description, startDate: draft.startDate, endDate: draft.endDate } : {}), projectId, companyCode: projectCompanyCode, costCenter: projectCostCenter, customerCode: projectContext.customerCode, currency: projectCurrency, projectStage: projectContext.status || projectContext.stage, blockedFunctions: projectContext.blockedFunctions })
  }
  const onRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, item: { id: string; name: string; type: string }) => {
    if (editing || event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openDetails(item)
    }
  }
  return <>
    <div className="card budget-work-packages">
      <div className="card-header"><h2>Work packages <span className="work-package-count">({all.length})</span></h2><div className="work-package-actions">{editing && <button className="primary" type="button" onClick={openCreate}>Create</button>}{editing && <button className="secondary" type="button" onClick={() => { setBulkRows([]); setBulkProgress(0); setBulkOpen(true) }}>Workpackages Bulk Upload</button>}{editing && <button className="secondary" type="button" onClick={openDemandBulkUpload}>Demand Set Bulk Upload</button>}{editing && <button className="secondary" type="button" onClick={openCopy} disabled={!selectedCopySource || deletingWorkPackage}>Copy</button>}{editing && <button className="secondary" type="button" onClick={confirmDeleteWorkPackage} disabled={!selectedCopySource || deletingWorkPackage}>{deletingWorkPackage ? 'Deleting...' : 'Delete'}</button>}<button className="billing-column-settings app-settings-button" type="button" onClick={openSettings} aria-label="Select and reorder budget fields" title="Table settings"><SettingsIcon /></button></div></div>
      {all.length ? shownColumns.length ? <div className={`budget-table${editing ? ' editing' : ''}`}><DataTable headers={tableHeaders} headerClassNames={tableHeaderClasses} columnWidths={tableColumnWidths}>{resourcePackages.length > 0 && renderRows(resourcePackages, 'Resource Based (Time)')}{servicePackages.length > 0 && renderRows(servicePackages, 'Service Based (Unit)')}</DataTable></div> : <div className="billing-no-columns">Select at least one field from table settings.</div> : <div className="work-package-empty"><strong>No work packages found</strong><span>This SAP project has no work packages yet.</span></div>}
    </div>
    
    {settingsOpen && <div className="column-modal-backdrop" role="presentation" onMouseDown={cancelSettings}><div className="column-modal billing-column-modal" role="dialog" aria-modal="true" aria-labelledby="budget-column-modal-title" onMouseDown={event => event.stopPropagation()}><div className="column-modal-header"><h2 id="budget-column-modal-title">Columns</h2><button className="column-reset" type="button" onClick={resetSettings}>Reset</button></div><div className="column-search"><input value={columnSearch} onChange={event => setColumnSearch(event.target.value)} placeholder="Search columns" autoFocus /><span aria-hidden="true">âŒ•</span></div><label className="column-select-all"><input type="checkbox" checked={visibleColumns.length === budgetColumns.length} onChange={event => setVisibleColumns(event.target.checked ? budgetColumns.map(column => column.key) : [])} /><strong>Select All</strong><span>Columns ({visibleColumns.length}/{budgetColumns.length})</span></label><div className="column-list">{searchedColumns.map(renderChoice)}{!searchedColumns.length && <div className="column-empty">No matching columns</div>}</div><div className="column-modal-actions"><button className="primary" type="button" onClick={() => setSettingsOpen(false)}>OK</button><button className="text-button" type="button" onClick={cancelSettings}>Cancel</button></div></div></div>}
    {openedWorkItems && <div className="work-item-popover-backdrop" role="presentation" onMouseDown={() => { setOpenedWorkItems(null); setOpenedWorkPackageId(null) }}><div className="work-item-picker" style={{ top: workItemPopupPosition.top, left: workItemPopupPosition.left }} role="dialog" aria-modal="false" aria-labelledby="work-item-details-title" onMouseDown={event => event.stopPropagation()}><div className="work-item-picker-header"><strong id="work-item-details-title">Assigned</strong><button type="button" onClick={() => { setOpenedWorkItems(null); setOpenedWorkPackageId(null) }}>Close</button></div><div className="work-item-picker-subheading"><strong>Work Item List</strong></div><div className="work-item-picker-list">{openedWorkItems.map((workItem, index) => <div className="work-item-picker-option" key={`${workItem.workPackageId}-${workItem.workItem}-${index}`}><span>{workItem.workItemName || workItem.workItem || 'Work Item'}</span><small>{workItem.workItem || '-'}</small></div>)}</div>{editing && openedWorkPackageId && <div className="work-item-picker-actions"><button type="button" className="primary" onClick={() => { const item = all.find(value => value.id === openedWorkPackageId); if (item) openWorkItemEditor(item) }}>Edit</button></div>}</div></div>}
    {bulkOpen && <div className="work-package-modal-backdrop" role="presentation" onMouseDown={() => !bulkWorking && setBulkOpen(false)}><div className={`work-package-modal bulk-work-package-modal${bulkRows.length ? ' has-preview' : ''}`} role="dialog" aria-modal="true" aria-labelledby="bulk-work-package-title" onMouseDown={event => event.stopPropagation()}><div className="work-package-modal-header"><div><p className="work-package-step">Budget</p><h2 id="bulk-work-package-title">Bulk upload work packages</h2></div><button type="button" className="text-button" onClick={() => setBulkOpen(false)} disabled={bulkWorking}>Close</button></div><div className="bulk-upload-toolbar"><label className="bulk-file-drop"><span aria-hidden="true">⇧</span><strong>Upload Excel file</strong><small>Choose the completed template (.xlsx)</small><input type="file" accept=".xlsx,.xls" disabled={bulkWorking} onChange={event => { void parseBulkFile(event.target.files?.[0]); event.target.value = '' }} /></label><a className="secondary bulk-sample-download" href="/templates/Workpackage_Upload_Template_Rev8.xlsx" download="Workpackage_Upload_Template_Rev8.xlsx">↓ Download sample Excel template</a></div>{bulkRows.length > 0 && <><div className="bulk-preview-heading"><strong>{bulkRows.some(row => row.status) ? 'Results' : 'Preview'} ({bulkRows.length} rows)</strong><span>{bulkRows.some(row => row.status) ? `${bulkRows.filter(row => row.status === 'Success').length} succeeded · ${bulkRows.filter(row => row.status === 'Failed').length} failed · ${bulkRows.filter(row => row.status === 'Unknown').length} need verification` : 'Only the “Upload Data” sheet is processed. Failed rows in a result workbook can be uploaded again.'}</span></div><div className="bulk-preview-table"><table><thead><tr><th>Type</th><th>Name</th><th>Description</th><th>Start</th><th>End</th><th>Work Item</th><th>Service</th><th>Quantity</th>{bulkRows.some(row => row.status) ? <><th>Status</th><th>Reason</th></> : <th>Validation</th>}</tr></thead><tbody>{bulkRows.map((row, index) => <tr key={`${row.name}-${index}`}><td>{row.type === 'service' ? 'Service Based (Unit)' : 'Resource Based (Time)'}</td><td>{row.name || '—'}</td><td>{row.description || '—'}</td><td>{row.startDate || '—'}</td><td>{row.endDate || '—'}</td><td>{row.workItem || '—'}</td><td>{row.service || '—'}</td><td>{row.unitQuantity || '—'}</td>{bulkRows.some(value => value.status) ? <><td className={`bulk-result-status ${(row.status || '').toLowerCase()}`}>{row.status || '—'}</td><td className="bulk-result-reason">{row.reason || '—'}</td></> : <td className={row.error ? 'invalid' : 'valid'}>{row.error || 'Ready'}</td>}</tr>)}</tbody></table></div>{bulkWorking && <div className="bulk-progress" role="status"><div className="bulk-progress-label"><strong>Posting work packages</strong><span>{bulkProgress}%</span></div><div className="bulk-progress-track"><span style={{ width: `${bulkProgress}%` }} /></div></div>}</>}<div className="form-actions"><button type="button" className="secondary" onClick={() => setBulkOpen(false)} disabled={bulkWorking}>Cancel</button>{bulkRows.length > 0 && <><button type="button" className="secondary" onClick={() => downloadBulkResult()} disabled={bulkWorking}>Download results</button><button type="button" className="primary" onClick={() => void submitBulk()} disabled={bulkWorking || bulkRows.some(row => row.error)}>{bulkWorking ? 'Posting...' : 'Create work packages'}</button></>}</div></div></div>}
    {demandBulkOpen && <div className="work-package-modal-backdrop" role="presentation" onMouseDown={() => !demandBulkWorking && setDemandBulkOpen(false)}><div className={`work-package-modal bulk-work-package-modal${demandBulkRows.length ? ' has-preview' : ''}`} role="dialog" aria-modal="true" aria-labelledby="demand-bulk-title" onMouseDown={event => event.stopPropagation()}><div className="work-package-modal-header"><div><p className="work-package-step">Work package details</p><h2 id="demand-bulk-title">Demand Set Bulk Upload</h2></div><button type="button" className="text-button" onClick={() => setDemandBulkOpen(false)} disabled={demandBulkWorking}>Close</button></div><div className="bulk-upload-toolbar"><label className="bulk-file-drop"><span aria-hidden="true">⇧</span><strong>Upload demand Excel file</strong><small>Choose a completed demand template (.xlsx)</small><input type="file" accept=".xlsx,.xls" disabled={demandBulkWorking} onChange={event => { void parseDemandBulkFile(event.target.files?.[0]); event.target.value = '' }} /></label><a className="secondary bulk-sample-download" href="/templates/Customer_Project_Demand_Upload_Template_Rev7.xlsx" download="Customer_Project_Demand_Upload_Template_Rev7.xlsx">↓ Download sample Excel template</a></div><div className="bulk-preview-heading demand-bulk-target"><strong>Multiple work packages supported</strong><span>Each row is posted to the Work Package ID in column J. IDs are checked against this project.</span></div>{demandBulkRows.length > 0 && <><div className="bulk-preview-heading"><strong>{demandBulkRows.some(row => row.status) ? 'Results' : 'Preview'} ({demandBulkRows.length} rows)</strong><span>{demandBulkRows.some(row => row.status) ? `${demandBulkRows.filter(row => row.status === 'Success').length} succeeded · ${demandBulkRows.filter(row => row.status === 'Failed').length} failed · ${demandBulkRows.filter(row => row.status === 'Unknown').length} need verification` : 'Only the “Upload Data” sheet is posted. Failed rows from a result workbook can be uploaded again.'}</span></div><div className="bulk-preview-table"><table><thead><tr><th>Work Package ID</th><th>Work Package Name</th><th>Demand Type</th><th>Resource / Expense Type</th><th>Delivery Organization</th><th>Work Item</th><th>Planned Effort</th><th>Billing Category</th><th>Quantity</th><th>Cost</th><th>Revenue</th>{demandBulkRows.some(row => row.status) ? <><th>Status</th><th>Reason</th></> : <th>Validation</th>}</tr></thead><tbody>{demandBulkRows.map((row, index) => <tr key={`${row.sourceRow}-${index}`}><td>{row.workPackageId || '—'}</td><td>{row.workPackageName || '—'}</td><td>{row.demandType || '—'}</td><td>{row.resourceId || '—'}</td><td>{row.deliveryServiceOrg || '—'}</td><td>{row.workItem || '—'}</td><td>{row.plannedEffort || '—'}</td><td>{row.billingControlCategory || '—'}</td><td>{row.quantity || '—'}</td><td>{row.expenseCost || '—'}</td><td>{row.expenseRevenue || '—'}</td>{demandBulkRows.some(value => value.status) ? <><td className={`bulk-result-status ${(row.status || '').toLowerCase()}`}>{row.status || '—'}</td><td className="bulk-result-reason">{row.reason || '—'}</td></> : <td className={row.error ? 'invalid' : 'valid'}>{row.error || 'Ready'}</td>}</tr>)}</tbody></table></div>{demandBulkWorking && <div className="bulk-progress" role="status"><div className="bulk-progress-label"><strong>Posting demand records</strong><span>{demandBulkProgress}%</span></div><div className="bulk-progress-track"><span style={{ width: `${demandBulkProgress}%` }} /></div></div>}</>}<div className="form-actions"><button type="button" className="secondary" onClick={() => setDemandBulkOpen(false)} disabled={demandBulkWorking}>Cancel</button>{demandBulkRows.length > 0 && <><button type="button" className="secondary" onClick={() => downloadDemandBulkResult()} disabled={demandBulkWorking}>Download results</button><button type="button" className="primary" onClick={() => void submitDemandBulk()} disabled={demandBulkWorking || demandBulkRows.some(row => row.error)}>{demandBulkWorking ? 'Posting...' : demandBulkRows.some(row => row.status) ? 'Retry failed demands' : 'Create demands'}</button></>}</div></div></div>}
    {workItemTarget && <WorkItemAssignmentModal title={`Work Items: ${workItemTarget.name}`} options={budgetSummaries[workItemTarget.id]?.availableWorkItems || budgetSummaries[workItemTarget.id]?.workItems || []} selected={workItemSelection} search={workItemSearch} onSearch={setWorkItemSearch} onToggle={code => setWorkItemSelection(current => current.includes(code) ? current.filter(value => value !== code) : [...current, code])} onToggleAll={codes => setWorkItemSelection(codes)} onCancel={() => { if (!savingWorkItemAssignment) setWorkItemTarget(null) }} onApply={applyWorkItemSelection} saving={savingWorkItemAssignment} />}
    {copyOpen && <WorkPackageCopyModal form={copyForm} options={copyOptions} submitting={copying} projectStartDate={projectStartDate} projectEndDate={projectEndDate} onFormChange={(key, value) => setCopyForm(current => ({ ...current, [key]: value }))} onOptionChange={(key, value) => setCopyOptions(current => ({ ...current, [key]: value }))} onClose={() => setCopyOpen(false)} onSubmit={() => void copySelectedWorkPackage()} />}
    {createOpen && <WorkPackageModal form={form} submitting={submitting} projectStartDate={projectStartDate} projectEndDate={projectEndDate} serviceUnits={serviceUnits} onClose={() => setCreateOpen(false)} onChange={update} onSubmit={submit} />}
  </>
}

function WorkPackageModal({ form, submitting, projectStartDate, projectEndDate, serviceUnits, onClose, onChange, onSubmit }: { form: WorkPackageFormState; submitting: boolean; projectStartDate: string; projectEndDate: string; serviceUnits: Option[]; onClose: () => void; onChange: <K extends keyof WorkPackageFormState>(key: K, value: WorkPackageFormState[K]) => void; onSubmit: () => void }) {
  return <div className="work-package-modal-backdrop work-package-create-backdrop" role="presentation"><div className={`work-package-modal work-package-create-modal${form.type === 'service' ? ' work-package-create-service-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="work-package-title"><div className="work-package-modal-header"><div><h2 id="work-package-title">Create Work Package</h2></div></div><div className={`work-package-form-grid${form.type === 'service' ? ' service-work-package-grid' : ''}`}><div className="field"><label>Work Package Type <span className="required">*</span></label><select value={form.type} onChange={event => onChange('type', event.target.value as WorkPackageFormState['type'])} required><option value="">Select Work Package Type</option><option value="resource">Resource Based (Time)</option><option value="service">Service Based (Unit)</option></select></div><Field label="Work Package Name" value={form.workPackageName} onChange={value => onChange('workPackageName', value)} required /><Field label="Description" value={form.description} onChange={value => onChange('description', value)} /><Field label="Start Date" type="date" value={form.startDate} onChange={value => onChange('startDate', value)} min={projectStartDate} max={projectEndDate} required /><Field label="End Date" type="date" value={form.endDate || ''} onChange={value => onChange('endDate', value)} min={form.startDate || projectStartDate} max={projectEndDate} required />{form.type === 'service' && <><div className="field"><label>Service Unit <span className="required">*</span></label><select value={form.unitId || ''} onChange={event => onChange('unitId', event.target.value)} required><option value="">Select Service Unit</option>{serviceUnits.map(unit => <option key={unit.code} value={unit.code}>{unit.code} - {unit.name}</option>)}</select></div><Field label="Unit Quantity" type="number" value={form.unitQuantity || ''} onChange={value => onChange('unitQuantity', value)} /></>}</div><div className="form-actions"><button type="button" className="secondary" onClick={onClose} disabled={submitting}>Cancel</button><button type="button" className="primary" onClick={onSubmit} disabled={submitting || !form.type}>{submitting ? 'Creating...' : 'Create work package'}</button></div></div></div>
}
function WorkPackageCopyModal({ form, options, submitting, projectStartDate, projectEndDate, onFormChange, onOptionChange, onClose, onSubmit }: { form: { name: string; description: string; startDate: string; endDate: string }; options: WorkPackageCopyOptions; submitting: boolean; projectStartDate: string; projectEndDate: string; onFormChange: (key: 'name' | 'description' | 'startDate' | 'endDate', value: string) => void; onOptionChange: (key: keyof WorkPackageCopyOptions, value: boolean) => void; onClose: () => void; onSubmit: () => void }) {
  const includeOptions: Array<{ key: keyof WorkPackageCopyOptions; label: string }> = [
    { key: 'blockedFunctions', label: 'Blocked Functions' }, { key: 'workItem', label: 'Work Item' }, { key: 'team', label: 'Team' },
    { key: 'requestedResources', label: 'Requested Resources' }, { key: 'additionalResources', label: 'Additional Resources' },
    { key: 'expenses', label: 'Expenses' }, { key: 'attachments', label: 'Attachments' },
  ]
  return <div className="work-package-modal-backdrop" role="presentation" onMouseDown={onClose}><div className="work-package-modal work-package-copy-modal" role="dialog" aria-modal="true" aria-labelledby="copy-work-package-title" onMouseDown={event => event.stopPropagation()}><div className="work-package-modal-header"><h2 id="copy-work-package-title">Copy Work Package</h2><button type="button" className="text-button" onClick={onClose} disabled={submitting}>Close</button></div><div className="copy-work-package-form"><label className="field"><span>Name <span className="required">*</span></span><input autoFocus value={form.name} onChange={event => onFormChange('name', event.target.value)} required /></label><div className="field"><label>Duration <span className="required">*</span></label><div className="copy-duration-fields"><input aria-label="Copy start date" type="date" value={form.startDate} min={projectStartDate} max={projectEndDate} onChange={event => onFormChange('startDate', event.target.value)} required /><span>to</span><input aria-label="Copy end date" type="date" value={form.endDate} min={form.startDate || projectStartDate} max={projectEndDate} onChange={event => onFormChange('endDate', event.target.value)} required /></div></div><label className="field"><span>Description</span><textarea value={form.description} onChange={event => onFormChange('description', event.target.value)} maxLength={1000} placeholder="Description of the new work package" /></label><fieldset className="copy-work-package-options"><legend>Include:</legend>{includeOptions.map(option => <label key={option.key}><input type="checkbox" checked={options[option.key]} onChange={event => onOptionChange(option.key, event.target.checked)} /><span>{option.label}</span></label>)}</fieldset></div><div className="form-actions"><button type="button" className="primary" onClick={onSubmit} disabled={submitting || !form.name.trim() || !form.startDate || !form.endDate}>{submitting ? 'Copying...' : 'Copy'}</button><button type="button" className="secondary" onClick={onClose} disabled={submitting}>Cancel</button></div></div></div>
}
function WorkItemAssignmentModal({ title, options, selected, search, onSearch, onToggle, onToggleAll, onCancel, onApply, saving = false }: { title: string; options: WorkPackageDemandDetailsResponse['workItems']; selected: string[]; search: string; onSearch: (value: string) => void; onToggle: (code: string) => void; onToggleAll: (codes: string[]) => void; onCancel: () => void; onApply: () => void | Promise<void>; saving?: boolean }) {
  const uniqueOptions = [...new Map(options.filter(item => item.workItem && item.workItem !== 'USR1').map(item => [item.workItem, item])).values()]
  const filteredOptions = uniqueOptions.filter(item => `${item.workItem} ${item.workItemName} ${item.workItemGroup || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const visibleCodes = filteredOptions.map(item => item.workItem)
  const allVisibleSelected = visibleCodes.length > 0 && visibleCodes.every(code => selected.includes(code))
  const toggleVisible = () => onToggleAll(allVisibleSelected ? selected.filter(code => !visibleCodes.includes(code)) : [...new Set([...selected, ...visibleCodes])])
  return <div className="column-modal-backdrop work-item-assignment-backdrop" role="presentation" onMouseDown={onCancel}><div className="column-modal work-item-assignment-modal" role="dialog" aria-modal="true" aria-labelledby="work-item-assignment-title" onMouseDown={event => event.stopPropagation()}><div className="column-modal-header"><h2 id="work-item-assignment-title">{title}</h2></div><div className="work-item-assignment-search"><input autoFocus value={search} onChange={event => onSearch(event.target.value)} placeholder="Search work items..." disabled={saving} /></div><div className="work-item-assignment-count">Items Selected: {selected.length}</div><div className="work-item-assignment-table-wrap"><table className="work-item-assignment-table"><thead><tr><th aria-label="Select all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Select all visible work items" disabled={saving} /></th><th>Work Item</th><th>Work Item Name</th></tr></thead><tbody>{filteredOptions.map(item => <tr key={item.workItem} className={selected.includes(item.workItem) ? 'selected' : ''}><td><input type="checkbox" checked={selected.includes(item.workItem)} onChange={() => onToggle(item.workItem)} aria-label={`Assign ${item.workItem}`} disabled={saving} /></td><td>{item.workItem}</td><td>{item.workItemName || '-'}</td></tr>)}{!filteredOptions.length && <tr><td colSpan={3} className="work-item-assignment-empty">No work items found</td></tr>}</tbody></table></div><div className="column-modal-actions"><button className="primary" type="button" onClick={onApply} disabled={saving}>{saving ? 'Saving...' : 'OK'}</button><button className="text-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button></div></div></div>
}

function Field({ label, value, onChange, type = 'text', required, min, max }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: string; max?: string }) { return <div className="field"><label>{label} {required && <span className="required">*</span>}</label><input type={type} value={value} min={min || undefined} max={max || undefined} required={required} onChange={event => onChange(event.target.value)} /></div> }
function useProjectBilling(projectId: string) {
  const [data, setData] = useState<ProjectBillingResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { let cancelled = false; setLoading(true); setError(''); projectService.getBilling(projectId).then(result => { if (!cancelled) setData(result) }).catch(reason => { if (!cancelled) setError(reason instanceof ApiError ? reason.message : 'Unable to fetch billing details from SAP.') }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } }, [projectId])
  return { data, error, loading }
}

function moneyLocale(currency: string) { return currency.trim().toUpperCase() === 'INR' ? 'en-IN' : undefined }
function billingMoney(value: string | number, currency: string) { const amount = Number(value); return Number.isFinite(amount) ? `${amount.toLocaleString(moneyLocale(currency), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : '-' }
function compactBudgetMoney(value: string | number, currency: string) { const amount = Number(value); return Number.isFinite(amount) ? `${amount.toLocaleString(moneyLocale(currency), { maximumFractionDigits: 2 })} ${currency}`.trim() : '-' }
function billingWorkPackages(items: Array<{ id: string; name: string }>) { return items.map(item => item.name).filter(Boolean).join(', ') || '-' }
function billingWorkPackageNameRows(items: Array<{ id: string; name: string }>) {
  const names = items.map(item => item.name).filter(Boolean)
  if (!names.length) return []
  const namesPerLine = names.length > 4 ? 3 : 2
  return Array.from({ length: Math.ceil(names.length / namesPerLine) }, (_, index) => names.slice(index * namesPerLine, (index + 1) * namesPerLine))
}

type BillingColumnKey = 'number' | 'contractType' | 'product' | 'description' | 'workPackages' | 'profitCenter' | 'plannedRevenue' | 'amountToBill' | 'ssp' | 'amountCap' | 'capNotificationThreshold' | 'status' | 'wbsElement' | 'customerMaterial' | 'information' | 'customerReference'
const billingRowsSnapshot = (items: BillingContract[]) => JSON.stringify(items.map(row => {
  const normalizedNumber = (value: string) => {
    const parsed = Number(value)
    return value.trim() && Number.isFinite(parsed) ? String(parsed) : value.trim()
  }
  return {
    id: row.id.trim(),
    contractType: row.contractType.trim(),
    product: row.product.trim(),
    description: row.description.trim(),
    workPackages: row.workPackages.map(item => item.id.trim()).sort(),
    profitCenter: row.profitCenter.trim(),
    plannedRevenue: normalizedNumber(row.plannedRevenue),
    amountToBill: normalizedNumber(row.amountToBill),
    ssp: normalizedNumber(row.ssp),
    amountCap: normalizedNumber(row.amountCap),
    capNotificationThreshold: normalizedNumber(row.capNotificationThreshold),
    status: row.status.trim(),
    wbsElement: row.wbsElement.trim(),
    customerMaterial: row.customerMaterial.trim(),
    customerReference: row.customerReference.trim(),
  }
}))
const billingColumns: Array<{ key: BillingColumnKey; label: string }> = [
  { key: 'number', label: 'No.' }, { key: 'contractType', label: 'Contract Type' }, { key: 'product', label: 'Product' },
  { key: 'description', label: 'Description' }, { key: 'workPackages', label: 'Assigned Work Packages' }, { key: 'profitCenter', label: 'Profit Center' },
  { key: 'plannedRevenue', label: 'Planned Revenue' }, { key: 'amountToBill', label: 'Amount to Be Billed' },
  { key: 'ssp', label: 'SSP' }, { key: 'amountCap', label: 'Amount Cap' }, { key: 'capNotificationThreshold', label: 'Cap Notification Threshold' },
  { key: 'status', label: 'Status / Rejection Reason' }, { key: 'wbsElement', label: 'Billing Item ID' }, { key: 'customerMaterial', label: 'Customer Material' },
  { key: 'information', label: 'Information' }, { key: 'customerReference', label: 'Customer Reference' },
]
const defaultBillingColumns = billingColumns.filter(column => !['product', 'description', 'ssp', 'amountCap', 'capNotificationThreshold', 'customerMaterial', 'information', 'customerReference'].includes(column.key)).map(column => column.key)
const billingNumericColumns: BillingColumnKey[] = ['plannedRevenue', 'amountToBill', 'amountCap']

function Billing({ projectId, projectName, salesOrganization, projectCurrency, projectProfitCenter, serviceOptions, budgetSummaries, onBillingDirtyChange, onDetailPageChange }: { projectId: string; projectName: string; salesOrganization: string; projectCurrency: string; projectProfitCenter: string; serviceOptions: Option[]; budgetSummaries: Record<string, WorkPackageBudgetSummary>; onBillingDirtyChange: (dirty: boolean) => void; onDetailPageChange: (open: boolean) => void }) {
  const { data, error, loading } = useProjectBilling(projectId)
  const [selectedBillingItem, setSelectedBillingItem] = useState<{ contract: BillingContract; index: number } | null>(null)
  useEffect(() => {
    const onDetailBack = (event: Event) => {
      if (!selectedBillingItem) return
      event.preventDefault()
      setSelectedBillingItem(null)
      onDetailPageChange(false)
    }
    window.addEventListener('billing-item-detail-back', onDetailBack)
    return () => window.removeEventListener('billing-item-detail-back', onDetailBack)
  }, [selectedBillingItem, onDetailPageChange])
  const [editingRows, setEditingRows] = useState(false)
  const [rows, setRows] = useState<ProjectBillingResponse['contracts']>([])
  const [savedRows, setSavedRows] = useState<ProjectBillingResponse['contracts']>([])
  const [pendingBillingDeletes, setPendingBillingDeletes] = useState<ProjectBillingResponse['contracts']>([])
  const successfullyCreatedBillingRows = useRef(new Set<string>())
  const [workPackageOptions, setWorkPackageOptions] = useState<Array<{ id: string; name: string; type?: string }>>([])
  const [workPackageMenu, setWorkPackageMenu] = useState<{ rowIndex: number; left: number; top: number; width: number } | null>(null)
  const [deletingBillingItem, setDeletingBillingItem] = useState(false)
  const [customerReference, setCustomerReference] = useState('')
  const [customerReferenceDate, setCustomerReferenceDate] = useState('')
  const [pendingBillingPlans, setPendingBillingPlans] = useState<CreateBillingPlanRequest[]>([])
  const billingCreatedInSession = useRef(false)
  const [bulkBillingStep, setBulkBillingStep] = useState<'choose' | 'upload' | null>(null)
  const [bulkBillingType, setBulkBillingType] = useState<CreateBillingPlanRequest['billingType']>('fixed')
  const [bulkBillingWorking, setBulkBillingWorking] = useState(false)
  const [bulkBillingFeedback, setBulkBillingFeedback] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [visibleColumns, setVisibleColumns] = useState<BillingColumnKey[]>(() => defaultBillingColumns)
  const [columnOrder, setColumnOrder] = useState<BillingColumnKey[]>(() => billingColumns.map(column => column.key))
  const [draggedColumn, setDraggedColumn] = useState<BillingColumnKey | null>(null)
  const [servicePriceListOpen, setServicePriceListOpen] = useState(false)
  const [servicePrices, setServicePrices] = useState<ProjectServicePrice[]>([])
  const [servicePricesLoading, setServicePricesLoading] = useState(false)
  const [servicePricesError, setServicePricesError] = useState('')
  const [servicePriceDrafts, setServicePriceDrafts] = useState<Record<string, string>>({})
  const settingsSnapshot = useRef<{ visible: BillingColumnKey[]; order: BillingColumnKey[] } | null>(null)
  const orderedColumns = columnOrder.map(key => billingColumns.find(column => column.key === key)!).filter(Boolean)
  const shownColumns = orderedColumns.filter(column => visibleColumns.includes(column.key))
  const search = columnSearch.trim().toLowerCase()
  const searchedColumns = orderedColumns.filter(column => column.label.toLowerCase().includes(search))
  const persistedRows = savedRows
  const loadServicePrices = async () => {
    if (!salesOrganization) {
      setServicePricesError('The project has no sales organization configured.')
      return
    }
    setServicePricesLoading(true)
    setServicePricesError('')
    try {
      const result = await projectService.getProjectServicePrices(projectId, salesOrganization)
      setServicePrices(result.prices || [])
    } catch (reason) {
      setServicePricesError(reason instanceof ApiError ? reason.message : 'Unable to load service prices from SAP.')
    } finally {
      setServicePricesLoading(false)
    }
  }
  const openServicePriceList = () => { setServicePriceListOpen(true); void loadServicePrices() }
  const updateServicePriceDraft = (material: string, value: string) => setServicePriceDrafts(current => ({ ...current, [material]: value }))
  useEffect(() => {
    const isDirty = pendingBillingDeletes.length > 0 || pendingBillingPlans.length > 0 || Object.keys(servicePriceDrafts).length > 0 || customerReference !== (data?.customerReference || '') || customerReferenceDate !== dateInputValue(data?.customerReferenceDate || '') || rows.some(row => row.id.startsWith('new-') && !successfullyCreatedBillingRows.current.has(row.id)) || billingRowsSnapshot(rows.filter(row => !row.id.startsWith('new-'))) !== billingRowsSnapshot(persistedRows.filter(row => !pendingBillingDeletes.some(deleted => deleted.id === row.id)))
    onBillingDirtyChange(isDirty)
    const onDirtyCheck = (event: Event) => (event as CustomEvent<WorkspaceDirtyRequest>).detail?.register(() => isDirty)
    window.addEventListener('workspace-dirty-request', onDirtyCheck)
    return () => window.removeEventListener('workspace-dirty-request', onDirtyCheck)
  }, [customerReference, customerReferenceDate, data, onBillingDirtyChange, pendingBillingDeletes, pendingBillingPlans, persistedRows, rows, servicePriceDrafts])
  useEffect(() => { if (data) { const current = data.contracts.map(contract => ({ ...contract, currency: projectCurrency, dueDates: contract.dueDates.map(item => ({ ...item, currency: projectCurrency })) })); setRows(current); setSavedRows(current) } }, [data, projectCurrency])
  useEffect(() => {
    let active = true
    projectService.getWorkspace(projectId).then(workspace => {
      if (active) setWorkPackageOptions(workspace.workPackages.map(item => ({ id: item.id, name: item.name, type: item.type })))
    }).catch(() => { if (active) setWorkPackageOptions([]) })
    return () => { active = false }
  }, [projectId])
  useEffect(() => {
    if (!workPackageMenu) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && (target.closest('.billing-work-package-menu') || target.closest('.billing-work-package-trigger'))) return
      setWorkPackageMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setWorkPackageMenu(null) }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [workPackageMenu])
  useEffect(() => { if (data) { setCustomerReference(data.customerReference || ''); setCustomerReferenceDate(dateInputValue(data.customerReferenceDate || '')) } }, [data])
  useEffect(() => {
    const handleEditMode = (event: Event) => { const enabled = Boolean((event as CustomEvent<boolean>).detail); setEditingRows(enabled); if (!enabled) { setRows(savedRows); setPendingBillingDeletes([]); setServicePriceDrafts({}); successfullyCreatedBillingRows.current.clear(); if (data) { setCustomerReference(data.customerReference || ''); setCustomerReferenceDate(dateInputValue(data.customerReferenceDate || '')) }; billingCreatedInSession.current = false; setPendingBillingPlans([]) } }
    window.addEventListener('billing-edit-mode', handleEditMode)
    return () => window.removeEventListener('billing-edit-mode', handleEditMode)
  }, [data, projectCurrency, savedRows])
  useEffect(() => {
    const onSave = (event: Event) => {
      if (!editingRows) return
      const detail = (event as CustomEvent<WorkspaceSaveRequest>).detail
      const newRows = rows.filter(row => row.id.startsWith('new-') && !successfullyCreatedBillingRows.current.has(row.id))
      const deletedIds = new Set(pendingBillingDeletes.map(row => row.id))
      const existingRowsChanged = billingRowsSnapshot(rows.filter(row => !row.id.startsWith('new-'))) !== billingRowsSnapshot(persistedRows.filter(row => !deletedIds.has(row.id)))
      const generalChanged = customerReference !== (data?.customerReference || '') || customerReferenceDate !== dateInputValue(data?.customerReferenceDate || '')
      detail?.register(
        async () => {
          if (pendingBillingDeletes.length) {
            setDeletingBillingItem(true)
            try {
              for (const deleted of pendingBillingDeletes) {
                await projectService.deleteBillingItem(projectId, deleted.id)
                setPendingBillingDeletes(current => current.filter(row => row.id !== deleted.id))
                setSavedRows(current => current.filter(row => row.id !== deleted.id))
              }
            } finally {
              setDeletingBillingItem(false)
            }
          }
          let nextSalesOrderItem = Math.max(0, ...rows.filter(row => !row.id.startsWith('new-')).map(row => Number(row.id) || 0)) + 1
          for (const row of newRows) {
            const workPackageIds = [...new Set(row.workPackages.map(item => item.id.trim()).filter(Boolean))]
            if (!workPackageIds.length) throw new Error('Assign at least one work package to each new billing row before saving.')
            const workPackageId = workPackageIds[0]
            const contractType = row.contractType.toLowerCase()
            const billingType: CreateBillingPlanRequest['billingType'] = contractType.includes('period') ? 'periodic' : contractType.includes('usage') ? 'usageBased' : contractType.includes('time') || contractType.includes('t&m') ? 'timeAndMaterials' : 'fixed'
            const expectedNetAmount = Number(row.plannedRevenue) > 0 ? row.plannedRevenue : row.amountToBill || '0'
            await projectService.createBillingPlan({ projectId, salesOrderId: data?.salesOrder, createSalesOrderItem: true, billingType, workPackageId, workPackageIds, customerPurchaseOrderDate: new Date().toISOString().slice(0, 10), paymentMethod: 'F', expectedNetAmount, transactionCurrency: projectCurrency, salesOrderItem: String(nextSalesOrderItem++), underlyingPurchaseOrderItem: '', salesOrderItemText: row.description || row.product || row.contractType, billingPlanAmount: row.amountToBill || expectedNetAmount })
            successfullyCreatedBillingRows.current.add(row.id)
            billingCreatedInSession.current = true
          }
          for (const payload of pendingBillingPlans) {
            await projectService.createBillingPlan(payload)
            billingCreatedInSession.current = true
            setPendingBillingPlans(current => { const index = current.indexOf(payload); return index < 0 ? current : current.filter((_, itemIndex) => itemIndex !== index) })
          }
          for (const [material, rate] of Object.entries(servicePriceDrafts)) {
            const price = servicePrices.find(item => item.material === material)
            if (!price) throw new Error(`Unable to find service pricing details for ${material}.`)
            await projectService.updateProjectServicePrice({
              projectId,
              material,
              rate,
              currency: price.projectPrice?.currency || price.standardCurrency,
              unit: price.unit || 'H',
              validityStartDate: price.projectPrice?.validityStartDate || price.validityStartDate,
              validityEndDate: price.projectPrice?.validityEndDate || price.validityEndDate,
            })
          }
          if (Object.keys(servicePriceDrafts).length) {
            await loadServicePrices()
            setServicePriceDrafts({})
          }
          if (pendingBillingDeletes.length || newRows.length || pendingBillingPlans.length) {
            const refreshed = await projectService.getBilling(projectId)
            const saved = refreshed.contracts.map(contract => ({ ...contract, currency: projectCurrency, dueDates: contract.dueDates.map(item => ({ ...item, currency: projectCurrency })) }))
            setRows(saved)
            setSavedRows(saved)
            setCustomerReference(refreshed.customerReference || '')
            setCustomerReferenceDate(dateInputValue(refreshed.customerReferenceDate || ''))
            setPendingBillingDeletes([])
          }
          return pendingBillingDeletes.length > 0 || newRows.length > 0 || pendingBillingPlans.length > 0 || Object.keys(servicePriceDrafts).length > 0
        },
        () => (existingRowsChanged || generalChanged) && newRows.length === 0 && pendingBillingPlans.length === 0 ? 'Updates to existing billing items and General fields are not supported by the SAP backend yet. Cancel those edits before saving.' : Object.values(servicePriceDrafts).some(rate => rate === '' || !Number.isFinite(Number(rate)) || Number(rate) < 0) ? 'Enter a valid project-specific price for each edited service.' : newRows.some(row => !row.workPackages[0]?.id) || pendingBillingPlans.some(row => !row.workPackageId) ? 'Assign a work package to each new billing row before saving.' : null,
      )
    }
    window.addEventListener('workspace-save-request', onSave)
    return () => window.removeEventListener('workspace-save-request', onSave)
  }, [customerReference, customerReferenceDate, data, editingRows, pendingBillingDeletes, pendingBillingPlans, persistedRows, rows, servicePriceDrafts])
  const toggleColumn = (key: BillingColumnKey) => setVisibleColumns(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])
  const moveColumn = (from: BillingColumnKey, to: BillingColumnKey) => setColumnOrder(current => {
    const next = [...current]; const fromIndex = next.indexOf(from); const toIndex = next.indexOf(to)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current
    next.splice(fromIndex, 1); next.splice(toIndex, 0, from); return next
  })
  const openSettings = () => { settingsSnapshot.current = { visible: [...visibleColumns], order: [...columnOrder] }; setColumnSearch(''); setSettingsOpen(true) }
  const cancelSettings = () => { if (settingsSnapshot.current) { setVisibleColumns(settingsSnapshot.current.visible); setColumnOrder(settingsSnapshot.current.order) }; setSettingsOpen(false) }
  const resetSettings = () => { setVisibleColumns(defaultBillingColumns); setColumnOrder(billingColumns.map(column => column.key)); setColumnSearch('') }
  const updateRow = (index: number, key: 'contractType' | 'product' | 'description' | 'profitCenter' | 'plannedRevenue' | 'amountToBill' | 'status', value: string) => setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row))
  const workPackageOptionMap = new Map<string, { id: string; name: string; type?: string }>()
  for (const option of workPackageOptions) if (option.id) workPackageOptionMap.set(option.id, option)
  for (const option of rows.flatMap(row => row.workPackages)) if (option.id) {
    const knownOption = workPackageOptionMap.get(option.id)
    workPackageOptionMap.set(option.id, { ...option, type: knownOption?.type })
  }
  const billingWorkPackageChoices = [...workPackageOptionMap.values()].filter(option => option.name.trim().toLowerCase() !== 'test')
  const toggleBillingWorkPackage = (rowIndex: number, option: { id: string; name: string }) => {
    setRows(current => {
      const alreadySelected = current[rowIndex]?.workPackages.some(item => item.id === option.id) || false
      return current.map((row, index) => {
        const workPackages = index === rowIndex
          ? alreadySelected
            ? row.workPackages.filter(item => item.id !== option.id)
            : [...row.workPackages.filter(item => item.id !== option.id), option]
          : alreadySelected ? row.workPackages : row.workPackages.filter(item => item.id !== option.id)
        const selectedSummaries = workPackages.map(item => budgetSummaries[item.id]).filter((summary): summary is WorkPackageBudgetSummary => Boolean(summary))
        const allSummariesLoaded = workPackages.every(item => Boolean(budgetSummaries[item.id]))
        const plannedRevenue = allSummariesLoaded ? String(selectedSummaries.reduce((total, summary) => total + summary.revenue, 0)) : row.plannedRevenue
        if (index === rowIndex) {
          return { ...row, workPackages, plannedRevenue, amountToBill: allSummariesLoaded ? plannedRevenue : row.amountToBill, profitCenter: workPackages.length ? (row.profitCenter || projectProfitCenter) : row.profitCenter }
        }
        if (workPackages.length === row.workPackages.length) return row
        return { ...row, workPackages, plannedRevenue, amountToBill: allSummariesLoaded ? plannedRevenue : row.amountToBill }
      })
    })
  }
  const createRow = () => { setRows(current => [...current, { id: `new-${Date.now()}`, salesOrderId: '', editable: true, contractType: '', product: '', description: '', workPackages: [], profitCenter: projectProfitCenter, plannedRevenue: '0', amountToBill: '0', ssp: '', amountCap: '', capNotificationThreshold: '', wbsElement: '', customerMaterial: '', customerReference: '', currency: projectCurrency, status: 'Open', dueDates: [] }]); setEditingRows(true); window.dispatchEvent(new Event('billing-request-edit')) }
  const removeBillingRow = (rowIndex: number) => {
    const selected = rows[rowIndex]
    if (!editingRows || deletingBillingItem || !selected || selected.workPackages.length) return
    const normalizedType = selected.contractType.trim().toLowerCase()
    if (!(normalizedType.includes('time') || normalizedType.includes('t&m') || normalizedType.includes('usage'))) return
    if (!selected.id.startsWith('new-')) setPendingBillingDeletes(current => current.some(row => row.id === selected.id) ? current : [...current, selected])
    setRows(current => current.filter((_, index) => index !== rowIndex))
  }
  const chooseBulkBillingType = (type: CreateBillingPlanRequest['billingType']) => { window.dispatchEvent(new Event('billing-request-edit')); setBulkBillingType(type); setBulkBillingFeedback(''); setBulkBillingStep('upload') }
  const uploadBillingRows = async (file?: File) => {
    if (!file) return
    setBulkBillingWorking(true); setBulkBillingFeedback('')
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const values = XLSX.utils.sheet_to_json<Array<string | number>>(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' })
      const uploadRows = values.slice(1).filter(row => row.some(value => String(value).trim()))
      const plans = uploadRows.map((row, uploadIndex) => ({ projectId, salesOrderId: data?.salesOrder, createSalesOrderItem: true, billingType: bulkBillingType, workPackageId: String(row[0] || ''), customerPurchaseOrderDate: String(row[1] || new Date().toISOString().slice(0, 10)), paymentMethod: String(row[2] || 'F'), expectedNetAmount: String(row[3] || '0'), transactionCurrency: projectCurrency, salesOrderItem: String(row[5] || String(Math.max(0, ...rows.filter(item => !item.id.startsWith('new-')).map(item => Number(item.id) || 0)) + uploadIndex + 1)), underlyingPurchaseOrderItem: String(row[6] || ''), salesOrderItemText: String(row[7] || ''), billingPlanBillingDate: String(row[8] || ''), billingPlanAmount: String(row[9] || row[3] || '0'), billingPlanItemDescription: String(row[10] || ''), billingPlanItemUsage: String(row[11] || ''), billingPlanServiceStartDate: String(row[12] || ''), billingPlanServiceEndDate: String(row[13] || '') }))
      setPendingBillingPlans(current => [...current, ...plans])
      setEditingRows(true)
      window.dispatchEvent(new Event('billing-request-edit'))
      setBulkBillingFeedback(`${plans.length} billing row(s) added to the edit session. Save the project to send them to SAP.`)
    } catch (reason) { setBulkBillingFeedback(reason instanceof ApiError ? reason.message : 'Unable to process the billing spreadsheet.') } finally { setBulkBillingWorking(false) }
  }
  const openBillingItem = (contract: BillingContract, index: number) => {
    setSelectedBillingItem({ contract, index })
    onDetailPageChange(true)
  }
  const renderCell = (column: BillingColumnKey, contract: NonNullable<ProjectBillingResponse['contracts']>[number], index: number) => {
    const rowEditable = contract.id.startsWith('new-') || contract.editable
    if (column === 'number') return index + 1
    if (column === 'workPackages') {
      if (!editingRows) return <span className="billing-work-package-names">{billingWorkPackageNameRows(contract.workPackages).length ? billingWorkPackageNameRows(contract.workPackages).map((nameRow, rowIndex) => <span className="billing-work-package-name-row" key={rowIndex}>{nameRow.join(', ')}</span>) : '-'}</span>
      const menuId = `billing-work-package-menu-${index}`
      const isOpen = workPackageMenu?.rowIndex === index
      const selectedIds = new Set(contract.workPackages.map(item => item.id))
      const usageBased = contract.contractType.toLowerCase().includes('usage')
      const rowWorkPackageChoices = billingWorkPackageChoices.filter(option => {
        const serviceWorkPackage = ['u', 'service'].includes(String(option.type || '').trim().toLowerCase()) || (!option.type && /^service$/i.test(option.name))
        return usageBased ? serviceWorkPackage : !serviceWorkPackage
      })
      const toggleMenu = (target: HTMLElement) => {
          if (isOpen) { setWorkPackageMenu(null); return }
          const bounds = target.getBoundingClientRect()
          const menuHeight = Math.min(200, Math.max(78, rowWorkPackageChoices.length * 26 + 8))
          setWorkPackageMenu({ rowIndex: index, left: Math.min(bounds.left, window.innerWidth - 220), top: bounds.bottom + menuHeight > window.innerHeight ? Math.max(8, bounds.top - menuHeight) : bounds.bottom, width: Math.min(200, Math.max(180, bounds.width)) })
      }
      return <>
        <div className={`billing-work-package-trigger${contract.workPackages.length === 0 ? ' billing-work-package-empty-selection' : ''}`} role="group" aria-label="Assigned work packages" aria-invalid={contract.workPackages.length === 0} onClick={event => toggleMenu(event.currentTarget)}>
          <span className="billing-work-package-selected-values">{contract.workPackages.length ? contract.workPackages.map(option => <span className="billing-work-package-chip" key={option.id} title={option.name}>
            <span className="billing-work-package-chip-name">{option.name || 'Unnamed work package'}</span>
            <button type="button" className="billing-work-package-chip-remove" aria-label={`Remove ${option.name || 'work package'}`} onClick={event => { event.stopPropagation(); toggleBillingWorkPackage(index, option) }}>&times;</button>
          </span>) : <span className="billing-work-package-placeholder">Assign Work Packages</span>}</span>
          <button type="button" className="billing-work-package-menu-toggle" aria-label={isOpen ? 'Close work package list' : 'Open work package list'} aria-expanded={isOpen} aria-controls={menuId} onClick={event => { event.stopPropagation(); toggleMenu(event.currentTarget.parentElement as HTMLElement) }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 5.75 4.5 4.5 4.5-4.5" /></svg></button>
        </div>
        {isOpen && workPackageMenu && createPortal(<div id={menuId} className="billing-work-package-menu" role="group" aria-label="Assigned work packages" style={{ left: workPackageMenu.left, top: workPackageMenu.top, width: workPackageMenu.width }}>
          {rowWorkPackageChoices.map(option => <label key={option.id} className="billing-work-package-option"><input type="checkbox" checked={selectedIds.has(option.id)} onChange={() => toggleBillingWorkPackage(index, option)} /><span>{option.name || 'Unnamed work package'}</span></label>)}
          {!rowWorkPackageChoices.length && <span className="billing-work-package-empty">No work packages available for this contract type</span>}
        </div>, document.body)}
      </>
    }
    if (column === 'plannedRevenue') return billingMoney(contract.plannedRevenue, projectCurrency)
    if (column === 'amountToBill') return editingRows ? <span className="billing-amount-edit"><input className="work-package-inline-input billing-amount-input" type="number" value={contract.amountToBill} onChange={event => updateRow(index, 'amountToBill', event.target.value)} /><span>{contract.currency || projectCurrency}</span></span> : billingMoney(contract.amountToBill, projectCurrency)
    if (column === 'ssp') return contract.ssp || '-'
    if (column === 'amountCap') return contract.amountCap ? billingMoney(contract.amountCap, projectCurrency) : '-'
    if (column === 'capNotificationThreshold') return contract.capNotificationThreshold || '-'
    if (column === 'status') { const normalizedStatus = contract.status.toLowerCase(); const statusClass = normalizedStatus.includes('complete') ? 'completed' : normalizedStatus.includes('progress') ? 'in-progress' : 'open'; return <span className={`billing-status ${statusClass}`}>{contract.status}</span> }
    if (column === 'wbsElement') return contract.wbsElement || '-'
    if (column === 'customerMaterial') return contract.customerMaterial || '-'
    if (column === 'customerReference') return contract.customerReference || '-'
    if (column === 'contractType') {
      if (editingRows && rowEditable) return <select className="work-package-inline-input" value={contract.contractType} onChange={event => updateRow(index, 'contractType', event.target.value)}><option value=""></option><option>Fixed Price</option><option>Time and Expenses (T&amp;M)</option><option>Periodic Service</option><option>Usage Based</option></select>
      if (editingRows) return <span className="billing-readonly-inline">{contract.contractType || '-'}</span>
      return contract.contractType || '-'
    }
    if (column === 'description') return editingRows ? <input className="work-package-inline-input" value={contract.description || ''} onChange={event => updateRow(index, 'description', event.target.value)} /> : contract.description || '-'
    if (column === 'profitCenter') return contract.profitCenter || '-'
    if (column === 'product') return editingRows && rowEditable ? <input className="work-package-inline-input" value={contract.product || ''} onChange={event => updateRow(index, 'product', event.target.value)} /> : contract.product || '-'
    if (column !== 'information') return contract[column] || '-'
    return <span className="billing-info-indicator" aria-label={`Information for billing item ${index + 1}`} title="Billing item information">&#9432;</span>
  }
  if (loading) return <div className="card empty sap-tab-loading" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Loading billing details from SAP...</span></div>
  if (servicePriceListOpen) return <ServicePriceListPage projectId={projectId} projectName={projectName} prices={servicePrices} options={serviceOptions} loading={servicePricesLoading} error={servicePricesError} editing={editingRows} drafts={servicePriceDrafts} onDraftChange={updateServicePriceDraft} onBack={() => setServicePriceListOpen(false)} onRefresh={() => void loadServicePrices()} />
  if (error) return <div className="card work-package-load-error">{error}</div>
  if (selectedBillingItem) return <BillingItemDetails projectId={projectId} contract={selectedBillingItem.contract} index={selectedBillingItem.index} projectCurrency={projectCurrency} editing={editingRows} />
  const renderChoice = (column: { key: BillingColumnKey; label: string }) => <div className={`column-choice${visibleColumns.includes(column.key) ? ' selected' : ''}${draggedColumn === column.key ? ' dragging' : ''}`} key={column.key} draggable onDragStart={() => setDraggedColumn(column.key)} onDragEnd={() => setDraggedColumn(null)} onDragOver={event => event.preventDefault()} onDrop={() => { if (draggedColumn) moveColumn(draggedColumn, column.key); setDraggedColumn(null) }}><span className="column-drag-handle" aria-hidden="true">â‹®â‹®</span><label><input type="checkbox" checked={visibleColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} /><span>{column.label}</span></label></div>
  return <>
    <section className="billing-general-section"><div className="billing-general-heading"><h3>General</h3></div><div className="billing-general-content"><div className="billing-general-fields"><label>Customer Reference:</label>{editingRows ? <input aria-label="Customer Reference" value={customerReference} onChange={event => setCustomerReference(event.target.value)} /> : <span>{customerReference || '-'}</span>}<label>Customer Reference Date:</label>{editingRows ? <input aria-label="Customer Reference Date" type="date" value={customerReferenceDate} onChange={event => setCustomerReferenceDate(event.target.value)} /> : <span>{data?.customerReferenceDate || '-'}</span>}<label>Amount to Be Billed (Total):</label><span>{billingMoney(rows.reduce((total, row) => total + numeric(row.amountToBill), 0), data?.currency || projectCurrency)}</span></div><div className="billing-general-links"><button type="button" className="billing-service-price-link" onClick={openServicePriceList}>{editingRows ? 'Service Price List' : 'Display Service Price List'}</button><span>Sales Order ({data?.salesOrder || '-'})</span></div></div></section>
    <div className="billing-read-view"><div className={`billing-table${editingRows ? ' editing' : ''}`}><div className="billing-items-heading"><span>Items ({rows.length})</span><div className="billing-table-actions">{editingRows && <><button type="button" className="billing-create-item" onClick={createRow}>Create Billing Item</button><button type="button" onClick={() => { setBulkBillingFeedback(''); setBulkBillingStep('choose') }}>Bulk upload</button></>}<button className="billing-column-settings app-settings-button" type="button" onClick={openSettings} aria-label="Select and reorder billing fields" title="Table settings"><SettingsIcon /></button></div></div>{shownColumns.length ? <DataTable headers={[...shownColumns.map(column => column.label), '']} headerClassNames={[...shownColumns.map(column => column.key === 'amountToBill' ? 'billing-amount-to-bill-heading' : billingNumericColumns.includes(column.key) ? 'billing-numeric-heading' : column.key === 'status' ? 'billing-status-heading' : ''), 'billing-open-heading']}>{rows.length ? rows.map((contract, index) => <tr key={contract.id} className="billing-item-row" onClick={event => { if ((event.target as HTMLElement).closest('input, select, textarea, button, a')) return; openBillingItem(contract, index) }}>{shownColumns.map(column => <td key={column.key} className={column.key === 'amountToBill' ? 'billing-amount-to-bill-cell billing-numeric' : column.key === 'information' ? 'billing-information' : billingNumericColumns.includes(column.key) ? 'billing-numeric' : column.key === 'status' ? 'billing-status-cell' : column.key === 'workPackages' ? 'billing-work-packages-cell' : undefined}>{renderCell(column.key, contract, index)}</td>)}<td className="billing-open-cell">{(() => { const normalizedType = contract.contractType.trim().toLowerCase(); const canRemoveRow = editingRows && !contract.workPackages.length && (normalizedType.includes('time') || normalizedType.includes('t&m') || normalizedType.includes('usage')); return canRemoveRow ? <button type="button" className="billing-remove-created-row" aria-label={`Remove billing item ${index + 1}`} title="Remove row; save to delete from SAP" onClick={event => { event.stopPropagation(); removeBillingRow(index) }}>×</button> : <button type="button" aria-label={`Open billing item ${index + 1}`} onClick={() => openBillingItem(contract, index)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button> })()}</td></tr>) : <tr><td colSpan={shownColumns.length + 1} className="sap-empty-row-cell">No billing contracts were returned by SAP.</td></tr>}</DataTable> : <div className="billing-no-columns">Select at least one field from table settings.</div>}</div></div>
    
    {settingsOpen && <div className="column-modal-backdrop" role="presentation" onMouseDown={cancelSettings}><div className="column-modal billing-column-modal" role="dialog" aria-modal="true" aria-labelledby="billing-column-modal-title" onMouseDown={event => event.stopPropagation()}><div className="column-modal-header"><h2 id="billing-column-modal-title">Columns</h2><button className="column-reset" type="button" onClick={resetSettings}>Reset</button></div><div className="column-search"><input value={columnSearch} onChange={event => setColumnSearch(event.target.value)} placeholder="Search columns" autoFocus /><span aria-hidden="true">âŒ•</span></div><label className="column-select-all"><input type="checkbox" checked={visibleColumns.length === billingColumns.length} onChange={event => setVisibleColumns(event.target.checked ? billingColumns.map(column => column.key) : [])} /><strong>Select All</strong><span>Columns ({visibleColumns.length}/{billingColumns.length})</span></label><div className="column-list">{searchedColumns.map(renderChoice)}{!searchedColumns.length && <div className="column-empty">No matching columns</div>}</div><div className="column-modal-actions"><button className="primary" type="button" onClick={() => setSettingsOpen(false)}>OK</button><button className="text-button" type="button" onClick={cancelSettings}>Cancel</button></div></div></div>}
    {bulkBillingStep === 'choose' && <div className="work-package-modal-backdrop"><div className="work-package-modal billing-type-modal"><div className="work-package-modal-header"><div><p className="work-package-step">Bulk billing upload</p><h2>Select billing type</h2></div><button className="text-button" onClick={() => setBulkBillingStep(null)}>Close</button></div><div className="billing-type-grid"><button type="button" onClick={() => chooseBulkBillingType('fixed')}><span>01</span><strong>Fixed</strong><small>Milestone or fixed-amount billing.</small></button><button type="button" onClick={() => chooseBulkBillingType('timeAndMaterials')}><span>02</span><strong>Time &amp; Materials</strong><small>Bill actual effort and expenses.</small></button><button type="button" onClick={() => chooseBulkBillingType('periodic')}><span>03</span><strong>Periodic</strong><small>Recurring service-period billing.</small></button><button type="button" onClick={() => chooseBulkBillingType('usageBased')}><span>04</span><strong>Usage Based</strong><small>Bill measured service usage.</small></button></div></div></div>}
    {bulkBillingStep === 'upload' && <div className="work-package-modal-backdrop"><div className="work-package-modal bulk-upload-modal billing-bulk-modal"><div className="work-package-modal-header"><div><p className="work-package-step">{bulkBillingType.replace(/([A-Z])/g, ' $1')} billing</p><h2>Upload billing rows</h2></div><button className="text-button" onClick={() => setBulkBillingStep(null)}>Close</button></div><p className="bulk-upload-note">Upload Excel columns: Work Package ID, Customer PO Date, Payment Method, Expected Net Amount, Currency, Sales Order Item, Underlying PO Item, Description, Billing Date, Billing Amount, Item Description, Item Usage, Service Start, Service End.</p><div className="bulk-upload-actions"><label className="primary">Upload Excel File<input type="file" accept=".xlsx,.xls" disabled={bulkBillingWorking} onChange={event => uploadBillingRows(event.target.files?.[0])} /></label><button className="text-button" type="button" onClick={() => setBulkBillingStep('choose')}>Change billing type</button></div>{bulkBillingFeedback && <p className="billing-action-feedback">{bulkBillingFeedback}</p>}<div className="form-actions"><button className="secondary" type="button" onClick={() => setBulkBillingStep(null)} disabled={bulkBillingWorking}>Cancel</button></div></div></div>}
  </>
}

function ServicePriceListPage({ projectId, projectName, prices, options, loading, error, editing, drafts, onDraftChange, onBack, onRefresh }: { projectId: string; projectName: string; prices: ProjectServicePrice[]; options: Option[]; loading: boolean; error: string; editing: boolean; drafts: Record<string, string>; onDraftChange: (material: string, value: string) => void; onBack: () => void; onRefresh: () => void }) {
  const [showAllStandardPrices, setShowAllStandardPrices] = useState(false)
  const serviceNames = new Map(options.map(option => [option.code.trim().toUpperCase(), option.name]))
  const sortedPrices = [...prices].sort((left, right) => {
    const leftName = serviceNames.get(left.material.trim().toUpperCase()) || left.material
    const rightName = serviceNames.get(right.material.trim().toUpperCase()) || right.material
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
  })
  const visiblePrices = showAllStandardPrices ? sortedPrices : sortedPrices.filter(price => price.current)
  const formattedDate = (value: string) => {
    if (!value) return '-'
    const [year, month, day] = value.split('-')
    return year && month && day ? `${month}/${day}/${year}` : value
  }
  return <section className={`service-price-list-page${editing ? ' editing' : ''}`}>
    <div className="service-price-list-heading">
      <button type="button" className="service-price-back" onClick={onBack}><span aria-hidden="true">‹</span><span>Billing</span></button>
      <h2>Prices for {projectName || 'Project'} ({projectId})</h2>
    </div>
    <div className="service-price-list-toolbar">
      <strong>Items ({visiblePrices.length})</strong>
      <div className="service-price-list-actions">
        <button type="button" className={!showAllStandardPrices ? 'active' : ''} onClick={() => setShowAllStandardPrices(false)}>Show Only Current Prices</button>
        <button type="button" className={showAllStandardPrices ? 'active' : ''} onClick={() => setShowAllStandardPrices(true)}>Show All Standard Prices</button>
        <button type="button" className="service-price-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh service prices" title="Refresh service prices"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 5.5A5.5 5.5 0 1 0 13.2 9M13 2.5v3.2H9.8" /></svg></button>
      </div>
    </div>
    {error && <div className="card work-package-load-error" role="alert">{error}</div>}
    {loading ? <div className="card empty sap-tab-loading" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Loading service prices from SAP...</span></div> : <DataTable headers={['Service', 'Validity Period', 'Standard Price per Hour', 'Project-Specific Price per Hour']}>
      {visiblePrices.length ? visiblePrices.map(price => {
        const serviceName = serviceNames.get(price.material.trim().toUpperCase()) || price.material
        const projectCondition = price.projectPrice
        const projectRate = drafts[price.material] ?? projectCondition?.rate ?? ''
        return <tr key={price.standardConditionRecord} className={editing ? 'service-price-readonly-row' : ''}>
          <td><span className="service-price-name">{serviceName}</span></td>
          <td>{formattedDate(price.validityStartDate)} - {formattedDate(price.validityEndDate)}</td>
          <td className="service-price-money"><span className="service-price-value">{formatServicePrice(price.standardRate, price.standardCurrency)}</span><span className="service-price-currency">{price.standardCurrency}</span></td>
          <td className="service-price-project-cell">{editing ? <><input aria-label={`Project-specific price for ${serviceName}`} type="number" min="0" step="any" value={projectRate} onChange={event => onDraftChange(price.material, event.target.value)} /><span className="service-price-currency">{projectCondition?.currency || price.standardCurrency}</span></> : projectCondition ? <><span className="service-price-value">{formatServicePrice(projectCondition.rate, projectCondition.currency)}</span><span className="service-price-currency">{projectCondition.currency}</span></> : <span className="service-price-empty">-</span>}</td>
        </tr>
      }) : <tr><td colSpan={4} className="sap-empty-row-cell">No service prices were returned for sales organization pricing.</td></tr>}
    </DataTable>}
  </section>
}

function formatServicePrice(value: string | number, currency: string) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString(moneyLocale(currency), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
}

function BillingItemDetails({ projectId, contract, index, projectCurrency, editing }: { projectId: string; contract: BillingContract; index: number; projectCurrency: string; editing: boolean }) {
  const [activeTab, setActiveTab] = useState<'instructions' | 'dates' | 'partners'>('dates')
  return <section className="billing-item-detail-page">
    <div className="billing-item-detail-summary">
      <h2>Billing Item Details (Item {index + 1})</h2>
      <p>Contract Type: {contract.contractType || '-'}</p>
      <p>Amount to Be Billed: {billingMoney(contract.amountToBill, contract.currency || projectCurrency)}</p>
      <p>Assigned Work Packages: {billingWorkPackages(contract.workPackages)}</p>
      <p>Profit Center: {contract.profitCenter || '-'}</p>
    </div>
    <nav className="billing-item-detail-tabs" aria-label="Billing item details">
      <button type="button" className={activeTab === 'instructions' ? 'active' : ''} onClick={() => setActiveTab('instructions')}>Billing Instructions</button>
      <button type="button" className={activeTab === 'dates' ? 'active' : ''} onClick={() => setActiveTab('dates')}>Billing Due Dates</button>
      <button type="button" className={activeTab === 'partners' ? 'active' : ''} onClick={() => setActiveTab('partners')}>Billing Item Partners</button>
    </nav>
    {activeTab === 'dates' ? <BillingContractDueDates projectId={projectId} contract={contract} index={index} projectCurrency={projectCurrency} active editing={editing} /> : activeTab === 'instructions' ? <section className="card billing-item-detail-panel"><h3>Billing Instructions</h3><div>{(contract as BillingContract & { billingInstructions?: string }).billingInstructions || '-'}</div></section> : <section className="card billing-item-detail-panel"><h3>Billing Item Partners</h3><div>No partner details are available for this billing item.</div></section>}
  </section>
}

function BillingDueDates({ projectId, projectCurrency, active, editing }: { projectId: string; projectCurrency: string; active: boolean; editing: boolean }) {
  const { data, error, loading } = useProjectBilling(projectId)
  const [contractTypeFilter, setContractTypeFilter] = useState('')
  if (loading) return <div className="card empty sap-tab-loading" role="status" aria-live="polite"><span className="sap-loading-dots" aria-hidden="true"><i /><i /><i /></span><span>Loading billing due dates from SAP...</span></div>
  if (error) return <div className="card work-package-load-error">{error}</div>
  const contracts = data?.contracts || []
  const billingTypeOptions = [{ value: 'fixed', label: 'Fixed Price' }, { value: 'timeAndExpenses', label: 'Time and Expenses' }, { value: 'periodic', label: 'Periodic Service' }, { value: 'usageBased', label: 'Usage Based' }]
  const normalizedBillingType = (value: string) => { const text = value.trim().toLowerCase(); if (text.includes('time') || text.includes('t&m') || text.includes('expense')) return 'timeAndExpenses'; if (text.includes('period')) return 'periodic'; if (text.includes('usage')) return 'usageBased'; if (text.includes('fixed')) return 'fixed'; return text }
  const filteredContracts = contractTypeFilter ? contracts.filter(contract => normalizedBillingType(contract.contractType) === contractTypeFilter) : contracts
  const downloadFilteredTemplate = () => {
    const headers = ['Contract Line ID', 'Contract Type', 'Work Package ID', 'Work Package Name', 'Billing Due Date', 'Item Usage', 'Note', 'Amount', 'Currency', 'Service Start', 'Service End']
    const templateRows = filteredContracts.flatMap(contract => {
      const packages = contract.workPackages.length ? contract.workPackages : [{ id: '', name: '' }]
      return packages.map(workPackage => [contract.id, contract.contractType, workPackage.id, workPackage.name, '', '', '', '', projectCurrency, '', ''])
    })
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...templateRows]); sheet['!cols'] = [18, 22, 20, 34, 18, 18, 28, 16, 12, 18, 18].map(wch => ({ wch }))
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Billing Due Dates'); XLSX.writeFile(book, `${contractTypeFilter || 'all'}-billing-due-dates-template.xlsx`)
  }
  return <div className="billing-due-date-view"><div className="billing-due-bulk-toolbar"><div><strong>Bulk Billing Plan Dates</strong></div><div className="billing-due-bulk-controls"><select value={contractTypeFilter} onChange={event => setContractTypeFilter(event.target.value)} aria-label="Filter billing sections by contract type"><option value="">Select</option>{billingTypeOptions.map(type => <option value={type.value} key={type.value}>{type.label}</option>)}</select><button type="button" onClick={downloadFilteredTemplate} disabled={!filteredContracts.length}>Download Excel Template</button></div></div>{filteredContracts.length ? filteredContracts.map((contract, index) => <BillingContractDueDates key={contract.id} projectId={projectId} contract={contract} index={index} projectCurrency={projectCurrency} active={active} editing={editing} />) : <div className="card empty">No billing sections match the selected contract type.</div>}</div>
}

type DueDateDraft = { billingType: CreateBillingPlanRequest['billingType']; date: string; itemUsage: string; note: string; amount: string; serviceStart: string; serviceEnd: string }
const emptyDueDateDraft = (): DueDateDraft => ({ billingType: 'fixed', date: '', itemUsage: '', note: '', amount: '', serviceStart: '', serviceEnd: '' })

function BillingContractDueDates({ projectId, contract, index, projectCurrency, active = true, editing = false }: { projectId: string; contract: BillingContract; index: number; projectCurrency: string; active?: boolean; editing?: boolean }) {
  const [rows, setRows] = useState<Array<typeof contract.dueDates[number] & { currency: string; draftId?: string; billingType: 'fixed' | 'timeAndMaterials' | 'periodic' | 'usageBased' }>>(() => contract.dueDates.map(item => ({ ...item, currency: projectCurrency, draftId: undefined as string | undefined, billingType: 'fixed' })))
  const [savedRows, setSavedRows] = useState<Array<typeof contract.dueDates[number] & { currency: string; draftId?: string; billingType: 'fixed' | 'timeAndMaterials' | 'periodic' | 'usageBased' }>>(() => contract.dueDates.map(item => ({ ...item, currency: projectCurrency, draftId: undefined as string | undefined, billingType: 'fixed' })))
  const [pendingDueDates, setPendingDueDates] = useState<Array<{ id: string; draft: DueDateDraft }>>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [editingDueDates, setEditingDueDates] = useState(editing)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [feedback, setFeedback] = useState('')
  const sectionRef = useRef<HTMLElement | null>(null)
  const workPackageId = contract.workPackages[0]?.id || ''
  const contractType = contract.contractType.toLowerCase()
  const itemUsageOptions = contractType.includes('time') || contractType.includes('t&m')
    ? [{ value: '', label: 'Time and Expenses' }, { value: '1', label: 'Payment on Account' }, { value: '4', label: 'Down Payment Request' }]
    : contractType.includes('period')
      ? [{ value: '', label: 'Periodic Service' }, { value: '3', label: 'Usage-Based Billing' }]
      : contractType.includes('fixed')
        ? [{ value: '', label: 'Fixed Price' }, { value: '4', label: 'Down Payment Request' }]
        : [{ value: '', label: 'Usage Based' }]
  const itemUsageLabel = (value: string) => itemUsageOptions.find(option => option.value === value)?.label || value || '-'
  useEffect(() => { setEditingDueDates(editing) }, [editing])
  useEffect(() => {
    const onDirtyCheck = (event: Event) => { if (active) (event as CustomEvent<WorkspaceDirtyRequest>).detail?.register(() => pendingDueDates.length > 0 || JSON.stringify(rows.filter(row => !row.draftId)) !== JSON.stringify(savedRows)) }
    window.addEventListener('workspace-dirty-request', onDirtyCheck)
    return () => window.removeEventListener('workspace-dirty-request', onDirtyCheck)
  }, [active, pendingDueDates, rows, savedRows])
  useEffect(() => {
    const handleEditMode = (event: Event) => { const enabled = Boolean((event as CustomEvent<boolean>).detail); setEditingDueDates(enabled); if (!enabled) setSelected(null) }
    const cancelEdit = () => { setRows(savedRows); setPendingDueDates([]); setSelected(null) }
    const handleBillingPlanUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ contractId?: string; dueDates?: typeof rows }>).detail
      if (detail?.contractId !== contract.id || !Array.isArray(detail.dueDates)) return
      setRows(detail.dueDates)
      setSavedRows(detail.dueDates)
    }
    window.addEventListener('billing-edit-mode', handleEditMode)
    window.addEventListener('billing-cancel-edit', cancelEdit)
    window.addEventListener('billing-plan-item-updated', handleBillingPlanUpdate)
    return () => { window.removeEventListener('billing-edit-mode', handleEditMode); window.removeEventListener('billing-cancel-edit', cancelEdit); window.removeEventListener('billing-plan-item-updated', handleBillingPlanUpdate) }
  }, [contract.id, savedRows])
  useEffect(() => {
    if (!active || !editingDueDates) return
    const onSave = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceSaveRequest>).detail
      const existingRows = rows.filter(row => !row.draftId)
      const existingRowsChanged = JSON.stringify(existingRows) !== JSON.stringify(savedRows)
      const existingRowsRemoved = existingRows.length < savedRows.length
      const changedRows = rows.flatMap((row, rowIndex) => {
        if (row.draftId || !savedRows[rowIndex]) return []
        const fields = (value: typeof row) => JSON.stringify([value.date, value.note, value.amount, value.serviceStart, value.serviceEnd])
        return fields(row) !== fields(savedRows[rowIndex]) ? [{ row, rowIndex }] : []
      })
      detail?.register(async () => {
        for (const { row, rowIndex } of changedRows) {
          await projectService.updateBillingPlanItem({
            projectId,
            salesOrderItem: contract.id,
            billingPlanItem: row.billingPlanItem || '',
            sapPlanUri: row.sapPlanUri || '',
            billingPlanBillingDate: dateInputValue(row.date),
            transactionCurrency: row.currency || projectCurrency,
            billingPlanItemDescription: row.note || '',
            billingPlanAmount: row.amount || '0',
            billingPlanServiceStartDate: dateInputValue(row.serviceStart || ''),
            billingPlanServiceEndDate: dateInputValue(row.serviceEnd || ''),
          })
          const savedRow = { ...row }
          setSavedRows(current => current.map((item, itemIndex) => itemIndex === rowIndex ? savedRow : item))
        }
        for (const pending of pendingDueDates) {
          await projectService.createBillingPlan(payloadFor(pending.draft))
          setPendingDueDates(current => current.filter(item => item.id !== pending.id))
          const savedRow = { date: pending.draft.date, itemUsage: pending.draft.itemUsage, note: pending.draft.note, processingStatus: 'Open', amount: pending.draft.amount || '0', currency: projectCurrency, serviceStart: pending.draft.serviceStart, serviceEnd: pending.draft.serviceEnd, draftId: undefined as string | undefined, billingType: pending.draft.billingType }
          setRows(current => current.map(row => row.draftId === pending.id ? savedRow : row))
          setSavedRows(current => [...current, savedRow])
        }
        if (changedRows.length || pendingDueDates.length) {
          const committedRows = rows.map(row => ({ ...row, draftId: undefined }))
          setRows(committedRows)
          setSavedRows(committedRows)
          window.dispatchEvent(new CustomEvent('billing-plan-item-updated', { detail: { contractId: contract.id, dueDates: committedRows } }))
        }
        return changedRows.length > 0 || pendingDueDates.length > 0
      }, () => existingRowsRemoved ? 'Existing billing due dates cannot be removed yet.' : existingRowsChanged && changedRows.some(({ row }) => !row.billingPlanItem && !row.sapPlanUri) ? 'Unable to update a due date because SAP did not return its billing plan item key. Reload the billing details and try again.' : changedRows.some(({ row }) => !dateInputValue(row.date)) ? 'Enter a billing due date for each edited row.' : null)
    }
    window.addEventListener('workspace-save-request', onSave)
    return () => window.removeEventListener('workspace-save-request', onSave)
  }, [active, editingDueDates, pendingDueDates, projectCurrency, rows, savedRows])
  useEffect(() => {
    if (!editingDueDates || !active) return
    const section = sectionRef.current
    if (!section) return
    section.classList.add('editing-due-dates')
    const removeFromLastCell = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('input, select, textarea, button')) return
      const cell = (event.target as HTMLElement).closest('td')
      const row = cell?.closest('tr')
      if (!cell || !row || cell !== row.lastElementChild) return
      const tableRows = Array.from(row.parentElement?.querySelectorAll('tr') || [])
      const rowIndex = tableRows.indexOf(row)
      if (rowIndex < 0 || rowIndex >= rows.length) return
      event.preventDefault(); event.stopPropagation()
      const draftId = rows[rowIndex].draftId
      if (draftId) setPendingDueDates(current => current.filter(item => item.id !== draftId))
      setRows(current => current.filter((_, itemIndex) => itemIndex !== rowIndex))
      setSelected(current => current === rowIndex ? null : current != null && current > rowIndex ? current - 1 : current)
    }
    section.addEventListener('click', removeFromLastCell)
    return () => { section.classList.remove('editing-due-dates'); section.removeEventListener('click', removeFromLastCell) }
  }, [active, editingDueDates, rows.length])
  const updateDueRow = (rowIndex: number, key: 'date' | 'itemUsage' | 'note' | 'amount' | 'serviceStart' | 'serviceEnd', value: string) => setRows(current => current.map((row, currentIndex) => currentIndex === rowIndex ? { ...row, [key]: value } : row))
  const dueDateInput = (value: string, label: string, onChange: (value: string) => void) => editingDueDates ? <input aria-label={label} type="date" value={dateInputValue(value)} onChange={event => onChange(event.target.value)} /> : value || '-'
  const getTableHeaders = () => {
    if (contractType.includes('time') || contractType.includes('t&m')) {
      return ['Billing Due Date', 'Item Usage', 'Processing Status', 'Amount']
    }
    if (contractType.includes('period')) {
      return ['Billing Due Date', 'Item Usage', 'Note', 'Processing Status', 'Amount', 'Service Start', 'Service End']
    }
    if (contractType.includes('fixed')) {
      return ['Billing Due Date', 'Item Usage', 'Note', 'Processing Status', 'Amount']
    }
    if (contractType.includes('usage')) {
      return ['Billing Due Date', 'Processing Status', 'Amount']
    }
    return ['Billing Due Date', 'Item Usage', 'Note', 'Processing Status', 'Amount', 'Service Start', 'Service End']
  }
  const getHeaderClassNames = () => {
    if (contractType.includes('time') || contractType.includes('t&m')) {
      return ['', '', 'billing-due-status-heading', 'billing-due-amount-heading']
    }
    if (contractType.includes('period')) {
      return ['', '', '', 'billing-due-status-heading', 'billing-due-amount-heading', '', '']
    }
    if (contractType.includes('fixed')) {
      return ['', '', '', 'billing-due-status-heading', 'billing-due-amount-heading']
    }
    if (contractType.includes('usage')) {
      return ['', 'billing-due-status-heading', 'billing-due-amount-heading']
    }
    return ['', '', '', 'billing-due-status-heading', 'billing-due-amount-heading', '', '']
  }
  const renderRow = (dueDate: typeof rows[0], dueIndex: number) => {
    if (contractType.includes('time') || contractType.includes('t&m')) {
      return <tr key={`${contract.id}-${dueIndex}`} className={selected === dueIndex ? 'billing-row-selected' : ''} onClick={() => setSelected(dueIndex)}>
        <td>{dueDateInput(dueDate.date, `Billing due date ${dueIndex + 1}`, value => updateDueRow(dueIndex, 'date', value))}</td>
        <td>{editingDueDates && dueDate.draftId ? <select aria-label={`Item usage ${dueIndex + 1}`} value={dueDate.itemUsage} onChange={event => updateDueRow(dueIndex, 'itemUsage', event.target.value)}>{itemUsageOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> : itemUsageLabel(dueDate.itemUsage)}</td>
        <td className="billing-due-status-cell"><span className={`billing-status ${dueDate.processingStatus.toLowerCase().includes('complete') || dueDate.processingStatus.toLowerCase().includes('invoiced') ? 'completed' : dueDate.processingStatus.toLowerCase().includes('requested') ? 'in-progress' : 'open'}`}>{dueDate.processingStatus}</span></td>
        <td className="billing-due-amount-cell">{editingDueDates && dueDate.draftId ? <input aria-label={`Amount ${dueIndex + 1}`} type="number" min="0" step="any" value={dueDate.amount || ''} onChange={event => updateDueRow(dueIndex, 'amount', event.target.value)} /> : billingMoney(dueDate.amount, projectCurrency)}</td>
      </tr>
    }
    if (contractType.includes('period')) {
      return <tr key={`${contract.id}-${dueIndex}`} className={selected === dueIndex ? 'billing-row-selected' : ''} onClick={() => setSelected(dueIndex)}>
        <td>{dueDateInput(dueDate.date, `Billing due date ${dueIndex + 1}`, value => updateDueRow(dueIndex, 'date', value))}</td>
        <td>{editingDueDates && dueDate.draftId ? <select aria-label={`Item usage ${dueIndex + 1}`} value={dueDate.itemUsage} onChange={event => updateDueRow(dueIndex, 'itemUsage', event.target.value)}>{itemUsageOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> : itemUsageLabel(dueDate.itemUsage)}</td>
        <td>{editingDueDates ? <textarea aria-label={`Note ${dueIndex + 1}`} value={dueDate.note || ''} onChange={event => updateDueRow(dueIndex, 'note', event.target.value)} /> : dueDate.note || '-'}</td>
        <td className="billing-due-status-cell"><span className={`billing-status ${dueDate.processingStatus.toLowerCase().includes('complete') || dueDate.processingStatus.toLowerCase().includes('invoiced') ? 'completed' : dueDate.processingStatus.toLowerCase().includes('requested') ? 'in-progress' : 'open'}`}>{dueDate.processingStatus}</span></td>
        <td className="billing-due-amount-cell">{editingDueDates ? <input aria-label={`Amount ${dueIndex + 1}`} type="number" min="0" step="any" value={dueDate.amount || ''} onChange={event => updateDueRow(dueIndex, 'amount', event.target.value)} /> : billingMoney(dueDate.amount, projectCurrency)}</td>
        <td>{dueDateInput(dueDate.serviceStart, `Service start ${dueIndex + 1}`, value => updateDueRow(dueIndex, 'serviceStart', value))}</td>
        <td>{dueDateInput(dueDate.serviceEnd, `Service end ${dueIndex + 1}`, value => updateDueRow(dueIndex, 'serviceEnd', value))}</td>
      </tr>
    }
    if (contractType.includes('fixed')) {
      return <tr key={`${contract.id}-${dueIndex}`} className={selected === dueIndex ? 'billing-row-selected' : ''} onClick={() => setSelected(dueIndex)}>
        <td>{dueDateInput(dueDate.date, `Billing due date ${dueIndex + 1}`, value => updateDueRow(dueIndex, 'date', value))}</td>
        <td>{editingDueDates && dueDate.draftId ? <select aria-label={`Item usage ${dueIndex + 1}`} value={dueDate.itemUsage} onChange={event => updateDueRow(dueIndex, 'itemUsage', event.target.value)}>{itemUsageOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> : itemUsageLabel(dueDate.itemUsage)}</td>
        <td>{editingDueDates ? <textarea aria-label={`Note ${dueIndex + 1}`} value={dueDate.note || ''} onChange={event => updateDueRow(dueIndex, 'note', event.target.value)} /> : dueDate.note || '-'}</td>
        <td className="billing-due-status-cell"><span className={`billing-status ${dueDate.processingStatus.toLowerCase().includes('complete') || dueDate.processingStatus.toLowerCase().includes('invoiced') ? 'completed' : dueDate.processingStatus.toLowerCase().includes('requested') ? 'in-progress' : 'open'}`}>{dueDate.processingStatus}</span></td>
        <td className="billing-due-amount-cell">{editingDueDates ? <input aria-label={`Amount ${dueIndex + 1}`} type="number" min="0" step="any" value={dueDate.amount || ''} onChange={event => updateDueRow(dueIndex, 'amount', event.target.value)} /> : billingMoney(dueDate.amount, projectCurrency)}</td>
      </tr>
    }
    if (contractType.includes('usage')) {
      return <tr key={`${contract.id}-${dueIndex}`} className={selected === dueIndex ? 'billing-row-selected' : ''} onClick={() => setSelected(dueIndex)}>
        <td>{dueDateInput(dueDate.date, `Billing due date ${dueIndex + 1}`, value => updateDueRow(dueIndex, 'date', value))}</td>
        <td className="billing-due-status-cell"><span className={`billing-status ${dueDate.processingStatus.toLowerCase().includes('complete') || dueDate.processingStatus.toLowerCase().includes('invoiced') ? 'completed' : dueDate.processingStatus.toLowerCase().includes('requested') ? 'in-progress' : 'open'}`}>{dueDate.processingStatus}</span></td>
        <td className="billing-due-amount-cell">{editingDueDates ? <input aria-label={`Amount ${dueIndex + 1}`} type="number" min="0" step="any" value={dueDate.amount || ''} onChange={event => updateDueRow(dueIndex, 'amount', event.target.value)} /> : billingMoney(dueDate.amount, projectCurrency)}</td>
      </tr>
    }
    return null
  }
  const payloadFor = (item: DueDateDraft): CreateBillingPlanRequest => ({ projectId, salesOrderId: contract.salesOrderId, billingType: item.billingType, workPackageId, customerPurchaseOrderDate: new Date().toISOString().slice(0, 10), paymentMethod: 'F', expectedNetAmount: item.amount || contract.amountToBill || '0', transactionCurrency: projectCurrency, salesOrderItem: contract.id || String(index + 1), underlyingPurchaseOrderItem: '', salesOrderItemText: contract.description || contract.contractType, billingPlanBillingDate: item.date, billingPlanAmount: item.amount || '0', billingPlanItemDescription: item.note, billingPlanItemUsage: item.itemUsage, billingPlanServiceStartDate: item.serviceStart, billingPlanServiceEndDate: item.serviceEnd })
  const openCreate = () => { window.dispatchEvent(new Event('billing-request-edit')); if (!workPackageId) { setFeedback('This contract has no work package to bill.'); return }; const id = `due-${Date.now()}-${Math.random().toString(36).slice(2)}`; const newDraft: DueDateDraft = emptyDueDateDraft(); setPendingDueDates(current => [...current, { id, draft: newDraft }]); setRows(current => [...current, { date: '', itemUsage: '', note: '', processingStatus: 'Open', amount: '0', currency: projectCurrency, serviceStart: '', serviceEnd: '', draftId: id, billingType: 'fixed' }]); setSelected(rows.length) }
  const openCopy = () => { if (selected == null || !rows[selected]) return; window.dispatchEvent(new Event('billing-request-edit')); const row = rows[selected]; const id = `due-${Date.now()}-${Math.random().toString(36).slice(2)}`; const newDraft: DueDateDraft = { billingType: row.serviceStart || row.serviceEnd ? 'periodic' : 'fixed', date: dateInputValue(row.date), itemUsage: row.itemUsage || '', note: row.note || '', amount: row.amount || '', serviceStart: dateInputValue(row.serviceStart), serviceEnd: dateInputValue(row.serviceEnd) }; setPendingDueDates(current => [...current, { id, draft: newDraft }]); setRows(current => [...current, { date: newDraft.date, itemUsage: newDraft.itemUsage, note: newDraft.note, processingStatus: 'Open', amount: newDraft.amount || '0', currency: projectCurrency, serviceStart: newDraft.serviceStart, serviceEnd: newDraft.serviceEnd, draftId: id, billingType: newDraft.billingType }]); setSelected(rows.length) }
  const bulkUpload = async (file?: File) => { if (!file) return; setWorking(true); setFeedback(''); try { const book = XLSX.read(await file.arrayBuffer(), { type: 'array' }); const values = XLSX.utils.sheet_to_json<Array<string | number>>(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' }); const drafts = values.slice(1).filter(row => row.some(value => String(value).trim())).map(row => ({ date: String(row[0] || ''), itemUsage: String(row[1] || ''), note: String(row[2] || ''), amount: String(row[3] || ''), serviceStart: String(row[4] || ''), serviceEnd: String(row[5] || ''), billingType: (['fixed', 'timeAndMaterials', 'periodic', 'usageBased'].includes(String(row[6])) ? String(row[6]) : 'fixed') as DueDateDraft['billingType'] })); if (drafts.some(item => !item.date || !workPackageId)) throw new Error(!workPackageId ? 'This contract has no work package to bill.' : 'Every billing due date needs a date.'); const pending = drafts.map(item => ({ id: `due-${Date.now()}-${Math.random().toString(36).slice(2)}`, draft: item })); setPendingDueDates(current => [...current, ...pending]); setRows(current => [...current, ...pending.map(({ id, draft: item }) => ({ date: item.date, itemUsage: item.itemUsage, note: item.note, processingStatus: 'Open', amount: item.amount || '0', currency: projectCurrency, serviceStart: item.serviceStart, serviceEnd: item.serviceEnd, draftId: id, billingType: item.billingType }))]); setBulkOpen(false); setFeedback(`${drafts.length} due date(s) added to the edit session. Save the project to send them to SAP.`) } catch (reason) { setFeedback(reason instanceof Error ? reason.message : reason instanceof ApiError ? reason.message : 'Unable to process the billing-plan spreadsheet.') } finally { setWorking(false) } }
  return <section ref={sectionRef} className="billing-contract-section"><div className="billing-contract-heading"><h3>{index + 1}. &nbsp;{billingWorkPackages(contract.workPackages)} <span>{contract.contractType}</span></h3><div className="billing-due-actions"><button type="button" onClick={openCopy} disabled={selected == null}><b aria-hidden="true">⧰</b>Copy</button><button type="button" className="create" onClick={openCreate}><b aria-hidden="true">＋</b>Create</button></div></div><DataTable headers={getTableHeaders()} headerClassNames={getHeaderClassNames()}>{rows.length ? rows.map((dueDate, dueIndex) => renderRow(dueDate, dueIndex)) : <tr><td colSpan={getTableHeaders().length} className="sap-empty-row-cell">No billing due dates were returned for this contract.</td></tr>}</DataTable>{feedback && <p className="billing-action-feedback">{feedback}</p>}{bulkOpen && <div className="work-package-modal-backdrop"><div className="work-package-modal billing-due-modal"><div className="work-package-modal-header"><div><p className="work-package-step">Billing plan items</p><h2>Bulk upload due dates</h2></div><button className="text-button" onClick={() => setBulkOpen(false)}>Close</button></div><p className="bulk-upload-note">Upload Excel columns: Billing Due Date, Item Usage, Note, Amount, Service Start, Service End, Billing Type.</p><div className="bulk-upload-actions"><label className="primary">Choose Excel File<input type="file" accept=".xlsx,.xls" disabled={working} onChange={event => bulkUpload(event.target.files?.[0])} /></label></div>{feedback && <p className="billing-action-feedback">{feedback}</p>}<div className="form-actions"><button className="secondary" onClick={() => setBulkOpen(false)} disabled={working}>Cancel</button></div></div></div>}</section>
}
export function Approvals({ onMessage, responsibilities }: { onMessage: (state: DialogState) => void; responsibilities: ProjectWorkspaceResponse['responsibilities'] }) {
  const approvalRows = responsibilities
    .filter(item => item.roleId !== 'YP_RL_0001' && item.roleName.trim().toLowerCase() !== 'project manager')
    .slice(0, 4)
  const approvedRows = approvalRows.slice(0, 2)
  return <><div className="card approval-card"><h2>Approval hierarchy</h2><DataTable headers={['Level', 'Role', 'Approver', 'Status']}>{approvalRows.length ? approvalRows.map((item, index) => <tr key={`${item.roleId}-${item.workerId}-${index}`}><td>{index + 1}</td><td>{item.roleName || item.roleId || '-'}</td><td>{item.workerName || item.workerId || 'Unassigned'}</td><td><span className={`status ${index < 2 ? 'active' : 'open'}`}>{index < 2 ? 'Approved' : 'Not approved'}</span></td></tr>) : <tr><td colSpan={4} className="sap-empty-row-cell">No approval responsibilities were returned by SAP.</td></tr>}</DataTable><div className="form-actions"><button className="primary" onClick={() => onMessage({ type: 'warning', title: 'Submit for approval?', message: 'The workflow endpoint has not been supplied yet.', onConfirm: () => undefined })}>Submit for approval</button></div></div><div className="card approval-card approval-history"><h2>Approval History</h2><DataTable headers={['Level', 'Role', 'Approver', 'Action', 'Date / Time', 'Comments']}><tr><td>â€”</td><td>System</td><td>System</td><td>Project submitted</td><td>31/08/2026, 14:41:41</td><td>Project submitted for approval</td></tr>{approvedRows.map((item, index) => <tr key={`history-${item.roleId}-${item.workerId}-${index}`}><td>{index + 1}</td><td>{item.roleName || item.roleId || '-'}</td><td>{item.workerName || item.workerId || 'Unassigned'}</td><td>Approved</td><td>{`31/08/2026, 14:41:4${index + 2}`}</td><td>{`Approved at Level ${index + 1}`}</td></tr>)}</DataTable></div></>
}
