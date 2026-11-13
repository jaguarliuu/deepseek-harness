---
description: "Optional SSH metric collection and operations dashboard for the Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-ui-ops-monitor

English | [中文](README.zh.md)

## Summary

Add an operations dashboard to the Web profile. Select saved SSH servers and reviewed Linux templates to collect metrics while the Host runs, view recent history, and ask Xiao C about collected measurements. This optional bundle requires the existing Remote operations workspace and storage services. Credentials stay with Remote operations; no model call is needed for scheduled collection.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

From a built source checkout, install the local bundle into the Web profile:

```sh
pnpm dsh plugin --profile web add ./packages/client/ui-ops-monitor
```

Start the Web profile through `dsh`. Open Remote operations to save and verify a server, then open Operations dashboard, open Monitor settings and select Enable monitoring, choose that server and review the selected scripts. Enable selected templates authorizes repeated collection. Pause collection retains history; configuring and enabling again replaces that server's history. Opening a dashboard does not itself authorize SSH access.

SSH server management remains accessible while monitoring data is loading or unavailable. A missing Remote operations panel displays installation guidance; Manage plugins opens the plugin manager. Failed streams show a diagnostic code without exposing server error details. The monitoring service requires both the Remote operations Host provider and storage services; importing only browser assets cannot activate collection.

Linux health collects CPU usage over a one-second interval, memory usage based on MemAvailable, one-minute load and uptime. Filesystem usage collects capacity percentages and mount names. A failed, truncated or malformed response discards that template’s fields. Successful templates remain visible in a partial sample with per-template failure details. The dashboard displays timestamps and marks samples older than two configured collection intervals as stale.

The dashboard generates trend and ranking panels from enrolled template definitions, alongside collection status and a host resource heatmap. Chart view selects all charts, the basic overview, or one template; server filtering applies to every panel. The heatmap and disk ranking use only available fields from fresh full or partial samples of enabled monitors; the heatmap shows the highest filesystem usage per host. Historical trend charts retain timestamps and gaps. Enrollment, history details and pause controls live under Monitor settings.

Select a host with the server filter or click its name in the resource heatmap to open the host dashboard. The page shows the selected host’s address, collection state, latest attempt time, CPU and memory gauges, load and uptime, and its template charts. Fleet counts and distribution charts are replaced by host readings. Ask Xiao C targets that host; Fleet overview returns to all hosts. Paused, stale and unavailable readings stay empty while historical charts remain visible.

Additional opt-in templates collect memory and filesystem capacity, per-interface network counters, and the ten largest CPU and memory consumers. Capacity bars show used and total bytes in binary units. Process collectors require GNU ps and retain executable names and PIDs, never full command arguments; CPU percentages may exceed 100 on multicore systems. Existing enrollments keep their selected templates until explicitly reconfigured.

Network charts show bytes per second derived from two adjacent attempts with matching boot and interface identities. First observations, intervening collection failures, counter decreases and changed boot identities leave rate gaps; unchanged counters produce zero. Timing uses Host receipt timestamps. Templates declare field types, units, instance labels, collection priority and default panels. Priorities determine serial execution order; one failed template does not block later templates unless the server deadline expires. This is a fixed typed catalog, not a HertzBeat YAML importer or expression interpreter.

Ask Xiao C to “monitor this saved server using the Linux templates” or “show the latest CPU and memory metrics”. Enrollment through the model requests session approval for the scripts and collection interval. Querying stored metrics does not execute remote commands. Configure credentials in Remote operations rather than sending them through chat.

The `ui-ops-monitor` row accepts `intervalMs` (60000), `timeoutMs` (15000), `maxServers` (20), `historyPoints` (120) and `streamIntervalMs` (5000). Collection is serial across servers, with no overlapping sweep. A sweep longer than the configured interval delays the next one. Settings and sampled history survive Host restarts through the configured storage provider. A storage failure stops collection and is reported; inspect storage before restarting the plugin.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details</summary>

The bundle inserts its Host and Client plugin row. Host collection reuses fingerprint-pinned Remote operations connections and keeps enrollment tied to the reviewed address, username, authentication mode and host key. Changing that identity requires new enrollment. The versioned `ops_monitor` storage domain owns bounded per-server history. The browser consumes a shared resource stream; the collector continues when that browser resource closes. Unload aborts and joins in-flight collection before closing storage.

Templates follow HertzBeat's separation of collection commands and metric definitions, but use this plugin's fixed tab-separated numeric format. They are original collectors, not a general HertzBeat YAML interpreter. See [HertzBeat SSH monitoring](https://hertzbeat.apache.org/docs/1.9.0/advanced/extend-ssh/) for the reference design.

</details>

<a id="model-experience"></a>
## Model Experience

### Monitoring tools

#### What the model sees

`monitoring_catalog` lists saved server metadata and reviewed scripts. `monitoring_enable` enrolls a server after session approval, `monitoring_disable` pauses it, and `monitoring_query` returns bounded timestamped samples. Calls and results use the existing tool transcript. Raw command output and SSH credentials are never returned.

#### Token effect

Four tool declarations and requested results add tokens. Background collection adds no model requests or automatic context injection.

#### KV Cache effect

The declarations remain stable as measurements change. Inventory and measurements enter context only through requested tool results.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Linux only; requires POSIX shell, awk, sleep, df and readable procfs. No Windows server collectors, jump hosts or remote helpers are provided.
- Custom scripts, custom metrics, panel layout editing, alert notifications and HertzBeat YAML import are not included. History is point-bounded and is not a long-term time-series database.
- Collection requires the Host to remain running. Sequential sampling suits small fleets; all timestamps reflect Host receipt time. Failed sweeps retain a gap, and no missing metric is replaced by zero.
- The optional bundle targets the Web profile, where Remote operations is available. Installation does not provision servers or credentials. Real infrastructure access must be verified in the deployment; automated tests use isolated SSH responses.

<a id="dev-note"></a>
### Dev Note

None.
