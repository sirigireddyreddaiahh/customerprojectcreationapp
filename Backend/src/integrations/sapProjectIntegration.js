const SAP_TIMEOUT_MS = Number(process.env.SAP_TIMEOUT_MS || 30000)
const SAP_CSRF_CACHE_TTL_MS = Number(process.env.SAP_CSRF_CACHE_TTL_MS || 5 * 60 * 1000)
const csrfCache = new Map()

const COST_CENTER_URL =
	process.env.SAP_COST_CENTER_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_cost_center/srvd_a2x/sap/costcenter/0001/A_CostCenter_2'
const COMPANY_DATA_URL =
	process.env.SAP_COMPANY_DATA_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_COMPANY_DATA_CDS/YY1_Company_Data'
const PROFIT_CENTER_URL =
	process.env.SAP_PROFIT_CENTER_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_PROFITCENTERANDBU_CDS/YY1_PROFITCENTERANDBU'
const PROFIT_CENTER_MASTER_URL =
	process.env.SAP_PROFIT_CENTER_MASTER_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_profitcenter/srvd_a2x/sap/profitcenter/0001/ProfitCenter'
const SERVICE_ORGANIZATION_COST_CENTER_URL =
	process.env.SAP_SERVICE_ORGANIZATION_COST_CENTER_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_serviceorganization/srvd_a2x/sap/projectserviceorganization/0001/CostCenter'
const SERVICE_ORGANIZATION_TEXT_URL =
	process.env.SAP_SERVICE_ORGANIZATION_TEXT_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_serviceorganization/srvd_a2x/sap/projectserviceorganization/0001/Text'
const SERVICE_ORGANIZATION_URL =
	process.env.SAP_SERVICE_ORGANIZATION_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_serviceorganization/srvd_a2x/sap/projectserviceorganization/0001/ServiceOrganization'
const SERVICE_COST_RATE_URL =
	process.env.SAP_SERVICE_COST_RATE_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_cost_rate/srvd_a2x/sap/costrate/0001/ServiceCostRate'
const CURRENCY_URL =
	process.env.SAP_CURRENCY_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_CURRENCY_API_CDS/YY1_Currency_API'
const EXCHANGE_RATE_URL =
	process.env.SAP_EXCHANGE_RATE_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_EXCHANGERATEAPI_CDS/YY1_EXCHANGERATEAPI'
const CUSTOMER_URL =
	process.env.SAP_CUSTOMER_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_business_partner/srvd_a2x/sap/businesspartner/0001/A_Customer'
const CUSTOMER_DATA_URL =
	process.env.SAP_CUSTOMER_DATA_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_CUSTOMER_DATA_CDS/YY1_CUSTOMER_DATA'
const CUSTOMER_PAYMENT_TERMS_URL =
	process.env.SAP_CUSTOMER_PAYMENT_TERMS_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_CUSTOMERDATA_API2_CDS/YY1_CustomerDATA_API2'
const BUSINESS_PARTNER_URL =
	process.env.SAP_BUSINESS_PARTNER_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_business_partner/srvd_a2x/sap/businesspartner/0001/A_BusinessPartner'
const PROJECT_SET_URL =
	process.env.SAP_PROJECT_SET_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/ProjectSet'
const PROJECT_NATURE_SET_URL = process.env.SAP_PROJECT_NATURE_SET_URL || (() => {
	const url = new URL(PROJECT_SET_URL)
	const segments = url.pathname.split('/').filter(Boolean)
	segments.pop()
	url.pathname = `/${segments.join('/')}/YY1_ProjectNatureSet`
	url.search = ''
	url.hash = ''
	return url.toString()
})()
const PROJECT_ROLE_SET_URL =
	process.env.SAP_PROJECT_ROLE_SET_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/ProjectRoleSet'
const WORK_PACKAGE_SET_URL =
	process.env.SAP_WORK_PACKAGE_SET_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/WorkPackageSet'
const WORK_ITEM_SET_URL =
	process.env.SAP_WORK_ITEM_SET_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/WorkItemSet'
const WORK_PACKAGE_ROLE_TYPES_URL =
	process.env.SAP_WORK_PACKAGE_ROLE_TYPES_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_CUSTPROJROLETYPES_CDS/YY1_CUSTPROJROLETYPES'
const STAFFING_DATA_SET_URL =
	process.env.SAP_STAFFING_DATA_SET_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/CPD/SC_EXTERNAL_SERVICES_SRV/StaffingDataSet'
const DEMAND_SET_URL =
	process.env.SAP_DEMAND_SET_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/DemandSet'
const CUSTOMER_PROJECT_SALES_ORDER_URL =
	process.env.SAP_CUSTOMER_PROJECT_SALES_ORDER_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/A_CustProjSlsOrd'
const CUSTOMER_PROJECT_SALES_ORDER_ITEM_URL = CUSTOMER_PROJECT_SALES_ORDER_URL.replace(/A_CustProjSlsOrd\/?$/, 'A_CustProjSlsOrdItem')
const CUSTOMER_PROJECT_BILLING_PLAN_ITEM_URL = CUSTOMER_PROJECT_SALES_ORDER_URL.replace(/A_CustProjSlsOrd\/?$/, 'A_CustProjSlsOrdItmBillgPlnItm')
const WORK_PACKAGE_SERVICES_URL =
	process.env.SAP_WORK_PACKAGE_SERVICES_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_WORKPACKAGESERVICES_CDS/YY1_WORKPACKAGESERVICES'
const PROJECT_DEMAND_ROLES_URL =
	process.env.SAP_PROJECT_DEMAND_ROLES_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_PROJECTDEMANDROLESAPI_CDS/YY1_ProjectDemandRolesAPI'
const PRICING_CONDITION_VALIDITY_URL = process.env.SAP_PRICING_CONDITION_VALIDITY_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SLSPRICINGCONDITIONRECORD_SRV/A_SlsPrcgCndnRecdValidity'
const PRICING_CONDITION_RECORD_URL = process.env.SAP_PRICING_CONDITION_RECORD_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SLSPRICINGCONDITIONRECORD_SRV/A_SlsPrcgConditionRecord'
const SAP_CSRF_URL = process.env.SAP_CSRF_URL
const WORKFORCE_SERVICE_URL =
	process.env.SAP_WORKFORCE_SERVICE_URL ||
	'https://my434938-api.s4hana.cloud.sap/sap/opu/odata/sap/YY1_WORKFORCE_API_CDS'
const normalizedWorkforceUrl = trimTrailingSlash(WORKFORCE_SERVICE_URL)
const WORKFORCE_ENTITY_URL = process.env.SAP_WORKFORCE_API_URL ||
	(normalizedWorkforceUrl.endsWith('/YY1_Workforce_API')
		? normalizedWorkforceUrl
		: `${normalizedWorkforceUrl}/YY1_Workforce_API`)
const SAP_DEBUG = process.env.SAP_DEBUG === 'true'
const PROJECT_ID_PREFIX = (process.env.PROJECT_ID_PREFIX || 'DEV').trim()
const SAP_ROLE_RETRY_ATTEMPTS = Number(process.env.SAP_ROLE_RETRY_ATTEMPTS || 3)
const SAP_ROLE_RETRY_DELAY_MS = Number(process.env.SAP_ROLE_RETRY_DELAY_MS || 1500)
const SAP_PROJECT_READY_RETRY_ATTEMPTS = Number(process.env.SAP_PROJECT_READY_RETRY_ATTEMPTS || 6)
const SAP_PROJECT_READY_RETRY_DELAY_MS = Number(process.env.SAP_PROJECT_READY_RETRY_DELAY_MS || 1500)

function createTimeoutController(timeoutMs) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
	return {
		signal: controller.signal,
		clear: () => clearTimeout(timeout),
	}
}

function normalizeODataCollection(payload) {
	if (Array.isArray(payload?.value)) return payload.value
	if (Array.isArray(payload?.d?.results)) return payload.d.results
	if (Array.isArray(payload?.d)) return payload.d
	return []
}

async function fetchAllODataCollection(url) {
	const items = []
	const visited = new Set()
	let nextUrl = url

	while (nextUrl && !visited.has(nextUrl)) {
		visited.add(nextUrl)
		const payload = await fetchJson(nextUrl)
		items.push(...normalizeODataCollection(payload))
		const nextLink = payload?.['@odata.nextLink'] || payload?.['odata.nextLink'] || payload?.d?.__next || payload?.__next
		nextUrl = nextLink ? new URL(nextLink, nextUrl).toString() : ''
	}

	return items
}

function normalizeODataEntity(payload) {
	if (payload?.d) return payload.d
	return payload
}

function normalizeSapDate(value) {
	if (!value) return ''
	const raw = String(value).trim()
	const odataDate = raw.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/)
	if (odataDate) {
		const timestamp = Number(odataDate[1])
		if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString().slice(0, 10)
	}
	const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/)
	return isoDate ? isoDate[0] : ''
}

function isSapTrue(value) {
	return value === true || String(value).trim().toLowerCase() === 'true'
}

function isSapFalse(value) {
	return value === false || String(value).trim().toLowerCase() === 'false'
}

function toSapDate(value) {
	const date = normalizeSapDate(value)
	if (!date) throw new Error('A valid pricing validity date is required.')
	const timestamp = Date.parse(`${date}T00:00:00.000Z`)
	if (!Number.isFinite(timestamp)) throw new Error('A valid pricing validity date is required.')
	return `/Date(${timestamp})/`
}

const demandRevenueWrites = new Map()

function buildPricingCondition({ table, type, fields, amount, conditionCurrency, quantityUnit, validityStartDate, validityEndDate }) {
	const startDate = toSapDate(validityStartDate)
	const endDate = toSapDate(validityEndDate)
	return {
		ConditionSequentialNumber: '1',
		ConditionTable: table,
		ConditionApplication: 'V',
		ConditionType: type,
		ConditionValidityStartDate: startDate,
		ConditionValidityEndDate: endDate,
		ConditionCalculationType: 'C',
		ConditionRateValue: String(amount),
		ConditionRateValueUnit: conditionCurrency,
		ConditionRateAmount: String(amount),
		ConditionCurrency: conditionCurrency,
		ConditionQuantity: '1',
		ConditionQuantityUnit: quantityUnit || 'H',
		ConditionIsDeleted: false,
		to_SlsPrcgCndnRecdValidity: {
			results: [{
				ConditionValidityStartDate: startDate,
				ConditionValidityEndDate: endDate,
				ConditionApplication: 'V',
				ConditionType: type,
				...fields,
			}],
		},
	}
}

function buildHeaders(extraHeaders = {}) {
	const headers = {
		Accept: 'application/json',
		...extraHeaders,
	}

	const username =
		process.env.SAP_API_USERNAME || process.env.SAP_CLIENT_ID || process.env.SAP_USERNAME
	const password =
		process.env.SAP_API_PASSWORD || process.env.SAP_CLIENT_SECRET || process.env.SAP_PASSWORD
	const bearerToken = process.env.SAP_API_BEARER_TOKEN

	if (bearerToken) {
		headers.Authorization = `Bearer ${bearerToken}`
	} else if (username && password) {
		headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
	}

	return headers
}

async function parseError(response) {
	let details = ''
	const rawBody = await response.text()

	if (rawBody) {
		try {
			const body = JSON.parse(rawBody)
			details =
				body?.error?.message?.value ||
				body?.error?.message ||
				body?.message ||
				rawBody
		} catch {
			details = rawBody
		}
	}

	return details || `HTTP ${response.status}`
}

function makeSapError({ method, url, status, details, message, payload }) {
	const error = new Error(message)
	error.code = 'sap-request-failed'
	error.details = {
		method,
		url,
		status,
		sapResponse: details,
		...(payload && Object.hasOwn(payload, 'Effort') ? { sentEffort: payload.Effort } : {}),
	}
	return error
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function isProjectNotReadyError(error) {
	const status = error?.details?.status
	const message = `${error?.details?.sapResponse || ''} ${error?.message || ''}`
	return status === 400 && /project\s+.+\s+does\s+not\s+exist/i.test(message)
}

function extractCookieHeader(headers) {
	if (typeof headers.getSetCookie === 'function') {
		const cookies = headers.getSetCookie()
		if (Array.isArray(cookies) && cookies.length > 0) {
			return cookies.map(cookie => cookie.split(';')[0]).join('; ')
		}
	}

	const setCookie = headers.get('set-cookie') || ''
	if (!setCookie) return ''

	return setCookie
		.split(/,(?=[^;]+=[^;]+)/)
		.map(cookie => cookie.split(';')[0].trim())
		.filter(Boolean)
		.join('; ')
}

// Some SAP entity sets, such as DemandSet, support POST but deliberately do not
// implement GET_ENTITYSET. Fetch the CSRF token from the OData service root so
// the token request does not invoke that unsupported entity-set GET handler.
function getCsrfEndpoint(entitySetUrl) {
	if (SAP_CSRF_URL) return SAP_CSRF_URL

	const url = new URL(entitySetUrl)
	const segments = url.pathname.split('/').filter(Boolean)
	segments.pop()
	url.pathname = `/${segments.join('/')}/`
	url.search = ''
	url.hash = ''
	return url.toString()
}

async function fetchJson(url, options = {}, includeEtag = false) {
	const timeout = createTimeoutController(SAP_TIMEOUT_MS)
	try {
		const response = await fetch(url, {
			method: 'GET',
			...options,
			headers: buildHeaders(options.headers),
			signal: timeout.signal,
		})
		if (!response.ok) {
			const details = await parseError(response)
			throw makeSapError({
				method: 'GET',
				url,
				status: response.status,
				details,
				message: `SAP request failed (${response.status}): ${details}`,
			})
		}
		if (SAP_DEBUG) {
			console.log(`[SAP] GET ${url} -> ${response.status}`)
		}
		return includeEtag ? { entity: await response.json(), etag: response.headers.get('etag') } : response.json()
	} catch (error) {
		if (error?.name === 'AbortError') {
			const timeoutError = new Error(`SAP request timed out: GET ${url}`)
			timeoutError.code = 'sap-timeout'
			timeoutError.details = { method: 'GET', url }
			throw timeoutError
		}
		throw error
	} finally {
		timeout.clear()
	}
}

async function getCsrfToken(endpoint) {
	const cached = csrfCache.get(endpoint)
	if (cached && cached.expiresAt > Date.now()) {
		return cached.value
	}

	const timeout = createTimeoutController(SAP_TIMEOUT_MS)
	try {
		const response = await fetch(endpoint, {
			method: 'GET',
			headers: buildHeaders({ 'x-csrf-token': 'Fetch', Accept: 'application/json' }),
			signal: timeout.signal,
		})
		if (!response.ok) {
			const details = await parseError(response)
			throw makeSapError({
				method: 'GET',
				url: endpoint,
				status: response.status,
				details,
				message: `Unable to fetch SAP CSRF token (${response.status}): ${details}`,
			})
		}
		const token = response.headers.get('x-csrf-token') || ''
		const cookie = extractCookieHeader(response.headers)

		if (!token) {
			throw makeSapError({
				method: 'GET',
				url: endpoint,
				status: response.status,
				details: 'Missing x-csrf-token in response headers.',
				message: 'Unable to fetch SAP CSRF token: missing x-csrf-token header.',
			})
		}

		if (!cookie) {
			throw makeSapError({
				method: 'GET',
				url: endpoint,
				status: response.status,
				details: 'Missing session cookie in response headers.',
				message: 'Unable to fetch SAP CSRF session cookie.',
			})
		}
		const value = { token, cookie }
		csrfCache.set(endpoint, { value, expiresAt: Date.now() + SAP_CSRF_CACHE_TTL_MS })
		return value
	} finally {
		timeout.clear()
	}
}

async function postToOData(endpoint, payload, attempt = 1) {
	const csrfEndpoint = getCsrfEndpoint(endpoint)
	const csrf = await getCsrfToken(csrfEndpoint)
	const timeout = createTimeoutController(SAP_TIMEOUT_MS)
	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: buildHeaders({
				'Content-Type': 'application/json',
				'x-csrf-token': csrf.token,
				Cookie: csrf.cookie,
			}),
			body: JSON.stringify(payload),
			signal: timeout.signal,
		})

		if (!response.ok) {
			const details = await parseError(response)
			if (
				response.status === 403 &&
				/csrf/i.test(details) &&
				attempt < 2
			) {
				csrfCache.delete(csrfEndpoint)
				if (SAP_DEBUG) {
					console.warn(`[SAP] CSRF validation failed for ${endpoint}, retrying once.`)
				}
				return postToOData(endpoint, payload, attempt + 1)
			}

			throw makeSapError({
				method: 'POST',
				url: endpoint,
				status: response.status,
				details,
				message: `SAP POST failed (${response.status}): ${details}`,
			})
		}

		if (SAP_DEBUG) {
			console.log(`[SAP] POST ${endpoint} -> ${response.status}`)
		}

		const contentType = response.headers.get('content-type') || ''
		if (!contentType.includes('application/json')) {
			return {}
		}

		return response.json()
	} catch (error) {
		if (error?.name === 'AbortError') {
			const timeoutError = new Error(`SAP request timed out: POST ${endpoint}`)
			timeoutError.code = 'sap-timeout'
			timeoutError.details = { method: 'POST', url: endpoint }
			throw timeoutError
		}
		throw error
	} finally {
		timeout.clear()
	}
}

async function patchToOData(endpoint, payload, attempt = 1, etagMode = false) {
	const csrfEndpoint = getCsrfEndpoint(endpoint)
	const csrf = await getCsrfToken(csrfEndpoint)
	let ifMatch = '*'
	if (etagMode) {
		const options = csrf.cookie && etagMode === 'required' ? { headers: { Cookie: csrf.cookie } } : {}
		const { entity, etag } = await fetchJson(endpoint, options, true)
		ifMatch = etag || entity?.d?.__metadata?.etag || entity?.__metadata?.etag || entity?.d?.ETag || entity?.ETag || ''
		if (!ifMatch && etagMode === 'required') throw new Error('SAP did not return an ETag for the pricing condition record.')
		ifMatch ||= '*'
	}
	const timeout = createTimeoutController(SAP_TIMEOUT_MS)
	try {
		const response = await fetch(endpoint, {
			method: 'PATCH',
			headers: buildHeaders({
				'Content-Type': 'application/json',
				'x-csrf-token': csrf.token,
				Cookie: csrf.cookie,
				'If-Match': ifMatch,
			}),
			body: JSON.stringify(payload),
			signal: timeout.signal,
		})
		if (!response.ok) {
			const details = await parseError(response)
			if (response.status === 403 && /csrf/i.test(details) && attempt < 2) {
				csrfCache.delete(csrfEndpoint)
				return patchToOData(endpoint, payload, attempt + 1, etagMode)
			}
			if (response.status === 412 && etagMode === true && attempt < 2) {
				return patchToOData(endpoint, payload, attempt + 1, true)
			}
			throw makeSapError({ method: 'PATCH', url: endpoint, status: response.status, details, payload, message: `SAP PATCH failed (${response.status}): ${details}` })
		}
		return {}
	} finally {
		timeout.clear()
	}
}

async function deleteFromOData(endpoint, attempt = 1) {
	const csrfEndpoint = getCsrfEndpoint(endpoint)
	const csrf = await getCsrfToken(csrfEndpoint)
	const timeout = createTimeoutController(SAP_TIMEOUT_MS)
	try {
		const response = await fetch(endpoint, {
			method: 'DELETE',
			headers: buildHeaders({ 'x-csrf-token': csrf.token, Cookie: csrf.cookie, 'If-Match': '*' }),
			signal: timeout.signal,
		})
		if (!response.ok) {
			const details = await parseError(response)
			if (response.status === 403 && /csrf/i.test(details) && attempt < 2) {
				csrfCache.delete(csrfEndpoint)
				return deleteFromOData(endpoint, attempt + 1)
			}
			throw makeSapError({ method: 'DELETE', url: endpoint, status: response.status, details, message: `SAP DELETE failed (${response.status}): ${details}` })
		}
		return {}
	} finally {
		timeout.clear()
	}
}

function mapCostCenter(item) {
	return {
		code: item.CostCenter,
		name: item.CostCenterName || item.CostCenter,
		description: item.CostCenterDescription || '',
		companyCode: item.CompanyCode || '',
		profitCenter: item.ProfitCenter || '',
		profitCenterName: item.ProfitCenterName || item.ProfitCenter || '',
		currency: item.CostCenterCurrency || '',
	}
}

function mapCompanyCode(item) {
	return {
		code: item.CompanyCode,
		name: item.CompanyCodeName || item.CompanyCode,
		currency: item.Currency || '',
	}
}

function mapProfitCenter(item) {
	return {
		code: item.ProfitCenter,
		name: item.ProfitCenterLongName || item.ProfitCenterName || item.ProfitCenter,
		buName: item.BUName || '',
		buHead: item.BUHead || item.BusinessUnitHead || '',
		buHeadEmployeeId:
			item.BUHeadEmpID ||
			item.BUHeadEmpId ||
			item.BUHeadEmployeeID ||
			item.BusinessUnitHeadEmployeeID ||
			'',
		sbuHead: item.ProfitCtrResponsiblePersonName || '',
		sbuHeadUserId: item.ProfitCtrResponsibleUser || '',
		standardHierarchy: item.ProfitCenterStandardHierarchy || item.BUName || '',
	}
}

function mapServiceOrganizationCostCenter(item) {
	const orgId = item.ProjectServiceOrganization || item.ServiceOrganization || item.ProjectServiceOrganizationID || item.ServiceOrganizationID || ''
	const orgName =
		item.ProjectServiceOrganizationName ||
		item.ServiceOrganizationName ||
		item.ProjectServiceOrganizationText ||
		item.ServiceOrganizationText ||
		item.OrganizationName ||
		item.Name ||
		orgId
	return {
		costCenter: item.ProjSrvcOrgCostCenter || item.ProjectServiceOrganizationCostCenter || item.CostCenter || '',
		orgId,
		name: orgName,
	}
}

function mapCurrency(item) {
	return {
		code: item.Currency || item.CurrencyCode,
		name: item.CurrencyName || item.Currency || item.CurrencyCode,
	}
}

function mapCustomer(item) {
	return {
		code: item.Customer || item.CustomerID,
		name: item.CustomerName || item.BusinessPartnerName || item.Customer,
		customerAccountGroup: item.CustomerAccountGroup || item.CustomerGroup || '',
		customerGroupName:
			item.AdditionalCustomerGroup1Name || item.CustomerAccountGroup || item.CustomerGroup || '',
		customerGroup:
			item.AdditionalCustomerGroup1 || item.CustomerClassification || item.CustomerGroup || '',
		salesOrganization: item.SalesOrganization || '',
	}
}

function mapBusinessPartner(item) {
	return {
		id: item.BusinessPartner || item.BusinessPartnerID,
		name: item.BusinessPartnerName || item.BusinessPartnerFullName || item.PersonFullName ||
			[item.FirstName, item.LastName].filter(Boolean).join(' ') || item.OrganizationBPName1 || item.BusinessPartner,
	}
}

function mapWorkforcePerson(item) {
	return {
		person: item.Person || item.BusinessPartner || item.PersonID || item.BusinessPartnerID || '',
		personFullName: item.PersonFullName || item.BusinessPartnerName || item.FullName || item.PersonName || item.Person || '',
		personExternalId: item.PersonExternalID || item.PersonExternalId || item.ExternalID || item.ExternalId || '',
		defaultEmailAddress: item.DefaultEmailAddress || item.EmailAddress || item.Email || '',
	}
}

function trimTrailingSlash(value) {
	return value.endsWith('/') ? value.slice(0, -1) : value
}

function toSafeODataString(value) {
	return String(value || '').replace(/'/g, "''")
}

function buildNextProjectId(existingIds, prefix) {
	const normalizedPrefix = prefix.trim()
	const escapedPrefix = normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i')

	let max = 0
	for (const id of existingIds) {
		const match = String(id || '').trim().match(pattern)
		if (!match) continue
		const numericValue = Number(match[1])
		if (Number.isFinite(numericValue) && numericValue > max) {
			max = numericValue
		}
	}

	return `${normalizedPrefix}${max + 1}`
}

async function loadProjectIdsByPrefix(prefix) {
	const safePrefix = toSafeODataString(prefix)
	const query = new URLSearchParams({
		$select: 'ProjectID',
		$filter: `startswith(ProjectID,'${safePrefix}')`,
		$top: '500',
	})

	const payload = await fetchJson(`${PROJECT_SET_URL}?${query.toString()}`)
	return normalizeODataCollection(payload)
		.map(item => item.ProjectID)
		.filter(Boolean)
}

async function loadProjectById(projectId) {
	const safeProjectId = toSafeODataString(projectId)
	const query = new URLSearchParams({
		$select: 'ProjectID',
		$filter: `ProjectID eq '${safeProjectId}'`,
		$top: '1',
	})

	const payload = await fetchJson(`${PROJECT_SET_URL}?${query.toString()}`)
	const rows = normalizeODataCollection(payload)
	return rows.find(item => item?.ProjectID === projectId) || null
}

async function loadProjectDetailsById(projectId) {
	const safeProjectId = toSafeODataString(projectId)
	// The keyed ProjectSet read returns the full project node (including ProjectDesc)
	// on SAP tenants where the collection read omits long text fields.
	try {
		const entity = normalizeODataEntity(await fetchJson(`${PROJECT_SET_URL}('${safeProjectId}')`))
		if (entity?.ProjectID === projectId) return entity
	} catch {
		// Older tenants may only support the filtered entity-set read below.
	}
	const query = new URLSearchParams({
		$filter: `ProjectID eq '${safeProjectId}'`,
		$top: '1',
	})

	const payload = await fetchJson(`${PROJECT_SET_URL}?${query.toString()}`)
	const rows = normalizeODataCollection(payload)
	return rows.find(item => item?.ProjectID === projectId) || null
}

function buildNextWorkPackageId(projectId, existingIds) {
	const prefix = `${String(projectId || '').trim()}.1.`
	let maxSequence = 0

	for (const id of existingIds) {
		const value = String(id || '').trim()
		if (!value.startsWith(prefix)) continue
		const sequence = Number(value.slice(prefix.length))
		if (Number.isInteger(sequence) && sequence > maxSequence) maxSequence = sequence
	}

	return `${prefix}${maxSequence + 1}`
}

async function loadWorkPackageIds(projectId) {
	const safeProjectId = toSafeODataString(projectId)
	const query = new URLSearchParams({
		$select: 'WorkPackageID',
		$filter: `ProjectID eq '${safeProjectId}'`,
		$top: '500',
	})
	const payload = await fetchJson(`${WORK_PACKAGE_SET_URL}?${query.toString()}`)
	return normalizeODataCollection(payload).map(item => item.WorkPackageID).filter(Boolean)
}

async function getODataCollectionFromServiceRoot(serviceRootUrl) {
	const normalizedRoot = trimTrailingSlash(serviceRootUrl)
	const rootPayload = await fetchJson(`${normalizedRoot}/?$format=json`)

	const rootRows = normalizeODataCollection(rootPayload)
	if (rootRows.length > 0) {
		return rootRows
	}

	const entitySets = rootPayload?.d?.EntitySets || rootPayload?.EntitySets || []
	if (!Array.isArray(entitySets) || entitySets.length === 0) {
		return []
	}

	const preferredEntitySet =
		entitySets.find(name => /person|workforce|yy1/i.test(name)) || entitySets[0]
	const entityPayload = await fetchJson(`${normalizedRoot}/${preferredEntitySet}?$format=json`)
	return normalizeODataCollection(entityPayload)
}

export const sapProjectIntegration = {
	async generateProjectId(prefix = PROJECT_ID_PREFIX) {
		const cleanPrefix = String(prefix || '').trim() || 'DEV'

		try {
			const existingIds = await loadProjectIdsByPrefix(cleanPrefix)
			return buildNextProjectId(existingIds, cleanPrefix)
		} catch (error) {
			if (SAP_DEBUG) {
				console.warn(`[SAP] Unable to generate ProjectID from SAP list: ${error?.message || error}`)
			}
			const stamp = Date.now().toString().slice(-6)
			return `${cleanPrefix}${stamp}`
		}
	},

	async waitForProjectAvailability(projectId) {
		const attempts =
			Number.isFinite(SAP_PROJECT_READY_RETRY_ATTEMPTS) && SAP_PROJECT_READY_RETRY_ATTEMPTS > 0
				? SAP_PROJECT_READY_RETRY_ATTEMPTS
				: 6

		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			try {
				const found = await loadProjectById(projectId)
				if (found) return { ok: true }
			} catch (error) {
				if (SAP_DEBUG) {
					console.warn(
						`[SAP] Project visibility check ${attempt}/${attempts} failed for ${projectId}: ${error?.message || error}`,
					)
				}
			}

			if (attempt < attempts) {
				await delay(SAP_PROJECT_READY_RETRY_DELAY_MS)
			}
		}

		const error = new Error(
			`Created project ${projectId} is not yet visible in SAP for role assignment. Please retry responsibilities.`,
		)
		error.code = 'sap-project-not-visible'
		throw error
	},

	async getCostCenters() {
		const payload = await fetchJson(COST_CENTER_URL)
		return normalizeODataCollection(payload).map(mapCostCenter).filter(item => item.code)
	},

	async getCostCenterCompanyCode(costCenter) {
		const query = new URLSearchParams({
			$filter: `CostCenter eq '${toSafeODataString(costCenter)}'`,
			$select: 'CostCenter,CompanyCode',
		})
		const rows = await fetchAllODataCollection(`${COST_CENTER_URL}?${query.toString()}`)
		const companyCodes = new Set(rows
			.filter(row => String(row.CostCenter || '').trim() === costCenter)
			.map(row => String(row.CompanyCode || '').trim())
			.filter(Boolean))
		return companyCodes.size === 1 ? companyCodes.values().next().value : ''
	},

	async getCompanyCodes() {
		const payload = await fetchJson(`${COMPANY_DATA_URL}?$format=json`)
		return normalizeODataCollection(payload).map(mapCompanyCode).filter(item => item.code)
	},

	async getProfitCenters() {
		const mappingQuery = new URLSearchParams({ $format: 'json', $top: '1000' })
		const masterQuery = new URLSearchParams({
			$select: 'ProfitCenter,ProfitCenterName,ProfitCenterLongName,ProfitCenterStandardHierarchy,ProfitCtrResponsiblePersonName,ProfitCtrResponsibleUser',
			$top: '1000',
		})
		const [mappingResult, masterResult] = await Promise.allSettled([
			fetchAllODataCollection(`${PROFIT_CENTER_URL}?${mappingQuery.toString()}`),
			fetchAllODataCollection(`${PROFIT_CENTER_MASTER_URL}?${masterQuery.toString()}`),
		])
		if (mappingResult.status === 'rejected') throw mappingResult.reason
		const mappingItems = mappingResult.value
		const masterItems = masterResult.status === 'fulfilled' ? masterResult.value : []

		const profitCentersByCode = new Map()
		for (const item of masterItems.map(mapProfitCenter)) {
			if (item.code && !profitCentersByCode.has(item.code)) profitCentersByCode.set(item.code, item)
		}
		for (const item of mappingItems.map(mapProfitCenter)) {
			if (!item.code) continue
			const masterItem = profitCentersByCode.get(item.code)
			profitCentersByCode.set(item.code, {
				...masterItem,
				...item,
				name: masterItem?.name || item.name,
				buHead: item.buHead || masterItem?.buHead,
				buHeadEmployeeId: masterItem?.buHeadEmployeeId || item.buHeadEmployeeId,
				sbuHead: masterItem?.sbuHead || item.sbuHead,
				sbuHeadUserId: masterItem?.sbuHeadUserId || item.sbuHeadUserId,
				standardHierarchy: masterItem?.standardHierarchy || item.standardHierarchy,
			})
		}

		return [...profitCentersByCode.values()]
	},

	async getServiceOrganizationCostCenters() {
		const payload = await fetchJson(SERVICE_ORGANIZATION_COST_CENTER_URL)
		return normalizeODataCollection(payload)
			.map(mapServiceOrganizationCostCenter)
			.filter(item => item.costCenter && item.orgId)
	},

	async getServiceOrganizationTexts() {
		const payload = await fetchJson(SERVICE_ORGANIZATION_TEXT_URL)
		return normalizeODataCollection(payload)
			.map(item => ({
				code: item.ProjectServiceOrganization || '',
				name: item.ProjSrvcOrgName || '',
				language: item.Language || '',
			}))
			.filter(item => item.code && item.name)
	},

	async getDemandCostRate({ workPackageId, wbsElementExternalID, workItem, activityType, deliveryServiceOrg, companyCode }) {
		const organizationFilter = `ProjectServiceOrganization eq '${toSafeODataString(deliveryServiceOrg)}'`
		const orgQuery = new URLSearchParams({ $filter: organizationFilter, $top: '1' })
		const costCenterQuery = new URLSearchParams({ $filter: organizationFilter })
		const [orgPayload, orgCostCenters] = await Promise.all([
			fetchJson(`${SERVICE_ORGANIZATION_URL}?${orgQuery.toString()}`),
			fetchAllODataCollection(`${SERVICE_ORGANIZATION_COST_CENTER_URL}?${costCenterQuery.toString()}`),
		])
		const organization = normalizeODataCollection(orgPayload)[0]
		const sourceCompanyCode = String(organization?.ProjSrvcOrgCompanyCode || '').trim()
		const mappedCostCenters = orgCostCenters.filter(row => String(row.ProjSrvcOrgCostCenter || '').trim())
		const mainCostCenter = mappedCostCenters.find(row =>
			String(row.ProjSrvcOrgIsMainCostCenter || '').trim().toUpperCase() === 'X' || isSapTrue(row.ProjSrvcOrgIsMainCostCenter),
		)
		const costCenter = String((mainCostCenter || mappedCostCenters[0])?.ProjSrvcOrgCostCenter || '').trim()
		if (!sourceCompanyCode || !costCenter) return null

		const receivingCompany = String(companyCode || '').trim()
		const wbs = String(wbsElementExternalID || workPackageId || '').trim()
		const item = String(workItem || '').trim()
		const combinations = [
			receivingCompany && { ReceivingCompanyCode: receivingCompany, WBSElementExternalID: '', WorkItem: '' },
			wbs && item && { ReceivingCompanyCode: '', WBSElementExternalID: wbs, WorkItem: item },
			wbs && { ReceivingCompanyCode: '', WBSElementExternalID: wbs, WorkItem: '' },
			item && { ReceivingCompanyCode: '', WBSElementExternalID: '', WorkItem: item },
			{ ReceivingCompanyCode: '', WBSElementExternalID: '', WorkItem: '' },
		]
		const baseFields = { CompanyCode: sourceCompanyCode, CostCenter: costCenter, ActivityType: String(activityType || '').trim() }
		for (const combination of combinations) {
			if (!combination) continue
			const fields = Object.entries({ ...baseFields, ...combination })
			// SAP may omit blank fields, so match blank dimensions locally.
			const filter = fields.filter(([, value]) => value)
				.map(([field, value]) => `${field} eq '${toSafeODataString(value)}'`).join(' and ')
			const query = new URLSearchParams({ $filter: filter, $format: 'json' })
			const rates = await fetchAllODataCollection(`${SERVICE_COST_RATE_URL}?${query.toString()}`)
			const rate = rates.find(row => {
				const amount = row.CostRateTotalAmount ?? row.CostRateFixedAmount ?? row.CostRateVarblAmount
				return fields.every(([field, value]) => String(row[field] ?? '').trim() === value) &&
					amount != null && String(amount).trim() !== '' && Number.isFinite(Number(amount))
			})
			if (rate) return rate
		}
		return null
	},

	async getCurrencyExchangeRates({ targetCurrency, sourceCurrencies = [] }) {
		const target = String(targetCurrency || '').trim().toUpperCase()
		const sources = [...new Set(sourceCurrencies.map(currency => String(currency || '').trim().toUpperCase()).filter(currency => currency && currency !== target))]
		if (!target || !sources.length) return []

		const sourceFilter = sources.map(source => `SourceCurrency eq '${toSafeODataString(source)}'`).join(' or ')
		const filter = `(ExchangeRateType eq 'M' or ExchangeRateType eq 'P') and TargetCurrency eq '${toSafeODataString(target)}' and (${sourceFilter})`
		const query = new URLSearchParams({ $filter: filter, $format: 'json' })
		const rows = await fetchAllODataCollection(`${EXCHANGE_RATE_URL}?${query.toString()}`)
		const today = new Date().toISOString().slice(0, 10)
		const latestBySource = new Map()
		for (const row of rows) {
			const exchangeRateType = String(row.ExchangeRateType || '').trim().toUpperCase()
			if (exchangeRateType !== 'M' && exchangeRateType !== 'P') continue
			if (String(row.TargetCurrency || '').trim().toUpperCase() !== target) continue
			const sourceCurrency = String(row.SourceCurrency || '').trim().toUpperCase()
			if (!sources.includes(sourceCurrency)) continue
			const rate = Number(row.ExchangeRate)
			const effectiveDate = normalizeSapDate(row.ExchangeRateEffectiveDate)
			if (!effectiveDate || effectiveDate > today || !Number.isFinite(rate) || rate === 0) continue
			const latest = latestBySource.get(sourceCurrency)
			const preferSameDateM = effectiveDate === latest?.effectiveDate && exchangeRateType === 'M' && latest.exchangeRateType === 'P'
			if (!latest || effectiveDate > latest.effectiveDate || preferSameDateM) latestBySource.set(sourceCurrency, {
				sourceCurrency,
				targetCurrency: target,
				exchangeRateType,
				effectiveDate,
				exchangeRate: Math.abs(rate),
				quotation: rate < 0 ? 'indirect' : 'direct',
			})
		}
		return [...latestBySource.values()]
	},

	async getDemandRevenueRates({ projectId, customer, salesOrganization = '1000', rows = [] }, onlyTable507 = false) {
		const today = new Date().toISOString().slice(0, 10)
		const materialKeys = [...new Set(rows.map(row => String(row.material || '').trim()).filter(Boolean))]
		const validityByMaterial = new Map()
		await Promise.all(materialKeys.flatMap(material => (onlyTable507 ? ['PSP0'] : ['PCP0', 'PSP0']).map(async conditionType => {
			const filter = `ConditionType eq '${conditionType}' and Material eq '${toSafeODataString(material)}'`
			const query = new URLSearchParams({ $filter: filter, $format: 'json' })
			const records = await fetchAllODataCollection(`${PRICING_CONDITION_VALIDITY_URL}?${query.toString()}`)
			validityByMaterial.set(`${conditionType}:${material}`, records)
		})))

		const matches = rows.map(row => {
			const material = String(row.material || '').trim()
			if (!material || row.billable === false) return null
			const org = String(row.deliveryServiceOrg || '').trim()
			const workItem = String(row.workItem || '').trim()
			const workPackage = String(row.workPackage || '').trim()
			const table507 = { type: 'PSP0', table: '507', fields: { EngagementProjectServiceOrg: org, Customer: String(customer || '').trim(), WorkPackage: workPackage } }
			const conditions = onlyTable507 ? [table507] : [
				{ type: 'PCP0', table: '4PB', fields: { EngagementProject: String(projectId || '').trim() } },
				{ type: 'PSP0', table: '509', fields: { EngagementProjectServiceOrg: org, WorkItem: workItem } },
				table507,
				{ type: 'PSP0', table: '508', fields: { EngagementProjectServiceOrg: org, Customer: String(customer || '').trim() } },
				{ type: 'PSP0', table: '505', fields: { EngagementProjectServiceOrg: org } },
				{ type: 'PSP0', table: '304', fields: { SalesOrganization: String(salesOrganization || '1000').trim() } },
			]
			const prioritizedMatches = []
			for (let priority = 0; priority < conditions.length; priority += 1) {
				const condition = conditions[priority]
				const validityRecords = validityByMaterial.get(`${condition.type}:${material}`) || []
				const matching = validityRecords.filter(record => {
					const startDate = normalizeSapDate(record.ConditionValidityStartDate)
					const endDate = normalizeSapDate(record.ConditionValidityEndDate)
					return (!onlyTable507 || !isSapTrue(record.ConditionIsDeleted)) &&
						Object.entries(condition.fields).every(([field, expected]) => expected && String(record[field] || '').trim() === expected) &&
						(!record.ConditionValidityStartDate || Boolean(startDate && startDate <= today)) &&
						(!record.ConditionValidityEndDate || Boolean(endDate && endDate >= today))
				}).sort((left, right) => normalizeSapDate(right.ConditionValidityStartDate).localeCompare(normalizeSapDate(left.ConditionValidityStartDate)))
				prioritizedMatches.push(...matching
					.filter(record => record.ConditionRecord)
					.map(record => ({
						conditionRecord: String(record.ConditionRecord),
						conditionType: condition.type,
						conditionTable: condition.table,
						priority: priority + 1,
					})))
			}
			return prioritizedMatches.length ? prioritizedMatches : null
		})

		const conditionRecordsByType = new Map()
		for (const match of matches.filter(Boolean).flat()) {
			const key = `${match.conditionType}:${match.conditionTable}`
			const records = conditionRecordsByType.get(key) || new Set()
			records.add(match.conditionRecord)
			conditionRecordsByType.set(key, records)
		}
		const detailsByRecord = new Map()
		if (conditionRecordsByType.size) {
			const details = (await Promise.all([...conditionRecordsByType.entries()].flatMap(([key, records]) => {
				const [conditionType, conditionTable] = key.split(':')
				const conditionRecords = [...records]
				return Array.from({ length: Math.ceil(conditionRecords.length / 30) }, async (_, chunkIndex) => {
					const chunk = conditionRecords.slice(chunkIndex * 30, chunkIndex * 30 + 30)
					const conditionRecordFilter = chunk.map(id => `ConditionRecord eq '${toSafeODataString(id)}'`).join(' or ')
					const filter = `(${conditionRecordFilter}) and ConditionTable eq '${conditionTable}' and ConditionType eq '${conditionType}' and ConditionReleaseStatus eq ''`
					const query = new URLSearchParams({ $filter: filter, $format: 'json' })
					return fetchAllODataCollection(`${PRICING_CONDITION_RECORD_URL}?${query.toString()}`)
				})
			}))).flat()
			for (const detail of details) {
				if (detail.ConditionIsDeleted === true || String(detail.ConditionIsDeleted).trim().toLowerCase() === 'true') continue
				if (String(detail.ConditionReleaseStatus || '').trim() !== '') continue
				if (!onlyTable507 && !Number.isFinite(Number(detail.ConditionRateValue))) continue
				const key = `${detail.ConditionType}:${detail.ConditionTable}:${detail.ConditionRecord}`
				const current = detailsByRecord.get(key) || []
				current.push(detail)
				detailsByRecord.set(key, current)
			}
			for (const detailsForRecord of detailsByRecord.values()) {
				detailsForRecord.sort((left, right) => Number(left.ConditionSequentialNumber || 0) - Number(right.ConditionSequentialNumber || 0))
			}
		}
		return matches.map((rowCandidates, rowIndex) => {
			for (const match of rowCandidates || []) {
				const detailKey = `${match.conditionType}:${match.conditionTable}:${match.conditionRecord}`
				const detail = detailsByRecord.get(detailKey)?.[0]
				if (detail) {
					const conditionRate = Number(detail.ConditionRateValue)
					const pricingQuantity = Number(detail.ConditionQuantity)
					const conditionQuantity = Number.isFinite(pricingQuantity) && pricingQuantity > 0 ? pricingQuantity : 1
					const unitRate = conditionRate / conditionQuantity
					return {
						conditionRecord: match.conditionRecord,
						priority: match.priority,
						// The app's demand detail endpoint already exposes the SAP condition
						// amount as the rate for an additional resource. Keep recalculation
						// consistent with that value: dividing by ConditionQuantity here
						// can inflate the unit price when SAP stores a fractional condition
						// quantity (for example 0.01).
						rate: conditionRate,
						unitRate,
						conditionQuantity,
						currency: onlyTable507
							? detail.ConditionRateValueUnit || detail.ConditionCurrency || ''
							: detail.ConditionCurrency || detail.ConditionRateValueUnit || '',
						unit: detail.ConditionQuantityUnit || '',
					}
				}
			}
			return null
		})
	},

	async saveDemandRevenueRate({ material, deliveryServiceOrg, customer, workPackage, rate, currency, unit }) {
		const product = String(material || '').trim()
		const org = String(deliveryServiceOrg || '').trim()
		const customerCode = String(customer || '').trim()
		const packageId = String(workPackage || '').trim()
		const amount = String(rate ?? '').trim()
		const conditionCurrency = String(currency || '').trim().toUpperCase()
		if (!product || !org || !customerCode || !packageId) {
			throw new Error('Material, delivery service organization, customer, and work package are required for table 507 pricing.')
		}
		if (!/^\d+(?:\.\d+)?$/.test(amount) || !Number.isFinite(Number(amount)) || !/^[A-Z]{3}$/.test(conditionCurrency)) {
			throw new Error('Enter a valid non-negative revenue rate and currency.')
		}

		const key = JSON.stringify([product, org, customerCode, packageId])
		const previous = demandRevenueWrites.get(key)
		const write = (async () => {
			// Re-read SAP after any in-flight save for the same combination.
			await previous?.catch(() => {})
			const [existing] = await this.getDemandRevenueRates({
				customer: customerCode,
				rows: [{ material: product, deliveryServiceOrg: org, workPackage: packageId }],
			}, true)
			if (existing) {
				const { conditionRecord } = existing
				const existingCurrency = String(existing.currency || '').trim().toUpperCase()
				if (!/^[A-Z]{3}$/.test(existingCurrency)) throw new Error('The existing table 507 record has no valid pricing currency.')
				let existingCurrencyAmount = amount
				if (existingCurrency !== conditionCurrency) {
					const [exchange] = await this.getCurrencyExchangeRates({
						targetCurrency: conditionCurrency,
						sourceCurrencies: [existingCurrency],
					})
					if (!exchange) throw new Error(`The exchange rate for ${existingCurrency} to ${conditionCurrency} is unavailable.`)
					const convertedAmount = exchange.quotation === 'indirect'
						? Number(amount) * exchange.exchangeRate
						: Number(amount) / exchange.exchangeRate
					existingCurrencyAmount = convertedAmount.toFixed(10).replace(/\.?0+$/, '')
				}
				if (existing.rate === Number(existingCurrencyAmount)) {
					return { action: 'unchanged', conditionRecord }
				}
				await patchToOData(
					`${PRICING_CONDITION_RECORD_URL}('${toSafeODataString(conditionRecord)}')`,
					{ ConditionRateValue: existingCurrencyAmount, ConditionRateValueUnit: existingCurrency },
					1,
					'required',
				)
				return { action: 'updated', conditionRecord }
			}

			const orgQuery = new URLSearchParams({
				$filter: `ProjectServiceOrganization eq '${toSafeODataString(org)}'`,
				$select: 'ProjSrvcOrgDistributionChannel',
				$top: '1',
			})
			const orgRows = normalizeODataCollection(await fetchJson(`${SERVICE_ORGANIZATION_URL}?${orgQuery.toString()}`))
			const distributionChannel = String(orgRows[0]?.ProjSrvcOrgDistributionChannel || '').trim()
			if (!distributionChannel) throw new Error(`SAP has no distribution channel for delivery organization ${org}.`)

			const payload = buildPricingCondition({
				table: '507',
				type: 'PSP0',
				fields: { Material: product, EngagementProjectServiceOrg: org, Customer: customerCode, WorkPackage: packageId, DistributionChannel: distributionChannel },
				amount,
				conditionCurrency,
				quantityUnit: String(unit || '').trim().toUpperCase() || 'H',
				validityStartDate: new Date().toISOString().slice(0, 10),
				validityEndDate: '9999-12-31',
			})
			const created = await postToOData(PRICING_CONDITION_RECORD_URL, payload)
			return { action: 'created', conditionRecord: String(created?.ConditionRecord || created?.d?.ConditionRecord || '') }
		})()
		demandRevenueWrites.set(key, write)
		try {
			return await write
		} finally {
			if (demandRevenueWrites.get(key) === write) demandRevenueWrites.delete(key)
		}
	},

	async getProjectServicePrices({ projectId, salesOrganization }) {
		const today = new Date().toISOString().slice(0, 10)
		const readValidity = async filter => {
			const query = new URLSearchParams({ $filter: filter, $format: 'json' })
			return fetchAllODataCollection(`${PRICING_CONDITION_VALIDITY_URL}?${query.toString()}`)
		}
		const [standardRecords, projectRecords] = await Promise.all([
			readValidity(`ConditionType eq 'PSP0' and SalesOrganization eq '${toSafeODataString(salesOrganization)}'`),
			projectId ? readValidity(`ConditionType eq 'PCP0' and EngagementProject eq '${toSafeODataString(projectId)}'`) : Promise.resolve([]),
		])
		const standardActiveRecords = standardRecords.filter(record => {
			const start = normalizeSapDate(record.ConditionValidityStartDate)
			const end = normalizeSapDate(record.ConditionValidityEndDate)
			return (!record.ConditionValidityStartDate || Boolean(start && start <= today)) && (!record.ConditionValidityEndDate || Boolean(end && end >= today))
		})
		const projectActiveRecords = projectRecords.filter(record => {
			if (isSapTrue(record.ConditionIsExclusive) || isSapTrue(record.ConditionIsDeleted)) return false
			const start = normalizeSapDate(record.ConditionValidityStartDate)
			const end = normalizeSapDate(record.ConditionValidityEndDate)
			return (!record.ConditionValidityStartDate || Boolean(start && start <= today)) && (!record.ConditionValidityEndDate || Boolean(end && end >= today))
		})
		const readConditionDetails = async (records, table, type) => {
			const ids = [...new Set(records.map(record => String(record.ConditionRecord || '')).filter(Boolean))]
			if (!ids.length) return new Map()
			const idFilter = ids.map(id => `ConditionRecord eq '${toSafeODataString(id)}'`).join(' or ')
			const filter = `(${idFilter}) and ConditionTable eq '${table}' and ConditionType eq '${type}' and ConditionReleaseStatus eq ''`
			const query = new URLSearchParams({ $filter: filter, $format: 'json' })
			const details = await fetchAllODataCollection(`${PRICING_CONDITION_RECORD_URL}?${query.toString()}`)
			return new Map(details.filter(detail => String(detail.ConditionIsDeleted).toLowerCase() !== 'true').map(detail => [String(detail.ConditionRecord), detail]))
		}
		const [standardDetails, projectDetails] = await Promise.all([
			readConditionDetails(standardRecords, '304', 'PSP0'),
			readConditionDetails(projectActiveRecords, '4PB', 'PCP0'),
		])
		const latestProjectByMaterial = new Map()
		for (const record of projectActiveRecords) {
			const detail = projectDetails.get(String(record.ConditionRecord || ''))
			if (!detail || !Number.isFinite(Number(detail.ConditionRateValue))) continue
			const material = String(record.Material || '').trim()
			const current = latestProjectByMaterial.get(material)
			if (!current || normalizeSapDate(record.ConditionValidityStartDate) > normalizeSapDate(current.validityStartDate)) {
				latestProjectByMaterial.set(material, {
					conditionRecord: String(record.ConditionRecord),
					validityStartDate: normalizeSapDate(record.ConditionValidityStartDate),
					validityEndDate: normalizeSapDate(record.ConditionValidityEndDate),
					rate: String(detail.ConditionRateValue),
					currency: detail.ConditionCurrency || detail.ConditionRateValueUnit || '',
				})
			}
		}
		return standardRecords.map(record => {
			const detail = standardDetails.get(String(record.ConditionRecord || ''))
			if (!detail || !Number.isFinite(Number(detail.ConditionRateValue))) return null
			const material = String(record.Material || '').trim()
			return {
				material,
				standardConditionRecord: String(record.ConditionRecord),
				validityStartDate: normalizeSapDate(record.ConditionValidityStartDate),
				validityEndDate: normalizeSapDate(record.ConditionValidityEndDate),
				current: standardActiveRecords.includes(record),
				standardRate: String(detail.ConditionRateValue),
				standardCurrency: detail.ConditionCurrency || detail.ConditionRateValueUnit || '',
				unit: detail.ConditionQuantityUnit || '',
				projectPrice: latestProjectByMaterial.get(material) || null,
			}
		}).filter(Boolean).sort((left, right) => left.material.localeCompare(right.material) || right.validityStartDate.localeCompare(left.validityStartDate))
	},

	async updateProjectServicePrice({ projectId, material, rate, currency, unit, validityStartDate, validityEndDate }) {
		const project = String(projectId || '').trim()
		const product = String(material || '').trim()
		const amount = Number(rate)
		const conditionCurrency = String(currency || '').trim().toUpperCase()
		const quantityUnit = String(unit || 'H').trim()
		if (!project || !product) throw new Error('Project ID and service material are required to save project pricing.')
		if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid project-specific service price.')
		if (!conditionCurrency) throw new Error('A currency is required to save project pricing.')

		const validityFilter = `ConditionType eq 'PCP0' and EngagementProject eq '${toSafeODataString(project)}' and Material eq '${toSafeODataString(product)}'`
		const validityQuery = new URLSearchParams({ $filter: validityFilter, $format: 'json' })
		const validityRecords = await fetchAllODataCollection(`${PRICING_CONDITION_VALIDITY_URL}?${validityQuery.toString()}`)
		const eligibleRecords = validityRecords
			.filter(record => String(record.EngagementProject || '').trim() === project &&
				String(record.Material || '').trim() === product &&
				String(record.ConditionType || '').trim() === 'PCP0' &&
				!isSapTrue(record.ConditionIsExclusive) &&
				// SAP exposes ConditionIsDeleted on the condition record entity; the
				// validity entity may omit it. Reject an explicitly deleted validity
				// row, but let the condition record detail determine update eligibility.
				!isSapTrue(record.ConditionIsDeleted))
			.sort((left, right) => normalizeSapDate(right.ConditionValidityStartDate).localeCompare(normalizeSapDate(left.ConditionValidityStartDate)))
		const recordIds = [...new Set(eligibleRecords.map(record => String(record.ConditionRecord || '').trim()).filter(Boolean))]
		let detailsById = new Map()
		if (recordIds.length) {
			const idFilter = recordIds.map(id => `ConditionRecord eq '${toSafeODataString(id)}'`).join(' or ')
			const detailFilter = `(${idFilter}) and ConditionTable eq '4PB' and ConditionType eq 'PCP0'`
			const detailQuery = new URLSearchParams({ $filter: detailFilter, $format: 'json' })
			const details = await fetchAllODataCollection(`${PRICING_CONDITION_RECORD_URL}?${detailQuery.toString()}`)
			detailsById = new Map(details.map(detail => [String(detail.ConditionRecord || '').trim(), detail]))
		}

		const existingValidity = eligibleRecords.find(record => {
			const detail = detailsById.get(String(record.ConditionRecord || '').trim())
			return detail && isSapFalse(detail.ConditionIsDeleted) && String(detail.ConditionReleaseStatus || '').trim() === ''
		})
		if (existingValidity) {
			const conditionRecord = String(existingValidity.ConditionRecord).trim()
			const detail = detailsById.get(conditionRecord)
			const updatePayload = {
				ConditionRateValue: String(amount),
				ConditionRateValueUnit: conditionCurrency,
				ConditionRateAmount: String(amount),
				ConditionCurrency: conditionCurrency,
				ConditionQuantity: String(detail.ConditionQuantity || '1'),
				ConditionQuantityUnit: quantityUnit || detail.ConditionQuantityUnit || 'H',
				ConditionCalculationType: detail.ConditionCalculationType || 'C',
			}
			await patchToOData(`${PRICING_CONDITION_RECORD_URL}('${toSafeODataString(conditionRecord)}')`, updatePayload, 1, true)
			return { status: 'success', action: 'updated', conditionRecord }
		}

		const createPayload = buildPricingCondition({
			table: '4PB', type: 'PCP0', fields: { EngagementProject: project, Material: product },
			amount, conditionCurrency, quantityUnit, validityStartDate, validityEndDate,
		})
		const created = await postToOData(PRICING_CONDITION_RECORD_URL, createPayload)
		return { status: 'success', action: 'created', conditionRecord: String(created?.ConditionRecord || created?.d?.ConditionRecord || '') }
	},

	async getProfitCenterByCode(code) {
		const safeCode = toSafeODataString(code)
		const query = new URLSearchParams({
			$format: 'json',
			$filter: `ProfitCenter eq '${safeCode}'`,
		})
		const payload = await fetchJson(`${PROFIT_CENTER_URL}?${query.toString()}`)
		const all = normalizeODataCollection(payload)
		const selected = all.find(item => String(item.ProfitCenter || '').trim() === String(code || '').trim())
		return selected ? mapProfitCenter(selected) : null
	},

	async getCurrencies() {
		const payload = await fetchJson(CURRENCY_URL)
		return normalizeODataCollection(payload)
			.map(mapCurrency)
			.filter(item => item.code)
	},

	async getCustomersBySalesOrg(salesOrganization) {
		const encodedSalesOrg = encodeURIComponent(salesOrganization)
		const payload = await fetchJson(`${CUSTOMER_URL}?$filter=SalesOrganization eq '${encodedSalesOrg}'`)
		return normalizeODataCollection(payload)
			.map(mapCustomer)
			.filter(item => item.code && item.salesOrganization === salesOrganization)
	},

	async getCustomerData() {
		const payload = await fetchJson(CUSTOMER_DATA_URL)
		const customersByCodeAndGroup = new Map()
		for (const customer of normalizeODataCollection(payload).map(mapCustomer)) {
			if (!customer.code) continue
			const key = `${customer.code}::${customer.customerGroup}`
			if (!customersByCodeAndGroup.has(key)) customersByCodeAndGroup.set(key, customer)
		}
		return [...customersByCodeAndGroup.values()]
	},

	async getCustomerPaymentTerms({ customerCode, companyCode }) {
		const safeCustomerCode = toSafeODataString(customerCode)
		const safeCompanyCode = toSafeODataString(companyCode)
		const query = new URLSearchParams({
			$filter: `Customer eq '${safeCustomerCode}' and CompanyCode eq '${safeCompanyCode}'`,
			$format: 'json',
		})
		const rows = await fetchAllODataCollection(`${CUSTOMER_PAYMENT_TERMS_URL}?${query.toString()}`)
		const match = rows.find(row =>
			String(row.Customer || '').trim() === String(customerCode || '').trim() &&
			String(row.CompanyCode || '').trim() === String(companyCode || '').trim(),
		)
		return {
			paymentTerms: match?.CustomerPaymentTerms || '',
			paymentTermsName: match?.CustomerPaymentTermsName || '',
		}
	},

	async getBusinessPartners() {
		const rows = await fetchAllODataCollection(BUSINESS_PARTNER_URL)
		return rows
			.map(mapBusinessPartner)
			.filter(item => item.id)
	},

	async getWorkforceDirectory() {
		const rows = await fetchAllODataCollection(`${WORKFORCE_ENTITY_URL}?$format=json`)
		return rows
			.map(mapWorkforcePerson)
			.filter(item => item.person)
	},

	async createProject(projectPayload) {
		const payload = await postToOData(PROJECT_SET_URL, projectPayload)
		const data = normalizeODataEntity(payload)
		const generatedProjectId = data?.ProjectID || data?.d?.ProjectID || ''
		if (!generatedProjectId) {
			throw new Error('SAP response did not return ProjectID.')
		}
		return {
			projectId: generatedProjectId,
			raw: payload,
		}
	},

	async createProjectRole(rolePayload) {
		const maxAttempts = Number.isFinite(SAP_ROLE_RETRY_ATTEMPTS) && SAP_ROLE_RETRY_ATTEMPTS > 0
			? SAP_ROLE_RETRY_ATTEMPTS
			: 3

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				await postToOData(PROJECT_ROLE_SET_URL, rolePayload)
				return { ok: true }
			} catch (error) {
				const shouldRetry = isProjectNotReadyError(error) && attempt < maxAttempts
				if (!shouldRetry) {
					throw error
				}

				if (SAP_DEBUG) {
					console.warn(
						`[SAP] Project role retry ${attempt}/${maxAttempts} for ProjectID ${rolePayload.ProjectID}: ${error?.message || error}`,
					)
				}

				await delay(SAP_ROLE_RETRY_DELAY_MS)
			}
		}

		return { ok: true }
	},

	async getProjectRoles(projectId) {
		const safeProjectId = toSafeODataString(projectId)
		const query = new URLSearchParams({ $filter: `ProjectID eq '${safeProjectId}'`, $top: '100' })
		const payload = await fetchJson(`${PROJECT_ROLE_SET_URL}?${query.toString()}`)
		return normalizeODataCollection(payload)
	},

	async getProjectNatures() {
		const rows = await fetchAllODataCollection(`${PROJECT_NATURE_SET_URL}?${new URLSearchParams({ $top: '1000' }).toString()}`)
		return rows
			.map(item => ({ code: String(item.Code || '').trim(), name: String(item.Description || item.Code || '').trim() }))
			.filter(item => item.code)
	},

	async updateProjectStage(projectId, projectStage) {
		const safeProjectId = toSafeODataString(projectId)
		await patchToOData(`${PROJECT_SET_URL}('${safeProjectId}')`, { ProjectStage: projectStage })
		return { ok: true }
	},

	async updateProject(projectId, projectPayload) {
		const safeProjectId = toSafeODataString(projectId)
		await patchToOData(`${PROJECT_SET_URL}('${safeProjectId}')`, projectPayload)
		return { ok: true }
	},

	async updateProjectRole(projectId, projectRoleId, businessPartnerId) {
		const safeProjectId = toSafeODataString(projectId)
		const safeProjectRoleId = toSafeODataString(projectRoleId)
		await patchToOData(
			`${PROJECT_ROLE_SET_URL}(ProjectID='${safeProjectId}',ProjectRoleID='${safeProjectRoleId}')`,
			{ BusinessPartnerID: businessPartnerId },
		)
		return { ok: true }
	},

	async generateWorkPackageId(projectId) {
		const existingIds = await loadWorkPackageIds(projectId)
		return buildNextWorkPackageId(projectId, existingIds)
	},

	async getExistingWorkPackageIds({ projectId, workPackageIds }) {
		const safeProjectId = toSafeODataString(projectId)
		const found = new Set()
		for (let offset = 0; offset < workPackageIds.length; offset += 25) {
			const ids = workPackageIds.slice(offset, offset + 25).map(toSafeODataString).filter(Boolean)
			if (!ids.length) continue
			const filter = `ProjectID eq '${safeProjectId}' and (${ids.map(id => `WorkPackageID eq '${id}'`).join(' or ')})`
			const query = new URLSearchParams({ $select: 'WorkPackageID', $filter: filter, $top: '1000', $format: 'json' })
			const payload = await fetchJson(`${WORK_PACKAGE_SET_URL}?${query.toString()}`)
			for (const item of normalizeODataCollection(payload)) if (item.WorkPackageID) found.add(String(item.WorkPackageID))
		}
		return [...found]
	},

	async getProjectWorkspace(projectId) {
		const project = await loadProjectDetailsById(projectId)
		if (!project) return null
		const safeProjectId = toSafeODataString(projectId)
		const query = new URLSearchParams({ $filter: `ProjectID eq '${safeProjectId}'`, $top: '500' })
		const workPackages = normalizeODataCollection(await fetchJson(`${WORK_PACKAGE_SET_URL}?${query.toString()}`))
		return { project, workPackages }
	},

	async getProjectForUpdate(projectId) {
		return loadProjectDetailsById(projectId)
	},

	async getRecentProjects() {
		const query = new URLSearchParams({ $top: '1000', $orderby: 'ChangedOn desc' })
		const payload = await fetchJson(`${PROJECT_SET_URL}?${query.toString()}`)
		return normalizeODataCollection(payload)
	},

	async getCustomerProjectSalesOrders() {
		const query = new URLSearchParams({ $top: '5000' })
		const payload = await fetchJson(`${CUSTOMER_PROJECT_SALES_ORDER_URL}?${query.toString()}`)
		return normalizeODataCollection(payload)
	},

	async createCustomerProjectSalesOrderItem({ projectId, salesOrderId, item }) {
		const safeProjectId = toSafeODataString(projectId)
		const safeSalesOrderId = toSafeODataString(salesOrderId)
		if (!safeProjectId || !safeSalesOrderId) throw new Error('Project and existing sales order are required to add a billing item.')
		const orders = await this.getCustomerProjectSalesOrders()
		const order = orders.find(entry => String(entry.CustomerProject || entry.ProjectID || entry.Project || '').trim().toUpperCase() === safeProjectId.toUpperCase() && String(entry.SalesOrder || '').trim() === safeSalesOrderId)
		if (!order) throw new Error(`Sales order ${safeSalesOrderId} was not found for project ${safeProjectId}.`)
		const sapProjectId = String(order.CustomerProject || order.ProjectID || order.Project || safeProjectId).trim()
		return postToOData(CUSTOMER_PROJECT_SALES_ORDER_ITEM_URL, {
			...item,
			CustomerProject: sapProjectId,
		})
	},

	async getWorkPackageServices({ workPackageId }) {
		const query = new URLSearchParams({
			$filter: `WorkPackage eq '${toSafeODataString(workPackageId)}'`,
			$format: 'json',
			$top: '1000',
		})
		return normalizeODataCollection(await fetchJson(`${WORK_PACKAGE_SERVICES_URL}?${query.toString()}`))
	},

	async getServiceUnitOptions() {
		const query = new URLSearchParams({ $filter: "EngagementProjectResourceType eq '0SRV'", $format: 'json', $top: '1000' })
		return normalizeODataCollection(await fetchJson(`${PROJECT_DEMAND_ROLES_URL}?${query.toString()}`))
	},

	async getTeamRoleOptions() {
		const query = new URLSearchParams({ $filter: "EngagementProjectResourceType eq '0ACT'", $format: 'json', $top: '1000' })
		return normalizeODataCollection(await fetchJson(`${PROJECT_DEMAND_ROLES_URL}?${query.toString()}`))
	},

	async getAdditionalResourceOptions() {
		const query = new URLSearchParams({ $filter: "EngagementProjectResourceType eq '0ADL'", $format: 'json', $top: '1000' })
		return normalizeODataCollection(await fetchJson(`${PROJECT_DEMAND_ROLES_URL}?${query.toString()}`))
	},

	async getExpenseTypeOptions() {
		const query = new URLSearchParams({ $filter: "EngagementProjectResourceType eq '0EXP'", $format: 'json', $top: '1000' })
		return normalizeODataCollection(await fetchJson(`${PROJECT_DEMAND_ROLES_URL}?${query.toString()}`))
	},

	async getProjectBillingSalesOrders(projectId) {
		const salesOrders = (await this.getCustomerProjectSalesOrders()).filter(item =>
			String(item.CustomerProject || item.ProjectID || item.Project || '') === String(projectId),
		)
		return Promise.all(salesOrders.map(async salesOrder => {
			let items = normalizeODataCollection(salesOrder.to_CustProjSlsOrdItem)
			const itemsUri = salesOrder.to_CustProjSlsOrdItem?.__deferred?.uri
			if (!items.length && itemsUri) items = normalizeODataCollection(await fetchJson(new URL(itemsUri, CUSTOMER_PROJECT_SALES_ORDER_URL).toString()))
			const expandedItems = await Promise.all(items.map(async item => {
				let workPackages = normalizeODataCollection(item.to_CustProjSlsOrdItemWorkPckg)
				const workPackagesUri = item.to_CustProjSlsOrdItemWorkPckg?.__deferred?.uri
				if (!workPackages.length && workPackagesUri) workPackages = normalizeODataCollection(await fetchJson(new URL(workPackagesUri, CUSTOMER_PROJECT_SALES_ORDER_URL).toString()))
				let billingPlanItems = normalizeODataCollection(item.to_CustProjSOIBillgPlnItm)
				const billingPlanUri = item.to_CustProjSOIBillgPlnItm?.__deferred?.uri
				if (!billingPlanItems.length && billingPlanUri) billingPlanItems = normalizeODataCollection(await fetchJson(new URL(billingPlanUri, CUSTOMER_PROJECT_SALES_ORDER_URL).toString()))
				return { ...item, __workPackages: workPackages, __billingPlanItems: billingPlanItems }
			}))
			return { ...salesOrder, __items: expandedItems }
		}))
	},

	async createCustomerProjectBillingPlanItem({ projectId, salesOrderId, salesOrderItem, plan }) {
		const safeProjectId = toSafeODataString(projectId)
		const safeSalesOrderId = toSafeODataString(salesOrderId)
		const safeSalesOrderItem = toSafeODataString(salesOrderItem)
		if (!safeProjectId || !safeSalesOrderId || !safeSalesOrderItem) throw new Error('Project, sales order, and sales order item are required to add a billing plan item.')
		const target = `${CUSTOMER_PROJECT_BILLING_PLAN_ITEM_URL}`
		const payload = {
			CustomerProject: safeProjectId,
			SalesOrderItem: safeSalesOrderItem,
			...plan,
		}
		return postToOData(target, payload)
	},

	async updateCustomerProjectBillingPlanItem({ projectId, salesOrderItem, billingPlanItem, plan }) {
		const safeProjectId = toSafeODataString(projectId)
		const safeSalesOrderItem = toSafeODataString(salesOrderItem)
		const safeBillingPlanItem = toSafeODataString(billingPlanItem)
		if (!safeProjectId || !safeSalesOrderItem || !safeBillingPlanItem) {
			throw new Error('Project, sales order item, and billing plan item are required to update a billing plan item.')
		}
		const endpoint = `${CUSTOMER_PROJECT_BILLING_PLAN_ITEM_URL}(CustomerProject='${safeProjectId}',SalesOrderItem='${safeSalesOrderItem}',BillingPlanItem='${safeBillingPlanItem}')`
		await patchToOData(endpoint, { d: plan }, 1, true)
		return { ok: true }
	},

	async deleteProjectBillingItem({ projectId, salesOrderItem }) {
		const safeProjectId = toSafeODataString(projectId)
		const safeSalesOrderItem = toSafeODataString(salesOrderItem)
		if (!safeProjectId || !safeSalesOrderItem) throw new Error('Project and billing item are required.')
		const target = new URL(`${CUSTOMER_PROJECT_SALES_ORDER_ITEM_URL}(CustomerProject='${safeProjectId}',SalesOrderItem='${safeSalesOrderItem}')`)
		const serviceRoot = new URL(CUSTOMER_PROJECT_SALES_ORDER_URL)
		if (target.origin !== serviceRoot.origin || !target.pathname.includes('/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/')) {
			throw new Error('SAP returned an invalid billing item delete URL.')
		}
		await deleteFromOData(target.toString())
		return { ok: true }
	},

	async createWorkPackage(workPackagePayload) {
		const payload = await postToOData(WORK_PACKAGE_SET_URL, workPackagePayload)
		const data = normalizeODataEntity(payload)
		return {
			workPackageId: data?.WorkPackageID || workPackagePayload.WorkPackageID,
			raw: payload,
		}
	},

	async createWorkPackagesBatch(workPackages) {
		if (!Array.isArray(workPackages) || !workPackages.length) return []
		const csrfEndpoint = getCsrfEndpoint(WORK_PACKAGE_SET_URL)
		const csrf = await getCsrfToken(csrfEndpoint)
		const batchUrl = new URL('$batch', WORK_PACKAGE_SET_URL).toString()
		const batchBoundary = `batch_${Date.now()}_${Math.random().toString(16).slice(2)}`
		const changesets = workPackages.map((item, index) => {
			const changeBoundary = `changeset_${index + 1}_${Math.random().toString(16).slice(2)}`
			return [
				`--${batchBoundary}`,
				`Content-Type: multipart/mixed; boundary=${changeBoundary}`,
				'',
				`--${changeBoundary}`,
				'Content-Type: application/http',
				'Content-Transfer-Encoding: binary',
				`Content-ID: ${index + 1}`,
				'',
				`POST WorkPackageSet HTTP/1.1`,
				'Content-Type: application/json',
				'Accept: application/json',
				'',
				JSON.stringify(item),
				`--${changeBoundary}--`,
				'',
			].join('\r\n')
		}).join('') + `--${batchBoundary}--\r\n`
		const timeout = createTimeoutController(SAP_TIMEOUT_MS * 3)
		try {
			const response = await fetch(batchUrl, {
				method: 'POST',
				headers: buildHeaders({ 'Content-Type': `multipart/mixed; boundary=${batchBoundary}`, Accept: 'multipart/mixed', 'x-csrf-token': csrf.token, Cookie: csrf.cookie }),
				body: changesets,
				signal: timeout.signal,
			})
			const body = await response.text()
			if (!response.ok) throw makeSapError({ method: 'POST', url: batchUrl, status: response.status, details: body.slice(0, 2000), message: `SAP batch request failed (${response.status}).` })
			const results = workPackages.map(() => ({ status: 'unknown', reason: 'SAP response did not include this row; verify in SAP before retrying.', rawStatus: 0 }))
			const responseParts = body.split(/(?=Content-Type:\s*application\/http\b)/i).filter(part => /^Content-Type:\s*application\/http\b/i.test(part.trimStart()))
		let responseOrder = 0
		for (const part of responseParts) {
			const contentId = part.match(/Content-ID:\s*["']?(\d+)["']?/i)?.[1]
			const resultIndex = contentId ? Number(contentId) - 1 : responseOrder
			responseOrder += 1
			if (!Number.isInteger(resultIndex) || resultIndex < 0 || resultIndex >= results.length) continue
			const status = part.match(/HTTP\/1\.[01]\s+(\d{3})\s*([^\r\n]*)/i)
			const code = status ? Number(status[1]) : 0
			let reason = status?.[2]?.trim() || ''
			const jsonStart = part.indexOf('{')
			if (jsonStart >= 0) {
				let depth = 0; let quoted = false; let escaped = false; let jsonEnd = -1
				for (let cursor = jsonStart; cursor < part.length; cursor += 1) {
					const char = part[cursor]
					if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue }
					if (char === '"') quoted = true
					else if (char === '{') depth += 1
					else if (char === '}' && --depth === 0) { jsonEnd = cursor + 1; break }
				}
				if (jsonEnd > jsonStart) {
					try {
						const data = JSON.parse(part.slice(jsonStart, jsonEnd))
						const message = data?.error?.message
						reason = typeof message === 'string' ? message : message?.value || data?.message || reason
					} catch { /* Keep the HTTP reason when SAP returns non-JSON error content. */ }
				}
			}
			if (!reason && code >= 400) reason = part.match(/<message[^>]*>([\s\S]*?)<\/message>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || ''
			results[resultIndex] = { status: code >= 200 && code < 300 ? 'success' : code ? 'failed' : 'unknown', reason: code >= 200 && code < 300 ? '' : reason || (code ? `SAP rejected the request (${code}).` : 'SAP response did not include this row; verify in SAP before retrying.'), rawStatus: code }
		}
		return results
		} catch (error) {
			if (error?.name === 'AbortError') {
				const timeoutError = new Error('SAP batch timed out. The final outcome may be unknown; verify in SAP before retrying.')
				timeoutError.code = 'sap-timeout'
				throw timeoutError
			}
			throw error
		} finally { timeout.clear() }
	},

	async updateWorkPackage({ projectId, workPackageId, workPackageName, payload }) {
		const safeProjectId = toSafeODataString(projectId)
		const safeWorkPackageId = toSafeODataString(workPackageId)
		const safeWorkPackageName = toSafeODataString(workPackageName)
		const endpoint = `${WORK_PACKAGE_SET_URL}(ProjectID='${safeProjectId}',WorkPackageID='${safeWorkPackageId}',WorkPackageName='${safeWorkPackageName}')`
		await patchToOData(endpoint, payload)
		return { ok: true }
	},

	async deleteWorkPackage({ projectId, workPackageId, workPackageName }) {
		const safeProjectId = toSafeODataString(projectId)
		const safeWorkPackageId = toSafeODataString(workPackageId)
		const safeWorkPackageName = toSafeODataString(workPackageName)
		const endpoint = `${WORK_PACKAGE_SET_URL}(ProjectID='${safeProjectId}',WorkPackageID='${safeWorkPackageId}',WorkPackageName='${safeWorkPackageName}')`
		await deleteFromOData(endpoint)
		return { ok: true }
	},

	async createCustomerProjectSalesOrder(salesOrderPayload) {
		const payload = await postToOData(CUSTOMER_PROJECT_SALES_ORDER_URL, salesOrderPayload)
		return { raw: payload }
	},

	async getWorkPackageResourceDemands({ workPackageId }) {
		const safeWorkPackageId = toSafeODataString(workPackageId)
		const query = new URLSearchParams({
			$filter: `WorkPackage eq '${safeWorkPackageId}' and (EngagementProjectResourceType eq '0ACT' or EngagementProjectResourceType eq '0ADL' or EngagementProjectResourceType eq '0EXP')`,
			$format: 'json',
			$top: '500',
		})
		return normalizeODataCollection(await fetchJson(`${WORK_PACKAGE_ROLE_TYPES_URL}?${query.toString()}`))
	},

	async getWorkPackageWorkItems() {
		const query = new URLSearchParams({
			$format: 'json',
			$top: '500',
		})
		return normalizeODataCollection(await fetchJson(`${WORK_ITEM_SET_URL}?${query.toString()}`))
	},

	async createWorkPackageWorkItem(workItemPayload) {
		const payload = await postToOData(WORK_ITEM_SET_URL, workItemPayload)
		return { raw: payload }
	},

	async deleteWorkPackageWorkItem({ projectId, workPackageId, workPackageName, workItem }) {
		const key = `ProjectID='${toSafeODataString(projectId)}',WorkPackageID='${toSafeODataString(workPackageId)}',WorkPackageName='${toSafeODataString(workPackageName)}',Workitem='${toSafeODataString(workItem)}'`
		await deleteFromOData(`${WORK_ITEM_SET_URL}(${key})`)
		return { ok: true }
	},

	async getWorkPackageStaffingData({ workPackageId }) {
		const query = new URLSearchParams({
			$filter: `WorkPackageID eq '${toSafeODataString(workPackageId)}'`,
			$format: 'json',
			$top: '1000',
		})
		return normalizeODataCollection(await fetchJson(`${STAFFING_DATA_SET_URL}?${query.toString()}`))
	},

	async createDemand(demandPayload) {
		const payload = await postToOData(DEMAND_SET_URL, demandPayload)
		return { raw: payload }
	},

	async createDemandsBatch(demands) {
		if (!Array.isArray(demands) || !demands.length) return []
		const csrf = await getCsrfToken(getCsrfEndpoint(DEMAND_SET_URL))
		const batchUrl = new URL('$batch', DEMAND_SET_URL).toString()
		const batchBoundary = `batch_demands_${Date.now()}_${Math.random().toString(16).slice(2)}`
		const body = demands.map((item, index) => {
			const changeBoundary = `changeset_demand_${index + 1}_${Math.random().toString(16).slice(2)}`
			return [
				`--${batchBoundary}`,
				`Content-Type: multipart/mixed; boundary=${changeBoundary}`,
				'',
				`--${changeBoundary}`,
				'Content-Type: application/http',
				'Content-Transfer-Encoding: binary',
				`Content-ID: ${index + 1}`,
				'',
				'POST DemandSet HTTP/1.1',
				'Content-Type: application/json',
				'Accept: application/json',
				'',
				JSON.stringify(item),
				`--${changeBoundary}--`,
				'',
			].join('\r\n')
		}).join('') + `--${batchBoundary}--\r\n`
		const timeout = createTimeoutController(SAP_TIMEOUT_MS * 3)
		try {
			const response = await fetch(batchUrl, {
				method: 'POST',
				headers: buildHeaders({ 'Content-Type': `multipart/mixed; boundary=${batchBoundary}`, Accept: 'multipart/mixed', 'x-csrf-token': csrf.token, Cookie: csrf.cookie }),
				body,
				signal: timeout.signal,
			})
			const responseBody = await response.text()
			if (!response.ok) throw makeSapError({ method: 'POST', url: batchUrl, status: response.status, details: responseBody.slice(0, 2000), message: `SAP demand batch request failed (${response.status}).` })
			const results = demands.map(() => ({ status: 'unknown', reason: 'SAP response did not include this demand row; verify in SAP before retrying.', rawStatus: 0 }))
			const parts = responseBody.split(/(?=Content-Type:\s*application\/http\b)/i).filter(part => /^Content-Type:\s*application\/http\b/i.test(part.trimStart()))
			let responseOrder = 0
			for (const part of parts) {
				const contentId = part.match(/Content-ID:\s*["']?(\d+)["']?/i)?.[1]
				const index = contentId ? Number(contentId) - 1 : responseOrder
				responseOrder += 1
				if (!Number.isInteger(index) || index < 0 || index >= results.length) continue
				const httpStatus = part.match(/HTTP\/1\.[01]\s+(\d{3})\s*([^\r\n]*)/i)
				const code = httpStatus ? Number(httpStatus[1]) : 0
				let reason = httpStatus?.[2]?.trim() || ''
				const jsonStart = part.indexOf('{')
				if (jsonStart >= 0) {
					try {
						const parsed = JSON.parse(part.slice(jsonStart, part.lastIndexOf('}') + 1))
						const message = parsed?.error?.message
						reason = typeof message === 'string' ? message : message?.value || parsed?.message || reason
					} catch { /* Retain the HTTP status text if SAP did not return a JSON error body. */ }
				}
				if (!reason && code >= 400) reason = part.match(/<message[^>]*>([\s\S]*?)<\/message>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || ''
				results[index] = {
					status: code >= 200 && code < 300 ? 'success' : code ? 'failed' : 'unknown',
					reason: code >= 200 && code < 300 ? '' : reason || (code ? `SAP rejected the demand (${code}).` : 'SAP response did not include this demand row; verify in SAP before retrying.'),
					rawStatus: code,
				}
			}
			return results
		} catch (error) {
			if (error?.name === 'AbortError') {
				const timeoutError = new Error('SAP demand batch timed out. The final outcome may be unknown; verify in SAP before retrying.')
				timeoutError.code = 'sap-timeout'
				throw timeoutError
			}
			throw error
		} finally { timeout.clear() }
	},

	async updateDemand({ original, payload }) {
		const keyFields = ['ProjectID', 'WorkPackageID', 'WorkPackageName', 'ResType', 'ResourceId', 'Workitem', 'DelvryServOrg']
		const key = keyFields.map(field => `${field}='${toSafeODataString(original[field])}'`).join(',')
		const endpoint = `${DEMAND_SET_URL}(${key})`
		await patchToOData(endpoint, payload)
		return { ok: true }
	},

	async deleteDemand({ key }) {
		const keyFields = ['ProjectID', 'WorkPackageID', 'WorkPackageName', 'ResType', 'ResourceId', 'Workitem', 'DelvryServOrg']
		const odataKey = keyFields.map(field => `${field}='${toSafeODataString(key[field])}'`).join(',')
		await deleteFromOData(`${DEMAND_SET_URL}(${odataKey})`)
		return { ok: true }
	},
}
