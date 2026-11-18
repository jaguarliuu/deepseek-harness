# 内网邮件

[English](README.md) | 中文

邮件插件由 Desktop Host 检查一个 POP3 邮箱。收到新邮件时，小 C 招手并显示邮件数量。首次成功检查建立基线，后续发现的邮件才会提醒。待提醒记录在 Host 重启后继续保留，等桌宠可用时展示。插件保留服务器上的邮件。

## 连接邮箱

在 Desktop 打开 **设置 → 邮箱**，填写收件账号、密码或邮箱授权码，以及公司提供的 POP3 地址。端口默认 995。「测试连接」只检查当前表单，「保存邮箱」会验证配置并立即开始检查新邮件。「在聊天中发邮件」打开 SMTP 设置，企业 CA 可在对应的「企业证书」输入。「允许 AI 搜索和阅读邮件」默认关闭。

设置保存到 DSH 凭证存储。密码输入框留空会保留同一服务器和账号的现有凭证。编辑服务器地址、端口、登录名、加密方式或 CA 后，重新输入对应密码。

## 部署配置

插件包可在 Desktop 安装，源码可用 `npm ci --ignore-scripts --prefix local-plugins/mail` 安装依赖，再用 `npm pack --ignore-scripts ./local-plugins/mail` 打包。已有 profile YAML 可以继续使用，并在第一次打开邮箱设置时显示。通过设置页保存后，桌面端使用已保存的邮箱账户。

```yaml
- id: intranet-mail
  name: '@intranet/dsh-mail'
  disabled: false
  config:
    stateDirectory: /absolute/path/to/private/mail-data
    locale: zh
    pollIntervalMs: 60000
    allowModelRead: false
    pop3:
      host: pop.example.internal
      port: 995
      username: employee@example.internal
      credential: INTRANET_MAIL_POP3_PASSWORD
    smtp:
      host: smtp.example.internal
      port: 587
      security: starttls
      username: employee@example.internal
      credential: INTRANET_MAIL_SMTP_PASSWORD
      from: employee@example.internal
```

如需英文提醒和命令反馈，设置 `locale: en`。将凭证值存入 DSH 凭证服务或 Host 环境。POP3 使用隐式 TLS 并要求服务器支持 `UIDL`。SMTP 支持带认证的 `tls` 和 `starttls`。使用企业 CA 时，把相应端点的 `ca` 设为 PEM 证书。仅收件时可省略 `smtp`。`timeoutMs`、`headersPerPoll`、`maxListingBytes` 和 `maxMessageBytes` 限制连接时间、每轮索引工作量和下载大小。

在聊天中运行 `/mail-test`，验证 POP3 登录、UIDL 和已配置的 SMTP 认证。运行 `/mail-status` 查看监控状态和待提醒数。Desktop 需要保持运行并能访问邮箱服务。重连后会补查 POP3 服务仍保留的邮件。

## 聊天中处理邮件

确认配置的模型和会话保留策略允许处理内网邮件后，可开启 `allowModelRead: true`。Host 会分批索引主题、发件人和日期。`mail_search` 返回索引范围，`mail_read` 按需取回有限的纯文本供总结或起草。服务器移除邮件后，本地索引仍可能查到邮件头，正文此时无法获取。本地索引包含邮件头和 UIDL，模型收到的邮件内容作为工具结果进入会话日志。

配置 SMTP 后，可以请助手起草纯文本邮件并发给一位收件人。提交前会展示发件人、收件人、主题和正文，由用户确认。SMTP 接受表示发件服务器已接收该邮件等待投递。提交结果未知时，请先向收件人或邮箱管理员核对。

## 本地验证

使用 Node 24 和 OpenSSL 运行 `node --test local-plugins/mail/mail.test.mjs`，验证本地 TLS POP3 和 SMTP 测试服务。
