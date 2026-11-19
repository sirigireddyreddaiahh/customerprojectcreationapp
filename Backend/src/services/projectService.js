import { sapProjectIntegration } from '../integrations/sapProjectIntegration.js'

const DEFAULT_COMPANY_CODES = [
	{ code: 'IN101', name: 'IN101' },
	{ code: 'ICS-IN', name: 'ICS-IN' },
]

const DEFAULT_CUSTOMER_GROUPS = [
	{ code: 'ENT', name: 'Enterprise' },
	{ code: 'SMB', name: 'SMB' },
]

const DEFAULT_PROJECT_CATEGORIES = [
	{ code: 'ADMS', name: 'Application Development, Maintenance & Support' },
	{ code: 'AMS', name: 'AMS – Application Management Services' },
	{ code: 'CS', name: 'Cloud Services' },
	{ code: 'DTP', name: 'Digital Transformation Projects' },
	{ code: 'IMS', name: 'Infrastructure Management Services (IMS)' },
	{ code: 'PD', name: 'Product Development' },
	{ code: 'QA', name: 'Testing / QA Services' },
]

const DEFAULT_PROJECT_STAGES = [
	{ code: 'P001', name: 'In Planning' },
	{ code: 'P002', name: 'In Execution' },
]

const DEFAULT_ORG_IDS = [{ code: 'IN101', name: 'IN101' }]

const ROLES = [
	{ code: '0SAP_RL_007', name: 'BU Head' },
	{ code: '0SAP_RL_006', name: 'SBU Head' },
	{ code: '0SAP_RL_005', name: 'Delivery Manager' },
	{ code: 'YP_RL_0001', name: 'Project Manager' },
	{ code: 'ZSAP_RL_003', name: 'Project Accountant' },
	{ code: 'ZSAP_RL_002', name: 'Sales Head' },
	{ code: 'ZSAP_RL_001', name: 'PMO' },
]

const CACHE_TTL_MS = Number(process.env.MASTER_DATA_CACHE_TTL_MS || 10 * 60 * 1000)
const inMemoryCache = new Map()
const workPackageIdCache = new Map()
const workPackageBatchQueues = new Map()

async function withWorkPackageBatchQueue(projectId, operation) {
	const previous = workPackageBatchQueues.get(projectId) || Promise.resolve()
	let release
	const current = new Promise(resolve => { release = resolve })
	const queued = previous.then(() => current)
	workPackageBatchQueues.set(projectId, queued)
	await previous
	try {
		return await operation()
	} finally {
		release()
		if (workPackageBatchQueues.get(projectId) === queued) workPackageBatchQueues.delete(projectId)
	}
}

function readJsonEnv(name, fallback) {
	const raw = process.env[name]
	if (!raw) return fallback
	try {
		return JSON.parse(raw)
	} catch {
		return fallback
	}
}

function getCached(key) {
	const entry = inMemoryCache.get(key)
	if (!entry) return null
	if (Date.now() > entry.expiresAt) {
		inMemoryCache.delete(key)
		return null
	}
	return entry.value
}

function setCached(key, value, ttl = CACHE_TTL_MS) {
	inMemoryCache.set(key, { value, expiresAt: Date.now() + ttl })
	return value
}

function toProjectDate(dateText) {
	if (!dateText) return ''
	if (/^\/Date\(\d+\)\/$/.test(dateText)) return dateText
	const parsedMs = Date.parse(`${dateText}T00:00:00Z`)
	if (Number.isNaN(parsedMs)) return dateText
	return `/Date(${parsedMs})/`
}

function normalizeTeamEffortForSap(resourceId, effort) {
	const value = String(effort ?? '').trim()
	if (String(resourceId || '').trim().toUpperCase() !== 'T002') return value
	const numericEffort = Number(value)
	if (value === '' || !Number.isFinite(numericEffort) || !Number.isInteger(numericEffort) || numericEffort <= 0) {
		throw new Error('Effort for role T002 must be a positive whole number of hours.')
	}
	return String(numericEffort)
}

async function resolveSapProjectNatureCode(value) {
	const requested = String(value || '').trim()
	if (!requested) return requested
	const options = await sapProjectIntegration.getProjectNatures().catch(() => [])
	const normalized = requested.toLowerCase()
	const exact = options.find(option =>
		String(option.code || '').trim().toLowerCase() === normalized ||
		String(option.name || '').trim().toLowerCase() === normalized,
	)
	if (exact) return exact.code

	if (['g&a', 'ga', 'gna', 'g-a'].includes(normalized)) {
		const generalAdmin = options.find(option =>
			String(option.code || '').trim().toUpperCase() === 'G-A' ||
			/general\s*(?:&|and)?\s*administrative/i.test(String(option.name || '')),
		)
		if (generalAdmin) return generalAdmin.code
		if (!options.length) return 'G-A'
	}
	return requested
}

function formatSapDate(dateValue) {
	const value = String(dateValue || '').trim()
	const match = value.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/)
	if (!match) return value
	const date = new Date(Number(match[1]))
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function getBillingPlanItemKey(uri) {
	let value = String(uri || '')
	try { value = decodeURIComponent(value) } catch {}
	const match = value.match(/(?:\(|,)BillingPlanItem=(?:'((?:''|[^'])*)'|([^,)\s]+))/i)
	return (match?.[1] || match?.[2] || '').replace(/''/g, "'")
}

function normalizeBillingPlanItemUsage(value) {
	const raw = String(value || '').trim()
	const normalized = raw.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ')
	if (!raw || ['t&m', 'time and expenses', 'time and expenses t&m', 'fixed price', 'periodic service', 'usage based', 'ps01', 'ps02', 'ps06', 'ps07'].includes(normalized)) return ''
	if (['payment on account', '1'].includes(normalized)) return '1'
	if (['down payment request', '4'].includes(normalized)) return '4'
	if (['usage based billing', 'usage-based billing', '3'].includes(normalized)) return '3'
	throw new Error(`Unsupported billing plan item usage '${raw}'. Use blank, 1 (payment on account), 3 (usage-based billing), or 4 (down payment request).`)
}

function buildRolePayload(projectId, role, roleMaster) {
	const roleInfo = roleMaster.find(item => item.code === role.projectRoleId)
	return {
		ProjectID: projectId,
		ProjectRoleID: role.projectRoleId,
		ProjectRoleName: roleInfo?.name || role.projectRoleId,
		BusinessPartnerID: role.businessPartnerId,
		BusinessPartnerName: role.businessPartnerName || role.businessPartnerId,
	}
}

async function resolveCostCenterAndProfitCenter(costCenterCode, profitCenterCode) {
	const costCenters = await sapProjectIntegration.getCostCenters()
	const normalizedCostCenterCode = String(costCenterCode || '').trim()
	const normalizedProfitCenterCode = String(profitCenterCode || '').trim()
	const selectedCostCenter = costCenters.find(item => String(item.code || '').trim() === normalizedCostCenterCode)
	if (!selectedCostCenter) {
		throw new Error('Selected Cost Center is invalid.')
	}

	const derivedProfitCenter = selectedCostCenter.profitCenter
	if (!derivedProfitCenter || String(derivedProfitCenter).trim() !== normalizedProfitCenterCode) {
		throw new Error('SBU Name (Profit Center) does not match selected Cost Center mapping.')
	}

	// Resolve against the complete, already-mapped Profit Center master data.
	// The single-record OData lookup can return an empty collection on SAP even
	// when the Profit Center is present in the paginated master-data response.
	const profitCenters = await sapProjectIntegration.getProfitCenters()
	const profitCenter = profitCenters.find(
		item => String(item.code || '').trim().toLowerCase() === String(derivedProfitCenter).trim().toLowerCase(),
	)
	if (!profitCenter) {
		throw new Error('Unable to load Profit Center details for selected Cost Center.')
	}

	return {
		costCenter: selectedCostCenter,
		profitCenter,
	}
}

function getServiceOrgMapping(costCenterCode) {
	const mapping = readJsonEnv('SERVICE_ORG_MAPPING', {})
	const mapped = mapping?.[costCenterCode]
	const strictMode = process.env.REQUIRE_SERVICE_ORG_MAPPING === 'true'
	if (strictMode && !mapped?.serviceOrganization) {
		const error = new Error(
			`Missing Service Organization mapping for selected Cost Center (${costCenterCode}).`,
		)
		error.code = 'service-org-missing'
		throw error
	}
	return {
		serviceOrganization: mapped?.serviceOrganization || '',
		salesOrganization: mapped?.salesOrganization || '',
	}
}

function getConfiguredDefaults() {
	const defaults = readJsonEnv('PROJECT_DEFAULTS', {})
	return {
		projectCategory: defaults.projectCategory || 'C',
		projectStage: defaults.projectStage || 'P001',
		projectManagerExtId: defaults.projectManagerExtId || '',
		serviceOrganization: defaults.serviceOrganization || '',
		confidential: defaults.confidential || 'N',
		useProjectBilling: defaults.useProjectBilling || 'X',
		restrictTimePosting: defaults.restrictTimePosting || 'Y',
		billabilityByNature: {
			COR: defaults.billabilityByNature?.COR || 'Billable',
			SE: defaults.billabilityByNature?.SE || 'Non-Billable',
			'G&A': defaults.billabilityByNature?.['G&A'] || 'Non-Billable',
		},
	}
}

function normalizeUniqueByCode(items) {
	const seen = new Set()
	return items.filter(item => {
		if (!item?.code || seen.has(item.code)) return false
		seen.add(item.code)
		return true
	})
}

function resolveProjectManagerExtId(project, defaults) {
	return (
		project.ProjManagerExtId ||
		project.projManagerExtId ||
		project.ProjectManagerExtId ||
		project.projectManagerExtId ||
		defaults.projectManagerExtId ||
		''
	)
}

export async function getMasterData() {
	const cached = getCached('master-data')
	if (cached) return cached

	const [companyCodesResult, costCentersResult, profitCentersResult, serviceOrgCostCentersResult, serviceOrgTextsResult, customersResult, currenciesResult, businessPartnersResult, workforceResult, projectNaturesResult, serviceUnitsResult, teamRolesResult, additionalResourceTypesResult, expenseTypesResult] = await Promise.allSettled([
		sapProjectIntegration.getCompanyCodes(),
		sapProjectIntegration.getCostCenters(),
		sapProjectIntegration.getProfitCenters(),
		sapProjectIntegration.getServiceOrganizationCostCenters(),
		sapProjectIntegration.getServiceOrganizationTexts(),
		sapProjectIntegration.getCustomerData(),
		sapProjectIntegration.getCurrencies(),
		sapProjectIntegration.getBusinessPartners(),
		sapProjectIntegration.getWorkforceDirectory(),
		sapProjectIntegration.getProjectNatures(),
		sapProjectIntegration.getServiceUnitOptions(),
		sapProjectIntegration.getTeamRoleOptions(),
		sapProjectIntegration.getAdditionalResourceOptions(),
		sapProjectIntegration.getExpenseTypeOptions(),
	])

	const rawCostCenters =
		costCentersResult.status === 'fulfilled'
			? costCentersResult.value
			: readJsonEnv('FALLBACK_COST_CENTERS', [])
	const serviceOrgCostCenters =
		serviceOrgCostCentersResult.status === 'fulfilled'
			? serviceOrgCostCentersResult.value
			: readJsonEnv('FALLBACK_SERVICE_ORGANIZATION_COST_CENTERS', [])
	const serviceOrgTexts = serviceOrgTextsResult.status === 'fulfilled' ? serviceOrgTextsResult.value : []
	const serviceOrgNamesByCode = new Map(
		serviceOrgTexts
			.filter(item => !item.language || item.language.toUpperCase() === 'EN')
			.map(item => [String(item.code).trim(), item.name]),
	)
	const customers =
		customersResult.status === 'fulfilled'
			? customersResult.value
			: readJsonEnv('FALLBACK_CUSTOMERS', [])
	const orgIdByCostCenter = new Map(
		serviceOrgCostCenters.map(mapping => [String(mapping.costCenter).trim(), String(mapping.orgId).trim()]),
	)
	const costCenters = rawCostCenters.map(costCenter => ({
		...costCenter,
		orgId: orgIdByCostCenter.get(String(costCenter.code || '').trim()) || '',
	}))
	const currencies =
		currenciesResult.status === 'fulfilled'
			? currenciesResult.value
			: readJsonEnv('FALLBACK_CURRENCIES', [{ code: 'INR', name: 'Indian Rupee' }])
	const profitCenters =
		profitCentersResult.status === 'fulfilled'
			? normalizeUniqueByCode(profitCentersResult.value)
			: readJsonEnv('FALLBACK_PROFIT_CENTERS', [])
	const workforce = workforceResult.status === 'fulfilled' ? workforceResult.value : []
	const serviceUnits = serviceUnitsResult.status === 'fulfilled'
		? normalizeUniqueByCode(serviceUnitsResult.value
			.filter(item => String(item.EngagementProjectResourceType || '').trim() === '0SRV')
			.map(item => ({ code: String(item.EngagementProjectResource || '').trim(), name: String(item.EngagementProjResourceText || item.EngagementProjectResource || '').trim() })))
		: []
	const teamRoles = teamRolesResult.status === 'fulfilled'
		? normalizeUniqueByCode(teamRolesResult.value
			.filter(item => String(item.EngagementProjectResourceType || '').trim() === '0ACT')
			.map(item => ({ code: String(item.EngagementProjectResource || '').trim(), name: String(item.EngagementProjResourceText || item.EngagementProjectResource || '').trim() })))
		: []
	const additionalResourceTypes = additionalResourceTypesResult.status === 'fulfilled'
		? normalizeUniqueByCode(additionalResourceTypesResult.value
			.filter(item => String(item.EngagementProjectResourceType || '').trim() === '0ADL')
			.map(item => ({ code: String(item.EngagementProjectResource || '').trim(), name: String(item.EngagementProjResourceText || item.EngagementProjectResource || '').trim() })))
		: []
	const expenseTypes = expenseTypesResult.status === 'fulfilled'
		? normalizeUniqueByCode(expenseTypesResult.value
			.filter(item => String(item.EngagementProjectResourceType || '').trim() === '0EXP')
			.map(item => ({ code: String(item.EngagementProjectResource || '').trim(), name: String(item.EngagementProjResourceText || item.EngagementProjectResource || '').trim() })))
		: []
	const verifiedBusinessPartnerCandidates = [
		...(businessPartnersResult.status === 'fulfilled' ? businessPartnersResult.value : []),
		...readJsonEnv('FALLBACK_BUSINESS_PARTNERS', []),
	]
	const businessPartnerCandidates = [
		...verifiedBusinessPartnerCandidates,
		...workforce.map(person => ({ id: person.person, name: person.personFullName })),
	]
	const businessPartners = [...new Map(
		businessPartnerCandidates
			.filter(partner => partner?.id)
			.map(partner => [String(partner.id).trim(), partner]),
	).values()]
	const workforceByPerson = new Map()
	const workforceByExternalId = new Map()
	for (const person of workforce) {
		const personId = String(person.person || '').trim().toLowerCase()
		if (personId) workforceByPerson.set(personId, person)
		const externalId = String(person.personExternalId || '').trim().toLowerCase()
		if (externalId) workforceByExternalId.set(externalId, person)
	}
	const personIdFromProfitCenterUser = value => String(value || '').trim().toLowerCase().replace(/^cb/i, '').replace(/^0+/, '')
	const profitCentersWithHeads = profitCenters.map(profitCenter => {
		const sbuHeadPersonId = personIdFromProfitCenterUser(profitCenter.sbuHeadUserId)
		const sbuHeadPerson = workforceByPerson.get(sbuHeadPersonId)
		const buHeadIdentifier = String(profitCenter.buHeadEmployeeId || '').trim().toLowerCase()
		const buHeadPerson = workforceByExternalId.get(buHeadIdentifier) ||
			workforceByPerson.get(personIdFromProfitCenterUser(buHeadIdentifier))
		return {
			...profitCenter,
			buHead: buHeadPerson?.personFullName || profitCenter.buHead || '',
			buHeadPersonId: buHeadPerson?.person || '',
			buHeadExternalId: buHeadPerson?.personExternalId || '',
			sbuHead: sbuHeadPerson?.personFullName || profitCenter.sbuHead || '',
			sbuHeadPersonId: sbuHeadPerson?.person || '',
			sbuHeadExternalId: sbuHeadPerson?.personExternalId || '',
		}
	})
	const profitCenterGroupsByCode = new Map()
	for (const profitCenter of profitCentersWithHeads) {
		if (!profitCenter.buName) continue
		const group = profitCenterGroupsByCode.get(profitCenter.buName) || {
			code: profitCenter.buName,
			name: profitCenter.buName,
			buHead: '',
			buHeadPersonId: '',
			buHeadEmployeeId: '',
			buHeadExternalId: '',
		}
		if (!group.buHeadPersonId && profitCenter.buHeadPersonId) {
			group.buHead = profitCenter.buHead
			group.buHeadPersonId = profitCenter.buHeadPersonId
			group.buHeadEmployeeId = profitCenter.buHeadEmployeeId
			group.buHeadExternalId = profitCenter.buHeadExternalId
		}
		profitCenterGroupsByCode.set(group.code, group)
	}
	const profitCenterGroups = [...profitCenterGroupsByCode.values()]

	const companyCodesFromSap = companyCodesResult.status === 'fulfilled'
		? normalizeUniqueByCode(companyCodesResult.value)
		: []
	const companyCodesFromCostCenters = normalizeUniqueByCode(
		DEFAULT_COMPANY_CODES.concat(costCenters
			.filter(costCenter => costCenter.companyCode)
			.map(costCenter => ({ code: costCenter.companyCode, name: costCenter.companyCode }))),
	)
	const orgIdsFromServiceOrganizationMappings = normalizeUniqueByCode([
		...serviceOrgTexts
			.filter(item => !item.language || item.language.toUpperCase() === 'EN')
			.map(item => ({ code: item.code, name: item.name })),
		...serviceOrgCostCenters.map(mapping => ({
			code: mapping.orgId,
			name: serviceOrgNamesByCode.get(String(mapping.orgId).trim()) || mapping.name || mapping.orgId,
		})),
	])
	const customerGroupsFromCustomerData = normalizeUniqueByCode(
		customers
			.filter(customer => customer.customerGroup)
			.map(customer => ({ code: customer.customerGroup, name: customer.customerGroupName || customer.customerGroup })),
	)

	const payload = {
		companyCodes: companyCodesFromSap.length ? companyCodesFromSap : companyCodesFromCostCenters,
		projectNatures: projectNaturesResult.status === 'fulfilled' && projectNaturesResult.value.length
			? normalizeUniqueByCode(projectNaturesResult.value)
			: [
			{ code: 'COR', name: 'Cost of Revenue' },
			{ code: 'SE', name: 'Selling Expense' },
			{ code: 'G-A', name: 'General & Administrative' },
			],
		billability: [
			{ code: 'Billable', name: 'Billable' },
			{ code: 'Non-Billable', name: 'Non-Billable' },
		],
		customerGroups: customerGroupsFromCustomerData.length
			? customerGroupsFromCustomerData
			: readJsonEnv('CUSTOMER_GROUPS', DEFAULT_CUSTOMER_GROUPS),
		projectCategories: readJsonEnv('PROJECT_CATEGORIES', DEFAULT_PROJECT_CATEGORIES),
		currencies,
		projectStages: readJsonEnv('PROJECT_STAGES', DEFAULT_PROJECT_STAGES),
		costCenters,
		profitCenters: profitCentersWithHeads,
		profitCenterGroups,
		customers,
		orgIds: orgIdsFromServiceOrganizationMappings.length
			? orgIdsFromServiceOrganizationMappings
			: readJsonEnv('ORG_IDS', DEFAULT_ORG_IDS),
		roles: ROLES,
		businessPartners,
		serviceUnits,
		teamRoles,
		additionalResourceTypes,
		expenseTypes,
		inExecutionStageCode: process.env.IN_EXECUTION_STAGE_CODE || 'P002',
		defaults: getConfiguredDefaults(),
	}

	return setCached('master-data', payload)
}

export async function getCustomersForProject({ customerGroup, costCenter, profitCenter, projectNature }) {
	const customers = await sapProjectIntegration.getCustomerData()
	const filtered = customerGroup
		? customers.filter(customer => customer.customerGroup === customerGroup)
		: [...customers.reduce((byCode, customer) => {
			const current = byCode.get(customer.code)
			if (!current || (!current.customerGroup && customer.customerGroup)) {
				byCode.set(customer.code, customer)
			}
			return byCode
		}, new Map()).values()]
	const profitCenterData = profitCenter
		? await sapProjectIntegration.getProfitCenterByCode(profitCenter)
		: null
	return {
		customers: filtered,
		profitCenter: profitCenterData,
	}
}

export async function getCustomerPaymentTerms({ customerCode, companyCode }) {
	return sapProjectIntegration.getCustomerPaymentTerms({ customerCode, companyCode })
}

export async function getWorkforceDirectory() {
	const workforce = await sapProjectIntegration.getWorkforceDirectory()
	return { workforce }
}

export async function createWorkPackage(payload) {
	const projectId = String(payload.projectId || '').trim()
	let workPackageId = workPackageIdCache.get(projectId)
	if (!workPackageId) {
		workPackageId = await sapProjectIntegration.generateWorkPackageId(projectId)
	}

	const prefix = `${projectId}.1.`
	const sequence = Number(String(workPackageId).slice(prefix.length))
	if (Number.isInteger(sequence) && sequence > 0) {
		workPackageIdCache.set(projectId, `${prefix}${sequence + 1}`)
	}

	const workPackagePayload = {
		ProjectID: projectId,
		WorkPackageID: workPackageId,
		WorkPackageName: payload.workPackageName,
		Description: payload.description,
		WPStartDate: toProjectDate(payload.startDate),
		WPEndDate: toProjectDate(payload.endDate),
	}

	if (payload.type === 'service') {
		workPackagePayload.WorkPackageType = 'U'
		workPackagePayload.UnitId = payload.unitId
		if (payload.unitQuantity !== undefined && payload.unitQuantity !== null && String(payload.unitQuantity).trim() !== '') {
			workPackagePayload.UnitQuantity = String(payload.unitQuantity)
		}
	}

	const result = await sapProjectIntegration.createWorkPackage(workPackagePayload)
	return {
		status: 'success',
		message: 'Work package created successfully.',
		workPackageId: result.workPackageId,
	}
}

export async function createWorkPackagesBatch(payload) {
	const projectId = String(payload?.projectId || '').trim()
	const rows = Array.isArray(payload?.workPackages) ? payload.workPackages : []
	if (!projectId || !rows.length) throw new Error('Project ID and at least one work package are required.')
	return withWorkPackageBatchQueue(projectId, async () => {
	let nextId = workPackageIdCache.get(projectId) || await sapProjectIntegration.generateWorkPackageId(projectId)
	const prefix = `${projectId}.1.`
	const prepared = rows.map(row => {
		const sequence = Number(String(nextId).slice(prefix.length))
		if (!Number.isInteger(sequence) || sequence <= 0) throw new Error('Unable to generate a Work Package ID for this project.')
		const workPackageId = nextId
		nextId = `${prefix}${sequence + 1}`
		const sapPayload = {
			ProjectID: projectId,
			WorkPackageID: workPackageId,
			WorkPackageName: String(row.workPackageName || '').trim(),
			Description: String(row.description || ''),
			WPStartDate: toProjectDate(row.startDate),
			WPEndDate: toProjectDate(row.endDate),
		}
		if (row.type === 'service') {
			sapPayload.WorkPackageType = 'U'
			sapPayload.UnitId = String(row.unitId || '').trim()
			sapPayload.UnitQuantity = String(row.unitQuantity || '').trim()
		}
		return sapPayload
	})
	workPackageIdCache.set(projectId, nextId)
	const results = new Array(prepared.length)
	// SAP serializes project-definition writes internally. Keep one batch active
	// per project to avoid concurrent requests failing with project-definition errors.
	const batchSize = 50
	const concurrency = 1
	const batches = Array.from({ length: Math.ceil(prepared.length / batchSize) }, (_, index) => ({
		start: index * batchSize,
		items: prepared.slice(index * batchSize, (index + 1) * batchSize),
	}))
	let nextBatch = 0
	let stopReason = ''
	await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
		while (nextBatch < batches.length) {
			const batch = batches[nextBatch++]
			if (stopReason) {
				batch.items.forEach((item, index) => { results[batch.start + index] = { status: 'notAttempted', reason: stopReason } })
				continue
			}
			try {
				const outcomes = await sapProjectIntegration.createWorkPackagesBatch(batch.items)
				batch.items.forEach((item, index) => {
					results[batch.start + index] = outcomes[index] || { status: 'unknown', reason: 'SAP did not return a result for this row; verify in SAP before retrying.' }
				})
				if (outcomes.some(outcome => outcome?.status === 'failed' && /unable to read details of project definition/i.test(outcome.reason || ''))) {
					stopReason = 'SAP could not read the project definition. Remaining rows were not sent.'
				}
			} catch (error) {
				const reason = error?.message || 'SAP did not return a result for this batch; verify in SAP before retrying.'
				batch.items.forEach((item, index) => { results[batch.start + index] = { status: 'unknown', reason, outcomeUncertain: true } })
				stopReason = 'The previous SAP batch could not be verified. Remaining rows were not sent.'
			}
		}
	}))
	const missingResponse = results.map((result, index) => result?.status === 'unknown' ? index : -1).filter(index => index >= 0)
	if (missingResponse.length) {
		try {
			const existingIds = new Set(await sapProjectIntegration.getExistingWorkPackageIds({ projectId, workPackageIds: missingResponse.map(index => prepared[index].WorkPackageID) }))
			for (const index of missingResponse) {
				if (existingIds.has(prepared[index].WorkPackageID)) results[index] = { status: 'success', reason: '', rawStatus: 200 }
				else if (!results[index].outcomeUncertain) results[index] = { status: 'failed', reason: 'SAP confirmed this work package was not created. Correct the row and upload the failed results again.', rawStatus: 404 }
			}
		} catch (error) {
			for (const index of missingResponse) results[index] = { ...results[index], reason: `${results[index].reason} Verification lookup failed: ${error?.message || 'SAP lookup unavailable.'}` }
		}
	}
	return results.map((result, index) => ({ ...result, workPackageId: prepared[index].WorkPackageID }))
	})
}

export async function createWorkPackageWorkItem(payload) {
	const projectId = String(payload.projectId || '').trim()
	const workPackageId = String(payload.workPackageId || '').trim()
	const workPackageName = String(payload.workPackageName || '').trim()
	const workItem = String(payload.workItem || '').trim()
	if (!projectId || !workPackageId || !workPackageName || !workItem) throw new Error('Project, work package, and work item are required.')
	const assignedItems = await sapProjectIntegration.getWorkPackageWorkItems()
	const alreadyAssigned = assignedItems.some(item =>
		String(item.ProjectID || '').trim() === projectId &&
		String(item.WorkPackageID || '').trim() === workPackageId &&
		String(item.Workitem || item.WorkItem || '').trim() === workItem,
	)
	if (alreadyAssigned) return { status: 'success', message: 'Work item is already assigned.' }
	await sapProjectIntegration.createWorkPackageWorkItem({
		ProjectID: projectId,
		WorkPackageID: workPackageId,
		WorkPackageName: workPackageName,
		Workitem: workItem,
		Workitemname: String(payload.workItemName || '').trim(),
	})
	return { status: 'success', message: 'Work item assigned successfully.' }
}

export async function deleteWorkPackageWorkItem(payload) {
	const projectId = String(payload.projectId || '').trim()
	const workPackageId = String(payload.workPackageId || '').trim()
	const workPackageName = String(payload.workPackageName || '').trim()
	const workItem = String(payload.workItem || '').trim()
	if (!projectId || !workPackageId || !workPackageName || !workItem) throw new Error('Project, work package, work package name, and work item are required.')
	const assignedItems = await sapProjectIntegration.getWorkPackageWorkItems()
	const existing = assignedItems.find(item =>
		String(item.ProjectID || '').trim() === projectId &&
		String(item.WorkPackageID || '').trim() === workPackageId &&
		String(item.Workitem || item.WorkItem || '').trim() === workItem,
	)
	if (!existing) return { status: 'success', message: 'Work item is already unassigned.' }
	await sapProjectIntegration.deleteWorkPackageWorkItem({
		projectId,
		workPackageId,
		workPackageName: String(existing.WorkPackageName || workPackageName).trim(),
		workItem,
	})
	return { status: 'success', message: 'Work item unassigned successfully.' }
}

export async function updateWorkPackage(projectId, workPackageId, payload) {
	const sapPayload = {}
	if (Object.hasOwn(payload, 'name')) sapPayload.WorkPackageName = String(payload.name ?? '').trim()
	if (Object.hasOwn(payload, 'description')) sapPayload.Description = String(payload.description ?? '')
	if (Object.hasOwn(payload, 'startDate')) sapPayload.WPStartDate = toProjectDate(payload.startDate)
	if (Object.hasOwn(payload, 'endDate')) sapPayload.WPEndDate = toProjectDate(payload.endDate)
	if (Object.hasOwn(payload, 'unitId')) sapPayload.UnitId = String(payload.unitId ?? '').trim()
	if (Object.hasOwn(payload, 'unitQuantity')) sapPayload.UnitQuantity = String(payload.unitQuantity ?? '')
	return sapProjectIntegration.updateWorkPackage({
		projectId,
		workPackageId,
		workPackageName: payload.workPackageName,
		payload: sapPayload,
	})
}

export async function deleteWorkPackage(projectId, workPackageId, workPackageName) {
	const safeProjectId = String(projectId || '').trim()
	const safeWorkPackageId = String(workPackageId || '').trim()
	const safeWorkPackageName = String(workPackageName || '').trim()
	if (!safeProjectId || !safeWorkPackageId || !safeWorkPackageName) {
		throw new Error('Project ID, work package ID, and work package name are required.')
	}
	await sapProjectIntegration.deleteWorkPackage({
		projectId: safeProjectId,
		workPackageId: safeWorkPackageId,
		workPackageName: safeWorkPackageName,
	})
	return { status: 'success', message: 'Work package deleted successfully.' }
}

function toDemandSapPayload(payload) {
	const base = {
		ProjectID: payload.projectId,
		WorkPackageID: payload.workPackageId,
		WorkPackageName: payload.workPackageName,
		ResType: payload.type === 'team' ? '0ACT' : payload.type === 'additional' ? '0ADL' : '0EXP',
		ResourceId: payload.resourceId,
	}
	if (String(payload.requestedWorker || '').trim()) base.WorkforcePersonUserID = String(payload.requestedWorker).trim()

	if (payload.type === 'team') {
		const category = String(payload.billingControlCategory || '').trim().toLowerCase()
		const billingControlCategory = payload.workPackageType === 'service' || category.includes('non') ? 'NON_BILL' : ' '
		Object.assign(base, { Effort: normalizeTeamEffortForSap(payload.resourceId, payload.effort), Skills: payload.skills || '', DelvryServOrg: payload.deliveryServiceOrg, ExpenseRevenue: payload.expenseRevenue, BillingControlCategory: billingControlCategory })
		if (String(payload.workitem || '').trim()) base.Workitem = payload.workitem.trim()
	} else if (payload.type === 'additional') {
		const category = String(payload.billingControlCategory || '').trim().toLowerCase()
		const billingControlCategory = payload.workPackageType === 'service' || category.includes('non') ? 'NON_BILL' : ' '
		Object.assign(base, { Effort: String(payload.effort), DelvryServOrg: payload.deliveryServiceOrg, ExpenseRevenue: String(payload.expenseRevenue || '0'), BillingControlCategory: billingControlCategory })
		if (String(payload.unitOfMeasure || '').trim()) base.UnitOfMeasure = String(payload.unitOfMeasure).trim()
		if (String(payload.workitem || '').trim()) base.Workitem = payload.workitem.trim()
	} else {
		const category = String(payload.billingControlCategory || '').trim().toLowerCase()
		const billingControlCategory = payload.workPackageType === 'service' || category.includes('non') ? 'NON_BILL' : ' '
		Object.assign(base, { BillingControlCategory: billingControlCategory, ExpenseCost: String(payload.expenseCost || '0'), ExpenseRevenue: String(payload.expenseRevenue || '0') })
		if (String(payload.effort || '').trim()) base.Effort = String(payload.effort).trim()
	}
	return base
}


export async function createDemand(payload) {
	await sapProjectIntegration.createDemand(toDemandSapPayload(payload))
	return { status: 'success', message: 'Demand created successfully in SAP.' }
}

export async function createDemandsBatch(payload) {
	const projectId = String(payload?.projectId || '').trim()
	const rows = Array.isArray(payload?.demands) ? payload.demands : []
	if (!projectId || !rows.length) throw new Error('Project and at least one demand row are required.')
	const prepared = rows.map((row, index) => {
		const demand = {
			...row,
			projectId,
			workPackageId: String(row?.workPackageId || '').trim(),
			workPackageName: String(row?.workPackageName || '').trim(),
			workPackageType: String(row?.workPackageType || '').trim(),
		}
		if (!demand.workPackageId || !demand.workPackageName) throw new Error(`Row ${index + 1}: a valid Work Package ID is required.`)
		const type = String(demand.type || '').trim()
		if (!['team', 'additional', 'expense'].includes(type)) throw new Error(`Row ${index + 1}: choose Role, Additional Resource, or Expense.`)
		if (!String(demand.resourceId || '').trim()) throw new Error(`Row ${index + 1}: resource/service/expense type is required.`)
		if (type === 'team' && (!Number.isFinite(Number(demand.effort)) || Number(demand.effort) <= 0)) throw new Error(`Row ${index + 1}: planned effort must be greater than zero.`)
		if (type === 'additional' && (!Number.isFinite(Number(demand.effort)) || Number(demand.effort) <= 0)) throw new Error(`Row ${index + 1}: quantity must be greater than zero.`)
		if (type === 'expense' && ((String(demand.expenseCost || '').trim() && (!Number.isFinite(Number(demand.expenseCost)) || Number(demand.expenseCost) < 0)) || (String(demand.expenseRevenue || '').trim() && (!Number.isFinite(Number(demand.expenseRevenue)) || Number(demand.expenseRevenue) < 0)))) throw new Error(`Row ${index + 1}: optional expense cost and revenue must be zero or greater.`)
		if (type === 'team' && !String(demand.deliveryServiceOrg || '').trim()) throw new Error(`Row ${index + 1}: delivery organization is required for a Role.`)
		return toDemandSapPayload(demand)
	})
	const results = new Array(prepared.length)
	const batchSize = 50
	for (let offset = 0; offset < prepared.length; offset += batchSize) {
		const batch = prepared.slice(offset, offset + batchSize)
		try {
			const outcomes = await sapProjectIntegration.createDemandsBatch(batch)
			batch.forEach((item, index) => { results[offset + index] = outcomes[index] || { status: 'unknown', reason: 'SAP did not return a result for this demand row; verify in SAP before retrying.' } })
			if (outcomes.some(outcome => outcome?.status === 'unknown')) {
				for (let index = offset + batch.length; index < prepared.length; index += 1) results[index] = { status: 'notAttempted', reason: 'This row was not sent because the previous SAP batch could not be verified.' }
				break
			}
		} catch (error) {
			batch.forEach((_item, index) => { results[offset + index] = { status: 'unknown', reason: error?.message || 'SAP did not return a result for this batch; verify in SAP before retrying.' } })
			for (let index = offset + batch.length; index < prepared.length; index += 1) results[index] = { status: 'notAttempted', reason: 'This row was not sent because the previous SAP batch could not be verified.' }
			break
		}
	}
	return results
}

export async function getDemandCostRate(payload) {
	const projectId = String(payload.projectId || '').trim()
	if (!String(payload.companyCode || '').trim() && projectId) {
		const { project } = await getProjectWorkspace(projectId)
		return sapProjectIntegration.getDemandCostRate({ ...payload, companyCode: project.contractingCompanyCode })
	}
	return sapProjectIntegration.getDemandCostRate(payload)
}

export async function getDemandRevenueRates(payload) {
	return sapProjectIntegration.getDemandRevenueRates(payload)
}

export async function saveDemandRevenueRate(payload) {
	return sapProjectIntegration.saveDemandRevenueRate(payload)
}

export async function getCurrencyExchangeRates(payload) {
	return sapProjectIntegration.getCurrencyExchangeRates(payload)
}

export async function getProjectServicePrices(payload) {
	return sapProjectIntegration.getProjectServicePrices(payload)
}

export async function updateProjectServicePrice(payload) {
	return sapProjectIntegration.updateProjectServicePrice(payload)
}

export async function updateDemand(payload) {
	const original = payload?.original || {}
	const type = payload?.type
	const resourceType = type === 'team' ? '0ACT' : type === 'additional' ? '0ADL' : type === 'expense' ? '0EXP' : ''
	if (!resourceType) throw new Error('Select a valid demand type.')
	const originalKeys = {
		ProjectID: String(original.projectId || payload.projectId || '').trim(),
		WorkPackageID: String(original.workPackageId || payload.workPackageId || '').trim(),
		WorkPackageName: String(original.workPackageName || payload.workPackageName || '').trim(),
		ResType: resourceType,
		ResourceId: String(original.resourceId || original.roleName || '').trim(),
		Workitem: String(original.workitem || '').trim(),
		DelvryServOrg: String(original.deliveryServiceOrg || '').trim(),
	}
	if (!originalKeys.ProjectID || !originalKeys.WorkPackageID || !originalKeys.WorkPackageName || !originalKeys.ResourceId) throw new Error('The original SAP demand keys are incomplete; reload this work package before updating it.')
	const sapPayload = {}
	const fields = payload.fields || {}
	for (const [field, sapField] of Object.entries({ resourceId: 'ResourceId', workitem: 'Workitem', deliveryServiceOrg: 'DelvryServOrg', effort: 'Effort', skills: 'Skills', expenseRevenue: 'ExpenseRevenue', expenseCost: 'ExpenseCost' })) {
		if (!Object.hasOwn(fields, field)) continue
		sapPayload[sapField] = field === 'effort' && type === 'team'
			? normalizeTeamEffortForSap(fields.resourceId ?? originalKeys.ResourceId, fields.effort)
			: String(fields[field] ?? '')
	}
	// SAP validates T002 effort on any team patch, including when a row is
	// changed to T002. Re-send the unchanged value in SAP's whole-number format.
	const targetResourceId = String(fields.resourceId ?? originalKeys.ResourceId).trim().toUpperCase()
	if (type === 'team' && targetResourceId === 'T002' && !Object.hasOwn(fields, 'effort')) {
		sapPayload.Effort = normalizeTeamEffortForSap(targetResourceId, original.effort)
	}
	if (Object.hasOwn(fields, 'billingControlCategory')) {
		const category = String(fields.billingControlCategory || '').trim().toLowerCase()
		sapPayload.BillingControlCategory = category.includes('non') ? 'NON_BILL' : ' '
	}
	if (!Object.keys(sapPayload).length) throw new Error('No SAP-editable demand fields were provided.')
	await sapProjectIntegration.updateDemand({ original: originalKeys, payload: sapPayload })
	return { status: 'success', message: 'Demand updated successfully in SAP.' }
}

export async function deleteDemands({ type, keys }) {
	const resourceType = type === 'team' ? '0ACT' : type === 'additional' ? '0ADL' : type === 'expense' ? '0EXP' : ''
	if (!resourceType) throw new Error('Select a valid demand type.')
	if (!Array.isArray(keys) || keys.length === 0) throw new Error('Select at least one demand row to delete.')
	const normalizedKeys = keys.map(key => ({
		ProjectID: String(key?.projectId || '').trim(),
		WorkPackageID: String(key?.workPackageId || '').trim(),
		WorkPackageName: String(key?.workPackageName || '').trim(),
		ResType: resourceType,
		ResourceId: String(key?.resourceId || '').trim(),
		Workitem: String(key?.workitem || '').trim(),
		DelvryServOrg: String(key?.deliveryServiceOrg || '').trim(),
	}))
	if (normalizedKeys.some(key => !key.ProjectID || !key.WorkPackageID || !key.WorkPackageName || !key.ResourceId)) {
		throw new Error('One or more SAP demand keys are incomplete. Reload the work package and try again.')
	}
	const deletedKeys = []
	const failures = []
	for (const key of normalizedKeys) {
		try {
			await sapProjectIntegration.deleteDemand({ key })
			deletedKeys.push(key)
		} catch (error) {
			failures.push(error)
		}
	}
	if (failures.length) {
		const error = new Error(failures[0]?.message || 'Unable to delete one or more demand rows in SAP.')
		error.deletedKeys = deletedKeys
		throw error
	}
	return { status: 'success', deletedKeys }
}

const BILLING_TYPE_CONFIG = {
	fixed: { salesOrderItemCategory: 'PS01', material: 'P001', hasPlan: true, hasPlanAmount: true },
	timeAndMaterials: { salesOrderItemCategory: 'PS02', material: 'P002', hasPlan: true, hasPlanAmount: false },
	periodic: { salesOrderItemCategory: 'PS06', material: 'P003', hasPlan: true, hasPlanAmount: true },
	usageBased: { salesOrderItemCategory: 'PS07', material: 'P002', hasPlan: true, hasPlanAmount: false },
}

function toSapDateTime(value) {
	const text = String(value || '').trim()
	return text && !text.includes('T') ? `${text}T00:00:00` : text
}

export async function createBillingPlan(payload) {
	const config = BILLING_TYPE_CONFIG[payload.billingType]
	if (!config) throw new Error('Select a valid billing type.')
	const workPackageIds = [...new Set([...(Array.isArray(payload.workPackageIds) ? payload.workPackageIds : []), payload.workPackageId]
		.map(value => String(value || '').trim())
		.filter(Boolean))]
	if (!payload.projectId || !workPackageIds.length) throw new Error('A project and at least one work package are required.')

	const item = {
		SalesOrderItemCategory: config.salesOrderItemCategory,
		Material: config.material,
		ExpectedNetAmount: String(payload.expectedNetAmount),
		TransactionCurrency: payload.transactionCurrency || 'INR',
		SalesOrderItem: String(payload.salesOrderItem || '1'),
		UnderlyingPurchaseOrderItem: payload.underlyingPurchaseOrderItem || '',
		SalesOrderItemText: payload.salesOrderItemText || '',
		to_CustProjSlsOrdItemWorkPckg: workPackageIds.map(workPackageId => ({ WorkPackage: workPackageId })),
	}

	if (config.hasPlan) {
		const billingDate = String(payload.billingPlanBillingDate || new Date().toISOString().slice(0, 10)).slice(0, 10)
		const plan = {
			BillingPlanBillingDate: toProjectDate(billingDate),
			BillingPlanItemDescription: payload.billingPlanItemDescription || '',
			BillingPlanItemUsage: normalizeBillingPlanItemUsage(payload.billingPlanItemUsage),
		}
		if (config.hasPlanAmount) {
			plan.BillingPlanAmount = String(payload.billingPlanAmount)
			plan.TransactionCurrency = payload.transactionCurrency || 'INR'
		}
		if (payload.billingType === 'periodic') {
			const serviceStartDate = toProjectDate(payload.billingPlanServiceStartDate || `${billingDate.slice(0, 7)}-01`)
			const serviceEndDate = toProjectDate(payload.billingPlanServiceEndDate || billingDate)
			plan.BillingPlanServiceStartDate = serviceStartDate
			plan.BillingPlanServiceEndDate = serviceEndDate
			if (!config.hasPlanAmount) {
				plan.TransactionCurrency = payload.transactionCurrency || 'INR'
			}
		}
		console.log('[DEBUG] Billing plan payload:', JSON.stringify(plan, null, 2))
		item.to_CustProjSOIBillgPlnItm = [plan]
	}

	if (payload.salesOrderId && payload.createSalesOrderItem) {
		await sapProjectIntegration.createCustomerProjectSalesOrderItem({
			projectId: payload.projectId,
			salesOrderId: payload.salesOrderId,
			item,
		})
		return { status: 'success', message: 'Billing item added to the existing sales order.' }
	}
	if (payload.salesOrderId && config.hasPlan) {
		await sapProjectIntegration.createCustomerProjectBillingPlanItem({
			projectId: payload.projectId,
			salesOrderId: payload.salesOrderId,
			salesOrderItem: payload.salesOrderItem,
			plan: item.to_CustProjSOIBillgPlnItm[0],
		})
		return { status: 'success', message: 'Billing plan item added to the existing sales order item.' }
	}

	await sapProjectIntegration.createCustomerProjectSalesOrder({
		CustomerProject: payload.projectId,
		CustomerPurchaseOrderDate: toSapDateTime(payload.customerPurchaseOrderDate),
		PaymentMethod: payload.paymentMethod || 'F',
		to_CustProjSlsOrdItem: [item],
	})
	return { status: 'success', message: 'Billing plan created successfully.' }
}

export async function updateBillingPlanItem(payload) {
	const projectId = String(payload.projectId || '').trim()
	const salesOrderItem = String(payload.salesOrderItem || '').trim()
	const billingPlanItem = String(payload.billingPlanItem || getBillingPlanItemKey(payload.sapPlanUri) || '').trim()
	const billingDate = String(payload.billingPlanBillingDate || '').trim()
	if (!projectId) throw new Error('Project is required to update a billing plan item.')
	if (!salesOrderItem) throw new Error('Sales order item is required to update a billing plan item.')
	if (!billingPlanItem) throw new Error('Billing plan item key is missing from SAP billing details.')
	if (!billingDate) throw new Error('Billing due date is required.')
	const plan = {
		BillingPlanBillingDate: toSapDateTime(billingDate),
		TransactionCurrency: String(payload.transactionCurrency || 'INR'),
		BillingPlanItemDescription: String(payload.billingPlanItemDescription || ''),
		BillingPlanAmount: String(payload.billingPlanAmount ?? '0'),
	}
	const serviceStartDate = String(payload.billingPlanServiceStartDate || '').trim()
	const serviceEndDate = String(payload.billingPlanServiceEndDate || '').trim()
	if (serviceStartDate) plan.BillingPlanServiceStartDate = toSapDateTime(serviceStartDate)
	if (serviceEndDate) plan.BillingPlanServiceEndDate = toSapDateTime(serviceEndDate)
	await sapProjectIntegration.updateCustomerProjectBillingPlanItem({ projectId, salesOrderItem, billingPlanItem, plan })
	return { status: 'success', message: 'Billing due date updated successfully.' }
}

export async function deleteProjectBillingItem(projectId, salesOrderItem) {
	const safeProjectId = String(projectId || '').trim()
	const safeSalesOrderItem = String(salesOrderItem || '').trim()
	if (!safeProjectId || !safeSalesOrderItem) throw new Error('Project and billing item are required.')
	return sapProjectIntegration.deleteProjectBillingItem({ projectId: safeProjectId, salesOrderItem: safeSalesOrderItem })
}

export async function getProjectBilling(projectId) {
	if (!projectId) throw new Error('Project ID is required.')
	const [orders, profitCenters] = await Promise.all([
		sapProjectIntegration.getProjectBillingSalesOrders(projectId),
		sapProjectIntegration.getProfitCenters().catch(() => []),
	])
	const profitCenterNames = new Map(profitCenters.map(item => [String(item.code || '').trim(), String(item.name || '').trim()]))
	const typeNames = { PS01: 'Fixed Price', PS02: 'Time and Expenses (T&M)', PS06: 'Periodic Service', PS07: 'Usage Based' }
	const processStatusNames = { A: 'Open', B: 'In Progress', C: 'Completed' }
	const contracts = orders.flatMap(order => (order.__items || []).map((item, index) => {
		const workPackages = item.__workPackages || []
		const dueDates = item.__billingPlanItems || []
		const currency = item.TransactionCurrency || order.TransactionCurrency || 'INR'
		const profitCenterCode = String(item.ProfitCenter || order.ProfitCenter || '')
		const profitCenterName = String(item.ProfitCenterName || profitCenterNames.get(profitCenterCode.trim()) || '')
		return {
			id: String(item.SalesOrderItem || index + 1),
			salesOrderId: String(order.SalesOrder || ''),
			editable: ['PS02', 'PS07'].includes(String(item.SalesOrderItemCategory || '')),
			contractType: typeNames[item.SalesOrderItemCategory] || item.SalesOrderItemCategory || 'Billing Contract',
			product: item.Product || item.Material || item.ProductID || '',
			description: item.SalesOrderItemText || item.ProductDescription || item.Description || '',
			workPackages: workPackages.map(workPackage => ({ id: workPackage.WorkPackage || workPackage.WorkPackageID || '', name: workPackage.WorkPackageName || '' })),
			profitCenter: profitCenterName && profitCenterCode ? `${profitCenterName} (${profitCenterCode})` : profitCenterName || profitCenterCode,
			plannedRevenue: String(item.ExpectedNetAmount || item.NetAmount || ''),
			amountToBill: String(item.AmountToBill || item.ExpectedNetAmount || item.NetAmount || ''),
			ssp: String(item.SSP || item.StandaloneSellingPrice || item.ServicePriceList || item.ServicePriceListName || ''),
			amountCap: String(item.AmountCap || item.SalesOrderItemAmountCap || item.AmountLimit || ''),
			capNotificationThreshold: String(item.CapNotificationThreshold || item.CapNotificationThresholdPercent || item.CapNotificationThresholdPercentage || ''),
			wbsElement: String(item.WBSElementExternalID || item.WBSElement || item.WbsElement || item.WorkBreakdownStructureElement || ''),
			customerMaterial: String(item.CustomerMaterial || item.MaterialByCustomer || ''),
			customerReference: String(item.PurchaseOrderByCustomer || item.CustomerReference || item.CustomerPurchaseOrder || order.PurchaseOrderByCustomer || order.CustomerPurchaseOrder || order.CustomerReference || ''),
			currency,
			status: processStatusNames[String(item.SDProcessStatus || '').trim().toUpperCase()] || item.RejectionReasonName || item.RejectionReasonDescription || item.SalesDocumentRjcnReasonName || item.SalesDocumentRjcnReason || item.ProcessingStatusName || item.ProcessingStatus || 'Open',
			dueDates: dueDates.map(plan => ({
				date: formatSapDate(plan.BillingPlanBillingDate),
				itemUsage: normalizeBillingPlanItemUsage(plan.BillingPlanItemUsage),
				note: plan.BillingPlanItemDescription || '',
				processingStatus: ({ A: 'Open', E: 'Billing requested', C: 'Invoiced' })[String(plan.BillingPlanRelatedBillgStatus || '').trim().toUpperCase()] || plan.ProcessingStatusName || plan.ProcessingStatus || 'Open',
				amount: String(plan.BillingPlanAmount || ''),
				currency: plan.TransactionCurrency || currency,
				serviceStart: formatSapDate(plan.BillingPlanServiceStartDate),
				serviceEnd: formatSapDate(plan.BillingPlanServiceEndDate),
				billingPlanItem: String(plan.BillingPlanItem || plan.BillingPlanItemID || getBillingPlanItemKey(plan.__metadata?.uri)),
				sapPlanUri: plan.__metadata?.uri || '',
			})),
		}
	})).sort((left, right) => String(left.wbsElement || left.id).localeCompare(String(right.wbsElement || right.id), undefined, { numeric: true, sensitivity: 'base' }))
	return {
		customerReference: orders[0]?.PurchaseOrderByCustomer || orders[0]?.CustomerPurchaseOrder || orders[0]?.CustomerReference || '',
		customerReferenceDate: formatSapDate(orders[0]?.CustomerPurchaseOrderDate),
		salesOrder: orders[0]?.SalesOrder || '',
		amountToBill: contracts.reduce((total, contract) => total + (Number(contract.amountToBill) || 0), 0),
		currency: contracts.find(contract => contract.currency)?.currency || 'INR',
		contracts,
	}
}

function resolvePersonName(workforce, value) {
	const raw = String(value || '').trim()
	if (!raw) return ''
	const match = workforce.find(person =>
		String(person.person || '').trim() === raw ||
		String(person.personExternalId || '').trim() === raw ||
		String(person.defaultEmailAddress || '').trim() === raw ||
		String(person.personFullName || '').trim() === raw,
	)
	return match?.personFullName || raw
}

function resolveOrgName(orgOptions, value) {
	const raw = String(value || '').trim()
	if (!raw) return ''
	const match = orgOptions.find(option =>
		String(option.code || '').trim() === raw ||
		String(option.name || '').trim() === raw,
	)
	return match?.name || raw
}

export async function getWorkPackageDemandDetails({ projectId, workPackageId, workPackageName, workPackageType }) {
	const isServiceWorkPackage = ['U', 'SERVICE'].includes(String(workPackageType || '').trim().toUpperCase())
	const [resourceDemands, staffingRecords, masterData, workforceResponse, serviceRecords, workItemRecords] = await Promise.all([
		sapProjectIntegration.getWorkPackageResourceDemands({ workPackageId }),
		sapProjectIntegration.getWorkPackageStaffingData({ workPackageId }).catch(error => {
			console.warn(`[SAP] Unable to load staffing data for work package ${workPackageId}: ${error?.message || error}`)
			return []
		}),
		getMasterData().catch(() => null),
		getWorkforceDirectory().catch(() => ({ workforce: [] })),
		isServiceWorkPackage
			? sapProjectIntegration.getWorkPackageServices({ workPackageId })
			: Promise.resolve([]),
		sapProjectIntegration.getWorkPackageWorkItems().catch(error => {
			console.warn(`[SAP] Unable to load work items for work package ${workPackageId}: ${error?.message || error}`)
			return []
		}),
	])
	const workforce = workforceResponse?.workforce || []
	const orgNames = masterData?.orgIds || []
	const serviceRecord = serviceRecords.find(item => String(item.WorkPackage || '') === String(workPackageId))
	const allWorkItems = workItemRecords
		.map(item => {
			const workItemGroupField = Object.entries(item).find(([key, value]) =>
				value != null && (/^workitemgroup/i.test(key.replace(/[^a-z]/gi, '')) || /^workitemgrp(name|text)?$/i.test(key.replace(/[^a-z]/gi, '')) || /^groupname$/i.test(key.replace(/[^a-z]/gi, ''))))
			const workItemGroupValue = item.Workitemgroup || item.WorkItemGroup || item.WorkItemGroupName || item.WorkitemGroupName || item.WorkItemGroupText || item.WorkitemGroupText || item.WorkItemGrp || item.WorkitemGrp || item.WorkItemCategory || item.WorkitemCategory || item.GroupName || workItemGroupField?.[1] || ''
			return ({
			projectId: item.ProjectID || '',
			workPackageId: item.WorkPackageID || '',
			workPackageName: item.WorkPackageName || '',
			workItem: item.Workitem || item.WorkItem || '',
			workItemName: item.Workitemname || item.WorkItemName || '',
			workItemGroup: typeof workItemGroupValue === 'string' ? workItemGroupValue : String(workItemGroupValue?.Name || workItemGroupValue?.name || workItemGroupValue?.Value || ''),
		})})
	const workItems = allWorkItems.filter(item =>
		String(item.projectId).trim() === String(projectId).trim() &&
		String(item.workPackageId).trim() === String(workPackageId).trim())
	const availableWorkItems = [...new Map(allWorkItems.filter(item => item.workItem).map(item => [item.workItem, item])).values()]
	const staffingByDemand = new Map()
	for (const record of staffingRecords) {
		const key = JSON.stringify([
			String(record.WorkPackageID || ''),
			String(record.ResType || ''),
			String(record.ResourceId || ''),
			String(record.StaffedEmpDelvryServOrg || ''),
		])
		const employeeId = String(record.StaffedEmployee || '').trim()
		const employeeName = String(record.StaffedEmployeeName || employeeId).trim()
		if (!employeeName) continue
		const employees = staffingByDemand.get(key) || new Map()
		const employeeKey = employeeId || employeeName
		const employee = employees.get(employeeKey) || {
			id: employeeId,
			name: employeeName,
			effort: 0,
			allocation: '',
			billing: record.BillingControlCategory || '',
		}
		employee.effort += Number(record.StaffedEffort) || 0
		employees.set(employeeKey, employee)
		staffingByDemand.set(key, employees)
	}

	return {
		workItems,
		availableWorkItems,
		team: resourceDemands.map(item => {
			const staffingKey = JSON.stringify([
				String(item.WorkPackage || ''),
				String(item.EngagementProjectResourceType || ''),
				String(item.EngagementProjectResource || ''),
				String(item.DeliveryOrganization || ''),
			])
			const staffedResources = [...(staffingByDemand.get(staffingKey)?.values() || [])].map(employee => ({
				...employee,
				effort: String(employee.effort),
			}))
			const staffedEffort = staffedResources.reduce((total, resource) => total + (Number(resource.effort) || 0), 0)
			const plannedQuantity = Number(item.PlndEffortQty || 0)
			const demandCost = Number(item.PlndCostAmt || 0)
			const demandRevenue = Number(item.PlndRevnAmt || 0)
			const costCurrency = item.CostCurrency || item.ExpenseCostCurrency || item.PlndCostAmtCurrency || item.PlndCostAmtCrcy || item.CostCrcy || item.Currency || ''
			const revenueCurrency = item.RevenueCurrency || item.ExpenseRevenueCurrency || item.PlndRevnAmtCurrency || item.PlndRevnAmtCrcy || item.RevenueCrcy || item.Currency || ''
			const costPerHour = item.CostPerHour ?? item.CostRate ?? item.DemandCostRate
			const revenuePerHour = item.RevenuePerHour ?? item.RevenueRate ?? item.DemandRevenueRate ?? item.DemandRevRate
			const deliveredOrg = item.DelvryServOrg || item.DeliveryOrganization || item.DeliveryServiceOrg || ''
			const requestedUserId = item.WorkforcePersonUserID || item.RequestedWorkerUserID || item.RequestedWorker || item.EmploymentInternalID || ''
			const roleName = item.ResourceRoleName || item.RoleName || item.EngagementProjectResourceRole || item.ResourceTypeName || item.ResourceRole || item.Role || item.EngagementProjectResource || 'Resource-Time'

		return ({
			projectId,
			workPackageId,
			workPackageName,
			type: item.EngagementProjectResourceType === '0ADL' ? 'additional' : item.EngagementProjectResourceType === '0EXP' ? 'expense' : 'team',
			resourceId: item.EngagementProjectResource || '',
			roleName: String(roleName || '').trim() || 'Resource-Time',
			resourceDemandId: item.ID || item.PlanLineItemUUID || '',
			sapDeleteKeys: [{
				projectId: item.ProjectID || projectId,
				workPackageId: item.WorkPackageID || workPackageId,
				workPackageName: item.WorkPackageName || workPackageName,
				resType: item.ResType || item.EngagementProjectResourceType || '',
				resourceId: item.ResourceId || item.EngagementProjectResource || '',
				workitem: item.Workitem || item.WorkItem || '',
				deliveryServiceOrg: item.DelvryServOrg || item.DeliveryOrganization || item.DeliveryServiceOrg || '',
			}],
			resourceDemandStatus: '',
			effort: String(item.PlndEffortQty || ''),
			unitOfMeasure: item.UnitOfMeasure || '',
			currency: item.Currency || '',
			costCurrency,
			revenueCurrency,
			skills: item.Skills || '',
			deliveryServiceOrg: deliveredOrg,
			deliveryServiceOrgName: resolveOrgName(orgNames, deliveredOrg),
			expenseRevenue: String(item.PlndRevnAmt || ''),
			billingControlCategory: item.BillingControlCategory || '',
			workitem: item.Workitem || item.WorkItem || '',
			expenseCost: String(item.PlndCostAmt || ''),
			costPerHour: costPerHour != null && costPerHour !== ''
				? String(costPerHour)
				: plannedQuantity > 0 && Number.isFinite(demandCost) ? String(demandCost / plannedQuantity) : '',
			revenuePerHour: revenuePerHour != null && revenuePerHour !== ''
				? String(revenuePerHour)
				: plannedQuantity > 0 && Number.isFinite(demandRevenue) ? String(demandRevenue / plannedQuantity) : '',
			staffedResource: staffedResources.map(resource => resource.id).filter(Boolean).join(', '),
			staffedResourceName: staffedResources.map(resource => resource.name).join(', '),
			staffedEffort: String(staffedEffort),
			staffedResources,
			requestedWorker: requestedUserId,
			requestedWorkerName: resolvePersonName(workforce, requestedUserId),
		})}),
		expensesAvailable: true,
		serviceDetails: serviceRecord ? {
			service: serviceRecord.EntProjElmntDlvbrlTypeText || '',
			quantity: serviceRecord.EntProjElmntDlvbrlQuantity ?? null,
			unit: serviceRecord.EntProjElmntDlvbrlQuantityUnit || '',
			revenue: serviceRecord.EntProjElmntDlvbrlRevnAmount ?? null,
			currency: serviceRecord.EntProjElmntDlvbrlRevnCurrency || '',
		} : null,
	}
}

export async function updateProjectStage(projectId, projectStage) {
	await sapProjectIntegration.updateProjectStage(projectId, projectStage)
	return { status: 'success', message: 'Project stage updated successfully.', projectStage }
}

export async function updateProjectDetails(projectId, project) {
	const normalizedProjectId = String(projectId || '').trim()
	if (!normalizedProjectId) throw new Error('Project ID is required.')
	if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('Project update data is required.')
	const isYes = value => ['YES', 'Y', 'X', 'TRUE', '1'].includes(String(value ?? '').trim().toUpperCase())
	const projectNature = project.projectNature === undefined
		? undefined
		: await resolveSapProjectNatureCode(project.projectNature)
	const sapPayload = {
		ProjectName: project.name,
		ProjectDesc: project.description,
		ProjectStage: project.stage,
		YY1_ProjectCategory_Cpr: project.category,
		YY1_TypeofProject_Cpr: project.typeOfProject,
		OrgID: project.orgId,
		Currency: project.currency === undefined ? undefined : String(project.currency).split(' - ').at(-1).trim(),
		StartDate: project.startDate ? toProjectDate(project.startDate) : undefined,
		EndDate: project.endDate ? toProjectDate(project.endDate) : undefined,
		ProjManagerExtId: project.projectManagerExternalId,
		Customer: project.customerCode,
		YY1_EndCustomer_Cpr: project.endCustomer,
		YY1_Paymentterms_Cpr: project.paymentTerms,
		CostCenter: project.costCenter,
		ProfitCenter: project.profitCenter,
		Confidential: project.publicProject !== undefined
			? isYes(project.publicProject) ? 'N' : 'Y'
			: project.confidential === undefined ? undefined : isYes(project.confidential) ? 'Y' : 'N',
		RestrictTimePosting: project.restrictTimePosting === undefined ? undefined : isYes(project.restrictTimePosting) ? 'Y' : 'N',
		YY1_Billability1_Cpr: project.billability,
		YY1_ExpenseBookingAllo_Cpr: project.expenseBookingAllowed,
		YY1_OvertimeAllowed_Cpr: project.overtimeAllowed,
		YY1_ProjectBillableDai_Cpr: project.projectBillableDailyHours,
		YY1_SOWStatus_Cpr: project.sowStatus,
		YY1_ContractingCompan_Cpr: project.contractingCompanyCode,
		YY1_CustomerGroupName_Cpr: project.customerGroup,
		YY1_ProjectNature_Cpr: projectNature,
	}
	const requestedPayload = Object.fromEntries(Object.entries(sapPayload).filter(([, value]) => value !== undefined))
	if (!Object.keys(requestedPayload).length) throw new Error('No editable project fields were provided.')
	const currentProject = await sapProjectIntegration.getProjectForUpdate(normalizedProjectId)
	if (!currentProject) throw new Error(`Project ${normalizedProjectId} was not found in SAP.`)
	const comparable = (value, property) => {
		if (value === undefined || value === null) return ''
		const dateMatch = String(value).match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/)
		if (dateMatch) return `date:${dateMatch[1]}`
		const normalized = String(value).trim()
		return property === 'Currency' ? normalized.split(' - ').at(-1).trim().toUpperCase() : normalized
	}
	const payload = Object.fromEntries(Object.entries(requestedPayload)
		.filter(([property, value]) => comparable(value, property) !== comparable(currentProject[property], property)))
	if (!Object.keys(payload).length) {
		return { status: 'success', message: 'Project already has the requested values.', projectId: normalizedProjectId }
	}
	await sapProjectIntegration.updateProject(normalizedProjectId, payload)
	return { status: 'success', message: 'Project details updated successfully.', projectId: normalizedProjectId }
}

export async function updateProjectResponsibility(projectId, projectRoleId, businessPartnerId) {
	const normalizedProjectId = String(projectId || '').trim()
	const normalizedRoleId = String(projectRoleId || '').trim()
	const normalizedBusinessPartnerId = String(businessPartnerId || '').trim()
	if (!normalizedProjectId || !normalizedRoleId || !normalizedBusinessPartnerId) {
		throw new Error('Project ID, Project Role ID, and Business Partner ID are required.')
	}
	await sapProjectIntegration.updateProjectRole(normalizedProjectId, normalizedRoleId, normalizedBusinessPartnerId)
	return { status: 'success', message: 'Project responsibility updated successfully.' }
}

function valueOf(record, ...keys) {
	for (const key of keys) {
		const value = record?.[key]
		if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
	}
	return ''
}

export async function getProjectWorkspace(projectId) {
	const data = await sapProjectIntegration.getProjectWorkspace(projectId)
	if (!data) {
		const error = new Error(`Project ${projectId} was not found in SAP.`)
		error.code = 'project-not-found'
		throw error
	}
	const project = data.project
	const [masterData, workforce, projectRoles] = await Promise.all([
		getMasterData().catch(() => null),
		sapProjectIntegration.getWorkforceDirectory().catch(() => []),
		sapProjectIntegration.getProjectRoles(projectId).catch(() => []),
	])
	const projectCostCenterCode = valueOf(project, 'CostCenter', 'CostCenterID', 'ResponsibleCostCenter', 'RespCostCenter')
	const projectCostCenter = masterData?.costCenters?.find(item => String(item.code || '').trim() === projectCostCenterCode)
	const projectCompanyCode = valueOf(project, 'YY1_ContractingCompan_Cpr', 'YY1_ContractingCompanyCode_Cpr', 'ContractingCompanyCode', 'CompanyCode') || projectCostCenter?.companyCode ||
		(projectCostCenterCode ? await sapProjectIntegration.getCostCenterCompanyCode(projectCostCenterCode).catch(() => '') : '')
	const customers = masterData?.customers || []
	const customer = customers.find(item => item.code === project.Customer)
	const manager = workforce.find(item => item.personExternalId === project.ProjManagerExtId)
	const responsibilities = projectRoles.map(role => {
		const businessPartnerId = role.BusinessPartnerID || role.BusinessPartner || ''
		const worker = workforce.find(person =>
			String(person.person || '') === String(businessPartnerId) ||
			String(person.personExternalId || '') === String(businessPartnerId),
		)
		return {
			roleId: role.ProjectRoleID || '',
			roleName: role.ProjectRoleName || role.ProjectRoleID || '',
			workerId: businessPartnerId,
			workerName: role.BusinessPartnerName || worker?.personFullName || businessPartnerId,
			email: role.EmailAddress || worker?.defaultEmailAddress || '',
		}
	})
	const hasProjectManagerRole = responsibilities.some(item =>
		item.roleId === 'YP_RL_0001' || item.roleName.trim().toLowerCase() === 'project manager',
	)
	if (!hasProjectManagerRole && project.ProjManagerExtId) {
		responsibilities.push({
			roleId: 'YP_RL_0001',
			roleName: 'Project Manager',
			workerId: manager?.person || project.ProjManagerExtId,
			workerName: manager?.personFullName || project.ProjManagerExtId,
			email: manager?.defaultEmailAddress || '',
		})
	}
	const optionLabel = (options, code) => {
		const option = options?.find(item => item.code === code)
		return option?.name || code || ''
	}
	const stageNames = { P001: 'In Planning', P002: 'Contract Preparation', P003: 'In Execution', P004: 'Completed', P005: 'Closed' }
	return {
		project: {
			id: project.ProjectID || projectId,
			name: project.ProjectName || project.ProjectDescription || projectId,
			customer: project.CustomerName || customer?.name || '',
			manager: manager?.personFullName || '',
			status: stageNames[project.ProjectStage] || project.ProjectStage || '',
			stage: project.ProjectStage || '',
			startDate: formatSapDate(project.StartDate),
			endDate: formatSapDate(project.EndDate),
			billability: project.YY1_Billability1_Cpr || '',
			// ProjectDescription is SAP's short project name on some responses.
			// Prefer ProjectDesc, which is the long project description field.
			description: project.ProjectDesc || project.ProjectLongDescription || project.ProjectLongText || project.Description || project.ProjectDescription || '',
			blockedFunctions: project.BlockedFunctions || project.BlockedFunction || '',
			typeOfProject: project.YY1_TypeofProject_Cpr || '',
			expenseBookingAllowed: project.YY1_ExpenseBookingAllo_Cpr || '',
			overtimeAllowed: project.YY1_OvertimeAllowed_Cpr || '',
			projectBillableDailyHours: String(project.YY1_ProjectBillableDai_Cpr ?? ''),
			sowStatus: project.YY1_SOWStatus_Cpr || '',
			paymentTerms: project.YY1_Paymentterms_Cpr || '',
			endCustomer: project.YY1_EndCustomer_Cpr || '',
			confidential: project.Confidential || '',
			publicProject: ['Y', 'X', 'TRUE', '1'].includes(String(project.Confidential || '').trim().toUpperCase()) ? 'No' : 'Yes',
			useProjectBilling: project.UseProjectBilling || '',
			restrictTimePosting: project.RestrictTimePosting || '',
			category: optionLabel(masterData?.projectCategories, project.YY1_ProjectCategory_Cpr || project.ProjectCategory),
			contractingCompanyCode: projectCompanyCode,
			projectNature: optionLabel(masterData?.projectNatures, project.YY1_ProjectNature_Cpr),
			costCenter: optionLabel(masterData?.costCenters, project.CostCenter),
			profitCenter: optionLabel(masterData?.profitCenters, project.ProfitCenter),
			buName: project.YY1_BUName_Cpr || project.BusinessUnitName || project.BusinessUnit || project.ProfitCenterGroup || '',
			orgId: optionLabel(masterData?.orgIds, project.OrgID || project.ServiceOrganization),
			currency: optionLabel(masterData?.currencies, project.Currency),
			plannedEffort: String(project.PlannedEffort || project.PlannedEffortInHours || project.PlannedWorkQuantity || ''),
			plannedCost: String(project.PlannedCost || project.PlannedCostAmount || project.PlanCost || ''),
			plannedRevenue: String(project.PlannedRevenue || project.PlannedRevenueAmount || project.PlanRevenue || ''),
			revenueSold: String(project.RevenueSold || project.SoldRevenue || project.ActualRevenue || ''),
			marginSold: String(project.MarginSold || project.SoldMargin || project.ActualMargin || ''),
			customerCode: project.Customer || '',
			customerGroup: optionLabel(masterData?.customerGroups, project.YY1_CustomerGroupName_Cpr),
			projectManagerExternalId: project.ProjManagerExtId || '',
		},
		workPackages: data.workPackages.map(item => {
			const id = String(item.WorkPackageID || '')
			// WorkPackageID is the ID used by this app and the WBS filter. Do not
			// synthesize a different WBS from ProjectName; that can select another WBS rate.
			const wbsElementExternalID = String(item.WBSElementExternalID || item.WBSElement || item.WbsElement || id)
			return { id, wbsElementExternalID, name: item.WorkPackageName || '', description: item.Description || '', type: item.WorkPackageType || '', startDate: formatSapDate(item.WPStartDate), endDate: formatSapDate(item.WPEndDate), unitId: item.UnitId || '', unitQuantity: String(item.UnitQuantity ?? '') }
		}),
		responsibilities,
	}
}

export async function getRecentProjects() {
	const [projects, masterData, workforce, salesOrders] = await Promise.all([
		sapProjectIntegration.getRecentProjects(),
		getMasterData().catch(() => null),
		sapProjectIntegration.getWorkforceDirectory().catch(() => []),
		sapProjectIntegration.getCustomerProjectSalesOrders().catch(() => []),
	])
	const customers = masterData?.customers || []
	const costCenters = masterData?.costCenters || []
	const stageNames = { P001: 'In Planning', P002: 'Contract Preparation', P003: 'In Execution', P004: 'Completed', P005: 'Closed' }
	const projectTypeNames = { C: 'Customer Project', I: 'Internal Project' }
	const optionLabel = (options, code) => {
		const normalizedCode = String(code || '').trim()
		const option = options?.find(item => String(item.code || '').trim() === normalizedCode)
		return option?.name || normalizedCode
	}
	return {
		projects: projects.map(project => {
			const customerCode = valueOf(project, 'Customer', 'CustomerCode', 'SoldToParty')
			const customer = customers.find(item => String(item.code || '').trim() === customerCode)
			const manager = workforce.find(item => item.personExternalId === project.ProjManagerExtId)
			const costCenterCode = valueOf(project, 'CostCenter', 'CostCenterID', 'ResponsibleCostCenter', 'RespCostCenter')
			const costCenter = costCenters.find(item => String(item.code || '').trim() === costCenterCode)
			const stageCode = valueOf(project, 'ProjectStage', 'CurrentStage', 'ProcessingStatus')
			const salesOrder = salesOrders.find(item => {
				const linkedProjectId = item.ProjectID || item.Project || item.EnterpriseProject || item.CustomerProject || item.WBSElementExternalID
				return linkedProjectId === project.ProjectID
			})
			const projectType = project.ProjectCategory || ''
			return {
				id: project.ProjectID || '',
				name: project.ProjectName || project.ProjectDescription || '',
				customer: project.CustomerName || customer?.name || project.Customer || '',
				manager: project.ProjectManagerName || manager?.personFullName || project.ProjManagerExtId || '',
				salesOrder: project.SalesOrder || project.SalesOrderID || salesOrder?.SalesOrder || salesOrder?.SalesOrderID || '',
				serviceOrganization:
					valueOf(project, 'ServiceOrganizationName', 'ProjectServiceOrganizationName', 'ServiceOrganizationText', 'ProjectServiceOrganizationText') ||
					optionLabel(
						masterData?.orgIds,
						valueOf(project, 'ServiceOrganization', 'ProjectServiceOrganization', 'ServiceOrganizationID', 'OrgID'),
					),
				stage: valueOf(project, 'ProjectStageName', 'CurrentStageName') || stageNames[stageCode] || stageCode,
				billability: project.YY1_Billability1_Cpr || '',
				currency: project.Currency || '',
				projectNature: project.YY1_ProjectNature_Cpr || '',
				projectType: projectTypeNames[projectType] || projectType,
				startDate: formatSapDate(project.StartDate),
				endDate: formatSapDate(project.EndDate),
				changedOn: formatSapDate(project.ChangedOn || project.CreatedOn),
				contractingCompanyCode: optionLabel(masterData?.companyCodes, valueOf(project, 'YY1_ContractingCompan_Cpr', 'YY1_ContractingCompan_CprT', 'YY1_ContractingCompanyCode_Cpr', 'YY1_ContractingCompanyCode_CprT', 'ContractingCompanyCode', 'CompanyCode') || costCenter?.companyCode),
				costCenter: optionLabel(costCenters, costCenterCode),
				currentStage: valueOf(project, 'CurrentStageName', 'ProjectStageName') || stageNames[stageCode] || stageCode,
				customerGroupName: optionLabel(masterData?.customerGroups, valueOf(project, 'YY1_CustomerGroupName_CprT', 'YY1_CustomerGroupName_Cpr', 'YY1_CustomerGroupName_Cpr_Text', 'CustomerGroupName', 'AdditionalCustomerGroup1Name') || customer?.customerGroup),
				profitCenter: optionLabel(masterData?.profitCenters, valueOf(project, 'ProfitCenter', 'ProfitCenterID', 'ResponsibleProfitCenter') || costCenter?.profitCenter),
				solutionOrderItem: project.SolutionOrderItem || project.SolutionOrder || '',
			}
		}).filter(project => project.id),
	}
}

export async function createProjectAndResponsibilities(payload) {
	const { project, responsibilities } = payload
	const defaults = getConfiguredDefaults()
	const customerGroupNameCode =
		project.YY1_CustomerGroupName_Cpr || project.YY1_CustomerGroupName_CprT || ''
	const projectManagerExtId = resolveProjectManagerExtId(project, defaults)
	const projectNatureCode = await resolveSapProjectNatureCode(project.YY1_ProjectNature_Cpr)
	const requestedProjectId = String(project.ProjectID || '').trim()
	const projectIdToCreate = requestedProjectId || (await sapProjectIntegration.generateProjectId())

	if (!projectManagerExtId) {
		const error = new Error(
			'Project Manager Ext ID is mandatory in SAP. Provide ProjManagerExtId in payload or configure PROJECT_DEFAULTS.projectManagerExtId.',
		)
		error.code = 'missing-proj-manager-ext-id'
		throw error
	}

	const { profitCenter: selectedProfitCenter } = await resolveCostCenterAndProfitCenter(
		project.CostCenter,
		project.ProfitCenter,
	)
	const businessUnitName = String(
		project.YY1_BUName_Cpr || project.BUName || project.buName || selectedProfitCenter.buName || '',
	).trim()

	const orgMapping = getServiceOrgMapping(project.CostCenter)
	const serviceOrganization =
		project.ServiceOrganization || orgMapping.serviceOrganization || defaults.serviceOrganization || ''

	if (project.YY1_ProjectNature_Cpr === 'COR') {
		const customers = await sapProjectIntegration.getCustomerData()
		const matchingCustomer = customers.find(
			item => item.code === project.Customer && (!customerGroupNameCode || item.customerGroup === customerGroupNameCode),
		)
		if (!matchingCustomer) {
			throw new Error(
				'The selected Customer Code does not belong to the selected Additional Customer Group.',
			)
		}
	}

	const projectPayload = {
		ProjectID: projectIdToCreate,
		ProjectName: project.ProjectName,
		ProjectDesc: project.ProjectDesc,
		ProjectStage: project.ProjectStage,
		ProjectCategory: defaults.projectCategory,
		YY1_ProjectCategory_Cpr: project.YY1_ProjectCategory_Cpr,
		YY1_TypeofProject_Cpr: project.YY1_TypeofProject_Cpr || '',
		YY1_BUName_Cpr: businessUnitName,
		OrgID: project.OrgID,
		Currency: project.Currency,
		StartDate: toProjectDate(project.StartDate),
		EndDate: toProjectDate(project.EndDate),
		ProjManagerExtId: projectManagerExtId,
		Customer: project.Customer || '',
		YY1_EndCustomer_Cpr: project.YY1_EndCustomer_Cpr || '',
		YY1_Paymentterms_Cpr: project.YY1_Paymentterms_Cpr || '',
		CostCenter: project.CostCenter,
		ProfitCenter: project.ProfitCenter,
		Confidential: defaults.confidential,
		UseProjectBilling: defaults.useProjectBilling,
		RestrictTimePosting: defaults.restrictTimePosting,
		YY1_Billability1_Cpr: project.YY1_Billability1_Cpr,
		YY1_ExpenseBookingAllo_Cpr: project.YY1_ExpenseBookingAllo_Cpr || '',
		YY1_OvertimeAllowed_Cpr: project.YY1_OvertimeAllowed_Cpr || '',
		YY1_ProjectBillableDai_Cpr: project.YY1_ProjectBillableDai_Cpr || '',
		YY1_SOWStatus_Cpr: project.YY1_SOWStatus_Cpr || '',
		YY1_ContractingCompan_Cpr: project.YY1_ContractingCompan_Cpr,
		YY1_CustomerGroupName_Cpr: customerGroupNameCode,
		YY1_CustomerGroupName_CprT: customerGroupNameCode,
		YY1_ProjectNature_Cpr: projectNatureCode,
	}

	if (serviceOrganization) {
		projectPayload.ServiceOrganization = serviceOrganization
	}

	const projectResult = await sapProjectIntegration.createProject(projectPayload)
	const projectId = projectResult.projectId
	await sapProjectIntegration.waitForProjectAvailability(projectId)

	const failedResponsibilities = []

	for (const role of responsibilities) {
		const rolePayload = buildRolePayload(projectId, role, ROLES)
		try {
			await sapProjectIntegration.createProjectRole(rolePayload)
		} catch (error) {
			const sapMessage = `${error?.details?.sapResponse || ''} ${error?.message || ''}`
			if (error?.details?.status === 400 && /Role\s+\S+\s+has already been assigned\.?/i.test(sapMessage)) {
				continue
			}
			failedResponsibilities.push({
				projectRoleId: rolePayload.ProjectRoleID,
				projectRoleName: rolePayload.ProjectRoleName,
				businessPartnerId: rolePayload.BusinessPartnerID,
				businessPartnerName: rolePayload.BusinessPartnerName,
				error: error?.message || 'Responsibility creation failed.',
			})
		}
	}

	if (failedResponsibilities.length) {
		return {
			status: 'partial',
			message:
				'Project creation succeeded, but one or more responsibilities failed. Retry responsibility assignment.',
			projectId,
			failedResponsibilities,
		}
	}

	return {
		status: 'success',
		message: 'Project and responsibilities created successfully.',
		projectId,
	}
}

export async function retryResponsibilities(payload) {
	const failures = []

	for (const role of payload.responsibilities) {
		const rolePayload = buildRolePayload(payload.projectId, role, ROLES)
		try {
			await sapProjectIntegration.createProjectRole(rolePayload)
		} catch (error) {
			failures.push(`${rolePayload.ProjectRoleID}/${rolePayload.BusinessPartnerID}: ${error?.message || 'Failed'}`)
		}
	}

	if (failures.length) {
		throw new Error(`Retry failed for responsibilities: ${failures.join('; ')}`)
	}

	return {
		status: 'success',
		message: 'Responsibilities assigned successfully.',
		projectId: payload.projectId,
	}
}
