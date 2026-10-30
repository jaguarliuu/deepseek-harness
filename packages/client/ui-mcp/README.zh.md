---
description: "在桌面设置中管理和测试 MCP 连接。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-mcp

[English](README.md) | 中文

## 概述

MCP 服务设置统一管理具名的 Streamable HTTP 和本地 stdio 连接。已有 Skills 通过标准 MCP 客户端调用注册的工具。本包随 Desktop 共享的 Web bundle 加载。

## 目录

- [配置](#configuration)
- [测试连接](#connection-testing)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="configuration"></a>
## 配置

`ui-mcp` 配置项在 profile 中保存 `servers` 数组。每个服务包含唯一的 `name`、`enabled`、`transport`、`url`、`headers`、`command`、`args`、`env`、`cwd` 和 `timeoutMs`。名称使用 1–32 个 ASCII 字母、数字、下划线或短横线；超时时间为 1–300 秒。远程地址必须是 HTTP(S)，不含嵌入式账号密码或片段。请求头可留空。stdio 参数为 JSON 字符串数组，请求头和环境变量为值是字符串的 JSON 对象。

添加和编辑弹窗在保存前保留草稿。带版本校验的写入拒绝过期编辑。启用、停用和移除使用同一配置所有者持久化。动态配置更新会协调连接，无须重启应用；修改或停用服务时，先关闭旧连接再替换。启用的子插件使用标准 MCP 客户端的重连、作用域工具和资源处理。移除连接不会修改外部服务的数据。

请求头和环境变量中的凭据保存在本机 profile 配置中，并非加密凭据库。不要分发包含密钥的配置。连接卡片隐藏地址查询参数。测试失败只返回稳定错误码，不返回外部诊断或凭据。

<a id="connection-testing"></a>
## 测试连接

`mcpManager.test` 校验尚未保存的定义，建立临时 MCP 连接并读取工具名称，不调用工具或修改配置。测试 stdio 会启动指定程序，其依赖须已安装。每次测试关闭客户端与传输，插件卸载会取消未完成的测试。测试不证明每个工具操作都已获得权限，也不证明服务之后一直保持连接。

<a id="dev-note"></a>
## 开发备注

配置所有者串行替换连接。关闭连接失败后停止后续协调并提示重启；连接失败由 MCP 客户端的重连管理负责。

<a id="model-experience"></a>
## 模型体验

### 已启用的服务能力

#### 模型可见内容

`enabled: true` 的服务通过 [MCP 客户端](../../mcp/mcp-client/README.zh.md#model-experience)提供工具和资源，管理器不单独增加提示词。

#### Token 影响

管理器自身不增加 Token，启用的服务决定客户端提供的工具和资源上下文。

#### KV 缓存影响

本包自身不增加提示词。启停服务会改变 MCP 客户端提供的工具目录。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 编辑器不支持 OAuth 登录和旧式 HTTP+SSE 地址，请使用 Streamable HTTP 或 stdio。
- 已启用表示已配置启动，不表示实时连接健康；测试连接反映临时握手与发现的工具名称。
- 管理器不下载本地程序及其依赖，请通过离线安装或已配置的内网源准备。
