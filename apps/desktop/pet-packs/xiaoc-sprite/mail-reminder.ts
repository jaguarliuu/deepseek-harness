/** Routes count-only mail reminders to the Small C desktop pet. */
import type { HostContext } from '../../../../vendor/dsh-pet/src/host/plugin/context.ts'
import type { PollStateStore } from '../../../../vendor/dsh-pet/src/host/state.ts'

const copy = {
  zh: (count: number) => `收到 ${count} 封新邮件`,
  en: (count: number) => `${count} new ${count === 1 ? 'email' : 'emails'}`,
}

interface ReminderTarget {
  ready(): boolean
  state: Pick<PollStateStore, 'writePet'>
}

/**
 * Register the synchronous receiver. An accepted reminder has been queued for the connected surface.
 * @param ctx - Pet plugin context owning the listener.
 * @param target - Surface readiness and state writer.
 */
export function registerMailReminder(ctx: HostContext, { ready, state }: ReminderTarget): void {
  ctx.on('intranet-mail/pet-reminder', (count: number, locale: keyof typeof copy) => {
    if (!ready()) return
    state.writePet('xiaoc', 'say', { text: copy[locale](count), anim: false })
    state.writePet('xiaoc', 'anim', { name: '招手' })
    return true
  })
}
