# Mockups

References for the fresh-context critic. `scripts/shot.cjs` points `rd-*` scenes
at these files. The critic judges whether a capture reads as the reference.
It does not pixel-diff them: these images are 1600×1000 and the shot window
is 1440×865.

Sample copy in the pictures ("Steward", "ledger-export", SW-412, dollar amounts)
belongs in `scripts/fixtures/rd-steward/` only. It is not product copy.
`docs/product-rules.md` ("The critic and the reference") already lists sample
copy as a reference feature the critic must not ask a lane to copy.

## Where these files came from

The original 1440×900 PNGs were not in the workspace. These fourteen were
extracted from `docs/redesign/GUIDE.pdf` (one JPEG per screen, re-encoded to
PNG) and named to match CONCEPT.md's screen table. Page 1 of the PDF is the
same image as screen 04, so `04-main-workspace.png` is that frame.
