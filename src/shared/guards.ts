/**
 * M616. The plain-object guard every parser here starts from, in ONE place.
 * Before it there were 27 copies, one per parser, all saying the same thing:
 * an object that is not null and not an array. A parser that needs a looser
 * or stricter shape names its own guard; this one is only the common case.
 * Dependency-free on purpose: the renderer, main, the host, the CLI and the
 * relay server all import it.
 */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
