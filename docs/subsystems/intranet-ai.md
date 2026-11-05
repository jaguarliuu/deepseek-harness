# Internal AI capabilities

English | [中文](intranet-ai.zh.md)

The desktop capability plugin connects to the internal information-operations AI platform. It owns account authorization, image generation, speech synthesis and OCR tasks. Configuration, limits and user workflows are documented in the [package README](../../packages/client/ui-intranet-ai/README.md).

Platform grants are stored through [credentials](credentials.md), task tools use [background jobs](jobs.md), and source files are read through the [filesystem](filesystem.md). The plugin never changes the agent loop. Remote methods expose safe account and task projections; tokens remain on the Host.

Local task indexes retain platform/account ownership and remote ids independently of Session logs. Submissions with uncertain outcomes remain unknown; queries and downloads can resume without another submission. Local interruption does not establish remote cancellation. Platform history remains authoritative for execution state.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxintranetai--intranetai"></a>

### `ctx.intranetAi` — `IntranetAi`

Own the authenticated internal-AI platform connection and model tools.

```ts cordis-catalog
/**
 * Return the currently authorized account without exposing tokens.
 * @returns account state.
 */
@Remote async account(): Promise<AccountStatus>

/**
 * Sign in to the configured platform; the password is not persisted.
 * @param account - platform login id.
 * @param password - password.
 * @returns redacted result.
 */
@Remote async login(account: string, password: string): Promise<AiResult>

/**
 * Remove local authorization and request server revocation.
 * @returns revocation result; local credentials are cleared even on network failure.
 */
@Remote async logout(): Promise<AiResult>

/**
 * Submit a capability task and start local monitoring.
 * @param input - capability input; OCR bytes are transient.
 * @returns redacted submission status.
 */
@Remote async submit(input: AiInput): Promise<AiResult>

/**
 * List task projections for the authorized endpoint and account.
 * @returns current local tasks.
 */
@Remote async list(): Promise<AiTask[]>

/**
 * Resume polling and artifact download without a second submission.
 * @param id - local task id.
 * @returns whether monitoring started.
 */
@Remote async resume(id: string): Promise<AiResult>

/**
 * Request server-confirmed task cancellation.
 * @param id - local task id.
 * @returns redacted cancellation result.
 */
@Remote async cancel(id: string): Promise<AiResult>

/**
 * Read one account-owned local artifact.
 * @param id - local task id.
 * @param name - artifact filename.
 * @returns content for browser playback and download.
 */
@Remote async artifact(id: string, name: string): Promise<AiArtifact>
```

Source: [`packages/client/ui-intranet-ai/src/index.ts`](../../packages/client/ui-intranet-ai/src/index.ts)
<!-- END GENERATED cordis-surface -->
