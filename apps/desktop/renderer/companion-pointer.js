/** Local pointer play: observes only this window and never moves or focuses a native window. */
window.installXiaocPointerPlay = function (character, target, enabled) {
  let point
  let hoverTimer
  let reactionTimer
  let lastX
  let direction = 0
  let reversals = 0
  let lastTurn = 0
  let cooldownUntil = 0
  let disposed = false
  const reset = () => {
    clearTimeout(hoverTimer)
    clearTimeout(reactionTimer)
    hoverTimer = undefined
    point = undefined
    lastX = undefined
    direction = 0
    reversals = 0
    character.classList.remove('pointer-play', 'pointer-shy', 'pointer-curious')
  }
  const refresh = () => { if (!enabled()) reset() }
  const move = (event) => {
    if (disposed || event.buttons || !enabled()) { reset(); return }
    const rect = character.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const now = performance.now()
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)))
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height * .29) / (rect.height * .5)))
    character.style.setProperty('--look-x', `${(x * 3).toFixed(2)}px`)
    character.style.setProperty('--look-y', `${(y * 2).toFixed(2)}px`)
    character.style.setProperty('--look-angle', `${(x * 5).toFixed(2)}deg`)
    character.classList.add('pointer-play')
    if (lastX !== undefined && Math.abs(event.clientX - lastX) > 5) {
      const nextDirection = Math.sign(event.clientX - lastX)
      if (direction && nextDirection !== direction) {
        reversals = now - lastTurn < 1600 ? reversals + 1 : 1
        lastTurn = now
      }
      direction = nextDirection
      lastX = event.clientX
      if (reversals >= 3 && now >= cooldownUntil) {
        character.classList.add('pointer-curious')
        cooldownUntil = now + 2500
        reversals = 0
        clearTimeout(reactionTimer)
        reactionTimer = setTimeout(() => { character.classList.remove('pointer-curious') }, 900)
      }
    } else if (lastX === undefined) lastX = event.clientX
    const nearFace = Math.abs(event.clientX - rect.left - rect.width / 2) < 18
      && Math.abs(event.clientY - rect.top - rect.height * .29) < 13
    if (!nearFace || (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 4)) {
      clearTimeout(hoverTimer)
      hoverTimer = undefined
      point = undefined
    }
    if (nearFace && hoverTimer === undefined && now >= cooldownUntil) {
      point = { x: event.clientX, y: event.clientY }
      hoverTimer = setTimeout(() => {
        hoverTimer = undefined
        if (disposed || !enabled()) { reset(); return }
        character.classList.remove('pointer-curious')
        character.classList.add('pointer-shy')
        cooldownUntil = performance.now() + 3000
        clearTimeout(reactionTimer)
        reactionTimer = setTimeout(() => { character.classList.remove('pointer-shy') }, 1000)
      }, 650)
    }
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerleave', reset)
  target.addEventListener('pointerdown', reset)
  window.addEventListener('blur', reset)
  return {
    refresh,
    dispose() {
      disposed = true
      reset()
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerleave', reset)
      target.removeEventListener('pointerdown', reset)
      window.removeEventListener('blur', reset)
    },
  }
}
