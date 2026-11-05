# 内网 AI 能力

[English](intranet-ai.md) | 中文

桌面能力插件连接内网信息运维 AI 平台，负责账号授权、生图、语音合成和 OCR 任务。配置、限制及用户操作见[包说明](../../packages/client/ui-intranet-ai/README.zh.md)。

平台授权通过[凭据服务](credentials.zh.md)保存，模型工具使用[后台任务](jobs.zh.md)，源文件通过[文件系统](filesystem.zh.md)读取。插件不修改智能体循环。Remote 方法仅暴露安全的账号和任务投影，令牌保留在 Host。

本地任务索引独立于 Session 日志，保留平台、账号归属和远端任务 ID。提交结果不确定时保持未知状态；查询和下载可恢复，不重复提交。本地中断不等于远端取消，执行状态以平台历史记录为准。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
