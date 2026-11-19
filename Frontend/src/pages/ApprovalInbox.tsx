import { useEffect, useState } from 'react'
import { ApiError } from '../config/api'
import { DataTable } from '../components/tables/DataTable'
import { projectService, type ApprovalInboxItem } from '../services/projectService'
import './ProjectWorkspace.css'

const signedInUser = () => {
  const name = import.meta.env.VITE_CURRENT_USER_NAME || localStorage.getItem('currentUserName') || 'Avula Murali'
  const id = import.meta.env.VITE_CURRENT_USER_ID || localStorage.getItem('currentUserId') || 'INF_SD02'
  return `${name} - ${id}`
}

export function ApprovalInbox({ onOpen }: { onOpen: (projectId: string) => void }) {
  const [activeTab, setActiveTab] = useState<'inProgress' | 'approved'>('inProgress')
  const [data, setData] = useState<{ inProgress: ApprovalInboxItem[]; approved: ApprovalInboxItem[] }>({ inProgress: [], approved: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    projectService.getApprovals()
      .then(setData)
      .catch(reason => setError(reason instanceof ApiError ? reason.message : 'Unable to load your assigned approvals.'))
      .finally(() => setLoading(false))
  }, [])

  const rows = data[activeTab]
  const awaitingMyApproval = data.inProgress.filter(item => item.approval.canAct).length
  const totalAssigned = data.inProgress.length + data.approved.length
  const summary = [['Awaiting My Approval', awaitingMyApproval], ['In Progress (all levels)', data.inProgress.length], ['Approved', data.approved.length], ['Total Assigned to Me', totalAssigned]] as const
  const statusFor = (item: ApprovalInboxItem) => {
    if (item.approval.completed) return 'Approved'
    if (item.approval.rejected) return 'Rejected'
    if (item.approval.canAct) return 'Pending your approval'
    if (item.approval.userState === 'waiting_on_earlier_level') return 'Waiting on earlier level'
    if (item.approval.userState === 'already_approved') return 'Your approval completed'
    return 'In progress'
  }

  return <section className="card approval-inbox-card">
    <header className="approval-inbox-heading"><h2>Approvals</h2><p>Showing only projects where <strong>{signedInUser()}</strong> holds a responsibility role.</p></header>
    <div className="approval-summary-grid">{summary.map(([label, value]) => <article className="approval-summary-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="tabs approval-inbox-tabs" role="tablist" aria-label="Approval status">
      <button type="button" role="tab" aria-selected={activeTab === 'inProgress'} className={`tab ${activeTab === 'inProgress' ? 'active' : ''}`} onClick={() => setActiveTab('inProgress')}><span className="approval-tab-icon waiting" aria-hidden="true">⌛</span>In Progress</button>
      <button type="button" role="tab" aria-selected={activeTab === 'approved'} className={`tab ${activeTab === 'approved' ? 'active' : ''}`} onClick={() => setActiveTab('approved')}><span className="approval-tab-icon approved" aria-hidden="true">✓</span>Approved</button>
    </div>
    {loading ? <div className="empty">Loading approvals...</div> : error ? <div className="empty approval-error">{error}</div> : <div className="approval-inbox-table"><DataTable headers={['Project', 'Customer', 'My Role', 'Current Stage', 'Status', '']}>
      {rows.length ? rows.map(item => { const userLevel = item.approval.levels.find(level => level.level === item.approval.userLevel); const status = statusFor(item); return <tr key={item.project.id} className="approval-project-row" tabIndex={0} onClick={() => onOpen(item.project.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onOpen(item.project.id) }}><td><strong className="approval-project-link">{item.project.name} ({item.project.id})</strong></td><td>{item.project.customer || '-'}</td><td>{userLevel?.roleName || '-'}</td><td>{item.project.stage || item.project.currentStage || '-'}</td><td><strong className={`approval-row-status ${item.approval.completed ? 'approved' : item.approval.canAct ? 'pending' : ''}`}>{status}</strong></td><td><span className="approval-row-chevron" aria-hidden="true">›</span></td></tr> }) : <tr><td colSpan={6} className="sap-empty-row-cell">No {activeTab === 'approved' ? 'approved' : 'in-progress'} projects are assigned to you.</td></tr>}
    </DataTable></div>}
  </section>
}
