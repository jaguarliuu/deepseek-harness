import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, onTestFinished, vi } from 'vitest'
import { installDesktopTaskResults } from '../src/task-results.ts'

async function setup() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  const publish = vi.fn()
  installDesktopTaskResults(ctx, publish)
  const session = ctx.sessions.create(SessionId('task-result-test'))
  return { ctx, session, publish }
}
it('publishes one live completion and does not repeat a duplicate end', async () => {
  const { session, publish } = await setup()
  session.append('turn/start', { turn: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  expect(publish.mock.calls).toMatchSnapshot()
})
it('keeps errors separate and ignores cancellation, interrupted history, and child tasks', async () => {
  const { ctx, session, publish } = await setup()
  session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
  session.append('turn/start', { turn: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
  session.append('turn/start', { turn: 2 })
  session.append('turn/end', { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } })
  const child = ctx.sessions.create(SessionId('child'), { meta: { origin: 'subagent' } })
  child.append('turn/start', { turn: 1 })
  child.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  expect(publish).not.toHaveBeenCalled()
  session.append('turn/start', { turn: 3 })
  session.append('turn/end', { turn: 3, reason: { kind: 'error', error: { code: 'UNKNOWN', message: 'private failure' } } })
  expect(publish.mock.calls).toMatchSnapshot()
})
