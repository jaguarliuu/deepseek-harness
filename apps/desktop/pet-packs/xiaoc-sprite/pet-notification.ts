/** Displays plugin-owned notifications on the Small C desktop pet. */
import type { HostContext } from '../../../../vendor/dsh-pet/src/host/plugin/context.ts'
import type { PollStateStore } from '../../../../vendor/dsh-pet/src/host/state.ts'

interface ReminderTarget {
  ready(): boolean
  state: Pick<PollStateStore, 'writePet'>
}

/**
 * Register the synchronous receiver. An accepted reminder has been queued for the connected surface.
 * @param ctx - Pet plugin context owning the listener.
 * @param target - Surface readiness and state writer.
 */
export function registerPetNotification(ctx: HostContext, { ready, state }: ReminderTarget): void {
  ctx.on('xiaoc/notification', (notification: { text: string; animation?: string }) => {
    if (!ready()) return
    state.writePet('xiaoc', 'say', { text: notification.text, anim: false })
    if (notification.animation) state.writePet('xiaoc', 'anim', { name: notification.animation })
    return true
  })
}
