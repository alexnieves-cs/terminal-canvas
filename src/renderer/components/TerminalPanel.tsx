import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { createTerminal, type TerminalHandles } from '../terminal/create-terminal'

export interface TerminalPanelProps {
  panelId: string
  cwd: string
  command: string
  args?: string[]
  title?: string
}

type Status =
  | { kind: 'starting' }
  | { kind: 'running'; pid: number; renderer: string }
  | { kind: 'exited'; code: number }
  | { kind: 'error'; message: string }

const RESIZE_DEBOUNCE_MS = 50

export function TerminalPanel({
  panelId,
  cwd,
  command,
  args = [],
  title
}: TerminalPanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>({ kind: 'starting' })

  // `args = []` creates a fresh array every render. Depending on it directly
  // would re-run the effect forever, tearing down and respawning the PTY on
  // each pass. Key the effect on its serialised value instead.
  const argsKey = JSON.stringify(args)
  const stableArgs = useMemo<string[]>(() => JSON.parse(argsKey) as string[], [argsKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let handles: TerminalHandles | null = null
    let disposed = false
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const unsubscribes: Array<() => void> = []

    const boot = async (): Promise<void> => {
      handles = createTerminal(container)
      const { term, fitAddon } = handles

      // Fit BEFORE creating the PTY so the shell's very first TIOCGWINSZ
      // returns the real size. Spawn at 80x24 and resize after, and an agent
      // TUI draws its frame twice and can leave artifacts behind.
      fitAddon.fit()

      unsubscribes.push(
        window.canvas.pty.onData((chunk) => {
          if (chunk.panelId !== panelId) return
          term.write(chunk.data)
        })
      )

      unsubscribes.push(
        window.canvas.pty.onExit((info) => {
          if (info.panelId !== panelId) return
          setStatus({ kind: 'exited', code: info.exitCode })
          term.write(`\r\n\x1b[38;5;244m[process exited with code ${info.exitCode}]\x1b[0m\r\n`)
        })
      )

      // Keystrokes go straight to the PTY. Notably this includes Ctrl+C, which
      // must arrive as a real SIGINT rather than being intercepted as "copy".
      term.onData((data) => {
        void window.canvas.pty.write({ panelId, data })
      })

      // Menu-driven clipboard. xterm's selection is not a DOM selection under
      // the WebGL renderer, so we ask xterm for it explicitly.
      unsubscribes.push(
        window.canvas.edit.onCopy(() => {
          const selection = term.getSelection()
          if (selection) void navigator.clipboard.writeText(selection)
        })
      )
      unsubscribes.push(
        window.canvas.edit.onPaste((text) => {
          // term.paste, not a raw pty.write: xterm wraps the payload in
          // bracketed-paste markers when the app has enabled them, and
          // normalises CRLF/LF to CR. Writing raw makes every newline in a
          // multi-line prompt submit as a separate Enter, so pasting a prompt
          // into `claude` fires off several partial prompts instead of one.
          if (text) term.paste(text)
        })
      )

      try {
        const result = await window.canvas.pty.create({
          panelId,
          cwd,
          command,
          args: stableArgs,
          cols: term.cols,
          rows: term.rows
        })
        if (disposed) {
          // Teardown beat the spawn. Kill the process we just created,
          // otherwise it outlives the panel that asked for it.
          void window.canvas.pty.kill(panelId)
          return
        }
        setStatus({ kind: 'running', pid: result.pid, renderer: handles.rendererKind })
        term.focus()
      } catch (error) {
        if (disposed) return
        setStatus({ kind: 'error', message: String(error) })
      }
    }

    // Refit on container size change, never on zoom - that distinction becomes
    // load-bearing in M3, where the panel is inside a CSS scale transform.
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (!handles) return
        handles.fitAddon.fit()
        void window.canvas.pty.resize({
          panelId,
          cols: handles.term.cols,
          rows: handles.term.rows
        })
      }, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(container)

    void boot()

    return () => {
      disposed = true
      observer.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
      for (const off of unsubscribes) off()
      handles?.dispose()
      void window.canvas.pty.kill(panelId)
    }
  }, [panelId, cwd, command, stableArgs])

  return (
    <div className="panel">
      <header className="panel__chrome">
        <span className="panel__title">{title ?? command}</span>
        <StatusBadge status={status} />
      </header>
      <div className="panel__terminal" ref={containerRef} />
    </div>
  )
}

function StatusBadge({ status }: { status: Status }): JSX.Element {
  switch (status.kind) {
    case 'starting':
      return <span className="badge badge--pending">starting…</span>
    case 'running':
      return (
        <span className="badge badge--running">
          pid {status.pid} · {status.renderer}
        </span>
      )
    case 'exited':
      return <span className="badge badge--exited">exited {status.code}</span>
    case 'error':
      return <span className="badge badge--error">{status.message}</span>
  }
}
