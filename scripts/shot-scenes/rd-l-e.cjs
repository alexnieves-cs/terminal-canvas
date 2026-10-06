/* Lane L-E. rd-settings-keys paints once this file gives it `run`.
   visual.1 then lists a missing golden until Phase 4. Do not write one. */
module.exports = [
  { name: 'rd-settings-keys', reference: ['docs/redesign/mockups/08-settings-keyboard.png'], intent: 'Settings Keyboard while a shortcut is being re-recorded, with the Cmd-K conflict banner.',
    run: async (kit) => {
      await kit.loadMain()
      // The harness preference is light. The mockup is the dark shortcut map.
      await kit.theme('dark')
      const opened = await kit.js(`(() => { if (typeof window.__tcOpenSettings !== 'function') return false; window.__tcOpenSettings('keyboard'); return true })()`)
      if (!opened) throw new Error('settings host did not install')
      await kit.js('new Promise((resolve) => setTimeout(resolve, 300))')
      const clicked = await kit.click('[data-shortcut-id="step-in"] [data-shortcut-change]')
      if (!clicked) throw new Error('step-in Change control is missing')
      await kit.shot('rd-settings-keys')
    }
  }
]
