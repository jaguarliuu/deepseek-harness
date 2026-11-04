/** Register the State Grid remote operations workspace through existing UI and RPC seams. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import remote from '@deepseek-ai/dsh-client-ui-remote-ops/remote'
import { OpsPage, OpsIcon, OpsToast, type OpsFace } from './page.tsx'
import { createTerminalStore } from './store.ts'
import { en, zh } from './locales.ts'
/** Browser services consumed by this workspace. */
export const inject = ['slots', 'locale', 'remote', 'layout', 'uiWorkspace']
/**
 * Mount typed RPC and panel navigation; no model or credential values are held by the registrant.
 * @param ctx - client services.
 */
export async function apply(ctx: Context): Promise<void> {
  const dispose = await ctx.remote.$mount(remote)
  ctx.effect(() => dispose)
  ctx.effect(() => ctx.locale.register('remoteOps', { en, zh, ja: en, es: en, fr: en, de: en, ru: en, pt: en }))
  ctx.inject(['remote.remoteOps'], (inner) => {
    const face: OpsFace = {
      list: async () => {
        const r = await inner.remote.remoteOps.list()
        if (!r.ok) throw new Error('localFailure')
        return r.value
      },
      probe: async (host, port) => {
        const r = await inner.remote.remoteOps.probe(host, port)
        return r.ok ? r.value : { ok: false, code: 'localFailure' }
      },
      save: async (input) => {
        const r = await inner.remote.remoteOps.save(input)
        return r.ok ? r.value : { ok: false, code: 'localFailure' }
      },
      test: async (id) => {
        const r = await inner.remote.remoteOps.test(id)
        return r.ok ? r.value : { ok: false, code: 'localFailure' }
      },
      remove: async (id) => {
        const r = await inner.remote.remoteOps.deleteServer(id)
        return r.ok ? r.value : { ok: false, code: 'localFailure' }
      },
      connect: async (id) => {
        const r = await inner.remote.remoteOps.connect(id)
        if (!r.ok) throw new Error('connectionFailed')
        return r.value
      },
      read: async (id, cursor) => {
        const r = await inner.remote.remoteOps.read(id, cursor)
        if (!r.ok) throw new Error('connectionFailed')
        return r.value
      },
      write: async (id, data, cols, rows) => {
        const r = await inner.remote.remoteOps.write(id, data, cols, rows)
        if (!r.ok) throw new Error('connectionFailed')
      },
      disconnect: async (id) => {
        const r = await inner.remote.remoteOps.disconnect(id)
        if (!r.ok) throw new Error('connectionFailed')
      },
      ask: (prompt) => {
        ctx.layout.selectPanel(null)
        ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'append' })
      },
    }
    const store = createTerminalStore()
    inner.slots.inject('shell.overlay', () =>
      inner.slots.register({ name: 'shell.overlay', id: 'remote-ops-notice', locale: 'remoteOps', store }, OpsToast),
    )
    inner.slots.inject('main', () =>
      inner.slots.register(
        { name: 'main', key: 'remote-ops' as MainPanelId, locale: 'remoteOps', store, inject: () => face },
        OpsPage,
      ),
    )
    inner.slots.inject('sidebar.panellist', () =>
      inner.slots.register(
        {
          name: 'sidebar.panellist',
          id: 'remote-ops',
          order: 15,
          locale: 'remoteOps',
          label: () => ctx.locale.bind('remoteOps')('title'),
        },
        OpsIcon,
      ),
    )
  })
}
