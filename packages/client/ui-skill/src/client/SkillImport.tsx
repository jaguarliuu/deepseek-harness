/** Local skill files enter the workspace through the authenticated skill importer. */
import { useRef, useState } from 'react'
import { Button, Modal, IconPlusOutlineRegular, IconFolderCloseRegular, FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillImportRequest, SkillImportValue } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from './SkillsSection.module.css'

/** Import operation injected by the skill plugin owner. */
export interface SkillImportInjected {
  readonly onImportSkill: (request: SkillImportRequest) => Promise<SkillImportValue>
}

/** Read and upload a selected SKILL.md or complete skill folder, retaining actionable feedback. */
export function SkillImport({ sessionId, onImportSkill, onImported, t }: SkillImportInjected & PropsLocale<'skill'> & {
  sessionId: SessionId | undefined
  onImported: () => void
}) {
  const single = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<'success' | 'failed' | null>(null)
  const upload = async (selected: FileList | null): Promise<void> => {
    if (selected === null || selected.length === 0 || sessionId === undefined || pending) return
    setPending(true)
    setResult(null)
    try {
      const files = Array.from(selected)
      if (files.length > 256 || files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024) throw new Error('Skill bundle too large')
      const payload = await Promise.all(files.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const path = file.webkitRelativePath === '' ? file.name : file.webkitRelativePath.split('/').slice(1).join('/')
        return { path, base64: btoa(binary) }
      }))
      await onImportSkill({ sessionId, files: payload })
      setResult('success')
      onImported()
    } catch {
      setResult('failed')
    } finally {
      setPending(false)
      if (single.current) single.current.value = ''
      if (folder.current) folder.current.value = ''
    }
  }
  return <div className={css.importBox}>
    <Button variant="primary" icon={<IconPlusOutlineRegular size={16} />} disabled={sessionId === undefined}
      onClick={() => { setResult(null); setOpen(true) }}>{t('import.action')}</Button>
    {open && <Modal open title={t('import.action')} description={t('import.intro')} closeLabel={t('center.close')}
      onClose={() => { if (!pending) setOpen(false) }}>
      <div className={css.importChoices}>
        <button className={css.importChoice} disabled={pending} onClick={() => { single.current?.click() }}>
          <span className={css.importIcon}><FileTypeIcon path="SKILL.md" size={24} /></span>
          <span><strong>{t('import.file')}</strong><small>{t('import.fileHint')}</small></span>
        </button>
        <button className={css.importChoice} disabled={pending} onClick={() => { folder.current?.click() }}>
          <span className={css.importIcon}><IconFolderCloseRegular size={24} /></span>
          <span><strong>{t('import.folder')}</strong><small>{t('import.folderHint')}</small></span>
        </button>
        <p className={css.importNote}>{t('import.hint')}</p>
        {pending && <p role="status">{t('import.pending')}</p>}
        {result && <p role={result === 'failed' ? 'alert' : 'status'}>{t(`import.${result}`)}</p>}
      </div>
    </Modal>}
    <input ref={single} type="file" accept=".md" hidden aria-label={t('import.file')} onChange={(event) => { void upload(event.target.files) }} />
    <input ref={folder} type="file" {...{ webkitdirectory: '' }} multiple hidden aria-label={t('import.folder')} onChange={(event) => { void upload(event.target.files) }} />
  </div>
}
