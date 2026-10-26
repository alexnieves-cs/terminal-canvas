# README media

What is in this folder, where it came from, and how to add a real screen recording.

## What is here

| File | What it is |
|---|---|
| `logo.png` | `build/icon.png` at 256 px. |
| `screens/*.png` | Seven of the fourteen design mockups in [`docs/redesign/mockups/`](../redesign/mockups/), palette-reduced to keep the repo small. Names and numbers in them (Steward, ledger-export, `$3.12`) are sample data. |
| `night-film.gif` | M564. The app's own night film (`src/shared/night-film.ts`, drawn and encoded by `src/renderer/film/`) run on the sample night in `src/shared/night-film-sample.ts`, at 720 px and 8 fps. Regenerate it with `node_modules/.bin/electron scripts/film-sample.cjs` (ffmpeg on PATH). It replaced `tour.gif`, a slideshow of the mockups below. |
| `social-preview.png` | 1280×640 card for the repository's social preview (Settings → General → Social preview). |

The README says the pictures are mockups. When real captures replace them, change that sentence too.

## Recording a real demo (needs a Mac)

Agents need a real repository and real CLIs, so this is a hand step. A 60 to 90 second take that
shows the product's own story works best:

1. **Start.** Empty canvas, `Cmd+Option+N` (New task), type a sentence and pick a repository.
2. **Fan out.** Add a second agent (`Cmd+N` or the palette), drag from a port to spawn a connected
   test watcher, and let two agents work.
3. **Attention.** Wait for a permission prompt. Show the panel edge, the dock count and `Cmd+J` flying to it.
4. **Review.** Open the review layer on one agent, show the diff since it started, commit.
5. **Zoom out.** Pinch to the Plan tier, then Map, then back; optionally toggle the World lens.

Use a throwaway repo and an empty home-directory prompt so no secrets or private paths are on screen.
The canvas PNG export has no secret scrubber (see `docs/load-bearing.md`), and a recording has none either.

### Capture and convert

```sh
# Record with Shift+Cmd+5 (saves a .mov), then:
ffmpeg -i demo.mov -vf "scale=1280:-2,fps=30" -c:v libx264 -crf 24 -pix_fmt yuv420p -an demo.mp4

# Optional GIF for the top of the README (keep it under ~8 MB):
ffmpeg -i demo.mov -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" demo.gif
```

### Add it to the README

- **Video:** edit the README on github.com, drag the `.mp4` into the editor (it uploads and gives a
  `user-attachments` URL), and put that URL on a line of its own where the `VIDEO SLOT` comment is.
  GitHub plays it inline. Files over 10 MB need a paid plan; trim the take if it is refused.
- **GIF:** save it here as `demo.gif` and add `<img src="docs/assets/demo.gif">` in the same spot.

### Real still screenshots

`npm run shot` on a Mac writes a PNG per scene into `out/shots/`. Look at them first (the repo's rule
for goldens applies), then copy the ones you want into `screens/` and update the captions.
