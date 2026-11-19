import {
	createWorkPackage,
	createWorkPackagesBatch,
	deleteWorkPackage,
	createWorkPackageWorkItem,
	deleteWorkPackageWorkItem,
	updateWorkPackage,
	createDemand,
	createDemandsBatch,
	getDemandCostRate,
	getDemandRevenueRates,
	saveDemandRevenueRate,
	getCurrencyExchangeRates,
	getProjectServicePrices,
	updateProjectServicePrice,
	deleteDemands,
	updateDemand,
	createBillingPlan,
	updateBillingPlanItem,
	deleteProjectBillingItem,
	getProjectBilling,
	createProjectAndResponsibilities,
	getCustomersForProject,
	getCustomerPaymentTerms,
	getMasterData,
	getWorkforceDirectory,
	getProjectWorkspace,
	getRecentProjects,
	getWorkPackageDemandDetails,
	updateProjectStage,
	updateProjectDetails,
	updateProjectResponsibility,
	retryResponsibilities,
} from '../services/projectService.js'
import {
	validateCustomerLookup,
	validateProjectCreateRequest,
	validateRetryResponsibilitiesRequest,
	validateWorkPackageCreateRequest,
	validateDemandCreateRequest,
} from '../validators/projectValidator.js'
import { actOnApproval, getApprovalInbox, getApprovalProject } from '../services/approvalService.js'

function logDetailedError(context, error) {
	console.error(`[${context}]`, error?.message || error)
	if (error?.details) {
		try {
			console.error(`[${context}] details:`, JSON.stringify(error.details, null, 2))
		} catch {
			console.error(`[${context}] details:`, error.details)
		}
	}
	if (error?.stack) {
		console.error(`[${context}] stack:`, error.stack)
	}
}

function readJsonBody(request) {
	return new Promise((resolve, reject) => {
		let body = ''
		request.on('data', chunk => {
			body += chunk
		})
		request.on('end', () => {
			try {
				resolve(JSON.parse(body || '{}'))
			} catch {
				reject(new Error('invalid-json'))
			}
		})
		request.on('error', reject)
	})
}

const approvalActor = request => ({
	id: request.headers['x-user-id'] || process.env.CURRENT_USER_BUSINESS_PARTNER || '',
	email: request.headers['x-user-email'] || process.env.CURRENT_USER_EMAIL || '',
	name: request.headers['x-user-name'] || process.env.CURRENT_USER_NAME || '',
})

export async function getApprovals(request, response, send) {
	try { return send(response, 200, await getApprovalInbox(approvalActor(request))) }
	catch (error) { logDetailedError('Approval inbox failed', error); return send(response, 502, { message: error?.message || 'Unable to load approvals.' }) }
}

export async function getApprovalDetails(request, response, send, projectId) {
	try { return send(response, 200, await getApprovalProject(projectId, approvalActor(request))) }
	catch (error) { return send(response, error?.code === 'not-an-approver' ? 403 : 502, { message: error?.message || 'Unable to load approval details.' }) }
}

export async function updateApproval(request, response, send, projectId) {
	try {
		const payload = await readJsonBody(request)
		if (!['approve', 'reject'].includes(payload?.action)) return send(response, 400, { message: 'Action must be approve or reject.' })
		return send(response, 200, await actOnApproval(projectId, payload.action, payload.comment, approvalActor(request)))
	} catch (error) {
		const status = error?.code === 'not-an-approver' ? 403 : error?.code === 'approval-out-of-sequence' ? 409 : 502
		return send(response, status, { message: error?.message || 'Unable to update approval.' })
	}
}

function sendValidationError(response, send, validation) {
	return send(response, 400, {
		message: 'Validation failed.',
		errors: validation.errors,
	})
}

export async function getProjectMasterData(response, send) {
	try {
		const data = await getMasterData()
		return send(response, 200, data)
	} catch (error) {
		logDetailedError('Master data load failed', error)
		return send(response, 500, {
			message: 'Unable to load project master data.',
		})
	}
}

export async function getProjectCustomers(requestUrl, response, send) {
	try {
		const params = {
			customerGroup: requestUrl.searchParams.get('customerGroup') || '',
			costCenter: requestUrl.searchParams.get('costCenter') || '',
			profitCenter: requestUrl.searchParams.get('profitCenter') || '',
			projectNature: requestUrl.searchParams.get('projectNature') || '',
		}

		const validation = validateCustomerLookup(params)
		if (!validation.valid) {
			return sendValidationError(response, send, validation)
		}

		const data = await getCustomersForProject(params)
		return send(response, 200, data)
	} catch (error) {
		logDetailedError('Customer lookup failed', error)
		return send(response, 502, {
			message: 'Unable to load customers from SAP-dependent mapping.',
		})
	}
}

export async function getProjectPaymentTerms(requestUrl, response, send) {
	const customerCode = String(requestUrl.searchParams.get('customerCode') || '').trim()
	const companyCode = String(requestUrl.searchParams.get('companyCode') || '').trim()
	if (!customerCode || !companyCode) {
		return send(response, 400, { message: 'Customer Code and Contracting Company Code are required.' })
	}

	try {
		const data = await getCustomerPaymentTerms({ customerCode, companyCode })
		return send(response, 200, data)
	} catch (error) {
		logDetailedError('Payment Terms lookup failed', error)
		return send(response, 502, { message: 'Unable to load Payment Terms from SAP.' })
	}
}

export async function getProjectWorkforce(response, send) {
	try {
		const data = await getWorkforceDirectory()
		return send(response, 200, data)
	} catch (error) {
		logDetailedError('Workforce lookup failed', error)
		return send(response, 502, {
			message: 'Unable to load workforce directory from SAP.',
		})
	}
}

export async function getProjectWorkspaceDetails(requestUrl, response, send) {
	try {
		const projectId = requestUrl.searchParams.get('projectId') || ''
		if (!projectId.trim()) return send(response, 400, { message: 'Project ID is required.' })
		return send(response, 200, await getProjectWorkspace(projectId.trim()))
	} catch (error) {
		logDetailedError('Project workspace fetch failed', error)
		return send(response, error?.code === 'project-not-found' ? 404 : 502, { message: error?.message || 'Unable to fetch project details from SAP.' })
	}
}

export async function getRecentProjectList(response, send) {
	try {
		return send(response, 200, await getRecentProjects())
	} catch (error) {
		logDetailedError('Recent projects fetch failed', error)
		return send(response, 502, { message: 'Unable to load recent projects from SAP.' })
	}
}

export async function getWorkPackageDetails(requestUrl, response, send) {
	try {
		const projectId = requestUrl.searchParams.get('projectId') || ''
		const workPackageId = requestUrl.searchParams.get('workPackageId') || ''
		const workPackageName = requestUrl.searchParams.get('workPackageName') || ''
		const workPackageType = requestUrl.searchParams.get('workPackageType') || ''
		if (!projectId.trim() || !workPackageId.trim() || !workPackageName.trim()) {
			return send(response, 400, { message: 'Project ID, Work Package ID, and Work Package Name are required.' })
		}
		return send(response, 200, await getWorkPackageDemandDetails({ projectId, workPackageId, workPackageName, workPackageType }))
	} catch (error) {
		logDetailedError('Work package demand fetch failed', error)
		return send(response, 502, { message: error?.message || 'Unable to load work package data from SAP.' })
	}
}

export async function updateProjectStatus(request, response, send, projectId) {
	try {
		const payload = await readJsonBody(request)
		if (payload?.projectStage !== 'P002') return send(response, 400, { message: 'Only the Contract Preparation stage (P002) can be selected.' })
		return send(response, 200, await updateProjectStage(projectId, payload.projectStage))
	} catch (error) {
		logDetailedError('Project stage update failed', error)
		return send(response, 502, { message: error?.message || 'Unable to update project stage in SAP.' })
	}
}

export async function updateProjectInformation(request, response, send, projectId) {
	try {
		const payload = await readJsonBody(request)
		return send(response, 200, await updateProjectDetails(projectId, payload?.project))
	} catch (error) {
		logDetailedError('Project details update failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to update project details in SAP.' })
	}
}

export async function updateProjectResponsibilityAssignment(request, response, send, projectId, projectRoleId) {
	try {
		const payload = await readJsonBody(request)
		return send(response, 200, await updateProjectResponsibility(projectId, projectRoleId, payload?.businessPartnerId))
	} catch (error) {
		logDetailedError('Project responsibility update failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to update the project responsibility in SAP.' })
	}
}

export async function createProject(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		const validation = validateProjectCreateRequest(payload)
		if (!validation.valid) {
			return sendValidationError(response, send, validation)
		}

		const result = await createProjectAndResponsibilities(payload)
		return send(response, result.status === 'success' ? 201 : 207, result)
	} catch (error) {
		logDetailedError('Project creation failed', error)
		if (error?.code === 'invalid-json') {
			return send(response, 400, { message: 'Invalid JSON payload.' })
		}
		if (error?.code === 'service-org-missing') {
			return send(response, 400, {
				message:
					'No Service Organization mapping found for the selected Cost Center. Project creation is blocked.',
			})
		}
		return send(response, 502, {
			message:
				error?.message ||
				'Project creation failed in SAP. Responsibilities were not created.',
		})
	}
}

export async function retryProjectResponsibilities(request, response, send, projectId) {
	try {
		const payload = await readJsonBody(request)
		const requestPayload = {
			projectId,
			responsibilities: payload?.responsibilities || [],
		}
		const validation = validateRetryResponsibilitiesRequest(requestPayload)
		if (!validation.valid) {
			return sendValidationError(response, send, validation)
		}

		const result = await retryResponsibilities(requestPayload)
		return send(response, 200, result)
	} catch (error) {
		logDetailedError('Responsibility retry failed', error)
		return send(response, 502, {
			message: error?.message || 'Unable to retry responsibility creation in SAP.',
		})
	}
}

export async function createProjectWorkPackage(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		const validation = validateWorkPackageCreateRequest(payload)
		if (!validation.valid) return sendValidationError(response, send, validation)

		const result = await createWorkPackage(payload)
		return send(response, 201, result)
	} catch (error) {
		logDetailedError('Work package creation failed', error)
		if (error?.code === 'invalid-json') return send(response, 400, { message: 'Invalid JSON payload.' })
		return send(response, 502, { message: error?.message || 'Unable to create work package in SAP.' })
	}
}

export async function createProjectWorkPackagesBatch(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		const rows = payload?.workPackages
		if (!String(payload?.projectId || '').trim() || !Array.isArray(rows) || rows.length === 0) return send(response, 400, { message: 'Project ID and work packages are required.' })
		if (rows.length > 2000) return send(response, 400, { message: 'Upload up to 2,000 work packages per upload.' })
		for (const [index, row] of rows.entries()) {
			const validation = validateWorkPackageCreateRequest({ ...row, projectId: payload.projectId })
			if (!validation.valid) return send(response, 400, { message: `Row ${index + 1}: ${Object.values(validation.errors)[0]}` })
		}
		return send(response, 200, { results: await createWorkPackagesBatch(payload) })
	} catch (error) {
		logDetailedError('Work package batch creation failed', error)
		return send(response, 502, { message: error?.message || 'Unable to submit the work package batch to SAP.', outcome: error?.code === 'sap-timeout' ? 'unknown' : 'failed' })
	}
}

export async function updateProjectWorkPackage(request, response, send, projectId, workPackageId) {
	try {
		const payload = await readJsonBody(request)
		const workPackageName = String(payload?.workPackageName || '').trim()
		if (!projectId.trim() || !workPackageId.trim() || !workPackageName) {
			return send(response, 400, { message: 'Project ID, Work Package ID, and Work Package Name are required.' })
		}
		const editableFields = ['name', 'description', 'startDate', 'endDate', 'unitId', 'unitQuantity']
		const updatePayload = Object.fromEntries(editableFields
			.filter(field => Object.hasOwn(payload || {}, field))
			.map(field => [field, payload[field]]))
		if (!Object.keys(updatePayload).length) return send(response, 400, { message: 'Provide at least one SAP-editable work package field.' })
		return send(response, 200, await updateWorkPackage(projectId, workPackageId, { ...updatePayload, workPackageName }))
	} catch (error) {
		logDetailedError('Work package update failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to update the work package in SAP.' })
	}
}

export async function deleteProjectWorkPackage(request, response, send, projectId, workPackageId) {
	try {
		const payload = await readJsonBody(request)
		const workPackageName = String(payload?.workPackageName || '').trim()
		if (!projectId.trim() || !workPackageId.trim() || !workPackageName) {
			return send(response, 400, { message: 'Project ID, Work Package ID, and Work Package Name are required.' })
		}
		return send(response, 200, await deleteWorkPackage(projectId, workPackageId, workPackageName))
	} catch (error) {
		logDetailedError('Work package deletion failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to delete the work package in SAP.' })
	}
}

export async function createWorkPackageDemand(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		const validation = validateDemandCreateRequest(payload)
		if (!validation.valid) return sendValidationError(response, send, validation)
		return send(response, 201, await createDemand(payload))
	} catch (error) {
		logDetailedError('Demand creation failed', error)
		return send(response, 502, { message: error?.message || 'Unable to create demand in SAP.' })
	}
}

export async function createWorkPackageDemandsBatch(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		const demands = payload?.demands
		if (!String(payload?.projectId || '').trim() || !Array.isArray(demands) || !demands.length) {
			return send(response, 400, { message: 'Project and demand rows are required.' })
		}
		if (demands.length > 2000) return send(response, 400, { message: 'Upload up to 2,000 demand rows at a time.' })
		return send(response, 200, { results: await createDemandsBatch(payload) })
	} catch (error) {
		logDetailedError('Demand batch creation failed', error)
		const invalidRequest = error?.code === 'invalid-json' || /^Row \d+:/.test(error?.message || '') || /project and at least one demand row are required/i.test(error?.message || '')
		return send(response, invalidRequest ? 400 : 502, { message: error?.message || 'Unable to submit the demand batch to SAP.', outcome: error?.code === 'sap-timeout' ? 'unknown' : 'failed' })
	}
}

export async function getWorkPackageDemandCostRate(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		if (![payload?.workPackageId, payload?.activityType, payload?.deliveryServiceOrg].every(value => String(value ?? '').trim())) {
			return send(response, 400, { message: 'Work package, role, and delivery organization are required.' })
		}
		const rate = await getDemandCostRate(payload)
		const totalRate = rate?.CostRateTotalAmount != null
			? Number(rate.CostRateTotalAmount)
			: rate?.CostRateFixedAmount != null
				? Number(rate.CostRateFixedAmount) + (Number(rate.CostRateVarblAmount) || 0)
				: rate?.CostRateVarblAmount == null ? null : Number(rate.CostRateVarblAmount)
		const scaleFactor = Number(rate?.CostRateScaleFactor)
		const costPerHour = totalRate == null || !Number.isFinite(totalRate)
			? null
			: totalRate / (Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1)
		return send(response, 200, { costPerHour, currency: rate?.Currency || '' })
	} catch (error) {
		logDetailedError('Demand cost rate lookup failed', error)
		return send(response, 502, { message: error?.message || 'Unable to read the demand cost rate from SAP.' })
	}
}

export async function recalculateWorkPackageDemandRevenue(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		if (!payload?.projectId || !Array.isArray(payload?.rows)) return send(response, 400, { message: 'Project ID and demand rows are required.' })
		const rates = await getDemandRevenueRates(payload)
		return send(response, 200, { rates })
	} catch (error) {
		logDetailedError('Demand revenue recalculation failed', error)
		return send(response, 502, { message: error?.message || 'Unable to read demand revenue rates from SAP.' })
	}
}

export async function saveWorkPackageDemandRevenue(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		return send(response, 200, await saveDemandRevenueRate(payload || {}))
	} catch (error) {
		logDetailedError('Demand revenue rate save failed', error)
		return send(response, 502, { message: error?.message || 'Unable to save the demand revenue rate in SAP.' })
	}
}

export async function getCurrencyExchangeRatesRequest(requestUrl, response, send) {
	try {
		const targetCurrency = requestUrl.searchParams.get('targetCurrency') || ''
		const sourceCurrencies = (requestUrl.searchParams.get('sourceCurrencies') || '').split(',').filter(Boolean)
		if (!targetCurrency) return send(response, 400, { message: 'Project currency is required.' })
		return send(response, 200, { rates: await getCurrencyExchangeRates({ targetCurrency, sourceCurrencies }) })
	} catch (error) {
		logDetailedError('SAP currency exchange-rate lookup failed', error)
		return send(response, 502, { message: error?.message || 'Unable to read currency exchange rates from SAP.' })
	}
}

export async function getProjectServicePricesRequest(requestUrl, response, send) {
	try {
		const projectId = requestUrl.searchParams.get('projectId') || ''
		const salesOrganization = requestUrl.searchParams.get('salesOrganization') || ''
		if (!salesOrganization) return send(response, 400, { message: 'Sales organization is required to read service prices.' })
		return send(response, 200, { prices: await getProjectServicePrices({ projectId, salesOrganization }) })
	} catch (error) {
		logDetailedError('Project service price list read failed', error)
		return send(response, 502, { message: error?.message || 'Unable to read the project service price list from SAP.' })
	}
}

export async function updateProjectServicePriceRequest(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		if (payload?.rate === undefined || payload?.rate === null || payload?.rate === '') return send(response, 400, { message: 'A project-specific price is required.' })
		if (!payload?.projectId || !payload?.material) return send(response, 400, { message: 'Project ID and service material are required.' })
		return send(response, 200, await updateProjectServicePrice(payload))
	} catch (error) {
		logDetailedError('Project service price update failed', error)
		return send(response, 502, { message: error?.message || 'Unable to update the project-specific service price in SAP.' })
	}
}

export async function createWorkPackageWorkItemRequest(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		return send(response, 201, await createWorkPackageWorkItem(payload || {}))
	} catch (error) {
		logDetailedError('Work item creation failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to assign work item in SAP.' })
	}
}

export async function deleteWorkPackageWorkItemRequest(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		return send(response, 200, await deleteWorkPackageWorkItem(payload || {}))
	} catch (error) {
		logDetailedError('Work item removal failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to unassign work item in SAP.' })
	}
}

export async function updateWorkPackageDemand(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		if (!payload || !['team', 'additional', 'expense'].includes(payload.type) || !payload.original || typeof payload.fields !== 'object' || !payload.fields) {
			return send(response, 400, { message: 'Demand type, original SAP keys, and updated fields are required.' })
		}
		return send(response, 200, await updateDemand(payload))
	} catch (error) {
		logDetailedError('Demand update failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to update demand in SAP.' })
	}
}

export async function deleteWorkPackageDemands(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		if (!payload || !['team', 'additional', 'expense'].includes(payload.type) || !Array.isArray(payload.keys)) {
			return send(response, 400, { message: 'Demand type and SAP demand keys are required.' })
		}
		return send(response, 200, await deleteDemands(payload))
	} catch (error) {
		logDetailedError('Demand deletion failed', error)
		return send(response, error?.code === 'invalid-json' || error?.message === 'invalid-json' ? 400 : 502, {
			message: error?.message || 'Unable to delete demand rows in SAP.',
			deletedKeys: error?.deletedKeys || [],
		})
	}
}

export async function createProjectBillingPlan(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		return send(response, 201, await createBillingPlan(payload))
	} catch (error) {
		logDetailedError('Billing plan creation failed', error)
		return send(response, error?.code === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to create the billing plan in SAP.' })
	}
}

export async function updateProjectBillingPlan(request, response, send) {
	try {
		const payload = await readJsonBody(request)
		return send(response, 200, await updateBillingPlanItem(payload || {}))
	} catch (error) {
		logDetailedError('Billing plan item update failed', error)
		return send(response, error?.code === 'invalid-json' ? 400 : 502, { message: error?.message || 'Unable to update the billing plan item in SAP.' })
	}
}

export async function deleteProjectBillingItemRequest(request, response, send, projectId, salesOrderItem) {
	try {
		return send(response, 200, await deleteProjectBillingItem(projectId, salesOrderItem))
	} catch (error) {
		logDetailedError('Billing item deletion failed', error)
		return send(response, 502, { message: error?.message || 'Unable to delete the billing item in SAP.' })
	}
}

export async function getProjectBillingDetails(requestUrl, response, send) {
	try {
		return send(response, 200, await getProjectBilling(requestUrl.searchParams.get('projectId') || ''))
	} catch (error) {
		logDetailedError('Billing details fetch failed', error)
		return send(response, 502, { message: error?.message || 'Unable to fetch billing details from SAP.' })
	}
}
