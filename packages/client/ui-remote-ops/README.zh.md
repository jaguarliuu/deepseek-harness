---
description: "本地 SSH 服务器管理、交互式终端与审批后的 AI 命令。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-remote-ops

[English](README.md) | 中文

## 概述

在智维小 C 中管理 SSH 服务器并使用交互式终端，让当前会话模型巡检已保存的服务器或分析选中的输出。插件不需要单独配置模型，也不在远端安装 helper。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

在侧栏打开远程运维，新增服务器，读取主机指纹并通过可信渠道向管理员核对，确认后再保存。认证支持密码、选择私钥文件及可选私钥口令、系统 SSH Agent。私钥文件须非空且不超过 64 KiB，界面只显示文件名，保存时校验私钥和口令并拒绝公钥文件。测试已保存的连接后打开终端。导航到会话时标签页保留连接，使用完毕请主动断开。

连接信息与凭据由现有本地凭据服务保存在 `ui-remote-ops/servers` 中。默认服务使用限制访问权限的本地 YAML 文件，并非操作系统加密钥匙串。凭据不进入模型参数或服务器列表响应。Web 模式由 Host 所在机器保存，桌面模式保存在员工电脑。修改连接目标时必须重新提供凭据，其他情况下留空保留原值。

手动终端直接执行用户输入。AI 命令在建立独立 SSH 连接前请求现有会话审批服务，禁止审批提示的会话会拒绝执行。插件不会自动重试远程命令，中断前可能已产生远端效果，重试写操作前请核查服务器。选中的终端内容作为普通用户消息草稿，仅在用户发送后交给配置的模型。

通过 `ui-remote-ops` 配置项设置 `connectTimeoutMs`、`commandTimeoutMs`、`outputCharacters` 和 `maxTerminals`，默认分别为 15 秒、120 秒、131072 字符和八个交互式终端。安装包包含 SSH JavaScript 运行库，员工无需下载 SSH 可执行文件。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

Host 管理经过校验的凭据记录和固定服务器指纹的 SSH 连接。交互式终端使用 PTY，模型命令使用独立连接并复用现有工具与审批服务。有限输出缓冲通过游标向浏览器终端提供增量数据，插件关闭时销毁并等待所有连接结束。插件不提供遥测、私钥导出、模型 API 客户端或远端 helper，也不修改应用循环。

平台 SSH 服务保持独立：它通过 POSIX 远端 helper 迁移 Harness 执行环境，而本工作台连接 Windows 或 POSIX 客户端与普通 SSH 服务器。

</details>

<a id="model-experience"></a>
## 开发备注

<details>
<summary>维护背景</summary>

无。

</details>

## 模型体验

### SSH 工具

#### 模型看到的内容

`ssh_servers` 返回已保存的服务器信息。`ssh_execute` 只接收 `server_id` 和 `command`，通过现有服务记录审批，分别返回有限输出、退出码、中断和截断状态。工具调用及结果使用现有会话记录，不自动注入终端输出。

#### Token 影响

两个工具声明增加提示词。服务器列表、已批准命令的输出和用户发送的终端选区增加普通会话 Token，输出受配置的字符数量限制。

#### KV Cache 影响

系统提示词不包含逐步变化的服务器清单，已保存的连接通过查询工具获取。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 不提供 SFTP、跳板机、自动重连、集中监控或部署调度。服务器必须开放 SSH 并支持所选远程 shell，员工客户端可运行于 Windows。系统 SSH Agent 需要预先配置。远端程序可能输出敏感内容，请仅选中适合交给当前模型的内容。终端输出仅保留于 Host 内存，Host 重启后丢失。

<a id="dev-note"></a>
