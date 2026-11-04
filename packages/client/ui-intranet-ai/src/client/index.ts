/** Register internal-AI settings and task workspace using generated Host RPC types. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import remote from '@deepseek-ai/dsh-client-ui-intranet-ai/remote'
import { AiPage, type AiFace } from './page.tsx'
import { en, zh } from './locales.ts'
import type { AiSettings } from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.intranetAi': keyof typeof en
  }
}
/** Browser services used by the capability page. */
export const inject = ['slots', 'locale', 'remote', 'configForms']
/**
 * Mount account-safe RPC and the State Grid settings section.
 * @param ctx - client context.
 */
export async function apply(ctx: Context): Promise<void> {
  const dispose = await ctx.remote.$mount(remote)
  ctx.effect(() => dispose)
  ctx.effect(() =>
    ctx.locale.register('settings.intranetAi', { en, zh, ja: en, es: en, fr: en, de: en, ru: en, pt: en }),
  )
  ctx.inject(['remote.intranetAi'], (inner) => {
    const form = inner.configForms.get<AiSettings>('ui-intranet-ai')
    inner.slots.inject('settings.section', () =>
      inner.slots.register(
        {
          name: 'settings.section',
          id: 'intranet-ai',
          order: 17,
          locale: 'settings.intranetAi',
          label: () => ctx.locale.bind('settings.intranetAi')('title'),
          inject: (): AiFace => ({
            hooks: { configuration: form },
            save: (value, revision) =>
              form.mutate(
                [
                  { op: 'set', path: ['baseUrl'], value: value.baseUrl },
                  { op: 'set', path: ['imageModels'], value: value.imageModels },
                  { op: 'set', path: ['voices'], value: value.voices },
                ],
                revision,
              ),
            account: async () => {
              const r = await inner.remote.intranetAi.account()
              if (!r.ok) throw new Error('connectionFailed')
              return r.value
            },
            list: async () => {
              const r = await inner.remote.intranetAi.list()
              if (!r.ok) throw new Error('connectionFailed')
              return r.value
            },
            run: async (method, first, second) => {
              const result =
                method === 'login'
                  ? await inner.remote.intranetAi.login(first ?? '', second ?? '')
                  : method === 'logout'
                    ? await inner.remote.intranetAi.logout()
                    : method === 'check'
                      ? await inner.remote.intranetAi.check(first ?? '')
                      : method === 'resume'
                        ? await inner.remote.intranetAi.resume(first ?? '')
                        : await inner.remote.intranetAi.cancel(first ?? '')
              return result.ok ? result.value : { ok: false, code: 'localFailure' }
            },
            submit: async (input) => {
              const r = await inner.remote.intranetAi.submit(input)
              return r.ok ? r.value : { ok: false, code: 'localFailure' }
            },
            artifact: async (id, name) => {
              const r = await inner.remote.intranetAi.artifact(id, name)
              if (!r.ok) throw new Error('localFailure')
              return r.value
            },
          }),
        },
        AiPage,
      ),
    )
  })
}
