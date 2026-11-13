/** Host-persisted preferences for the Qin Xiaozhi skin console. */
import z from '@deepseek-ai/schemastery'

export const name = 'qinxiaozhi-skin'
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  appearance: z.union(['dark', 'light']).default('dark').volatile(),
  sessionsFirst: z.boolean().default(true).volatile(),
  welcome: z.boolean().default(true).volatile(),
})

/** The browser console owns editing; the Host owns validation and persistence. */
export function apply(ctx) {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
