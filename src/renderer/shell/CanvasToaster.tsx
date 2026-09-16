import { type JSX } from 'react'
import { Toaster } from 'sonner'

/**
 * Round 8. The toast layer's one mount.
 *
 * WHERE IT SITS. Bottom-centre, above the command pill's own lane. Not
 * top-right, which is where a toast library puts itself by default and where
 * this app's traffic lights and top bar already are; and not bottom-right,
 * which is the canvas HUD and the minimap. Bottom-centre is the same place a
 * person is already looking when they run a verb from the pill, which is what
 * produces most of these sentences.
 *
 * THEMING. Sonner is told its colours through its OWN custom properties,
 * which is the part worth explaining, because it looks like an odd way round.
 * The library paints with those properties; this app declares every colour in
 * a theme block and nowhere else. Setting sonner's properties FROM this app's
 * tokens in `styles.css` joins the two without a hex leaving the theme block,
 * so `verify:styles` 1 still reads the stylesheet honestly and dark mode,
 * light mode and high contrast all follow with no arm of their own. The rules
 * are in styles.css beside every other rule; nothing is styled from here.
 *
 * `richColors` is ON so the three outcomes are told apart by colour as well as
 * by icon — and the colours it reaches for are re-pointed at this app's own
 * green, amber and red in the stylesheet, so a toast never introduces a sixth
 * accent nobody measured for contrast.
 *
 * NOT `expand`, and `visibleToasts` is small: a stack of nine is a second
 * inbox, and this layer is explicitly not an inbox — the attention system is.
 */
export function CanvasToaster (): JSX.Element {
  return (
    <Toaster
      position="bottom-center"
      richColors
      closeButton
      // Three at once. A fourth simultaneous outcome means something is
      // looping, and burying it under a taller stack would hide that.
      visibleToasts={3}
      gap={8}
      // The app stamps `data-theme` on the root element and sonner would
      // otherwise run its own media query, which disagrees with an explicit
      // light choice inside a dark OS. `system` here means "inherit the CSS",
      // and every colour is a token anyway — so this only governs its class.
      theme="system"
      toastOptions={{ className: 'canvas-toast' }}
      // Sonner's own container class, so the stylesheet has one named hook
      // rather than selecting on the library's internal attributes.
      className="canvas-toaster"
    />
  )
}
