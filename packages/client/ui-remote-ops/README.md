---
description: "Local SSH server management, interactive terminals and approved AI commands."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-remote-ops

English | [中文](README.zh.md)

## Summary

Manage SSH servers and use interactive terminals inside Zhiwei Xiao C. Ask the current conversation model to inspect a saved server or analyze selected output. The plugin needs no separate model configuration and installs no remote helper.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Open Remote operations in the sidebar, add a server, read its host fingerprint and verify that fingerprint with the administrator through a trusted channel. Confirm it before saving. Authentication supports passwords, private key files with optional passphrases, and the system SSH Agent. Private key files must be non-empty and no larger than 64 KiB. Only the filename is displayed; saving validates the private key and passphrase and rejects public keys. Test the saved connection, then open a terminal. Tabs retain their connections when navigating to the conversation; disconnect tabs explicitly when finished.

Connection metadata and secrets are stored by the existing local credentials provider in `ui-remote-ops/servers`. The default provider uses a private, access-controlled local YAML file, not an encrypted OS keychain. Credentials do not enter model arguments or server-list responses. In Web mode, the Host machine owns storage; desktop mode stores it on the employee's computer. Changing a connection target requires fresh credentials; an empty secret otherwise preserves the saved value.

Manual keystrokes execute directly. AI commands always request the existing session approval service before opening an independent SSH connection. A session that disables approval prompts rejects these commands. No remote command is retried automatically. Interrupted commands can have remote effects; inspect the server before retrying writes. Selected terminal output becomes an ordinary user-message draft sent to the configured model only when the user submits it.

Configure resource limits through the `ui-remote-ops` row: `connectTimeoutMs`, `commandTimeoutMs`, `outputCharacters` and `maxTerminals`. Defaults are 15 seconds, 120 seconds, 131072 characters and eight interactive terminals. This bundle includes the SSH JavaScript runtime, so employees do not download an SSH executable.

## Understand the implementation

<details>
<summary>Implementation details</summary>

The Host owns validated credential records and fingerprint-pinned SSH transports. Interactive terminals use PTYs; model commands use separate connections and the existing tools and approval services. A bounded output buffer publishes cursor-based reads to the browser emulator. Closing the plugin destroys and joins its connections. No telemetry, private-key export, model API client, remote helper or application-loop changes are supplied.

The platform SSH provider remains separate: it moves the Harness execution environment to a POSIX remote helper, while this workspace connects Windows or POSIX clients to ordinary SSH servers.

</details>

## Dev Note

<details>
<summary>Maintainer context</summary>

None.

</details>

## Model Experience

### SSH tools

#### What the model sees

`ssh_servers` returns saved server metadata. `ssh_execute` accepts only `server_id` and `command`, records approval through the existing service and returns bounded output, exit code, interruption and truncation independently. Tool calls and results use the existing session transcript. There is no automatic terminal-output injection.

#### Token effect

Two tool declarations add prompt tokens. Server lists, approved command output and user-submitted terminal selections add ordinary transcript tokens. Output is bounded by the configured character limit.

#### KV Cache effect

There is no changing per-step server inventory in the system prompt. Saved connections are queried through the discovery tool.

## Known Limitations and Deferred Work

- No SFTP, jump hosts, automatic reconnect, fleet monitoring or deployment scheduler is provided. Hosts must expose SSH and support the selected remote shell; the employee client can run on Windows. The system SSH Agent must already be configured. Terminal output may contain secrets from remote programs; select only content appropriate for the configured model. Buffered terminal output stays in Host memory and is lost on Host restart.
