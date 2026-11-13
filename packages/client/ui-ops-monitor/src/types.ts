/** JSON data shared by monitoring tools, durable storage and the dashboard. */
import type { ServerId } from '@deepseek-ai/dsh-client-ui-remote-ops/types'
/** Closed catalog of reviewed Linux collectors. */
export type TemplateId = 'linux-health' | 'linux-filesystems' | 'linux-capacity' | 'linux-network' | 'linux-processes'
/** One observed metric; labels identify a filesystem or other instance. */
export interface Metric {
  name: string
  value: number | string
  unit: string
  label: string
}
/** A completed attempt, including failed attempts so graphs retain gaps. */
export interface Sample {
  at: number
  status: 'ok' | 'partial' | 'connection' | 'command' | 'parse' | 'targetChanged'
  metrics: Metric[]
  /** Failed groups are absent from metrics; legacy attempts may omit this detail. */
  failures?: { templateId: TemplateId; status: 'connection' | 'command' | 'parse' }[] | undefined
}
/** An enrollment binds collection to the exact pinned SSH identity. */
export interface Monitor {
  serverId: ServerId
  name: string
  target: string
  templates: TemplateId[]
  enabled: boolean
  samples: Sample[]
}
/** Metric names shared with locale dictionaries and panel definitions. */
export type MetricName = 'cpu_percent' | 'memory_percent' | 'load_1m' | 'uptime_seconds' | 'disk_percent'
  | 'memory_total_bytes' | 'memory_used_bytes' | 'memory_available_bytes'
  | 'filesystem_total_bytes' | 'filesystem_used_bytes' | 'filesystem_available_bytes'
  | 'network_receive_bytes' | 'network_transmit_bytes' | 'network_boot_id'
  | 'network_receive_rate' | 'network_transmit_rate'
  | 'cpu_process_percent' | 'cpu_process_name' | 'memory_process_percent' | 'memory_process_name'
/** Field parsing and series identity within a collector group. */
export interface MetricDefinition {
  name: MetricName
  group: string
  type: 'number' | 'string'
  unit: string
  label: 'none' | 'instance'
  maximum?: number
}
/** Default visualization attached to a template rather than a hardcoded dashboard metric. */
export interface PanelDefinition {
  metric: MetricName
  chart: 'trend' | 'ranking'
  unit: string
  maximum?: number
  /** Process name metric associated by PID; command arguments are never collected. */
  nameMetric?: MetricName
  /** Denominator for a used/total capacity bar, in the same units and with the same label. */
  totalMetric?: MetricName
}
/** Metadata for a reviewed collector; scripts are visible before enrollment. */
export interface Template {
  id: TemplateId
  script: string
  metrics: string[]
  fields: MetricDefinition[]
  panels: PanelDefinition[]
  priority: number
}
/** Complete bounded dashboard read, with a Host timestamp for freshness. */
export interface Dashboard {
  now: number
  /** Target time between collection sweeps in milliseconds; sweeps never overlap. */
  intervalMs: number
  failure: 'storage' | null
  monitors: Monitor[]
  servers: { id: ServerId; name: string; host: string; group: string; target: string }[]
  templates: Template[]
}
/** Validated deployment limits for background collection and stored history. */
export interface Config {
  /** Target time between collection sweeps in milliseconds; sweeps never overlap. */
  intervalMs: number
  /** Maximum duration of all templates for one server in milliseconds. */
  timeoutMs: number
  /** Maximum stored server enrollments, including paused servers. */
  maxServers: number
  /** Maximum retained collection attempts per server. */
  historyPoints: number
  /** Time between dashboard stream snapshots in milliseconds. */
  streamIntervalMs: number
}
