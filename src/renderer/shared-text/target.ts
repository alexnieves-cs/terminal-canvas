/**
 * What a CodeEditor needs to say to share its text — yjs-free, so FileNode and
 * the placeholder layer can name a shared editor without pulling the
 * shared-text chunk (binding.ts, reached only by CodeEditor's `import()`).
 */
export interface SharedTextTarget {
  workspaceId: string
  /** A local file panel's id when `hosted`; a teammate's placeholder's doc key otherwise. */
  panelId: string
  /** This machine runs the panel: it seeds the text from its draft and alone saves it to disk. */
  hosted: boolean
  /** Read at bind time: the owner's draft holds edits made outside the binding, and wins over the doc's text once. */
  preferLocal(): boolean
}
