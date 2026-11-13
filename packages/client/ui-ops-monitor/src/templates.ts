/** Fixed read-only POSIX collectors; remote output is parsed as data, never evaluated. */
import type { Metric, MetricDefinition, PanelDefinition, Template, TemplateId } from './types.ts'

const health = `export LC_ALL=C
set -eu
first=$(awk '/^cpu / { idle=$5+$6; total=0; for(i=2;i<=9;i++) total+=$i; print total, idle; exit }' /proc/stat)
sleep 1
awk -v first="$first" '/^cpu / { split(first,a," "); idle=$5+$6; total=0; for(i=2;i<=9;i++) total+=$i; delta=total-a[1]; if(delta<=0) exit 1; printf "cpu_percent\\t%.2f\\t%%\\t-\\n", 100*(delta-idle+a[2])/delta; exit }' /proc/stat
awk '/^MemTotal:/ {total=$2} /^MemAvailable:/ {available=$2; found=1} END {if(total<=0 || !found) exit 1; printf "memory_percent\\t%.2f\\t%%\\t-\\n",100*(total-available)/total}' /proc/meminfo
awk '{printf "load_1m\\t%s\\tload\\t-\\n",$1}' /proc/loadavg
awk '{printf "uptime_seconds\\t%s\\ts\\t-\\n",$1}' /proc/uptime`
const filesystems = `export LC_ALL=C
set -eu
df -Pk | awk 'NR>1 && $1 !~ /^(tmpfs|devtmpfs)$/ {use=$5; sub(/%$/,"",use); label=$6; for(i=7;i<=NF;i++) label=label " " $i; printf "disk_percent\\t%s\\t%%\\t%s\\n",use,label}'`

const capacity = `export LC_ALL=C
set -eu
awk '/^MemTotal:/ {total=$2} /^MemAvailable:/ {available=$2; found=1} END {if(total<=0 || !found) exit 1; printf "memory_total_bytes\\t%.0f\\tB\\t-\\nmemory_used_bytes\\t%.0f\\tB\\t-\\nmemory_available_bytes\\t%.0f\\tB\\t-\\n",total*1024,(total-available)*1024,available*1024}' /proc/meminfo
df -Pk | awk 'NR>1 && $1 !~ /^(tmpfs|devtmpfs)$/ {label=$6; for(i=7;i<=NF;i++) label=label " " $i; printf "filesystem_total_bytes\\t%.0f\\tB\\t%s\\nfilesystem_used_bytes\\t%.0f\\tB\\t%s\\nfilesystem_available_bytes\\t%.0f\\tB\\t%s\\n",$2*1024,label,$3*1024,label,$4*1024,label}'`
const network = `export LC_ALL=C
set -eu
printf 'network_boot_id\\t%s\\ttext\\t-\\n' "$(cat /proc/sys/kernel/random/boot_id)"
awk 'NR>2 {split($0,a,":"); name=a[1]; gsub(/ /,"",name); sub(/^[[:space:]]+/,"",a[2]); split(a[2],v,/[[:space:]]+/); printf "network_receive_bytes\\t%s\\tB\\t%s\\nnetwork_transmit_bytes\\t%s\\tB\\t%s\\n",v[1],name,v[9],name}' /proc/net/dev`
const processes = `export LC_ALL=C
set -eu
ps -eo pid=,pcpu=,comm= --sort=-pcpu | awk 'NR<=10 {name=$3; for(i=4;i<=NF;i++) name=name " " $i; printf "cpu_process_percent\\t%s\\t%%\\t%s\\ncpu_process_name\\t%s\\ttext\\t%s\\n",$2,$1,name,$1}'
ps -eo pid=,pmem=,comm= --sort=-pmem | awk 'NR<=10 {name=$3; for(i=4;i<=NF;i++) name=name " " $i; printf "memory_process_percent\\t%s\\t%%\\t%s\\nmemory_process_name\\t%s\\ttext\\t%s\\n",$2,$1,name,$1}'`

function field(name: MetricDefinition['name'], group: string, unit: string, label: MetricDefinition['label'], maximum?: number): MetricDefinition {
  return { name, group, type: unit === 'text' ? 'string' : 'number', unit, label, ...(maximum === undefined ? {} : { maximum }) }
}
function template(id: TemplateId, priority: number, script: string, fields: MetricDefinition[], panels: PanelDefinition[]): Template {
  return { id, priority, script, fields, metrics: fields.map(item => item.name), panels }
}
/** Reviewed definitions drive validation, collection order and default charts. */
export const templateMap: Record<TemplateId, Template> = {
  'linux-health': template('linux-health', 0, health, [
    field('cpu_percent', 'health', '%', 'none', 100), field('memory_percent', 'health', '%', 'none', 100),
    field('load_1m', 'health', 'load', 'none'), field('uptime_seconds', 'health', 's', 'none'),
  ], [
    { metric: 'cpu_percent', chart: 'trend', unit: '%', maximum: 100 },
    { metric: 'memory_percent', chart: 'trend', unit: '%', maximum: 100 },
    { metric: 'load_1m', chart: 'trend', unit: 'load' },
  ]),
  'linux-filesystems': template('linux-filesystems', 1, filesystems, [field('disk_percent', 'filesystem', '%', 'instance', 100)], [
    { metric: 'disk_percent', chart: 'ranking', unit: '%', maximum: 100 },
  ]),
  'linux-capacity': template('linux-capacity', 2, capacity, [
    ...(['memory_total_bytes', 'memory_used_bytes', 'memory_available_bytes'] as const).map(name => field(name, 'memory', 'B', 'none')),
    ...(['filesystem_total_bytes', 'filesystem_used_bytes', 'filesystem_available_bytes'] as const).map(name => field(name, 'filesystem', 'B', 'instance')),
  ], [
    { metric: 'memory_used_bytes', chart: 'ranking', unit: 'B', totalMetric: 'memory_total_bytes' },
    { metric: 'filesystem_used_bytes', chart: 'ranking', unit: 'B', totalMetric: 'filesystem_total_bytes' },
  ]),
  'linux-network': template('linux-network', 3, network, [
    field('network_boot_id', 'boot', 'text', 'none'), field('network_receive_bytes', 'network', 'B', 'instance'),
    field('network_transmit_bytes', 'network', 'B', 'instance'),
  ], [
    { metric: 'network_receive_rate', chart: 'trend', unit: 'B/s' },
    { metric: 'network_transmit_rate', chart: 'trend', unit: 'B/s' },
  ]),
  'linux-processes': template('linux-processes', 4, processes, [
    field('cpu_process_percent', 'process-cpu', '%', 'instance'), field('cpu_process_name', 'process-cpu', 'text', 'instance'),
    field('memory_process_percent', 'process-memory', '%', 'instance', 100), field('memory_process_name', 'process-memory', 'text', 'instance'),
  ], [
    { metric: 'cpu_process_percent', chart: 'ranking', unit: '%', nameMetric: 'cpu_process_name' },
    { metric: 'memory_process_percent', chart: 'ranking', unit: '%', maximum: 100, nameMetric: 'memory_process_name' },
  ]),
}
/** Catalog metadata in stable display order. */
export const templates = Object.values(templateMap)
/**
 * Parse bounded tab-separated observations using the template's field definitions.
 * @param id - collector that produced the output.
 * @param output - complete command output; caller rejects truncated and unsuccessful commands.
 * @returns metrics with complete fields for each observed group and instance; rejects malformed output.
 */
export function parseMetrics(id: TemplateId, output: string): Metric[] {
  const fields = templateMap[id].fields
  const lines = output.trim().split('\n')
  if (!output.trim() || lines.length > 128) throw new Error('Invalid metric rows')
  const seen = new Set<string>()
  const instances = new Map<string, Set<string>>()
  const result = lines.map((line) => {
    const columns = line.split('\t')
    const [name, raw, unit, label] = columns
    const definition = fields.find(item => item.name === name)
    if (columns.length !== 4 || !name || !raw?.trim() || !label || label.length > 256 || !definition || unit !== definition.unit)
      throw new Error('Invalid metric fields')
    const value = definition.type === 'number' ? Number(raw) : raw
    const key = `${name}\t${label}`
    if (seen.has(key) || (definition.label === 'none' && label !== '-')) throw new Error('Invalid metric identity')
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || (definition.maximum !== undefined && value > definition.maximum)))
      throw new Error('Invalid metric value')
    if (definition.unit === 'B' && typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid byte counter')
    if (typeof value === 'string' && (value.length > 256 || /[\x00-\x1f\x7f]/u.test(value))) throw new Error('Invalid text metric')
    seen.add(key)
    const labels = instances.get(definition.group) ?? new Set<string>()
    labels.add(label); instances.set(definition.group, labels)
    return { name, value, unit, label }
  })
  for (const definition of fields) {
    const labels = instances.get(definition.group)
    if (!labels?.size || [...labels].some(label => !seen.has(`${definition.name}\t${label}`))) throw new Error('Missing metric')
  }
  return result
}
