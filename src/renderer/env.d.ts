/// <reference types="vite/client" />
import type { CanvasBridge } from '../shared/ipc-contract'

declare global {
  interface Window {
    canvas: CanvasBridge
  }
}

export {}
