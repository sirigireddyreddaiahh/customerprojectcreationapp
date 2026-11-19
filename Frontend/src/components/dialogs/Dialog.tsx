import { useEffect, useId } from 'react'

export type DialogState = { type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string; onConfirm?: () => void; confirmLabel?: string; secondaryLabel?: string; onSecondary?: () => void; copyText?: string; messages?: Array<{ type: 'success' | 'warning' | 'error'; text: string }> }
export function Dialog({ state, onClose }: { state: DialogState | null; onClose: () => void }) {
  const messageListTitle = useId()
  if (!state) return null
  if (state.title === 'No changes to save') return <AutoDismissToast message="There are no changes to save." onClose={onClose} />
  if (state.title === 'Project changes saved') return <AutoDismissToast message="Your changes were saved." onClose={onClose} />
  if (state.title === 'Work package changes saved') return <AutoDismissToast message={state.message || 'Your changes were saved.'} onClose={onClose} />
  const leavePageWarning = state.type === 'warning' && state.confirmLabel === 'Leave Page'
  const discardConfirmation = state.type === 'warning' && state.confirmLabel === 'Discard'
  const saveConfirmation = state.type === 'warning' && state.confirmLabel === 'Save'
  const noChangesNotice = state.title === 'No changes to save'
  const workPackageSave = state.type === 'success' && state.title === 'Work package changes saved'
  const partialCompletion = state.title.includes('created with partial completion')
  const projectCreated = state.type === 'success' && state.title === 'Project created' && Boolean(state.copyText)
  const [partialSummary, ...partialDetails] = state.message.split(/\n\s*\n/)
  const confirm = () => { state.onConfirm?.(); onClose() }
  const confirmButton = <button className={state.type === 'error' ? 'danger' : 'primary'} onClick={confirm}>{state.confirmLabel || (state.onConfirm ? 'Continue' : 'Close')}</button>
  const secondaryButton = state.secondaryLabel && <button className="secondary" onClick={() => { state.onSecondary?.(); onClose() }}>{state.secondaryLabel}</button>
  const cancelButton = state.onConfirm && !workPackageSave && <button className="secondary" onClick={onClose}>Cancel</button>
  return <div className={`dialog-backdrop${saveConfirmation ? ' save-confirmation-backdrop' : ''}`} role="presentation"><div className={`dialog ${leavePageWarning ? 'leave-page-dialog' : ''}${discardConfirmation ? ' discard-confirmation-dialog' : ''}${saveConfirmation ? ' save-confirmation-dialog' : ''}${workPackageSave ? ' work-package-save-dialog' : ''}${noChangesNotice ? ' no-changes-dialog' : ''}${partialCompletion ? ' partial-completion-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby={state.messages ? messageListTitle : saveConfirmation ? 'save-confirmation-title' : undefined} aria-describedby={saveConfirmation ? 'save-confirmation-message' : undefined}>
    {state.messages ? <>
      <h2 id={messageListTitle}>{state.title} <small className="dialog-message-count">{state.messages.length}</small></h2>
      <ul className="dialog-message-list">
        {state.messages.map(({ type, text }) => <li key={text} className={`dialog-message dialog-message-${type}`}>
          <span className="dialog-message-icon" aria-hidden="true">{type === 'success' ? '✓' : '!'}</span>
          <span><strong>{type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : 'Error'}</strong>{text}</span>
        </li>)}
      </ul>
    </> : saveConfirmation ? <div className="save-confirmation-content">
      <span className="save-confirmation-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.75h11.2L20 8.55v10.7H5z"/><path d="M8 4.75v5h8v-5M8.5 19.25v-6h8v6"/></svg></span>
      <div className="save-confirmation-copy"><span className="save-confirmation-eyebrow">PROJECT UPDATE</span><h2 id="save-confirmation-title">{state.title}</h2><p id="save-confirmation-message">{state.message}</p></div>
    </div> : partialCompletion ? <>
      <header className="partial-completion-header"><span className="partial-completion-check" aria-hidden="true"></span><h2>{state.title}</h2></header>
      <p className="partial-completion-summary">{partialSummary}</p>
      {partialDetails.length > 0 && <div className="partial-completion-detail"><span aria-hidden="true">!</span><p>{partialDetails.join(' ')}</p></div>}
    </> : noChangesNotice ? <><h2>{state.title}</h2>{state.message && <p>{state.message}</p>}</> : <><h2>{(leavePageWarning || discardConfirmation) && <span className="warning-dialog-icon">!</span>}{state.title}</h2><p>{state.message}</p></>}
    {projectCreated && <div className="dialog-project-id"><strong>Project ID:</strong><code>{state.copyText}</code><button className="dialog-copy-icon" type="button" aria-label="Copy project ID" title="Copy project ID" onClick={() => navigator.clipboard?.writeText(state.copyText!)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button></div>}
    {state.copyText && !projectCreated && <button className="dialog-copy" type="button" onClick={() => navigator.clipboard?.writeText(state.copyText!)}>📋 Copy ID</button>}
    <div className="dialog-actions">{state.secondaryLabel ? <>{confirmButton}{secondaryButton}{cancelButton}</> : leavePageWarning ? <>{confirmButton}{cancelButton}</> : <>{cancelButton}{confirmButton}</>}</div>
  </div></div>
}

function AutoDismissToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 3000)
    return () => window.clearTimeout(timeout)
  }, [onClose])

  return <div className="sap-style-toast" role="status" aria-live="polite">{message}</div>
}
