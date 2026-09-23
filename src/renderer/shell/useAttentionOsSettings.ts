import { useCallback, useEffect, useState } from 'react'

/**
 * Daily loop 4.2. The two OS attention settings (`attention.notify`, on by
 * default; `attention.sound`, off), read where attention LIVES — the dock's
 * popover — rather than only through the palette's settings list, where a
 * person has to already know the sound exists to search for it.
 *
 * Main stays the store's only author: this reads `settings.list`, writes
 * `settings.set`, and re-reads on `settings.onChanged` so a palette write shows
 * here too. `null` until the first read lands — the toggles render nothing
 * rather than a guessed default that could be the opposite of the truth.
 */
export function useAttentionOsSettings(): {
  notify: boolean | null
  sound: boolean | null
  toggle: (id: 'attention.notify' | 'attention.sound') => void
} {
  const [notify, setNotify] = useState<boolean | null>(null)
  const [sound, setSound] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        setNotify(rows.find((r) => r.id === 'attention.notify')?.value === true)
        setSound(rows.find((r) => r.id === 'attention.sound')?.value === true)
      })
    }
    read()
    const off = window.canvas.settings.onChanged((id) => { if (id.startsWith('attention.')) read() })
    return () => { live = false; off() }
  }, [])
  const toggle = useCallback((id: 'attention.notify' | 'attention.sound') => {
    const now = id === 'attention.notify' ? notify : sound
    if (now === null) return
    void window.canvas.settings.set(id, !now)
  }, [notify, sound])
  return { notify, sound, toggle }
}
