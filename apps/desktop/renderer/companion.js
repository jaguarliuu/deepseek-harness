/** Shell-owned presentation; no credentials, network calls, or synthetic progress. */
const api = window.xiaoc
const collapse = document.getElementById('collapse')
const hide = document.getElementById('hide')
const greet = document.getElementById('greet')
const roam = document.getElementById('roam')
const sprite = document.querySelector('.sprite')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
let spritesReady = false
let presentation
let animationTimer
let timer
let pointerDrag
let dragged = false
let strokeDistance = 0
let lastStrokePoint
let lastStrokeAt = 0
let dockRevision = -1
let dockSettleTimer
async function refresh() {
  clearTimeout(timer)
  try {
    const view = await api.view()
    document.body.dataset.state = view.state
    if (dockRevision !== view.dockRevision) {
      dockRevision = view.dockRevision
      clearTimeout(dockSettleTimer)
      const revision = dockRevision
      dockSettleTimer = setTimeout(() => {
        void api.settleDock(revision).catch(error => console.error('Companion docking transition failed', error))
      }, view.reduced ? 0 : 420)
    }
    document.body.classList.toggle('tucked', view.tucked)
    document.body.dataset.dock = view.dock ?? ''
    document.body.classList.toggle('compact', view.collapsed)
    presentation = view
    animate()
    const m = view.messages
    document.title = m.aboutProduct
    collapse.title = view.collapsed ? m.companionExpand : m.companionCollapse
    collapse.textContent = view.collapsed ? '+' : '−'
    hide.title = m.companionHide
    greet.title = m.openApplication
    roam.title = view.roaming ? m.companionStay : m.companionRoam
    roam.setAttribute('aria-pressed', String(view.roaming))
    roam.disabled = view.reduced
    for (const button of [collapse, hide, greet, roam]) button.setAttribute('aria-label', button.title)
  } catch (error) {
    presentation = undefined
    clearTimeout(animationTimer)
    sprite.dataset.pose = 'idle'
    sprite.dataset.frame = '0'
    document.body.dataset.state = 'unknown'
    console.error('Companion bridge unavailable', error)
  }
  if (!document.hidden) timer = setTimeout(refresh, 250)
}
for (const [button, action] of [[collapse, 'collapse'], [hide, 'hide'], [greet, 'greet'], [roam, 'roam']]) {
  button.addEventListener('click', async () => {
    if (button === greet && dragged) return
    try { await api.action(action); await refresh() }
    catch (error) { console.error('Companion action failed', error); await refresh() }
  })
}
for (const eventName of ['dblclick', 'contextmenu']) {
  greet.addEventListener(eventName, async (event) => {
    event.preventDefault()
    if (eventName === 'dblclick' && dragged) return
    try { await api.action('open') }
    catch (error) { console.error('Companion task window failed', error); await refresh() }
  })
}
greet.addEventListener('pointerenter', () => {
  void api.action('wake').catch(error => console.error('Companion wake failed', error))
})
greet.addEventListener('pointerleave', () => { lastStrokePoint = undefined; strokeDistance = 0 })
greet.addEventListener('pointermove', (event) => {
  const rect = greet.getBoundingClientRect()
  if (event.buttons || event.clientY > rect.top + rect.height * .42) {
    lastStrokePoint = undefined; strokeDistance = 0; return
  }
  if (lastStrokePoint) strokeDistance += Math.hypot(event.clientX - lastStrokePoint.x, event.clientY - lastStrokePoint.y)
  lastStrokePoint = { x: event.clientX, y: event.clientY }
  if (strokeDistance < 70 || Date.now() - lastStrokeAt < 550) return
  strokeDistance = 0
  lastStrokeAt = Date.now()
  void api.action('pet').catch(error => console.error('Companion head stroke failed', error))
})
greet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  dragged = false
  pointerDrag = { id: event.pointerId, x: event.screenX, y: event.screenY }
  greet.setPointerCapture(event.pointerId)
  void api.action('drag-start').catch(error => console.error('Companion drag failed', error))
})
greet.addEventListener('pointermove', (event) => {
  if (pointerDrag && Math.hypot(event.screenX - pointerDrag.x, event.screenY - pointerDrag.y) >= 4) dragged = true
})
function endDrag() {
  if (!pointerDrag) return
  pointerDrag = undefined
  void api.action('drag-end').catch(error => console.error('Companion drag end failed', error))
}
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) greet.addEventListener(eventName, endDrag)
window.addEventListener('blur', endDrag)
window.addEventListener('pagehide', endDrag)
function animate() {
  clearTimeout(animationTimer)
  if (document.hidden || !presentation || presentation.collapsed) return
  const { motion, reduced } = presentation
  const elapsed = Math.max(0, Date.now() - motion.since)
  let frame = 0
  if (!reduced) {
    if (motion.pose === 'walk') frame = Math.floor(elapsed / 130) % 4
    else if (motion.pose === 'wave') frame = [0, 1, 2, 3, 2, 3, 2, 1][Math.floor(elapsed / 220) % 8]
    else if (motion.pose === 'sleep') frame = 2
    else if (motion.pose === 'shy') frame = 3
    else if (motion.pose === 'work') frame = [0, 1, 2, 3, 2, 1][Math.floor(elapsed / 320) % 6]
    else { const t = elapsed % 6200; frame = t < 3000 ? 0 : t < 3650 ? 1 : t < 3820 ? 2 : t < 4500 ? 3 : 0 }
  }
  sprite.dataset.pose = motion.pose
  sprite.dataset.frame = String(frame)
  sprite.dataset.direction = motion.direction === -1 ? 'left' : 'right'
  if (!reduced) animationTimer = setTimeout(animate, 65)
}
async function setMotionPreference() {
  try { await api.action(reducedMotion.matches || !spritesReady ? 'reduce-on' : 'reduce-off'); await refresh() }
  catch (error) { console.error('Companion motion preference failed', error) }
}
reducedMotion.addEventListener('change', setMotionPreference)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(timer); clearTimeout(animationTimer) }
  else void refresh()
})
Promise.all(['xiaoc-motion.png', 'xiaoc-walk-left.png'].map(file => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = resolve
  image.onerror = reject
  image.src = `assets/${file}`
}))).then(() => { spritesReady = true; document.body.classList.add('ready'); void setMotionPreference() }).catch((error) => { console.error('Companion sprites unavailable', error) })
void setMotionPreference()
const stopDockUpdates = api.onChange(() => { void refresh() })
window.addEventListener('pagehide', () => { clearTimeout(dockSettleTimer); stopDockUpdates() })
