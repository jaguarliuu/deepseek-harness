/** Client-safe internal AI platform settings and task projections. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque local task identity, unrelated to platform integer ids. */
export type AiTaskId = Branded<'IntranetAiTaskId'>

/** Persisted non-secret connection settings. */
export interface AiSettings {
  /** Platform origin, without credentials or query parameters. */
  baseUrl: string
  /** Administrator-configured image model ids. */
  imageModels: string[]
  /** Administrator-configured speech voice ids. */
  voices: string[]
}
/** Public result contains only normalized, actionable failure categories. */
export interface AiResult {
  /** Whether the requested operation completed. */
  ok: boolean
  /** Error category; upstream bodies and credentials are never exposed. */
  code: string
}
/** Account status contains no tokens. */
export interface AccountStatus {
  /** Whether a renewable grant exists for this endpoint. */
  connected: boolean
  /** Platform login identifier, blank when disconnected. */
  account: string
}
/** Supported asynchronous platform capability. */
export type Capability = 'image' | 'tts' | 'ocr'
/** User input accepted by the capability form and model tools. */
export interface AiInput {
  /** Operation selected by the caller. */
  capability: Capability
  /** Image prompt or speech text; unused for OCR. */
  text: string
  /** Image model id; blank selects the first configured model. */
  model?: string | undefined
  /** Image dimensions in WIDTHxHEIGHT form. */
  size?: string | undefined
  /** Number of images, one through three. */
  n?: number | undefined
  /** Configured voice id; blank selects the first configured voice. */
  voice?: string | undefined
  /** Speech speed, 0.25 through 4. */
  speed?: number | undefined
  /** Speech style instruction. */
  instructions?: string | undefined
  /** Uploaded OCR filename. */
  filename?: string | undefined
  /** Canonical base64 OCR bytes; never returned in task projections. */
  fileBase64?: string | undefined
}
/** Locally retained task and downloaded outputs, scoped to the connected account. */
export interface AiTask {
  /** Local UUID, distinct from the platform integer id. */
  id: AiTaskId
  /** Task capability. */
  capability: Capability
  /** Platform task id used for recovery. */
  remoteId: number
  /** Platform origin at submission. */
  baseUrl: string
  /** Account that submitted the task. */
  account: string
  /** Platform status or interrupted local monitoring state. */
  status: string
  /** Safe result warning or normalized local error category. */
  notice: string
  /** Locally downloaded artifact names, never arbitrary file paths. */
  files: string[]
  /** OCR Markdown body, retained for subsequent model requests. */
  markdown: string
  /** Whether the list projection omitted part of the locally saved Markdown. */
  previewTruncated: boolean
  /** Original OCR page count when supplied. */
  totalPages: number
  /** Processed OCR page count when supplied. */
  pages: number
  /** Whether the server omitted pages. */
  truncated: boolean
}
/** Bounded artifact transfer for local playback and saving. */
export interface AiArtifact {
  /** Safe artifact filename. */
  name: string
  /** MIME type inferred from the saved extension. */
  mime: string
  /** Encoded artifact bytes. */
  base64: string
}
