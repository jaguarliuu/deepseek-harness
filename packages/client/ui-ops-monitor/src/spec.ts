/** Versioned monitoring enrollments and bounded sampled history. */
import type { ServerId } from '@deepseek-ai/dsh-client-ui-remote-ops/types'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Monitor } from './types.ts'
/** Input validation shared by RPC and model tools. */
export const enrollment = z.object({
  serverId: z.uuid().transform(value => value as ServerId),
  templates: z.array(z.enum(['linux-health', 'linux-filesystems', 'linux-capacity', 'linux-network', 'linux-processes'])).min(1).max(5)
    .refine(values => new Set(values).size === values.length),
}).strict()
const monitor: z.ZodType<Monitor> = z.object({
  serverId: enrollment.shape.serverId,
  name: z.string(),
  target: z.string(),
  templates: enrollment.shape.templates,
  enabled: z.boolean(),
  samples: z.array(z.object({
    at: z.number().nonnegative(),
    status: z.enum(['ok', 'partial', 'connection', 'command', 'parse', 'targetChanged']),
    failures: z.array(z.object({ templateId: enrollment.shape.templates.element, status: z.enum(['connection', 'command', 'parse']) })).optional(),
    metrics: z.array(z.object({
      name: z.string(), value: z.union([z.number().nonnegative(), z.string().max(256)]), unit: z.string(), label: z.string() })),
  })),
})
/** Storage validates all saved records before collection can resume. */
export const monitorDomain = defineDomain({
  name: 'ops_monitor', version: 1, layout: 'per-record',
  tables: { monitors: domainTable<ServerId, Monitor>(monitor) },
})
