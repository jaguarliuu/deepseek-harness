# SSH

[English](ssh.md) | 中文

[SSH 提供方家族](../../packages/ssh/README.zh.md) 通过部署方持有的 OpenSSH 连接提供一个远端文件系统／进程环境。Harness、模型传输及 Session 存储留在主机。该家族实现既有文件系统、子进程及沙箱 API，不引入 SSH 专用模型工具。

[远程运维工作台](../../packages/client/ui-remote-ops/README.zh.md) 支持 Windows 或 POSIX 客户端连接普通 SSH 服务器，无需远端 helper。它管理本地连接凭据和交互式控制台，AI 命令使用现有模型工具与 Session 审批服务，不替换文件系统／进程执行环境。

可选的[运维大屏](../../packages/client/ui-ops-monitor/README.zh.md)通过经审查的 Linux 模板采集远程运维中已保存的服务器，独立于会话保留有限的带时间戳历史，并向小 C 提供接入、暂停和查询工具。接入需要明确的界面操作或会话审批，固定目标变更后需要重新接入。

## 执行坐标

文件系统身份、可执行文件查找、进程 cwd、沙箱工作区根目录及语言服务器文件 URL 都指向 SSH 主机。提供方在文件实际存在的位置规范化路径，保留文件系统对 `symlink/..` 的解释。策略解析器保留执行环境中的绝对路径写法，不尝试在 Harness 主机上解析远端路径。

`processPath()` 提供配套子进程提供方可用的路径。SSH 的 `processPathFromHostPath()` 仍不可用；安装远端产物不意味着任意主机路径可移植。因此 [`NodePtcRuntime`](../../packages/ptc-runtime/ptc-runtime-node/README.zh.md) 使用验证后的远端启动配置：已安装的脚本引导程序，或 [helper 可执行文件内嵌的 worker](../../packages/ssh/ssh-helper-runtime/README.zh.md)。

## 传输与信任

管理 RPC 使用辅助进程的 SSH exec 流。普通 stdin、stdout、stderr、终端输出及可选 fd 7 控制流使用分别认证的转发 Unix 套接字。每条转发流拥有独立 SSH 通道窗口；暂停的程序输出不与控制或管理消息共用窗口。所有通道仍共享连接带宽及传输失败。

部署认证、已安装产物验证及逐流 TLS 认证属于 [`dsh-ssh`](../../packages/ssh/ssh/README.zh.md)。辅助进程使用远端机器上的可信本地提供方执行文件系统与进程请求。SSH 是传输方式；文件效果限制由所选远端沙箱提供方执行。

## 进程生命周期与取消

进程先预留，再连接流，且启动最多接受一次。`done` 报告直接结果，`waitForExit` 观察远端托管进程范围。终端操作保留共享异步 API。准备阶段取消、已启动进程终止及提供方释放都通过辅助进程释放各自资源。

管理截止时限约束单次 RPC 观察，不替代 Bash 或 PTC 运行时消费方选择的执行截止时限。远端等待可以持续挂起，同时其他请求继续推进。SSH 丢失会使待处理操作失效；辅助进程 EOF、信号及租期到期会启动远端清理。客户端如实报告未确认结果，绝不通过重连重放可能已执行的操作。

## 组合范围

headless 通过已挂载的文件系统提供方记录和检查 Session cwd。因此远端 FS、Bash、终端、LSP 及 PTC 消费方可以共享这些坐标。假定可访问主机文件系统的 Web 工作区视图需要单独集成；仅替换提供方并不会使这些视图支持远端。

替代方案与验证责任见[决策记录](../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.zh.md)。

## 连接 API

```ts type-equiv
/** Installed helper invocation; script deployments may also install a PTC bootstrap. */
type HelperLaunch = {
  /** Run the installed script with a separately installed Node executable. */
  kind: 'node-script'
  /** Absolute remote Node executable. */
  node: string
  /** Absolute remote PTC bootstrap; requires bootstrapHash. */
  bootstrapPath?: string
  /** Lowercase SHA-256 of bootstrapPath; requires that path. */
  bootstrapHash?: string
} | {
  /** Run the helper executable with its embedded Node and PTC worker. */
  kind: 'executable'
}
```

```ts type-equiv
/** Deployment-owned SSH identity and installed helper; no model argument selects these values. */
interface Config {
  /** OpenSSH host alias, including its existing user, key and known-host configuration. */
  host: string
  /** Explicit script or self-contained executable invocation. */
  launch: HelperLaunch
  /** Absolute path to the installed, bundled helper entry. */
  helper: string
  /** SHA-256 of that bundled helper; mismatches refuse the connection. */
  helperHash: string
  /** Absolute remote default workspace. */
  workspace: string
  /** Connection and administrative-request deadline, at most 2,147,483,647 milliseconds. */
  requestTimeoutMs?: number
  /** Maximum JSON payload bytes per helper request or response. */
  maxFrameBytes?: number
  /** Maximum ordinary requests; heartbeat and bounded resource cleanup have reserved capacity. */
  maxPending?: number
  /** Remote helper lease; loss of heartbeats starts remote managed cleanup. */
  leaseMs?: number
}
```

```ts public-api
/** One non-reconnecting SSH session; loss invalidates all active operations. */
declare class SshConnection extends Service {
  static Config: schema<Config>;
  /** Verified remote helper coordinates; callers must await this before launch. */
  readonly ready: Promise<Hello>;
  constructor(ctx: Context, config: Config);
  /** Hold plugin readiness until the remote identity and helper digest are verified. */
  async [Service.init](): Promise<void>;
  /** Verified remote PTC launch configuration; script deployments require a verified bootstrap. */
  get ptcLaunch(): { kind: 'embedded'; executable: string } | { kind: 'node-script'; executable: string; bootstrapPath: string };
  /**
     * Send a helper operation; cancellation never replays an ambiguous mutation.
     * @param method - the private helper operation.
     * @param params - JSON request fields validated by the helper.
     * @param result - response validation before returning provider-visible data.
     * @param signal - cancellation, which does not undo completed remote effects.
     * @param wait - allow a process observation to outlast the administrative deadline.
     * @returns the validated remote result.
     */
  async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait: boolean = false): Promise<T>;
  /**
     * Forward one authenticated stream through an independent SSH channel.
     * @param endpoint - private coordinates issued by this connection's helper.
     * @param signal - cancellation of allocation and the resulting socket.
     * @returns a paused socket; attach a consumer before resuming it.
     */
  async connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket>;
  /** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
  dispose(): Promise<void>;
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxopsmonitor--opsmonitor"></a>

### `ctx.opsMonitor` — `OpsMonitor`

Own enrollment durability, bounded history and background task cancellation.

```ts cordis-catalog
/**
 * Enable fixed collectors on a saved, fingerprint-pinned server. A direct UI call is the user's enrollment action.
 * @param serverId - existing saved SSH connection.
 * @param selected - reviewed templates authorized for repeated collection.
 * @param expectedTarget - connection identity reviewed by the caller before authorization.
 * @returns enrollment after durable commit; no collection runs before that commit.
 */
@Remote async enable(serverId: ServerId, selected: TemplateId[], expectedTarget: string): Promise<Monitor>

/**
 * Stop future collection and retain history. An in-flight read may finish but cannot append after disable commits.
 * @param serverId - enrolled server.
 */
@Remote async disable(serverId: ServerId): Promise<void>

/**
 * Read saved metadata and bounded metrics, never SSH secrets or raw command output.
 * @returns current dashboard with timestamps and explicit failed attempts.
 */
@Remote async snapshot(): Promise<Dashboard>

/**
 * Stream dashboard snapshots while a browser holds the resource.
 * @param signal - subscriber lifetime.
 * @returns current state and subsequent refreshes; collection has its own lifetime.
 */
@Remote({ mode: 'stream' }) async *follow(signal: AbortSignal): AsyncIterable<Dashboard>
```

Source: [`packages/client/ui-ops-monitor/src/index.ts`](../../packages/client/ui-ops-monitor/src/index.ts)

<a id="ctxremoteops--remoteops"></a>

### `ctx.remoteOps` — `RemoteOps`

Own local server inventory, SSH transports and approved model tools.

```ts cordis-catalog
/**
 * List local servers without credential fields.
 * @returns saved connection metadata without secrets.
 */
@Remote async list(): Promise<ServerView[]>

/**
 * Probe an untrusted host without credentials.
 * @param host - server address.
 * @param port - SSH port.
 * @returns untrusted fingerprint or redacted error.
 */
@Remote async probe(host: string, port: number): Promise<OpsResult>

/**
 * Save local credentials with an explicitly confirmed server fingerprint.
 * @param input - user connection form.
 * @returns redacted save outcome.
 */
@Remote async save(input: ServerInput): Promise<OpsResult>

/**
 * Remove an unused connection; open terminals must be disconnected first.
 * @param id - saved server id.
 * @returns redacted removal outcome.
 */
@Remote async deleteServer(id: ServerId): Promise<OpsResult>

/**
 * Verify saved credentials against the pinned host.
 * @param id - saved server id.
 * @returns authentication outcome.
 */
@Remote async test(id: ServerId): Promise<OpsResult>

/**
 * Start an interactive terminal, isolated from AI command channels.
 * @param id - saved server id.
 * @returns terminal identity.
 */
@Remote async connect(id: ServerId): Promise<TerminalId>

/**
 * Read bounded output after a cursor.
 * @param id - terminal identity.
 * @param cursor - consumed character cursor.
 * @returns terminal status and incremental output.
 */
@Remote read(id: TerminalId, cursor: number): Promise<TerminalView>

/**
 * Send manual keyboard input or resize the PTY.
 * @param id - terminal identity.
 * @param data - user keystrokes, empty for resize only.
 * @param cols - columns.
 * @param rows - rows.
 */
@Remote write(id: TerminalId, data: string, cols: number, rows: number): Promise<void>

/**
 * Close an interactive terminal without replaying any commands.
 * @param id - terminal identity.
 */
@Remote async disconnect(id: TerminalId): Promise<void>
```

Source: [`packages/client/ui-remote-ops/src/index.ts`](../../packages/client/ui-remote-ops/src/index.ts)

<a id="ctxssh--sshconnection"></a>

### `ctx.ssh` — `SshConnection`

One non-reconnecting SSH session; loss invalidates all active operations.

```ts cordis-catalog
/**
 * Send a helper operation; cancellation never replays an ambiguous mutation.
 * @param method - the private helper operation.
 * @param params - JSON request fields validated by the helper.
 * @param result - response validation before returning provider-visible data.
 * @param signal - cancellation, which does not undo completed remote effects.
 * @param wait - allow a process observation to outlast the administrative deadline.
 * @returns the validated remote result.
 */
async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait: boolean = false): Promise<T>

/**
 * Forward one authenticated stream through an independent SSH channel.
 * @param endpoint - private coordinates issued by this connection's helper.
 * @param signal - cancellation of allocation and the resulting socket.
 * @returns a paused socket; attach a consumer before resuming it.
 */
async connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket>

/** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
dispose(): Promise<void>
```

Source: [`packages/ssh/ssh/src/index.ts`](../../packages/ssh/ssh/src/index.ts)
<!-- END GENERATED cordis-surface -->
