/** Exercise installed Pages storage, templates and authenticated routes without a browser or model. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const require = createRequire(new URL('../../package.json', import.meta.url))
const pages = await import(pathToFileURL(require.resolve('@orderg-x/dsh-pages')).href)
assert.equal(pages.dataDir(), join(process.env.DSH_HOME, 'dsh-pages', 'pages'))
const routes = new Map(), tools = new Map(), disposers = []
let origin
pages.apply({
  effect(setup) { const dispose = setup(); if (dispose) disposers.push(dispose) },
  get(name) { return name === 'connection' ? {requestRejection: req => req.headers.authorization === 'Bearer local-test' ? undefined : 401} : undefined },
  webServer: { getOrigin: () => origin, register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } },
  tools: { register(tool) {tools.set(tool.name,tool); return () => tools.delete(tool.name)} },
  logger: {warn(message) {throw new Error(message)}},
})
const server = createServer((req,res) => {
  const handler = routes.get(new URL(req.url,'http://localhost').pathname)
  if (!handler) {res.writeHead(404);res.end();return}
  handler(req,res)
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const address = server.address(); assert(address && typeof address !== 'string')
origin = `http://127.0.0.1:${address.port}`
const call = (url, body, authorized = true) => fetch(origin+url, {
  headers: {...(authorized ? {authorization:'Bearer local-test'} : {}), ...(body ? {'content-type':'application/json'} : {})},
  ...(body ? {method:'POST', body:JSON.stringify(body)} : {}),
})
try {
  assert.equal((await call('/dsh-pages/api/list',undefined,false)).status,401)
  const tool = tools.get('show_page'); assert(tool)
  const page = await tool.execute({title:'数据库巡检报告',template:'report',data:{summary:'巡检完成，备份正常',sections:[{heading:'巡检结论',text:'实例运行正常，无异常告警'}]}})
  assert.equal(page.v,1)
  const response = await call(`/dsh-pages/page?id=${page.id}&v=1`)
  assert.equal(response.status,200)
  const policy = response.headers.get('content-security-policy')
  assert(!/https?:\/\//.test(policy))
  assert(policy.includes("connect-src 'none'"))
  assert(!policy.includes('allow-popups'))
  const html = await response.text()
  assert(html.includes('巡检完成，备份正常'))
  assert(html.includes('--accent:#007f76'))
  const next = await tool.execute({title:'数据库巡检报告',page_id:page.id,template:'report',data:{summary:'已补充备份核验结果'}})
  assert.equal(next.v,2)
  assert((await (await call(`/dsh-pages/page?id=${page.id}&v=1`)).text()).includes('巡检完成，备份正常'))
  assert.equal((await call('/dsh-pages/api/state',{id:page.id,ops:{set:{checked:'true'}}})).status,200)
  const state = JSON.parse(readFileSync(join(pages.dataDir(),page.id,'state.json'),'utf8'))
  assert.equal(state.checked,'true')
  const downloaded = await call(`/dsh-pages/page?id=${page.id}&v=2&download=1`)
  assert.equal(downloaded.status,200)
  assert.match(downloaded.headers.get('content-disposition'), /attachment/)
  assert((await downloaded.text()).includes('已补充备份核验结果'))
  console.log('PAGES_RESULT='+JSON.stringify({title:page.title,template:page.template,version:next.v,display:page.display,offline:true}))
} finally {
  await new Promise(resolve => server.close(resolve))
  for (const dispose of disposers.reverse()) await dispose()
}
assert.equal(routes.size,0); assert.equal(tools.size,0)
