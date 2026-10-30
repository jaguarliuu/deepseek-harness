/** Client-safe MCP configuration and probe results. */
/** Settings owner configuration. */
export interface McpSettings {
  /** Persisted service definitions for this profile. */
  servers: McpServer[]
}
/** Probe outcome contains no credentials or server-supplied error messages. */
export type ProbeResult = { ok: true; tools: string[] } | { ok: false; code: 'invalid' | 'connection' | 'timeout' | 'cleanup' }

/** One named MCP service; credentials stay in this local profile configuration. */
export interface McpServer {
  /** Unique MCP tool namespace, using 1–32 ASCII letters, digits, underscores or hyphens. */
  name: string
  /** Whether the manager starts this service. */
  enabled: boolean
  /** Streamable HTTP endpoint or local stdio program. */
  transport: 'streamable-http' | 'stdio'
  /** HTTP(S) MCP endpoint; unused for stdio. */
  url: string
  /** Explicit HTTP authentication and custom headers. */
  headers: Record<string, string>
  /** Local executable path or executable available on PATH. */
  command: string
  /** Arguments passed directly without shell interpolation. */
  args: string[]
  /** Explicit process environment merged with scrubbed inherited variables. */
  env: Record<string, string>
  /** Local working directory; empty inherits the Host directory. */
  cwd: string
  /** Handshake and tool request timeout in milliseconds, between 1000 and 300000. */
  timeoutMs: number
}
