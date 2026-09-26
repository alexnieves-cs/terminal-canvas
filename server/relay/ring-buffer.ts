/**
 * The last N bytes of a pty's output, addressed by STREAM OFFSET — the count
 * of bytes the pty has ever written. A client remembers the offset it has
 * received up to; on reattach it asks for `since`, and gets only the gap if
 * the gap is still in the ring. Otherwise it gets the whole ring and resets
 * its terminal, because replaying a tail onto a screen that already holds
 * newer state paints garbage.
 *
 * One preallocated Buffer, written circularly: a chatty agent pushes MBs a
 * minute, and a Buffer.concat per chunk would be the relay's hot allocation.
 */
export class RingBuffer {
  private readonly buf: Buffer
  /** Total bytes ever written; the stream offset one past the newest byte. */
  private total = 0

  constructor(readonly capacity: number) { this.buf = Buffer.alloc(capacity) }

  get end(): number { return this.total }
  /** The oldest offset still held. */
  get start(): number { return Math.max(0, this.total - this.capacity) }

  write(chunk: Uint8Array): void {
    let data = chunk
    // Only the last `capacity` bytes of an oversized chunk can survive anyway.
    if (data.length > this.capacity) {
      this.total += data.length - this.capacity
      data = data.subarray(data.length - this.capacity)
    }
    const at = this.total % this.capacity
    const first = Math.min(data.length, this.capacity - at)
    this.buf.set(data.subarray(0, first), at)
    if (first < data.length) this.buf.set(data.subarray(first), 0)
    this.total += data.length
  }

  /**
   * Bytes from `since` to the end. `reset` is true when `since` was absent or
   * already overwritten — the caller then replays from `offset` (the ring's
   * start, nudged past any UTF-8 continuation bytes a wrap cut through).
   */
  read(since?: number): { offset: number; bytes: Buffer; reset: boolean } {
    const inRange = since !== undefined && since >= this.start && since <= this.total
    let from = inRange ? since : this.start
    if (!inRange && this.total > this.capacity) {
      // A wrap can start mid-character; a lone continuation byte renders as U+FFFD.
      for (let i = 0; i < 3 && from < this.total && (this.byteAt(from) & 0xc0) === 0x80; i++) from++
    }
    return { offset: from, bytes: this.slice(from, this.total), reset: !inRange }
  }

  private byteAt(offset: number): number { return this.buf[offset % this.capacity]! }

  private slice(from: number, to: number): Buffer {
    const n = to - from
    if (n <= 0) return Buffer.alloc(0)
    const a = from % this.capacity
    if (a + n <= this.capacity) return Buffer.from(this.buf.subarray(a, a + n))
    return Buffer.concat([this.buf.subarray(a), this.buf.subarray(0, n - (this.capacity - a))])
  }
}
