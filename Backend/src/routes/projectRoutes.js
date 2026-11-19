import {
	createProject,
	createProjectWorkPackage,
	createProjectWorkPackagesBatch,
	deleteProjectWorkPackage,
	updateProjectWorkPackage,
	createWorkPackageDemand,
	createWorkPackageDemandsBatch,
	getWorkPackageDemandCostRate,
	recalculateWorkPackageDemandRevenue,
	saveWorkPackageDemandRevenue,
	getCurrencyExchangeRatesRequest,
	getProjectServicePricesRequest,
	updateProjectServicePriceRequest,
	createWorkPackageWorkItemRequest,
	deleteWorkPackageWorkItemRequest,
	updateWorkPackageDemand,
	deleteWorkPackageDemands,
	createProjectBillingPlan,
	updateProjectBillingPlan,
	deleteProjectBillingItemRequest,
	getProjectBillingDetails,
	getProjectWorkforce,
	getProjectWorkspaceDetails,
	getRecentProjectList,
	getWorkPackageDetails,
	updateProjectStatus,
	updateProjectInformation,
	updateProjectResponsibilityAssignment,
	getProjectMasterData,
	getProjectCustomers,
	getProjectPaymentTerms,
	retryProjectResponsibilities,
	getApprovals,
	getApprovalDetails,
	updateApproval,
} from '../controllers/projectController.js'

function send(response, status, payload) {
	response.writeHead(status, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-User-Email, X-User-Name',
		'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
	})
	response.end(JSON.stringify(payload))
}

export async function routeRequest(request, response) {
	if (request.method === 'OPTIONS') return send(response, 204, {})

	const requestUrl = new URL(request.url, 'http://localhost')
	const pathname = requestUrl.pathname

	if (request.method === 'GET' && pathname === '/health') {
		return send(response, 200, { status: 'ok' })
	}

	if (request.method === 'GET' && pathname === '/api/projects/master-data') {
		return getProjectMasterData(response, send)
	}

	if (request.method === 'GET' && pathname === '/api/projects/customers') {
		return getProjectCustomers(requestUrl, response, send)
	}

	if (request.method === 'GET' && pathname === '/api/projects/payment-terms') {
		return getProjectPaymentTerms(requestUrl, response, send)
	}

	if (request.method === 'GET' && pathname === '/api/projects/workforce') {
		return getProjectWorkforce(response, send)
	}

	if (request.method === 'GET' && pathname === '/api/projects/workspace') {
		return getProjectWorkspaceDetails(requestUrl, response, send)
	}

	if (request.method === 'GET' && pathname === '/api/projects/billing') {
		return getProjectBillingDetails(requestUrl, response, send)
	}

	if (request.method === 'GET' && pathname === '/api/projects/service-prices') {
		return getProjectServicePricesRequest(requestUrl, response, send)
	}
	if (request.method === 'PATCH' && pathname === '/api/projects/service-prices') {
		return updateProjectServicePriceRequest(request, response, send)
	}

	if (request.method === 'GET' && pathname === '/api/currencies/exchange-rates') {
		return getCurrencyExchangeRatesRequest(requestUrl, response, send)
	}
	const servicePriceMatch = pathname.match(/^\/api\/projects\/service-prices\/([^/]+)$/)
	if (request.method === 'PATCH' && servicePriceMatch) {
		return updateProjectServicePriceRequest(request, response, send)
	}

	if (request.method === 'GET' && pathname === '/api/projects/recent') {
		return getRecentProjectList(response, send)
	}

	if (request.method === 'GET' && pathname === '/api/approvals') return getApprovals(request, response, send)
	const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/)
	if (request.method === 'GET' && approvalMatch) return getApprovalDetails(request, response, send, decodeURIComponent(approvalMatch[1]))
	if (request.method === 'POST' && approvalMatch) return updateApproval(request, response, send, decodeURIComponent(approvalMatch[1]))

	if (request.method === 'GET' && pathname === '/api/work-packages/details') {
		return getWorkPackageDetails(requestUrl, response, send)
	}

	if (request.method === 'POST' && pathname === '/api/projects') {
		return createProject(request, response, send)
	}

	if (request.method === 'POST' && pathname === '/api/work-packages') {
		return createProjectWorkPackage(request, response, send)
	}
	if (request.method === 'POST' && pathname === '/api/work-packages/batch') {
		return createProjectWorkPackagesBatch(request, response, send)
	}

	const workPackageMatch = pathname.match(/^\/api\/work-packages\/([^/]+)\/([^/]+)$/)
	if (request.method === 'PATCH' && workPackageMatch) {
		return updateProjectWorkPackage(request, response, send, decodeURIComponent(workPackageMatch[1]), decodeURIComponent(workPackageMatch[2]))
	}
	if (request.method === 'DELETE' && workPackageMatch) {
		return deleteProjectWorkPackage(request, response, send, decodeURIComponent(workPackageMatch[1]), decodeURIComponent(workPackageMatch[2]))
	}

	if (request.method === 'POST' && pathname === '/api/demands') {
		return createWorkPackageDemand(request, response, send)
	}
	if (request.method === 'POST' && pathname === '/api/demands/batch') {
		return createWorkPackageDemandsBatch(request, response, send)
	}

	if (request.method === 'POST' && pathname === '/api/demands/cost-rate') {
		return getWorkPackageDemandCostRate(request, response, send)
	}

	if (request.method === 'PATCH' && pathname === '/api/demands/revenue-rates') {
		return saveWorkPackageDemandRevenue(request, response, send)
	}

	if (request.method === 'POST' && pathname === '/api/demands/revenue-rates') {
		return recalculateWorkPackageDemandRevenue(request, response, send)
	}

	if (request.method === 'POST' && pathname === '/api/work-packages/work-items') {
		return createWorkPackageWorkItemRequest(request, response, send)
	}

	if (request.method === 'DELETE' && pathname === '/api/work-packages/work-items') {
		return deleteWorkPackageWorkItemRequest(request, response, send)
	}

	if (request.method === 'PATCH' && pathname === '/api/demands') {
		return updateWorkPackageDemand(request, response, send)
	}

	if (request.method === 'DELETE' && pathname === '/api/demands') {
		return deleteWorkPackageDemands(request, response, send)
	}

	if (request.method === 'POST' && pathname === '/api/billing-plans') {
		return createProjectBillingPlan(request, response, send)
	}
	if (request.method === 'PATCH' && pathname === '/api/billing-plans') {
		return updateProjectBillingPlan(request, response, send)
	}

	const billingItemDeleteMatch = pathname.match(/^\/api\/projects\/([^/]+)\/billing-items\/([^/]+)$/)
	if (request.method === 'DELETE' && billingItemDeleteMatch) {
		return deleteProjectBillingItemRequest(request, response, send, ...billingItemDeleteMatch.slice(1).map(decodeURIComponent))
	}

	const projectStageMatch = pathname.match(/^\/api\/projects\/([^/]+)\/stage$/)
	if (request.method === 'PATCH' && projectStageMatch) {
		return updateProjectStatus(request, response, send, decodeURIComponent(projectStageMatch[1]))
	}

	const projectResponsibilityMatch = pathname.match(/^\/api\/projects\/([^/]+)\/responsibilities\/([^/]+)$/)
	if (request.method === 'PATCH' && projectResponsibilityMatch) {
		return updateProjectResponsibilityAssignment(request, response, send, decodeURIComponent(projectResponsibilityMatch[1]), decodeURIComponent(projectResponsibilityMatch[2]))
	}

	const projectInformationMatch = pathname.match(/^\/api\/projects\/([^/]+)$/)
	if (request.method === 'PATCH' && projectInformationMatch) {
		return updateProjectInformation(request, response, send, decodeURIComponent(projectInformationMatch[1]))
	}

	const retryMatch = pathname.match(/^\/api\/projects\/([^/]+)\/responsibilities\/retry$/)
	if (request.method === 'POST' && retryMatch) {
		return retryProjectResponsibilities(request, response, send, decodeURIComponent(retryMatch[1]))
	}

	return send(response, 404, { message: 'Route not found.' })
}
