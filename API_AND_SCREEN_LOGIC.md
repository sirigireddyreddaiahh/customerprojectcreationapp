# API and Screen Logic Guide

This guide describes the current implementation in `Frontend/src` and `Backend/src`. “API” below means the app's local `/api/...` routes unless explicitly labeled SAP OData. It documents the code as it exists; some screens are prototypes and do not persist edits.

## 1. How requests flow

1. A screen calls a function in `Frontend/src/services/projectService.ts`.
2. `Frontend/src/config/api.ts` prepends `VITE_API_BASE_URL` (default `/api`), sends JSON headers, and turns non-2xx responses into `ApiError`.
3. `Backend/src/routes/projectRoutes.js` matches the HTTP method and path.
4. `Backend/src/controllers/projectController.js` reads query/body, validates writes, invokes `Backend/src/services/projectService.js` or `approvalService.js`, and returns JSON.
5. The project service maps app field names to SAP OData names; `Backend/src/integrations/sapProjectIntegration.js` performs the SAP requests.

Approval calls additionally send `X-User-Id`, `X-User-Email`, and `X-User-Name`. Defaults are read from Vite env/local storage, falling back to `INF_SD02` and `Avula Murali` for ID/name. The backend also has environment fallbacks.

## 2. Application API catalogue

| Method and route | Screen/use | Inputs | Result / behavior |
|---|---|---|---|
| `GET /health` | Deployment health check | None | `{status:"ok"}` |
| `GET /api/projects/master-data` | Create project, work-package demand organization selector | None | Lists for company codes, natures, billability, groups, categories, currencies, stages, cost/profit centers, customers, orgs, roles, business partners, defaults |
| `GET /api/projects/customers?customerGroup=&costCenter=&profitCenter=&projectNature=` | Customer project form and customer lookup popup | Four query strings | `{customers:[...], profitCenter?:...}`; customer list depends on these selections |
| `GET /api/projects/workforce` | Project manager/responsibility selectors and display-name resolution | None | `{workforce:[{person,personFullName,personExternalId,defaultEmailAddress}]}` |
| `GET /api/projects/recent` | Project Overview | None | `{projects:[...]}`; projects enriched with customer, manager, labels and sales-order data |
| `GET /api/projects/workspace?projectId=` | Workspace and work-package detail navigation | `projectId` query | Project summary, work packages, responsibilities |
| `GET /api/projects/billing?projectId=` | Workspace Billing tab | `projectId` query | Billing header and sales-order contract items/due dates |
| `GET /api/work-packages/details?projectId=&workPackageId=&workPackageName=` | Work Package Detail | All three query values required | `{team:[demand rows],expensesAvailable:false}` from SAP resource-demand navigation |
| `POST /api/projects` | Customer/Internal project creation | `{project,responsibilities}` (field lists below) | Creates SAP project, then responsibility roles; can return `partial` if project succeeds but role writes fail |
| `POST /api/projects/:projectId/responsibilities/retry` | Retry failed responsibility roles after partial creation | `{responsibilities:[{projectRoleId,businessPartnerId,businessPartnerName?}]}` | Re-attempt role creation, at most 7 roles |
| `POST /api/work-packages` | Workspace > Budget > create work package; bulk upload uses same route per row | `{projectId,type,workPackageName,description,startDate,endDate,unitId?,unitQuantity?}` | Generates ID and writes work package to SAP |
| `POST /api/demands` | Work Package Detail > Team, Additional Resource, Expense forms and bulk upload | Common and type-specific demand fields below | Creates one SAP demand |
| `PATCH /api/projects/:projectId/stage` | Stage update service exists; no screen call found | `{projectStage:"P002"}` | Updates SAP stage |
| `POST /api/billing-plans` | Workspace Billing / Billing Due Dates create and bulk upload | Billing request fields below | Creates customer project sales order item and, for relevant types, billing plan item |
| `GET /api/approvals` | Approval Inbox | User headers | Projects and approval state assigned to current user |
| `GET /api/approvals/:projectId` | Workspace approval status/detail | User headers | Workspace and current-user workflow; 403 if actor is not an approver |
| `POST /api/approvals/:projectId` | Approve/reject action | User headers and `{action:"approve"|"reject",comment?}` | Updates in-memory workflow and returns workflow; later levels wait for earlier approvals |

### Create project fields

`project` carries SAP-shaped fields: `YY1_ContractingCompan_Cpr`, `YY1_ProjectNature_Cpr`, `YY1_Billability1_Cpr`, `YY1_ExpenseBookingAllo_Cpr`, `YY1_OvertimeAllowed_Cpr`, `YY1_ProjectBillableDai_Cpr`, `YY1_SOWStatus_Cpr`, optional `ProjectID`, `ProjectName`, `ProjectDesc`, `CostCenter`, `ProfitCenter`, `OrgID`, `YY1_CustomerGroupName_Cpr`, optional `YY1_CustomerGroupName_CprT`, `Customer`, `CustomerName`, `YY1_EndCustomer_Cpr`, `YY1_Paymentterms_Cpr`, `YY1_ProjectCategory_Cpr`, `YY1_TypeofProject_Cpr`, `Currency`, `StartDate`, `EndDate`, `ProjectStage`, optional `ProjManagerExtId`.

`responsibilities` is an array of `{projectRoleId,businessPartnerId,businessPartnerName?}`. Server requires company, nature, billability, project manager ID, project name, cost center, profit center, org ID, category, currency, dates, at least one allowed role and partner. For nature `COR`, a customer is required. Start cannot be before today in Asia/Kolkata; end cannot precede start. Allowed role codes are enumerated in `projectValidator.js`.

### Work-package and demand fields

Work package types are `resource` and `service`; both require project ID, name, start/end dates; end must not precede start. Service requires `unitId` and positive `unitQuantity`. Description is optional. Backend maps to SAP `ProjectID`, generated `WorkPackageID`, `WorkPackageName`, `Description`, `WPStartDate`, `WPEndDate`; service adds `WorkPackageType:"U"`, `UnitId`, `UnitQuantity`.

Demand common app fields: `projectId`, `workPackageId`, `workPackageName`, `type` (`team`/`additional`/`expense`), `resourceId`. Team and additional require positive `effort`; team additionally requires `deliveryServiceOrg`, `expenseRevenue`, `billingControlCategory`; additional requires `workitem`; expense requires positive `expenseCost`. Optional UI/service fields include `roleName`, `skills`, `deliveryServiceOrgName`, rates, demand IDs/status, unit/currency, staffed/requested worker details, and `summaryContribution`. Most of those are display-only and are not sent in demand creation.

SAP write mapping: all demand types send `ProjectID`, `WorkPackageID`, `WorkPackageName`, `ResType` (`0ACT` team, `0ADL` additional, `0EXP` expense), `ResourceId`. Team adds `Effort`, `Skills`, `DelvryServOrg`, `ExpenseRevenue`, `BillingControlCategory`. Additional adds `Effort`, `DelvryServOrg`, `BillingControlCategory`, `Workitem`. Expense adds `BillingControlCategory` and `ExpenseCost`.

### Billing fields

`POST /api/billing-plans` accepts `projectId`, `billingType` (`fixed`, `timeAndMaterials`, `periodic`, `usageBased`), `workPackageId`, `customerPurchaseOrderDate`, `paymentMethod`, `expectedNetAmount`, `transactionCurrency`, `salesOrderItem`, `underlyingPurchaseOrderItem`, `salesOrderItemText`, and optional `billingPlanBillingDate`, `billingPlanAmount`, `billingPlanItemDescription`, `billingPlanItemUsage`, `billingPlanServiceStartDate`, `billingPlanServiceEndDate`.

The server maps billing type to SAP item categories/materials: fixed `PS01/P001`, T&M `PS02/P002`, periodic `PS06/P003`, usage `PS07/P002`. It links the work package. Billing plan child items are written for fixed, periodic, and usage; T&M has no plan item. Periodic adds service start/end; usage omits plan amount.

## 3. Screen logic and field data flow

### Project Overview

- On mount, calls `getRecentProjects()` and builds the table from returned `projects`.
- Filters/search and column visibility are client-side; they do not call a filtering API.
- Selecting a project navigates to Workspace with its ID. Create buttons navigate to project type selection.
- Row labels such as customer, manager, cost/profit center, stage and sales order are backend-enriched from master data, workforce, and SAP sales orders.

### Create Customer Project / Create Internal Project

- Both render `CustomerProjectCreation`; the `kind` changes which fields/values are applicable.
- Initial loads fetch master data and workforce. Select options use `code/name` pairs. Project manager and responsibility person options resolve from workforce entries (`personExternalId`, name, business partner/person ID, email).
- Customer lookup is dependent: selected customer group, cost center, profit center, and project nature are passed to `/customers`; changing upstream values can invalidate/reset downstream customer choices. Customer nature `COR` triggers required customer validation.
- Form state is assembled into the SAP-shaped `project` object and responsibility array, then POSTed to `/api/projects`.
- Dates must be valid and ordered; backend enforces start date today-or-later using India timezone.
- Full success opens created-project result. Partial responsibility failure preserves failed role assignments and exposes retry via `/responsibilities/retry`; project creation is not repeated.
- Field values such as customer display names/labels are selected from master data; backend maps options and defaults in `getMasterData()`.

### Project Workspace — Project Information

- Loads workspace, master data, and workforce in parallel. Workspace API requires project ID. Master/workforce enrich display labels; failures in enrichment are tolerated.
- Project sections display project foundation, organization/costing, customer context, description, responsibilities, and approval hierarchy.
- Edit mode copies the project into local draft. Save applies draft to in-memory workspace only; no project update API is currently called. Cancel restores the loaded project. Navigation warns about unsaved edits.
- Responsibilities are read-only; project manager role is hidden in the standard list. The approval hierarchy uses approval API data when available.
- Project summary uses SAP planned effort/cost/revenue when positive; otherwise it falls back to 100 hours, 750 per hour cost and 1000 per hour revenue. Planned margin is `(revenue-cost)/revenue * 100`.

### Project Workspace — Budget / Work Packages

- Existing rows come from workspace `workPackages`; row fields include name, ID, duration, type and display metrics. Work-package demand details are opened by passing project ID, work-package ID/name to Work Package Detail.
- New work-package form has project ID, type (`resource` default or `service`), name, description, dates, and service unit/quantity. It POSTs `/work-packages`; backend generates ID from SAP and returns it.
- Service/unit-specific fields are required only for service packages. Dates are validated by backend.
- Excel import reads the first sheet, converts each row to the same request shape, then issues one POST per row. Per-row result CSV records created ID or failure.
- Budget table display calculations derive effort/cost/revenue from SAP-returned demand values where present; display-only columns and column preferences do not mutate SAP.

### Work Package Detail — shared load and computations

- On mount, fetches work-package demand details plus master data (for delivery service organization options). Demand API asks SAP for resource demands; backend also obtains workforce names and org labels.
- Server maps SAP resource type to `team`/`additional`/`expense`; maps quantity, skill, cost/revenue, billing category, work item, resource demand status, staffed assignments and requested worker into app fields.
- Current backend explicitly returns `expensesAvailable:false`: SAP tenant's `DemandSet` GET returns 501 and the integration notes expenses cannot be retrieved until SAP implements it. Team demand rows can come through `to_ResourceDemand`.
- Demand data is kept in screen state. Editing, row grouping and visible table values are client-side; there is no update-demand API. Create forms and bulk import do persist new rows through `POST /api/demands`.
- Numeric helpers coerce invalid/empty values to zero. Team cost/revenue fields can be derived by multiplying rates by effort; margin is `(revenue-cost)/revenue * 100` when revenue > 0, otherwise shown as N/A. Billability selects normalize values containing “non” to Non-Billable; otherwise Billable.
- Team rows can be grouped by role/resource identity; staffed resource details show assigned person, allocation, effort, billing category and assignment period. Names resolve through workforce lookup.

### Work Package Detail — Roles / Team Resources

- Team demand uses `type:"team"`; required request fields: project/work-package IDs and name, resource/role ID, positive effort, delivery service org, expense revenue, billing control category. Skills optional. Screen also shows role name, cost/revenue rates, computed cost/revenue/margin, staffed resources and requested worker, but those extended values are not all part of create payload.
- Role/resource selector options are based on returned demand resource identifiers and/or UI role choices; changing role may populate associated values from a matching existing row. Delivery organization selector uses `master-data.orgIds`.
- Editable cells and Edit/Save controls only change local demand state; Save does not call SAP. “Create” and bulk create call create API, and the new row is appended locally after success.

### Work Package Detail — Additional Resources

- Uses `type:"additional"`; required fields are common IDs/name/resource ID plus positive effort and `workitem`. Delivery service organization is exposed in form and sent to SAP; it is not an additional validator requirement in current backend. Billing category is optional server-side (sent as empty if unset).
- Bulk spreadsheet columns are positional: ProjectID, WorkPackageID, WorkPackageName, ResourceId, Effort, Skills, DelvryServOrg, ExpenseRevenue, BillingControlCategory, Workitem, ExpenseCost. The same row mapping is used regardless of selected type; server validation determines type requirements.
- Create and bulk operations issue one POST per row. Bulk results can be downloaded as CSV; there is no bulk endpoint/transaction.

### Work Package Detail — Expenses

- Uses `type:"expense"`; requires IDs/name/resource ID and positive `expenseCost`. Screen's expense entry exposes cost; other fields may be present in the shared request model, but expense SAP mapping only writes billing category (optional) and expense cost beyond common identifiers.
- Expense *creation* is implemented. Expense *fetch/display from SAP* is currently unavailable (`expensesAvailable:false`) in this tenant, so the screen cannot claim that existing SAP expenses are loaded.
- This limitation is separate from create validation and does not prevent POST creation.

### Workspace — Billing and Billing Due Dates

- Billing tab calls `GET /billing?projectId=` and maps sales-order items to contracts. It displays contract/item fields, linked work packages, amounts, currency, status, and child billing plan dates.
- Create billing/due-date forms and Excel upload construct the billing request described above and call `POST /billing-plans`. Bulk calls are sequential; due-date bulk upload appends rows locally on success.
- Billing table edits/copy/column settings are local UI state. There is no billing update/delete endpoint. Some displayed contract fields are SAP-derived; local form drafts may not round-trip as edits to existing SAP contracts.

### Approval Inbox and approval mode

- Inbox requests `/api/approvals` with current-user headers. Backend scans recent projects, loads each workspace, filters to roles assigned to that user, and returns in-progress/approved groups.
- `approvalService.js` creates levels from project responsibilities, excluding Project Manager (`YP_RL_0001`/name), preferring Delivery Manager first, then at most four levels. The first is pending; following levels not started. State lives in a process-local `Map` and is lost on backend restart.
- User identity matches level business partner ID, email, or name against supplied headers. Only current pending level can act; action POST records approve/reject/comment/time and advances next level on approve.
- Inbox summaries and statuses are computed client-side from `canAct`, `completed`, `rejected`, and `userState`. Workspace approval actions call the POST endpoint.

### Other/placeholder screens

- Workspace Resources tab currently renders hard-coded sample roles/resources. “Add role” does not invoke an API.
- Attachments tab states the API is not connected.
- Project information Save is local-only, and there is no backend project update endpoint in the current route table.
- Workspace stage update service/API exists, but a screen caller was not found in the source search.

## 4. SAP OData integration endpoints and verbs

These are server-to-SAP endpoints in `sapProjectIntegration.js`, distinct from browser `/api` routes. Integration uses GET for lookups/reads, POST for entity creation, and PATCH for stage updates. POST/PATCH use SAP CSRF token/cookie handling; calls are authenticated from server configuration. Read the integration module for exact tenant base URLs and entity paths.

| SAP entity/service | App purpose | SAP verb |
|---|---|---|
| Cost Center, Company Data, Profit Center/BU, Service Organization Cost Center, Currency | Master data and labels | GET |
| Business Partner Customer, customer data, Business Partner | Customer and responsibility lookup | GET |
| Workforce API | Workforce/name resolution | GET |
| ProjectSet | Project list/detail/create/stage update | GET, POST, PATCH |
| ProjectRoleSet | Read/create responsibility roles | GET, POST |
| WorkPackageSet | List/create and demand navigation | GET, POST |
| DemandSet / `to_ResourceDemand` navigation | Demand read/create | GET (tenant limitation noted above), POST |
| A_CustProjSlsOrd and related nested items/plans | Billing contracts and billing create | GET, POST |

## 5. Key implementation limitations to keep in mind

- No general update/delete APIs exist for project, work-package, demand, or billing rows. Several edit controls currently update only React state.
- Approval state is in-memory, not durable storage.
- Expense demand reads are explicitly unavailable in this SAP tenant; creates are supported.
- Bulk uploads issue sequential individual requests and can partially succeed; downloadable result files are used for work-package and demand uploads.
- API route table only allows `GET,POST,PATCH,OPTIONS`; there are no PUT/DELETE routes.

## Source map

- Frontend API contracts/calls: `Frontend/src/services/projectService.ts`, `Frontend/src/config/api.ts`
- Routes/controllers/validation: `Backend/src/routes/projectRoutes.js`, `Backend/src/controllers/projectController.js`, `Backend/src/validators/projectValidator.js`
- Business logic/SAP mapping: `Backend/src/services/projectService.js`, `Backend/src/services/approvalService.js`, `Backend/src/integrations/sapProjectIntegration.js`
- Screens: `Frontend/src/pages/CustomerProjectCreation.tsx`, `ProjectOverview.tsx`, `ProjectWorkspace.tsx`, `WorkPackageDetail.tsx`, `ApprovalInbox.tsx`
