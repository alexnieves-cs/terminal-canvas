/**
 * Lane Q (M591). `os`, for the preload in a browser tab: the one call it
 * makes is `homedir()`, and the answer is the HOST's home, which the server
 * writes into /host-info.js (loaded before any module). The renderer folds
 * `/home/<user>/x` and `~/x` together with it, so it must be the host's
 * home, not a guess.
 */
interface HostInfo { home: string; platform: string; version: string }

export function hostInfo(): HostInfo {
  const info = (window as unknown as { __TC_HOST__?: HostInfo }).__TC_HOST__
  return info ?? { home: '/', platform: 'linux', version: '' }
}

export function homedir(): string {
  return hostInfo().home
}
