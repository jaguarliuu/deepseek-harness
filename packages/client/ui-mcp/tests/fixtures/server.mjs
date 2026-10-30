/** Local stdio fixture with one tool; no executable dependencies or network. */
import { createInterface } from 'node:readline'
process.stdin.once('end', () => process.exit(0))
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  const response = request.method === 'server/discover'
    ? { error: { code: -32601, message: 'Legacy protocol' } }
    : { result: request.method === 'initialize'
      ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      : { tools: [{ name: 'local_ping', inputSchema: { type: 'object', properties: {} } }] } }
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, ...response })}\n`)
})
