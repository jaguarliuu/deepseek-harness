/** JSON-safe views shared by the SSH workspace and its Host. */
import type { Branded } from '@deepseek-ai/dsh-brand'
/** Opaque local server identity. */
export type ServerId = Branded<'RemoteOpsServerId'>
/** Opaque interactive terminal identity. */
export type TerminalId = Branded<'RemoteOpsTerminalId'>
/** Saved connection metadata; never contains credentials. */
export interface ServerView {
  id: ServerId
  name: string
  group: string
  host: string
  port: number
  username: string
  auth: 'password' | 'key' | 'agent'
  fingerprint: string
}
/** User-supplied credentials travel only to the local Host, never to model tools. */
export interface ServerInput {
  id?: ServerId
  name: string
  group: string
  host: string
  port: number
  username: string
  auth: 'password' | 'key' | 'agent'
  secret: string
  passphrase: string
  fingerprint: string
}
/** Redacted operation result; a probe may return the untrusted server fingerprint. */
export interface OpsResult {
  ok: boolean
  code: string
  fingerprint?: string
}
/** Bounded terminal output with an absolute character cursor. */
export interface TerminalView {
  id: TerminalId
  serverId: ServerId
  data: string
  cursor: number
  truncated: boolean
  state: 'connected' | 'closed' | 'failed'
}
/** Independent command channel result. Interruption does not confirm remote rollback. */
export interface CommandResult {
  output: string
  exitCode: number | null
  interrupted: boolean
  truncated: boolean
}
