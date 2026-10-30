---
description: "Configure and test MCP connections from desktop settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-mcp

English | [中文](README.zh.md)

## Summary

The MCP services settings section manages named Streamable HTTP and local stdio connections. Existing Skills use their registered tools through the standard MCP client. This package is included in the Web bundle shared by Desktop.

## Table of Contents

- [Configuration](#configuration)
- [Connection testing](#connection-testing)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Configuration

The `ui-mcp` entry stores a `servers` array in the profile configuration. Each server has a unique `name`, `enabled`, `transport`, `url`, `headers`, `command`, `args`, `env`, `cwd`, and `timeoutMs`. Names use 1–32 ASCII letters, digits, underscores or hyphens; timeouts range from 1 to 300 seconds. HTTP endpoints require HTTP(S), without embedded user credentials or fragments. Headers are optional. Stdio arguments are a JSON string array; headers and environment variables are JSON objects with string values.

Add and edit dialogs stage changes until Save. Revision-fenced writes reject stale editors. Enable, disable and remove persist through the same configuration owner. Volatile configuration updates reconcile connections without restarting the application, closing changed or disabled connections before replacing them. Enabled children use the standard MCP client's reconnect, scoped tools and resource handling. Removing a connection does not change the external service's data.

Credentials in request headers and environment variables are stored in the local profile configuration, not an encrypted credential vault. Do not distribute profiles containing secrets. Connection cards omit URL query strings. Failed probes return stable error codes without external diagnostics or credentials.

## Connection testing

`mcpManager.test` validates the supplied unsaved definition, initializes a temporary MCP connection and lists tool names. It never invokes a tool or changes configuration. Stdio testing starts the configured executable; its dependencies must already be installed. Each test closes its client and transport, and plugin disposal cancels outstanding tests. Tests do not prove that every tool operation has authorization or that a configured service remains connected later.

## Dev Note

The configuration owner serializes connection replacement. Failed disposal stops further reconciliation and reports a restart requirement; a failed connection is handled by the MCP client reconnect supervisor.

## Model Experience

### Enabled service capabilities

#### What the model sees

Services with `enabled: true` contribute tools and resources through the [MCP client](../../mcp/mcp-client/README.md#model-experience). This manager contributes no independent prompt text.

#### Token effect

The manager itself adds zero tokens; the enabled services determine the client-owned tool and resource context.

#### KV Cache effect

This package adds no prompt text itself. Enabling or disabling a service changes the tool inventory supplied by the MCP client.

## Known Limitations and Deferred Work

- OAuth sign-in and legacy HTTP+SSE endpoints are not supported by this editor; use Streamable HTTP or stdio.
- Enabled means configured to start, not a live connection health assertion. Test connection reports a temporary handshake and discovered tool names.
- Local programs and their dependencies are not downloaded by the manager. Supply them through the offline installation or configured intranet sources.
