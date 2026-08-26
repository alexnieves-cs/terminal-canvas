# M6b: Settings Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app one declarative, searchable home for every user toggle, so M6c's glow and M6d's routing have somewhere to put their switches instead of inventing a fifth ad-hoc precedent.

**Architecture:** A pure schema module (`settings-schema.ts`) declares every setting as data — id, label, description, keywords, type, default, category. One sparse `preferences` map in `layout.json` behind `LayoutStore` stores whatever the user actually changed; everything else resolves to the schema default. The existing three `RestoreSettings` booleans migrate into that map and become the schema's first real customers, and `main/menu.ts`'s hand-built "Restore on launch" submenu is rebuilt from the schema so there is one source of truth. The surface is the existing `Cmd+K` palette — which already has fuzzy search, ranked rows and disabled reasons — rather than a new preferences window.

**Tech Stack:** TypeScript, Electron, React 18 (no StrictMode), esbuild-bundled plain-node verify suites.

**Spec:** `docs/superpowers/specs/2026-08-26-m6-panel-legibility-design.md` (the M6b section)

## Two collisions the spec did not anticipate — resolved here

Read these before Task 1; both would otherwise be discovered mid-task.

1. **`parseSettings` is already taken.** The spec proposes a `parseSettings` function, but `src/shared/layout-schema.ts:374` already has a private `parseSettings` that parses `RestoreSettings`. **The new function is `parsePreferences`**, and the new storage key is `preferences`, not `settings` — the `settings` key already exists in `layout.json` and holds the three restore booleans.
2. **`CommandGroup` is a closed union and its order is asserted.** `palette-model.ts:9` is `'Panel' | 'Preset' | 'Prompt' | 'Canvas'`, and `verify:palette` check 30 asserts the built order is exactly `'Panel,Preset,Prompt,Canvas'`. M6b adds `'Setting'` **last**, and check 30 must be updated to `'Panel,Preset,Prompt,Canvas,Setting'`. Last is deliberate: a settings toggle is a rare errand, and putting it ahead of the panel switcher would push the frequent rows down.

## Global Constraints

Every task's requirements implicitly include these. Each is copied from the spec or from `CLAUDE.md`, and each fails **silently** if broken.

- **ABSENT is not MALFORMED.** No `preferences` key at all is every file written before M6b and must warn **nothing**. A present-but-wrong-typed value must **warn** rather than be silently coerced to the default — a silently-coerced toggle is a preference the user set, that stopped applying, with nothing anywhere saying why. This is the rule `parsePresets` already states in its own comments; copy its shape.
- **`parseLayout` never throws and drops entries individually.** One malformed setting costs that setting, not the file.
- **The store is main's** because `app.on('before-quit')` cannot ask a renderer that `Cmd+R` may already have destroyed. Settings mutations are renderer→main **invokes**, the same direction and for the same reason as M5b's preset mutations.
- **One file, behind `LayoutStore`** — `RestoreSettings` already lives in `layout.json` and `CLAUDE.md` says a future settings surface "should reach for the same mechanism… rather than inventing a second store for a fourth toggle." Do not create a second store.
- **`LayoutStore.settings()` and `setSetting(key: keyof RestoreSettings, value: boolean)` keep their exact current signatures.** Six existing `verify:layout` checks call `setSetting` positionally (lines 332, 350, 352, 354, 388, 423) and `initial()`'s restore logic is written in terms of `RestoreSettings`. They become the *typed view* over the one preferences map — not a second storage.
- **Every new IPC channel needs a main-process handler or `verify:ipc` fails.** It walks `IPC` and asserts every channel has one.
- **Comments explain *why*.** A non-obvious line without a reason attached will be "fixed" by someone later.
- **Commits:** conventional format scoped by milestone — `feat(m6b):`, `fix(m6b):`, `docs(m6b):`.
- **`npm run verify` must be green before any task is called done.**

**Baseline check counts (measured at M6a's merge, `b2c63fd`):** viewport 50 · registry 25 · layout 60 · palette 33 · tmux 27 · package 10 · pty 10 · pty-manager 20 · window 4 · ipc 1 · canvas 6 · xterm 6 · panels 48. New checks continue from those numbers. Note `verify-palette.cjs` prints `"N/N checks passed"` while every other suite prints `"N/N passed"`.

---

### Task 1: The schema module

**Files:**
- Create: `src/shared/settings-schema.ts`
- Modify: `scripts/layout-entry.cjs` (add the module to the bundle)
- Test: `scripts/verify-layout.cjs` (append checks 61–64)

**Interfaces:**
- Consumes: nothing. This module imports nothing at all — that is what keeps it in the plain-node tier.
- Produces: `SettingValue = boolean | string | number`; `SettingDef { id, label, description, keywords, type, default, category }`; `SETTINGS: readonly SettingDef[]`; `settingDef(id: string): SettingDef | undefined`; `resolveSetting(persisted: Record<string, SettingValue>, id: string): SettingValue`. Tasks 2, 3, 5, 6 all consume these.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` summary block:

```js
// 61-64 — M6b. The schema is DATA, and these checks are what stop it drifting
//     from the code that consumes it. 61 pins the three ids main/menu.ts and
//     layout-store.ts both address by name; 62 is the rule that makes a
//     sparse map safe to store; 63 is what makes #11's synonym search
//     possible at all; 64 is the guard against a duplicate id, which would
//     make one row silently shadow another in the palette.
{
  const ids = L.SETTINGS.map((d) => d.id)
  ok('61 the schema declares the three restore settings by their exact ids',
    ids.includes('restore.layout') && ids.includes('restore.camera') &&
    ids.includes('restore.focus'), ids.join(','))
}
{
  // An id with no persisted entry resolves to the schema default. This is what
  // lets the stored map be SPARSE — only what the user actually changed —
  // rather than a full copy rewritten on every save.
  ok('62 an unset setting resolves to its schema default',
    L.resolveSetting({}, 'restore.layout') === true &&
    L.resolveSetting({ 'restore.layout': false }, 'restore.layout') === false)
}
{
  const ids = L.SETTINGS.map((d) => d.id)
  ok('63 setting ids are unique', new Set(ids).size === ids.length)
}
{
  // Every entry needs a non-empty label, description and keyword list. The
  // keywords are not decoration: they are the only reason a user typing
  // "panels" finds a setting labelled "Panel layout".
  const bad = L.SETTINGS.filter((d) =>
    !d.label || !d.description || !Array.isArray(d.keywords) || d.keywords.length === 0)
  ok('64 every setting carries a label, a description and at least one keyword',
    bad.length === 0, bad.map((d) => d.id).join(','))
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:layout`
Expected: FAIL — `L.SETTINGS is undefined`, so `.map` throws. If the suite crashes rather than printing FAIL lines, that is still a valid RED; note the error in your report.

- [ ] **Step 3: Write the schema module**

Create `src/shared/settings-schema.ts`:

```ts
/**
 * Every user-facing toggle in the app, as data.
 *
 * This module imports NOTHING — not electron, not node, not a sibling. That is
 * deliberate and load-bearing: it is what keeps verify:layout in the cheap
 * plain-node tier while covering the schema, and it is what lets main and the
 * renderer both read the same declarations without either owning them.
 *
 * Adding a setting means adding an entry here and nothing else. The palette
 * builds its rows from this list, main/menu.ts builds the Restore submenu from
 * it, and layout-store.ts resolves defaults from it — so a setting that exists
 * here exists everywhere, and one that does not exist here cannot be set.
 */

export type SettingValue = boolean | string | number

export interface SettingDef {
  /** Dotted and stable — it is the persisted key, so renaming one loses the
   *  user's choice with no migration. Prefix by area: `restore.`, `agent.`. */
  id: string
  label: string
  /** One line, shown under the label. Says what the setting DOES, not what it is. */
  description: string
  /**
   * Synonyms the fuzzy matcher should see but the row should not show. The
   * whole argument for a searchable settings surface (ideas-backlog #11) is
   * that a user looking for the theme types "dark" — so a setting findable
   * only by its own label is a setting most users will not find.
   */
  keywords: string[]
  type: 'boolean' | 'enum' | 'number'
  default: SettingValue
  /** Groups rows in the palette and names the menu submenu they came from. */
  category: string
}

/**
 * M6b ships with exactly the three settings that already existed as
 * RestoreSettings. That is not a placeholder: ideas-backlog #11 warns against
 * building this schema before three or four toggles exist, and migrating the
 * three real ones is what stops it being an abstraction with no customers.
 * M6c and M6d add theirs.
 */
export const SETTINGS: readonly SettingDef[] = [
  {
    id: 'restore.layout',
    label: 'Restore panel layout',
    description: 'Reopen the panels you had open when the app last quit.',
    keywords: ['panels', 'layout', 'reopen', 'session', 'startup', 'launch'],
    type: 'boolean',
    default: true,
    category: 'Restore on launch'
  },
  {
    id: 'restore.camera',
    label: 'Restore camera position',
    description: 'Return the canvas to the pan and zoom you left it at.',
    keywords: ['camera', 'zoom', 'pan', 'viewport', 'position', 'startup'],
    type: 'boolean',
    default: true,
    category: 'Restore on launch'
  },
  {
    id: 'restore.focus',
    label: 'Restore selection & focus',
    description: 'Reselect the panel that was selected when the app last quit.',
    keywords: ['focus', 'selection', 'selected', 'highlight', 'startup'],
    type: 'boolean',
    default: true,
    category: 'Restore on launch'
  }
]

export function settingDef(id: string): SettingDef | undefined {
  return SETTINGS.find((d) => d.id === id)
}

/**
 * The stored map is SPARSE — it holds only what the user changed — so every
 * read goes through here. A missing entry is not a missing setting; it is a
 * setting still at its default, which is the overwhelmingly common case and
 * the reason the file does not grow a key per toggle per user.
 */
export function resolveSetting(
  persisted: Record<string, SettingValue>,
  id: string
): SettingValue {
  const def = settingDef(id)
  if (def === undefined) return false
  const value = persisted[id]
  return value === undefined ? def.default : value
}
```

- [ ] **Step 4: Add it to the plain-node bundle**

In `scripts/layout-entry.cjs`, add to the exported spread, after the `layout-schema` line:

```js
  /* M6b: the settings schema is pure data with no imports at all, so it costs
     this tier nothing and gets covered by the suite that already owns the
     on-disk format it is stored in. */
  ...require('../src/shared/settings-schema'),
```

- [ ] **Step 5: Run the checks and watch them pass**

Run: `npm run verify:layout`
Expected: PASS — 64/64.

- [ ] **Step 6: Commit**

```bash
git add src/shared/settings-schema.ts scripts/layout-entry.cjs scripts/verify-layout.cjs
git commit -m "feat(m6b): every toggle in the app, declared once as data"
```

---

### Task 2: `parsePreferences`, and the migration that keeps existing files restoring

**Files:**
- Modify: `src/shared/layout-schema.ts` — add `preferences` to `LayoutSnapshot`, add `parsePreferences`, wire it into `parseLayout`
- Test: `scripts/verify-layout.cjs` (append checks 65–69)

**Interfaces:**
- Consumes: `SettingValue`, `settingDef` from Task 1
- Produces: `parsePreferences(raw: unknown, warnings: string[]): Record<string, SettingValue>`, and `LayoutSnapshot.preferences: Record<string, SettingValue>`. Task 3 reads both.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`:

```js
// 65-69 — M6b. The same ABSENT-vs-MALFORMED line parsePresets draws, and for
//     the same reason: a file with no preferences key is every file written
//     before M6b and is perfectly fine, while a present-but-wrong one is
//     corruption whose silent version is a preference the user set that
//     quietly stopped applying.
{
  const w = []
  ok('65 no preferences key at all is silent',
    Object.keys(L.parsePreferences(undefined, w)).length === 0 && w.length === 0,
    w.join('|'))
}
{
  const w = []
  L.parsePreferences([], w)
  ok('66 a preferences field that is not an object warns rather than vanishing',
    w.length === 1, w.join('|'))
}
{
  const w = []
  const out = L.parsePreferences({ 'restore.layout': false, 'nope.gone': true }, w)
  ok('67 an unknown setting id is dropped with a warning, and the rest survive',
    out['restore.layout'] === false && !('nope.gone' in out) && w.length === 1,
    JSON.stringify(out) + ' | ' + w.join('|'))
}
{
  const w = []
  const out = L.parsePreferences({ 'restore.layout': 'yes', 'restore.camera': false }, w)
  ok('68 a value of the wrong type is dropped with a warning, not coerced',
    !('restore.layout' in out) && out['restore.camera'] === false && w.length === 1,
    JSON.stringify(out) + ' | ' + w.join('|'))
}
{
  // The migration. A pre-M6b file has `settings` and no `preferences`, and its
  // three booleans must survive verbatim — an upgrade that silently reset a
  // user's restore preferences to the defaults would look exactly like the app
  // ignoring them.
  const snap = L.parseLayout(file({ settings: { layout: false, camera: true, focus: false } })).snapshot
  ok('69 a pre-M6b file migrates its restore settings into preferences',
    snap.preferences['restore.layout'] === false &&
    snap.preferences['restore.camera'] === true &&
    snap.preferences['restore.focus'] === false,
    JSON.stringify(snap.preferences))
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:layout`
Expected: FAIL on 65–69 — `L.parsePreferences` is not a function.

- [ ] **Step 3: Add `preferences` to the snapshot type**

In `src/shared/layout-schema.ts`, in the `LayoutSnapshot` interface, after `settings`:

```ts
  /**
   * Every setting the user has actually CHANGED, keyed by SettingDef.id.
   * Sparse on purpose: an absent id means "still at the schema default", which
   * is what stops this map growing an entry per toggle per user and what lets
   * a default be changed later without rewriting anyone's file.
   */
  preferences: Record<string, SettingValue>
```

Import `SettingValue` and `settingDef` from `./settings-schema` at the top of the file.

- [ ] **Step 4: Write `parsePreferences`**

Add to `src/shared/layout-schema.ts`, beside `parsePresets`:

```ts
/**
 * The same ABSENT-vs-MALFORMED line parsePresets draws.
 *
 * A dropped entry costs that setting and nothing else — the same
 * drop-individually rule the rest of this file obeys — and every drop warns,
 * because the silent version of this function is a preference the user
 * deliberately set that quietly stopped applying, with nothing anywhere
 * saying why.
 */
export function parsePreferences(
  raw: unknown,
  warnings: string[]
): Record<string, SettingValue> {
  // Every file written before M6b has no preferences key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same reason parsePresets returns [] silently here.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    warnings.push('replaced a preferences field that was not an object')
    return {}
  }
  const out: Record<string, SettingValue> = {}
  for (const [id, value] of Object.entries(raw)) {
    const def = settingDef(id)
    if (def === undefined) {
      // A setting this build does not know about. Dropping it is right —
      // carrying it forward would let a typo persist forever — but it MUST
      // warn, because this is also what a renamed id looks like.
      warnings.push(`dropped an unknown setting: ${id}`)
      continue
    }
    if (typeof value !== def.type) {
      warnings.push(`dropped setting ${id}: expected ${def.type}, got ${typeof value}`)
      continue
    }
    out[id] = value as SettingValue
  }
  return out
}
```

- [ ] **Step 5: Wire it into `parseLayout`, with the migration**

In `parseLayout`, where the snapshot is assembled, add:

```ts
  const preferences = parsePreferences(raw.preferences, warnings)
  // MIGRATION. A file written before M6b has `settings` and no `preferences`,
  // and its three booleans are the schema's first three entries. Seeding them
  // here — rather than leaving them to the defaults — is what stops an upgrade
  // silently resetting a user's restore preferences, which would be
  // indistinguishable from the app ignoring them. Only ids the preferences map
  // does not already carry are seeded, so once written the new key wins.
  const legacy = parseSettings(raw.settings)
  for (const [key, id] of [
    ['layout', 'restore.layout'],
    ['camera', 'restore.camera'],
    ['focus', 'restore.focus']
  ] as const) {
    if (!(id in preferences)) preferences[id] = legacy[key]
  }
```

and include `preferences` in the returned snapshot.

> `parseSettings` is the file's existing private `RestoreSettings` parser (around line 374) — call it, do not reimplement it. It already applies its own defaults for a missing or junk `settings` key, which is exactly the fallback this migration wants.

- [ ] **Step 6: Run the checks and watch them pass**

Run: `npm run verify:layout`
Expected: PASS — 69/69. If any pre-existing check now fails, the snapshot assembly lost a field; fix that rather than adjusting the check.

- [ ] **Step 7: Commit**

```bash
git add src/shared/layout-schema.ts scripts/verify-layout.cjs
git commit -m "feat(m6b): read preferences, and carry the old settings forward"
```

---

### Task 3: `LayoutStore` owns the preferences map

**Files:**
- Modify: `src/main/layout-store.ts` — new accessors, the derived `settings()` view, and the write path
- Test: `scripts/verify-layout.cjs` (append checks 70–73)

**Interfaces:**
- Consumes: `parsePreferences`, `LayoutSnapshot.preferences` (Task 2); `SettingValue`, `resolveSetting`, `SETTINGS` (Task 1)
- Produces: `LayoutStore.preferences(): Record<string, SettingValue>`, `getSetting(id: string): SettingValue`, `setPreference(id: string, value: SettingValue): void`. Tasks 4 and 5 consume these.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`:

```js
// 70-73 — M6b. The store is the one place a setting is read or written, and
//     73 is the check that matters most: settings() and setSetting() are now a
//     typed VIEW over the preferences map rather than a second storage, so a
//     write through either API must be visible through the other. Two
//     storages that agree on the day they are written and drift later is the
//     exact failure this milestone exists to prevent.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  ok('70 an untouched store reports the schema defaults',
    store.getSetting('restore.layout') === true &&
    Object.keys(store.preferences()).length === 0,
    JSON.stringify(store.preferences()))
}
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.setPreference('restore.camera', false)
  store.save(CANVAS)
  store.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  ok('71 a preference survives a write and a reopen',
    reopened.getSetting('restore.camera') === false &&
    reopened.getSetting('restore.layout') === true)
}
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setPreference('nope.gone', true)
  ok('72 setting an id the schema does not declare is refused',
    !('nope.gone' in store.preferences()))
}
{
  // The view, both directions. This is the check that makes "one map, two
  // accessor shapes" a fact rather than a claim.
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setSetting('focus', false)
  const viaId = store.getSetting('restore.focus')
  store.setPreference('restore.layout', false)
  const viaTyped = store.settings().layout
  ok('73 settings() and setSetting() are a view over the same map, not a second store',
    viaId === false && viaTyped === false, `viaId=${viaId} viaTyped=${viaTyped}`)
}
```

`tmp()`, `CANVAS` and `L.createLayoutStore({ filePath })` are the file's own
existing helpers — check 22 (around line 328) uses exactly this shape, including
the `save(CANVAS)` before `flushSync()`. Copy it; do not invent a constructor.

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:layout`
Expected: FAIL on 70–73 — `store.getSetting is not a function`.

- [ ] **Step 3: Widen the `LayoutStore` interface**

In `src/main/layout-store.ts`, on the `LayoutStore` interface, beside `settings()`:

```ts
  /**
   * Everything the user has changed, keyed by SettingDef.id. Copied out, like
   * settings() and presets(), so a caller cannot mutate the snapshot the store
   * is about to serialise and have the write silently disagree with it.
   */
  preferences(): Record<string, SettingValue>
  /** Resolved: the persisted value if there is one, else the schema default. */
  getSetting(id: string): SettingValue
  setPreference(id: string, value: SettingValue): void
```

Leave `settings()` and `setSetting()` declared exactly as they are.

- [ ] **Step 4: Implement them, and make the typed view derive**

In the returned object in `createLayoutStore`:

```ts
    preferences: () => ({ ...snapshot.preferences }),

    getSetting: (id) => resolveSetting(snapshot.preferences, id),

    setPreference(id, value) {
      const def = settingDef(id)
      // An id the schema does not declare cannot be stored. parsePreferences
      // would drop it on the next load anyway, so accepting it here would mean
      // a setting that appears to take and is gone after a relaunch.
      if (def === undefined) return
      if (typeof value !== def.type) return
      snapshot.preferences[id] = value
      scheduleWrite()
    },
```

and rewrite the two existing restore members as the typed view:

```ts
    // The typed view of the three `restore.*` schema entries. It stays because
    // initial()'s restore logic is written in terms of RestoreSettings and
    // rewriting that buys nothing — but it is a VIEW, not a second storage:
    // both members go through the same preferences map, so a write through
    // either API is visible through the other (verify:layout 73).
    settings: () => ({
      layout: resolveSetting(snapshot.preferences, 'restore.layout') as boolean,
      camera: resolveSetting(snapshot.preferences, 'restore.camera') as boolean,
      focus: resolveSetting(snapshot.preferences, 'restore.focus') as boolean
    }),

    setSetting(key, value) {
      snapshot.preferences[`restore.${key}`] = value
      scheduleWrite()
    },
```

- [ ] **Step 5: Write `preferences` to disk, and stop writing `settings`**

Find where the snapshot is serialised and include `preferences`. **Remove `settings` from what is written** — it is now a derived view, and writing both would be the two-storages-that-drift failure check 73 exists to catch. `parseLayout` still *reads* `settings` for the migration, so an existing file upgrades on its first load and is written forward without it.

Add a comment at the serialisation site:

```ts
      // `settings` is deliberately NOT written any more: it is a derived view
      // of three preferences entries, and writing both would create exactly
      // the second storage this milestone removed. parseLayout still reads it,
      // so a pre-M6b file migrates on first load — but once this app has
      // written the file, `preferences` is the only record.
```

- [ ] **Step 6: Run the checks and watch them pass**

Run: `npm run verify:layout`
Expected: PASS — 73/73. The six pre-existing `setSetting` checks (around lines 332, 350, 352, 354, 388, 423) must still pass **unchanged** — they are the proof the view works. If you had to edit one, stop and report it: that means the view is not equivalent.

- [ ] **Step 7: Commit**

```bash
git add src/main/layout-store.ts scripts/verify-layout.cjs
git commit -m "feat(m6b): one map behind the store, and a typed view over it"
```

---

### Task 4: The two channels

**Files:**
- Modify: `src/shared/ipc-contract.ts` — `SETTINGS_LIST`, `SETTINGS_SET`, and the bridge type
- Modify: `src/preload/index.ts` — expose them on `window.canvas.settings`
- Modify: `src/main/ipc.ts` — register both handlers
- Test: `scripts/verify-ipc-surface.cjs` (no new check needed — see Step 1)

**Interfaces:**
- Consumes: `LayoutStore.preferences/getSetting/setPreference` (Task 3), `SETTINGS` (Task 1)
- Produces: `SettingRow { id, label, description, keywords, type, value, category }` exported from `ipc-contract.ts`; `window.canvas.settings.list(): Promise<SettingRow[]>` and `.set(id: string, value: SettingValue): Promise<void>`. Tasks 6 and 7 consume both.

- [ ] **Step 1: Run the existing IPC check and watch it fail after you add the channels**

`verify:ipc` has exactly one check and it walks every channel in `IPC` asserting a main-process handler exists. It needs no new assertion — **it becomes the failing test the moment you add a channel without a handler.** So the RED step here is: add the two channel constants (Step 2) and run it.

Run: `npm run verify:ipc`
Expected after Step 2, before Step 4: FAIL, naming `settings:list` and `settings:set` as channels with no handler.

- [ ] **Step 2: Declare the channels and the row type**

In `src/shared/ipc-contract.ts`, in the `IPC` object after the prompt channels:

```ts
  /**
   * The settings surface. Renderer -> main and invokes, not events, for the
   * same reason M5b's preset mutations are: main owns the store, because the
   * before-quit flush cannot ask a renderer that Cmd+R may already have
   * destroyed. The list carries the schema AND the resolved value together, so
   * the renderer never needs its own copy of the defaults.
   */
  SETTINGS_LIST: 'settings:list',
  SETTINGS_SET: 'settings:set',
```

and beside the other row types in the same file:

```ts
/** A setting as the palette needs it: its declaration plus its current value. */
export interface SettingRow {
  id: string
  label: string
  description: string
  keywords: string[]
  type: 'boolean' | 'enum' | 'number'
  value: SettingValue
  category: string
}
```

Add to the `CanvasBridge` interface:

```ts
  settings: {
    list(): Promise<SettingRow[]>
    set(id: string, value: SettingValue): Promise<void>
  }
```

- [ ] **Step 3: Expose them in the preload**

In `src/preload/index.ts`, beside the `preset` and `prompt` blocks:

```ts
  settings: {
    list: () => ipcRenderer.invoke(IPC.SETTINGS_LIST),
    set: (id: string, value: SettingValue) => ipcRenderer.invoke(IPC.SETTINGS_SET, id, value)
  },
```

- [ ] **Step 4: Register the handlers**

In `src/main/ipc.ts`, beside the prompt handlers:

```ts
  ipcMain.handle(IPC.SETTINGS_LIST, () =>
    SETTINGS.map((def) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      keywords: [...def.keywords],
      type: def.type,
      value: layoutStore.getSetting(def.id),
      category: def.category
    }))
  )
  ipcMain.handle(IPC.SETTINGS_SET, (_event, id: string, value: SettingValue) => {
    layoutStore.setPreference(id, value)
    // The Restore submenu renders checkbox state from the same schema, so a
    // toggle made in the palette has to redraw it or the two surfaces disagree
    // until the next unrelated rebuild.
    rebuildMenu()
  })
```

> `layoutStore` and `rebuildMenu` must be reached the same way the surrounding handlers reach their collaborators — read how `PROMPT_SAVE` and `CANVAS_REQUEST_RESET` get theirs (`palette.*`) and follow that wiring rather than importing anything new. If `rebuildMenu` is not reachable from `ipc.ts`, thread it in as a dependency the way the other callbacks are; do not export a module-level function from `index.ts`.

- [ ] **Step 5: Run the check and watch it pass**

Run: `npm run verify:ipc`
Expected: PASS — 1/1, now covering 19 channels.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc.ts
git commit -m "feat(m6b): two channels, pointed the way the store already faces"
```

---

### Task 5: The Restore submenu is built from the schema

**Files:**
- Modify: `src/main/menu.ts` — `AppMenuOptions`, and the hand-built submenu
- Modify: `src/main/index.ts:116-120` — `rebuildMenu`'s options
- Test: `scripts/verify-layout.cjs` (append check 74)

**Interfaces:**
- Consumes: `SETTINGS`, `SettingDef` (Task 1); `LayoutStore.getSetting`, `setPreference` (Task 3)
- Produces: `settingsInCategory(category: string): SettingDef[]` exported from `settings-schema.ts`. Nothing later consumes it; it exists so the menu and the check agree on one query.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-layout.cjs`:

```js
// 74 — M6b. The Restore submenu is now DERIVED from this query rather than
//     hand-listed in menu.ts, which is the whole point: two lists of the same
//     three settings drift, and the drift shows up as a menu that silently
//     stops offering something the palette still offers.
{
  const restore = L.settingsInCategory('Restore on launch')
  ok('74 the Restore submenu query returns exactly the three restore settings',
    restore.length === 3 && restore.every((d) => d.id.startsWith('restore.')),
    restore.map((d) => d.id).join(','))
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:layout`
Expected: FAIL — `L.settingsInCategory is not a function`.

- [ ] **Step 3: Add the query**

In `src/shared/settings-schema.ts`:

```ts
/** Declaration order within a category is menu and palette order. */
export function settingsInCategory(category: string): SettingDef[] {
  return SETTINGS.filter((d) => d.category === category)
}
```

- [ ] **Step 4: Rebuild the submenu from it**

In `src/main/menu.ts`, replace the `RestoreSettings` import with `settingsInCategory` and `SettingValue` from `../shared/settings-schema`, change the options:

```ts
export interface AppMenuOptions {
  /** Resolved current values, keyed by SettingDef.id. */
  settingValue(id: string): SettingValue
  onToggleSetting(id: string, value: boolean): void
  onReset(): void
  presets: PresetAvailability[]
  onSpawnPreset(id: string): void
  onSavePreset(): void
}
```

and the submenu:

```ts
        {
          label: 'Restore on launch',
          // Built from the schema, not a hand-written list. A second list of
          // the same settings is a list that drifts, and the symptom is a menu
          // that silently stops offering something the palette still offers.
          submenu: settingsInCategory('Restore on launch').map((def) => ({
            label: def.label,
            type: 'checkbox' as const,
            checked: options.settingValue(def.id) === true,
            // Nothing in the running session changes: these affect boot only,
            // which is exactly why they need no IPC event of their own.
            click: (item) => options.onToggleSetting(def.id, item.checked)
          }))
        },
```

- [ ] **Step 5: Update the call site**

In `src/main/index.ts`'s `rebuildMenu` (around line 116-120), replace `settings:` and `onToggle:` with:

```ts
    settingValue: (id) => layoutStore.getSetting(id),
    onToggleSetting: (id, value) => layoutStore.setPreference(id, value),
```

- [ ] **Step 6: Run the checks and typecheck**

Run: `npm run verify:layout && npm run typecheck`
Expected: PASS — 74/74, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/shared/settings-schema.ts src/main/menu.ts src/main/index.ts scripts/verify-layout.cjs
git commit -m "feat(m6b): the Restore submenu stops keeping its own list"
```

---

### Task 6: Settings rows in the palette

**Files:**
- Modify: `src/renderer/palette/palette-model.ts` — `CommandGroup`, `Command.searchText`, `haystack`
- Modify: `src/renderer/palette/commands.ts` — `PaletteContext.settings`, `PaletteActions.toggleSetting`, the rows
- Test: `scripts/verify-palette.cjs` (append checks 34–37, **and update check 30**)

**Interfaces:**
- Consumes: `SettingRow` from `ipc-contract.ts` (Task 4)
- Produces: `PaletteActions.toggleSetting(id: string, value: SettingValue): void`; rows with id `setting.<id>`. Task 7 implements the action.

- [ ] **Step 1: Write the failing checks and update check 30**

First, **update check 30** in `scripts/verify-palette.cjs` — it asserts group order and M6b adds a group:

```js
  ok('30 groups are built in a fixed order',
    order.join(',') === 'Panel,Preset,Prompt,Canvas,Setting', order.join(','))
```

Then append:

```js
// 34-37 — M6b. 35 is the check that justifies the whole searchText field:
//     ideas-backlog #11's argument for a searchable settings surface is that a
//     user looking for the theme types "dark", so a setting findable only by
//     its own label is a setting most users will never find.
const SETTING = {
  id: 'restore.camera', label: 'Restore camera position',
  description: 'Return the canvas to the pan and zoom you left it at.',
  keywords: ['zoom', 'viewport'], type: 'boolean', value: true,
  category: 'Restore on launch'
}
{
  const row = byId(P.buildCommands(ctx({ settings: [SETTING] })), 'setting.restore.camera')
  ok('34 a setting becomes a runnable row showing its label and description',
    row !== undefined && row.disabledReason === undefined &&
    row.title.includes('Restore camera position') &&
    row.subtitle.includes('Return the canvas'))
}
{
  const rows = P.filterCommands(P.buildCommands(ctx({ settings: [SETTING] })), 'zoom')
  ok('35 a setting is findable by a KEYWORD that appears nowhere in the row',
    rows.some((r) => r.id === 'setting.restore.camera'),
    rows.map((r) => r.id).join(','))
}
{
  const c = ctx({ settings: [SETTING] })
  byId(P.buildCommands(c), 'setting.restore.camera').run()
  ok('36 running a boolean setting row toggles it to the opposite value',
    c.actions.calls[0][0] === 'toggleSetting' &&
    c.actions.calls[0][1] === 'restore.camera' &&
    c.actions.calls[0][2] === false)
}
{
  const off = { ...SETTING, value: false }
  const row = byId(P.buildCommands(ctx({ settings: [off] })), 'setting.restore.camera')
  ok('37 the row says which way the toggle currently sits',
    row.title.includes('Off') || row.title.includes('off'), row.title)
}
```

Add `settings: []` to `ctx`'s defaults and `toggleSetting: record('toggleSetting')` to `spyActions()`, or `row.run()` throws.

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run verify:palette`
Expected: FAIL on 30 and 34–37.

- [ ] **Step 3: Widen the model**

In `src/renderer/palette/palette-model.ts`:

```ts
export type CommandGroup = 'Panel' | 'Preset' | 'Prompt' | 'Canvas' | 'Setting'
```

on `Command`:

```ts
  /**
   * Extra text the fuzzy matcher should see but the row should NOT show.
   * Settings carry synonyms here — a user looking for the theme types "dark" —
   * and a setting findable only by its own label is one most users never find.
   */
  searchText?: string
```

and widen the haystack:

```ts
const haystack = (c: Command): string =>
  [c.title, c.subtitle, c.searchText].filter(Boolean).join(' ')
```

- [ ] **Step 4: Build the rows**

In `src/renderer/palette/commands.ts`, add to `PaletteContext`:

```ts
  settings: SettingRow[]
```

to `PaletteActions`:

```ts
  toggleSetting(id: string, value: SettingValue): void
```

and, **after the Canvas group** so construction order puts Setting last:

```ts
  for (const setting of ctx.settings) {
    // Only booleans get a row in M6b, because only booleans exist. An enum or
    // number needs an input mode rather than a toggle, and building that
    // before a setting needs it would be an abstraction with no customer —
    // the same trap ideas-backlog #11 warns about for the schema itself.
    if (setting.type !== 'boolean') continue
    const on = setting.value === true
    out.push({
      id: `setting.${setting.id}`,
      title: `${setting.label}: ${on ? 'On' : 'Off'}`,
      subtitle: setting.description,
      // The synonyms, where the matcher can see them and the row cannot show
      // them. Without this the row is findable only by its own label.
      searchText: setting.keywords.join(' '),
      group: 'Setting',
      run: () => actions.toggleSetting(setting.id, !on)
    })
  }
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npm run verify:palette`
Expected: PASS — 37/37.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/palette/palette-model.ts src/renderer/palette/commands.ts scripts/verify-palette.cjs
git commit -m "feat(m6b): settings rows, findable by a word they do not show"
```

---

### Task 7: Wiring it up in the canvas

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` — load the rows, implement `toggleSetting`, pass them down
- Modify: `src/renderer/palette/Palette.tsx` — accept and forward the `settings` prop
- Test: `scripts/verify-panels.cjs` (append checks 49–50)

**Interfaces:**
- Consumes: `window.canvas.settings.list/set` (Task 4); `PaletteActions.toggleSetting` (Task 6)
- Produces: nothing later consumes.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, before the summary block:

```js
// 49-50 — M6b. The end-to-end proof that a palette toggle reaches main's store
//     and comes back changed. 50 is the half that matters: a toggle that
//     updates the row but never reaches the store looks identical on screen
//     until the next relaunch, when the setting is silently back.
{
  const openPalette = async () => {
    await wc.executeJavaScript(
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
    await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
  }
  const closePalette = async () => {
    await wc.executeJavaScript(`
      document.querySelector('.palette__input')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      true
    `)
    await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
  }

  await openPalette()
  // Type a KEYWORD, not the label — this is check 35's property proven through
  // the real palette rather than against buildCommands in isolation.
  const found = await wc.executeJavaScript(`(async () => {
    const nativeSet = (input, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    nativeSet(document.querySelector('.palette__input'), 'viewport')
    await new Promise((r) => setTimeout(r, 100))
    const row = [...document.querySelectorAll('.palette__row')]
      .find((r) => r.textContent.includes('Restore camera position'))
    if (!row) return 'not found'
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    return 'ok'
  })()`)
  ok('49 a setting is reachable in the palette by a keyword it does not display',
    found === 'ok', String(found))

  const stored = await waitUntil(async () => {
    const v = await wc.executeJavaScript(
      `window.canvas.settings.list().then((s) => s.find((x) => x.id === 'restore.camera').value)`)
    return v === false ? 'off' : false
  }, 3000)
  ok('50 the toggle reached main\\'s store, not just the row', stored === 'off')

  await closePalette()
}
```

> The suite's `panels-entry.cjs` hand-wires main-process handlers because it is its own Electron entry point. If `settings:list` has no handler there, check 49 fails on a missing bridge rather than on the feature — add the two settings handlers to `scripts/panels-entry.cjs` the same way it already wires `registerIpcHandlers`, and say in your report what you had to add.

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL on 49 — no settings row exists yet.

- [ ] **Step 3: Load the rows**

In `src/renderer/canvas/Canvas.tsx`, beside `presetRows`/`reloadPresets`:

```ts
  const [settingRows, setSettingRows] = useState<SettingRow[]>(EMPTY_SETTINGS)
  const reloadSettings = useCallback(() => {
    void window.canvas.settings.list().then(setSettingRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadSettings()
  }, [palette.open, reloadSettings])
```

Declare `const EMPTY_SETTINGS: SettingRow[] = []` at module scope beside the other empty constants — a fresh `[]` in the `useState` initialiser is fine, but the existing file uses a module-level constant for these and consistency matters more than the micro-difference.

- [ ] **Step 4: Implement the action**

In the `paletteActions` object:

```ts
    toggleSetting: (id, value) => {
      // Main owns the store, so the write goes there and the row list is
      // reloaded from the answer rather than updated optimistically: an
      // optimistic row that main refused (an unknown id, a wrong type) would
      // show the new value until the next reload and then flip back.
      void window.canvas.settings.set(id, value).then(reloadSettings)
    },
```

Add `settingRows` and `reloadSettings` to the `paletteActions` `useMemo` dependency array.

- [ ] **Step 5: Pass them down**

Pass `settings={settingRows}` to `<Palette/>`, and in `src/renderer/palette/Palette.tsx` add `settings: SettingRow[]` to `PaletteProps`, forward it into the `buildCommands({...})` call, and add `props.settings` to that `useMemo`'s dependency array.

- [ ] **Step 6: Run them and watch them pass**

Run: `npm run build && npm run verify:panels`
Expected: PASS — 50/50.

- [ ] **Step 7: Confirm the menu and the palette agree**

Run: `npm run dev`. Open `Cmd+K`, type `viewport`, toggle "Restore camera position" off. Then open the app menu → Restore on launch. The checkbox must already be unchecked — that is `rebuildMenu()` in the `SETTINGS_SET` handler doing its job. If it is still checked, the two surfaces have drifted and Task 4's Step 4 is incomplete.

If you cannot run the app interactively, say so plainly in your report rather than claiming it.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx src/renderer/palette/Palette.tsx scripts/verify-panels.cjs scripts/panels-entry.cjs
git commit -m "feat(m6b): a toggle in the palette reaches the store that owns it"
```

---

### Task 8: Documentation catches up

**Files:**
- Modify: `README.md` — the milestone table
- Modify: `CLAUDE.md` — the architecture diagram, the verify table, and two load-bearing details

- [ ] **Step 1: Add M6b to the milestone table**

In `README.md`, after the M6a row:

```markdown
| M6b | Settings: a declarative schema, searchable in the palette | ✅ done |
```

- [ ] **Step 2: Add the two channels to the architecture diagram**

In `CLAUDE.md`'s IPC diagram, beside the prompt line:

```
renderer --invoke--> settings:list / settings:set                              --> main
```

- [ ] **Step 3: Re-derive the suite counts**

Run each and read the number it prints — do not compute it:

```bash
npm run verify:layout | tail -3
npm run verify:palette | tail -3
npm run verify:ipc | tail -3
npm run verify:panels | tail -3
```

Remember `verify-palette.cjs` prints `"N/N checks passed"`, not `"N/N passed"`. Update the counts and extend the suite descriptions to say what the new checks guard.

- [ ] **Step 4: Add the load-bearing details**

In `CLAUDE.md`'s "Load-bearing details":

```markdown
**One map, and a typed view over it (`shared/settings-schema.ts`,
`main/layout-store.ts`).** Settings live in ONE sparse `preferences` map in
`layout.json`, keyed by `SettingDef.id`. `LayoutStore.settings()` and
`setSetting()` survive with their old `RestoreSettings` signatures — six
`verify:layout` checks and all of `initial()`'s restore logic are written in
terms of them — but they are a **view**, not a second storage: both go through
the same map, which is what `verify:layout` 73 asserts by writing through one
API and reading through the other. Two storages that agree the day they are
written and drift later is the failure this arrangement removes. `settings` is
still READ by `parseLayout` (a pre-M6b file migrates on first load) and is no
longer WRITTEN.

**Sparse, and that is what lets a default change later.** An id absent from
`preferences` means "still at the schema default", not "unset". A full map
written on every save would freeze every default at whatever it was the first
time a user launched the app, so changing one later would reach nobody.
`resolveSetting` is the only way to read a value, and `parsePreferences` drops
an unknown id or a wrong-typed value with a WARNING rather than coercing it —
a silently-coerced toggle is a preference the user set that stopped applying,
with nothing anywhere saying why (`verify:layout` 67-68).

**The Restore submenu is derived, not listed (`main/menu.ts`).** It maps over
`settingsInCategory('Restore on launch')`. The hand-written list it replaced
was a second copy of the same three settings, and the drift it invited shows up
as a menu that silently stops offering something the palette still offers.
`SETTINGS_SET`'s handler calls `rebuildMenu()` for the same reason: a toggle
made in the palette must redraw the checkbox, or the two surfaces disagree
until the next unrelated rebuild.
```

- [ ] **Step 5: Run the whole suite**

Run: `npm run verify`
Expected: green. This is the gate.

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(m6b): CLAUDE.md catches up to M6b landing"
```

---

## What M6b deliberately leaves undone

- **Only boolean settings render.** `SettingDef.type` allows `'enum'` and `'number'` because M6c's idleness threshold will need one, but no row builds for them — an enum needs an input mode rather than a toggle, and building that before a setting needs it is the abstraction-with-no-customer trap #11 warns about.
- **No preferences window.** The surface is the palette. A pane can be built later against the same schema without moving any state.
- **No "reset to defaults".** Cheap to add against a sparse map (delete the key), but nothing asks for it yet.
- **Categories group nothing in the palette.** `SettingDef.category` drives the menu submenu and is carried on the row, but palette rows are flat under one `Setting` group. Grouping them is a rendering change with no new state.
