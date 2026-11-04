/** One xterm instance owns rendering, keyboard input and a serial bounded-output poll. */
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { OpsFace } from './page.tsx'
import type { TerminalId } from '../types.ts'
import css from './page.module.css'
/**
 * Render one retained terminal; background tabs remain mounted to preserve their screen.
 * @param props - terminal identity, local callbacks and visibility.
 * @returns emulator container.
 */
export function SshTerminal({
  id,
  face,
  visible,
  onSelection,
  onStatus,
  label,
}: {
  id: TerminalId
  face: OpsFace
  visible: boolean
  onSelection: (value: string) => void
  onStatus: (value: string) => void
  label: string
}) {
  const node = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const callbacks = useRef({ onSelection, onStatus })
  callbacks.current = { onSelection, onStatus }
  useEffect(() => {
    const element = node.current
    if (!element) return
    const style = getComputedStyle(element)
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      scrollback: 3000,
      theme: { background: style.backgroundColor, foreground: style.color },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)
    termRef.current = term
    fitRef.current = fit
    let live = true,
      cursor = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let writes = Promise.resolve()
    const send = (data: string) => {
      writes = writes
        .then(() =>
          live
            ? face.write(id, data, Math.max(2, Math.min(500, term.cols)), Math.max(2, Math.min(300, term.rows)))
            : undefined,
        )
        .catch((_writeError: unknown) => {
          if (live) callbacks.current.onStatus('failed')
        })
    }
    const resize = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        fit.fit()
        send('')
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const input = term.onData(send)
    const selection = term.onSelectionChange(() => {
      callbacks.current.onSelection(term.getSelection().slice(0, 16000))
    })
    const poll = async () => {
      try {
        const result = await face.read(id, cursor)
        if (!live) return
        if (result.truncated) {
          term.reset()
          callbacks.current.onStatus('outputLost')
        }
        cursor = result.cursor
        if (result.data) term.write(result.data)
        if (result.state !== 'connected') {
          callbacks.current.onStatus(result.state)
          return
        }
        timer = setTimeout(() => {
          void poll()
        }, 120)
      } catch (_readError: unknown) {
        if (live) callbacks.current.onStatus('failed')
      }
    }
    void poll()
    return () => {
      live = false
      clearTimeout(timer)
      observer.disconnect()
      input.dispose()
      selection.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [id, face])
  useEffect(() => {
    if (visible) {
      fitRef.current?.fit()
      termRef.current?.focus()
    }
  }, [visible])
  return (
    <div
      ref={node}
      className={css.screen}
      role="region"
      aria-label={label}
      style={{ display: visible ? 'block' : 'none' }}
    />
  )
}
