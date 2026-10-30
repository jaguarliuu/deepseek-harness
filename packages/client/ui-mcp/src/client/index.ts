/** Register the MCP management settings section and its Host bindings. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import mcpRemote from '@deepseek-ai/dsh-client-ui-mcp/remote'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { McpSettingsPage, type McpSettingsFace } from './page.tsx'
import { McpSettingsModel } from './model.ts'
import { en, zh, type McpLocaleKey } from './locales.ts'
import type { McpSettings } from '../config.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'settings.mcp': McpLocaleKey }
}
/** Services required by the MCP settings section. */
export const inject = ['slots', 'locale', 'remote', 'configForms']
/**
 * Bind configuration persistence and connection testing to the existing settings host.
 * @param ctx - browser plugin context.
 */
export async function apply(ctx: Context): Promise<void> {
  const dispose = await ctx.remote.$mount(mcpRemote)
  ctx.effect(() => dispose)
  ctx.effect(() => ctx.locale.register('settings.mcp', { en, zh, ja: en, es: en, fr: en, de: en, ru: en, pt: en }))
  ctx.inject(['remote.mcpManager'], (inner) => {
    const scope = inner.configForms.get<McpSettings>('ui-mcp')
    const model = new McpSettingsModel(scope)
    inner.slots.inject('settings.section', () => inner.slots.register({
      name: 'settings.section', id: 'mcp', order: 18, locale: 'settings.mcp',
      label: () => ctx.locale.bind('settings.mcp')('title'),
      inject: (): McpSettingsFace => ({ hooks: { configuration: scope, activity: model.activity },
        save: (servers, revision) => model.save(servers, revision), test: async (server) => {
          const result = await inner.remote.mcpManager.test(server)
          return result.ok ? result.value : { ok: false as const, code: 'connection' as const }
        } }),
    }, McpSettingsPage))
  })
}
