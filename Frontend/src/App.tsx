import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppLayout, type PageKey } from './components/layout/AppLayout'
import { Dialog, type DialogState } from './components/dialogs/Dialog'
import { CustomerProjectCreation } from './pages/CustomerProjectCreation'
import { ProjectOverview } from './pages/ProjectOverview'
import { ProjectWorkspace, type SelectedWorkPackage } from './pages/ProjectWorkspace'
import type { ProjectWorkspaceResponse, WorkPackageDemandDetailsResponse } from './services/projectService'
import { WorkPackageDetail } from './pages/WorkPackageDetail'
import { ApprovalInbox } from './pages/ApprovalInbox'
import './App.css'
import './glass-theme.css'
import './ui5-theme.css'
import './ui5-overrides.css'
import './ProjectTypeModal.css'

const APP_TABS: { key: 'project-information' | 'create-project'; label: string }[] = [
  { key: 'project-information', label: 'Project Information' },
  { key: 'create-project', label: 'Create New Project' },
]

const isProjectInformationPage = (page: PageKey) => page === 'overview' || page === 'workspace' || page === 'work-package'
const isWorkspacePage = (page: PageKey) => page === 'workspace' || page === 'work-package'

type AppHistoryState = {
  customerProjectApp?: true
  page: PageKey
  selectedWorkPackage?: SelectedWorkPackage | null
  workspaceProjectId?: string
  workspaceTab?: string
  approvalProject?: boolean
}

export default function App() {
  const [initialHistoryState] = useState<AppHistoryState | null>(() => {
    const state = window.history.state as AppHistoryState | null
    return state?.customerProjectApp ? state : null
  })
  const [page, setPage] = useState<PageKey>(initialHistoryState?.page || 'overview')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [selectedWorkPackage, setSelectedWorkPackage] = useState<SelectedWorkPackage | null>(initialHistoryState?.selectedWorkPackage || null)
  const [workspace, setWorkspace] = useState<ProjectWorkspaceResponse | null>(null)
  const [workspaceProjectId, setWorkspaceProjectId] = useState(initialHistoryState?.workspaceProjectId || '')
  const [workspaceTab, setWorkspaceTab] = useState(initialHistoryState?.workspaceTab || 'Project Information')
  const [projectTypeOpen, setProjectTypeOpen] = useState(false)
  const [workspaceDirty, setWorkspaceDirty] = useState(false)
  const [workPackageWorkItemsDrafts, setWorkPackageWorkItemsDrafts] = useState<Record<string, WorkPackageDemandDetailsResponse['workItems']>>({})
  const [billingDirty, setBillingDirty] = useState(false)
  const [approvalProject, setApprovalProject] = useState(initialHistoryState?.approvalProject || false)
  const bypassPopGuard = useRef(false)
  const projectTypeLeaveApproved = useRef(false)

  useEffect(() => {
    let title = 'Customer Project Management'
    if (page === 'workspace' || page === 'work-package') {
      title = workspace?.project.name
        ? `${workspace.project.name} | Customer Project Management`
        : 'Project Workspace | Customer Project Management'
    } else if (page === 'create-customer' || page === 'create-internal') {
      title = 'Create Project | Customer Project Management'
    } else if (page === 'approvals') {
      title = 'Approval Inbox | Customer Project Management'
    }
    document.title = title
  }, [page, workspace])

  const navigateNow = useCallback((nextPage: PageKey, nextWorkPackage: SelectedWorkPackage | null = null, context: Partial<Pick<AppHistoryState, 'workspaceProjectId' | 'workspaceTab' | 'approvalProject'>> = {}) => {
    const state: AppHistoryState = {
      customerProjectApp: true,
      page: nextPage,
      selectedWorkPackage: nextWorkPackage,
      workspaceProjectId: context.workspaceProjectId ?? workspaceProjectId,
      workspaceTab: context.workspaceTab ?? workspaceTab,
      approvalProject: context.approvalProject ?? approvalProject,
    }
    window.history.pushState(state, '', window.location.href)
    setSelectedWorkPackage(nextWorkPackage)
    setPage(nextPage)
    setWorkspaceProjectId(state.workspaceProjectId || '')
    setWorkspaceTab(state.workspaceTab || 'Project Information')
    setApprovalProject(Boolean(state.approvalProject))
  }, [approvalProject, workspaceProjectId, workspaceTab])
  const confirmBillingLeave = useCallback((leave: () => void) => {
    setDialog({
      type: 'warning',
      title: 'Warning',
      message: 'Data has been changed. Do you want to save?',
      confirmLabel: 'Yes',
      secondaryLabel: 'No',
      onConfirm: () => window.dispatchEvent(new CustomEvent('workspace-save-click', { detail: { onComplete: (saved: boolean) => { if (saved) leave() } } })),
      onSecondary: () => {
        window.dispatchEvent(new Event('billing-cancel-edit'))
        window.dispatchEvent(new CustomEvent('billing-edit-mode', { detail: false }))
        window.dispatchEvent(new CustomEvent('workspace-edit-mode', { detail: false }))
        setBillingDirty(false)
        setWorkspaceDirty(false)
        leave()
      },
    })
  }, [])
  const navigate = useCallback((nextPage: PageKey, nextWorkPackage: SelectedWorkPackage | null = null, context: Partial<Pick<AppHistoryState, 'workspaceProjectId' | 'workspaceTab' | 'approvalProject'>> = {}) => {
    const withinProjectEditSession = (page === 'workspace' && nextPage === 'work-package') || (page === 'work-package' && nextPage === 'workspace')
    if ((!workspaceDirty && !billingDirty) || withinProjectEditSession) return navigateNow(nextPage, nextWorkPackage, context)
    if (billingDirty && page === 'workspace' && workspaceTab === 'Billing') return confirmBillingLeave(() => navigateNow(nextPage, nextWorkPackage, context))
    setDialog({ type: 'warning', title: 'Warning', message: 'You are leaving the page and all unsaved entries will be lost.', confirmLabel: 'Leave Page', onConfirm: () => { setWorkspaceDirty(false); navigateNow(nextPage, nextWorkPackage, context) } })
  }, [billingDirty, confirmBillingLeave, navigateNow, page, workspaceDirty, workspaceTab])
  const changeWorkspaceTab = useCallback((tab: string) => {
    setWorkspaceTab(tab)
    const current = window.history.state as AppHistoryState | null
    if (current?.customerProjectApp) window.history.replaceState({ ...current, workspaceTab: tab }, '', window.location.href)
  }, [])
  const goHome = useCallback(() => {
    if (page === 'overview') return
    const returnHome = () => {
      setWorkspaceDirty(false)
      setBillingDirty(false)
      setProjectTypeOpen(false)
      projectTypeLeaveApproved.current = false
      setApprovalProject(false)
      setWorkspaceTab('Project Information')
      navigateNow('overview')
    }
    if (!workspaceDirty && !billingDirty) return returnHome()
    if (billingDirty && page === 'workspace' && workspaceTab === 'Billing') return confirmBillingLeave(returnHome)
    setDialog({ type: 'warning', title: 'Warning', message: 'You are leaving the page and all unsaved entries will be lost.', confirmLabel: 'Leave Page', onConfirm: returnHome })
  }, [billingDirty, confirmBillingLeave, navigateNow, page, workspaceDirty, workspaceTab])
  const openProjectType = useCallback(() => {
    if (!workspaceDirty) return setProjectTypeOpen(true)
    setDialog({ type: 'warning', title: 'Warning', message: 'You are leaving the page and all unsaved entries will be lost.', confirmLabel: 'Leave Page', onConfirm: () => { projectTypeLeaveApproved.current = true; setProjectTypeOpen(true) } })
  }, [workspaceDirty])
  const startProjectCreation = useCallback((nextPage: 'create-customer' | 'create-internal') => {
    if (projectTypeLeaveApproved.current) { projectTypeLeaveApproved.current = false; setWorkspaceDirty(false); navigateNow(nextPage); setProjectTypeOpen(false); return }
    navigate(nextPage)
    setProjectTypeOpen(false)
  }, [navigate, navigateNow])
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { if (!workspaceDirty) return; event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [workspaceDirty])
  useEffect(() => {
    if (!projectTypeOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { projectTypeLeaveApproved.current = false; setProjectTypeOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectTypeOpen])
  const goBack = useCallback(() => {
    const billingDetailBack = new Event('billing-item-detail-back', { cancelable: true })
    window.dispatchEvent(billingDetailBack)
    if (billingDetailBack.defaultPrevented) return
    if (page === 'overview') return
    const targetPage: PageKey = page === 'work-package' ? 'workspace' : 'overview'
    if (page === 'work-package') {
      setWorkspaceTab('Budget')
      navigateNow('workspace', null, { workspaceTab: 'Budget' })
      return
    }
    const returnToPreviousScreen = () => {
      setBillingDirty(false)
      setWorkspaceDirty(false)
      if (targetPage === 'workspace') setWorkspaceTab('Budget')
      else {
        setApprovalProject(false)
        setWorkspaceTab('Project Information')
      }
      navigateNow(targetPage, null, { workspaceTab: targetPage === 'workspace' ? 'Budget' : 'Project Information', approvalProject: targetPage === 'workspace' ? approvalProject : false })
    }
    if (workspaceDirty || billingDirty) {
      if (billingDirty && page === 'workspace' && workspaceTab === 'Billing') return confirmBillingLeave(returnToPreviousScreen)
      setDialog({ type: 'warning', title: 'Warning', message: 'You are leaving the page and all unsaved entries will be lost.', confirmLabel: 'Leave Page', onConfirm: returnToPreviousScreen })
      return
    }
    returnToPreviousScreen()
  }, [approvalProject, billingDirty, confirmBillingLeave, navigateNow, page, workspaceDirty, workspaceTab])

  useEffect(() => {
    if (!(window.history.state as AppHistoryState | null)?.customerProjectApp) {
      window.history.replaceState({ customerProjectApp: true, page: 'overview', selectedWorkPackage: null, workspaceProjectId: '', workspaceTab: 'Project Information', approvalProject: false } satisfies AppHistoryState, '', window.location.href)
    }
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as AppHistoryState | null
      if (!state?.customerProjectApp) return
      const withinProjectEditSession = (page === 'workspace' && state.page === 'work-package') || (page === 'work-package' && state.page === 'workspace')
      if ((workspaceDirty || billingDirty) && !withinProjectEditSession && !bypassPopGuard.current) {
        window.history.pushState({ customerProjectApp: true, page, selectedWorkPackage, workspaceProjectId, workspaceTab, approvalProject } satisfies AppHistoryState, '', window.location.href)
        if (billingDirty && page === 'workspace' && workspaceTab === 'Billing') {
          confirmBillingLeave(() => { bypassPopGuard.current = true; setWorkspaceDirty(false); setBillingDirty(false); window.history.back() })
          return
        }
        setDialog({ type: 'warning', title: 'Warning', message: 'You are leaving the page and all unsaved entries will be lost.', confirmLabel: 'Leave Page', onConfirm: () => { bypassPopGuard.current = true; setWorkspaceDirty(false); window.history.back() } })
        return
      }
      bypassPopGuard.current = false
      setSelectedWorkPackage(state.selectedWorkPackage || null)
      setPage(state.page)
      setWorkspaceProjectId(state.workspaceProjectId || '')
      setWorkspaceTab(state.workspaceTab || 'Project Information')
      setApprovalProject(Boolean(state.approvalProject))
      setProjectTypeOpen(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [approvalProject, billingDirty, confirmBillingLeave, page, selectedWorkPackage, workspaceDirty, workspaceProjectId, workspaceTab])
  const content = useMemo(() => {
    if (page === 'overview') return <ProjectOverview onCreate={() => setProjectTypeOpen(true)} onCreateInternal={() => setProjectTypeOpen(true)} onOpenWorkspace={projectId => { setWorkspace(null); navigate('workspace', null, { approvalProject: false, workspaceProjectId: projectId, workspaceTab: 'Project Information' }) }} />
    if (page === 'approvals') return <ApprovalInbox onOpen={projectId => { setWorkspace(null); navigate('workspace', null, { approvalProject: true, workspaceProjectId: projectId, workspaceTab: 'Project Information' }) }} />
    if (page === 'create-customer') return <CustomerProjectCreation kind="customer" onMessage={setDialog} onCancel={() => navigate('overview')} onCreated={id => setDialog({ type: 'success', title: 'Project created', message: `Created project ID: ${id}`, confirmLabel: 'OK', copyText: id, onConfirm: () => navigate('workspace', null, { approvalProject: false, workspaceProjectId: id, workspaceTab: 'Project Information' }) })} />
    if (page === 'create-internal') return <CustomerProjectCreation kind="internal" onMessage={setDialog} onCancel={() => navigate('overview')} onCreated={id => setDialog({ type: 'success', title: 'Project created', message: `Created project ID: ${id}`, confirmLabel: 'OK', copyText: id, onConfirm: () => navigate('workspace', null, { approvalProject: false, workspaceProjectId: id, workspaceTab: 'Project Information' }) })} />
    if (page === 'workspace' || page === 'work-package') return <>
      <div style={{ display: page === 'workspace' ? 'contents' : 'none' }}><ProjectWorkspace workspace={workspace} initialProjectId={workspaceProjectId} initialTab={workspaceTab} approvalMode={approvalProject} onApprovalBack={() => navigate('approvals')} onTabChange={changeWorkspaceTab} onWorkspaceChange={setWorkspace} onOpenWorkPackage={workPackage => navigate('work-package', workPackage)} onMessage={setDialog} onDirtyChange={setWorkspaceDirty} onBillingDirtyChange={setBillingDirty} /></div>
      <div style={{ display: page === 'work-package' ? 'contents' : 'none' }}><WorkPackageDetail selectedWorkPackage={selectedWorkPackage} onBack={goBack} onMessage={setDialog} editingMode={workspaceDirty} assignedWorkItemsDraft={selectedWorkPackage ? workPackageWorkItemsDrafts[selectedWorkPackage.id] : undefined} /></div>
    </>
    return <WorkPackageDetail selectedWorkPackage={selectedWorkPackage} onBack={goBack} onMessage={setDialog} editingMode={workspaceDirty} assignedWorkItemsDraft={selectedWorkPackage ? workPackageWorkItemsDrafts[selectedWorkPackage.id] : undefined} />
  }, [approvalProject, goBack, navigate, page, selectedWorkPackage, workspace, workspaceDirty, workspaceTab, workPackageWorkItemsDrafts])

  useEffect(() => {
    const onWorkPackageWorkItemsDraftChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ workPackageId?: string; workItems?: WorkPackageDemandDetailsResponse['workItems'] }>).detail
      if (!detail?.workPackageId || !Array.isArray(detail.workItems)) return
      setWorkPackageWorkItemsDrafts(current => ({ ...current, [detail.workPackageId!]: detail.workItems! }))
    }
    window.addEventListener('work-package-work-items-draft-changed', onWorkPackageWorkItemsDraftChanged)
    return () => window.removeEventListener('work-package-work-items-draft-changed', onWorkPackageWorkItemsDraftChanged)
  }, [])

  return (
    <AppLayout activePage={page} onNavigate={nextPage => navigate(nextPage)} onBack={goBack} onHome={goHome}>
      <section className={`global-page-header card ${(page === 'create-customer' || page === 'create-internal') ? 'create-project-header' : ''}`}>
        <div className="global-page-heading">
          {page !== 'overview' && page !== 'create-customer' && page !== 'create-internal' && page !== 'workspace' && <button className="secondary app-back-button" type="button" onClick={goBack}>‹ Back</button>}
        </div>
        <div className={`tabs global-page-tabs${isWorkspacePage(page) ? ' single-tab' : ''}`}>
          {APP_TABS.filter(tab => !isWorkspacePage(page) || tab.key !== 'create-project').map(tab => (
            <button
              key={tab.key}
              className={`tab ${(tab.key === 'create-project' ? page === 'create-customer' || page === 'create-internal' : isProjectInformationPage(page)) ? 'active' : ''}`}
              onClick={() => (tab.key === 'create-project' ? openProjectType() : navigate('overview'))}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>
      {content}
      {projectTypeOpen && createPortal(
        <div className="project-type-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { projectTypeLeaveApproved.current = false; setProjectTypeOpen(false) } }}>
          <div className="project-type-modal" role="dialog" aria-modal="true" aria-labelledby="project-type-title" aria-describedby="project-type-description">
            <div className="project-type-heading">
              <div><p>New project</p><h2 id="project-type-title">Choose project type</h2><span id="project-type-description">Select the project format that fits your work.</span></div>
              <button type="button" className="project-type-close" aria-label="Close dialog" onClick={() => { projectTypeLeaveApproved.current = false; setProjectTypeOpen(false) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
            </div>
            <div className="project-type-options">
              <button type="button" onClick={() => startProjectCreation('create-customer')}>
                <span className="project-type-icon customer" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20M9.5 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM16 8h5M18.5 5.5v5" /></svg></span>
                <span className="project-type-copy"><strong>Customer Project</strong><small>Plan and deliver work associated with a customer.</small></span>
                <span className="project-type-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></span>
              </button>
              <button type="button" onClick={() => startProjectCreation('create-internal')}>
                <span className="project-type-icon internal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h16M6 20V8l6-4 6 4v12M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01" /></svg></span>
                <span className="project-type-copy"><strong>Internal Project</strong><small>Organize non-customer initiatives and internal work.</small></span>
                <span className="project-type-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></span>
              </button>
            </div>
          </div>
        </div>, document.body,
      )}
      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </AppLayout>
  )
}
