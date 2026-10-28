/** Staged registry settings backed by the owning Host configuration entries. */
import { SettingsFormModel, type SettingsFormScope, type SettingsFieldSpec } from '@deepseek-ai/dsh-client-ui-primitives'

/** Host fields used by the source editor; other fields remain untouched. */
export interface SourceSettings {
  registry?: string
  environment?: Record<string, string>
}

/**
 * Accept an HTTP(S) source without embedded credentials, query, or fragment.
 * @param text - user-entered source address.
 * @returns normalized address, empty for reset, or undefined for invalid input.
 */
export function sourceAddress(text: string): string | undefined {
  const value = text.trim()
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return undefined
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return url.href
  } catch { return undefined }
}

/**
 * Stage one source, preserving unrelated environment and plugin configuration.
 * @param scope - persistent, revision-fenced Host entry.
 * @param kind - npm manager or local-process Python source.
 * @returns form whose saves reach the owning entry.
 */
export function sourceForm(scope: SettingsFormScope<SourceSettings>, kind: 'npm' | 'python'): SettingsFormModel<SourceSettings> {
  const project = (value: unknown): SourceSettings | undefined => {
    if (value === undefined || value === null || typeof value !== 'object') return undefined
    if (kind === 'npm') return value
    const environment = (value as SourceSettings).environment
    return environment?.PIP_INDEX_URL === undefined ? {} : { registry: environment.PIP_INDEX_URL }
  }
  const adapted: SettingsFormScope<SourceSettings> = {
    subscribe: listener => scope.subscribe(listener),
    getSnapshot: () => {
      const snapshot = scope.getSnapshot()
      return { ...snapshot, value: project(snapshot.value), base: project(snapshot.base), user: project(snapshot.user) }
    },
    mutate: (ops, revision) => scope.mutate(ops.flatMap((op) => {
      if (kind === 'python') return [{ ...op, path: ['environment', 'PIP_INDEX_URL'] }]
      return [op, op.op === 'set'
        ? { op: 'set' as const, path: ['fallbackRegistries'], value: [] }
        : { op: 'unset' as const, path: ['fallbackRegistries'] }]
    }), revision),
  }
  const field: SettingsFieldSpec = {
    field: 'registry', format: value => typeof value === 'string' ? value : '',
    parse: (text) => {
      const value = sourceAddress(text)
      return value === undefined ? undefined : value === '' ? { kind: 'clear' } : { kind: 'set', value }
    },
  }
  return new SettingsFormModel(adapted, [field])
}
