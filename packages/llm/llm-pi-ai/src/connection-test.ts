/** Bounded, one-shot inference for an unsaved private provider draft. */
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmConnectionTestRequest } from '@deepseek-ai/dsh-llm'

/**
 * Validate a draft by requesting a short reply from its selected model.
 * @param request - unsaved endpoint and model configuration.
 * @param signal - caller cancellation and deadline.
 * @param apiKey - resolved one-shot credential; never logged or stored.
 * @returns once a valid inference response has been received.
 */
export async function testConnection(request: LlmConnectionTestRequest, signal: AbortSignal, apiKey?: string): Promise<void> {
  let url: URL
  try { url = new URL(request.baseURL) } catch { throw LlmError.fromFailure({ message: 'Invalid API base URL', code: 'INVALID_TEST' }) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw LlmError.fromFailure({ message: 'Invalid API base URL', code: 'INVALID_TEST' })
  }
  if (!request.model.trim()) throw LlmError.fromFailure({ message: 'Model ID is required', code: 'INVALID_TEST' })
  const headers = new Headers({ 'content-type': 'application/json' })
  const key = request.noAuth === true ? undefined : apiKey?.trim()
  const base = request.baseURL.replace(/\/+$/, '')
  let endpoint: string
  let payload: unknown
  switch (request.api) {
    case 'openai-completions':
      endpoint = `${base}/chat/completions`
      payload = { model: request.model, messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 16, stream: false }
      if (key) headers.set('authorization', `Bearer ${key}`)
      break
    case 'openai-responses':
      endpoint = `${base}/responses`
      payload = { model: request.model, input: 'Reply OK.', max_output_tokens: 16, stream: false }
      if (key) headers.set('authorization', `Bearer ${key}`)
      break
    case 'anthropic-messages':
      endpoint = `${base.endsWith('/v1') ? base.slice(0, -3) : base}/v1/messages`
      payload = { model: request.model, messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 16, stream: false }
      headers.set('anthropic-version', '2023-06-01')
      if (key) headers.set('x-api-key', key)
      break
    default: throw LlmError.fromFailure({ message: 'This protocol does not support connection testing', code: 'INVALID_TEST' })
  }
  try {
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal, redirect: 'error' })
    if (!response.ok) {
      await response.body?.cancel()
      throw LlmError.fromFailure({ message: `HTTP ${response.status}`, code: 'CONNECTION_HTTP' })
    }
    const reader = response.body?.getReader()
    if (!reader) throw LlmError.fromFailure({ message: 'Empty inference response', code: 'CONNECTION_RESPONSE' })
    let text = ''
    let size = 0
    const decoder = new TextDecoder()
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 1024 * 1024) throw LlmError.fromFailure({ message: 'Inference response too large', code: 'CONNECTION_RESPONSE' })
        text += decoder.decode(chunk.value, { stream: true })
      }
    } finally {
      await reader.cancel()
    }
    const body: unknown = JSON.parse(text + decoder.decode())
    const field = request.api === 'openai-completions' ? 'choices' : request.api === 'openai-responses' ? 'output' : 'content'
    const entries: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, field) : undefined
    if (!Array.isArray(entries) || entries.length === 0) {
      throw LlmError.fromFailure({ message: 'Invalid inference response', code: 'CONNECTION_RESPONSE' })
    }
  } catch (error: unknown) {
    if (signal.aborted) throw LlmError.fromFailure({ message: 'Connection test timed out or was cancelled', code: 'CONNECTION_TIMEOUT' })
    if (error instanceof LlmError) throw error
    // Do not echo upstream bodies, URLs, or transport errors that may contain secrets.
    throw LlmError.fromFailure({ message: 'Could not reach the model or read its response', code: 'CONNECTION_FAILED' })
  }
}
