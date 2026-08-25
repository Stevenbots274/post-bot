interface Bucket {
  startedAt: number
  count: number
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    const existing = this.buckets.get(key)
    if (!existing || now - existing.startedAt >= this.windowMs) {
      this.buckets.set(key, { startedAt: now, count: 1 })
      return true
    }
    if (existing.count >= this.limit) return false
    existing.count += 1
    return true
  }
}
