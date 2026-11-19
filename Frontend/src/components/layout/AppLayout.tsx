import type { ReactNode } from 'react'

export type PageKey = 'overview' | 'create-customer' | 'create-internal' | 'approvals' | 'workspace' | 'work-package'

type SidebarIcon =
  | 'home'
  | 'project-info'
  | 'projects'
  | 'work-packages'
  | 'approvals'
  | 'resources'
  | 'attachments'
  | 'reports'
  | 'notifications'
  | 'help'

const navItems: { key: PageKey; label: string; icon: SidebarIcon }[] = [
  { key: 'overview', label: 'Home', icon: 'home' },
  { key: 'create-customer', label: 'Project Information', icon: 'project-info' },
  { key: 'workspace', label: 'Projects', icon: 'projects' },
  { key: 'work-package', label: 'Work Packages', icon: 'work-packages' },
  { key: 'approvals', label: 'Approvals', icon: 'approvals' },
  { key: 'workspace', label: 'Resources', icon: 'resources' },
  { key: 'workspace', label: 'Attachments', icon: 'attachments' },
  { key: 'workspace', label: 'Reports', icon: 'reports' },
]

function NavIcon({ icon }: { icon: SidebarIcon }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (icon === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.8 12 4l9 6.8" {...common} />
        <path d="M5.5 10.6V20h13V10.6" {...common} />
      </svg>
    )
  }
  if (icon === 'project-info') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3.8" width="14" height="16.4" rx="2" {...common} />
        <path d="M8.2 8.2h7.6M8.2 12h7.6M8.2 15.8h5.3" {...common} />
      </svg>
    )
  }
  if (icon === 'projects') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.8" y="6" width="16.4" height="12" rx="2.5" {...common} />
        <path d="M8 6V4.6h8V6" {...common} />
      </svg>
    )
  }
  if (icon === 'work-packages') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.8" y="7" width="16.4" height="11.5" rx="2.5" {...common} />
        <path d="M9 7V5h6v2" {...common} />
      </svg>
    )
  }
  if (icon === 'approvals') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.8 5.7 6.1v5.5c0 4.3 2.7 7.2 6.3 8.6 3.6-1.4 6.3-4.3 6.3-8.6V6.1L12 3.8Z" {...common} />
        <path d="m9 12 2.1 2.1L15.4 9.8" {...common} />
      </svg>
    )
  }
  if (icon === 'resources') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="9" r="2.4" {...common} />
        <circle cx="16" cy="8" r="2" {...common} />
        <path d="M3.8 18.5c.8-2.4 2.7-3.9 5.3-3.9s4.5 1.5 5.3 3.9" {...common} />
        <path d="M13.1 18.5c.6-1.7 2-2.8 3.9-2.8 1.8 0 3.2 1.1 3.8 2.8" {...common} />
      </svg>
    )
  }
  if (icon === 'attachments') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.8 12.6 13.7 7.7a2.8 2.8 0 1 1 4 4l-6.5 6.5a4.2 4.2 0 1 1-6-6l6.1-6.2" {...common} />
      </svg>
    )
  }
  if (icon === 'reports') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.8 19.2h14.4" {...common} />
        <path d="M7 19.2v-7.5M12 19.2v-10M17 19.2v-5" {...common} />
      </svg>
    )
  }
  if (icon === 'notifications') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.4 16.6h11.2l-1.2-1.7v-4A4.4 4.4 0 0 0 12 6.5a4.4 4.4 0 0 0-4.4 4.4v4l-1.2 1.7Z" {...common} />
        <path d="M10.1 18.4a2 2 0 0 0 3.8 0" {...common} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" {...common} />
      <path d="M12 16v-4.5" {...common} />
      <circle cx="12" cy="8" r="0.7" fill="currentColor" />
    </svg>
  )
}

export function AppLayout({ activePage, onNavigate, onBack, onHome, children }: { activePage: PageKey; onNavigate: (page: PageKey) => void; onBack: () => void; onHome: () => void; children: ReactNode }) {
  const isActive = (key: PageKey) => key === activePage || (key === 'create-customer' && activePage === 'create-internal')
  return (
    <div className="app-shell">
      <header className="ui5-shellbar">
        <div className="ui5-shellbar-start">
          <button className="global-back-button" type="button" onClick={onBack} disabled={activePage === 'overview'} aria-label="Go back">
            <span aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M19 12H5M5 12l7-7M5 12l7 7" /></svg></span>
            Back
          </button>
          <button className="ui5-shell-logo-home" type="button" onClick={onHome} aria-label="Go to Project Overview" title="Home">
            <img className="ui5-shell-logo" src="/infinite logo.jpg" alt="Infinite" />
          </button>
          <span className="ui5-product-name">S/4HANA Cloud</span>
        </div>
        <div className="ui5-shellbar-actions" aria-label="Application actions">
          <button type="button" aria-label="Help">?</button>
          <button type="button" aria-label="Notifications">♧</button>
        </div>
      </header>
      {false && <aside className="sidebar">
        <div className="sidebar-logo">
          <img className="infinite-logo" src="/infinite logo.jpg" alt="Infinite" />
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">Customer</span>
            <span className="sidebar-logo-subtitle">Projects</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              className={`nav-item nav-button ${isActive(item.key) ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
              type="button"
            >
              <span className="nav-icon"><NavIcon icon={item.icon} /></span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-arrow">›</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />

        <div className="sidebar-bottom">
          <button className="nav-item nav-button" type="button">
            <span className="nav-icon"><NavIcon icon="notifications" /></span>
            <span className="nav-label">Notifications</span>
            <span className="notification-badge">3</span>
          </button>
          <button className="nav-item nav-button" type="button">
            <span className="nav-icon"><NavIcon icon="help" /></span>
            <span className="nav-label">Help</span>
          </button>
        </div>
      </aside>}

      <main className="app-main">
        <section className="content">
          {children}
        </section>
      </main>
    </div>
  )
}
