import { getProjectWorkspace, getRecentProjects } from './projectService.js'

// Workflow state is kept separately from SAP project master data. Replace this
// repository with the customer's persistent workflow store when it is available.
const workflows = new Map()

function normalize(value) { return String(value || '').trim().toLowerCase() }
const rolePriority = item => normalize(item.roleName).includes('delivery manager') ? 0 : 1

const approverRoles = responsibilities => responsibilities
	.filter(item => item.roleId !== 'YP_RL_0001' && normalize(item.roleName) !== 'project manager')
	.sort((left, right) => rolePriority(left) - rolePriority(right))
	.slice(0, 4)
	.map((item, index) => ({
		level: index + 1,
		roleId: item.roleId,
		roleName: item.roleName,
		businessPartnerId: item.workerId,
		businessPartnerName: item.workerName,
		email: item.email,
		status: index === 0 ? 'pending' : 'not_started',
	}))

const isAssigned = (level, actor) => {
	const values = [actor.id, actor.email, actor.name].map(normalize).filter(Boolean)
	return values.length > 0 && [level.businessPartnerId, level.email, level.businessPartnerName].map(normalize).some(value => values.includes(value))
}

function workflowFor(projectId, responsibilities) {
	const existing = workflows.get(projectId)
	if (existing) return existing
	const workflow = { projectId, levels: approverRoles(responsibilities), history: [] }
	workflows.set(projectId, workflow)
	return workflow
}

const completed = workflow => workflow.levels.length > 0 && workflow.levels.every(level => level.status === 'approved')
const rejected = workflow => workflow.levels.some(level => level.status === 'rejected')

export function approvalDetails(projectId, workspace, actor) {
	const workflow = workflowFor(projectId, workspace.responsibilities || [])
	const userLevel = workflow.levels.find(level => isAssigned(level, actor))
	if (!userLevel) {
		const error = new Error('You are not assigned as an approver for this project.')
		error.code = 'not-an-approver'
		throw error
	}
	const current = workflow.levels.find(level => level.status === 'pending')
	let userState = 'waiting_on_earlier_level'
	if (completed(workflow)) userState = 'fully_approved'
	else if (userLevel.status === 'approved') userState = 'already_approved'
	else if (userLevel.status === 'rejected') userState = 'already_rejected'
	else if (current?.level === userLevel.level) userState = 'action_required'
	else if (rejected(workflow)) userState = 'workflow_rejected'
	return { ...workflow, completed: completed(workflow), rejected: rejected(workflow), currentLevel: current?.level || null, currentStage: completed(workflow) ? 'Fully Approved' : rejected(workflow) ? 'Rejected' : current ? `Level ${current.level} – ${current.roleName}` : 'Not Started', userLevel: userLevel.level, userState, canAct: userState === 'action_required' }
}

export async function getApprovalInbox(actor) {
	const { projects } = await getRecentProjects()
	const items = []
	for (const project of projects) {
		try {
			const workspace = await getProjectWorkspace(project.id)
			const approval = approvalDetails(project.id, workspace, actor)
			items.push({ project, approval })
		} catch (error) {
			if (error?.code !== 'not-an-approver') console.warn(`Approval inbox skipped ${project.id}:`, error?.message || error)
		}
	}
	return { inProgress: items.filter(item => !item.approval.completed), approved: items.filter(item => item.approval.completed) }
}

export async function getApprovalProject(projectId, actor) {
	const workspace = await getProjectWorkspace(projectId)
	return { workspace, approval: approvalDetails(projectId, workspace, actor) }
}

export async function actOnApproval(projectId, action, comment, actor) {
	const workspace = await getProjectWorkspace(projectId)
	const workflow = workflowFor(projectId, workspace.responsibilities || [])
	const details = approvalDetails(projectId, workspace, actor)
	if (!details.canAct) {
		const error = new Error('Approval action is not allowed until all earlier approval levels are approved.')
		error.code = 'approval-out-of-sequence'
		throw error
	}
	const level = workflow.levels.find(item => item.level === details.userLevel)
	level.status = action === 'approve' ? 'approved' : 'rejected'
	workflow.history.push({ level: level.level, action, comment: String(comment || ''), actedAt: new Date().toISOString(), actor: level.businessPartnerName || actor.name || actor.id })
	if (action === 'approve') {
		const next = workflow.levels.find(item => item.level === level.level + 1)
		if (next) next.status = 'pending'
	}
	return approvalDetails(projectId, workspace, actor)
}
