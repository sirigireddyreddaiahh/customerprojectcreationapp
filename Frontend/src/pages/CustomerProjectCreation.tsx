import { useEffect, useMemo, useState } from 'react'
import type { DialogState } from '../components/dialogs/Dialog'
import { ApiError } from '../config/api'
import {
  projectService,
  type CreateProjectResponse,
  type Option,
  type ProjectMasterData,
  type ResponsibilityFailure,
  type ResponsibilityInput,
  type WorkforcePerson,
} from '../services/projectService'
import { GlassDropdown } from '../components/forms/GlassDropdown'
import './CustomerProjectCreation.css'

type Props = {
  kind: 'customer' | 'internal'
  onMessage: (state: DialogState) => void
  onCancel: () => void
  onCreated: (projectId: string) => void
}

type FormState = {
  contractingCompanyCode: string
  projectNature: string
  billability: string
  expenseBookingAllowed: string
  overtimeAllowed: string
  projectBillableDaily: string
  sowStatus: string
  projManagerExtId: string
  projectId: string
  projectName: string
  projectDescription: string
  buName: string
  costCenter: string
  profitCenter: string
  orgId: string
  customerGroupName: string
  customerCode: string
  customerName: string
  endCustomer: string
  paymentTerms: string
  projectCategory: string
  typeOfProject: string
  currency: string
  startDate: string
  endDate: string
  projectStage: string
}

type ResponsibilityState = {
  projectRoleId: string
  businessPartnerId: string
  businessPartnerName: string
  businessPartnerExternalId: string
  autoAssigned?: boolean
  isDefaultRole?: boolean
}

type ErrorState = Partial<Record<keyof FormState, string>> & {
  responsibilities?: string
  load?: string
}

const BLANK_RESPONSIBILITY: ResponsibilityState = {
  projectRoleId: '',
  businessPartnerId: '',
  businessPartnerName: '',
  businessPartnerExternalId: '',
}

// The customer-project workflow always requires these responsibility slots.
// Keep their order stable so the form mirrors the approved project template.
const DEFAULT_RESPONSIBILITIES: ResponsibilityState[] = [
  { ...BLANK_RESPONSIBILITY, projectRoleId: '0SAP_RL_007', isDefaultRole: true }, // BU Head
  { ...BLANK_RESPONSIBILITY, projectRoleId: '0SAP_RL_006', isDefaultRole: true }, // SBU Head
  { ...BLANK_RESPONSIBILITY, projectRoleId: '0SAP_RL_005', isDefaultRole: true }, // Delivery Manager
  { ...BLANK_RESPONSIBILITY, projectRoleId: 'YP_RL_0001', isDefaultRole: true }, // Project Manager
  { ...BLANK_RESPONSIBILITY, projectRoleId: 'ZSAP_RL_003', isDefaultRole: true }, // Project Accountant
  { ...BLANK_RESPONSIBILITY, projectRoleId: 'ZSAP_RL_002', isDefaultRole: true }, // Sales Head
  { ...BLANK_RESPONSIBILITY, projectRoleId: 'ZSAP_RL_001', isDefaultRole: true }, // PMO
]

const EMPTY_FORM: FormState = {
  contractingCompanyCode: '',
  projectNature: '',
  billability: '',
  expenseBookingAllowed: '',
  overtimeAllowed: '',
  projectBillableDaily: '',
  sowStatus: '',
  projManagerExtId: '',
  projectId: '',
  projectName: '',
  projectDescription: '',
  buName: '',
  costCenter: '',
  profitCenter: '',
  orgId: '',
  customerGroupName: '',
  customerCode: '',
  customerName: '',
  endCustomer: '',
  paymentTerms: '',
  projectCategory: '',
  typeOfProject: '',
  currency: '',
  startDate: '',
  endDate: '',
  projectStage: '',
}

const isCustomerRequired = (projectNature: string) => projectNature === 'COR'
const PROJECT_NATURE_OPTIONS = [
  { value: 'COR', label: 'COR - Cost of Revenue' },
  { value: 'SE', label: 'SE - Selling Expense' },
  { value: 'G&A', label: 'G&A - General & Administrative Expenses' },
]
const YES_NO_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
]
const SOW_STATUS_OPTIONS = [
  { value: 'Available', label: 'Available' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Not Available', label: 'Not Available' },
  { value: 'Renewed', label: 'Renewed' },
]
const TYPE_OF_PROJECT_OPTIONS = [
  { value: 'Capex', label: 'Capex Project' },
  { value: 'Fixed-Bid', label: 'Fixed Price / Milestone Based' },
  { value: 'Managed-TM', label: 'Managed Time & Material' },
  { value: 'Overhead', label: 'Overhead Project' },
  { value: 'Periodic', label: 'Recurring Billing (Periodic Billing)' },
  { value: 'TM', label: 'Time & Material' },
]
const PROJECT_BILLABLE_HOURS_OPTIONS = Array.from({ length: 5 }, (_, index) => {
  const value = String(index + 8)
  return { value, label: value }
})
const NON_COR_TYPE_OF_PROJECT_OPTIONS = TYPE_OF_PROJECT_OPTIONS.filter(option => option.value === 'Overhead' || option.value === 'Capex')
const formatOptionLabel = (option: Option) => {
  const code = option.code?.trim() || ''
  const name = option.name?.trim() || ''
  return name && code && name !== code ? `${name} - ${code}` : name || code
}

const mapOptions = (options: Option[]) =>
  options.map(option => ({ value: option.code, label: formatOptionLabel(option) }))

function formatFailureSummary(failures: ResponsibilityFailure[]) {
  if (!failures.length) return 'Responsibility assignment failed.'
  return failures
    .map(failure => `${failure.projectRoleName} (${failure.businessPartnerName}): ${failure.error}`)
    .join('\n')
}

function getCreateErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return 'Project creation failed in SAP. Responsibilities were not created. Please review the entered values and retry.'
  }

  const details = error.details
  if (details && typeof details === 'object' && 'errors' in details) {
    const validationErrors = (details as { errors?: unknown }).errors
    if (validationErrors && typeof validationErrors === 'object') {
      const messages = Object.values(validationErrors).filter(
        (message): message is string => typeof message === 'string' && message.trim().length > 0,
      )
      if (messages.length) return messages.join('\n')
    }
  }

  return error.message
}

export function CustomerProjectCreation({ kind, onMessage, onCancel, onCreated }: Props) {
  const heading = kind === 'customer' ? 'Create Customer Project' : 'Create Internal Project'
  const [masterData, setMasterData] = useState<ProjectMasterData | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [responsibilities, setResponsibilities] = useState<ResponsibilityState[]>(() =>
    DEFAULT_RESPONSIBILITIES.map(row => ({ ...row })),
  )
  const [errors, setErrors] = useState<ErrorState>({})
  const [customerOptions, setCustomerOptions] = useState<Array<{ value: string; label: string; name: string; codeLabel: string; customerGroup: string; customerGroupName: string }>>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [paymentTermsName, setPaymentTermsName] = useState('')
  const [paymentTermsLoading, setPaymentTermsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [masterDataLoading, setMasterDataLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [lastProjectId, setLastProjectId] = useState('')
  const [retryQueue, setRetryQueue] = useState<ResponsibilityInput[]>([])
  const [workforce, setWorkforce] = useState<WorkforcePerson[]>([])
  const [workforcePickerTarget, setWorkforcePickerTarget] = useState<number | 'project-manager' | 'customer' | null>(null)
  const [workforceSearch, setWorkforceSearch] = useState('')

  useEffect(() => {
    let mounted = true
    setMasterDataLoading(true)
    projectService
      .getMasterData()
      .then(data => {
        if (!mounted) return
        setMasterData(data)
        setForm(current => ({
          ...current,
          projectCategory: '',
          projectStage: data.defaults.projectStage || current.projectStage,
          projManagerExtId: data.defaults.projectManagerExtId || current.projManagerExtId,
          billability:
            data.defaults.billabilityByNature[current.projectNature] ||
            data.defaults.billabilityByNature.COR ||
            current.billability,
        }))
      })
      .catch(() => {
        if (!mounted) return
        setErrors({ load: 'Unable to load project master data. Please refresh and try again.' })
      })
      .finally(() => {
        if (!mounted) return
        setMasterDataLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [kind])

  useEffect(() => {
    if (!masterData) return

    if (!isCustomerRequired(form.projectNature)) {
      const nextBillability = masterData.defaults.billabilityByNature[form.projectNature] || 'Non-Billable'
      setForm(current => ({
        ...current,
        billability: nextBillability,
        customerGroupName: '',
        customerCode: '',
        customerName: '',
        endCustomer: '',
      }))
      setCustomerOptions([])
      return
    }

    const nextBillability = masterData.defaults.billabilityByNature.COR || 'Billable'
    setForm(current =>
      current.billability === nextBillability
        ? current
        : { ...current, billability: nextBillability },
    )
  }, [form.projectNature, masterData])

  useEffect(() => {
    if (!masterData) return
    if (!form.customerGroupName) {
      setCustomerOptions([])
      setCustomersLoading(false)
      return
    }

    let active = true
    setCustomersLoading(true)
    projectService.getCustomers({
      customerGroup: form.customerGroupName,
      costCenter: form.costCenter,
      profitCenter: form.profitCenter,
      projectNature: form.projectNature,
    }).then(response => {
      if (!active) return
      const fetchedOptions = response.customers.map(customer => ({
        value: customer.code,
        label: customer.name,
        codeLabel: customer.code,
        name: customer.name,
        customerGroup: customer.customerGroup,
        customerGroupName: customer.customerGroupName,
      }))
      setCustomerOptions(current => {
        const selected = current.find(option => option.value === form.customerCode) ||
          (form.customerCode
            ? {
                value: form.customerCode,
                label: form.customerName || form.customerCode,
                codeLabel: form.customerCode,
                name: form.customerName || form.customerCode,
                customerGroup: form.customerGroupName,
                customerGroupName: form.customerGroupName,
              }
            : null)
        if (selected && !fetchedOptions.some(option => option.value === selected.value)) {
          return [...fetchedOptions, selected]
        }
        return fetchedOptions
      })
      setCustomersLoading(false)
      setErrors(current => ({ ...current, customerCode: undefined }))
    }).catch(() => {
      if (!active) return
      setCustomersLoading(false)
      setErrors(current => ({
        ...current,
        customerCode: 'Unable to load current customers from SAP. Please try again.',
      }))
    })

    return () => {
      active = false
    }
  }, [form.customerGroupName, form.costCenter, form.profitCenter, form.projectNature, masterData])

  useEffect(() => {
    const customerCode = form.customerCode.trim()
    const companyCode = form.contractingCompanyCode.trim()
    if (!customerCode || !companyCode) {
      setForm(current => current.paymentTerms ? { ...current, paymentTerms: '' } : current)
      setPaymentTermsName('')
      setPaymentTermsLoading(false)
      setErrors(current => ({ ...current, paymentTerms: undefined }))
      return
    }

    let active = true
    setForm(current => current.paymentTerms ? { ...current, paymentTerms: '' } : current)
    setPaymentTermsName('')
    setPaymentTermsLoading(true)
    setErrors(current => ({ ...current, paymentTerms: undefined }))
    projectService.getPaymentTerms({ customerCode, companyCode })
      .then(result => {
        if (!active) return
        setForm(current => ({ ...current, paymentTerms: result.paymentTerms || '' }))
        setPaymentTermsName(result.paymentTermsName || '')
      })
      .catch(() => {
        if (!active) return
        setErrors(current => ({ ...current, paymentTerms: 'Unable to load Payment Terms from SAP.' }))
      })
      .finally(() => {
        if (active) setPaymentTermsLoading(false)
      })

    return () => {
      active = false
    }
  }, [form.customerCode, form.contractingCompanyCode])

  useEffect(() => {
    projectService
      .getWorkforce()
      .then(response => {
        setWorkforce(response.workforce || [])
      })
      .catch(() => {
        setWorkforce([])
      })
  }, [])

  useEffect(() => {
    const selectedManager = workforce.find(person => person.personExternalId === form.projManagerExtId)
    setResponsibilities(current =>
      current.map(row => {
        if (row.projectRoleId !== 'YP_RL_0001') return row
        return {
          ...row,
          businessPartnerId: selectedManager?.person || '',
          businessPartnerName: selectedManager?.personFullName || '',
          businessPartnerExternalId: selectedManager?.personExternalId || form.projManagerExtId,
          autoAssigned: Boolean(selectedManager?.person),
        }
      }),
    )
    setErrors(current => ({ ...current, responsibilities: undefined }))
  }, [form.projManagerExtId, workforce])

  useEffect(() => {
    const selectedBu = masterData?.profitCenterGroups.find(
      group => group.code.trim().toLowerCase() === form.buName.trim().toLowerCase(),
    )
    const buHeadPersonId = selectedBu?.buHeadPersonId?.trim() || ''
    const buHeadExternalId = selectedBu?.buHeadExternalId?.trim() || ''
    setResponsibilities(current => current.map(row => row.projectRoleId === '0SAP_RL_007'
      ? {
          ...row,
          businessPartnerId: buHeadPersonId,
          businessPartnerName: buHeadExternalId ? selectedBu?.buHead || '' : '',
          businessPartnerExternalId: buHeadExternalId,
          autoAssigned: Boolean(buHeadPersonId),
        }
      : row))
  }, [form.buName, masterData])

  useEffect(() => {
    const selectedSbu = masterData?.profitCenters.find(
      profitCenter => profitCenter.code.trim().toLowerCase() === form.profitCenter.trim().toLowerCase(),
    )
    const sbuHeadPersonId = selectedSbu?.sbuHeadPersonId?.trim() || ''
    const sbuHeadExternalId = selectedSbu?.sbuHeadExternalId?.trim() || ''

    setResponsibilities(current =>
      current.map(row => {
        if (row.projectRoleId !== '0SAP_RL_006') return row
        return {
          ...row,
          businessPartnerId: sbuHeadPersonId,
          businessPartnerName: sbuHeadExternalId ? selectedSbu?.sbuHead || '' : '',
          businessPartnerExternalId: sbuHeadExternalId,
          autoAssigned: Boolean(sbuHeadPersonId),
        }
      }),
    )
    setErrors(current => ({ ...current, responsibilities: undefined }))
  }, [form.profitCenter, masterData])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }

  const setNature = (value: string) => {
    update('projectNature', value)
    update('typeOfProject', '')
  }

  const setContractingCompany = (value: string) => {
    update('contractingCompanyCode', value)
    const selectedCompany = masterData?.companyCodes.find(company => company.code === value)
    update('currency', selectedCompany?.currency || '')
  }

  const setBuName = (value: string) => {
    update('buName', value)
    update('profitCenter', '')
    update('costCenter', '')
    update('orgId', '')
    const selectedBu = masterData?.profitCenterGroups.find(group => group.code === value)
    const buHeadPersonId = selectedBu?.buHeadPersonId?.trim() || ''
    const buHeadExternalId = selectedBu?.buHeadExternalId?.trim() || ''
    setResponsibilities(current => current.map(row => row.projectRoleId === '0SAP_RL_007'
      ? {
          ...row,
          businessPartnerId: buHeadPersonId,
          businessPartnerName: buHeadExternalId ? selectedBu?.buHead || '' : '',
          businessPartnerExternalId: buHeadExternalId,
          autoAssigned: Boolean(buHeadPersonId),
        }
      : row))
  }

  const setProfitCenter = (value: string) => {
    update('profitCenter', value)
    update('costCenter', '')
    update('orgId', '')
    const selectedSbu = masterData?.profitCenters.find(profitCenter => profitCenter.code === value)
    const sbuHeadPersonId = selectedSbu?.sbuHeadPersonId?.trim() || ''
    const sbuHeadExternalId = selectedSbu?.sbuHeadExternalId?.trim() || ''
    setResponsibilities(current =>
      current.map(row => row.projectRoleId === '0SAP_RL_006'
        ? {
            ...row,
            businessPartnerId: sbuHeadPersonId,
            businessPartnerName: sbuHeadExternalId ? selectedSbu?.sbuHead || '' : '',
            businessPartnerExternalId: sbuHeadExternalId,
            autoAssigned: Boolean(sbuHeadPersonId),
          }
        : row),
    )
  }

  const setCostCenter = (value: string) => {
    if (!masterData) return
    const selected = masterData.costCenters.find(costCenter => costCenter.code === value)
    if (!selected) {
      update('costCenter', value)
      update('profitCenter', '')
      update('orgId', '')
      return
    }

    update('costCenter', selected.code)
    const fallbackOrgId = masterData.orgIds[0]?.code || ''
    const orgId = selected.orgId || fallbackOrgId
    update('orgId', orgId)
    setErrors(current => ({
      ...current,
      costCenter: undefined,
      profitCenter: undefined,
      orgId: orgId
        ? undefined
        : `No Project Service Organization mapping was found for Cost Center ${selected.code}.`,
    }))
  }

  const setCustomerName = (value: string) => {
    const selected = customerOptions.find(option => option.value === value)
    update('customerName', selected?.name || '')
    if (selected) {
      update('customerCode', selected.value)
    } else {
      update('customerCode', '')
    }
  }

  const updateResponsibility = (index: number, key: keyof ResponsibilityState, value: string) => {
    setResponsibilities(current =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        if (key === 'projectRoleId') {
          return {
            ...row,
            projectRoleId: value,
            businessPartnerId: '',
            businessPartnerName: '',
            businessPartnerExternalId: '',
            autoAssigned: false,
          }
        }
        return { ...row, [key]: value }
      }),
    )
    setErrors(current => ({ ...current, responsibilities: undefined }))
  }

  const addResponsibility = () => {
    setResponsibilities(current => [...current, { ...BLANK_RESPONSIBILITY }])
    setErrors(current => ({ ...current, responsibilities: undefined }))
  }

  const removeResponsibility = (index: number) => {
    setResponsibilities(current => current.filter((_, rowIndex) => rowIndex !== index))
    setErrors(current => ({ ...current, responsibilities: undefined }))
  }

  const openWorkforcePopup = (index: number) => {
    if (!responsibilities[index]?.projectRoleId) {
      setErrors(current => ({
        ...current,
        responsibilities: 'Please select Role before choosing Business Partner.',
      }))
      return
    }
    setWorkforceSearch('')
    setWorkforcePickerTarget(index)
  }

  const openProjectManagerPopup = () => {
    setWorkforceSearch('')
    setWorkforcePickerTarget('project-manager')
  }

  const selectWorkforcePerson = (person: WorkforcePerson) => {
    if (workforcePickerTarget === null) return
    if (workforcePickerTarget === 'project-manager') {
      update('projManagerExtId', person.personExternalId)
      setWorkforcePickerTarget(null)
      return
    }
    setResponsibilities(current =>
      current.map((row, index) =>
        index === workforcePickerTarget
          ? {
              ...row,
              businessPartnerId: person.person,
              businessPartnerName: person.personFullName,
              businessPartnerExternalId: person.personExternalId,
              autoAssigned: false,
            }
          : row,
      ),
    )
    setWorkforcePickerTarget(null)
  }

  const validate = () => {
    const nextErrors: ErrorState = {}

    if (!form.contractingCompanyCode) nextErrors.contractingCompanyCode = 'Please select a Contracting Company Code.'
    if (!form.projectNature) nextErrors.projectNature = 'Please select a Project Nature.'
    if (!form.billability) nextErrors.billability = 'Please select a Billability.'
    if (!form.projManagerExtId) nextErrors.projManagerExtId = 'Project Manager Ext ID is required.'
    if (!form.projectName) nextErrors.projectName = 'Project Name is required.'
    if (!form.buName) nextErrors.buName = 'Please select a BU Name.'
    if (!form.costCenter) nextErrors.costCenter = 'Please select a Cost Center.'
    if (!form.profitCenter) nextErrors.profitCenter = 'Please select an SBU Name.'
    if (!form.orgId) nextErrors.orgId = 'Org ID is required.'
    if (!form.projectCategory) nextErrors.projectCategory = 'Project Category is required.'
    if (!form.currency) nextErrors.currency = 'Please select a Currency.'
    if (!form.startDate) nextErrors.startDate = 'Please select the Start Date.'
    if (!form.endDate) nextErrors.endDate = 'Please select the End Date.'

    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = 'End Date must be greater than or equal to Start Date.'
    }

    if (isCustomerRequired(form.projectNature)) {
      if (!form.customerCode) nextErrors.customerCode = 'Please select a Customer Code.'
      if (form.customerCode && form.customerName) {
        const matched = customerOptions.find(option => option.value === form.customerCode)
        if (matched && matched.name !== form.customerName) {
          nextErrors.customerCode = 'The selected Customer Code must belong to the selected Customer Group.'
        }
      }
    }

    const selectedResponsibilities = responsibilities.filter(
      responsibility => responsibility.projectRoleId || responsibility.businessPartnerId,
    )

    if (selectedResponsibilities.length === 0) {
      nextErrors.responsibilities = 'Please select at least one responsibility role.'
    }

    for (const responsibility of selectedResponsibilities) {
      if (!responsibility.projectRoleId || !responsibility.businessPartnerId) {
        nextErrors.responsibilities = 'Each selected responsibility must include both Role and Business Partner.'
        break
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const buildRequest = (): { project: any; responsibilities: ResponsibilityInput[] } => ({
    project: {
      YY1_ContractingCompan_Cpr: form.contractingCompanyCode,
      YY1_ProjectNature_Cpr: form.projectNature,
      YY1_Billability1_Cpr: form.billability,
      YY1_ExpenseBookingAllo_Cpr: form.expenseBookingAllowed,
      YY1_OvertimeAllowed_Cpr: form.overtimeAllowed,
      YY1_ProjectBillableDai_Cpr: form.projectBillableDaily,
      YY1_SOWStatus_Cpr: form.sowStatus,
      ProjManagerExtId: form.projManagerExtId,
      ProjectID: form.projectId,
      ProjectName: form.projectName,
      ProjectDesc: form.projectDescription,
      CostCenter: form.costCenter,
      ProfitCenter: form.profitCenter,
      YY1_BUName_Cpr: masterData?.profitCenterGroups.find(group => group.code === form.buName)?.name || form.buName,
      OrgID: form.orgId,
      YY1_CustomerGroupName_Cpr: form.customerGroupName,
      YY1_CustomerGroupName_CprT: form.customerGroupName,
      Customer: form.customerCode,
      CustomerName: form.customerName,
      YY1_EndCustomer_Cpr: form.endCustomer,
      YY1_Paymentterms_Cpr: form.paymentTerms,
      YY1_ProjectCategory_Cpr: form.projectCategory,
      YY1_TypeofProject_Cpr: form.typeOfProject,
      Currency: form.currency,
      StartDate: form.startDate,
      EndDate: form.endDate,
      ProjectStage: form.projectStage,
    },
    responsibilities: responsibilities
      .filter(row => row.projectRoleId && row.businessPartnerId)
      .map(row => ({
        projectRoleId: row.projectRoleId,
        businessPartnerId: row.businessPartnerId,
        businessPartnerName: row.businessPartnerName || row.businessPartnerId,
      })),
  })

  const handleCreateResponse = (result: CreateProjectResponse, proceed: boolean) => {
    setLastProjectId(result.projectId)

    if (result.status === 'success') {
      setRetryQueue([])
      setForm({
        ...EMPTY_FORM,
        projectStage: masterData?.defaults.projectStage || '',
        projManagerExtId: masterData?.defaults.projectManagerExtId || '',
        billability: masterData?.defaults.billabilityByNature.COR || '',
      })
      setResponsibilities(DEFAULT_RESPONSIBILITIES.map(row => ({ ...row })))
      setErrors({})
      setCustomerOptions([])
      setPaymentTermsName('')
      setRetrying(false)
      if (proceed) onCreated(result.projectId)
      else onMessage({ type: 'success', title: 'Project created', message: `Created project ID: ${result.projectId}`, copyText: result.projectId })
      return
    }

    const failed = result.failedResponsibilities || []
    setRetryQueue(
      failed.map(item => ({
        projectRoleId: item.projectRoleId,
        businessPartnerId: item.businessPartnerId,
        businessPartnerName: item.businessPartnerName,
      })),
    )

    onMessage({
      type: 'warning',
      title: `Project ${result.projectId} created with partial completion`,
      message: `Project creation succeeded, but some responsibilities failed.\n\n${formatFailureSummary(failed)}`,
    })
  }

  const submit = async (proceed = true) => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const payload = buildRequest()
      const result = await projectService.create(payload)
      handleCreateResponse(result, proceed)
    } catch (error) {
      onMessage({
        type: 'error',
        title: 'Project creation failed',
        message: getCreateErrorMessage(error),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const retryResponsibilities = async () => {
    if (!lastProjectId || retryQueue.length === 0) return
    setRetrying(true)
    try {
      await projectService.retryResponsibilities(lastProjectId, retryQueue)
      setRetryQueue([])
      onMessage({
        type: 'success',
        title: `Responsibilities assigned for project ${lastProjectId}`,
        message: 'Previously failed responsibility assignments were retried successfully.',
      })
    } catch {
      onMessage({
        type: 'error',
        title: `Retry failed for project ${lastProjectId}`,
        message: 'Responsibility retry failed. Please check backend logs and SAP response details.',
      })
    } finally {
      setRetrying(false)
    }
  }

  const filteredProfitCenters = useMemo(
    () => (masterData?.profitCenters || []).filter(
      profitCenter => profitCenter.standardHierarchy.trim().toLowerCase() === form.buName.trim().toLowerCase(),
    ),
    [form.buName, masterData],
  )
  const filteredCostCenters = useMemo(
    () => (masterData?.costCenters || []).filter(costCenter => costCenter.profitCenter === form.profitCenter),
    [form.profitCenter, masterData],
  )
  const roleOptions = masterData?.roles || []
  const selectedProjectManager = workforce.find(person => person.personExternalId === form.projManagerExtId)
  const projectManagerDisplay = selectedProjectManager
    ? `${selectedProjectManager.personFullName} - ${selectedProjectManager.personExternalId}`
    : form.projManagerExtId
  const filteredWorkforce = workforce.filter(person => {
    const keyword = workforceSearch.trim().toLowerCase()
    if (!keyword) return true
    return (
      person.person.toLowerCase().includes(keyword) ||
      person.personFullName.toLowerCase().includes(keyword) ||
      person.personExternalId.toLowerCase().includes(keyword) ||
      person.defaultEmailAddress.toLowerCase().includes(keyword)
    )
  })

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{heading}</h1>
        </div>
      </div>

      <div className="creation-primary-sections">
      <section className="card project-section tone-ice project-foundation-section">
        <div className="section-head">
          <h2>Project Foundation</h2>
        </div>
        {errors.load && <p className="field-error project-screen-error">{errors.load}</p>}

        <div className="project-form-grid">
          <Field
            label="Project ID"
            value={form.projectId || 'System-generated on creation'}
            onChange={() => undefined}
            readOnly
            autoGenerated
          />

          <Field
            label="Project Name"
            required
            value={form.projectName}
            onChange={value => update('projectName', value)}
            error={errors.projectName}
            disabled={masterDataLoading}
          />

          <Field
            label="Project Nature"
            required
            value={form.projectNature}
            onChange={setNature}
            options={PROJECT_NATURE_OPTIONS}
            error={errors.projectNature}
            disabled={masterDataLoading}
            allowManual
          />

          <Field
            label="Billability"
            required
            value={form.billability}
            onChange={value => update('billability', value)}
            options={mapOptions(masterData?.billability || [])}
            error={errors.billability}
            disabled={masterDataLoading || !isCustomerRequired(form.projectNature)}
            allowManual
          />

          <div className="field project-field business-partner-selector">
            <label>
              Project Manager <span className="required">*</span>
            </label>
            <button
              type="button"
              className="business-partner-trigger"
              onClick={openProjectManagerPopup}
            >
              <span>{projectManagerDisplay || 'Select Project Manager'}</span>
            </button>
            {errors.projManagerExtId && <span className="field-error">{errors.projManagerExtId}</span>}
          </div>

          <Field
            label="Project Category"
            required
            value={form.projectCategory}
            onChange={value => update('projectCategory', value)}
            options={(masterData?.projectCategories || []).map(category => ({
              value: category.code,
              label: category.name?.trim() || category.code,
            }))}
            error={errors.projectCategory}
            disabled={masterDataLoading}
          />

          <Field
            label="Type of Project"
            value={form.typeOfProject}
            onChange={value => update('typeOfProject', value)}
            options={form.projectNature === 'COR' ? TYPE_OF_PROJECT_OPTIONS : form.projectNature ? NON_COR_TYPE_OF_PROJECT_OPTIONS : []}
            disabled={masterDataLoading}
          />

          <Field
            label="Project Start Date"
            required
            type="date"
            value={form.startDate}
            onChange={value => update('startDate', value)}
            error={errors.startDate}
            disabled={masterDataLoading}
          />

          <Field
            label="Project End Date"
            required
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={value => update('endDate', value)}
            error={errors.endDate}
            disabled={masterDataLoading}
          />

          <Field
            label="Stage"
            required
            value={form.projectStage}
            onChange={value => update('projectStage', value)}
            options={(masterData?.projectStages || []).map(stage => ({
              value: stage.code,
              label: stage.name?.trim() || stage.code,
            }))}
            error={errors.projectStage}
            disabled={masterDataLoading || !lastProjectId}
            allowManual
          />

          <Field
            label="SOW Status"
            value={form.sowStatus}
            onChange={value => update('sowStatus', value)}
            options={SOW_STATUS_OPTIONS}
            disabled={masterDataLoading}
          />

          <Field
            label="Expense Booking Allowed"
            value={form.expenseBookingAllowed}
            onChange={value => update('expenseBookingAllowed', value)}
            options={YES_NO_OPTIONS}
            disabled={masterDataLoading}
          />

          <Field
            label="Overtime Allowed"
            value={form.overtimeAllowed}
            onChange={value => update('overtimeAllowed', value)}
            options={YES_NO_OPTIONS}
            disabled={masterDataLoading}
          />

          <Field
            label="Project Billable Daily Hours"
            value={form.projectBillableDaily}
            onChange={value => update('projectBillableDaily', value)}
            options={PROJECT_BILLABLE_HOURS_OPTIONS}
            searchPlaceholder="Search or enter hours (8–12)..."
            disabled={masterDataLoading}
          />

          <Field
            label="Payment Terms"
            value={form.paymentTerms
              ? paymentTermsName ? `${form.paymentTerms} - ${paymentTermsName}` : form.paymentTerms
              : ''}
            onChange={() => undefined}
            error={errors.paymentTerms}
            disabled={masterDataLoading || paymentTermsLoading || !form.customerCode || !form.contractingCompanyCode}
            readOnly
          />

          <Field
            label="End Customer"
            value={form.endCustomer}
            onChange={value => update('endCustomer', value)}
            error={errors.endCustomer}
            disabled={masterDataLoading}
          />

        </div>
      </section>

      <section className="card project-section tone-mint organization-costing-section">
        <div className="section-head">
          <h2>Organization and Costing</h2>
        </div>

        <div className="project-form-grid">

          <Field
            label="Contracting Company Code"
            required
            value={form.contractingCompanyCode}
            onChange={setContractingCompany}
            options={(masterData?.companyCodes || [])
              .slice()
              .sort((first, second) => first.code.localeCompare(second.code, undefined, { numeric: true }))
              .map(company => ({
                value: company.code,
                label: company.name?.trim() && company.name !== company.code
                  ? `${company.code} - ${company.name.trim()}`
                  : company.code,
              }))}
            error={errors.contractingCompanyCode}
            disabled={masterDataLoading}
          />

          <Field
            label="BU Name"
            required
            value={form.buName}
            onChange={setBuName}
            options={mapOptions(masterData?.profitCenterGroups || [])}
            error={errors.buName}
            disabled={masterDataLoading}
          />

          <Field
            label="SBU Name"
            required
            value={form.profitCenter}
            onChange={setProfitCenter}
            options={filteredProfitCenters.map(profitCenter => ({
              value: profitCenter.code,
              label: profitCenter.name.trim(),
            }))}
            error={errors.profitCenter}
            disabled={masterDataLoading || !form.buName}
          />

          <div>
            <Field
              label="Cost Center"
              required
              value={form.costCenter}
              onChange={setCostCenter}
              options={filteredCostCenters.map(costCenter => ({
                value: costCenter.code,
                label: costCenter.name.trim(),
              }))}
              error={errors.costCenter || errors.orgId}
              disabled={masterDataLoading || !form.profitCenter}
            />
          </div>

          <Field
            label="Project Currency"
            required
            value={form.currency}
            onChange={value => update('currency', value)}
            options={mapOptions(masterData?.currencies || [])}
            error={errors.currency}
            disabled={masterDataLoading}
            allowManual
          />

        </div>
      </section>

      <section className="card project-section tone-blush customer-context-section">
        <div className="section-head">
          <h2>Customer Context</h2>
        </div>

        <div className="project-form-grid">
          <Field
            label="Customer Group Name"
            value={form.customerGroupName}
            onChange={value => {
              setForm(current => ({ ...current, customerGroupName: value, customerCode: '', customerName: '' }))
              setErrors(current => ({ ...current, customerGroupName: undefined, customerCode: undefined, customerName: undefined }))
            }}
            options={[
              { value: '', label: 'Select' },
              ...(masterData?.customerGroups || []).map(group => ({
                value: group.code,
                label: group.name?.trim() || group.code,
              })),
            ]}
            error={errors.customerGroupName}
            disabled={masterDataLoading}
          />

          <Field
            label="Customer Name"
            required={isCustomerRequired(form.projectNature)}
            value={form.customerCode}
            onChange={setCustomerName}
            options={customerOptions.map(option => ({ value: option.value, label: option.name }))}
            error={errors.customerName}
            disabled={masterDataLoading || !form.customerGroupName || (customersLoading && !form.customerCode)}
          />

          <Field
            label="Customer Code"
            required={isCustomerRequired(form.projectNature)}
            value={form.customerCode}
            onChange={() => undefined}
            error={errors.customerCode}
            disabled={masterDataLoading}
            readOnly
          />

        </div>
      </section>
      </div>

      <section className="card project-section tone-ice project-description-section">
        <div className="section-head">
          <h2>Project Description</h2>
        </div>
          <Field
            label="Project Description"
            value={form.projectDescription}
          onChange={value => update('projectDescription', value)}
          error={errors.projectDescription}
          disabled={masterDataLoading}
          textarea
        />
      </section>

      <section className="card project-section tone-lilac">
        <div className="section-head">
          <h2>Responsibilities</h2>
        </div>

        <div className="responsibility-column-headings" aria-hidden="true">
          <span>Role</span>
          <span>Business Partner</span>
          <span />
        </div>

        {responsibilities.map((row, index) => (
          <div className={`responsibility-row${row.autoAssigned ? ' auto-assigned' : ''}`} key={`role-row-${index}`}>
            {false ? (
              <Field
                label=""
                value={roleOptions.find(role => role.code === row.projectRoleId)?.name || row.projectRoleId}
                onChange={() => undefined}
                readOnly
              />
            ) : (
              <Field
                label=""
                value={row.projectRoleId}
                onChange={value => updateResponsibility(index, 'projectRoleId', value)}
                options={roleOptions.map(role => ({ value: role.code, label: role.name }))}
                disabled={masterDataLoading}
              />
            )}
            <div className="business-partner-selector responsibility-business-partner">
              <button
                type="button"
                className="business-partner-trigger"
                disabled={Boolean(row.autoAssigned)}
                onClick={() => openWorkforcePopup(index)}
                aria-label={`Select Business Partner for responsibility ${index + 1}`}
              >
                <span>
                  {row.businessPartnerName || 'Select Business Partner'}
                </span>
              </button>
            </div>
            {row.isDefaultRole ? (
              <button
                type="button"
                className="responsibility-remove-icon"
                onClick={() => removeResponsibility(index)}
                aria-label={`Remove responsibility ${index + 1}`}
                title="Remove role"
              >
                ×
              </button>
            ) : (
              <button
                type="button"
                className="responsibility-remove-icon"
                onClick={() => removeResponsibility(index)}
                aria-label={`Remove responsibility ${index + 1}`}
                title="Remove role"
              >
                ×
              </button>
            )}
          </div>
        ))}

        <div className="responsibility-add-row">
          <button type="button" className="secondary responsibility-add-button" onClick={addResponsibility} disabled={responsibilities.length >= DEFAULT_RESPONSIBILITIES.length}>
            <span aria-hidden="true">+</span> Add Role
          </button>
        </div>

        {errors.responsibilities && <p className="field-error project-screen-error">{errors.responsibilities}</p>}
      </section>

      <section className="card project-submit-bar">
        <div>
          <strong>Project ID:</strong> {lastProjectId || 'Generated after successful SAP project creation'}
        </div>
        <div className="project-submit-actions">
          {retryQueue.length > 0 && (
            <button className="secondary" type="button" onClick={retryResponsibilities} disabled={retrying || submitting}>
              {retrying ? 'Retrying Responsibilities...' : 'Retry Responsibility Assignment'}
            </button>
          )}
          <button className="primary" type="button" onClick={() => submit(false)} disabled={submitting || masterDataLoading}>
            {submitting ? 'Creating...' : 'Create'}
          </button>
          <button className="secondary" type="button" onClick={onCancel} disabled={submitting}>Cancel</button>
        </div>
      </section>

      {workforcePickerTarget !== null && (
        <div className="workforce-modal-backdrop" role="presentation">
          <div
            className={`workforce-modal ${workforcePickerTarget === 'customer' ? '' : 'workforce-modal-compact'}`}
            role="dialog"
            aria-modal="true"
          >
            <div className="workforce-modal-header">
              <h3>{workforcePickerTarget === 'project-manager' ? 'Select Project Manager' : workforcePickerTarget === 'customer' ? 'Select Customer' : 'Select Business Partner'}</h3>
              <button type="button" className="text-button" onClick={() => setWorkforcePickerTarget(null)}>
                Close
              </button>
            </div>
            <input
              className="workforce-search"
              value={workforceSearch}
              onChange={event => setWorkforceSearch(event.target.value)}
              placeholder={workforcePickerTarget === 'customer' ? 'Search by customer name or code' : 'Search by name or employee ID'}
            />
            {workforcePickerTarget === 'customer' ? (
              <div className="workforce-list customer-picker-list">
                <div className="workforce-list-header customer-picker-header" aria-hidden="true">
                  <span>Customer</span><span>Code</span><span>Group</span>
                </div>
                {customerOptions.filter(option => {
                  const keyword = workforceSearch.trim().toLowerCase()
                  return !keyword || `${option.name} ${option.value}`.toLowerCase().includes(keyword)
                }).map(option => (
                  <button key={option.value} type="button" className="workforce-item customer-picker-item" onClick={() => {
                    update('customerCode', option.value)
                    update('customerName', option.name)
                    setWorkforcePickerTarget(null)
                  }}>
                    <strong>{option.name}</strong><span>{option.value}</span><span>{option.customerGroupName || '-'}</span>
                  </button>
                ))}
                {customersLoading && <div className="workforce-empty">Loading customers from SAP...</div>}
                {!customersLoading && !customerOptions.length && <div className="workforce-empty">No customers found for this group.</div>}
              </div>
            ) : <div className="workforce-list">
              <div className="workforce-list-header" aria-hidden="true">
                <span>Name</span>
                <span>Employee ID</span>
              </div>
              {filteredWorkforce.map(person => (
                <button
                  key={`${person.person}-${person.personExternalId}`}
                  type="button"
                  className="workforce-item"
                  onClick={() => selectWorkforcePerson(person)}
                >
                  <strong>{person.personFullName || person.person}</strong>
                  <span>{person.personExternalId || '-'}</span>
                </button>
              ))}
              {!filteredWorkforce.length && (
                <div className="workforce-empty">No workforce records found.</div>
              )}
            </div>}
          </div>
        </div>
      )}
    </>
  )
}

type FieldOption = {
  value: string
  label: string
}

type FieldProps = {
  label?: string
  value: string
  onChange: (value: string) => void
  onOpen?: () => void
  options?: FieldOption[]
  type?: string
  inputMode?: 'numeric'
  pattern?: string
  maxLength?: number
  required?: boolean
  error?: string
  disabled?: boolean
  readOnly?: boolean
  textarea?: boolean
  min?: string
  max?: string
  allowManual?: boolean
  autoGenerated?: boolean
  searchPlaceholder?: string
}

function Field({
  label,
  value,
  onChange,
  onOpen,
  options,
  type = 'text',
  inputMode,
  pattern,
  maxLength,
  required,
  error,
  disabled,
  readOnly,
  textarea,
  min,
  max,
  allowManual: _allowManual,
  autoGenerated,
  searchPlaceholder,
}: FieldProps) {
  return (
    <div className={`field project-field ${autoGenerated ? 'project-auto-generated' : ''}`}>
      {label && (
        <label>
          {label} {required && <span className="required">*</span>}
        </label>
      )}
      {textarea ? (
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          readOnly={readOnly}
          rows={3}
        />
      ) : onOpen ? (
        <button type="button" className="business-partner-trigger" onClick={onOpen} disabled={disabled || readOnly}>
          <span>{value || 'Select'}</span>
        </button>
      ) : options ? (
        <GlassDropdown
          value={value}
          onChange={onChange}
          options={options}
          placeholder="Select"
          searchPlaceholder={searchPlaceholder}
          disabled={disabled || readOnly}
          searchable
        />
      ) : (
        <input
          type={type}
          inputMode={inputMode}
          pattern={pattern}
          maxLength={maxLength}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          readOnly={readOnly}
          min={min}
          max={max}
        />
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
