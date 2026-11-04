/** Installed GenUI prompt controls and split runtime, without a model or browser. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(new URL('../../package.json', import.meta.url))
const plugin = await import(pathToFileURL(require.resolve('dsh-genui')).href)
const routes = new Map(), sections = new Map(), disposers = []
plugin.apply({
  effect(setup) {const dispose = setup(); if (dispose) disposers.push(dispose)},
  inject() {},
  systemPrompt: {section(section) {sections.set(section.name,section);return () => sections.delete(section.name)}},
  connection: {requestRejection: req => req.headers.authorization === 'Bearer local-test' ? undefined : 401},
  webServer: {register(route) {routes.set(route.path,route.handler);return () => routes.delete(route.path)}},
}, {sectionOrder:80,sectionName:'genui:cards',promptEnabled:true})
const server = createServer((req,res) => {
  const route = routes.get(new URL(req.url,'http://localhost').pathname)
  if (!route) {res.writeHead(404);res.end();return}
  Promise.resolve(route(req,res)).catch(error => {res.writeHead(500);res.end(String(error))})
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const address=server.address();assert(address && typeof address !=='string')
const call=(path,body,authorized=true)=>fetch(`http://127.0.0.1:${address.port}${path}`,{
  headers:{...(authorized?{authorization:'Bearer local-test'}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{method:'POST',body:JSON.stringify(body)}:{}),
})
try {
  assert.equal((await call('/api/dsh-genui/prompt',undefined,false)).status,401)
  assert.equal((await call('/dsh-genui/runtime.js',undefined,false)).status,401)
  const initial=await (await call('/api/dsh-genui/prompt')).json()
  assert.equal(initial.mode,'standard')
  assert(sections.get('genui:cards').text.includes('智维小 C 在公司内网运行'))
  assert(sections.get('genui:cards').text.includes('schemaJson'))
  const runtime=await call('/dsh-genui/runtime.js')
  assert.equal(runtime.status,200)
  const bytes=await runtime.text()
  assert(bytes.length>1_000_000)
  assert(bytes.includes('--dsw-alias-brand-text'))
  assert(bytes.includes('dsh-genui-card'))
  assert.equal((await call('/api/dsh-genui/prompt',{mode:'invalid'})).status,400)
  assert.equal((await call('/api/dsh-genui/prompt',{mode:'off'})).status,200)
  assert.equal(sections.size,0)
  assert.equal((await call('/api/dsh-genui/prompt',{mode:'mini'})).status,200)
  assert.equal(sections.size,1)
  console.log('GENUI_RESULT='+JSON.stringify({defaultMode:initial.mode,selectedMode:(await (await call('/api/dsh-genui/prompt')).json()).mode,offlineRuntime:true,authenticated:true}))
}finally {
  await new Promise(resolve=>server.close(resolve))
  for(const dispose of disposers.reverse())await dispose()
}
assert.equal(routes.size,0);assert.equal(sections.size,0)
