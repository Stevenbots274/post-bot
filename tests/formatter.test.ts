import test from "node:test"
import assert from "node:assert/strict"
import { draftText, formatTelegramHtml } from "../src/services/formatter.js"

test("renders supported formatting as Telegram HTML", () => {
  assert.equal(formatTelegramHtml("**bold** __italic__ ~~gone~~ `code`"), "<b>bold</b> <i>italic</i> <s>gone</s> <code>code</code>")
})

test("escapes user HTML and only permits HTTPS inline links", () => {
  assert.equal(formatTelegramHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;")
  assert.equal(formatTelegramHtml("[safe](https://example.com)"), '<a href="https://example.com/">safe</a>')
  assert.equal(formatTelegramHtml("[unsafe](javascript:alert(1))"), "[unsafe](javascript:alert(1))")
})

test("uses caption for media and body for text", () => {
  assert.equal(draftText({ content_type: "text", body: "**body**", caption: "caption" }), "<b>body</b>")
  assert.equal(draftText({ content_type: "photo", body: null, caption: "**caption**" }), "<b>caption</b>")
})
