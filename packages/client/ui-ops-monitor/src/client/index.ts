/** Dashboard registration and shared live-resource transport. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import remote from '@deepseek-ai/dsh-client-ui-ops-monitor/remote'
import type { Dashboard } from '../types.ts'
import { MonitorPage, MonitorIcon, type MonitorFace } from './page.tsx'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { opsmonitor: Dashboard }
}
/** Services used by the browser half. */
export const inject = ['slots', 'locale', 'remote', 'resources', 'layout', 'uiWorkspace']
/**
 * Mount generated RPC, one resource provider and a sidebar page.
 * @param ctx - injected browser services.
 */
export async function apply(ctx: Context): Promise<void> {
  const dispose = await ctx.remote.$mount(remote)
  ctx.effect(() => dispose)
  ctx.effect(() => ctx.locale.register('opsMonitor', { en, zh, ja: en, es: en, fr: en, de: en, ru: en, pt: en }))
  ctx.inject(['remote.opsMonitor'], (inner) => {
    inner.effect(() => inner.resources.register<'opsmonitor'>({
      protocol: 'opsmonitor',
      async *open(_address, { signal }) {
        try {
          for await (const value of inner.remote.opsMonitor.follow(signal)) yield { ok: true as const, value }
        } catch (error) {
          if (!signal.aborted) yield { ok: false as const, error: remoteErrorOf(error) ?? new RemoteError('gateway/internal', 'Monitoring stream failed', {}) }
        }
      },
    }))
    // selectPanel preserves the current page when the requested panel is absent.
    const navigate = (panel: string): boolean => {
      try { ctx.layout.selectPanel(panel as MainPanelId) }
      catch (_unavailablePanel: unknown) { return false }
      return true
    }
    const face: MonitorFace = {
      enable: async (serverId, templates, target) => {
        const result = await inner.remote.opsMonitor.enable(serverId, templates, target)
        if (!result.ok) throw new Error('Monitoring enrollment failed')
      },
      disable: async (serverId) => {
        const result = await inner.remote.opsMonitor.disable(serverId)
        if (!result.ok) throw new Error('Monitoring pause failed')
      },
      manage: () => navigate('remote-ops'),
      plugins: () => navigate('plugins'),
      ask: (prompt) => {
        ctx.layout.selectPanel(null)
        ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'append' })
      },
    }
    inner.slots.inject('main', () => inner.slots.register({ name: 'main', key: 'ops-monitor' as MainPanelId,
      locale: 'opsMonitor', inject: () => face }, MonitorPage))
    inner.slots.inject('sidebar.panellist', () => inner.slots.register({ name: 'sidebar.panellist', id: 'ops-monitor',
      order: 16, locale: 'opsMonitor', label: () => ctx.locale.bind('opsMonitor')('title') }, MonitorIcon))
  })
}
