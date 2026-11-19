import { currentUserHeaders, request } from '../config/api'

export type Option = {
	code: string
	name: string
	currency?: string
	buHead?: string
	buHeadPersonId?: string
	buHeadEmployeeId?: string
	buHeadExternalId?: string
}

export type CurrencyExchangeRate = {
	sourceCurrency: string
	targetCurrency: string
	exchangeRateType: 'M' | 'P'
	effectiveDate: string
	exchangeRate: number
	quotation: 'direct' | 'indirect'
}

export type CostCenterOption = {
	code: string
	name: string
	description: string
	companyCode: string
	orgId: string
	profitCenter: string
  profitCenterName: string
}

export type ProfitCenterOption = {
	code: string
	name: string
	buName: string
	buHead?: string
	buHeadPersonId?: string
	buHeadEmployeeId?: string
	buHeadExternalId?: string
	sbuHead?: string
	sbuHeadPersonId?: string
	sbuHeadExternalId?: string
	standardHierarchy: string
}

export type CustomerOption = {
	code: string
	name: string
	customerGroup: string
	customerGroupName: string
	customerAccountGroup: string
}

export type BusinessPartnerOption = {
	id: string
	name: string
}

export type RoleOption = {
	code: string
	name: string
}

export type ProjectMasterData = {
	companyCodes: Option[]
	projectNatures: Option[]
	billability: Option[]
	customerGroups: Option[]
	projectCategories: Option[]
	currencies: Option[]
	projectStages: Option[]
	costCenters: CostCenterOption[]
	profitCenters: ProfitCenterOption[]
	profitCenterGroups: Option[]
	customers: CustomerOption[]
	orgIds: Option[]
	roles: RoleOption[]
	businessPartners: BusinessPartnerOption[]
	serviceUnits: Option[]
	teamRoles: Option[]
	additionalResourceTypes: Option[]
	expenseTypes: Option[]
	inExecutionStageCode: string
	defaults: {
		projectCategory: string
		projectStage: string
		projectManagerExtId?: string
		billabilityByNature: Record<string, string>
	}
}

export type ResponsibilityInput = {
	projectRoleId: string
	businessPartnerId: string
	businessPartnerName?: string
}

export type WorkforcePerson = {
	person: string
	personFullName: string
	personExternalId: string
	defaultEmailAddress: string
}

export type ProjectFormPayload = {
	YY1_ContractingCompan_Cpr: string
	YY1_ProjectNature_Cpr: string
	YY1_Billability1_Cpr: string
	YY1_ExpenseBookingAllo_Cpr: string
	YY1_OvertimeAllowed_Cpr: string
	YY1_ProjectBillableDai_Cpr: string
	YY1_SOWStatus_Cpr: string
	ProjectID?: string
	ProjectName: string
	ProjectDesc: string
	CostCenter: string
	ProfitCenter: string
	OrgID: string
	YY1_CustomerGroupName_Cpr: string
	YY1_CustomerGroupName_CprT?: string
	Customer: string
	CustomerName: string
	YY1_EndCustomer_Cpr: string
	YY1_Paymentterms_Cpr: string
	YY1_ProjectCategory_Cpr: string
	YY1_TypeofProject_Cpr: string
	Currency: string
	StartDate: string
	EndDate: string
	ProjectStage: string
	ProjManagerExtId?: string
}

export type CreateProjectRequest = {
	project: ProjectFormPayload
	responsibilities: ResponsibilityInput[]
}

export type ResponsibilityFailure = {
	projectRoleId: string
	projectRoleName: string
	businessPartnerId: string
	businessPartnerName: string
	error: string
}

export type CreateProjectResponse = {
	status: 'success' | 'partial'
	message: string
	projectId: string
	failedResponsibilities?: ResponsibilityFailure[]
}

export type CustomersLookupResponse = {
	customers: CustomerOption[]
	profitCenter?: ProfitCenterOption
}

export type RetryResponsibilitiesResponse = {
	status: 'success'
	message: string
	projectId: string
}

export type WorkforceResponse = {
	workforce: WorkforcePerson[]
}

export type CreateWorkPackageRequest = {
	projectId: string
	type: 'resource' | 'service'
	workPackageName: string
	description: string
	startDate: string
	endDate?: string
	unitId?: string
	unitQuantity?: string
}

export type CreateWorkPackageResponse = {
	status: 'success'
	message: string
	workPackageId: string
}

export type CreateWorkPackagesBatchResponse = { results: Array<{ status: 'success' | 'failed' | 'unknown' | 'notAttempted'; reason: string; workPackageId: string }> }
export type CreateDemandsBatchResponse = { results: Array<{ status: 'success' | 'failed' | 'unknown' | 'notAttempted'; reason: string }> }

export type UpdateWorkPackageRequest = {
	workPackageName: string
	name?: string
	description?: string
	startDate?: string
	endDate?: string
	unitId?: string
	unitQuantity?: string
}

export type SapDemandDeleteKey = {
	projectId: string
	workPackageId: string
	workPackageName: string
	resType?: string
	resourceId: string
	workitem: string
	deliveryServiceOrg: string
}

export type CreateDemandRequest = {
	projectId: string
	workPackageId: string
	workPackageName: string
	workPackageType?: string
	type: 'team' | 'additional' | 'expense'
	resourceId: string
	roleName?: string
	effort?: string
	skills?: string
	deliveryServiceOrg?: string
	deliveryServiceOrgName?: string
	expenseRevenue?: string
	billingControlCategory?: string
	workitem?: string
	expenseCost?: string
	costPerHour?: string
	revenuePerHour?: string
	resourceDemandId?: string
	sapDeleteKeys?: SapDemandDeleteKey[]
	resourceDemandStatus?: string
	unitOfMeasure?: string
	currency?: string
	costCurrency?: string
	revenueCurrency?: string
	staffedResource?: string
	staffedResourceName?: string
	staffedEffort?: string
	staffedResources?: Array<{ id: string; name: string; effort: string; allocation?: string; billing?: string; assignmentPeriod?: string }>
	requestedWorker?: string
	requestedWorkerName?: string
	summaryContribution?: boolean
	copyExisting?: boolean
}

export type UpdateDemandRequest = {
	type: CreateDemandRequest['type']
	original: CreateDemandRequest
	fields: Partial<CreateDemandRequest>
}

export type DemandRevenueRate = { conditionRecord: string; priority: number; rate: number; unitRate: number; conditionQuantity: number; currency: string; unit: string } | null

export type WorkPackageDemandDetailsResponse = {
	workItems: Array<{ projectId: string; workPackageId: string; workPackageName: string; workItem: string; workItemName: string; workItemGroup?: string }>
	availableWorkItems?: Array<{ projectId: string; workPackageId: string; workPackageName: string; workItem: string; workItemName: string; workItemGroup?: string }>
	team: CreateDemandRequest[]
	expensesAvailable: boolean
	serviceDetails: {
		service: string
		quantity: string | number | null
		unit: string
		revenue: string | number | null
		currency: string
	} | null
}

export type BillingType = 'fixed' | 'timeAndMaterials' | 'periodic' | 'usageBased'

export type CreateBillingPlanRequest = {
	projectId: string
	salesOrderId?: string
	createSalesOrderItem?: boolean
	billingType: BillingType
	workPackageId: string
	workPackageIds?: string[]
	customerPurchaseOrderDate: string
	paymentMethod: string
	expectedNetAmount: string
	transactionCurrency: string
	salesOrderItem: string
	underlyingPurchaseOrderItem: string
	salesOrderItemText: string
	billingPlanBillingDate?: string
	billingPlanAmount?: string
	billingPlanItemDescription?: string
	billingPlanItemUsage?: string
	billingPlanServiceStartDate?: string
	billingPlanServiceEndDate?: string
}

export type BillingContract = {
	id: string
	salesOrderId: string
	editable: boolean
	contractType: string
	product: string
	description: string
	workPackages: Array<{ id: string; name: string }>
	profitCenter: string
	plannedRevenue: string
	amountToBill: string
	ssp: string
	amountCap: string
	capNotificationThreshold: string
	wbsElement: string
	customerMaterial: string
	customerReference: string
	currency: string
	status: string
	dueDates: Array<{ date: string; itemUsage: string; note: string; processingStatus: string; amount: string; currency: string; serviceStart: string; serviceEnd: string; billingPlanItem?: string; sapPlanUri?: string }>
}

export type ProjectBillingResponse = {
	customerReference: string
	customerReferenceDate: string
	salesOrder: string
	amountToBill: number
	currency: string
	contracts: BillingContract[]
}

export type ProjectServicePrice = {
	material: string
	standardConditionRecord: string
	validityStartDate: string
	validityEndDate: string
	current: boolean
	standardRate: string
	standardCurrency: string
	unit: string
	projectPrice: { conditionRecord: string; validityStartDate: string; validityEndDate: string; rate: string; currency: string } | null
}

export type ProjectWorkspaceResponse = {
	project: { id: string; name: string; customer: string; manager: string; status: string; stage: string; startDate: string; endDate: string; billability: string; description: string; blockedFunctions: string; category: string; contractingCompanyCode: string; projectNature: string; typeOfProject: string; costCenter: string; profitCenter: string; buName: string; orgId: string; currency: string; customerCode: string; customerGroup: string; projectManagerExternalId: string; expenseBookingAllowed: string; overtimeAllowed: string; projectBillableDailyHours: string; sowStatus: string; paymentTerms: string; endCustomer: string; publicProject: string; confidential: string; useProjectBilling: string; restrictTimePosting: string; plannedEffort: string; plannedCost: string; plannedRevenue: string; revenueSold: string; marginSold: string }
	workPackages: Array<{ id: string; wbsElementExternalID?: string; name: string; description: string; type: string; startDate: string; endDate: string; unitId: string; unitQuantity: string }>
	responsibilities: Array<{ roleId: string; roleName: string; workerId: string; workerName: string; email: string }>
}
export type ProjectListItem = { id: string; name: string; customer: string; manager: string; salesOrder: string; serviceOrganization: string; stage: string; billability: string; currency: string; projectNature: string; projectType: string; startDate: string; endDate: string; changedOn: string; contractingCompanyCode: string; costCenter: string; currentStage: string; customerGroupName: string; profitCenter: string; solutionOrderItem: string }
export type ApprovalLevel = { level: number; roleId: string; roleName: string; businessPartnerId: string; businessPartnerName: string; email: string; status: 'pending' | 'not_started' | 'approved' | 'rejected' }
export type ApprovalWorkflow = { projectId: string; levels: ApprovalLevel[]; completed: boolean; rejected: boolean; currentLevel: number | null; currentStage: string; userLevel: number; userState: 'action_required' | 'waiting_on_earlier_level' | 'already_approved' | 'already_rejected' | 'fully_approved' | 'workflow_rejected'; canAct: boolean; history: Array<{ level: number; action: string; comment: string; actedAt: string; actor: string }> }
export type ApprovalInboxItem = { project: ProjectListItem; approval: ApprovalWorkflow }

export const projectService = {
	getMasterData: () => request<ProjectMasterData>('/api/projects/master-data'),
	getCustomers: (params: {
		customerGroup: string
		costCenter: string
		profitCenter: string
		projectNature: string
	}) => {
		const query = new URLSearchParams(params)
		return request<CustomersLookupResponse>(`/api/projects/customers?${query.toString()}`)
	},
	getPaymentTerms: (params: { customerCode: string; companyCode: string }) => {
		const query = new URLSearchParams(params)
		return request<{ paymentTerms: string; paymentTermsName: string }>(`/api/projects/payment-terms?${query.toString()}`)
	},
	getWorkforce: () => request<WorkforceResponse>('/api/projects/workforce'),
	getWorkspace: (projectId: string) => request<ProjectWorkspaceResponse>(`/api/projects/workspace?projectId=${encodeURIComponent(projectId)}`),
	getBilling: (projectId: string) => request<ProjectBillingResponse>(`/api/projects/billing?projectId=${encodeURIComponent(projectId)}`),
	getProjectServicePrices: (projectId: string, salesOrganization: string) => request<{ prices: ProjectServicePrice[] }>(`/api/projects/service-prices?projectId=${encodeURIComponent(projectId)}&salesOrganization=${encodeURIComponent(salesOrganization)}`),
	updateProjectServicePrice: (payload: { projectId: string; material: string; rate: string; currency: string; unit: string; validityStartDate: string; validityEndDate: string }) => request<{ status: 'success'; action: 'updated' | 'created'; conditionRecord: string }>(`/api/projects/service-prices`, { method: 'PATCH', body: JSON.stringify(payload) }),
	getRecentProjects: () => request<{ projects: ProjectListItem[] }>('/api/projects/recent'),
	getApprovals: () => request<{ inProgress: ApprovalInboxItem[]; approved: ApprovalInboxItem[] }>('/api/approvals', { headers: currentUserHeaders() }),
	getApproval: (projectId: string) => request<{ workspace: ProjectWorkspaceResponse; approval: ApprovalWorkflow }>(`/api/approvals/${encodeURIComponent(projectId)}`, { headers: currentUserHeaders() }),
	actOnApproval: (projectId: string, action: 'approve' | 'reject', comment = '') => request<ApprovalWorkflow>(`/api/approvals/${encodeURIComponent(projectId)}`, { method: 'POST', headers: currentUserHeaders(), body: JSON.stringify({ action, comment }) }),
	getWorkPackageDemandDetails: (workPackage: { projectId: string; id: string; name: string; type?: string }) => {
		const query = new URLSearchParams({ projectId: workPackage.projectId, workPackageId: workPackage.id, workPackageName: workPackage.name, workPackageType: workPackage.type || '' })
		return request<WorkPackageDemandDetailsResponse>(`/api/work-packages/details?${query.toString()}`)
	},
	updateProjectStage: (projectId: string, projectStage: 'P002') =>
		request<{ status: 'success'; message: string; projectStage: string }>(`/api/projects/${encodeURIComponent(projectId)}/stage`, {
			method: 'PATCH',
			body: JSON.stringify({ projectStage }),
		}),
	updateProject: (projectId: string, project: Partial<ProjectWorkspaceResponse['project']>) =>
		request<{ status: 'success'; message: string; projectId: string }>(`/api/projects/${encodeURIComponent(projectId)}`, {
			method: 'PATCH',
			body: JSON.stringify({ project }),
		}),
	updateProjectResponsibility: (projectId: string, roleId: string, businessPartnerId: string) =>
		request<{ status: 'success'; message: string }>(`/api/projects/${encodeURIComponent(projectId)}/responsibilities/${encodeURIComponent(roleId)}`, {
			method: 'PATCH',
			body: JSON.stringify({ businessPartnerId }),
		}),
	createBillingPlan: (payload: CreateBillingPlanRequest) =>
		request<{ status: 'success'; message: string }>('/api/billing-plans', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	updateBillingPlanItem: (payload: { projectId: string; salesOrderItem: string; billingPlanItem?: string; sapPlanUri?: string; billingPlanBillingDate: string; transactionCurrency: string; billingPlanItemDescription: string; billingPlanAmount: string; billingPlanServiceStartDate?: string; billingPlanServiceEndDate?: string }) =>
		request<{ status: 'success'; message: string }>('/api/billing-plans', { method: 'PATCH', body: JSON.stringify(payload) }),
	deleteBillingItem: (projectId: string, salesOrderItem: string) =>
		request<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}/billing-items/${encodeURIComponent(salesOrderItem)}`, { method: 'DELETE' }),
	create: (payload: CreateProjectRequest) =>
		request<CreateProjectResponse>('/api/projects', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	retryResponsibilities: (projectId: string, responsibilities: ResponsibilityInput[]) =>
		request<RetryResponsibilitiesResponse>(`/api/projects/${encodeURIComponent(projectId)}/responsibilities/retry`, {
			method: 'POST',
			body: JSON.stringify({ responsibilities }),
		}),
	createWorkPackage: (payload: CreateWorkPackageRequest) =>
		request<CreateWorkPackageResponse>('/api/work-packages', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	createWorkPackagesBatch: (payload: { projectId: string; workPackages: Array<Omit<CreateWorkPackageRequest, 'projectId'>> }) =>
		request<CreateWorkPackagesBatchResponse>('/api/work-packages/batch', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	createDemandsBatch: (payload: { projectId: string; demands: Array<Omit<CreateDemandRequest, 'projectId' | 'workPackageId' | 'workPackageName' | 'workPackageType'> & { workPackageId: string; workPackageName: string; workPackageType?: string }> }) =>
		request<CreateDemandsBatchResponse>('/api/demands/batch', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	createWorkPackageWorkItem: (payload: { projectId: string; workPackageId: string; workPackageName: string; workItem: string; workItemName: string }) =>
		request<{ status: 'success'; message: string }>('/api/work-packages/work-items', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	deleteWorkPackageWorkItem: (payload: { projectId: string; workPackageId: string; workPackageName: string; workItem: string }) =>
		request<{ status: 'success'; message: string }>('/api/work-packages/work-items', {
			method: 'DELETE',
			body: JSON.stringify(payload),
		}),
	updateWorkPackage: (projectId: string, workPackageId: string, payload: UpdateWorkPackageRequest) =>
		request<{ ok: true }>(`/api/work-packages/${encodeURIComponent(projectId)}/${encodeURIComponent(workPackageId)}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		}),
	deleteWorkPackage: (projectId: string, workPackageId: string, workPackageName: string) =>
		request<{ status: 'success'; message: string }>(`/api/work-packages/${encodeURIComponent(projectId)}/${encodeURIComponent(workPackageId)}`, {
			method: 'DELETE',
			body: JSON.stringify({ workPackageName }),
		}),
	createDemand: (payload: CreateDemandRequest) =>
		request<{ status: 'success'; message: string }>('/api/demands', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	getDemandCostRate: (payload: { projectId: string; workPackageId: string; wbsElementExternalID?: string; workItem?: string; activityType: string; deliveryServiceOrg: string; companyCode?: string }) =>
		request<{ costPerHour: number | string | null; currency: string }>('/api/demands/cost-rate', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	recalculateDemandRevenueRates: (payload: { projectId: string; customer?: string; salesOrganization?: string; rows: Array<{ type: CreateDemandRequest['type']; material: string; deliveryServiceOrg: string; workItem: string; workPackage: string }> }) =>
		request<{ rates: DemandRevenueRate[] }>('/api/demands/revenue-rates', {
			method: 'POST',
			body: JSON.stringify(payload),
		}),
	saveDemandRevenueRate: (payload: { material: string; deliveryServiceOrg: string; customer: string; workPackage: string; rate: string; currency: string; unit?: string }) =>
		request<{ action: 'created' | 'updated' | 'unchanged'; conditionRecord: string }>('/api/demands/revenue-rates', {
			method: 'PATCH',
			body: JSON.stringify(payload),
		}),
	getCurrencyExchangeRates: (targetCurrency: string, sourceCurrencies: string[]) => {
		const query = new URLSearchParams({ targetCurrency, sourceCurrencies: sourceCurrencies.join(',') })
		return request<{ rates: CurrencyExchangeRate[] }>(`/api/currencies/exchange-rates?${query.toString()}`)
	},
	updateDemand: (payload: UpdateDemandRequest) =>
		request<{ status: 'success'; message: string }>('/api/demands', {
			method: 'PATCH',
			body: JSON.stringify(payload),
		}),
	deleteDemands: (type: CreateDemandRequest['type'], keys: SapDemandDeleteKey[]) =>
		request<{ status: 'success'; deletedKeys: SapDemandDeleteKey[] }>('/api/demands', {
			method: 'DELETE',
			body: JSON.stringify({ type, keys }),
		}),
}
