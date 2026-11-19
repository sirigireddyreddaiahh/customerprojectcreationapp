function hasValue(value) {
	return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
}

function parseDateValue(value) {
	if (!hasValue(value)) return null
	const sapDateMatch = String(value).match(/^\/Date\((\d+)\)\/$/)
	if (sapDateMatch) return Number(sapDateMatch[1])
	const parsed = Date.parse(String(value))
	if (Number.isNaN(parsed)) return null
	return parsed
}

const ALLOWED_ROLE_CODES = new Set([
	'0SAP_RL_007',
	'0SAP_RL_006',
	'0SAP_RL_005',
	'YP_RL_0001',
	'ZSAP_RL_003',
	'ZSAP_RL_002',
	'ZSAP_RL_001',
])

export function validateCustomerLookup(payload) {
	return { valid: true, errors: {} }
}

export function validateProjectCreateRequest(payload) {
	const errors = {}

	if (!payload || typeof payload !== 'object') {
		return { valid: false, errors: { request: 'Payload must be a valid object.' } }
	}

	const project = payload.project || {}
	const responsibilities = Array.isArray(payload.responsibilities) ? payload.responsibilities : []

	if (!hasValue(project.YY1_ContractingCompan_Cpr)) {
		errors.YY1_ContractingCompan_Cpr = 'Please select a Contracting Company Code.'
	}
	if (!hasValue(project.YY1_ProjectNature_Cpr)) {
		errors.YY1_ProjectNature_Cpr = 'Please select a Project Nature.'
	}
	if (!hasValue(project.YY1_Billability1_Cpr)) {
		errors.YY1_Billability1_Cpr = 'Please select a Billability.'
	}
	if (!hasValue(project.ProjManagerExtId)) {
		errors.ProjManagerExtId = 'Project Manager Ext ID is required.'
	}
	if (!hasValue(project.ProjectName)) {
		errors.ProjectName = 'Project Name is required.'
	}
	if (!hasValue(project.CostCenter)) {
		errors.CostCenter = 'Please select a Cost Center.'
	}
	if (!hasValue(project.ProfitCenter)) {
		errors.ProfitCenter = 'Please select an SBU Name.'
	}
	if (!hasValue(project.OrgID)) {
		errors.OrgID = 'Org ID is required.'
	}
	if (!hasValue(project.YY1_ProjectCategory_Cpr)) {
		errors.YY1_ProjectCategory_Cpr = 'Project Category is required.'
	}
	if (!hasValue(project.Currency)) {
		errors.Currency = 'Please select a Currency.'
	}
	if (!hasValue(project.StartDate)) {
		errors.StartDate = 'Please select the Start Date.'
	}
	if (!hasValue(project.EndDate)) {
		errors.EndDate = 'Please select the End Date.'
	}
	const startDateMs = parseDateValue(project.StartDate)
	const endDateMs = parseDateValue(project.EndDate)
	if (startDateMs !== null && endDateMs !== null && endDateMs < startDateMs) {
		errors.EndDate = 'End Date must be greater than or equal to Start Date.'
	}

	if (project.YY1_ProjectNature_Cpr === 'COR') {
		if (!hasValue(project.Customer)) {
			errors.Customer = 'Please select a Customer Code.'
		}
	}

	if (responsibilities.length === 0) {
		errors.responsibilities = 'Please select at least one responsibility role.'
	}
	responsibilities.forEach((item, index) => {
		if (!hasValue(item.projectRoleId) || !hasValue(item.businessPartnerId)) {
			errors[`responsibilities.${index}`] =
				'Each selected responsibility must include both Role and Business Partner.'
			return
		}
		if (!ALLOWED_ROLE_CODES.has(item.projectRoleId)) {
			errors[`responsibilities.${index}`] =
				'Only predefined responsibility roles are allowed.'
			return
		}
	})

	return { valid: Object.keys(errors).length === 0, errors }
}

export function validateRetryResponsibilitiesRequest(payload) {
	const errors = {}
	if (!hasValue(payload.projectId)) {
		errors.projectId = 'ProjectID is required for retry.'
	}
	if (!Array.isArray(payload.responsibilities) || payload.responsibilities.length === 0) {
		errors.responsibilities = 'At least one failed responsibility is required for retry.'
	}
	if (Array.isArray(payload.responsibilities) && payload.responsibilities.length > 7) {
		errors.responsibilities = 'You can retry up to seven responsibility roles.'
	}
	return { valid: Object.keys(errors).length === 0, errors }
}

export function validateWorkPackageCreateRequest(payload) {
	if (!payload || typeof payload !== 'object') {
		return { valid: false, errors: { request: 'Payload must be a valid object.' } }
	}

	const errors = {}
	if (!hasValue(payload.projectId)) errors.projectId = 'Project ID is required.'
	if (!['resource', 'service'].includes(payload.type)) errors.type = 'Select a work package type.'
	if (!hasValue(payload.workPackageName)) errors.workPackageName = 'Work package name is required.'
	if (!hasValue(payload.startDate)) errors.startDate = 'Start date is required.'
	if (!hasValue(payload.endDate)) errors.endDate = 'End date is required.'
	const startDateMs = parseDateValue(payload.startDate)
	const endDateMs = parseDateValue(payload.endDate)
	if (startDateMs !== null && endDateMs !== null && endDateMs < startDateMs) {
		errors.endDate = 'End date must be greater than or equal to Start date.'
	}

	if (payload.type === 'service') {
		if (!hasValue(payload.unitId)) errors.unitId = 'Unit ID is required for a service-based work package.'
		if (hasValue(payload.unitQuantity) && (!Number.isFinite(Number(payload.unitQuantity)) || Number(payload.unitQuantity) <= 0)) {
			errors.unitQuantity = 'Unit quantity must be greater than zero when provided.'
		}
	}

	return { valid: Object.keys(errors).length === 0, errors }
}

export function validateDemandCreateRequest(payload) {
	if (!payload || typeof payload !== 'object') return { valid: false, errors: { request: 'Payload must be a valid object.' } }
	const errors = {}
	const copyingExisting = payload.copyExisting === true
	if (!hasValue(payload.projectId)) errors.projectId = 'Project ID is required.'
	if (!hasValue(payload.workPackageId)) errors.workPackageId = 'Work Package ID is required.'
	if (!hasValue(payload.workPackageName)) errors.workPackageName = 'Work Package Name is required.'
	if (!['team', 'additional', 'expense'].includes(payload.type)) errors.type = 'Select a demand type.'
	if (!hasValue(payload.resourceId)) errors.resourceId = 'Resource ID is required.'
	if (!copyingExisting && (payload.type === 'team' || payload.type === 'additional')) {
		if (!hasValue(payload.effort) || Number(payload.effort) <= 0) errors.effort = 'Effort must be greater than zero.'
	}
	if (!copyingExisting && payload.type === 'team') {
		if (!hasValue(payload.deliveryServiceOrg)) errors.deliveryServiceOrg = 'Delivery Service Organization is required.'
		if (!hasValue(payload.expenseRevenue)) errors.expenseRevenue = 'Expense Revenue is required.'
		if (!hasValue(payload.billingControlCategory)) errors.billingControlCategory = 'Billing Control Category is required.'
	}
	if (!copyingExisting && payload.type === 'expense' && (!hasValue(payload.expenseCost) || Number(payload.expenseCost) <= 0)) errors.expenseCost = 'Expense Cost must be greater than zero.'
	return { valid: Object.keys(errors).length === 0, errors }
}
