/** Model tools submit internal-AI tasks through the existing background-job registry. */
import type {} from '@deepseek-ai/dsh-fs'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type { JobOutcome } from '@deepseek-ai/dsh-jobs'
import { z } from 'zod'
import type IntranetAi from './index.ts'
import type { AiInput, AiTask } from './types.ts'
import { AiFailure } from './platform.ts'
import { failureCode } from './tasks.ts'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    intranetAi: 'intranet-ai'
  }
}
const argsSchema = z.object({
  text: z.string().max(2000).default(''),
  model: z.string().optional(),
  size: z.string().optional(),
  n: z.number().int().min(1).max(3).optional(),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4).optional(),
  instructions: z.string().max(2000).optional(),
  file_path: z.string().optional(),
})
/**
 * Register effect-owned tools; no credentials are accepted as model arguments.
 * @param ctx - Host context.
 * @param service - task owner.
 * @param maxBytes - maximum OCR input bytes.
 */
export function registerTools(ctx: Context, service: IntranetAi, maxBytes: number): void {
  for (const capability of ['image', 'tts', 'ocr'] as const) {
    const name = `intranet_${capability === 'image' ? 'image_generate' : capability}`
    ctx.effect(() =>
      ctx.tools.register(
        {
          name,
          description:
            capability === 'image'
              ? 'Generate images using the configured internal AI platform. Returns a background job; use job_output to collect results. Do not claim completion before the job completes.'
              : capability === 'tts'
                ? 'Synthesize speech using the internal AI platform. Returns a background job; use job_output for the saved audio result.'
                : 'Recognize an image or PDF file using the internal AI platform. file_path must refer to an existing authorized file. Returns a background job; use job_output for Markdown and page truncation warnings.',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Image prompt or speech text, at most 2000 characters.' },
              model: { type: 'string' },
              size: { type: 'string' },
              n: { type: 'integer' },
              voice: { type: 'string' },
              speed: { type: 'number' },
              instructions: { type: 'string' },
              file_path: { type: 'string', description: 'Image/PDF path for OCR.' },
            },
            additionalProperties: false,
          },
          output: {
            schema: {
              type: 'object',
              properties: { job_id: { type: 'string' } },
              required: ['job_id'],
              additionalProperties: false,
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          async execute(raw, exec) {
            if (!exec.agent) throw new AiFailure('agentRequired')
            const args = argsSchema.parse(raw)
            const input: AiInput = { ...args, capability }
            if (capability === 'ocr') {
              if (!args.file_path) throw new AiFailure('invalidInput')
              const cwd = exec.agent.session.header.cwd
              if (!cwd) throw new AiFailure('invalidInput')
              const target = await ctx.fs.resolve(args.file_path, { cwd, signal: exec.signal })
              const bytes = await ctx.fs.readBytes(target, exec.signal, maxBytes)
              input.filename = args.file_path.split(/[\\/]/u).pop() ?? 'document.pdf'
              input.fileBase64 = Buffer.from(bytes).toString('base64')
            }
            exec.signal.throwIfAborted()
            let task: AiTask | undefined
            let cancelRequested = false
            let cancellation: Promise<void> | undefined
            const controller = new AbortController()
            const id = ctx.jobs.start({
              kind: 'intranet-ai',
              label: name,
              owner: exec.agent.id,
              toolCall: { callId: exec.callId, rootCallId: exec.rootCallId },
              run() {
                const done = (async (): Promise<JobOutcome> => {
                  try {
                    task = await service.tasks.submit(input)
                    if (cancelRequested) await service.tasks.cancel(task.id)
                    let result = await service.tasks.monitor(task.id, controller.signal)
                    if (cancellation) {
                      await cancellation
                      result = (await service.tasks.list()).find(item => item.id === result.id) ?? result
                    }
                    return {
                      status:
                        result.status === 'canceled'
                          ? 'killed'
                          : result.status === 'succeeded' && result.notice !== 'downloadFailed'
                            ? 'completed'
                            : 'failed',
                      result: service.tasks.modelResult(result),
                    }
                  } catch (error) {
                    return { status: 'failed', detail: failureCode(error) }
                  }
                })()
                return {
                  done,
                  cancel() {
                    cancelRequested = true
                    controller.abort()
                    if (task)
                      cancellation = service.tasks.cancel(task.id).catch((_remoteCancelFailure: unknown) => {
                        /* Local interruption does not confirm remote cancellation. */
                      })
                  },
                }
              },
            })
            return { job_id: id }
          },
          presentCall: args => ({ card: 'generic', title: name, rawInput: args }),
        },
      ),
    )
  }
}
