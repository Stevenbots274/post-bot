import test from "node:test"
import assert from "node:assert/strict"
import { createWhatsAppUrl, isDangerousUrl, normalizePhone, validateHttpsUrl } from "../src/services/validation.js"

test("accepts HTTPS URLs and rejects dangerous schemes", () => {
  assert.equal(validateHttpsUrl("https://example.com/path"), "https://example.com/path")
  assert.throws(() => validateHttpsUrl("javascript:alert(1)"))
  assert.throws(() => validateHttpsUrl("http://example.com"))
  assert.equal(isDangerousUrl("javascript:alert(1)"), true)
})

test("normalizes international phone numbers", () => {
  assert.equal(normalizePhone("+234 801-234-5678"), "2348012345678")
  assert.equal(normalizePhone("00 44 (20) 1234 5678"), "442012345678")
  assert.throws(() => normalizePhone("0800-abc"))
})

test("encodes WhatsApp prefilled messages", () => {
  assert.equal(createWhatsAppUrl("+2348012345678", "Hello there?"), "https://wa.me/2348012345678?text=Hello%20there%3F")
  assert.equal(createWhatsAppUrl("+2348012345678"), "https://wa.me/2348012345678")
})
