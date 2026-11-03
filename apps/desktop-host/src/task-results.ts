/** Live top-level turn results for the desktop companion, without transcript content. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Minimal private IPC result; success describes the turn, not an external business outcome. */
export interface DesktopTaskResult {
  readonly sessionId: SessionId
  readonly turn: number
  readonly outcome: 'completed' | 'error'
}

/**
 * Publish results only for turns started during this Host subscription.
 * @param ctx - Host context owning the live event subscriptions.
 * @param publish - Private shell delivery; excludes prompts, results, and failure details.
 */
export function installDesktopTaskResults(ctx: Context, publish: (result: DesktopTaskResult) => void): void {
  const running = new Map<SessionId, number>()
  ctx.on('session/event', (session, event) => {
    if (session.header.origin === 'subagent') return
    if (event.type === 'turn/start') running.set(session.id, event.data.turn)
    else if (event.type === 'turn/end') {
      if (running.get(session.id) !== event.data.turn) return
      running.delete(session.id)
      const outcome = event.data.reason.kind
      if (outcome === 'completed' || outcome === 'error') publish({ sessionId: session.id, turn: event.data.turn, outcome })
    }
  })
  ctx.on('session/disposed', (session) => { running.delete(session.id) })
  ctx.effect(() => () => { running.clear() })
}
