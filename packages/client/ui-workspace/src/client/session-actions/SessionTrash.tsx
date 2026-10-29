/** Recoverable Session deletion and restoration surfaces. */
import { useState } from 'react'
import { Button, IconTrashOutlineRegular, MenuItemButton, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionMenuItemProps } from '../contract/slots.ts'
import css from './SessionTrash.module.css'

/** Shared request state and authenticated mutations. */
export interface SessionTrashInjected {
  readonly hooks: { readonly trashRequest: HostObservable<SessionId | null> }
  readonly requestTrash: (sessionId: SessionId | null) => void
  readonly trashSession: (sessionId: SessionId) => Promise<void>
  readonly purgeSession: (sessionId: SessionId) => Promise<void>
  readonly restoreSession: (sessionId: SessionId) => Promise<void>
}

/** Open the deletion confirmation outside the ephemeral row menu. */
export function SessionTrashMenuItem({
  sessionId, useMenuOpenState, useSessionAccess, requestTrash, t,
}: SessionMenuItemProps<SessionTrashInjected>) {
  const [, setOpen] = useMenuOpenState()
  const allowed = useSessionAccess(sessionId, 'workspace/trashSession')
  if (!allowed) return null
  return <MenuItemButton icon={<IconTrashOutlineRegular size={14} />} onSelect={() => { setOpen(false); requestTrash(sessionId) }}>{t('trash.delete')}</MenuItemButton>
}

/** Confirmation remains mounted if the owning row or menu disappears. */
export function SessionTrashConfirm({
  useTrashRequest, requestTrash, trashSession, t,
}: PropsRuntime<'shell.overlay'> & InjectFace<SessionTrashInjected> & PropsLocale<'workspace'>) {
  const sessionId = useTrashRequest(value => value)
  return sessionId === null ? null : <TrashConfirmation
    key={sessionId} sessionId={sessionId} onClose={() => { requestTrash(null) }} onTrash={trashSession} t={t}
  />
}

function TrashConfirmation({ sessionId, onClose, onTrash, t }: PropsLocale<'workspace'> & {
  sessionId: SessionId
  onClose: () => void
  onTrash: (sessionId: SessionId) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  return <Modal open title={t('trash.delete')} description={t('trash.confirm')} closeLabel={t('trash.cancel')} onClose={() => { if (!pending) onClose() }}>
    {failed && <p role="alert">{t('trash.failed')}</p>}
    <Button variant="primary" disabled={pending} onClick={() => {
      if (pending) return
      setPending(true)
      void onTrash(sessionId).then(onClose, () => { setFailed(true) }).finally(() => { setPending(false) })
    }}>{t(pending ? 'trash.pending' : 'trash.delete')}</Button>
  </Modal>
}

/** Sidebar icon; the shell supplies its label and hit area. */
export function SessionTrashIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconTrashOutlineRegular size={size} />
}

/** Browse recoverable deletions without opening or activating their Sessions. */
export function SessionTrashPage({ useWorkspaces, useSessions, restoreSession, purgeSession, t }: PropsRuntime<'main'> & InjectFace<SessionTrashInjected> & PropsLocale<'workspace'>) {
  const ids = useWorkspaces(state => state.trashedSessionIds) ?? []
  const sessions = useSessions(state => state.byId)
  const [pending, setPending] = useState<SessionId | null>(null)
  const [confirm, setConfirm] = useState<SessionId | null>(null)
  const [failed, setFailed] = useState<'restore' | 'purge' | null>(null)
  return <section className={css.page}>
    <h1>{t('trash.title')}</h1><p>{t('trash.intro')}</p>
    {failed && <p role="alert">{t(failed === 'purge' ? 'trash.purgeFailed' : 'trash.restoreFailed')}</p>}
    {ids.length === 0 && <p>{t('trash.empty')}</p>}
    <ul>{ids.map(id => <li key={id}><div><strong>{sessions[id]?.title || t('trash.untitled')}</strong><small>{sessions[id]?.cwd ?? id}</small></div>
      <Button disabled={pending !== null} onClick={() => {
        setPending(id); setFailed(null)
        void restoreSession(id).catch(() => { setFailed('restore') }).finally(() => { setPending(null) })
      }}>{t('trash.restore')}</Button><Button disabled={pending !== null} onClick={() => { setConfirm(id) }}>{t('trash.purge')}</Button>
    </li>)}</ul>
    {confirm !== null && <Modal open title={t('trash.purge')} description={t('trash.purgeConfirm')} closeLabel={t('trash.cancel')} onClose={() => { if (pending === null) setConfirm(null) }}>
      <Button disabled={pending !== null} onClick={() => {
        setPending(confirm); setFailed(null)
        void purgeSession(confirm).then(() => { setConfirm(null) }, () => { setFailed('purge'); setConfirm(null) }).finally(() => { setPending(null) })
      }}>{t('trash.purge')}</Button>
    </Modal>}
  </section>
}
