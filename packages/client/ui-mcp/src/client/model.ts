/** Revision-fenced MCP configuration editing. */
import type { SettingsFormScope } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { serversSchema, type McpServer, type McpSettings } from '../config.ts'

/** Retained mutation status shared by the page and its editor. */
export class McpSettingsModel {
  /** Observable save progress and last accepted or rejected mutation. */
  readonly activity = createSnapshotStore<{ saving: boolean; result: 'saved' | 'saveFailed' | null }>({ saving: false, result: null })
  constructor(readonly scope: SettingsFormScope<McpSettings>) {}

  /**
   * Replace the server list only if the editor's original revision is still current.
   * @param servers - complete next set of definitions.
   * @param revision - configuration revision captured when editing began.
   * @returns true only after the configuration owner accepts the write.
   */
  async save(servers: McpServer[], revision: number | undefined): Promise<boolean> {
    if (this.activity.getSnapshot().saving || !serversSchema.safeParse(servers).success) return false
    this.activity.set({ saving: true, result: null })
    let accepted = false
    try { accepted = await this.scope.mutate([{ op: 'set', path: ['servers'], value: servers }], revision) }
    catch (_saveFailure) { accepted = false }
    this.activity.set({ saving: false, result: accepted ? 'saved' : 'saveFailed' })
    return accepted
  }
}
