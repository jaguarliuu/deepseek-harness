/** Installed screenshot-plugin defaults and disposable authenticated-bridge registration. */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

interface ScreenshotRoute {
  path: string
  methods: string[]
  requestBody: string
}

interface ScreenshotPlugin {
  respond(request: Request): Promise<Response>
  apply(ctx: {
    effect(setup: () => () => void): void
    connection: { fetch: { register(route: ScreenshotRoute): () => void } }
  }): void
}

it('targets Zhiwei Xiao C and registers the screenshot route through the shared bridge', async () => {
  const require = createRequire(new URL('../package.json', import.meta.url))
  const plugin = await import(pathToFileURL(require.resolve('dsh-quick-screenshot')).href) as ScreenshotPlugin
  const response: Response = await plugin.respond(new Request('http://localhost/api/quick-screenshot'))
  const capabilities = await response.json() as { defaultTitlePattern: string; modes: string[] }
  expect(capabilities.defaultTitlePattern).toBe('智维小 C')
  expect(capabilities.modes).toEqual(['window', 'active', 'screen'])
  const refused: Response = await plugin.respond(new Request('http://localhost/api/quick-screenshot', { method: 'DELETE' }))
  expect(refused.status).toBe(405)
  expect(await refused.json()).toMatchSnapshot()
  const disposers: Array<() => void> = []
  let route: ScreenshotRoute | undefined
  plugin.apply({
    effect(setup: () => () => void) { disposers.push(setup()) },
    connection: { fetch: { register(value: ScreenshotRoute) { route = value; return () => { route = undefined } } } },
  })
  expect(route).toMatchObject({ path: '/api/quick-screenshot', methods: ['GET', 'POST'], requestBody: 'buffered' })
  for (const dispose of disposers.reverse()) dispose()
  expect(route).toBeUndefined()
})
