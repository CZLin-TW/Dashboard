/** Synthetic native source protocol: 16 little-endian bits in 192x24 RGB pixels. */
export function decodeNativeFrameId(rgba: Uint8ClampedArray): number | null {
  if (rgba.length !== 192 * 24 * 4) return null;
  let id = 0;
  for (let bit = 0; bit < 16; bit++) {
    const index = (12 * 192 + bit * 12 + 6) * 4;
    const light = (rgba[index] + rgba[index + 1] + rgba[index + 2]) / 3;
    if (light > 80 && light < 175) return null;
    if (light >= 175) id |= 1 << bit;
  }
  return id > 0 ? id : null;
}
export class NativeFrameClock {
  id: number | null = null;
  advances = 0;
  private receivedAt: number | null = null;
  ingest(id: number | null, now: number) {
    if (id !== null && Number.isInteger(id) && id > 0 && id <= 65535 && (this.id === null || id > this.id)) {
      this.id = id; this.advances++; this.receivedAt = now;
    }
  }
  snapshot(now: number) {
    const ageMs = this.receivedAt === null ? null : Math.max(0, now - this.receivedAt);
    return { id: this.id, advances: this.advances, ageMs, fresh: ageMs !== null && ageMs < 1500 };
  }
}
