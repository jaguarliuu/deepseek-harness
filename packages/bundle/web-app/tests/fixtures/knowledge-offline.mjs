/** Exercise installed plugin bytes in a private Host home without a model or external network. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zipSync, strToU8 } from 'fflate'

const require = createRequire(new URL('../../package.json', import.meta.url))
const web = await import(pathToFileURL(require.resolve('dsh-knowledge-base/web')).href)
const host = await import(pathToFileURL(require.resolve('dsh-knowledge-base')).href)
const disposers = []
const routes = new Map()
const tools = new Map()
const ctx = {
  effect(setup) { const dispose = setup(); if (dispose) disposers.push(dispose) },
  connection: { requestRejection(req) { return req.headers.authorization === 'Bearer local-test' ? undefined : 401 } },
  webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
  tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
}
web.apply(ctx, { categories: [] })
host.apply(ctx, { categories: [] })
const server = createServer((req,res) => {
  const route = routes.get(new URL(req.url, 'http://localhost').pathname)
  if (!route) {res.writeHead(404);res.end();return}
  Promise.resolve(route.handler(req,res)).catch(error => {res.writeHead(500);res.end(String(error))})
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`
const call = (path, body, headers = {authorization:'Bearer local-test'}) => fetch(origin+path, {
  headers: {...headers, ...(body === undefined ? {} : {'content-type':'application/json'})},
  method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : {body:JSON.stringify(body)}),
})
try {
  assert.equal((await call('/api/kb/list', undefined, {})).status,401)
  assert.equal((await call('/api/kb/import')).status,405)
  assert.equal((await call('/api/kb/list', {})).status,405)
  assert.equal((await call('/api/kb/classify', {})).status,404)
  const document = zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>数据库巡检规范：检查实例状态，核对备份记录。</w:t></w:r></w:p></w:body></w:document>'),
  })
  const upload = (name, bytes) => call('/api/kb/import', {name, contentBase64: Buffer.from(bytes).toString('base64'),category:'运维规程'})
  const imported = await upload('巡检规范.docx', document)
  assert.equal(imported.status,200, await imported.clone().text())
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 49 >>\nstream\nBT /F1 12 Tf 50 700 Td (Offline PDF handbook) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')
  const pdfResult = await upload('handbook.pdf',pdf)
  assert.equal(pdfResult.status,200,await pdfResult.clone().text())
  const query = await (await call('/api/kb/search?q='+encodeURIComponent('数据库巡检'))).json()
  assert.equal(query.matched,1)
  assert.match(JSON.stringify(query.rows),/核对备份记录/)
  const pdfQuery = await (await call('/api/kb/search?q=handbook')).json()
  assert.match(JSON.stringify(pdfQuery.rows),/Offline PDF handbook/)
  const invalid = await upload('bad.docx',Buffer.from('broken zip'))
  assert.equal(invalid.status,400)
  assert.equal(tools.has('kb_import'),false)
  assert.equal(tools.has('kb_delete'),false)
  assert.deepEqual([...tools.keys()].sort(),['kb_list','kb_query'])
  // Session-facing text remains an owner-local, keyless snapshot.
  const result = await tools.get('kb_query').execute({query:'数据库巡检'})
  const parsed = JSON.parse(result)
  console.log('KNOWLEDGE_RESULT='+JSON.stringify({matched:parsed.matched,rows:parsed.rows.map(({name,source,detail})=>({name,source,detail}))}))
  assert.equal((await upload('blank.txt', Buffer.from('   '))).status,400)
  await upload('replace.md', Buffer.from('# 旧版\n'+ '旧版核验项目。'.repeat(250)))
  assert((await (await call('/api/kb/search?q='+encodeURIComponent('旧版核验'))).json()).matched > 0)
  await upload('replace.md', Buffer.from('新版巡检记录'))
  assert.equal((await (await call('/api/kb/search?q='+encodeURIComponent('旧版核验'))).json()).matched,0)
  const client = readFileSync(join(dirname(require.resolve('dsh-knowledge-base')),'client.js'),'utf8')
  assert(client.includes('var(--dsw-alias-brand-text)'))
  assert(!client.includes('#2563eb'))
} finally {
  await new Promise(resolve => server.close(resolve))
  for (const dispose of disposers.reverse()) await dispose()
}
assert.equal(routes.size,0)
assert.equal(tools.size,0)
