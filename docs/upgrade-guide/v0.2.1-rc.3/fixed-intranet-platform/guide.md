---
kind: upgrade-guide
description: "Internal AI platform addresses are deployment-owned and the health-check Remote is removed."
---

# Fixed internal AI platform

English | [中文](guide.zh.md)

## Change

The internal AI platform address is no longer an employee-editable setting. The shipped Web and Desktop bundle selects `https://25.75.3.1`; account authorization no longer requires saving a connection or testing `/healthz`. The `intranetAi.check` Remote and `PlatformClient.health` method are removed. Existing task records and account grants retain their format and endpoint ownership.

## Migration

1. Employees open Settings → Internal AI capabilities and authorize their platform account. Previously saved address overrides no longer select the platform; grants for another origin are not reused.
2. Custom deployments set `ui-intranet-ai.config.platformOrigin` in their Cordis patch. The field is a required deployment string, not a volatile employee setting. Legacy `baseUrl` profile values are accepted but ignored. Capability model and voice settings remain editable.
3. Remove clients of `intranetAi.check` and `PlatformClient.health`; use actual account authorization for access confirmation. A certificate notice requires administrator certificate configuration, not disabling TLS validation.
4. Confirm the page has no platform-address input or network-test button and that account authorization reaches the configured platform.
