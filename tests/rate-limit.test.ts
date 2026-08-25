import test from "node:test"
import assert from "node:assert/strict"
import { RateLimiter } from "../src/services/rate-limit.js"

test("rate limiter resets after its window", () => {
  const limiter = new RateLimiter(2, 1000)
  assert.equal(limiter.allow("user", 0), true)
  assert.equal(limiter.allow("user", 1), true)
  assert.equal(limiter.allow("user", 2), false)
  assert.equal(limiter.allow("user", 1000), true)
})
