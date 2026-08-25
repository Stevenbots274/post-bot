import test from "node:test"
import assert from "node:assert/strict"
import { parseScheduleTime } from "../src/services/schedule.js"

test("parses future schedule input as UTC", () => {
  const now = new Date("2026-08-25T10:00:00.000Z")
  assert.equal(parseScheduleTime("2026-08-25 11:30", now), "2026-08-25T11:30:00.000Z")
})

test("rejects invalid and past schedule input", () => {
  const now = new Date("2026-08-25T10:00:00.000Z")
  assert.throws(() => parseScheduleTime("2026-02-31 11:30", now))
  assert.throws(() => parseScheduleTime("2026-08-25 10:00", now))
})
