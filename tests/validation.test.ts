import test from "node:test"
import assert from "node:assert/strict"
import { isDangerousUrl, validateHttpsUrl } from "../src/services/validation.js"

test("accepts HTTPS URLs and rejects dangerous schemes", () => {
  assert.equal(validateHttpsUrl("https://example.com/path"), "https://example.com/path")
  assert.throws(() => validateHttpsUrl("javascript:alert(1)"))
  assert.throws(() => validateHttpsUrl("http://example.com"))
  assert.equal(isDangerousUrl("javascript:alert(1)"), true)
})
