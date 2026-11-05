---
kind: upgrade-guide
description: "内网 AI 平台地址改由部署配置管理，并移除健康检查 Remote。"
---

# 固定内网 AI 平台

[English](guide.md) | 中文

## 变更

内网 AI 平台地址不再是员工可编辑的设置，随应用交付的 Web 与 Desktop bundle 使用 `https://25.75.3.1`。账号授权无需先保存连接或检测 `/healthz`，移除 `intranetAi.check` Remote 和 `PlatformClient.health` 方法。已有任务记录和账号授权保持原有格式及平台归属。

## 迁移

1. 员工打开设置 → 内网 AI 能力，直接授权平台账号。此前保存的地址覆盖值不再决定平台地址，其他来源的授权不会被复用。
2. 自定义部署在 Cordis 补丁中设置 `ui-intranet-ai.config.platformOrigin`。该字段为必需的部署字符串，不再是员工可编辑的 volatile 设置。历史 `baseUrl` 值可正常加载但不参与平台地址选择，图片模型和音色参数仍可调整。
3. 删除 `intranetAi.check` 与 `PlatformClient.health` 的调用方，使用实际账号授权确认访问权限。证书错误需要管理员配置可信证书，不应关闭 TLS 校验。
4. 确认页面没有平台地址输入和测试网络按钮，账号授权请求到达部署配置的平台。
